// Dokumentbereich des Buchungs-Erfolgsbildschirms: Label, Auftragsbestätigung,
// Lieferschein und Proforma-Rechnung — Zustände, Handler und Oberfläche wortgleich
// aus pages/BookingPage.jsx hierher gezogen (Systemmodularisierung Phase 3).
//
// Phase 1 (Variante A „Bestätigung mit Aktionskopf", Canonical v2.117): Die Handler stehen im Hook
// `useBookingSuccessDocuments` — der Kopf der Seite löst mit denselben Handlern die Hauptaktion aus, die Liste
// darunter jede einzelne Aktion. Die Liste zeigt je Dokument eine Zeile: Name, Stand, Aktion — statt gestapelter
// Knöpfe. Der allgemeine Labelhinweis entfällt (Thema 4); der Stand steht kurz an der Labelzeile.
//
// Premium-UX-Nachbesserung (Canonical v2.118): Jede Zeile trägt ein ruhiges Symbol ihrer Belegart, die Aktion ist ein
// nachrangiger Textknopf mit Downloadzeichen — die Liste macht jeden Beleg erreichbar, ohne der Hauptaktion oben einen
// zweiten gleichwertigen Knopf entgegenzustellen.
//
// Props: die Buchungsantwort (`booking`) und der vom Hook useProformaDocument
// aufgelöste Proforma-Eintrag (`proformaEntry`) — die Auflösung selbst (Poll,
// Budget, Fehlerfreiheit) bleibt bewusst in der Seite bzw. im Hook: dieser
// Baustein zeigt Belege an und lädt sie herunter, mehr nicht.
//
// TG-F5: meldet die Buchungsantwort Versandbelege (`booking.shippingDocuments`), bekommt
// jeder davon eine eigene Zeile — bei mehreren Paketen also jedes Etikett, nicht nur das
// erste. Ohne diese Angabe entscheidet seit P2-01 der vom Server genannte Labelstand
// (`booking.labelStatus`): ein Download nur, wenn das Label in ConfidaraExpress
// liegt, beim Versanddienstleister abrufbar ist (derselbe Klick lädt das PDF, v2.118) oder ein
// älterer Server gar keinen Stand nennt.
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { downloadLabel } from "../../utils/downloadLabel";
import { downloadDocument } from "../../utils/downloadDocument";
import { isLabelNotReady } from "../../utils/labelErrors.mjs";
import {
  bookingShippingDocuments, shippingDocumentFallbackFilename, shippingDocumentLoadingLabel,
  BOOKING_SHIPPING_DOCUMENTS_TEXT, bookingShippingPrintNotice,
} from "../../utils/bookingShippingDocuments.mjs";
import { BOOKING_SUCCESS_TEXT, SUCCESS_ACTION, ROW_TONE } from "../../utils/bookingSuccessActions.mjs";
import { downloadDeliveryNote } from "../../utils/downloadDeliveryNote";
import { downloadOrderConfirmation } from "../../utils/downloadOrderConfirmation";
import { downloadProforma } from "../../utils/downloadProforma";
import { orderConfirmationNumberOf } from "../../utils/businessNumbers.mjs";
import { packageLabelHintText } from "../../utils/packageLabelHint.mjs";
import {
  PROFORMA_VIEW, PROFORMA_TEXT, proformaViewState,
  proformaDownloadPath, proformaDownloadLabel,
} from "../../utils/proformaDocumentView.mjs";

// Zeilenstände der Begleitdokumente — kurz, ohne „wird erstellt"-Zusage für das Label.
export const SUCCESS_DOCUMENT_TEXT = Object.freeze({
  orderConfirmation: "Auftragsbestätigung",
  // In der Demo wird keine E-Mail versendet — dann steht nur „Bereit".
  orderConfirmationReady: "Bereit – kommt zusätzlich per E-Mail",
  deliveryNote: "Lieferschein",
  proforma: "Proforma-Rechnung",
  loading: "Wird geladen …",
});

export function useBookingSuccessDocuments(booking, proformaEntry) {
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState("");
  // Phase 1: Verlauf des Labelabrufs auf dieser Seite — „noch nicht bereit" ist ein Wartezustand (ruhig, nicht rot),
  // nach einem erfolgreichen Download steht die Labelzeile auf „Bereit".
  const [labelNotReady, setLabelNotReady] = useState(false);
  const [labelFetched, setLabelFetched] = useState(false);
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
  // TG-F5: die Versandbelege aus der Buchungsantwort — jedes Etikett und das Abholetikett mit
  // eigenem, servergelieferten Pfad. Es lädt immer nur einer; `versandPfad` ist der Pfad,
  // der gerade lädt. Ein Fehler steht an der Zeile seines Belegs.
  const [versandPfad, setVersandPfad] = useState("");
  const [versandFehler, setVersandFehler] = useState({});

  const handleDownloadLabel = async () => {
    // Der Label-Abruf läuft über den ConfidaraExpress-Sendungshandle
    // (`ceShipmentId` aus der Buchungsantwort), nicht über die Providerreferenz
    // in `shipmentId` — das ist der Wert, den DIESER Client gesendet hat.
    if (!booking?.ceShipmentId) return;
    setLabelLoading(true); setLabelError(""); setLabelNotReady(false);
    try {
      await downloadLabel(booking.ceShipmentId, orderConfirmationNumberOf(booking));
      setLabelFetched(true);
    } catch (e) {
      // 409 LABEL_NOT_READY: ruhiger Wartezustand an der Labelzeile. Netz-, Server- und Berechtigungsfehler bleiben
      // Fehler; 401/403 übernimmt der globale Auth-Redirect.
      if (isLabelNotReady(e)) setLabelNotReady(true);
      else if (e?.status !== 401 && e?.status !== 403) setLabelError(e.message);
    }
    setLabelLoading(false);
  };

  // Ein Versandbeleg — AUSSCHLIESSLICH über den Pfad aus der Buchungsantwort. Er wird hier
  // weder gebaut noch aus Art und Nummer rekonstruiert; `downloadDocument` prüft ihn zusätzlich
  // gegen fremde Hosts. Ein Fehler steht an der Zeile dieses Belegs.
  const handleDownloadShippingDocument = async (doc) => {
    if (!doc || versandPfad) return;
    setVersandPfad(doc.downloadPath);
    setVersandFehler((f) => { const n = { ...f }; delete n[doc.downloadPath]; return n; });
    try {
      await downloadDocument(doc.downloadPath, { fallbackFilename: shippingDocumentFallbackFilename(doc) });
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setVersandFehler((f) => ({ ...f, [doc.downloadPath]: e.message })); // globaler Auth-Redirect übernimmt sonst
    }
    setVersandPfad("");
  };

  // Lieferschein — derselbe Weg wie das Label: Sendungshandle aus der Buchungsantwort,
  // Blob-Download, eigener Fehlerzustand. Die Zeile erscheint NUR, wenn die
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
  // der Buchungsantwort, Blob-Download, eigener Fehlerzustand. Die Zeile erscheint NUR,
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
  // Sichtbarkeitsbedingung aus Zolldaten — die Zeile existiert nur, wenn der
  // Server die Proforma meldet.
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

  return {
    labelRun: { fetched: labelFetched, notReady: labelNotReady, error: labelError || null },
    labelLoading, versandPfad, versandFehler,
    orderConfirmationLoading, orderConfirmationError,
    deliveryNoteLoading, deliveryNoteError,
    proformaLoading, proformaError,
    handleDownloadLabel, handleDownloadShippingDocument, handleDownloadDeliveryNote,
    handleDownloadOrderConfirmation, handleDownloadProforma,
  };
}

// Eine Dokumentzeile: Symbol der Belegart, Name (mit Nummer), Stand, Aktion. Der Stand eines echten Fehlers ist rot
// und wird angesagt; Warten und Hinweise bleiben ruhig.
function DokumentZeile({ symbol, name, nummer, nummerLabel, status, tone, statusId, aktion }) {
  return (
    <li className={`bsx-dok bsx-dok--${tone}`}>
      <span className="bsx-dok-symbol" aria-hidden="true"><Icon n={symbol} s={20} /></span>
      <div className="bsx-dok-text">
        <span className="bsx-dok-name">
          {name}
          {nummer && !nummerLabel && <> <span className="ce-wert bsx-dok-nummer">{nummer}</span></>}
        </span>
        {nummer && nummerLabel && <span className="bsx-dok-ref">{nummerLabel} <span className="ce-wert">{nummer}</span></span>}
        <span className="bsx-dok-status" id={statusId} role={tone === ROW_TONE.ERROR ? "alert" : undefined}
              aria-live={tone === ROW_TONE.ERROR ? undefined : "polite"}>
          {status}
        </span>
      </div>
      {aktion && <div className="bsx-dok-aktion">{aktion}</div>}
    </li>
  );
}

// Die Aktion einer Zeile: ein ruhiger Textknopf mit Zeichen — „Herunterladen“ oder, nach einem fehlgeschlagenen
// Versuch, „Erneut versuchen“. Der zugängliche Name nennt den Beleg und beginnt mit dem sichtbaren Text.
const ladeKnopf = ({ text, ariaLabel, onClick, disabled, laedt, ladeText, fehlgeschlagen = false, beleg = "" }) => (
  <button type="button" className="bsx-dok-knopf" onClick={onClick} disabled={disabled}
          aria-label={laedt ? undefined : (fehlgeschlagen ? `${BOOKING_SUCCESS_TEXT.retry}: ${beleg}` : ariaLabel)}>
    {laedt
      ? <><span className="spinner spinner-dark" /> {ladeText}</>
      : <><Icon n={fehlgeschlagen ? "refresh" : "download"} s={18} />{fehlgeschlagen ? BOOKING_SUCCESS_TEXT.retry : text}</>}
  </button>
);

export function BookingSuccessDocuments({ booking, proformaEntry, plan, docs, demo = false }) {
  const T = BOOKING_SUCCESS_TEXT;
  const D = SUCCESS_DOCUMENT_TEXT;
  const versanddokumente = bookingShippingDocuments(booking);
  const druckhinweis = bookingShippingPrintNotice(booking);
  // Unterschiedliche Pakete (Canonical v2.79): welches Etikett auf welches Paket gehört — der Satz zum
  // Etikettenprofil, das der Server nennt. Ohne Hinweis kein Satz. Er steht direkt bei den Etiketten.
  const klebehinweis = packageLabelHintText(booking && booking.packageLabelHint);
  const abNummer = (booking?.ceShipmentId && orderConfirmationNumberOf(booking)) || null;
  const lieferschein = booking?.ceShipmentId && booking?.deliveryNote?.number ? booking.deliveryNote.number : null;
  const proforma = proformaViewState(proformaEntry);

  const zeilen = [];
  // Versandlabel: die Zeilen entscheidet bookingSuccessLabelPlan (utils/bookingSuccessActions.mjs) aus dem
  // Serverstand — hier wird kein Labelstand abgeleitet.
  for (const r of plan.rows) {
    const a = r.action;
    let aktion = null;
    let status = r.status;
    let tone = r.tone;
    if (a && a.kind === SUCCESS_ACTION.DOCUMENT) {
      const fehler = docs.versandFehler[a.doc.downloadPath];
      if (fehler) { status = fehler; tone = ROW_TONE.ERROR; }
      aktion = ladeKnopf({
        text: a.text, ariaLabel: a.ariaLabel, fehlgeschlagen: Boolean(fehler), beleg: a.doc.label,
        onClick: () => docs.handleDownloadShippingDocument(a.doc), disabled: docs.versandPfad !== "",
        laedt: docs.versandPfad === a.doc.downloadPath, ladeText: shippingDocumentLoadingLabel(a.doc),
      });
    } else if (a && a.kind === SUCCESS_ACTION.LABEL) {
      aktion = ladeKnopf({
        text: a.text, ariaLabel: a.ariaLabel, fehlgeschlagen: a.text === T.retry, beleg: r.name,
        onClick: docs.handleDownloadLabel, disabled: docs.labelLoading, laedt: docs.labelLoading, ladeText: D.loading,
      });
    }
    zeilen.push(
      <DokumentZeile key={r.key} symbol="printer" name={r.name} nummer={r.reference} nummerLabel={r.reference ? T.carrierReference : null}
        status={status} tone={tone} aktion={aktion}
        statusId={r.key === "label" && (!a || a.kind !== SUCCESS_ACTION.LABEL || tone !== ROW_TONE.READY) ? "booking-label-status" : undefined} />,
    );
  }

  // Auftragsbestätigung — NUR, wenn die Buchungsantwort tatsächlich eine gemeldet hat. Sie steht VOR dem
  // Lieferschein: sie betrifft jede Buchung, der Lieferschein nur Konten mit Lagerbezug.
  if (abNummer) {
    zeilen.push(
      <DokumentZeile key="ab" symbol="invoice" name={D.orderConfirmation} nummer={abNummer}
        status={docs.orderConfirmationError || (demo ? T.ready : D.orderConfirmationReady)}
        tone={docs.orderConfirmationError ? ROW_TONE.ERROR : ROW_TONE.READY}
        aktion={ladeKnopf({
          text: T.download, ariaLabel: `Auftragsbestätigung ${abNummer} herunterladen`,
          fehlgeschlagen: Boolean(docs.orderConfirmationError), beleg: `${D.orderConfirmation} ${abNummer}`,
          onClick: docs.handleDownloadOrderConfirmation, disabled: docs.orderConfirmationLoading,
          laedt: docs.orderConfirmationLoading, ladeText: "Auftragsbestätigung wird geladen…",
        })} />,
    );
  }
  // Lieferschein — NUR, wenn die Buchungsantwort tatsächlich einen gemeldet hat.
  if (lieferschein) {
    zeilen.push(
      <DokumentZeile key="ls" symbol="invoice" name={D.deliveryNote} nummer={lieferschein}
        status={docs.deliveryNoteError || T.ready} tone={docs.deliveryNoteError ? ROW_TONE.ERROR : ROW_TONE.READY}
        aktion={ladeKnopf({
          text: T.download, ariaLabel: `Lieferschein ${lieferschein} herunterladen`,
          fehlgeschlagen: Boolean(docs.deliveryNoteError), beleg: `${D.deliveryNote} ${lieferschein}`,
          onClick: docs.handleDownloadDeliveryNote, disabled: docs.deliveryNoteLoading,
          laedt: docs.deliveryNoteLoading, ladeText: "Lieferschein wird geladen…",
        })} />,
    );
  }
  // Proforma-Rechnung — das Zollbegleitdokument einer Drittlandsendung. Ob es sie gibt, sagt AUSSCHLIESSLICH die
  // Dokument-Metadaten-API. Der „nicht verfügbar"-Fall trägt bewusst KEIN Rot und keinen Wiederholen-Knopf: neben
  // „Sendung erfolgreich gebucht!" liest sich eine rote Fläche wie ein Zweifel an der Buchung.
  if (proforma === PROFORMA_VIEW.READY) {
    const nummer = typeof proformaEntry?.number === "string" && proformaEntry.number.trim() ? proformaEntry.number.trim() : null;
    zeilen.push(
      <DokumentZeile key="pf" symbol="invoice" name={D.proforma} nummer={nummer}
        status={docs.proformaError || T.ready} tone={docs.proformaError ? ROW_TONE.ERROR : ROW_TONE.READY}
        aktion={ladeKnopf({
          text: T.download, ariaLabel: proformaDownloadLabel(proformaEntry),
          fehlgeschlagen: Boolean(docs.proformaError), beleg: D.proforma,
          onClick: docs.handleDownloadProforma, disabled: docs.proformaLoading,
          laedt: docs.proformaLoading, ladeText: PROFORMA_TEXT.loading,
        })} />,
    );
  } else if (proforma === PROFORMA_VIEW.PROCESSING) {
    zeilen.push(<DokumentZeile key="pf" symbol="invoice" name={D.proforma} tone={ROW_TONE.WAIT} status={PROFORMA_TEXT.processing} />);
  } else if (proforma === PROFORMA_VIEW.FAILED) {
    zeilen.push(<DokumentZeile key="pf" symbol="invoice" name={D.proforma} tone={ROW_TONE.INFO} status={PROFORMA_TEXT.failed} />);
  }

  if (zeilen.length === 0) return null;
  return (
    <>
      <ul className="bsx-dokliste">{zeilen}</ul>
      {/* Der Druckhinweis des Servers zu mehrseitigen Belegen — wörtlich vom Server, nicht an der Zahl der Belege
          entschieden. Danach der Klebehinweis (welches Etikett auf welches Paket) und bei mehreren Belegen, wo der
          Kunde sie dauerhaft wiederfindet. */}
      {druckhinweis && (
        <p className="bsx-dok-notiz">{druckhinweis}</p>
      )}
      {klebehinweis && plan.rows.length > 0 && <p className="bsx-dok-notiz booking-label-hint" id="booking-label-hint">{klebehinweis}</p>}
      {versanddokumente.length > 1 && (
        <p className="bsx-dok-notiz">{BOOKING_SHIPPING_DOCUMENTS_TEXT.whereToFind}</p>
      )}
    </>
  );
}
