import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API, jsonH } from "../api/client";
import { LoginForm } from "../components/auth/LoginForm";
import { RegisterForm } from "../components/auth/RegisterForm";
import { ForgotPasswordForm } from "../components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "../components/auth/ResetPasswordForm";
import { AuthAurora } from "../components/auth/AuthAurora";
import { TrustBar } from "../components/auth/TrustBar";
import { Icon } from "../components/ui/Icon";
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
      <AuthAurora />

      <div className="auth-shell">

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
            <div className="auth-hero">
              <div className="auth-badge auth-anim">
                <span className="auth-badge-ico"><Icon n="cube" s={16} /></span>
                <span>Ihr verlässlicher Partner</span>
              </div>
              <h1 className="auth-title auth-anim delay-1">
                Wir verbinden Welten.<br />
                Sie erreichen <em>mehr.</em>
              </h1>
              <div className="auth-sub-1 auth-anim delay-2">Sicher. Schnell. Persönlich.</div>
              <p className="auth-sub-2 auth-anim delay-2">
                Loggen Sie sich ein und entdecken Sie grenzüberschreitende Exzellenz.
              </p>
            </div>

            <div className="auth-card auth-anim delay-3">
              <div className="auth-tabs">
                <button
                  type="button"
                  className={`auth-tab ${tab === "login" ? "active" : ""}`}
                  onClick={() => { setTab("login"); clearMessages(); }}
                >
                  <span className="auth-tab-ico"><Icon n="user" s={16} /></span>
                  <span>Anmelden</span>
                </button>
                <button
                  type="button"
                  className={`auth-tab ${tab === "register" ? "active" : ""}`}
                  onClick={() => { setTab("register"); clearMessages(); }}
                >
                  <span className="auth-tab-ico"><Icon n="userPlus" s={16} /></span>
                  <span>Registrieren</span>
                </button>
              </div>

              {error   && <div className="auth-alert auth-alert-error">{error}</div>}
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

            <TrustBar />
          </>
        )}

      </div>
    </div>
  );
}
