import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { LegalLinks } from "./LegalLinks";
import { NotificationsProvider } from "../../context/NotificationsContext";
import { NotificationBell } from "../notifications/NotificationBell";

export function DashboardLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const activePage =
    location.pathname === "/calculator" ? "calculator" : "";

  const navigateTo = (id) => {
    setSidebarOpen(false);
    if (id === "calculator") {
      navigate("/calculator");
    } else {
      navigate(`/dashboard?page=${id}`);
    }
  };

  return (
    // Der Provider umschließt die gesamte Shell: Zustand und Polling des
    // Benachrichtigungscenters laufen dadurch genau EINMAL, unabhängig davon,
    // wie viele Glockenknöpfe darin gerendert werden.
    <NotificationsProvider>
    <div className="app-shell">
      <DashboardSidebar
        page={activePage}
        navigateTo={navigateTo}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <main className="main-content">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <Icon n="menu" s={22} />
          </button>
          <div className="topbar-brand">ConfidaraExpress</div>
          <div className="topbar-right">
            <NotificationBell variant="topbar" navigateTo={navigateTo} />
            <div className="user-avatar">{initials}</div>
          </div>
        </div>
        {activePage === "calculator" && (
          <DashboardSectionHeader
            title="Preisrechner"
            subtitle="Berechnen Sie Versandkosten transparent auf Basis aktueller Carrier-Tarife."
          />
        )}
        <Outlet />
        <LegalLinks />
      </main>
      </div>
    </NotificationsProvider>
  );
}
