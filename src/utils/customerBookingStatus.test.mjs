// Package C (C4): eine Sendung in Buchungsklärung in der Kundensicht — neutraler Status,
// beruhigender Satz, keine Aktion, kein Anbieter. Reine Logik plus Quelltextanker auf
// kommentarfreiem Code; das Verhalten im Browser misst tests/e2e/customerBookingStatus.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BOOKING_IN_REVIEW_STATUS, BOOKING_IN_REVIEW_TEXT, isBookingInReview } from "./customerBookingStatus.mjs";
import { canRequestCancellation } from "./customerCancellation.mjs";
import { computeKpis, isActive } from "./kpis.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(hier, rel), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — die Zusagen: exakter Status und exakter Satz", () => {
  assert.equal(BOOKING_IN_REVIEW_STATUS, "booking");
  assert.equal(BOOKING_IN_REVIEW_TEXT.badge, "Buchungsstatus wird geprüft");
  assert.equal(BOOKING_IN_REVIEW_TEXT.note, "Sie müssen aktuell nichts tun.");
  assert.ok(Object.isFrozen(BOOKING_IN_REVIEW_TEXT));
  const alles = Object.values(BOOKING_IN_REVIEW_TEXT).join(" ");
  assert.ok(!/transglobal|jumingo|anbieter|provider|fehler|erneut|nochmal/i.test(alles), `unzulässiger Text: ${alles}`);
});

test("2 — nur der exakte Serverwert gilt als Buchungsklärung", () => {
  assert.equal(isBookingInReview({ id: 1, status: "booking" }), true);
  for (const s of [{ status: "booked" }, { status: "label_ready" }, { status: "draft" }, { status: "Booking" },
                   { status: " booking" }, { status: null }, {}, null, undefined]) {
    assert.equal(isBookingInReview(s), false, `fälschlich als Buchungsklärung erkannt: ${JSON.stringify(s)}`);
  }
});

test("3 — keine Stornierung und keine aktive Sendung — wie die Serverstatistik", () => {
  const s = { id: 7, status: "booking", cancellation_status: null, created_at: new Date().toISOString() };
  assert.equal(canRequestCancellation(s), false, "eine Buchungsklärung ist stornierbar");
  assert.equal(isActive(s), false, "eine Buchungsklärung zählt als aktive Sendung");
  assert.equal(computeKpis([s]).active, 0);
});

test("4 — Statusbadge: booking zeigt den neutralen Satz, kein Rohwert", () => {
  const badge = ohneKommentare(lies("../components/ui/StatusBadge.jsx"));
  assert.match(badge, /import \{ BOOKING_IN_REVIEW_TEXT \} from "\.\.\/\.\.\/utils\/customerBookingStatus\.mjs";/);
  assert.match(badge, /booking:\s*\["badge-yellow",\s*BOOKING_IN_REVIEW_TEXT\.badge\]/);
});

test("5 — Sendungsliste: die Buchungsklärung zeigt den Satz statt jeder Aktion — in Tabelle und Karte", () => {
  const liste = ohneKommentare(lies("../components/dashboard/ShipmentsList.jsx"));
  assert.match(liste, /import \{ BOOKING_IN_REVIEW_TEXT, isBookingInReview \} from "\.\.\/\.\.\/utils\/customerBookingStatus\.mjs";/);
  const aktionen = liste.slice(liste.indexOf("function ShipmentRowActions("), liste.indexOf("function ShipmentTrackingDetail("));
  const iWeiche = aktionen.indexOf("if (isBookingInReview(s)) {");
  const iErsterKnopf = aktionen.indexOf("<button");
  assert.ok(iWeiche > 0 && iErsterKnopf > iWeiche, "die Weiche steht nicht vor den Knöpfen");
  const zweig = aktionen.slice(iWeiche, aktionen.indexOf("\n  return (", iWeiche));
  assert.ok(zweig.includes("{BOOKING_IN_REVIEW_TEXT.note}"), "der Satz fehlt");
  for (const verboten of ["<button", "onTrack", "onDocuments", "onCancel", "Stornieren", "Sendung verfolgen", "DOCUMENTS_TEXT"]) {
    assert.ok(!zweig.includes(verboten), `die Buchungsklärung trägt ${verboten}`);
  }
  // Beide Darstellungen nutzen dieselbe Komponente — die Weiche gilt damit in Tabelle UND Karte.
  assert.equal((liste.match(/<ShipmentRowActions /g) || []).length, 2);
  assert.ok(!/erneut buchen|nochmal buchen|noch einmal buchen/i.test(liste), "die Liste bietet ein erneutes Buchen an");
  assert.ok(!/\bs\.provider\b|provider_booking_reference|provider_service_id/.test(liste), "die Liste liest Anbieterfelder");
});
