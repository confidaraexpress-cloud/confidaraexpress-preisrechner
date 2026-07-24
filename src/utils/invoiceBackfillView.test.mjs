// Tests für die PDF-Backfill-Anzeigelogik (Phase 5, korrigierter Standardprozess): Readiness-
// Anzeige, Feld-Labels, Kandidatenstatus, Aktions-Freischaltung, Outcome-Meldungen. Node's
// eingebauter Test-Runner: node --test src/utils/invoiceBackfillView.test.mjs (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readinessMeta, fieldLabel, candidateStatusMeta, canBackfillCandidate, backfillOutcomeMessage,
} from "./invoiceBackfillView.mjs";

// ── readinessMeta ────────────────────────────────────────────────────────────
test("readinessMeta: Testmodus hat Vorrang (gelb)", () => {
  assert.deepEqual(readinessMeta({ testMode: true, ready: false }), ["badge-yellow", "Testmodus aktiv"]);
  assert.equal(readinessMeta({ testMode: true, ready: true })[0], "badge-yellow");
});
test("readinessMeta: bereit → grün, sonst → rot", () => {
  assert.deepEqual(readinessMeta({ testMode: false, ready: true }), ["badge-green", "Produktivbereit"]);
  assert.deepEqual(readinessMeta({ testMode: false, ready: false }), ["badge-red", "Nicht bereit"]);
});
test("readinessMeta: fehlend/ungültig → grau (kein Absturz)", () => {
  assert.equal(readinessMeta(null)[0], "badge-gray");
  assert.equal(readinessMeta(undefined)[1], "Unbekannt");
});

// ── fieldLabel ───────────────────────────────────────────────────────────────
test("fieldLabel: bekannte Schlüssel → deutsche Labels", () => {
  assert.equal(fieldLabel("bank.iban"), "IBAN");
  assert.equal(fieldLabel("issuer.registerCourt"), "Registergericht");
  assert.equal(fieldLabel("customer_snapshot"), "Kundendaten (Firma)");
  assert.equal(fieldLabel("amounts"), "Beträge");
});
test("fieldLabel: unbekannter Schlüssel → Rohwert (kein Absturz)", () => {
  assert.equal(fieldLabel("foo.bar"), "foo.bar");
  assert.equal(fieldLabel(null), "—");
});

// ── candidateStatusMeta ───────────────────────────────────────────────────────
test("candidateStatusMeta: bereits fertig → grün 'PDF vorhanden'", () => {
  assert.deepEqual(candidateStatusMeta({ alreadyReady: true, generatable: false }), ["badge-green", "PDF vorhanden"]);
});
test("candidateStatusMeta: fehlend + erzeugbar → blau 'PDF fehlt'", () => {
  assert.deepEqual(candidateStatusMeta({ alreadyReady: false, generatable: true }), ["badge-blue", "PDF fehlt"]);
});
test("candidateStatusMeta: fehlend + NICHT erzeugbar → gelb 'Daten unvollständig'", () => {
  assert.deepEqual(candidateStatusMeta({ alreadyReady: false, generatable: false }), ["badge-yellow", "Daten unvollständig"]);
});
test("candidateStatusMeta: fehlend/leer → kein Absturz, Standardfall", () => {
  assert.deepEqual(candidateStatusMeta(null), ["badge-yellow", "Daten unvollständig"]);
  assert.deepEqual(candidateStatusMeta({}), ["badge-yellow", "Daten unvollständig"]);
});

// ── canBackfillCandidate ──────────────────────────────────────────────────────
test("canBackfillCandidate: NUR generatable===true schaltet die Aktion frei", () => {
  assert.equal(canBackfillCandidate({ generatable: true }), true);
  assert.equal(canBackfillCandidate({ generatable: false }), false);
  assert.equal(canBackfillCandidate({ alreadyReady: true }), false, "bereits fertig → keine erneute Erzeugung nötig");
  assert.equal(canBackfillCandidate(null), false);
  assert.equal(canBackfillCandidate({}), false);
});

// ── backfillOutcomeMessage ────────────────────────────────────────────────────
test("backfillOutcomeMessage: outcome → type", () => {
  assert.equal(backfillOutcomeMessage("generated").type, "success");
  assert.equal(backfillOutcomeMessage("already_ready").type, "info");
  assert.equal(backfillOutcomeMessage("in_progress").type, "info");
  assert.equal(backfillOutcomeMessage("not_booked").type, "error");
  assert.equal(backfillOutcomeMessage("failed").type, "error");
  assert.equal(backfillOutcomeMessage("weird").type, "error");
});
