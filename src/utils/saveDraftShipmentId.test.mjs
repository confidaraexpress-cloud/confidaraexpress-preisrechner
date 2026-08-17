// Regression: „Als Entwurf speichern" bekam die Providerreferenz statt der CE-ID.
//
// ─── Der Fehler ──────────────────────────────────────────────────────────────
// `/calculate-price` liefert ZWEI IDs mit STRIKT verschiedener Bedeutung:
//
//   shipmentId    JUMiNGO-/Providerreferenz ("s_"+32 Hex) — Eingabe für /book,
//                 Abholzeitfenster und Handelsrechnung.
//   ceShipmentId  ConfidaraExpress-Sendungshandle (shipments.id) desselben
//                 Entwurfs — providerneutral, für Entwurfsoperationen.
//
// Die Kette lief so:
//   NewShipmentPage  setShipmentId(d.shipmentId)              → Providerreferenz
//   navigate("/booking", { state: { … shipmentId … } })
//   BookingPage      <SaveDraftAction shipmentId={bookingData?.shipmentId} />
//   SaveDraftAction  if (!hasSavableShipmentId(shipmentId)) return null;
//
// `hasSavableShipmentId` verlangt korrekt die interne numerische ID und lehnt
// die JUMiNGO-Form ab (POST /api/kunde/drafts/:id/save löst ausschließlich
// shipments.id auf). Ergebnis: die Aktion rendert `null` — produktiv dauerhaft
// unsichtbar, ohne Fehlermeldung.
//
// ─── Die Korrektur ───────────────────────────────────────────────────────────
// Die QUELLE wurde korrigiert, nicht der Guard: der Entwurfsdatensatz existierte
// die ganze Zeit, seine ID wurde nur nie zurückgegeben (`RETURNING id` fehlte).
// `hasSavableShipmentId` bleibt unverändert streng.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { hasSavableShipmentId } from "./draftsView.mjs";
import { hasUsableShipmentReference } from "./formDraftsView.mjs";
import { normalizeScope, dropOffers } from "./shippingFlowState.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const bookingPage     = read("../pages/BookingPage.jsx");
const newShipmentPage = read("../pages/NewShipmentPage.jsx");
const saveDraftAction = read("../components/booking/SaveDraftAction.jsx");

// Die beiden IDs in ihren ECHTEN Formen (JUMiNGO OpenAPI 1.0.4 / shipments.id SERIAL).
const JUMINGO_ID = "s_fb1bc92aba1c4d70a3eaa44d687ae179";
const CE_ID = 4711;

// Antwort von /calculate-price, wie das Backend sie liefert.
const CALC_PRICE_ANTWORT = { shipmentId: JUMINGO_ID, ceShipmentId: CE_ID, tariffs: [] };

/* ══════════ 1 — Der Fehler, exakt reproduziert ═══════════════════════════ */

test("1 — REPRODUKTION: die Providerreferenz lässt die Aktion verschwinden", () => {
  // Genau der alte Zustand: bookingData.shipmentId = Providerreferenz.
  const altesBookingData = { shipmentId: CALC_PRICE_ANTWORT.shipmentId };
  assert.equal(hasSavableShipmentId(altesBookingData.shipmentId), false,
    "der Guard müsste die JUMiNGO-Form ablehnen — sonst prüft dieser Test nichts");
  // → SaveDraftAction rendert `null`. Das war der produktive Zustand.
});

test("2 — KORREKTUR: der CE-Handle macht die Aktion sichtbar", () => {
  const neuesBookingData = { shipmentId: CALC_PRICE_ANTWORT.shipmentId, ceShipmentId: CALC_PRICE_ANTWORT.ceShipmentId };
  assert.equal(hasSavableShipmentId(neuesBookingData.ceShipmentId), true);
});

/* ══════════ 2 — Der echte Callsite, nicht nur die Hilfsfunktion ══════════ */

test("3 — CALLSITE: die von BookingPage übergebene Eigenschaft besteht den Guard", () => {
  // Der Property-Name wird aus dem Quelltext GELESEN, nicht angenommen: so prüft
  // der Test den tatsächlichen Callsite und nicht eine nachgebaute Annahme.
  const start = bookingPage.indexOf("<SaveDraftAction");
  assert.ok(start > -1, "SaveDraftAction-Callsite nicht gefunden");
  const block = bookingPage.slice(start, bookingPage.indexOf("/>", start));
  const m = block.match(/shipmentId=\{bookingData\?\.([A-Za-z_$][\w$]*)\}/);
  assert.ok(m, `Callsite übergibt shipmentId nicht aus bookingData: ${block.slice(0, 200)}`);

  const uebergebenesFeld = m[1];
  const wert = CALC_PRICE_ANTWORT[uebergebenesFeld];
  assert.equal(hasSavableShipmentId(wert), true,
    `bookingData.${uebergebenesFeld} = ${JSON.stringify(wert)} besteht den Guard nicht — die Aktion bliebe unsichtbar`);
  // Und es ist wirklich die CE-ID, nicht zufällig etwas anderes Numerisches.
  assert.equal(wert, CE_ID);
});

test("4 — die Komponente prüft weiterhin GENAU diesen Guard", () => {
  // Wäre der Guard in der Komponente entfallen, prüfte Test 3 ins Leere.
  assert.match(saveDraftAction, /if \(!hasSavableShipmentId\(shipmentId\)\) return null;/);
  assert.match(saveDraftAction, /saveDraft\(shipmentId\)/, "gespeichert wird nicht mit dem geprüften Wert");
});

/* ══════════ 3 — Der Guard wurde NICHT aufgeweicht ════════════════════════ */

test("5 — hasSavableShipmentId lehnt Providerreferenzen weiterhin ab", () => {
  assert.equal(hasSavableShipmentId(JUMINGO_ID), false);
  assert.equal(hasSavableShipmentId("s_1"), false);
  assert.equal(hasSavableShipmentId("4711abc"), false, "kein parseInt-Präfix");
  assert.equal(hasSavableShipmentId("0"), false);
  assert.equal(hasSavableShipmentId("-1"), false);
  assert.equal(hasSavableShipmentId(4.5), false);
  assert.equal(hasSavableShipmentId(null), false);
  // Gültig bleibt ausschließlich die positive Ganzzahl.
  assert.equal(hasSavableShipmentId(CE_ID), true);
  assert.equal(hasSavableShipmentId(String(CE_ID)), true);
});

test("6 — die beiden Validatoren bleiben getrennt und dürfen nicht getauscht werden", () => {
  assert.equal(hasUsableShipmentReference(JUMINGO_ID), true, "die Providerform ist als Sendungsbezug gültig");
  assert.equal(hasSavableShipmentId(JUMINGO_ID), false, "…aber nie als speicherbare interne ID");
});

/* ══════════ 4 — Die Quelle: Übernahme und Weitergabe ═════════════════════ */

test("7 — NewShipmentPage übernimmt den Handle aus der Antwort und reicht ihn weiter", () => {
  assert.match(newShipmentPage, /setCeShipmentId\(d\.ceShipmentId \?\? null\);/,
    "der Handle wird nicht aus der calculate-price-Antwort übernommen");
  assert.match(newShipmentPage, /state: \{ tariff, shipmentId, ceShipmentId, form, customs \}/,
    "der Handle erreicht die Buchungsseite nicht");
  // Beide IDs gehören zum selben Entwurf und werden gemeinsam verworfen.
  assert.match(newShipmentPage, /setCeShipmentId\(null\);/,
    "beim Verwerfen der Ergebnisse bliebe ein veralteter Handle stehen");
});

test("8 — der Handle wird NICHT aus der Providerreferenz abgeleitet", () => {
  for (const [name, src] of [["NewShipmentPage", newShipmentPage], ["BookingPage", bookingPage]]) {
    assert.ok(!/ceShipmentId\s*[=:]\s*(d\.)?shipmentId\b/.test(src),
      `${name}: der CE-Handle darf nie die Providerreferenz sein`);
  }
});

/* ══════════ 5 — Der Vorgang trägt den Handle mit ═════════════════════════ */

test("9 — der Handle wird im Vorgang mitgeführt (überlebt Reload/Rückkehr)", () => {
  const s = normalizeScope({ shipmentId: JUMINGO_ID, ceShipmentId: CE_ID }, "shipment");
  assert.equal(s.ceShipmentId, CE_ID);
  assert.equal(s.shipmentId, JUMINGO_ID, "die Providerreferenz bleibt für /book erhalten");
  // Beide gehören zum selben Entwurf → gemeinsam verwerfen.
  assert.equal(dropOffers(s).ceShipmentId, null);
  assert.equal(dropOffers(s).shipmentId, null);
});

test("10 — BookingPage liest den Handle auch aus dem Vorgang (nicht nur aus location.state)", () => {
  assert.match(bookingPage, /ceShipmentId: flowShipment\.ceShipmentId \?\? null,/,
    "nach einem Reload verlöre die Buchungsseite den Handle");
});

test("11 — ein Vorgang aus der Zeit davor bleibt gültig (additiv, kein Versionssprung)", () => {
  const s = normalizeScope({ shipmentId: JUMINGO_ID }, "shipment");
  assert.equal(s.ceShipmentId, null, "fehlendes Feld → null, nicht undefined");
  assert.equal(s.shipmentId, JUMINGO_ID, "der alte Vorgang darf nicht verworfen werden");
  // Fail-safe: ohne Handle erscheint die Aktion nicht — statt die Providerreferenz zu senden.
  assert.equal(hasSavableShipmentId(s.ceShipmentId), false);
});
