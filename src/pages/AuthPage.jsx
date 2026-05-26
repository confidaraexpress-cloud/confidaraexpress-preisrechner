import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API, jsonH } from "../api/client";
import { LoginForm } from "../components/auth/LoginForm";
import { RegisterForm } from "../components/auth/RegisterForm";
import { ForgotPasswordForm } from "../components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "../components/auth/ResetPasswordForm";
import { useAuth } from "../context/AuthContext";

export default function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const defaultTab = location.pathname === "/register" ? "register" : "login";

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
      if (d.token) {
        localStorage.setItem("ce_token", d.token);
        await login(d.token);
        navigate("/dashboard");
      } else throw new Error("Kein Token erhalten");
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
        <div className="auth-bg-orb orb-3" />
        <div className="auth-bg-grid" />
      </div>
      <header className="auth-header">
        <div className="auth-header-inner">
          <div className="auth-brand" onClick={() => navigate("/calculator")}>
            <div className="logo-mark">CE</div>
            <span className="logo-text-white">ConfidaraExpress</span>
          </div>
          <div className="auth-header-links">
            <a className="auth-header-link" onClick={() => navigate("/calculator")}>Preisrechner</a>
            <a className="auth-header-link" onClick={() => navigate("/tracking")}>Tracking</a>
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
