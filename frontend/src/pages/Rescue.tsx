import { useState } from "react";
import { HeartPulse, MapPin, ShieldAlert, UserCheck, Loader2, CircleCheck, TriangleAlert, Users } from "lucide-react";
import { api } from "../api/client";
import type { RescueRequest, RescueRiskLevel, RescueStatus, RescueVolunteer, RescueSeverity } from "../types";
import { ErrorState, PageHeader, LocationSearch, PickedLocation, Notice } from "../components/ui";
import { humanize } from "../utils/format";

const RISK_STYLE: Record<RescueRiskLevel, { text: string; badge: string }> = {
  LOW: { text: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  MEDIUM: { text: "text-amber-600", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  HIGH: { text: "text-orange-600", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  CRITICAL: { text: "text-red-600", badge: "bg-red-50 text-red-700 border-red-200" },
};

const DISASTER_TYPES = ["FLOOD", "EARTHQUAKE", "CYCLONE", "LANDSLIDE", "OTHER"];
const SEVERITIES: RescueSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Statuses an operator can move a request into, in order. */
const NEXT_STATUS: Partial<Record<RescueStatus, { status: RescueStatus; label: string }>> = {
  VOLUNTEER_ASSIGNED: { status: "RESCUE_IN_PROGRESS", label: "Mark rescue in progress" },
  RESCUE_IN_PROGRESS: { status: "RESOLVED", label: "Mark resolved" },
};

const STEPS: RescueStatus[] = ["UNDER_VERIFICATION", "VERIFIED", "VOLUNTEER_ASSIGNED", "RESCUE_IN_PROGRESS", "RESOLVED"];

const EMPTY_FORM = {
  disasterType: "FLOOD",
  severity: "HIGH" as RescueSeverity,
  peopleAffected: 1,
  children: 0,
  elderly: 0,
  disabled: 0,
  description: "",
  contactName: "",
  contactPhone: "",
};

export default function Rescue() {
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [request, setRequest] = useState<RescueRequest | null>(null);
  const [volunteers, setVolunteers] = useState<RescueVolunteer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const validationError = !location
    ? "Set the location of the emergency."
    : form.peopleAffected < 1
      ? "At least one person must be affected."
      : form.children + form.elderly + form.disabled > form.peopleAffected
        ? "Children, elderly and disabled cannot exceed the number of people affected."
        : form.description.trim().length < 10
          ? "Describe the situation in at least a few words."
          : null;

  const loadVolunteers = async (lat: number, lon: number) => {
    try {
      const res = await api.getNearbyRescue(lat, lon, 25);
      setVolunteers(res.data.volunteers);
    } catch {
      setVolunteers([]);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (validationError || !location) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.createRescueRequest({
        latitude: location.lat,
        longitude: location.lon,
        disasterType: form.disasterType,
        severity: form.severity,
        peopleAffected: form.peopleAffected,
        children: form.children,
        elderly: form.elderly,
        disabled: form.disabled,
        description: form.description.trim(),
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
      });
      setRequest(result.data);
      await loadVolunteers(location.lat, location.lon);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit rescue request.");
    } finally {
      setSubmitting(false);
    }
  };

  const accept = async (volunteerId: string) => {
    if (!request) return;
    setBusyAction(volunteerId);
    setError(null);
    try {
      const result = await api.acceptRescue(request.id, volunteerId);
      setRequest(result.data);
      await loadVolunteers(request.latitude, request.longitude);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Volunteer is no longer available.");
    } finally {
      setBusyAction(null);
    }
  };

  const advance = async (status: RescueStatus) => {
    if (!request) return;
    setBusyAction(status);
    setError(null);
    try {
      const result = await api.updateRescueStatus(request.id, status);
      setRequest(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the request.");
    } finally {
      setBusyAction(null);
    }
  };

  const startOver = () => {
    setRequest(null);
    setVolunteers(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const numberField = (key: "peopleAffected" | "children" | "elderly" | "disabled", label: string, min = 0) => (
    <div>
      <label className="label" htmlFor={`f-${key}`}>
        {label}
      </label>
      <input
        id={`f-${key}`}
        className="input"
        type="number"
        min={min}
        max={500}
        value={form[key]}
        onChange={(e) => set(key, Math.max(0, parseInt(e.target.value) || 0))}
      />
    </div>
  );

  const next = request ? NEXT_STATUS[request.status] : undefined;
  const stepIndex = request ? STEPS.indexOf(request.status === "PENDING" ? "UNDER_VERIFICATION" : request.status) : -1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rescue Request"
        description="Report people who need help and receive an explainable verification and response assessment."
        actions={
          <span className="badge">
            <HeartPulse className="h-3 w-3" /> Safety-first coordination
          </span>
        }
      />

      <Notice tone="warning">
        In a life-threatening emergency call <strong>112</strong> (national emergency) or <strong>1078</strong> (NDMA disaster helpline)
        first. Volunteer coordination supplements, never replaces, official responders.
      </Notice>

      {error && <ErrorState message={error} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)]">
        {request ? (
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Request {request.id}</p>
                <h2 className="mt-1 text-base font-semibold">{humanize(request.disasterType)} · {request.peopleAffected} people</h2>
                <p className="mt-1 text-sm text-slate-500">{request.description}</p>
              </div>
              <button onClick={startOver} className="btn btn-secondary btn-sm shrink-0">
                New request
              </button>
            </div>

            {/* Progress */}
            <ol className="mt-5 grid grid-cols-5 gap-1.5">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <div className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-emerald-500" : "bg-slate-100"}`} />
                  <p className={`mt-1.5 text-[11px] leading-tight ${i === stepIndex ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                    {humanize(s)}
                  </p>
                </li>
              ))}
            </ol>

            {request.assignedVolunteer && (
              <div className="mt-5 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
                <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <p className="flex-1 text-emerald-800">
                  <strong>{request.assignedVolunteer.name}</strong> accepted · {request.assignedVolunteer.distanceKm} km away ·{" "}
                  {request.assignedVolunteer.skills.join(", ")}
                </p>
              </div>
            )}

            {next && (
              <button onClick={() => advance(next.status)} disabled={busyAction !== null} className="btn btn-primary mt-4">
                {busyAction === next.status && <Loader2 className="h-4 w-4 animate-spin" />}
                {next.label}
              </button>
            )}
            {request.status === "RESOLVED" && (
              <p className="mt-4 text-sm font-medium text-emerald-700">This request is resolved. Thank you for coordinating safely.</p>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="eyebrow mb-2">Activity log</p>
              <ul className="space-y-2">
                {[...request.audit].reverse().map((entry, i) => (
                  <li key={i} className="flex gap-3 text-xs">
                    <span className="w-16 shrink-0 tabular-nums text-slate-400">
                      {new Date(entry.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-slate-600">{entry.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-5 p-5" noValidate>
            <div>
              <h2 className="text-base font-semibold">Request assistance</h2>
              <p className="mt-0.5 text-sm text-slate-500">The assessment is generated automatically and is not official verification.</p>
            </div>

            <div>
              <p className="label">Location of the emergency</p>
              <LocationSearch onLocate={setLocation} buttonLabel="Set" placeholder="Search the village, street or landmark…" />
              {location && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                  <MapPin className="h-3.5 w-3.5 text-red-500" />
                  {location.name} ({location.lat.toFixed(4)}, {location.lon.toFixed(4)})
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="f-type">
                  Disaster type
                </label>
                <select id="f-type" className="input" value={form.disasterType} onChange={(e) => set("disasterType", e.target.value)}>
                  {DISASTER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="f-sev">
                  Emergency severity
                </label>
                <select id="f-sev" className="input" value={form.severity} onChange={(e) => set("severity", e.target.value as RescueSeverity)}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {numberField("peopleAffected", "People affected", 1)}
              {numberField("children", "Children")}
              {numberField("elderly", "Elderly")}
              {numberField("disabled", "Disabled")}
            </div>

            <div>
              <label className="label" htmlFor="f-desc">
                Situation description
              </label>
              <textarea
                id="f-desc"
                className="input min-h-[96px]"
                placeholder="e.g. Three people are trapped on the roof; water is still rising."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="f-name">
                  Contact name <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input id="f-name" className="input" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="f-phone">
                  Contact phone <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="f-phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              {submitting ? "Verifying against live hazard feeds…" : "Submit and assess request"}
            </button>
            {validationError && <p className="-mt-2 text-center text-xs text-slate-500">{validationError}</p>}
          </form>
        )}

        <div className="space-y-4">
          {request ? (
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Assessment</p>
                  <h3 className="mt-1 font-semibold">{humanize(request.verification.status)}</h3>
                </div>
                <div className="text-right">
                  <p className={`text-3xl font-semibold tabular-nums ${RISK_STYLE[request.verification.riskLevel].text}`}>
                    {request.verification.confidence}
                  </p>
                  <p className="text-xs text-slate-500">confidence / 100</p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="panel px-3 py-2">
                  <dt className="text-xs text-slate-500">Risk</dt>
                  <dd className="mt-0.5">
                    <span className={`badge ${RISK_STYLE[request.verification.riskLevel].badge}`}>{request.verification.riskLevel}</span>
                  </dd>
                </div>
                <div className="panel px-3 py-2">
                  <dt className="text-xs text-slate-500">Volunteers needed</dt>
                  <dd className="mt-0.5 font-semibold">{request.assessment.suggestedVolunteers}</dd>
                </div>
              </dl>

              <div className="mt-4">
                <p className="eyebrow mb-1.5">Evidence</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {request.verification.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <span className="text-slate-300">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-slate-400">Sources: {request.verification.sources.map((s) => s.source).join(" · ")}</p>
              </div>

              {request.assessment.requiredEquipment.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-1.5">Equipment</p>
                  <div className="flex flex-wrap gap-1.5">
                    {request.assessment.requiredEquipment.map((e) => (
                      <span key={e} className="badge">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                <p>
                  {request.assessment.safetyPrecautions[0]} {request.assessment.recommendedNextAction}
                </p>
              </div>
            </div>
          ) : (
            <div className="card flex min-h-[240px] flex-col items-center justify-center p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <MapPin className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold">No active request</h3>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Fill in the location and situation details, then submit to start verification.
              </p>
            </div>
          )}

          {volunteers && request && (
            <div className="card p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4 text-slate-500" /> Nearby volunteers
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">Within 25 km. Only volunteers who choose to accept are assigned.</p>
              {volunteers.length ? (
                <ul className="mt-3 divide-y divide-slate-100">
                  {volunteers.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{v.name}</p>
                        <p className="text-xs text-slate-500">
                          {v.distanceKm} km · {v.skills.map(humanize).join(", ")}
                        </p>
                      </div>
                      {!request.assignedVolunteer && request.status !== "RESOLVED" && (
                        <button onClick={() => accept(v.id)} disabled={busyAction !== null} className="btn btn-secondary btn-sm">
                          {busyAction === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                          Assign
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  {request.assignedVolunteer ? "No other volunteers available in this radius." : "No available volunteers in this radius yet."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
