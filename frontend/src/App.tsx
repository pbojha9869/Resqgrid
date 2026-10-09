import { Routes, Route, Link, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import RiskMap from "./pages/RiskMap";
import Alerts from "./pages/Alerts";
import RiskAnalysis from "./pages/RiskAnalysis";
import Resources from "./pages/Resources";
import Evacuation from "./pages/Evacuation";
import About from "./pages/About";
import Rescue from "./pages/Rescue";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import { AuthProvider, RequireAuth, useAuth } from "./auth";

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/" className="btn btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}

/**
 * First-time users complete their profile on a full-screen onboarding page;
 * afterwards /profile opens inside the normal sidebar layout for editing.
 */
function ProtectedApp() {
  const { session, profile } = useAuth();
  const location = useLocation();
  if (session && !profile && location.pathname === "/profile") return <Profile />;
  return (
    <RequireAuth>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<RiskMap />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/risk" element={<RiskAnalysis />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/evacuation" element={<Evacuation />} />
          <Route path="/rescue" element={<Rescue />} />
          <Route path="/about" element={<About />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </AuthProvider>
  );
}
