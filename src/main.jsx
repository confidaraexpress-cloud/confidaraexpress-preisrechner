import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { money, dateDE, dtDE } from "./utils/formatters";
import { countries } from "./utils/countries";
import { API, token, authH, jsonH } from "./api/client";
import { Icon } from "./components/ui/Icon";
import { StatusBadge } from "./components/ui/StatusBadge";
import { PasswordField } from "./components/ui/PasswordField";
import { LoginForm } from "./components/auth/LoginForm";
import { RegisterForm } from "./components/auth/RegisterForm";
import { ForgotPasswordForm } from "./components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "./components/auth/ResetPasswordForm";
import { Overview } from "./components/dashboard/Overview";
import { ShipmentsList } from "./components/dashboard/ShipmentsList";
import { InvoicesList } from "./components/dashboard/InvoicesList";
import { Profile } from "./components/dashboard/Profile";

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
  const [regForm, setRegForm] = useState({
    name: "", email: "", password: "", company_name: "",
    vat_id: "", street: "", zip: "", city: "", country: "DE",
  });

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
      else throw new Error("Kein Token erhalten");
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
      setSuccess("Passwort zurückgesetzt!");
      window.history.replaceState({}, "", "/");
      setTimeout(() => { setStep("credentials"); setSuccess(""); }, 2000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const clearMessages = () => { setError(""); setSuccess(""); };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-bg-orb orb-1" />
        <div className="auth-bg-orb orb-2" />
        <div className="auth-bg-grid" />
      </div>
      <header className="auth-header">
        <div className="auth-header-inner">
          <div className="auth-brand" onClick={() => onNavigate("calculator")}>
            <div className="logo-mark">CE</div>
            <span className="logo-text-white">ConfidaraExpress</span>
          </div>
          <div className="auth-header-links">
            <a className="auth-header-link" onClick={() => onNavigate("calculator")}>Preisrechner</a>
            <a className="auth-header-link" onClick={() => onNavigate("tracking")}>Tracking</a>
          </div>
        </div>
      </header>
      <main className="auth-main">
        {step === "forgot" && (
          <ForgotPasswordForm
            email={forgotEmail}
            onChange={setForgotEmail}
            onSubmit={handleForgot}
            onBack={() => { setStep("credentials"); clearMessages(); }}
            loading={loading}
            error={error}
            success={success}
          />
        )}
        {step === "reset" && (
          <ResetPasswordForm
            password={newPassword}
            confirmPassword={newPasswordConfirm}
            onPasswordChange={setNewPassword}
            onConfirmChange={setNewPasswordConfirm}
            onSubmit={handleReset}
            loading={loading}
            error={error}
            success={success}
          />
        )}
        {step === "credentials" && (
          <>
            <div className="auth-hero animate-fadeUp">
              <div className="auth-hero-badge">B2B Versandplattform</div>
              <h1 className="auth-hero-title">{tab === "login" ? "Willkommen zurück" : "Konto erstellen"}</h1>
              <p className="auth-hero-sub">{tab === "login" ? "Melden Sie sich an und verwalten Sie Ihre Sendungen." : "Starten Sie kostenlos und versenden Sie international."}</p>
            </div>
            <div className="auth-card animate-fadeUp-1">
              <div className="auth-tabs">
                <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); clearMessages(); }}>Anmelden</button>
                <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); clearMessages(); }}>Registrieren</button>
              </div>
              {error && <div className="auth-alert auth-alert-error">{error}</div>}
              {success && <div className="auth-alert auth-alert-success">{success}</div>}
              {tab === "login" ? (
                <LoginForm
                  form={loginForm}
                  onChange={(k, v) => setLoginForm(p => ({ ...p, [k]: v }))}
                  onLogin={handleLogin}
                  onForgot={() => { setStep("forgot"); clearMessages(); }}
                  loading={loading}
                  rememberMe={rememberMe}
                  onRememberMe={setRememberMe}
                />
              ) : (
                <RegisterForm
                  form={regForm}
                  onChange={(k, v) => setRegForm(p => ({ ...p, [k]: v }))}
                  onRegister={handleRegister}
                  loading={loading}
                />
              )}
            </div>
            <div className="auth-trust animate-fadeUp-2">
              {["Live Preise", "Sofort buchbar", "Tracking inklusive", "Rechnungskauf"].map(p => (
                <div key={p} className="auth-trust-item">
                  <span className="auth-trust-check">✓</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
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
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [form, setForm] = useState({
    sender_name: user?.company_name || "", sender_street: user?.street || "",
    sender_zip: user?.zip || "", sender_city: user?.city || "", sender_country: user?.country || "DE",
    rec_name: "", rec_street: "", rec_zip: "", rec_city: "", rec_country: "DE",
    content: "",
  });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const tariff = bookingData?.tariff;

  const doBook = async () => {
    if (!agbAccepted) return;
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
      setBooking(d); setStep(5);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  if (!tariff) return (
    <div style={{ paddingTop: 88, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="text-center"><p className="text-muted mb-16">Kein Angebot ausgewählt</p><button className="btn btn-primary" onClick={() => onNavigate("calculator")}>Zum Preisrechner</button></div>
    </div>
  );

  const steps = ["Angebot", "Adressen", "Übersicht", "Bestätigung", "Fertig"];

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
        {error && <div className="alert alert-error mb-16">{error}</div>}

        {step === 1 && (
          <div>
            <div className="calc-panel">
              <div className="calc-panel-header"><Icon n="truck" s={18} c="#1D4ED8" /><h3>Ausgewähltes Angebot</h3></div>
              <div className="calc-panel-body">
                <div className="flex-between">
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--navy)" }}>{tariff.carrier}</div>
                    <div className="text-sm text-muted">{tariff.tariffName} · {tariff.deliveryTime || "Auf Anfrage"}</div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", fontFamily: "DM Mono, monospace" }}>{money(tariff.finalPrice)}</div>
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
                <div className="field"><label className="field-label">Name / Firma</label><input className="field-input" value={form.sender_name} onChange={e => upd("sender_name", e.target.value)} /></div>
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
                <div className="field"><label className="field-label">Name / Firma</label><input className="field-input" value={form.rec_name} onChange={e => upd("rec_name", e.target.value)} /></div>
                <div className="field"><label className="field-label">Straße & Hausnummer</label><input className="field-input" value={form.rec_street} onChange={e => upd("rec_street", e.target.value)} /></div>
                <div className="field-row field-row-3">
                  <div className="field"><label className="field-label">PLZ</label><input className="field-input" value={form.rec_zip} onChange={e => upd("rec_zip", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Stadt</label><input className="field-input" value={form.rec_city} onChange={e => upd("rec_city", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.rec_country} onChange={e => upd("rec_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                </div>
                <div className="field"><label className="field-label">Sendungsinhalt</label><input className="field-input" value={form.content} onChange={e => upd("content", e.target.value)} placeholder="z.B. Elektronik" /></div>
              </div>
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(1)}>← Zurück</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)} disabled={!form.rec_name || !form.rec_zip || !form.sender_name || !form.sender_zip}>Weiter: Übersicht →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Zusammenfassung</h3></div>
              <div className="calc-panel-body">
                {[
                  ["Carrier", tariff.carrier],
                  ["Service", tariff.tariffName],
                  ["Lieferzeit", tariff.deliveryTime || "Auf Anfrage"],
                  ["Preis", money(tariff.finalPrice)],
                  ["Absender", `${form.sender_name}, ${form.sender_street}, ${form.sender_zip} ${form.sender_city}`],
                  ["Empfänger", `${form.rec_name}, ${form.rec_street}, ${form.rec_zip} ${form.rec_city}, ${form.rec_country}`],
                  ["Inhalt", form.content || "—"],
                ].map(([k, v], i, arr) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", gap: 16 }}>
                    <span className="text-sm text-muted" style={{ flexShrink: 0 }}>{k}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)", textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(2)}>← Zurück</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(4)}>Weiter: Verbindlich bestellen →</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="calc-panel mb-16" style={{ border: "2px solid var(--blue)" }}>
              <div className="calc-panel-header" style={{ background: "linear-gradient(135deg, var(--navy), var(--blue2))" }}>
                <Icon n="shield" s={18} c="white" />
                <h3 style={{ color: "white" }}>Verbindliche Bestellung</h3>
              </div>
              <div className="calc-panel-body">
                <div style={{ background: "var(--gray50)", borderRadius: "var(--radius)", padding: "16px", marginBottom: "20px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span className="text-sm text-muted">Carrier</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>{tariff.carrier} — {tariff.tariffName}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span className="text-sm text-muted">Absender</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)", textAlign: "right" }}>{form.sender_name}, {form.sender_zip} {form.sender_city}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <span className="text-sm text-muted">Empfänger</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)", textAlign: "right" }}>{form.rec_name}, {form.rec_zip} {form.rec_city}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "2px solid var(--border)" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>Gesamtbetrag</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: "var(--blue2)", fontFamily: "DM Mono, monospace" }}>{money(tariff.finalPrice)}</span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "var(--gray400)", marginTop: 4 }}>
                    inkl. MwSt. · Zahlung auf Rechnung · {user?.payment_term || 28} Tage Zahlungsziel
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 20 }}>
                  <input type="checkbox" checked={agbAccepted} onChange={e => setAgbAccepted(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--blue)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "var(--gray600)", lineHeight: 1.6 }}>
                    Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
                    <span style={{ color: "var(--blue2)", fontWeight: 600 }}>Allgemeinen Geschäftsbedingungen</span>{" "}
                    zu. Mir ist bewusst, dass diese Bestellung verbindlich ist und eine Zahlungsverpflichtung auslöst.
                  </span>
                </label>
                {error && <div className="alert alert-error">{error}</div>}
                <button className="btn btn-primary btn-full" onClick={doBook} disabled={loading || !agbAccepted} style={{ fontSize: 15, padding: "13px", opacity: agbAccepted ? 1 : 0.5 }}>
                  {loading ? <><span className="spinner" /> Sendung wird gebucht…</> : "✓ Jetzt verbindlich bestellen"}
                </button>
                <p style={{ textAlign: "center", fontSize: 12, color: "var(--gray400)", marginTop: 12 }}>
                  Nach der Buchung erhalten Sie eine Bestätigung per E-Mail an {user?.email}
                </p>
              </div>
            </div>
            <button className="btn btn-outline btn-full" onClick={() => setStep(3)} disabled={loading}>← Zurück zur Übersicht</button>
          </div>
        )}

        {step === 5 && booking && (
          <div className="text-center" style={{ padding: "40px 0" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--success-bg)", border: "3px solid var(--success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>✓</div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>Sendung gebucht!</h2>
            <p className="text-muted mb-8">Rechnungsnummer: <strong style={{ color: "var(--navy)" }}>{booking.invoiceNumber}</strong></p>
            <p className="text-muted mb-24">Bestätigung wurde an {user?.email} gesendet.</p>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

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
      {sidebarOpen && <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} style={{ zIndex: 198 }} />}
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
          <Overview
            user={user}
            shipments={shipments}
            invoices={invoices}
            loading={loading}
            onNewShipment={() => setPage("new")}
            onAllShipments={() => setPage("shipments")}
          />
        )}

        {page === "new" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Neue Sendung</div></div></div>
            <div className="page-body">
              <CalculatorPage authed={true} onNavigate={(p, data) => { if (p === "booking") onNavigate("booking", data); }} />
            </div>
          </>
        )}

        {page === "shipments" && (
          <ShipmentsList shipments={shipments} loading={loading} />
        )}

        {page === "invoices" && (
          <InvoicesList invoices={invoices} loading={loading} />
        )}

        {page === "profile" && (
          <Profile user={user} />
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
        <div className="text-center mb-32"><h1 className="section-title">Sendung verfolgen</h1></div>
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
          <button className="hamburger-btn" onClick={() => setDrawerOpen(true)}><Icon n="menu" s={22} /></button>
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
              <div className="navbar-logo"><div className="logo-mark">CE</div><span className="logo-text">ConfidaraExpress</span></div>
              <button className="drawer-close-btn" onClick={() => setDrawerOpen(false)}><Icon n="close" s={20} /></button>
            </div>
            <nav className="mobile-drawer-nav">
              <button className="drawer-nav-item" onClick={() => { onNavigate("calculator"); setDrawerOpen(false); }}><Icon n="zap" s={18} /> Preisrechner</button>
              <button className="drawer-nav-item" onClick={() => { onNavigate("tracking"); setDrawerOpen(false); }}><Icon n="map" s={18} /> Tracking</button>
              {authed ? (
                <button className="drawer-nav-item" onClick={() => { onNavigate("dashboard"); setDrawerOpen(false); }}><Icon n="dashboard" s={18} /> Dashboard</button>
              ) : (
                <>
                  <button className="drawer-nav-item" onClick={() => { onNavigate("auth"); setDrawerOpen(false); }}><Icon n="user" s={18} /> Anmelden</button>
                  <div className="drawer-cta"><button className="btn btn-primary btn-full" onClick={() => { onNavigate("register"); setDrawerOpen(false); }}>Registrieren</button></div>
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
  const navigate = (p, data = null) => { setPage(p); setPageData(data); window.scrollTo(0, 0); };

  if (loadingUser) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#070f20" }}>
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