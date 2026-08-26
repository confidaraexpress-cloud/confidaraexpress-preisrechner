import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { NotificationBell } from "../notifications/NotificationBell";
import { useNotifications } from "../../context/NotificationsContext";
import { computeKpis, kpisFromServerStats } from "../../utils/kpis";
import { hasOperationalData } from "../../utils/overviewModules.mjs";
import { notificationTarget } from "../../utils/notificationsView.mjs";
import { RecentShipments, OpenInvoices, OverviewNotifications } from "./OverviewModules";
import signetStandard from "../../assets/brand/signet-standard.svg";
import dhlLogo        from "../../assets/carriers/dhl.svg";
import upsLogo        from "../../assets/carriers/ups.svg";
import dpdLogo        from "../../assets/carriers/dpd.svg";
import glsLogo        from "../../assets/carriers/gls.svg";
import fedexLogo      from "../../assets/carriers/fedex.svg";
import tntLogo        from "../../assets/carriers/tnt.svg";
import emonsLogo      from "../../assets/carriers/emons.svg";
import transOFlexLogo from "../../assets/carriers/trans-o-flex.svg";
import { UserChip } from "../ui/UserChip";

/* ═══════════════════════════════════════════════════════════════════════════
   ÜBERSICHT — reiner View-Layer: Markup + CSS (src/styles/overview.css).
   Daten/Logik/Routing unverändert; KPI-Werte kommen aus dem bestehenden
   Datenfluss (computeKpis). Klassen: pp-* (bestehende Struktur).
   Der Seitenhintergrund kommt aus der gemeinsamen .app-shell — diese Seite
   bringt keine eigene Hintergrund-Ebene mehr mit.
   Die Begrüßung .pp-h1 bleibt in Cormorant-Serif (bestehende Vorgabe).
   ═══════════════════════════════════════════════════════════════════════════ */


/* ── KPI-Zahl: Ganzzahl (.knum) + optionale Einheit (.kcur, z. B. „ €"). ── */
function KpiNum({ v }) {
  const m = String(v).match(/^([\d.,]+)(\D.*)$/);
  if (m) return (<><span className="knum">{m[1]}</span><span className="kcur">{m[2].trim()}</span></>);
  return <span className="knum">{v}</span>;
}

/* ── Gemeinsamer Abschnittskopf der drei Inhaltssektionen ──
   Indexmarke · Hairline · Label, darunter Titel und genau eine erklärende
   Zeile. Die Hairline ersetzt den Schrägstrich der Schreibweise „01 / ABLAUF"
   grafisch und ist rein dekorativ (aria-hidden). `invert` schaltet auf die
   Tonwerte der dunklen Carrier-Fläche um — gleiche Struktur, gleiche Maße.
   Die Überschrift bleibt ein <h2> unter der <h1> der Begrüßung; `id` verbindet
   sie über aria-labelledby mit ihrer <section>. */
function SectionHead({ no, label, title, desc, id, invert = false }) {
  return (
    <header className={`pp-shead${invert ? " pp-shead--invert" : ""}`}>
      <div className="pp-shead-top">
        <span className="pp-shead-no">{no}</span>
        <span className="pp-shead-rule" aria-hidden="true" />
        <span className="pp-shead-label">{label}</span>
      </div>
      <h2 className="pp-shead-title" id={id}>{title}</h2>
      <p className="pp-shead-desc">{desc}</p>
    </header>
  );
}

/* Rein dekorative Netzstruktur der Carrier-Fläche: drei ruhige Routen mit
   Knoten an ihren tatsächlichen Kurvenpunkten. Statisch, ohne Filter und ohne
   Animation; Farben kommen aus --ce-net-line/--ce-net-node (siehe overview.css
   für die Abgrenzung zur Hintergrundregel aus CLAUDE.md). */
function NetworkPattern() {
  return (
    <svg className="pp-net-bg" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g className="pp-net-route">
        <path d="M-40 318 C 220 250, 340 120, 620 150 S 1000 250, 1260 118" />
        <path d="M-40 178 C 260 128, 420 300, 700 300 S 1020 158, 1260 212" />
        <path d="M120 430 C 300 330, 560 380, 780 250 S 1080 60, 1240 38" />
      </g>
      <g className="pp-net-node">
        <circle cx="620" cy="150" r="3" />
        <circle cx="700" cy="300" r="3" />
        <circle cx="780" cy="250" r="3" />
        <circle cx="1260" cy="118" r="2" />
        <circle cx="1240" cy="38" r="2" />
      </g>
    </svg>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}
function getTodayLabel() {
  try { return new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return null; }
}

/* ── Statische Inhalte (Copy wortgleich, Icons je Handoff §13/§349) ── */
const STEPS = [
  { icon: "form",   title: "Paketdaten eingeben",  desc: "Geben Sie Abhol- und Lieferadresse, Maße, Gewicht und weitere Details ein." },
  { icon: "layers", title: "Angebote vergleichen", desc: "Vergleichen Sie Preise und Laufzeiten aller führenden Carrier in Echtzeit." },
  { icon: "cart",   title: "Versand buchen",       desc: "Wählen Sie das beste Angebot und buchen Sie Ihren Versand." },
  { icon: "mapPin", title: "Tracking verfolgen",   desc: "Behalten Sie Ihre Sendung jederzeit im Blick – in Echtzeit." },
];
/* Vier Vorteile, EINE Liste — das Bento-Layout entsteht allein aus den Flags
   `hero`/`wide`, nicht aus doppelt gepflegten Datensätzen.
   `hero` trägt die B2B-Positionierung (dunkle Leitkarte), `wide` die breite
   Nebenkarte. Reihenfolge = Lesereihenfolge, auch einspaltig auf dem Handy.
   „Beste Preise" ist zu „Konditionen direkt vergleichen" geworden: der
   Superlativ war eine unbelegte Werbeaussage, der Vergleich selbst ist die
   tatsächlich vorhandene Funktion. Aus demselben Grund endet die Beschreibung
   jetzt nach dem belegbaren Teil („… Versanddienstleistern.") — der Zusatz
   „für das beste Angebot" behauptete ein Ergebnis, das nicht zugesichert ist. */
const WHY = [
  { key: "b2b",     icon: "briefcase", hero: true, title: "Für Geschäftskunden entwickelt", desc: "Speziell für Unternehmen entwickelt – mit Transparenz, einfacher Abwicklung und persönlichem Support." },
  { key: "compare", icon: "shield",    wide: true, title: "Konditionen direkt vergleichen", desc: "Wir vergleichen für Sie automatisch die Preise von führenden Versanddienstleistern." },
  { key: "modes",   icon: "zap",                   title: "Express & Standard",             desc: "Egal ob Express oder Standard – finden Sie die passende Versandart für Ihre Anforderungen." },
  { key: "trans",   icon: "eye",                   title: "Vollständige Transparenz",       desc: "Verfolgen Sie jede Sendung in Echtzeit und behalten Sie alle wichtigen Informationen im Blick." },
];
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
const TRUST = [
  { icon: "lock",    title: "Sicher & DSGVO-konform", desc: "Ihre Daten sind sicher und werden DSGVO-konform verarbeitet." },
  { icon: "headset", title: "Persönlicher Support",   desc: "Unser Team ist für Sie da – schnell und zuverlässig." },
  { icon: "star",    title: "Tiefpreisgarantie",      desc: "Wir garantieren Ihnen die besten Versandpreise." },
];

// `kpisReady` sagt: „die Sendungen wurden mindestens EINMAL erfolgreich geladen".
// Nur dann darf eine Zahl (auch die 0) stehen — eine 0 ist sonst nicht von einem
// Ladefehler zu unterscheiden und behauptet fälschlich „Sie haben keine Sendungen".
// Bleibt der Wert aus (älterer Aufrufer), fällt das Verhalten auf das bisherige
// `!loading` zurück, statt die Karten dauerhaft leer zu lassen.
export function Overview({
  user, shipments, invoices, invoiceSummary, serverStats, loading, kpisReady,
  onNewShipment, onAllShipments, onAllInvoices, onProfile, onNotificationNav,
}) {
  const navigate = useNavigate();
  const name = user?.name || user?.company_name || "Kunde";

  // KPI-Quelle (Phase 1 Betriebsreife): Seit die Sendungsliste paginiert geladen wird,
  // zählt das SERVERSEITIGE stats-Aggregat über alle Sendungen — computeKpis über die
  // sichtbare Seite wäre bei mehr als einer Seite eine falsche Zahl. Fehlt stats (altes
  // Backend, unbrauchbare Antwort), fällt die Karte auf computeKpis über die geladenen
  // Zeilen zurück — exakt das Verhalten vor diesem Paket. kpisFromServerStats ist
  // fail-safe (null statt geratener Werte) und liefert dieselbe Ergebnisform.
  const k = useMemo(
    () => kpisFromServerStats(serverStats) || computeKpis(shipments),
    [serverStats, shipments]
  );
  const todayLabel = getTodayLabel();
  const ready = kpisReady === undefined ? !loading : kpisReady;

  // Operative Arbeitsfläche oder Onboarding? Solange nichts geladen ist, gilt
  // das Konto als operativ — sonst blitzt beim ersten Rendern kurz das
  // Onboarding auf und springt danach um (siehe hasOperationalData).
  const operational = hasOperationalData({ shipments, invoices, ready });

  // Benachrichtigungen kommen aus dem BESTEHENDEN Shell-Provider: derselbe
  // Zustand, dasselbe Polling, dieselbe Gelesen-Logik wie im Panel. Die volle
  // Liste holt der Provider sonst erst beim Öffnen des Panels — hier wird sie
  // EINMAL angefordert, wenn sie noch nie geladen wurde. Kein zweiter Takt,
  // kein zweiter Zustand, keine neue Route.
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

  // Zusatzangabe der ersten Karte. `new24` ist eine echte Zahl aus computeKpis
  // (Sendungen mit created_at innerhalb der letzten 24 Stunden) — kein Trend,
  // keine Prozentangabe, kein Vergleichswert. Sie hängt als Nachsatz an der
  // Kontextzeile, statt wie bisher als Chip mit Trendpfeil aufzutreten: der
  // Pfeil suggerierte eine Entwicklung, die die Zahl nicht behauptet.
  const activeNote = k.hasCreatedAt && k.new24 > 0 ? `${k.new24} neu in 24 h` : null;

  // Vier Karten. Nur „Zugestellt" ist monatsbezogen — und diese Grenze zieht
  // ausschließlich der Server (delivered_this_month, Geschäftszeitzone
  // Europe/Berlin). Die übrigen drei zeigen den aktuellen Stand ohne Zeitraum.
  //
  // Kontextzeile der ersten Karte: „Noch nicht abgeschlossen" statt einer
  // Formulierung, die einen bereits laufenden physischen Versandschritt
  // unterstellt. isActive() zählt jeden offenen Business-Status — auch
  // `pending` und `approved`, also Sendungen, die noch gar nicht übergeben
  // sind. Eine Versand-Formulierung würde für diese Fälle mehr behaupten als
  // die Zahl deckt und die Karte zudem gegen „In Zustellung" verwischen;
  // „Noch nicht abgeschlossen" beschreibt exakt diese Menge neutral.
  const KPIS = [
    { key: "active",    icon: "packageMove", label: "Aktive Sendungen", value: String(k.active),    context: "Noch nicht abgeschlossen",        note: activeNote },
    { key: "transit",   icon: "routeArrow",  label: "In Zustellung",    value: String(k.inTransit), context: "Auf dem Weg zum Empfänger",       note: null },
    { key: "delivered", icon: "seal",        label: "Zugestellt",       value: String(k.delivered), context: "Im aktuellen Monat",              note: null },
    { key: "delayed",   icon: "clockDelay",  label: "Verzögert",        value: String(k.delayed),   context: "Über dem geplanten Liefertermin", note: null },
  ];

  return (
    <div className="pp-main">
      {/* ── Header ── */}
      <header className="pp-top">
        <div className="pp-hero">
          <div className="pp-pills">
            {todayLabel && <span className="pp-pill"><Icon n="dashboard" s={13} />{todayLabel}</span>}
            <span className="pp-pill"><span className="ce-live" />Live-Übersicht</span>
            <span className="pp-pill"><Icon n="shieldCheck" s={13} />DSGVO-konform</span>
          </div>
          <h1 className="pp-h1">{getGreeting()}, <em className="pp-hname">{name}</em></h1>
          <p className="pp-hsub">Hier ist Ihre Übersicht für heute.</p>
        </div>
        {/* Utility-Cluster der Übersicht: Glocke und Benutzerchip — mehr nicht.
            Der frühere „Neue Sendung"-Knopf ist hier entfallen: dasselbe Ziel
            bleibt über die permanente Sidebar erreichbar — ein zweiter
            Einstieg auf der Übersicht wäre redundante Navigation. */}
        <div className="pp-actions">
          {/* Dieselbe Position wie zuvor — aus der dekorativen Glocke ist eine echte
              Schaltfläche geworden. Zustand und Polling kommen aus dem Shell-Provider;
              hier entsteht keine zweite Abfrageschleife. */}
          <NotificationBell variant="overview" navigateTo={onNotificationNav} />
          <UserChip user={user} onClick={onProfile} />
        </div>
      </header>

      {/* ── KPI-Reihe (echte Daten; vier gleichwertige Karten) ──
          Keine hervorgehobene erste Karte mehr: die frühere Akzent-Border ließ
          Karte 1 wie ausgewählt aussehen, obwohl die Karten nicht bedienbar
          sind. Unterschieden werden sie jetzt allein über Icon und Eckton. */}
      <div className="pp-kpis">
        {KPIS.map((kpi) => (
          <div className={`pp-kpi kt-${kpi.key}`} key={kpi.key}>
            {/* Beschriftung links, Icon rechts — die Karte liest sich von der
                Beschriftung zur Zahl, nicht vom Icon zur Beschriftung. */}
            <div className="pp-kpi-head">
              <span className="pp-kpi-label">{kpi.label}</span>
              <span className="pp-kpi-icon" aria-hidden="true">
                <Icon n={kpi.icon} s={19} />
              </span>
            </div>
            {/* Solange nichts erfolgreich geladen wurde, steht „—" statt einer Zahl:
                weder beim ersten Laden noch nach einem Ladefehler darf eine 0
                erscheinen, die wie ein echtes Ergebnis aussieht. Nach dem ersten
                Erfolg bleiben die Werte stehen — auch wenn ein späterer Refetch
                scheitert. Den Fehler selbst meldet das bestehende Banner der
                Dashboardseite; hier wird nichts neu gestaltet. */}
            <div className="pp-kpi-num"><KpiNum v={ready ? kpi.value : "—"} /></div>
            <div className="pp-kpi-sub">
              {!ready ? (loading ? "Wird geladen…" : "Noch nicht verfügbar") : (
                <>
                  {kpi.context}
                  {kpi.note && <span className="pp-kpi-note"> · {kpi.note}</span>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Operative Module (Paket D) ──────────────────────────────────────
          Letzte Sendungen, offene Rechnungen und die wichtigsten
          Benachrichtigungen — alle aus bereits vorhandenen Daten und
          bestehenden Zielen. Sie stehen VOR den erklärenden Abschnitten: wer
          täglich arbeitet, soll zuerst seine Vorgänge sehen.

          Die frühere Schnellaktionen-Sektion (fünf Karten: Neue Sendung,
          Versand berechnen, Sendungen ansehen, Rechnungen ansehen,
          Supportanfrage erstellen) ist ersatzlos entfernt — dieselben fünf
          Ziele stehen bereits dauerhaft in der Sidebar, eine zweite
          Verlinkung war redundant. Kein Platzhalter, kein Ersatzinhalt: die
          erste Sektion nach den KPI-Karten ist jetzt direkt „Letzte
          Sendungen" (siehe overview.css, `.ov-mod-grid > .ov-mod` für den
          bewussten Abstand zu den KPI-Karten). */}

      {operational && (
        <div className="ov-mod-grid">
          <RecentShipments
            shipments={shipments}
            loading={loading}
            onAll={onAllShipments}
            onOpen={onAllShipments}
          />
          <OpenInvoices invoices={invoices} summary={invoiceSummary} onAll={onAllInvoices} />
        </div>
      )}

      {operational && (
        <OverviewNotifications items={notifications} onSelect={openNotification} />
      )}

      {/* ── 01 Ablauf — ein zusammenhängendes Prozesspanel ──
          <ol>, weil die vier Stationen eine echte Reihenfolge haben. Die
          Verbindungslinie zeichnet jede Station selbst als ::after (siehe
          overview.css) — kein zusätzliches DOM-Element, kein Eintrag im
          Accessibility-Baum.

          Seit Paket D nur noch für Konten OHNE operative Daten: für einen
          Neukunden ist die Ablauferklärung die richtige Führung, für ein
          arbeitendes Konto wäre sie täglicher Ballast. Die Inhalte selbst sind
          unverändert. */}
      {!operational && (
      <section className="pp-sec" aria-labelledby="pp-sec-flow">
        <SectionHead
          id="pp-sec-flow" no="01" label="Ablauf"
          title="In vier Schritten versandbereit"
          desc="Von den Paketdaten bis zur Zustellung – klar geführt in einer Oberfläche."
        />
        <div className="pp-flow">
          <ol className="pp-flow-track">
            {STEPS.map((s, i) => (
              <li className="pp-flow-step" key={s.title}>
                <span className="pp-flow-ic" aria-hidden="true"><Icon n={s.icon} s={21} /></span>
                <div className="pp-step-no">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="pp-flow-t">{s.title}</h3>
                <p className="pp-flow-d">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      )}

      {/* ── 02 Vorteile — editoriales Bento ──
          Ein einziger map() über WHY; Fläche und Tonwert je Karte kommen aus
          den Flags hero/wide, nicht aus einer zweiten Datenstruktur.
          Wie „01 Ablauf" seit Paket D Onboarding-Inhalt: nur ohne operative
          Daten sichtbar. */}
      {!operational && (
      <section className="pp-sec" aria-labelledby="pp-sec-why">
        <SectionHead
          id="pp-sec-why" no="02" label="Vorteile"
          title="Weniger Aufwand. Mehr Kontrolle."
          desc="Alles, was Geschäftskunden für einen zuverlässigen Versand benötigen."
        />
        <div className="pp-bento">
          {WHY.map((w) => (
            <article
              key={w.key}
              className={`pp-bento-item${w.hero ? " pp-bento-item--hero" : ""}${w.wide ? " pp-bento-item--wide" : ""}`}
            >
              <span className="pp-bento-ic" aria-hidden="true"><Icon n={w.icon} s={w.hero ? 22 : 19} /></span>
              <h3 className="pp-bento-t">{w.title}</h3>
              <p className="pp-bento-d">{w.desc}</p>
              {/* Einzige Kennzahl der Sektion — direkt aus der Carrier-Liste
                  abgeleitet, nicht separat gepflegt. */}
              {w.hero && (
                <p className="pp-bento-fact">
                  <span className="pp-bento-fact-n">{CARRIERS.length}</span>
                  <span className="pp-bento-fact-l">Carrier in einer Oberfläche vergleichbar</span>
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
      )}

      {/* ── 03 Carrier-Netzwerk — dunkle Signature-Fläche ──
          Der Titel nennt die Carrier-Zahl als Wort. Dass „Acht" und
          CARRIERS.length übereinstimmen, hält overviewSections.test.mjs fest:
          Ändert sich die Liste, schlägt der Test fehl, statt den Text still
          falsch werden zu lassen. */}
      <section className="pp-sec" aria-labelledby="pp-sec-net">
        <div className="pp-net">
          <NetworkPattern />
          <div className="pp-net-in">
            <div className="pp-net-head">
              <SectionHead
                id="pp-sec-net" no="03" label="Carrier-Netzwerk" invert
                title="Acht Carrier. Eine zentrale Plattform."
                desc="Preise und Laufzeiten führender Versanddienstleister direkt vergleichen."
              />
              <button type="button" className="pp-net-cta" onClick={() => navigate("/calculator")}>
                Carrier-Angebote vergleichen<Icon n="arrowRight" s={16} />
              </button>
            </div>
            <ul className="pp-cars">
              {CARRIERS.map((c) => (
                <li className="pp-car" key={c.key}>
                  <span className="pp-car-chip">
                    <img src={c.logo} alt={c.alt} className="car-logo" />
                  </span>
                  <span className="pp-car-svc">{c.service}</span>
                  <span className="pp-car-time">{c.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Trust ──
          Ebenfalls Onboarding-Inhalt (Paket D): drei Zusicherungen, die ein
          Neukunde einmal liest. Auf einer täglich genutzten Arbeitsfläche
          stünden sie unter den eigenen Vorgängen und trügen dort nichts bei. */}
      {!operational && (
      <div className="pp-trust tile">
        {/* Lokales Hintergrunddetail dieses Tiles — KEINE seitenweite Ebene und
            keine Rückkehr der entfernten Vapor-/Netzwerk-/Glow-Hintergründe.
            Rein dekorativ, unten rechts angeschnitten, hinter dem Inhalt. */}
        <img
          className="pp-trust-watermark"
          src={signetStandard}
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        {TRUST.map((t, i) => (
          <div className="pp-trust-item" key={i}>
            <div className="pp-medal m-blue"><Icon n={t.icon} s={20} /></div>
            <div>
              <div className="pp-trust-t">{t.title}</div>
              <div className="pp-trust-d">{t.desc}</div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
