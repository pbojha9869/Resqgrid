import "./env.js";
import express from "express";
import cors from "cors";
import { getIMDWarnings, getIMDWeather } from "./services/imdService.js";
import { getNDMAAlerts } from "./services/ndmaService.js";
import { getCWCFloodAlerts } from "./services/cwcService.js";
import { getOpenMeteoAlerts, getOpenMeteoWeather } from "./services/openMeteoService.js";
import { getGlofasFloodAlerts } from "./services/glofasService.js";
import { getUsgsEarthquakeAlerts } from "./services/usgsService.js";
import { getEonetEventAlerts } from "./services/eonetService.js";
import { getNearbyResources } from "./services/resourceService.js";
import { planEvacuation } from "./services/evacuationService.js";
import { calculateRisk } from "./services/riskEngine.js";
import { geocodeLocation } from "./services/geocodeService.js";
import { demoAlerts, demoResources, demoVulnerableHabitats } from "./services/demoData.js";
import { HazardAlert, RiskZone, VulnerableHabitation, ApiResponse, RescueStatus } from "./types.js";
import {
  acceptRescueRequest,
  createRescueRequest,
  getNearbyRescueRequests,
  getNearbyVolunteers,
  getRescueRequest,
  reverifyRescueRequest,
  updateRescueStatus,
} from "./services/rescueService.js";

const app = express();
const PORT = process.env.PORT || 4000;
const DEMO_MODE = process.env.DEMO_MODE === "true";

app.use(cors());
app.use(express.json());

// Simple request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ---------- Rescue coordination ----------

const RESCUE_STATUSES: RescueStatus[] = [
  "PENDING",
  "UNDER_VERIFICATION",
  "VERIFIED",
  "VOLUNTEER_ASSIGNED",
  "RESCUE_IN_PROGRESS",
  "RESOLVED",
];

app.post("/api/rescue/request", async (req, res) => {
  const input = req.body;
  if (
    !Number.isFinite(input?.latitude) ||
    !Number.isFinite(input?.longitude) ||
    !input?.disasterType ||
    !input?.description?.trim() ||
    !Number.isFinite(input?.peopleAffected) ||
    input.peopleAffected < 1
  ) {
    res.status(400).json({ error: "Latitude, longitude, disaster type, people affected (at least 1) and a description are required." });
    return;
  }
  try {
    res.status(201).json(wrapResponse(await createRescueRequest(input), "ResQGrid Verification Engine", false));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Verification feeds unavailable" });
  }
});

app.post("/api/rescue/verify", async (req, res) => {
  if (!getRescueRequest(req.body?.id)) {
    res.status(404).json({ error: "Rescue request not found" });
    return;
  }
  try {
    const refreshed = await reverifyRescueRequest(req.body.id);
    res.json(wrapResponse(refreshed?.verification, "ResQGrid Verification Engine", false));
  } catch {
    res.status(502).json({ error: "Verification feeds unavailable" });
  }
});

app.get("/api/rescue/nearby", (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  const radius = parseFloat((req.query.radius as string) || "10");
  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query parameters are required" });
    return;
  }
  res.json(
    wrapResponse(
      { requests: getNearbyRescueRequests(lat, lon, radius), volunteers: getNearbyVolunteers(lat, lon, radius) },
      "ResQGrid Coordination Service",
      false
    )
  );
});

app.post("/api/rescue/:id/accept", (req, res) => {
  const request = acceptRescueRequest(req.params.id, req.body?.volunteerId);
  if (!request) {
    res.status(409).json({ error: "Request unavailable or volunteer is not available" });
    return;
  }
  res.json(wrapResponse(request, "ResQGrid Coordination Service", false));
});

app.patch("/api/rescue/:id/status", (req, res) => {
  if (!RESCUE_STATUSES.includes(req.body?.status)) {
    res.status(400).json({ error: `status must be one of ${RESCUE_STATUSES.join(", ")}` });
    return;
  }
  const request = updateRescueStatus(req.params.id, req.body.status, req.body?.actor);
  if (!request) {
    res.status(404).json({ error: "Rescue request not found" });
    return;
  }
  res.json(wrapResponse(request, "ResQGrid Coordination Service", false));
});

app.get("/api/rescue/:id", (req, res) => {
  const request = getRescueRequest(req.params.id);
  if (!request) {
    res.status(404).json({ error: "Rescue request not found" });
    return;
  }
  res.json(wrapResponse(request, "ResQGrid Coordination Service", false));
});

app.post("/api/rescue/:id/route", async (req, res) => {
  const request = getRescueRequest(req.params.id);
  if (!request) {
    res.status(404).json({ error: "Rescue request not found" });
    return;
  }
  try {
    const plan = await planEvacuation({
      originLat: request.latitude,
      originLon: request.longitude,
      radiusKm: req.body?.radiusKm || 25,
      explicitDestination: req.body?.destination,
    });
    res.json(wrapResponse(plan, "ResQGrid Evacuation AI · OSRM + live feeds", plan.isCached === true));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Route service unavailable" });
  }
});

function wrapResponse<T>(data: T, source: string, isCached: boolean, error?: string): ApiResponse<T> {
  return {
    data,
    source,
    updatedAt: new Date().toISOString(),
    isCached,
    status: error ? "UNAVAILABLE" : isCached ? "CACHED" : "LIVE",
    error,
  };
}

interface AlertBundle {
  alerts: HazardAlert[];
  sourceLabel: string;
  isCached: boolean;
}

/**
 * Aggregates hazards from keyless real-time feeds (Open-Meteo weather models,
 * Copernicus GloFAS river floods, USGS earthquakes, NASA EONET events) plus
 * government APIs (IMD / NDMA / CWC) whenever credentials are configured.
 * Demo data — always labeled "DEMO DATA" — is merged on top in demo mode so
 * the map is never empty during presentations.
 */
async function collectAlerts(): Promise<AlertBundle> {
  const [met, glofas, usgs, eonet] = await Promise.all([
    getOpenMeteoAlerts(),
    getGlofasFloodAlerts(),
    getUsgsEarthquakeAlerts(),
    getEonetEventAlerts(),
  ]);

  const [imd, ndma, cwc] = await Promise.all([
    getIMDWarnings(),
    getNDMAAlerts(),
    getCWCFloodAlerts(),
  ]);

  let alerts: HazardAlert[] = [
    ...met.alerts,
    ...glofas.alerts,
    ...usgs.alerts,
    ...eonet.alerts,
    ...imd.alerts,
    ...ndma.alerts,
    ...cwc.alerts,
  ];

  if (DEMO_MODE) {
    alerts = [...alerts, ...demoAlerts];
  }

  const parts: string[] = [];
  if (met.alerts.length) parts.push("Open-Meteo");
  if (glofas.alerts.length) parts.push("GloFAS");
  if (usgs.alerts.length) parts.push("USGS");
  if (eonet.alerts.length) parts.push("NASA EONET");
  if (imd.alerts.length) parts.push("IMD");
  if (ndma.alerts.length) parts.push("NDMA");
  if (cwc.alerts.length) parts.push("CWC");
  if (DEMO_MODE) parts.push("DEMO DATA");

  return {
    alerts,
    sourceLabel: parts.length ? parts.join(" + ") : "LIVE FEEDS",
    isCached:
      met.isCached ||
      glofas.isCached ||
      usgs.isCached ||
      eonet.isCached ||
      imd.isCached ||
      ndma.isCached ||
      cwc.isCached,
  };
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    demoMode: DEMO_MODE,
    timestamp: new Date().toISOString(),
  });
});

// Get all active alerts from all sources (keyless live feeds + gov APIs when configured)
app.get("/api/alerts", async (_req, res) => {
  try {
    const bundle = await collectAlerts();
    res.json(wrapResponse(bundle.alerts, bundle.sourceLabel, bundle.isCached));
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json(wrapResponse([], "ERROR", false, "Failed to fetch alerts"));
  }
});

// Get weather for a location
app.get("/api/weather", async (req, res) => {
  const location = req.query.location as string;
  if (!location) {
    res.status(400).json({ error: "Location query parameter is required" });
    return;
  }

  try {
    if (DEMO_MODE) {
      res.json(wrapResponse({
        location,
        temperature: 28,
        feelsLike: 30,
        humidity: 75,
        windSpeed: 12,
        condition: "Partly Cloudy",
        description: "DEMO DATA - Not live weather",
        source: "DEMO DATA",
        updatedAt: new Date().toISOString(),
      }, "DEMO DATA", false));
      return;
    }

    // Prefer IMD when credentials exist; otherwise fall back to keyless Open-Meteo
    const imdWeather = process.env.IMD_API_KEY ? await getIMDWeather(location) : null;
    const weather = imdWeather ?? (await getOpenMeteoWeather(location));
    if (!weather) {
      res.json(wrapResponse(null, "Open-Meteo", false, "Weather data unavailable"));
      return;
    }
    res.json(wrapResponse(weather, weather.source, weather.isCached || false));
  } catch (error) {
    console.error("Error fetching weather:", error);
    res.status(500).json(wrapResponse(null, "ERROR", false, "Failed to fetch weather"));
  }
});

// Resolve a free-text place name to coordinates (used by every search box)
app.get("/api/geocode", async (req, res) => {
  const query = ((req.query.q as string) || "").trim();
  if (!query) {
    res.status(400).json({ error: "q query parameter is required" });
    return;
  }
  const place = await geocodeLocation(query);
  if (!place) {
    res.status(404).json({ error: `No location found for "${query}"` });
    return;
  }
  res.json(wrapResponse(place, "OpenStreetMap Nominatim", false));
});

/** Alerts considered relevant to a point when scoring its risk. */
const LOCAL_ALERT_RADIUS_KM = 150;

// Get risk assessment for a location
app.get("/api/risk", async (req, res) => {
  const location = ((req.query.location as string) || "").trim();
  let lat = parseFloat(req.query.lat as string);
  let lon = parseFloat(req.query.lon as string);

  if (!location) {
    res.status(400).json({ error: "Location query parameter is required" });
    return;
  }

  try {
    let name = location;
    let state: string | undefined;
    let district: string | undefined;
    if (isNaN(lat) || isNaN(lon)) {
      const place = await geocodeLocation(location);
      if (!place) {
        res.status(404).json({ error: `No location found for "${location}"` });
        return;
      }
      ({ latitude: lat, longitude: lon, state, district } = place);
      name = place.displayName;
    }

    const allAlerts = (await collectAlerts()).alerts;
    // Only hazards near the location contribute — otherwise every place in
    // India would receive the same nationwide score.
    const alerts = allAlerts.filter(
      (a) =>
        a.latitude !== undefined &&
        a.longitude !== undefined &&
        haversine(lat, lon, a.latitude, a.longitude) <= LOCAL_ALERT_RADIUS_KM
    );

    const assessment = calculateRisk(name, alerts, {
      latitude: lat,
      longitude: lon,
      hasPopulationData: false,
      hasShelter: false,
      resourceCount: 0,
    });

    res.json(wrapResponse({ ...assessment, state, district }, "ResQGrid Risk Engine", false));
  } catch (error) {
    console.error("Error calculating risk:", error);
    res.status(500).json(wrapResponse(null, "ERROR", false, "Failed to calculate risk"));
  }
});

/** Groups geo-tagged alerts that share a location into scored risk zones. */
async function buildRiskZones(): Promise<RiskZone[]> {
  const alerts: HazardAlert[] = (await collectAlerts()).alerts;

  const zonesByLocation = new Map<string, HazardAlert[]>();
  for (const alert of alerts) {
    if (alert.latitude === undefined || alert.longitude === undefined) continue;
    const key = `${alert.latitude.toFixed(2)},${alert.longitude.toFixed(2)}`;
    const existing = zonesByLocation.get(key) || [];
    existing.push(alert);
    zonesByLocation.set(key, existing);
  }

  return [...zonesByLocation.entries()]
    .map(([key, zoneAlerts], index): RiskZone => {
      const [lat, lon] = key.split(",").map(Number);
      const assessment = calculateRisk(`Zone ${index + 1}`, zoneAlerts, {
        latitude: lat,
        longitude: lon,
        hasPopulationData: false,
        hasShelter: false,
        resourceCount: 0,
      });

      return {
        id: `zone-${key}`,
        name: zoneAlerts[0].location || `Zone ${index + 1}`,
        state: zoneAlerts[0].state,
        district: zoneAlerts[0].district,
        latitude: lat,
        longitude: lon,
        radiusKm: 25,
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        primaryHazard: assessment.primaryHazard,
        secondaryHazard: assessment.secondaryHazard,
        populationExposure: "Population data unavailable",
        recommendedAction: getRecommendedAction(assessment.riskLevel),
        alerts: zoneAlerts,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

// Get risk zones (high-risk areas)
app.get("/api/risk-zones", async (_req, res) => {
  try {
    res.json(wrapResponse(await buildRiskZones(), "ResQGrid Risk Engine", false));
  } catch (error) {
    console.error("Error calculating risk zones:", error);
    res.status(500).json(wrapResponse([], "ERROR", false, "Failed to calculate risk zones"));
  }
});

// Get vulnerable habitations
app.get("/api/vulnerable", async (_req, res) => {
  try {
    if (DEMO_MODE) {
      res.json(wrapResponse(demoVulnerableHabitats, "DEMO DATA", false));
      return;
    }

    // In live mode, the highest-scoring risk zones are the habitations to watch
    const zones = await buildRiskZones();
    const habitations: VulnerableHabitation[] = zones.slice(0, 6).map((z, index) => ({
      id: `vh-${index + 1}`,
      name: z.name,
      type: "LOCALITY" as const,
      state: z.state,
      district: z.district,
      latitude: z.latitude,
      longitude: z.longitude,
      riskScore: z.riskScore,
      riskLevel: z.riskLevel,
      primaryHazard: z.primaryHazard,
      populationExposure: "Population data unavailable",
      accessibility: "Data unavailable",
      recommendedAction: getRecommendedAction(z.riskLevel),
    }));

    res.json(wrapResponse(habitations, "ResQGrid Risk Engine", false));
  } catch (error) {
    console.error("Error fetching vulnerable habitations:", error);
    res.status(500).json(wrapResponse([], "ERROR", false, "Failed to fetch vulnerable habitations"));
  }
});


// Get nearby emergency resources
app.get("/api/resources", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  const radius = parseFloat((req.query.radius as string) || "10");

  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query parameters are required" });
    return;
  }

  try {
    if (DEMO_MODE) {
      const resources = demoResources.filter((r) => {
        const dist = haversine(lat, lon, r.latitude, r.longitude);
        return dist <= radius;
      });
      res.json(wrapResponse(resources, "DEMO DATA", false));
      return;
    }

    const result = await getNearbyResources(lat, lon, radius);
    res.json(wrapResponse(result.resources, "OpenStreetMap", result.isCached));
  } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch resources";
      console.error("Resources fetch failed:", message);
      // 502 (not empty-200) so the UI can say "source down, retry" honestly
      res.status(502).json(wrapResponse([], "OpenStreetMap", false, message));
    }
});

// AI evacuation planner: safest route from a disaster point to relief centres
app.get("/api/evacuation/plan", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query parameters are required" });
    return;
  }
  const radiusKm = parseFloat((req.query.radiusKm as string) || "25");
  const destLat = parseFloat(req.query.destLat as string);
  const destLon = parseFloat(req.query.destLon as string);
  const destName = req.query.destName as string | undefined;

  try {
    const plan = await planEvacuation({
      originLat: lat,
      originLon: lon,
      originName: (req.query.originName as string) || undefined,
      radiusKm,
      explicitDestination:
        !isNaN(destLat) && !isNaN(destLon) ? { lat: destLat, lon: destLon, name: destName } : undefined,
    });
    res.json(wrapResponse(plan, "ResQGrid Evacuation AI · OSRM + live feeds", plan.isCached === true));
  } catch (error) {
    console.error("Evacuation plan failed:", error);
    const message = error instanceof Error ? error.message : "Failed to build evacuation plan";
    res.status(502).json(wrapResponse(null, "ResQGrid Evacuation AI", false, message));
  }
});

// Get data source status
app.get("/api/sources", async (_req, res) => {
  const sources = [
    {
      name: "IMD",
      status: process.env.IMD_API_KEY ? "LIVE" : "UNAVAILABLE",
      lastUpdated: new Date().toISOString(),
      purpose: "Weather warnings, current weather, district alerts",
    },
    {
      name: "NDMA SACHET",
      status: process.env.NDMA_API_KEY ? "LIVE" : "UNAVAILABLE",
      lastUpdated: new Date().toISOString(),
      purpose: "Disaster alerts and warnings",
    },
    {
      name: "CWC",
      status: process.env.CWC_API_KEY ? "LIVE" : "UNAVAILABLE",
      lastUpdated: new Date().toISOString(),
      purpose: "River water levels and flood forecasts",
    },
    {
      name: "Open-Meteo",
      status: "LIVE",
      lastUpdated: new Date().toISOString(),
      purpose: "Real-time weather hazards: heavy rain, thunderstorm, heat wave, gale winds (56 Indian districts)",
    },
    {
      name: "GloFAS (Copernicus)",
      status: "LIVE",
      lastUpdated: new Date().toISOString(),
      purpose: "River discharge flood forecasting at 28 major Indian river stations",
    },
    {
      name: "USGS",
      status: "LIVE",
      lastUpdated: new Date().toISOString(),
      purpose: "Real-time earthquake epicenters (M4+ in the India region)",
    },
    {
      name: "NASA EONET",
      status: "LIVE",
      lastUpdated: new Date().toISOString(),
      purpose: "Active natural disaster events: floods, cyclones, storms, wildfires",
    },
    {
      name: "OpenStreetMap",
      status: "LIVE",
      lastUpdated: new Date().toISOString(),
      purpose: "Emergency resource locations",
    },
  ];

  res.json(wrapResponse(sources, "ResQGrid", false));
});

function getRecommendedAction(level: string): string {
  switch (level) {
    case "CRITICAL":
      return "Immediate evacuation assessment required";
    case "VERY HIGH":
      return "Prioritize evacuation preparedness";
    case "HIGH":
      return "Prepare evacuation resources";
    case "MODERATE":
      return "Monitor situation closely";
    default:
      return "Continue routine monitoring";
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.listen(PORT, () => {
  console.log(`ResQGrid backend running on http://localhost:${PORT}`);
  console.log(`Demo mode: ${DEMO_MODE ? "ON" : "OFF"}`);
});