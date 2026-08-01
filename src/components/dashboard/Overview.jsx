import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { moneyCompact } from "../../utils/formatters";
import { computeKpis } from "../../utils/kpis";
import dhlLogo        from "../../assets/carriers/dhl.svg";
import upsLogo        from "../../assets/carriers/ups.svg";
import dpdLogo        from "../../assets/carriers/dpd.svg";
import glsLogo        from "../../assets/carriers/gls.svg";
import fedexLogo      from "../../assets/carriers/fedex.svg";
import tntLogo        from "../../assets/carriers/tnt.svg";
import emonsLogo      from "../../assets/carriers/emons.svg";
import transOFlexLogo from "../../assets/carriers/trans-o-flex.svg";

/* ═══════════════════════════════════════════════════════════════════════════
   ÜBERSICHT — reiner View-Layer: Markup + CSS (src/styles/overview.css).
   Daten/Logik/Routing unverändert; KPI-Werte kommen aus dem bestehenden
   Datenfluss (computeKpis). Klassen: pp-* (bestehende Struktur).
   Der Seitenhintergrund kommt aus der gemeinsamen .app-shell — diese Seite
   bringt keine eigene Hintergrund-Ebene mehr mit.
   Die Begrüßung .pp-h1 bleibt in Cormorant-Serif (bestehende Vorgabe).
   ═══════════════════════════════════════════════════════════════════════════ */

// Company-Mark (User-Chip): flacher Squircle in der Akzentfarbe mit echter
// Konto-Initiale. Die früheren zwei Verlaufsebenen und die weiße Innenkontur
// sind entfallen — eine Fläche, ein Buchstabe.
function CompanyMark({ initial }) {
  return (
    <svg className="ce-comark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="11.5" fill="#2563eb" />
      <text x="20" y="26.5" textAnchor="middle" fontFamily="'Libre Franklin',sans-serif" fontWeight="700" fontSize="16.5" fill="#ffffff">{initial}</text>
    </svg>
  );
}

/* ── KPI-Zahl: Ganzzahl (.knum) + optionale Einheit (.kcur, z. B. „ €"). ── */
function KpiNum({ v }) {
  const m = String(v).match(/^([\d.,]+)(\D.*)$/);
  if (m) return (<><span className="knum">{m[1]}</span><span className="kcur">{m[2].trim()}</span></>);
  return <span className="knum">{v}</span>;
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
const WHY = [
  { icon: "shield",    title: "Beste Preise",             desc: "Wir vergleichen für Sie automatisch die Preise von führenden Versanddienstleistern – für das beste Angebot." },
  { icon: "zap",       title: "Express & Standard",       desc: "Egal ob Express oder Standard – finden Sie die passende Versandart für Ihre Anforderungen." },
  { icon: "briefcase", title: "Geschäftskunden Fokus",    desc: "Speziell für Unternehmen entwickelt – mit Transparenz, einfacher Abwicklung und persönlichem Support." },
  { icon: "eye",       title: "Vollständige Transparenz", desc: "Verfolgen Sie jede Sendung in Echtzeit und behalten Sie alle wichtigen Informationen im Blick." },
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

export function Overview({ user, shipments, loading, onNewShipment, onProfile }) {
  const navigate = useNavigate();
  const name = user?.name || user?.company_name || "Kunde";
  const org  = user?.company_name && user?.company_name !== user?.name ? user.company_name : null;
  const initial = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const k = useMemo(() => computeKpis(shipments), [shipments]);
  const todayLabel = getTodayLabel();

  const activeFoot = k.hasCreatedAt && k.new24 > 0
    ? { delta: `+${k.new24}`, deltaClass: "d-blue", label: "neu · 24 h", dot: true }
    : { label: "Live aus Ihren Sendungen", dot: true };
  const spendFoot = !k.hasSpend
    ? { label: "Keine Ausgaben im aktuellen Monat" }
    : k.deltaPct !== null
      ? { delta: `${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct} %`, deltaClass: k.deltaPct >= 0 ? "d-green" : "d-amber", label: "vs. letzter Monat" }
      : { label: "Aktueller Monat" };

  const KPIS = [
    { key: "active",    tone: "hero",  icon: "package", label: "Aktive Sendungen", value: String(k.active),          foot: activeFoot },
    { key: "transit",   tone: "blue",  icon: "truck",   label: "In Zustellung",    value: String(k.inTransit),       foot: { label: "Aktueller Stand" } },
    { key: "delivered", tone: "mint",  icon: "check",   label: "Zugestellt",       value: String(k.delivered),       foot: { label: "Aktueller Stand" } },
    { key: "delayed",   tone: "amber", icon: "clock",   label: "Verzögert",        value: String(k.delayed),         foot: { label: "Aktueller Stand" } },
    { key: "spend",     tone: "lav",   glyph: "€",      label: "Ausgaben (Monat)", value: moneyCompact(k.spendThis), foot: spendFoot },
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
        <div className="pp-actions">
          <span className="pp-bell" aria-hidden="true"><Icon n="bell" s={18} /></span>
          <button type="button" className="pp-uchip" onClick={onProfile} aria-label="Zu meinem Profil" title="Zu meinem Profil">
            <CompanyMark initial={initial} />
            <span className="pp-uchip-text">
              <span className="pp-uname">{name}</span>
              {org && <span className="pp-ucomp">{org}</span>}
            </span>
            <Icon n="chevron" s={15} />
          </button>
          <button type="button" className="pp-cta" onClick={onNewShipment}>
            <Icon n="plus" s={16} c="#fff" />Neue Sendung
          </button>
        </div>
      </header>

      {/* ── KPI-Reihe (echte Daten; 1. Karte = Featured) ── */}
      <div className="pp-kpis">
        {KPIS.map((kpi) => (
          <div className={`pp-kpi tile${kpi.key === "active" ? " pp-kpi-hero" : ""}`} key={kpi.key}>
            <div className="pp-kpi-head">
              <span className={`pp-medal m-${kpi.tone}`}>
                {kpi.icon ? <Icon n={kpi.icon} s={21} /> : <span className="eur">{kpi.glyph}</span>}
              </span>
              <span className="pp-kpi-label">{kpi.label}</span>
            </div>
            <div className="pp-kpi-num"><KpiNum v={loading ? "—" : kpi.value} /></div>
            <div className="pp-kpi-sub">
              {loading ? "Wird geladen…" : (
                <>
                  {kpi.foot.dot && <span className="ce-live" />}
                  {kpi.foot.delta && (
                    <span className={`kchip ${kpi.foot.deltaClass}`}><Icon n="trendingUp" s={12} />{kpi.foot.delta}</span>
                  )}
                  <span>{kpi.foot.label}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Ablauf ── */}
      <section className="pp-sec">
        <div className="pp-eyebrow">Ablauf</div>
        <h2 className="pp-h2">So einfach funktioniert es</h2>
        <div className="pp-steps">
          {STEPS.map((s, i) => (
            <div className="pp-step" key={i}>
              <div className="pp-step-ic pp-medal m-blue"><Icon n={s.icon} s={22} /></div>
              {i < STEPS.length - 1 && <span className="pp-step-con" aria-hidden="true" />}
              <div className="pp-step-no">{String(i + 1).padStart(2, "0")}</div>
              <div className="pp-step-t">{s.title}</div>
              <div className="pp-step-d">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vorteile ── */}
      <section className="pp-sec">
        <div className="pp-eyebrow">Vorteile</div>
        <h2 className="pp-h2">Warum ConfidaraExpress?</h2>
        <div className="pp-vals">
          {WHY.map((w, i) => (
            <div className="pp-vcard tile" key={i}>
              <div className="pp-medal m-blue"><Icon n={w.icon} s={20} /></div>
              <div className="pp-v-t">{w.title}</div>
              <div className="pp-v-d">{w.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Netzwerk ── */}
      <section className="pp-sec">
        <div className="pp-sec-head">
          <div>
            <div className="pp-eyebrow">Netzwerk</div>
            <h2 className="pp-h2">Carrier Netzwerk</h2>
          </div>
          <button type="button" className="pp-compare" onClick={() => navigate("/calculator")}>
            Preise vergleichen<Icon n="arrowRight" s={17} />
          </button>
        </div>
        <div className="pp-sec-sub">Vergleichen Sie automatisch Preise und Laufzeiten von {CARRIERS.length} führenden Carriern.</div>
        <div className="pp-cars">
          {CARRIERS.map((c) => (
            <div className="pp-car" key={c.key}>
              <div className="pp-car-chip">
                <img src={c.logo} alt={c.alt} className="car-logo" />
              </div>
              <div className="pp-car-svc">{c.service}</div>
              <div className="pp-car-time">{c.time}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust ── */}
      <div className="pp-trust tile">
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
    </div>
  );
}
