import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { AdminSidebar } from "./AdminSidebar";
import { ContentErrorBoundary } from "../common/ContentErrorBoundary";

// Eigenständiger Adminbereich-Rahmen (Light-Theme, adm- Prefix, URL-basiertes
// Routing). Kein Bezug zum State-basierten Kunden-Dashboard und keine
// Vermischung mit ce-dark-/auth-Themes. Die eigentlichen Seiten werden über
// <Outlet /> gerendert.
export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const close = () => setSidebarOpen(false);

  return (
    <div className="adm-shell">
      <AdminSidebar open={sidebarOpen} onClose={close} />
      <main className="adm-main">
        <div className="adm-topbar">
          <button
            className="adm-topbar-burger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menü öffnen"
          >
            <Icon n="menu" s={22} />
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
