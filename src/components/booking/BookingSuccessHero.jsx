// Bestätigungskopf der Erfolgsseite — Variante A „Bestätigung mit Aktionskopf" (Betreiberentscheidung 2026-11-06,
// Phase 1, Canonical v2.117).
//
// Oben steht in einem Satz, dass gebucht ist, darunter die Fakten der Sendung, die Auftragsbestätigungsnummer mit
// Kopieren und direkt die EINE Aktion, die jetzt zählt — ein gefüllter Knopf, daneben höchstens eine Nebenaktion als
// Kontur, der Rest als Textlinks. Welche Aktion das ist, entscheidet bookingSuccessLabelPlan
// (utils/bookingSuccessActions.mjs) aus dem Labelstand des Servers; dieser Baustein führt sie nur aus, mit denselben
// Handlern wie die Dokumentliste (useBookingSuccessDocuments).
//
// Die Überschrift ist die einzige h1 der Seite (der Seitenkopf zeigt auf Schritt 3 nur die Werkzeugzeile). Nach der
// Buchung steht die Seite oben, und der Fokus liegt auf der Überschrift — kein Netzaufruf, keine Animation.
import { useEffect, useRef } from "react";
import { CopyableNumber } from "../ui/CopyableNumber";
import { Icon } from "../ui/Icon";
import { NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import { BOOKING_SUCCESS_TEXT, SUCCESS_ACTION } from "../../utils/bookingSuccessActions.mjs";
import { BOOKING_LABEL_TEXT, shippingDocumentLoadingLabel } from "../../utils/bookingShippingDocuments.mjs";
import { DEMO_TEXTE } from "../../demo/demoModus.mjs";

export function BookingSuccessHero({
  demo, facts, orderConfirmationNumber, plan, docs, documentsLabel,
  onShipments, onNewShipment, onDocuments, onShowDocumentList,
}) {
  const T = BOOKING_SUCCESS_TEXT;
  const A = SUCCESS_ACTION;
  const titelRef = useRef(null);

  useEffect(() => {
    // Der Buchungsknopf stand am Ende eines langen Blatts: die Bestätigung beginnt oben, sofort und ohne Fahrt.
    try { window.scrollTo(0, 0); } catch { /* ohne Fenster nichts zu tun */ }
    titelRef.current?.focus({ preventScroll: true });
  }, []);

  // Eine Aktion → ihr Knopf. Laden und Sperre kommen aus demselben Zustand wie in der Dokumentliste.
  const knopf = (aktion, klasse) => {
    if (!aktion) return null;
    const art = aktion.kind;
    let onClick = onShipments;
    let laedt = false;
    let gesperrt = false;
    let ladeText = "";
    if (art === A.DOCUMENT) {
      onClick = () => docs.handleDownloadShippingDocument(aktion.doc);
      laedt = docs.versandPfad === aktion.doc.downloadPath;
      gesperrt = docs.versandPfad !== "";
      ladeText = shippingDocumentLoadingLabel(aktion.doc);
    } else if (art === A.LABEL || art === A.RETRIEVE) {
      onClick = docs.handleDownloadLabel;
      laedt = docs.labelLoading;
      gesperrt = docs.labelLoading;
      ladeText = art === A.RETRIEVE ? BOOKING_LABEL_TEXT.retrieving : "Versandlabel wird geladen …";
    } else if (art === A.ORDER_CONFIRMATION) {
      onClick = docs.handleDownloadOrderConfirmation;
      laedt = docs.orderConfirmationLoading;
      gesperrt = docs.orderConfirmationLoading;
      ladeText = "Auftragsbestätigung wird geladen…";
    } else if (art === A.DOCUMENTS) {
      onClick = onShowDocumentList;
    }
    return (
      <button type="button" className={klasse} onClick={onClick} disabled={gesperrt}>
        {laedt
          ? <><span className={klasse.includes("btn-primary") ? "spinner" : "spinner spinner-dark"} /> {ladeText}</>
          : <>{(art === A.DOCUMENT || art === A.LABEL) && <Icon n="download" s={18} />}{aktion.text}</>}
      </button>
    );
  };

  const sendungenAlsKnopf = plan.primary?.kind === A.SHIPMENTS || plan.secondary?.kind === A.SHIPMENTS;

  return (
    <header className="bsx-kopf" aria-labelledby="bsx-titel">
      {demo ? (
        <span className="badge badge--info bsx-status">{DEMO_TEXTE.buchungMarke}</span>
      ) : (
        <p className="bsx-status bsx-status--gebucht" role="status">
          <span className="bsx-status-zeichen" aria-hidden="true"><Icon n="check" s={16} /></span>
          {T.status}
        </p>
      )}
      <h1 className="booking-success-title" id="bsx-titel" tabIndex={-1} ref={titelRef}>
        {demo ? DEMO_TEXTE.buchungTitel : T.title}
      </h1>
      {demo && <p className="alert alert-info bsx-demo-hinweis" role="note">{DEMO_TEXTE.buchungSimuliert}</p>}
      {facts.length > 0 && (
        <ul className="bsx-fakten" aria-label="Ihre Sendung">
          {facts.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      {/* Die Auftragsbestätigungsnummer (CE-AB…) ist die primäre sichtbare Vorgangsnummer. Fehlt sie, entfällt die
          Zeile — keine Ersatznummer, insbesondere nicht die interne Bestellnummer, die Provider-Ordernummer oder
          eine Datenbank-ID. */}
      {orderConfirmationNumber && (
        <div className="bsx-vorgang">
          <span className="bsx-vorgang-label">{NUMBER_LABELS.orderConfirmation}</span>
          <CopyableNumber value={orderConfirmationNumber} label={NUMBER_LABELS.orderConfirmation} size="md" />
        </div>
      )}
      <div className="bsx-aktionen">
        {knopf(plan.primary, "btn btn-primary bsx-hauptaktion")}
        {knopf(plan.secondary, "btn btn-outline bsx-nebenaktion")}
      </div>
      <div className="bsx-links">
        {!sendungenAlsKnopf && (
          <button type="button" className="bsx-link" onClick={onShipments}>{T.shipments}</button>
        )}
        <button type="button" className="bsx-link" onClick={onNewShipment}>{T.newShipment}</button>
        <button type="button" className="bsx-link" id="booking-success-documents-link" onClick={onDocuments}>
          {documentsLabel}
        </button>
      </div>
    </header>
  );
}
