import { useEffect, useState, useCallback } from "react";
import { Check, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { HazardAlert, RiskZone, VulnerableHabitation, EmergencyResource } from "../types";
import { ErrorState, PageHeader, LocationSearch, PickedLocation, Notice, HazardIcon } from "../components/ui";
import DisasterMap from "../components/DisasterMap";
import {
  getHazardLabel,
  getRiskLevelColor,
  getSeverityColor,
  RISK_LEVEL_LEGEND,
  SEVERITY_LEGEND,
  getResourceHex,
  getResourceTypeLabel,
} from "../utils/format";

const RESOURCE_TYPES = ["HOSPITAL", "FIRE_STATION", "POLICE_STATION", "SHELTER", "RELIEF_CENTER", "RESCUE_TEAM"];

export default function RiskMap() {
  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZone[]>([]);
  const [vulnerable, setVulnerable] = useState<VulnerableHabitation[]>([]);
  const [resources, setResources] = useState<EmergencyResource[]>([]);
  const [resourceState, setResourceState] = useState<{ loading: boolean; error: string | null; near?: string }>({
    loading: false,
    error: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<PickedLocation | null>(null);
  const [selectedZone, setSelectedZone] = useState<RiskZone | null>(null);

  const [layers, setLayers] = useState({ alerts: true, zones: true, vulnerable: true, resources: false });

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [alertsRes, zonesRes, vulnRes] = await Promise.all([api.getAlerts(), api.getRiskZones(), api.getVulnerable()]);
      setAlerts(alertsRes.data);
      setRiskZones(zonesRes.data);
      setVulnerable(vulnRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retrieve live data.");
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 300000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Resources are fetched lazily — only when the layer is on — around the
  // searched location, or the highest-risk zone when nothing was searched.
  const resourceCenter = focusLocation ?? (riskZones[0] && { lat: riskZones[0].latitude, lon: riskZones[0].longitude, name: riskZones[0].name });
  const centerKey = resourceCenter ? `${resourceCenter.lat.toFixed(3)},${resourceCenter.lon.toFixed(3)}` : "";

  useEffect(() => {
    if (!layers.resources || !resourceCenter) return;
    let cancelled = false;
    const near = resourceCenter.name;
    setResourceState({ loading: true, error: null, near });
    (async () => {
      try {
        const res = await api.getResources(resourceCenter.lat, resourceCenter.lon, 25);
        if (cancelled) return;
        setResources(res.data);
        setResourceState({ loading: false, error: null, near });
      } catch (err) {
        if (cancelled) return;
        setResourceState({ loading: false, error: err instanceof Error ? err.message : "Resource lookup failed.", near });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layers.resources, centerKey]);

  const layerControls = [
    { key: "alerts" as const, label: "Hazard alerts", count: alerts.length },
    { key: "zones" as const, label: "Risk zones", count: riskZones.length },
    { key: "vulnerable" as const, label: "Vulnerable habitations", count: vulnerable.length },
    { key: "resources" as const, label: "Emergency resources", count: layers.resources ? resources.length : undefined },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Risk Map" description="Interactive hazard and risk visualisation. Click a risk zone for details." />

      <div className="card space-y-3 p-4">
        <LocationSearch onLocate={setFocusLocation} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-slate-500">Layers</span>
          {layerControls.map((layer) => {
            const on = layers[layer.key];
            return (
              <button
                key={layer.key}
                onClick={() => setLayers((l) => ({ ...l, [layer.key]: !l[layer.key] }))}
                className={`chip ${on ? "chip-active" : ""}`}
                aria-pressed={on}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                {layer.label}
                {layer.count !== undefined && <span className={on ? "text-emerald-100" : "text-slate-400"}>{layer.count}</span>}
              </button>
            );
          })}
        </div>
        {layers.resources && resourceState.loading && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading emergency resources near {resourceState.near}…
          </p>
        )}
        {layers.resources && !resourceState.loading && !resourceState.error && resourceState.near && (
          <p className="text-xs text-slate-500">
            Showing {resources.length} emergency resources within 25 km of {resourceState.near}.
          </p>
        )}
        {layers.resources && resourceState.error && <Notice tone="warning">{resourceState.error}</Notice>}
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <DisasterMap
          alerts={alerts}
          riskZones={riskZones}
          resources={resources}
          vulnerableHabitats={vulnerable}
          showAlerts={layers.alerts}
          showRiskZones={layers.zones}
          showResources={layers.resources}
          showVulnerable={layers.vulnerable}
          focusLocation={focusLocation}
          onSelectZone={setSelectedZone}
          height="620px"
        />

        <aside className="space-y-4">
          {selectedZone ? (
            <div className="card">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="eyebrow">Risk zone</p>
                  <h3 className="mt-0.5 font-semibold leading-snug">{selectedZone.name}</h3>
                  {selectedZone.district && <p className="text-xs text-slate-500">{selectedZone.district} district</p>}
                </div>
                <button onClick={() => setSelectedZone(null)} className="btn btn-ghost btn-sm -mr-2">
                  Close
                </button>
              </div>
              <div className="space-y-3 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold tabular-nums">{selectedZone.riskScore}</span>
                  <span className="text-slate-400">/100</span>
                  <span className={`badge ml-auto ${getRiskLevelColor(selectedZone.riskLevel)}`}>{selectedZone.riskLevel}</span>
                </div>
                {selectedZone.primaryHazard && (
                  <p className="flex items-center gap-2 text-slate-600">
                    <HazardIcon type={selectedZone.primaryHazard} /> {getHazardLabel(selectedZone.primaryHazard)}
                  </p>
                )}
                {selectedZone.recommendedAction && (
                  <p className="panel px-3 py-2 text-xs font-medium text-slate-700">{selectedZone.recommendedAction}</p>
                )}
                {selectedZone.alerts.length > 0 && (
                  <div>
                    <p className="eyebrow mb-1.5">Active alerts</p>
                    <ul className="space-y-1.5">
                      {selectedZone.alerts.map((alert) => (
                        <li key={alert.id} className="flex items-start justify-between gap-2 text-xs">
                          <span className="text-slate-700">{alert.title}</span>
                          <span className={`badge ${getSeverityColor(alert.severity)}`}>{alert.severity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card px-4 py-6 text-center text-sm text-slate-500">Click a shaded risk zone on the map to see its details here.</div>
          )}

          <div className="card space-y-4 p-4 text-xs">
            <LegendGroup title="Alert severity (markers)" items={SEVERITY_LEGEND} />
            <LegendGroup title="Risk level (zones)" items={RISK_LEVEL_LEGEND} />
            <div>
              <p className="mb-1.5 font-semibold text-slate-700">Other markers</p>
              <div className="space-y-1 text-slate-600">
                <p className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-orange-500 bg-white" /> Vulnerable habitation (ring)
                </p>
                {RESOURCE_TYPES.map((t) => (
                  <p key={t} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getResourceHex(t) }} /> {getResourceTypeLabel(t)}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LegendGroup({ title, items }: { title: string; items: { label: string; hex: string }[] }) {
  return (
    <div>
      <p className="mb-1.5 font-semibold text-slate-700">{title}</p>
      <div className="grid grid-cols-2 gap-1 text-slate-600">
        {items.map((item) => (
          <p key={item.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.hex }} />
            {item.label}
          </p>
        ))}
      </div>
    </div>
  );
}
