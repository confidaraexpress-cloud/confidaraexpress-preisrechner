import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { Footer } from "./Footer";

function Navbar() {
  const { authed } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <button className="hamburger-btn" aria-label="Navigation öffnen" onClick={() => setDrawerOpen(true)}><Icon n="menu" s={22} /></button>
          <div className="navbar-logo" onClick={() => navigate("/login")}>
            <div className="logo-mark">CE</div>
            <span className="logo-text">ConfidaraExpress</span>
          </div>
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
              <button className="drawer-close-btn" aria-label="Navigation schließen" onClick={() => setDrawerOpen(false)}><Icon n="close" s={20} /></button>
            </div>
            <nav className="mobile-drawer-nav">
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

export function NavbarLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      <Footer />
    </>
  );
}
