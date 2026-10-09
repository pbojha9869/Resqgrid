import { useEffect, useState } from "react";
import { Shield, Map, Users, Building2, Route, ExternalLink, Activity, Check } from "lucide-react";
import { api } from "../api/client";
import { DataSourceStatus } from "../types";
import { Loading, ErrorState, SectionHeader } from "../components/ui";

const FEATURES = [
  { icon: Shield, title: "Hazard identification", desc: "Detect and visualise active hazards from live and government sources" },
  { icon: Map, title: "Red-zone identification", desc: "Identify high-risk zones using the ResQGrid Risk Index" },
  { icon: Users, title: "Vulnerability assessment", desc: "Surface exposed and vulnerable habitations" },
  { icon: Building2, title: "Carrying capacity", desc: "Compare nearby emergency resources and availability" },
  { icon: Route, title: "Relocation support", desc: "Risk-scored evacuation routes with officer sign-off" },
];

const WEIGHTS = [
  { label: "Hazard score", weight: 30 },
  { label: "Exposure score", weight: 20 },
  { label: "Infrastructure risk", weight: 20 },
  { label: "Vulnerability score", weight: 15 },
  { label: "Resource access", weight: 15 },
];

const LIMITATIONS = [
  "Live government API data depends on API availability and credentials",
  "Population data may be unavailable — population numbers are never fabricated",
  "Resource availability is shown only when provided by the source",
  "Demo data is clearly labelled as DEMO DATA and never presented as live",
  "Risk scores are ResQGrid estimates, not official government classifications",
  "Evacuation recommendations must be verified with local authorities",
];

const OFFICIAL_LINKS = [
  { href: "https://ndma.gov.in", label: "NDMA", desc: "National Disaster Management Authority" },
  { href: "https://mausam.imd.gov.in", label: "IMD", desc: "India Meteorological Department" },
  { href: "https://cwc.gov.in", label: "CWC", desc: "Central Water Commission" },
  { href: "https://www.openstreetmap.org", label: "OpenStreetMap", desc: "Emergency resource locations" },
];

const STATUS_BADGE: Record<DataSourceStatus["status"], string> = {
  LIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CACHED: "border-sky-200 bg-sky-50 text-sky-700",
  UNAVAILABLE: "border-slate-200 bg-slate-50 text-slate-500",
};

export default function About() {
  const [sources, setSources] = useState<DataSourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSources()
      .then((res) => setSources(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to retrieve data source status."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="max-w-3xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <Activity className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">ResQGrid</h1>
        <p className="mt-1 text-lg text-slate-500">Disaster Risk Intelligence & Response Platform</p>
        <p className="mt-4 leading-relaxed text-slate-700">
          ResQGrid helps authorities identify disaster-prone zones, assess risk, and support relocation decisions for vulnerable
          habitations using real-time data from weather models, river-flood forecasts, seismic feeds and government sources.
        </p>
        <div className="panel mt-5 px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Problem statement: </span>
          Intelligent identification of hazard-based red zones, carrying-capacity assessment, and immediate relocation needs for
          vulnerable habitations.
        </div>
      </section>

      <section>
        <SectionHeader title="Key capabilities" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Data sources" sub="Connection status reported by the ResQGrid server" />
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <div className="card divide-y divide-slate-100">
            {sources.map((source) => (
              <div key={source.name} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{source.name}</h3>
                  {source.purpose && <p className="mt-0.5 text-xs text-slate-500">{source.purpose}</p>}
                </div>
                <span className={`badge ${STATUS_BADGE[source.status]}`}>
                  {source.status === "UNAVAILABLE" ? "Not configured" : source.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Risk methodology</h2>
          <p className="mt-1 text-sm text-slate-500">Five weighted factors combine into a transparent 0–100 score.</p>
          <ul className="mt-4 space-y-3">
            {WEIGHTS.map((w) => (
              <li key={w.label}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">{w.label}</span>
                  <span className="font-semibold tabular-nums">{w.weight}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(w.weight / 30) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">This is a ResQGrid risk index, not an official government risk classification.</p>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">Limitations & data honesty</h2>
          <ul className="mt-4 space-y-2.5">
            {LIMITATIONS.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <SectionHeader title="Official sources" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {OFFICIAL_LINKS.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="card-interactive group p-4">
              <p className="flex items-center justify-between text-sm font-semibold">
                {link.label}
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600" />
              </p>
              <p className="mt-1 text-xs text-slate-500">{link.desc}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
