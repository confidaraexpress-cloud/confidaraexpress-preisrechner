/* Der Bundesstaat im FINALEN /book-Payload.
 *
 * Anlass — live bewiesen (DE→USA, 350 5th Ave, 10118 New York):
 *   Oberfläche: „Bundesstaat * → New York"
 *   /calculate-price sendete   state: "NY"      ✓
 *   Vorgang trug                r_state: "NY"    ✓
 *   /book erhielt               KEIN state       ✗  → HTTP 400
 *     { "errors": ["recipient.state fehlt (für US ist der Bundesstaat erforderlich)"] }
 *
 * Ursache: `BookingPage.buildParty` führte eine EIGENE Adress-Feldliste, in der `state`
 * fehlte. Der frühere Test prüfte nur Formular und Preisrechner — nie den Buchungspayload.
 * Diese Datei schließt genau diese Lücke.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildPartyPayload } from "./newShipmentForm.mjs";
import { buildResumeInitialState } from "./formDraftsView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const buchung = lies("../pages/BookingPage.jsx");

/* ══════════ Die vom Live-Fehler betroffenen Fälle ══════════ */

test("1 — US-Empfänger: recipient.state === \"NY\"", () => {
  const r = buildPartyPayload(
    { r_fullName: "John Doe", r_street: "350 5th Ave", r_zip: "10118",
      r_city: "New York", r_country: "US", r_state: "NY" }, "r");
  assert.equal(r.country, "US");
  assert.equal(r.state, "NY");
  // Und der Rest des Payloads ist unverändert:
  assert.equal(r.streetAndNumber, "350 5th Ave");
  assert.equal(r.postalCode, "10118");
  assert.equal(r.city, "New York");
});

test("2 — US-Absender: sender.state === \"CA\"", () => {
  const s = buildPartyPayload({ s_country: "US", s_state: "CA", s_city: "Los Angeles" }, "s");
  assert.equal(s.state, "CA");
});

test("3 — Kanada: recipient.state === \"ON\"", () => {
  const r = buildPartyPayload({ r_country: "CA", r_state: "ON", r_city: "Toronto" }, "r");
  assert.equal(r.state, "ON");
});

test("4 — Deutschland: kein unnötiges state-Feld im Payload", () => {
  const r = buildPartyPayload({ r_country: "DE", r_state: "", r_city: "Berlin" }, "r");
  assert.ok(!("state" in r), "ohne Bundesstaat darf der Schlüssel gar nicht entstehen");
  // Auch bei komplett fehlendem Feld (Altvorgang aus einem älteren Bundle):
  const alt = buildPartyPayload({ r_country: "DE", r_city: "Berlin" }, "r");
  assert.ok(!("state" in alt));
});

test("5 — gesendet wird der CODE, nie der Anzeigename", () => {
  // Im Formular steht bereits der Code; dieses Modul formatiert nichts um und erfindet nichts.
  const r = buildPartyPayload({ r_country: "US", r_state: "NY" }, "r");
  assert.equal(r.state, "NY");
  assert.notEqual(r.state, "New York");
  // Ein versehentlich durchgereichter Anzeigename würde als solcher sichtbar bleiben und
  // serverseitig abgelehnt — das Modul repariert ihn bewusst NICHT still.
  const roh = buildPartyPayload({ r_country: "US", r_state: "New York" }, "r");
  assert.equal(roh.state, "New York",
    "kein stilles Umschreiben: die Normalisierung gehört an die Eingabe, nicht in den Payload");
});

/* ══════════ Der eigentliche Regressionsschutz ══════════ */

test("6 — der Bundesstaat überlebt Neue Sendung → BookingPage → /book", () => {
  // Genau die Kette des Live-Fehlers. Der Vorgang reicht das GANZE form-Objekt über
  // navigate("/booking", { state: { …, form } }) weiter; die Buchungsseite liest daraus.
  const form = { r_fullName: "John Doe", r_street: "350 5th Ave", r_zip: "10118",
                 r_city: "New York", r_country: "US", r_state: "NY" };
  const imPreisrechner = buildPartyPayload(form, "r");           // /calculate-price
  const bookingData    = { form };                                // navigate-State
  const imBuchen       = buildPartyPayload(bookingData.form, "r"); // /book
  assert.equal(imPreisrechner.state, "NY");
  assert.equal(imBuchen.state, "NY", "genau hier ging der Bundesstaat live verloren");
  assert.deepEqual(imBuchen, imPreisrechner, "beide Payloads müssen identisch sein");
});

test("7 — der Bundesstaat überlebt die Wiederherstellung des Vorgangs", () => {
  const form = { r_country: "US", r_state: "NY", s_country: "DE", s_state: "" };
  // Ein wiederhergestellter Vorgang reicht dasselbe Formularobjekt weiter.
  const wieder = buildPartyPayload({ ...form }, "r");
  assert.equal(wieder.state, "NY");
  assert.ok(!("state" in buildPartyPayload({ ...form }, "s")), "DE-Absender ohne state");
});

test("8 — Entwurf fortsetzen: der Bundesstaat landet danach im /book-Payload", () => {
  // buildResumeInitialState nimmt den Snapshot DIREKT (sender/recipient/…), nicht in einer
  // formData-Hülle — der Entwurfsendpunkt liefert genau diese Form.
  const wieder = buildResumeInitialState({
    sender:    { country: "DE" },
    recipient: { country: "US", state: "NY", city: "New York", postalCode: "10118" },
  });
  assert.equal(wieder.form.r_state, "NY", "der Entwurf muss den Bundesstaat zurückbringen");
  assert.equal(buildPartyPayload(wieder.form, "r").state, "NY");
});

/* ══════════ Strukturschutz ══════════ */

test("9 — die Buchungsseite führt KEINE eigene Adress-Feldliste mehr", () => {
  assert.match(buchung, /buildPartyPayload\(bookingData\?\.form, p\)/,
    "BookingPage muss den gemeinsamen Erbauer benutzen");
  // Die alte Doppelpflege darf nicht zurückkehren:
  assert.ok(!/streetAndNumber:\s+f\[`\$\{p\}_street`\]/.test(buchung),
    "keine zweite Feldliste in der Buchungsseite");
});

test("10 — es gibt genau EINEN Adress-Erbauer im Frontend", () => {
  const util = lies("./newShipmentForm.mjs");
  assert.equal((util.match(/export function buildPartyPayload\(/g) || []).length, 1);
  // Und keine Seite baut streetAndNumber noch selbst zusammen:
  for (const [name, code] of [["BookingPage", buchung],
                              ["NewShipmentPage", lies("../pages/NewShipmentPage.jsx")]]) {
    assert.ok(!/streetAndNumber:\s*(form|f)\[/.test(code),
      `${name} darf den Adresspayload nicht selbst zusammensetzen`);
  }
});
