import { HazardAlert, Severity, WeatherData, HazardType } from "../types.js";
import { getCached, setCached } from "../utils/cache.js";

/**
 * Real-time weather hazard detection using the Open-Meteo Forecast API.
 * Free, keyless, global coverage (blended national weather models).
 * Docs: https://open-meteo.com/en/docs
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const CACHE_TTL = 600; // 10 minutes — models refresh ~every 15 min

interface MonitoredCity {
  name: string;
  state: string;
  lat: number;
  lon: number;
}

/**
 * District HQ / major cities monitored for real-time weather hazards.
 * Coordinates are exact district locations, so map dots land on the city.
 */
export const MONITORED_CITIES: MonitoredCity[] = [
  { name: "New Delhi", state: "Delhi", lat: 28.6139, lon: 77.209 },
  { name: "Mumbai", state: "Maharashtra", lat: 19.076, lon: 72.8777 },
  { name: "Kolkata", state: "West Bengal", lat: 22.5726, lon: 88.3639 },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707 },
  { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lon: 77.5946 },
  { name: "Hyderabad", state: "Telangana", lat: 17.385, lon: 78.4867 },
  { name: "Ahmedabad", state: "Gujarat", lat: 23.0225, lon: 72.5714 },
  { name: "Pune", state: "Maharashtra", lat: 18.5204, lon: 73.8567 },
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lon: 75.7873 },
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
  { name: "Kanpur", state: "Uttar Pradesh", lat: 26.4499, lon: 80.3319 },
  { name: "Patna", state: "Bihar", lat: 25.5941, lon: 85.1376 },
  { name: "Guwahati", state: "Assam", lat: 26.1445, lon: 91.7362 },
  { name: "Dibrugarh", state: "Assam", lat: 27.4728, lon: 94.912 },
  { name: "Siliguri", state: "West Bengal", lat: 26.7271, lon: 88.3953 },
  { name: "Bhubaneswar", state: "Odisha", lat: 20.2961, lon: 85.8245 },
  { name: "Cuttack", state: "Odisha", lat: 20.4625, lon: 85.8828 },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.6868, lon: 83.2185 },
  { name: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lon: 80.648 },
  { name: "Tirupati", state: "Andhra Pradesh", lat: 13.6288, lon: 79.4192 },
  { name: "Kochi", state: "Kerala", lat: 9.9312, lon: 76.2673 },
  { name: "Thiruvananthapuram", state: "Kerala", lat: 8.5241, lon: 76.9366 },
  { name: "Madurai", state: "Tamil Nadu", lat: 9.9252, lon: 78.1198 },
  { name: "Coimbatore", state: "Tamil Nadu", lat: 11.0168, lon: 76.9558 },
  { name: "Mysuru", state: "Karnataka", lat: 12.2958, lon: 76.6394 },
  { name: "Mangaluru", state: "Karnataka", lat: 12.9141, lon: 74.856 },
  { name: "Surat", state: "Gujarat", lat: 21.1702, lon: 72.8311 },
  { name: "Vadodara", state: "Gujarat", lat: 22.3072, lon: 73.1812 },
  { name: "Bhuj", state: "Gujarat", lat: 23.242, lon: 69.6669 },
  { name: "Indore", state: "Madhya Pradesh", lat: 22.7196, lon: 75.8577 },
  { name: "Bhopal", state: "Madhya Pradesh", lat: 23.2599, lon: 77.4126 },
  { name: "Jabalpur", state: "Madhya Pradesh", lat: 23.1815, lon: 79.9864 },
  { name: "Nagpur", state: "Maharashtra", lat: 21.1458, lon: 79.0882 },
  { name: "Nashik", state: "Maharashtra", lat: 19.9975, lon: 73.7898 },
  { name: "Raipur", state: "Chhattisgarh", lat: 21.2514, lon: 81.6296 },
  { name: "Ranchi", state: "Jharkhand", lat: 23.3441, lon: 85.3096 },
  { name: "Jamshedpur", state: "Jharkhand", lat: 22.8046, lon: 86.2029 },
  { name: "Varanasi", state: "Uttar Pradesh", lat: 25.3176, lon: 82.9739 },
  { name: "Prayagraj", state: "Uttar Pradesh", lat: 25.4358, lon: 81.8463 },
  { name: "Agra", state: "Uttar Pradesh", lat: 27.1767, lon: 78.0081 },
  { name: "Mathura", state: "Uttar Pradesh", lat: 27.4924, lon: 77.6737 },
  { name: "Gorakhpur", state: "Uttar Pradesh", lat: 26.7606, lon: 83.3732 },
  { name: "Dehradun", state: "Uttarakhand", lat: 30.3165, lon: 78.0322 },
  { name: "Shimla", state: "Himachal Pradesh", lat: 31.1048, lon: 77.1734 },
  { name: "Chandigarh", state: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  { name: "Amritsar", state: "Punjab", lat: 31.634, lon: 74.8723 },
  { name: "Jammu", state: "Jammu & Kashmir", lat: 32.7266, lon: 74.857 },
  { name: "Srinagar", state: "Jammu & Kashmir", lat: 34.0837, lon: 74.7973 },
  { name: "Leh", state: "Ladakh", lat: 34.1526, lon: 77.5771 },
  { name: "Jodhpur", state: "Rajasthan", lat: 26.2389, lon: 73.0243 },
  { name: "Kota", state: "Rajasthan", lat: 25.2138, lon: 75.8648 },
  { name: "Gwalior", state: "Madhya Pradesh", lat: 26.2183, lon: 78.1828 },
  { name: "Imphal", state: "Manipur", lat: 24.817, lon: 93.9368 },
  { name: "Agartala", state: "Tripura", lat: 23.8315, lon: 91.2868 },
  { name: "Shillong", state: "Meghalaya", lat: 25.5788, lon: 91.8933 },
  { name: "Port Blair", state: "Andaman & Nicobar", lat: 11.6234, lon: 92.7265 },
  { name: "Panaji", state: "Goa", lat: 15.4909, lon: 73.8278 },
];

interface OpenMeteoResult {
  latitude: number;
  longitude: number;
  current?: {
    time: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    surface_pressure?: number;
  };
  daily?: {
    time: string[];
    precipitation_sum?: number[];
    weather_code?: number[];
    wind_speed_10m_max?: number[];
    temperature_2m_max?: number[];
  };
}

function describeWeatherCode(code: number | undefined): string {
  if (code === undefined || code === null) return "Unknown";
  if (code === 0) return "Clear sky";
  if (code <= 3) return code === 1 ? "Mainly clear" : code === 2 ? "Partly cloudy" : "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code <= 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing drizzle";
  if (code <= 65) return "Rain";
  if (code <= 67) return "Freezing rain";
  if (code <= 77) return "Snowfall";
  if (code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Unsettled";
}

function buildBatchUrl(): string {
  const lats = MONITORED_CITIES.map((c) => c.lat.toFixed(4)).join(",");
  const lons = MONITORED_CITIES.map((c) => c.lon.toFixed(4)).join(",");
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    daily: "precipitation_sum,weather_code,wind_speed_10m_max,temperature_2m_max",
    forecast_days: "3",
    timezone: "Asia/Kolkata",
  });
  return `${FORECAST_URL}?${params.toString()}`;
}

function thunderstormAlert(
  city: MonitoredCity,
  daily: NonNullable<OpenMeteoResult["daily"]>,
  issuedAt: string
): HazardAlert | null {
  const codes = daily.weather_code || [];
  const anyIdx = codes.findIndex((c) => c === 95 || c === 96 || c === 99);
  if (anyIdx === -1) return null;

  const hasHail = codes.includes(99);
  const severity: Severity = hasHail ? "HIGH" : "MODERATE";
  const dayLabel = anyIdx === 0 ? "today" : `on ${daily.time[anyIdx]}`;
  return {
    id: `met-ts-${city.name.toLowerCase().replace(/\s+/g, "-")}`,
    source: "Open-Meteo",
    type: "THUNDERSTORM" as HazardType,
    severity,
    title: `Thunderstorm warning: ${city.name}`,
    description:
      `Live model data shows thunderstorm activity ${dayLabel} around ${city.name}, ${city.state}.` +
      (hasHail ? " Hail signature detected." : "") +
      " Verify with IMD nowcast before field action.",
    location: `${city.name}, ${city.state}`,
    state: city.state,
    district: city.name,
    latitude: city.lat,
    longitude: city.lon,
    issuedAt,
    validUntil: daily.time[daily.time.length - 1],
  };
}

function heavyRainAlert(
  city: MonitoredCity,
  daily: NonNullable<OpenMeteoResult["daily"]>,
  issuedAt: string
): HazardAlert | null {
  const sums = (daily.precipitation_sum || []).slice(0, 3).filter((v) => typeof v === "number");
  if (sums.length === 0) return null;
  const maxSum = Math.max(...sums);

  let severity: Severity | null = null;
  let intensity = "";
  if (maxSum >= 115.6) {
    severity = "EXTREME";
    intensity = "Extremely heavy";
  } else if (maxSum >= 64.5) {
    severity = "HIGH";
    intensity = "Very heavy";
  } else if (maxSum >= 35.6) {
    severity = "MODERATE";
    intensity = "Heavy";
  }
  if (!severity) return null;

  return {
    id: `met-rain-${city.name.toLowerCase().replace(/\s+/g, "-")}`,
    source: "Open-Meteo",
    type: "HEAVY_RAIN" as HazardType,
    severity,
    title: `${intensity} rainfall alert (${Math.round(maxSum)} mm/day): ${city.name}`,
    description: `Forecast models predict ~${Math.round(maxSum)} mm rain near ${city.name}, ${city.state}. Threshold follows the IMD rainfall classification (${intensity.toLowerCase()} rainfall). Urban flooding and localized inundation possible.`,
    location: `${city.name}, ${city.state}`,
    state: city.state,
    district: city.name,
    latitude: city.lat,
    longitude: city.lon,
    issuedAt,
    validUntil: daily.time[daily.time.length - 1],
  };
}

function heatWaveAlert(
  city: MonitoredCity,
  daily: NonNullable<OpenMeteoResult["daily"]>,
  issuedAt: string
): HazardAlert | null {
  const temps = (daily.temperature_2m_max || []).slice(0, 3).filter((v) => typeof v === "number");
  if (temps.length === 0) return null;
  const maxTemp = Math.max(...temps);

  let severity: Severity | null = null;
  if (maxTemp >= 47) severity = "EXTREME";
  else if (maxTemp >= 44) severity = "HIGH";
  else if (maxTemp >= 41) severity = "MODERATE";
  if (!severity) return null;

  return {
    id: `met-heat-${city.name.toLowerCase().replace(/\s+/g, "-")}`,
    source: "Open-Meteo",
    type: "HEAT_WAVE" as HazardType,
    severity,
    title: `Heat wave conditions (${Math.round(maxTemp)}°C): ${city.name}`,
    description: `Daytime maximum of ${Math.round(maxTemp)}°C expected near ${city.name}, ${city.state}. Vulnerable populations (elderly, infants, outdoor workers) at elevated heat-stress risk.`,
    location: `${city.name}, ${city.state}`,
    state: city.state,
    district: city.name,
    latitude: city.lat,
    longitude: city.lon,
    issuedAt,
    validUntil: daily.time[daily.time.length - 1],
  };
}

function strongWindAlert(
  city: MonitoredCity,
  daily: NonNullable<OpenMeteoResult["daily"]>,
  issuedAt: string
): HazardAlert | null {
  const winds = (daily.wind_speed_10m_max || []).slice(0, 3).filter((v) => typeof v === "number");
  if (winds.length === 0) return null;
  const maxWind = Math.max(...winds);

  // IMD-style: gale winds 62–88 km/h; storm force 89–117 km/h; severe cyclonic >117 km/h
  if (maxWind < 62) return null;

  const severity: Severity = maxWind >= 117 ? "EXTREME" : maxWind >= 89 ? "HIGH" : "MODERATE";
  const type: HazardType = maxWind >= 89 ? "CYCLONE" : "THUNDERSTORM";
  const label =
    maxWind >= 117
      ? "Severe cyclonic-scale winds"
      : maxWind >= 89
        ? "Destructive gale/storm-force winds"
        : "Strong gusty winds";

  return {
    id: `met-wind-${city.name.toLowerCase().replace(/\s+/g, "-")}`,
    source: "Open-Meteo",
    type,
    severity,
    title: `${label} (${Math.round(maxWind)} km/h): ${city.name}`,
    description:
      `Model forecasts sustained winds up to ${Math.round(maxWind)} km/h near ${city.name}, ${city.state}. ` +
      (maxWind >= 89
        ? "Potentially associated with a cyclonic system — cross-check RSMC New Delhi bulletins."
        : "Risk of tree fall, power line damage and flying debris."),
    location: `${city.name}, ${city.state}`,
    state: city.state,
    district: city.name,
    latitude: city.lat,
    longitude: city.lon,
    issuedAt,
    validUntil: daily.time[daily.time.length - 1],
  };
}

/** Fetch real-time weather hazards across all monitored Indian cities. */
export async function getOpenMeteoAlerts(): Promise<{ alerts: HazardAlert[]; isCached: boolean; updatedAt: string }> {
  const cacheKey = "open-meteo:hazard-alerts";
  const cached = getCached<{ alerts: HazardAlert[]; updatedAt: string }>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  try {
    const response = await fetch(buildBatchUrl(), { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Open-Meteo responded with ${response.status}`);

    const payload = (await response.json()) as OpenMeteoResult | OpenMeteoResult[];
    const results = Array.isArray(payload) ? payload : [payload];

    const alerts: HazardAlert[] = [];
    const issuedAt = new Date().toISOString();

    results.forEach((result, i) => {
      const city = MONITORED_CITIES[i];
      if (!city || !result?.daily) return;
      for (const alert of [
        thunderstormAlert(city, result.daily, issuedAt),
        heavyRainAlert(city, result.daily, issuedAt),
        heatWaveAlert(city, result.daily, issuedAt),
        strongWindAlert(city, result.daily, issuedAt),
      ]) {
        if (alert) alerts.push(alert);
      }
    });

    const out = { alerts, updatedAt: new Date().toISOString() };
    setCached(cacheKey, out, CACHE_TTL);
    return { ...out, isCached: false };
  } catch (error) {
    console.error("Open-Meteo hazard feed failed:", error);
    return { alerts: [], isCached: false, updatedAt: new Date().toISOString() };
  }
}

/** Current conditions for an arbitrary location (used by /api/weather). */
export async function getOpenMeteoWeather(location: string): Promise<WeatherData | null> {
  const cacheKey = `open-meteo:weather:${location.toLowerCase().trim()}`;
  const cached = getCached<WeatherData>(cacheKey);
  if (cached) {
    return { ...cached, isCached: true };
  }

  try {
    // Step 1: geocode the free-text location (India-first)
    let geoRes = await fetch(
      `${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json&countryCode=IN`,
      { signal: AbortSignal.timeout(10000) }
    );
    let geoJson = await geoRes.json();
    if (!geoJson?.results?.length) {
      geoRes = await fetch(`${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`, {
        signal: AbortSignal.timeout(10000),
      });
      geoJson = await geoRes.json();
    }
    const hit = geoJson?.results?.[0];
    if (!hit) return null;

    // Step 2: current conditions at those exact coordinates
    const params = new URLSearchParams({
      latitude: String(hit.latitude),
      longitude: String(hit.longitude),
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,surface_pressure",
      timezone: "Asia/Kolkata",
    });
    const wxRes = await fetch(`${FORECAST_URL}?${params.toString()}`, { signal: AbortSignal.timeout(10000) });
    if (!wxRes.ok) throw new Error(`Open-Meteo responded with ${wxRes.status}`);
    const wx = (await wxRes.json()) as OpenMeteoResult;

    const cur = wx.current ?? ({} as NonNullable<OpenMeteoResult["current"]>);
    const weather: WeatherData = {
      location: hit.name || location,
      state: hit.admin1,
      district: hit.admin2,
      latitude: hit.latitude,
      longitude: hit.longitude,
      temperature: cur.temperature_2m,
      feelsLike: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      windSpeed: cur.wind_speed_10m,
      pressure: cur.surface_pressure,
      condition: describeWeatherCode(cur.weather_code),
      description: `${describeWeatherCode(cur.weather_code)}, ${Math.round(cur.temperature_2m ?? 0)}°C, humidity ${
        cur.relative_humidity_2m ?? "?"
      }% (live model observation)`,
      source: "Open-Meteo",
      updatedAt: cur.time || new Date().toISOString(),
    };

    setCached(cacheKey, weather, CACHE_TTL);
    return weather;
  } catch (error) {
    console.error("Open-Meteo weather lookup failed:", error);
    return null;
  }
}