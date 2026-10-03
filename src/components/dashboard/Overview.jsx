import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NotificationBell } from "../notifications/NotificationBell";
import { useNotifications } from "../../context/NotificationsContext";
import { computeKpis, kpisFromServerStats } from "../../utils/kpis";
import { hasOperationalData } from "../../utils/overviewModules.mjs";
import { notificationTarget } from "../../utils/notificationsView.mjs";
import { RecentShipments, OpenInvoices, OverviewNotifications } from "./OverviewModules";
import { PageHeader, UtilityCluster } from "../ui/PageHeader";
import { UserChip } from "../ui/UserChip";
import dhlLogo        from "../../assets/carriers/dhl.svg";
import upsLogo        from "../../assets/carriers/ups.svg";
import dpdLogo        from "../../assets/carriers/dpd.svg";
import glsLogo        from "../../assets/carriers/gls.svg";
import fedexLogo      from "../../assets/carriers/fedex.svg";
import tntLogo        from "../../assets/carriers/tnt.svg";
import emonsLogo      from "../../assets/carriers/emons.svg";
import transOFlexLogo from "../../assets/carriers/trans-o-flex.svg";

/* ═══════════════════════════════════════════════════════════════════════════
   ÜBERSICHT — die Designreferenz der Plattform (Redesign 2026-10)
   ───────────────────────────────────────────────────────────────────────────
   Reiner View-Layer: Markup + CSS (src/styles/overview.css). Daten, KPI-
   Berechnung (computeKpis / kpisFromServerStats), Routing und alle Handler
   sind unverändert — es gibt keine neue Kennzahl und keine neue Abfrage.

   Aufbau:
     Seitenkopf  persönliche Begrüßung „Guten Tag, [Name]" · Datum und
                 Einordnung · EINE Hauptaktion „Neue Sendung" · Mitteilungen
                 (Soft Button) und Konto als Utility
     Kennzahlen  ein kompaktes Band mit vier gleich breiten Zellen
     Arbeit      Letzte Sendungen (≈ 2/3) · Offene Rechnungen (≈ 1/3)
     Meldungen   höchstens drei vorhandene Benachrichtigungen
     Carrier     die acht Carrier als kompakte, helle Fläche mit
                 „Carrier-Angebote vergleichen"

   Feinkorrektur 2026-10: Begrüßung und Carrier-Bereich sind inhaltlich
   zurück — im neuen Designsystem (DM Sans, helle Fläche, keine Netzgrafik,
   keine Symbole), nicht als Kopie der früheren Fassung.
   Entfallen bleiben: Serifengruß, dekorative Chips (Datum/Live/DSGVO),
   Symbole an den Kennzahlen, die dunkle Carrier-Bühne mit Netzstruktur und
   die redundanten „Öffnen"-Aktionen. Die erklärenden Onboarding-Abschnitte
   bleiben — wie bisher ausschließlich für ein Konto OHNE operative Daten — in
   ruhiger Textform erhalten.
   ═══════════════════════════════════════════════════════════════════════════ */

function getTodayLabel() {
  try { return new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return null; }
}

/* ── Carrier-Bereich ──
   Dieselben acht Carrier mit Leistung und typischer Laufzeit wie vor dem
   Redesign. Der Titel nennt die Zahl als Wort — dass „Acht" und
   CARRIERS.length übereinstimmen, hält overviewSections.test.mjs fest. */
const CARRIERS = [
  { key: "dhl",          logo: dhlLogo,        alt: "DHL",          service: "Express",  time: "1–2 Tage" },
  { key: "ups",          logo: upsLogo,        alt: "UPS",          service: "Standard", time: "1–3 Tage" },
  { key: "dpd",          logo: dpdLogo,        alt: "DPD",          service: "Classic",  time: "1–2 Tage" },
  { key: "gls",          logo: glsLogo,        alt: "GLS",          service: "Standard", time: "1–2 Tage" },
  { key: "fedex",        logo: fedexLogo,      alt: "FedEx",        service: "Express",  time: "1–2 Tage" },
  { key: "tnt",          logo: tntLogo,        alt: "TNT",          service: "Economy",  time: "2–3 Tage" },
  { key: "emons",        logo: emonsLogo,      alt: "Emons",        service: "Standard", time: "2–4 Tage" },
  { key: "trans-o-flex", logo: transOFlexLogo, alt: "trans-o-flex", service: "Express",  time: "1–2 Tage" },
];

/* ── Onboarding-Inhalte (Copy wortgleich zum bisherigen Stand) ── */
const STEPS = [
  { title: "Paketdaten eingeben",  desc: "Geben Sie Abhol- und Lieferadresse, Maße, Gewicht und weitere Details ein." },
  { title: "Angebote vergleichen", desc: "Vergleichen Sie Preise und Laufzeiten aller führenden Carrier in Echtzeit." },
  { title: "Versand buchen",       desc: "Wählen Sie das beste Angebot und buchen Sie Ihren Versand." },
  { title: "Tracking verfolgen",   desc: "Behalten Sie Ihre Sendung jederzeit im Blick – in Echtzeit." },
];
/* „Beste Preise" ist zu „Konditionen direkt vergleichen" geworden: der
   Superlativ war eine unbelegte Werbeaussage, der Vergleich selbst ist die
   tatsächlich vorhandene Funktion. */
const WHY = [
  { key: "b2b",     title: "Für Geschäftskunden entwickelt", desc: "Speziell für Unternehmen entwickelt – mit Transparenz, einfacher Abwicklung und persönlichem Support." },
  { key: "compare", title: "Konditionen direkt vergleichen", desc: "Wir vergleichen für Sie automatisch die Preise von führenden Versanddienstleistern." },
  { key: "modes",   title: "Express & Standard",             desc: "Egal ob Express oder Standard – finden Sie die passende Versandart für Ihre Anforderungen." },
  { key: "trans",   title: "Vollständige Transparenz",       desc: "Verfolgen Sie jede Sendung in Echtzeit und behalten Sie alle wichtigen Informationen im Blick." },
];
const TRUST = [
  { title: "Sicher & DSGVO-konform", desc: "Ihre Daten sind sicher und werden DSGVO-konform verarbeitet." },
  { title: "Persönlicher Support",   desc: "Unser Team ist für Sie da – schnell und zuverlässig." },
  { title: "Tiefpreisgarantie",      desc: "Wir garantieren Ihnen die besten Versandpreise." },
];

// `kpisReady` sagt: „die Sendungen wurden mindestens EINMAL erfolgreich geladen".
// Nur dann darf eine Zahl (auch die 0) stehen — eine 0 ist sonst nicht von einem
// Ladefehler zu unterscheiden und behauptet fälschlich „Sie haben keine Sendungen".
// Bleibt der Wert aus (älterer Aufrufer), fällt das Verhalten auf das bisherige
// `!loading` zurück, statt die Zellen dauerhaft leer zu lassen.
export function Overview({
  user, shipments, invoices, invoiceSummary, serverStats, loading, kpisReady,
  onNewShipment, onAllShipments, onAllInvoices, onProfile, onNotificationNav,
}) {
  const navigate = useNavigate();

  // KPI-Quelle (Phase 1 Betriebsreife): Seit die Sendungsliste paginiert geladen wird,
  // zählt das SERVERSEITIGE stats-Aggregat über alle Sendungen — computeKpis über die
  // sichtbare Seite wäre bei mehr als einer Seite eine falsche Zahl. Fehlt stats (altes
  // Backend, unbrauchbare Antwort), fällt die Kennzahl auf computeKpis über die geladenen
  // Zeilen zurück. kpisFromServerStats ist fail-safe und liefert dieselbe Ergebnisform.
  const k = useMemo(
    () => kpisFromServerStats(serverStats) || computeKpis(shipments),
    [serverStats, shipments]
  );
  const todayLabel = getTodayLabel();
  const ready = kpisReady === undefined ? !loading : kpisReady;

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

  // Zusatzangabe der ersten Kennzahl. `new24` ist eine echte Zahl aus computeKpis
  // (Sendungen mit created_at innerhalb der letzten 24 Stunden) — kein Trend,
  // keine Prozentangabe, kein Vergleichswert.
  const activeNote = k.hasCreatedAt && k.new24 > 0 ? `${k.new24} neu in 24 h` : null;

  // Vier Kennzahlen. Nur „Zugestellt" ist monatsbezogen — und diese Grenze zieht
  // ausschließlich der Server (delivered_this_month, Geschäftszeitzone
  // Europe/Berlin). Die übrigen drei zeigen den aktuellen Stand ohne Zeitraum.
  // „Noch nicht abgeschlossen" beschreibt die erste Zahl neutral: isActive()
  // zählt jeden offenen Business-Status, auch noch nicht übergebene Sendungen.
  const KPIS = [
    { key: "active",    label: "Aktive Sendungen", value: String(k.active),    context: "Noch nicht abgeschlossen",        note: activeNote },
    { key: "transit",   label: "In Zustellung",    value: String(k.inTransit), context: "Auf dem Weg zum Empfänger",       note: null },
    { key: "delivered", label: "Zugestellt",       value: String(k.delivered), context: "Im aktuellen Monat",              note: null },
    { key: "delayed",   label: "Verzögert",        value: String(k.delayed),   context: "Über dem geplanten Liefertermin", note: null },
  ];

  return (
    <>
      <PageHeader
        title={greetingName
          ? <>Guten Tag, <span className="ov-greeting-name">{greetingName}</span></>
          : "Guten Tag"}
        subtitle={todayLabel ? `${todayLabel} · Ihr Versand im Überblick` : "Ihr Versand im Überblick"}
        utility={(
          <UtilityCluster>
            {/* Zustand und Polling kommen aus dem Shell-Provider; hier entsteht
                keine zweite Abfrageschleife. */}
            <NotificationBell variant="overview" navigateTo={onNotificationNav} />
            <UserChip user={user} onClick={onProfile} />
          </UtilityCluster>
        )}
        actions={(
          <button type="button" className="btn btn-primary" onClick={onNewShipment}>
            Neue Sendung
          </button>
        )}
      />

      <div className="page-body ov-page">
        {/* ── Betriebsüberblick: EIN Band, vier gleich breite Zellen ──
            Die Zellen sind reine Informationsflächen: kein Cursor, kein Hover,
            kein Symbol, kein eigener Farbton je Kennzahl. */}
        <section className="ov-kpis" aria-label="Betriebsüberblick">
          {KPIS.map((kpi) => (
            <div className={`ov-kpi ov-kpi--${kpi.key}`} key={kpi.key}>
              <span className="ov-kpi-label">{kpi.label}</span>
              {/* Solange nichts erfolgreich geladen wurde, steht „—" statt einer
                  Zahl: weder beim ersten Laden noch nach einem Ladefehler darf
                  eine 0 erscheinen, die wie ein echtes Ergebnis aussieht. */}
              <span className="ov-kpi-value">{ready ? kpi.value : "—"}</span>
              <span className="ov-kpi-context">
                {!ready ? (loading ? "Wird geladen…" : "Noch nicht verfügbar") : (
                  <>
                    {kpi.context}
                    {kpi.note && <span className="ov-kpi-note"> · {kpi.note}</span>}
                  </>
                )}
              </span>
            </div>
          ))}
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
            <OpenInvoices invoices={invoices} summary={invoiceSummary} onAll={onAllInvoices} />
          </div>
        )}

        {operational && (
          <OverviewNotifications items={notifications} onSelect={openNotification} />
        )}

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
            <h2 className="ov-section-title" id="ov-sec-why">Weniger Aufwand. Mehr Kontrolle.</h2>
            <p className="ov-section-desc">Alles, was Geschäftskunden für einen zuverlässigen Versand benötigen.</p>
            <ul className="ov-facts">
              {WHY.map((w) => (
                <li className="ov-fact" key={w.key}>
                  <span className="ov-fact-title">{w.title}</span>
                  <span className="ov-fact-desc">{w.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!operational && (
          <ul className="ov-trust" aria-label="Zusicherungen">
            {TRUST.map((t) => (
              <li className="ov-trust-item" key={t.title}>
                <span className="ov-fact-title">{t.title}</span>
                <span className="ov-fact-desc">{t.desc}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ── Carrier-Bereich ──
            Kompakt und hell: Titel, ein Satz und die Vergleichsaktion, darunter
            die acht Carrier als ruhige Kacheln (Logo, Leistung, Laufzeit).
            Keine dunkle Bühne, keine Netzgrafik, keine Symbole. Die Aktion
            führt wie bisher zum Versandkostenrechner (/calculator). */}
        <section className="ov-carriers" aria-labelledby="ov-car-title">
          <div className="ov-carriers-head">
            <div className="ov-carriers-intro">
              <h2 className="ov-carriers-title" id="ov-car-title">Acht Carrier. Eine zentrale Plattform.</h2>
              <p className="ov-carriers-desc">Preise und Laufzeiten führender Versanddienstleister direkt vergleichen.</p>
            </div>
            <button type="button" className="btn btn-outline ov-carriers-cta" onClick={() => navigate("/calculator")}>
              Carrier-Angebote vergleichen
            </button>
          </div>
          <ul className="ov-carrier-grid">
            {CARRIERS.map((c) => (
              <li className="ov-carrier" key={c.key}>
                <span className="ov-carrier-logo">
                  <img src={c.logo} alt={c.alt} />
                </span>
                <span className="ov-carrier-service">{c.service}</span>
                <span className="ov-carrier-time">{c.time}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
