import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { API, jsonH } from "../api/client";
import { LoginForm } from "../components/auth/LoginForm";
import { RegisterForm } from "../components/auth/RegisterForm";
import { ForgotPasswordForm } from "../components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "../components/auth/ResetPasswordForm";
import { AuthAurora } from "../components/auth/AuthAurora";
import { TrustBar } from "../components/auth/TrustBar";
import { Icon } from "../components/ui/Icon";
import { BrandLogo } from "../components/ui/BrandLogo";
import { useAuth } from "../context/AuthContext";

// Validierung, B2B-Wording und Feldfehler-Mapping liegen in einem reinen Modul,
// damit sie ohne React-Render-Infrastruktur mit `node --test` prüfbar sind.
import {
  getRegErrors,
  mapApiRegistrationError,
  buildRegistrationPayload,
} from "../utils/registrationValidation.mjs";
// Auth-Fehlerzuordnung: Codes → Kundentexte, Transportfehler über die zentrale
// Klassifizierung (apiError.mjs). Ersetzt die früheren rohen e.message-Anzeigen
// und die leeren Banner aus `new Error(d.error)` ohne Fallback.
import {
  mapLoginError, mapForgotError, mapResetError, mapAuthThrownError,
  classifyResetTokenCheck, FORGOT_NEUTRAL_ERFOLG, LOGIN_SERVERFEHLER,
  KUNDENBEREICH_NACH_LOGIN_FEHLER, RESET_PRUEFUNG_NETZFEHLER,
} from "../utils/authErrors.mjs";

// Antwort-Body defensiv lesen: leerer Body, HTML-Fehlerseite oder abgebrochene
// Übertragung dürfen nie als Parserfehler beim Kunden landen.
async function readJson(r) {
  try { return await r.json(); } catch { return null; }
}

export default function AuthPage() {
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const defaultTab = location.pathname === "/register" ? "register" : "login";

  const [tab, setTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // Neutrale Erfolgsmeldung nach bestätigter E-Mail-Änderung (kommt über den
  // Navigations-State der öffentlichen Confirm-Seite; keine neue/alte E-Mail
  // wird vorausgefüllt).
  const [emailChanged, setEmailChanged] = useState(!!location.state?.emailChanged);
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
  const [regPasswordRepeat, setRegPasswordRepeat] = useState("");
  const [regErrors, setRegErrors] = useState({});

  // Navigations-State nach dem ersten Lesen entfernen, damit die Meldung nach
  // einem Reload nicht erneut erscheint (der lokale State-Wert bleibt erhalten).
  useEffect(() => {
    if (location.state?.emailChanged) {
      window.history.replaceState({}, "", location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset-Token-Prüfung: "failed" heißt Netzwerk-/Serverproblem — der Nutzer
  // bleibt auf dem Reset-Schritt und kann die Prüfung erneut anstoßen (vorher:
  // stiller Rückfall auf den Login ohne jede Meldung). Ein sicher unbrauchbarer
  // Link (ungültig/abgelaufen) führt mit ERKLÄRUNG zurück zum Login.
  const [resetCheckFailed, setResetCheckFailed] = useState(false);

  const checkResetToken = async (t) => {
    setResetCheckFailed(false); setError("");
    let r;
    try {
      r = await fetch(`${API}/auth/validate-reset-token/${t}`);
    } catch {
      setResetCheckFailed(true); setError(RESET_PRUEFUNG_NETZFEHLER);
      return;
    }
    const d = await readJson(r);
    if (!r.ok || d === null) {
      // 5xx / unlesbare Antwort: nicht als „Link ungültig" fehldeuten.
      setResetCheckFailed(true); setError(RESET_PRUEFUNG_NETZFEHLER);
      return;
    }
    const klass = classifyResetTokenCheck(d);
    if (klass.state === "unusable") { setStep("credentials"); setError(klass.message); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("reset");
    if (t) {
      setResetToken(t); setStep("reset");
      checkResetToken(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/login`, { method: "POST", headers: jsonH, body: JSON.stringify({ ...loginForm, rememberMe }) });
      const d = await readJson(r);
      if (!r.ok) { setError(mapLoginError(r.status, d)); setLoading(false); return; }
      if (!d?.token) { setError(LOGIN_SERVERFEHLER); setLoading(false); return; }
      localStorage.setItem("ce_token", d.token);
      // login() lädt /kundenbereich. Scheitert DAS, ist der Login nicht
      // „scheinbar erfolgreich": vorher wurde die Rückgabe ignoriert und die
      // Navigation endete kommentarlos wieder auf /login.
      const ok = await login(d.token);
      if (!ok) { setError(KUNDENBEREICH_NACH_LOGIN_FEHLER); setLoading(false); return; }
      navigate("/dashboard");
    } catch (e) { setError(mapAuthThrownError(e)); }
    setLoading(false);
  };

  const handleRegister = async () => {
    // Doppelklick-/Mehrfachversand-Schutz: der Button ist bereits über `loading`
    // deaktiviert, hier zusätzlich als Guard, falls das Formular per Enter kommt.
    if (loading) return;
    const errs = getRegErrors(regForm, regPasswordRepeat);
    if (Object.keys(errs).length > 0) { setRegErrors(errs); return; }
    setRegErrors({});
    setError(""); setLoading(true);
    try {
      // Pflichtfelder getrimmt senden — dieselben Feldnamen wie bisher (snake_case).
      const r = await fetch(`${API}/register`, {
        method: "POST",
        headers: jsonH,
        body: JSON.stringify(buildRegistrationPayload(regForm)),
      });
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        // Feldbezogene Backend-Fehler (z. B. fehlender Firmenname) werden am
        // betroffenen Eingabefeld angezeigt statt nur als Banner oben.
        const { fieldErrors, generalError } = mapApiRegistrationError(d);
        setRegErrors(fieldErrors);
        setError(generalError);
        setLoading(false);
        return;
      }
      setSuccess("Firmenkonto beantragt! Wir prüfen Ihre Angaben und melden uns nach der Freischaltung per E-Mail.");
      setTab("login");
    } catch (e) { setError(mapAuthThrownError(e)); }
    setLoading(false);
  };

  const handleForgot = async () => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/auth/forgot-password`, { method: "POST", headers: jsonH, body: JSON.stringify({ email: forgotEmail }) });
      const d = await readJson(r);
      // Nie wieder ein leerer Banner: jede Antwortform hat einen Text-Fallback.
      if (!r.ok) { setError(mapForgotError(r.status, d)); setLoading(false); return; }
      setSuccess(typeof d?.message === "string" && d.message ? d.message : FORGOT_NEUTRAL_ERFOLG);
    } catch (e) { setError(mapAuthThrownError(e)); }
    setLoading(false);
  };

  const handleReset = async () => {
    setError("");
    if (newPassword !== newPasswordConfirm) { setError("Passwörter stimmen nicht überein"); return; }
    if (newPassword.length < 8) { setError("Passwort muss mindestens 8 Zeichen haben"); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/reset-password`, { method: "POST", headers: jsonH, body: JSON.stringify({ token: resetToken, password: newPassword }) });
      const d = await readJson(r);
      // Passwortfelder bleiben bei jedem Fehler erhalten (State wird nicht
      // geleert) — bei „abgelaufen"/„ungültig" erklärt der Text den Weg über
      // „Passwort vergessen".
      if (!r.ok) { setError(mapResetError(r.status, d)); setLoading(false); return; }
      setSuccess("Passwort zurückgesetzt!");
      window.history.replaceState({}, "", "/login");
      setTimeout(() => { setStep("credentials"); setSuccess(""); }, 2000);
    } catch (e) { setError(mapAuthThrownError(e)); }
    setLoading(false);
  };

  const clearMessages = () => { setError(""); setSuccess(""); setEmailChanged(false); };

  const handleRegChange = (k, v) => {
    setRegForm(p => ({ ...p, [k]: v }));
    setRegErrors(p => {
      const n = { ...p };
      if (n[k]) delete n[k];
      if (k === "password") {
        if (regPasswordRepeat && regPasswordRepeat !== v) n.passwordRepeat = "Die Passwörter stimmen nicht überein.";
        else delete n.passwordRepeat;
      }
      return n;
    });
  };

  const handleRegPasswordRepeat = (v) => {
    setRegPasswordRepeat(v);
    setRegErrors(p => {
      const n = { ...p };
      if (v && v !== regForm.password) n.passwordRepeat = "Die Passwörter stimmen nicht überein.";
      else delete n.passwordRepeat;
      return n;
    });
  };

  const regValid = Object.keys(getRegErrors(regForm, regPasswordRepeat)).length === 0;

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
          <>
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
            {/* Netz-/Serverfehler bei der Link-Prüfung: Nutzer bleibt auf dem
                Reset-Schritt (kein stiller Rückfall zum Login) und kann die
                Prüfung bewusst wiederholen. */}
            {resetCheckFailed && (
              <button type="button" className="auth-btn-ghost" onClick={() => checkResetToken(resetToken)}>
                Link erneut prüfen
              </button>
            )}
          </>
        )}

        {step === "credentials" && (
          <>
            <div className="auth-hero">
              {/* Der einzige Markenanker der Seite. Bis hierher trug die
                  Anmeldung überhaupt kein Markenelement — die erste und vor dem
                  Login einzige Fläche, die ein Kunde sieht, war unmarkiert.
                  Reverse-Variante, weil der Grund nahezu schwarz ist; kein
                  Claim, kein zweites Signet, kein Wasserzeichen. Das Formular
                  darunter bleibt unverändert. */}
              <BrandLogo variant="wordmark" tone="reverse" className="auth-brand auth-anim" />
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

              {sessionExpired && (
                <div className="auth-alert auth-alert-info" role="status">
                  Ihre Sitzung ist abgelaufen oder Ihr Konto wurde deaktiviert. Bitte melden Sie sich erneut an.
                </div>
              )}
              {emailChanged && (
                <div className="auth-alert auth-alert-success" role="status">
                  E-Mail-Adresse geändert. Bitte melden Sie sich mit Ihrer neuen E-Mail-Adresse an.
                </div>
              )}
              {error   && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}
              {success && <div className="auth-alert auth-alert-success" role="status">{success}</div>}

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
                  onChange={handleRegChange}
                  onRegister={handleRegister}
                  loading={loading}
                  errors={regErrors}
                  regValid={regValid}
                  passwordRepeat={regPasswordRepeat}
                  onPasswordRepeatChange={handleRegPasswordRepeat}
                />
              )}
            </div>

            <TrustBar />
          </>
        )}

        <nav className="auth-legal" aria-label="Rechtliche Informationen">
          <Link to="/impressum"   target="_blank" rel="noopener noreferrer">Impressum</Link>
          <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</Link>
          <Link to="/agb"         target="_blank" rel="noopener noreferrer">AGB</Link>
          <Link to="/widerruf"    target="_blank" rel="noopener noreferrer">Widerruf</Link>
        </nav>

      </div>
    </div>
  );
}
