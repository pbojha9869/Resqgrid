import { useState, useCallback, useMemo } from "react";
import { Phone, MapPin, Hospital, Flame, ShieldHalf, Tent, HandHelping, LifeBuoy, Ambulance, Navigation } from "lucide-react";
import { api } from "../api/client";
import { EmergencyResource } from "../types";
import { Loading, ErrorState, EmptyState, PageHeader, LocationSearch, PickedLocation, Notice } from "../components/ui";
import { getResourceTypeLabel, getResourceTypeColor } from "../utils/format";

const RESOURCE_TYPES: { type: EmergencyResource["type"]; icon: typeof Hospital }[] = [
  { type: "HOSPITAL", icon: Hospital },
  { type: "AMBULANCE", icon: Ambulance },
  { type: "FIRE_STATION", icon: Flame },
  { type: "POLICE_STATION", icon: ShieldHalf },
  { type: "SHELTER", icon: Tent },
  { type: "RELIEF_CENTER", icon: HandHelping },
  { type: "RESCUE_TEAM", icon: LifeBuoy },
];
const ICONS = Object.fromEntries(RESOURCE_TYPES.map((r) => [r.type, r.icon])) as Record<string, typeof Hospital>;

export default function Resources() {
  const [resources, setResources] = useState<EmergencyResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [center, setCenter] = useState<PickedLocation | null>(null);
  const [radius, setRadius] = useState(10);
  const [typeFilter, setTypeFilter] = useState<EmergencyResource["type"] | "ALL">("ALL");

  const loadData = useCallback(async (loc: PickedLocation, radiusKm: number) => {
    setCenter(loc);
    setLoading(true);
    setError(null);
    try {
      const res = await api.getResources(loc.lat, loc.lon, radiusKm);
      setResources(res.data);
    } catch (err) {
      setResources([]);
      setError(err instanceof Error ? err.message : "Unable to retrieve live data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    resources.forEach((r) => (c[r.type] = (c[r.type] || 0) + 1));
    return c;
  }, [resources]);

  const visible = typeFilter === "ALL" ? resources : resources.filter((r) => r.type === typeFilter);
  const sparseGaps = (["AMBULANCE", "RESCUE_TEAM"] as const).filter((t) => !counts[t]);

  return (
    <div className="space-y-6">
      <PageHeader title="Emergency Resources" description="Hospitals, shelters, fire and police stations and rescue units near any location." />

      <div className="card space-y-3 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex-1">
            <LocationSearch onLocate={(loc) => loadData(loc, radius)} placeholder="Search a location for nearby resources…" />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="radius" className="text-xs font-medium text-slate-500">
              Radius
            </label>
            <select
              id="radius"
              value={radius}
              onChange={(e) => {
                const r = parseInt(e.target.value);
                setRadius(r);
                if (center) loadData(center, r);
              }}
              className="input w-28"
            >
              {[5, 10, 25, 50].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!center && !loading && (
        <EmptyState message="Choose a location to find emergency resources." hint="Pick a city from the dropdown, search a place, or use your location." />
      )}

      {center && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-600">
              Within <strong className="font-semibold text-slate-900">{radius} km</strong> of{" "}
              <strong className="font-semibold text-slate-900">{center.name}</strong>
            </p>
            {!loading && !error && <p className="text-xs text-slate-500">{resources.length} facilities found</p>}
          </div>

          {error && <ErrorState message={error} onRetry={() => loadData(center, radius)} />}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <TypeTile label="All" count={resources.length} active={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")} />
            {RESOURCE_TYPES.map(({ type, icon: Icon }) => (
              <TypeTile
                key={type}
                label={getResourceTypeLabel(type)}
                count={counts[type] || 0}
                icon={<Icon className="h-3.5 w-3.5" />}
                active={typeFilter === type}
                onClick={() => setTypeFilter(type)}
              />
            ))}
          </div>

          {!loading && resources.length > 0 && sparseGaps.length > 0 && (
            <Notice>
              {sparseGaps.map((g) => getResourceTypeLabel(g)).join(" and ")} facilities are rarely mapped in OpenStreetMap India — a
              zero count reflects mapped data, not actual service availability.
            </Notice>
          )}

          {loading ? (
            <Loading message="Fetching nearby emergency resources… this can take up to half a minute." />
          ) : error ? null : visible.length === 0 ? (
            <EmptyState
              message={resources.length ? "No facilities of this type in range." : "No emergency resources found in this area."}
              hint="Try a larger radius, or search a larger town nearby."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((resource) => {
                const Icon = ICONS[resource.type] || Hospital;
                return (
                  <div key={resource.id} className="card flex flex-col p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${getResourceTypeColor(resource.type)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug">{resource.name}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{getResourceTypeLabel(resource.type)}</p>
                      </div>
                      {resource.distanceKm !== undefined && (
                        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">{resource.distanceKm.toFixed(1)} km</span>
                      )}
                    </div>

                    <div className="mt-3 flex-1 space-y-1 text-xs text-slate-600">
                      {resource.address && (
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="line-clamp-2">{resource.address}</span>
                        </p>
                      )}
                      {resource.capacity !== undefined && <p>Capacity: {resource.capacity}</p>}
                      {resource.availability && <p className="text-slate-500">{resource.availability}</p>}
                    </div>

                    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                      {resource.phone && (
                        <a href={`tel:${resource.phone}`} className="btn btn-secondary btn-sm">
                          <Phone className="h-3.5 w-3.5" /> Call
                        </a>
                      )}
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${resource.latitude},${resource.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        <Navigation className="h-3.5 w-3.5" /> Directions
                      </a>
                      <span className="ml-auto truncate text-[11px] text-slate-400">{resource.source}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TypeTile({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`card-interactive px-3 py-2.5 ${active ? "card-selected" : ""}`} aria-pressed={active}>
      <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{count}</p>
    </button>
  );
}
