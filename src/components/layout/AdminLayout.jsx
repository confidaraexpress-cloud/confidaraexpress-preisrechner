import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AdminSidebar, ADMIN_NAV_ID } from "./AdminSidebar";
import { useCeBereich } from "../../hooks/useCeBereich";
import { ContentErrorBoundary } from "../common/ContentErrorBoundary";
import { AppStatusNotice } from "../common/AppStatusNotice";
import { StepUpBestaetigung } from "../admin/StepUpBestaetigung";
import { Icon, ICON_SIZE } from "../ui/Icon";
import { NavSymbol } from "./NavSymbol";
import { setPasskeySetupHandler } from "../../api/client";
import { APP_NOTICE_TEXT } from "../../utils/appVersionCheck.mjs";
import {
  ADMIN_TABS, ADMIN_SUCHE_PFAD, ADMIN_SICHERHEIT_PFAD, aktiverAdminTab, adminLeistenTitel,
} from "../../utils/adminMobilNavigation.mjs";

// Eigenständiger Adminbereich-Rahmen (adm- Prefix, URL-basiertes Routing). Kein
// Bezug zum State-basierten Kunden-Dashboard und keine Vermischung mit den
// auth-Themes. Die eigentlichen Seiten werden über <Outlet /> gerendert. Das
// Material ist seit dem Betreiberauftrag vom 2026-11-17 dunkel (Confidara
// Leitstand Nacht, styles/admin-nacht.css); Struktur und Geometrie blieben.
//
// Seit dem Redesign (2026-10) dieselbe Geometrie wie die Kunden-Shell:
// Sidebar (248 px, Trennlinie statt Schatten), reine Textnavigation.
//
// Admin-App am Telefon (Betreiberauftrag 2026-11-22, D4): unter 900 px oben eine
// Leiste mit dem Bereich der Seite und der Suche, unten eine feste Leiste mit
// Übersicht, Sendungen, Kunden, Rechnungen und „Mehr“. „Mehr“ öffnet die
// vollständige Navigation (dieselbe Seitenleiste als Drawer, mit Fokusfalle,
// Escape und Fokus zurück) — jede Adminseite bleibt erreichbar. „Mehr“ hat die
// Rolle des früheren Menüknopfs der oberen Leiste übernommen: zugänglicher
// Name, aria-expanded und aria-controls auf den Drawer.
export function AdminLayout() {
  // Bereich „admin“: eigene dunkle Ebene Confidara Leitstand Nacht (hooks/useCeBereich.js; admin-nacht.css).
  useCeBereich("admin");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const close = () => setSidebarOpen(false);
  const aktiv = aktiverAdminTab(pathname);

  // Passkey-Pflicht (428 PASSKEY_SETUP_REQUIRED, api/client.js): die Sitzung ist gültig, nur der zweite Faktor fehlt —
  // keine Abmeldung, sondern die Sicherheitsseite mit dem Einrichten. Beim Verlassen des Adminbereichs abgemeldet.
  useEffect(() => {
    setPasskeySetupHandler(() => {
      navigate(ADMIN_SICHERHEIT_PFAD, {
        state: { sicherheitsHinweis: "Für diese Aktion ist ein Passkey erforderlich. Bitte richten Sie zuerst einen Passkey ein." },
      });
    });
    return () => setPasskeySetupHandler(null);
  }, [navigate]);

  return (
    <div className="adm-shell">
      <AdminSidebar open={sidebarOpen} onClose={close} />
      <main className="adm-main">
        <div className="adm-topbar">
          <span className="adm-topbar-title">{adminLeistenTitel(pathname)}</span>
          <Link
            to={ADMIN_SUCHE_PFAD}
            className="adm-topbar-suche"
            aria-label="Sendung, Kunde oder Rechnung suchen"
            title="Suchen"
            aria-current={pathname.startsWith(ADMIN_SUCHE_PFAD) ? "page" : undefined}
          >
            <Icon n="search" s={ICON_SIZE.lg} />
          </Link>
        </div>
        <AppStatusNotice offlineText={APP_NOTICE_TEXT.offlineAdmin} />
        {/* Fehlergrenze um den Inhalt des Adminbereichs. Adminsidebar und
            Leisten bleiben stehen; der Schlüssel ist der Pfad, damit ein Fehler
            auf einer Detailseite die nächste Liste nicht blockiert. Der
            Adminbereich hat seinen eigenen Rahmen (`.adm-page`) und läuft
            nicht durch `.page-body`. */}
        <ContentErrorBoundary key={pathname} bereich="admin" wrapperClassName="adm-page">
          <Outlet />
        </ContentErrorBoundary>
      </main>
      <nav className="adm-tabs" aria-label="Hauptbereiche">
        {ADMIN_TABS.map((t) => (
          <Link key={t.id} to={t.to} className={`adm-tab${aktiv === t.id ? " adm-tab-on" : ""}`}
            aria-current={aktiv === t.id ? "page" : undefined} onClick={close}>
            <span className="adm-tab-icon" aria-hidden="true"><NavSymbol n={t.icon} s={ICON_SIZE.md} /></span>
            <span className="adm-tab-text">{t.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`adm-tab adm-tab-mehr${aktiv === "mehr" ? " adm-tab-on" : ""}`}
          onClick={() => setSidebarOpen(true)}
          aria-expanded={sidebarOpen}
          aria-controls={ADMIN_NAV_ID}
        >
          <span className="adm-tab-icon" aria-hidden="true"><Icon n="dots" s={ICON_SIZE.md} /></span>
          <span className="adm-tab-text">Mehr</span>
          {aktiv === "mehr" && <span className="sr-only"> (aktueller Bereich)</span>}
        </button>
      </nav>
      {/* Sicherheitsbestätigung kritischer Aktionen (428 STEP_UP_REQUIRED): ein Dialog für den ganzen Adminbereich. */}
      <StepUpBestaetigung />
    </div>
  );
}
