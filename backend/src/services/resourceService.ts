import { EmergencyResource } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

/**
 * Real-time emergency-resource lookup from OpenStreetMap (Overpass API).
 *
 * Coverage notes (why some categories need special tags):
 *  - AMBULANCE:     emergency=ambulance_station + healthcare=ambulance
 *  - RELIEF_CENTER: emergency=assembly_point + amenity=community_centre
 *                   (India-wide these are what physically serve as relief
 *                   centres / supply-distribution points during floods)
 *  - RESCUE_TEAM:   emergency=water_rescue / mountain_rescue / lifeguard
 *                   (NDRF/SDRF-style units, boat crews, dive teams)
 *
 * Sparse categories are auto-expanded: if AMBULANCE / RELIEF_CENTER /
 * RESCUE_TEAM return nothing inside the requested radius, those categories
 * alone are re-queried at double radius (capped) so counts stay meaningful.
 */

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  // Proven-reliable mirror; kept high because overpass-api.de throttles often
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const CACHE_TTL = 3600; // 1 hour — facility locations barely change day-to-day
const MAX_EXPANSION_KM = 40;
const ENDPOINT_TIMEOUT_MS = 20000;

/**
 * Circuit breaker: when every Overpass mirror has just failed (rate-limit /
 * outage), fail FAST for a short cool-down window instead of stacking
 * multi-minute retry storms on top of an already-throttled API.
 */
const COOLDOWN_MS = 60_000;
let lastAllEndpointsFailureAt = 0;

interface ResourceFilter {
  tag: string;
  value: string;
  type: EmergencyResource["type"];
}

const FILTERS: ResourceFilter[] = [
  { tag: "amenity", value: "hospital", type: "HOSPITAL" },
  { tag: "amenity", value: "fire_station", type: "FIRE_STATION" },
  { tag: "amenity", value: "police", type: "POLICE_STATION" },
  { tag: "emergency", value: "ambulance_station", type: "AMBULANCE" },
  { tag: "healthcare", value: "ambulance", type: "AMBULANCE" },
  { tag: "amenity", value: "shelter", type: "SHELTER" },
  { tag: "social_facility", value: "shelter", type: "SHELTER" },
  { tag: "emergency", value: "assembly_point", type: "RELIEF_CENTER" },
  { tag: "amenity", value: "community_centre", type: "RELIEF_CENTER" },
  { tag: "emergency", value: "water_rescue", type: "RESCUE_TEAM" },
  { tag: "emergency", value: "mountain_rescue", type: "RESCUE_TEAM" },
  { tag: "emergency", value: "lifeguard", type: "RESCUE_TEAM" },
];

// Categories that are sparsely mapped in India — eligible for radius expansion
const SPARSE_TYPES: EmergencyResource["type"][] = ["AMBULANCE", "RELIEF_CENTER", "RESCUE_TEAM"];

const TAG_TO_TYPE = new Map<string, EmergencyResource["type"]>(
  FILTERS.map((f) => [`${f.tag}=${f.value}`, f.type])
);

function buildQuery(filters: ResourceFilter[], latitude: number, longitude: number, radiusMeters: number): string {
  const around = `(around:${radiusMeters},${latitude},${longitude})`;
  const clauses = filters
    .map(
      (f) =>
        `      node["${f.tag}"="${f.value}"]${around};\n      way["${f.tag}"="${f.value}"]${around};`
    )
    .join("\n");
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout center;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number }; // present for ways when using `out center`
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
  remark?: string; // Overpass reports runtime/rate-limit errors here WITH http 200
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface MapOptions {
  availabilityNote?: string;
  forceType?: EmergencyResource["type"];
  allowNameMatch?: boolean;
}

function mapToResource(
  el: OverpassElement,
  originLat: number,
  originLon: number,
  opts: MapOptions = {}
): EmergencyResource | null {
  const { availabilityNote, forceType, allowNameMatch } = opts;
  const tags = el.tags || {};

  let type: EmergencyResource["type"] | undefined = forceType;
  if (!type) {
    for (const [tagKey, t] of TAG_TO_TYPE) {
      if (tags[tagKey.split("=")[0]] === tagKey.split("=")[1]) {
        type = t;
        break;
      }
    }
  }

  // Name-based fallback for the supplemental sweep (e.g. "XYZ Ambulance Service")
  if (!type && allowNameMatch) {
    const name = (tags.name || "").toLowerCase();
    if (name.includes("ambulance")) type = "AMBULANCE";
    else if (name.includes("rescue")) type = "RESCUE_TEAM";
  }

  if (!type) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const distanceKm = haversineKm(originLat, originLon, lat, lon);

  return {
    id: `osm-${el.type}-${el.id}`,
    name: tags.name || tags["name:en"] || `${type.replace("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} (OSM)`,
    type,
    latitude: lat,
    longitude: lon,
    address: tags["addr:full"] || tags["addr:street"] || undefined,
    phone: tags.phone || tags["contact:phone"] || undefined,
    distanceKm: Math.round(distanceKm * 10) / 10,
    source: "OpenStreetMap",
    lastUpdated: new Date().toISOString(),
    ...(availabilityNote ? { availability: availabilityNote } : {}),
  };
}

async function queryEndpoint(endpoint: string, query: string, signal: AbortSignal): Promise<OverpassElement[]> {
  // NOTE: a descriptive User-Agent is REQUIRED — overpass-api.de returns HTTP 406 without one.
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ResQGrid/1.0 (disaster response platform)",
      Accept: "application/json",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = (await response.json()) as OverpassResponse;
  // Some mirrors return HTTP 200 with an error in `remark` and no data
  if (json?.remark && !json?.elements?.length) {
    throw new Error(`Overpass error: ${String(json.remark).slice(0, 120)}`);
  }
  return json.elements || [];
}

/**
 * All mirrors are queried in parallel and the first successful answer wins;
 * the rest are aborted. Worst case is one ENDPOINT_TIMEOUT_MS instead of
 * trying every mirror back-to-back.
 */
async function runOverpassRaw(query: string): Promise<OverpassElement[]> {
  if (Date.now() - lastAllEndpointsFailureAt < COOLDOWN_MS) {
    throw new Error("Overpass cooling down after recent total failure");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS);
  try {
    return await Promise.any(
      OVERPASS_ENDPOINTS.map((endpoint) =>
        queryEndpoint(endpoint, query, controller.signal).catch((err) => {
          if (!controller.signal.aborted) {
            console.warn(`Overpass failed (${endpoint}):`, err instanceof Error ? err.message : err);
          }
          throw err;
        })
      )
    );
  } catch {
    lastAllEndpointsFailureAt = Date.now();
    throw new Error("All OpenStreetMap (Overpass) mirrors are busy or unreachable. Please retry shortly.");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function runOverpass(
  filters: ResourceFilter[],
  latitude: number,
  longitude: number,
  radiusKm: number
): Promise<OverpassElement[]> {
  return runOverpassRaw(buildQuery(filters, latitude, longitude, Math.round(radiusKm * 1000)));
}

/**
 * Fallback query for sparse categories: keeps the standard tag filters but
 * ALSO matches facilities by name ("ambulance"/"rescue") — catches operator
 * offices and stands that were never tagged with the standard schema.
 */
function buildSupplementalQuery(
  missingTypes: EmergencyResource["type"][],
  latitude: number,
  longitude: number,
  radiusKm: number
): string {
  const around = `(around:${Math.round(radiusKm * 1000)},${latitude},${longitude})`;
  const clauses: string[] = FILTERS.filter((f) => missingTypes.includes(f.type)).map(
    (f) => `      nwr["${f.tag}"="${f.value}"]${around};`
  );
  if (missingTypes.includes("AMBULANCE")) clauses.push(`      nwr["name"~"ambulance",i]${around};`);
  if (missingTypes.includes("RESCUE_TEAM")) clauses.push(`      nwr["name"~"rescue",i]${around};`);
  return `[out:json][timeout:25];\n(\n${clauses.join("\n")}\n);\nout center;`;
}

interface NominatimPlace {
  lat?: string | number;
  lon?: string | number;
  name?: string;
  display_name?: string;
}

/**
 * INDEPENDENT FALLBACK SOURCE: Nominatim's category search runs on entirely
 * different infrastructure than Overpass, so it typically keeps working while
 * Overpass is rate-limited. One request per category, spaced 1.1 s apart per
 * Nominatim usage policy.
 */
async function fetchViaNominatim(
  latitude: number,
  longitude: number,
  radiusKm: number
): Promise<EmergencyResource[]> {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
  const viewbox = [
    (longitude - dLon).toFixed(4),
    (latitude + dLat).toFixed(4),
    (longitude + dLon).toFixed(4),
    (latitude - dLat).toFixed(4),
  ].join(",");

  const categories: { amenity: string; type: EmergencyResource["type"] }[] = [
    { amenity: "hospital", type: "HOSPITAL" },
    { amenity: "fire_station", type: "FIRE_STATION" },
    { amenity: "police", type: "POLICE_STATION" },
    { amenity: "shelter", type: "SHELTER" },
    { amenity: "community_centre", type: "RELIEF_CENTER" },
    { amenity: "ambulance_station", type: "AMBULANCE" },
  ];

  const out: EmergencyResource[] = [];
  for (const cat of categories) {
    try {
      const params = new URLSearchParams({
        amenity: cat.amenity,
        format: "jsonv2",
        limit: "50",
        bounded: "1",
        viewbox,
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          "User-Agent": "ResQGrid/1.0 (disaster response platform)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const places = (await res.json()) as NominatimPlace[];

      for (const place of places) {
        const plat = typeof place.lat === "string" ? parseFloat(place.lat) : place.lat;
        const plon = typeof place.lon === "string" ? parseFloat(place.lon) : place.lon;
        if (!plat || !plon) continue;
        const km = haversineKm(latitude, longitude, plat, plon);
        if (km > radiusKm) continue; // viewbox is square — trim corners to the circle

        out.push({
          id: `osm-nom-${cat.amenity}-${plat.toFixed(5)}-${plon.toFixed(5)}`,
          name: place.name || (place.display_name || "").split(",")[0] || `${cat.amenity} (OSM)`,
          type: cat.type,
          latitude: plat,
          longitude: plon,
          address: place.display_name,
          source: "OpenStreetMap (Nominatim)",
          lastUpdated: new Date().toISOString(),
          distanceKm: Math.round(km * 10) / 10,
        });
      }
    } catch (err) {
      console.warn(`Nominatim category ${cat.amenity} failed:`, err instanceof Error ? err.message : err);
    }
    // Respect Nominatim's 1 req/s policy between category requests
    await new Promise((r) => setTimeout(r, 1100));
  }
  return out;
}

export async function getNearbyResources(
  latitude: number,
  longitude: number,
  radiusKm = 10
): Promise<{ resources: EmergencyResource[]; isCached: boolean; updatedAt: string; expandedRadiusKm?: number }> {
  const cacheKey = `resources:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${radiusKm}`;
  const cached = getCached<{ resources: EmergencyResource[]; updatedAt: string; expandedRadiusKm?: number }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  const baseRadiusKm = Math.min(Math.max(radiusKm, 1), 50);

  try {
    const byId = new Map<string, EmergencyResource>();
    const counts = new Map<EmergencyResource["type"], number>();

    const ingest = (elements: OverpassElement[], opts: MapOptions = {}) => {
      for (const el of elements) {
        if (byId.has(`osm-${el.type}-${el.id}`)) continue;
        const resource = mapToResource(el, latitude, longitude, opts);
        if (!resource) continue;
        byId.set(resource.id, resource);
        counts.set(resource.type, (counts.get(resource.type) || 0) + 1);
      }
    };

    // Pass 1: all categories at the requested radius
    ingest(await runOverpass(FILTERS, latitude, longitude, baseRadiusKm));

    // Sparse categories that returned too few to trust (<3) get two extra
    // lookups, run concurrently:
    //  - pass 2: the same tag filters at double radius
    //  - pass 3: a name-based sweep ("ambulance"/"rescue") at maximum radius,
    //    catching untagged-but-named facilities
    let expandedRadiusKm: number | undefined;
    const missing = SPARSE_TYPES.filter((t) => (counts.get(t) ?? 0) < 3);
    if (missing.length > 0) {
      const r2 = Math.min(baseRadiusKm * 2, MAX_EXPANSION_KM);
      const expand = r2 >= baseRadiusKm + 5;
      const [expanded, named] = await Promise.allSettled([
        expand
          ? runOverpass(FILTERS.filter((f) => missing.includes(f.type)), latitude, longitude, r2)
          : Promise.resolve([] as OverpassElement[]),
        runOverpassRaw(buildSupplementalQuery(missing, latitude, longitude, MAX_EXPANSION_KM)),
      ]);
      if (expanded.status === "fulfilled" && expand) {
        ingest(expanded.value, { availabilityNote: `Found via expanded ${Math.round(r2)} km search` });
        expandedRadiusKm = r2;
      }
      if (named.status === "fulfilled") {
        ingest(named.value, {
          availabilityNote: `Matched by facility name within ${MAX_EXPANSION_KM} km`,
          allowNameMatch: true,
        });
      }
    }


    const resources = [...byId.values()].sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
    const out = { resources, updatedAt: new Date().toISOString(), expandedRadiusKm };
    setCached(cacheKey, out, CACHE_TTL);
    return { ...out, isCached: false };
  } catch (overpassError) {
    // Overpass unavailable/rate-limited → try the independent Nominatim path.
    // If that also yields nothing, RE-THROW so the API returns 502 with the
    // real cause instead of pretending the area has no resources.
    console.warn(
      "Overpass pipeline failed — attempting Nominatim fallback:",
      overpassError instanceof Error ? overpassError.message : overpassError
    );
    let fallback: EmergencyResource[] = [];
    let fallbackCrashed = false;
    try {
      fallback = await fetchViaNominatim(latitude, longitude, baseRadiusKm);
    } catch {
      fallbackCrashed = true;
    }

    if (!fallbackCrashed && fallback.length > 0) {
      const sorted = fallback.sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
      const out = { resources: sorted, updatedAt: new Date().toISOString() };
      setCached(cacheKey, out, 600); // shorter TTL for fallback data
      return { ...out, isCached: false };
    }

    throw overpassError instanceof Error ? overpassError : new Error("Overpass pipeline failed");
  }
}