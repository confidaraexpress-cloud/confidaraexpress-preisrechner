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
import { BrandLogo } from "../ui/BrandLogo";

// Seitenköpfe der beiden route-basierten Versandseiten (Paket B) — dasselbe
// Prinzip wie PAGE_HEADERS in DashboardPage.jsx, nur für die zwei Seiten, die
// über echte Routen statt page-State laufen. Eyebrow "Versand" einheitlich
// über den ganzen Versandprozess (Preisrechner, Buchung).
const ROUTE_HEADERS = {
  calculator: {
    eyebrow: "Versand",
    title: "Preisrechner",
    subtitle: "Berechnen Sie Versandkosten transparent auf Basis aktueller Carrier-Tarife.",
  },
  booking: {
    eyebrow: "Versand",
    title: "Sendung buchen",
    subtitle: "Schließen Sie Ihre Versandbuchung sicher und nachvollziehbar ab.",
  },
};

export function DashboardLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);


  // Sidebar-Markierung für die route-basierten Seiten. Die beiden Detailseiten
  // des Lagermoduls markieren bewusst ihren LISTENbereich (Artikel bzw.
  // Aufträge) — der Kunde soll sehen, wo er sich befindet, und der Bereich hat
  // keinen eigenen Navigationseintrag.
  const activePage =
    location.pathname === "/calculator" ? "calculator" :
    location.pathname === "/booking"    ? "booking"    :
    location.pathname.startsWith("/inventory/products") ? "products" :
    location.pathname.startsWith("/inventory/orders")   ? "orders"   : "";

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
          <BrandLogo variant="signet" tone="standard" className="topbar-brand" />
          {/* Menü, Wortmarke, Glocke — keine zweite Identität neben der
              Firmenkarte der Sidebar (Paket A, Phase 3). */}
          <div className="topbar-right">
            <NotificationBell variant="topbar" navigateTo={navigateTo} />
          </div>
        </div>
        {ROUTE_HEADERS[activePage] && (
          <DashboardSectionHeader
            eyebrow={ROUTE_HEADERS[activePage].eyebrow}
            title={ROUTE_HEADERS[activePage].title}
            subtitle={ROUTE_HEADERS[activePage].subtitle}
            utility={(
              <UtilityCluster>
                <NotificationBell variant="page" navigateTo={navigateTo} />
                <UserChip user={user} onClick={() => navigateTo("profile")} />
              </UtilityCluster>
            )}
          />
        )}
        {/* Die Detailseiten des Lagermoduls bringen ihren eigenen <PageHeader>
            mit (Titel = Artikel- bzw. Auftragsnummer, Zurück-Link in den Kopf).
            Sie bekommen deshalb KEINEN ROUTE_HEADERS-Eintrag — sonst stünden
            zwei Seitenköpfe übereinander — wohl aber denselben Utility-Cluster
            wie jede andere Kundenseite, damit Glocke und Benutzerchip überall an
            derselben Stelle sitzen. */}
        <Outlet context={{
          navigateTo,
          utility: (
            <UtilityCluster>
              <NotificationBell variant="page" navigateTo={navigateTo} />
              <UserChip user={user} onClick={() => navigateTo("profile")} />
            </UtilityCluster>
          ),
        }} />
        <LegalLinks />
      </main>
      </div>
    </NotificationsProvider>
  );
}
