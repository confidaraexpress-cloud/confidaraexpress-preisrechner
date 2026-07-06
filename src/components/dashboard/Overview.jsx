import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { moneyCompact } from "../../utils/formatters";
import dhlLogo        from "../../assets/carriers/dhl.svg";
import upsLogo        from "../../assets/carriers/ups.svg";
import dpdLogo        from "../../assets/carriers/dpd.svg";
import glsLogo        from "../../assets/carriers/gls.svg";
import fedexLogo      from "../../assets/carriers/fedex.svg";
import tntLogo        from "../../assets/carriers/tnt.svg";
import transOFlexLogo from "../../assets/carriers/trans-o-flex.svg";

/* ── Design-Handoff: neu erstellte Marken-SVGs (verbatim übernommen) ──────── */

// Firmen-Squircle (§5.1). Monogramm = echte Firmen-/Kontoinitiale (dynamisch).
function CompanyMark({ initial }) {
  return (
    <svg className="dpx-companymark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="dpxCoMark" x1="4" y1="3" x2="34" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4A86FF" />
          <stop offset="0.52" stopColor="#2A50D6" />
          <stop offset="1" stopColor="#182A8C" />
        </linearGradient>
        <linearGradient id="dpxCoTop" x1="20" y1="2" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11.5" fill="url(#dpxCoMark)" />
      <rect x="1" y="1" width="38" height="38" rx="11.5" fill="url(#dpxCoTop)" />
      <rect x="1.6" y="1.6" width="36.8" height="36.8" rx="10.9" fill="none" stroke="#ffffff" strokeOpacity="0.24" />
      <text x="20" y="26.5" textAnchor="middle" fontFamily="'Syne', 'DM Sans', sans-serif" fontWeight="700" fontSize="17" fill="#ffffff">{initial}</text>
    </svg>
  );
}

// „Der Kurier" — flaches Wortzeichen (§5.2), ersetzt das 185-KB-Raster-Siegel.
function DerKurierLogo() {
  return (
    <svg viewBox="0 0 106 32" width="101" height="30" fill="none" aria-label="Der Kurier">
      <defs>
        <linearGradient id="dpxDkRed" x1="13" y1="3" x2="13" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F04A3C" />
          <stop offset="1" stopColor="#C71C1C" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="3" width="26" height="26" rx="7.5" fill="url(#dpxDkRed)" />
      <rect x="0.5" y="3" width="26" height="26" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.2" />
      <g stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.4 11.2 13 16l-4.6 4.8" />
        <path d="M14 11.2 18.6 16 14 20.8" opacity="0.6" />
      </g>
      <text x="34" y="14" fontFamily="'Syne', 'DM Sans', sans-serif" fontWeight="700" fontSize="10.5" letterSpacing="0.04em" fill="#5D6B85">Der</text>
      <text x="34" y="27.6" fontFamily="'Syne', 'DM Sans', sans-serif" fontWeight="800" fontSize="15" letterSpacing="-0.01em" fill="#1E2A44">Kurier</text>
    </svg>
  );
}

// KPI-Zahlen-Styling: Einheit-Suffix (z. B. „ €"/„k €") dezent (.u).
// Keine führende Null mehr — echte Werte werden unverändert angezeigt.
function KpiValue({ v }) {
  const unit = v.match(/^([\d.,]+)(\D.*)$/);
  if (unit) return (<>{unit[1]}<span className="u">{unit[2]}</span></>);
  return <>{v}</>;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

/* ── Statische Inhalte (Copy verbatim aus dem Handoff) ────────────────────── */

const STEPS = [
  { icon: "invoice", title: "Paketdaten eingeben", desc: "Geben Sie Abhol- und Lieferadresse, Maße, Gewicht und weitere Details ein." },
  { icon: "package", title: "Angebote vergleichen", desc: "Vergleichen Sie Preise und Laufzeiten aller führenden Carrier in Echtzeit." },
  { icon: "cart",    title: "Versand buchen",       desc: "Wählen Sie das beste Angebot und buchen Sie Ihren Versand." },
  { icon: "mapPin",  title: "Tracking verfolgen",   desc: "Behalten Sie Ihre Sendung jederzeit im Blick – in Echtzeit." },
];

const WHY = [
  { icon: "shieldCheck", title: "Beste Preise",             desc: "Wir vergleichen für Sie automatisch die Preise von führenden Versanddienstleistern – für das beste Angebot." },
  { icon: "truck",       title: "Express & Standard",       desc: "Egal ob Express oder Standard – finden Sie die passende Versandart für Ihre Anforderungen." },
  { icon: "briefcase",   title: "Geschäftskunden Fokus",    desc: "Speziell für Unternehmen entwickelt – mit Transparenz, einfacher Abwicklung und persönlichem Support." },
  { icon: "mapPin",      title: "Vollständige Transparenz", desc: "Verfolgen Sie jede Sendung in Echtzeit und behalten Sie alle wichtigen Informationen im Blick." },
];

// Laufzeiten = Marketing-Copy (keine verbindlichen Live-Tarife).
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
  { tone: "blue",   icon: "shieldCheck", title: "Sicher & DSGVO-konform", desc: "Ihre Daten sind sicher und werden DSGVO-konform verarbeitet." },
  { tone: "violet", icon: "headset",     title: "Persönlicher Support",   desc: "Unser Team ist für Sie da – schnell und zuverlässig." },
  { tone: "violet", icon: "star",        title: "Tiefpreisgarantie",      desc: "Wir garantieren Ihnen die besten Versandpreise." },
];

// Aktiv-Set (verbindlich). in_transit zählt bewusst mit.
const ACTIVE_STATUSES = ["approved", "active", "pending", "booked", "label_ready", "in_transit"];
const INACTIVE_STATUSES = ["delivered", "blocked", "draft", "cancelled", "canceled", "delayed"];
const KNOWN_STATUSES = new Set([...ACTIVE_STATUSES, ...INACTIVE_STATUSES]);

// Alle KPI-Werte aus echten, bereits geladenen Sendungsdaten — keine Mock-Zahlen.
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

  for (const s of list) {
    const st = s?.status;
    if (ACTIVE_STATUSES.includes(st)) active++;
    if (st === "in_transit") inTransit++;
    if (st === "delivered") delivered++;
    if (st === "delayed") delayed++;

    if (s?.created_at) {
      const t = new Date(s.created_at).getTime();
      if (!Number.isNaN(t)) {
        hasCreatedAt = true;
        const diff = now.getTime() - t;
        if (diff >= 0 && diff <= DAY) new24++;
        const amt = Number(s.price_final);
        if (Number.isFinite(amt) && amt > 0) {
          const d = new Date(t);
          if (d >= startThis && d < startNext) spendThis += amt;
          else if (d >= startPrev && d < startThis) spendPrev += amt;
        }
      }
    }
  }

  const deltaPct = spendPrev > 0 ? Math.round(((spendThis - spendPrev) / spendPrev) * 100) : null;
  return { active, inTransit, delivered, delayed, new24, hasCreatedAt, spendThis, spendPrev, deltaPct, hasSpend: spendThis > 0 };
}

export function Overview({ user, shipments, loading, onNewShipment, onProfile }) {
  const navigate = useNavigate();
  const name = user?.name || user?.company_name || "Kunde";
  const org = user?.company_name && user?.company_name !== user?.name ? user.company_name : null;
  const initial = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const k = useMemo(() => computeKpis(shipments), [shipments]);

  // Fußzeilen: echte, neutrale Angaben — keine erfundenen Deltas.
  const activeFoot = k.hasCreatedAt && k.new24 > 0
    ? { delta: `+${k.new24}`, deltaClass: "d-violet", label: "neu · 24 h" }
    : { label: "Live aus Ihren Sendungen" };
  const spendFoot = !k.hasSpend
    ? { label: "Keine Ausgaben im aktuellen Monat" }
    : k.deltaPct !== null
      ? { delta: `${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct} %`, deltaClass: k.deltaPct >= 0 ? "d-green" : "d-amber", label: "vs. letzter Monat" }
      : { label: "Aktueller Monat" };

  const KPIS = [
    { key: "active",    tone: "violet", icon: "package", label: "Aktive Sendungen", value: String(k.active),    foot: activeFoot },
    { key: "transit",   tone: "blue",   icon: "truck",   label: "In Zustellung",    value: String(k.inTransit), foot: { label: "Aktueller Stand" } },
    { key: "delivered", tone: "green",  icon: "check",   label: "Zugestellt",       value: String(k.delivered), foot: { label: "Aktueller Stand" } },
    { key: "delayed",   tone: "amber",  icon: "clock",   label: "Verzögert",        value: String(k.delayed),   foot: { label: "Aktueller Stand" } },
    { key: "spend",     tone: "spend",  glyph: "€",      label: "Ausgaben (Monat)", value: moneyCompact(k.spendThis), foot: spendFoot },
  ];

  return (
    <div className="dpx-main">
      <div className="dpx-aurora" aria-hidden="true">
        <span className="dpx-blob dpx-blob-1" />
        <span className="dpx-blob dpx-blob-2" />
        <span className="dpx-blob dpx-blob-3" />
        <span className="dpx-bloom" />
        <span className="dpx-ray" />
        <span className="dpx-noise" />
      </div>
      <div className="dpx-inner">

        {/* ── Topbar ── */}
        <div className="dpx-topbar">
          <div>
            <div className="dpx-greeting">{getGreeting()}, <span className="accent">{name}</span></div>
            <div className="dpx-greeting-sub">Hier ist Ihre Übersicht für heute.</div>
          </div>
          <div className="dpx-head-right">
            <div className="dpx-head-row">
              {/* Dekorativ, ohne Fake-Zähler und nicht klickbar (kein Notification-System). */}
              <span className="dpx-iconbtn dpx-iconbtn-static" aria-hidden="true"><Icon n="bell" s={21} /></span>
              <button type="button" className="dpx-userpill" onClick={onProfile} aria-label="Zu meinem Profil" title="Zu meinem Profil">
                <CompanyMark initial={initial} />
                <div className="dpx-userpill-text">
                  <div className="dpx-user-name">{name}</div>
                  {org && <div className="dpx-user-org">{org}</div>}
                </div>
                <Icon n="chevron" s={18} />
              </button>
            </div>
            <button type="button" className="dpx-btn-new" onClick={onNewShipment}>
              <Icon n="plus" s={20} c="#fff" />Neue Sendung
            </button>
          </div>
        </div>

        {/* ── KPI-Reihe (echte Daten) ── */}
        <div className="dpx-kpis">
          {KPIS.map((kpi) => (
            <div className={"dpx-kpi k-" + kpi.tone} key={kpi.key}>
              <div className="dpx-kpi-top">
                <span className="dpx-kpi-icon">
                  {kpi.icon ? <Icon n={kpi.icon} s={20} /> : <span className="dpx-kpi-glyph">{kpi.glyph}</span>}
                </span>
                <span className="dpx-kpi-label">{kpi.label}</span>
              </div>
              <div className="dpx-kpi-value"><KpiValue v={loading ? "—" : kpi.value} /></div>
              <div className="dpx-kpi-foot">
                {loading ? (
                  <span className="dpx-foot-label">Wird geladen…</span>
                ) : (
                  <>
                    {kpi.foot.dot && <span className="dpx-foot-dot" />}
                    {kpi.foot.delta && <span className={"dpx-kpi-delta " + kpi.foot.deltaClass}>{kpi.foot.delta}</span>}
                    <span className="dpx-foot-label">{kpi.foot.label}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── So einfach funktioniert es ── */}
        <section className="dpx-panel">
          <div className="dpx-panel-title">So einfach funktioniert es</div>
          <div className="dpx-steps">
            {STEPS.map((s, i) => (
              <div className="dpx-step" key={i}>
                <div className="dpx-step-icon"><Icon n={s.icon} s={26} /></div>
                <div className="dpx-step-connector" />
                <div className="dpx-step-title">{s.title}</div>
                <div className="dpx-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Warum ConfidaraExpress? ── */}
        <section className="dpx-panel">
          <div className="dpx-panel-title">Warum ConfidaraExpress?</div>
          <div className="dpx-why">
            {WHY.map((w, i) => (
              <div className="dpx-why-card" key={i}>
                <div className="dpx-why-badge"><Icon n={w.icon} s={22} /></div>
                <div>
                  <div className="dpx-why-title">{w.title}</div>
                  <div className="dpx-why-desc">{w.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Carrier Netzwerk ── */}
        <section className="dpx-panel dpx-carriers">
          <div className="dpx-panel-title">Carrier Netzwerk</div>
          <div className="dpx-panel-sub">Vergleichen Sie automatisch Preise und Laufzeiten von {CARRIERS.length} führenden Carriern.</div>
          <div className="dpx-carrier-grid">
            {CARRIERS.map((c) => (
              <div className="dpx-carrier-tile" key={c.key}>
                <div className="dpx-carrier-logo">
                  {c.key === "der-kurier"
                    ? <DerKurierLogo />
                    : <img src={c.logo} alt={c.alt} className={c.key === "trans-o-flex" ? "is-transoflex" : undefined} />}
                </div>
                <div className="dpx-carrier-service">{c.service}</div>
                <div className="dpx-carrier-time">{c.time}</div>
              </div>
            ))}
          </div>
          <div className="dpx-carrier-cta">
            <button type="button" className="dpx-btn-compare" onClick={() => navigate("/calculator")}>
              Preise vergleichen<Icon n="arrowRight" s={18} />
            </button>
          </div>
        </section>

        {/* ── Trust-Bar ── */}
        <div className="dpx-trust">
          {TRUST.map((t, i) => (
            <div className={"dpx-trust-item tr-" + t.tone} key={i}>
              <div className="dpx-trust-badge"><Icon n={t.icon} s={23} /></div>
              <div>
                <div className="dpx-trust-title">{t.title}</div>
                <div className="dpx-trust-desc">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
