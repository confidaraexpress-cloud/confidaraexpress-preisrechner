// Chronologischer grüner Trackingfortschritt (Betreiberentscheidung 2026-10-04).
//
// Erreichte UND aktuelle Schritte grün, zukünftige neutral — auf der öffentlichen Trackingseite und
// in der Kundenansicht der Sendungen nach DERSELBEN Regel (utils/trackingLegsView.mjs,
// trackingEventTone). Bei einer Ausnahme wird nichts geraten: das neueste Ereignis trägt die
// Warnfarbe, die öffentliche Stufenleiste markiert keine Stufe (pages/trackingView.mjs).
// Der Buchungs-Stepper teilt sich die Klassen der Leiste und bleibt ausdrücklich unverändert.
// Run: node --test src/utils/trackingGreenProgress.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { trackingLegsOf, trackingEventTone, TRACKING_EVENT_TONE } from "./trackingLegsView.mjs";
import { buildTrackingView, STATUS_STEPS } from "../pages/trackingView.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(join(__dirname, rel), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (q) => q
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

const EV = (status, description, date, time) => ({ status, description, location: "Berlin, DE", dateTime: { date, time } });
// Antwort in der neutralen Kundenform: ein Abschnitt mit drei Ereignissen und dem Stand des Servers.
const antwort = (status, events = [
  EV("in_transit", "Sendung abgeholt", "2026-10-05", "15:47"),
  EV("in_transit", "Im Paketzentrum bearbeitet", "2026-10-05", "21:12"),
  EV(status, "Letztes Ereignis", "2026-10-06", "07:55"),
]) => ({
  trackingAvailable: true, trackingNumber: "1ZTEST0000000001", trackingStatus: status,
  trackingLegs: [{ carrier: "UPS", trackingReference: "1ZTEST0000000001", status, carrierTrackingPage: null, events }],
});
const toene = (result) => {
  const [leg] = trackingLegsOf(result);
  return leg.events.map((_, i) => trackingEventTone(leg, i));
};
// Dieselbe Klassenregel wie die Stufenleiste in TrackingPage.jsx.
const stufen = (stepIndex) => STATUS_STEPS.map((_, i) => (i === stepIndex ? "active" : i < stepIndex ? "done" : ""));

/* ══════════ Ereignispunkte — eine Regel für beide Ansichten ══════════ */

test("(1) pending / in_transit / delivered: jedes Ereignis erreicht — frühere „done“, das neueste „active“", () => {
  for (const status of ["pending", "in_transit", "delivered"]) {
    assert.deepEqual(toene(antwort(status)), ["done", "done", "active"], status);
  }
  assert.deepEqual(TRACKING_EVENT_TONE, { DONE: "done", CURRENT: "active", PROBLEM: "problem" });
});

test("(2) exception: frühere Ereignisse bleiben erreicht, NUR das neueste trägt den Problemton", () => {
  assert.deepEqual(toene(antwort("exception")), ["done", "done", "problem"]);
  // Ein einzelnes Ereignis im Stand Ausnahme ist zugleich das neueste.
  assert.deepEqual(toene(antwort("exception", [EV("exception", "Zustellung nicht möglich", "2026-10-06", "14:12")])), ["problem"]);
});

test("(3) kein Raten: ohne oder mit unbekanntem Abschnittsstand gibt es keinen Problemton", () => {
  for (const status of [null, undefined, "", "unknown", "Exception ", "delay", "undelivered"]) {
    const leg = { status, events: [{}, {}] };
    assert.deepEqual([trackingEventTone(leg, 0), trackingEventTone(leg, 1)], ["done", "active"], String(status));
  }
  // Ungültige Eingaben ergeben keinen Ton — und werfen nicht.
  for (const [leg, i] of [[null, 0], [{}, 0], [{ events: [] }, 0], [{ events: [{}] }, 1], [{ events: [{}] }, -1], [{ events: [{}] }, 0.5]]) {
    assert.equal(trackingEventTone(leg, i), null, JSON.stringify([leg, i]));
  }
});

test("(4) der Helfer liest ausschließlich den Abschnittsstand `exception` — keinen Rohstatus, keinen Text", () => {
  const modul = ohneKommentare(lies("./trackingLegsView.mjs"));
  const helfer = modul.slice(modul.indexOf("export function trackingEventTone"), modul.indexOf("export function trackingLegEventCount"));
  assert.match(helfer, /leg\.status === "exception"/);
  assert.doesNotMatch(helfer, /description|location|transit|delivered|pending|undelivered|delay|toLowerCase|includes\(/,
    "der Ton wird aus etwas anderem als dem Abschnittsstand abgeleitet");
});

test("(5) öffentliche Seite und Kundenansicht setzen den Ton aus DEMSELBEN Helfer — nirgends mehr inline", () => {
  for (const [datei, quelle] of [["TrackingPage.jsx", lies("../pages/TrackingPage.jsx")],
                                 ["ShipmentsList.jsx", lies("../components/dashboard/ShipmentsList.jsx")]]) {
    const code = ohneKommentare(quelle);
    assert.match(code, /tone: trackingEventTone\(leg, i\),/, `${datei}: der Ton kommt nicht aus trackingEventTone`);
    assert.match(code, /<div className=\{`track-dot \$\{ev\.tone\}`\} aria-hidden="true" \/>/, `${datei}: der Punkt trägt den Ton nicht`);
    assert.doesNotMatch(code, /track-dot \$\{[^}]*\? "active" : "done"/, `${datei}: der Ton wird wieder inline entschieden`);
  }
});

test("(6) Farben: erreicht und aktuell in der Success-Familie, Problem in der Warnfarbe — ohne Verlauf", () => {
  const css = lies("../styles/dashboard.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.track-dot\.active \{ border-color: var\(--ce-color-success-solid\); background: var\(--ce-color-success-solid\); \}/);
  assert.match(css, /\.track-dot\.done\s+\{ border-color: var\(--ce-color-success-solid\); background: var\(--ce-color-success-solid\); \}/);
  assert.match(css, /\.track-dot\.problem \{ border-color: var\(--ce-color-status-warning-fg\); background: var\(--ce-color-status-warning-fg\); \}/);
});

/* ══════════ Öffentliche Stufenleiste ══════════ */

test("(7) pending → Stufe 1 grün; in_transit → bis zur aktuellen Stufe grün; delivered → alle vier grün", () => {
  const pending = buildTrackingView(antwort("pending"), { hasEvents: true });
  assert.equal(pending.stepIndex, 0);
  assert.deepEqual(stufen(pending.stepIndex), ["active", "", "", ""]);
  const unterwegs = buildTrackingView(antwort("in_transit"), { hasEvents: true });
  assert.equal(unterwegs.stepIndex, 1);
  assert.deepEqual(stufen(unterwegs.stepIndex), ["done", "active", "", ""]);
  for (const hasEvents of [true, false]) {
    const zugestellt = buildTrackingView(antwort("delivered"), { hasEvents });
    assert.equal(zugestellt.stepIndex, 3, `delivered, Ereignisse: ${hasEvents}`);
    assert.deepEqual(stufen(zugestellt.stepIndex), ["done", "done", "done", "active"]);
    assert.equal(zugestellt.problem, false);
  }
  for (const v of [pending, unterwegs]) assert.equal(v.problem, false);
});

test("(8) exception mit Ereignissen: KEINE Stufe markiert — die Ausnahme steht im Hero", () => {
  const v = buildTrackingView(antwort("exception"), { hasEvents: true });
  assert.equal(v.problem, true);
  assert.equal(v.stepIndex, -1);
  assert.deepEqual(stufen(v.stepIndex), ["", "", "", ""], "eine normale Stufe wurde geraten");
  assert.equal(v.heroStatus, "Ausnahme");
  assert.equal(v.isDelivered, false);
});

test("(9) exception OHNE Ereignis: unverändert der neutrale Anfangszustand — kein Fortschritt, keine Ausnahme behauptet", () => {
  const v = buildTrackingView({ trackingNumber: "1ZTEST0000000001", trackingStatus: "exception", trackingLegs: [] }, { hasEvents: false });
  assert.equal(v.problem, false);
  assert.equal(v.stepIndex, 0);
  assert.equal(v.heroStatus, "Daten übermittelt");
});

test("(10) Leistenfarbe nur unter .tracking-steps — der Buchungs-Stepper bleibt unverändert", () => {
  const css = lies("../styles/dashboard.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.tracking-steps \.step-circle\.active \{\s*border-color: var\(--ce-color-success-solid\); background: var\(--ce-color-success-solid\);\s*color: var\(--ce-color-text-inverse\);\s*\}/);
  assert.match(css, /\.tracking-steps \.step-label\.active \{ color: var\(--ce-color-success-solid\); \}/);
  // Die gemeinsamen Regeln (Buchung UND Tracking) sind unverändert: aktueller Schritt in der Markenfarbe.
  assert.match(css, /\n\.step-circle\.active \{ border-color: var\(--ce-color-brand\); background: var\(--ce-color-brand\); color: white; \}/);
  assert.match(css, /\n\.step-label\.active \{ color: var\(--ce-color-brand-ink\); \}/);
  assert.match(css, /\n\.step-circle\.done\s+\{ border-color: var\(--ce-color-success-solid\); background: var\(--ce-color-success-solid\); color: white; \}/);
  // Nur die Trackingleiste trägt die Klasse; der Buchungs-Stepper nicht.
  assert.match(lies("../pages/TrackingPage.jsx"), /<div className="steps-bar tracking-steps">/);
  const buchung = lies("../pages/BookingPage.jsx");
  assert.match(buchung, /<div className="steps-bar mb-24">/);
  assert.doesNotMatch(buchung, /tracking-steps/);
});
