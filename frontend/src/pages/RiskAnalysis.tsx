import { useEffect, useState, useCallback } from "react";
import { Info, ChevronDown } from "lucide-react";
import { api } from "../api/client";
import { RiskZone, VulnerableHabitation, RiskAssessment } from "../types";
import {
  Loading,
  ErrorState,
  EmptyState,
  SectionHeader,
  PageHeader,
  LocationSearch,
  PickedLocation,
  HazardIcon,
  ScoreBar,
  Notice,
} from "../components/ui";
import { getHazardLabel, getRiskLevelColor, getRiskScoreColor, getSeverityColor } from "../utils/format";

const METHODOLOGY = [
  { label: "Hazard", weight: 30, desc: "Active alerts near the location and their severity" },
  { label: "Exposure", weight: 20, desc: "Population exposure to the active hazards" },
  { label: "Vulnerability", weight: 15, desc: "Data gaps and limited shelter access" },
  { label: "Resource access", weight: 15, desc: "Availability of nearby emergency resources" },
  { label: "Infrastructure", weight: 20, desc: "Potential impact on roads, power and buildings" },
];

const ZONES_PREVIEW = 8;

export default function RiskAnalysis() {
  const [riskZones, setRiskZones] = useState<RiskZone[]>([]);
  const [vulnerable, setVulnerable] = useState<VulnerableHabitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showAllZones, setShowAllZones] = useState(false);
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [zonesRes, vulnRes] = await Promise.all([api.getRiskZones(), api.getVulnerable()]);
      setRiskZones(zonesRes.data);
      setVulnerable(vulnRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retrieve live data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 300000);
    return () => clearInterval(interval);
  }, [loadData]);

  const assess = async (loc: PickedLocation) => {
    setAssessing(true);
    setAssessError(null);
    try {
      const res = await api.getRisk(loc.name, loc.lat, loc.lon);
      setAssessment(res.data);
    } catch (err) {
      setAssessment(null);
      setAssessError(err instanceof Error ? err.message : "Risk assessment failed.");
    } finally {
      setAssessing(false);
    }
  };

  const zones = showAllZones ? riskZones : riskZones.slice(0, ZONES_PREVIEW);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Risk Analysis"
        description="The ResQGrid Risk Index — an explainable 0–100 score for any location in India."
        actions={
          <button onClick={() => setShowMethodology(!showMethodology)} className="btn btn-secondary btn-sm" aria-expanded={showMethodology}>
            <Info className="h-3.5 w-3.5" />
            How is this calculated?
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMethodology ? "rotate-180" : ""}`} />
          </button>
        }
      />

      {showMethodology && (
        <div className="card p-5">
          <h3 className="font-semibold">Methodology</h3>
          <p className="mt-1 text-sm text-slate-500">Five weighted factors combine into a 0–100 score.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {METHODOLOGY.map((m) => (
              <div key={m.label} className="panel p-3">
                <p className="text-xl font-semibold tabular-nums">{m.weight}%</p>
                <p className="mt-1 text-sm font-medium">{m.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{m.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {(["LOW", "MODERATE", "HIGH", "VERY HIGH", "CRITICAL"] as const).map((l, i) => (
              <span key={l} className={`badge ${getRiskLevelColor(l)}`}>
                {i * 20 + (i ? 1 : 0)}–{(i + 1) * 20} {l}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">This is a ResQGrid estimate, not an official government risk classification.</p>
        </div>
      )}

      {/* Location assessment */}
      <section className="card p-5">
        <h2 className="text-base font-semibold">Assess a location</h2>
        <p className="mb-3 mt-0.5 text-sm text-slate-500">Scores hazards active within 150 km of the place you search.</p>
        <LocationSearch onLocate={assess} buttonLabel="Assess" placeholder="Search a village, town or district…" />
        {assessing && <Loading message="Calculating risk assessment…" />}
        {assessError && (
          <div className="mt-3">
            <ErrorState message={assessError} />
          </div>
        )}
        {assessment && !assessing && (
          <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <p className="eyebrow">ResQGrid Risk Index</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{assessment.location}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className={`text-5xl font-semibold tabular-nums ${getRiskScoreColor(assessment.riskScore)}`}>
                  {assessment.riskScore}
                </span>
                <span className="text-slate-400">/100</span>
              </div>
              <span className={`badge mt-2 ${getRiskLevelColor(assessment.riskLevel)}`}>{assessment.riskLevel}</span>
              <div className="mt-3">
                <ScoreBar score={assessment.riskScore} />
              </div>
              {assessment.primaryHazard && (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <HazardIcon type={assessment.primaryHazard} /> Primary hazard: {getHazardLabel(assessment.primaryHazard)}
                </p>
              )}
            </div>
            <div className="space-y-4">
              {assessment.factors.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Contributing factors</p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {assessment.factors.map((factor, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{factor.label}</p>
                          {factor.description && <p className="text-xs text-slate-500">{factor.description}</p>}
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-700">+{factor.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {assessment.activeAlerts.length > 0 ? (
                <div>
                  <p className="eyebrow mb-2">Nearby active alerts ({assessment.activeAlerts.length})</p>
                  <ul className="space-y-1.5">
                    {assessment.activeAlerts.slice(0, 6).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-slate-700">
                          <HazardIcon type={a.type} className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{a.title}</span>
                        </span>
                        <span className={`badge ${getSeverityColor(a.severity)}`}>{a.severity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Notice>No active hazard alerts within 150 km. The score reflects baseline vulnerability and data gaps only.</Notice>
              )}
            </div>
          </div>
        )}
      </section>

      {error && <ErrorState message={error} onRetry={loadData} />}

      <section>
        <SectionHeader
          title="Identified high-risk zones"
          sub={`${riskZones.length} zones derived from active hazards, highest risk first`}
          action={
            riskZones.length > ZONES_PREVIEW && (
              <button onClick={() => setShowAllZones(!showAllZones)} className="btn btn-ghost btn-sm">
                {showAllZones ? "Show fewer" : `Show all ${riskZones.length}`}
              </button>
            )
          }
        />
        {loading && riskZones.length === 0 ? (
          <Loading />
        ) : riskZones.length === 0 ? (
          <EmptyState message="No high-risk zones identified." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {zones.map((zone) => (
              <div key={zone.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{zone.name}</h3>
                    {zone.district && <p className="truncate text-xs text-slate-500">{zone.district}</p>}
                  </div>
                  <span className={`text-xl font-semibold tabular-nums ${getRiskScoreColor(zone.riskScore)}`}>{zone.riskScore}</span>
                </div>
                <div className="mt-3">
                  <ScoreBar score={zone.riskScore} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                  {zone.primaryHazard ? (
                    <span className="flex items-center gap-1.5">
                      <HazardIcon type={zone.primaryHazard} className="h-3.5 w-3.5" />
                      {getHazardLabel(zone.primaryHazard)}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className={`badge ${getRiskLevelColor(zone.riskLevel)}`}>{zone.riskLevel}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Vulnerable habitations" sub="Areas requiring attention based on risk assessment" />
        {loading && vulnerable.length === 0 ? (
          <Loading />
        ) : vulnerable.length === 0 ? (
          <EmptyState message="No vulnerable habitations identified." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Habitation</th>
                  <th className="px-4 py-2.5 font-medium">Hazard</th>
                  <th className="px-4 py-2.5 font-medium">Score</th>
                  <th className="px-4 py-2.5 font-medium">Recommended action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vulnerable.map((vh) => (
                  <tr key={vh.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{vh.name}</p>
                      <p className="text-xs text-slate-500">
                        {[vh.district, vh.state].filter(Boolean).join(", ") || vh.populationExposure}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {vh.primaryHazard && (
                        <span className="flex items-center gap-1.5">
                          <HazardIcon type={vh.primaryHazard} className="h-3.5 w-3.5" />
                          {getHazardLabel(vh.primaryHazard)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${getRiskLevelColor(vh.riskLevel)}`}>
                        {vh.riskScore} · {vh.riskLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{vh.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
