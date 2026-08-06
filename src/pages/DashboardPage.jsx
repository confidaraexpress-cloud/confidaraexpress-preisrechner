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
import { UtilityCluster } from "../components/ui/PageHeader";
import { UserChip } from "../components/ui/UserChip";

// Takt der reinen Monatsbeobachtung (siehe Effekt unten). Bewusst ein LOKALER
// Vergleich ohne Netzwerkzugriff — 60 s sind billig und lassen den Wechsel
// spätestens eine Minute nach Mitternacht wirksam werden. Es entsteht dadurch
// KEIN periodischer API-Aufruf.
const MONTH_WATCH_INTERVAL_MS = 60_000;

// Gültige Werte des lokalen page-States. Unveränderter Bestand — nur an EINER
// Stelle geführt, weil ihn seit dem History-Fix zwei Stellen lesen (Startwert
// und ?page=-Effekt).
const DASHBOARD_PAGES = ["overview", "new", "drafts", "addressbook", "shipments", "invoices", "profile", "tracking", "support"];

// Startbereich eines Mounts: Query schlägt History-State schlägt Übersicht.
// Bewusst als reine Funktion außerhalb der Komponente — sie wird an zwei
// Stellen gebraucht (Startwert und der ?page=-Effekt) und darf nirgends
// abweichen.
function waehleStartbereich(location) {
  const ausQuery = new URLSearchParams(location.search).get("page");
  if (DASHBOARD_PAGES.includes(ausQuery)) return ausQuery;
  const ausHistory = location.state?.page;
  if (DASHBOARD_PAGES.includes(ausHistory)) return ausHistory;
  return "overview";
}

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
    eyebrow: "Versand",
    title: "Neue Sendung",
    subtitle: "Führen Sie neue Versandaufträge sicher und nachvollziehbar durch den Buchungsprozess.",
  },
  shipments: {
    eyebrow: "Verwaltung",
    title: "Sendungen",
    subtitle: "Alle Versandaufträge übersichtlich dokumentiert und jederzeit nachverfolgbar.",
  },
  invoices: {
    eyebrow: "Verwaltung",
    title: "Rechnungen",
    subtitle: "Verlässliche Kostenübersicht für Ihre gebuchten Versanddienstleistungen.",
  },
  support: {
    eyebrow: "Konto & Support",
    title: "Supportanfragen",
    subtitle: "Ihre Anfragen an unser Supportteam mit vollständigem Nachrichtenverlauf.",
  },
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Aktiver Bereich. Verbindliche Reihenfolge:
  //   1. gültiger Query-Parameter  (?page=new — Deep-Link von außen)
  //   2. gültiger location.state.page (History-Eintrag, Browser-Zurück)
  //   3. „overview"                (Fallback)
  // Der laufende page-State selbst ist Stufe 3 der Kette — er existiert beim
  // Mount noch nicht, wird aber vom Synchronisierungs-Effekt weiter unten
  // gegen den History-Eintrag gehalten, damit er nicht wieder verloren geht.
  //
  // Warum der History-State: der Effekt weiter unten entfernt `?page=` per
  // `replace` aus der URL (saubere Adresse). Der zurückbleibende Eintrag lautete
  // dadurch schlicht `/dashboard`, und ein Browser-Zurück von `/booking` landete
  // auf der Übersicht statt auf „Neue Sendung".
  const [page, setPage] = useState(() => waehleStartbereich(location));
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
  // Manuell (Button) vs. automatisch (zurückhaltendes Auto-Refresh) verhalten
  // sich bei Fehlern UNTERSCHIEDLICH: Der bewusste Klick bekam bisher keinerlei
  // Rückmeldung — er konnte vollständig wortlos scheitern (Auditbefund #11).
  // Jetzt meldet der manuelle Weg den Fehlschlag sichtbar (die vorhandenen
  // Daten bleiben stehen), während der Hintergrundweg still bleibt, damit kein
  // Meldungs-Takt entsteht. Ein späterer Erfolg räumt die Meldung wieder ab.
  const [invoicesRefreshError, setInvoicesRefreshError] = useState(false);
  const reloadInvoices = useCallback(async (opts) => {
    const silent = !(opts && opts.silent === false);
    try {
      const r = await apiFetch(`/kunde/invoices`, { auth: true });
      if (!r.ok) { if (!silent) setInvoicesRefreshError(true); return; }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!d) { if (!silent) setInvoicesRefreshError(true); return; }
      setInvoices(d.invoices || []);
      setInvoiceSummary(d.summary || null);
      setInvoicesRefreshError(false);
    } catch { if (!silent) setInvoicesRefreshError(true); }
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
      // Nur das verbrauchte `justBooked` entfernen — der Bereich und alle
      // übrigen State-Werte bleiben stehen. Ein `state: {}` löschte hier früher
      // auch den page-Marker und schickte ein späteres Browser-Zurück wieder
      // auf die Übersicht.
      const { justBooked, ...rest } = location.state;   // eslint-disable-line no-unused-vars
      navigate(location.pathname, { replace: true, state: rest });
      const t = setTimeout(() => setBookingToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Der aktuelle History-Eintrag trägt den Bereich ───────────────────────
     Die interne Navigation (`navigateTo`) setzt ausschließlich den lokalen
     page-State — sie fasst die History bewusst nicht an, denn `/dashboard`
     kennt keine Unterseiten-URLs (siehe CLAUDE.md, Navigationsmodell).
     Konsequenz vor diesem Fix: wer über die Sidebar von der Übersicht auf
     „Neue Sendung" wechselte, hinterließ einen History-Eintrag OHNE
     Bereichsangabe. Ein Browser-Zurück von `/booking` fiel damit auf die
     Übersicht zurück, obwohl der Kunde von seinen Angeboten kam.

     Dieser Effekt hält den aktuellen Eintrag nach — per `replace`, also ohne
     neuen Eintrag, ohne Adressänderung und ohne Remount. Er greift für JEDEN
     Weg in den Bereich: Sidebar, Glockenmeldung, Adressbuch, Entwürfe.

     Kein Kreislauf: geschrieben wird nur, wenn sich `state.page` tatsächlich
     unterscheidet, und die Abhängigkeit ist der page-State — nicht `location`.

     Gelesen wird der LIVE-Zustand aus `window.history.state.usr`, nicht aus dem
     `location`-Objekt des Renders: die beiden Effekte darüber (justBooked-Toast
     und ?page=-Bereinigung) ersetzen den Eintrag im selben Commit. Ein
     Closure-Wert wäre dann veraltet und würde ein soeben entferntes
     `justBooked` wieder hineinschreiben. */
  useEffect(() => {
    const aktuell = (typeof window !== "undefined" && window.history.state?.usr) || null;
    if (aktuell?.page === page) return;
    // Solange noch ein ?page=-Parameter in der Adresse steht, gehört der
    // Eintrag dem Effekt darunter — der schreibt den Bereich ohnehin mit.
    if (new URLSearchParams(window.location.search).get("page")) return;
    // `returnTarget` gehört ausschließlich zur Rückkehr in den Angebotsvergleich.
    // Verlässt der Kunde den Bereich, ist der Marker gegenstandslos und würde
    // sonst später fälschlich ein Replace statt eines Push auslösen.
    const { returnTarget, ...rest } = aktuell || {};   // eslint-disable-line no-unused-vars
    const naechster = page === "new" && returnTarget ? { ...rest, returnTarget, page } : { ...rest, page };
    navigate(window.location.pathname, { replace: true, state: naechster });
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate from calculator route back into dashboard pages
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const p = params.get("page");
    if (p && DASHBOARD_PAGES.includes(p)) {
      setPage(p);
      // Deep-Link aus einer Glockenmeldung: die Ticket-ID wird als geprüfte
      // Ganzzahl übernommen und der Query-Param anschließend wie bisher entfernt.
      const ticket = parseInt(params.get("ticket"), 10);
      setSupportTicketId(Number.isInteger(ticket) && ticket > 0 ? ticket : null);
      // Die URL wird wie bisher bereinigt — der Bereich wandert dabei in den
      // History-State des ERSETZTEN Eintrags. Vorhandene State-Werte bleiben
      // erhalten (Spread), damit z. B. `justBooked` nicht verloren geht.
      // `replace` löst keine zusätzliche Navigation aus: derselbe Pfad, kein
      // neuer Eintrag, kein erneutes Feuern dieses Effekts (location.search
      // wird von "?page=…" zu "" — genau einmal).
      navigate("/dashboard", { replace: true, state: { ...(location.state || {}), page: p } });
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

  // EIN Utility-Cluster für alle Seitenköpfe des Kundenbereichs — Glocke und
  // Benutzerchip stehen dadurch auf jeder Unterseite an derselben Stelle.
  const utilityCluster = (
    <UtilityCluster>
      <NotificationBell variant="page" navigateTo={navigateFromNotification} />
      <UserChip user={user} onClick={() => navigateTo("profile")} />
    </UtilityCluster>
  );

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
          <button className="hamburger-btn" aria-label="Navigation öffnen" onClick={() => setSidebarOpen(true)}><Icon n="menu" s={22} /></button>
          <div className="topbar-brand">ConfidaraExpress</div>
          {/* Dieselbe Regel wie beim Seiten-Mount unten: die Übersicht trägt ihre
              Glocke bereits in der eigenen Kopfzeile. Unterhalb von 860 px ist die
              Topbar sichtbar — ohne diese Bedingung stünden auf der Übersicht dort
              ZWEI Glocken (Topbar + Kopfzeile). Auf allen anderen Unterseiten ist
              die Topbar der mobile Mount, weil der Seiten-Mount dort per CSS in der
              Kopfzeile liegt. */}
          {/* Menü, Wortmarke, Glocke — mehr nicht. Der frühere Initialen-Kreis
              zeigte dieselbe Identität, die zwei Zentimeter weiter links schon
              in der Sidebar-Firmenkarte steht. */}
          {/* Auf der Übersicht bleibt die Topbar-Glocke aus: dort steht sie in der
              eigenen Kopfzeile und ist auch mobil sichtbar. Auf allen anderen
              Unterseiten ist die Topbar der mobile Mount, weil der Utility-
              Cluster des Seitenkopfs unter 860 px ausblendet. */}
          <div className="topbar-right">
            {page !== "overview" && (
              <NotificationBell variant="topbar" navigateTo={navigateFromNotification} />
            )}
          </div>
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

        {/* Der Utility-Cluster (Glocke + Benutzerchip) sitzt seit Paket A,
            Phase 3 IM Seitenkopf statt als freischwebender Mount darüber.
            Unterhalb von 860 px blendet er sich aus — dort trägt die Topbar
            die Glocke, und ein zweiter Chip wäre eine doppelte Identität. */}
        {PAGE_HEADERS[page] && (
          <DashboardSectionHeader
            eyebrow={PAGE_HEADERS[page].eyebrow}
            title={PAGE_HEADERS[page].title}
            subtitle={PAGE_HEADERS[page].subtitle}
            utility={utilityCluster}
          />
        )}

        {page === "overview" && (
          <Overview
            user={user}
            shipments={shipments}
            invoices={invoices}
            invoiceSummary={invoiceSummary}
            loading={loading}
            kpisReady={shipmentsLoaded}
            onNewShipment={() => navigateTo("new")}
            onAllShipments={() => navigateTo("shipments")}
            onAllInvoices={() => navigateTo("invoices")}
            /* Schnellaktionen nutzen ausschließlich die BESTEHENDE Navigation:
               `page` läuft über navigateTo (page-State), `route` über den
               vorhandenen Router. Keine neue Routing- oder page-State-Logik. */
            onQuickAction={(action) => {
              if (action.route) { navigate(action.route); return; }
              navigateTo(action.page);
            }}
            onProfile={() => navigateTo("profile")}
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
          <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
            <AddressBookPage
              utility={utilityCluster}
              onUseForNewShipment={(patch) => { setAddressPrefill(patch); navigateTo("new"); }}
            />
          </Suspense>
        )}

        {page === "drafts" && (
          <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
            <DraftsPage
              utility={utilityCluster}
              onNewShipment={() => navigateTo("new")}
              onResumeFormDraft={(payload) => { setResumeDraft(payload); navigateTo("new"); }}
            />
          </Suspense>
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
            refreshError={invoicesRefreshError}
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

        {page === "profile"   && <Profile user={user} utility={utilityCluster} />}

        {/* Ein Footer für ALLE Kundenseiten. Die Übersicht trug bis hierher
            stattdessen eine werbliche Selbstbeschreibung statt eines Footers;
            die ist ersatzlos entfallen. */}
        <LegalLinks />
      </main>
    </div>
  </NotificationsProvider>
  );
}
