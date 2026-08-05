import React, { useId } from "react";
import { useDialog } from "../../hooks/useDialog";
import { Icon } from "../ui/Icon";

// ─────────────────────────────────────────────────────────────────────────────
// Zentraler Bestätigungsdialog für mutierende Adminaktionen.
//
// Bündelt das Verhalten, das in den Kundenansichten bereits erprobt ist, und
// ersetzt die zuvor handgebauten Modale der Rechnungsansicht (Zahlung, Dokument,
// E-Mail), denen genau dieses Verhalten fehlte:
//
//   • Fokus beim Öffnen auf „Abbrechen" (nie auf der bestätigenden Aktion),
//   • Escape schließt — außer während eines laufenden Requests,
//   • Klick auf den Overlay-Hintergrund schließt (mousedown, damit ein im Dialog
//     begonnener Textselektions-Drag nicht versehentlich schließt),
//   • der Fokus kehrt beim Schließen zum auslösenden Element zurück,
//   • Doppelklickschutz: beide Buttons sind während des Requests gesperrt,
//   • eindeutige aria-labelledby/-describedby-IDs auch bei mehreren Dialogen
//     auf derselben Seite (useId).
//
// Der Dialog trifft KEINE fachliche Entscheidung — er bestätigt nur. Ob eine
// Aktion überhaupt erlaubt ist, entscheidet das Backend.
// ─────────────────────────────────────────────────────────────────────────────
export function ConfirmDialog({
  title,
  text,
  subline,           // z. B. „Rechnung CE-RE26-00001 · #42"
  note,              // ergänzender Hinweis (Auditierung o. Ä.)
  confirmLabel,
  cancelLabel = "Abbrechen",
  confirmIcon = "check",
  icon = "check",
  danger = false,
  busy = false,
  busyLabel = "Wird gespeichert…",
  onCancel,
  onConfirm,
}) {
  const uid = useId();
  const titleId = `adm-confirm-title-${uid}`;
  const descId = `adm-confirm-desc-${uid}`;

  // Fokusfalle, Fokusrückgabe und Escape kommen seit Paket A, Phase 3 aus dem
  // gemeinsamen Hook. `closeOnEscape: !busy` bewahrt die bestehende Regel:
  // während eines laufenden Requests schließt Escape nicht.
  const dialogRef = useDialog({ onClose: onCancel, closeOnEscape: !busy });

  return (
    <div
      className="adm-modal-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        className={`adm-modal${danger ? " adm-modal-danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        ref={dialogRef}
      >
        <div className={`adm-modal-icon ${danger ? "adm-modal-icon-danger" : "adm-modal-icon-approve"}`} aria-hidden="true">
          <Icon n={icon} s={22} />
        </div>
        <h2 id={titleId} className="adm-modal-title">{title}</h2>
        {subline && <p className="adm-modal-sub">{subline}</p>}
        <p id={descId} className="adm-modal-text">{text}</p>
        {note && <p className="adm-support-hint adm-modal-note">{note}</p>}
        <div className="adm-modal-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? "adm-btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy ? "true" : undefined}
          >
            {busy
              ? <><span className="spinner spinner-dark" /> {busyLabel}</>
              : <><Icon n={confirmIcon} s={14} /> {confirmLabel}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
