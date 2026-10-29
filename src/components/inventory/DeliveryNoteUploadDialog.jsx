import React, { useEffect, useId, useRef, useState } from "react";
import { InventoryDialog } from "./InventoryShared";
import { Werte } from "../ui/Werte";
import { uploadDeliveryNote } from "../../api/deliveryNotesApi";
import {
  UPLOAD_LIMITS, DELIVERY_NOTE_TEXT, checkPdfFile, deliveryNoteErrorText, formatBytes, recipientText, effectiveView,
} from "../../utils/deliveryNoteView.mjs";

/* ── Eigenen Lieferschein hochladen ──────────────────────────────────────────
   Für JEDE eigene gebuchte Sendung, auch ohne Artikel aus dem Lager (Betreiber-
   entscheidung H1 = B). Ablauf: Sendung steht fest → PDF wählen → im Browser kurz
   vorprüfen (Typ, Größe) → optional ansehen → optionale Nummer → hochladen. Was
   sicher ist, entscheidet der Server (Struktur, aktive Inhalte, Verschlüsselung);
   seine Antwort erscheint hier als verständlicher Satz.

   Gespeichert wird nie die Datei selbst, sondern eine bereinigte Fassung (Neuaufbau
   ohne Links, Formularfunktionen und eingebettete Inhalte) — der Hinweis am Dateifeld
   sagt das vor dem Hochladen.

   Ersetzen ist dasselbe: ein neuer Upload wird eine neue Fassung, die bisherige
   bleibt im Verlauf. Der Dateiname wird nie gesendet, um ihn zu speichern — der
   Server vergibt den Namen beim Herunterladen selbst. */
export function DeliveryNoteUploadDialog({ open, row, limits, onClose, onUploaded }) {
  const maxBytes = (limits && limits.maxBytes) || UPLOAD_LIMITS.maxBytes;
  const maxLen = (limits && limits.numberMaxLength) || UPLOAD_LIMITS.numberMaxLength;
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef(null);
  const ids = useId();

  // Beim Öffnen frisch beginnen; die eigene Nummer der Buchung ist der naheliegende Vorschlag.
  useEffect(() => {
    if (!open) return;
    setFile(null); setFileError(""); setError(""); setBusy(false);
    setNumber((row && row.externalDeliveryNoteNumber) || "");
  }, [open, row]);

  // Die lokale Vorschau ist eine kurzlebige Blob-Adresse der gewählten Datei — nie eine Serveradresse.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => { if (!open) setPreviewUrl(null); }, [open]);

  if (!row) return null;
  const eff = effectiveView(row.effective);
  const empf = recipientText(row.recipient);
  const ersetzt = eff.kind === "upload" || eff.kind === "template";

  const waehle = (e) => {
    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setError(""); setPreviewUrl(null);
    const fehler = checkPdfFile(f, { maxBytes });
    setFile(fehler ? null : f);
    setFileError(fehler || "");
  };

  const absenden = async (e) => {
    e.preventDefault();
    if (!file || busy) return;
    if (number.trim().length > maxLen) { setError(deliveryNoteErrorText({ code: "DELIVERY_NOTE_NUMBER_INVALID" })); return; }
    setBusy(true); setError("");
    try {
      const res = await uploadDeliveryNote(row.shipmentId, file, number.trim() === "" ? undefined : number.trim());
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(deliveryNoteErrorText(body, "Der Lieferschein konnte nicht hochgeladen werden.")); return; }
      onUploaded && onUploaded(body || {});
    } catch {
      setError("Der Lieferschein konnte nicht hochgeladen werden. Bitte prüfen Sie Ihre Verbindung.");
    } finally {
      setBusy(false);
    }
  };

  const titel = ersetzt ? "Eigenen Lieferschein ersetzen" : "Eigenen Lieferschein hochladen";
  return (
    <InventoryDialog
      open={open}
      onClose={onClose}
      title={titel}
      size="lg"
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button type="submit" form={`${ids}-form`} className="btn btn-primary" disabled={!file || busy}>
            {busy ? "Wird hochgeladen …" : "Hochladen und verwenden"}
          </button>
        </>
      )}
    >
      <form id={`${ids}-form`} className="dn-upload" onSubmit={absenden} noValidate>
        <dl className="dn-ziel">
          <div><dt>Sendung</dt><dd><Werte>{row.orderConfirmationNumber || "—"}</Werte></dd></div>
          {row.orderNumber && <div><dt>Auftrag</dt><dd><Werte>{row.orderNumber}</Werte></dd></div>}
          <div><dt>Empfänger</dt><dd>{empf.name}{empf.place ? `, ${empf.place}` : ""}</dd></div>
          <div><dt>Bisher</dt><dd>{eff.label}{eff.number ? <> <Werte>{eff.number}</Werte></> : null}</dd></div>
        </dl>

        <div className="dn-feld">
          <span className="field-label" id={`${ids}-file-label`}>PDF-Datei</span>
          {/* Wie Artikelimport und Firmenlogo: das native Dateifeld bleibt unsichtbar, ein Knopf löst es aus. */}
          <input ref={inputRef} id={`${ids}-file`} className="sr-only" type="file" accept="application/pdf,.pdf"
                 onChange={waehle} disabled={busy} tabIndex={-1} aria-hidden="true" />
          <div className="dn-datei-wahl">
            <button type="button" className="btn btn-outline" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}
                    aria-labelledby={`${ids}-file-label ${ids}-file-button`} id={`${ids}-file-button`}
                    aria-describedby={`${ids}-file-hint`}>
              {file ? "Andere Datei auswählen" : "Datei auswählen"}
            </button>
          </div>
          <p className="field-hint" id={`${ids}-file-hint`}>
            Ein fertiger Lieferschein aus Ihrem System, höchstens {formatBytes(maxBytes)} und {(limits && limits.maxPages) || UPLOAD_LIMITS.maxPages} Seiten.
            {" "}{DELIVERY_NOTE_TEXT.uploadCleanHint}
          </p>
          {fileError && <p className="field-error" role="alert">{fileError}</p>}
          {file && (
            <div className="dn-datei-info">
              <span className="dn-datei-name"><Werte>{file.name}</Werte></span>
              <span className="dn-datei-groesse">{formatBytes(file.size)}</span>
              <button type="button" className="btn btn-link btn-sm" onClick={() => setPreviewUrl(previewUrl ? null : URL.createObjectURL(file))}>
                {previewUrl ? "Ansicht schließen" : "Datei ansehen"}
              </button>
            </div>
          )}
          {previewUrl && <iframe className="dn-datei-vorschau" src={previewUrl} title={`Ansicht: ${file ? file.name : "PDF"}`} />}
        </div>

        <div className="dn-feld">
          <label className="field-label" htmlFor={`${ids}-nummer`}>Lieferscheinnummer (optional)</label>
          <input id={`${ids}-nummer`} className="field-input dn-nummer" type="text" value={number} maxLength={maxLen}
                 onChange={(e) => setNumber(e.target.value)} disabled={busy} autoComplete="off" aria-describedby={`${ids}-nummer-hint`} />
          <p className="field-hint" id={`${ids}-nummer-hint`}>Die Nummer aus Ihrem System. Sie erscheint in der Übersicht und im Dateinamen.</p>
        </div>

        <p className="dn-hinweis">{DELIVERY_NOTE_TEXT.uploadHint}</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </form>
    </InventoryDialog>
  );
}
