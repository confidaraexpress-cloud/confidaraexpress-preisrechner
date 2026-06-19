import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { Overview } from "../components/dashboard/Overview";
import { ShipmentsList } from "../components/dashboard/ShipmentsList";
import { InvoicesList } from "../components/dashboard/InvoicesList";
import { Profile } from "../components/dashboard/Profile";
import { DashboardSidebar } from "../components/layout/DashboardSidebar";
import { DashboardSectionHeader } from "../components/layout/DashboardSectionHeader";
import { LegalLinks } from "../components/layout/LegalLinks";
import { useAuth } from "../context/AuthContext";

const NewShipmentPage = React.lazy(() => import("./NewShipmentPage"));

// Übersicht hat keinen Eintrag: Titel/Subline laufen dort über den Overview-Hero,
// damit kein doppelter Seitenkopf entsteht.
const PAGE_HEADERS = {
  new: {
    title: "Neue Sendung",
    subtitle: "Führen Sie neue Versandaufträge sicher und nachvollziehbar durch den Buchungsprozess.",
  },
  shipments: {
    title: "Sendungen",
    subtitle: "Alle Versandaufträge übersichtlich dokumentiert und jederzeit nachverfolgbar.",
  },
  invoices: {
    title: "Rechnungen",
    subtitle: "Verlässliche Kostenübersicht für Ihre gebuchten Versanddienstleistungen.",
  },
  profile: {
    title: "Mein Profil",
    subtitle: "Verwalten Sie Ihre Unternehmens- und Kontodaten sicher an einem Ort.",
  },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bookingToast, setBookingToast] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setLoadError("");
    Promise.all([
      apiFetch(`/kunde/shipments`, { auth: true }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      apiFetch(`/kunde/invoices`,  { auth: true }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ]).then(([s, inv]) => {
      setShipments(s.shipments || []);
      setInvoices(inv.invoices || []);
      setLoading(false);
    }).catch(() => {
      setLoadError("Daten konnten nicht geladen werden. Bitte laden Sie die Seite neu.");
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Show success toast when returning from a completed booking
  useEffect(() => {
    if (location.state?.justBooked) {
      setBookingToast(true);
      navigate(location.pathname, { replace: true, state: {} });
      const t = setTimeout(() => setBookingToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();
  // Navigate from calculator route back into dashboard pages
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("page");
    if (p && ["overview", "new", "shipments", "invoices", "profile"].includes(p)) {
      setPage(p);
      navigate("/dashboard", { replace: true });
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = (id) => {
    if (id === "calculator") { navigate("/calculator"); return; }
    setPage(id);
    setSidebarOpen(false);
  };

  return (
    <div className={`app-shell${page === "overview" ? " ce-dark" : ""}${(page === "shipments" || page === "invoices") ? " dashboard-soft-premium" : ""}`}>
      <DashboardSidebar
        page={page}
        navigateTo={navigateTo}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <main className="main-content">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}><Icon n="menu" s={22} /></button>
          <div className="topbar-brand">ConfidaraExpress</div>
          <div className="user-avatar">{initials}</div>
        </div>

        {bookingToast && (
          <div className="alert-wrapper">
            <div className="alert alert-success">
              <Icon n="shield" s={16} /> Sendung erfolgreich gebucht! Ihre Sendungsliste wurde aktualisiert.
            </div>
          </div>
        )}

        {loadError && (
          <div className="alert-wrapper">
            <div className="alert alert-error" style={{ gap: 8 }}>
              <Icon n="x" s={16} />{loadError}
            </div>
          </div>
        )}

        {PAGE_HEADERS[page] && (
          <DashboardSectionHeader title={PAGE_HEADERS[page].title} subtitle={PAGE_HEADERS[page].subtitle} />
        )}

        {page === "overview" && (
          <Overview
            user={user}
            shipments={shipments}
            invoices={invoices}
            loading={loading}
            onNewShipment={() => setPage("new")}
            onAllShipments={() => setPage("shipments")}
          />
        )}

        {page === "new" && (
          <div className="page-body">
            <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
              <NewShipmentPage />
            </Suspense>
          </div>
        )}

        {page === "shipments" && <ShipmentsList shipments={shipments} loading={loading} />}
        {page === "invoices"  && <InvoicesList  invoices={invoices}   loading={loading} />}
        {page === "profile"   && <Profile user={user} />}

        {page !== "overview" && <LegalLinks />}
      </main>
    </div>
  );
}
