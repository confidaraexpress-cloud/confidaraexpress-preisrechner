// Referenzauftrag 2026-11-05 — die Referenznummer am Buchungsfeld und ihre Übernahme aus einem Lagerauftrag.
//
//   B5  keine stille Kürzung, keine stillen Zeichenänderungen; Länge und unzulässige Zeichen sichtbar
//   B3  der Satz am Feld folgt ausschließlich der Aussage des Angebots (`referenceOnLabel`)
//   B4  die Kundenreferenz eines Lagerauftrags wird ungekürzt zum bearbeitbaren Vorschlag
//
// Run: node --test src/utils/referenceNumber.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeReferenceInput, referenceLength, referenceInputProblem, referenceLabelHint,
  REFERENCE_MAX_LENGTH, REFERENCE_LABEL_TEXT,
} from "./referenceNumber.mjs";
import { mapOrderPrefillToShipment, orderReferenceProposal } from "./inventoryShipmentHandoff.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => fs.readFileSync(path.join(hier, rel), "utf8");
const Z = (n) => String.fromCharCode(n);

/* ══════════ B5 — keine stille Veränderung ══════════════════════════════════════════════ */

test("1 — sichtbare Zeichen bleiben vollständig erhalten, auch über 35 Zeichen und mit < >", () => {
  const vierzig = "Bestellung 0042/Ä-Ö ü ß é KST-12 Z9 2026";
  assert.equal(sanitizeReferenceInput(vierzig), vierzig);
  assert.equal(sanitizeReferenceInput("<4711>"), "<4711>");
  assert.equal(sanitizeReferenceInput("000123"), "000123", "führende Nullen bleiben Text");
  assert.equal(sanitizeReferenceInput(`A${Z(0)}B${Z(0x202e)}C${Z(10)}D`), "ABCD", "nur Unsichtbares geht");
});

test("2 — die Länge zählt wie die Buchungsschranke: getrimmt, in UTF-16-Einheiten", () => {
  assert.equal(referenceLength("  PO-1  "), 4);
  assert.equal(referenceLength(String.fromCodePoint(0x1f600)), 2, "ein Emoji zählt wie im Backend doppelt");
  assert.equal(referenceLength(null), 0);
});

test("3 — die Meldung nennt genau die Gründe, die das Backend ablehnt — sonst keine", () => {
  for (const ok of ["", "   ", "A1", "x".repeat(35), "Bestellung 0042/Ä-Ö ü ß é KST-12 Z9", "000123"]) {
    assert.equal(referenceInputProblem(ok), null, JSON.stringify(ok));
  }
  const zuLang = referenceInputProblem("x".repeat(36));
  assert.equal(zuLang.code, "too_long");
  assert.match(zuLang.message, /36 Zeichen/);
  assert.match(zuLang.message, new RegExp(`höchstens ${REFERENCE_MAX_LENGTH}`));
  assert.equal(referenceInputProblem("<4711>").code, "forbidden_chars");
  assert.equal(referenceInputProblem("a>b").code, "forbidden_chars");
  assert.equal(REFERENCE_MAX_LENGTH, 35, "die Buchungsgrenze bleibt 35");
});

/* ══════════ B3 — der Satz am Feld ═══════════════════════════════════════════════════════ */

test("4 — je Aussage genau ein Satz; ohne Aussage keiner", () => {
  assert.deepEqual(referenceLabelHint({ referenceOnLabel: "printed", referenceLabelVerifiedLength: 20, value: "PO-4711" }),
    { status: "printed", text: REFERENCE_LABEL_TEXT.printed, caveat: null });
  assert.deepEqual(referenceLabelHint({ referenceOnLabel: "transmitted", value: "PO-4711" }),
    { status: "transmitted", text: REFERENCE_LABEL_TEXT.transmitted, caveat: null });
  assert.deepEqual(referenceLabelHint({ referenceOnLabel: "not_supported", value: "PO-4711" }),
    { status: "not_supported", text: REFERENCE_LABEL_TEXT.not_supported, caveat: null });
  for (const unbekannt of [undefined, null, "", "garantiert", "PRINTED"]) {
    assert.equal(referenceLabelHint({ referenceOnLabel: unbekannt, value: "PO" }), null, String(unbekannt));
  }
  assert.match(REFERENCE_LABEL_TEXT.not_supported, /erscheint Ihre Referenz nicht auf dem Versandlabel/);
  assert.match(REFERENCE_LABEL_TEXT.not_supported, /ConfidaraExpress-Dokumenten erhalten/);
});

test("5 — `printed` verspricht nur das Belegte: über der belegten Länge oder mit Sonderzeichen ein Zusatz", () => {
  const belegt = { referenceOnLabel: "printed", referenceLabelVerifiedLength: 17 };
  assert.equal(referenceLabelHint({ ...belegt, value: "BESTELLUNG-4711" }).caveat, null);
  assert.equal(referenceLabelHint({ ...belegt, value: "PO 4711/2026" }).caveat, null, "Leerzeichen und / sind belegt");
  const lang = referenceLabelHint({ ...belegt, value: "BESTELLUNG-2026-0042-XY" });
  assert.match(lang.caveat, /bis 17 Zeichen/);
  assert.match(lang.caveat, /gekürzt oder abweichend/);
  assert.ok(referenceLabelHint({ ...belegt, value: "Müller-4711" }).caveat, "Umlaut ohne Zusatz");
  // Keine Garantie- oder Anbieterbegriffe in irgendeinem Satz.
  for (const t of [...Object.values(REFERENCE_LABEL_TEXT), lang.caveat]) {
    assert.doesNotMatch(t, /garant|transglobal|jumingo|portal|provider/i, t);
  }
});

/* ══════════ B4 — die Auftragsreferenz als Vorschlag ══════════════════════════════════════ */

const PREFILL = (customerReference) => ({
  order: { id: "77", orderNumber: "CE-AU26-01005", customerReference },
  recipient: { company: "Beispiel AG", fullName: "Erika Beispiel", streetAndNumber: "Beispielweg 2", postalCode: "10115", city: "Berlin", country: "DE" },
  suggestedWeightKg: null,
});

test("6 — ohne Auftragsreferenz kein Vorschlag; mit ihr ein eingeschalteter Vorschlag", () => {
  for (const leer of [undefined, null, "", "   "]) {
    assert.equal(mapOrderPrefillToShipment(PREFILL(leer)).booking, null, JSON.stringify(leer));
  }
  assert.deepEqual(mapOrderPrefillToShipment(PREFILL("  PO-4711  ")).booking, { reference: "PO-4711", referenceEnabled: true });
});

test("7 — eine lange Auftragsreferenz (bis 80) wird NICHT gekürzt — das Feld meldet die Buchungsgrenze", () => {
  const achtzig = "AUFTRAG-".padEnd(80, "X");
  const v = orderReferenceProposal({ customerReference: achtzig });
  assert.equal(v.reference, achtzig);
  assert.equal(referenceInputProblem(v.reference).code, "too_long");
  assert.equal(orderReferenceProposal({ customerReference: `A${Z(0x2066)}B` }).reference, "AB", "nur Unsichtbares geht");
});

test("8 — die Übernahme überschreibt keine bereits eingegebene Buchungsreferenz", () => {
  const seite = lies("../pages/NewShipmentPage.jsx");
  assert.match(seite, /if \(prefillInventory\.booking && !String\(flowBookingState\?\.reference \|\| ""\)\.trim\(\)\) \{\s*setFlowBooking\(prefillInventory\.booking\);/,
    "der Vorschlag wird ohne Rücksicht auf eine vorhandene Referenz gesetzt");
});

test("9 — die Buchungsseite liest Aussage und Länge ausschließlich aus dem Angebot und prüft vor dem Request", () => {
  const seite = lies("../pages/BookingPage.jsx");
  assert.match(seite, /referenceOnLabel: tariff\?\.referenceOnLabel/);
  assert.match(seite, /referenceLabelVerifiedLength: tariff\?\.referenceLabelVerifiedLength/);
  // Zweifache Absicherung: Weiter-Schritt und Buchen enden ohne Request, solange die Referenz nicht passt.
  assert.equal((seite.match(/if \(referenzProblem\) \{/g) || []).length, 2);
  const modul = lies("../components/booking/AdditionalOptionsModule.jsx");
  const referenzfeld = modul.slice(modul.indexOf('id="booking-reference"'), modul.indexOf('id="booking-reference-error"'));
  assert.ok(referenzfeld.length > 0, "Referenzfeld nicht gefunden");
  assert.doesNotMatch(referenzfeld, /maxLength=/, "das Referenzfeld kappt wieder still");
  assert.match(modul, /data-reference-on-label=\{referenceLabelHint\.status\}/);
});
