// Tests für das Buchungs-Gate (AGB + Ausschlussgüter-Bestätigung + bestehende Gates).
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/bookingGate.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSubmitBooking } from "./bookingGate.mjs";

const OK = { agbAccepted: true, prohibitedGoodsAccepted: true, loading: false, insuranceBlocksBooking: false };

// ── Beide Bestätigungen als Voraussetzung ────────────────────────────────────
test("keine Bestätigung → blockiert", () => {
  assert.equal(canSubmitBooking({ ...OK, agbAccepted: false, prohibitedGoodsAccepted: false }), false);
});

test("nur AGB akzeptiert → weiterhin blockiert", () => {
  assert.equal(canSubmitBooking({ ...OK, prohibitedGoodsAccepted: false }), false);
});

test("nur Ausschlussbestätigung akzeptiert → weiterhin blockiert", () => {
  assert.equal(canSubmitBooking({ ...OK, agbAccepted: false }), false);
});

test("beide akzeptiert + keine weiteren Blocker → Buchung erlaubt", () => {
  assert.equal(canSubmitBooking(OK), true);
});

// ── Bestehende Gates bleiben wirksam (AGB nicht abgeschwächt) ─────────────────
test("beide akzeptiert, aber loading → blockiert", () => {
  assert.equal(canSubmitBooking({ ...OK, loading: true }), false);
});

test("beide akzeptiert, aber Versicherung blockiert → blockiert", () => {
  assert.equal(canSubmitBooking({ ...OK, insuranceBlocksBooking: true }), false);
});

// ── Robustheit: nur echtes true zählt (kein truthy-Bypass) ───────────────────
test("truthy-Werte statt true zählen nicht (defensiv)", () => {
  assert.equal(canSubmitBooking({ ...OK, agbAccepted: 1 }), false);
  assert.equal(canSubmitBooking({ ...OK, prohibitedGoodsAccepted: "yes" }), false);
});

test("leerer/fehlender Aufruf → blockiert (kein Crash)", () => {
  assert.equal(canSubmitBooking(), false);
  assert.equal(canSubmitBooking({}), false);
});
