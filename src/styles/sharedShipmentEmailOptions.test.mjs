/* Zusatzempfänger für Versandinformationen — Quelltextprüfung.
   =============================================================================
   Zwei neue Optionen im Bereich „Zusätzliche Optionen": Tracking-Link bzw.
   Versandlabel + Tracking-Link an eine weitere Adresse. Sie nutzen dasselbe
   Schalterprimitiv und dasselbe Progressive-Disclosure-Muster wie Referenznummer
   und Labelformat — hier wird festgehalten, dass kein zweites System entsteht
   und dass der Schalterzustand nicht in den Backendvertrag wandert.

   Das gerenderte Verhalten prüft tests/e2e/sharedShipmentEmailOptions.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const modul       = lies("../components/booking/AdditionalOptionsModule.jsx");
const bookingPage = lies("../pages/BookingPage.jsx");
const flowState   = lies("../utils/shippingFlowState.mjs");
const trackingPg  = lies("../pages/TrackingPage.jsx");

test("1 — beide Optionen nutzen das bestehende Schalterprimitiv", () => {
  // Kein zweites Toggle-System: es gibt weiterhin genau eine Switch-Komponente.
  const uiDateien = readdirSync(new URL("../components/ui/", import.meta.url));
  assert.deepEqual(uiDateien.filter((f) => /switch|toggle/i.test(f)), ["Switch.jsx"]);
  assert.match(modul, /import \{ Switch \} from "\.\.\/ui\/Switch"/);
  // Und die beiden neuen Zeilen laufen über dieselbe kleine Hilfskomponente,
  // statt das Markup zweimal zu wiederholen.
  assert.match(modul, /function EmailOption\(/);
  assert.match(modul, /<Switch id=\{id\} checked=\{enabled\}/);
  assert.equal((modul.match(/<EmailOption/g) || []).length, 2, "es müssen genau zwei Zusatzadressen sein");
});

test("2 — die Texte benennen den Umfang, den der Empfänger bekommt", () => {
  assert.match(modul, /label="Tracking-Link an weitere E-Mail-Adresse senden"/);
  assert.match(modul, /label="Versandlabel & Tracking-Link an weitere E-Mail-Adresse senden"/);
});

test("3 — die Felder liegen hinter ihrem Schalter", () => {
  const fn = modul.slice(modul.indexOf("function EmailOption"), modul.indexOf("export function AdditionalOptionsModule"));
  assert.match(fn, /\{enabled && \(/, "das Feld muss hinter dem Schalter liegen");
  assert.match(fn, /type="email"/);
  assert.match(fn, /placeholder="name@unternehmen\.de"/);
  assert.match(fn, /E-Mail-Adresse<\/label>/);
});

test("4 — das Modul bleibt zustandslos", () => {
  assert.doesNotMatch(modul, /useState|useReducer|useEffect/,
    "Schalterzustand, Werte und Fehler gehören in den Orchestrator");
});

test("5 — beide Schalter werden aus vorhandenen Werten abgeleitet", () => {
  // Eine gespeicherte Adresse darf nicht unsichtbar werden.
  assert.match(bookingPage, /useState\(\s*\(\) => !!\(flowBooking\?\.trackingEmail \|\| ""\)\.trim\(\)\)/);
  assert.match(bookingPage, /useState\(\s*\(\) => !!\(flowBooking\?\.labelTrackingEmail \|\| ""\)\.trim\(\)\)/);
});

test("6 — der Vorgang spiegelt nur aktive Adressen", () => {
  assert.match(bookingPage, /trackingEmail: trackingEmailEnabled \? trackingEmail : ""/);
  assert.match(bookingPage, /labelTrackingEmail: labelTrackingEmailEnabled \? labelTrackingEmail : ""/);
  // Und beides hängt in den Abhängigkeiten des Spiegel-Effekts.
  const eff = bookingPage.slice(bookingPage.indexOf("setFlowBooking({"), bookingPage.indexOf("const tariff = bookingData"));
  assert.match(eff, /trackingEmailEnabled, trackingEmail, labelTrackingEmailEnabled, labelTrackingEmail\]/);
});

test("7 — das Vorgangsschema wurde additiv und rückwärtskompatibel erweitert", () => {
  assert.match(flowState, /"trackingEmail", "labelTrackingEmail",/);
  assert.match(flowState, /trackingEmail: str\(src\.trackingEmail\)\.slice\(0, 255\)/);
  assert.match(flowState, /labelTrackingEmail: str\(src\.labelTrackingEmail\)\.slice\(0, 255\)/);
  // Kein Versionssprung: ein alter Vorgang liefert undefined → "" und bleibt gültig.
  assert.match(flowState, /export const FLOW_SCHEMA_VERSION = 1;/,
    "eine Erhöhung würde laufende Vorgänge grundlos verwerfen");
});

test("8 — validiert wird nur die aktive Option", () => {
  assert.match(bookingPage, /shipmentEmailError\(trackingEmailEnabled, trackingEmail\)/);
  assert.match(bookingPage, /shipmentEmailError\(labelTrackingEmailEnabled, labelTrackingEmail\)/);
  // Beide Gates (Weiter und Buchen) prüfen dieselbe abgeleitete Größe.
  assert.equal((bookingPage.match(/if \(!shipmentEmailsValid\)/g) || []).length, 2,
    "es braucht das Weiter-Gate UND den Buchen-Guard");
});

test("9 — Fehler erscheinen erst nach dem Weiterklicken", () => {
  // Ein gerade eingeschaltetes, noch leeres Feld darf nicht sofort rot sein.
  assert.match(bookingPage, /trackingEmailError=\{emailShowErrors \? trackingEmailProblem : null\}/);
  assert.match(bookingPage, /labelTrackingEmailError=\{emailShowErrors \? labelTrackingEmailProblem : null\}/);
  assert.match(bookingPage, /setEmailShowErrors\(true\)/);
});

test("10 — der Fehler ist am Feld verankert, nicht nur eine Browsermeldung", () => {
  const fn = modul.slice(modul.indexOf("function EmailOption"), modul.indexOf("export function AdditionalOptionsModule"));
  assert.match(fn, /field-input-error/);
  assert.match(fn, /aria-invalid=\{error \? "true" : undefined\}/);
  assert.match(fn, /aria-describedby=\{error \? errorId : undefined\}/);
  assert.match(fn, /<span className="field-error" id=\{errorId\}>\{error\}<\/span>/);
});

test("11 — der Payload trägt die Adresse, nie den Schalterzustand", () => {
  const bookCall = bookingPage.match(/apiFetch\(`\/api\/jumingo\/book`,\s*\{([\s\S]*?)\n\s{6}\}\);/);
  assert.ok(bookCall, "der /book-Aufruf muss auffindbar bleiben");
  const body = ohneKommentare(bookCall[1]);
  assert.match(body, /\.\.\.buildShipmentEmailPayload\(\{/);
  assert.ok(!/trackingEmailEnabled\s*:/.test(body) && !/labelTrackingEmailEnabled\s*:/.test(body),
    "UI-Aktivierungsflags gehören nicht in den Payload");
  // Die bestehenden Felder bleiben unangetastet.
  for (const feld of ["referenceNumber:", "labelFormat,", "sender:", "recipient:", "weight:", "content:"]) {
    assert.ok(body.includes(feld), `bestehendes Payload-Feld fehlt: ${feld}`);
  }
});

test("12 — der Trackinglink der Mail hat im Frontend ein Ziel", () => {
  // Die Backend-Mail verlinkt /tracking?nummer=… — ohne diese Auswertung liefe
  // der Link auf eine leere Suchmaske.
  assert.match(trackingPg, /searchParams\.get\("nummer"\)/);
  assert.match(trackingPg, /ranOnce/, "der Deep-Link darf nur einmal beim Mount laufen");
  // Die manuelle Suche bleibt unverändert möglich.
  assert.match(trackingPg, /const track = async \(keyArg\)/);
});

test("13 — die bestehenden Optionen sind unverändert", () => {
  // Referenznummer und Labelformat behalten Werte, Grenzen und Ausschaltregeln.
  assert.match(bookingPage, /replace\(\/\[<>\]\/g, ""\)\.slice\(0, 35\)/);
  assert.match(bookingPage, /if \(!on\) setLabelFormat\("A4"\);/);
  assert.match(modul, /maxLength=\{35\}/);
  const ids = [...modul.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["A4", "A6"]);
});

test("14 — die vier Optionen stehen in der vorgegebenen Reihenfolge", () => {
  const pos = (s) => modul.indexOf(s);
  const reihenfolge = [
    pos('id="booking-reference-toggle"'),
    pos('id="booking-tracking-email-toggle"'),
    pos('id="booking-label-email-toggle"'),
    pos('id="booking-labelformat-toggle"'),
  ];
  assert.ok(reihenfolge.every((v) => v > 0), "alle vier Optionen müssen vorhanden sein");
  assert.deepEqual([...reihenfolge].sort((a, b) => a - b), reihenfolge,
    "Referenz → Tracking → Label+Tracking → Labelformat");
});
