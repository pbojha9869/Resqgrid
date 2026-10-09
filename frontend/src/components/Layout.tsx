import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Map,
  Bell,
  ShieldAlert,
  Building2,
  Info,
  Activity,
  Siren,
  HeartPulse,
  UserRound,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth";

const navGroups = [
  {
    label: "Monitor",
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
      { path: "/map", label: "Risk Map", icon: Map },
      { path: "/alerts", label: "Alerts", icon: Bell },
      { path: "/risk", label: "Risk Analysis", icon: ShieldAlert },
    ],
  },
  {
    label: "Respond",
    items: [
      { path: "/resources", label: "Resources", icon: Building2 },
      { path: "/evacuation", label: "Evacuation", icon: Siren },
      { path: "/rescue", label: "Rescue", icon: HeartPulse },
    ],
  },
  {
    label: "Platform",
    items: [
      { path: "/profile", label: "Profile", icon: UserRound },
      { path: "/about", label: "About", icon: Info },
    ],
  },
];

type Health = "checking" | "online" | "offline";

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <Activity className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-slate-900">ResQGrid</p>
        <p className="text-[11px] text-slate-500">Disaster Risk Intelligence</p>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="eyebrow mb-1.5 px-3">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function StatusFooter({ health, demoMode }: { health: Health; demoMode: boolean }) {
  const { session, profile, logout } = useAuth();
  const dot = health === "online" ? "bg-emerald-500" : health === "offline" ? "bg-red-500" : "bg-slate-300";
  const text = health === "online" ? "All systems online" : health === "offline" ? "Server unreachable" : "Connecting…";
  const initials = profile?.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div className="border-t border-slate-200 px-3 py-3 text-xs">
      {session && (
        <div className="mb-2 flex items-center gap-1">
          <Link
            to="/profile"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
            title="View or edit your profile"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-700">
              {initials || <UserRound className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{profile?.fullName || "Your profile"}</p>
              <p className="truncate text-[11px] text-slate-500">{session.identifier}</p>
            </div>
          </Link>
          <button onClick={logout} className="icon-btn h-8 w-8 shrink-0" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 px-2 text-slate-600">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {text}
      </div>
      {demoMode && <p className="mt-1 px-2 text-amber-700">Demo data is enabled</p>}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [health, setHealth] = useState<Health>("checking");
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    const check = () =>
      api
        .getHealth()
        .then((res) => {
          setHealth("online");
          setDemoMode(res.demoMode);
        })
        .catch(() => setHealth("offline"));
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  // Close the mobile drawer whenever the route changes
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-white lg:flex">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-5 py-4">
          <Brand />
        </div>
        <NavList />
        <StatusFooter health={health} demoMode={demoMode} />
      </aside>

      {/* Top bar — mobile */}
      <header className="sticky top-0 z-[1100] flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Brand />
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Drawer — mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-[1200] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <Brand />
              <button className="icon-btn -mr-2" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setMenuOpen(false)} />
            <StatusFooter health={health} demoMode={demoMode} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
