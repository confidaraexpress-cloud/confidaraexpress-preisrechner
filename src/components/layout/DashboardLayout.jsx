import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { DashboardSidebar, SIDEBAR_NAV_ID } from "./DashboardSidebar";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { LegalLinks } from "./LegalLinks";
import { NotificationsProvider } from "../../context/NotificationsContext";
import { NotificationBell } from "../notifications/NotificationBell";
import { UtilityCluster } from "../ui/PageHeader";
import { UserChip } from "../ui/UserChip";
import { BrandLogo } from "../ui/BrandLogo";
import { Icon, ICON_SIZE } from "../ui/Icon";
import { ContentErrorBoundary } from "../common/ContentErrorBoundary";
import { AppStatusNotice } from "../common/AppStatusNotice";
import { updateNoticeSuppressed } from "../../utils/appVersionCheck.mjs";
import { dashboardRouteTarget } from "../../utils/dashboardRouteTarget.mjs";
import { useCeBereich } from "../../hooks/useCeBereich";

// Seitenköpfe der beiden route-basierten Versandseiten (Paket B) — dasselbe
// Prinzip wie PAGE_HEADERS in DashboardPage.jsx, nur für die zwei Seiten, die
// über echte Routen statt page-State laufen. Eyebrow "Versand" einheitlich
// über den ganzen Versandprozess (Preisrechner, Buchung).
const ROUTE_HEADERS = {
  calculator: {
    eyebrow: "Versand",
    title: "Versandkostenrechner",
    subtitle: "Berechnen Sie Versandkosten transparent auf Basis aktueller Carrier-Tarife.",
  },
  booking: {
    eyebrow: "Versand",
    title: "Sendung buchen",
    subtitle: "Schließen Sie Ihre Versandbuchung sicher und nachvollziehbar ab.",
    // Titel und Untertitel auf der Achse der zentrierten Buchungsspalte (Feinschliff 2026-10);
    // die Utility-Zeile bleibt am gemeinsamen Rahmen.
    className: "ce-page-header--booking",
  },
};

export function DashboardLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Premium-Redesign Etappe 1: Bereichs-Scope des Kundenbereichs (hooks/useCeBereich.js).
  useCeBereich("kunde");


  // Sidebar-Markierung für die route-basierten Seiten. Die beiden Detailseiten
  // des Lagermoduls markieren bewusst ihren LISTENbereich (Artikel bzw.
  // Aufträge) — der Kunde soll sehen, wo er sich befindet, und der Bereich hat
  // keinen eigenen Navigationseintrag.
  const activePage =
    location.pathname === "/calculator" ? "calculator" :
    location.pathname === "/booking"    ? "booking"    :
    location.pathname.startsWith("/inventory/products") ? "products" :
    location.pathname.startsWith("/inventory/orders")   ? "orders"   : "";

  // Dieselbe Signatur wie DashboardPage.navigateTo. Einen Verlassen-Guard gibt
  // es auf diesen Routen nicht — die Folgeaktion des Ziels läuft sofort. Die
  // Ticket-ID einer Supportmitteilung reist in der Adresse mit (F1).
  const navigateTo = (id, filter = null, onCommit = null) => {
    setSidebarOpen(false);
    navigate(dashboardRouteTarget(id, filter));
    if (onCommit) onCommit();
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
        {/* Menü, Marke, Mitteilungen — keine zweite Identität neben der Sidebar (Paket A,
            Phase 3). Menü und Mitteilungen als Symbolknöpfe mit unverändertem zugänglichem
            Namen, dazu aria-expanded/aria-controls (Betreiberentscheidung 2026-10-17). */}
        <div className="mobile-topbar">
          <button
            type="button"
            className="hamburger-btn"
            aria-label="Menü – Navigation öffnen"
            title="Menü – Navigation öffnen"
            aria-expanded={sidebarOpen}
            aria-controls={SIDEBAR_NAV_ID}
            onClick={() => setSidebarOpen(true)}
          >
            <Icon n="menu" s={ICON_SIZE.lg} />
          </button>
          <BrandLogo variant="signet" tone="standard" className="topbar-brand" />
          <div className="topbar-right">
            <NotificationBell variant="topbar" navigateTo={navigateTo} />
          </div>
        </div>
        {/* Offline-/Versionshinweis. Auf der Buchungsseite kein
            Versionshinweis: ein Neuladen kostete den laufenden Vorgang. */}
        <AppStatusNotice suppressUpdate={updateNoticeSuppressed({ pathname: location.pathname })} />
        <ContentErrorBoundary key={location.pathname}>
        {ROUTE_HEADERS[activePage] && (
          <DashboardSectionHeader
            eyebrow={ROUTE_HEADERS[activePage].eyebrow}
            title={ROUTE_HEADERS[activePage].title}
            subtitle={ROUTE_HEADERS[activePage].subtitle}
            className={ROUTE_HEADERS[activePage].className}
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
        </ContentErrorBoundary>
        <LegalLinks />
      </main>
      </div>
    </NotificationsProvider>
  );
}
