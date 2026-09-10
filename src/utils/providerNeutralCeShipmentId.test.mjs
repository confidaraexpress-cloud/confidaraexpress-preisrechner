// Provider-Neutralität: die lokale Sendung trägt den Vorgang, nicht die JUMiNGO-Referenz.
//
// ─── Der Vertrag ─────────────────────────────────────────────────────────────
//   ceShipmentId  shipments.id — die lokale ConfidaraExpress-Sendung. Das Backend legt sie
//                 an, BEVOR irgendein Anbieter gefragt wird; jedes Angebot hängt an ihr.
//   shipmentId    ausschließlich die externe JUMiNGO-Referenz. `null`, wenn JUMiNGO
//                 ausgefallen, nicht konfiguriert oder ohne Tarife war.
//
// Eine Antwort, in der nur ein anderer Anbieter angeboten hat, sieht deshalb so aus:
//   { shipmentId: null, ceShipmentId: 4711, tariffs: [ { offerId, bookable: true, … } ] }
// und muss vollständig nutzbar sein — Fortsetzen eines Entwurfs, Wiederherstellung der
// Buchungsseite aus dem laufenden Vorgang, Absicherung und Buchung.
//
// Geprüft werden die reinen Helfer und — nach dem Muster dieses Repos — die Verdrahtung
// per Quelltextanker auf KOMMENTARFREIEM Code. Kein DOM, kein Netz.
//
// Run: node --test src/utils/providerNeutralCeShipmentId.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { hasSavableShipmentId } from "./draftsView.mjs";
import { hasUsableShipmentReference } from "./formDraftsView.mjs";
import { normalizeScope, dropOffers } from "./shippingFlowState.mjs";
import { buchungsFlaeche } from "../testing/quelltext.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const NEW_SHIPMENT = ohneKommentare(read("../pages/NewShipmentPage.jsx"));
const BOOKING = ohneKommentare(buchungsFlaeche());

const CE_ID = 4711;
const TG_ONLY_ANTWORT = {
  shipmentId: null,
  ceShipmentId: CE_ID,
  tariffs: [{ offerId: "0123456789abcdef0123456789abcdef", bookable: true, publicCarrierId: "ups" }],
};

/* ══════════ 1 — Fortsetzen eines Formularentwurfs ════════════════════════ */

test("1 — REPRODUKTION: die JUMiNGO-Referenz als Bedingung hätte die Antwort blockiert", () => {
  assert.equal(hasUsableShipmentReference(TG_ONLY_ANTWORT.shipmentId), false,
    "ohne JUMiNGO-Referenz müsste der alte Guard blockieren — sonst prüft dieser Test nichts");
});

test("2 — KORREKTUR: die lokale Sendung ist Sendungsgrundlage", () => {
  assert.equal(hasSavableShipmentId(TG_ONLY_ANTWORT.ceShipmentId), true);
  // Fail closed bleibt: ohne lokale Sendung keine Angebote.
  assert.equal(hasSavableShipmentId(null), false);
  assert.equal(hasSavableShipmentId(undefined), false);
  // Eine JUMiNGO-Referenz ist keine lokale Sendung.
  assert.equal(hasSavableShipmentId("s_fb1bc92aba1c4d70a3eaa44d687ae179"), false);
});

test("3 — Verdrahtung: NewShipmentPage prüft beim Fortsetzen die lokale Sendung", () => {
  assert.ok(NEW_SHIPMENT.includes("if (t.blocking || !hasSavableShipmentId(d.ceShipmentId)) {"),
    "der Fortsetzen-Guard prüft nicht die lokale Sendung");
  assert.ok(!NEW_SHIPMENT.includes("hasUsableShipmentReference(d.shipmentId)"),
    "die JUMiNGO-Referenz ist wieder Voraussetzung für Angebote");
  // Beide IDs werden weiterhin unverändert aus der Antwort übernommen.
  assert.ok(NEW_SHIPMENT.includes("setShipmentId(d.shipmentId);"));
  assert.ok(NEW_SHIPMENT.includes("setCeShipmentId(d.ceShipmentId ?? null);"));
});

/* ══════════ 2 — Wiederherstellung der Buchungsseite ══════════════════════ */

test("4 — der laufende Vorgang trägt die lokale Sendung auch ohne JUMiNGO-Referenz", () => {
  const s = normalizeScope({
    shipmentId: null, ceShipmentId: CE_ID, tariffs: TG_ONLY_ANTWORT.tariffs,
    selected: TG_ONLY_ANTWORT.tariffs[0],
  }, "shipment");
  assert.equal(s.shipmentId, null);
  assert.equal(s.ceShipmentId, CE_ID, "die lokale Sendung ginge im Vorgang verloren");
  // Verworfen werden beide gemeinsam.
  assert.equal(dropOffers(s).ceShipmentId, null);
});

test("5 — Verdrahtung: BookingPage stellt auch ohne JUMiNGO-Referenz wieder her", () => {
  assert.ok(BOOKING.includes(
    "if (flowShipment?.selected && (flowShipment.shipmentId != null || flowShipment.ceShipmentId != null)) {"),
    "die Wiederherstellung verlangt wieder die JUMiNGO-Referenz");
  assert.ok(!BOOKING.includes("if (flowShipment?.selected && flowShipment.shipmentId != null) {"));
  // Die lokale Sendung reist bei der Wiederherstellung mit.
  assert.ok(BOOKING.includes("ceShipmentId: flowShipment.ceShipmentId ?? null,"));
});

test("6 — die Buchung verlangt keine JUMiNGO-Referenz: das Angebot wird über seine Kennung gebucht", () => {
  assert.ok(/offerId:\s*tariff\?\.offerId/.test(BOOKING), "die Angebotskennung fehlt im Buchungskörper");
  // Kein clientseitiger Abbruch, nur weil die JUMiNGO-Referenz fehlt.
  assert.ok(!/if\s*\(\s*!\s*bookingData\?\.shipmentId\b/.test(BOOKING),
    "die Buchungsseite bricht ohne JUMiNGO-Referenz ab");
  assert.ok(!/if\s*\(\s*!\s*shipmentId\s*\)\s*(return|\{)/.test(BOOKING),
    "die Buchungsseite bricht ohne JUMiNGO-Referenz ab");
});
