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
  // GEÄNDERT (Go-Live Paket 1): CE-BS heißt sichtbar „Sendungsnummer". „Bestellnummer" ist
  // auf einem Beleg die Nummer, unter der der KUNDE bestellt hat — und die steht als
  // customerReference direkt daneben. Der technische Schlüssel `businessOrder` und die
  // Datenquelle business_order_number sind unverändert.
  assert.equal(NUMBER_LABELS.businessOrder, "Sendungsnummer");
  assert.equal(NUMBER_LABELS.invoice, "Rechnungsnummer");
  assert.equal(NUMBER_LABELS.jumingoOrder, "JUMiNGO-Ordernummer");
  // Die externe Beschriftung darf nicht schlicht „Bestellnummer" lauten.
  assert.notEqual(NUMBER_LABELS.jumingoOrder, NUMBER_LABELS.businessOrder);
  assert.ok(/JUMiNGO/.test(NUMBER_LABELS.jumingoOrder));
  // Die echte Kundenreferenz bleibt getrennt beschriftet — sie ist die Bestellnummer des Kunden.
  assert.equal(NUMBER_LABELS.customerReference, "Ihre Referenz");
  assert.notEqual(NUMBER_LABELS.customerReference, NUMBER_LABELS.businessOrder);
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

test("(4–5) Sendungsliste zeigt die Sendungsnummer und nutzt keine JUMiNGO-ID als Ersatz", () => {
  const src = read("components/dashboard/ShipmentsList.jsx");
  assert.ok(src.includes("customerShipmentNumbers(s)"), "Sendungsliste nutzt die zentrale Nummernsicht nicht");
  // GEÄNDERT (Go-Live Paket 1): die Spaltenüberschrift heißt „Sendungsnummer".
  assert.ok(/<th[^>]*>Sendungsnummer<\/th>/.test(src), "Spalte 'Sendungsnummer' fehlt");
  assert.ok(!/<th[^>]*>Bestellnummer<\/th>/.test(src), "die alte Spaltenüberschrift lebt noch");
  assert.ok(src.includes("nums.businessOrderNumber"), "die Nummer wird nicht gerendert");
  // Kein Fallback auf JUMiNGO-/interne Werte in der Nummern-Zelle.
  const cell = src.slice(src.indexOf("nums.businessOrderNumber"), src.indexOf("</td>", src.indexOf("nums.businessOrderNumber")));
  assert.ok(!/jumingo_shipment_id|s\.id\b|order_number/.test(cell), "Ersatzwert in der Sendungsnummern-Zelle");
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
  // Phase 5: die sechs fachlichen Bereiche fassen Rechnungs- und Bestellnummer in EINER
  // gemeinsamen "Rechnung"-Spalte zusammen (InvoiceNumberBlock) statt in zwei eigenen
  // <th>-Spalten — beide Werte bleiben aber weiterhin getrennt gelesen und dargestellt,
  // nie ineinander verschmolzen oder aus einer ID ersetzt.
  const src = read("components/dashboard/InvoicesList.jsx");
  assert.ok(/<th scope="col">Rechnung<\/th>/.test(src), "Spalte 'Rechnung' fehlt");
  assert.ok(src.includes("businessOrderNumberOf(inv)"), "Bestellnummer wird nicht gelesen");
  assert.ok(src.includes("inv.invoice_number"), "Rechnungsnummer fehlt");
  const fnStart = src.indexOf("function InvoiceNumberBlock");
  const cell = src.slice(fnStart, src.indexOf("\n}", fnStart));
  assert.ok(cell.includes("businessOrderNumberOf(inv)") && cell.includes("inv.invoice_number"),
    "Rechnungs- und Bestellnummer müssen beide in der Rechnungs-Zelle gelesen werden");
  assert.ok(!/order_number|jumingo|inv\.id\b/.test(cell), "Ersatzwert in der Bestellnummern-Zelle");
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
  // Seit Paket E rendert den Titel der gemeinsame Seitenkopf (PageHeader), nicht
  // mehr ein eigener Kartenkopf; das <h1> selbst liegt in PageHeader.jsx.
  assert.ok(/title=\{`Rechnung \$\{number\}`\}/.test(src), "Rechnungsnummer ist nicht der Seitentitel");
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

// ── Go-Live Paket 1: CE-BS heißt sichtbar „Sendungsnummer" ──────────────────
// Die technische Nummer (business_order_number / businessOrderNumber / CE-BS) ist
// unverändert; geprüft wird ausschließlich die kundensichtbare BESCHRIFTUNG.

test("(P1-a) Buchungserfolg und Sendungsliste beschriften CE-BS als „Sendungsnummer\"", () => {
  // Beide Oberflächen lesen dieselbe zentrale Beschriftung — es gibt keinen zweiten Text.
  assert.equal(NUMBER_LABELS.businessOrder, "Sendungsnummer");

  const booking = read("pages/BookingPage.jsx");
  assert.ok(booking.includes("NUMBER_LABELS.businessOrder"),
    "der Erfolgsbildschirm nutzt die zentrale Beschriftung nicht");
  assert.ok(booking.includes("booking.businessOrderNumber"),
    "der Erfolgsbildschirm liest das CE-BS-Feld nicht mehr");

  const liste = read("components/dashboard/ShipmentsList.jsx");
  assert.ok(/<th[^>]*>Sendungsnummer<\/th>/.test(liste), "Spaltenüberschrift der Sendungsliste");
  assert.ok(liste.includes("NUMBER_LABELS.businessOrder"),
    "die Kartenansicht der Sendungsliste nutzt die zentrale Beschriftung nicht");
});

test("(P1-b) keine dieser Oberflächen nennt CE-BS noch „Bestellnummer\"", () => {
  // Gezielt: das Wort als sichtbare Beschriftung NEBEN dem CE-BS-Feld. Kommentare und
  // echte Kundenreferenzen bleiben ausdrücklich erlaubt (siehe P1-c).
  for (const rel of ["pages/BookingPage.jsx", "components/dashboard/ShipmentsList.jsx"]) {
    const src = read(rel)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")   // JSX-Kommentare
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/<th[^>]*>Bestellnummer<\/th>/.test(src), `${rel}: Spaltenüberschrift „Bestellnummer" lebt noch`);
    assert.ok(!/"Bestellnummer"/.test(src), `${rel}: literale Beschriftung „Bestellnummer" lebt noch`);
  }
});

test("(P1-c) die echte Bestellnummer des KUNDEN darf weiterhin so heißen", () => {
  // Gegenprobe: das Referenzfeld der Buchung beschreibt ausdrücklich die Bestellnummer des
  // Kunden. Dieser Text darf von der Umbenennung NICHT erfasst worden sein.
  const optionen = read("components/booking/AdditionalOptionsModule.jsx");
  assert.ok(/Referenznummer \/ Bestellnummer/.test(optionen),
    "die Beschriftung der Kundenreferenz wurde fälschlich mit umbenannt");
  assert.ok(/z\. B\. Bestellnummer, Kostenstelle/.test(optionen),
    "der Platzhalter der Kundenreferenz wurde fälschlich mit umbenannt");
  // Und die zentrale Beschriftung der Kundenreferenz bleibt getrennt.
  assert.equal(NUMBER_LABELS.customerReference, "Ihre Referenz");
});

test("(P1-d) das technische Feld wurde NICHT umbenannt", () => {
  // Schlüssel, Feldname und Nummernkreis bleiben unverändert — es ist eine Beschriftung.
  assert.ok(Object.prototype.hasOwnProperty.call(NUMBER_LABELS, "businessOrder"),
    "der Schlüssel businessOrder wurde umbenannt");
  const modul = read("utils/businessNumbers.mjs");
  assert.ok(/business_order_number/.test(modul), "die Datenquelle business_order_number fehlt");
  assert.ok(/businessOrderNumber/.test(modul), "der Snapshot-Schlüssel businessOrderNumber fehlt");
  assert.ok(/CE-BS/.test(modul), "der Nummernkreis CE-BS wurde verändert");
});

test("(P1-e) OrderDetailPage beschriftet CE-BS und Trackingnummer korrekt", () => {
  // Die Tabelle „Verbundene Sendungen" trug beide Beschriftungen verkehrt herum:
  //   „Bestellnummer"  stand über businessOrderNumber (= CE-BS, die Sendungsnummer)
  //   „Sendungsnummer" stand über trackingNumber      (= Carrier-Trackingnummer)
  // Ein isoliertes Umbenennen der ersten Spalte hätte zwei gleichnamige Spalten erzeugt —
  // deshalb wurden beide gemeinsam korrigiert. Die Felder selbst sind unverändert.
  const src = read("pages/inventory/OrderDetailPage.jsx");

  // Die Seite trägt ZWEI Tabellen: zuerst „Auftragspositionen mit Reservierungsstand",
  // danach „Sendungen zu diesem Auftrag". Ein `indexOf("<thead>")` auf der ganzen Datei
  // greift die ERSTE — also die falsche, in der es weder eine Sendungs- noch eine
  // Trackingnummer gibt. Deshalb wird ab der Beschriftung der Sendungstabelle geschnitten.
  const tabelle = src.slice(src.indexOf("Sendungen zu diesem Auftrag"));
  assert.ok(tabelle, "die Tabelle 'Sendungen zu diesem Auftrag' fehlt");
  const kopf = tabelle.slice(tabelle.indexOf("<thead>"), tabelle.indexOf("</thead>"));

  assert.ok(/<th[^>]*>Sendungsnummer<\/th>/.test(kopf), "Spalte 'Sendungsnummer' fehlt");
  assert.ok(/<th[^>]*>Trackingnummer<\/th>/.test(kopf), "Spalte 'Trackingnummer' fehlt");
  assert.ok(!/<th[^>]*>Bestellnummer<\/th>/.test(kopf),
    "CE-BS wird in OrderDetailPage weiterhin als 'Bestellnummer' beschriftet");

  // Jede Beschriftung genau EINMAL — sonst stünden zwei gleichnamige Spalten nebeneinander.
  for (const label of ["Sendungsnummer", "Trackingnummer"]) {
    const treffer = kopf.match(new RegExp(`<th[^>]*>${label}</th>`, "g")) || [];
    assert.equal(treffer.length, 1, `Spalte '${label}' steht ${treffer.length}× im Tabellenkopf`);
  }

  // Die Datenfelder sind unverändert und stehen weiterhin in derselben Spaltenreihenfolge:
  // Sendungsnummer → businessOrderNumber, Carrier → carrier, Trackingnummer → trackingNumber.
  const koerper = tabelle.slice(tabelle.indexOf("<tbody>"), tabelle.indexOf("</tbody>"));
  const iBusiness = koerper.indexOf("s.businessOrderNumber");
  const iCarrier  = koerper.indexOf("s.carrier");
  const iTracking = koerper.indexOf("s.trackingNumber");
  assert.ok(iBusiness > -1 && iCarrier > -1 && iTracking > -1, "ein Datenfeld der Tabelle fehlt");
  assert.ok(iBusiness < iCarrier && iCarrier < iTracking,
    "die Zellenreihenfolge passt nicht mehr zu den Spaltenüberschriften");
});

test("(P1-f) systemweit: CE-BS heißt Sendungsnummer, die Carriernummer Trackingnummer", () => {
  // Zusammenfassende Zusage über alle kundensichtbaren Oberflächen dieses Pakets.
  assert.equal(NUMBER_LABELS.businessOrder, "Sendungsnummer");
  assert.equal(NUMBER_LABELS.tracking, "Trackingnummer");
  assert.notEqual(NUMBER_LABELS.businessOrder, NUMBER_LABELS.tracking,
    "Sendungs- und Trackingnummer dürfen nie dieselbe Beschriftung tragen");

  // Keine dieser drei Oberflächen beschriftet CE-BS noch als „Bestellnummer".
  for (const rel of [
    "pages/BookingPage.jsx",
    "components/dashboard/ShipmentsList.jsx",
    "pages/inventory/OrderDetailPage.jsx",
  ]) {
    assert.ok(!/<th[^>]*>Bestellnummer<\/th>/.test(readCode(rel)),
      `${rel}: Spaltenüberschrift „Bestellnummer" lebt noch`);
  }

  // Gegenprobe bleibt: die echte Bestellnummer des KUNDEN darf weiterhin so heißen.
  assert.ok(/Referenznummer \/ Bestellnummer/.test(read("components/booking/AdditionalOptionsModule.jsx")),
    "die Beschriftung der Kundenreferenz wurde fälschlich mit umbenannt");
});
