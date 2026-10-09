export type Severity = "LOW" | "MODERATE" | "HIGH" | "EXTREME";
export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "VERY HIGH" | "CRITICAL";

export type HazardType =
  | "FLOOD"
  | "HEAVY_RAIN"
  | "THUNDERSTORM"
  | "LIGHTNING"
  | "CYCLONE"
  | "EARTHQUAKE"
  | "HEAT_WAVE"
  | "LANDSLIDE"
  | "COLD_WAVE"
  | "FOG"
  | "HAILSTORM"
  | "DROUGHT"
  | "OTHER";

export interface HazardAlert {
  id: string;
  source: string;
  type: HazardType;
  severity: Severity;
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

export interface WeatherData {
  location: string;
  state?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  temperature?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: string;
  pressure?: number;
  visibility?: number;
  condition?: string;
  description?: string;
  rainChance?: number;
  source: string;
  updatedAt: string;
  isCached?: boolean;
}

export interface RiskFactor {
  label: string;
  score: number;
  weight: number;
  description?: string;
}

export interface RiskAssessment {
  location: string;
  state?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  riskScore: number;
  riskLevel: RiskLevel;
  primaryHazard?: HazardType;
  secondaryHazard?: HazardType;
  factors: RiskFactor[];
  activeAlerts: HazardAlert[];
  calculatedAt: string;
  isCached?: boolean;
}

export interface EmergencyResource {
  id: string;
  name: string;
  type: "HOSPITAL" | "AMBULANCE" | "FIRE_STATION" | "POLICE_STATION" | "SHELTER" | "RELIEF_CENTER" | "RESCUE_TEAM";
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  capacity?: number;
  availability?: string;
  distanceKm?: number;
  source: string;
  lastUpdated?: string;
  isManual?: boolean;
}

export interface RiskZone {
  id: string;
  name: string;
  state?: string;
  district?: string;
  latitude: number;
  longitude: number;
  radiusKm?: number;
  riskScore: number;
  riskLevel: RiskLevel;
  primaryHazard?: HazardType;
  secondaryHazard?: HazardType;
  populationExposure?: string;
  recommendedAction?: string;
  alerts: HazardAlert[];
  isCached?: boolean;
}

export interface VulnerableHabitation {
  id: string;
  name: string;
  type: "VILLAGE" | "TOWN" | "CITY" | "LOCALITY" | "SETTLEMENT";
  state?: string;
  district?: string;
  latitude: number;
  longitude: number;
  riskScore: number;
  riskLevel: RiskLevel;
  primaryHazard?: HazardType;
  populationExposure?: string;
  nearestShelter?: { name: string; distanceKm: number };
  nearestHospital?: { name: string; distanceKm: number };
  accessibility?: string;
  recommendedAction?: string;
  isCached?: boolean;
}

export interface DataSourceStatus {
  name: string;
  status: "LIVE" | "CACHED" | "UNAVAILABLE";
  lastUpdated?: string;
  error?: string;
  purpose?: string;
}

export interface ApiResponse<T> {
  data: T;
  source: string;
  updatedAt: string;
  isCached: boolean;
  status: "LIVE" | "CACHED" | "UNAVAILABLE";
  error?: string;
}

// ---------- Evacuation Planner ----------

export interface EvacFactor {
  label: string;
  penalty: number; // points deducted from the perfect-100 safety score
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
  safetyScore: number; // 0–100 (higher = safer)
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  geometry: [number, number][]; // [lat, lon]
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

export type RescueStatus = "PENDING" | "UNDER_VERIFICATION" | "VERIFIED" | "VOLUNTEER_ASSIGNED" | "RESCUE_IN_PROGRESS" | "RESOLVED";
export type RescueRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export interface RescueEvidence { source: string; kind: "OFFICIAL" | "TRUSTED" | "USER_REPORT"; finding: string; supportsRequest: boolean; }
export interface RescueVerification { status: "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED"; confidence: number; riskLevel: RescueRiskLevel; reasons: string[]; sources: RescueEvidence[]; missingInformation: string[]; assessedAt: string; }
export interface RescueAssessment { incidentType: string; location: { latitude: number; longitude: number; approximate: boolean }; peopleAtRisk: number; vulnerablePeople: string[]; severity: string; immediateDanger: string; requiredAssistance: string[]; suggestedVolunteers: number; requiredEquipment: string[]; safetyPrecautions: string[]; recommendedNextAction: string; }
export interface RescueVolunteer { id: string; name: string; latitude: number; longitude: number; distanceKm: number; skills: string[]; available: boolean; }
export interface RescueRequest { id: string; latitude: number; longitude: number; disasterType: string; peopleAffected: number; children: number; elderly: number; disabled: number; severity: string; description: string; contactName?: string; contactPhone?: string; createdAt: string; status: RescueStatus; verification: RescueVerification; assessment: RescueAssessment; assignedVolunteer?: RescueVolunteer; audit: { at: string; action: string; actor: string; detail: string }[]; }
export type RescueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RescueRequestInput = Pick<
  RescueRequest,
  | "latitude"
  | "longitude"
  | "disasterType"
  | "peopleAffected"
  | "children"
  | "elderly"
  | "disabled"
  | "severity"
  | "description"
  | "contactName"
  | "contactPhone"
>;

export interface GeocodeResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  state?: string;
  district?: string;
}
