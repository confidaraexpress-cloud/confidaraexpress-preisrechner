// Buchungspaket FE — der Erfolgsbildschirm der Buchung (Schritt 3).
//
// ─── Was diese Komponente ist ────────────────────────────────────────────────
// Der Bildschirm, den ein Kunde nach einer BEZAHLTEN, unumkehrbaren Bestellung
// sieht. Er bestätigt die Buchung, bietet die eine Aktion an, die jetzt zählt,
// listet die Dokumente, fasst die Buchung zusammen und sagt, wie es weitergeht.
//
// Ursprünglich wörtlich aus pages/BookingPage.jsx übernommen; seit dem Premium-Redesign
// (Etappe 1, Audit B8) als digitale Versandbestätigung gegliedert. Seit Phase 1 (Betreiberentscheidung
// 2026-11-06, Canonical v2.117) Variante A „Bestätigung mit Aktionskopf", in dieser Reihenfolge:
//   A/B  Bestätigungskopf mit Hauptaktion  (components/booking/BookingSuccessHero.jsx)
//   C    Dokumente als Liste               (components/booking/BookingSuccessDocuments.jsx)
//   D    „Ihre Buchung" — die Beleg-Karte  (hier; Nummern, Recap, Betrag, EIN Hinweis zur Belegphase)
//   E    „So geht es weiter" in drei Schritten
//   F    „Buchungsdetails anzeigen"        (components/booking/BookingSuccessDetails.jsx)
// Welche Hauptaktion und welche Labelzeilen erscheinen, entscheidet utils/bookingSuccessActions.mjs aus dem
// Labelstand des Servers — keine zweite Labelregel in der Oberfläche.
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
import { BrandLogo } from "../ui/BrandLogo";
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
  BOOKING_SUCCESS_TEXT, bookingSuccessLabelPlan, bookingSuccessNextSteps,
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

  // Downloads und Labelabruf: EIN Zustand für Kopf und Dokumentliste (useBookingSuccessDocuments).
  const docs = useBookingSuccessDocuments(booking, proformaEntry);
  const abNummer = orderConfirmationNumberOf(booking);
  const plan = bookingSuccessLabelPlan(booking, docs.labelRun, { hasOrderConfirmation: Boolean(booking?.ceShipmentId && abNummer) });
  const carrierName = publicCarrierDisplay(tariff).name;
  const carrierZeile = carrierServiceLabel(publicCarrierDisplay(tariff).name, publicServiceName(tariff), " — ");
  const route = bookingData?.form?.s_city && bookingData?.form?.r_city ? `${bookingData.form.s_city} → ${bookingData.form.r_city}` : null;
  const uebergabe = tariff.serviceType === "pickup" ? T.pickup : tariff.serviceType === "dropoff" ? T.dropoff : null;
  const schritte = bookingSuccessNextSteps(plan, tariff, { pickupText: abholungHeute, dropoffText: abgabeShop, carrierName });

  const zuSendungen = () => navigate("/dashboard?page=shipments", { state: { justBooked: true } });
  // Bewusster Neustart: der alte Vorgang ist beim Buchungserfolg bereits gelöscht — der erneute Aufruf schützt den
  // Fall, dass der Kunde diesen Bildschirm über Browser-Zurück wieder erreicht und dann neu beginnt.
  const neueSendung = () => { clearFlow(); navigate("/calculator"); };
  const zurDokumentliste = () => {
    const ziel = document.getElementById("bsx-dokumente-titel");
    if (ziel) { ziel.scrollIntoView({ block: "start" }); ziel.focus({ preventScroll: true }); }
  };

  return (
      <div className="booking-success-wrap bsx bsx--a">
        <BookingSuccessHero
          demo={demo}
          facts={[carrierZeile, route, uebergabe].filter(Boolean)}
          orderConfirmationNumber={abNummer}
          plan={plan}
          docs={docs}
          documentsLabel={wording.documentsButton}
          onShipments={zuSendungen}
          onNewShipment={neueSendung}
          onDocuments={() => navigate(INVOICES_DASHBOARD_TARGET)}
          onShowDocumentList={zurDokumentliste}
        />

        {/* Dokumente: eine Zeile je Beleg — Name, Stand, Aktion. Label, Auftragsbestätigung, Lieferschein und
            Proforma-Rechnung; jedes Label einer Mehrpaketsendung einzeln. */}
        <section className="bsx-dokumente" aria-labelledby="bsx-dokumente-titel" id="bsx-dokumente">
          <h2 className="bsx-abschnitt" id="bsx-dokumente-titel" tabIndex={-1}>{T.documentsTitle}</h2>
          <BookingSuccessDocuments booking={booking} proformaEntry={proformaEntry} plan={plan} docs={docs} demo={demo} />
        </section>

        {/* Der Beleg der Buchung: Navy-Kopfleiste mit Signet und Markenstreifen, darunter die Belegnummer,
            Buchungsdaten, Betrag und die Zeilen zu Bestätigung und Abrechnung. */}
        <section className="bsx-beleg" aria-labelledby="bsx-beleg-titel">
          <div className="bsx-beleg-kopf">
            <h2 className="bsx-beleg-titel" id="bsx-beleg-titel">Ihre Buchung</h2>
            <BrandLogo variant="signet" tone="reverse" alt="" className="bsx-beleg-marke" />
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

          {/* Kompakter Recap — ausschließlich aus bereits vorhandenem Tarif-/
              Formular-State abgeleitet, keine neue Server-Anfrage. */}
          <div className="booking-success-recap">
            <div className="summary-detail-row summary-detail-row-border">
              <span className="text-sm text-muted summary-detail-key">Carrier</span>
              <span className="text-sm font-bold summary-detail-val">{carrierServiceLabel(publicCarrierDisplay(tariff).name, publicServiceName(tariff), " — ")}</span>
            </div>
            <div className="summary-detail-row summary-detail-row-border">
              <span className="text-sm text-muted summary-detail-key">Route</span>
              <span className="text-sm font-bold summary-detail-val">{bookingData.form.s_city} → {bookingData.form.r_city}</span>
            </div>
            {tariff.serviceType && (
              <div className="summary-detail-row summary-detail-row-border">
                <span className="text-sm text-muted summary-detail-key">Serviceart</span>
                <span className="text-sm font-bold summary-detail-val">{tariff.serviceType === "pickup" ? "Abholung" : "Shopabgabe"}</span>
              </div>
            )}
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
              <div className="booking-total-row mt-8" id="booking-success-amount">
                <span className="booking-total-label">Gesamtbetrag brutto</span>
                <span className="booking-total-amount">{money(betrag.totalGross)}</span>
              </div>
            ) : (
              <p className="text-muted text-sm mt-8" id="booking-success-amount-hint">{wording.amountMissingHint}</p>
            )}
          </div>

          {/* Klare Trennung: Auftragsbestätigung (wird per E-Mail versendet) ≠ späterer Beleg. Dazu genau EIN Hinweis
              zur Belegphase (Testdokument – keine Rechnung und keine Zahlungsforderung, Rechnung, Sammelabrechnung oder
              ein noch fehlender Beleg) — vorher standen Erstellungszeile und Hinweiskasten nebeneinander. */}
          <div className="booking-success-delivery">
            <p className="text-muted mb-4">
              {demo ? DEMO_TEXTE.keineEmail : <>{BOOKING_CONFIRMATION_LINE}{user?.email ? ` (an ${user.email})` : ""}</>}
            </p>
            <div className={`alert ${hintAlertClass(hinweis.tone)}`} id="booking-success-document-line" role="status" aria-live="polite">
              {hinweis.text}
            </div>
          </div>
        </section>

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

        <BookingSuccessDetails form={bookingData?.form} reference={reference} />
      </div>
  );
}
