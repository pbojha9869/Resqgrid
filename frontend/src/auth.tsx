import { createContext, ReactNode, useContext, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * DEVELOPMENT-PHASE AUTH. The password is hardcoded and checked in the
 * browser, so this only gates the UI — it is not real security. Replace with
 * a backend-verified login before going to production.
 */
export const DEV_PASSWORD = "123456";

export type LoginMethod = "email" | "phone";

export interface Session {
  method: LoginMethod;
  identifier: string; // normalised email, or +91XXXXXXXXXX
  loggedInAt: string;
}

const STORAGE_KEY = "resq-session";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Accepts 10-digit Indian mobile numbers, optionally prefixed by +91, 91 or 0. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  const match = digits.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? `+91${match[1]}` : null;
}

export function validateIdentifier(method: LoginMethod, value: string): string | null {
  const v = value.trim();
  if (!v) return method === "email" ? "Enter your email address." : "Enter your mobile number.";
  if (method === "email") return EMAIL_PATTERN.test(v) ? null : "Enter a valid email address, e.g. name@example.com.";
  return normalisePhone(v) ? null : "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.";
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export type UserRole = "CITIZEN" | "VOLUNTEER" | "GOVERNMENT_OFFICER" | "NGO" | "EMERGENCY_RESPONDER";

export interface Profile {
  fullName: string;
  email: string;
  phone: string; // +91XXXXXXXXXX
  role: UserRole;
  organisation?: string;
  state: string;
  city: string;
  updatedAt: string;
}

// Profiles are stored per account so different logins keep their own details
const profileKey = (identifier: string) => `resq-profile:${identifier}`;

function readProfile(session: Session | null): Profile | null {
  if (!session) return null;
  try {
    const raw = localStorage.getItem(profileKey(session.identifier));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  login: (method: LoginMethod, identifier: string, password: string) => string | null;
  saveProfile: (profile: Omit<Profile, "updatedAt">) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession);
  const [profile, setProfile] = useState<Profile | null>(() => readProfile(readSession()));

  /** Returns an error message, or null on success. */
  const login = (method: LoginMethod, identifier: string, password: string): string | null => {
    const invalid = validateIdentifier(method, identifier);
    if (invalid) return invalid;
    if (password !== DEV_PASSWORD) return "Incorrect password.";
    const next: Session = {
      method,
      identifier: method === "email" ? identifier.trim().toLowerCase() : normalisePhone(identifier)!,
      loggedInAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — session lasts for this tab only */
    }
    setSession(next);
    setProfile(readProfile(next));
    return null;
  };

  const saveProfile = (input: Omit<Profile, "updatedAt">) => {
    if (!session) return;
    const next: Profile = { ...input, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(profileKey(session.identifier), JSON.stringify(next));
    } catch {
      /* storage unavailable — profile lasts for this tab only */
    }
    setProfile(next);
  };

  const logout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, login, saveProfile, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * Sends signed-out visitors to /login, and signed-in users without a profile
 * to /profile, remembering where they were going.
 */
export function RequireAuth({ children, allowIncompleteProfile = false }: { children: ReactNode; allowIncompleteProfile?: boolean }) {
  const { session, profile } = useAuth();
  const location = useLocation();
  const from = location.pathname + location.search;
  if (!session) return <Navigate to="/login" replace state={{ from }} />;
  if (!profile && !allowIncompleteProfile) return <Navigate to="/profile" replace state={{ from }} />;
  return <>{children}</>;
}
