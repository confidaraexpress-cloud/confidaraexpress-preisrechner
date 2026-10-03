import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BrandLogo } from "../ui/BrandLogo";
import { Footer } from "./Footer";
import { ContentErrorBoundary } from "../common/ContentErrorBoundary";

/* Öffentliche Leiste der Leseseiten (Redesign 2026-10): hell, ruhig, ohne
   Symbole. Links die Original-Wortmarke, rechts die unveränderten Aktionen;
   mobil öffnet der Textknopf „Menü" den dunklen Navy-Drawer. Routing und
   Handler sind unverändert. */
function Navbar() {
  const { authed } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <button type="button" className="hamburger-btn" aria-label="Menü – Navigation öffnen" onClick={() => setDrawerOpen(true)}>
            Menü
          </button>
          {/* Die Marke führt zum Login — ein echter Button. Sein zugänglicher
              Name ist der alt-Text der Original-Wortmarke („ConfidaraExpress").
              Flache helle Leiste → reine Wortmarke in der Standardfassung. */}
          <button type="button" className="navbar-logo" onClick={() => navigate("/login")}>
            <BrandLogo variant="wordmark" tone="standard" />
          </button>
          <div className="navbar-actions">
            {authed ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate("/dashboard")}>Dashboard</button>
            ) : (
              <>
                <button type="button" className="btn btn-ghost btn-sm navbar-login-btn" onClick={() => navigate("/login")}>Anmelden</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate("/register")}>Registrieren</button>
              </>
            )}
          </div>
        </div>
      </nav>
      {drawerOpen && (
        <>
          <div className="sidebar-overlay open" onClick={() => setDrawerOpen(false)} style={{ zIndex: 998 }} />
          {/* Der Drawer liegt eine Stufe über der fixierten Leiste (1001 gegen
              1000), sonst verdeckte die Leiste seinen Kopf. Er trägt die dunkle
              Navy-Fläche der Sidebar (dashboard.css) — die Marke steht deshalb
              als Originalkomposition in der Reverse-Fassung, „Schließen" als Text. */}
          <div className="mobile-drawer open" style={{ zIndex: 1001 }}>
            <div className="mobile-drawer-header">
              <BrandLogo variant="lockup" tone="reverse" className="navbar-drawer-brand" />
              <button type="button" className="drawer-close-btn" aria-label="Navigation schließen" onClick={() => setDrawerOpen(false)}>
                Schließen
              </button>
            </div>
            <nav className="mobile-drawer-nav">
              {authed ? (
                <button type="button" className="drawer-nav-item" onClick={() => { navigate("/dashboard"); setDrawerOpen(false); }}>Dashboard</button>
              ) : (
                <>
                  <button type="button" className="drawer-nav-item" onClick={() => { navigate("/login"); setDrawerOpen(false); }}>Anmelden</button>
                  <div className="drawer-cta"><button type="button" className="btn btn-primary btn-full" onClick={() => { navigate("/register"); setDrawerOpen(false); }}>Registrieren</button></div>
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
  const { pathname } = useLocation();
  return (
    <>
      <Navbar />
      {/* Fehlergrenze um den Inhalt der öffentlichen Seiten (Tracking,
          Impressum, Datenschutz, AGB, Widerruf, Versicherungsinformationen).
          Navigationsleiste und Fußzeile bleiben dadurch stehen — der Besucher
          kommt weiter, statt vor einer weißen Seite zu stehen. Der Schlüssel
          ist der Pfad: ein Fehler auf der verlassenen Seite darf die nächste
          nicht blockieren. Diese Seiten laufen NICHT durch `.page-body` —
          deshalb ihr eigener Rahmen `.container`. */}
      <ContentErrorBoundary key={pathname} bereich="oeffentlich" wrapperClassName="container">
        <Outlet />
      </ContentErrorBoundary>
      <Footer />
    </>
  );
}
