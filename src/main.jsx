import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = "https://api.confidaraexpress.de";
const money = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v) || 0);
const dateDE = (d) => d ? new Date(d).toLocaleDateString("de-DE") : "—";
const dtDE = (d) => d ? new Date(d).toLocaleString("de-DE") : "—";
const token = () => localStorage.getItem("ce_token");
const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const jsonH = { "Content-Type": "application/json" };

const countries = [
  { code: "DE", name: "Deutschland" }, { code: "AT", name: "Österreich" },
  { code: "CH", name: "Schweiz" }, { code: "NL", name: "Niederlande" },
  { code: "FR", name: "Frankreich" }, { code: "IT", name: "Italien" },
  { code: "ES", name: "Spanien" }, { code: "PL", name: "Polen" },
  { code: "GB", name: "Großbritannien" }, { code: "US", name: "USA" },
  { code: "TR", name: "Türkei" }, { code: "BE", name: "Belgien" },
];

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ n, s = 18, c = "currentColor" }) => {
  const p = {
    dashboard: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
    package: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12",
    invoice: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    plus: "M12 5v14M5 12h14",
    logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
    arrow: "M5 12h14M12 5l7 7-7 7",
    check: "M20 6L9 17l-5-5",
    map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v18M15 6v18",
    truck: "",
    settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
    bell: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    x: "M18 6L6 18M6 6l12 12",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
    eyeOff: "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    globe: "M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
    clock: "M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2",
    trending: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
    filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
    refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
    admin: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  };
  if (n === "truck") return (
    <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  );
  return (
    <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d={p[n] || ""} />
    </svg>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    approved: ["badge-green", "Aktiv"], active: ["badge-green", "Aktiv"],
    pending: ["badge-yellow", "Ausstehend"], blocked: ["badge-red", "Gesperrt"],
    booked: ["badge-blue", "Gebucht"], label_ready: ["badge-blue", "Label bereit"],
    draft: ["badge-gray", "Entwurf"], paid: ["badge-green", "Bezahlt"],
    unpaid: ["badge-yellow", "Offen"], delivered: ["badge-green", "Zugestellt"],
    in_transit: ["badge-blue", "Unterwegs"], delayed: ["badge-yellow", "Verzögert"],
  };
  const [cls, label] = map[status] || ["badge-gray", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ─── Eye Icon ─────────────────────────────────────────────────────────────────
function PasswordField({ label, value, onChange, onKeyDown, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <div className="field-input-wrap">
        <input type={show ? "text" : "password"} className="field-input" value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder || "Passwort"} />
        <button type="button" className="field-eye-btn" onClick={() => setShow(s => !s)}>
          <Icon n={show ? "eyeOff" : "eye"} s={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ onNavigate, authed }) {
  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <div className="navbar-logo" onClick={() => onNavigate("home")}>
          <div className="logo-mark">CE</div>
          <span className="logo-text">ConfidaraExpress</span>
        </div>
        <ul className="navbar-nav">
          <li><a onClick={() => onNavigate("home")}>Startseite</a></li>
          <li><a onClick={() => onNavigate("calculator")}>Preisrechner</a></li>
          <li><a onClick={() => onNavigate("tracking")}>Tracking</a></li>
        </ul>
        <div className="navbar-actions">
          {authed ? (
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate("dashboard")}>
              Dashboard
            </button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("login")}>Anmelden</button>
              <button className="btn btn-primary btn-sm" onClick={() => onNavigate("register")}>Kostenlos starten</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ onNavigate }) {
  return (
    <div>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div className="animate-fadeUp">
              <div className="hero-badge">
                <div className="hero-badge-dot" />
                B2B Versandplattform — Live Preise
              </div>
              <h1 className="hero-title">
                Internationalen Versand in <span>Sekunden</span> buchen.
              </h1>
              <p className="hero-sub">
                Vergleichen Sie DHL, UPS, FedEx, GLS & mehr in Echtzeit. Sofort buchbar, Tracking inklusive, Zahlung auf Rechnung.
              </p>
              <div className="hero-perks">
                {["Live Preise", "Sofort buchbar", "Tracking inklusive", "Rechnungskauf"].map(p => (
                  <div key={p} className="hero-perk">
                    <div className="hero-perk-icon">✓</div>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
              <div className="hero-actions">
                <button className="btn btn-primary btn-xl" onClick={() => onNavigate("calculator")}>
                  <Icon n="zap" s={18} /> Versandpreis berechnen
                </button>
                <button className="btn btn-outline btn-lg" onClick={() => onNavigate("register")}>
                  Konto erstellen
                </button>
              </div>
            </div>
            <div className="animate-fadeUp-2">
              <div className="hero-card">
                <div className="hero-card-header">
                  <Icon n="zap" s={18} c="white" />
                  <h3>Sofort-Kalkulation</h3>
                </div>
                <div className="hero-card-body">
                  <div className="field-row field-row-2 mb-16">
                    <div className="field">
                      <label className="field-label">Von</label>
                      <select className="field-input field-select">
                        <option>Deutschland</option><option>Österreich</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label">Nach</label>
                      <select className="field-input field-select">
                        <option>Schweiz</option><option>Frankreich</option>
                      </select>
                    </div>
                  </div>
                  <div className="field-row field-row-2 mb-16">
                    <div className="field">
                      <label className="field-label">Gewicht (kg)</label>
                      <input className="field-input" type="number" defaultValue="5" />
                    </div>
                    <div className="field">
                      <label className="field-label">Versandart</label>
                      <select className="field-input field-select">
                        <option>Standard</option><option>Express</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ background: "#f0f5ff", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                    {[
                      { carrier: "DHL Express", time: "1-2 Tage", price: "€24.90" },
                      { carrier: "UPS Standard", time: "3-5 Tage", price: "€18.50" },
                      { carrier: "GLS Europe", time: "4-6 Tage", price: "€14.20" },
                    ].map((r, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 2 ? "1px solid #e2e8f0" : "none" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#0B1F4D" }}>{r.carrier}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.time}</div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: "#1D4ED8", fontFamily: "DM Mono, monospace" }}>{r.price}</div>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-full" onClick={() => onNavigate("calculator")}>
                    Echte Preise berechnen <Icon n="arrow" s={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <div className="trust-bar">
        <div className="container">
          <div className="trust-bar-inner">
            {[
              { icon: "shield", text: "SSL verschlüsselt" },
              { icon: "zap", text: "Live Preise" },
              { icon: "truck", text: "10+ Carrier" },
              { icon: "globe", text: "Weltweit versenden" },
              { icon: "invoice", text: "Rechnungskauf" },
              { icon: "clock", text: "24/7 Tracking" },
            ].map((t, i) => (
              <div key={i} className="trust-item">
                <span className="trust-item-icon"><Icon n={t.icon} s={18} c="#1D4ED8" /></span>
                <span>{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <section className="section" style={{ background: "var(--gray50)" }}>
        <div className="container">
          <div className="text-center mb-24">
            <div className="section-label">✦ Warum ConfidaraExpress</div>
            <h2 className="section-title">Alles was B2B-Versand braucht</h2>
            <p className="section-sub" style={{ margin: "0 auto" }}>
              Von der Preisberechnung bis zum Tracking — alles in einer Plattform.
            </p>
          </div>
          <div className="features-grid">
            {[
              { icon: "zap", title: "Live Preisvergleich", text: "Echtzeit-Preise von DHL, UPS, FedEx, GLS und mehr. Immer der beste Preis für Ihre Sendung." },
              { icon: "truck", title: "Sofort buchen", text: "Keine langen Vertragslaufzeiten. Einfach Preis berechnen, auswählen und direkt buchen." },
              { icon: "map", title: "Echtzeit Tracking", text: "Verfolgen Sie jede Sendung in Echtzeit mit detaillierter Timeline und Statusupdates." },
              { icon: "invoice", title: "Rechnungskauf", text: "Zahlung auf Rechnung mit 7 oder 28 Tagen Zahlungsziel — perfekt für B2B-Kunden." },
              { icon: "shield", title: "Versicherung", text: "Optionale Transportversicherung für wertvolle Sendungen. Ihr Vertrauen ist uns wichtig." },
              { icon: "globe", title: "Weltweit versenden", text: "Nationale und internationale Sendungen in über 200 Länder — alles über eine Plattform." },
            ].map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon"><Icon n={f.icon} s={26} c="#1D4ED8" /></div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-text">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Carriers */}
      <section className="section">
        <div className="container text-center">
          <div className="section-label">✦ Unsere Partner</div>
          <h2 className="section-title">Alle großen Carrier</h2>
          <p className="section-sub mb-24" style={{ margin: "0 auto 40px" }}>
            Transparente Preise, alle großen Versanddienstleister, Sofort-Kalkulation.
          </p>
          <div className="carrier-logos mb-24">
            {["DHL", "UPS", "FedEx", "GLS", "DPD", "Hermes"].map(c => (
              <div key={c} className="carrier-logo-item">{c}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="section-sm" style={{ background: "var(--navy)" }}>
        <div className="container">
          <div className="stats-grid" style={{ background: "rgba(255,255,255,0.05)" }}>
            {[
              { v: "50.000+", l: "Sendungen pro Monat" },
              { v: "10+", l: "Carrier Partner" },
              { v: "200+", l: "Zielländer" },
              { v: "99.9%", l: "Verfügbarkeit" },
            ].map((s, i) => (
              <div key={i} className="stat-item" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="stat-value" style={{ background: "linear-gradient(135deg, white, #93c5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.v}</div>
                <div className="stat-label" style={{ color: "rgba(255,255,255,0.5)" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section text-center">
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="section-label">✦ Jetzt starten</div>
          <h2 className="section-title">Bereit für besseren Versand?</h2>
          <p className="section-sub mb-24" style={{ margin: "0 auto 32px" }}>
            Registrieren Sie sich kostenlos und vergleichen Sie sofort Versandpreise.
          </p>
          <div className="flex-center gap-12">
            <button className="btn btn-primary btn-xl" onClick={() => onNavigate("register")}>Kostenlos registrieren</button>
            <button className="btn btn-outline btn-lg" onClick={() => onNavigate("calculator")}>Preis berechnen</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="flex gap-8 mb-8" style={{ alignItems: "center" }}>
                <div className="logo-mark" style={{ width: 32, height: 32, fontSize: 13 }}>CE</div>
                <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 16, color: "white" }}>ConfidaraExpress</span>
              </div>
              <p className="footer-brand-text">B2B Versandplattform für modernes Logistikmanagement. Vergleichen, buchen, tracken.</p>
            </div>
            <div>
              <div className="footer-col-title">Produkt</div>
              <a className="footer-link">Preisrechner</a>
              <a className="footer-link">Tracking</a>
              <a className="footer-link">Carrier</a>
              <a className="footer-link">API</a>
            </div>
            <div>
              <div className="footer-col-title">Unternehmen</div>
              <a className="footer-link">Über uns</a>
              <a className="footer-link">Blog</a>
              <a className="footer-link">Karriere</a>
              <a className="footer-link">Kontakt</a>
            </div>
            <div>
              <div className="footer-col-title">Rechtliches</div>
              <a className="footer-link">Impressum</a>
              <a className="footer-link">Datenschutz</a>
              <a className="footer-link">AGB</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 ConfidaraExpress. Alle Rechte vorbehalten.</span>
            <span>Made in Germany 🇩🇪</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin, defaultTab = "login", onNavigate }) {
  const [tab, setTab] = useState(defaultTab);
  const [step, setStep] = useState("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({ name: "", email: "", password: "", company_name: "", vat_id: "", street: "", zip: "", city: "", country: "DE" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("reset");
    if (t) {
      setResetToken(t);
      setStep("reset");
      fetch(`${API}/auth/validate-reset-token/${t}`)
        .then(r => r.json())
        .then(d => { if (!d.valid) { setStep("credentials"); setError("Reset-Link ungültig oder abgelaufen."); } })
        .catch(() => setStep("credentials"));
    }
  }, []);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/login`, { method: "POST", headers: jsonH, body: JSON.stringify(loginForm) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Login fehlgeschlagen");
      if (d.requires2FA) { setPendingEmail(loginForm.email); setStep("2fa"); }
      else if (d.token) { localStorage.setItem("ce_token", d.token); onLogin(d.token); }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handle2FA = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/auth/verify-2fa`, { method: "POST", headers: jsonH, body: JSON.stringify({ email: pendingEmail, code: twoFaCode, rememberMe }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Code ungültig");
      localStorage.setItem("ce_token", d.token);
      onLogin(d.token);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleForgot = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/auth/forgot-password`, { method: "POST", headers: jsonH, body: JSON.stringify({ email: forgotEmail }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSuccess(d.message);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleReset = async () => {
    setError("");
    if (newPassword !== newPasswordConfirm) { setError("Passwörter stimmen nicht überein"); return; }
    if (newPassword.length < 8) { setError("Passwort muss mindestens 8 Zeichen haben"); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/reset-password`, { method: "POST", headers: jsonH, body: JSON.stringify({ token: resetToken, password: newPassword }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSuccess("Passwort zurückgesetzt! Sie können sich jetzt anmelden.");
      window.history.replaceState({}, "", "/");
      setTimeout(() => { setStep("credentials"); setSuccess(""); }, 2000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleRegister = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/register`, { method: "POST", headers: jsonH, body: JSON.stringify(regForm) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Registrierung fehlgeschlagen");
      setSuccess("Konto beantragt! Nach Freischaltung erhalten Sie eine E-Mail.");
      setTab("login");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const reset = () => { setError(""); setSuccess(""); };

  const rightPerks = [
    { icon: "zap", title: "Live Preisvergleich", text: "Echtzeit-Preise von 10+ Carriern" },
    { icon: "truck", title: "Sofort buchbar", text: "Keine Wartezeiten, direkt versenden" },
    { icon: "invoice", title: "Rechnungskauf", text: "Zahlung auf Rechnung für B2B" },
    { icon: "shield", title: "SSL-Sicherheit", text: "Ihre Daten sind bei uns sicher" },
  ];

  return (
    <div className="auth-root">
      <div className="auth-left">
        <div className="auth-form-wrap animate-fadeUp">
          <div className="auth-logo-link" onClick={() => onNavigate("home")}>
            <div className="logo-mark">CE</div>
            <span className="logo-text">ConfidaraExpress</span>
          </div>

          {step === "2fa" && (
            <>
              <h1 className="auth-title">Zwei-Faktor-Code</h1>
              <p className="auth-sub">Code wurde an <strong>{pendingEmail}</strong> gesendet</p>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="field">
                <label className="field-label">6-stelliger Code</label>
                <input className="field-input" type="text" maxLength={6} value={twoFaCode}
                  onChange={e => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handle2FA()}
                  placeholder="000000" autoFocus
                  style={{ fontSize: 24, letterSpacing: 10, textAlign: "center", fontFamily: "DM Mono, monospace" }} />
              </div>
              <label className="checkbox-field checked" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ display: "none" }} />
                <div className={`checkbox-box ${rememberMe ? "checked" : ""}`}>{rememberMe ? "✓" : ""}</div>
                <span className="checkbox-label">30 Tage angemeldet bleiben</span>
              </label>
              <button className="btn btn-primary btn-full mt-16" onClick={handle2FA} disabled={loading || twoFaCode.length !== 6}>
                {loading ? <span className="spinner" /> : "Bestätigen"}
              </button>
              <button onClick={() => { setStep("credentials"); setTwoFaCode(""); reset(); }} className="btn btn-ghost btn-full mt-8">← Zurück</button>
            </>
          )}

          {step === "forgot" && (
            <>
              <h1 className="auth-title">Passwort vergessen</h1>
              <p className="auth-sub">Wir senden Ihnen einen Reset-Link per E-Mail</p>
              {error && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}
              {!success && <>
                <div className="field"><label className="field-label">E-Mail</label><input className="field-input" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleForgot()} placeholder="firma@beispiel.de" autoFocus /></div>
                <button className="btn btn-primary btn-full" onClick={handleForgot} disabled={loading || !forgotEmail}>
                  {loading ? <span className="spinner" /> : "Reset-Link senden"}
                </button>
              </>}
              <button onClick={() => { setStep("credentials"); reset(); }} className="btn btn-ghost btn-full mt-8">← Zurück zum Login</button>
            </>
          )}

          {step === "reset" && (
            <>
              <h1 className="auth-title">Neues Passwort</h1>
              <p className="auth-sub">Mindestens 8 Zeichen</p>
              {error && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}
              {!success && <>
                <PasswordField label="Neues Passwort" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                <PasswordField label="Passwort bestätigen" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReset()} />
                <button className="btn btn-primary btn-full" onClick={handleReset} disabled={loading || !newPassword}>
                  {loading ? <span className="spinner" /> : "Passwort speichern"}
                </button>
              </>}
            </>
          )}

          {step === "credentials" && (
            <>
              <h1 className="auth-title">{tab === "login" ? "Willkommen zurück" : "Konto erstellen"}</h1>
              <p className="auth-sub">{tab === "login" ? "Melden Sie sich in Ihrem Konto an" : "Starten Sie kostenlos mit ConfidaraExpress"}</p>
              <div className="auth-tabs">
                <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); reset(); }}>Anmelden</button>
                <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); reset(); }}>Registrieren</button>
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}

              {tab === "login" ? (
                <>
                  <div className="field"><label className="field-label">E-Mail</label><input className="field-input" type="email" value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="firma@beispiel.de" autoFocus /></div>
                  <PasswordField label="Passwort" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleLogin()} />
                  <div className="flex-between mb-16" style={{ flexWrap: "wrap", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--gray600)" }}>
                      <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                      Angemeldet bleiben
                    </label>
                    <span className="link text-sm" onClick={() => { setStep("forgot"); reset(); }}>Passwort vergessen?</span>
                  </div>
                  <button className="btn btn-primary btn-full" onClick={handleLogin} disabled={loading}>
                    {loading ? <span className="spinner" /> : <><Icon n="arrow" s={16} /> Anmelden</>}
                  </button>
                </>
              ) : (
                <>
                  <div className="field-row field-row-2">
                    <div className="field"><label className="field-label">Name</label><input className="field-input" value={regForm.name} onChange={e => setRegForm(p => ({ ...p, name: e.target.value }))} /></div>
                    <div className="field"><label className="field-label">E-Mail</label><input className="field-input" type="email" value={regForm.email} onChange={e => setRegForm(p => ({ ...p, email: e.target.value }))} /></div>
                  </div>
                  <PasswordField label="Passwort (min. 8 Zeichen)" value={regForm.password} onChange={e => setRegForm(p => ({ ...p, password: e.target.value }))} />
                  <div className="field-row field-row-2">
                    <div className="field"><label className="field-label">Firmenname</label><input className="field-input" value={regForm.company_name} onChange={e => setRegForm(p => ({ ...p, company_name: e.target.value }))} /></div>
                    <div className="field"><label className="field-label">USt-ID</label><input className="field-input" value={regForm.vat_id} onChange={e => setRegForm(p => ({ ...p, vat_id: e.target.value }))} placeholder="DE123456789" /></div>
                  </div>
                  <div className="field"><label className="field-label">Straße & Hausnummer</label><input className="field-input" value={regForm.street} onChange={e => setRegForm(p => ({ ...p, street: e.target.value }))} /></div>
                  <div className="field-row field-row-3">
                    <div className="field"><label className="field-label">PLZ</label><input className="field-input" value={regForm.zip} onChange={e => setRegForm(p => ({ ...p, zip: e.target.value }))} /></div>
                    <div className="field"><label className="field-label">Stadt</label><input className="field-input" value={regForm.city} onChange={e => setRegForm(p => ({ ...p, city: e.target.value }))} /></div>
                    <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={regForm.country} onChange={e => setRegForm(p => ({ ...p, country: e.target.value }))}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                  </div>
                  <button className="btn btn-primary btn-full" onClick={handleRegister} disabled={loading}>
                    {loading ? <span className="spinner" /> : "Konto beantragen"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-right-content animate-fadeUp-1">
          <h2 className="auth-right-title">Die modernste B2B Versandplattform</h2>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>
            Tausende Unternehmen vertrauen ConfidaraExpress für ihren täglichen Versand.
          </p>
          {rightPerks.map((p, i) => (
            <div key={i} className="auth-perk">
              <div className="auth-perk-icon"><Icon n={p.icon} s={20} c="white" /></div>
              <div>
                <div className="auth-perk-title">{p.title}</div>
                <div className="auth-perk-text">{p.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Calculator Page ──────────────────────────────────────────────────────────
function CalculatorPage({ authed, onNavigate }) {
  const [form, setForm] = useState({
    from_country: "DE", from_zip: "", to_country: "CH", to_zip: "",
    weight: "", length: "", width: "", height: "",
    pickup_type: "packstation", ship_type: "standard",
    insurance: false, fragile: false,
    max_price: "", max_days: "",
  });
  const [tariffs, setTariffs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [shipmentId, setShipmentId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasResults, setHasResults] = useState(false);

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2)
    : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2)
    : form.weight || null;

  const applyFilter = useCallback((list) => {
    let f = [...list];
    if (form.max_price) f = f.filter(t => t.finalPrice <= Number(form.max_price));
    if (form.max_days) f = f.filter(t => {
      const m = t.deliveryTime?.match(/(\d+)/);
      return m ? Number(m[1]) <= Number(form.max_days) : true;
    });
    setFiltered(f);
  }, [form.max_price, form.max_days]);

  useEffect(() => { applyFilter(tariffs); }, [tariffs, applyFilter]);

  const calculate = async () => {
    if (!form.weight) { setError("Bitte Gewicht angeben"); return; }
    setError(""); setLoading(true); setSelected(null);
    try {
      const r = await fetch(`${API}/api/jumingo/calculate-price`, {
        method: "POST", headers: jsonH,
        body: JSON.stringify({
          weight: Number(form.weight), length: Number(form.length) || 30,
          width: Number(form.width) || 20, height: Number(form.height) || 15,
          from_country: form.from_country, from_zip: form.from_zip,
          to_country: form.to_country, to_zip: form.to_zip,
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Fehler bei Preisberechnung");
      setTariffs(d.tariffs || []);
      setShipmentId(d.shipmentId);
      setHasResults(true);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ paddingTop: 88, background: "var(--gray50)", minHeight: "100vh" }}>
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div className="mb-24">
          <h1 className="heading" style={{ fontSize: 28, color: "var(--navy)", marginBottom: 6 }}>Versandpreis berechnen</h1>
          <p style={{ color: "var(--gray500)", fontSize: 15 }}>Vergleichen Sie Preise von 10+ Carriern in Echtzeit</p>
        </div>
        {error && <div className="alert alert-error mb-16"><Icon n="x" s={16} />{error}</div>}
        <div className="calc-wrap">
          <div>
            {/* Route */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header">
                <Icon n="globe" s={18} c="#1D4ED8" />
                <h3>Versandroute</h3>
              </div>
              <div className="calc-panel-body">
                <div className="calc-section-title">Absender</div>
                <div className="field-row field-row-2">
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.from_country} onChange={e => upd("from_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                  <div className="field"><label className="field-label">PLZ (optional)</label><input className="field-input" value={form.from_zip} onChange={e => upd("from_zip", e.target.value)} placeholder="z.B. 70173" /></div>
                </div>
                <div className="calc-section-title">Empfänger</div>
                <div className="field-row field-row-2">
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.to_country} onChange={e => upd("to_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                  <div className="field"><label className="field-label">PLZ (optional)</label><input className="field-input" value={form.to_zip} onChange={e => upd("to_zip", e.target.value)} placeholder="z.B. 8001" /></div>
                </div>
              </div>
            </div>

            {/* Package */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header">
                <Icon n="package" s={18} c="#1D4ED8" />
                <h3>Paketdaten</h3>
              </div>
              <div className="calc-panel-body">
                <div className="calc-section-title">Maße & Gewicht</div>
                <div className="field-row field-row-4">
                  <div className="field"><label className="field-label">Länge cm</label><input className="field-input" type="number" value={form.length} onChange={e => upd("length", e.target.value)} placeholder="30" /></div>
                  <div className="field"><label className="field-label">Breite cm</label><input className="field-input" type="number" value={form.width} onChange={e => upd("width", e.target.value)} placeholder="20" /></div>
                  <div className="field"><label className="field-label">Höhe cm</label><input className="field-input" type="number" value={form.height} onChange={e => upd("height", e.target.value)} placeholder="15" /></div>
                  <div className="field"><label className="field-label">Gewicht kg *</label><input className="field-input" type="number" value={form.weight} onChange={e => upd("weight", e.target.value)} placeholder="5" /></div>
                </div>
                {volWeight && (
                  <div className="vol-weight-box">
                    <span className="vol-weight-label">Volumengewicht: {volWeight} kg</span>
                    <span className="vol-weight-value">Abrechn.: {chargeWeight} kg</span>
                  </div>
                )}
              </div>
            </div>

            {/* Options */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header">
                <Icon n="settings" s={18} c="#1D4ED8" />
                <h3>Versandoptionen</h3>
              </div>
              <div className="calc-panel-body">
                <div className="calc-section-title">Versandart</div>
                <div className="option-group mb-16">
                  {["standard", "express", "nextday"].map(t => (
                    <button key={t} className={`option-btn ${form.ship_type === t ? "active" : ""}`} onClick={() => upd("ship_type", t)}>
                      {t === "standard" ? "Standard" : t === "express" ? "Express" : "Next Day"}
                    </button>
                  ))}
                </div>
                <div className="calc-section-title">Übergabeart</div>
                <div className="option-group mb-16">
                  <button className={`option-btn ${form.pickup_type === "packstation" ? "active" : ""}`} onClick={() => upd("pickup_type", "packstation")}>📦 Packshop / Packstation</button>
                  <button className={`option-btn ${form.pickup_type === "pickup" ? "active" : ""}`} onClick={() => upd("pickup_type", "pickup")}>🚚 Abholung beim Absender</button>
                </div>
                <div className="calc-section-title">Zusatzoptionen</div>
                {[
                  { k: "insurance", label: "🛡️ Versicherung", sub: "Bis 1.000€ Warenwert" },
                  { k: "fragile", label: "⚠️ Zerbrechlich", sub: "Spezielle Handhabung" },
                ].map(opt => (
                  <div key={opt.k} className={`checkbox-field ${form[opt.k] ? "checked" : ""}`} onClick={() => upd(opt.k, !form[opt.k])}>
                    <div className={`checkbox-box ${form[opt.k] ? "checked" : ""}`}>{form[opt.k] ? "✓" : ""}</div>
                    <div>
                      <div className="checkbox-label">{opt.label}</div>
                      <div className="text-xs text-muted mt-4">{opt.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            {hasResults && (
              <div className="calc-panel">
                <div className="calc-panel-header">
                  <Icon n="filter" s={18} c="#1D4ED8" />
                  <h3>Ergebnisse filtern</h3>
                </div>
                <div className="calc-panel-body">
                  <div className="field-row field-row-2">
                    <div className="field"><label className="field-label">Max. Preis (€)</label><input className="field-input" type="number" value={form.max_price} onChange={e => upd("max_price", e.target.value)} placeholder="Alle" /></div>
                    <div className="field"><label className="field-label">Max. Lieferzeit (Tage)</label><input className="field-input" type="number" value={form.max_days} onChange={e => upd("max_days", e.target.value)} placeholder="Alle" /></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="results-panel">
            <div className="results-header">
              <h3>{hasResults ? `${filtered.length} Angebote gefunden` : "Versandangebote"}</h3>
              <p>{hasResults ? "Wählen Sie Ihr Angebot" : "Füllen Sie das Formular aus"}</p>
            </div>
            <div className="results-body">
              {!hasResults && !loading && (
                <div className="results-empty">
                  <div className="results-empty-icon">📦</div>
                  <p className="text-sm text-muted">Preise berechnen um Angebote zu sehen</p>
                </div>
              )}
              {loading && <div className="loading-center"><span className="spinner spinner-dark" /><span className="text-sm text-muted">Preise werden geladen…</span></div>}
              {!loading && filtered.map(t => (
                <div key={t.id} className={`tariff-card ${selected?.id === t.id ? "selected" : ""}`} onClick={() => setSelected(t)}>
                  <div className="tariff-card-top">
                    <div>
                      <div className="tariff-carrier">{t.carrier}</div>
                      <div className="tariff-service">{t.tariffName}</div>
                    </div>
                    <div>
                      <div className="tariff-price">{money(t.finalPrice)}</div>
                      <div className="tariff-price-sub">inkl. 20% Marge</div>
                    </div>
                  </div>
                  <div className="tariff-tags">
                    {t.deliveryTime && <span className="tariff-tag">⏱ {t.deliveryTime}</span>}
                    {t.trackingAvailable && <span className="tariff-tag green">✓ Tracking</span>}
                    {t.insuranceAvailable && <span className="tariff-tag blue">🛡 Versicherung</span>}
                  </div>
                </div>
              ))}
              {hasResults && !loading && (
                <div style={{ marginTop: 16 }}>
                  {selected ? (
                    <button className="btn btn-primary btn-full" onClick={() => authed ? onNavigate("booking", { tariff: selected, shipmentId, form }) : onNavigate("login")}>
                      {authed ? "Jetzt buchen →" : "Anmelden & buchen →"}
                    </button>
                  ) : (
                    <button className="btn btn-outline btn-full" disabled>Angebot auswählen</button>
                  )}
                  <button className="btn btn-ghost btn-full mt-8" onClick={calculate}><Icon n="refresh" s={14} /> Neu berechnen</button>
                </div>
              )}
              {!loading && !hasResults && (
                <button className="btn btn-primary btn-full" onClick={calculate} disabled={loading}>
                  {loading ? <span className="spinner" /> : <><Icon n="zap" s={16} /> Preise berechnen</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Booking Flow ─────────────────────────────────────────────────────────────
function BookingPage({ user, bookingData, onNavigate }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(null);
  const [form, setForm] = useState({
    sender_name: user?.company_name || "", sender_street: user?.street || "",
    sender_zip: user?.zip || "", sender_city: user?.city || "", sender_country: user?.country || "DE",
    rec_name: "", rec_street: "", rec_zip: "", rec_city: "", rec_country: "DE",
    rec_email: "", rec_phone: "", content: "",
  });

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const tariff = bookingData?.tariff;

  const doBook = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/api/jumingo/book`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          shipmentId: bookingData?.shipmentId,
          tariffId: tariff?.id,
          shipperTariffId: tariff?.shipper_tariff_id,
          carrier: tariff?.carrier,
          price_original: tariff?.originalPrice,
          price_final: tariff?.finalPrice,
          senderAddress: `${form.sender_name}, ${form.sender_street}, ${form.sender_zip} ${form.sender_city}, ${form.sender_country}`,
          recipientAddress: `${form.rec_name}, ${form.rec_street}, ${form.rec_zip} ${form.rec_city}, ${form.rec_country}`,
          weight: bookingData?.form?.weight, content: form.content,
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Buchung fehlgeschlagen");
      setBooking(d); setStep(4);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const steps = ["Versand gewählt", "Adressen", "Übersicht", "Bestätigung"];

  if (!tariff) return (
    <div style={{ paddingTop: 88, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="text-center"><p className="text-muted mb-16">Kein Versandangebot ausgewählt</p><button className="btn btn-primary" onClick={() => onNavigate("calculator")}>Zum Preisrechner</button></div>
    </div>
  );

  return (
    <div style={{ paddingTop: 88, background: "var(--gray50)", minHeight: "100vh" }}>
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 760 }}>
        <h1 className="heading mb-24" style={{ fontSize: 24, color: "var(--navy)" }}>Sendung buchen</h1>

        {/* Steps */}
        <div className="steps-bar mb-24">
          {steps.map((s, i) => (
            <div key={i} className="step-item">
              <div className="step-wrap">
                <div className={`step-circle ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>
                  {i + 1 < step ? "✓" : i + 1}
                </div>
                <span className={`step-label ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className={`step-line ${i + 1 < step ? "done" : ""}`} />}
            </div>
          ))}
        </div>

        {error && <div className="alert alert-error mb-16"><Icon n="x" s={16} />{error}</div>}

        {step === 1 && (
          <div>
            <div className="calc-panel">
              <div className="calc-panel-header"><Icon n="truck" s={18} c="#1D4ED8" /><h3>Ausgewähltes Angebot</h3></div>
              <div className="calc-panel-body">
                <div className="flex-between mb-16">
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--navy)", fontFamily: "Syne, sans-serif" }}>{tariff.carrier}</div>
                    <div className="text-sm text-muted mt-4">{tariff.tariffName} · {tariff.deliveryTime || "Laufzeit auf Anfrage"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", fontFamily: "DM Mono, monospace" }}>{money(tariff.finalPrice)}</div>
                    <div className="text-xs text-muted">inkl. Marge</div>
                  </div>
                </div>
                <div className="flex gap-8">
                  {tariff.trackingAvailable && <span className="badge badge-green">✓ Tracking</span>}
                  {tariff.insuranceAvailable && <span className="badge badge-blue">🛡 Versicherung</span>}
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-full mt-16" onClick={() => setStep(2)}>Weiter: Adressen eingeben <Icon n="arrow" s={16} /></button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="map" s={18} c="#1D4ED8" /><h3>Absender</h3></div>
              <div className="calc-panel-body">
                <div className="field"><label className="field-label">Firmenname / Name</label><input className="field-input" value={form.sender_name} onChange={e => upd("sender_name", e.target.value)} /></div>
                <div className="field"><label className="field-label">Straße & Hausnummer</label><input className="field-input" value={form.sender_street} onChange={e => upd("sender_street", e.target.value)} /></div>
                <div className="field-row field-row-3">
                  <div className="field"><label className="field-label">PLZ</label><input className="field-input" value={form.sender_zip} onChange={e => upd("sender_zip", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Stadt</label><input className="field-input" value={form.sender_city} onChange={e => upd("sender_city", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.sender_country} onChange={e => upd("sender_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                </div>
              </div>
            </div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="map" s={18} c="#1D4ED8" /><h3>Empfänger</h3></div>
              <div className="calc-panel-body">
                <div className="field"><label className="field-label">Firmenname / Name</label><input className="field-input" value={form.rec_name} onChange={e => upd("rec_name", e.target.value)} /></div>
                <div className="field"><label className="field-label">Straße & Hausnummer</label><input className="field-input" value={form.rec_street} onChange={e => upd("rec_street", e.target.value)} /></div>
                <div className="field-row field-row-3">
                  <div className="field"><label className="field-label">PLZ</label><input className="field-input" value={form.rec_zip} onChange={e => upd("rec_zip", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Stadt</label><input className="field-input" value={form.rec_city} onChange={e => upd("rec_city", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.rec_country} onChange={e => upd("rec_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                </div>
                <div className="field-row field-row-2">
                  <div className="field"><label className="field-label">E-Mail (optional)</label><input className="field-input" type="email" value={form.rec_email} onChange={e => upd("rec_email", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Telefon (optional)</label><input className="field-input" value={form.rec_phone} onChange={e => upd("rec_phone", e.target.value)} /></div>
                </div>
                <div className="field"><label className="field-label">Inhaltsbeschreibung</label><input className="field-input" value={form.content} onChange={e => upd("content", e.target.value)} placeholder="z.B. Elektronik, Textilien" /></div>
              </div>
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(1)}>← Zurück</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)} disabled={!form.rec_name || !form.rec_zip}>Weiter: Übersicht <Icon n="arrow" s={16} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Buchungsübersicht</h3></div>
              <div className="calc-panel-body">
                {[
                  ["Carrier", tariff.carrier],
                  ["Service", tariff.tariffName],
                  ["Lieferzeit", tariff.deliveryTime || "—"],
                  ["Absender", `${form.sender_name}, ${form.sender_zip} ${form.sender_city}`],
                  ["Empfänger", `${form.rec_name}, ${form.rec_zip} ${form.rec_city}, ${form.rec_country}`],
                  ["Preis", money(tariff.finalPrice)],
                ].map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 5 ? "1px solid var(--border)" : "none" }}>
                    <span className="text-sm text-muted">{k}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "var(--blue-light)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16, fontSize: 13, color: "var(--blue2)" }}>
              💡 Zahlung auf Rechnung — Sie erhalten die Rechnung per E-Mail.
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(2)}>← Zurück</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={doBook} disabled={loading}>
                {loading ? <><span className="spinner" /> Buche…</> : <>✓ Jetzt verbindlich buchen</>}
              </button>
            </div>
          </div>
        )}

        {step === 4 && booking && (
          <div className="text-center" style={{ padding: "40px 0" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--success-bg)", border: "2px solid var(--success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 32 }}>✓</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>Sendung erfolgreich gebucht!</h2>
            <p className="text-muted mb-24">Bestätigung & Rechnung wurden an {user?.email} gesendet.</p>
            <div className="calc-panel" style={{ textAlign: "left", maxWidth: 400, margin: "0 auto 28px" }}>
              <div className="calc-panel-body">
                {[["Rechnungsnummer", booking.invoiceNumber], ["Betrag", money(booking.amount)], ["Fällig am", dateDE(booking.dueDate)]].map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                    <span className="text-sm text-muted">{k}</span>
                    <span className="font-bold text-sm" style={{ color: "var(--navy)", fontFamily: k === "Rechnungsnummer" ? "DM Mono, monospace" : "inherit" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-center gap-12">
              <button className="btn btn-primary" onClick={() => onNavigate("dashboard")}>Zum Dashboard</button>
              <button className="btn btn-outline" onClick={() => onNavigate("calculator")}>Neue Sendung</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user, onNavigate, onLogout }) {
  const [page, setPage] = useState("overview");
  const [shipments, setShipments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackingId, setTrackingId] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/kunde/shipments`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/kunde/invoices`, { headers: authH() }).then(r => r.json()),
    ]).then(([s, inv]) => {
      setShipments(s.shipments || []);
      setInvoices(inv.invoices || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadTracking = async (id) => {
    if (trackingId === id) { setTrackingId(null); return; }
    setTrackLoad(true); setTrackingId(id); setTracking(null);
    try {
      const r = await fetch(`${API}/api/tracking/${id}`, { headers: authH() });
      const d = await r.json();
      setTracking(d.tracking);
    } catch { setTracking({ error: "Tracking nicht verfügbar" }); }
    setTrackLoading(false);
  };

  const setTrackLoad = (v) => setTrackLoading(v);

  const downloadLabel = async (id) => {
    try {
      const r = await fetch(`${API}/api/jumingo/label/${id}`, { headers: authH() });
      const d = await r.json();
      if (d.label) { const a = document.createElement("a"); a.href = `data:application/pdf;base64,${d.label}`; a.download = `label-${id}.pdf`; a.click(); }
    } catch { alert("Label nicht verfügbar"); }
  };

  const unpaid = invoices.filter(i => i.status === "unpaid");
  const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.amount), 0);
  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const navItems = [
    { id: "overview", label: "Übersicht", icon: "dashboard" },
    { id: "new", label: "Neue Sendung", icon: "plus" },
    { id: "shipments", label: "Sendungen", icon: "truck" },
    { id: "invoices", label: "Rechnungen", icon: "invoice" },
    { id: "profile", label: "Mein Profil", icon: "user" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark" style={{ width: 30, height: 30, fontSize: 12 }}>CE</div>
          <div>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--navy)" }}>ConfidaraExpress</div>
            <div style={{ fontSize: 10, color: "var(--gray400)" }}>B2B Versand</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(item => (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
              <Icon n={item.icon} s={16} /> {item.label}
            </button>
          ))}
          <div className="nav-section-label" style={{ marginTop: 8 }}>Plattform</div>
          <button className="nav-item" onClick={() => onNavigate("home")}><Icon n="globe" s={16} /> Zur Website</button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{user?.company_name || user?.name}</div>
              <div className="user-role">Kunde</div>
            </div>
            <button className="logout-btn" onClick={onLogout} title="Abmelden"><Icon n="logout" s={14} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {/* Overview */}
        {page === "overview" && (
          <>
            <div className="page-header">
              <div><div className="page-header-title">Guten Tag, {user?.company_name || user?.name} 👋</div><div className="page-header-sub">Willkommen in Ihrem ConfidaraExpress Dashboard</div></div>
              <button className="btn btn-primary btn-sm" onClick={() => setPage("new")}><Icon n="plus" s={14} /> Neue Sendung</button>
            </div>
            <div className="page-body">
              {loading ? <div className="loading-center"><span className="spinner spinner-dark" /> Laden…</div> : (
                <>
                  <div className="kpi-grid">
                    <div className="kpi-card"><div className="kpi-label">Sendungen gesamt</div><div className="kpi-value">{shipments.length}</div><div className="kpi-sub">Alle Buchungen</div></div>
                    <div className="kpi-card"><div className="kpi-label">Offene Rechnungen</div><div className="kpi-value">{unpaid.length}</div><div className="kpi-sub">{money(unpaidAmt)} offen</div></div>
                    <div className="kpi-card"><div className="kpi-label">Status</div><div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}><StatusBadge status={user?.status} /></div><div className="kpi-sub">{user?.email}</div></div>
                    <div className="kpi-card"><div className="kpi-label">Konto</div><div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}>B2B</div><div className="kpi-sub">Rechnungskauf aktiv</div></div>
                  </div>
                  <div className="table-card">
                    <div className="table-card-header">
                      <span className="table-card-title">Letzte Sendungen</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPage("shipments")}>Alle anzeigen</button>
                    </div>
                    {shipments.length === 0 ? (
                      <div className="empty"><div className="empty-icon">📦</div><div className="empty-title">Noch keine Sendungen</div><div className="empty-text">Buchen Sie Ihre erste Sendung</div></div>
                    ) : (
                      <table>
                        <thead><tr><th>Sendungs-ID</th><th>Carrier</th><th>Preis</th><th>Status</th><th>Datum</th></tr></thead>
                        <tbody>
                          {shipments.slice(0, 5).map(s => (
                            <tr key={s.id}>
                              <td className="mono" style={{ fontSize: 12 }}>{s.jumingo_shipment_id || "—"}</td>
                              <td>{s.selected_carrier || "—"}</td>
                              <td className="font-bold">{money(s.price_final)}</td>
                              <td><StatusBadge status={s.status} /></td>
                              <td className="text-muted">{dateDE(s.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* New Shipment */}
        {page === "new" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Neue Sendung</div><div className="page-header-sub">Preise berechnen und buchen</div></div></div>
            <div className="page-body">
              <CalculatorPage authed={true} onNavigate={(p, data) => { if (p === "booking") onNavigate("booking", data); }} />
            </div>
          </>
        )}

        {/* Shipments */}
        {page === "shipments" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Meine Sendungen</div><div className="page-header-sub">Alle Buchungen und Tracking</div></div></div>
            <div className="page-body">
              {loading ? <div className="loading-center"><span className="spinner spinner-dark" /></div> : shipments.length === 0 ? (
                <div className="empty"><div className="empty-icon">📦</div><div className="empty-title">Noch keine Sendungen</div><div className="empty-text">Buchen Sie Ihre erste Sendung</div></div>
              ) : (
                <div className="table-card">
                  <table>
                    <thead><tr><th>Sendungs-ID</th><th>Carrier</th><th>Gewicht</th><th>Preis</th><th>Status</th><th>Datum</th><th>Aktionen</th></tr></thead>
                    <tbody>
                      {shipments.map(s => (
                        <React.Fragment key={s.id}>
                          <tr>
                            <td className="mono" style={{ fontSize: 12 }}>{s.jumingo_shipment_id || "—"}</td>
                            <td>{s.selected_carrier || "—"}</td>
                            <td className="text-muted">{s.weight ? `${s.weight} kg` : "—"}</td>
                            <td className="font-bold">{money(s.price_final)}</td>
                            <td><StatusBadge status={s.status} /></td>
                            <td className="text-muted">{dateDE(s.created_at)}</td>
                            <td>
                              <div className="flex gap-8">
                                {s.jumingo_shipment_id && <button className="btn btn-ghost btn-sm" onClick={() => loadTracking(s.jumingo_shipment_id)}>Tracking</button>}
                                {(s.status === "booked" || s.status === "label_ready") && <button className="btn btn-ghost btn-sm" onClick={() => downloadLabel(s.jumingo_shipment_id)}>Label</button>}
                              </div>
                            </td>
                          </tr>
                          {trackingId === s.jumingo_shipment_id && (
                            <tr>
                              <td colSpan={7} style={{ background: "var(--gray50)", padding: "20px 24px" }}>
                                {trackLoading ? <div className="loading-center"><span className="spinner spinner-dark" /></div> : (
                                  tracking?.error ? <p className="text-muted text-sm">{tracking.error}</p> : (
                                    <div>
                                      <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sendungsverlauf</h4>
                                      {tracking?.data?.tracking_events?.length > 0 ? (
                                        <div className="tracking-timeline">
                                          {tracking.data.tracking_events.map((ev, i) => (
                                            <div key={i} className="track-event">
                                              <div className={`track-dot ${i === 0 ? "active" : "done"}`}>{i === 0 ? "●" : "✓"}</div>
                                              <div className="track-info">
                                                <div className="track-title">{ev.description || ev.status}</div>
                                                {ev.location && <div className="track-location">{ev.location}</div>}
                                                <div className="track-time">{ev.timestamp ? dtDE(ev.timestamp) : ""}</div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : <p className="text-muted text-sm">Noch keine Tracking-Events</p>}
                                    </div>
                                  )
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Invoices */}
        {page === "invoices" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Rechnungen</div><div className="page-header-sub">Alle Rechnungen und Zahlungsstatus</div></div></div>
            <div className="page-body">
              {unpaid.length > 0 && <div className="alert alert-info mb-16"><Icon n="invoice" s={16} />Offener Betrag: <strong>{money(unpaidAmt)}</strong> — Bitte gemäß Zahlungsziel überweisen</div>}
              {invoices.length === 0 ? (
                <div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">Noch keine Rechnungen</div></div>
              ) : (
                <div className="table-card">
                  <table>
                    <thead><tr><th>Rechnungsnummer</th><th>Betrag</th><th>Status</th><th>Zahlungsziel</th><th>Fällig am</th><th>Bezahlt am</th></tr></thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id}>
                          <td className="mono">{inv.invoice_number}</td>
                          <td className="font-bold">{money(inv.amount)}</td>
                          <td><StatusBadge status={inv.status} /></td>
                          <td className="text-muted">{inv.payment_term} Tage</td>
                          <td className="text-muted">{dateDE(inv.due_date)}</td>
                          <td className="text-muted">{inv.paid_at ? dateDE(inv.paid_at) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Profile */}
        {page === "profile" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Mein Profil</div><div className="page-header-sub">Ihre Kontodaten</div></div></div>
            <div className="page-body">
              <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { title: "Kontaktdaten", items: [["Name", user?.name], ["E-Mail", user?.email]] },
                  { title: "Firmendaten", items: [["Firmenname", user?.company_name], ["USt-ID", user?.vat_id || "—"], ["Straße", user?.street], ["PLZ / Stadt", `${user?.zip} ${user?.city}`], ["Land", user?.country]] },
                  { title: "Kontodetails", items: [["Status", <StatusBadge status={user?.status} />], ["Zahlungsart", "Rechnung (B2B)"]] },
                ].map((section, si) => (
                  <div key={si} className="table-card">
                    <div className="table-card-header"><span className="table-card-title">{section.title}</span></div>
                    <div style={{ padding: "8px 20px 16px" }}>
                      {section.items.map(([k, v], i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < section.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <span className="text-sm text-muted">{k}</span>
                          <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>{v || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Tracking Public ──────────────────────────────────────────────────────────
function TrackingPage() {
  const [id, setId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const track = async () => {
    if (!id) return;
    setError(""); setLoading(true); setResult(null);
    try {
      const r = await fetch(`${API}/api/tracking/public/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sendung nicht gefunden");
      setResult(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ paddingTop: 88, minHeight: "100vh", background: "var(--gray50)" }}>
      <div className="container" style={{ paddingTop: 48, paddingBottom: 48, maxWidth: 600 }}>
        <div className="text-center mb-32">
          <div className="section-label">✦ Tracking</div>
          <h1 className="section-title">Sendung verfolgen</h1>
          <p className="section-sub" style={{ margin: "0 auto" }}>Geben Sie Ihre Sendungs-ID ein</p>
        </div>
        <div className="calc-panel">
          <div className="calc-panel-body">
            <div className="field">
              <label className="field-label">Sendungs-ID / Tracking-Nummer</label>
              <input className="field-input" value={id} onChange={e => setId(e.target.value)} onKeyDown={e => e.key === "Enter" && track()} placeholder="z.B. 12345678901234" style={{ fontSize: 16 }} />
            </div>
            {error && <div className="alert alert-error mb-16"><Icon n="x" s={16} />{error}</div>}
            <button className="btn btn-primary btn-full" onClick={track} disabled={loading || !id}>
              {loading ? <><span className="spinner" /> Suche…</> : <><Icon n="search" s={16} /> Sendung verfolgen</>}
            </button>
          </div>
        </div>
        {result && (
          <div className="calc-panel mt-20">
            <div className="calc-panel-header"><Icon n="map" s={18} c="#1D4ED8" /><h3>Sendungsverlauf</h3></div>
            <div className="calc-panel-body">
              {result.tracking?.data?.tracking_events?.length > 0 ? (
                <div className="tracking-timeline">
                  {result.tracking.data.tracking_events.map((ev, i) => (
                    <div key={i} className="track-event">
                      <div className={`track-dot ${i === 0 ? "active" : "done"}`}>{i === 0 ? "●" : "✓"}</div>
                      <div className="track-info">
                        <div className="track-title">{ev.description || ev.status}</div>
                        {ev.location && <div className="track-location">{ev.location}</div>}
                        <div className="track-time">{ev.timestamp ? dtDE(ev.timestamp) : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-muted text-sm text-center" style={{ padding: "20px 0" }}>Noch keine Tracking-Events verfügbar</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [page, setPage] = useState("home");
  const [pageData, setPageData] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const loadUser = useCallback(async () => {
    const t = token();
    if (!t) { setLoadingUser(false); return; }
    try {
      const r = await fetch(`${API}/kundenbereich`, { headers: authH() });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setUser(d.user); setAuthed(true);
    } catch { localStorage.removeItem("ce_token"); }
    setLoadingUser(false);
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const handleLogin = useCallback(async (t) => {
    setLoadingUser(true);
    try {
      const r = await fetch(`${API}/kundenbereich`, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` } });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setUser(d.user); setAuthed(true);
      setPage("dashboard");
    } catch { localStorage.removeItem("ce_token"); }
    setLoadingUser(false);
  }, []);

  const logout = () => { localStorage.removeItem("ce_token"); setAuthed(false); setUser(null); setPage("home"); };

  const navigate = (p, data = null) => { setPage(p); setPageData(data); window.scrollTo(0, 0); };

  if (loadingUser) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="text-center">
        <div className="logo-mark" style={{ margin: "0 auto 16px" }}>CE</div>
        <div className="spinner spinner-dark" style={{ width: 28, height: 28, margin: "0 auto" }} />
      </div>
    </div>
  );

  const showNavbar = !["login", "register"].includes(page);

  return (
    <>
      {showNavbar && page !== "dashboard" && <Navbar onNavigate={navigate} authed={authed} />}

      {page === "home" && <HomePage onNavigate={navigate} />}
      {page === "calculator" && <CalculatorPage authed={authed} onNavigate={navigate} />}
      {page === "tracking" && <TrackingPage />}
      {page === "login" && <AuthPage onLogin={handleLogin} defaultTab="login" onNavigate={navigate} />}
      {page === "register" && <AuthPage onLogin={handleLogin} defaultTab="register" onNavigate={navigate} />}
      {page === "booking" && authed && <BookingPage user={user} bookingData={pageData} onNavigate={navigate} />}
      {page === "dashboard" && authed && <Dashboard user={user} onNavigate={navigate} onLogout={logout} />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
