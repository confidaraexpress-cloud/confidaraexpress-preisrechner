import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
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
import { NotificationsProvider } from "../context/NotificationsContext";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { useAuth } from "../context/AuthContext";
import { businessMonthKey } from "../utils/kpis";

// Takt der reinen Monatsbeobachtung (siehe Effekt unten). Bewusst ein LOKALER
// Vergleich ohne Netzwerkzugriff — 60 s sind billig und lassen den Wechsel
// spätestens eine Minute nach Mitternacht wirksam werden. Es entsteht dadurch
// KEIN periodischer API-Aufruf.
const MONTH_WATCH_INTERVAL_MS = 60_000;

const NewShipmentPage  = React.lazy(() => import("./NewShipmentPage"));
const TrackingPage     = React.lazy(() => import("./TrackingPage"));
const AddressBookPage  = React.lazy(() => import("./AddressBookPage"));
const DraftsPage       = React.lazy(() => import("./DraftsPage"));
// Benannter Export → auf `default` abbilden, wie React.lazy es verlangt.
const SupportRequestsView = React.lazy(() =>
  import("../components/support/SupportRequestsView").then(m => ({ default: m.SupportRequestsView })));

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
  support: {
    title: "Supportanfragen",
    subtitle: "Ihre Anfragen an unser Supportteam mit vollständigem Nachrichtenverlauf.",
  },
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [page, setPage] = useState("overview");
  // Vorgang, der aus einer Glockenmeldung heraus direkt geöffnet werden soll.
  const [supportTicketId, setSupportTicketId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Interner Verlassen-Guard (NewShipmentPage registriert hier eine Funktion,
  // die den ungespeicherten Dirty-State prüft). Nur relevant, solange
  // NewShipmentPage gemountet ist (page === "new").
  const leaveGuardRef = useRef(null);
  // Laufende Nummer der Sendungsabfragen — verwirft veraltete Antworten (siehe
  // reloadShipments). Wird von JEDEM Sendungsabruf hochgezählt, auch von fetchData.
  const shipmentsReq = useRef(0);
  const [shipments, setShipments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  // „Die Sendungen wurden mindestens EINMAL erfolgreich geladen." Erst danach
  // dürfen die KPI-Karten Zahlen zeigen — eine 0 wäre sonst nicht von einem
  // Ladefehler zu unterscheiden. Wird nie wieder auf false gesetzt: schlägt ein
  // späterer Refetch fehl, bleiben die zuletzt gültigen Werte stehen.
  const [shipmentsLoaded, setShipmentsLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  // Getrennt vom allgemeinen loadError (Sendungen): ein fehlgeschlagener Rechnungsabruf
  // betrifft nur den Rechnungsbereich und soll dort eigenständig mit Retry angezeigt
  // werden, ohne die übrigen Dashboarddaten als fehlerhaft zu markieren.
  const [invoicesError, setInvoicesError] = useState("");
  const [bookingToast, setBookingToast] = useState(false);
  // Adressbuch → „Neue Sendung": reiner Werte-Patch (s_*/r_*-Formfelder), KEINE
  // dauerhafte addressId-Referenz. Wird einmalig beim Mount von NewShipmentPage
  // angewendet und danach über onPrefillApplied hier zurückgesetzt.
  const [addressPrefill, setAddressPrefill] = useState(null);
  // Entwürfe → „Fortsetzen": vollständiger Formularentwurf-Snapshot (kind:"form",
  // sourceFormDraftId/-Revision, schemaVersion, formData). Wird einmalig beim
  // Mount von NewShipmentPage angewendet und danach über onResumeApplied
  // zurückgesetzt (gleiche Einmal-Semantik wie addressPrefill) — enthält bewusst
  // KEINE Preise/Tarife/Carrier/Shipment-ID.
  const [resumeDraft, setResumeDraft] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setLoadError("");
    setInvoicesError("");
    // Auch der vollständige Ladevorgang nimmt an der Sequenz teil, damit sich ein
    // gezielter Sendungs-Refetch und dieser Aufruf nicht gegenseitig überholen.
    const seq = ++shipmentsReq.current;
    const toErr = (r) => { const e = new Error(); e.status = r.status; return e; };
    // allSettled statt all: ein fehlgeschlagener Rechnungsabruf darf die bereits
    // erfolgreich geladenen Sendungen nicht mit als „fehlgeschlagen" markieren (und
    // umgekehrt) — jede Quelle bekommt ihren eigenen Fehlerzustand.
    Promise.allSettled([
      apiFetch(`/kunde/shipments`, { auth: true }).then(r => { if (!r.ok) throw toErr(r); return r.json(); }),
      apiFetch(`/kunde/invoices`,  { auth: true }).then(r => { if (!r.ok) throw toErr(r); return r.json(); }),
    ]).then(([shipRes, invRes]) => {
      if (shipRes.status === "fulfilled") {
        if (seq === shipmentsReq.current) {
          setShipments(shipRes.value.shipments || []);
          setShipmentsLoaded(true);
        }
      } else if (!(shipRes.reason?.status === 401 || shipRes.reason?.status === 403)) {
        setLoadError("Daten konnten nicht geladen werden. Bitte laden Sie die Seite neu.");
      }
      if (invRes.status === "fulfilled") {
        setInvoices(invRes.value.invoices || []);
        setInvoiceSummary(invRes.value.summary || null);
      } else if (!(invRes.reason?.status === 401 || invRes.reason?.status === 403)) {
        setInvoicesError("Die Rechnungen konnten nicht geladen werden.");
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Gezielter Sendungs-Refetch (nur /kunde/shipments) ──────────────────────
  // Quelle der vier KPI-Karten. Bewusst OHNE die Rechnungen: ein KPI-Refresh hat
  // mit dem Rechnungsbereich nichts zu tun und soll ihn nicht mitladen.
  //
  // `shipmentsReq` verhindert, dass eine langsamere ÄLTERE Antwort eine bereits
  // eingetroffene neuere überschreibt (Refetch beim Seitenwechsel kann sich mit
  // dem Monatswechsel-Refetch überlappen). Still bei Fehlern: die zuletzt
  // erfolgreich geladenen Werte bleiben stehen.
  const reloadShipments = useCallback(async () => {
    const seq = ++shipmentsReq.current;
    try {
      const r = await apiFetch(`/kunde/shipments`, { auth: true });
      if (!r.ok) return;
      const d = await r.json();
      if (seq !== shipmentsReq.current) return;   // veraltete Antwort verwerfen
      setShipments(d.shipments || []);
      setShipmentsLoaded(true);
    } catch { /* Netzwerkfehler: Anzeige unverändert lassen */ }
  }, []);

  // ── Rückkehr auf die Übersicht ─────────────────────────────────────────────
  // DashboardPage bleibt beim internen Seitenwechsel gemountet (page-State, keine
  // Route). Ohne diesen Effekt zeigte die Übersicht nach einem Ausflug in
  // „Sendungen"/„Rechnungen" beliebig alte KPI. Der Vergleich mit der vorherigen
  // Seite verhindert eine doppelte Anfrage beim ersten Mount: dort ist
  // prevPage === page === "overview", und fetchData lädt ohnehin gerade.
  const prevPageRef = useRef(page);
  useEffect(() => {
    const prev = prevPageRef.current;
    prevPageRef.current = page;
    if (page === "overview" && prev !== "overview") reloadShipments();
  }, [page, reloadShipments]);

  // ── Monatswechsel in der Geschäftszeitzone ─────────────────────────────────
  // Bleibt das Dashboard über Mitternacht des Monatsersten geöffnet, ist die Karte
  // „Zugestellt" veraltet: das serverseitige Monatskennzeichen wurde für den ALTEN
  // Monat berechnet. Deshalb wird der fachliche Berliner Monat lokal beobachtet.
  //
  // Der Takt erzeugt KEINE Requests: er vergleicht zwei Zeichenketten. Erst wenn
  // sich der Monat tatsächlich ändert, wird EINMAL gezielt nachgeladen — und zwar
  // nur die Sendungen. Das ist ausdrücklich kein Polling: im Regelfall passiert
  // das genau einmal pro Monat.
  useEffect(() => {
    let last = businessMonthKey();
    const timer = setInterval(() => {
      const current = businessMonthKey();
      if (current && current !== last) {
        last = current;
        reloadShipments();
      }
    }, MONTH_WATCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reloadShipments]);

  // Gezielter Rechnungs-Refetch (nur /kunde/invoices) für die Dokumentstatus-
  // Aktualisierung der Rechnungsliste (manueller Button + zurückhaltendes
  // Auto-Refresh in InvoicesList) — lädt bewusst NICHT die Sendungen mit.
  // Still bei Fehlern (bestehende Daten bleiben stehen); echte Session-Fehler
  // behandelt apiFetch zentral. Der initiale Ladefehler (invoicesError) wird
  // hierüber NICHT gesetzt — der explizite Retry-Button im Fehlerzustand ruft
  // stattdessen fetchData() auf (siehe unten), damit ein fehlgeschlagener
  // erster Ladeversuch sichtbar bleibt, bis er wirklich behoben ist.
  const reloadInvoices = useCallback(async () => {
    try {
      const r = await apiFetch(`/kunde/invoices`, { auth: true });
      if (!r.ok) return;
      const d = await r.json();
      setInvoices(d.invoices || []);
      setInvoiceSummary(d.summary || null);
    } catch { /* Netzwerkfehler: Anzeige unverändert lassen */ }
  }, []);

  // Nach einer Stornierungsanfrage: betroffene Zeile optimistisch auf den
  // gemeldeten Cancellation-Status setzen (Button verschwindet sofort) und
  // anschließend die Liste mit dem Backend abgleichen (Serverwahrheit über
  // cancellation_status/cancellation_requested_at; keine rein lokale Wahrheit).
  const handleCancellationRequested = useCallback((jumingoShipmentId, patch) => {
    if (patch && patch.status) {
      setShipments((prev) => prev.map((s) =>
        s.jumingo_shipment_id === jumingoShipmentId
          ? { ...s, cancellation_status: patch.status, cancellation_requested_at: patch.requestedAt ?? s.cancellation_requested_at ?? null }
          : s));
    }
    fetchData();
  }, [fetchData]);

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
    const params = new URLSearchParams(location.search);
    const p = params.get("page");
    if (p && ["overview", "new", "drafts", "addressbook", "shipments", "invoices", "profile", "tracking", "support"].includes(p)) {
      setPage(p);
      // Deep-Link aus einer Glockenmeldung: die Ticket-ID wird als geprüfte
      // Ganzzahl übernommen und der Query-Param anschließend wie bisher entfernt.
      const ticket = parseInt(params.get("ticket"), 10);
      setSupportTicketId(Number.isInteger(ticket) && ticket > 0 ? ticket : null);
      navigate("/dashboard", { replace: true });
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Führt eine interne Zielnavigation tatsächlich aus (Seite/Route/Logout).
  const performNav = (target) => {
    if (!target) return;
    setSidebarOpen(false);
    if (target.type === "logout") { logout(); navigate("/login"); return; }
    if (target.type === "route") { navigate(target.path, target.state ? { state: target.state } : undefined); return; }
    if (target.page === "calculator") { navigate("/calculator"); return; }
    setPage(target.page);
  };

  // Navigation aus einer Glockenmeldung: Zielseite plus optionaler Deep-Link.
  // Das Ziel wird von der Glocke ausschließlich aus Typ und Entitäts-ID
  // abgeleitet — es wird nie eine URL aus einem Serverpayload geöffnet.
  const navigateFromNotification = (target, extra = {}) => {
    if (target === "support") setSupportTicketId(extra.ticket || null);
    navigateTo(target);
  };

  // Interne Seitennavigation. Verlässt der Nutzer „Neue Sendung" mit
  // ungespeicherten Angaben, fängt der registrierte Guard die Navigation ab
  // (Dialog). Bei gleicher Zielseite (kein Verlassen) und ohne Guard: direkt.
  const navigateTo = (id) => {
    const target = { type: "page", page: id };
    if (page === "new" && id !== "new" && leaveGuardRef.current && leaveGuardRef.current(target)) return;
    performNav(target);
  };

  // Logout ebenfalls durch den Guard (ungespeicherte Angaben in „Neue Sendung").
  const requestLogout = () => {
    const target = { type: "logout" };
    if (page === "new" && leaveGuardRef.current && leaveGuardRef.current(target)) return;
    performNav(target);
  };

  // Stabile Registrierungsfunktion → NewShipmentPage registriert den Guard genau
  // EINMAL (nicht bei jedem Render neu). Deregistrierung erfolgt über den
  // Effekt-Cleanup beim Unmount (fn = null).
  const registerLeaveGuard = useCallback((fn) => { leaveGuardRef.current = fn; }, []);

  // „Clean Executive Logistics": EINE gemeinsame Shell für alle eingeloggten
  // Kundenseiten. Die früheren seitenabhängigen Hintergrund-Scopes
  // (dashboard-vapor / -soft-premium / -neutral-premium / -profile-premium)
  // sind entfallen — .app-shell trägt die ruhige Grundfläche überall gleich.
  return (
    // Der Provider umschließt die gesamte Shell: Zustand und Polling des
    // Benachrichtigungscenters laufen genau EINMAL, unabhängig davon, wie viele
    // Glockenknöpfe darin gerendert werden.
    <NotificationsProvider>
    <div className="app-shell">
      <DashboardSidebar
        page={page}
        navigateTo={navigateTo}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onLogout={requestLogout}
      />
      <main className="main-content">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}><Icon n="menu" s={22} /></button>
          <div className="topbar-brand">ConfidaraExpress</div>
          {/* Dieselbe Regel wie beim Seiten-Mount unten: die Übersicht trägt ihre
              Glocke bereits in der eigenen Kopfzeile. Unterhalb von 860 px ist die
              Topbar sichtbar — ohne diese Bedingung stünden auf der Übersicht dort
              ZWEI Glocken (Topbar + Kopfzeile). Auf allen anderen Unterseiten ist
              die Topbar der mobile Mount, weil der Seiten-Mount dort per CSS in der
              Kopfzeile liegt. */}
          <div className="topbar-right">
            {page !== "overview" && (
              <NotificationBell variant="topbar" navigateTo={navigateFromNotification} />
            )}
            <div className="user-avatar">{initials}</div>
          </div>
        </div>

        {/* Desktop-Mount der Glocke für alle Unterseiten AUSSER der Übersicht:
            dort sitzt sie bereits an ihrer angestammten Stelle in der Kopfzeile,
            ein zweiter Knopf würde doppelt erscheinen. Bewusst KEINE neue
            vollständige Kopfleiste — nur ein kleiner Mount oben rechts im
            bestehenden Inhaltsrahmen. */}
        {page !== "overview" && (
          <div className="page-bell-mount">
            <NotificationBell variant="page" navigateTo={navigateFromNotification} />
          </div>
        )}

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
            kpisReady={shipmentsLoaded}
            onNewShipment={() => setPage("new")}
            onAllShipments={() => setPage("shipments")}
            onProfile={() => setPage("profile")}
            onNotificationNav={navigateFromNotification}
          />
        )}

        {page === "new" && (
          <div className="page-body">
            <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
              <NewShipmentPage
                prefillAddress={addressPrefill}
                onPrefillApplied={() => setAddressPrefill(null)}
                resumeDraft={resumeDraft}
                onResumeApplied={() => setResumeDraft(null)}
                registerLeaveGuard={registerLeaveGuard}
                commitLeave={performNav}
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
              <DraftsPage
                onNewShipment={() => navigateTo("new")}
                onResumeFormDraft={(payload) => { setResumeDraft(payload); navigateTo("new"); }}
              />
            </Suspense>
          </div>
        )}

        {page === "shipments" && <ShipmentsList shipments={shipments} loading={loading} onCancellationRequested={handleCancellationRequested} />}

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
          <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
            <TrackingPage />
          </Suspense>
        )}

        {page === "invoices"  && (
          <InvoicesList
            invoices={invoices}
            summary={invoiceSummary}
            loading={loading}
            error={invoicesError}
            onReload={reloadInvoices}
            onRetry={fetchData}
          />
        )}
        {page === "support" && (
          <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
            <SupportRequestsView
              initialTicketId={supportTicketId}
              onTicketConsumed={() => setSupportTicketId(null)}
            />
          </Suspense>
        )}

        {page === "profile"   && <Profile user={user} />}

        {/* Ein Footer für ALLE Kundenseiten. Die Übersicht trug bis hierher
            stattdessen eine werbliche Selbstbeschreibung statt eines Footers;
            die ist ersatzlos entfallen. */}
        <LegalLinks />
      </main>
    </div>
  </NotificationsProvider>
  );
}
