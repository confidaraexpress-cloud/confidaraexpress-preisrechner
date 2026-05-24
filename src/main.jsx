import React, { Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import "./styles.css";
import { Icon } from "./components/ui/Icon";
import { AuthProvider, useAuth } from "./context/AuthContext";

const AuthPage      = React.lazy(() => import("./pages/AuthPage"));
const CalculatorPage = React.lazy(() => import("./pages/CalculatorPage"));
const BookingPage   = React.lazy(() => import("./pages/BookingPage"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const TrackingPage  = React.lazy(() => import("./pages/TrackingPage"));

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#070f20" }}>
      <div className="text-center">
        <div className="logo-mark" style={{ margin: "0 auto 16px", width: 48, height: 48, fontSize: 20 }}>CE</div>
        <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto" }} />
      </div>
    </div>
  );
}

// ─── Scroll to top on route change ───────────────────────────────────────────
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ─── Protected route ─────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { authed, loadingUser } = useAuth();
  if (loadingUser) return <LoadingScreen />;
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const { authed } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <button className="hamburger-btn" onClick={() => setDrawerOpen(true)}><Icon n="menu" s={22} /></button>
          <div className="navbar-logo" onClick={() => navigate("/login")}>
            <div className="logo-mark">CE</div>
            <span className="logo-text">ConfidaraExpress</span>
          </div>
          <ul className="navbar-nav">
            <li><a onClick={() => navigate("/calculator")}>Preisrechner</a></li>
            <li><a onClick={() => navigate("/tracking")}>Tracking</a></li>
          </ul>
          <div className="navbar-actions">
            {authed ? (
              <button className="btn btn-primary btn-sm" onClick={() => navigate("/dashboard")}>Dashboard</button>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm navbar-login-btn" onClick={() => navigate("/login")}>Anmelden</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate("/register")}>Registrieren</button>
              </>
            )}
          </div>
        </div>
      </nav>
      {drawerOpen && (
        <>
          <div className="sidebar-overlay open" onClick={() => setDrawerOpen(false)} style={{ zIndex: 998 }} />
          <div className="mobile-drawer open" style={{ zIndex: 999 }}>
            <div className="mobile-drawer-header">
              <div className="navbar-logo"><div className="logo-mark">CE</div><span className="logo-text">ConfidaraExpress</span></div>
              <button className="drawer-close-btn" onClick={() => setDrawerOpen(false)}><Icon n="close" s={20} /></button>
            </div>
            <nav className="mobile-drawer-nav">
              <button className="drawer-nav-item" onClick={() => { navigate("/calculator"); setDrawerOpen(false); }}><Icon n="zap" s={18} /> Preisrechner</button>
              <button className="drawer-nav-item" onClick={() => { navigate("/tracking"); setDrawerOpen(false); }}><Icon n="map" s={18} /> Tracking</button>
              {authed ? (
                <button className="drawer-nav-item" onClick={() => { navigate("/dashboard"); setDrawerOpen(false); }}><Icon n="dashboard" s={18} /> Dashboard</button>
              ) : (
                <>
                  <button className="drawer-nav-item" onClick={() => { navigate("/login"); setDrawerOpen(false); }}><Icon n="user" s={18} /> Anmelden</button>
                  <div className="drawer-cta"><button className="btn btn-primary btn-full" onClick={() => { navigate("/register"); setDrawerOpen(false); }}>Registrieren</button></div>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}

// ─── Layout with Navbar ───────────────────────────────────────────────────────
function NavbarLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const { authed, loadingUser } = useAuth();
  if (loadingUser) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <ScrollToTop />
      <Routes>
        <Route path="/login"    element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route element={<NavbarLayout />}>
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/tracking"   element={<TrackingPage />} />
          <Route path="/booking"    element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
        </Route>
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route index element={<Navigate to={authed ? "/dashboard" : "/calculator"} replace />} />
        <Route path="*" element={<Navigate to="/calculator" replace />} />
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
