// src/utils/creditNoteUx.test.mjs — Storno-Abwicklung und Gutschrift im Frontend.
//
// „Das Frontend entscheidet nichts."
//
// Es rechnet keinen Erstattungsbetrag, es sendet keinen, und es stößt beim
// Versanddienstleister nichts an. Diese Datei prüft genau das — zusammen mit den
// drei Aussagen, die die Oberfläche machen MUSS: der Providerstorno läuft
// außerhalb, die Gutschrift ist eine eigene Aktion, und die Rechnung bleibt
// bestehen.
//
// Run: node --test src/utils/creditNoteUx.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
// Quelltextzusicherungen auf KOMMENTARFREIEM Code: sonst belegt eine Erklärung
// eine Zusicherung, die der ausgeführte Code gar nicht trägt.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const viewSrc = stripComments(read("src/utils/creditNoteView.mjs"));
const sectionSrc = stripComments(read("src/components/admin/CancellationSettlementSection.jsx"));
const listSrc = stripComments(read("src/components/dashboard/CreditNotesSection.jsx"));
const invoicesSrc = stripComments(read("src/components/dashboard/InvoicesList.jsx"));
const adminApiSrc = stripComments(read("src/api/adminApi.js"));

const {
  providerCancellationMeta, providerStatusOptions, allowedProviderTargets,
  isProviderSectionEnabled, creditNoteAction, refundStatusMeta,
  normalizeCreditNote, normalizeCreditNoteList,
  invoiceCreditInfo, invoiceCreditLine,
  CREDIT_NOTE_EXPLANATION,
} = await import("./creditNoteView.mjs");

// ══ A. Providerstorno ═══════════════════════════════════════════════════════

test("A1 — vier Zustände, kein roher Backendwert im Text", () => {
  for (const s of ["not_started", "pending", "confirmed", "failed"]) {
    const [cls, label] = providerCancellationMeta(s);
    assert.ok(cls && label, `${s} ohne Anzeige`);
    assert.ok(!label.includes("_"), `roher Wert im Label: ${label}`);
  }
  const [, unknown] = providerCancellationMeta("voellig_neu");
  assert.equal(unknown, "Unbekannter Status");
});

test("A2 — 'confirmed' ist terminal, 'failed' bleibt änderbar", () => {
  // Der Carrier hat storniert — das nimmt niemand zurück. Ein zweiter Versuch
  // nach einem Fehlschlag ist dagegen ein realer Betreibervorgang.
  assert.deepEqual(allowedProviderTargets("confirmed"), []);
  assert.deepEqual(providerStatusOptions("confirmed").map((o) => o.value), ["confirmed"]);
  assert.deepEqual(allowedProviderTargets("failed").sort(), ["confirmed", "pending"]);
});

test("A3 — der Stand lässt sich erst nach Annahme nachtragen", () => {
  assert.equal(isProviderSectionEnabled("accepted"), true);
  for (const s of ["pending", "in_review", "rejected", undefined]) {
    assert.equal(isProviderSectionEnabled(s), false,
      `${s}: sonst stünde am Vorgang, der Carrier habe storniert, während die Sendung weiterläuft`);
  }
});

test("A4 — die Oberfläche sagt, dass sie beim Dienstleister NICHTS auslöst", () => {
  assert.match(sectionSrc, /außerhalb dieses Portals durchgeführt/);
  assert.match(sectionSrc, /es wird nichts beim Dienstleister ausgelöst/);
});

// ══ B. Die Gutschrift ist eine EIGENE Aktion ════════════════════════════════

test("B1 — ohne bestätigten Providerstorno kein Erstellknopf", () => {
  const a = creditNoteAction({ cancellationStatus: "accepted", providerStatus: "pending" });
  assert.equal(a.canCreate, false);
  assert.equal(a.reason, "provider_open");
  assert.ok(a.hint.length > 20, "der Grund muss lesbar dastehen");
});

test("B2 — ohne angenommene Anfrage kein Erstellknopf", () => {
  const a = creditNoteAction({ cancellationStatus: "in_review", providerStatus: "confirmed" });
  assert.equal(a.canCreate, false);
  assert.equal(a.reason, "not_accepted");
});

test("B3 — mit angenommener Anfrage UND bestätigtem Storno erscheint der Knopf", () => {
  const a = creditNoteAction({ cancellationStatus: "accepted", providerStatus: "confirmed" });
  assert.equal(a.canCreate, true);
  assert.equal(a.hint, "");
});

test("B4 — eine bestehende Gutschrift schließt eine zweite aus", () => {
  const a = creditNoteAction({
    cancellationStatus: "accepted", providerStatus: "confirmed",
    existingCreditNote: { id: 1, creditNoteNumber: "CE-GU26-00001" },
  });
  assert.equal(a.canCreate, false);
  assert.equal(a.reason, "exists");
});

test("B5 — die Erstellung ist ein EIGENER Knopf, kein Seiteneffekt der Statusänderung", () => {
  // Zwei getrennte Handler, zwei getrennte Endpunkte. Würde die Providerbestätigung
  // die Gutschrift miterzeugen, entstünde sie irgendwann versehentlich — und ein
  // ausgestellter Beleg lässt sich nicht zurücknehmen.
  assert.match(sectionSrc, /const saveProvider = async/);
  assert.match(sectionSrc, /const createCreditNote = async/);
  const save = sectionSrc.slice(sectionSrc.indexOf("const saveProvider"), sectionSrc.indexOf("const createCreditNote"));
  assert.ok(!/createCreditNoteForCancellation/.test(save),
    "die Providerbestätigung darf keine Gutschrift auslösen");
});

// ══ C. Kein Betrag aus dem Frontend ═════════════════════════════════════════

test("C1 — die Erstellung sendet KEINEN Body", () => {
  const fn = adminApiSrc.slice(
    adminApiSrc.indexOf("export function createCreditNoteForCancellation"),
    adminApiSrc.indexOf("const CREDIT_NOTE_PARAMS"));
  assert.ok(fn.length > 50);
  assert.ok(!/body:/.test(fn), "kein Body — der Betrag entsteht serverseitig");
  assert.ok(!/amount|betrag|percent/i.test(fn));
});

test("C2 — nirgends wird ein Erstattungsbetrag gerechnet", () => {
  for (const [name, src] of [["creditNoteView.mjs", viewSrc], ["CancellationSettlementSection", sectionSrc],
                             ["CreditNotesSection", listSrc]]) {
    assert.ok(!/\*\s*0\.19|vatRate\s*\*|netAmount\s*\*|grossAmount\s*\*/.test(src), `${name}: keine Steuerrechnung`);
    assert.ok(!/calculateCustomerPrice|markup/i.test(src), `${name}: kein Aufschlag`);
  }
});

test("C3 — 0 ist ein Wert, kein Fehlen", () => {
  // Eine Falsy-Prüfung auf einem Betrag hätte aus jeder 0 ein „fehlt" gemacht.
  assert.match(viewSrc, /Number\.isFinite/);
  const cn = normalizeCreditNote({ creditNoteNumber: "X", grossAmount: 0, insuranceGross: 0 });
  assert.equal(cn.grossAmount, 0);
  assert.equal(cn.insuranceGross, 0);
});

// ══ D. Normalisierung ═══════════════════════════════════════════════════════

test("D1 — camelCase und snake_case ergeben dieselbe kanonische Form", () => {
  const a = normalizeCreditNote({ id: 5, creditNoteNumber: "CE-GU26-00001", grossAmount: "28.80",
    invoiceNumber: "CE-RE26-00042", refundStatus: "open", documentStatus: "ready" });
  const b = normalizeCreditNote({ id: 5, credit_note_number: "CE-GU26-00001", gross_amount: "28.80",
    invoice_number: "CE-RE26-00042", refund_status: "open", document_status: "ready" });
  assert.deepEqual(a, b);
  assert.equal(a.grossAmount, 28.8);
  assert.equal(a.downloadAvailable, true);
});

test("D2 — eine kaputte Antwort ergibt eine leere Liste, keinen Absturz", () => {
  assert.deepEqual(normalizeCreditNoteList(null), []);
  assert.deepEqual(normalizeCreditNoteList({}), []);
  assert.deepEqual(normalizeCreditNoteList({ creditNotes: "nein" }), []);
});

test("D3 — der Erstattungsstand ist rein organisatorisch beschriftet", () => {
  assert.equal(refundStatusMeta("open")[1], "Erstattung offen");
  assert.equal(refundStatusMeta("refunded")[1], "Erstattet");
  assert.equal(refundStatusMeta("kaputt")[1], "Unbekannter Status");
  // Kein Guthaben, kein Wallet, keine Verrechnung.
  assert.ok(!/guthaben|wallet|verrechn/i.test(viewSrc));
});

// ══ E. Die Rechnung bleibt bestehen ═════════════════════════════════════════

test("E1 — ohne Gutschrift sieht die Rechnungszeile exakt aus wie bisher", () => {
  const info = invoiceCreditInfo({ amount: "28.80" });
  assert.equal(info.hasCredit, false);
  assert.equal(invoiceCreditLine({ amount: "28.80" }, (v) => `${v} EUR`), null,
    "ohne Gutschrift entsteht KEINE zweite Zeile");
});

test("E2 — eine teilweise gutgeschriebene Rechnung zeigt Gutschrift UND Restbetrag", () => {
  const inv = { amount: "28.80", credited_amount: "11.90", effective_amount: "16.90" };
  const info = invoiceCreditInfo(inv);
  assert.equal(info.hasCredit, true);
  assert.equal(info.credited, 11.9);
  assert.equal(info.effective, 16.9);
  assert.equal(info.fullyCredited, false);
  const line = invoiceCreditLine(inv, (v) => `${v} EUR`);
  assert.match(line, /11\.9 EUR/);
  assert.match(line, /16\.9 EUR/);
});

test("E3 — eine vollständig gutgeschriebene Rechnung wird als solche benannt", () => {
  const inv = { amount: "28.80", credited_amount: "28.80", effective_amount: "0.00" };
  const info = invoiceCreditInfo(inv);
  assert.equal(info.fullyCredited, true);
  assert.match(invoiceCreditLine(inv, (v) => `${v} EUR`), /Vollständig gutgeschrieben/);
});

test("E4 — der Kunde liest ausdrücklich, dass die Rechnung bestehen bleibt", () => {
  assert.match(CREDIT_NOTE_EXPLANATION, /Rechnung bleibt unverändert bestehen/);
  assert.match(listSrc, /CREDIT_NOTE_EXPLANATION/);
});

test("E5 — der ausgestellte Rechnungsbetrag bleibt die führende Zahl", () => {
  // Die Gutschriftzeile kommt UNTER den Betrag, sie ersetzt ihn nicht.
  const block = invoicesSrc.slice(invoicesSrc.indexOf("function AmountBlock"),
    invoicesSrc.indexOf("function PaymentStatusCell"));
  const wertIdx = block.indexOf("inv-amount-value");
  const creditIdx = block.indexOf("inv-amount-credit");
  assert.ok(wertIdx > -1 && creditIdx > wertIdx, "die Gutschriftzeile steht unter dem Betrag");
  assert.ok(/creditLine &&/.test(block), "ohne Gutschrift wird nichts gerendert");
});

// ══ F. Gutschriften sind eine eigene Liste ══════════════════════════════════

test("F1 — Gutschriften stehen in einem EIGENEN Abschnitt, nicht in der Rechnungsliste", () => {
  // Zwei Dokumentarten unter einer Überschrift hätten die Frage „wie viel schulde
  // ich?" unbeantwortbar gemacht.
  assert.match(invoicesSrc, /<CreditNotesSection \/>/);
  assert.match(listSrc, /aria-label="Gutschriften"/);
});

test("F2 — ohne Gutschriften erscheint gar kein Abschnitt", () => {
  assert.match(listSrc, /if \(!items \|\| items\.length === 0\) return null;/);
});

test("F3 — ein noch nicht fertiges Dokument bekommt keinen Knopf ins Leere", () => {
  assert.match(listSrc, /downloadAvailable \?/);
  assert.match(listSrc, /Beleg wird erstellt/);
});

test("F4 — der Download läuft über den authentifizierten Blobweg", () => {
  assert.match(listSrc, /downloadCustomerCreditNotePdf/);
  const dl = stripComments(read("src/utils/downloadInvoicePdf.js"));
  assert.match(dl, /\/kunde\/credit-notes\/\$\{encodeURIComponent\(String\(id\)\)\}\/pdf/);
  assert.ok(!/window\.open|<a href="http/.test(dl), "keine öffentliche URL");
});

test("F5 — die Tabelle ist beschriftet und Zahlen stehen rechtsbündig", () => {
  assert.match(listSrc, /<caption className="sr-only">/);
  assert.match(listSrc, /<th scope="col" className="ce-num">Betrag<\/th>/);
  assert.match(listSrc, /<td className="ce-num">/);
  // Unter schmalen Viewports Karten statt gequetschter Tabelle.
  assert.match(listSrc, /className="inv-cards"/);
});
