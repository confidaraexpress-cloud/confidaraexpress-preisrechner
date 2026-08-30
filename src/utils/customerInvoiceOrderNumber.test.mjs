/* Die Auftragsbestätigungsnummer erscheint kundenseitig nicht mehr in der
 * Rechnungsansicht — und BLEIBT überall sonst erhalten.
 *
 * Die Rechnungsansicht des Kundenportals trug unter der Rechnungsnummer eine
 * zweite Zeile mit der Auftragsbestätigungsnummer (CE-AB…), ersatzweise den Text
 * „Ohne Vorgangsnummer“. Sie bezeichnet den AUFTRAG, nicht die Zahlungsforderung;
 * die Rechnungsansicht soll die Rechnung zeigen.
 *
 * Entfernt wird ausschließlich die ANZEIGE. Diese Datei hält beide Hälften fest —
 * gerade die zweite: eine Datenentfernung wäre der Fehler, gegen den hier geprüft wird.
 *
 * Run: node --test src/utils/customerInvoiceOrderNumber.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pruefeImTestlauf } from "../../scripts/governance.mjs";
import { orderConfirmationNumberOf } from "./businessNumbers.mjs";

const lies = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");
// Gescannt wird der CODE, nicht die Begründung darüber: die Kommentare an den
// betroffenen Stellen nennen den entfernten Aufruf ausdrücklich, damit ihn niemand
// versehentlich zurückholt.
const nurCode = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const INVOICES_LIST = "src/components/dashboard/InvoicesList.jsx";

/* ── T3: kundenseitig unsichtbar ─────────────────────────────────────────── */

test("T3 — die Kundenrechnungsansicht liest keine Auftragsbestätigungsnummer", () => {
  const code = nurCode(lies(INVOICES_LIST));
  assert.ok(!/orderConfirmationNumberOf/.test(code),
    "die Rechnungsansicht liest die Auftragsbestätigungsnummer wieder");
  assert.ok(!/order_confirmation_number/.test(code));
  assert.ok(!/businessOrderNumberOf|business_order_number/.test(code),
    "die interne Bestellnummer ist zurück");
});

test("T3b — kein Platzhalter an der frei gewordenen Stelle", () => {
  const code = nurCode(lies(INVOICES_LIST));
  // Der frühere Rückfalltext beschrieb eine Datenlücke, die den Kunden nichts angeht.
  assert.ok(!/Ohne Vorgangsnummer/.test(code));
  // Und es steht kein Ersatzzeichen dort: die Zelle rendert genau EIN Element.
  const start = code.indexOf("function InvoiceNumberBlock");
  const zelle = code.slice(start, code.indexOf("\n}", start));
  assert.equal((zelle.match(/<span/g) || []).length, 1,
    "die Rechnungszelle rendert wieder zwei Zeilen");
  assert.ok(/inv\.invoice_number/.test(zelle), "die Rechnungsnummer fehlt");
  assert.ok(!/[„"]—[”"]|>—</.test(zelle), "Gedankenstrich als Platzhalter");
});

test("T3c — die tote CSS-Regel der zweiten Zeile ist entfernt", () => {
  assert.ok(!/\.inv-cell-order\b/.test(lies("src/styles/dashboard.css")),
    ".inv-cell-order ist ohne Verwendung zurückgeblieben");
});

/* ── T4: die Daten bleiben vollständig erhalten ──────────────────────────── */

test("T4 — der Auslesehelfer funktioniert unverändert", () => {
  // `orderConfirmationNumberOf` wurde NICHT entfernt oder eingeschränkt — nur ein
  // Aufrufer weniger. Der Wert kommt aus dem eingefrorenen Leistungs-Snapshot.
  assert.equal(orderConfirmationNumberOf({ order_confirmation_number: "CE-AB26-00087" }), "CE-AB26-00087");
  assert.equal(orderConfirmationNumberOf({ orderConfirmationNumber: "CE-AB26-00088" }), "CE-AB26-00088");
  // Ohne Wert liefert der Helfer unverändert `null` — er erfindet nie eine Nummer.
  assert.equal(orderConfirmationNumberOf({}), null);
  assert.equal(orderConfirmationNumberOf(null), null);
});

test("T4b — die übrigen Aufrufer sind unberührt", () => {
  // Sendungsliste, Übersicht und Erfolgsbildschirm zeigen die Nummer weiterhin: dort
  // bezeichnet sie den Vorgang, um den es tatsächlich geht.
  // Der Erfolgsbildschirm ist seit seiner Auslagerung components/booking/BookingSuccessStep.jsx.
  // Gemessen an `pages/BookingPage.jsx` bestand diese Zusage zuletzt nur noch, weil dort ein
  // TOTER Import von `orderConfirmationNumberOf` stehen geblieben war — die Anzeige selbst war
  // längst umgezogen. Genau die Sorte stiller Fehlschluss, gegen die diese Prüfungen gebaut sind:
  // der Test war grün, ohne noch etwas zu messen. Der tote Import ist entfernt, der Messpunkt
  // zeigt auf die Datei, in der die Nummer tatsächlich angezeigt wird.
  for (const datei of [
    "src/components/dashboard/ShipmentsList.jsx",
    "src/components/dashboard/OverviewModules.jsx",
    "src/components/booking/BookingSuccessStep.jsx",
  ]) {
    assert.ok(/orderConfirmationNumber/.test(nurCode(lies(datei))),
      `${datei}: die Auftragsbestätigungsnummer ist dort verschwunden`);
  }
});

test("T4c — die Adminsicht ist nicht mitgeändert worden", () => {
  // §9: Admin bleibt, wie er ist. Die Kundenrechnungsansicht und die Adminrechnungssicht
  // sind getrennte Komponenten — es gibt keine gemeinsame, die nach Kontext aufzuteilen wäre.
  // Die Adminrechnungssicht liest die Nummer über ihr eigenes Auswertungsmodul.
  assert.ok(/shipment_order_confirmation_number/.test(nurCode(lies("src/utils/adminInvoiceView.mjs"))),
    "die Adminsicht hat die Auftragsbestätigungsnummer verloren");
  // Admin und Kunde teilen sich KEINE Rechnungskomponente — es gibt deshalb nichts nach
  // Kontext aufzuteilen, und die Kundenänderung kann den Admin gar nicht erreichen.
  assert.ok(!/InvoicesList/.test(nurCode(lies("src/pages/admin/AdminInvoiceDetailPage.jsx"))));
  assert.ok(!/InvoicesList/.test(nurCode(lies("src/pages/admin/AdminInvoicesPage.jsx"))));
});

test("T5 — es wurde nichts an Beträgen oder Status geändert", () => {
  // Die Rechnungsansicht liest ihre Zahlen unverändert aus denselben Feldern.
  const code = nurCode(lies(INVOICES_LIST));
  assert.ok(/inv\.gross_amount \?\? inv\.amount/.test(code), "die Betragsquelle hat sich geändert");
  assert.ok(/paymentStatus\(inv\)/.test(code), "die Zahlungsstatuslogik hat sich geändert");
  assert.ok(/invoicePeriod\(inv\)/.test(code), "die Datumslogik hat sich geändert");
});

test("T6 — diese Datei läuft im Unit-Testlauf tatsächlich mit", () => {
  pruefeImTestlauf("src/utils/customerInvoiceOrderNumber.test.mjs");
});
