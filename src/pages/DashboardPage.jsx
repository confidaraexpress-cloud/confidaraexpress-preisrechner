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
import { PremiumBackground } from "../components/dashboard/PremiumBackground";
import { useAuth } from "../context/AuthContext";

const NewShipmentPage  = React.lazy(() => import("./NewShipmentPage"));
const TrackingPage     = React.lazy(() => import("./TrackingPage"));
const AddressBookPage  = React.lazy(() => import("./AddressBookPage"));
const DraftsPage       = React.lazy(() => import("./DraftsPage"));

// Übersicht und Profil haben keinen Eintrag: Die Übersicht nutzt den Overview-Hero,
// das Profil rendert seinen eigenen Seitenkopf inkl. „Profil bearbeiten“-Button
// (Profile.jsx). So entsteht auf keiner Seite ein doppelter Seitenkopf.
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
  // Adressbuch → „Neue Sendung": reiner Werte-Patch (s_*/r_*-Formfelder), KEINE
  // dauerhafte addressId-Referenz. Wird einmalig beim Mount von NewShipmentPage
  // angewendet und danach über onPrefillApplied hier zurückgesetzt.
  const [addressPrefill, setAddressPrefill] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setLoadError("");
    const toErr = (r) => { const e = new Error(); e.status = r.status; return e; };
    Promise.all([
      apiFetch(`/kunde/shipments`, { auth: true }).then(r => { if (!r.ok) throw toErr(r); return r.json(); }),
      apiFetch(`/kunde/invoices`,  { auth: true }).then(r => { if (!r.ok) throw toErr(r); return r.json(); }),
    ]).then(([s, inv]) => {
      setShipments(s.shipments || []);
      setInvoices(inv.invoices || []);
      setLoading(false);
    }).catch((e) => {
      setLoading(false);
      if (e?.status === 401 || e?.status === 403) return; // globaler Auth-Redirect übernimmt
      setLoadError("Daten konnten nicht geladen werden. Bitte laden Sie die Seite neu.");
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
    if (p && ["overview", "new", "drafts", "addressbook", "shipments", "invoices", "profile", "tracking"].includes(p)) {
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
    <div className={`app-shell${page === "overview" ? " ce-dark" : ""}${(page === "shipments" || page === "invoices" || page === "tracking") ? " dashboard-soft-premium" : ""}${page === "profile" ? " dashboard-profile-premium" : ""}${(page === "new" || page === "addressbook" || page === "drafts") ? " dashboard-neutral-premium" : ""}`}>
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
            onProfile={() => setPage("profile")}
          />
        )}

        {page === "new" && (
          <div className="page-body">
            <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
              <NewShipmentPage
                prefillAddress={addressPrefill}
                onPrefillApplied={() => setAddressPrefill(null)}
              />
            </Suspense>
          </div>
        )}

        {page === "addressbook" && (
          <div className="page-body">
            <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
              <AddressBookPage
                onUseForNewShipment={(patch) => { setAddressPrefill(patch); navigateTo("new"); }}
              />
            </Suspense>
          </div>
        )}

        {page === "drafts" && (
          <div className="page-body">
            <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
              <DraftsPage onNewShipment={() => navigateTo("new")} />
            </Suspense>
          </div>
        )}

        {page === "shipments" && <ShipmentsList shipments={shipments} loading={loading} />}

        {/* Kein .page-body-Wrapper: TrackingPage bringt mit .page-with-navbar
            bereits einen eigenen Seiten-Wrapper mit. Als direktes Kind von
            .main-content greift automatisch die bestehende Regel
            „.main-content > .page-with-navbar" (dashboard.css) — dieselbe,
            die CalculatorPage im DashboardLayout schon nutzt. Kein eigener
            PAGE_HEADERS-Eintrag: TrackingPage rendert ihre Überschrift selbst
            (sonst doppelter Seitenkopf, wie bei Übersicht/Profil). Backend-/
            Tracking-Logik unverändert — TrackingPage ruft weiterhin den
            öffentlichen, nicht authentifizierten Endpunkt auf. */}
        {page === "tracking" && (
          <>
            {/* Soft-Premium-Atmosphäre NUR im Dashboard-Kontext (nicht im
                öffentlichen /tracking über NavbarLayout, das TrackingPage
                ebenfalls rendert): hier gemountet, nicht in TrackingPage. */}
            <PremiumBackground variant="soft" />
            <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
              <TrackingPage />
            </Suspense>
          </>
        )}

        {page === "invoices"  && <InvoicesList  invoices={invoices}   loading={loading} />}
        {page === "profile"   && <Profile user={user} />}

        {page !== "overview" && <LegalLinks />}
      </main>
    </div>
  );
}
