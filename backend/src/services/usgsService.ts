import { HazardAlert, Severity } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

/**
 * Real-time seismic hazard feed from the U.S. Geological Survey (USGS).
 * Keyless public GeoJSON feed, updated every minute:
 * https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 *
 * Filtered to the South-Asia bounding box relevant to India.
 */

const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const CACHE_TTL = 300; // 5 minutes

// India + neighbouring seismically-active region
const BBOX = { minLat: 5, maxLat: 38, minLon: 66, maxLon: 98 };
const MIN_MAGNITUDE = 4.0;

interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string | null;
    title: string | null;
    tsunami: number;
  };
  geometry: {
    type: string;
    coordinates: [number, number, number] | number[];
  };
}

function severityFromMagnitude(mag: number): Severity {
  if (mag >= 6.5) return "EXTREME";
  if (mag >= 5.5) return "HIGH";
  if (mag >= 4.5) return "MODERATE";
  return "LOW";
}

/** Fetch earthquakes from the last 24 hours within the India-relevant region. */
export async function getUsgsEarthquakeAlerts(): Promise<{ alerts: HazardAlert[]; isCached: boolean; updatedAt: string }> {
  const cacheKey = "usgs:earthquakes";
  const cached = getCached<{ alerts: HazardAlert[]; updatedAt: string }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  try {
    const response = await fetch(USGS_URL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`USGS feed responded with ${response.status}`);

    const data = (await response.json()) as { features?: UsgsFeature[] };
    const features = data.features || [];

    const alerts: HazardAlert[] = [];

    for (const f of features) {
      const [lon, lat, depth] = f.geometry.coordinates || [];
      const mag = f.properties.mag ?? 0;
      if (
        typeof lat !== "number" ||
        typeof lon !== "number" ||
        lat < BBOX.minLat ||
        lat > BBOX.maxLat ||
        lon < BBOX.minLon ||
        lon > BBOX.maxLon ||
        mag < MIN_MAGNITUDE
      ) {
        continue;
      }

      const severity = severityFromMagnitude(mag);
      const place = f.properties.place || "Unnamed region";
      const depthKm = typeof depth === "number" ? Math.round(depth) : null;
      const tsunamiNote = f.properties.tsunami ? " Tsunami evaluation flagged." : "";

      alerts.push({
        id: `usgs-${f.id}`,
        source: "USGS",
        type: "EARTHQUAKE",
        severity,
        title: `M${mag.toFixed(1)} Earthquake — ${place}`,
        description:
          `Magnitude ${mag.toFixed(1)} event recorded by USGS at ${place}.` +
          (depthKm !== null ? ` Hypocenter depth ≈ ${depthKm} km.` : "") +
          `${tsunamiNote} Exact epicenter plotted on map. Check NDMA/GSDMA guidance for local impact.`,
        location: place,
        latitude: lat,
        longitude: lon,
        issuedAt: new Date(f.properties.time).toISOString(),
        validUntil: undefined,
      });

      // Attach official event link inside description metadata (kept out of UI text intentionally)
      if (f.properties.url) {
        alerts[alerts.length - 1].description += ` Event page: ${f.properties.url}`;
      }
    }

    const out = { alerts, updatedAt: new Date().toISOString() };
    setCached(cacheKey, out, CACHE_TTL);
    return { ...out, isCached: false };
  } catch (error) {
    console.error("USGS earthquake feed failed:", error);
    return { alerts: [], isCached: false, updatedAt: new Date().toISOString() };
  }
}