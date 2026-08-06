import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { LegalLinks } from "./LegalLinks";
import { NotificationsProvider } from "../../context/NotificationsContext";
import { NotificationBell } from "../notifications/NotificationBell";
import { UtilityCluster } from "../ui/PageHeader";
import { UserChip } from "../ui/UserChip";

export function DashboardLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);


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
          <button className="hamburger-btn" aria-label="Navigation öffnen" onClick={() => setSidebarOpen(true)}>
            <Icon n="menu" s={22} />
          </button>
          <div className="topbar-brand">ConfidaraExpress</div>
          {/* Menü, Wortmarke, Glocke — keine zweite Identität neben der
              Firmenkarte der Sidebar (Paket A, Phase 3). */}
          <div className="topbar-right">
            <NotificationBell variant="topbar" navigateTo={navigateTo} />
          </div>
        </div>
        {activePage === "calculator" && (
          <DashboardSectionHeader
            title="Preisrechner"
            subtitle="Berechnen Sie Versandkosten transparent auf Basis aktueller Carrier-Tarife."
            utility={(
              <UtilityCluster>
                <NotificationBell variant="page" navigateTo={navigateTo} />
                <UserChip user={user} onClick={() => navigateTo("profile")} />
              </UtilityCluster>
            )}
          />
        )}
        <Outlet />
        <LegalLinks />
      </main>
      </div>
    </NotificationsProvider>
  );
}
