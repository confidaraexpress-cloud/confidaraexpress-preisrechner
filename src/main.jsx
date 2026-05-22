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

const Icon = ({ n, s = 18, c = "currentColor" }) => {
  const p = {
    dashboard: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
    package: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12",
    invoice: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    plus: "M12 5v14M5 12h14",
    logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
    arrow: "M5 12h14M12 5l7 7-7 7",
    map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v18M15 6v18",
    settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    x: "M18 6L6 18M6 6l12 12",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
    eyeOff: "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    globe: "M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
    clock: "M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2",
    filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3",
    refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
    menu: "M3 12h18M3 6h18M3 18h18",
    close: "M18 6L6 18M6 6l12 12",
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

function PasswordField({ label, value, onChange, onKeyDown, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      {label && <label className="field-label-dark">{label}</label>}
      <div className="field-input-wrap">
        <input type={show ? "text" : "password"} className="field-input-dark" value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder || "••••••••"} />
        <button type="button" className="field-eye-btn" onClick={() => setShow(s => !s)}>
          <Icon n={show ? "eyeOff" : "eye"} s={16} c="rgba(255,255,255,0.5)" />
        </button>
      </div>
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin, defaultTab = "login", onNavigate }) {
  const [tab, setTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [step, setStep] = useState("credentials");
  const [resetToken, setResetToken] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({ name: "", email: "", password: "", company_name: "", vat_id: "", street: "", zip: "", city: "", country: "DE" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("reset");
    if (t) {
      setResetToken(t); setStep("reset");
      fetch(`${API}/auth/validate-reset-token/${t}`).then(r => r.json())
        .then(d => { if (!d.valid) { setStep("credentials"); setError("Reset-Link ungültig oder abgelaufen."); } })
        .catch(() => setStep("credentials"));
    }
  }, []);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/login`, { method: "POST", headers: jsonH, body: JSON.stringify({ ...loginForm, rememberMe }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Login fehlgeschlagen");
      if (d.token) { localStorage.setItem("ce_token", d.token); onLogin(d.token); }
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

  const reset = () => { setError(""); setSuccess(""); };

  return (
    <div className="auth-page-dark">
      <div className="auth-dark-bg">
        <div className="auth-dark-glow glow-1" />
        <div className="auth-dark-glow glow-2" />
        <div className="auth-dark-glow glow-3" />
      </div>
      <div className="auth-dark-container">
        {/* Left: Marketing */}
        <div className="auth-dark-left animate-fadeUp">
          <div className="auth-logo-row" onClick={() => onNavigate("calculator")}>
            <div className="logo-mark">CE</div>
            <span className="logo-text-white">ConfidaraExpress</span>
          </div>
          <div className="auth-dark-badge">✦ B2B Versandplattform — Live Preise</div>
          <h1 className="auth-dark-title">
            Internationalen Versand in <span className="auth-dark-highlight">Sekunden</span> buchen.
          </h1>
          <p className="auth-dark-sub">
            Vergleichen Sie DHL, UPS, FedEx, GLS & mehr in Echtzeit. Sofort buchbar, Tracking inklusive, Zahlung auf Rechnung.
          </p>
          <div className="auth-dark-perks">
            {["Live Preise", "Sofort buchbar", "Tracking inklusive", "Rechnungskauf"].map(perk => (
              <div key={perk} className="auth-dark-perk">
                <div className="auth-dark-perk-check">✓</div>
                <span>{perk}</span>
              </div>
            ))}
          </div>
          <div className="auth-dark-carriers">
            {["DHL", "UPS", "FedEx", "GLS", "DPD"].map(c => (
              <div key={c} className="auth-dark-carrier">{c}</div>
            ))}
          </div>
        </div>

        {/* Right: Form */}
        <div className="auth-dark-right animate-fadeUp-1">
          <div className="auth-glass-card">

            {step === "forgot" && (
              <>
                <h2 className="auth-card-title">Passwort vergessen</h2>
                <p className="auth-card-sub">Reset-Link wird per E-Mail gesendet</p>
                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}
                {!success && (
                  <>
                    <div className="field">
                      <label className="field-label-dark">E-Mail</label>
                      <input className="field-input-dark" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleForgot()} placeholder="firma@beispiel.de" autoFocus />
                    </div>
                    <button className="btn btn-primary btn-full" onClick={handleForgot} disabled={loading || !forgotEmail}>
                      {loading ? <span className="spinner" /> : "Reset-Link senden"}
                    </button>
                  </>
                )}
                <button onClick={() => { setStep("credentials"); reset(); }} className="btn-ghost-dark mt-8">← Zurück zum Login</button>
              </>
            )}

            {step === "reset" && (
              <>
                <h2 className="auth-card-title">Neues Passwort</h2>
                <p className="auth-card-sub">Mindestens 8 Zeichen</p>
                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}
                {!success && (
                  <>
                    <PasswordField label="Neues Passwort" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    <PasswordField label="Passwort bestätigen" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReset()} />
                    <button className="btn btn-primary btn-full" onClick={handleReset} disabled={loading || !newPassword}>
                      {loading ? <span className="spinner" /> : "Passwort speichern"}
                    </button>
                  </>
                )}
              </>
            )}

            {step === "credentials" && (
              <>
                <div className="auth-dark-tabs">
                  <button className={`auth-dark-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); reset(); }}>Anmelden</button>
                  <button className={`auth-dark-tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); reset(); }}>Registrieren</button>
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {tab === "login" ? (
                  <>
                    <h2 className="auth-card-title">Willkommen zurück</h2>
                    <p className="auth-card-sub">Melden Sie sich in Ihrem Konto an</p>
                    <div className="field">
                      <label className="field-label-dark">E-Mail</label>
                      <input className="field-input-dark" type="email" value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="firma@beispiel.de" autoFocus />
                    </div>
                    <PasswordField label="Passwort" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleLogin()} />
                    <div className="auth-remember-row">
                      <label className="auth-remember-label">
                        <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                        Angemeldet bleiben
                      </label>
                      <span className="link-dark" onClick={() => { setStep("forgot"); reset(); }}>Passwort vergessen?</span>
                    </div>
                    <button className="btn btn-primary btn-full" onClick={handleLogin} disabled={loading}>
                      {loading ? <span className="spinner" /> : "Anmelden →"}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="auth-card-title">Konto erstellen</h2>
                    <p className="auth-card-sub">Starten Sie kostenlos mit ConfidaraExpress</p>
                    <div className="field-row field-row-2">
                      <div className="field"><label className="field-label-dark">Name</label><input className="field-input-dark" value={regForm.name} onChange={e => setRegForm(p => ({ ...p, name: e.target.value }))} /></div>
                      <div className="field"><label className="field-label-dark">E-Mail</label><input className="field-input-dark" type="email" value={regForm.email} onChange={e => setRegForm(p => ({ ...p, email: e.target.value }))} /></div>
                    </div>
                    <PasswordField label="Passwort (min. 8 Zeichen)" value={regForm.password} onChange={e => setRegForm(p => ({ ...p, password: e.target.value }))} />
                    <div className="field-row field-row-2">
                      <div className="field"><label className="field-label-dark">Firmenname</label><input className="field-input-dark" value={regForm.company_name} onChange={e => setRegForm(p => ({ ...p, company_name: e.target.value }))} /></div>
                      <div className="field"><label className="field-label-dark">USt-ID</label><input className="field-input-dark" value={regForm.vat_id} onChange={e => setRegForm(p => ({ ...p, vat_id: e.target.value }))} placeholder="DE123456789" /></div>
                    </div>
                    <div className="field"><label className="field-label-dark">Straße & Hausnummer</label><input className="field-input-dark" value={regForm.street} onChange={e => setRegForm(p => ({ ...p, street: e.target.value }))} /></div>
                    <div className="field-row field-row-3">
                      <div className="field"><label className="field-label-dark">PLZ</label><input className="field-input-dark" value={regForm.zip} onChange={e => setRegForm(p => ({ ...p, zip: e.target.value }))} /></div>
                      <div className="field"><label className="field-label-dark">Stadt</label><input className="field-input-dark" value={regForm.city} onChange={e => setRegForm(p => ({ ...p, city: e.target.value }))} /></div>
                      <div className="field"><label className="field-label-dark">Land</label><select className="field-input-dark field-select" value={regForm.country} onChange={e => setRegForm(p => ({ ...p, country: e.target.value }))}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                    </div>
                    <button className="btn btn-primary btn-full" onClick={handleRegister} disabled={loading}>
                      {loading ? <span className="spinner" /> : "Konto beantragen →"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
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
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  const applyFilter = useCallback((list) => {
    let f = [...list];
    if (form.max_price) f = f.filter(t => t.finalPrice <= Number(form.max_price));
    if (form.max_days) f = f.filter(t => { const m = t.deliveryTime?.match(/(\d+)/); return m ? Number(m[1]) <= Number(form.max_days) : true; });
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
      setTariffs(d.tariffs || []); setShipmentId(d.shipmentId); setHasResults(true);
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
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="globe" s={18} c="#1D4ED8" /><h3>Versandroute</h3></div>
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
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="package" s={18} c="#1D4ED8" /><h3>Paketdaten</h3></div>
              <div className="calc-panel-body">
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
            {hasResults && (
              <div className="calc-panel">
                <div className="calc-panel-header"><Icon n="filter" s={18} c="#1D4ED8" /><h3>Filtern</h3></div>
                <div className="calc-panel-body">
                  <div className="field-row field-row-2">
                    <div className="field"><label className="field-label">Max. Preis (€)</label><input className="field-input" type="number" value={form.max_price} onChange={e => upd("max_price", e.target.value)} placeholder="Alle" /></div>
                    <div className="field"><label className="field-label">Max. Lieferzeit (Tage)</label><input className="field-input" type="number" value={form.max_days} onChange={e => upd("max_days", e.target.value)} placeholder="Alle" /></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="results-panel">
            <div className="results-header">
              <h3>{hasResults ? `${filtered.length} Angebote gefunden` : "Versandangebote"}</h3>
              <p>{hasResults ? "Wählen Sie Ihr Angebot" : "Füllen Sie das Formular aus"}</p>
            </div>
            <div className="results-body">
              {!hasResults && !loading && <div className="results-empty"><div className="results-empty-icon">📦</div><p className="text-sm text-muted">Preise berechnen um Angebote zu sehen</p></div>}
              {loading && <div className="loading-center"><span className="spinner spinner-dark" /><span className="text-sm text-muted">Preise werden geladen…</span></div>}
              {!loading && filtered.map(t => (
                <div key={t.id} className={`tariff-card ${selected?.id === t.id ? "selected" : ""}`} onClick={() => setSelected(t)}>
                  <div className="tariff-card-top">
                    <div><div className="tariff-carrier">{t.carrier}</div><div className="tariff-service">{t.tariffName}</div></div>
                    <div><div className="tariff-price">{money(t.finalPrice)}</div><div className="tariff-price-sub">inkl. Marge</div></div>
                  </div>
                  <div className="tariff-tags">
                    {t.deliveryTime && <span className="tariff-tag">⏱ {t.deliveryTime}</span>}
                    {t.trackingAvailable && <span className="tariff-tag green">✓ Tracking</span>}
                  </div>
                </div>
              ))}
              {hasResults && !loading && (
                <div style={{ marginTop: 16 }}>
                  {selected ? (
                    <button className="btn btn-primary btn-full" onClick={() => authed ? onNavigate("booking", { tariff: selected, shipmentId, form }) : onNavigate("login")}>
                      {authed ? "Jetzt buchen →" : "Anmelden & buchen →"}
                    </button>
                  ) : <button className="btn btn-outline btn-full" disabled>Angebot auswählen</button>}
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

// ─── Booking Page ─────────────────────────────────────────────────────────────
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
          shipmentId: bookingData?.shipmentId, tariffId: tariff?.id,
          shipperTariffId: tariff?.shipper_tariff_id, carrier: tariff?.carrier,
          price_original: tariff?.originalPrice, price_final: tariff?.finalPrice,
          senderAddress: `${form.sender_name}, ${form.sender_street}, ${form.sender_zip} ${form.sender_city}`,
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

  if (!tariff) return (
    <div style={{ paddingTop: 88, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="text-center"><p className="text-muted mb-16">Kein Versandangebot ausgewählt</p><button className="btn btn-primary" onClick={() => onNavigate("calculator")}>Zum Preisrechner</button></div>
    </div>
  );

  const steps = ["Angebot", "Adressen", "Übersicht", "Bestätigung"];
  return (
    <div style={{ paddingTop: 88, background: "var(--gray50)", minHeight: "100vh" }}>
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 760 }}>
        <h1 className="heading mb-24" style={{ fontSize: 24, color: "var(--navy)" }}>Sendung buchen</h1>
        <div className="steps-bar mb-24">
          {steps.map((s, i) => (
            <div key={i} className="step-item">
              <div className="step-wrap">
                <div className={`step-circle ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>{i + 1 < step ? "✓" : i + 1}</div>
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
                  <div><div style={{ fontSize: 20, fontWeight: 800, color: "var(--navy)" }}>{tariff.carrier}</div><div className="text-sm text-muted mt-4">{tariff.tariffName} · {tariff.deliveryTime || "Laufzeit auf Anfrage"}</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", fontFamily: "DM Mono, monospace" }}>{money(tariff.finalPrice)}</div></div>
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-full mt-16" onClick={() => setStep(2)}>Weiter: Adressen <Icon n="arrow" s={16} /></button>
          </div>
        )}
        {step === 2 && (
          <div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="map" s={18} c="#1D4ED8" /><h3>Absender</h3></div>
              <div className="calc-panel-body">
                <div className="field"><label className="field-label">Name</label><input className="field-input" value={form.sender_name} onChange={e => upd("sender_name", e.target.value)} /></div>
                <div className="field"><label className="field-label">Straße</label><input className="field-input" value={form.sender_street} onChange={e => upd("sender_street", e.target.value)} /></div>
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
                <div className="field"><label className="field-label">Name</label><input className="field-input" value={form.rec_name} onChange={e => upd("rec_name", e.target.value)} /></div>
                <div className="field"><label className="field-label">Straße</label><input className="field-input" value={form.rec_street} onChange={e => upd("rec_street", e.target.value)} /></div>
                <div className="field-row field-row-3">
                  <div className="field"><label className="field-label">PLZ</label><input className="field-input" value={form.rec_zip} onChange={e => upd("rec_zip", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Stadt</label><input className="field-input" value={form.rec_city} onChange={e => upd("rec_city", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.rec_country} onChange={e => upd("rec_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                </div>
                <div className="field"><label className="field-label">Inhalt</label><input className="field-input" value={form.content} onChange={e => upd("content", e.target.value)} placeholder="z.B. Elektronik" /></div>
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
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Übersicht</h3></div>
              <div className="calc-panel-body">
                {[["Carrier", tariff.carrier], ["Preis", money(tariff.finalPrice)], ["Absender", `${form.sender_name}, ${form.sender_zip} ${form.sender_city}`], ["Empfänger", `${form.rec_name}, ${form.rec_zip} ${form.rec_city}`]].map(([k, v], i, arr) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span className="text-sm text-muted">{k}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(2)}>← Zurück</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={doBook} disabled={loading}>
                {loading ? <><span className="spinner" /> Buche…</> : "✓ Jetzt buchen"}
              </button>
            </div>
          </div>
        )}
        {step === 4 && booking && (
          <div className="text-center" style={{ padding: "40px 0" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--success-bg)", border: "2px solid var(--success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 32 }}>✓</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>Sendung gebucht!</h2>
            <p className="text-muted mb-24">Bestätigung an {user?.email} gesendet.</p>
            <div className="flex-center gap-12">
              <button className="btn btn-primary" onClick={() => onNavigate("dashboard")}>Dashboard</button>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    setTrackLoading(true); setTrackingId(id); setTracking(null);
    try {
      const r = await fetch(`${API}/api/tracking/${id}`, { headers: authH() });
      const d = await r.json();
      setTracking(d.tracking);
    } catch { setTracking({ error: "Tracking nicht verfügbar" }); }
    setTrackLoading(false);
  };

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

  const navigateTo = (id) => { setPage(id); setSidebarOpen(false); };

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div
          className="sidebar-overlay open"
          onClick={() => setSidebarOpen(false)}
          style={{ zIndex: 198 }}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} style={{ zIndex: 199 }}>
        <div className="sidebar-brand">
          <div className="logo-mark" style={{ width: 30, height: 30, fontSize: 12 }}>CE</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--navy)" }}>ConfidaraExpress</div>
            <div style={{ fontSize: 10, color: "var(--gray400)" }}>B2B Versand</div>
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}><Icon n="close" s={18} /></button>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(item => (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => navigateTo(item.id)}>
              <Icon n={item.icon} s={16} /> {item.label}
            </button>
          ))}
          <div className="nav-section-label" style={{ marginTop: 8 }}>Plattform</div>
          <button className="nav-item" onClick={() => onNavigate("calculator")}><Icon n="zap" s={16} /> Preisrechner</button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">{user?.company_name || user?.name}</div>
              <div className="user-role">Kunde</div>
            </div>
            <button className="logout-btn" onClick={onLogout} title="Abmelden"><Icon n="logout" s={14} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}><Icon n="menu" s={22} /></button>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--navy)" }}>ConfidaraExpress</div>
          <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials}</div>
        </div>

        {page === "overview" && (
          <>
            <div className="page-header">
              <div><div className="page-header-title">Guten Tag, {user?.company_name || user?.name} 👋</div><div className="page-header-sub">Ihr Dashboard</div></div>
              <button className="btn btn-primary btn-sm" onClick={() => setPage("new")}><Icon n="plus" s={14} /> Neue Sendung</button>
            </div>
            <div className="page-body">
              {loading ? <div className="loading-center"><span className="spinner spinner-dark" /></div> : (
                <>
                  <div className="kpi-grid">
                    <div className="kpi-card"><div className="kpi-label">Sendungen</div><div className="kpi-value">{shipments.length}</div></div>
                    <div className="kpi-card"><div className="kpi-label">Offen</div><div className="kpi-value">{unpaid.length}</div><div className="kpi-sub">{money(unpaidAmt)}</div></div>
                    <div className="kpi-card"><div className="kpi-label">Status</div><div style={{ marginTop: 8 }}><StatusBadge status={user?.status} /></div></div>
                    <div className="kpi-card"><div className="kpi-label">Konto</div><div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}>B2B</div></div>
                  </div>
                  <div className="table-card">
                    <div className="table-card-header"><span className="table-card-title">Letzte Sendungen</span><button className="btn btn-ghost btn-sm" onClick={() => setPage("shipments")}>Alle</button></div>
                    {shipments.length === 0 ? <div className="empty"><div className="empty-icon">📦</div><div className="empty-title">Noch keine Sendungen</div></div> : (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>Carrier</th><th>Preis</th><th>Status</th><th>Datum</th></tr></thead>
                          <tbody>{shipments.slice(0, 5).map(s => (<tr key={s.id}><td>{s.selected_carrier || "—"}</td><td className="font-bold">{money(s.price_final)}</td><td><StatusBadge status={s.status} /></td><td className="text-muted">{dateDE(s.created_at)}</td></tr>))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {page === "new" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Neue Sendung</div></div></div>
            <div className="page-body"><CalculatorPage authed={true} onNavigate={(p, data) => { if (p === "booking") onNavigate("booking", data); }} /></div>
          </>
        )}

        {page === "shipments" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Sendungen</div></div></div>
            <div className="page-body">
              {loading ? <div className="loading-center"><span className="spinner spinner-dark" /></div> : shipments.length === 0 ? (
                <div className="empty"><div className="empty-icon">📦</div><div className="empty-title">Noch keine Sendungen</div></div>
              ) : (
                <div className="table-card">
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Carrier</th><th>Gewicht</th><th>Preis</th><th>Status</th><th>Datum</th><th>Aktionen</th></tr></thead>
                      <tbody>
                        {shipments.map(s => (
                          <React.Fragment key={s.id}>
                            <tr>
                              <td>{s.selected_carrier || "—"}</td>
                              <td className="text-muted">{s.weight ? `${s.weight} kg` : "—"}</td>
                              <td className="font-bold">{money(s.price_final)}</td>
                              <td><StatusBadge status={s.status} /></td>
                              <td className="text-muted">{dateDE(s.created_at)}</td>
                              <td>
                                <div className="flex gap-8">
                                  {s.jumingo_shipment_id && <button className="btn btn-ghost btn-sm" onClick={() => loadTracking(s.jumingo_shipment_id)}>Track</button>}
                                  {(s.status === "booked" || s.status === "label_ready") && <button className="btn btn-ghost btn-sm" onClick={() => downloadLabel(s.jumingo_shipment_id)}>Label</button>}
                                </div>
                              </td>
                            </tr>
                            {trackingId === s.jumingo_shipment_id && (
                              <tr><td colSpan={6} style={{ background: "var(--gray50)", padding: "20px 24px" }}>
                                {trackLoading ? <div className="loading-center"><span className="spinner spinner-dark" /></div> : tracking?.error ? <p className="text-muted text-sm">{tracking.error}</p> : (
                                  <div className="tracking-timeline">
                                    {tracking?.data?.tracking_events?.map((ev, i) => (
                                      <div key={i} className="track-event">
                                        <div className={`track-dot ${i === 0 ? "active" : "done"}`}>{i === 0 ? "●" : "✓"}</div>
                                        <div className="track-info"><div className="track-title">{ev.description || ev.status}</div><div className="track-time">{ev.timestamp ? dtDE(ev.timestamp) : ""}</div></div>
                                      </div>
                                    )) || <p className="text-muted text-sm">Keine Events</p>}
                                  </div>
                                )}
                              </td></tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {page === "invoices" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Rechnungen</div></div></div>
            <div className="page-body">
              {unpaid.length > 0 && <div className="alert alert-info mb-16"><Icon n="invoice" s={16} />Offen: <strong>{money(unpaidAmt)}</strong></div>}
              {invoices.length === 0 ? <div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">Keine Rechnungen</div></div> : (
                <div className="table-card">
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Nummer</th><th>Betrag</th><th>Status</th><th>Fällig</th></tr></thead>
                      <tbody>{invoices.map(inv => (<tr key={inv.id}><td className="mono" style={{ fontSize: 12 }}>{inv.invoice_number}</td><td className="font-bold">{money(inv.amount)}</td><td><StatusBadge status={inv.status} /></td><td className="text-muted">{dateDE(inv.due_date)}</td></tr>))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {page === "profile" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Mein Profil</div></div></div>
            <div className="page-body">
              <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { title: "Kontakt", items: [["Name", user?.name], ["E-Mail", user?.email]] },
                  { title: "Firma", items: [["Firmenname", user?.company_name], ["USt-ID", user?.vat_id || "—"], ["Adresse", `${user?.street}, ${user?.zip} ${user?.city}`]] },
                  { title: "Konto", items: [["Status", <StatusBadge status={user?.status} />], ["Zahlungsart", "Rechnung (B2B)"]] },
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
          <h1 className="section-title">Sendung verfolgen</h1>
        </div>
        <div className="calc-panel">
          <div className="calc-panel-body">
            <div className="field"><label className="field-label">Sendungs-ID</label><input className="field-input" value={id} onChange={e => setId(e.target.value)} onKeyDown={e => e.key === "Enter" && track()} placeholder="z.B. 12345678901234" /></div>
            {error && <div className="alert alert-error mb-16">{error}</div>}
            <button className="btn btn-primary btn-full" onClick={track} disabled={loading || !id}>
              {loading ? <><span className="spinner" /> Suche…</> : <><Icon n="search" s={16} /> Verfolgen</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ onNavigate, authed }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <button className="hamburger-btn" onClick={() => setDrawerOpen(true)}>
            <Icon n="menu" s={22} />
          </button>
          <div className="navbar-logo" onClick={() => onNavigate("auth")}>
            <div className="logo-mark">CE</div>
            <span className="logo-text">ConfidaraExpress</span>
          </div>
          <ul className="navbar-nav">
            <li><a onClick={() => onNavigate("calculator")}>Preisrechner</a></li>
            <li><a onClick={() => onNavigate("tracking")}>Tracking</a></li>
          </ul>
          <div className="navbar-actions">
            {authed ? (
              <button className="btn btn-primary btn-sm" onClick={() => onNavigate("dashboard")}>Dashboard</button>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm navbar-login-btn" onClick={() => onNavigate("auth")}>Anmelden</button>
                <button className="btn btn-primary btn-sm" onClick={() => onNavigate("register")}>Registrieren</button>
              </>
            )}
          </div>
        </div>
      </nav>
      {drawerOpen && (
        <>
          <div className="sidebar-overlay open" onClick={() => setDrawerOpen(false)} style={{ zIndex: 998 }} />
          <div className="mobile-drawer open" style={{ zIndex: 999 }}>
            <div className="mobile-drawer-header">
              <div className="navbar-logo">
                <div className="logo-mark">CE</div>
                <span className="logo-text">ConfidaraExpress</span>
              </div>
              <button className="drawer-close-btn" onClick={() => setDrawerOpen(false)}>
                <Icon n="close" s={20} />
              </button>
            </div>
            <nav className="mobile-drawer-nav">
              <button className="drawer-nav-item" onClick={() => { onNavigate("calculator"); setDrawerOpen(false); }}><Icon n="zap" s={18} /> Preisrechner</button>
              <button className="drawer-nav-item" onClick={() => { onNavigate("tracking"); setDrawerOpen(false); }}><Icon n="map" s={18} /> Tracking</button>
              {authed ? (
                <button className="drawer-nav-item" onClick={() => { onNavigate("dashboard"); setDrawerOpen(false); }}><Icon n="dashboard" s={18} /> Dashboard</button>
              ) : (
                <>
                  <button className="drawer-nav-item" onClick={() => { onNavigate("auth"); setDrawerOpen(false); }}><Icon n="user" s={18} /> Anmelden</button>
                  <div className="drawer-cta">
                    <button className="btn btn-primary btn-full" onClick={() => { onNavigate("register"); setDrawerOpen(false); }}>Registrieren</button>
                  </div>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [page, setPage] = useState("auth");
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
      setUser(d.user); setAuthed(true); setPage("dashboard");
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
      setUser(d.user); setAuthed(true); setPage("dashboard");
    } catch { localStorage.removeItem("ce_token"); }
    setLoadingUser(false);
  }, []);

  const logout = () => { localStorage.removeItem("ce_token"); setAuthed(false); setUser(null); setPage("auth"); };

  const navigate = (p, data = null) => {
    setPage(p); setPageData(data); window.scrollTo(0, 0);
  };

  if (loadingUser) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060e1f" }}>
      <div className="text-center">
        <div className="logo-mark" style={{ margin: "0 auto 16px", width: 48, height: 48, fontSize: 20 }}>CE</div>
        <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto" }} />
      </div>
    </div>
  );

  const showNavbar = !["auth", "login", "register", "dashboard"].includes(page);

  return (
    <>
      {showNavbar && <Navbar onNavigate={navigate} authed={authed} />}
      {(page === "auth" || page === "login") && <AuthPage onLogin={handleLogin} defaultTab="login" onNavigate={navigate} />}
      {page === "register" && <AuthPage onLogin={handleLogin} defaultTab="register" onNavigate={navigate} />}
      {page === "calculator" && <CalculatorPage authed={authed} onNavigate={navigate} />}
      {page === "tracking" && <TrackingPage />}
      {page === "booking" && authed && <BookingPage user={user} bookingData={pageData} onNavigate={navigate} />}
      {page === "dashboard" && authed && <Dashboard user={user} onNavigate={navigate} onLogout={logout} />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);