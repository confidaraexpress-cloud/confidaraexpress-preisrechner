// Tests für die Anzeige-/Übergangslogik der Admin-Stornierungsanfragen.
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminCancellations.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancellationStatusMeta,
  CANCELLATION_STATUS_ORDER,
  CANCELLATION_STATUS_FILTER_OPTIONS,
  TERMINAL_CANCELLATION_STATUSES,
  isTerminalCancellationStatus,
  allowedCancellationTargets,
  cancellationStatusOptions,
  isCancellationEditable,
  normalizeNote,
  hasCancellationEdit,
} from "./adminCancellations.mjs";

// ── Status-Meta ──────────────────────────────────────────────────────────────
test("Status-Meta: die vier belegten Status → Klasse + deutsches Label", () => {
  assert.deepEqual(cancellationStatusMeta("pending"), ["badge-yellow", "Offen"]);
  assert.deepEqual(cancellationStatusMeta("in_review"), ["badge-blue", "In Prüfung"]);
  assert.deepEqual(cancellationStatusMeta("accepted"), ["badge-green", "Angenommen"]);
  assert.deepEqual(cancellationStatusMeta("rejected"), ["badge-red", "Abgelehnt"]);
});

test("Status-Meta Fallback: unbekannt → grau + Rohwert; null → grau + Strich", () => {
  assert.deepEqual(cancellationStatusMeta("weird"), ["badge-gray", "weird"]);
  assert.deepEqual(cancellationStatusMeta(null), ["badge-gray", "—"]);
  assert.deepEqual(cancellationStatusMeta(undefined), ["badge-gray", "—"]);
});

// ── Filteroptionen ───────────────────────────────────────────────────────────
test("Filteroptionen: Alle + vier Status in stabiler Reihenfolge", () => {
  assert.deepEqual(
    CANCELLATION_STATUS_FILTER_OPTIONS.map((o) => o.value),
    ["", "pending", "in_review", "accepted", "rejected"],
  );
  // "Alle" trägt einen leeren Wert (→ kein Filter wird gesendet).
  assert.equal(CANCELLATION_STATUS_FILTER_OPTIONS[0].value, "");
});

test("Status-Reihenfolge ist die erwartete Vier-Schritt-Folge", () => {
  assert.deepEqual(CANCELLATION_STATUS_ORDER, ["pending", "in_review", "accepted", "rejected"]);
});

// ── Terminale Status / Reopen-Sperre ─────────────────────────────────────────
test("terminale Status: accepted/rejected sind terminal, pending/in_review nicht", () => {
  assert.deepEqual(TERMINAL_CANCELLATION_STATUSES, ["accepted", "rejected"]);
  assert.equal(isTerminalCancellationStatus("accepted"), true);
  assert.equal(isTerminalCancellationStatus("rejected"), true);
  assert.equal(isTerminalCancellationStatus("pending"), false);
  assert.equal(isTerminalCancellationStatus("in_review"), false);
  assert.equal(isTerminalCancellationStatus("weird"), false);
});

// ── Erlaubte Übergänge (vorwärtsgerichtet, kein Reopen) ──────────────────────
test("Übergänge ab pending: in_review/accepted/rejected", () => {
  assert.deepEqual(allowedCancellationTargets("pending"), ["in_review", "accepted", "rejected"]);
});

test("Übergänge ab in_review: nur accepted/rejected (nicht zurück auf pending)", () => {
  assert.deepEqual(allowedCancellationTargets("in_review"), ["accepted", "rejected"]);
});

test("terminale/unbekannte Status erlauben KEINE Übergänge (kein Reopen)", () => {
  assert.deepEqual(allowedCancellationTargets("accepted"), []);
  assert.deepEqual(allowedCancellationTargets("rejected"), []);
  assert.deepEqual(allowedCancellationTargets("weird"), []);
  assert.deepEqual(allowedCancellationTargets(null), []);
});

// ── Select-Optionen im Detail ────────────────────────────────────────────────
test("Select ab pending: aktueller Status + Ziele, in stabiler Reihenfolge", () => {
  assert.deepEqual(
    cancellationStatusOptions("pending").map((o) => o.value),
    ["pending", "in_review", "accepted", "rejected"],
  );
});

test("Select ab in_review: aktueller Status + accepted/rejected (kein pending)", () => {
  assert.deepEqual(
    cancellationStatusOptions("in_review").map((o) => o.value),
    ["in_review", "accepted", "rejected"],
  );
});

test("Select für terminale/unbekannte Status ist leer (kein Editor)", () => {
  assert.deepEqual(cancellationStatusOptions("accepted"), []);
  assert.deepEqual(cancellationStatusOptions("rejected"), []);
  assert.deepEqual(cancellationStatusOptions("weird"), []);
  assert.deepEqual(cancellationStatusOptions(null), []);
});

// ── Bearbeitbarkeit ──────────────────────────────────────────────────────────
test("bearbeitbar nur bei bekanntem, nicht-terminalem Status", () => {
  assert.equal(isCancellationEditable("pending"), true);
  assert.equal(isCancellationEditable("in_review"), true);
  assert.equal(isCancellationEditable("accepted"), false);
  assert.equal(isCancellationEditable("rejected"), false);
  assert.equal(isCancellationEditable("weird"), false);
  assert.equal(isCancellationEditable(null), false);
});

// ── Notiz-Normalisierung ─────────────────────────────────────────────────────
test("normalizeNote: null/undefined → '', trimmt Ränder", () => {
  assert.equal(normalizeNote(null), "");
  assert.equal(normalizeNote(undefined), "");
  assert.equal(normalizeNote("  hallo  "), "hallo");
  assert.equal(normalizeNote("   "), "");
});

// ── Änderungserkennung (verhindert leere PATCHes) ────────────────────────────
test("keine Änderung: gleicher Status und (getrimmt) gleiche Notiz", () => {
  assert.equal(hasCancellationEdit({
    currentStatus: "pending", nextStatus: "pending",
    currentNote: "abc", nextNote: "abc",
  }), false);
  // reine Whitespace-Änderung zählt nicht
  assert.equal(hasCancellationEdit({
    currentStatus: "pending", nextStatus: "pending",
    currentNote: "abc", nextNote: "  abc  ",
  }), false);
  // null vs "" zählt nicht als Änderung
  assert.equal(hasCancellationEdit({
    currentStatus: "pending", nextStatus: "pending",
    currentNote: null, nextNote: "",
  }), false);
});

test("Änderung erkannt: Statuswechsel ODER inhaltliche Notizänderung", () => {
  assert.equal(hasCancellationEdit({
    currentStatus: "pending", nextStatus: "in_review",
    currentNote: "abc", nextNote: "abc",
  }), true);
  assert.equal(hasCancellationEdit({
    currentStatus: "pending", nextStatus: "pending",
    currentNote: "abc", nextNote: "abcd",
  }), true);
  // Notiz erstmalig gesetzt (vorher leer)
  assert.equal(hasCancellationEdit({
    currentStatus: "pending", nextStatus: "pending",
    currentNote: "", nextNote: "neuer Vermerk",
  }), true);
});
