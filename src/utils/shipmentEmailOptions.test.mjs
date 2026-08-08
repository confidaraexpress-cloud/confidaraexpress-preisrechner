/* Zusätzliche Versand-E-Mails — reine Frontendlogik.
   =============================================================================
   Validierung nur bei aktiver Option, und der Payload trägt die Adresse statt
   des Schalterzustands. Beides sind Regeln, deren Verletzung Geld kostet: eine
   nicht gewollte Mail an einen fremden Empfänger bzw. eine Buchung, die an einem
   ausgeschalteten Feld scheitert. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  shipmentEmailError, buildShipmentEmailPayload, EMAIL_MAX_LENGTH,
} from "./shipmentEmailOptions.mjs";

test("1 — ausgeschaltet wird nie validiert", () => {
  // Ein ausgeschalteter Bereich darf die Buchung unter keinen Umständen blockieren:
  // sein Wert wird ohnehin nicht gesendet.
  for (const wert of ["", "   ", "voelliger unsinn", "kein-at", "a@b"]) {
    assert.equal(shipmentEmailError(false, wert), null, JSON.stringify(wert));
  }
});

test("2 — eingeschaltet und leer ergibt einen Feldfehler", () => {
  for (const wert of ["", "   ", null, undefined]) {
    const fehler = shipmentEmailError(true, wert);
    assert.ok(fehler, `leerer Wert ${JSON.stringify(wert)} muss gemeldet werden`);
    assert.match(fehler, /E-Mail-Adresse ein/);
  }
});

test("3 — eingeschaltet und ungültig ergibt einen Feldfehler", () => {
  for (const wert of ["kein-at", "a@b", "a b@c.de", "@example.de", "a@.de"]) {
    assert.ok(shipmentEmailError(true, wert), `ungültig akzeptiert: ${wert}`);
  }
});

test("4 — eingeschaltet und gültig ist in Ordnung (auch mit Leerzeichen)", () => {
  for (const wert of ["a@example.de", "  logistik@firma.de  ", "vorname.name+tag@sub.firma.co.uk"]) {
    assert.equal(shipmentEmailError(true, wert), null, wert);
  }
});

test("5 — die Längengrenze entspricht dem Backend", () => {
  assert.equal(EMAIL_MAX_LENGTH, 255);
  const zuLang = "a".repeat(EMAIL_MAX_LENGTH) + "@example.de";
  assert.match(shipmentEmailError(true, zuLang), /255 Zeichen/);
});

test("6 — ohne aktive Option enthält der Payload keine neuen Felder", () => {
  // Der bestehende Buchungsvertrag bleibt damit unverändert.
  assert.deepEqual(buildShipmentEmailPayload({}), {});
  assert.deepEqual(buildShipmentEmailPayload({
    trackingEmailEnabled: false, trackingEmail: "a@example.de",
    labelTrackingEmailEnabled: false, labelTrackingEmail: "b@example.de",
  }), {}, "ausgeschaltete Optionen dürfen nichts senden");
});

test("7 — aktive Optionen senden die Adresse, getrimmt", () => {
  assert.deepEqual(buildShipmentEmailPayload({
    trackingEmailEnabled: true, trackingEmail: "  tracking@example.de ",
  }), { trackingEmail: "tracking@example.de" });

  assert.deepEqual(buildShipmentEmailPayload({
    labelTrackingEmailEnabled: true, labelTrackingEmail: "lager@example.de",
  }), { labelTrackingEmail: "lager@example.de" });

  assert.deepEqual(buildShipmentEmailPayload({
    trackingEmailEnabled: true, trackingEmail: "t@example.de",
    labelTrackingEmailEnabled: true, labelTrackingEmail: "l@example.de",
  }), { trackingEmail: "t@example.de", labelTrackingEmail: "l@example.de" });
});

test("8 — aktiv, aber leer erzeugt kein leeres Feld im Payload", () => {
  // Sonst stünde ein leerer String im Vertrag, den das Backend erst ablehnen müsste.
  assert.deepEqual(buildShipmentEmailPayload({
    trackingEmailEnabled: true, trackingEmail: "   ",
    labelTrackingEmailEnabled: true, labelTrackingEmail: "",
  }), {});
});

test("9 — der Schalterzustand selbst wird NIE gesendet", () => {
  const payload = buildShipmentEmailPayload({
    trackingEmailEnabled: true, trackingEmail: "a@example.de",
    labelTrackingEmailEnabled: true, labelTrackingEmail: "b@example.de",
  });
  for (const key of Object.keys(payload)) {
    assert.ok(!/Enabled$/.test(key), `UI-Zustand im Payload: ${key}`);
  }
  assert.deepEqual(Object.keys(payload).sort(), ["labelTrackingEmail", "trackingEmail"]);
});

test("10 — Groß-/Kleinschreibung wird nicht verändert", () => {
  // Der lokale Teil darf case-sensitiv sein; Dedup passiert serverseitig.
  assert.deepEqual(buildShipmentEmailPayload({
    trackingEmailEnabled: true, trackingEmail: "Logistik@Example.DE",
  }), { trackingEmail: "Logistik@Example.DE" });
});
