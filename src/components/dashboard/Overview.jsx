import React, { useEffect, useMemo } from "react";
import { useHref, useNavigate } from "react-router-dom";
import { NotificationBell } from "../notifications/NotificationBell";
import { useNotifications } from "../../context/NotificationsContext";
import { SHIPMENT_KPIS, KPI_TEXT, kpisFromServerStats, activeNewNote } from "../../utils/kpis";
import { Icon } from "../ui/Icon";
import { hasOperationalData } from "../../utils/overviewModules.mjs";
import { notificationTarget } from "../../utils/notificationsView.mjs";
import { RecentShipments, OpenInvoices, OverviewNotifications, InventorySnapshot, CarrierPortfolio } from "./OverviewModules";
import { PageHeader, UtilityCluster } from "../ui/PageHeader";
import { UserChip } from "../ui/UserChip";

/* ═══════════════════════════════════════════════════════════════════════════
   ÜBERSICHT — die Designreferenz der Plattform (Redesign 2026-10)
   ───────────────────────────────────────────────────────────────────────────
   View-Layer: Markup + CSS (src/styles/overview.css). Die Daten lädt
   DashboardPage; die Kennzahlen kommen aus dem Serveraggregat
   (kpisFromServerStats). Seit E1–E4 (2026-11-06) führt jede Kennzahlkarte
   in „Sendungen" mit genau ihrem Filter (onOpenKpi).

   Aufbau:
     Seitenkopf  persönliche Begrüßung „Guten Tag, [Name]" · Datum und
                 Einordnung · EINE Hauptaktion „Neue Sendung" · Mitteilungen
                 (Soft Button) und Konto als Utility
     Kennzahlen  vier gleich breite, helle Karten (seit 2026-11-01; vorher ein Band)
     Arbeit      Letzte Sendungen (≈ 2/3) · Offene Rechnungen (≈ 1/3)
     Lager       Lager und Aufträge aus der Lagerübersicht (offene Aufträge,
                 Artikel unter Mindestbestand) — G1/D7, 2026-10-27
     Meldungen   höchstens drei vorhandene Benachrichtigungen
     Carrier     „Ihre Versanddienstleister“ aus GET /kunde/carriers (G2,
                 2026-10-27): ruhige Logozeile, keine feste Liste, keine Laufzeiten

   Feinkorrektur 2026-10: Begrüßung und Carrier-Bereich sind inhaltlich
   zurück — im neuen Designsystem (DM Sans, keine Symbole). Der Carrier-
   Bereich trägt seit der Betreiberentscheidung 2026-10-04 wieder die Optik
   vor dem Redesign (Navy, Routenlinien, weiße Logo-Kacheln) — nur er.
   Entfallen bleiben: Serifengruß, dekorative Chips (Datum/Live/DSGVO),
   Symbole an den Kennzahlen und die redundanten „Öffnen"-Aktionen. Die
   erklärenden Onboarding-Abschnitte
   bleiben — wie bisher ausschließlich für ein Konto OHNE operative Daten — in
   ruhiger Textform erhalten.
   ═══════════════════════════════════════════════════════════════════════════ */

function getTodayLabel() {
  try { return new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return null; }
}

/* ── Carrier-Bereich ──
   Bis 2026-10-27 stand hier eine feste Liste mit fünf Carriern und Laufzeiten ohne
   Beleg („Fünf Carrier. Eine zentrale Plattform.“, Audit B.5). Seit G2 kommt die
   Liste ausschließlich vom Server (CarrierPortfolio in OverviewModules.jsx). */

/* ── Onboarding-Inhalte ──
   Go-Live (Paket E): Aussagen ohne Systembeleg sind ersetzt — „in Echtzeit" (Tracking wird beim
   Carrier abgefragt, nicht live gestreamt), „aller führenden Carrier" (angeboten wird, was für die
   Sendung verfügbar ist), „DSGVO-konform" (eine Konformitätsbehauptung ohne Nachweis) und die
   „Tiefpreisgarantie" (es gibt keine Preisgarantie — weder in den AGB noch im System). */
const STEPS = [
  { title: "Paketdaten eingeben",  desc: "Geben Sie Abhol- und Lieferadresse, Maße, Gewicht und weitere Details ein." },
  { title: "Angebote vergleichen", desc: "Vergleichen Sie Preise und Laufzeiten der für Ihre Sendung verfügbaren Carrier." },
  { title: "Versand buchen",       desc: "Wählen Sie das beste Angebot und buchen Sie Ihren Versand." },
  { title: "Tracking verfolgen",   desc: "Behalten Sie den Status Ihrer Sendung im Blick." },
];
/* Was der Kundenbereich tatsächlich kann (G1, 2026-10-27) — Versand UND Logistik, jede Zeile durch eine
   vorhandene Funktion belegt (Canonical §2, §12). Ersetzt die Werbezeilen „Weniger Aufwand. Mehr Kontrolle.“
   und die Zusicherungen ohne Beleg („schnell und zuverlässig“), Audit B.10. */
const FUNKTIONEN = [
  { key: "versand",    title: "Versand",                  desc: "Preise mehrerer Versanddienstleister vergleichen, Sendungen buchen, Versanddokumente abrufen und Sendungen verfolgen." },
  { key: "belege",     title: "Rechnungen und Adressbuch", desc: "Rechnungen zu Ihren Sendungen an einem Ort; häufige Absender und Empfänger wiederverwenden." },
  { key: "lager",      title: "Lager und Aufträge",        desc: "Artikel und Bestand Ihres eigenen Lagers führen, Aufträge erfassen und direkt als Sendung vorbereiten." },
];

/* ── Eine Kennzahlkarte (E1–E4, 2026-11-06) ──
   Jede Karte ist ein Link in „Sendungen" mit genau ihrem Filter — auch bei 0 (dann zeigt die Liste einen
   klaren Leerzustand). Ein gewöhnlicher Klick bleibt in der App (onOpen); Mittelklick, Strg-/Cmd-Klick und
   „In neuem Tab öffnen" folgen dem href, den DashboardPage beim Start als ?page=shipments&kpi=… liest.
   Der zugängliche Name entsteht aus dem sichtbaren Text (Bezeichnung, Zahl, Kontext) plus „Sendungen
   anzeigen"; der Pfeil ist Schmuck. Keine Rolle `button`: die Karte navigiert. */
function KennzahlKarte({ kpi, wert, kontext, note, onOpen }) {
  const href = useHref(`/dashboard?page=shipments&kpi=${kpi.key}`);
  const klick = (e) => {
    if (!onOpen || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(kpi.key);
  };
  return (
    <a className={`ov-kpi ov-kpi--${kpi.cls}`} href={href} onClick={klick} data-kpi={kpi.key}>
      <span className="ov-kpi-label">
        <span className="ov-kpi-label-text">{kpi.label}</span>
        <span className="ov-kpi-pfeil"><Icon n="arrowRight" s={16} /></span>
      </span>
      <span className="ov-kpi-value">{wert}</span>
      <span className="ov-kpi-context">
        {kontext}
        {note && <span className="ov-kpi-note"><span className="sr-only">, </span>{note}</span>}
        <span className="sr-only"> – {KPI_TEXT.openSuffix}</span>
      </span>
    </a>
  );
}

// `kpisReady` sagt: „die Sendungen wurden mindestens EINMAL erfolgreich geladen".
// Nur dann darf eine Zahl (auch die 0) stehen — eine 0 ist sonst nicht von einem
// Ladefehler zu unterscheiden und behauptet fälschlich „Sie haben keine Sendungen".
// Bleibt der Wert aus (älterer Aufrufer), fällt das Verhalten auf das bisherige
// `!loading` zurück, statt die Zellen dauerhaft leer zu lassen.
export function Overview({
  user, shipments, invoices, invoiceSummary, serverStats, loading, kpisReady,
  // Paket F: der Buchungsrahmen (GET /kunde/credit) — null, solange nichts geladen ist.
  credit = null,
  onNewShipment, onAllShipments, onAllInvoices, onProfile, onNotificationNav,
  // E1–E4 (2026-11-06): Klick auf eine Kennzahlkarte → „Sendungen" mit genau ihrem Filter.
  onOpenKpi = null,
  // G1/D7: Navigation in die Lagerbereiche (page-Wert, Filter) — derselbe Weg wie die Seitenleiste.
  onNavigate = null,
  // G2 und G1/D7 (2026-10-27): die angebotenen Versanddienstleister und der Lagerstand — beides lädt DashboardPage;
  // die Übersicht lädt keine eigenen Daten.
  carriers = null, lagerStand = null, onLagerRetry = null,
  // Premium-Redesign: die Kopfsuche des Kundenbereichs (components/layout/KundenSuche.jsx), von DashboardPage gebaut.
  suche = null,
}) {
  const navigate = useNavigate();

  // KPI-Quelle: ausschließlich das SERVERSEITIGE stats-Aggregat über alle Sendungen
  // (E1–E4, 2026-11-06) — dieselben Regeln wie die Filter, auf die die Karten führen. Die
  // frühere Ersatzrechnung über die geladene Seite ist entfallen: Ohne gültiges Aggregat
  // stehen „—" und „Noch nicht verfügbar", nie eine Zahl über nur 50 Sendungen.
  const k = useMemo(() => kpisFromServerStats(serverStats), [serverStats]);
  const todayLabel = getTodayLabel();
  const ready = kpisReady === undefined ? !loading : kpisReady;
  // Eine Zahl steht erst, wenn geladen wurde UND das Aggregat gültig ist.
  const zahlen = ready && k !== null;

  // Persönliche Begrüßung: der Name kommt aus dem bestehenden Nutzerkontext —
  // dieselbe Quelle wie vor dem Redesign (Name, sonst Firmenname). Fehlt
  // beides, bleibt es bei „Guten Tag" — kein Platzhaltername.
  const greetingName = String(user?.name || user?.company_name || "").trim();

  // Operative Arbeitsfläche oder Onboarding? Solange nichts geladen ist, gilt
  // das Konto als operativ — sonst blitzt beim ersten Rendern kurz das
  // Onboarding auf und springt danach um (siehe hasOperationalData).
  const operational = hasOperationalData({ shipments, invoices, ready });

  // Benachrichtigungen kommen aus dem BESTEHENDEN Shell-Provider: derselbe
  // Zustand, dasselbe Polling, dieselbe Gelesen-Logik wie im Panel. Die volle
  // Liste wird hier EINMAL angefordert, wenn sie noch nie geladen wurde.
  const { items: notifications, loaded: notificationsLoaded, refresh: refreshNotifications } = useNotifications();
  useEffect(() => {
    if (!notificationsLoaded) refreshNotifications();
  }, [notificationsLoaded, refreshNotifications]);

  // Ein Klick auf eine Meldung führt exakt dorthin, wohin auch das Panel führt
  // (notificationTarget → bestehende Seitennavigation). Kein zweites Zielsystem.
  const openNotification = (n) => {
    const target = notificationTarget(n);
    if (!target || !onNotificationNav) return;
    if (target.page === "support") onNotificationNav("support", { ticket: target.ticket });
    else onNotificationNav("invoices", { invoice: target.invoice });
  };

  // Zusatz der ersten Kennzahl (E3): „davon n neu (24 h)" — eine echte Teilmenge der aktiven
  // Sendungen (Buchung in den letzten 24 Stunden), kein Trend, keine Prozentangabe. Bei 0 entfällt er.
  // Geschützte Leerzeichen halten „3 neu" und „24 h" zusammen.
  const activeNote = zahlen ? activeNewNote(k) : null;
  // E1: Testbuchungen zählen mit; solange das Aggregat welche enthält, sagt die Übersicht es.
  const testHinweis = zahlen && k.testBookings > 0;

  return (
    <>
      <PageHeader
        title={greetingName
          ? <>Guten Tag, <span className="ov-greeting-name">{greetingName}</span></>
          : "Guten Tag"}
        subtitle={todayLabel ? `${todayLabel} · Versand und Logistik im Überblick` : "Versand und Logistik im Überblick"}
        utility={(
          <UtilityCluster>
            {suche}
            {/* Zustand und Polling kommen aus dem Shell-Provider; hier entsteht
                keine zweite Abfrageschleife. */}
            <NotificationBell variant="overview" navigateTo={onNotificationNav} />
            <UserChip user={user} onClick={onProfile} />
          </UtilityCluster>
        )}
        actions={(
          <button type="button" className="btn btn-primary ce-aktion-neu" onClick={onNewShipment}>
            Neue Sendung
          </button>
        )}
      />

      <div className="page-body ov-page">
        {/* ── Betriebsüberblick: vier gleich breite Karten ──
            Seit E1–E4 (2026-11-06) ist jede Karte ein Link auf „Sendungen" mit genau
            ihrem Filter (auch bei 0). Alle vier Zahlen stehen in derselben Farbe, auch
            „Verzögert“ (Betreiberauftrag 2026-11-02). Solange kein gültiges Aggregat
            vorliegt, steht „—" statt einer Zahl: weder beim ersten Laden noch nach einem
            Ladefehler darf eine 0 erscheinen, die wie ein echtes Ergebnis aussieht. */}
        <section className="ov-kpis" aria-label="Betriebsüberblick">
          {SHIPMENT_KPIS.map((kpi) => (
            <KennzahlKarte
              key={kpi.key}
              kpi={kpi}
              wert={zahlen ? String(k.byKey[kpi.key]) : "—"}
              kontext={zahlen ? kpi.context : (loading ? "Wird geladen…" : "Noch nicht verfügbar")}
              note={kpi.key === "active" ? activeNote : null}
              onOpen={onOpenKpi}
            />
          ))}
          {/* E1: steht im Abstand unter den Karten (absolut, ohne Layoutsprung beim Nachladen). */}
          {testHinweis && (
            <p className="ov-kpi-hinweis">
              <span className="ce-test-marke" aria-hidden="true">TEST</span>
              {KPI_TEXT.testHint}
            </p>
          )}
        </section>

        {/* ── Operative Module ──
            Letzte Sendungen und offene Rechnungen nebeneinander (≈ 2:1), darunter
            die wichtigsten Benachrichtigungen — alles aus bereits vorhandenen
            Daten und bestehenden Zielen. */}
        {operational && (
          <div className="ov-mod-grid">
            <RecentShipments
              shipments={shipments}
              loading={loading}
              onAll={onAllShipments}
            />
            <OpenInvoices invoices={invoices} summary={invoiceSummary} onAll={onAllInvoices} credit={credit} />
          </div>
        )}

        {/* Lager und Aufträge neben den Benachrichtigungen — gibt es keine Meldung, nimmt das Lager die Reihe ein. */}
        <div className="ov-mod-grid ov-mod-grid--lager">
          <InventorySnapshot stand={lagerStand} onRetry={onLagerRetry} onNavigate={onNavigate} />
          {operational && <OverviewNotifications items={notifications} onSelect={openNotification} />}
        </div>

        {/* ── Onboarding — nur für Konten OHNE operative Daten ──
            Für einen Neukunden ist die Ablauferklärung die richtige Führung, für
            ein arbeitendes Konto wäre sie täglicher Ballast. Inhalte unverändert,
            Darstellung als ruhiger Text ohne Symbole und ohne dunkle Flächen. */}
        {!operational && (
          <section className="ov-section" aria-labelledby="ov-sec-flow">
            <h2 className="ov-section-title" id="ov-sec-flow">In vier Schritten versandbereit</h2>
            <p className="ov-section-desc">Von den Paketdaten bis zur Zustellung – klar geführt in einer Oberfläche.</p>
            <ol className="ov-steps">
              {STEPS.map((s, i) => (
                <li className="ov-step" key={s.title}>
                  <span className="ov-step-no">{i + 1}</span>
                  <span className="ov-step-text">
                    <span className="ov-step-title">{s.title}</span>
                    <span className="ov-step-desc">{s.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!operational && (
          <section className="ov-section" aria-labelledby="ov-sec-why">
            <h2 className="ov-section-title" id="ov-sec-why">Versand und Logistik in Ihrem Kundenbereich</h2>
            <ul className="ov-facts">
              {FUNKTIONEN.map((w) => (
                <li className="ov-fact" key={w.key}>
                  <span className="ov-fact-title">{w.title}</span>
                  <span className="ov-fact-desc">{w.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Ihre Versanddienstleister (G2) ──
            Ruhige Logozeile aus GET /kunde/carriers; die Aktion führt wie bisher zum
            Versandkostenrechner (/calculator). */}
        <CarrierPortfolio carriers={carriers} onCompare={() => navigate("/calculator")} />
      </div>
    </>
  );
}
