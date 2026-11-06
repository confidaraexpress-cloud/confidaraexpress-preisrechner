// Buchungspaket FE — der Erfolgsbildschirm der Buchung (Schritt 3).
//
// ─── Was diese Komponente ist ────────────────────────────────────────────────
// Der Bildschirm, den ein Kunde nach einer BEZAHLTEN, unumkehrbaren Bestellung
// sieht. Er bestätigt die Buchung, bietet die eine Aktion an, die jetzt zählt,
// listet die Dokumente, fasst die Buchung zusammen und sagt, wie es weitergeht.
//
// Ursprünglich wörtlich aus pages/BookingPage.jsx übernommen; seit dem Premium-Redesign
// (Etappe 1, Audit B8) als digitale Versandbestätigung gegliedert, seit Phase 1 (Canonical v2.117) mit Aktionskopf.
// Die Premium-UX-Nachbesserung (Betreiberentscheidung 2026-11-06, Canonical v2.118) ordnet die Seite nach drei Fragen
// und setzt sie als ein Blatt mit Beleg fort — dieselbe Gestalt wie die Schritte 1 und 2 (Blatt, daneben der Beleg):
//   1  War die Buchung erfolgreich?   Erfolgszeichen, Überschrift, Sendung in drei Fakten, Auftragsbestätigung
//   2  Was ist jetzt zu tun?          genau eine gefüllte Hauptaktion (components/booking/BookingSuccessHero.jsx)
//   3  Wo liegen Dokumente und Daten? Dokumente als Liste (BookingSuccessDocuments.jsx), „Ihre Buchung“ als kompakter
//                                     Beleg (hier), „Buchungsdetails anzeigen“ (BookingSuccessDetails.jsx)
//   danach „So geht es weiter“ in drei kurzen Schritten und, nachrangig, die Wege in den Kundenbereich.
// Breit stehen Kopf, Dokumente, Details und Schritte auf dem Blatt links, der Beleg rechts; schmal folgt alles in
// dieser Reihenfolge untereinander (DOM-Reihenfolge = Lese- und Tabulatorreihenfolge). Welche Hauptaktion und welche
// Labelzeilen erscheinen, entscheidet utils/bookingSuccessActions.mjs aus dem Labelstand des Servers — keine zweite
// Labelregel in der Oberfläche.
//
// ─── Warum die Auslagerung erst jetzt möglich war ────────────────────────────
// Nicht der Code stand im Weg, sondern die Governance. Gemessen an einem
// simulierten Umzug desselben Blocks:
//
//   vor der Entkopplung   6 Zusagen in 4 Prüfdateien wurden rot
//   nach der Entkopplung  0
//
// Der Unterschied ist, dass die Prüfdateien seitdem die BUCHUNGSFLÄCHE lesen
// (Seite + alle Bausteine in components/booking/) statt der Datei `BookingPage.jsx`. Genau eine
// Sorte Zusage bleibt bewusst an der SEITE: „das gehört in eine Komponente,
// nicht in die Seite" — auf der Fläche wäre sie zwangsläufig verletzt.
//
// ─── Alles kommt herein, nichts wird nachgeladen ─────────────────────────────
// Die Komponente holt KEINE Daten: kein fetch, kein Hook mit Netzwirkung, kein
// Kontextzugriff. Sie bekommt, was sie zeigt; Downloads starten nur auf Klick.
// Nach einer bezahlten Bestellung darf diese Anzeige von keinem weiteren Request
// abhängen — ein fehlgeschlagener Nachladeversuch würde einen erfolgreichen
// Vorgang unvollständig aussehen lassen.
import { CopyableNumber } from "../ui/CopyableNumber";
import { useAnsprechKarteKompakt } from "../layout/AccountManagerCard";
import { PriceSummaryModule } from "./PriceSummaryModule";
import { BookingSuccessDocuments, useBookingSuccessDocuments } from "./BookingSuccessDocuments";
import { BookingSuccessHero } from "./BookingSuccessHero";
import { BookingSuccessDetails } from "./BookingSuccessDetails";
import { bookingBillingNotice } from "../../utils/billingModeView.mjs";
import { publicCarrierDisplay, publicServiceName } from "../../utils/carrierMap";
import { carrierServiceLabel } from "../../utils/carrierServiceLabel.mjs";
import { money } from "../../utils/formatters";
import {
  INVOICES_DASHBOARD_TARGET, hintAlertClass, BOOKING_CONFIRMATION_LINE,
  bookingSuccessAmountView, bookingSuccessComponents, bookingDocumentWording, bookingDocumentNotice,
} from "../../utils/bookingSuccessView.mjs";
import {
  BOOKING_SUCCESS_TEXT, SUCCESS_ACTION, bookingSuccessLabelPlan, bookingSuccessNextSteps,
} from "../../utils/bookingSuccessActions.mjs";
import { orderConfirmationNumberOf } from "../../utils/businessNumbers.mjs";
import { sameDaySuccessPickupText, SAME_DAY_TEXT } from "../../utils/sameDayCollectionView.mjs";
import { boundDropoffLocationLine, DROPOFF_LOCATION_LABEL } from "../../utils/dropoffParcelShop.mjs";
import { DEMO_TEXTE, istDemo } from "../../demo/demoModus.mjs";

export function BookingSuccessStep({
  booking, bookingData, tariff, priceView, user, invoiceDeliveryMode, proformaEntry,
  navigate, clearFlow, vatMode, reference = null,
}) {
  const T = BOOKING_SUCCESS_TEXT;
  // TG22 Paket B: der gebuchte Betrag kommt ausschließlich aus der Buchungsantwort. Die
  // Aufstellung der Buchungsseite erscheint nur, wenn sie ihn auf den Cent trägt.
  const betrag = bookingSuccessAmountView(booking, priceView);
  // Auftrag 2 / P2 (C2): Rechnung, Testdokument oder neutral „Beleg" — aus der eingefrorenen Belegphase
  // der Buchung und dem erzeugten Belegdatensatz, nie aus einem globalen Schalter.
  const wording = bookingDocumentWording(booking, invoiceDeliveryMode);
  // Phase 1: EIN Hinweis zur Belegphase statt Erstellungszeile plus Hinweiskasten (utils/bookingSuccessView.mjs).
  const hinweis = bookingDocumentNotice(booking, invoiceDeliveryMode);
  // TG22 Same-Day: die beim Buchen TATSÄCHLICH gesendete Abholzeit — aus der Buchungsantwort, nie aus dem Angebot.
  const abholungHeute = sameDaySuccessPickupText(booking);
  // Block C: der beim Buchen gebundene Abgabe-Paketshop — aus der Buchungsantwort, nie aus der lokalen Auswahl.
  const abgabeShop = boundDropoffLocationLine(booking);
  // Öffentliche Kundenbereich-Demo: dieselbe Bestätigung, eindeutig als Simulation gekennzeichnet — nichts wurde
  // beauftragt und keine E-Mail versendet (demo/demoModus.mjs). Außerhalb der Demo unverändert.
  const demo = istDemo();
  // Die schwebende Ansprechpartnerkarte steht auf dieser Seite als Foto: offen verdeckte sie ab 1280 px den Beleg.
  useAnsprechKarteKompakt();

  // Downloads und Labelabruf: EIN Zustand für Kopf und Dokumentliste (useBookingSuccessDocuments).
  const docs = useBookingSuccessDocuments(booking, proformaEntry);
  const abNummer = orderConfirmationNumberOf(booking);
  const plan = bookingSuccessLabelPlan(booking, docs.labelRun);
  const carrierName = publicCarrierDisplay(tariff).name;
  const carrierZeile = carrierServiceLabel(publicCarrierDisplay(tariff).name, publicServiceName(tariff), " — ");
  const route = bookingData?.form?.s_city && bookingData?.form?.r_city ? `${bookingData.form.s_city} → ${bookingData.form.r_city}` : null;
  const uebergabe = tariff.serviceType === "pickup" ? T.pickup : tariff.serviceType === "dropoff" ? T.dropoff : null;
  // Die Sendung in drei Fakten — nur hier, nicht noch einmal im Beleg.
  const fakten = [
    carrierZeile && { icon: "truck", text: carrierZeile },
    route && { icon: "routeArrow", text: route },
    uebergabe && { icon: tariff.serviceType === "dropoff" ? "mapPin" : "calendar", text: uebergabe },
  ].filter(Boolean);
  const schritte = bookingSuccessNextSteps(plan, tariff, { pickupText: abholungHeute, dropoffText: abgabeShop, carrierName });
  const sendungenAlsKnopf = plan.primary.kind === SUCCESS_ACTION.SHIPMENTS;

  const zuSendungen = () => navigate("/dashboard?page=shipments", { state: { justBooked: true } });
  // Bewusster Neustart: der alte Vorgang ist beim Buchungserfolg bereits gelöscht — der erneute Aufruf schützt den
  // Fall, dass der Kunde diesen Bildschirm über Browser-Zurück wieder erreicht und dann neu beginnt.
  const neueSendung = () => { clearFlow(); navigate("/calculator"); };
  const zurDokumentliste = () => {
    const ziel = document.getElementById("bsx-dokumente-titel");
    if (ziel) { ziel.scrollIntoView({ block: "start" }); ziel.focus({ preventScroll: true }); }
  };

  return (
      <div className="booking-success-wrap bsx">
        <div className="bsx-blatt bsx-blatt--oben">
          <BookingSuccessHero
            demo={demo}
            facts={fakten}
            orderConfirmationNumber={abNummer}
            plan={plan}
            docs={docs}
            onShipments={zuSendungen}
            onShowDocumentList={zurDokumentliste}
          />

          {/* Dokumente: eine Zeile je Beleg — Name, Stand, Aktion. Label, Auftragsbestätigung, Lieferschein und
              Proforma-Rechnung; jedes Label einer Mehrpaketsendung einzeln. */}
          <section className="bsx-dokumente" aria-labelledby="bsx-dokumente-titel" id="bsx-dokumente">
            <h2 className="bsx-abschnitt" id="bsx-dokumente-titel" tabIndex={-1}>{T.documentsTitle}</h2>
            <BookingSuccessDocuments booking={booking} proformaEntry={proformaEntry} plan={plan} docs={docs} demo={demo} />
          </section>
        </div>

        {/* „Ihre Buchung“: der kompakte Beleg — Abgabe-Paketshop bzw. gebuchte Abholung, Betrag, Belegnummer und die
            Zeilen zu Bestätigung und Abrechnung. Carrier, Strecke und Übergabeart stehen bereits im Kopf. */}
        <section className="bsx-beleg" aria-labelledby="bsx-beleg-titel">
          <h2 className="bsx-beleg-titel" id="bsx-beleg-titel">{T.summaryTitle}</h2>
          <div className="booking-success-recap">
            {abgabeShop && (
              <div className="summary-detail-row summary-detail-row-border" id="booking-success-dropoff-location">
                <span className="text-sm text-muted summary-detail-key">{DROPOFF_LOCATION_LABEL}</span>
                <span className="text-sm font-bold summary-detail-val">{abgabeShop}</span>
              </div>
            )}
            {abholungHeute && (
              <div className="summary-detail-row summary-detail-row-border" id="booking-success-pickup">
                <span className="text-sm text-muted summary-detail-key">{SAME_DAY_TEXT.pickupLabel}</span>
                <span className="text-sm font-bold summary-detail-val">{abholungHeute}</span>
              </div>
            )}
            {/* Drei Fälle, eine Quelle (`booking.amount`):
                  • Aufstellung stimmt auf den Cent → Aufstellung mit dem gebuchten Gesamtbetrag,
                  • Betrag vorhanden, Aufstellung weicht ab → nur der gebuchte Gesamtbetrag,
                  • kein Betrag → kein Betrag, nur der Verweis auf Bestätigung und Rechnung. */}
            {/* Netto/Brutto (2026-10-02): der Gesamtbetrag netto erscheint nur in der Aufstellung — also nur, wenn
                sie den gebuchten Bruttobetrag auf den Cent trägt — und stammt aus demselben bestätigten Preis. */}
            {betrag.showBreakdown ? (
              <PriceSummaryModule priceView={{ ...priceView, totalGross: betrag.totalGross, components: bookingSuccessComponents(booking, priceView) }} paymentTerm={user?.payment_term || 7} vatMode={vatMode} />
            ) : betrag.hasAmount ? (
              <div className="booking-total-row" id="booking-success-amount">
                <span className="booking-total-label">Gesamtbetrag brutto</span>
                <span className="booking-total-amount">{money(betrag.totalGross)}</span>
              </div>
            ) : (
              <p className="text-muted text-sm" id="booking-success-amount-hint">{wording.amountMissingHint}</p>
            )}
          </div>

          {/* Die Auftragsbestätigungsnummer steht oben im Kopf. Die Rechnungs- bzw. Testbelegnummer wird hier
              getrennt ausgewiesen und dient NICHT als allgemeine Vorgangsnummer. Bei Sammelabrechnung gibt es zu
              DIESER Sendung noch keine Rechnung — Nummer und Fälligkeit werden gar nicht erst angezeigt; ein
              Platzhalter wäre eine Behauptung über einen Beleg, den es nicht gibt. */}
          {bookingBillingNotice(booking).showsInvoiceNumber && (
            <div className="booking-success-numbers">
              <div className="bsx-nummer">
                <div className="bsx-nummer-label" id="booking-success-document-number-label">{wording.numberLabel}</div>
                <CopyableNumber value={booking.invoiceNumber} label={wording.numberLabel} size="lg" />
              </div>
            </div>
          )}

          {/* Klare Trennung: Auftragsbestätigung (wird per E-Mail versendet) ≠ späterer Beleg. Dazu genau EIN Hinweis
              zur Belegphase (Testdokument – keine Rechnung und keine Zahlungsforderung, Rechnung, Sammelabrechnung oder
              ein noch fehlender Beleg) — ruhig gesetzt, aber vollständig. */}
          <div className="booking-success-delivery">
            <div className={`alert ${hintAlertClass(hinweis.tone)}`} id="booking-success-document-line" role="status" aria-live="polite">
              {hinweis.text}
            </div>
            <p className="bsx-beleg-mail">
              {demo ? DEMO_TEXTE.keineEmail : <>{BOOKING_CONFIRMATION_LINE}{user?.email ? ` (an ${user.email})` : ""}</>}
            </p>
          </div>
        </section>

        <div className="bsx-blatt bsx-blatt--unten">
          <BookingSuccessDetails form={bookingData?.form} reference={reference} />

          {/* So geht es weiter: drei Schritte in fester Reihenfolge — Label, Übergabe, Sendungsverfolgung. Bewusst KEIN
              sofortiger Tracking-Call direkt nach der Buchung; ist trackingAvailable am Tarif explizit false, steht der
              ehrliche Hinweis statt „wird vorbereitet". */}
          <section className="bsx-weiter" aria-labelledby="bsx-weiter-titel">
            <h2 className="bsx-abschnitt" id="bsx-weiter-titel">{T.stepsTitle}</h2>
            <ol className="bsx-schritte">
              <li className="bsx-schritt">{schritte[0]}</li>
              <li className="bsx-schritt">{schritte[1]}</li>
              <li className="bsx-schritt booking-tracking-note">{schritte[2]}</li>
            </ol>
          </section>
        </div>

        {/* Die Wege in den Kundenbereich — vorhanden, aber nachrangig: nicht neben der Hauptaktion, sondern am Ende. */}
        <nav className="bsx-fuss" aria-label="Weiter im Kundenbereich">
          {!sendungenAlsKnopf && (
            <button type="button" className="bsx-link" onClick={zuSendungen}>{T.shipments}</button>
          )}
          <button type="button" className="bsx-link" onClick={neueSendung}>{T.newShipment}</button>
          <button type="button" className="bsx-link" id="booking-success-documents-link" onClick={() => navigate(INVOICES_DASHBOARD_TARGET)}>
            {wording.documentsButton}
          </button>
        </nav>
      </div>
  );
}
