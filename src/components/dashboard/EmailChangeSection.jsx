import React, { useState } from "react";
import { Icon } from "../ui/Icon";
import { useAuth } from "../../context/AuthContext";
import { startEmailChange, resendEmailChange, cancelEmailChange, triggerAuthError } from "../../api/client";
import { dtDE } from "../../utils/formatters";
import {
  mapEmailChangeStartError, mapEmailChangeResendError,
  EMAIL_CHANGE_START_GENERIC, EMAIL_CHANGE_RATE_LIMIT, EMAIL_CHANGE_RESEND_GENERIC, EMAIL_CHANGE_CANCEL_GENERIC,
  isSessionExpiredBody, isResendRequestGone,
} from "../../utils/emailChangeView.mjs";
import { EmailChangeDialog } from "./EmailChangeDialog";
import { EmailChangeCancelDialog } from "./EmailChangeCancelDialog";

// Sicherheits-Teilbereich „Login-E-Mail ändern" — vollständig getrennt von der
// Passwortänderung (eigener State, eigene Busy-/Fehler-/Erfolgstexte). Zeigt
// entweder die Aktion „E-Mail-Adresse ändern" (Startdialog) oder — wenn eine
// Änderung aussteht (user.pendingEmailChange aus /kundenbereich) — den Pending-
// Statusblock mit „erneut senden" und „abbrechen". Serverwahrheit ist maßgeblich:
// nach jeder Aktion wird optimistisch die Response übernommen und danach
// /kundenbereich kontrolliert nachgeladen (refreshUser). Kein LocalStorage.
export function EmailChangeSection({ user }) {
  const { updateUser, refreshUser } = useAuth();
  const currentEmail = user?.email || "";
  const pending = user?.pendingEmailChange || null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");

  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState("success"); // "success" | "warn"

  const showNotice = (msg, kind = "success") => { setNotice(msg); setNoticeKind(kind); };

  const openDialog = () => { setStartError(""); setNotice(""); setDialogOpen(true); };
  const closeDialog = () => { if (!starting) setDialogOpen(false); };

  // ── Start ──────────────────────────────────────────────────────────────────
  const handleStart = async (newEmail, currentPassword) => {
    if (starting) return;
    setStarting(true); setStartError("");
    try {
      const r = await startEmailChange(newEmail, currentPassword);
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (r.ok) {
        // Erfolg: Pending übernehmen, Dialog schließen (Passwort verlässt damit
        // den Speicher), Erfolgs-/Warnhinweis anzeigen, danach Serverwahrheit
        // nachladen.
        if (d?.pending) updateUser({ pendingEmailChange: d.pending });
        setDialogOpen(false);
        if (d?.mailSent === false) {
          showNotice("Die Änderung wurde gespeichert, aber die Bestätigungs-E-Mail konnte nicht versendet werden. Bitte sende sie erneut.", "warn");
        } else {
          showNotice("Wir haben eine Bestätigungs-E-Mail an die neue Adresse gesendet.", "success");
        }
        refreshUser();
      } else if (r.status === 401) {
        // Fachlicher 401 (falsches Passwort) darf NICHT ausloggen; nur der echte
        // Session-Sentinel-Body löst den globalen Logout aus.
        if (isSessionExpiredBody(d)) { triggerAuthError(); return; }
        setStartError(mapEmailChangeStartError(d?.code || "CURRENT_PASSWORD_INVALID"));
      } else if (r.status === 429) {
        setStartError(EMAIL_CHANGE_RATE_LIMIT);
      } else {
        setStartError(mapEmailChangeStartError(d?.code));
      }
    } catch {
      setStartError(EMAIL_CHANGE_START_GENERIC);
    }
    setStarting(false);
  };

  // ── Resend ─────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resending || cancelling) return;
    setResending(true); setResendError(""); setNotice("");
    try {
      const r = await resendEmailChange();
      if (r.status === 401 || r.status === 403) { setResending(false); return; } // globaler Logout via apiFetch
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (r.ok) {
        const p = d?.pending || d;
        if (p && (p.expiresAt || p.lastSentAt)) {
          updateUser({ pendingEmailChange: {
            ...(pending || {}),
            ...(p.newEmail ? { newEmail: p.newEmail } : {}),
            expiresAt: p.expiresAt ?? pending?.expiresAt ?? null,
            lastSentAt: p.lastSentAt ?? pending?.lastSentAt ?? null,
          } });
        }
        showNotice("Die Bestätigungs-E-Mail wurde erneut gesendet.", "success");
        refreshUser();
      } else if (r.status === 429) {
        setResendError(EMAIL_CHANGE_RATE_LIMIT);
      } else {
        const code = d?.code;
        setResendError(mapEmailChangeResendError(code));
        if (isResendRequestGone(code)) refreshUser(); // Pending existiert nicht mehr → reconcilen
      }
    } catch {
      setResendError(EMAIL_CHANGE_RESEND_GENERIC);
    }
    setResending(false);
  };

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const openCancel = () => { if (resending || cancelling) return; setCancelError(""); setCancelOpen(true); };
  const closeCancel = () => { if (!cancelling) setCancelOpen(false); };

  const handleCancelConfirm = async () => {
    if (cancelling) return;
    setCancelling(true); setCancelError("");
    try {
      const r = await cancelEmailChange();
      if (r.status === 401 || r.status === 403) { setCancelling(false); return; }
      // 404 = nichts (mehr) abzubrechen → faktisch der Zielzustand.
      if (r.ok || r.status === 404) {
        updateUser({ pendingEmailChange: null });
        setCancelOpen(false);
        showNotice("Die ausstehende E-Mail-Änderung wurde abgebrochen.", "success");
        refreshUser();
      } else {
        setCancelError(EMAIL_CHANGE_CANCEL_GENERIC);
      }
    } catch {
      setCancelError(EMAIL_CHANGE_CANCEL_GENERIC);
    }
    setCancelling(false);
  };

  return (
    <div className="email-change-section">
      {notice && (
        <div className={`alert ${noticeKind === "warn" ? "alert-error" : "alert-success"} email-change-notice`} role="status">
          <Icon n={noticeKind === "warn" ? "info" : "check"} s={16} /><span>{notice}</span>
        </div>
      )}

      {pending ? (
        <div className="email-change-pending">
          <div className="email-change-pending-head">
            <Icon n="clock" s={16} />
            <span>Neue E-Mail-Adresse wartet auf Bestätigung</span>
          </div>
          <div className="email-change-pending-email">{pending.newEmail}</div>
          <p className="email-change-pending-hint">Die bisherige Login-E-Mail bleibt bis zur Bestätigung aktiv.</p>
          {pending.expiresAt && (
            <p className="email-change-pending-meta">Bestätigungslink gültig bis: {dtDE(pending.expiresAt)}</p>
          )}
          {resendError && (
            <div className="alert alert-error email-change-notice" role="alert">
              <Icon n="x" s={16} /><span>{resendError}</span>
            </div>
          )}
          <div className="email-change-pending-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={handleResend} disabled={resending || cancelling}>
              {resending ? <><span className="spinner spinner-dark" /> Wird gesendet …</> : "Bestätigungs-E-Mail erneut senden"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm email-change-cancel-link" onClick={openCancel} disabled={resending || cancelling}>
              Änderung abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="email-change-actions">
          <button type="button" className="btn btn-outline email-change-trigger" onClick={openDialog}>
            <Icon n="mail" s={14} /> E-Mail-Adresse ändern
          </button>
        </div>
      )}

      {dialogOpen && (
        <EmailChangeDialog
          currentEmail={currentEmail}
          busy={starting}
          error={startError}
          onSubmit={handleStart}
          onClose={closeDialog}
        />
      )}
      <EmailChangeCancelDialog
        open={cancelOpen}
        busy={cancelling}
        error={cancelError}
        onConfirm={handleCancelConfirm}
        onClose={closeCancel}
      />
    </div>
  );
}
