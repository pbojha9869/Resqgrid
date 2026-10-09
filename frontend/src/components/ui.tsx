import { ReactNode, useEffect, useId, useMemo, useState } from "react";
import {
  Loader2,
  TriangleAlert,
  Inbox,
  RefreshCw,
  Search,
  LocateFixed,
  MapPin,
  X,
  Info,
  Waves,
  CloudRain,
  CloudLightning,
  Zap,
  Tornado,
  Activity,
  ThermometerSun,
  Mountain,
  Snowflake,
  CloudFog,
  CloudHail,
  Sun,
  LucideIcon,
} from "lucide-react";
import { api, getCurrentPosition } from "../api/client";
import { HazardType } from "../types";
import { getRiskBarColor } from "../utils/format";
import { CITIES, City, cityKey } from "../data/cities";

/* ---------- Page structure ---------- */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---------- States ---------- */

export function Loading({ message = "Fetching latest disaster information…" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
      {message}
    </div>
  );
}

export function ErrorState({ message = "Unable to retrieve live data.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  const styles =
    tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${styles}`}>
      <Info className="mt-px h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ message = "No data available.", hint }: { message?: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
      <Inbox className="mb-2 h-5 w-5 text-slate-400" />
      <p className="text-sm font-medium text-slate-600">{message}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/* ---------- Data display ---------- */

export function StatCard({
  label,
  value,
  icon,
  tone = "emerald",
  sub,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "emerald" | "red" | "sky" | "amber" | "slate";
  sub?: string;
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div>
      </div>
      <p className="stat-value mt-2">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${getRiskBarColor(score)}`} style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} />
    </div>
  );
}

const HAZARD_ICONS: Record<HazardType, LucideIcon> = {
  FLOOD: Waves,
  HEAVY_RAIN: CloudRain,
  THUNDERSTORM: CloudLightning,
  LIGHTNING: Zap,
  CYCLONE: Tornado,
  EARTHQUAKE: Activity,
  HEAT_WAVE: ThermometerSun,
  LANDSLIDE: Mountain,
  COLD_WAVE: Snowflake,
  FOG: CloudFog,
  HAILSTORM: CloudHail,
  DROUGHT: Sun,
  OTHER: TriangleAlert,
};

export function HazardIcon({ type, className = "h-4 w-4" }: { type?: HazardType; className?: string }) {
  const Icon = (type && HAZARD_ICONS[type]) || TriangleAlert;
  return <Icon className={className} />;
}

/* ---------- Location search ---------- */

export interface PickedLocation {
  lat: number;
  lon: number;
  name: string;
}

const MAX_SUGGESTIONS = 8;
const CITIES_ALPHABETICAL = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));

/** Cities whose name or state matches the query; name-prefix matches first. */
function matchCities(query: string): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return CITIES_ALPHABETICAL;
  return CITIES.filter((c) => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q))
    .sort((a, b) => {
      const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Search box with built-in city suggestions + "my location" button, used on
 * every page that needs a place. Picking a suggested city is instant; any
 * other text is geocoded through the backend so errors are reported.
 */
export function LocationSearch({
  onLocate,
  placeholder = "Search a city, district or village…",
  buttonLabel = "Search",
  showMyLocation = true,
}: {
  onLocate: (loc: PickedLocation) => void;
  placeholder?: string;
  buttonLabel?: string;
  showMyLocation?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState<"search" | "gps" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const suggestions = useMemo(() => matchCities(query), [query]);
  const showList = open && suggestions.length > 0;

  const pickCity = (c: City) => {
    const name = `${c.name}, ${c.state}`;
    setQuery(name);
    setOpen(false);
    setActive(-1);
    setError(null);
    onLocate({ lat: c.lat, lon: c.lon, name });
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showList && active >= 0) {
      pickCity(suggestions[active]);
      return;
    }
    const q = query.trim().toLowerCase();
    if (!q) return;
    // An exact city match needs no network lookup
    const exact = CITIES.find((c) => c.name.toLowerCase() === q || `${c.name}, ${c.state}`.toLowerCase() === q);
    if (exact) {
      pickCity(exact);
      return;
    }
    setOpen(false);
    setBusy("search");
    setError(null);
    try {
      const res = await api.geocode(query.trim());
      onLocate({ lat: res.data.latitude, lon: res.data.longitude, name: res.data.displayName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location search failed.");
    } finally {
      setBusy(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const locate = async () => {
    setBusy("gps");
    setError(null);
    try {
      const pos = await getCurrentPosition();
      setQuery("");
      onLocate({ ...pos, name: "My location" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location unavailable.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={search} className="flex w-full gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={(e) => {
              e.target.select();
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="input pl-9"
            aria-label="Search location"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
          />
          {showList && (
            <ul
              id={listId}
              role="listbox"
              className="absolute left-0 right-0 top-full z-[1500] mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1"
            >
              {suggestions.map((c, i) => (
                <li
                  key={cityKey(c)}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so the pick lands before the input blurs
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickCity(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                    i === active ? "bg-emerald-50 text-emerald-800" : "text-slate-700"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{c.state}</span>
                </li>
              ))}
              {query.trim() && (
                <li className="border-t border-slate-100 px-3 pb-1 pt-2 text-xs text-slate-400">
                  Not listed? Press Enter to search &quot;{query.trim()}&quot; anywhere in India.
                </li>
              )}
            </ul>
          )}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy !== null}>
          {busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 sm:hidden" />}
          <span className="hidden sm:inline">{buttonLabel}</span>
        </button>
        {showMyLocation && (
          <button type="button" onClick={locate} className="btn btn-secondary" disabled={busy !== null} title="Use my location">
            {busy === "gps" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            <span className="hidden md:inline">My location</span>
          </button>
        )}
      </form>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* ---------- Modal ---------- */

export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button onClick={onClose} className="icon-btn -mr-2 -mt-1" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
