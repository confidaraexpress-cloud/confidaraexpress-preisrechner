// Dokumentbereich des Buchungs-Erfolgsbildschirms: Label, Auftragsbestätigung,
// Lieferschein und Proforma-Rechnung — Zustände, Handler und Oberfläche wortgleich
// aus pages/BookingPage.jsx hierher gezogen (Systemmodularisierung Phase 3).
//
// Props: die Buchungsantwort (`booking`) und der vom Hook useProformaDocument
// aufgelöste Proforma-Eintrag (`proformaEntry`) — die Auflösung selbst (Poll,
// Budget, Fehlerfreiheit) bleibt bewusst in der Seite bzw. im Hook: dieser
// Baustein zeigt Belege an und lädt sie herunter, mehr nicht.
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { downloadLabel } from "../../utils/downloadLabel";
import { downloadDeliveryNote } from "../../utils/downloadDeliveryNote";
import { downloadOrderConfirmation } from "../../utils/downloadOrderConfirmation";
import { downloadProforma } from "../../utils/downloadProforma";
import { orderConfirmationNumberOf } from "../../utils/businessNumbers.mjs";
import {
  PROFORMA_VIEW, PROFORMA_TEXT, proformaViewState,
  proformaDownloadPath, proformaDownloadLabel,
} from "../../utils/proformaDocumentView.mjs";

export function BookingSuccessDocuments({ booking, proformaEntry }) {
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState("");
  // Eigener Zustand für den Lieferschein: ein fehlgeschlagener Lieferscheindownload
  // darf die Labelmeldung nicht überschreiben und umgekehrt.
  const [deliveryNoteLoading, setDeliveryNoteLoading] = useState(false);
  const [deliveryNoteError, setDeliveryNoteError] = useState("");
  const [orderConfirmationLoading, setOrderConfirmationLoading] = useState(false);
  const [orderConfirmationError, setOrderConfirmationError] = useState("");
  // Download-Zustand des Proforma-Belegs: nur der Downloadversuch des Kunden hat
  // einen sichtbaren Fehlerzustand — der Metadaten-Poll lebt im Hook
  // useProformaDocument und erzeugt bewusst keinen (Begründung dort).
  const [proformaLoading, setProformaLoading] = useState(false);
  const [proformaError, setProformaError] = useState("");

  const handleDownloadLabel = async () => {
    // Der Label-Abruf läuft über den ConfidaraExpress-Sendungshandle
    // (`ceShipmentId` aus der Buchungsantwort), nicht über die Providerreferenz
    // in `shipmentId` — das ist der Wert, den DIESER Client gesendet hat.
    if (!booking?.ceShipmentId) return;
    setLabelLoading(true); setLabelError("");
    try {
      await downloadLabel(booking.ceShipmentId, orderConfirmationNumberOf(booking));
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setLabelError(e.message); // globaler Auth-Redirect übernimmt sonst
    }
    setLabelLoading(false);
  };

  // Lieferschein — derselbe Weg wie das Label: Sendungshandle aus der Buchungsantwort,
  // Blob-Download, eigener Fehlerzustand. Der Knopf erscheint NUR, wenn die
  // Buchungsantwort tatsächlich einen Lieferschein meldet (`booking.deliveryNote`) —
  // nie anhand des Kontomodus geraten.
  const handleDownloadDeliveryNote = async () => {
    if (!booking?.ceShipmentId || !booking?.deliveryNote?.number) return;
    setDeliveryNoteLoading(true); setDeliveryNoteError("");
    try {
      await downloadDeliveryNote(booking.ceShipmentId, booking.deliveryNote.number);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setDeliveryNoteError(e.message);
    }
    setDeliveryNoteLoading(false);
  };

  // Auftragsbestätigung — derselbe Weg wie Label und Lieferschein: Sendungshandle aus
  // der Buchungsantwort, Blob-Download, eigener Fehlerzustand. Der Knopf erscheint NUR,
  // wenn die Buchungsantwort tatsächlich eine Auftragsbestätigung meldet
  // (`booking.orderConfirmation`) — nie unterstellt.
  const handleDownloadOrderConfirmation = async () => {
    const confirmationNumber = orderConfirmationNumberOf(booking);
    if (!booking?.ceShipmentId || !confirmationNumber) return;
    setOrderConfirmationLoading(true); setOrderConfirmationError("");
    try {
      await downloadOrderConfirmation(booking.ceShipmentId, confirmationNumber);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setOrderConfirmationError(e.message);
    }
    setOrderConfirmationLoading(false);
  };

  // Proforma-Rechnung — derselbe Weg wie die drei anderen Dokumente, mit EINEM
  // Unterschied: der Pfad wird nicht hier gebaut, sondern kommt aus der
  // Dokument-Metadaten-Antwort des Servers. Deshalb gibt es auch keine
  // Sichtbarkeitsbedingung aus Zolldaten — der Knopf existiert nur, wenn der
  // Server die Proforma als `ready` MIT Pfad meldet.
  const handleDownloadProforma = async () => {
    const pfad = proformaDownloadPath(proformaEntry);
    if (!pfad) return;
    setProformaLoading(true); setProformaError("");
    try {
      await downloadProforma(pfad);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setProformaError(e.message); // globaler Auth-Redirect übernimmt sonst
    }
    setProformaLoading(false);
  };

  return (
    <>
      {labelError && <div className="alert alert-error mb-16" role="alert">{labelError}</div>}
      {booking?.ceShipmentId && (
        <button className="btn btn-primary btn-full mb-16" onClick={handleDownloadLabel} disabled={labelLoading}>
          {labelLoading ? <><span className="spinner" /> Label wird geladen…</> : "Label herunterladen"}
        </button>
      )}
      {/* Auftragsbestätigung — erscheint NUR, wenn die Buchungsantwort tatsächlich
          eine gemeldet hat. Sie steht VOR dem Lieferschein: sie betrifft jede
          Buchung, der Lieferschein nur Konten mit Lagerbezug. Die Bestätigung
          kommt zusätzlich per E-Mail; der Knopf ist die Sofortkopie. */}
      {orderConfirmationError && <div className="alert alert-error mb-16" role="alert">{orderConfirmationError}</div>}
      {booking?.ceShipmentId && orderConfirmationNumberOf(booking) && (
        <button className="btn btn-outline btn-full mb-16" onClick={handleDownloadOrderConfirmation} disabled={orderConfirmationLoading}>
          {orderConfirmationLoading
            ? <><span className="spinner spinner-dark" /> Auftragsbestätigung wird geladen…</>
            : <>Auftragsbestätigung {orderConfirmationNumberOf(booking)} herunterladen</>}
        </button>
      )}
      {/* Lieferschein — erscheint NUR, wenn die Buchungsantwort tatsächlich einen
          gemeldet hat. Ohne Lieferschein bleibt hier keine leere Zeile stehen. */}
      {deliveryNoteError && <div className="alert alert-error mb-16" role="alert">{deliveryNoteError}</div>}
      {booking?.ceShipmentId && booking?.deliveryNote?.number && (
        <button className="btn btn-outline btn-full mb-16" onClick={handleDownloadDeliveryNote} disabled={deliveryNoteLoading}>
          {deliveryNoteLoading
            ? <><span className="spinner spinner-dark" /> Lieferschein wird geladen…</>
            : <>Lieferschein {booking.deliveryNote.number} herunterladen</>}
        </button>
      )}
      {/* Proforma-Rechnung — das Zollbegleitdokument einer Drittlandsendung.
          Ob es sie gibt, sagt AUSSCHLIESSLICH die Dokument-Metadaten-API; es wird
          weder aus dem Zielland noch aus dem Rechnungsmodus geschlossen. Ohne
          Proformazeile bleibt hier keine leere Zeile und kein Hinweis stehen.
          Sie steht nach den drei Versand-/Auftragsunterlagen, weil sie einen
          anderen Empfänger hat: die Zollbehörde.

          Der „nicht verfügbar"-Fall trägt bewusst KEIN Rot und keinen
          Wiederholen-Knopf: neben „Sendung erfolgreich gebucht!" liest sich eine
          rote Fläche wie ein Zweifel an der Buchung — und ein weiterer Anlauf
          des Kunden ändert am serverseitigen Zustand des Belegs nichts. */}
      {proformaError && <div className="alert alert-error mb-16" role="alert">{proformaError}</div>}
      {proformaViewState(proformaEntry) === PROFORMA_VIEW.READY && (
        <button className="btn btn-outline btn-full mb-16" onClick={handleDownloadProforma} disabled={proformaLoading}>
          {proformaLoading
            ? <><span className="spinner spinner-dark" /> {PROFORMA_TEXT.loading}</>
            : proformaDownloadLabel(proformaEntry)}
        </button>
      )}
      {proformaViewState(proformaEntry) === PROFORMA_VIEW.PROCESSING && (
        <div className="alert alert-info mb-16" role="status" aria-live="polite">
          <Icon n="info" s={16} />{PROFORMA_TEXT.processing}
        </div>
      )}
      {proformaViewState(proformaEntry) === PROFORMA_VIEW.FAILED && (
        <div className="alert alert-info mb-16" role="status">
          <Icon n="info" s={16} />{PROFORMA_TEXT.failed}
        </div>
      )}
    </>
  );
}
