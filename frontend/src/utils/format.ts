import { RiskLevel, Severity, HazardType } from "../types";

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "Unknown";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 0) return formatDateTime(isoString);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return "Unknown";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Title-cases an UPPER_SNAKE enum value: "HEAVY_RAIN" → "Heavy Rain". */
export function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/*
 * One five-step scale is shared by severities, risk levels and scores so the
 * same colour always means the same thing across the app and the map.
 */
type Tone = "red" | "orange" | "amber" | "sky" | "emerald" | "slate";

const TONE_BADGE: Record<Tone, string> = {
  red: "bg-red-50 text-red-700 border-red-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  slate: "bg-slate-50 text-slate-600 border-slate-200",
};

const TONE_DOT: Record<Tone, string> = {
  red: "bg-red-600",
  orange: "bg-orange-500",
  amber: "bg-amber-400",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  slate: "bg-slate-400",
};

const TONE_TEXT: Record<Tone, string> = {
  red: "text-red-600",
  orange: "text-orange-600",
  amber: "text-amber-600",
  sky: "text-sky-600",
  emerald: "text-emerald-600",
  slate: "text-slate-600",
};

export const TONE_HEX: Record<Tone, string> = {
  red: "#dc2626",
  orange: "#f97316",
  amber: "#f59e0b",
  sky: "#0ea5e9",
  emerald: "#10b981",
  slate: "#94a3b8",
};

function severityTone(severity: Severity): Tone {
  switch (severity) {
    case "EXTREME":
      return "red";
    case "HIGH":
      return "orange";
    case "MODERATE":
      return "amber";
    case "LOW":
      return "emerald";
    default:
      return "slate";
  }
}

function riskLevelTone(level: RiskLevel): Tone {
  switch (level) {
    case "CRITICAL":
      return "red";
    case "VERY HIGH":
      return "orange";
    case "HIGH":
      return "amber";
    case "MODERATE":
      return "sky";
    case "LOW":
      return "emerald";
    default:
      return "slate";
  }
}

function scoreTone(score: number): Tone {
  if (score <= 20) return "emerald";
  if (score <= 40) return "sky";
  if (score <= 60) return "amber";
  if (score <= 80) return "orange";
  return "red";
}

export const getSeverityColor = (severity: Severity) => TONE_BADGE[severityTone(severity)];
export const getSeverityDot = (severity: Severity) => TONE_DOT[severityTone(severity)];
export const getSeverityHex = (severity: string) => TONE_HEX[severityTone(severity as Severity)];

export const getRiskLevelColor = (level: RiskLevel) => TONE_BADGE[riskLevelTone(level)];
export const getRiskLevelHex = (level: string) => TONE_HEX[riskLevelTone(level as RiskLevel)];

export const getRiskScoreColor = (score: number) => TONE_TEXT[scoreTone(score)];
export const getRiskBarColor = (score: number) => TONE_DOT[scoreTone(score)];

export function getHazardLabel(type: HazardType): string {
  return humanize(type);
}

export function getResourceTypeLabel(type: string): string {
  return humanize(type);
}

export function getResourceTypeColor(type: string): string {
  switch (type) {
    case "HOSPITAL":
    case "AMBULANCE":
      return TONE_BADGE.red;
    case "FIRE_STATION":
      return TONE_BADGE.orange;
    case "POLICE_STATION":
      return TONE_BADGE.sky;
    case "SHELTER":
    case "RELIEF_CENTER":
      return TONE_BADGE.emerald;
    case "RESCUE_TEAM":
      return "bg-violet-50 text-violet-700 border-violet-200";
    default:
      return TONE_BADGE.slate;
  }
}

export function getResourceHex(type: string): string {
  switch (type) {
    case "HOSPITAL":
    case "AMBULANCE":
      return "#dc2626";
    case "FIRE_STATION":
      return "#f97316";
    case "POLICE_STATION":
      return "#0ea5e9";
    case "SHELTER":
    case "RELIEF_CENTER":
      return "#10b981";
    case "RESCUE_TEAM":
      return "#8b5cf6";
    default:
      return "#64748b";
  }
}

/** Legend rows shared by the map overlay and the Risk Map page. */
export const SEVERITY_LEGEND = (["EXTREME", "HIGH", "MODERATE", "LOW"] as Severity[]).map((s) => ({
  label: humanize(s),
  hex: getSeverityHex(s),
}));

export const RISK_LEVEL_LEGEND = (["CRITICAL", "VERY HIGH", "HIGH", "MODERATE", "LOW"] as RiskLevel[]).map((l) => ({
  label: humanize(l),
  hex: getRiskLevelHex(l),
}));
