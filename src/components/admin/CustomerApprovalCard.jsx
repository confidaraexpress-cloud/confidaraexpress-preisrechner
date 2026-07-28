import React, { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";
import {
  MARKUP_TEXTS,
  approvalGateExplanation,
  confirmedMarkupLine,
} from "../../utils/customerMarkup.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Freischaltung / Reaktivierung in der Admin-Kundendetailansicht.
//
// Verbindet die bestehende Statusänderung (PATCH /admin/users/:id/status, ein
// eigener Request) mit dem Bestätigungsstatus des Kundenaufschlags: Solange das
// Frontend sicher weiß, dass noch keine Bestätigung vorliegt, wird KEINE
// Freischaltungsanfrage gesendet — stattdessen erklärt die Oberfläche, was fehlt,
// und springt auf Wunsch direkt in die Aufschlagssektion.
//
// Der Button wird dabei nie kommentarlos ausgeblendet: er bleibt sichtbar (und
// deaktiviert), der Grund steht daneben. Das serverseitige Gate bleibt in jedem
// Fall die verbindliche Instanz — auch bei paralleler Änderung (409).
// ─────────────────────────────────────────────────────────────────────────────

function ApprovalDialog({ title, targetLabel, markupLine, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="adm-modal-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        className="adm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-approve-title"
        aria-describedby="adm-approve-desc"
      >
        <div className="adm-modal-icon adm-modal-icon-approve" aria-hidden="true"><Icon n="check" s={22} /></div>
        <h2 id="adm-approve-title" className="adm-modal-title">{title}</h2>
        <p className="adm-modal-sub">{targetLabel}</p>
        <p id="adm-approve-desc" className="adm-modal-text">
          Dieser Kunde erhält Zugriff auf ConfidaraExpress. Die Aktion wird protokolliert.
        </p>
        {/* Der bestätigte Aufschlag ist im Dialog noch einmal sichtbar. */}
        {markupLine && (
          <p className="adm-approve-markup"><Icon n="euro" s={15} /> {markupLine}</p>
        )}
        <div className="adm-modal-actions">
          <button type="button" ref={cancelRef} className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy ? "true" : undefined}
          >
            {busy
              ? <><span className="spinner spinner-dark" /> Wird gespeichert…</>
              : <><Icon n="check" s={14} /> Freischalten bestätigen</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomerApprovalCard({
  gate,
  pricing,
  targetLabel,
  busy = false,
  message = null,          // { type, text }
  dialogOpen = false,
  onOpenDialog,
  onCloseDialog,
  onConfirm,
  onJumpToMarkup,
}) {
  const g = gate || {};
  const explanation = approvalGateExplanation(g);
  const reactivation = !!g.reactivation;
  const title = reactivation ? "Kunde reaktivieren" : "Kunde freischalten";
  const cta = reactivation ? "Kunde reaktivieren" : "Kunde freischalten";
  const markupLine = confirmedMarkupLine(pricing);
  // Anonymisierte Konten haben im UI keine Statusaktion (wie in der Kundenliste).
  if (g.reason === "anonymized") return null;

  const alreadyApproved = g.reason === "already_approved";

  return (
    <div className="adm-card adm-approve-card">
      <div className="adm-card-head"><Icon n="shieldCheck" s={17} /> Freischaltung</div>
      <div className="adm-card-body">
        {message && (
          <div
            className={`alert ${message.type === "success" ? "alert-success" : message.type === "info" ? "alert-info" : "alert-error"}`}
            role={message.type === "error" ? "alert" : "status"}
          >
            <Icon n={message.type === "error" ? "x" : message.type === "info" ? "info" : "check"} s={16} />{message.text}
          </div>
        )}

        <div className="adm-danger-item">
          <div className="adm-danger-item-text">
            <div className="adm-danger-item-title">{title}</div>
            <p className="adm-danger-item-desc">
              {alreadyApproved
                ? "Dieser Kunde ist freigeschaltet und kann ConfidaraExpress uneingeschränkt nutzen."
                : reactivation
                  ? "Der Kunde ist derzeit gesperrt. Mit der Reaktivierung erhält er wieder Zugriff auf ConfidaraExpress."
                  : "Mit der Freischaltung erhält der Kunde Zugriff auf ConfidaraExpress."}
            </p>
            {reactivation && (
              <p className="adm-danger-item-desc adm-approve-reactivation">
                <Icon n="info" s={14} /> {MARKUP_TEXTS.reactivationRequired}
              </p>
            )}
            <p className="adm-support-hint" style={{ marginTop: 6 }}>Statusänderungen werden protokolliert.</p>
          </div>
          <div className="adm-danger-item-action">
            {!alreadyApproved && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenDialog}
                disabled={busy || !g.allowed}
                aria-describedby={!g.allowed ? "adm-approve-gate" : undefined}
              >
                <Icon n="check" s={13} /> {cta}
              </button>
            )}
          </div>
        </div>

        {/* Gate-Erklärung: was fehlt und was als Nächstes zu tun ist. Der Button
            bleibt sichtbar — der Grund steht unmittelbar daneben. */}
        {!g.allowed && !alreadyApproved && explanation.title && (
          <div className="adm-b2b-warn adm-approve-gate" id="adm-approve-gate" role="status">
            <Icon n="shield" s={16} />
            <span>
              <strong>{explanation.title}</strong>
              <span className="adm-b2b-warn-text">{explanation.text}</span>
              {explanation.cta && typeof onJumpToMarkup === "function" && (
                <button type="button" className="btn btn-outline btn-sm adm-approve-jump" onClick={onJumpToMarkup}>
                  <Icon n="arrowRight" s={13} /> {explanation.cta}
                </button>
              )}
            </span>
          </div>
        )}

        {/* Bestätigter Aufschlag auch außerhalb des Dialogs sichtbar. */}
        {markupLine && !alreadyApproved && (
          <p className="adm-approve-markup adm-approve-markup-inline">
            <Icon n="euro" s={15} /> {markupLine}
          </p>
        )}
      </div>

      {dialogOpen && (
        <ApprovalDialog
          title={title}
          targetLabel={targetLabel}
          markupLine={markupLine}
          busy={busy}
          onCancel={onCloseDialog}
          onConfirm={onConfirm}
        />
      )}
    </div>
  );
}

export default CustomerApprovalCard;
