// Sichtbarkeit von Feldfehlern in den Versandformularen (Auftrag 1, P11, 2026-10-17).
// Das Modul prüft nichts selbst — es entscheidet nur, welche Fehler der vorhandenen Regel
// sichtbar sind. Das Verhalten im Browser prüft tests/e2e/newShipmentFloatingLabels.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  visibleFieldErrors, markFieldTouched, withoutFieldError, firstFieldInOrder, keepFocusOnMouseDown,
} from "./fieldTouchState.mjs";

const LIVE = { s_street: "Straße ist ein Pflichtfeld.", s_city: "Stadt ist ein Pflichtfeld.", weight: "Gewicht fehlt." };

test("1 — unberührte leere Felder bleiben neutral", () => {
  assert.deepEqual(visibleFieldErrors({ live: LIVE }), {});
  assert.deepEqual(visibleFieldErrors(), {});
});

test("2 — Verlassen zeigt nur das verlassene Feld", () => {
  assert.deepEqual(visibleFieldErrors({ live: LIVE, touched: { s_city: true } }), { s_city: "Stadt ist ein Pflichtfeld." });
});

test("3 — ein Klick zeigt alle Fehler; eine Korrektur nimmt den Fehler sofort weg", () => {
  assert.deepEqual(visibleFieldErrors({ live: LIVE, submitted: true }), LIVE);
  const korrigiert = { ...LIVE }; delete korrigiert.s_city;
  assert.deepEqual(visibleFieldErrors({ live: korrigiert, submitted: true, touched: { s_city: true } }),
    { s_street: LIVE.s_street, weight: LIVE.weight });
});

test("4 — Serverfehler bleiben stehen, bis das Feld geändert wird; die eigene Regel hat Vorrang", () => {
  const server = { s_zip: "PLZ passt nicht zum Land.", s_street: "vom Server" };
  const sichtbar = visibleFieldErrors({ live: LIVE, touched: { s_street: true }, server });
  assert.equal(sichtbar.s_zip, "PLZ passt nicht zum Land.");
  assert.equal(sichtbar.s_street, LIVE.s_street, "der Serverfehler überschreibt den Feldfehler");
  assert.deepEqual(withoutFieldError(server, "s_zip"), { s_street: "vom Server" });
  assert.equal(withoutFieldError(server, "unbekannt"), server, "ohne Fehler kein neues Objekt");
});

test("5 — markFieldTouched mutiert nie und liefert dasselbe Objekt, wenn nichts zu tun ist", () => {
  const t = { a: true };
  assert.equal(markFieldTouched(t, "a"), t);
  const n = markFieldTouched(t, "b");
  assert.deepEqual(n, { a: true, b: true });
  assert.deepEqual(t, { a: true });
  assert.deepEqual(markFieldTouched(null, ""), {});
});

test("6 — das erste Fehlerfeld folgt der Formularreihenfolge", () => {
  assert.equal(firstFieldInOrder(LIVE, ["weight", "s_city", "s_street"]), "weight");
  assert.equal(firstFieldInOrder({ x: "Fehler" }, ["a"]), "x", "unbekannte Felder gehen nicht verloren");
  assert.equal(firstFieldInOrder({}, ["a"]), null);
});

test("7 — die primäre Maustaste behält den Fokus im Feld, Tastatur und andere Tasten nicht", () => {
  let verhindert = 0;
  keepFocusOnMouseDown({ button: 0, preventDefault: () => { verhindert++; } });
  keepFocusOnMouseDown({ button: 2, preventDefault: () => { verhindert++; } });
  keepFocusOnMouseDown(undefined);
  assert.equal(verhindert, 1);
});
