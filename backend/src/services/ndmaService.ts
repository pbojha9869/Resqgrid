import { HazardAlert, Severity, HazardType } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

const NDMA_BASE_URL = "https://sachet.ndma.gov.in";
const CACHE_TTL = 300; // 5 minutes

interface SachetAlert {
  id?: string;
  type?: string;
  severity?: string;
  title?: string;
  description?: string;
  location?: string;
  state?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  issuedAt?: string;
  validUntil?: string;
}

function mapSeverity(s: string | undefined): Severity {
  const sev = (s || "").toUpperCase();
  if (sev.includes("RED") || sev.includes("EXTREME") || sev.includes("CRITICAL")) return "EXTREME";
  if (sev.includes("ORANGE") || sev.includes("HIGH") || sev.includes("SEVERE")) return "HIGH";
  if (sev.includes("YELLOW") || sev.includes("MODERATE")) return "MODERATE";
  return "LOW";
}

function mapHazardType(type: string | undefined): HazardType {
  const t = (type || "").toUpperCase();
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

export async function getNDMAAlerts(): Promise<{ alerts: HazardAlert[]; isCached: boolean; updatedAt: string }> {
  const cacheKey = "ndma:alerts";
  const cached = getCached<{ alerts: HazardAlert[]; updatedAt: string }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  const apiKey = process.env.NDMA_API_KEY;
  if (!apiKey) {
    return {
      alerts: [],
      isCached: false,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    // SACHET API endpoint for current disaster alerts
    const response = await fetch(`${NDMA_BASE_URL}/api/v1/alerts/current`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`NDMA SACHET API responded with ${response.status}`);
    }

    const data = await response.json();
    const alerts: SachetAlert[] = data?.alerts || data?.data || [];

    const normalized: HazardAlert[] = alerts.map((a) => ({
      id: `ndma-${a.id || Math.random().toString(36).slice(2)}`,
      source: "NDMA SACHET",
      type: mapHazardType(a.type),
      severity: mapSeverity(a.severity),
      title: a.title || "Disaster Alert",
      description: a.description || "",
      location: a.location || a.district || a.state || "Unknown",
      state: a.state,
      district: a.district,
      latitude: a.latitude,
      longitude: a.longitude,
      issuedAt: a.issuedAt,
      validUntil: a.validUntil,
    }));

    const result = { alerts: normalized, updatedAt: new Date().toISOString() };
    setCached(cacheKey, result, CACHE_TTL);
    return { ...result, isCached: false };
  } catch (error) {
    console.error("NDMA SACHET fetch failed:", error);
    return {
      alerts: [],
      isCached: false,
      updatedAt: new Date().toISOString(),
    };
  }
}