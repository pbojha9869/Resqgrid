import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { Siren, Route as RouteIcon, ShieldCheck, Clock, MapPin, UserCheck, CircleCheck, Copy, RotateCcw, Star } from "lucide-react";
import { api } from "../api/client";
import type { EvacPlan, HazardAlert } from "../types";
import { Loading, ErrorState, PageHeader, LocationSearch } from "../components/ui";
import { BASEMAP } from "../components/DisasterMap";

/** Fit map to all route geometries whenever the plan changes. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [30, 30] });
  }, [points, map]);
  return null;
}

const scoreHex = (s: number) => (s >= 80 ? "#10b981" : s >= 55 ? "#f59e0b" : "#dc2626");
const RISK_BADGE = {
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MODERATE: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-red-50 text-red-700 border-red-200",
} as const;

interface Approval {
  officerName: string;
  officerId: string;
  approvedAt: string;
}

const APPROVALS_KEY = "resq-evac-approvals";
const CLEARED_KEY = "resq-evac-cleared";

function readStore<T>(key: string): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {} as T;
  }
}

function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — state still lives in memory */
  }
}

function StepTitle({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">{n}</span>
      {icon}
      {children}
    </h3>
  );
}

export default function Evacuation() {
  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [originMode, setOriginMode] = useState<"alert" | "search">("alert");
  const [selectedAlertId, setSelectedAlertId] = useState<string>("");
  const [center, setCenter] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [plan, setPlan] = useState<EvacPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Officer supervision state (persisted per-browser)
  const [officerName, setOfficerName] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [approval, setApproval] = useState<Record<string, Approval>>(() => readStore(APPROVALS_KEY));
  const [cleared, setCleared] = useState<Record<string, string>>(() => readStore(CLEARED_KEY));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    api
      .getAlerts()
      .then((res) => setAlerts(res.data.filter((a) => a.latitude !== undefined && a.longitude !== undefined)))
      .catch(() => setOriginMode("search"));
  }, []);

  const persistApproval = (next: Record<string, Approval>) => {
    setApproval(next);
    writeStore(APPROVALS_KEY, next);
  };
  const persistCleared = (next: Record<string, string>) => {
    setCleared(next);
    writeStore(CLEARED_KEY, next);
  };

  const switchMode = (mode: "alert" | "search") => {
    setOriginMode(mode);
    setCenter(null);
    setSelectedAlertId("");
    setPlanError(null);
  };

  const generate = useCallback(async () => {
    if (!center) {
      setPlanError(originMode === "alert" ? "Select an active alert first." : "Search for the disaster location first.");
      return;
    }
    setLoading(true);
    setPlanError(null);
    try {
      const res = await api.getEvacuationPlan(center.lat, center.lon, radiusKm);
      setPlan(res.data);
    } catch (err) {
      setPlan(null);
      setPlanError(err instanceof Error ? err.message : "Failed to compute evacuation routes.");
    } finally {
      setLoading(false);
    }
  }, [center, originMode, radiusKm]);

  const recommended = useMemo(() => plan?.routes.find((r) => r.id === plan.recommendedId) ?? null, [plan]);
  const allPoints = useMemo<[number, number][]>(() => {
    if (!plan) return [];
    const pts: [number, number][] = [[plan.originLat, plan.originLon]];
    plan.routes.forEach((r) => pts.push(...r.geometry));
    return pts;
  }, [plan]);

  const copyBriefing = async () => {
    if (!plan || !recommended) return;
    const appr = approval[recommended.id];
    const lines = [
      "RESQGRID EVACUATION BRIEFING",
      "============================",
      `Generated: ${new Date(plan.generatedAt).toLocaleString("en-IN")}`,
      `Origin: ${plan.originName || center?.name || `${plan.originLat.toFixed(4)}, ${plan.originLon.toFixed(4)}`}`,
      "",
      `RECOMMENDED ROUTE -> ${recommended.destinationName}`,
      `Safety Score: ${recommended.safetyScore}/100 (${recommended.riskLevel} risk)`,
      `Distance: ${recommended.distanceKm} km · Est. drive time: ${recommended.durationMin} min`,
      "",
      "RISK FACTORS:",
      ...recommended.factors.map((f) => ` - ${f.label}: -${f.penalty} pts (${f.note})`),
      "",
      `CHECKPOINTS (${recommended.checkpoints.length}):`,
      ...recommended.checkpoints.map(
        (cp) => ` - ${cp.name}${cleared[cp.id] ? ` — CLEARED ${new Date(cleared[cp.id]).toLocaleTimeString("en-IN")}` : ""}`
      ),
      "",
      appr
        ? `APPROVED BY: ${appr.officerName} (ID: ${appr.officerId}) at ${new Date(appr.approvedAt).toLocaleString("en-IN")}`
        : "STATUS: AWAITING OFFICER APPROVAL",
      "",
      `Data sources: ${plan.dataSources.join(", ")}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2500);
  };

  const clearedCount = recommended ? recommended.checkpoints.filter((cp) => cleared[cp.id]).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evacuation Planner"
        description="Safest corridor selection scored against live hazard, rainfall and elevation feeds."
      />

      {/* Step 1 — origin & radius */}
      <div className="card p-5">
        <StepTitle n={1} icon={<Siren className="h-4 w-4 text-red-500" />}>
          Disaster origin
        </StepTitle>
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 p-0.5">
          {(["alert", "search"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                originMode === m ? "bg-emerald-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {m === "alert" ? "From active alerts" : "Search location"}
            </button>
          ))}
        </div>

        {originMode === "alert" ? (
          alerts.length === 0 ? (
            <p className="text-sm text-slate-500">No geo-tagged active alerts right now — use search instead.</p>
          ) : (
            <select
              className="input"
              value={selectedAlertId}
              onChange={(e) => {
                setSelectedAlertId(e.target.value);
                const a = alerts.find((x) => x.id === e.target.value);
                setCenter(a ? { lat: a.latitude!, lon: a.longitude!, name: a.location } : null);
              }}
            >
              <option value="">Select an active alert…</option>
              {alerts.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.severity}] {a.title}
                </option>
              ))}
            </select>
          )
        ) : (
          <LocationSearch
            onLocate={(loc) => setCenter(loc)}
            buttonLabel="Set origin"
            placeholder="Village, town or district in danger…"
          />
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="label" htmlFor="evac-radius">
              Relief-centre search radius
            </label>
            <select id="evac-radius" className="input w-36" value={radiusKm} onChange={(e) => setRadiusKm(parseInt(e.target.value))}>
              {[10, 15, 25, 40].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </div>
          <button onClick={generate} disabled={loading} className="btn btn-primary">
            <RouteIcon className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
            {loading ? "Computing safest routes…" : "Compute safest routes"}
          </button>
        </div>
        {center && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-red-500" />
            Origin: <span className="font-medium text-slate-700">{center.name}</span> ({center.lat.toFixed(3)}, {center.lon.toFixed(3)})
          </p>
        )}
      </div>

      {planError && <ErrorState message={planError} onRetry={center ? generate : undefined} />}
      {loading && <Loading message="Sampling corridors against live hazards, rainfall and elevation…" />}

      {plan && plan.routes.length > 0 && !loading && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div>
              <StepTitle n={2} icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}>
                Ranked safe corridors
              </StepTitle>
              <div className="space-y-3">
                {plan.routes.map((route) => {
                  const isRec = route.id === plan.recommendedId;
                  const appr = approval[route.id];
                  const hex = scoreHex(route.safetyScore);
                  return (
                    <div key={route.id} className={`card p-4 ${isRec ? "card-selected" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {isRec && (
                            <span className="badge mb-1.5 border-emerald-600 bg-emerald-600 text-white">
                              <Star className="h-3 w-3" /> Recommended
                            </span>
                          )}
                          <h4 className="text-sm font-semibold leading-snug">{route.destinationName}</h4>
                        </div>
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
                          style={{ color: hex, border: `2px solid ${hex}` }}
                          title="Safety score (higher is safer)"
                        >
                          {route.safetyScore}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {route.distanceKm} km
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> ~{route.durationMin} min
                        </span>
                        <span className={`badge ${RISK_BADGE[route.riskLevel]}`}>{route.riskLevel} risk</span>
                      </div>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">Why this score?</summary>
                        <ul className="mt-2 space-y-1 text-xs text-slate-500">
                          {route.factors.map((f) => (
                            <li key={f.label}>
                              <span className="font-medium text-slate-700">{f.label}</span> (−{f.penalty}): {f.note}
                            </li>
                          ))}
                        </ul>
                      </details>

                      <p className="mt-3 text-xs">
                        {appr ? (
                          <span className="flex items-center gap-1 text-emerald-700">
                            <CircleCheck className="h-3.5 w-3.5" /> Approved by {appr.officerName} ·{" "}
                            {new Date(appr.approvedAt).toLocaleTimeString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-slate-400">Awaiting officer approval</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Map */}
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <RouteIcon className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold">Evacuation map</h3>
                <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1 w-4 rounded bg-emerald-500" /> Recommended
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-4 rounded bg-slate-400" /> Alternates
                  </span>
                </span>
              </div>
              <MapContainer center={[plan.originLat, plan.originLon]} zoom={10} style={{ height: "520px", width: "100%" }} scrollWheelZoom>
                <TileLayer attribution={BASEMAP.attribution} url={BASEMAP.url} />
                <FitBounds points={allPoints} />

                {plan.routes.map((route) => {
                  const isRec = route.id === plan.recommendedId;
                  return (
                    <Polyline
                      key={route.id}
                      positions={route.geometry}
                      pathOptions={{
                        color: isRec ? "#10b981" : "#94a3b8",
                        weight: isRec ? 5 : 3,
                        opacity: isRec ? 0.95 : 0.7,
                        dashArray: isRec ? undefined : "6,8",
                      }}
                    >
                      <Popup>
                        <b>
                          {isRec ? "★ " : ""}
                          {route.destinationName}
                        </b>
                        <br />
                        Safety {route.safetyScore}/100 ({route.riskLevel}) · {route.distanceKm} km · ~{route.durationMin} min
                      </Popup>
                    </Polyline>
                  );
                })}

                <CircleMarker
                  center={[plan.originLat, plan.originLon]}
                  radius={9}
                  pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.9, weight: 2 }}
                >
                  <Popup>
                    <b>Disaster origin</b>
                    <br />
                    {plan.originName || center?.name || `${plan.originLat.toFixed(4)}, ${plan.originLon.toFixed(4)}`}
                  </Popup>
                </CircleMarker>

                {plan.routes.map((route) => (
                  <Fragment key={`m-${route.id}`}>
                    <CircleMarker
                      center={[route.destinationLat, route.destinationLon]}
                      radius={7}
                      pathOptions={{ color: "#ffffff", fillColor: "#10b981", fillOpacity: 1, weight: 2 }}
                    >
                      <Popup>
                        <b>Relief centre</b>
                        <br />
                        {route.destinationName}
                      </Popup>
                    </CircleMarker>
                    {(route.id === plan.recommendedId ? route.checkpoints : []).map((cp) => (
                      <CircleMarker
                        key={cp.id}
                        center={[cp.lat, cp.lon]}
                        radius={5}
                        pathOptions={{
                          color: "#ffffff",
                          fillColor: cleared[cp.id] ? "#10b981" : "#0ea5e9",
                          fillOpacity: 1,
                          weight: 2,
                        }}
                      >
                        <Popup>
                          <b>{cleared[cp.id] ? "✔ Cleared" : "Checkpoint"}</b>
                          <br />
                          {cp.name}
                        </Popup>
                      </CircleMarker>
                    ))}
                  </Fragment>
                ))}
              </MapContainer>
            </div>
          </div>

          {/* Step 3 — government officer supervision */}
          {recommended && (
            <div className="card p-5">
              <StepTitle n={3} icon={<UserCheck className="h-4 w-4 text-slate-500" />}>
                Government officer supervision
              </StepTitle>

              {!approval[recommended.id] ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="label" htmlFor="officer-name">
                      Evacuation officer name
                    </label>
                    <input
                      id="officer-name"
                      className="input"
                      value={officerName}
                      onChange={(e) => setOfficerName(e.target.value)}
                      placeholder="e.g. R. Sharma, ADM"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="label" htmlFor="officer-id">
                      Officer / badge ID
                    </label>
                    <input
                      id="officer-id"
                      className="input"
                      value={officerId}
                      onChange={(e) => setOfficerId(e.target.value)}
                      placeholder="e.g. NDMA-2214"
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={!officerName.trim() || !officerId.trim()}
                    onClick={() =>
                      persistApproval({
                        ...approval,
                        [recommended.id]: {
                          officerName: officerName.trim(),
                          officerId: officerId.trim(),
                          approvedAt: new Date().toISOString(),
                        },
                      })
                    }
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Approve plan
                  </button>
                </div>
              ) : (
                <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Plan approved by {approval[recommended.id].officerName} (ID: {approval[recommended.id].officerId}) at{" "}
                  {new Date(approval[recommended.id].approvedAt).toLocaleString("en-IN")}. Checkpoint sweeps are unlocked.
                </p>
              )}

              {/* Checkpoint clearance log */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="eyebrow">Checkpoint clearance — {recommended.destinationName}</h4>
                  <span className="text-xs tabular-nums text-slate-500">
                    {clearedCount}/{recommended.checkpoints.length} cleared
                  </span>
                </div>
                {recommended.checkpoints.length === 0 ? (
                  <p className="text-xs text-slate-500">Short corridor — no intermediate checkpoints required.</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {recommended.checkpoints.map((cp) => {
                      const done = !!cleared[cp.id];
                      const locked = !approval[recommended.id];
                      return (
                        <div key={cp.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${done ? "bg-emerald-50/50" : ""}`}>
                          <div className="flex min-w-0 items-center gap-2 text-xs">
                            <MapPin className={`h-3.5 w-3.5 shrink-0 ${done ? "text-emerald-600" : "text-sky-500"}`} />
                            <span className="truncate text-slate-700">{cp.name}</span>
                            {done ? (
                              <span className="shrink-0 text-emerald-700">cleared {new Date(cleared[cp.id]).toLocaleTimeString("en-IN")}</span>
                            ) : (
                              <span className="hidden text-slate-400 sm:inline">awaiting field-team sweep</span>
                            )}
                          </div>
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={done || locked}
                            title={locked ? "Approve the plan first" : "Mark checkpoint as cleared"}
                            onClick={() => persistCleared({ ...cleared, [cp.id]: new Date().toISOString() })}
                          >
                            {done ? "Cleared" : "Mark cleared"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${recommended.checkpoints.length ? (clearedCount / recommended.checkpoints.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={copyBriefing} className="btn btn-secondary btn-sm">
                  <Copy className="h-3.5 w-3.5" />
                  {copyState === "copied" ? "Briefing copied" : copyState === "failed" ? "Copy failed — clipboard blocked" : "Copy officer briefing"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={clearedCount === 0}
                  onClick={() => {
                    const next = { ...cleared };
                    recommended.checkpoints.forEach((cp) => delete next[cp.id]);
                    persistCleared(next);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset checkpoints
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {plan && plan.routes.length === 0 && !loading && (
        <ErrorState message="No drivable evacuation corridor found. Try a wider radius." />
      )}
    </div>
  );
}
