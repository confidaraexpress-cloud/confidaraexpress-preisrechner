/* Antwortnormalisierung und Sichtbarkeitsregel des Paketshop-Einstiegs.
   =============================================================================
   Beides lag bis zur Integration in die Angebote in AccessPointFinder.jsx und
   war damit nur über einen Browsertest erreichbar. Als eigenes Modul ist es
   direkt prüfbar — und die Regel, WANN ein Angebot den Finder anbietet, ist
   jetzt eine Zusicherung statt einer Bedingung mitten im JSX. */

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccessPointItem, normalizeAccessPointList } from "./accessPointResponse.mjs";
import { DPD_RESPONSE, DPD_ACCESS_POINTS, DPD_EXPECTED_SORTED } from "../../tests/fixtures/accessPointsDpd.mjs";

// ═══════════ 1 — NORMALISIERUNG ════════════════════════════════════════════

test("1 — die echte Antwort wird vollständig und distanzsortiert übernommen", () => {
  const liste = normalizeAccessPointList(DPD_RESPONSE);
  assert.equal(liste.length, 20, "es geht kein Treffer verloren");
  assert.deepEqual(liste.map((s) => s.name), DPD_EXPECTED_SORTED);
});

test("2 — Koordinaten und Rohöffnungszeiten wandern mit", () => {
  // Beide werden von späteren Stufen gelesen (Marker bzw. Öffnungszeitenfilter
  // und Wochenansicht). Fehlten sie, liefe die betroffene Stufe still ins Leere.
  const erster = normalizeAccessPointList(DPD_RESPONSE)[0];
  assert.equal(erster.latitude, 48.710737);
  assert.equal(erster.longitude, 9.41599);
  assert.ok(Array.isArray(erster.hoursOfOperation) && erster.hoursOfOperation.length === 7);
});

test("3 — die Antwort wird aus jeder belegten Hülle gelesen", () => {
  const eins = [DPD_ACCESS_POINTS[0]];
  for (const huelle of [eins, { accessPoints: eins }, { results: eins }, { data: eins }, { items: eins }]) {
    assert.equal(normalizeAccessPointList(huelle).length, 1, JSON.stringify(Object.keys(huelle)));
  }
  for (const nichts of [null, undefined, {}, 42, "text"]) {
    assert.deepEqual(normalizeAccessPointList(nichts), []);
  }
});

test("4 — ohne Name UND ohne Adresse wird das Item übersprungen", () => {
  assert.equal(normalizeAccessPointItem({ distance: 1 }), null);
  assert.equal(normalizeAccessPointItem(null), null);
  assert.equal(normalizeAccessPointItem("text"), null);
  // Nur Adresse genügt.
  const nurAdresse = normalizeAccessPointItem({ street: "Marktstr. 4", postCode: "73207", city: "Plochingen" });
  assert.equal(nurAdresse.name, null);
  assert.equal(nurAdresse.address, "Marktstr. 4, 73207 Plochingen");
});

test("5 — fehlende Koordinaten kosten den Marker, nicht den Treffer", () => {
  const ohne = normalizeAccessPointItem({ ...DPD_ACCESS_POINTS[0], latitude: null, longitude: null });
  assert.ok(ohne, "der Shop bleibt in der Liste");
  assert.equal(ohne.latitude, null);
  assert.equal(ohne.longitude, null);
});

test("6 — der Status kommt allein aus workState, ohne Rohwert im Text", () => {
  const zu = normalizeAccessPointItem({ name: "X", workState: "Geschlossen" });
  assert.equal(zu.status.label, "Geschlossen");
  assert.equal(zu.status.badgeClass, "badge badge--error");
  const fremd = normalizeAccessPointItem({ name: "X", workState: "IRGENDWAS" });
  assert.equal(fremd.status.label, "Öffnungsstatus nicht verfügbar");
  assert.equal(fremd.status.known, false);
  assert.equal(fremd.status.raw, "IRGENDWAS", "der Rohwert bleibt für den Support erhalten");
});

/* Die Carrier-Auflösung (resolveAccessPointCarrierCode) und die Sichtbarkeits-
   regel des Einstiegs (offerSupportsAccessPointSearch) sind BEWUSST nicht hier:
   sie stehen in carrierMap.js, wo die Carrier-Klassifikation ohnehin liegt.
   Jene Datei importiert die SVG-Logos und ist damit aus Node nicht direkt
   ladbar — geprüft werden beide deshalb dort, wo sie wirken: am echten
   Angebot im Browser (tests/e2e/parcelShopOfferIntegration.test.mjs, Fälle
   „Dropoff zeigt den Einstieg", „Pickup zeigt keinen", „nicht unterstützter
   Carrier zeigt keinen"). */
