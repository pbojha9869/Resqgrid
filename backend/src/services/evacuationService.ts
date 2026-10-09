import { getCached, setCached } from "../utils/cache.js";
import { getNearbyResources } from "./resourceService.js";
import { getOpenMeteoAlerts } from "./openMeteoService.js";
import { getGlofasFloodAlerts } from "./glofasService.js";
import { getUsgsEarthquakeAlerts } from "./usgsService.js";
import { getEonetEventAlerts } from "./eonetService.js";

/**
 * ResQGrid Evacuation Planner — "AI" safest-route selection.
 *
 * How it decides (fully explainable, built on REAL data feeds):
 *  1. OSRM (OpenStreetMap routing) returns up to 3 candidate roads per
 *     relief centre within the requested radius.
 *  2. Every candidate is sampled at ~24 waypoints and scored against:
 *       - LIVE hazard alerts (GloFAS floods, Open-Meteo weather, USGS
 *         quakes, NASA EONET) weighted by severity and proximity
 *       - LIVE rainfall now/next 24 h along the corridor (Open-Meteo)
 *       - Elevation profile (Open-Meteo) — low-lying corridors near
 *         flood alerts are penalised
 *       - Route length (shorter evacuations clear faster)
 *  3. The highest composite Safety Score (0–100) becomes the recommended
 *     route; runner-ups stay visible as alternates.
 *
 * Supervision: the UI layer attaches a government officer's approval and
 * per-checkpoint clearing log (see /evacuation page).
 */

const OSRM_BASE = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const CACHE_TTL = 600; // plans are time-critical — 10 minutes

interface LatLon {
  lat: number;
  lon: number;
}

export interface EvacFactor {
  label: string;
  penalty: number;
  note: string;
}

export interface EvacCheckpoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceFromOriginKm: number;
}

export interface EvacRoute {
  id: string;
  destinationName: string;
  destinationLat: number;
  destinationLon: number;
  distanceKm: number;
  durationMin: number;
  safetyScore: number;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  geometry: [number, number][];
  factors: EvacFactor[];
  checkpoints: EvacCheckpoint[];
}

export interface EvacPlan {
  originLat: number;
  originLon: number;
  originName?: string;
  generatedAt: string;
  routes: EvacRoute[];
  recommendedId: string | null;
  dataSources: string[];
  notes: string[];
  isCached?: boolean;
}

interface OsrmRoute {
  distanceKm: number;
  durationMin: number;
  coords: [number, number][];
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

/** Ask OSRM for up to 3 driving alternatives between two points. */
async function fetchOsrmRoutes(from: LatLon, to: LatLon): Promise<OsrmRoute[]> {
  const url =
    `${OSRM_BASE}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}` +
    `?alternatives=2&overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
  const json = await res.json();
  if (json.code !== "Ok" || !json.routes?.length) throw new Error(`OSRM: ${json.code || "no routes"}`);
  return json.routes.map(
    (r: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }) => ({
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.round(r.duration / 60)),
      coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
    })
  );
}

/** Evenly pick up to `max` waypoints (always includes both ends). */
function sampleCoords(coords: [number, number][], max = 24): [number, number][] {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

/** Reduce geometry payload for transport (target ≈120 vertices). */
function simplifyGeometry(coords: [number, number][], target = 120): [number, number][] {
  if (coords.length <= target) return coords;
  const step = Math.ceil(coords.length / target);
  const out = coords.filter((_, i) => i % step === 0);
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

interface PointDatum {
  elevation: number;
  rain24: number;
}

/** One batched Open-Meteo call for elevation + 24 h rain at every sample. */
async function fetchPointData(points: [number, number][]): Promise<Map<string, PointDatum>> {
  const map = new Map<string, PointDatum>();
  if (points.length === 0) return map;
  try {
    const params = new URLSearchParams({
      latitude: points.map((p) => p[0].toFixed(3)).join(","),
      longitude: points.map((p) => p[1].toFixed(3)).join(","),
      daily: "precipitation_sum",
      forecast_days: "2",
      timezone: "Asia/Kolkata",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const arr: Array<{ elevation?: number; daily?: { precipitation_sum?: (number | null)[] } }> = Array.isArray(payload)
      ? payload
      : [payload];
    arr.forEach((entry, i) => {
      const p = points[i];
      if (!p) return;
      const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
      const rains = (entry?.daily?.precipitation_sum || []).slice(0, 2).map((v) => (typeof v === "number" ? v : 0));
      map.set(key, { elevation: entry?.elevation ?? 0, rain24: rains.reduce((a, b) => a + b, 0) });
    });
  } catch (err) {
    console.warn("Evacuation point-data fetch failed:", err instanceof Error ? err.message : err);
  }
  return map;
}

const SEVERITY_WEIGHT: Record<string, number> = { EXTREME: 12, HIGH: 8, MODERATE: 4, LOW: 1 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function minDistanceToSamples(sample: [number, number][], lat: number, lon: number): number {
  let min = Infinity;
  for (const s of sample) {
    const d = haversineKm(s[0], s[1], lat, lon);
    if (d < min) min = d;
  }
  return min;
}

/** Officer checkpoints roughly every `intervalKm`, capped at 7 per route. */
function buildCheckpoints(
  coords: [number, number][],
  totalKm: number,
  routeIdx: number,
  intervalKm = 4
): EvacCheckpoint[] {
  const cps: EvacCheckpoint[] = [];
  if (coords.length < 2) return cps;
  const step = Math.max(2, Math.min(intervalKm, totalKm / 4));
  let accumulated = 0;
  let nextAt = step;
  let n = 1;
  for (let i = 1; i < coords.length && n <= 7; i++) {
    accumulated += haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    while (accumulated >= nextAt && n <= 7) {
      cps.push({
        id: `cp-r${routeIdx}-${n}`,
        name: `CP-${n} (${accumulated.toFixed(1)} km)`,
        lat: coords[i][0],
        lon: coords[i][1],
        distanceFromOriginKm: Math.round(accumulated * 10) / 10,
      });
      n++;
      nextAt += step;
    }
  }
  return cps;
}

export async function planEvacuation(opts: {
  originLat: number;
  originLon: number;
  originName?: string;
  radiusKm?: number;
  explicitDestination?: { lat: number; lon: number; name?: string };
}): Promise<EvacPlan> {
  const radiusKm = Math.round(clamp(opts.radiusKm ?? 25, 5, 50));
  const destKey = opts.explicitDestination
    ? `${opts.explicitDestination.lat.toFixed(3)},${opts.explicitDestination.lon.toFixed(3)}`
    : "auto";
  const cacheKey = `evac:${opts.originLat.toFixed(3)}:${opts.originLon.toFixed(3)}:${radiusKm}:${destKey}`;

  const cached = getCached<EvacPlan>(cacheKey);
  if (cached) return { ...cached, isCached: true };

  // ---- Step 1: destinations (relief centres / shelters) ----
  let dests: { name: string; lat: number; lon: number }[] = [];
  if (opts.explicitDestination) {
    dests = [
      {
        name: opts.explicitDestination.name || "Designated relief centre",
        lat: opts.explicitDestination.lat,
        lon: opts.explicitDestination.lon,
      },
    ];
  } else {
    const res = await getNearbyResources(opts.originLat, opts.originLon, radiusKm);
    dests = res.resources
      .filter((r) => r.type === "SHELTER" || r.type === "RELIEF_CENTER")
      .slice(0, 4)
      .map((r) => ({ name: r.name, lat: r.latitude, lon: r.longitude }));
  }
  if (dests.length === 0) {
    throw new Error(
      `No mapped relief centres/shelters within ${radiusKm} km of the disaster point. Increase the search radius.`
    );
  }

  // ---- Step 2: candidate roads from OSRM ----
  const origin = { lat: opts.originLat, lon: opts.originLon };
  const settled = await Promise.allSettled(dests.map((d) => fetchOsrmRoutes(origin, d)));
  const cand: { destName: string; destLat: number; destLon: number; osrm: OsrmRoute }[] = [];
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    r.value.forEach((osrm, j) =>
      cand.push({
        destName: j === 0 ? dests[i].name : `${dests[i].name} (alt ${j})`,
        destLat: dests[i].lat,
        destLon: dests[i].lon,
        osrm,
      })
    );
  });
  if (cand.length === 0) throw new Error("Road routing service (OSRM) is unavailable — please retry shortly.");

  // ---- Step 3: live hazard picture from all feeds (each self-cached) ----
  const [met, glofas, usgs, eonet] = await Promise.all([
    getOpenMeteoAlerts(),
    getGlofasFloodAlerts(),
    getUsgsEarthquakeAlerts(),
    getEonetEventAlerts(),
  ]);
  const alerts = [...met.alerts, ...glofas.alerts, ...usgs.alerts, ...eonet.alerts].filter(
    (a) => typeof a.latitude === "number" && typeof a.longitude === "number"
  );

  // ---- Step 4: one batched elevation/rain lookup for every sampled point ----
  const sampleMap = new Map<string, [number, number]>();
  for (const c of cand) {
    for (const p of sampleCoords(c.osrm.coords)) {
      const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
      if (!sampleMap.has(key)) sampleMap.set(key, p);
    }
  }
  const pointData = await fetchPointData([...sampleMap.values()]);

  // ---- Step 5: score every candidate (explainable penalties) ----
  const routes: EvacRoute[] = cand.map((c, idx) => {
    const samples = sampleCoords(c.osrm.coords);
    const factors: EvacFactor[] = [];

    // 5a. Live hazard proximity (weighted by severity, falloff over 6 km)
    let hazPenalty = 0;
    let crossings = 0;
    let worstWeight = 0;
    let worstTitle = "";
    for (const a of alerts) {
      const d = minDistanceToSamples(samples, a.latitude!, a.longitude!);
      if (d >= 6) continue;
      crossings++;
      const w = SEVERITY_WEIGHT[a.severity] ?? 2;
      hazPenalty += w * (1 - d / 6);
      if (w > worstWeight) {
        worstWeight = w;
        worstTitle = a.title;
      }
    }
    hazPenalty = Math.min(40, Math.round(hazPenalty));
    factors.push({
      label: "Live hazard exposure",
      penalty: hazPenalty,
      note:
        crossings === 0
          ? "No active alerts within 6 km of this corridor."
          : `${crossings} live alert(s) near the corridor${worstTitle ? ` — worst: ${worstTitle}` : ""}.`,
    });

    // 5b. Rainfall along the corridor (next 24 h)
    let rainSum = 0;
    let rainN = 0;
    let minElev = Infinity;
    for (const s of samples) {
      const pd = pointData.get(`${s[0].toFixed(3)},${s[1].toFixed(3)}`);
      if (!pd) continue;
      rainSum += pd.rain24;
      rainN++;
      if (pd.elevation < minElev) minElev = pd.elevation;
    }
    const avgRain = rainN > 0 ? rainSum / rainN : 0;
    const rainPenalty = Math.min(25, Math.round(avgRain * 0.9));
    factors.push({
      label: "Rainfall along corridor",
      penalty: rainPenalty,
      note: `~${avgRain.toFixed(0)} mm expected in the next 24 h on this route.`,
    });

    // 5c. Low-lying ground matters most when flood alerts are nearby
    const floodNearby = alerts.some(
      (a) =>
        (a.type === "FLOOD" || a.type === "CYCLONE") &&
        minDistanceToSamples(samples, a.latitude!, a.longitude!) < 10
    );
    const elevRef = isFinite(minElev) ? minElev : 30;
    const lowPenalty = Math.round(clamp((30 - elevRef) / 30, 0, 1) * 15 * (floodNearby ? 1 : 0.4));
    factors.push({
      label: "Low-lying exposure",
      penalty: lowPenalty,
      note: `Lowest point ≈ ${isFinite(minElev) ? Math.round(minElev) : "?"} m elevation${
        floodNearby ? ", inside flood-alert vicinity" : ""
      }.`,
    });

    // 5d. Shorter corridors clear faster
    const lenPenalty = Math.min(12, Math.round(c.osrm.distanceKm * 0.18));
    factors.push({
      label: "Route length",
      penalty: lenPenalty,
      note: `${c.osrm.distanceKm} km — shorter corridors clear faster.`,
    });

    const safetyScore = Math.round(clamp(100 - (hazPenalty + rainPenalty + lowPenalty + lenPenalty), 2, 100));
    const riskLevel: EvacRoute["riskLevel"] = safetyScore >= 80 ? "LOW" : safetyScore >= 55 ? "MODERATE" : "HIGH";

    return {
      id: `rt-${idx}-${c.osrm.distanceKm}`,
      destinationName: c.destName,
      destinationLat: c.destLat,
      destinationLon: c.destLon,
      distanceKm: c.osrm.distanceKm,
      durationMin: c.osrm.durationMin,
      safetyScore,
      riskLevel,
      geometry: simplifyGeometry(c.osrm.coords),
      factors,
      checkpoints: buildCheckpoints(c.osrm.coords, c.osrm.distanceKm, idx),
    };
  });

  routes.sort((a, b) => b.safetyScore - a.safetyScore);

  const plan: EvacPlan = {
    originLat: opts.originLat,
    originLon: opts.originLon,
    originName: opts.originName,
    generatedAt: new Date().toISOString(),
    routes,
    recommendedId: routes[0]?.id ?? null,
    dataSources: [
      "OSRM (road network & travel time)",
      "Open-Meteo (rainfall + elevation along route)",
      "GloFAS / Copernicus (flood alerts)",
      "USGS (earthquakes)",
      "NASA EONET (active disasters)",
      "OpenStreetMap (relief centres & shelters)",
    ],
    notes: [
      "Safety Score = 100 − penalties for live hazards near the corridor, rainfall, low-lying ground and route length.",
      "Population figures are not available from current data feeds.",
      "Officer approval and checkpoint clearances are recorded in this browser and must be confirmed over radio as well.",
    ],
  };

  setCached(cacheKey, plan, CACHE_TTL);
  return { ...plan, isCached: false };
}





