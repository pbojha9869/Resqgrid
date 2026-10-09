import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bell, ShieldAlert, Waves, CloudRain, RefreshCw, ArrowRight } from "lucide-react";
import { api } from "../api/client";
import { HazardAlert, RiskZone, VulnerableHabitation } from "../types";
import {
  Loading,
  ErrorState,
  EmptyState,
  StatCard,
  SectionHeader,
  PageHeader,
  LocationSearch,
  PickedLocation,
  HazardIcon,
  ScoreBar,
} from "../components/ui";
import DisasterMap from "../components/DisasterMap";
import { formatRelativeTime, getHazardLabel, getRiskLevelColor, getSeverityColor } from "../utils/format";

const REFRESH_MS = 5 * 60 * 1000;
const WEATHER_TYPES = new Set(["HEAVY_RAIN", "THUNDERSTORM", "LIGHTNING", "CYCLONE", "HAILSTORM"]);

export default function Dashboard() {
  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZone[]>([]);
  const [vulnerable, setVulnerable] = useState<VulnerableHabitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<PickedLocation | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [alertsRes, zonesRes, vulnRes] = await Promise.allSettled([
      api.getAlerts(),
      api.getRiskZones(),
      api.getVulnerable(),
    ]);
    if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data);
    if (zonesRes.status === "fulfilled") setRiskZones(zonesRes.value.data);
    if (vulnRes.status === "fulfilled") setVulnerable(vulnRes.value.data);

    const failed = [alertsRes, zonesRes, vulnRes].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setError(failed.reason instanceof Error ? failed.reason.message : "Unable to retrieve live data.");
    else setLastUpdated(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  const floodCount = alerts.filter((a) => a.type === "FLOOD").length;
  const weatherCount = alerts.filter((a) => WEATHER_TYPES.has(a.type)).length;
  const highRiskZones = riskZones.filter((z) => z.riskScore >= 60).length;
  const severeCount = alerts.filter((a) => a.severity === "HIGH" || a.severity === "EXTREME").length;

  // Most severe first, then most recent
  const severityRank = { EXTREME: 0, HIGH: 1, MODERATE: 2, LOW: 3 } as const;
  const topAlerts = [...alerts]
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime()
    )
    .slice(0, 6);

  const statValue = (n: number) => (loading && alerts.length === 0 ? "—" : n);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Real-time hazard monitoring, risk assessment and relocation support for vulnerable habitations."
        actions={
          <>
            {lastUpdated && <span className="text-xs text-slate-500">Updated {formatRelativeTime(lastUpdated).toLowerCase()}</span>}
            <button type="button" onClick={loadData} disabled={loading} className="btn btn-secondary btn-sm">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={loadData} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active alerts"
          value={statValue(alerts.length)}
          sub={`${severeCount} high or extreme`}
          icon={<Bell className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label="High-risk zones"
          value={statValue(highRiskZones)}
          sub={`of ${riskZones.length} monitored zones`}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone="red"
        />
        <StatCard label="Flood alerts" value={statValue(floodCount)} sub="River & flash floods" icon={<Waves className="h-4 w-4" />} tone="sky" />
        <StatCard
          label="Weather warnings"
          value={statValue(weatherCount)}
          sub="Rain, storms & cyclones"
          icon={<CloudRain className="h-4 w-4" />}
          tone="amber"
        />
      </div>

      <section id="overview-map">
        <SectionHeader
          title="National risk overview"
          sub="Active hazards, risk zones and vulnerable habitations"
          action={
            <Link to="/map" className="btn btn-secondary btn-sm">
              Open full map <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="mb-3 max-w-4xl">
          <LocationSearch onLocate={setFocusLocation} placeholder="Jump to a state, district or city…" />
        </div>
        <DisasterMap
          alerts={alerts}
          riskZones={riskZones}
          resources={[]}
          vulnerableHabitats={vulnerable}
          focusLocation={focusLocation}
          height="460px"
        />
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <SectionHeader
            title="Most severe alerts"
            sub="Open-Meteo · GloFAS · USGS · NASA EONET and government sources"
            action={
              <Link to="/alerts" className="btn btn-ghost btn-sm">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {loading && alerts.length === 0 ? (
            <Loading />
          ) : topAlerts.length === 0 ? (
            <EmptyState message="No active alerts reported." />
          ) : (
            <div className="card divide-y divide-slate-100">
              {topAlerts.map((alert) => (
                <Link key={alert.id} to="/alerts" className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <HazardIcon type={alert.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{alert.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {alert.location} · {alert.source} · {formatRelativeTime(alert.issuedAt)}
                    </p>
                  </div>
                  <span className={`badge ${getSeverityColor(alert.severity)}`}>{alert.severity}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            title="Vulnerable habitations"
            sub="Highest-scoring areas right now"
            action={
              <Link to="/risk" className="btn btn-ghost btn-sm">
                Risk analysis <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {loading && vulnerable.length === 0 ? (
            <Loading />
          ) : vulnerable.length === 0 ? (
            <EmptyState message="No vulnerable habitations identified." />
          ) : (
            <div className="card divide-y divide-slate-100">
              {vulnerable.slice(0, 5).map((vh) => (
                <button
                  key={vh.id}
                  onClick={() => {
                    setFocusLocation({ lat: vh.latitude, lon: vh.longitude, name: vh.name });
                    document.getElementById("overview-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  title="Show on map"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{vh.name}</p>
                    <span className={`badge ${getRiskLevelColor(vh.riskLevel)}`}>{vh.riskScore}/100</span>
                  </div>
                  <div className="mt-2">
                    <ScoreBar score={vh.riskScore} />
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                    {vh.primaryHazard && (
                      <>
                        <HazardIcon type={vh.primaryHazard} className="h-3.5 w-3.5" />
                        {getHazardLabel(vh.primaryHazard)} ·{" "}
                      </>
                    )}
                    {vh.recommendedAction}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
