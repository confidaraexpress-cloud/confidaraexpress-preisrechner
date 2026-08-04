import React, { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { createSupportRequest } from "../../api/supportApi";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_PLACEHOLDER,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_SUBJECT_MIN,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  SUPPORT_NETWORK_ERROR,
  mapSupportError,
  readTicketNumber,
  supportFormState,
  supportSuccessMessage,
} from "../../utils/supportRequest.mjs";

// Dialog für eine allgemeine Supportanfrage. Aufbau, Fokusmanagement, Escape/Backdrop
// (blockiert während `busy`) und Fokus-Restore folgen exakt dem bestehenden
// CancellationRequestDialog — bewusst dieselbe Dialogsprache, keine zweite Variante.
//
// Anders als dort liegt das Absenden HIER (der Aufrufer ist die Sidebar und soll keine
// API-Logik tragen). Nach Erfolg wechselt der Dialog in eine Bestätigungsansicht mit der
// Ticketnummer; er schließt sich NICHT automatisch, damit der Kunde die Nummer notieren
// kann. Bei korrigierbaren Fehlern bleibt die Eingabe vollständig erhalten.
export function SupportRequestDialog({ onClose, onCreated }) {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null); // { text } nach erfolgreicher Übermittlung

  const cardRef = useRef(null);
  const firstFieldRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  // Doppelklick-/Mehrfachabsende-Schutz, der NICHT von einem State-Update abhängt: drei
  // Klicks in einem Tick lesen alle denselben alten `busy`-Wert, ein Ref nicht.
  const inFlight = useRef(false);

  const uid = useId();
  const titleId = `sup-title-${uid}`;
  const descId = `sup-desc-${uid}`;
  const errorId = `sup-error-${uid}`;
  const catId = `sup-cat-${uid}`;
  const subjId = `sup-subj-${uid}`;
  const msgId = `sup-msg-${uid}`;
  const subjCounterId = `sup-subj-counter-${uid}`;
  const msgCounterId = `sup-msg-counter-${uid}`;

  const fs = supportFormState({ category, subject, message });
  const canSubmit = fs.canSubmit && !busy;

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab" && cardRef.current) {
        const f = cardRef.current.querySelectorAll(
          'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], input:not([disabled])'
        );
        if (f.length === 0) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, success]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await createSupportRequest({ category, subject, message });
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        // 401/403 behandelt apiFetch zentral (Logout/Redirect) — hier nichts anzeigen,
        // sonst blitzt eine Fehlermeldung auf, während die Seite bereits umleitet.
        if (r.status !== 401 && r.status !== 403) setError(mapSupportError(r.status, d));
        return;
      }
      // Die Ticketnummer kommt ausschließlich aus der Serverantwort.
      // Die Ticketnummer UND die Vorgangs-ID kommen ausschließlich aus der Serverantwort.
      const created = d && d.supportRequest ? d.supportRequest : null;
      const createdId = created && Number.isInteger(Number(created.id)) && Number(created.id) > 0
        ? Number(created.id) : null;
      setSuccess({ text: supportSuccessMessage(readTicketNumber(d)), id: createdId });
    } catch {
      setError(SUPPORT_NETWORK_ERROR);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="sup-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      {success ? (
        <div
          ref={cardRef}
          className="sup-dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="sup-dialog-icon sup-dialog-icon-ok" aria-hidden="true"><Icon n="check" s={20} /></div>
          <h2 id={titleId} className="sup-dialog-title">Anfrage übermittelt</h2>
          {/* role="status" statt "alert": eine Erfolgsmeldung ist keine Warnung. */}
          <p className="sup-dialog-success" role="status">{success.text}</p>
          <p className="sup-dialog-desc">
            Sie erhalten zusätzlich eine Bestätigung per E-Mail. Unsere Antwort finden Sie im
            Nachrichtenverlauf des Vorgangs unter „Supportanfragen" — wir benachrichtigen Sie
            über die Glocke, sobald sie vorliegt.
          </p>
          <div className="sup-dialog-actions">
            {onCreated && success.id ? (
              <>
                <button type="button" className="btn btn-outline" onClick={onClose}>Schließen</button>
                <button type="button" className="btn btn-primary" onClick={() => onCreated(success.id)}>
                  Vorgang öffnen
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onClose}>Schließen</button>
            )}
          </div>
        </div>
      ) : (
        <form
          ref={cardRef}
          className="sup-dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onSubmit={submit}
        >
          <div className="sup-dialog-icon" aria-hidden="true"><Icon n="mail" s={20} /></div>
          <h2 id={titleId} className="sup-dialog-title">Support kontaktieren</h2>
          <p id={descId} className="sup-dialog-desc">
            Beschreiben Sie uns kurz Ihr Anliegen. Wir melden uns zeitnah per E-Mail bei Ihnen.
          </p>

          <label className="sup-dialog-label" htmlFor={catId}>Kategorie</label>
          <select
            id={catId}
            ref={firstFieldRef}
            className="sup-dialog-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={busy}
            required
          >
            <option value="">{SUPPORT_CATEGORY_PLACEHOLDER}</option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <label className="sup-dialog-label" htmlFor={subjId}>Betreff</label>
          <input
            id={subjId}
            type="text"
            className="sup-dialog-input"
            maxLength={SUPPORT_SUBJECT_MAX}
            placeholder="Worum geht es?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy}
            aria-describedby={subjCounterId}
          />
          <div className="sup-dialog-meta">
            <span id={subjCounterId} className="sup-dialog-counter" aria-live="polite">
              {fs.subject.length} / {SUPPORT_SUBJECT_MAX}
            </span>
            {fs.subject.tooShort && (
              <span className="sup-dialog-min">Mindestens {SUPPORT_SUBJECT_MIN} Zeichen</span>
            )}
          </div>

          <label className="sup-dialog-label" htmlFor={msgId}>Ihre Nachricht</label>
          <textarea
            id={msgId}
            className="sup-dialog-textarea"
            rows={5}
            maxLength={SUPPORT_MESSAGE_MAX}
            placeholder="Bitte beschreiben Sie Ihr Anliegen."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
            aria-describedby={`${msgCounterId}${error ? ` ${errorId}` : ""}`}
            aria-invalid={error ? true : undefined}
          />
          <div className="sup-dialog-meta">
            <span id={msgCounterId} className="sup-dialog-counter" aria-live="polite">
              {fs.message.length} / {SUPPORT_MESSAGE_MAX}
            </span>
            {fs.message.tooShort && (
              <span className="sup-dialog-min">Mindestens {SUPPORT_MESSAGE_MIN} Zeichen</span>
            )}
          </div>

          {error && (
            <div id={errorId} className="sup-dialog-alert" role="alert">
              <Icon n="x" s={14} c="currentColor" /><span>{error}</span>
            </div>
          )}

          <div className="sup-dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={!canSubmit} aria-busy={busy || undefined}>
              {busy ? <><span className="spinner" /> Wird gesendet …</> : "Anfrage senden"}
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
