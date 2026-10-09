import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMap } from "react-leaflet";
import { HazardAlert, RiskZone, EmergencyResource, VulnerableHabitation } from "../types";
import {
  getHazardLabel,
  getResourceHex,
  getResourceTypeLabel,
  getRiskLevelColor,
  getRiskLevelHex,
  getSeverityColor,
  getSeverityHex,
  formatDateTime,
  SEVERITY_LEGEND,
} from "../utils/format";

const INDIA_CENTER: [number, number] = [22.5, 79.0];
const DEFAULT_ZOOM = 5;

/** OpenStreetMap tiles; desaturated in index.css so hazard colours stand out. */
export const BASEMAP = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

function FlyTo({ lat, lon, zoom = 9 }: { lat: number; lon: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], zoom, { duration: 1.2 });
  }, [lat, lon, zoom, map]);
  return null;
}

function PopupBody({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-[200px] max-w-[260px] space-y-1.5 text-xs text-slate-600">
      <p className="eyebrow !text-[10px]">{eyebrow}</p>
      <p className="text-sm font-semibold leading-snug text-slate-900">{title}</p>
      {children}
    </div>
  );
}

interface DisasterMapProps {
  alerts: HazardAlert[];
  riskZones: RiskZone[];
  resources: EmergencyResource[];
  vulnerableHabitats: VulnerableHabitation[];
  showAlerts?: boolean;
  showRiskZones?: boolean;
  showResources?: boolean;
  showVulnerable?: boolean;
  focusLocation?: { lat: number; lon: number; name?: string } | null;
  onSelectZone?: (zone: RiskZone) => void;
  height?: string;
}

export default function DisasterMap({
  alerts,
  riskZones,
  resources,
  vulnerableHabitats,
  showAlerts = true,
  showRiskZones = true,
  showResources = false,
  showVulnerable = true,
  focusLocation,
  onSelectZone,
  height = "500px",
}: DisasterMapProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <MapContainer center={INDIA_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution={BASEMAP.attribution} url={BASEMAP.url} />

        {focusLocation && <FlyTo lat={focusLocation.lat} lon={focusLocation.lon} />}
        {focusLocation && (
          <CircleMarker
            center={[focusLocation.lat, focusLocation.lon]}
            radius={6}
            pathOptions={{ color: "#0f172a", fillColor: "#ffffff", fillOpacity: 1, weight: 3 }}
          >
            <Popup>
              <PopupBody eyebrow="Searched location" title={focusLocation.name || "Selected point"} />
            </Popup>
          </CircleMarker>
        )}

        {/* Risk zones */}
        {showRiskZones &&
          riskZones.map((zone) => (
            <Circle
              key={zone.id}
              center={[zone.latitude, zone.longitude]}
              radius={(zone.radiusKm || 25) * 1000}
              pathOptions={{
                color: getRiskLevelHex(zone.riskLevel),
                fillColor: getRiskLevelHex(zone.riskLevel),
                fillOpacity: 0.12,
                weight: 1.5,
              }}
              eventHandlers={{ click: () => onSelectZone?.(zone) }}
            >
              <Popup>
                <PopupBody eyebrow="Risk zone" title={zone.name}>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${getRiskLevelColor(zone.riskLevel)}`}>{zone.riskLevel}</span>
                    <span className="font-semibold text-slate-900">{zone.riskScore}/100</span>
                  </div>
                  {zone.primaryHazard && <p>Primary hazard: {getHazardLabel(zone.primaryHazard)}</p>}
                  {zone.recommendedAction && <p className="font-medium text-slate-800">{zone.recommendedAction}</p>}
                </PopupBody>
              </Popup>
            </Circle>
          ))}

        {/* Hazard alert markers */}
        {showAlerts &&
          alerts
            .filter((a) => a.latitude !== undefined && a.longitude !== undefined)
            .map((alert) => {
              const isSevere = alert.severity === "EXTREME" || alert.severity === "HIGH";
              return (
                <CircleMarker
                  key={alert.id}
                  center={[alert.latitude!, alert.longitude!]}
                  radius={isSevere ? 8 : 6}
                  pathOptions={{
                    color: getSeverityHex(alert.severity),
                    fillColor: getSeverityHex(alert.severity),
                    fillOpacity: 0.75,
                    weight: 2,
                    className: isSevere ? "pulse-marker" : undefined,
                  }}
                >
                  <Popup>
                    <PopupBody eyebrow={getHazardLabel(alert.type)} title={alert.title}>
                      <p>{alert.location}</p>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${getSeverityColor(alert.severity)}`}>{alert.severity}</span>
                        <span>{alert.source}</span>
                      </div>
                      <p>{alert.description}</p>
                      {alert.issuedAt && <p className="text-slate-400">Issued {formatDateTime(alert.issuedAt)}</p>}
                    </PopupBody>
                  </Popup>
                </CircleMarker>
              );
            })}

        {/* Vulnerable habitations */}
        {showVulnerable &&
          vulnerableHabitats.map((vh) => (
            <CircleMarker
              key={vh.id}
              center={[vh.latitude, vh.longitude]}
              radius={5}
              pathOptions={{
                color: getRiskLevelHex(vh.riskLevel),
                fillColor: "#ffffff",
                fillOpacity: 1,
                weight: 2.5,
              }}
            >
              <Popup>
                <PopupBody eyebrow="Vulnerable habitation" title={vh.name}>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${getRiskLevelColor(vh.riskLevel)}`}>{vh.riskLevel}</span>
                    <span className="font-semibold text-slate-900">{vh.riskScore}/100</span>
                  </div>
                  {vh.primaryHazard && <p>Hazard: {getHazardLabel(vh.primaryHazard)}</p>}
                  {vh.nearestShelter && (
                    <p>
                      Nearest shelter: {vh.nearestShelter.name} ({vh.nearestShelter.distanceKm} km)
                    </p>
                  )}
                  {vh.recommendedAction && <p className="font-medium text-slate-800">{vh.recommendedAction}</p>}
                </PopupBody>
              </Popup>
            </CircleMarker>
          ))}

        {/* Emergency resources */}
        {showResources &&
          resources.map((resource) => (
            <CircleMarker
              key={resource.id}
              center={[resource.latitude, resource.longitude]}
              radius={4.5}
              pathOptions={{
                color: "#ffffff",
                fillColor: getResourceHex(resource.type),
                fillOpacity: 1,
                weight: 1.5,
              }}
            >
              <Popup>
                <PopupBody eyebrow={getResourceTypeLabel(resource.type)} title={resource.name}>
                  {resource.address && <p>{resource.address}</p>}
                  {resource.phone && (
                    <a href={`tel:${resource.phone}`} className="font-medium text-emerald-700">
                      {resource.phone}
                    </a>
                  )}
                  <p className="text-slate-400">Source: {resource.source}</p>
                </PopupBody>
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>

      {/* Severity legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px]">
        <p className="mb-1 font-semibold text-slate-700">Alert severity</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {SEVERITY_LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.hex }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
