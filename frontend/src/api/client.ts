import {
  ApiResponse,
  HazardAlert,
  WeatherData,
  RiskAssessment,
  RiskZone,
  VulnerableHabitation,
  EmergencyResource,
  DataSourceStatus,
  EvacPlan,
  GeocodeResult,
  RescueRequest,
  RescueRequestInput,
  RescueVolunteer,
} from "../types";

const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error("Cannot reach the ResQGrid server. Check that the backend is running.");
  }
  if (!response.ok) {
    // Surface the backend's real error reason (rate-limited, routing down…)
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) detail = String(body.error);
    } catch {
      if (response.status === 502 || response.status === 504) {
        detail = "Cannot reach the ResQGrid server. Check that the backend is running.";
      }
    }
    throw new Error(detail);
  }
  return response.json();
}

const get = <T>(path: string) => request<T>(path);
const send = <T>(path: string, method: "POST" | "PATCH", body: unknown) =>
  request<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  getAlerts: () => get<HazardAlert[]>("/alerts"),
  getWeather: (location: string) => get<WeatherData | null>(`/weather?location=${encodeURIComponent(location)}`),
  getRisk: (location: string, lat?: number, lon?: number) =>
    get<RiskAssessment>(
      `/risk?location=${encodeURIComponent(location)}${lat !== undefined ? `&lat=${lat}` : ""}${lon !== undefined ? `&lon=${lon}` : ""}`
    ),
  getRiskZones: () => get<RiskZone[]>("/risk-zones"),
  getVulnerable: () => get<VulnerableHabitation[]>("/vulnerable"),
  getResources: (lat: number, lon: number, radius = 10) =>
    get<EmergencyResource[]>(`/resources?lat=${lat}&lon=${lon}&radius=${radius}`),
  getSources: () => get<DataSourceStatus[]>("/sources"),
  // /health is not wrapped in ApiResponse
  getHealth: async (): Promise<{ status: string; demoMode: boolean }> => {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Health check failed (${res.status})`);
    return res.json();
  },
  geocode: (query: string) => get<GeocodeResult>(`/geocode?q=${encodeURIComponent(query)}`),
  getEvacuationPlan: (lat: number, lon: number, radiusKm = 25, dest?: { lat: number; lon: number; name?: string }) => {
    let qs = `/evacuation/plan?lat=${lat}&lon=${lon}&radiusKm=${radiusKm}`;
    if (dest) qs += `&destLat=${dest.lat}&destLon=${dest.lon}${dest.name ? `&destName=${encodeURIComponent(dest.name)}` : ""}`;
    return get<EvacPlan>(qs);
  },
  createRescueRequest: (input: RescueRequestInput) => send<RescueRequest>("/rescue/request", "POST", input),
  getNearbyRescue: (lat: number, lon: number, radius = 10) =>
    get<{ requests: RescueRequest[]; volunteers: RescueVolunteer[] }>(`/rescue/nearby?lat=${lat}&lon=${lon}&radius=${radius}`),
  acceptRescue: (id: string, volunteerId: string) => send<RescueRequest>(`/rescue/${id}/accept`, "POST", { volunteerId }),
  updateRescueStatus: (id: string, status: RescueRequest["status"]) =>
    send<RescueRequest>(`/rescue/${id}/status`, "PATCH", { status }),
  getRescue: (id: string) => get<RescueRequest>(`/rescue/${id}`),
};

/** Browser geolocation as a promise with a human-readable failure. */
export function getCurrentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied. Allow it in your browser or search instead."
              : "Your location could not be determined. Try searching instead."
          )
        ),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
