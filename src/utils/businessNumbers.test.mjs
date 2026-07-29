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
  NUMBER_LABELS, NOT_ASSIGNED_TEXT,
  displayNumber, hasNumber, numberOrNotAssigned,
  customerNumberOf, businessOrderNumberOf, invoiceNumberOf,
  jumingoOrderNumberOf, trackingNumberOf, customerReferenceOf,
  customerShipmentNumbers, adminShipmentNumbers, customerInvoiceNumbers,
} from "./businessNumbers.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
// Kommentare entfernen — geprüft wird der tatsächlich gerenderte CODE, nicht die Doku
// (Kommentare nennen die Abgrenzungen bewusst beim Namen, z. B. „nie aus user.id").
const readCode = (rel) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CUSTOMER_NO = "CE-K-10030";
const ORDER_NO = "CE-BS26-00001";
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

test("Bestellnummer fällt NIEMALS auf JUMiNGO-Werte oder interne IDs zurück", () => {
  const legacyShipment = { id: 4711, jumingo_shipment_id: "JMG-SHIP-123", order_number: JUMINGO_NO, business_order_number: null };
  assert.equal(businessOrderNumberOf(legacyShipment), null, "Legacy-Sendung darf keine Bestellnummer erfinden");
  // Die externe Nummer ist nur über die EIGENE Funktion lesbar.
  assert.equal(jumingoOrderNumberOf(legacyShipment), JUMINGO_NO);
  const nums = customerShipmentNumbers(legacyShipment);
  assert.equal(nums.businessOrderNumber, null);
  assert.ok(!Object.values(nums).includes(JUMINGO_NO), "JUMiNGO-Nummer in der Kundensicht");
  assert.ok(!Object.values(nums).includes(4711), "interne ID in der Kundensicht");
});

test("customerShipmentNumbers: nur kundensichtbare Werte, keine JUMiNGO-/DB-Identifikatoren", () => {
  const s = { id: 9, business_order_number: ORDER_NO, tracking_number: "1Z999", reference_number: "PO-4711",
    order_number: JUMINGO_NO, jumingo_shipment_id: "JMG-1" };
  const nums = customerShipmentNumbers(s);
  assert.deepEqual(nums, { businessOrderNumber: ORDER_NO, trackingNumber: "1Z999", customerReference: "PO-4711" });
  assert.equal(Object.keys(nums).length, 3, "Kundensicht darf keine weiteren Felder enthalten");
});

test("adminShipmentNumbers: interne und externe Nummern strikt getrennt benannt", () => {
  const s = { id: 9, business_order_number: ORDER_NO, order_number: JUMINGO_NO, tracking_number: "1Z999", reference_number: "PO-4711" };
  const nums = adminShipmentNumbers(s);
  assert.equal(nums.businessOrderNumber, ORDER_NO);
  assert.equal(nums.jumingoOrderNumber, JUMINGO_NO);
  assert.notEqual(nums.businessOrderNumber, nums.jumingoOrderNumber, "Confidara- und JUMiNGO-Nummer verwechselt");
  assert.equal(nums.internalShipmentId, 9);
});

test("customerInvoiceNumbers: Rechnung trägt Rechnungs-, Bestell- und Kundennummer", () => {
  const inv = { id: 5, invoice_number: INVOICE_NO, business_order_number: ORDER_NO, customer_number: CUSTOMER_NO };
  assert.deepEqual(customerInvoiceNumbers(inv), {
    invoiceNumber: INVOICE_NO, businessOrderNumber: ORDER_NO, customerNumber: CUSTOMER_NO,
  });
  // Legacy-Rechnung: nur die Rechnungsnummer bleibt.
  const legacy = customerInvoiceNumbers({ id: 5, invoice_number: INVOICE_NO });
  assert.equal(legacy.invoiceNumber, INVOICE_NO);
  assert.equal(legacy.businessOrderNumber, null);
  assert.equal(legacy.customerNumber, null);
});

test("Beschriftungen sind eindeutig und verwechseln die Nummernkreise nicht", () => {
  assert.equal(NUMBER_LABELS.customer, "Kundennummer");
  assert.equal(NUMBER_LABELS.businessOrder, "Bestellnummer");
  assert.equal(NUMBER_LABELS.invoice, "Rechnungsnummer");
  assert.equal(NUMBER_LABELS.jumingoOrder, "JUMiNGO-Ordernummer");
  // Die externe Beschriftung darf nicht schlicht „Bestellnummer" lauten.
  assert.notEqual(NUMBER_LABELS.jumingoOrder, NUMBER_LABELS.businessOrder);
  assert.ok(/JUMiNGO/.test(NUMBER_LABELS.jumingoOrder));
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

test("(4–5) Sendungsliste zeigt die Bestellnummer und nutzt keine JUMiNGO-ID als Ersatz", () => {
  const src = read("components/dashboard/ShipmentsList.jsx");
  assert.ok(src.includes("customerShipmentNumbers(s)"), "Sendungsliste nutzt die zentrale Nummernsicht nicht");
  assert.ok(/<th>Bestellnummer<\/th>/.test(src), "Spalte 'Bestellnummer' fehlt");
  assert.ok(src.includes("nums.businessOrderNumber"), "Bestellnummer wird nicht gerendert");
  // Kein Fallback auf JUMiNGO-/interne Werte in der Nummern-Zelle.
  const cell = src.slice(src.indexOf("nums.businessOrderNumber"), src.indexOf("</td>", src.indexOf("nums.businessOrderNumber")));
  assert.ok(!/jumingo_shipment_id|s\.id\b|order_number/.test(cell), "Ersatzwert in der Bestellnummern-Zelle");
});

test("(6) Sendungsdetail trennt Bestell-, Tracking- und Kundenreferenz", () => {
  const src = read("components/dashboard/ShipmentsList.jsx");
  const block = src.slice(src.indexOf("shipment-detail-numbers"), src.indexOf("</dl>"));
  assert.ok(block.includes("NUMBER_LABELS.businessOrder"), "Bestellnummer fehlt im Detail");
  assert.ok(block.includes("NUMBER_LABELS.tracking"), "Trackingnummer fehlt im Detail");
  assert.ok(block.includes("NUMBER_LABELS.customerReference"), "Kundenreferenz fehlt im Detail");
  // Kundensicht: keine JUMiNGO-/internen Identifikatoren im Detailblock.
  assert.ok(!/jumingo|order_number|s\.id\b/i.test(block), "interne/externe ID im Kunden-Sendungsdetail");
});

test("(7) Buchungserfolg zeigt Bestell- und Rechnungsnummer getrennt", () => {
  const src = read("pages/BookingPage.jsx");
  const block = src.slice(src.indexOf("booking-success-numbers"), src.indexOf("booking-success-delivery"));
  assert.ok(block.includes("booking.businessOrderNumber"), "Bestellnummer fehlt im Erfolgsscreen");
  assert.ok(block.includes("booking.invoiceNumber"), "Rechnungsnummer fehlt im Erfolgsscreen");
  assert.ok(block.includes("NUMBER_LABELS.businessOrder") && block.includes("NUMBER_LABELS.invoice"),
    "Nummern nicht getrennt beschriftet");
  // Bestellnummer steht VOR der Rechnungsnummer (primäre Vorgangsnummer).
  assert.ok(block.indexOf("businessOrderNumber") < block.indexOf("invoiceNumber"),
    "Bestellnummer muss zuerst stehen");
});

test("(8) Rechnungsliste zeigt Rechnungs- und Bestellnummer getrennt", () => {
  const src = read("components/dashboard/InvoicesList.jsx");
  assert.ok(/<th>Rechnungsnummer<\/th>/.test(src) && /<th>Bestellung<\/th>/.test(src), "Spalten fehlen");
  assert.ok(src.includes("businessOrderNumberOf(inv)"), "Bestellnummer wird nicht gelesen");
  assert.ok(src.includes("inv.invoice_number"), "Rechnungsnummer fehlt");
  const cell = src.slice(src.indexOf("businessOrderNumberOf(inv)"), src.indexOf("</td>", src.indexOf("businessOrderNumberOf(inv)")));
  assert.ok(!/order_number|jumingo|inv\.id/.test(cell), "Ersatzwert in der Bestellnummern-Zelle");
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
  assert.ok(detail.includes("NUMBER_LABELS.businessOrder"), "Confidara-Bestellnummer fehlt");
  assert.ok(detail.includes("NUMBER_LABELS.jumingoOrder"), "JUMiNGO-Ordernummer nicht eigens beschriftet");
  assert.ok(detail.includes("businessOrderNumberOf(s)"), "Bestellnummer wird nicht gelesen");
  // Die alte, verwechselbare Beschriftung darf nicht mehr existieren.
  assert.ok(!/"Bestell-Nr\."/.test(detail), "alte Beschriftung 'Bestell-Nr.' für die JUMiNGO-Nummer");
  const list = read("pages/admin/AdminShipmentsPage.jsx");
  // Die Liste führt die Confidara-Bestellnummer seit der UX-Bereinigung als
  // primären Wert der Spalte „Sendung" (shipmentIdentity → businessOrderNumber),
  // statt als eigene Spalte. Die Trennung bleibt damit unverändert erhalten.
  assert.ok(/<th scope="col">Sendung<\/th>/.test(list), "Spalte 'Sendung' fehlt");
  assert.ok(list.includes("shipmentIdentity(row)"), "Bestellnummer wird nicht als Kennung gelesen");
  const view = read("utils/adminShipmentView.mjs");
  assert.ok(/businessOrderNumber: str\(firstDefined\(r\.business_order_number, r\.businessOrderNumber\)\)/.test(view),
    "die Bestellnummer wird nicht aus dem fachlichen Feld gelesen");
  assert.ok(/if \(f\.businessOrderNumber\) return \{ primary: f\.businessOrderNumber, kind: "order_number" \}/.test(view),
    "die Bestellnummer ist nicht die primäre Sendungskennung");
  // Die JUMiNGO-Nummer erscheint in der Liste gar nicht mehr — noch klarere Trennung.
  assert.ok(!/jumingo/i.test(list), "die JUMiNGO-Kennung gehört nicht in die Sendungsliste");
});

test("(12) Admin-Rechnungsdetail zeigt Kunden-, Bestell- und Rechnungsnummer", () => {
  const src = read("pages/admin/AdminInvoiceDetailPage.jsx");
  const view = read("utils/adminInvoiceView.mjs");
  // Die Rechnungsnummer ist seit der UX-Bereinigung der Seitentitel (<h1>) statt einer
  // Feldzeile — sie bleibt die primäre Dokumentnummer und wird unverändert angezeigt.
  assert.ok(/<h1 className="adm-detail-id">Rechnung \{number\}<\/h1>/.test(src), "Rechnungsnummer ist nicht der Seitentitel");
  assert.ok(src.includes("const number = dash(invoiceNoOf(inv));"), "Rechnungsnummer wird nicht aus dem fachlichen Feld gelesen");
  // Bestellnummer: aus der Sendungsverknüpfung, eigen beschriftet, mit ehrlichem Legacy-Zustand.
  assert.ok(src.includes("NUMBER_LABELS.businessOrder") && src.includes("shipment.orderNumber"), "Bestellnummer fehlt");
  assert.ok(src.includes("SHIPMENT_NO_ORDER_NUMBER"), "fehlende Bestellnummer wird nicht ehrlich benannt");
  // Kundennummer: HISTORISCH aus dem Rechnungssnapshot, getrennt von den aktuellen Stammdaten.
  assert.ok(src.includes("NUMBER_LABELS.customer") && src.includes("recipient.customerNumber"), "Kundennummer fehlt");
  assert.ok(src.includes("account.customerNumber"), "aktuelle Kundennummer fehlt als getrennter Wert");
  // Keine Nummer wird aus einer technischen ID abgeleitet.
  assert.ok(/const customerNumber = str\(firstDefined\(r\.customer_number, r\.customerNumber\)\);/.test(view),
    "die historische Kundennummer stammt nicht ausschließlich aus dem fachlichen Snapshotfeld");
  assert.ok(/customerNumber: str\(firstDefined\(r\.current_customer_number, r\.currentCustomerNumber\)\)/.test(view),
    "die aktuelle Kundennummer stammt nicht aus dem eigenen Live-Feld");
  assert.ok(!/orderNumber[^\n]{0,60}\b(r\.id|r\.shipment_id|idOf\()/.test(view), "Bestellnummer aus einer ID abgeleitet");
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
  for (const rel of ["components/dashboard/ShipmentsList.jsx", "components/dashboard/InvoicesList.jsx"]) {
    assert.ok(/wordBreak: "break-all"/.test(read(rel)), `kein Umbruch für lange Nummern in ${rel}`);
  }
});

test("(Tabellen) Spaltenanzahl und colSpan bleiben konsistent", () => {
  const src = read("components/dashboard/ShipmentsList.jsx");
  const head = src.slice(src.indexOf("<thead>"), src.indexOf("</thead>"));
  const cols = (head.match(/<th>/g) || []).length;
  assert.equal(cols, 7, "Sendungsliste hat nicht die erwartete Spaltenzahl");
  const spans = [...src.matchAll(/colSpan=\{(\d+)\}/g)].map((m) => Number(m[1]));
  for (const sp of spans) assert.equal(sp, cols, `colSpan ${sp} passt nicht zu ${cols} Spalten`);
});
