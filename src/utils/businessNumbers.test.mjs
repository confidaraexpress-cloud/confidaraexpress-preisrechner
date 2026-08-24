// Tests für die zentrale Anzeigelogik der drei Geschäftsnummern (Kunden-, Bestell-,
// Rechnungsnummer) sowie die strikte Trennung von externen JUMiNGO-Werten und internen
// Datenbank-IDs. Läuft über `node --test` (npm test).
//
// Zusätzlich Quelltextverträge über die Oberflächen: sie belegen, dass die Nummern in den
// jeweiligen Ansichten tatsächlich angezeigt werden, dass keine interne ID oder JUMiNGO-Nummer
// als Ersatz dient und dass keine Kreditlimit-Texte zurückkehren.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NUMBER_LABELS, NOT_ASSIGNED_TEXT, NO_ORDER_CONFIRMATION_TEXT,
  displayNumber, hasNumber, numberOrNotAssigned,
  customerNumberOf, businessOrderNumberOf, invoiceNumberOf,
  jumingoOrderNumberOf, trackingNumberOf, customerReferenceOf,
  orderConfirmationNumberOf,
  customerShipmentNumbers, adminShipmentNumbers, customerInvoiceNumbers,
} from "./businessNumbers.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
// Kommentare entfernen — geprüft wird der tatsächlich gerenderte CODE, nicht die Doku
// (Kommentare nennen die Abgrenzungen bewusst beim Namen, z. B. „nie aus user.id").
const readCode = (rel) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CUSTOMER_NO = "CE-K-10030";
// CE-BS… existiert TECHNISCH unverändert weiter (Spalte, UNIQUE-Index, Zähler,
// Vergabe) — es ist nur keine kundensichtbare Geschäftsnummer mehr. Die Fixture
// bleibt deshalb bestehen: mehrere Tests belegen ausdrücklich, dass der Wert
// weiterhin lesbar ist und NIRGENDS mehr angezeigt wird.
const ORDER_NO = "CE-BS26-00001";
const CONFIRMATION_NO = "CE-AB26-00001";
const INVOICE_NO = "CE-RE26-00001";
const JUMINGO_NO = "JUMINGO-EXT-77421";

// ── Reine Logik ─────────────────────────────────────────────────────────────

test("displayNumber: trimmt, verwirft Leerwerte, gibt nie 'undefined'/'null' zurück", () => {
  assert.equal(displayNumber(" CE-K-10030 "), CUSTOMER_NO);
  assert.equal(displayNumber(""), null);
  assert.equal(displayNumber("   "), null);
  assert.equal(displayNumber(null), null);
  assert.equal(displayNumber(undefined), null);
  assert.equal(displayNumber({}), null);
  assert.equal(displayNumber([]), null);
  assert.equal(displayNumber(42), "42");
  for (const v of [null, undefined, "", {}]) {
    assert.notEqual(String(displayNumber(v)), "undefined");
  }
});

test("hasNumber / numberOrNotAssigned: neutraler Hinweis statt technischem Leerwert", () => {
  assert.equal(hasNumber(ORDER_NO), true);
  assert.equal(hasNumber(null), false);
  assert.equal(numberOrNotAssigned(ORDER_NO), ORDER_NO);
  assert.equal(numberOrNotAssigned(null), NOT_ASSIGNED_TEXT);
  assert.equal(numberOrNotAssigned(undefined), NOT_ASSIGNED_TEXT);
  assert.ok(!/undefined|null/i.test(numberOrNotAssigned(undefined)));
});

test("Feld-Extraktion liest snake_case und camelCase, aber NIE interne IDs", () => {
  assert.equal(customerNumberOf({ customer_number: CUSTOMER_NO }), CUSTOMER_NO);
  assert.equal(customerNumberOf({ customerNumber: CUSTOMER_NO }), CUSTOMER_NO);
  assert.equal(businessOrderNumberOf({ business_order_number: ORDER_NO }), ORDER_NO);
  assert.equal(businessOrderNumberOf({ businessOrderNumber: ORDER_NO }), ORDER_NO);
  assert.equal(invoiceNumberOf({ invoice_number: INVOICE_NO }), INVOICE_NO);
  // Interne IDs dürfen NIE als Nummer durchschlagen.
  assert.equal(customerNumberOf({ id: 4711 }), null);
  assert.equal(businessOrderNumberOf({ id: 4711, shipment_id: 99 }), null);
  assert.equal(invoiceNumberOf({ id: 4711 }), null);
});

test("Vorgangsnummer fällt NIEMALS auf JUMiNGO-Werte, CE-BS oder interne IDs zurück", () => {
  // Eine Sendung aus der Zeit VOR CE-AB: sie trägt eine interne Bestellnummer und
  // Providerreferenzen — und bekommt trotzdem KEINE Vorgangsnummer angedichtet.
  const legacyShipment = { id: 4711, jumingo_shipment_id: "JMG-SHIP-123", order_number: JUMINGO_NO,
    business_order_number: ORDER_NO, order_confirmation_number: null };
  assert.equal(orderConfirmationNumberOf(legacyShipment), null, "Legacy-Sendung darf keine Vorgangsnummer erfinden");
  // Die interne Bestellnummer bleibt lesbar — sie ist nur kein Anzeigewert mehr.
  assert.equal(businessOrderNumberOf(legacyShipment), ORDER_NO);
  // Die externe Nummer ist nur über die EIGENE Funktion lesbar.
  assert.equal(jumingoOrderNumberOf(legacyShipment), JUMINGO_NO);
  const nums = customerShipmentNumbers(legacyShipment);
  assert.equal(nums.orderConfirmationNumber, null);
  assert.ok(!Object.values(nums).includes(JUMINGO_NO), "JUMiNGO-Nummer in der Kundensicht");
  assert.ok(!Object.values(nums).includes(ORDER_NO), "interne Bestellnummer in der Kundensicht");
  assert.ok(!Object.values(nums).includes(4711), "interne ID in der Kundensicht");
});

test("orderConfirmationNumberOf: verschachtelte /book-Antwortform (routes/jumingo.js:4078)", () => {
  const CONFIRMATION_TEST_NO = "CE-TEST-AB26-00123";
  // CASE 1 — echte Produktions-/book-Antwort: nur die verschachtelte Form.
  const production = { shipmentId: "s1", ceShipmentId: 4711, invoiceNumber: "CE-RE26-00099",
    orderConfirmation: { number: CONFIRMATION_NO, issuedAt: "2026-08-24T00:00:00Z" } };
  assert.equal(orderConfirmationNumberOf(production), CONFIRMATION_NO);

  // CASE 2 — Sandbox-/Testbuchung: dieselbe verschachtelte Form, CE-TEST-AB-Kreis.
  const sandbox = { ...production, testBooking: true,
    orderConfirmation: { number: CONFIRMATION_TEST_NO, issuedAt: "2026-08-24T00:00:00Z" } };
  assert.equal(orderConfirmationNumberOf(sandbox), CONFIRMATION_TEST_NO);

  // CASE 3 — optionaler flacher Legacy-/Fixturewert (kein bekannter echter Endpunkt
  // liefert ihn mehr, aber ältere Mocks dürfen ihn weiterhin verwenden).
  const legacyFlat = { orderConfirmationNumber: "CE-AB26-00999" };
  assert.equal(orderConfirmationNumberOf(legacyFlat), "CE-AB26-00999");

  // CASE 4 — beide Formen gleichzeitig vorhanden und UNTERSCHIEDLICH: die verschachtelte,
  // reale Backendquelle muss gewinnen, nicht der flache Rückfall.
  const beide = { orderConfirmation: { number: CONFIRMATION_NO }, orderConfirmationNumber: "CE-AB26-00999" };
  assert.equal(orderConfirmationNumberOf(beide), CONFIRMATION_NO, "die verschachtelte Form muss Vorrang haben");

  // CASE 5 — keine CE-AB-Nummer vorhanden (kein orderConfirmation-Objekt entstanden):
  // keine erfundene Nummer, insbesondere kein CE-BS-, Provider- oder DB-ID-Rückfall.
  const ohneBestaetigung = { shipmentId: "s1", ceShipmentId: 4712, invoiceNumber: "CE-RE26-00100",
    businessOrderNumber: ORDER_NO, orderNumber: JUMINGO_NO, orderConfirmation: null };
  assert.equal(orderConfirmationNumberOf(ohneBestaetigung), null);

  // Negative Assertion: dieselbe Antwort trägt zusätzlich CE-BS, die externe JUMiNGO-
  // Ordernummer UND eine interne Shipment-ID neben der echten Auftragsbestätigung — nur
  // die Auftragsbestätigung darf zurückkommen, keiner der drei Altwerte.
  const mitAltwerten = { shipmentId: 123, businessOrderNumber: "CE-BS26-99999", orderNumber: "JUMINGO-123",
    orderConfirmation: { number: CONFIRMATION_NO } };
  const ergebnis = orderConfirmationNumberOf(mitAltwerten);
  assert.equal(ergebnis, CONFIRMATION_NO);
  assert.notEqual(ergebnis, "CE-BS26-99999");
  assert.notEqual(ergebnis, "JUMINGO-123");
  assert.notEqual(ergebnis, 123);
});

test("customerShipmentNumbers: nur kundensichtbare Werte, keine JUMiNGO-/DB-/CE-BS-Identifikatoren", () => {
  const s = { id: 9, business_order_number: ORDER_NO, order_confirmation_number: CONFIRMATION_NO,
    tracking_number: "1Z999", reference_number: "PO-4711",
    order_number: JUMINGO_NO, jumingo_shipment_id: "JMG-1" };
  const nums = customerShipmentNumbers(s);
  assert.deepEqual(nums, { orderConfirmationNumber: CONFIRMATION_NO, trackingNumber: "1Z999", customerReference: "PO-4711" });
  assert.equal(Object.keys(nums).length, 3, "Kundensicht darf keine weiteren Felder enthalten");
  assert.ok(!Object.values(nums).includes(ORDER_NO), "CE-BS in der Kundensicht");
});

test("adminShipmentNumbers: interne und externe Nummern strikt getrennt benannt", () => {
  const s = { id: 9, business_order_number: ORDER_NO, order_number: JUMINGO_NO, tracking_number: "1Z999", reference_number: "PO-4711" };
  const nums = adminShipmentNumbers(s);
  assert.equal(nums.businessOrderNumber, ORDER_NO);
  assert.equal(nums.jumingoOrderNumber, JUMINGO_NO);
  assert.notEqual(nums.businessOrderNumber, nums.jumingoOrderNumber, "Confidara- und JUMiNGO-Nummer verwechselt");
  assert.equal(nums.internalShipmentId, 9);
});

test("customerInvoiceNumbers: Rechnung trägt Rechnungs-, Vorgangs- und Kundennummer", () => {
  const inv = { id: 5, invoice_number: INVOICE_NO, business_order_number: ORDER_NO,
    order_confirmation_number: CONFIRMATION_NO, customer_number: CUSTOMER_NO };
  assert.deepEqual(customerInvoiceNumbers(inv), {
    invoiceNumber: INVOICE_NO, orderConfirmationNumber: CONFIRMATION_NO, customerNumber: CUSTOMER_NO,
  });
  // Auch hier: die vorhandene interne Bestellnummer wird NICHT mitgeliefert.
  assert.ok(!Object.values(customerInvoiceNumbers(inv)).includes(ORDER_NO), "CE-BS in der Rechnungssicht");
  // Legacy-Rechnung: nur die Rechnungsnummer bleibt.
  const legacy = customerInvoiceNumbers({ id: 5, invoice_number: INVOICE_NO });
  assert.equal(legacy.invoiceNumber, INVOICE_NO);
  assert.equal(legacy.orderConfirmationNumber, null);
  assert.equal(legacy.customerNumber, null);
});

test("Beschriftungen sind eindeutig und verwechseln die Nummernkreise nicht", () => {
  assert.equal(NUMBER_LABELS.customer, "Kundennummer");
  // GEÄNDERT (Nummernumstellung): die sichtbare Vorgangsnummer einer Versandbuchung
  // ist die Auftragsbestätigung (CE-AB…). Die interne Bestellnummer (CE-BS…) hat
  // GAR KEINE kundensichtbare Beschriftung mehr — es gibt bewusst keinen Schlüssel
  // dafür, damit sie nicht versehentlich wieder angezeigt werden kann.
  assert.equal(NUMBER_LABELS.orderConfirmation, "Auftragsbestätigung");
  assert.equal(NUMBER_LABELS.businessOrder, undefined, "die interne Bestellnummer hat wieder eine Beschriftung");
  assert.ok(!Object.values(NUMBER_LABELS).includes("Sendungsnummer"),
    "die frühere Beschriftung Sendungsnummer ist zurück");
  assert.equal(NUMBER_LABELS.invoice, "Rechnungsnummer");
  assert.equal(NUMBER_LABELS.jumingoOrder, "JUMiNGO-Ordernummer");
  // Die externe Beschriftung darf nicht mit der Vorgangsnummer verwechselbar sein.
  assert.notEqual(NUMBER_LABELS.jumingoOrder, NUMBER_LABELS.orderConfirmation);
  assert.ok(/JUMiNGO/.test(NUMBER_LABELS.jumingoOrder));
  // Die echte Kundenreferenz bleibt getrennt beschriftet — sie ist die Bestellnummer des Kunden.
  assert.equal(NUMBER_LABELS.customerReference, "Ihre Referenz");
  assert.notEqual(NUMBER_LABELS.customerReference, NUMBER_LABELS.orderConfirmation);
  // Und der neutrale Text für Altsendungen behauptet nichts Nachträgliches.
  assert.equal(NO_ORDER_CONFIRMATION_TEXT, "Ohne Vorgangsnummer");
  assert.notEqual(NO_ORDER_CONFIRMATION_TEXT, NOT_ASSIGNED_TEXT);
});

// ── Oberflächen-Verträge ────────────────────────────────────────────────────

test("(1–3) Kundenprofil zeigt customer_number, nicht editierbar, Legacy sicher", () => {
  const src = read("components/dashboard/Profile.jsx");
  assert.ok(src.includes("customerNumberOf(user)"), "Profil liest customer_number nicht");
  assert.ok(src.includes("NUMBER_LABELS.customer"), "Beschriftung 'Kundennummer' fehlt");
  assert.ok(src.includes("NOT_ASSIGNED_TEXT"), "Legacy-Konto ohne Nummer wird nicht neutral behandelt");
  // Nicht editierbar: die Kundennummer darf in keinem Patch-/Formularfeld auftauchen.
  const view = read("utils/profileView.mjs");
  assert.ok(!/customer_number/.test(view), "customer_number darf nicht Teil der Profil-Formularlogik sein");
  assert.ok(!/<input[^>]*customer/i.test(src), "Kundennummer darf kein Eingabefeld sein");
  assert.ok(!/user\?\.id|user\.id/.test(src.slice(src.indexOf("profile-account-customer-number"), src.indexOf("profile-meta-row"))),
    "interne users.id im Kundennummern-Block");
});

test("(4–5) Sendungsliste zeigt die Auftragsbestätigung und nutzt keinen Ersatzwert", () => {
  const src = read("components/dashboard/ShipmentsList.jsx");
  assert.ok(src.includes("customerShipmentNumbers(s)"), "Sendungsliste nutzt die zentrale Nummernsicht nicht");
  // GEÄNDERT (Nummernumstellung): die Spaltenüberschrift heißt „Auftragsbestätigung".
  assert.ok(/<th[^>]*>Auftragsbestätigung<\/th>/.test(src), "Spaltenüberschrift Auftragsbestätigung fehlt");
  assert.ok(!/<th[^>]*>(Sendungsnummer|Bestellnummer)<\/th>/.test(src), "eine alte Spaltenüberschrift lebt noch");
  assert.ok(src.includes("nums.orderConfirmationNumber"), "die Vorgangsnummer wird nicht gerendert");
  // Kein Fallback auf CE-BS, JUMiNGO- oder interne Werte in der Nummern-Zelle.
  const cell = src.slice(src.indexOf("nums.orderConfirmationNumber"), src.indexOf("</td>", src.indexOf("nums.orderConfirmationNumber")));
  assert.ok(!/jumingo_shipment_id|s\.id\b|order_number|business_order_number/.test(cell),
    "Ersatzwert in der Vorgangsnummern-Zelle");
  // Altsendungen bekommen einen neutralen Hinweis, keine Ersatznummer.
  assert.ok(cell.includes("NO_ORDER_CONFIRMATION_TEXT"), "Altsendungen tragen keinen neutralen Hinweis");
});

test("(6) Sendungsdetail trennt Vorgangs-, Tracking- und Kundenreferenz", () => {
  const src = read("components/dashboard/ShipmentsList.jsx");
  const block = src.slice(src.indexOf("shipment-detail-numbers"), src.indexOf("</dl>"));
  assert.ok(block.includes("NUMBER_LABELS.orderConfirmation"), "Auftragsbestätigung fehlt im Detail");
  assert.ok(!/businessOrder|business_order_number/.test(block), "die interne Bestellnummer steht im Kundendetail");
  assert.ok(block.includes("NUMBER_LABELS.tracking"), "Trackingnummer fehlt im Detail");
  assert.ok(block.includes("NUMBER_LABELS.customerReference"), "Kundenreferenz fehlt im Detail");
  // Kundensicht: keine JUMiNGO-/internen Identifikatoren im Detailblock.
  assert.ok(!/jumingo|order_number|s\.id\b/i.test(block), "interne/externe ID im Kunden-Sendungsdetail");
});

test("(7) Buchungserfolg zeigt Auftragsbestätigungs- und Rechnungsnummer getrennt", () => {
  const src = read("pages/BookingPage.jsx");
  const block = src.slice(src.indexOf("booking-success-numbers"), src.indexOf("booking-success-delivery"));
  assert.ok(block.includes("orderConfirmationNumberOf(booking)"), "Auftragsbestätigungsnummer fehlt im Erfolgsscreen");
  assert.ok(block.includes("booking.invoiceNumber"), "Rechnungsnummer fehlt im Erfolgsscreen");
  assert.ok(block.includes("NUMBER_LABELS.orderConfirmation") && block.includes("NUMBER_LABELS.invoice"),
    "Nummern nicht getrennt beschriftet");
  // Die Vorgangsnummer steht VOR der Rechnungsnummer.
  assert.ok(block.indexOf("orderConfirmationNumber") < block.indexOf("invoiceNumber"),
    "die Auftragsbestätigungsnummer muss zuerst stehen");
  // Kein CE-BS und keine Providerreferenz auf dem Erfolgsbildschirm.
  assert.ok(!/businessOrderNumber|business_order_number|jumingo/i.test(block),
    "interne Bestellnummer oder Providerreferenz im Erfolgsbildschirm");
});

test("(8) Rechnungsliste zeigt Rechnungs- und Auftragsbestätigungsnummer getrennt", () => {
  // Phase 5: die sechs fachlichen Bereiche fassen Rechnungs- und Vorgangsnummer in EINER
  // gemeinsamen "Rechnung"-Spalte zusammen (InvoiceNumberBlock) statt in zwei eigenen
  // <th>-Spalten — beide Werte bleiben aber weiterhin getrennt gelesen und dargestellt,
  // nie ineinander verschmolzen oder aus einer ID ersetzt.
  const src = read("components/dashboard/InvoicesList.jsx");
  assert.ok(/<th scope="col">Rechnung<\/th>/.test(src), "Spalte 'Rechnung' fehlt");
  assert.ok(src.includes("orderConfirmationNumberOf(inv)"), "Vorgangsnummer wird nicht gelesen");
  assert.ok(src.includes("inv.invoice_number"), "Rechnungsnummer fehlt");
  const fnStart = src.indexOf("function InvoiceNumberBlock");
  const cell = src.slice(fnStart, src.indexOf("\n}", fnStart));
  assert.ok(cell.includes("orderConfirmationNumberOf(inv)") && cell.includes("inv.invoice_number"),
    "Rechnungs- und Vorgangsnummer müssen beide in der Rechnungs-Zelle gelesen werden");
  assert.ok(!/order_number|jumingo|inv\.id\b|businessOrderNumberOf/.test(cell),
    "Ersatzwert in der Vorgangsnummern-Zelle");
  // Die interne Bestellnummer wird auf der ganzen Seite nicht mehr gelesen.
  assert.ok(!/businessOrderNumberOf|business_order_number/.test(src),
    "die Rechnungsliste liest weiterhin die interne Bestellnummer");
});

test("(9–10) Admin-Kundenliste und -detail zeigen die Kundennummer", () => {
  const list = read("pages/admin/AdminUsersPage.jsx");
  assert.ok(/<th scope="col">Kundennummer<\/th>/.test(list), "Spalte 'Kundennummer' fehlt");
  assert.ok(list.includes("f.customerNumber"), "Kundennummer wird nicht gelesen");
  const detail = read("pages/admin/AdminUserDetailPage.jsx");
  // Detail: identische Feldlesung wie die Liste, zusätzlich tolerant gegenüber
  // der Hülle des Detailendpunkts — nie aus der internen ID abgeleitet.
  assert.ok(/\["Kundennummer", customerNumber \|\| "—"\]/.test(detail), "Kundennummer fehlt im Kundendetail");
  assert.ok(detail.includes("customerNumberFromDetail(detailPayload, u)"), "Kundennummer wird nicht defensiv gelesen");
  const view = read("utils/adminCustomerView.mjs");
  assert.ok(/u\.customer_number, u\.customerNumber/.test(view), "nur das fachliche Feld wird gelesen");
  assert.ok(!/customerNumber[^\n]{0,40}\b(u\.id|user\.id|idOf\()/.test(view), "keine interne ID als Kundennummer");
});

test("(11) Admin-Sendungsansichten trennen Confidara- und JUMiNGO-Nummer", () => {
  const detail = read("pages/admin/AdminShipmentDetailPage.jsx");
  assert.ok(detail.includes("NUMBER_LABELS.orderConfirmation"), "Confidara-Vorgangsnummer fehlt");
  assert.ok(detail.includes("NUMBER_LABELS.jumingoOrder"), "JUMiNGO-Ordernummer nicht eigens beschriftet");
  assert.ok(detail.includes("orderConfirmationNumberOf(s)"), "Vorgangsnummer wird nicht gelesen");
  // Die alte, verwechselbare Beschriftung darf nicht mehr existieren.
  assert.ok(!/"Bestell-Nr\."/.test(detail), "alte Beschriftung 'Bestell-Nr.' für die JUMiNGO-Nummer");
  const list = read("pages/admin/AdminShipmentsPage.jsx");
  // Die Liste führt die Confidara-Vorgangsnummer als primären Wert der Spalte
  // „Sendung" (shipmentIdentity → orderConfirmationNumber), statt als eigene Spalte.
  // Die Trennung bleibt damit unverändert erhalten.
  assert.ok(/<th scope="col">Sendung<\/th>/.test(list), "Spalte 'Sendung' fehlt");
  assert.ok(list.includes("shipmentIdentity(row)"), "die Vorgangsnummer wird nicht als Kennung gelesen");
  const view = read("utils/adminShipmentView.mjs");
  assert.ok(/orderConfirmationNumber: str\(firstDefined\(r\.order_confirmation_number, r\.orderConfirmationNumber\)\)/.test(view),
    "die Vorgangsnummer wird nicht aus dem fachlichen Feld gelesen");
  assert.ok(/if \(f\.orderConfirmationNumber\) return \{ primary: f\.orderConfirmationNumber, kind: "order_confirmation" \}/.test(view),
    "die Auftragsbestätigungsnummer ist nicht die primäre Sendungskennung");
  // Die interne Bestellnummer bleibt im ADMIN-Datenmodell lesbar (technische Sicht),
  // führt dort aber keine Kennung mehr an.
  assert.ok(/businessOrderNumber: str\(firstDefined\(r\.business_order_number, r\.businessOrderNumber\)\)/.test(view),
    "das technische Legacy-Feld wurde entfernt");
  assert.ok(!/kind: "order_number"/.test(view), "die interne Bestellnummer ist wieder eine Sendungskennung");
  // Die JUMiNGO-Nummer erscheint in der Liste gar nicht mehr — noch klarere Trennung.
  assert.ok(!/jumingo/i.test(list), "die JUMiNGO-Kennung gehört nicht in die Sendungsliste");
});

test("(12) Admin-Rechnungsdetail zeigt Kunden-, Bestell- und Rechnungsnummer", () => {
  const src = read("pages/admin/AdminInvoiceDetailPage.jsx");
  const view = read("utils/adminInvoiceView.mjs");
  // Die Rechnungsnummer ist seit der UX-Bereinigung der Seitentitel (<h1>) statt einer
  // Feldzeile — sie bleibt die primäre Dokumentnummer und wird unverändert angezeigt.
  // Seit Paket E rendert den Titel der gemeinsame Seitenkopf (PageHeader), nicht
  // mehr ein eigener Kartenkopf; das <h1> selbst liegt in PageHeader.jsx.
  assert.ok(/title=\{`Rechnung \$\{number\}`\}/.test(src), "Rechnungsnummer ist nicht der Seitentitel");
  assert.ok(src.includes("const number = dash(invoiceNoOf(inv));"), "Rechnungsnummer wird nicht aus dem fachlichen Feld gelesen");
  // Vorgangsnummer: aus der Sendungsverknüpfung, eigen beschriftet, mit ehrlichem Legacy-Zustand.
  assert.ok(src.includes("NUMBER_LABELS.orderConfirmation") && src.includes("shipment.orderNumber"), "Vorgangsnummer fehlt");
  assert.ok(src.includes("SHIPMENT_NO_ORDER_NUMBER"), "fehlende Vorgangsnummer wird nicht ehrlich benannt");
  // Und die Quelle dieses Werts ist die Auftragsbestätigung, nicht CE-BS: eine
  // interne Bestellnummer unter der Beschriftung „Auftragsbestätigung" wäre eine
  // Falschaussage über ein Dokument, das es zu diesem Wert nicht gibt.
  assert.ok(/r\.shipment_order_confirmation_number, r\.shipmentOrderConfirmationNumber/.test(view),
    "die verknüpfte Sendung liefert nicht die Auftragsbestätigungsnummer");
  const linked = view.slice(view.indexOf("export function linkedShipment"), view.indexOf("\n}", view.indexOf("export function linkedShipment")));
  assert.ok(!/business_order_number|businessOrderNumber/.test(linked),
    "die Sendungsverknüpfung liest weiterhin die interne Bestellnummer");
  // Kundennummer: HISTORISCH aus dem Rechnungssnapshot, getrennt von den aktuellen Stammdaten.
  assert.ok(src.includes("NUMBER_LABELS.customer") && src.includes("recipient.customerNumber"), "Kundennummer fehlt");
  assert.ok(src.includes("account.customerNumber"), "aktuelle Kundennummer fehlt als getrennter Wert");
  // Keine Nummer wird aus einer technischen ID abgeleitet.
  assert.ok(/const customerNumber = str\(firstDefined\(r\.customer_number, r\.customerNumber\)\);/.test(view),
    "die historische Kundennummer stammt nicht ausschließlich aus dem fachlichen Snapshotfeld");
  assert.ok(/customerNumber: str\(firstDefined\(r\.current_customer_number, r\.currentCustomerNumber\)\)/.test(view),
    "die aktuelle Kundennummer stammt nicht aus dem eigenen Live-Feld");
  assert.ok(!/orderNumber[^\n]{0,60}\b(r\.id|r\.shipment_id|idOf\()/.test(view), "Vorgangsnummer aus einer ID abgeleitet");
  assert.ok(!/customerNumber[^\n]{0,60}\b(r\.id|r\.user_id|idOf\()/.test(view), "Kundennummer aus einer ID abgeleitet");
});

test("(13) kein sichtbarer Text bezeichnet die JUMiNGO-Ordernummer als Confidara-Bestellnummer", () => {
  // In allen Ansichten darf 'order_number' nie unter der Beschriftung 'Bestellnummer' stehen.
  for (const rel of ["pages/admin/AdminShipmentDetailPage.jsx", "pages/admin/AdminShipmentsPage.jsx",
    "components/dashboard/ShipmentsList.jsx", "components/dashboard/InvoicesList.jsx"]) {
    const src = read(rel);
    assert.ok(!/\[NUMBER_LABELS\.businessOrder,[^\]]*orderOf\(/.test(src), `JUMiNGO-Wert unter 'Bestellnummer' in ${rel}`);
    assert.ok(!/Bestellnummer[^\n]{0,80}\border_number\b/.test(src), `order_number als Bestellnummer beschriftet in ${rel}`);
  }
});

test("(14) kein interner DB-Identifier wird als Kundennummer dargestellt", () => {
  for (const rel of ["components/dashboard/Profile.jsx", "pages/admin/AdminUsersPage.jsx", "pages/admin/AdminUserDetailPage.jsx"]) {
    const code = readCode(rel);
    assert.ok(!/Kundennummer[^\n]{0,60}\b(u\.id|user\.id|idOf\()/.test(code), `interne ID als Kundennummer in ${rel}`);
  }
});

test("(15) keine Kreditlimit-/Kreditfreigabe-Aussagen in sichtbaren Texten", () => {
  // Geprüft wird der sichtbare CODE (ohne Kommentare): es darf keine Aussage geben, die ein
  // Kreditlimit/eine Kreditfreigabe behauptet. Erläuternde Kommentare („kennt kein Kreditlimit")
  // sind ausdrücklich zulässig und werden vorher entfernt.
  for (const rel of ["pages/admin/AdminInvoiceDetailPage.jsx", "pages/admin/AdminUserDetailPage.jsx",
    "pages/admin/AdminUsersPage.jsx", "components/dashboard/Profile.jsx",
    "components/dashboard/InvoicesList.jsx", "components/dashboard/ShipmentsList.jsx"]) {
    const code = readCode(rel);
    assert.ok(!/reservierten Kundenkredit|Kredit\s*frei|Kreditlimit|Kreditrahmen|credit_limit|credit_used/i.test(code),
      `Kreditlimit-/Kreditfreigabe-Text in ${rel}`);
  }
});

test("(16) Responsive/Barrierefreiheit: Nummern umbrechbar, Kopieraktion bedienbar", () => {
  const copy = read("components/ui/CopyableNumber.jsx");
  assert.ok(/<button/.test(copy), "Kopieraktion muss ein echter Button sein (Tastaturbedienung)");
  assert.ok(/aria-label=/.test(copy), "aria-label für die Kopieraktion fehlt");
  assert.ok(/role="status"/.test(copy) && /aria-live/.test(copy), "Rückmeldung nicht für Screenreader ausgezeichnet");
  assert.ok(/wordBreak/.test(copy), "lange Nummern müssen umbrechen können");
  // Auch in den Tabellen dürfen Nummern nicht abgeschnitten werden.
  assert.ok(/wordBreak: "break-all"/.test(read("components/dashboard/ShipmentsList.jsx")), "kein Umbruch für lange Nummern in ShipmentsList.jsx");
  // InvoicesList.jsx (Phase 5) setzt den Umbruch über eine CSS-Klasse statt eines Inline-Styles
  // (overflow-wrap statt word-break — funktional gleichwertig: lange Token brechen kontrolliert
  // um, statt die Spalte zu sprengen oder abgeschnitten zu werden).
  assert.ok(read("components/dashboard/InvoicesList.jsx").includes('className="inv-cell-number-value"'),
    "Rechnungsnummer nutzt nicht die umbruchfähige Zellklasse");
  const css = read("styles/dashboard.css");
  assert.ok(/\.inv-cell-number-value\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css),
    "kein Umbruch für lange Rechnungsnummern in dashboard.css (.inv-cell-number-value)");
});

test("(Tabellen) Spaltenanzahl und colSpan bleiben konsistent", () => {
  const src = read("components/dashboard/ShipmentsList.jsx");
  const head = src.slice(src.indexOf("<thead>"), src.indexOf("</thead>"));
  // <th[ >] statt <th>: die Zahlenspalten tragen seit Paket A, Phase 2.5 eine
  // Ausrichtungsklasse. Geprüft wird weiterhin die Spaltenzahl, nicht das Attribut.
  const cols = (head.match(/<th[ >]/g) || []).length;
  assert.equal(cols, 7, "Sendungsliste hat nicht die erwartete Spaltenzahl");
  const spans = [...src.matchAll(/colSpan=\{(\d+)\}/g)].map((m) => Number(m[1]));
  for (const sp of spans) assert.equal(sp, cols, `colSpan ${sp} passt nicht zu ${cols} Spalten`);
});

// ── Nummernumstellung: CE-AB ist die sichtbare Vorgangsnummer ───────────────
// Die interne Bestellnummer (business_order_number / CE-BS) bleibt TECHNISCH
// unverändert bestehen — Spalte, UNIQUE-Index, Zähler und Vergabe sind nicht
// angetastet. Geprüft wird hier ausschließlich, dass sie im aktiven sichtbaren
// Produkt nicht mehr als Geschäftsidentifier erscheint.

test("(N-a) Buchungserfolg und Sendungsliste zeigen die Auftragsbestätigung", () => {
  // Beide Oberflächen lesen dieselbe zentrale Beschriftung — es gibt keinen zweiten Text.
  assert.equal(NUMBER_LABELS.orderConfirmation, "Auftragsbestätigung");

  const booking = read("pages/BookingPage.jsx");
  assert.ok(booking.includes("NUMBER_LABELS.orderConfirmation"),
    "der Erfolgsbildschirm nutzt die zentrale Beschriftung nicht");
  assert.ok(booking.includes("orderConfirmationNumberOf(booking)"),
    "der Erfolgsbildschirm liest die Auftragsbestätigungsnummer nicht");

  const liste = read("components/dashboard/ShipmentsList.jsx");
  assert.ok(liste.includes("nums.orderConfirmationNumber"),
    "die Sendungsliste liest die Auftragsbestätigungsnummer nicht");
});

test("(N-b) KEINE kundensichtbare Oberfläche zeigt die interne Bestellnummer", () => {
  for (const rel of [
    "pages/BookingPage.jsx",
    "components/dashboard/ShipmentsList.jsx",
    "components/dashboard/OverviewModules.jsx",
    "components/dashboard/InvoicesList.jsx",
    "pages/inventory/OrderDetailPage.jsx",
  ]) {
    const src = readCode(rel);
    assert.ok(!/businessOrderNumber|business_order_number/.test(src),
      `${rel}: die interne Bestellnummer wird weiterhin angezeigt`);
    assert.ok(!/Sendungsnummer/.test(src),
      `${rel}: die Beschriftung „Sendungsnummer" lebt noch`);
  }
});

test("(N-c) die echte Referenz des KUNDEN bleibt unverändert erhalten", () => {
  // Gegenprobe: die Nummernumstellung darf die Kundenreferenz nicht mit entfernen.
  assert.equal(NUMBER_LABELS.customerReference, "Ihre Referenz");
  assert.ok(readCode("components/dashboard/ShipmentsList.jsx").includes("nums.customerReference"),
    "die Kundenreferenz wurde mit entfernt");
});

test("(N-d) das technische Feld existiert WEITERHIN — nur ohne Anzeige", () => {
  // Ausdrückliches Nicht-Ziel: businessOrderNumberOf bleibt als Leser bestehen,
  // damit Adminwerkzeuge und Altdaten weiterhin darauf zugreifen können.
  assert.equal(typeof businessOrderNumberOf, "function", "der Leser wurde entfernt");
  assert.equal(businessOrderNumberOf({ business_order_number: ORDER_NO }), ORDER_NO);
  // Und der Adminvertrag führt sie weiterhin.
  const nums = adminShipmentNumbers({ business_order_number: ORDER_NO });
  assert.equal(nums.businessOrderNumber, ORDER_NO);
});

test("(N-e) OrderDetailPage beschriftet Auftragsbestätigung und Trackingnummer korrekt", () => {
  const src = readCode("pages/inventory/OrderDetailPage.jsx");
  assert.ok(/<th[^>]*>Auftragsbestätigung<\/th>/.test(src), "Spaltenüberschrift Auftragsbestätigung fehlt");
  assert.ok(/<th[^>]*>Trackingnummer<\/th>/.test(src), "Spaltenüberschrift Trackingnummer fehlt");
  assert.ok(src.includes("s.orderConfirmationNumber"), "die Auftragsbestätigungsnummer wird nicht gelesen");
  assert.ok(src.includes("s.trackingNumber"), "die Trackingnummer wird nicht gelesen");
  // Die Zellenreihenfolge folgt den Spaltenüberschriften.
  const iAb = src.indexOf("s.orderConfirmationNumber");
  const iCarrier = src.indexOf("s.carrier");
  const iTracking = src.indexOf("s.trackingNumber");
  assert.ok(iAb < iCarrier && iCarrier < iTracking,
    "die Zellenreihenfolge passt nicht mehr zu den Spaltenüberschriften");
});

test("(N-f) systemweit: keine Providerreferenz als sichtbarer Identifier", () => {
  assert.equal(NUMBER_LABELS.tracking, "Trackingnummer");
  assert.notEqual(NUMBER_LABELS.orderConfirmation, NUMBER_LABELS.tracking,
    "Vorgangs- und Trackingnummer dürfen nie dieselbe Beschriftung tragen");

  // Der frühere Rückfall `businessOrderNumber || orderNumber` im Admin-Storno zeigte
  // eine JUMiNGO-Ordernummer als primäre Zelle. Er darf nicht zurückkehren.
  const storno = readCode("utils/adminCancellations.mjs");
  assert.ok(!/\|\|\s*s\.orderNumber/.test(storno),
    "der Admin-Storno fällt wieder auf die JUMiNGO-Ordernummer zurück");
  assert.ok(/const number = s\.orderConfirmationNumber \|\| ""/.test(storno),
    "die Storno-Zelle nutzt nicht die Auftragsbestätigungsnummer");
});
