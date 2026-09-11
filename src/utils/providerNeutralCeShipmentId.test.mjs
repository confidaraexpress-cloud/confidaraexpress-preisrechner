// Provider-Neutralität: die lokale Sendung trägt den Vorgang, nicht die JUMiNGO-Referenz.
//
// ─── Der Vertrag ─────────────────────────────────────────────────────────────
//   ceShipmentId  shipments.id — die lokale ConfidaraExpress-Sendung. Das Backend legt sie
//                 an, BEVOR irgendein Anbieter gefragt wird; jedes Angebot hängt an ihr.
//                 TG22 Paket A: sie ist die EINZIGE Sendungskennung des Clients. Die
//                 JUMiNGO-Referenz verlässt den Server nicht mehr.
//
// Eine Antwort, in der nur ein anderer Anbieter angeboten hat, sieht deshalb so aus:
//   { ceShipmentId: 4711, tariffs: [ { offerId, bookable: true, … } ] }
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
  // TG22 Paket A: übernommen wird ausschließlich der CE-Handle.
  assert.ok(NEW_SHIPMENT.includes("setCeShipmentId(d.ceShipmentId ?? null);"));
  assert.ok(!/setShipmentId\b|\bd\.shipmentId\b/.test(NEW_SHIPMENT), "die JUMiNGO-Referenz wird wieder übernommen");
});

/* ══════════ 2 — Wiederherstellung der Buchungsseite ══════════════════════ */

test("4 — der laufende Vorgang trägt ausschließlich die lokale Sendung", () => {
  const s = normalizeScope({
    ceShipmentId: CE_ID, tariffs: TG_ONLY_ANTWORT.tariffs,
    selected: TG_ONLY_ANTWORT.tariffs[0],
  }, "shipment");
  assert.ok(!("shipmentId" in s), "der Vorgang führt wieder eine Providerreferenz");
  assert.equal(s.ceShipmentId, CE_ID, "die lokale Sendung ginge im Vorgang verloren");
  // Eine eingeschleuste Altreferenz wird nicht übernommen.
  assert.ok(!("shipmentId" in normalizeScope({ shipmentId: "s_fb1bc92aba1c4d70a3eaa44d687ae179", ceShipmentId: CE_ID }, "shipment")));
  assert.equal(dropOffers(s).ceShipmentId, null);
});

test("5 — Verdrahtung: BookingPage stellt über die lokale Sendung wieder her", () => {
  assert.ok(BOOKING.includes("if (flowShipment?.selected && flowShipment.ceShipmentId != null) {"),
    "die Wiederherstellung hängt nicht an der lokalen Sendung");
  assert.ok(!/flowShipment\.shipmentId\b/.test(BOOKING), "die Wiederherstellung liest wieder die JUMiNGO-Referenz");
  assert.ok(BOOKING.includes("ceShipmentId: flowShipment.ceShipmentId,"));
});

test("5b — keine Sendeoperation der Buchungsseite nennt eine Providerreferenz", () => {
  assert.ok(!/\bshipmentId:\s*bookingData\?\.shipmentId\b/.test(BOOKING), "ein Request trägt bookingData.shipmentId");
  assert.ok(!/bookingData\?\.shipmentId\b/.test(BOOKING), "die Buchungsseite liest die JUMiNGO-Referenz");
  for (const anker of [
    /checkVoucher\(\{\s*ceShipmentId:\s*bookingData\?\.ceShipmentId,/,
    /ceShipmentId:\s*bookingData\?\.ceShipmentId,\s*offerId:\s*tariff\?\.offerId,/,
    /useCommercialInvoice\(\{ shipmentId: bookingData\?\.ceShipmentId, enabled: customsRequired \}\)/,
    /saveDraftPickupWindow\(\{ ceShipmentId: sid, pickupTimeFrom: null, pickupTimeUntil: null \}\)/,
    /<PickupWindowModule[\s\S]{0,200}ceShipmentId=\{bookingData\?\.ceShipmentId\}/,
  ]) {
    assert.match(BOOKING, anker);
  }
});

test("6 — die Buchung verlangt keine JUMiNGO-Referenz: das Angebot wird über seine Kennung gebucht", () => {
  assert.ok(/offerId:\s*tariff\?\.offerId/.test(BOOKING), "die Angebotskennung fehlt im Buchungskörper");
  // Kein clientseitiger Abbruch, nur weil die JUMiNGO-Referenz fehlt.
  assert.ok(!/if\s*\(\s*!\s*bookingData\?\.shipmentId\b/.test(BOOKING),
    "die Buchungsseite bricht ohne JUMiNGO-Referenz ab");
  assert.ok(!/if\s*\(\s*!\s*shipmentId\s*\)\s*(return|\{)/.test(BOOKING),
    "die Buchungsseite bricht ohne JUMiNGO-Referenz ab");
});

test("7 — nach der Buchung bleibt die Bestätigung stehen, auch wenn der Vorgang geleert wird", () => {
  // Gefunden im Browser-E2E: ohne location.state war der laufende Vorgang die EINZIGE Quelle.
  // `clearFlow()` direkt nach dem Erfolg leerte sie, `tariff` wurde undefined — und eine bereits
  // gebuchte Sendung zeigte „Kein Angebot ausgewählt" statt des Erfolgsbildschirms.
  assert.ok(BOOKING.includes("const bookingData = laufendeBuchungsdaten ?? gebuchteBuchungsdaten;"),
    "die Buchungsdaten hängen wieder allein am laufenden Vorgang");
  const snapshot = BOOKING.indexOf("setGebuchteBuchungsdaten(bookingData);");
  const erfolg = BOOKING.indexOf("setBooking(d); setStep(3);");
  const leeren = BOOKING.indexOf("clearFlow();", erfolg);
  assert.ok(snapshot > -1 && erfolg > -1 && leeren > -1, "Erfolgspfad nicht gefunden");
  assert.ok(snapshot < erfolg && erfolg < leeren,
    "der Stand zum Buchungszeitpunkt wird nicht vor dem Leeren des Vorgangs festgehalten");
  // Genau eine Stelle setzt ihn — nur der Erfolgspfad, kein Fehlerzweig.
  assert.equal(BOOKING.split("setGebuchteBuchungsdaten(").length - 1, 1);
});
