import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthAurora } from "../components/auth/AuthAurora";
import { Icon } from "../components/ui/Icon";
import { useAuth } from "../context/AuthContext";
import { confirmEmailChange } from "../api/client";
import { classifyEmailChangeConfirm, isRetryableConfirmState, hasUsableToken } from "../utils/emailChangeView.mjs";

// Öffentliche Bestätigungsseite /confirm-email-change?token=… (ohne Login
// erreichbar, NICHT im Dashboard eingebettet — eigene Auth-/Reset-Ästhetik).
//
// Token-Sicherheit: Das Token wird EINMALIG beim Mount aus der URL gelesen, sofort
// aus der sichtbaren URL entfernt (history.replaceState) und nur im Komponenten-
// State gehalten — es wird nie gerendert, nie geloggt, nie in Storage geschrieben.
// Ein Ref-Once-Guard stellt sicher, dass auch unter React StrictMode GENAU EIN
// Confirm-POST erfolgt (der StrictMode-Doppelaufruf des Effekts teilt sich Ref +
// State derselben Instanz). Nach Erfolg: rein lokale Sitzungsbereinigung (kein
// Backendrequest), danach Weiterleitung zur Anmeldung.
export default function EmailChangeConfirmPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Token einmalig aus der URL übernehmen (bleibt erhalten, auch nachdem die URL
  // bereinigt wurde).
  const [token] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("token") || ""; } catch { return ""; }
  });

  const [state, setState] = useState("loading"); // loading | success | invalid | unavailable | error
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);

  const runConfirm = useCallback(async () => {
    setBusy(true);
    try {
      const r = await confirmEmailChange(token);
      let d = null; try { d = await r.json(); } catch { d = null; }
      const next = classifyEmailChangeConfirm({ ok: r.ok, status: r.status, code: d?.code });
      setState(next);
      if (next === "success") {
        // Bestehende JWTs sind serverseitig ungültig → lokal bereinigen (ce_token
        // entfernen, AuthContext-User leeren). Kein Backendrequest, keine
        // automatische Profilabfrage, keine automatische Anmeldung.
        logout();
      }
    } catch {
      setState("error"); // Netzwerkfehler → transient (Retry anbieten)
    }
    setBusy(false);
  }, [token, logout]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Token sofort aus der sichtbaren URL entfernen (nur noch im State).
    try { window.history.replaceState({}, document.title, window.location.pathname); } catch { /* noop */ }
    if (!hasUsableToken(token)) { setState("invalid"); return; }
    runConfirm();
  }, [runConfirm, token]);

  const goToLogin = () => navigate("/login", { state: { emailChanged: state === "success" } });

  const VIEW = {
    loading: {
      glyph: null,
      title: "E-Mail-Adresse wird bestätigt",
      desc: "Bitte warten Sie einen Moment.",
      role: "status",
    },
    success: {
      glyph: "✅",
      title: "E-Mail-Adresse erfolgreich geändert",
      desc: "Ihre E-Mail-Adresse wurde erfolgreich geändert. Bitte melden Sie sich mit Ihrer neuen E-Mail-Adresse erneut an.",
      role: "status",
    },
    invalid: {
      glyph: "⚠️",
      title: "Bestätigungslink nicht mehr gültig",
      desc: "Der Bestätigungslink ist ungültig oder abgelaufen. Bitte starten Sie die E-Mail-Änderung in Ihrem Profil erneut.",
      role: "alert",
    },
    unavailable: {
      glyph: "⚠️",
      title: "E-Mail-Adresse nicht mehr verfügbar",
      desc: "Diese E-Mail-Adresse kann nicht mehr verwendet werden. Bitte melden Sie sich mit Ihrer bisherigen E-Mail-Adresse an und starten Sie die Änderung erneut.",
      role: "alert",
    },
    error: {
      glyph: "⚠️",
      title: "Bestätigung fehlgeschlagen",
      desc: "Die E-Mail-Adresse konnte nicht bestätigt werden. Bitte versuchen Sie es erneut.",
      role: "alert",
    },
  };
  const view = VIEW[state] || VIEW.loading;
  const canRetry = isRetryableConfirmState(state);

  return (
    <div className="auth-page">
      <AuthAurora />
      <div className="auth-shell">
        <div className="auth-card email-change-confirm">
          <div className="auth-card-top">
            <div className="auth-card-icon email-change-confirm-icon" aria-hidden="true">
              {state === "loading"
                ? <span className="spinner email-change-confirm-spinner" />
                : <span>{view.glyph}</span>}
            </div>
            <h1 className="auth-card-title">{view.title}</h1>
            <p className="auth-card-desc" role={view.role}>{view.desc}</p>
          </div>

          {state !== "loading" && (
            <div className="email-change-confirm-actions">
              {canRetry && (
                <button type="button" className="auth-cta" onClick={runConfirm} disabled={busy}>
                  <span>{busy ? "Wird bestätigt…" : "Erneut versuchen"}</span>
                  {!busy && <span className="auth-cta-arrow"><Icon n="refresh" s={18} /></span>}
                </button>
              )}
              <button
                type="button"
                className={canRetry ? "email-change-confirm-secondary" : "auth-cta"}
                onClick={goToLogin}
              >
                <span>Zur Anmeldung</span>
                {!canRetry && <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>}
              </button>
            </div>
          )}
        </div>

        <nav className="auth-legal" aria-label="Rechtliche Informationen">
          <a href="/impressum" target="_blank" rel="noopener noreferrer">Impressum</a>
          <a href="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a>
          <a href="/agb" target="_blank" rel="noopener noreferrer">AGB</a>
          <a href="/widerruf" target="_blank" rel="noopener noreferrer">Widerruf</a>
        </nav>
      </div>
    </div>
  );
}
