// Übernahmeseite /preisrechner-uebernahme und Anmeldeseite: Ausgang der Prüfung, Rollen, Hinweise.
//
// Run: node --test src/utils/publicQuoteHandoffView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ADMIN_HOME, HANDOFF_AUTH_TEXT, HANDOFF_STATE, handoffVerifyOutcome, isCustomerAccount, ownHomeFor,
} from "./publicQuoteHandoffView.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("(1) Ausgang der Prüfung: Übernahme nur mit Eingaben UND Auswahl; 410/400/403 verbrauchen das Token, sonst nicht", () => {
  const ok = handoffVerifyOutcome(200, { input: { from_zip: "70173" }, selection: { productKey: "pk1_x" } });
  assert.equal(ok.kind, "transfer");
  assert.deepEqual(handoffVerifyOutcome(200, { input: {} }), { kind: "state", state: HANDOFF_STATE.ERROR, consume: false });
  assert.deepEqual(handoffVerifyOutcome(401, {}), { kind: "relogin" });
  assert.deepEqual(handoffVerifyOutcome(410, {}), { kind: "state", state: HANDOFF_STATE.EXPIRED, consume: true });
  assert.deepEqual(handoffVerifyOutcome(400, {}), { kind: "state", state: HANDOFF_STATE.INVALID, consume: true });
  assert.deepEqual(handoffVerifyOutcome(403, {}), { kind: "state", state: HANDOFF_STATE.ROLE, consume: true });
  assert.deepEqual(handoffVerifyOutcome(429, {}), { kind: "state", state: HANDOFF_STATE.ERROR, consume: false });
  assert.deepEqual(handoffVerifyOutcome(502, null), { kind: "state", state: HANDOFF_STATE.ERROR, consume: false });
});

test("(2) Rollen: nur ein Kundenkonto übernimmt; Admin und Partner kommen auf ihre eigene Startseite", () => {
  assert.equal(isCustomerAccount({ role: "customer" }), true);
  for (const k of [{ role: "admin" }, { role: "sales_partner" }, { role: "Customer" }, {}, null]) {
    assert.equal(isCustomerAccount(k), false, JSON.stringify(k));
  }
  assert.equal(ownHomeFor({ role: "sales_partner" }), "/partner");
  assert.equal(ownHomeFor({ role: "admin" }), ADMIN_HOME);
  assert.equal(ownHomeFor({ role: "customer" }), "/dashboard");
});

test("(3) Übernahmeseite: Rolle vor jeder Prüfung, Anmeldung mit Rücksprung, Patch über die Übergabefunktion", () => {
  const src = ohneKommentare(read("pages/PublicQuoteHandoffPage.jsx"));
  const rolle = src.indexOf("if (!isCustomerAccount(user))");
  const pruefung = src.indexOf("pruefe(token);");
  assert.ok(rolle > 0 && pruefung > rolle, "ein Nicht-Kundenkonto darf nie den Kundenendpunkt erreichen");
  assert.match(src, /navigate\("\/login", \{ replace: true, state: \{ from: HANDOFF_PATH \} \}\)/);
  assert.match(src, /clearScope\("shipment"\);\s*\n\s*setScope\("shipment", publicQuoteToShipmentTransfer\(/);
  assert.match(src, /navigate\("\/dashboard\?page=new", \{ replace: true \}\)/);
  assert.doesNotMatch(src, /localStorage|sessionStorage/);
});

test("(4) Anmeldeseite: Hinweisband, Übernahmeseite für jede Rolle, nach der Registrierung verworfen und gesagt", () => {
  const src = ohneKommentare(read("pages/AuthPage.jsx"));
  assert.match(src, /useState\(\(\) => hasPendingHandoff\(\)\)/);
  assert.match(src, /id="auth-handoff-pending">\{HANDOFF_AUTH_TEXT\.pending\}/);
  assert.match(src, /id="auth-handoff-dropped">\{HANDOFF_AUTH_TEXT\.droppedAfterRegistration\}/);
  // Vor der unveränderten Rollenweiche: eine wartende Übernahme entscheidet die Übernahmeseite.
  const umleitung = src.indexOf("if (returnTarget === HANDOFF_PATH && hasPendingHandoff()) { navigate(HANDOFF_PATH);");
  const weiche = src.indexOf("if (isSalesPartner(ok)) navigate(partnerReturnTarget(returnTarget) || landingPathFor(ok));");
  assert.ok(umleitung > 0 && weiche > umleitung);
  assert.match(src, /setTab\("login"\);\s*\n\s*if \(hasPendingHandoff\(\)\) \{\s*\n\s*clearPendingHandoff\(\);\s*\n\s*setUebernahmeWartet\(false\);\s*\n\s*setUebernahmeVerworfen\(true\);/);
  assert.match(HANDOFF_AUTH_TEXT.droppedAfterRegistration, /bis zur Freischaltung Ihres Kontos nicht erhalten/);
});
