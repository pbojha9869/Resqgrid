import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Activity, Mail, Smartphone, Eye, EyeOff, LogIn, Wrench } from "lucide-react";
import { DEV_PASSWORD, LoginMethod, useAuth, validateIdentifier } from "../auth";

export default function Login() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";

  const [method, setMethod] = useState<LoginMethod>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (session) return <Navigate to={from} replace />;

  const identifierError = touched ? validateIdentifier(method, identifier) : null;

  const switchMethod = (m: LoginMethod) => {
    setMethod(m);
    setIdentifier("");
    setTouched(false);
    setFormError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!password) {
      setFormError(validateIdentifier(method, identifier) ?? "Enter your password.");
      return;
    }
    const error = login(method, identifier, password);
    if (error) {
      setFormError(error);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Activity className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in to ResQGrid</h1>
          <p className="mt-1 text-sm text-slate-500">Disaster Risk Intelligence & Response Platform</p>
        </div>

        <div className="card p-6">
          {/* Method switch */}
          <div className="mb-5 grid grid-cols-2 rounded-lg border border-slate-200 p-0.5" role="tablist">
            {(
              [
                { key: "email", label: "Email", icon: Mail },
                { key: "phone", label: "Phone", icon: Smartphone },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={method === key}
                onClick={() => switchMethod(key)}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  method === key ? "bg-emerald-600 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label className="label" htmlFor="identifier">
                {method === "email" ? "Email address" : "Mobile number"}
              </label>
              {method === "email" ? (
                <input
                  id="identifier"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  className={`input ${identifierError ? "border-red-400 focus:border-red-500" : ""}`}
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setFormError(null);
                  }}
                  onBlur={() => identifier && setTouched(true)}
                  aria-invalid={!!identifierError}
                  autoFocus
                />
              ) : (
                <div
                  className={`flex h-9 items-stretch overflow-hidden rounded-lg border bg-white transition-colors focus-within:border-emerald-500 ${
                    identifierError ? "border-red-400" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
                  <input
                    id="identifier"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    maxLength={11}
                    className="min-w-0 flex-1 px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                    value={identifier}
                    onChange={(e) => {
                      // digits and a single optional space only
                      setIdentifier(e.target.value.replace(/[^\d ]/g, ""));
                      setFormError(null);
                    }}
                    onBlur={() => identifier && setTouched(true)}
                    aria-invalid={!!identifierError}
                    autoFocus
                  />
                </div>
              )}
              {identifierError && <p className="mt-1.5 text-xs text-red-600">{identifierError}</p>}
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="input pr-10"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {formError && formError !== identifierError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>
            )}

            <button type="submit" className="btn btn-primary w-full">
              <LogIn className="h-4 w-4" />
              Sign in
            </button>
          </form>
        </div>

        {/* Development-phase credentials */}
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="flex items-center gap-1.5 font-semibold">
            <Wrench className="h-3.5 w-3.5" /> Development mode
          </p>
          <p className="mt-1">Use any valid email or mobile number with the password below.</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span>
              Password:{" "}
              <code className="rounded border border-amber-200 bg-white px-1.5 py-0.5 font-mono text-sm font-semibold text-amber-900">
                {DEV_PASSWORD}
              </code>
            </span>
            <button
              type="button"
              onClick={() => {
                setPassword(DEV_PASSWORD);
                setFormError(null);
              }}
              className="font-semibold underline underline-offset-2 hover:text-amber-950"
            >
              Fill password
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
