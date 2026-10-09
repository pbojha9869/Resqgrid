import { HazardAlert, RiskAssessment, RiskFactor, RiskLevel, HazardType } from "../types.js";

const SEVERITY_WEIGHTS: Record<string, number> = {
  LOW: 10,
  MODERATE: 25,
  HIGH: 45,
  EXTREME: 70,
};

const HAZARD_WEIGHTS: Record<HazardType, number> = {
  FLOOD: 30,
  HEAVY_RAIN: 20,
  THUNDERSTORM: 15,
  LIGHTNING: 15,
  CYCLONE: 35,
  EARTHQUAKE: 40,
  HEAT_WAVE: 20,
  LANDSLIDE: 30,
  COLD_WAVE: 15,
  FOG: 10,
  HAILSTORM: 15,
  DROUGHT: 20,
  OTHER: 10,
};

function getRiskLevel(score: number): RiskLevel {
  if (score <= 20) return "LOW";
  if (score <= 40) return "MODERATE";
  if (score <= 60) return "HIGH";
  if (score <= 80) return "VERY HIGH";
  return "CRITICAL";
}

function calculateHazardScore(alerts: HazardAlert[]): { score: number; factors: RiskFactor[]; primary?: HazardType; secondary?: HazardType } {
  if (alerts.length === 0) {
    return {
      score: 0,
      factors: [{ label: "No Active Hazards", score: 0, weight: 0.3, description: "No government alerts currently active" }],
    };
  }

  // Group by hazard type
  const hazardGroups = new Map<HazardType, HazardAlert[]>();
  for (const alert of alerts) {
    const existing = hazardGroups.get(alert.type) || [];
    existing.push(alert);
    hazardGroups.set(alert.type, existing);
  }

  // Sort by max severity
  const sorted = [...hazardGroups.entries()].sort((a, b) => {
    const maxA = Math.max(...a[1].map((x) => SEVERITY_WEIGHTS[x.severity]));
    const maxB = Math.max(...b[1].map((x) => SEVERITY_WEIGHTS[x.severity]));
    return maxB - maxA;
  });

  const primary = sorted[0]?.[0];
  const secondary = sorted[1]?.[0];

  const factors: RiskFactor[] = [];
  let totalScore = 0;

  for (const [type, typeAlerts] of sorted.slice(0, 3)) {
    const maxSeverity = Math.max(...typeAlerts.map((a) => SEVERITY_WEIGHTS[a.severity]));
    const hazardWeight = HAZARD_WEIGHTS[type];
    const score = Math.min(100, maxSeverity + hazardWeight);
    totalScore += score * 0.3;
    factors.push({
      label: `${type.replace("_", " ")} Warning`,
      score,
      weight: 0.3,
      description: `${typeAlerts.length} active alert(s) from ${typeAlerts[0].source}`,
    });
  }

  return {
    score: Math.min(100, totalScore),
    factors,
    primary,
    secondary,
  };
}

function calculateExposureScore(alerts: HazardAlert[], hasPopulationData: boolean): { score: number; factors: RiskFactor[] } {
  const highSeverityCount = alerts.filter((a) => a.severity === "HIGH" || a.severity === "EXTREME").length;
  const score = Math.min(100, highSeverityCount * 20 + (alerts.length > 0 ? 10 : 0));

  return {
    score,
    factors: [
      {
        label: "Population Exposure",
        score,
        weight: 0.2,
        description: hasPopulationData
          ? "Based on active high-severity alerts in the area"
          : "Population data unavailable - estimated from alert severity",
      },
    ],
  };
}

function calculateVulnerabilityScore(hasPopulationData: boolean, hasShelterAccess: boolean): { score: number; factors: RiskFactor[] } {
  let score = 0;
  const factors: RiskFactor[] = [];

  if (!hasPopulationData) {
    score += 30;
    factors.push({
      label: "Population Data Gap",
      score: 30,
      weight: 0.15,
      description: "Exact population data unavailable - increased uncertainty",
    });
  }

  if (!hasShelterAccess) {
    score += 20;
    factors.push({
      label: "Limited Shelter Access",
      score: 20,
      weight: 0.15,
      description: "No nearby shelter identified",
    });
  }

  if (factors.length === 0) {
    factors.push({
      label: "Vulnerability",
      score: 20,
      weight: 0.15,
      description: "Standard vulnerability baseline",
    });
    score = 20;
  }

  return { score: Math.min(100, score), factors };
}

function calculateResourceAccessScore(resourceCount: number): { score: number; factors: RiskFactor[] } {
  // Fewer resources = higher risk
  const score = Math.max(0, 100 - resourceCount * 15);
  return {
    score,
    factors: [
      {
        label: "Resource Accessibility",
        score,
        weight: 0.15,
        description: resourceCount > 0
          ? `${resourceCount} emergency resource(s) identified nearby`
          : "No emergency resources identified nearby",
      },
    ],
  };
}

function calculateInfrastructureScore(hasAlerts: boolean): { score: number; factors: RiskFactor[] } {
  const score = hasAlerts ? 50 : 20;
  return {
    score,
    factors: [
      {
        label: "Infrastructure Risk",
        score,
        weight: 0.2,
        description: hasAlerts
          ? "Active hazards may impact infrastructure"
          : "No active hazards affecting infrastructure",
      },
    ],
  };
}

export function calculateRisk(
  location: string,
  alerts: HazardAlert[],
  options?: {
    state?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
    hasPopulationData?: boolean;
    hasShelter?: boolean;
    resourceCount?: number;
  }
): RiskAssessment {
  const hasPopulationData = options?.hasPopulationData ?? false;
  const hasShelter = options?.hasShelter ?? false;
  const resourceCount = options?.resourceCount ?? 0;

  const hazard = calculateHazardScore(alerts);
  const exposure = calculateExposureScore(alerts, hasPopulationData);
  const vulnerability = calculateVulnerabilityScore(hasPopulationData, hasShelter);
  const resource = calculateResourceAccessScore(resourceCount);
  const infrastructure = calculateInfrastructureScore(alerts.length > 0);

  const allFactors = [
    ...hazard.factors,
    ...exposure.factors,
    ...vulnerability.factors,
    ...resource.factors,
    ...infrastructure.factors,
  ];

  // Weighted combination
  const totalScore = Math.min(
    100,
    Math.round(
      hazard.score * 0.3 +
      exposure.score * 0.2 +
      vulnerability.score * 0.15 +
      resource.score * 0.15 +
      infrastructure.score * 0.2
    )
  );

  return {
    location,
    state: options?.state,
    district: options?.district,
    latitude: options?.latitude,
    longitude: options?.longitude,
    riskScore: totalScore,
    riskLevel: getRiskLevel(totalScore),
    primaryHazard: hazard.primary,
    secondaryHazard: hazard.secondary,
    factors: allFactors,
    activeAlerts: alerts,
    calculatedAt: new Date().toISOString(),
  };
}

export function getRiskLevelFromScore(score: number): RiskLevel {
  return getRiskLevel(score);
}