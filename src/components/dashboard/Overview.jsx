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
import transOFlexLogo from "../../assets/carriers/trans-o-flex.svg";

/* ═══════════════════════════════════════════════════════════════════════════
   ÜBERSICHT · Premium „Highend Blue" (Master-Handoff, 1:1)
   Reiner View-Layer: Markup + CSS. Daten/Logik/Routing unverändert; KPI-Werte
   kommen aus dem bestehenden Datenfluss (computeKpis). Klassen: pp- und pbg-.
   ═══════════════════════════════════════════════════════════════════════════ */

// Company-Mark (User-Chip, §19-B1): Squircle-Gradient mit echter Konto-Initiale.
function CompanyMark({ initial }) {
  return (
    <svg className="ce-comark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ppCoMark" x1="4" y1="3" x2="34" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4A86FF" /><stop offset="0.52" stopColor="#2A50D6" /><stop offset="1" stopColor="#182A8C" />
        </linearGradient>
        <linearGradient id="ppCoTop" x1="20" y1="2" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11.5" fill="url(#ppCoMark)" />
      <rect x="1" y="1" width="38" height="38" rx="11.5" fill="url(#ppCoTop)" />
      <rect x="1.6" y="1.6" width="36.8" height="36.8" rx="10.9" fill="none" stroke="#ffffff" strokeOpacity="0.28" />
      <text x="20" y="26.5" textAnchor="middle" fontFamily="'Syne','DM Sans',sans-serif" fontWeight="700" fontSize="17" fill="#ffffff">{initial}</text>
    </svg>
  );
}

// „Der Kurier" Wortzeichen (Carrier-Chip, dunkle Schrift für helle Chips, §19-B2).
function DerKurierLogo() {
  return (
    <svg className="car-logo" viewBox="0 0 106 32" width="101" height="30" fill="none" aria-label="Der Kurier">
      <defs>
        <linearGradient id="ppDk" x1="13" y1="3" x2="13" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F04A3C" /><stop offset="1" stopColor="#C71C1C" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="3" width="26" height="26" rx="7.5" fill="url(#ppDk)" />
      <rect x="0.5" y="3" width="26" height="26" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
      <g stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.4 11.2 13 16l-4.6 4.8" /><path d="M14 11.2 18.6 16 14 20.8" opacity="0.6" />
      </g>
      <text x="34" y="14" fontFamily="'Syne',sans-serif" fontWeight="700" fontSize="10.5" letterSpacing="0.04em" fill="#6B7A93">Der</text>
      <text x="34" y="27.6" fontFamily="'Syne',sans-serif" fontWeight="800" fontSize="15" letterSpacing="-0.01em" fill="#14243F">Kurier</text>
    </svg>
  );
}

// Hintergrund-Glyphen (§19-B3) — Line-Icons in dünnem Duktus (stroke 1.1).
function Glyph({ n }) {
  const P = {
    parcel:   "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12",
    envelope: "M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9ZM4 7l8 6 8-6",
    pin:      "M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    plane:    "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  };
  if (n === "truck") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="14" height="12" rx="1" /><path d="M15 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.3" /><circle cx="17.5" cy="18.5" r="2.3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <path d={P[n]} />
    </svg>
  );
}

const GLYPHS = [
  { cls: "g-a", n: "parcel" }, { cls: "g-b", n: "envelope" }, { cls: "g-c", n: "pin" },
  { cls: "g-d", n: "plane" },  { cls: "g-e", n: "truck" },    { cls: "g-f", n: "parcel" },
];

// Fixe Postal-Logistics-Hintergrundebene (§8/§19). aria-hidden, pointer-events:none.
function PostalBackground() {
  const nodes = [[120,760],[820,430],[1470,210],[180,300],[900,340],[1500,640],[300,880],[1120,820]];
  return (
    <div className="pbg" aria-hidden="true">
      <div className="pbg-grad" />
      <span className="pbg-glow g1" /><span className="pbg-glow g2" /><span className="pbg-glow g3" />
      <div className="pbg-dots" />
      <svg className="pbg-routes" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="pgNode" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#bcd6ff" /><stop offset="0.5" stopColor="#5b8cff" /><stop offset="1" stopColor="#2e5cff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pgLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4d8bff" stopOpacity="0" /><stop offset="0.5" stopColor="#6ea8ff" stopOpacity="0.85" /><stop offset="1" stopColor="#4d8bff" stopOpacity="0" />
          </linearGradient>
          <filter id="pgGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g className="pbg-lines" fill="none" stroke="url(#pgLine)" strokeWidth="1.6" strokeDasharray="3 9" strokeLinecap="round">
          <path d="M120 760 C 360 560, 560 600, 820 430" />
          <path d="M820 430 C 1040 300, 1180 360, 1470 210" />
          <path d="M180 300 C 420 360, 620 260, 900 340" />
          <path d="M900 340 C 1160 410, 1280 620, 1500 640" />
          <path d="M300 880 C 620 820, 760 900, 1120 820" />
        </g>
        <g className="pbg-nodes">
          {nodes.map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <circle r="26" fill="url(#pgNode)" className="pbg-halo" />
              <circle r="3.4" fill="#eaf2ff" filter="url(#pgGlow)" />
              <circle r="7" fill="none" stroke="#7fb0ff" strokeWidth="1" opacity="0.5" className="pbg-ring" />
            </g>
          ))}
        </g>
        <g className="pbg-parcels" fill="#dbe8ff">
          <rect x="-4" y="-4" width="8" height="8" rx="2">
            <animateMotion dur="18s" repeatCount="indefinite" rotate="auto" path="M120 760 C 360 560, 560 600, 820 430 C 1040 300, 1180 360, 1470 210" />
          </rect>
          <rect x="-4" y="-4" width="8" height="8" rx="2">
            <animateMotion dur="24s" begin="-8s" repeatCount="indefinite" rotate="auto" path="M180 300 C 420 360, 620 260, 900 340 C 1160 410, 1280 620, 1500 640" />
          </rect>
        </g>
      </svg>
      <div className="pbg-glyphs">
        {GLYPHS.map((g) => (
          <span className={`pbg-glyph ${g.cls}`} key={g.cls}><Glyph n={g.n} /></span>
        ))}
      </div>
      <div className="pbg-noise" />
      <div className="pbg-vig" />
    </div>
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
  { key: "der-kurier",   logo: null,           alt: "Der Kurier",   service: "Standard", time: "2–4 Tage" },
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
    <>
      <PostalBackground />

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
              {kpi.key === "active" && <span className="pp-kglow" aria-hidden="true" />}
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
                  {c.key === "der-kurier"
                    ? <DerKurierLogo />
                    : <img src={c.logo} alt={c.alt} className="car-logo" />}
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

        {/* ── Footer ── */}
        <div className="pp-pagefoot">ConfidaraExpress · Premium-Übersicht — freundlich, professionell, luxuriös.</div>
      </div>
    </>
  );
}
