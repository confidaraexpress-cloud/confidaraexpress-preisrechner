// Tests für die Produktions-Cutover/Backfill-Anzeigelogik (Klassifikation, Readiness,
// Feld-/Warnungs-Labels, Aktions-Freischaltung). Node's eingebauter Test-Runner:
//   node --test src/utils/invoiceBackfillView.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classificationMeta, readinessMeta, fieldLabel, warningLabel,
  isProductionCandidate, isBackfilled, backfillRowActions,
  backfillOutcomeMessage, backfillEmailOutcomeMessage,
} from "./invoiceBackfillView.mjs";

// ── classificationMeta ───────────────────────────────────────────────────────
test("classificationMeta: A/B sind backfill-fähig (blaue Badges, Beschreibung)", () => {
  for (const c of ["A", "B"]) {
    const [cls, label, desc] = classificationMeta(c);
    assert.equal(cls, "badge-blue");
    assert.ok(label.startsWith(c + " ·"));
    assert.ok(desc.length > 0);
  }
});
test("classificationMeta: E=grün (produktiv), F=rot (inkonsistent), D=grau (Test)", () => {
  assert.equal(classificationMeta("E")[0], "badge-green");
  assert.equal(classificationMeta("F")[0], "badge-red");
  assert.equal(classificationMeta("D")[0], "badge-gray");
});
test("classificationMeta: unbekannt → grau + Rohwert", () => {
  assert.deepEqual(classificationMeta("Z"), ["badge-gray", "Z", ""]);
  assert.equal(classificationMeta(null)[1], "—");
});

// ── readinessMeta ────────────────────────────────────────────────────────────
test("readinessMeta: Testmodus hat Vorrang (gelb)", () => {
  assert.deepEqual(readinessMeta({ testMode: true, ready: false }), ["badge-yellow", "Testmodus aktiv"]);
  // Testmodus schlägt auch ein (widersprüchliches) ready:true
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

// ── fieldLabel / warningLabel ────────────────────────────────────────────────
test("fieldLabel: bekannte Schlüssel → deutsche Labels", () => {
  assert.equal(fieldLabel("bank.iban"), "IBAN");
  assert.equal(fieldLabel("issuer.registerCourt"), "Registergericht");
  assert.equal(fieldLabel("issuer.taxNumberOrVatId"), "Steuernummer oder USt-IdNr.");
});
test("fieldLabel: unbekannter Schlüssel → Rohwert (kein Absturz)", () => {
  assert.equal(fieldLabel("foo.bar"), "foo.bar");
  assert.equal(fieldLabel(null), "—");
});
test("warningLabel: bekannte Codes → deutsche Texte, unbekannt → Rohwert", () => {
  assert.equal(warningLabel("duplicate_original_invoice"), "Weitere Originalrechnung für dieselbe Sendung");
  assert.equal(warningLabel("test_markers_in_snapshot"), "Testmarker in den Kundendaten");
  assert.equal(warningLabel("unknown_code"), "unknown_code");
});

// ── isProductionCandidate / isBackfilled ─────────────────────────────────────
test("isProductionCandidate: nur ready + is_test_document===false", () => {
  assert.equal(isProductionCandidate({ documentStatus: "ready", isTestDocument: false }), true);
  assert.equal(isProductionCandidate({ documentStatus: "ready", isTestDocument: true }), false);
  assert.equal(isProductionCandidate({ documentStatus: "ready", isTestDocument: null }), false, "NULL = konservativ Test");
  assert.equal(isProductionCandidate({ documentStatus: "pending_document", isTestDocument: false }), false);
});
test("isBackfilled: documentBackfilledAt gesetzt", () => {
  assert.equal(isBackfilled({ documentBackfilledAt: "2026-07-24T10:00:00Z" }), true);
  assert.equal(isBackfilled({ documentBackfilledAt: null }), false);
  assert.equal(isBackfilled({ documentBackfilledAt: "" }), false);
  assert.equal(isBackfilled({}), false);
});

// ── backfillRowActions ───────────────────────────────────────────────────────
test("Aktionen A: nur 'rückwirkend erzeugen' aktiv", () => {
  const a = backfillRowActions({ classification: "A", eligibleForProductionBackfill: true, documentStatus: "pending_document", isTestDocument: null, documentBackfilledAt: null, eligibleForEmail: false });
  assert.deepEqual(a, { canBackfill: true, canViewProduction: false, canSendBackfilledEmail: false });
});
test("Aktionen B (Test-PDF): erzeugen aktiv, ansehen/senden inaktiv (noch Testdokument)", () => {
  const a = backfillRowActions({ classification: "B", eligibleForProductionBackfill: true, documentStatus: "ready", isTestDocument: true, documentBackfilledAt: null, eligibleForEmail: false });
  assert.equal(a.canBackfill, true);
  assert.equal(a.canViewProduction, false, "Testdokument ist kein Produktivdokument");
  assert.equal(a.canSendBackfilledEmail, false);
});
test("Aktionen nach Backfill: ansehen + senden aktiv, erzeugen inaktiv", () => {
  const a = backfillRowActions({ classification: "E", eligibleForProductionBackfill: false, documentStatus: "ready", isTestDocument: false, documentBackfilledAt: "2026-07-24T10:00:00Z", eligibleForEmail: true });
  assert.equal(a.canBackfill, false);
  assert.equal(a.canViewProduction, true);
  assert.equal(a.canSendBackfilledEmail, true);
});
test("Aktionen: normale Produktivrechnung (NICHT backfilled) → 'rückwirkend senden' bleibt inaktiv", () => {
  // Klasse E ohne documentBackfilledAt: ansehen ja, aber KEIN rückwirkender Versand
  const a = backfillRowActions({ classification: "E", eligibleForProductionBackfill: false, documentStatus: "ready", isTestDocument: false, documentBackfilledAt: null, eligibleForEmail: true });
  assert.equal(a.canViewProduction, true);
  assert.equal(a.canSendBackfilledEmail, false, "normaler Produktivversand läuft NICHT über den Backfill-Versand");
});
test("Aktionen: bereits versendete Backfill-Rechnung → senden inaktiv", () => {
  const a = backfillRowActions({ documentStatus: "ready", isTestDocument: false, documentBackfilledAt: "2026-07-24T10:00:00Z", eligibleForEmail: false });
  assert.equal(a.canSendBackfilledEmail, false, "eligibleForEmail=false (bereits gesendet)");
});
test("Aktionen: leerer/fehlender Kandidat → alles inaktiv (kein Absturz)", () => {
  assert.deepEqual(backfillRowActions(null), { canBackfill: false, canViewProduction: false, canSendBackfilledEmail: false });
  assert.deepEqual(backfillRowActions({}), { canBackfill: false, canViewProduction: false, canSendBackfilledEmail: false });
});

// ── Outcome-Meldungen ────────────────────────────────────────────────────────
test("backfillOutcomeMessage: outcome → type", () => {
  assert.equal(backfillOutcomeMessage("backfilled").type, "success");
  assert.equal(backfillOutcomeMessage("already_production").type, "info");
  assert.equal(backfillOutcomeMessage("not_eligible").type, "error");
  assert.equal(backfillOutcomeMessage("blocked").type, "error");
  assert.equal(backfillOutcomeMessage("weird").type, "error");
});
test("backfillEmailOutcomeMessage: outcome → type", () => {
  assert.equal(backfillEmailOutcomeMessage("sent").type, "success");
  assert.equal(backfillEmailOutcomeMessage("already_sent").type, "info");
  assert.equal(backfillEmailOutcomeMessage("in_progress").type, "info");
  assert.equal(backfillEmailOutcomeMessage("blocked").type, "error");
  assert.equal(backfillEmailOutcomeMessage("failed").type, "error");
});
