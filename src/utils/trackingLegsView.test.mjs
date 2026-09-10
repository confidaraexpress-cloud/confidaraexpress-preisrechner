// Tests für die providerneutrale Darstellung von Transportabschnitten und Ereignissen
// (src/utils/trackingLegsView.mjs) und ihre Verdrahtung in öffentlicher Trackingseite,
// Live-Ansicht der Sendungsliste und API-Client.
// Run: node --test src/utils/trackingLegsView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  trackingLegsOf, trackingStatusLabel, eventWhenText, latestTrackingLegEvent, trackingLegEventCount,
  trackingLegHeading, hasTrackingLegs, TRACKING_LEGS_TEXT,
} from "./trackingLegsView.mjs";
import { buildTrackingView } from "../pages/trackingView.mjs";
import { trackingReferencesOf } from "./trackingReferencesView.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(join(__dirname, rel), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (q) => q
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

const A = "1ZF7TEST0000000001";
const B = "1ZF7TEST0000000002";
const EV = (code, status, description, location, date, time, raw) =>
  ({ status, code, description, location, dateTime: { raw, date, time } });

// Antwortform des Servers — die Projektion der bereinigten Staging-Antwort, auf zwei
// Abschnitte verteilt.
const LIVE = Object.freeze({
  shipmentId: 700, tracking: null, trackingAvailable: true, trackingNumber: A,
  trackingReferences: [A, B], trackingStatus: "delivered", trackingStatusText: "DELIVERED",
  carrier: "UPS", carrierTrackingPage: null, liveTracking: true, source: "live",
  trackingLegs: [
    { carrier: "UPS", role: "Primary", trackingReference: A, carrierTrackingPage: null, eventsChronological: true,
      events: [
        EV("003", "pending", "Shipper created a label, UPS has not received the package yet.", "US", "2026-05-04", "21:57:37", "04-05-2026 21:57:37"),
        EV("160", "in_transit", "RFID Confirmed Pickup", "Laurel, MD US", "2026-05-05", "17:33:15", "05-05-2026 17:33:15"),
      ] },
    { carrier: "UPS", role: "Primary", trackingReference: B,
      carrierTrackingPage: `https://wwwapps.ups.com/WebTracking/processInputRequest?tracknum=${B}`, eventsChronological: true,
      events: [
        EV("021", "in_transit", "Out For Delivery", "Castlegar, BC CA", "2026-05-12", "08:29:44", "12-05-2026 08:29:44"),
        EV("011", "delivered", "DELIVERED", "GRAND FORKS RR2 CA", "2026-05-12", "14:46:53", "12-05-2026 14:46:53"),
      ] },
  ],
});

test("(1) Status: nur Werte des internen Modells bekommen ein Label — unknown bleibt unbenannt", () => {
  assert.equal(trackingStatusLabel("delivered"), "Zugestellt");
  assert.equal(trackingStatusLabel("in_transit"), "Unterwegs");
  assert.equal(trackingStatusLabel("pending"), "In Vorbereitung");
  assert.equal(trackingStatusLabel("exception"), "Ausnahme");
  for (const s of ["unknown", "expired", "success", "DELIVERED", "", null, undefined, 42]) {
    assert.equal(trackingStatusLabel(s), null, String(s));
  }
  // Die öffentliche Seite: delivered bleibt Zugestellt, in_transit mit Ereignissen Unterwegs.
  assert.equal(buildTrackingView(LIVE, { hasEvents: true }).heroStatus, "Zugestellt");
  assert.equal(buildTrackingView({ ...LIVE, trackingStatus: "in_transit" }, { hasEvents: true }).heroStatus, "Unterwegs");
  assert.equal(buildTrackingView({ ...LIVE, trackingStatus: "unknown" }, { hasEvents: true }).heroStatus, "Daten übermittelt");
});

test("(2) Ereignis: Beschreibung, Ort, Datum und Uhrzeit, wie sie geliefert wurden", () => {
  const legs = trackingLegsOf(LIVE);
  const zugestellt = legs[1].events[1];
  assert.equal(zugestellt.description, "DELIVERED");
  assert.equal(zugestellt.location, "GRAND FORKS RR2 CA");
  assert.equal(zugestellt.day, "12.05.2026");
  assert.equal(zugestellt.time, "14:46:53");
  assert.equal(zugestellt.status, "delivered");
  assert.equal(eventWhenText(zugestellt), "12.05.2026 · 14:46:53 Uhr");
  assert.equal(eventWhenText(zugestellt, { withSuffix: false }), "12.05.2026 · 14:46:53");
});

test("(3) mehrere Ereignisse: vollständig und älteste zuerst — auch aus absteigender Lieferung", () => {
  assert.equal(trackingLegEventCount(trackingLegsOf(LIVE)), 4);
  const absteigend = {
    trackingLegs: [{ carrier: "UPS", trackingReference: A, eventsChronological: false, events: [
      EV("011", "delivered", "DELIVERED", "X", "2026-05-12", "14:46:53", "12-05-2026 14:46:53"),
      EV("005", "in_transit", "Arrived at Facility", "Y", "2026-05-11", "13:16:00", "11-05-2026 13:16:00"),
      EV("003", "pending", "Label", "US", "2026-05-04", "21:57:37", "04-05-2026 21:57:37"),
    ] }],
  };
  assert.deepEqual(trackingLegsOf(absteigend)[0].events.map((e) => e.code), ["003", "005", "011"]);
  // Ohne vollständige Zeitangaben bleibt die gelieferte Reihenfolge.
  const unvollstaendig = { trackingLegs: [{ events: [
    EV("011", "delivered", "DELIVERED", "X", "2026-05-12", "14:46:53", "12-05-2026 14:46:53"),
    EV("999", "unknown", "Customs Hold", "Y", null, null, "irgendwann"),
  ] }] };
  assert.deepEqual(trackingLegsOf(unvollstaendig)[0].events.map((e) => e.code), ["011", "999"]);
  assert.equal(latestTrackingLegEvent(trackingLegsOf(unvollstaendig)), null, "das jüngste Ereignis wurde geraten");
  assert.equal(latestTrackingLegEvent(trackingLegsOf(LIVE)).code, "011");
});

test("(4) mehrere Abschnitte: getrennt, mit Carrier und Nummer — keine erfundene Paketnummer", () => {
  const legs = trackingLegsOf(LIVE);
  assert.equal(legs.length, 2);
  assert.deepEqual(legs.map(trackingLegHeading), [`UPS · ${A}`, `UPS · ${B}`]);
  assert.equal(legs[0].carrierTrackingPage, null);
  assert.ok(legs[1].carrierTrackingPage.startsWith("https://wwwapps.ups.com/"));
  assert.ok(!/Paket\s*\d/.test(JSON.stringify(legs.map(trackingLegHeading))));
  // Ein unsicherer Link wird nicht übernommen.
  assert.equal(trackingLegsOf({ trackingLegs: [{ carrierTrackingPage: "javascript:alert(1)", events: [] }] })[0].carrierTrackingPage, null);
  // Eine ungültige Nummer ergibt keine Nummer.
  assert.equal(trackingLegsOf({ trackingLegs: [{ trackingReference: "<b>x</b>", events: [] }] })[0].trackingReference, null);
  assert.equal(trackingLegHeading({ carrier: null, trackingReference: null }), null);
});

test("(5) mehrere Trackingnummern: die Liste kommt unverändert vom Server", () => {
  assert.deepEqual(trackingReferencesOf(LIVE), [A, B]);
});

test("(6) unbekanntes Ereignis: sichtbar, mit Beschreibung — Stand ohne Label", () => {
  const legs = trackingLegsOf({ trackingStatus: "unknown", trackingLegs: [{ carrier: "UPS", events: [
    EV("999", "unknown", "Customs Hold", "Leipzig DE", "2026-05-01", "10:00:00", "01-05-2026 10:00:00"),
  ] }] });
  assert.equal(legs[0].events.length, 1);
  assert.equal(legs[0].events[0].description, "Customs Hold");
  assert.equal(legs[0].events[0].code, "999");
  assert.equal(trackingStatusLabel("unknown"), null);
  // Ein Ereignis ohne Beschreibung bleibt ein Ereignis.
  assert.equal(trackingLegsOf({ trackingLegs: [{ events: [EV("999", "unknown", null, null, null, null, null)] }] })[0].events[0].description,
    TRACKING_LEGS_TEXT.eventFallback);
});

test("(7) zugestelltes Ereignis: Zugestellt, jüngstes Ereignis ist die Zustellung", () => {
  const legs = trackingLegsOf(LIVE);
  const neu = latestTrackingLegEvent(legs);
  assert.equal(neu.status, "delivered");
  assert.equal(eventWhenText(neu), "12.05.2026 · 14:46:53 Uhr");
  assert.equal(buildTrackingView(LIVE, { hasEvents: true }).stepIndex, 3);
});

test("(8) keine erfundene Zeitzone: kein Zonentext, kein Datumsobjekt, Rohwert als Rückfall", () => {
  const texte = trackingLegsOf(LIVE).flatMap((l) => l.events).map((e) => eventWhenText(e)).join(" | ");
  assert.ok(!/UTC|GMT|MEZ|MESZ|CET|CEST|Europe\/|Z\b|[+-]\d{2}:\d{2}/.test(texte), texte);
  const roh = trackingLegsOf({ trackingLegs: [{ events: [EV("005", "in_transit", "Scan", null, null, null, "12-05-2026 14:46")] }] })[0].events[0];
  assert.equal(eventWhenText(roh), "12-05-2026 14:46", "der Rohwert wurde verändert");
  const quelle = ohneKommentare(lies("trackingLegsView.mjs"));
  assert.ok(!/new Date\(|Date\.parse\(|toLocale|Intl\.DateTimeFormat/.test(quelle), "das Modul wandelt Zeitangaben in ein Datum um");
});

test("(9) kein Anbieterleck: weder Modul noch Seiten noch Client nennen einen Einkaufsanbieter", () => {
  for (const datei of ["trackingLegsView.mjs", "../pages/TrackingPage.jsx", "../components/dashboard/ShipmentsList.jsx", "../api/client.js"]) {
    assert.ok(!/transglobal/i.test(lies(datei)), `${datei} nennt einen Einkaufsanbieter`);
  }
  assert.ok(!/transglobal|jumingo/i.test(JSON.stringify(TRACKING_LEGS_TEXT)));
  assert.equal(hasTrackingLegs({}), false);
  assert.deepEqual(trackingLegsOf({ trackingLegs: "x" }), []);
  assert.deepEqual(trackingLegsOf(null), []);
});

test("(10) öffentliche Trackingseite: Abschnitte aus dem Modul, bisheriges Format bleibt Rückfall", () => {
  const seite = ohneKommentare(lies("../pages/TrackingPage.jsx"));
  assert.match(seite, /const legs = trackingLegsOf\(result\);/);
  assert.match(seite, /buildTrackingView\(result, \{ hasEvents: eventCount > 0 \}\)/);
  assert.match(seite, /eventWhenText\(latestTrackingLegEvent\(legs\)\)/);
  assert.match(seite, /heading: legs\.length > 1 \? trackingLegHeading\(leg\) : null/);
  // Das JUMiNGO-Format bleibt unverändert als Zweig bestehen.
  assert.match(seite, /Array\.isArray\(trackData\.steps\)/);
  assert.match(seite, /: \[\{ key: "events", heading: null, dayGroups \}\]/);
});

test("(11) angemeldete Live-Ansicht: Abschnitte, neutrales Statuslabel, Carrierlink je Abschnitt", () => {
  const liste = ohneKommentare(lies("../components/dashboard/ShipmentsList.jsx"));
  assert.match(liste, /const legs = trackingLegsOf\(tracking\);/);
  assert.match(liste, /\? trackingStatusLabel\(tracking\?\.trackingStatus\)\s*: labelForTrackStatus\(tracking\?\.trackingStatus\)/);
  assert.match(liste, /link: legs\.length > 1 \? leg\.carrierTrackingPage : null/);
  assert.match(liste, /tracking\?\.liveTracking === false \? TRACKING_LEGS_TEXT\.liveUnavailable/);
});

test("(12) API-Client reicht Abschnitte und Stand durch — ohne sie bleibt alles beim Alten", () => {
  const c = ohneKommentare(lies("../api/client.js"));
  const sel = c.slice(c.indexOf("function selectTracking"), c.indexOf("export async function getTracking"));
  assert.match(sel, /trackingLegs:\s+Array\.isArray\(payload\.trackingLegs\) \? payload\.trackingLegs : undefined/);
  assert.match(sel, /trackingStatusText:\s+pick\("trackingStatusText"\)/);
  assert.match(sel, /liveTracking:\s+pick\("liveTracking"\)/);
  assert.match(sel, /tracking:\s+payload\.tracking/);
});
