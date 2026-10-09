import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Check, Lock, LogOut, UserRound } from "lucide-react";
import { EMAIL_PATTERN, normalisePhone, Profile as ProfileData, useAuth, UserRole } from "../auth";
import { CITIES, STATES } from "../data/cities";

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "CITIZEN", label: "Citizen", hint: "View alerts and request help" },
  { value: "VOLUNTEER", label: "Volunteer", hint: "Respond to nearby rescue requests" },
  { value: "GOVERNMENT_OFFICER", label: "Government officer", hint: "Approve evacuations and coordinate response" },
  { value: "NGO", label: "NGO / relief organisation", hint: "Run shelters and distribute supplies" },
  { value: "EMERGENCY_RESPONDER", label: "Emergency responder", hint: "NDRF, SDRF, fire, police or medical teams" },
];

const NAME_PATTERN = /^[A-Za-z][A-Za-z .'-]{1,59}$/;

type Field = "fullName" | "email" | "phone" | "role" | "state" | "city";

export default function Profile() {
  const { session, profile, saveProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const onboarding = !profile;

  const loginEmail = session?.method === "email" ? session.identifier : "";
  const loginPhone = session?.method === "phone" ? session.identifier.replace(/^\+91/, "") : "";

  const [form, setForm] = useState({
    fullName: profile?.fullName ?? "",
    email: profile?.email ?? loginEmail,
    phone: profile?.phone ? profile.phone.replace(/^\+91/, "") : loginPhone,
    role: (profile?.role ?? "") as UserRole | "",
    organisation: profile?.organisation ?? "",
    state: profile?.state ?? "",
    city: profile?.city ?? "",
  });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);

  const errors = useMemo(() => {
    const e: Partial<Record<Field, string>> = {};
    if (!form.fullName.trim()) e.fullName = "Enter your full name.";
    else if (!NAME_PATTERN.test(form.fullName.trim())) e.fullName = "Use letters, spaces, dots, apostrophes or hyphens only.";
    if (!form.email.trim()) e.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(form.email.trim())) e.email = "Enter a valid email address, e.g. name@example.com.";
    if (!form.phone.trim()) e.phone = "Enter your mobile number.";
    else if (!normalisePhone(form.phone)) e.phone = "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.";
    if (!form.role) e.role = "Select your role.";
    if (!form.state) e.state = "Select your state or union territory.";
    if (!form.city.trim()) e.city = "Enter your city or district.";
    return e;
  }, [form]);

  const show = (f: Field) => (submitted || touched[f] ? errors[f] : undefined);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value, ...(key === "state" ? { city: "" } : {}) }));
  };
  const touch = (f: Field) => setTouched((t) => ({ ...t, [f]: true }));

  const citySuggestions = CITIES.filter((c) => c.state === form.state).map((c) => c.name);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    const data: Omit<ProfileData, "updatedAt"> = {
      fullName: form.fullName.trim().replace(/\s+/g, " "),
      email: form.email.trim().toLowerCase(),
      phone: normalisePhone(form.phone)!,
      role: form.role as UserRole,
      organisation: form.organisation.trim() || undefined,
      state: form.state,
      city: form.city.trim(),
    };
    saveProfile(data);
    if (onboarding) navigate(from && from !== "/profile" ? from : "/", { replace: true });
    else setSaved(true);
  };

  const inputClass = (f: Field) => `input ${show(f) ? "border-red-400 focus:border-red-500" : ""}`;

  const content = (
    <>
        {onboarding && (
          <ol className="mb-6 flex items-center gap-3 text-xs">
            <li className="flex items-center gap-1.5 text-emerald-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-3 w-3" />
              </span>
              Sign in
            </li>
            <li className="h-px w-8 bg-slate-200" />
            <li className="flex items-center gap-1.5 font-semibold text-slate-900">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-emerald-600 text-[10px] text-emerald-700">
                2
              </span>
              Profile
            </li>
          </ol>
        )}

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{onboarding ? "Complete your profile" : "Your profile"}</h1>
            <p className="text-sm text-slate-500">
              {onboarding
                ? "Tell us a little about yourself so ResQGrid can tailor alerts and coordination."
                : "Keep your contact details and location up to date."}
            </p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="card mt-6 space-y-5 p-5 sm:p-6">
          <FormField id="fullName" label="Full name" required error={show("fullName")}>
            <input
              id="fullName"
              autoComplete="name"
              placeholder="e.g. Priya Sharma"
              className={inputClass("fullName")}
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              onBlur={() => touch("fullName")}
              aria-invalid={!!show("fullName")}
              autoFocus={onboarding}
            />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="email"
              label="Email address"
              required
              error={show("email")}
              locked={session?.method === "email"}
            >
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                className={`${inputClass("email")} ${session?.method === "email" ? "bg-slate-50 text-slate-500" : ""}`}
                value={form.email}
                readOnly={session?.method === "email"}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => touch("email")}
                aria-invalid={!!show("email")}
              />
            </FormField>

            <FormField
              id="phone"
              label="Mobile number"
              required
              error={show("phone")}
              locked={session?.method === "phone"}
            >
              <div
                className={`flex h-9 items-stretch overflow-hidden rounded-lg border transition-colors focus-within:border-emerald-500 ${
                  show("phone") ? "border-red-400" : "border-slate-200 hover:border-slate-300"
                } ${session?.method === "phone" ? "bg-slate-50" : "bg-white"}`}
              >
                <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  maxLength={11}
                  className={`min-w-0 flex-1 bg-transparent px-3 text-sm placeholder-slate-400 focus:outline-none ${
                    session?.method === "phone" ? "text-slate-500" : "text-slate-900"
                  }`}
                  value={form.phone}
                  readOnly={session?.method === "phone"}
                  onChange={(e) => set("phone", e.target.value.replace(/[^\d ]/g, ""))}
                  onBlur={() => touch("phone")}
                  aria-invalid={!!show("phone")}
                />
              </div>
            </FormField>
          </div>

          <FormField id="role" label="Role" required error={show("role")}>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="role-label">
              {ROLES.map((r) => {
                const selected = form.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      set("role", r.value);
                      touch("role");
                    }}
                    className={`card-interactive px-3 py-2.5 ${selected ? "card-selected" : ""}`}
                  >
                    <p className="flex items-center justify-between gap-2 text-sm font-medium">
                      {r.label}
                      {selected && <Check className="h-4 w-4 text-emerald-600" />}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{r.hint}</p>
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField id="organisation" label="Organisation / department" optional>
            <input
              id="organisation"
              autoComplete="organization"
              placeholder="e.g. District Disaster Management Authority, Patna"
              className="input"
              value={form.organisation}
              onChange={(e) => set("organisation", e.target.value)}
            />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="state" label="State / union territory" required error={show("state")}>
              <select
                id="state"
                className={inputClass("state")}
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                onBlur={() => touch("state")}
                aria-invalid={!!show("state")}
              >
                <option value="">Select…</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="city" label="City / district" required error={show("city")}>
              <input
                id="city"
                list="profile-city-suggestions"
                autoComplete="address-level2"
                placeholder={form.state ? "Start typing…" : "Select a state first"}
                className={inputClass("city")}
                value={form.city}
                disabled={!form.state}
                onChange={(e) => set("city", e.target.value)}
                onBlur={() => touch("city")}
                aria-invalid={!!show("city")}
              />
              <datalist id="profile-city-suggestions">
                {citySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </FormField>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {saved ? (
                <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Profile saved
                </span>
              ) : (
                "Fields marked * are required."
              )}
            </p>
            <button type="submit" className="btn btn-primary">
              {onboarding ? "Save and continue" : "Save changes"}
            </button>
          </div>
        </form>
    </>
  );

  // Editing happens inside the app layout; onboarding gets its own full-screen shell
  if (!onboarding) return <div className="max-w-2xl">{content}</div>;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Activity className="h-4 w-4" />
            </div>
            <p className="text-sm font-bold tracking-tight">ResQGrid</p>
          </div>
          <button onClick={logout} className="btn btn-ghost btn-sm">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">{content}</main>
    </div>
  );
}

function FormField({
  id,
  label,
  required,
  optional,
  locked,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  locked?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label flex items-center gap-1" htmlFor={id} id={`${id}-label`}>
        {label}
        {required && <span className="text-red-500">*</span>}
        {optional && <span className="font-normal text-slate-400">(optional)</span>}
        {locked && (
          <span className="ml-auto flex items-center gap-1 font-normal text-slate-400">
            <Lock className="h-3 w-3" /> Used to sign in
          </span>
        )}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
