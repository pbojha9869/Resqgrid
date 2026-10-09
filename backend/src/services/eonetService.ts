import { HazardAlert, HazardType, Severity } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

/**
 * Active natural-disaster events from NASA EONET v3 (Earth Observatory Natural Event Tracker).
 * Keyless public API aggregating authoritative agencies (IMD, JTWC, GDACS, etc.):
 * https://eonet.gsfc.nasa.gov/api/v3/events
 *
 * Filtered to South Asia / northern Indian Ocean (cyclone basin included).
 */

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=300";
const CACHE_TTL = 900; // EONET updates continuously; 15-minute cache is plenty

const BBOX = { minLat: -5, maxLat: 40, minLon: 60, maxLon: 100 };

interface EonetCategory {
  id: number;
  title: string;
}

interface EonetGeometry {
  date: string;
  type: string;
  coordinates: unknown;
  magnitudeValue?: number;
  magnitudeUnit?: string;
}

interface EonetEvent {
  id: string;
  title: string;
  description?: string | null;
  link: string;
  categories: EonetCategory[];
  sources?: { id: string; url: string }[];
  geometry: EonetGeometry[];
  closed: string | null;
}

/** Extract a representative [lon, lat] point from Point or Polygon geometry. */
function extractPoint(geometry: EonetGeometry[]): [number, number] | null {
  for (let i = geometry.length - 1; i >= 0; i--) {
    const g = geometry[i];
    if (g.type === "Point" && Array.isArray(g.coordinates)) {
      const [lon, lat] = g.coordinates as number[];
      if (typeof lon === "number" && typeof lat === "number") return [lon, lat];
    }
  }
  // Fall back to first polygon vertex
  for (const g of geometry) {
    if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
      const ring = (g.coordinates as number[][][])[0];
      if (ring?.length && typeof ring[0][0] === "number") return [ring[0][0], ring[0][1]];
    }
  }
  return null;
}

function classify(event: EonetEvent): { type: HazardType; severity: Severity } | null {
  const catTitle = (event.categories?.[0]?.title || "").toLowerCase();
  const titleLower = event.title.toLowerCase();

  if (catTitle.includes("flood")) {
    const severe = /severe|major|devastat/.test(titleLower);
    return { type: "FLOOD", severity: severe ? "HIGH" : "MODERATE" };
  }
  if (catTitle.includes("severe storm")) {
    if (/cyclone|typhoon|hurricane|storm surgo|surge/.test(titleLower)) {
      const extreme = /super|category 4|category 5|very severe|intense/.test(titleLower);
      return { type: "CYCLONE", severity: extreme ? "EXTREME" : "HIGH" };
    }
    return { type: "THUNDERSTORM", severity: "MODERATE" };
  }
  if (catTitle.includes("volcan") || catTitle.includes("wildfire") || catTitle.includes("drought") || catTitle.includes("landslide")) {
    return { type: "OTHER", severity: "MODERATE" };
  }
  return null;
}

/** Fetch active NASA EONET events affecting the South-Asia region. */
export async function getEonetEventAlerts(): Promise<{ alerts: HazardAlert[]; isCached: boolean; updatedAt: string }> {
  const cacheKey = "eonet:events";
  const cached = getCached<{ alerts: HazardAlert[]; updatedAt: string }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  try {
    const response = await fetch(EONET_URL, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`NASA EONET responded with ${response.status}`);

    const data = (await response.json()) as { events?: EonetEvent[] };
    const events = data.events || [];

    const alerts: HazardAlert[] = [];

    for (const ev of events) {
      const classified = classify(ev);
      if (!classified) continue;

      const point = extractPoint(ev.geometry || []);
      if (!point) continue;
      const [lon, lat] = point;
      if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon) continue;

      const latestGeom = [...(ev.geometry || [])].pop();
      const magnitude =
        latestGeom?.magnitudeValue && latestGeom?.magnitudeUnit
          ? ` Reported magnitude: ${latestGeom.magnitudeValue}${magnitudeUnitSuffix(latestGeom.magnitudeUnit)}.`
          : "";
      const sourceAgency = ev.sources?.[0]?.id ? ` Original source: ${ev.sources[0].id}.` : "";

      alerts.push({
        id: `eonet-${ev.id}`,
        source: "NASA EONET",
        type: classified.type,
        severity: classified.severity,
        title: ev.title.replace(/ in India$/i, " (India)"),
        description:
          `${ev.description || "Active natural event tracked by NASA Earth Observatory"}${magnitude}${sourceAgency} ` +
          `Location approximated from event geometry — click through for satellite imagery.`,
        location: ev.title.split(" in ").slice(1).join(" in ") || ev.title,
        latitude: lat,
        longitude: lon,
        issuedAt: ev.geometry?.[0]?.date || new Date().toISOString(),
        validUntil: undefined,
      });
    }

    const out = { alerts, updatedAt: new Date().toISOString() };
    setCached(cacheKey, out, CACHE_TTL);
    return { ...out, isCached: false };
  } catch (error) {
    console.error("NASA EONET feed failed:", error);
    return { alerts: [], isCached: false, updatedAt: new Date().toISOString() };
  }
}

function magnitudeUnitSuffix(unit: string): string {
  const u = unit.toLowerCase();
  if (u.includes("richter")) return " (Richter)";
  if (u.includes("kph") || u.includes("km/h")) return " km/h winds";
  return ` ${unit}`;
}