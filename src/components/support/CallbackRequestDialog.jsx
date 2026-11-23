import React, { useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "../ui/FormAlert";
import { useDialog } from "../../hooks/useDialog";
import { createCallbackRequest } from "../../api/supportApi";
import { newIdempotencyKey } from "../../utils/idempotencyKey.mjs";
import { SUPPORT_NETWORK_ERROR } from "../../utils/supportRequest.mjs";
import {
  CALLBACK_NAME_MAX, CALLBACK_PHONE_MAX, CALLBACK_REASON_MAX, CALLBACK_TEXT,
  callbackFieldErrors, callbackPrefill, callbackSuccessMessage, mapCallbackError,
} from "../../utils/callbackRequest.mjs";

/* „Rückruf anfragen“ (Startklar, Betreiberentscheidung 2026-11-23) — der Dialog der Ansprechpartnerkarte.

   Ein Rückrufwunsch ist ein regulärer Supportvorgang (Kategorie `callback`): er steht in der Adminliste, lässt sich
   dort öffnen, bearbeiten und erledigen, und der Kunde findet ihn unter „Supportanfragen“. Keine zweite
   Ticketstrecke. Das Konto bestimmt der Server aus der Sitzung.

   Dialogsprache wie die Supportanfrage (sup-dialog-*, patterns.css), Fokus und Tastatur über useDialog:
     • Name und Telefonnummer sind aus dem Konto vorausgefüllt — ein Vorschlag, beide änderbar.
     • Fehler stehen am Feld (aria-invalid + aria-describedby); der Fokus springt auf das erste fehlerhafte Feld.
     • Eine Primärschaltfläche. Während des Sendens sind Felder und Knöpfe gesperrt, Escape und ein Klick daneben
       schließen nicht; der Schutz hängt an einem Ref, nicht am State (drei Klicks in einem Tick senden einmal).
     • Ein Idempotenzschlüssel je Dialogsitzung: eine Wiederholung nach einem Netzwerkfehler legt keinen zweiten
       Vorgang an und löst keine zweite interne Meldung aus.
     • Erfolg zeigt die Vorgangsnummer aus der Serverantwort — keine Zusage einer Rückrufzeit.
     • Beim Schließen kehrt der Fokus auf „Rückruf anfragen“ in der Karte zurück; die Karte bleibt, wie sie war. */
export function CallbackRequestDialog({ user, onClose, returnFocusTo }) {
  const [vorschlag] = useState(() => callbackPrefill(user));
  const [name, setName] = useState(vorschlag.name);
  const [phone, setPhone] = useState(vorschlag.phone);
  const [reason, setReason] = useState("");
  const [fehler, setFehler] = useState({});
  const [allgemein, setAllgemein] = useState("");
  const [busy, setBusy] = useState(false);
  const [erfolg, setErfolg] = useState(null);
  const [fokusWunsch, setFokusWunsch] = useState(null);

  const [schluessel] = useState(() => newIdempotencyKey());
  const inFlight = useRef(false);
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const reasonRef = useRef(null);
  const absendenRef = useRef(null);
  const erfolgRef = useRef(null);

  // Escape und Klick daneben schließen nur, solange nichts unterwegs ist. closeOnEscape bleibt dafür konstant:
  // ein Wechsel ließe useDialog neu ansetzen und den Fokus kurz auf den Auslöser zurückgeben.
  const schliessenWennFrei = () => { if (!inFlight.current) onClose(); };
  const dialogRef = useDialog({ onClose: schliessenWennFrei, returnFocusTo });

  const uid = useId();
  const titleId = `cb-title-${uid}`;
  const descId = `cb-desc-${uid}`;
  const ids = {
    callbackName: `cb-name-${uid}`, callbackPhone: `cb-phone-${uid}`, message: `cb-reason-${uid}`,
  };
  const fehlerId = (feld) => `${ids[feld]}-error`;
  const zaehlerId = `cb-reason-counter-${uid}`;

  // Fokus nach einer Antwort erst, wenn Felder und Knöpfe wieder bedienbar sind (gesperrte Elemente nehmen keinen Fokus).
  useEffect(() => {
    if (!fokusWunsch || busy) return;
    const ziel = {
      callbackName: nameRef, callbackPhone: phoneRef, message: reasonRef, absenden: absendenRef, erfolg: erfolgRef,
    }[fokusWunsch];
    if (ziel && ziel.current) ziel.current.focus();
    setFokusWunsch(null);
  }, [fokusWunsch, busy]);

  const ersteFehlerstelle = (f) => ["callbackName", "callbackPhone", "message"].find((k) => f[k]) || null;

  const absenden = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setAllgemein("");
    const vorab = callbackFieldErrors({ name, phone, reason });
    if (Object.keys(vorab).length > 0) {
      setFehler(vorab);
      setFokusWunsch(ersteFehlerstelle(vorab));
      return;
    }
    setFehler({});
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createCallbackRequest({ name, phone, reason }, schluessel);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        // 401/403 behandelt apiFetch zentral (Abmeldung) — hier keine zweite Meldung.
        if (r.status === 401 || r.status === 403) return;
        const m = mapCallbackError(r.status, d);
        if (m.field) {
          setFehler({ [m.field]: m.text });
          setFokusWunsch(m.field);
        } else {
          setAllgemein(m.text);
          setFokusWunsch("absenden");
        }
        return;
      }
      setErfolg({ text: callbackSuccessMessage(d) });
      setFokusWunsch("erfolg");
    } catch {
      setAllgemein(SUPPORT_NETWORK_ERROR);
      setFokusWunsch("absenden");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Eine Korrektur nimmt den Fehler ihres Feldes zurück; die übrigen bleiben stehen.
  const aendern = (feld, setzen) => (e) => {
    setzen(e.target.value);
    if (fehler[feld]) setFehler((alt) => { const neu = { ...alt }; delete neu[feld]; return neu; });
  };
  const feldProps = (feld) => ({
    id: ids[feld],
    className: `field-input${feld === "message" ? " field-textarea sup-dialog-textarea sup-dialog-textarea--kurz" : ""}${fehler[feld] ? " field-input-error" : ""}`,
    "aria-invalid": fehler[feld] ? "true" : undefined,
    "aria-describedby": [fehler[feld] ? fehlerId(feld) : null, feld === "message" ? zaehlerId : null].filter(Boolean).join(" ") || undefined,
    disabled: busy,
  });
  const feldFehler = (feld) => (fehler[feld]
    ? <span className="field-error" id={fehlerId(feld)}>{fehler[feld]}</span>
    : null);

  return (
    <div
      className="sup-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) schliessenWennFrei(); }}
    >
      <div
        ref={dialogRef}
        className="sup-dialog-card sup-dialog-card--rueckruf"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={erfolg ? undefined : descId}
      >
        {erfolg ? (
          <>
            <h2 id={titleId} className="sup-dialog-title">{CALLBACK_TEXT.erfolgTitel}</h2>
            {/* Fokus auf die Bestätigung: der Screenreader liest die Vorgangsnummer sofort vor. */}
            <p ref={erfolgRef} tabIndex={-1} className="sup-dialog-success" role="status">{erfolg.text}</p>
            <p className="sup-dialog-desc">{CALLBACK_TEXT.erfolgHinweis}</p>
            <div className="sup-dialog-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>{CALLBACK_TEXT.schliessen}</button>
            </div>
          </>
        ) : (
          <form onSubmit={absenden} noValidate>
            <h2 id={titleId} className="sup-dialog-title">{CALLBACK_TEXT.titel}</h2>
            <p id={descId} className="sup-dialog-desc">{CALLBACK_TEXT.beschreibung}</p>

            <label className="field-label sup-dialog-label" htmlFor={ids.callbackName}>{CALLBACK_TEXT.name}</label>
            <input
              ref={nameRef}
              type="text"
              autoComplete="name"
              maxLength={CALLBACK_NAME_MAX}
              required
              value={name}
              onChange={aendern("callbackName", setName)}
              {...feldProps("callbackName")}
            />
            {feldFehler("callbackName")}

            <label className="field-label sup-dialog-label" htmlFor={ids.callbackPhone}>{CALLBACK_TEXT.telefon}</label>
            <input
              ref={phoneRef}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={CALLBACK_PHONE_MAX}
              required
              value={phone}
              onChange={aendern("callbackPhone", setPhone)}
              {...feldProps("callbackPhone")}
            />
            {feldFehler("callbackPhone")}

            <label className="field-label sup-dialog-label" htmlFor={ids.message}>
              {CALLBACK_TEXT.grund} <span className="sup-dialog-optional">{CALLBACK_TEXT.optional}</span>
            </label>
            <textarea
              ref={reasonRef}
              rows={3}
              maxLength={CALLBACK_REASON_MAX}
              placeholder={CALLBACK_TEXT.grundPlatzhalter}
              value={reason}
              onChange={aendern("message", setReason)}
              {...feldProps("message")}
            />
            <div className="sup-dialog-meta">
              {feldFehler("message") || <span />}
              {/* Kein aria-live: der Zähler gehört zur Feldbeschreibung und würde sonst jeden Tastendruck ansagen. */}
              <span id={zaehlerId} className="sup-dialog-counter">
                {reason.length} / {CALLBACK_REASON_MAX}
              </span>
            </div>

            {allgemein && (
              <div className="sup-dialog-error">
                <FormAlert tone="error" message={allgemein} />
              </div>
            )}

            <div className="sup-dialog-actions">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
                {CALLBACK_TEXT.abbrechen}
              </button>
              <button ref={absendenRef} type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>
                {busy ? <><span className="spinner" /> {CALLBACK_TEXT.sendet}</> : CALLBACK_TEXT.absenden}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
