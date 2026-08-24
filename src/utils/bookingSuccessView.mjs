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

// Modus der Rechnungszustellung, den der Erfolgsscreen kommuniziert.
export const INVOICE_DELIVERY_MODE = Object.freeze({
  PENDING: "pending",       // Dokument wird noch erstellt (Modus noch nicht entschieden)
  PRODUCTION: "production", // produktive Rechnung (is_test_document=false) → wird per E-Mail versendet
  TEST: "test",             // interne Vorschau (Testbetrieb) → KEINE Rechnungs-E-Mail
  FAILED: "failed",         // Dokumenterstellung (noch) fehlgeschlagen
});

// Deep-Link-Ziel in den Rechnungsbereich — nutzt den BESTEHENDEN Dashboard-Routingmechanismus
// (DashboardPage liest ?page= und öffnet den entsprechenden Reiter). KEINE neue Route/Seite.
export const INVOICES_DASHBOARD_PAGE = "invoices";
export const INVOICES_DASHBOARD_TARGET = "/dashboard?page=invoices";
export const SHIPMENTS_DASHBOARD_TARGET = "/dashboard?page=shipments";

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
    return inv.is_test_document === false ? INVOICE_DELIVERY_MODE.PRODUCTION : INVOICE_DELIVERY_MODE.TEST;
  }
  // pending_document | generating | undefined | anderes → noch nicht entschieden
  return INVOICE_DELIVERY_MODE.PENDING;
}

// Ob der Zustellungsmodus bereits „endgültig" ist (Polling darf dann stoppen).
export function isTerminalDeliveryMode(mode) {
  return mode === INVOICE_DELIVERY_MODE.PRODUCTION
    || mode === INVOICE_DELIVERY_MODE.TEST
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
    case INVOICE_DELIVERY_MODE.FAILED:
      return { tone: "info", text: "Ihr Rechnungsdokument konnte noch nicht erstellt werden. Ihre Buchung ist davon unberührt — die Rechnung wird nachgereicht." };
    case INVOICE_DELIVERY_MODE.PENDING:
    default:
      return { tone: "info", text: "Das Rechnungsdokument wird derzeit erstellt und erscheint gleich im Bereich Rechnungen." };
  }
}
