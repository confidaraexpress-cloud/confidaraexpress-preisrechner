// Buchungspaket FE — der Erfolgsbildschirm der Buchung (Schritt 3).
//
// ─── Was diese Komponente ist ────────────────────────────────────────────────
// Der Bildschirm, den ein Kunde nach einer BEZAHLTEN, unumkehrbaren Bestellung
// sieht. Er zeigt die Vorgangsnummern, sagt, welche Belege wann kommen, fasst
// die Buchung zusammen und bietet die Dokumente an.
//
// Das JSX ist WÖRTLICH aus pages/BookingPage.jsx übernommen — Reihenfolge,
// Klassennamen, Texte, Bedingungen und Kommentare unverändert. Geändert hat
// sich ausschließlich die Hülle: aus `{step === 3 && booking && ( … )}` in der
// Seite wurde eine Komponente, die die Seite an derselben Stelle rendert.
//
// ─── Warum die Auslagerung erst jetzt möglich war ────────────────────────────
// Nicht der Code stand im Weg, sondern die Governance. Gemessen an einem
// simulierten Umzug desselben Blocks:
//
//   vor der Entkopplung   6 Zusagen in 4 Prüfdateien wurden rot
//   nach der Entkopplung  0
//
// Der Unterschied ist, dass die Prüfdateien seitdem die BUCHUNGSFLÄCHE lesen
// (Seite + components/booking/*) statt der Datei `BookingPage.jsx`. Genau eine
// Sorte Zusage bleibt bewusst an der SEITE: „das gehört in eine Komponente,
// nicht in die Seite" — auf der Fläche wäre sie zwangsläufig verletzt.
//
// ─── Alles kommt herein, nichts wird nachgeladen ─────────────────────────────
// Die Komponente holt KEINE Daten: kein fetch, kein Hook mit Nebenwirkung, kein
// Kontextzugriff. Sie bekommt, was sie zeigt. Nach einer bezahlten Bestellung
// darf diese Anzeige von keinem weiteren Request abhängen — ein fehlgeschlagener
// Nachladeversuch würde einen erfolgreichen Vorgang unvollständig aussehen lassen.
import { Icon } from "../ui/Icon";
import { CopyableNumber } from "../ui/CopyableNumber";
import { PriceSummaryModule } from "./PriceSummaryModule";
import { BookingSuccessDocuments } from "./BookingSuccessDocuments";
import { bookingBillingNotice } from "../../utils/billingModeView.mjs";
import { publicCarrierDisplay, publicServiceName } from "../../utils/carrierMap";
import {
  INVOICES_DASHBOARD_TARGET, invoiceDeliveryHint, BOOKING_CONFIRMATION_LINE, INVOICE_AUTOCREATE_LINE,
} from "../../utils/bookingSuccessView.mjs";
import { NUMBER_LABELS, orderConfirmationNumberOf } from "../../utils/businessNumbers.mjs";

export function BookingSuccessStep({
  booking, bookingData, tariff, priceView, user, invoiceDeliveryMode, proformaEntry,
  navigate, clearFlow,
}) {
  return (
      <div className="booking-success-wrap">
        <div className="booking-success-icon"><Icon n="check" s={40} /></div>
        <h2 className="booking-success-title">Sendung erfolgreich gebucht!</h2>
        {/* Die Auftragsbestätigungsnummer (CE-AB…) ist die primäre sichtbare
            Vorgangsnummer und steht zuerst; die Rechnungsnummer wird getrennt daneben
            ausgewiesen und dient NICHT als allgemeine Vorgangsnummer. Fehlt die
            Auftragsbestätigungsnummer, wird die Zeile ausgelassen — es wird keine
            Ersatznummer erzeugt, insbesondere nicht die interne Bestellnummer (CE-BS…),
            die Provider-Ordernummer oder eine interne Datenbank-ID. */}
        <div className="booking-success-numbers mb-16" style={{ display: "flex", flexWrap: "wrap", gap: "10px 32px", justifyContent: "center" }}>
          {orderConfirmationNumberOf(booking) && (
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>{NUMBER_LABELS.orderConfirmation}</div>
              <CopyableNumber value={orderConfirmationNumberOf(booking)} label={NUMBER_LABELS.orderConfirmation} size="lg" />
            </div>
          )}
          {/* Bei Sammelabrechnung gibt es zu DIESER Sendung noch keine Rechnung —
              Nummer und Fälligkeit werden deshalb gar nicht erst angezeigt. Ein
              Platzhalter wäre eine Behauptung über einen Beleg, den es nicht gibt.
              Der Hinweis darunter sagt stattdessen, wo der Betrag erscheinen wird. */}
          {bookingBillingNotice(booking).showsInvoiceNumber && (
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>{NUMBER_LABELS.invoice}</div>
              <CopyableNumber value={booking.invoiceNumber} label={NUMBER_LABELS.invoice} size="lg" />
            </div>
          )}
        </div>
        {/* Klare Trennung: Auftragsbestätigung (wird per E-Mail versendet) ≠ spätere Rechnung/Rechnungs-E-Mail. */}
        <div className="booking-success-delivery mb-16">
          <p className="text-muted mb-4">{BOOKING_CONFIRMATION_LINE}{user?.email ? ` (an ${user.email})` : ""}</p>
          {/* Der Standardsatz zur automatischen Rechnungserstellung gilt nur für die
              Einzelabrechnung; bei Sammelabrechnung tritt der Sammelhinweis an seine
              Stelle, statt beide nebeneinander zu behaupten. */}
          {bookingBillingNotice(booking).consolidated
            ? <p className="text-muted mb-8">{bookingBillingNotice(booking).text}</p>
            : <p className="text-muted mb-8">{INVOICE_AUTOCREATE_LINE}</p>}
          {!bookingBillingNotice(booking).consolidated && (() => {
            const hint = invoiceDeliveryHint(invoiceDeliveryMode);
            const cls = hint.tone === "success" ? "alert-success" : hint.tone === "error" ? "alert-error" : "alert-info";
            const icon = hint.tone === "success" ? "check" : "info";
            return (
              <div className={`alert ${cls}`} role="status" aria-live="polite">
                <Icon n={icon} s={16} />{hint.text}
              </div>
            );
          })()}
        </div>

        {/* Kompakter Recap — ausschließlich aus bereits vorhandenem Tarif-/
            Formular-State abgeleitet, keine neue Server-Anfrage. */}
        <div className="calc-panel booking-success-recap mb-16">
          <div className="calc-panel-header"><Icon n="invoice" s={18} c="var(--ce-color-brand-ink)" /><h3>Ihre Buchung</h3></div>
          <div className="calc-panel-body">
            <div className="summary-detail-row summary-detail-row-border">
              <span className="text-sm text-muted summary-detail-key">Carrier</span>
              <span className="text-sm font-bold summary-detail-val">{publicCarrierDisplay(tariff).name} — {publicServiceName(tariff)}</span>
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
            <PriceSummaryModule priceView={priceView} paymentTerm={user?.payment_term || 7} />
          </div>
        </div>

        {/* Label, Auftragsbestätigung, Lieferschein und Proforma-Rechnung —
            Zustände, Handler und Oberfläche wortgleich in
            components/booking/BookingSuccessDocuments.jsx. */}
        <BookingSuccessDocuments booking={booking} proformaEntry={proformaEntry} />
        {/* Ruhiger Hinweis — bewusst KEIN sofortiger Tracking-Call/Polling
            direkt nach der Buchung (Status wäre ohnehin „new"/nicht verfügbar).
            Der Trackingstatus erscheint später in „Meine Sendungen". Ist
            trackingAvailable am Tarif explizit false, würde der optimistische
            Text irreführen — dann ehrlicher Hinweis statt „wird vorbereitet". */}
        {tariff.trackingAvailable === false ? (
          <p className="booking-tracking-note">
            <Icon n="truck" s={15} c="currentColor" />
            <span>Für diesen Tarif ist keine Sendungsverfolgung verfügbar.</span>
          </p>
        ) : (
          <p className="booking-tracking-note">
            <Icon n="truck" s={15} c="currentColor" />
            <span>
              Tracking wird vorbereitet. Die Sendungsverfolgung erscheint in Ihren
              Sendungen, sobald der Versanddienstleister die Sendung übernommen hat.
            </span>
          </p>
        )}
        {/* Aktionspriorität (Paket B): Label steht bereits oben, sofern verfügbar.
            Danach Sendung ansehen → weitere Sendung erstellen → Rechnungen als
            sekundärer Weg. Ziele/Links unverändert, nur Reihenfolge/Gewichtung. */}
        <div className="flex-center gap-12" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => navigate("/dashboard?page=shipments", { state: { justBooked: true } })}>
            <Icon n="package" s={16} /> Zu meinen Sendungen
          </button>
          {/* Bewusster Neustart: der alte Vorgang ist beim Buchungserfolg
              bereits gelöscht — der erneute Aufruf schützt den Fall, dass
              der Kunde diesen Bildschirm über Browser-Zurück wieder
              erreicht und dann neu beginnt. */}
          <button className="btn btn-outline" onClick={() => { clearFlow(); navigate("/calculator"); }}>Neue Sendung</button>
          <button className="btn btn-outline" onClick={() => navigate(INVOICES_DASHBOARD_TARGET)}>
            <Icon n="invoice" s={16} /> Zu meinen Rechnungen
          </button>
        </div>
      </div>  );
}
