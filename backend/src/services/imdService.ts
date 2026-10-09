import { HazardAlert, WeatherData, Severity, HazardType } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

const IMD_BASE_URL = "https://api.imd.gov.in";
const CACHE_TTL = 600; // 10 minutes

interface IMDWarning {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  location: string;
  state?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  issuedAt?: string;
  validUntil?: string;
}

function mapSeverity(imdSeverity: string): Severity {
  const s = imdSeverity.toUpperCase();
  if (s.includes("RED") || s.includes("EXTREME")) return "EXTREME";
  if (s.includes("ORANGE") || s.includes("SEVERE")) return "HIGH";
  if (s.includes("YELLOW") || s.includes("MODERATE")) return "MODERATE";
  return "LOW";
}

function mapHazardType(type: string): HazardType {
  const t = type.toUpperCase();
  if (t.includes("FLOOD")) return "FLOOD";
  if (t.includes("RAIN")) return "HEAVY_RAIN";
  if (t.includes("THUNDER")) return "THUNDERSTORM";
  if (t.includes("LIGHTNING")) return "LIGHTNING";
  if (t.includes("CYCLONE")) return "CYCLONE";
  if (t.includes("EARTHQUAKE")) return "EARTHQUAKE";
  if (t.includes("HEAT")) return "HEAT_WAVE";
  if (t.includes("LANDSLIDE")) return "LANDSLIDE";
  if (t.includes("COLD")) return "COLD_WAVE";
  if (t.includes("FOG")) return "FOG";
  if (t.includes("HAIL")) return "HAILSTORM";
  if (t.includes("DROUGHT")) return "DROUGHT";
  return "OTHER";
}

export async function getIMDWarnings(): Promise<{ alerts: HazardAlert[]; isCached: boolean; updatedAt: string }> {
  const cacheKey = "imd:warnings";
  const cached = getCached<{ alerts: HazardAlert[]; updatedAt: string }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  const apiKey = process.env.IMD_API_KEY;
  if (!apiKey) {
    return {
      alerts: [],
      isCached: false,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    // IMD API endpoint for district-wise warnings
    const response = await fetch(`${IMD_BASE_URL}/api/v1/warnings/district`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`IMD API responded with ${response.status}`);
    }

    const data = await response.json();
    const warnings: IMDWarning[] = data?.warnings || data?.data || [];

    const alerts: HazardAlert[] = warnings.map((w) => ({
      id: `imd-${w.id || Math.random().toString(36).slice(2)}`,
      source: "IMD",
      type: mapHazardType(w.type),
      severity: mapSeverity(w.severity),
      title: w.title || `${w.type} Warning`,
      description: w.description || "",
      location: w.location || w.district || w.state || "Unknown",
      state: w.state,
      district: w.district,
      latitude: w.latitude,
      longitude: w.longitude,
      issuedAt: w.issuedAt,
      validUntil: w.validUntil,
    }));

    const result = { alerts, updatedAt: new Date().toISOString() };
    setCached(cacheKey, result, CACHE_TTL);
    return { ...result, isCached: false };
  } catch (error) {
    console.error("IMD warnings fetch failed:", error);
    return {
      alerts: [],
      isCached: false,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function getIMDWeather(location: string): Promise<WeatherData | null> {
  const cacheKey = `imd:weather:${location.toLowerCase()}`;
  const cached = getCached<WeatherData>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  const apiKey = process.env.IMD_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `${IMD_BASE_URL}/api/v1/weather/current?location=${encodeURIComponent(location)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      throw new Error(`IMD API responded with ${response.status}`);
    }

    const data = await response.json();
    const weather: WeatherData = {
      location: data?.location || location,
      state: data?.state,
      district: data?.district,
      latitude: data?.latitude,
      longitude: data?.longitude,
      temperature: data?.temperature,
      feelsLike: data?.feels_like,
      humidity: data?.humidity,
      windSpeed: data?.wind_speed,
      windDirection: data?.wind_direction,
      pressure: data?.pressure,
      visibility: data?.visibility,
      condition: data?.condition,
      description: data?.description,
      rainChance: data?.rain_chance,
      source: "IMD",
      updatedAt: new Date().toISOString(),
    };

    setCached(cacheKey, weather, CACHE_TTL);
    return weather;
  } catch (error) {
    console.error("IMD weather fetch failed:", error);
    return null;
  }
}