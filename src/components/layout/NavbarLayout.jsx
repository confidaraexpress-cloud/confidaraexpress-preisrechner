import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { BrandLogo } from "../ui/BrandLogo";
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
          {/* Die Marke führt zum Login — vorher ein <div> mit onClick, also für
              Tastatur und Screenreader gar kein Bedienelement. Jetzt ein echter
              Button; die Beschriftung liefert die sichtbare Wortmarke. */}
          <button type="button" className="navbar-logo" onClick={() => navigate("/login")}>
            {/* Die reine Wortmarke (Band ohne Signet, 8,71:1) — kein Chip: eine
                horizontale Textmarke gehört nicht in eine quadratische Fläche.
                Größe gemessen, nicht geschätzt: bei 360 px ist bei 20 px Höhe
                Schluss (22 px sprengt bereits die Zeile), ab 500 px bleibt bis
                mindestens 32 px Luft. 20 px passt nachweislich auf jeder
                Breite von 360 bis 1440 px — ein einheitlicher Wert genügt. */}
            <BrandLogo variant="wordmark" tone="standard" />
          </button>
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
          {/* Der Drawer lag bisher UNTER der fixierten Navigationsleiste
              (999 gegen 1000): sein Kopf war dadurch verdeckt — bereits auf
              origin/main, dort nur weniger sichtbar, weil er eine flache Zeile
              trug. Mit der Originalkomposition zerschneidet die Leiste die
              Marke sichtbar. Eine Stufe darüber genügt; das Overlay (998) und
              die Leiste selbst bleiben unverändert. */}
          <div className="mobile-drawer open" style={{ zIndex: 1001 }}>
            <div className="mobile-drawer-header">
              {/* Der Drawer ist dunkel (#0a1628) — hier gilt die Reverse-
                  Variante (Standard misst dort 1,05:1). Anders als die flache
                  Leiste hat er Höhe für die volle Originalkomposition. */}
              <BrandLogo variant="lockup" tone="reverse" />
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
