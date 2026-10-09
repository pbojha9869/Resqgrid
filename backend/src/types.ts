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
}

export interface ApiResponse<T> {
  data: T;
  source: string;
  updatedAt: string;
  isCached: boolean;
  status: "LIVE" | "CACHED" | "UNAVAILABLE";
  error?: string;
}

export type RescueStatus =
  | "PENDING"
  | "UNDER_VERIFICATION"
  | "VERIFIED"
  | "VOLUNTEER_ASSIGNED"
  | "RESCUE_IN_PROGRESS"
  | "RESOLVED";

export type RescueVerificationStatus = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
export type RescueRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RescueRequestInput {
  latitude: number;
  longitude: number;
  disasterType: HazardType;
  peopleAffected: number;
  children: number;
  elderly: number;
  disabled: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  contactName?: string;
  contactPhone?: string;
  mediaUrl?: string;
}

export interface RescueEvidence {
  source: string;
  kind: "OFFICIAL" | "TRUSTED" | "USER_REPORT";
  finding: string;
  supportsRequest: boolean;
}

export interface RescueAssessment {
  incidentType: string;
  location: { latitude: number; longitude: number; approximate: boolean };
  peopleAtRisk: number;
  vulnerablePeople: string[];
  severity: RescueRequestInput["severity"];
  immediateDanger: string;
  requiredAssistance: string[];
  suggestedVolunteers: number;
  requiredEquipment: string[];
  safetyPrecautions: string[];
  recommendedNextAction: string;
}

export interface RescueVerification {
  status: RescueVerificationStatus;
  confidence: number;
  riskLevel: RescueRiskLevel;
  reasons: string[];
  sources: RescueEvidence[];
  missingInformation: string[];
  assessedAt: string;
}

export interface RescueVolunteer {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  skills: string[];
  available: boolean;
}

export interface RescueAuditEvent {
  at: string;
  action: string;
  actor: string;
  detail: string;
}

export interface RescueRequest extends RescueRequestInput {
  id: string;
  createdAt: string;
  status: RescueStatus;
  verification: RescueVerification;
  assessment: RescueAssessment;
  assignedVolunteer?: RescueVolunteer;
  audit: RescueAuditEvent[];
}