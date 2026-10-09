import { useEffect, useState, useCallback, useMemo } from "react";
import { MapPin, RefreshCw, Search } from "lucide-react";
import { api } from "../api/client";
import { HazardAlert, Severity } from "../types";
import { Loading, ErrorState, EmptyState, PageHeader, HazardIcon, Modal } from "../components/ui";
import { formatRelativeTime, formatDateTime, getHazardLabel, getSeverityColor, getSeverityDot } from "../utils/format";

type Filter = "ALL" | Severity;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "EXTREME", label: "Extreme" },
  { key: "HIGH", label: "High" },
  { key: "MODERATE", label: "Moderate" },
  { key: "LOW", label: "Low" },
];
const SEVERITY_RANK: Record<Severity, number> = { EXTREME: 0, HIGH: 1, MODERATE: 2, LOW: 3 };

export default function Alerts() {
  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<HazardAlert | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAlerts();
      setAlerts(res.data);
      setSource(res.source);
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

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: alerts.length, EXTREME: 0, HIGH: 0, MODERATE: 0, LOW: 0 };
    alerts.forEach((a) => (c[a.severity] += 1));
    return c;
  }, [alerts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts
      .filter((a) => filter === "ALL" || a.severity === filter)
      .filter(
        (a) =>
          !q ||
          [a.title, a.location, a.state, a.district, a.source, getHazardLabel(a.type)]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))
      )
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime()
      );
  }, [alerts, filter, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Center"
        description={`Live hazard alerts${source ? ` from ${source}` : ""}.`}
        actions={
          <button onClick={loadData} disabled={loading} className="btn btn-secondary btn-sm">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`chip ${filter === f.key ? "chip-active" : ""}`}
            >
              {f.key !== "ALL" && <span className={`h-2 w-2 rounded-full ${getSeverityDot(f.key)}`} />}
              {f.label}
              <span className={filter === f.key ? "text-emerald-100" : "text-slate-400"}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Filter by place, hazard or source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {loading && alerts.length === 0 ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          message={alerts.length === 0 ? "No active alerts reported." : "No alerts match these filters."}
          hint={alerts.length === 0 ? undefined : "Try a different severity or clear the search."}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((alert) => (
            <button key={alert.id} className="card-interactive p-4" onClick={() => setSelectedAlert(alert)}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <HazardIcon type={alert.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{alert.title}</p>
                    <span className={`badge ${getSeverityColor(alert.severity)}`}>{alert.severity}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{alert.location}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {alert.source} · {formatRelativeTime(alert.issuedAt)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedAlert && (
        <Modal
          onClose={() => setSelectedAlert(null)}
          title={
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <HazardIcon type={selectedAlert.type} className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug">{selectedAlert.title}</h3>
                <p className="text-sm text-slate-500">{selectedAlert.location}</p>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <span className={`badge ${getSeverityColor(selectedAlert.severity)}`}>{selectedAlert.severity}</span>
              <span className="badge">{getHazardLabel(selectedAlert.type)}</span>
            </div>
            <p className="leading-relaxed text-slate-700">{selectedAlert.description}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Detail label="Source" value={selectedAlert.source} />
              <Detail label="Issued" value={formatDateTime(selectedAlert.issuedAt)} />
              {selectedAlert.validUntil && <Detail label="Valid until" value={formatDateTime(selectedAlert.validUntil)} />}
              {selectedAlert.district && <Detail label="District" value={selectedAlert.district} />}
              {selectedAlert.state && <Detail label="State" value={selectedAlert.state} />}
            </dl>
            {selectedAlert.latitude !== undefined && selectedAlert.longitude !== undefined && (
              <a
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                href={`https://www.openstreetmap.org/?mlat=${selectedAlert.latitude}&mlon=${selectedAlert.longitude}#map=10/${selectedAlert.latitude}/${selectedAlert.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin className="h-3.5 w-3.5" />
                {selectedAlert.latitude.toFixed(4)}, {selectedAlert.longitude.toFixed(4)} — open in map
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
