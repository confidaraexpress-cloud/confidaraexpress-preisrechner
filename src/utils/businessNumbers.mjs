// src/utils/businessNumbers.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Zentrale, REINE Anzeigelogik für die ConfidaraExpress-Geschäftsnummern:
//
//   Kundennummer        CE-K-10030      users.customer_number / customer_snapshot.customerNumber
//   Auftragsbestätigung CE-AB26-00001   order_confirmations.confirmation_number
//                                       (bzw. service_snapshot.orderConfirmationNumber)
//   Rechnungsnummer     CE-RE26-00001   invoices.invoice_number
//
//   Bestellnummer       CE-BS26-00001   shipments.business_order_number — INTERN.
//                                       Technisch unverändert vorhanden, aber KEIN
//                                       kundensichtbarer Geschäftsidentifier mehr.
//
// Die sichtbare Vorgangsnummer einer Versandbuchung ist die AUFTRAGSBESTÄTIGUNG.
// Sie ist das einzige CE-Kennzeichen, das gleichzeitig ein Dokument benennt, das der
// Kunde tatsächlich erhält.
//
// Verbindliche Abgrenzung (technisch UND sichtbar):
//   • Die EXTERNE JUMiNGO-Ordernummer (shipments.order_number) ist NIE eine CE-Nummer.
//   • Die JUMiNGO-Shipment-ID ist NIE eine CE-Nummer.
//   • Die Trackingnummer ist ausschließlich die Carrier-Trackingnummer.
//   • Die Kundenreferenz ist ausschließlich der Wert des Kunden (reference_number).
//   • Die interne Bestellnummer (CE-BS…) ist KEIN Ersatz für eine fehlende
//     Auftragsbestätigungsnummer — sie wird kundenseitig nirgends angezeigt.
//   • Interne Datenbank-IDs (users.id, shipments.id, invoices.id) sind NIE eine
//     Geschäftsnummer und werden hier bewusst nicht gelesen.
//
// Keine dieser Nummern ist ein Sicherheits- oder Ownership-Merkmal.
//
// Legacy-/NULL-Verhalten: fehlende Nummern liefern `null` — nie "undefined", nie "null",
// nie eine interne ID und nie eine Ersatznummer. Die Oberfläche lässt das Feld dann weg
// oder zeigt bewusst NOT_ASSIGNED_TEXT.

// Einheitliche Beschriftungen — verhindert abweichende Bezeichnungen je Seite.
export const NUMBER_LABELS = Object.freeze({
  customer: "Kundennummer",
  // Die sichtbare Vorgangsnummer einer Versandbuchung ist die AUFTRAGSBESTÄTIGUNG
  // (CE-AB…). Sie benennt ein Dokument, das der Kunde tatsächlich in der Hand hat —
  // in seinem Portal, in der Buchungsmail und auf der Rechnung derselbe Wert.
  //
  // Die interne Bestellnummer (CE-BS…) hat KEINE kundensichtbare Beschriftung mehr,
  // und es gibt bewusst keinen Schlüssel dafür: ohne Label kann sie nicht versehentlich
  // wieder angezeigt werden. Sie bleibt technisch vollständig bestehen — Spalte,
  // UNIQUE-Index, Zähler und Vergabe sind unangetastet, und die APIs liefern sie
  // weiterhin aus (deprecated Legacy-Feld, keine Anzeige).
  //
  // „Bestellnummer" bezeichnet auf einem Beleg ohnehin die Nummer, unter der der KUNDE
  // bestellt hat — und genau die steht als `customerReference` („Ihre Referenz")
  // daneben. Zwei CE-Nummern für denselben Vorgang waren die Hauptquelle von Rückfragen.
  orderConfirmation: "Auftragsbestätigung",
  invoice: "Rechnungsnummer",
  jumingoOrder: "JUMiNGO-Ordernummer",
  tracking: "Trackingnummer",
  customerReference: "Ihre Referenz",
  adminCustomerReference: "Kundenreferenz",
});

// Neutraler Text für Bestandsdaten ohne Nummer. Nur dort verwenden, wo das Fehlen für
// den Nutzer verständlich ist (z. B. Profil); in Tabellen wird die Zeile eher ausgelassen.
export const NOT_ASSIGNED_TEXT = "Noch nicht vergeben";

// Sendungen aus der Zeit VOR Einführung der Auftragsbestätigung (CE-AB…) haben keine
// und bekommen auch keine mehr — „Noch nicht vergeben" wäre dort eine falsche
// Erwartung. Es wird bewusst NICHT auf die interne Bestellnummer, die Shipment-ID
// oder eine JUMiNGO-Referenz zurückgefallen.
export const NO_ORDER_CONFIRMATION_TEXT = "Ohne Vorgangsnummer";

// Normalisiert einen Nummernwert auf einen nicht-leeren String ODER null.
// Akzeptiert bewusst nur Strings/Zahlen — Objekte/Arrays gelten als „nicht vorhanden".
export function displayNumber(value) {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// true, wenn eine anzeigbare Nummer vorliegt.
export function hasNumber(value) {
  return displayNumber(value) !== null;
}

// Nummer oder neutraler Hinweistext (nie "undefined"/"null").
export function numberOrNotAssigned(value) {
  return displayNumber(value) ?? NOT_ASSIGNED_TEXT;
}

// ── Feld-Extraktion aus den API-Objekten ────────────────────────────────────
// Bewusst tolerant gegenüber snake_case (API) und camelCase (Snapshot-Durchreichung),
// aber NIEMALS mit Fallback auf interne IDs oder JUMiNGO-Werte.

export function customerNumberOf(source) {
  const s = source || {};
  return displayNumber(s.customer_number ?? s.customerNumber);
}

export function businessOrderNumberOf(source) {
  const s = source || {};
  return displayNumber(s.business_order_number ?? s.businessOrderNumber);
}

export function invoiceNumberOf(source) {
  const s = source || {};
  return displayNumber(s.invoice_number ?? s.invoiceNumber);
}

// EXTERNE JUMiNGO-Ordernummer — ausschließlich für die Adminsicht. Wird bewusst über eine
// eigene Funktion mit eigener Beschriftung gelesen, damit sie nie versehentlich als
// Confidara-Bestellnummer dargestellt wird.
export function jumingoOrderNumberOf(source) {
  const s = source || {};
  return displayNumber(s.order_number ?? s.jumingo_order_number ?? s.jumingoOrderNumber);
}

export function trackingNumberOf(source) {
  const s = source || {};
  return displayNumber(s.tracking_number ?? s.trackingNumber);
}

// Auftragsbestätigungsnummer (CE-AB…/CE-TEST-AB…) — die sichtbare Vorgangsnummer.
// Drei reale Formen, alle DIESELBE Nummer:
//   • order_confirmation_number  — Shipment-/Rechnungs-/Adminlisten (snake_case, GET)
//   • orderConfirmation.number   — die /book-Erfolgsantwort (routes/jumingo.js), die
//                                  additiv { number, issuedAt } verschachtelt, weil sie
//                                  zusätzlich unterscheidet, OB überhaupt eine Bestätigung
//                                  entstanden ist
//   • orderConfirmationNumber    — flacher camelCase-Rückfall für ältere Fixtures/Mocks;
//                                  kein bekannter echter Endpunkt liefert ihn (mehr)
// Reihenfolge ist unkritisch für echte Objekte (jede Quelle liefert immer nur EINE
// Form), verschachtelt gewinnt aber bewusst vor dem flachen Rückfall. Sendungen aus der
// Zeit vor CE-AB liefern null.
export function orderConfirmationNumberOf(source) {
  const s = source || {};
  return displayNumber(s.order_confirmation_number ?? s.orderConfirmation?.number ?? s.orderConfirmationNumber);
}

export function customerReferenceOf(source) {
  const s = source || {};
  return displayNumber(s.reference_number ?? s.referenceNumber);
}

// ── Zusammengesetzte Sichten ────────────────────────────────────────────────

// Kundensichtbare Nummern einer Sendung. Die Auftragsbestätigungsnummer ist die
// PRIMÄRE Vorgangsnummer und steht deshalb an erster Stelle; die interne
// Bestellnummer, die interne Shipment-ID und die JUMiNGO-Werte sind bewusst NICHT
// Teil dieser Sicht.
export function customerShipmentNumbers(shipment) {
  return {
    orderConfirmationNumber: orderConfirmationNumberOf(shipment),
    trackingNumber: trackingNumberOf(shipment),
    customerReference: customerReferenceOf(shipment),
  };
}

// Adminsicht einer Sendung: interne und externe Nummern strikt getrennt benannt.
export function adminShipmentNumbers(shipment) {
  const s = shipment || {};
  return {
    orderConfirmationNumber: orderConfirmationNumberOf(s),
    // Interne Legacy-Referenz — nur im technischen Adminbereich, nie als Ersatz für
    // die frühere „Sendungsnummer".
    businessOrderNumber: businessOrderNumberOf(s),
    jumingoOrderNumber: jumingoOrderNumberOf(s),
    trackingNumber: trackingNumberOf(s),
    customerReference: customerReferenceOf(s),
    // Rein technischer Schlüssel — nur im technischen Bereich anzuzeigen.
    internalShipmentId: s.id ?? null,
  };
}

// Kundensichtbare Nummern einer Rechnung. Die Rechnungsnummer bleibt die primäre
// Dokumentnummer; Bestell-/Kundennummer kommen aus den eingefrorenen Snapshots.
export function customerInvoiceNumbers(invoice) {
  return {
    invoiceNumber: invoiceNumberOf(invoice),
    orderConfirmationNumber: orderConfirmationNumberOf(invoice),
    customerNumber: customerNumberOf(invoice),
  };
}
