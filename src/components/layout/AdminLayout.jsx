import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AdminSidebar, ADMIN_NAV_ID } from "./AdminSidebar";
import { useCeBereich } from "../../hooks/useCeBereich";
import { ContentErrorBoundary } from "../common/ContentErrorBoundary";
import { Icon, ICON_SIZE } from "../ui/Icon";

// Eigenständiger Adminbereich-Rahmen (adm- Prefix, URL-basiertes Routing). Kein
// Bezug zum State-basierten Kunden-Dashboard und keine Vermischung mit den
// auth-Themes. Die eigentlichen Seiten werden über <Outlet /> gerendert. Das
// Material ist seit dem Betreiberauftrag vom 2026-11-17 dunkel (Confidara
// Leitstand Nacht, styles/admin-nacht.css); Struktur und Geometrie blieben.
//
// Seit dem Redesign (2026-10) dieselbe Geometrie wie die Kunden-Shell:
// Sidebar (248 px, Trennlinie statt Schatten), reine Textnavigation. Die mobile
// Topbar trägt seit der Betreiberentscheidung 2026-10-17 wieder das
// Hamburger-Symbol (statt des Textknopfs „Menü“) — mit unverändertem
// zugänglichem Namen, aria-expanded und aria-controls auf den Drawer.
export function AdminLayout() {
  // Bereich „admin“: eigene dunkle Ebene Confidara Leitstand Nacht (hooks/useCeBereich.js; admin-nacht.css).
  useCeBereich("admin");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const close = () => setSidebarOpen(false);

  return (
    <div className="adm-shell">
      <AdminSidebar open={sidebarOpen} onClose={close} />
      <main className="adm-main">
        <div className="adm-topbar">
          <button
            type="button"
            className="adm-topbar-burger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menü öffnen"
            title="Menü öffnen"
            aria-expanded={sidebarOpen}
            aria-controls={ADMIN_NAV_ID}
          >
            <Icon n="menu" s={ICON_SIZE.lg} />
          </button>
          <span className="adm-topbar-title">Adminbereich</span>
          <span className="adm-topbar-spacer" aria-hidden="true" />
        </div>
        {/* Fehlergrenze um den Inhalt des Adminbereichs. Adminsidebar und
            Topbar bleiben stehen; der Schlüssel ist der Pfad, damit ein Fehler
            auf einer Detailseite die nächste Liste nicht blockiert. Der
            Adminbereich hat seinen eigenen Rahmen (`.adm-page`) und läuft
            nicht durch `.page-body`. */}
        <ContentErrorBoundary key={pathname} bereich="admin" wrapperClassName="adm-page">
          <Outlet />
        </ContentErrorBoundary>
      </main>
    </div>
  );
}
