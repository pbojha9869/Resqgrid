import { HazardAlert, RescueRequest, RescueRequestInput, RescueVolunteer, RescueRiskLevel } from "../types.js";
import { getOpenMeteoAlerts } from "./openMeteoService.js";
import { getGlofasFloodAlerts } from "./glofasService.js";
import { getNDMAAlerts } from "./ndmaService.js";
import { getCWCFloodAlerts } from "./cwcService.js";
import { getUsgsEarthquakeAlerts } from "./usgsService.js";
import { getEonetEventAlerts } from "./eonetService.js";

/** Alert types that corroborate each kind of reported emergency. */
const RELATED_HAZARDS: Record<string, HazardAlert["type"][]> = {
  FLOOD: ["FLOOD", "HEAVY_RAIN", "CYCLONE"],
  EARTHQUAKE: ["EARTHQUAKE", "LANDSLIDE"],
  CYCLONE: ["CYCLONE", "THUNDERSTORM", "HEAVY_RAIN"],
  LANDSLIDE: ["LANDSLIDE", "HEAVY_RAIN", "EARTHQUAKE"],
};

const requests = new Map<string, RescueRequest>();
const volunteers: RescueVolunteer[] = [
  { id: "vol-1", name: "Aarav Singh", latitude: 25.609, longitude: 85.14, distanceKm: 0, skills: ["first-aid", "water-rescue"], available: true },
  { id: "vol-2", name: "Meera Nair", latitude: 9.975, longitude: 76.28, distanceKm: 0, skills: ["first-aid", "logistics"], available: true },
  { id: "vol-3", name: "Kabir Das", latitude: 22.57, longitude: 88.36, distanceKm: 0, skills: ["search-and-rescue"], available: true },
];

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function riskFor(input: RescueRequestInput, alertCount: number): RescueRiskLevel {
  if (input.severity === "CRITICAL" || (input.severity === "HIGH" && alertCount > 0)) return "CRITICAL";
  if (input.severity === "HIGH" || input.elderly + input.children + input.disabled > 0) return "HIGH";
  if (input.severity === "MEDIUM" || alertCount > 0) return "MEDIUM";
  return "LOW";
}

function buildAssessment(input: RescueRequestInput, risk: RescueRiskLevel) {
  const vulnerablePeople = [input.children ? `${input.children} children` : "", input.elderly ? `${input.elderly} elderly` : "", input.disabled ? `${input.disabled} disabled people` : ""].filter(Boolean);
  const critical = risk === "CRITICAL";
  return {
    incidentType: input.disasterType.replace("_", " "),
    location: { latitude: input.latitude, longitude: input.longitude, approximate: false },
    peopleAtRisk: input.peopleAffected,
    vulnerablePeople,
    severity: input.severity,
    immediateDanger: critical ? "Potential immediate danger; fast-moving water, structural damage, or electrical hazards may be present." : "Situation requires assessment before anyone approaches.",
    requiredAssistance: ["Coordinate with official emergency services", input.peopleAffected > 4 ? "3 trained volunteers" : "2 trained volunteers", "First-aid support"],
    suggestedVolunteers: Math.min(5, Math.max(1, Math.ceil(input.peopleAffected / 2))),
    requiredEquipment: input.disasterType === "FLOOD" ? ["Life jackets", "Rope", "First-aid kit"] : ["First-aid kit", "Two-way communication"],
    safetyPrecautions: ["Do not enter fast-moving or electrically hazardous water.", "Untrained volunteers must wait for official clearance.", "Prioritize emergency services for critical incidents."],
    recommendedNextAction: critical ? "Call and coordinate with official emergency services immediately; volunteer response is secondary." : "Keep contact available and wait for a trained volunteer or emergency-service update.",
  };
}

async function verifyInput(input: RescueRequestInput) {
  const settled = await Promise.allSettled([getOpenMeteoAlerts(), getGlofasFloodAlerts(), getNDMAAlerts(), getCWCFloodAlerts(), getUsgsEarthquakeAlerts(), getEonetEventAlerts()]);
  const related = RELATED_HAZARDS[input.disasterType] ?? [input.disasterType];
  const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value.alerts : []) as HazardAlert[];
  const nearby = results.filter((alert) => typeof alert.latitude === "number" && typeof alert.longitude === "number" && distanceKm(input.latitude, input.longitude, alert.latitude!, alert.longitude!) <= 50 && (input.disasterType === "OTHER" || related.includes(alert.type)));
  const official = nearby.filter((alert) => ["IMD", "NDMA", "CWC"].some((source) => alert.source.toUpperCase().includes(source)));
  const sources = nearby.map((alert) => ({ source: alert.source, kind: ["IMD", "NDMA", "CWC"].some((source) => alert.source.toUpperCase().includes(source)) ? "OFFICIAL" as const : "TRUSTED" as const, finding: `${alert.title} reported within 50 km`, supportsRequest: true }));
  const duplicate = [...requests.values()].some((request) => request.status !== "RESOLVED" && distanceKm(input.latitude, input.longitude, request.latitude, request.longitude) < 0.5 && request.disasterType === input.disasterType);
  const risk = riskFor(input, nearby.length);
  const confidence = Math.min(98, 38 + (nearby.length ? 25 : 0) + (official.length ? 25 : 0) + (input.description.length >= 30 ? 8 : 0) - (duplicate ? 20 : 0));
  const reasons = [nearby.length ? `${nearby.length} trusted hazard alert(s) are spatially consistent.` : "No matching nearby hazard alert was found.", official.length ? "Authenticated government-source evidence supports the hazard context." : "No authenticated government-source evidence matched this location and type.", duplicate ? "A possible duplicate request was detected within 500 metres." : "No conflicting duplicate request was detected."];
  return {
    status: official.length ? "VERIFIED" as const : nearby.length ? "PARTIALLY_VERIFIED" as const : "UNVERIFIED" as const,
    confidence: Math.max(0, confidence), riskLevel: risk, reasons,
    sources: [...sources, { source: "Citizen report", kind: "USER_REPORT" as const, finding: "Location and description supplied by requester; this is not official verification.", supportsRequest: true }],
    missingInformation: ["Responder identity and training have not been independently verified.", ...(input.mediaUrl ? [] : ["No image or video evidence supplied."])], assessedAt: new Date().toISOString(),
  };
}

export async function createRescueRequest(input: RescueRequestInput): Promise<RescueRequest> {
  const verification = await verifyInput(input);
  const id = `rescue-${Date.now().toString(36)}`;
  const request: RescueRequest = { ...input, id, createdAt: new Date().toISOString(), status: "UNDER_VERIFICATION", verification, assessment: buildAssessment(input, verification.riskLevel), audit: [{ at: new Date().toISOString(), action: "REQUEST_CREATED", actor: "requester", detail: "Citizen rescue request submitted." }, { at: verification.assessedAt, action: "AI_ASSESSMENT_COMPLETED", actor: "resqgrid-verification-engine", detail: `Confidence ${verification.confidence}/100; official evidence is ${verification.status === "VERIFIED" ? "present" : "not conclusive"}.` }] };
  if (verification.status === "VERIFIED") request.status = "VERIFIED";
  requests.set(id, request);
  return request;
}

export async function reverifyRescueRequest(id: string): Promise<RescueRequest | undefined> {
  const request = requests.get(id);
  if (!request) return undefined;
  request.verification = await verifyInput(request);
  request.assessment = buildAssessment(request, request.verification.riskLevel);
  request.status = request.verification.status === "VERIFIED" ? "VERIFIED" : "UNDER_VERIFICATION";
  request.audit.push({ at: new Date().toISOString(), action: "VERIFICATION_REFRESHED", actor: "resqgrid-verification-engine", detail: `Confidence ${request.verification.confidence}/100.` });
  return request;
}

export function getRescueRequest(id: string) { return requests.get(id); }

export function getNearbyRescueRequests(lat: number, lon: number, radiusKm: number) {
  return [...requests.values()].filter((request) => request.status !== "RESOLVED" && distanceKm(lat, lon, request.latitude, request.longitude) <= radiusKm).map((request) => ({ ...request, distanceKm: Math.round(distanceKm(lat, lon, request.latitude, request.longitude) * 10) / 10, contactPhone: undefined }));
}

export function acceptRescueRequest(id: string, volunteerId: string) {
  const request = requests.get(id); const volunteer = volunteers.find((item) => item.id === volunteerId && item.available);
  if (!request || !volunteer) return undefined;
  volunteer.available = false; volunteer.distanceKm = Math.round(distanceKm(request.latitude, request.longitude, volunteer.latitude, volunteer.longitude) * 10) / 10;
  request.assignedVolunteer = volunteer; request.status = "VOLUNTEER_ASSIGNED"; request.audit.push({ at: new Date().toISOString(), action: "VOLUNTEER_ACCEPTED", actor: volunteer.id, detail: `${volunteer.name} accepted voluntarily.` });
  return request;
}

export function updateRescueStatus(id: string, status: RescueRequest["status"], actor = "operator") { const request = requests.get(id); if (!request) return undefined; request.status = status; request.audit.push({ at: new Date().toISOString(), action: "STATUS_CHANGED", actor, detail: `Request moved to ${status}.` }); return request; }

export function getNearbyVolunteers(lat: number, lon: number, radiusKm: number) { return volunteers.filter((volunteer) => volunteer.available).map((volunteer) => ({ ...volunteer, distanceKm: Math.round(distanceKm(lat, lon, volunteer.latitude, volunteer.longitude) * 10) / 10 })).filter((volunteer) => volunteer.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm); }