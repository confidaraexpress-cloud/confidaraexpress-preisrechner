import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { moneyCompact } from "../../utils/formatters";
import { ContactMailMenu } from "../common/ContactMailMenu";
import dhlLogo         from "../../assets/carriers/dhl.svg";
import upsLogo         from "../../assets/carriers/ups.svg";
import fedexLogo       from "../../assets/carriers/fedex.svg";
import tntLogo         from "../../assets/carriers/tnt.svg";
import dpdLogo         from "../../assets/carriers/dpd.svg";
import glsLogo         from "../../assets/carriers/gls.svg";
import derKurierLogo   from "../../assets/carriers/der-kurier.svg";
import transOFlexLogo  from "../../assets/carriers/trans-o-flex.svg";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

// Verbindliches Aktiv-Set (siehe Analyse). „in_transit" zählt bewusst mit —
// eine Sendung in Zustellung ist zugleich eine aktive Sendung.
const ACTIVE_STATUSES = ["approved", "active", "pending", "booked", "label_ready", "in_transit"];
// Status, die bekannt und NICHT aktiv sind (dienen nur der Erkennung unbekannter Status).
const INACTIVE_STATUSES = ["delivered", "blocked", "draft", "cancelled", "canceled", "delayed"];
const KNOWN_STATUSES = new Set([...ACTIVE_STATUSES, ...INACTIVE_STATUSES]);

const PROCESS = [
  { icon: "invoice", title: "Paketdaten eingeben", desc: "Geben Sie Abhol- und Lieferadresse, Maße, Gewicht und weitere Details ein." },
  { icon: "cube",    title: "Angebote vergleichen", desc: "Vergleichen Sie Preise und Laufzeiten aller führenden Carrier in Echtzeit." },
  { icon: "cart",    title: "Versand buchen",       desc: "Wählen Sie das beste Angebot und buchen Sie Ihren Versand." },
  { icon: "mapPin",  title: "Tracking verfolgen",   desc: "Behalten Sie Ihre Sendung jederzeit im Blick – in Echtzeit." },
];

const WHY = [
  { icon: "shield",   title: "Beste Preise",             desc: "Wir vergleichen für Sie automatisch die Preise von führenden Versanddienstleistern – für das beste Angebot." },
  { icon: "truck",    title: "Express & Standard",       desc: "Egal ob Express oder Standard – finden Sie die passende Versandart für Ihre Anforderungen." },
  { icon: "building", title: "Geschäftskunden Fokus",    desc: "Speziell für Unternehmen entwickelt – mit Transparenz, einfacher Abwicklung und persönlichem Support." },
  { icon: "eye",      title: "Vollständige Transparenz", desc: "Verfolgen Sie jede Sendung in Echtzeit und behalten Sie alle wichtigen Informationen im Blick." },
];

// Reihenfolge exakt wie in der Designvorlage. Laufzeiten sind Marketing-Copy,
// KEINE verbindlichen Live-Tarife (die Buchung ermittelt echte Tarife serverseitig).
const CARRIERS = [
  { name: "DHL",          logo: dhlLogo,        service: "Express",  days: "1–2 Tage" },
  { name: "UPS",          logo: upsLogo,        service: "Standard", days: "1–3 Tage" },
  { name: "dpd",          logo: dpdLogo,        service: "Classic",  days: "1–2 Tage" },
  { name: "GLS",          logo: glsLogo,        service: "Standard", days: "1–2 Tage" },
  { name: "FedEx",        logo: fedexLogo,      service: "Express",  days: "1–2 Tage" },
  { name: "TNT",          logo: tntLogo,        service: "Economy",  days: "2–3 Tage" },
  { name: "Der Kurier",   logo: derKurierLogo,  service: "Standard", days: "2–4 Tage" },
  { name: "trans-o-flex", logo: transOFlexLogo, service: "Express",  days: "1–2 Tage" },
];

const TRUST = [
  { icon: "shield",  title: "Sicher & DSGVO-konform", desc: "Ihre Daten sind sicher und werden DSGVO-konform verarbeitet." },
  { icon: "headset", title: "Persönlicher Support",   desc: "Unser Team ist für Sie da – schnell und zuverlässig." },
  { icon: "star",    title: "Tiefpreisgarantie",      desc: "Wir garantieren Ihnen die besten Versandpreise." },
];

// Alle KPI-Werte werden ausschließlich aus echten, bereits geladenen Sendungsdaten
// berechnet — keine Mock-Zahlen, keine erfundenen Deltas/Zeitreihen.
function computeKpis(shipments) {
  const list = Array.isArray(shipments) ? shipments : [];
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startThis = new Date(y, m, 1);
  const startNext = new Date(y, m + 1, 1);
  const startPrev = new Date(y, m - 1, 1);
  const DAY = 86_400_000;

  let active = 0, inTransit = 0, delivered = 0, delayed = 0, new24 = 0;
  let hasCreatedAt = false;
  let spendThis = 0, spendPrev = 0;
  const dayBuckets = {};
  const unknown = new Set();

  for (const s of list) {
    const st = s?.status;
    if (ACTIVE_STATUSES.includes(st)) active++;
    if (st === "in_transit") inTransit++;
    if (st === "delivered") delivered++;
    if (st === "delayed") delayed++;
    if (st && !KNOWN_STATUSES.has(st)) unknown.add(st); // unbekannt → NICHT blind als aktiv gezählt

    if (s?.created_at) {
      const t = new Date(s.created_at).getTime();
      if (!Number.isNaN(t)) {
        hasCreatedAt = true;
        const diff = now.getTime() - t;
        if (diff >= 0 && diff <= DAY) new24++;
        const amt = Number(s.price_final);
        if (Number.isFinite(amt) && amt > 0) {
          const d = new Date(t);
          if (d >= startThis && d < startNext) {
            spendThis += amt;
            const day = d.getDate();
            dayBuckets[day] = (dayBuckets[day] || 0) + amt;
          } else if (d >= startPrev && d < startThis) {
            spendPrev += amt;
          }
        }
      }
    }
  }

  const deltaPct = spendPrev > 0 ? Math.round(((spendThis - spendPrev) / spendPrev) * 100) : null;
  const today = now.getDate();
  const spark = [];
  for (let day = 1; day <= today; day++) spark.push(dayBuckets[day] || 0);

  return {
    active, inTransit, delivered, delayed, new24, hasCreatedAt,
    spendThis, spendPrev, deltaPct, spark, hasSpend: spendThis > 0,
    unknownStatuses: Array.from(unknown),
  };
}

// Echte Sparkline aus der Tagesverteilung der Monatsausgaben (created_at + price_final).
function Sparkline({ data, w = 96, h = 30 }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const n = data.length;
  const step = n > 1 ? w / (n - 1) : w;
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="ce-kpi-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#c4b5fd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashboardFooter({ onMailClick }) {
  return (
    <footer className="ce-footer">
      <div className="ce-footer-grid">
        <div>
          <div className="ce-footer-brand">
            <div className="logo-mark" style={{ width: 34, height: 34, fontSize: 13 }}>CE</div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--ce-ink-1)" }}>
              Confidara<b style={{ color: "var(--ce-blue-3)" }}>Express</b>
            </span>
          </div>
          <p className="ce-footer-tag">
            B2B-Versandplattform für professionellen Paketversand. Transparente Preise, starke Carrier, alles an einem Ort.
          </p>
          <div className="ce-footer-social">
            <button
              type="button"
              className="ce-footer-mail-btn"
              onClick={onMailClick}
              aria-label="E-Mail schreiben"
              title="support@confidaraexpress.de"
            >
              <Icon n="mail" s={16} />
            </button>
          </div>
        </div>

        <div className="ce-footer-col">
          <h4>Rechtliches</h4>
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
          <Link to="/agb">AGB</Link>
          <Link to="/widerruf">Widerruf</Link>
        </div>

        <div className="ce-footer-col">
          <h4>Kontakt</h4>
          <div className="ce-footer-contact-row">
            <Icon n="mail" s={14} />
            <button
              type="button"
              className="ce-footer-mail-link"
              onClick={onMailClick}
            >
              support@confidaraexpress.de
            </button>
          </div>
          <div className="ce-footer-contact-row">
            <Icon n="phone" s={14} />
            015118003775
          </div>
          <div className="ce-footer-contact-row">
            <Icon n="mapPin" s={14} />
            Deutschland
          </div>
        </div>
      </div>

      <div className="ce-footer-bottom">
        © 2026 Confidara Express GbR · Alle Rechte vorbehalten
      </div>
    </footer>
  );
}

export function Overview({ user, shipments, loading, onNewShipment }) {
  const [mailOpen, setMailOpen] = useState(false);
  const navigate = useNavigate();

  const name = user?.name || user?.company_name || "Kunde";
  const company = user?.company_name && user?.company_name !== user?.name ? user.company_name : null;
  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const k = useMemo(() => computeKpis(shipments), [shipments]);

  const handleMailClick = () => {
    const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (isDesktop) setMailOpen(true);
    else window.location.href = "mailto:support@confidaraexpress.de";
  };

  const spendFoot = !k.hasSpend
    ? "Keine Ausgaben im aktuellen Monat"
    : k.deltaPct !== null
      ? <span className={`ce-kpi-delta ${k.deltaPct >= 0 ? "up" : "down"}`}>
          {k.deltaPct >= 0 ? "+" : ""}{k.deltaPct}% vs. letzter Monat
        </span>
      : "Aktueller Monat";

  const kpiCards = [
    { key: "active",    icon: "cube",  tone: "blue",   label: "Aktive Sendungen", value: k.active,
      foot: k.hasCreatedAt ? `${k.new24} neu in 24 h` : "Live aus Ihren Sendungen" },
    { key: "transit",   icon: "truck", tone: "cyan",   label: "In Zustellung", value: k.inTransit, foot: "Aktueller Stand" },
    { key: "delivered", icon: "check", tone: "green",  label: "Zugestellt",    value: k.delivered, foot: "Aktueller Stand" },
    { key: "delayed",   icon: "clock", tone: "amber",  label: "Verzögert",     value: k.delayed,   foot: "Aktueller Stand" },
    { key: "spend",     icon: "euro",  tone: "violet", label: "Ausgaben (Monat)", value: moneyCompact(k.spendThis),
      foot: spendFoot, spark: k.hasSpend && k.spark.length >= 2 ? k.spark : null },
  ];

  return (
    <div className="ce-overview">
      <div className="ce-aurora" aria-hidden="true">
        <div className="ce-aurora-ray" />
        <div className="ce-aurora-glow" />
      </div>

      <div className="ce-page">
        {/* ── Header / Greeting / Actions ── */}
        <div className="ce-head">
          <div className="ce-head-greet">
            <h1 className="ce-greeting-lg">
              {getGreeting()}, <span className="ce-greeting-name">{name}</span>
            </h1>
            <p className="ce-greeting-sub">Hier ist Ihre Übersicht für heute.</p>
          </div>
          <div className="ce-head-actions">
            <button
              type="button"
              className="ce-user-pill"
              onClick={() => navigate("/dashboard?page=profile")}
              title="Zu meinem Profil"
            >
              <span className="ce-user-pill-avatar">{initials}</span>
              <span className="ce-user-pill-info">
                <span className="ce-user-pill-name">{name}</span>
                {company && <span className="ce-user-pill-company">{company}</span>}
              </span>
            </button>
            <button type="button" className="ce-btn-primary" onClick={onNewShipment}>
              <Icon n="plus" s={18} /> Neue Sendung
            </button>
          </div>
        </div>

        {/* ── KPI-Reihe (echte Daten) ── */}
        <div className="ce-kpi-grid">
          {kpiCards.map((c) => (
            <div className="ce-kpi-card" key={c.key}>
              <div className="ce-kpi-head">
                <div className={`ce-kpi-ico ce-kpi-ico-${c.tone}`}><Icon n={c.icon} s={22} /></div>
                <div className="ce-kpi-label">{c.label}</div>
              </div>
              <div className="ce-kpi-mid">
                <div className={`ce-kpi-value${c.key === "spend" ? " money" : ""}`}>
                  {loading ? <span className="ce-kpi-skel" /> : c.value}
                </div>
                {!loading && c.spark && <Sparkline data={c.spark} />}
              </div>
              <div className="ce-kpi-foot">{loading ? "Wird geladen…" : c.foot}</div>
            </div>
          ))}
        </div>

        {/* ── So einfach funktioniert es ── */}
        <section className="ce-panel">
          <h2 className="ce-panel-title">So einfach funktioniert es</h2>
          <div className="ce-proc-grid">
            {PROCESS.map((p) => (
              <div className="ce-proc-step" key={p.title}>
                <div className="ce-proc-node"><Icon n={p.icon} s={24} /></div>
                <div className="ce-proc-title">{p.title}</div>
                <p className="ce-proc-desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Warum ConfidaraExpress? ── */}
        <section className="ce-panel">
          <h2 className="ce-panel-title">Warum ConfidaraExpress?</h2>
          <div className="ce-why-grid">
            {WHY.map((wcard) => (
              <div className="ce-why-card" key={wcard.title}>
                <div className="ce-why-ico"><Icon n={wcard.icon} s={22} /></div>
                <div className="ce-why-title">{wcard.title}</div>
                <p className="ce-why-desc">{wcard.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Carrier-Netzwerk ── */}
        <section className="ce-panel">
          <h2 className="ce-panel-title">Carrier Netzwerk</h2>
          <p className="ce-panel-sub">
            Vergleichen Sie automatisch Preise und Laufzeiten von {CARRIERS.length} führenden Carriern.
          </p>
          <div className="ce-cn-grid">
            {CARRIERS.map((c) => (
              <div className="ce-cn-tile" key={c.name}>
                <img src={c.logo} alt={c.name} className="ce-cn-logo" />
                <div className="ce-cn-service">{c.service}</div>
                <div className="ce-cn-days">{c.days}</div>
              </div>
            ))}
          </div>
          <div className="ce-cn-cta">
            <button type="button" className="ce-btn-primary" onClick={() => navigate("/calculator")}>
              Preise vergleichen <Icon n="arrowRight" s={18} />
            </button>
          </div>
        </section>

        {/* ── Trust-Bar ── */}
        <div className="ce-trust">
          {TRUST.map((t) => (
            <div className="ce-trust-item" key={t.title}>
              <div className="ce-trust-ico"><Icon n={t.icon} s={20} /></div>
              <div>
                <div className="ce-trust-title">{t.title}</div>
                <p className="ce-trust-desc">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <DashboardFooter onMailClick={handleMailClick} />
      </div>

      <ContactMailMenu open={mailOpen} onClose={() => setMailOpen(false)} />
    </div>
  );
}
