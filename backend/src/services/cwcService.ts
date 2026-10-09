import { HazardAlert, Severity, HazardType } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

const CWC_BASE_URL = "https://www.cwc.gov.in";
const CACHE_TTL = 600; // 10 minutes

interface CWCStation {
  id?: string;
  stationName?: string;
  river?: string;
  state?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  waterLevel?: number;
  dangerLevel?: number;
  severeLevel?: number;
  trend?: string;
  lastUpdated?: string;
}

function mapSeverity(station: CWCStation): Severity {
  if (!station.waterLevel || !station.dangerLevel) return "LOW";
  const ratio = station.waterLevel / station.dangerLevel;
  if (ratio >= 1.2) return "EXTREME";
  if (ratio >= 1.0) return "HIGH";
  if (ratio >= 0.8) return "MODERATE";
  return "LOW";
}

export async function getCWCFloodAlerts(): Promise<{ alerts: HazardAlert[]; isCached: boolean; updatedAt: string }> {
  const cacheKey = "cwc:flood-alerts";
  const cached = getCached<{ alerts: HazardAlert[]; updatedAt: string }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  const apiKey = process.env.CWC_API_KEY;
  if (!apiKey) {
    return {
      alerts: [],
      isCached: false,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    // CWC API endpoint for river water levels and flood forecasts
    const response = await fetch(`${CWC_BASE_URL}/api/v1/flood/forecast`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`CWC API responded with ${response.status}`);
    }

    const data = await response.json();
    const stations: CWCStation[] = data?.stations || data?.data || [];

    const alerts: HazardAlert[] = stations
      .filter((s) => s.waterLevel && s.dangerLevel && s.waterLevel >= s.dangerLevel * 0.8)
      .map((s) => {
        const severity = mapSeverity(s);
        const isSevere = s.waterLevel && s.severeLevel && s.waterLevel >= s.severeLevel;
        return {
          id: `cwc-${s.id || Math.random().toString(36).slice(2)}`,
          source: "CWC",
          type: "FLOOD" as HazardType,
          severity,
          title: isSevere ? `Severe Flood Warning: ${s.stationName}` : `Flood Alert: ${s.stationName}`,
          description: `River ${s.river || "unknown"} at ${s.stationName} is at ${s.waterLevel}m (danger level: ${s.dangerLevel}m). Trend: ${s.trend || "unknown"}.`,
          location: s.stationName || s.district || s.state || "Unknown",
          state: s.state,
          district: s.district,
          latitude: s.latitude,
          longitude: s.longitude,
          issuedAt: s.lastUpdated,
        };
      });

    const result = { alerts, updatedAt: new Date().toISOString() };
    setCached(cacheKey, result, CACHE_TTL);
    return { ...result, isCached: false };
  } catch (error) {
    console.error("CWC fetch failed:", error);
    return {
      alerts: [],
      isCached: false,
      updatedAt: new Date().toISOString(),
    };
  }
}