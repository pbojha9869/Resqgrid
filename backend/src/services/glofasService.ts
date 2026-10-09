import { HazardAlert, Severity } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

/**
 * Real-time river-flood detection using the Copernicus / European Commission
 * Global Flood Awareness System (GloFAS v4) served through the keyless
 * Open-Meteo Flood API: https://open-meteo.com/en/docs/flood-api
 *
 * Methodology (fully explainable):
 *  - For each monitored river station we pull 30 days of GloFAS reanalysis
 *    plus a 7-day discharge forecast in ONE batched request.
 *  - We compare today's/peak discharge against that station's own 30-day
 *    hydrological baseline (mean μ and standard deviation σ).
 *  - Anomalies are flagged as MODERATE / HIGH / EXTREME using z-score AND
 *    ratio thresholds, with absolute-discharge floors to suppress noise on
 *    small tributaries.
 */

const FLOOD_API = "https://flood-api.open-meteo.com/v1/flood";
const CACHE_TTL = 1800; // GloFAS updates twice daily — 30 min cache

interface RiverStation {
  id: string;
  station: string;
  river: string;
  state: string;
  lat: number;
  lon: number;
}

/**
 * Major Indian river monitoring points (flood-prone reaches).
 * Coordinates sit ON the river channel so GloFAS's 5 km grid snaps correctly.
 */
export const RIVER_STATIONS: RiverStation[] = [
  { id: "ganga-farakka", station: "Farakka", river: "Ganga", state: "West Bengal", lat: 24.803, lon: 87.917 },
  { id: "ganga-patna", station: "Patna", river: "Ganga", state: "Bihar", lat: 25.61, lon: 85.14 },
  { id: "ganga-varanasi", station: "Varanasi", river: "Ganga", state: "Uttar Pradesh", lat: 25.3, lon: 83.01 },
  { id: "ganga-kanpur", station: "Kanpur", river: "Ganga", state: "Uttar Pradesh", lat: 26.455, lon: 80.32 },
  { id: "yamuna-delhi", station: "Delhi (Old Railway Bridge)", river: "Yamuna", state: "Delhi", lat: 28.66, lon: 77.22 },
  { id: "yamuna-mathura", station: "Mathura", river: "Yamuna", state: "Uttar Pradesh", lat: 27.49, lon: 77.67 },
  { id: "yamuna-agra", station: "Agra", river: "Yamuna", state: "Uttar Pradesh", lat: 27.16, lon: 78.02 },
  { id: "yamuna-hamirpur", station: "Hamirpur", river: "Yamuna", state: "Uttar Pradesh", lat: 25.95, lon: 80.15 },
  { id: "brahmaputra-dibrugarh", station: "Dibrugarh", river: "Brahmaputra", state: "Assam", lat: 27.48, lon: 94.9 },
  { id: "brahmaputra-jorhat", station: "Jorhat", river: "Brahmaputra", state: "Assam", lat: 26.75, lon: 94.21 },
  { id: "brahmaputra-guwahati", station: "Guwahati", river: "Brahmaputra", state: "Assam", lat: 26.19, lon: 91.74 },
  { id: "kosi-birpur", station: "Birpur", river: "Kosi", state: "Bihar", lat: 26.51, lon: 86.58 },
  { id: "kosi-baltara", station: "Baltara", river: "Kosi", state: "Bihar", lat: 25.42, lon: 86.63 },
  { id: "bagmati-muzaffarpur", station: "Muzaffarpur", river: "Bagmati", state: "Bihar", lat: 26.3, lon: 85.39 },
  { id: "gandak-valmikinagar", station: "Valmikinagar", river: "Gandak", state: "Bihar", lat: 27.31, lon: 83.98 },
  { id: "ghaghara-chapra", station: "Chapra", river: "Ghaghara", state: "Bihar", lat: 25.78, lon: 84.73 },
  { id: "son-koilwar", station: "Koilwar", river: "Son", state: "Bihar", lat: 25.53, lon: 84.72 },
  { id: "godavari-rajahmundry", station: "Rajahmundry", river: "Godavari", state: "Andhra Pradesh", lat: 17.0, lon: 81.78 },
  { id: "krishna-vijayawada", station: "Vijayawada", river: "Krishna", state: "Andhra Pradesh", lat: 16.52, lon: 80.6 },
  { id: "narmada-garudeshwar", station: "Garudeshwar", river: "Narmada", state: "Gujarat", lat: 21.87, lon: 73.4 },
  { id: "tapi-surat", station: "Surat", river: "Tapi", state: "Gujarat", lat: 21.22, lon: 72.83 },
  { id: "mahanadi-mundali", station: "Mundali", river: "Mahanadi", state: "Odisha", lat: 20.48, lon: 85.87 },
  { id: "cauvery-mukkombu", station: "Upper Anaicut", river: "Cauvery", state: "Tamil Nadu", lat: 10.85, lon: 78.55 },
  { id: "chambal-kota", station: "Kota", river: "Chambal", state: "Rajasthan", lat: 25.18, lon: 75.84 },
  { id: "betwa-hamirpur", station: "Hamirpur (Betwa)", river: "Betwa", state: "Uttar Pradesh", lat: 25.54, lon: 80.11 },
  { id: "sutlej-rupnagar", station: "Rupnagar", river: "Sutlej", state: "Punjab", lat: 30.97, lon: 76.53 },
  { id: "beas-harike", station: "Harike", river: "Beas", state: "Punjab", lat: 31.16, lon: 75.2 },
  { id: "jhelum-srinagar", station: "Srinagar", river: "Jhelum", state: "Jammu & Kashmir", lat: 34.08, lon: 74.8 },
];

interface FloodApiResponse {
  latitude?: number | number[];
  longitude?: number | number[];
  daily?: {
    time: string[];
    river_discharge?: number[];
  };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], mu: number): number {
  const variance = values.reduce((acc, v) => acc + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Severity tiers REQUIRE both a statistical anomaly AND a meaningful absolute
// discharge. Without the absolute floor, a tiny stream going 1 -> 6 m³/s
// (huge ratio, trivial flow) would falsely read as "severe flood".
const SEVERITY_TIERS: { severity: Severity; minAbs: number; zReq: number; ratioReq: number }[] = [
  { severity: "EXTREME", minAbs: 200, zReq: 5, ratioReq: 3 },
  { severity: "HIGH", minAbs: 80, zReq: 3.5, ratioReq: 2.25 },
  { severity: "MODERATE", minAbs: 30, zReq: 2.5, ratioReq: 1.7 },
];

function classifyDischarge(value: number, mu: number, sigma: number): { severity: Severity; z: number; ratio: number } | null {
  if (mu <= 0 || value <= 0) return null;

  const ratio = value / mu;
  const zRaw = sigma > 1e-6 ? (value - mu) / sigma : Infinity;
  const z = isFinite(zRaw) ? zRaw : 999; // σ≈0 → extreme outlier score

  for (const tier of SEVERITY_TIERS) {
    if (value > tier.minAbs && (z >= tier.zReq || ratio >= tier.ratioReq)) {
      return { severity: tier.severity, z, ratio };
    }
  }
  return null;
}

/** One-step severity downgrade (never below MODERATE — those carry caveats instead). */
function downgrade(sev: Severity): Severity {
  if (sev === "EXTREME") return "HIGH";
  if (sev === "HIGH") return "MODERATE";
  return "MODERATE";
}

interface RainCheck {
  past5: number;
  next5: number;
}

/**
 * Cross-source check #1 — Open-Meteo observed + forecast rainfall AT the
 * station point. A genuine flood rise needs water: recent or imminent rain.
 */
async function fetchRainChecks(stations: { lat: number; lon: number }[]): Promise<Map<number, RainCheck>> {
  const out = new Map<number, RainCheck>();
  if (stations.length === 0) return out;
  try {
    const params = new URLSearchParams({
      latitude: stations.map((s) => s.lat.toFixed(3)).join(","),
      longitude: stations.map((s) => s.lon.toFixed(3)).join(","),
      daily: "precipitation_sum",
      past_days: "5",
      forecast_days: "6",
      timezone: "Asia/Kolkata",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const arr: Array<{ daily?: { precipitation_sum?: (number | null)[] } }> = Array.isArray(payload) ? payload : [payload];
    arr.forEach((entry, i) => {
      const sums = (entry?.daily?.precipitation_sum || []).map((v) => (typeof v === "number" ? v : 0));
      if (sums.length >= 11) {
        out.set(i, {
          past5: sums.slice(0, 5).reduce((a, b) => a + b, 0),
          next5: sums.slice(6, 11).reduce((a, b) => a + b, 0),
        });
      }
    });
  } catch (err) {
    console.warn("Rain cross-check unavailable:", err instanceof Error ? err.message : err);
  }
  return out;
}

interface ReliefWebEvent {
  name: string;
  date?: string;
  url?: string;
}

/**
 * Cross-source check #2 — UN OCHA ReliefWeb: officially reported ONGOING
 * flood disasters in India. Completely independent of GloFAS models.
 */
async function fetchReliefWebFloods(): Promise<ReliefWebEvent[]> {
  const cacheKey = "reliefweb:india-floods";
  const cached = getCached<ReliefWebEvent[]>(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch("https://api.reliefweb.int/v1/disasters?appname=resqgrid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: 100,
        sort: ["date:desc"],
        filters: {
          operator: "AND",
          conditions: [
            { field: "status", value: "current" },
            { field: "type", value: "Flood" },
          ],
        },
        fields: { include: ["name", "date", "url"] },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const events: ReliefWebEvent[] = (json?.data || [])
      .map((d: { fields?: { name?: string; date?: string; url?: string } }) => ({
        name: d.fields?.name || "",
        date: d.fields?.date,
        url: d.fields?.url,
      }))
      .filter((e: ReliefWebEvent) => e.name.toLowerCase().includes("india"));
    setCached(cacheKey, events, 1800);
    return events;
  } catch (err) {
    console.warn("ReliefWeb cross-check unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Fetch GloFAS river-discharge flood alerts for all monitored stations. */
export async function getGlofasFloodAlerts(): Promise<{ alerts: HazardAlert[]; isCached: boolean; updatedAt: string }> {
  const cacheKey = "glofas:flood-alerts";
  const cached = getCached<{ alerts: HazardAlert[]; updatedAt: string }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  try {
    const lats = RIVER_STATIONS.map((s) => s.lat.toFixed(3)).join(",");
    const lons = RIVER_STATIONS.map((s) => s.lon.toFixed(3)).join(",");
    const params = new URLSearchParams({
      latitude: lats,
      longitude: lons,
      daily: "river_discharge",
      past_days: "30",
      forecast_days: "7",
    });

    const response = await fetch(`${FLOOD_API}?${params.toString()}`, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`GloFAS API responded with ${response.status}`);

    const payload = (await response.json()) as FloodApiResponse | FloodApiResponse[];
    const results = Array.isArray(payload) ? payload : [payload];

    const alerts: HazardAlert[] = [];

    const candidates: {
      st: (typeof RIVER_STATIONS)[number];
      peak: number;
      peakDate: string;
      mu: number;
      sigma: number;
      hit: NonNullable<ReturnType<typeof classifyDischarge>>;
    }[] = [];

    results.forEach((result, i) => {
      const st = RIVER_STATIONS[i];
      const series = result?.daily?.river_discharge?.filter((v) => typeof v === "number");
      if (!st || !series || series.length < 35) return; // need 30 past + ~5 forecast days

      const times = result.daily!.time;
      const past30 = series.slice(0, 30);
      const forecast7 = series.slice(31);
      const current = series[30];
      if (forecast7.length === 0) return;

      const mu = mean(past30);
      const sigma = stdDev(past30, mu);

      // Evaluate both today's flow and the 7-day peak
      let peak = current;
      let peakDate = times[30];
      forecast7.forEach((v, j) => {
        if (v > peak) {
          peak = v;
          peakDate = times[31 + j];
        }
      });

      const hit = classifyDischarge(peak, mu, sigma);
      if (!hit) return;
      candidates.push({ st, peak, peakDate, mu, sigma, hit });

      candidates.push({ st, peak, peakDate, mu, sigma, hit });
    });

    // ---------- Cross-source verification (independent APIs) ----------
    const rainChecks = await fetchRainChecks(candidates.map((c) => ({ lat: c.st.lat, lon: c.st.lon })));
    const rwEvents = await fetchReliefWebFloods();

    for (const [i, c] of candidates.entries()) {
      let severity = c.hit.severity;
      let autoDowngraded = false;

      // Check #1: rainfall corroboration — floods need water from the sky
      const rain = rainChecks.get(i);
      const rainSupported = rain !== undefined && (rain.next5 >= 40 || rain.past5 >= 80);
      if (rain && !rainSupported && severity !== "MODERATE") {
        severity = downgrade(severity);
        autoDowngraded = true;
      }

      // Check #2: UN OCHA ReliefWeb officially-reported ongoing event
      const stateKey = c.st.state.toLowerCase();
      const rwMatch = rwEvents.find((e) => e.name.toLowerCase().includes(stateKey));

      const severityLabel =
        severity === "EXTREME" ? "Severe flood likely" : severity === "HIGH" ? "Flood warning" : "Flood watch";

      const parts: string[] = [
        `Copernicus GloFAS model shows discharge peaking at ${Math.round(c.peak)} m³/s (around ${c.peakDate}), ` +
          `${c.hit.z.toFixed(1)}σ above its 30-day norm (mean: ${Math.round(c.mu)} m³/s).`,
      ];

      if (rain) {
        parts.push(
          rainSupported
            ? `Rainfall cross-check (Open-Meteo): ${Math.round(rain.past5)} mm fell in the last 5 days and ${Math.round(
                rain.next5
              )} mm is forecast in the next 5 — consistent with rising river levels.`
            : `Rainfall cross-check (Open-Meteo): only ${Math.round(rain.past5)} mm recent / ${Math.round(
                rain.next5
              )} mm forecast — the modelled spike is NOT yet supported by rainfall. Treat as watch-level until verified.`
        );
      } else {
        parts.push("Rainfall cross-check unavailable.");
      }

      parts.push(
        rwMatch
          ? `Corroborated by UN OCHA ReliefWeb ongoing event: "${rwMatch.name}".`
          : `No matching ongoing flood event reported on UN OCHA ReliefWeb for ${c.st.state} yet.` +
            (autoDowngraded ? " Severity was auto-downgraded after the rainfall cross-check." : "")
      );
      parts.push(`Cross-check with CWC flood forecasting before evacuation orders.`);

      alerts.push({
        id: `glofas-${c.st.id}`,
        source: "GloFAS (Copernicus)",
        type: "FLOOD",
        severity,
        title: `${severityLabel}: ${c.st.river} @ ${c.st.station}`,
        description: parts.join(" "),
        location: `${c.st.station} (${c.st.river})`,
        state: c.st.state,
        district: c.st.station.split(" (")[0],
        latitude: c.st.lat,
        longitude: c.st.lon,
        issuedAt: new Date().toISOString(),
        validUntil: c.peakDate,
      });
    }

    const out = { alerts, updatedAt: new Date().toISOString() };
    setCached(cacheKey, out, CACHE_TTL);
    return { ...out, isCached: false };
  } catch (error) {
    console.error("GloFAS flood feed failed:", error);
    return { alerts: [], isCached: false, updatedAt: new Date().toISOString() };
  }
}