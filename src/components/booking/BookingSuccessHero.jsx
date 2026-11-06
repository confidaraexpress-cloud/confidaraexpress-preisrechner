// Bestätigungskopf der Erfolgsseite (Phase 1, Canonical v2.117; neu geordnet mit der Premium-UX-Nachbesserung,
// Betreiberentscheidung 2026-11-06, Canonical v2.118).
//
// Oben beantwortet die Seite die erste Frage — war die Buchung erfolgreich? —, direkt darunter die zweite: was ist jetzt
// zu tun? Ein ruhiges Erfolgszeichen, die einzige h1 „Sendung erfolgreich gebucht!“, die Sendung in drei Fakten
// (Carrier und Service, Strecke, Übergabe), die Auftragsbestätigungsnummer mit Kopieren und genau EIN gefüllter Knopf.
// Welche Aktion das ist, entscheidet bookingSuccessLabelPlan (utils/bookingSuccessActions.mjs) aus dem Labelstand des
// Servers; dieser Baustein führt sie nur aus, mit denselben Handlern wie die Dokumentliste
// (useBookingSuccessDocuments). Weitere Wege („Zu meinen Sendungen“, „Neue Sendung“, Belege) stehen bewusst nicht
// hier, sondern nachrangig am Ende der Seite.
//
// Nach der Buchung steht die Seite oben, und der Fokus liegt auf der Überschrift — kein Netzaufruf, keine Animation.
import { useEffect, useRef } from "react";
import { CopyableNumber } from "../ui/CopyableNumber";
import { Icon } from "../ui/Icon";
import { NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import { BOOKING_SUCCESS_TEXT, SUCCESS_ACTION, ROW_TONE } from "../../utils/bookingSuccessActions.mjs";
import { BOOKING_LABEL_TEXT, shippingDocumentLoadingLabel } from "../../utils/bookingShippingDocuments.mjs";
import { DEMO_TEXTE } from "../../demo/demoModus.mjs";

export function BookingSuccessHero({
  demo, facts, orderConfirmationNumber, plan, docs, onShipments, onShowDocumentList,
}) {
  const T = BOOKING_SUCCESS_TEXT;
  const A = SUCCESS_ACTION;
  const titelRef = useRef(null);

  useEffect(() => {
    // Der Buchungsknopf stand am Ende eines langen Blatts: die Bestätigung beginnt oben, sofort und ohne Fahrt.
    try { window.scrollTo(0, 0); } catch { /* ohne Fenster nichts zu tun */ }
    titelRef.current?.focus({ preventScroll: true });
  }, []);

  // Die Hauptaktion — Laden und Sperre kommen aus demselben Zustand wie in der Dokumentliste.
  const haupt = plan.primary;
  let onHaupt = onShipments;
  let laedt = false;
  let gesperrt = false;
  let ladeText = "";
  if (haupt.kind === A.DOCUMENT) {
    onHaupt = () => docs.handleDownloadShippingDocument(haupt.doc);
    laedt = docs.versandPfad === haupt.doc.downloadPath;
    gesperrt = docs.versandPfad !== "";
    ladeText = shippingDocumentLoadingLabel(haupt.doc);
  } else if (haupt.kind === A.LABEL) {
    onHaupt = docs.handleDownloadLabel;
    laedt = docs.labelLoading;
    gesperrt = docs.labelLoading;
    ladeText = BOOKING_LABEL_TEXT.loading;
  }
  const herunterladen = haupt.kind === A.DOCUMENT || haupt.kind === A.LABEL;
  const meldung = plan.feedback;

  return (
    <header className="bsx-kopf" aria-labelledby="bsx-titel">
      <div className="bsx-bestaetigung">
        {demo ? (
          <span className="badge badge--info bsx-status">{DEMO_TEXTE.buchungMarke}</span>
        ) : (
          <span className="bsx-siegel" role="img" aria-label={T.status}><Icon n="check" s={26} /></span>
        )}
        <div className="bsx-bestaetigung-text">
          <h1 className="booking-success-title" id="bsx-titel" tabIndex={-1} ref={titelRef}>
            {demo ? DEMO_TEXTE.buchungTitel : T.title}
          </h1>
          {demo && <p className="alert alert-info bsx-demo-hinweis" role="note">{DEMO_TEXTE.buchungSimuliert}</p>}
          {facts.length > 0 && (
            <ul className="bsx-fakten" aria-label="Ihre Sendung">
              {facts.map((f) => (
                <li key={f.text} className="bsx-fakt">
                  <Icon n={f.icon} s={18} />
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Die Auftragsbestätigungsnummer (CE-AB…) ist die primäre sichtbare Vorgangsnummer. Fehlt sie, entfällt die
              Zeile — keine Ersatznummer, insbesondere nicht die interne Bestellnummer, die Provider-Ordernummer oder
              eine Datenbank-ID. */}
          {orderConfirmationNumber && (
            <div className="bsx-vorgang">
              <span className="bsx-vorgang-label">{NUMBER_LABELS.orderConfirmation}</span>
              <CopyableNumber value={orderConfirmationNumber} label={NUMBER_LABELS.orderConfirmation} size="lg" />
            </div>
          )}
        </div>
      </div>

      <div className="bsx-aktionen">
        <button type="button" className="btn btn-primary bsx-hauptaktion" onClick={onHaupt} disabled={gesperrt}>
          {laedt
            ? <><span className="spinner" /> {ladeText}</>
            : <>{herunterladen && <Icon n="download" s={20} />}{haupt.text}</>}
        </button>
        {plan.secondary && (
          <button type="button" className="bsx-nebenaktion" onClick={onShowDocumentList}>{plan.secondary.text}</button>
        )}
        {/* Rückmeldung zum letzten Klick: Warten ruhig, ein echter Fehler im Fehlerton. Angesagt wird sie an der
            Labelzeile der Dokumentliste (dort steht derselbe Stand als Live-Region) — hier nur sichtbar am Knopf. */}
        {meldung && (
          <p className={`bsx-aktion-meldung bsx-aktion-meldung--${meldung.tone === ROW_TONE.ERROR ? "fehler" : "warten"}`}>
            {meldung.text}
          </p>
        )}
      </div>
    </header>
  );
}
