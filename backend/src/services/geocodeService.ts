import { getCached, setCached } from "../utils/cache.js";

/**
 * Free-text place lookup shared by every location search in the UI.
 * Nominatim (OpenStreetMap) handles states, districts and villages well;
 * Open-Meteo's geocoder is the fallback when Nominatim is throttled.
 */

export interface GeocodeResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  state?: string;
  district?: string;
}

const CACHE_TTL = 86400; // place coordinates do not change
const USER_AGENT = "ResQGrid/1.0 (disaster response platform)";

async function viaNominatim(query: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    countrycodes: "in",
    addressdetails: "1",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim responded with ${res.status}`);
  const hits = (await res.json()) as {
    lat: string;
    lon: string;
    name?: string;
    display_name: string;
    address?: Record<string, string>;
  }[];
  const hit = hits[0];
  if (!hit) return null;
  const parts = hit.display_name.split(",").map((p) => p.trim());
  return {
    name: hit.name || parts[0],
    displayName: parts.slice(0, 3).join(", "),
    latitude: parseFloat(hit.lat),
    longitude: parseFloat(hit.lon),
    state: hit.address?.state,
    district: hit.address?.state_district || hit.address?.county,
  };
}

async function viaOpenMeteo(query: string): Promise<GeocodeResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json&countryCode=IN`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo geocoder responded with ${res.status}`);
  const json = (await res.json()) as {
    results?: { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string }[];
  };
  const hit = json.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    displayName: [hit.name, hit.admin2, hit.admin1].filter(Boolean).join(", "),
    latitude: hit.latitude,
    longitude: hit.longitude,
    state: hit.admin1,
    district: hit.admin2,
  };
}

export async function geocodeLocation(query: string): Promise<GeocodeResult | null> {
  const key = `geocode:${query.toLowerCase().trim()}`;
  const cached = getCached<GeocodeResult | null>(key);
  if (cached !== undefined) return cached;

  let result: GeocodeResult | null = null;
  try {
    result = await viaNominatim(query);
  } catch (err) {
    console.warn("Nominatim geocode failed:", err instanceof Error ? err.message : err);
  }
  if (!result) {
    try {
      result = await viaOpenMeteo(query);
    } catch (err) {
      console.warn("Open-Meteo geocode failed:", err instanceof Error ? err.message : err);
    }
  }
  if (result) setCached(key, result, CACHE_TTL);
  return result;
}
