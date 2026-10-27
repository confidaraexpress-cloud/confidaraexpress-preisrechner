// ─────────────────────────────────────────────────────────────────────────────
// Erfolgsscreen nach Buchung — reine, framework-freie Anzeigelogik (.mjs, wie invoiceView).
// Trennt die AUFTRAGSBESTÄTIGUNG (wird im /book asynchron ausgelöst, s. BOOKING_CONFIRMATION_LINE
// unten) klar von der späteren RECHNUNGS-E-Mail und beschreibt korrekt, was mit der Rechnung
// passiert — abhängig davon, ob das erzeugte Rechnungsdokument produktiv (is_test_document=false)
// oder eine interne Vorschau (Testbetrieb) ist. Das Frontend kennt den globalen INVOICE_TEST_MODE
// NICHT direkt; der Modus wird stattdessen aus dem tatsächlich erzeugten Rechnungsdatensatz
// abgeleitet (Serverwahrheit: is_test_document + document_status). Solange das Dokument noch
// erstellt wird, gilt PENDING (neutrale, immer korrekte Formulierung). Kein React, kein Netzwerk,
// keine Backend-Änderung.
// ─────────────────────────────────────────────────────────────────────────────

import { readPriceComponents } from "./priceComponentsView.mjs";

// Modus der Rechnungszustellung, den der Erfolgsscreen kommuniziert.
export const INVOICE_DELIVERY_MODE = Object.freeze({
  PENDING: "pending",       // Dokument wird noch erstellt (Modus noch nicht entschieden)
  PRODUCTION: "production", // produktive Rechnung (is_test_document=false) → wird per E-Mail versendet
  TEST: "test",             // interne Vorschau (Testbetrieb) → KEINE Rechnungs-E-Mail
  // Canonical v2.60: Testdokument der internen Testphase (echter Versandauftrag, keine Rechnung) →
  // wird mit eigener Belegmail versendet. Vom Server über invoice_test_phase geliefert.
  TEST_PHASE: "test_phase",
  FAILED: "failed",         // Dokumenterstellung (noch) fehlgeschlagen
});

// Deep-Link-Ziel in den Rechnungsbereich — nutzt den BESTEHENDEN Dashboard-Routingmechanismus
// (DashboardPage liest ?page= und öffnet den entsprechenden Reiter). KEINE neue Route/Seite.
export const INVOICES_DASHBOARD_PAGE = "invoices";
export const INVOICES_DASHBOARD_TARGET = "/dashboard?page=invoices";
export const SHIPMENTS_DASHBOARD_TARGET = "/dashboard?page=shipments";
export const PROFILE_DASHBOARD_TARGET = "/dashboard?page=profile";

// ── TG22 Paket B: der gebuchte Betrag kommt vom Server ─────────────────────────
// Der Erfolgsbildschirm zeigte bis hierher die Preisaufstellung der Buchungsseite. Die ist
// der Stand VOR der Bestellung — nach einer Preisübernahme, einem Gutschein oder einer
// serverseitigen Korrektur kann der tatsächlich gebuchte Betrag ein anderer sein. Nach einer
// bezahlten Bestellung darf dort nur stehen, was der Server gebucht hat: `booking.amount`.
//
//   • „Gesamtbetrag brutto" ausschließlich aus `booking.amount`.
//   • Die Aufschlüsselung (Versand, MwSt., Absicherung) nur, wenn ihr bestätigter Gesamtbetrag
//     auf den Cent dem gebuchten entspricht — sonst stünden zwei widersprüchliche Zahlen da.
//   • Fehlt `amount`: kein Betrag, nur der neutrale Verweis auf Auftragsbestätigung und Rechnung.
export const BOOKING_AMOUNT_MISSING_HINT =
  "Den gebuchten Gesamtbetrag finden Sie in Ihrer Auftragsbestätigung und auf Ihrer Rechnung.";

// ── Auftrag 2 / P2 (Analysebefund C2): die Worte der Erfolgsseite folgen dem Beleg DIESER Buchung ──
// In der internen Testphase (Canonical v2.60) ist der Versandauftrag echt, der Beleg aber ein
// Testdokument — keine Rechnung, keine Forderung. Bis hierher versprach die Seite daneben trotzdem
// „Rechnungsnummer", „Ihre Rechnung wird automatisch erstellt" und „Zu meinen Rechnungen".
//
// Die Quelle der Wahrheit ist zweistufig und kommt in beiden Stufen vom Server, nie aus einem
// nachträglich gelesenen globalen Schalter:
//   1. `booking.invoicingPhase` — die Belegphase, die /book VOR dem Providercall eingefroren hat
//      (`test_phase` | `regular`); sie steht sofort fest, noch bevor ein Dokument existiert.
//   2. der erzeugte Belegdatensatz (`invoiceDeliveryMode`, aus is_test_document/invoice_test_phase).
// Widersprechen sich beide nicht, ist das Ergebnis eindeutig; fehlt beides (älterer Server), bleibt
// die Seite bei der neutralen Form „Beleg" und behauptet weder Rechnung noch Testdokument.
export const DOCUMENT_WORDING = Object.freeze({
  REGULAR: "regular",
  TEST_PHASE: "test_phase",
  NEUTRAL: "neutral",
});

const WORDING = Object.freeze({
  [DOCUMENT_WORDING.REGULAR]: Object.freeze({
    numberLabel: "Rechnungsnummer",
    autocreateLine: "Ihre Rechnung wird automatisch erstellt und steht anschließend im Bereich Rechnungen zum Ansehen und Herunterladen bereit.",
    amountMissingHint: BOOKING_AMOUNT_MISSING_HINT,
    documentsButton: "Zu meinen Rechnungen",
  }),
  [DOCUMENT_WORDING.TEST_PHASE]: Object.freeze({
    numberLabel: "Testbelegnummer",
    autocreateLine: "Ihr Testdokument wird automatisch erstellt und steht anschließend im Bereich Rechnungen als „Testdokument – keine Rechnung“ zum Ansehen und Herunterladen bereit.",
    amountMissingHint: "Den gebuchten Gesamtbetrag finden Sie in Ihrer Auftragsbestätigung und in Ihrem Testdokument.",
    documentsButton: "Zu meinen Belegen",
  }),
  [DOCUMENT_WORDING.NEUTRAL]: Object.freeze({
    numberLabel: "Belegnummer",
    autocreateLine: "Ihr Beleg wird automatisch erstellt und steht anschließend im Bereich Rechnungen zum Ansehen und Herunterladen bereit.",
    amountMissingHint: "Den gebuchten Gesamtbetrag finden Sie in Ihrer Auftragsbestätigung und auf Ihrem Beleg.",
    documentsButton: "Zu meinen Belegen",
  }),
});

/** Welche Belegart DIESE Buchung trägt — aus der eingefrorenen Phase und dem erzeugten Beleg, sonst neutral. */
export function resolveDocumentWording(booking, invoiceDeliveryMode) {
  const phase = booking && typeof booking === "object" ? booking.invoicingPhase : null;
  if (phase === "test_phase" || invoiceDeliveryMode === INVOICE_DELIVERY_MODE.TEST_PHASE) return DOCUMENT_WORDING.TEST_PHASE;
  if (phase === "regular" || invoiceDeliveryMode === INVOICE_DELIVERY_MODE.PRODUCTION
      || invoiceDeliveryMode === INVOICE_DELIVERY_MODE.TEST) {
    return DOCUMENT_WORDING.REGULAR;
  }
  return DOCUMENT_WORDING.NEUTRAL;
}

/** Die Texte der Erfolgsseite zu dieser Belegart: Nummernbezeichnung, Erstellungszeile, Betragsverweis, Knopf. */
export function bookingDocumentWording(booking, invoiceDeliveryMode) {
  return WORDING[resolveDocumentWording(booking, invoiceDeliveryMode)];
}

const gueltigerBetrag = (v) => {
  const n = typeof v === "number" ? v
    : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function bookingSuccessAmountView(booking, priceView) {
  const betrag = gueltigerBetrag(booking && typeof booking === "object" ? booking.amount : null);
  if (betrag === null) {
    return { hasAmount: false, totalGross: null, showBreakdown: false, hint: BOOKING_AMOUNT_MISSING_HINT };
  }
  const pv = priceView && typeof priceView === "object" ? priceView : null;
  const aufstellung = pv && pv.hasConfirmedPrice === true ? gueltigerBetrag(pv.totalGross) : null;
  const gleich = aufstellung !== null && Math.round(aufstellung * 100) === Math.round(betrag * 100);
  return { hasAmount: true, totalGross: betrag, showBreakdown: gleich, hint: null };
}

// TG22 Residential — die Bestandteile der Aufstellung auf dem Erfolgsbildschirm: bevorzugt die der
// Buchungsantwort (`priceComponents`, der gebuchte Stand), sonst die bereits bestätigten der Seite.
// Ohne gültige Bestandteile `null` — die Aufstellung zeigt dann ihre bisherigen Zeilen. Es wird
// nichts gerechnet; die Aufstellung erscheint ohnehin nur, wenn ihr Gesamtbetrag dem gebuchten entspricht.
export function bookingSuccessComponents(booking, priceView) {
  const b = booking && typeof booking === "object" ? booking : {};
  const ausBuchung = readPriceComponents(b.priceComponents);
  if (ausBuchung) return ausBuchung;
  const pv = priceView && typeof priceView === "object" ? priceView : {};
  return readPriceComponents(pv.components);
}

// Sucht die soeben erzeugte Rechnung anhand der (aus dem /book-Response bekannten) Rechnungsnummer.
// Rein; toleriert fehlende Liste/Nummer.
export function findInvoiceByNumber(invoices, invoiceNumber) {
  if (!Array.isArray(invoices) || invoiceNumber == null || invoiceNumber === "") return null;
  return invoices.find((i) => i && i.invoice_number === invoiceNumber) || null;
}

// Leitet den Zustellungsmodus aus dem Serverzustand der Rechnung ab. Spiegelt exakt die
// Serverwahrheit — es wird NICHTS clientseitig „geraten":
//   • kein Datensatz / document_status pending_document|generating → PENDING (Dokument in Arbeit)
//   • document_status document_failed                              → FAILED
//   • document_status ready + is_test_document === false           → PRODUCTION (echte Rechnung, E-Mail)
//   • document_status ready + is_test_document (true|NULL)          → TEST (interne Vorschau, keine E-Mail)
//   • sonstiger/unbekannter Status                                  → PENDING (konservativ, nie irreführend)
export function resolveInvoiceDeliveryMode(invoice) {
  const inv = invoice || null;
  if (!inv) return INVOICE_DELIVERY_MODE.PENDING;
  const status = inv.document_status;
  if (status === "document_failed") return INVOICE_DELIVERY_MODE.FAILED;
  if (status === "ready") {
    if (inv.is_test_document === false) return INVOICE_DELIVERY_MODE.PRODUCTION;
    return inv.invoice_test_phase === true ? INVOICE_DELIVERY_MODE.TEST_PHASE : INVOICE_DELIVERY_MODE.TEST;
  }
  // pending_document | generating | undefined | anderes → noch nicht entschieden
  return INVOICE_DELIVERY_MODE.PENDING;
}

// Ob der Zustellungsmodus bereits „endgültig" ist (Polling darf dann stoppen).
export function isTerminalDeliveryMode(mode) {
  return mode === INVOICE_DELIVERY_MODE.PRODUCTION
    || mode === INVOICE_DELIVERY_MODE.TEST
    || mode === INVOICE_DELIVERY_MODE.TEST_PHASE
    || mode === INVOICE_DELIVERY_MODE.FAILED;
}

// Immer gültige Grundaussagen des Erfolgsscreens (modus-unabhängig, nie irreführend):
// 1) Die AUFTRAGSBESTÄTIGUNG wird per E-Mail versendet (getrennt von der Rechnung) — Präsens,
//    weil /book den Versand nur anstößt (triggerOrderConfirmationEmailAsync, fire-and-forget),
//    ohne auf eine bestätigte Zustellung zu warten.
// 2) Die Rechnung wird automatisch erstellt und erscheint anschließend unter „Rechnungen".
export const BOOKING_CONFIRMATION_LINE = "Ihre Auftragsbestätigung wird per E-Mail versendet.";
export const INVOICE_AUTOCREATE_LINE = "Ihre Rechnung wird automatisch erstellt und steht anschließend im Bereich Rechnungen zum Ansehen und Herunterladen bereit.";

// Modus-spezifischer Zusatzhinweis zur Rechnungs-E-Mail. tone ∈ info|success|warning|error für die
// Alert-Darstellung. Die Texte widersprechen NIE dem tatsächlichen Backend-Verhalten:
//   PRODUCTION → echte Rechnung wird zusätzlich separat per E-Mail versendet
//   TEST       → nur interne Vorschau, KEINE Rechnungs-E-Mail
//   FAILED     → Dokument (noch) nicht erstellt; Buchung unberührt
//   PENDING    → Dokument wird noch erstellt (neutral)
export function invoiceDeliveryHint(mode) {
  switch (mode) {
    case INVOICE_DELIVERY_MODE.PRODUCTION:
      return { tone: "success", text: "Ihre Rechnung wird zusätzlich separat als PDF-Anhang per E-Mail an Sie versendet." };
    case INVOICE_DELIVERY_MODE.TEST:
      return { tone: "warning", text: "Hinweis (Testbetrieb): Aktuell wird nur eine interne Vorschau erstellt — es wird KEINE Rechnungs-E-Mail versendet." };
    case INVOICE_DELIVERY_MODE.TEST_PHASE:
      return { tone: "warning", text: "Interner Testbetrieb: Statt einer Rechnung wird ein Testdokument erstellt — keine Rechnung und keine Zahlungsforderung. Es wird Ihnen zusätzlich per E-Mail zugesandt." };
    case INVOICE_DELIVERY_MODE.FAILED:
      return { tone: "info", text: "Ihr Rechnungsdokument konnte noch nicht erstellt werden. Ihre Buchung ist davon unberührt — die Rechnung wird nachgereicht." };
    case INVOICE_DELIVERY_MODE.PENDING:
    default:
      return { tone: "info", text: "Das Rechnungsdokument wird derzeit erstellt und erscheint gleich im Bereich Rechnungen." };
  }
}

// Meldungsklasse zum Ton des Hinweises (F3): Der Warnton der Testphase erscheint als Warnung, nicht als Info.
// Ein unbekannter Ton fällt auf den ruhigen Infoton zurück.
const HINT_ALERT_CLASS = Object.freeze({
  success: "alert-success", warning: "alert-warning", error: "alert-error", info: "alert-info",
});
export function hintAlertClass(tone) {
  return HINT_ALERT_CLASS[tone] || "alert-info";
}
