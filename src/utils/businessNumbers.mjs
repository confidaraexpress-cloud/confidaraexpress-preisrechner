// src/utils/businessNumbers.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Zentrale, REINE Anzeigelogik für die drei ConfidaraExpress-Geschäftsnummern:
//
//   Kundennummer     CE-K-10030      users.customer_number / customer_snapshot.customerNumber
//   Bestellnummer    CE-BS26-00001   shipments.business_order_number / service_snapshot.businessOrderNumber
//   Rechnungsnummer  CE-RE26-00001   invoices.invoice_number
//
// Verbindliche Abgrenzung (technisch UND sichtbar):
//   • Die EXTERNE JUMiNGO-Ordernummer (shipments.order_number) ist NIE eine Bestellnummer.
//   • Die JUMiNGO-Shipment-ID ist NIE eine Bestellnummer.
//   • Die Trackingnummer ist ausschließlich die Carrier-Trackingnummer.
//   • Die Kundenreferenz ist ausschließlich der Wert des Kunden (reference_number).
//   • Interne Datenbank-IDs (users.id, shipments.id, invoices.id) sind NIE eine
//     Kunden-, Bestell- oder Rechnungsnummer und werden hier bewusst nicht gelesen.
//
// Keine dieser Nummern ist ein Sicherheits- oder Ownership-Merkmal.
//
// Legacy-/NULL-Verhalten: fehlende Nummern liefern `null` — nie "undefined", nie "null",
// nie eine interne ID und nie eine Ersatznummer. Die Oberfläche lässt das Feld dann weg
// oder zeigt bewusst NOT_ASSIGNED_TEXT.

// Einheitliche Beschriftungen — verhindert abweichende Bezeichnungen je Seite.
export const NUMBER_LABELS = Object.freeze({
  customer: "Kundennummer",
  // CE-BS… heißt sichtbar „Sendungsnummer". Auf einem Beleg ist „Bestellnummer" die
  // Nummer, unter der der KUNDE bestellt hat — und genau die steht als
  // `customerReference` („Ihre Referenz") direkt daneben. Zwei Felder mit derselben
  // Bedeutung nebeneinander waren die Hauptquelle von Rückfragen.
  //
  // Der technische Bezeichner bleibt unverändert `businessOrder` und die Datenquelle
  // unverändert `shipments.business_order_number` / `service_snapshot.businessOrderNumber`
  // — das hier ist eine BESCHRIFTUNG, keine Umbenennung. Der Schlüssel dieses Objekts
  // wird bewusst NICHT mit umbenannt: er zeigt auf das Feld, nicht auf das Label.
  businessOrder: "Sendungsnummer",
  invoice: "Rechnungsnummer",
  jumingoOrder: "JUMiNGO-Ordernummer",
  tracking: "Trackingnummer",
  customerReference: "Ihre Referenz",
  adminCustomerReference: "Kundenreferenz",
});

// Neutraler Text für Bestandsdaten ohne Nummer. Nur dort verwenden, wo das Fehlen für
// den Nutzer verständlich ist (z. B. Profil); in Tabellen wird die Zeile eher ausgelassen.
export const NOT_ASSIGNED_TEXT = "Noch nicht vergeben";

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

export function customerReferenceOf(source) {
  const s = source || {};
  return displayNumber(s.reference_number ?? s.referenceNumber);
}

// ── Zusammengesetzte Sichten ────────────────────────────────────────────────

// Kundensichtbare Nummern einer Sendung. Die Bestellnummer ist die PRIMÄRE
// Vorgangsnummer und steht deshalb an erster Stelle; die interne Shipment-ID und die
// JUMiNGO-Werte sind bewusst NICHT Teil dieser Sicht.
export function customerShipmentNumbers(shipment) {
  return {
    businessOrderNumber: businessOrderNumberOf(shipment),
    trackingNumber: trackingNumberOf(shipment),
    customerReference: customerReferenceOf(shipment),
  };
}

// Adminsicht einer Sendung: interne und externe Nummern strikt getrennt benannt.
export function adminShipmentNumbers(shipment) {
  const s = shipment || {};
  return {
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
    businessOrderNumber: businessOrderNumberOf(invoice),
    customerNumber: customerNumberOf(invoice),
  };
}
