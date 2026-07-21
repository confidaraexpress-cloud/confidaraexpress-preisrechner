// Tests für die Logik der Admin-Stornierungsanfragen (kanonische Normalisierung,
// Anzeige-Meta, Übergänge, getrennte Dirty-Erkennung, PATCH-Body-Vertrag).
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
  isCancellationStatusEditable,
  normalizeNote,
  isStatusDirty,
  isNoteDirty,
  normalizeCancellationRequest,
  isNoOpResponse,
  buildCancellationPatchBody,
  SETTABLE_CANCELLATION_STATUS,
} from "./adminCancellations.mjs";

// ── Status-Meta / Labels (verbindliche Bezeichnungen) ────────────────────────
test("Labels: pending/in_review/accepted/rejected exakt wie vorgegeben", () => {
  assert.deepEqual(cancellationStatusMeta("pending"), ["badge-yellow", "Offen"]);
  assert.deepEqual(cancellationStatusMeta("in_review"), ["badge-blue", "In Bearbeitung"]);
  assert.deepEqual(cancellationStatusMeta("accepted"), ["badge-green", "Anfrage angenommen"]);
  assert.deepEqual(cancellationStatusMeta("rejected"), ["badge-red", "Anfrage abgelehnt"]);
});

test("Label In Pruefung wird nirgends mehr verwendet", () => {
  const allLabels = [
    ...CANCELLATION_STATUS_ORDER.map((s) => cancellationStatusMeta(s)[1]),
    ...CANCELLATION_STATUS_FILTER_OPTIONS.map((o) => o.label),
    ...cancellationStatusOptions("pending").map((o) => o.label),
  ];
  for (const l of allLabels) assert.ok(!/Prüfung/.test(l), `unerwartetes Label: ${l}`);
  assert.ok(allLabels.includes("In Bearbeitung"), "In Bearbeitung muss vorkommen");
});

test("Status-Meta Fallback: unbekannt → grau + Rohwert; null → grau + Strich", () => {
  assert.deepEqual(cancellationStatusMeta("weird"), ["badge-gray", "weird"]);
  assert.deepEqual(cancellationStatusMeta(null), ["badge-gray", "—"]);
});

test("Filteroptionen: Alle + vier Status in stabiler Reihenfolge", () => {
  assert.deepEqual(
    CANCELLATION_STATUS_FILTER_OPTIONS.map((o) => o.value),
    ["", "pending", "in_review", "accepted", "rejected"],
  );
  assert.equal(CANCELLATION_STATUS_FILTER_OPTIONS[0].value, "");
});

// ── Terminale Status / Übergänge ─────────────────────────────────────────────
test("terminale Status: accepted/rejected terminal, pending/in_review nicht", () => {
  assert.deepEqual(TERMINAL_CANCELLATION_STATUSES, ["accepted", "rejected"]);
  assert.equal(isTerminalCancellationStatus("accepted"), true);
  assert.equal(isTerminalCancellationStatus("rejected"), true);
  assert.equal(isTerminalCancellationStatus("pending"), false);
  assert.equal(isTerminalCancellationStatus("in_review"), false);
});

test("Übergänge: pending→(in_review,accepted,rejected); in_review→(accepted,rejected)", () => {
  assert.deepEqual(allowedCancellationTargets("pending"), ["in_review", "accepted", "rejected"]);
  assert.deepEqual(allowedCancellationTargets("in_review"), ["accepted", "rejected"]);
});

test("kein Reopen: terminale/unbekannte Status erlauben keine Statusübergänge", () => {
  assert.deepEqual(allowedCancellationTargets("accepted"), []);
  assert.deepEqual(allowedCancellationTargets("rejected"), []);
  assert.deepEqual(allowedCancellationTargets("weird"), []);
});

test("Status-Select: nur bei nicht-terminalem Status, sonst leer", () => {
  assert.deepEqual(cancellationStatusOptions("pending").map((o) => o.value), ["pending", "in_review", "accepted", "rejected"]);
  assert.deepEqual(cancellationStatusOptions("in_review").map((o) => o.value), ["in_review", "accepted", "rejected"]);
  assert.deepEqual(cancellationStatusOptions("accepted"), []);
  assert.deepEqual(cancellationStatusOptions("rejected"), []);
});

test("Statusbearbeitung nur bei bekanntem, nicht-terminalem Status", () => {
  assert.equal(isCancellationStatusEditable("pending"), true);
  assert.equal(isCancellationStatusEditable("in_review"), true);
  assert.equal(isCancellationStatusEditable("accepted"), false);
  assert.equal(isCancellationStatusEditable("rejected"), false);
  assert.equal(isCancellationStatusEditable("weird"), false);
});

// ── Kanonische Normalisierung ────────────────────────────────────────────────
test("normalize: kanonische camelCase-Form wird direkt übernommen", () => {
  const raw = {
    id: 5, status: "in_review", reason: "Grund", adminNote: "Notiz", revision: 2,
    createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-02T00:00:00Z",
    reviewedAt: "2026-07-02T00:00:00Z", reviewedBy: "admin1",
    shipment: { id: 90, carrier: "ups", service_type: "pickup", status: "booked", price_final: 9.9, from_country: "de", to_country: "ch" },
    customer: { id: 42, company_name: "Muster GmbH", name: "Erika", email: "e@x.de" },
    invoice: { id: 7 }, notification: { sent: false },
  };
  const n = normalizeCancellationRequest(raw);
  assert.equal(n.id, 5);
  assert.equal(n.status, "in_review");
  assert.equal(n.reason, "Grund");
  assert.equal(n.adminNote, "Notiz");
  assert.equal(n.revision, 2);
  assert.equal(n.reviewedBy, "admin1");
  assert.equal(n.shipment.id, 90);
  assert.equal(n.shipment.carrier, "ups");
  assert.equal(n.shipment.serviceType, "pickup");
  assert.equal(n.customer.id, 42);
  assert.equal(n.customer.company, "Muster GmbH");
  assert.equal(n.customer.email, "e@x.de");
  assert.deepEqual(n.invoice, { id: 7 });
});

test("normalize: snake_case wird zentral abgebildet (admin_note → adminNote)", () => {
  const n = normalizeCancellationRequest({
    id: 1, state: "pending", cancellation_reason: "R", admin_note: "SnakeNote",
    created_at: "2026-07-01", shipment_id: 900, user_id: 77,
  });
  assert.equal(n.status, "pending");
  assert.equal(n.reason, "R");
  assert.equal(n.adminNote, "SnakeNote");
  assert.equal(n.createdAt, "2026-07-01");
  // flache IDs landen in den kanonischen Sub-Objekten
  assert.equal(n.shipment.id, 900);
  assert.equal(n.customer.id, 77);
});

test("normalize: adminNote priorisiert camelCase, erhält leeren String, sonst null", () => {
  assert.equal(normalizeCancellationRequest({ adminNote: "A", admin_note: "B" }).adminNote, "A");
  assert.equal(normalizeCancellationRequest({ adminNote: "" }).adminNote, ""); // bewusst geleert
  assert.equal(normalizeCancellationRequest({ adminNote: null, admin_note: undefined }).adminNote, null);
  assert.equal(normalizeCancellationRequest({}).adminNote, null);
});

test("normalize: revision=0 bleibt erhalten; fehlend → undefined", () => {
  assert.equal(normalizeCancellationRequest({ id: 1, revision: 0 }).revision, 0);
  assert.equal(normalizeCancellationRequest({ id: 1 }).revision, undefined);
});

test("normalize: leerer/kein Datensatz → null; shipment/customer immer Objekt", () => {
  assert.equal(normalizeCancellationRequest(null), null);
  assert.equal(normalizeCancellationRequest("x"), null);
  const n = normalizeCancellationRequest({ id: 1 });
  assert.equal(typeof n.shipment, "object");
  assert.equal(typeof n.customer, "object");
  assert.equal(n.shipment.id, undefined);
});

// ── No-op ────────────────────────────────────────────────────────────────────
test("isNoOpResponse erkennt noOp/no_op/noop", () => {
  assert.equal(isNoOpResponse({ noOp: true }), true);
  assert.equal(isNoOpResponse({ no_op: true }), true);
  assert.equal(isNoOpResponse({ noop: true }), true);
  assert.equal(isNoOpResponse({ noOp: false }), false);
  assert.equal(isNoOpResponse({}), false);
  assert.equal(isNoOpResponse(null), false);
});

// ── Dirty-Erkennung (getrennt) ───────────────────────────────────────────────
test("normalizeNote: null/undefined → '', trimmt Ränder", () => {
  assert.equal(normalizeNote(null), "");
  assert.equal(normalizeNote(undefined), "");
  assert.equal(normalizeNote("  hallo  "), "hallo");
});

test("isStatusDirty: nur bei nicht-terminalem Ausgangsstatus und echtem Wechsel", () => {
  assert.equal(isStatusDirty("pending", "in_review"), true);
  assert.equal(isStatusDirty("pending", "pending"), false);
  // terminal: Statuswechsel gesperrt → immer false
  assert.equal(isStatusDirty("accepted", "in_review"), false);
  assert.equal(isStatusDirty("rejected", "accepted"), false);
});

test("isNoteDirty: inhaltliche Änderung inkl. Leeren; Whitespace/null↔'' zählt nicht", () => {
  assert.equal(isNoteDirty("abc", "abcd"), true);
  assert.equal(isNoteDirty("abc", ""), true);      // bewusst geleert
  assert.equal(isNoteDirty("", "neu"), true);      // erstmals gesetzt
  assert.equal(isNoteDirty("abc", "  abc  "), false);
  assert.equal(isNoteDirty(null, ""), false);
  assert.equal(isNoteDirty("   ", ""), false);
});

test("terminal: statusDirty=false, aber noteDirty kann true sein (Notiz bearbeitbar)", () => {
  assert.equal(isStatusDirty("accepted", "pending"), false);
  assert.equal(isNoteDirty("alt", "neu"), true);
});

// ── PATCH-Body-Vertrag (adminNote; niemals internal_note) ────────────────────
test("PATCH: reine Notizänderung sendet revision + adminNote", () => {
  const body = buildCancellationPatchBody({ revision: 3, adminNote: "Kunde erreicht." });
  assert.deepEqual(body, { revision: 3, adminNote: "Kunde erreicht." });
});

test("PATCH: sendet NIEMALS internal_note/admin_note/note", () => {
  const body = buildCancellationPatchBody({ revision: 1, status: "accepted", adminNote: "ok" });
  assert.ok(!("internal_note" in body), "kein internal_note");
  assert.ok(!("admin_note" in body), "kein admin_note");
  assert.ok(!("note" in body), "kein note");
  assert.ok("adminNote" in body, "adminNote vorhanden");
});

test("PATCH: Status + Notiz gemeinsam → kanonischer Body", () => {
  assert.deepEqual(
    buildCancellationPatchBody({ revision: 4, status: "accepted", adminNote: "angenommen" }),
    { revision: 4, status: "accepted", adminNote: "angenommen" },
  );
});

test("PATCH: reine Statusänderung sendet keine Notiz (adminNote undefined)", () => {
  const body = buildCancellationPatchBody({ revision: 2, status: "in_review" });
  assert.deepEqual(body, { revision: 2, status: "in_review" });
  assert.ok(!("adminNote" in body));
});

test("PATCH: adminNote='' (leeren) wird bewusst gesendet; null ebenfalls", () => {
  assert.deepEqual(buildCancellationPatchBody({ revision: 5, adminNote: "" }), { revision: 5, adminNote: "" });
  assert.deepEqual(buildCancellationPatchBody({ revision: 5, adminNote: null }), { revision: 5, adminNote: null });
});

test("PATCH: revision immer enthalten (auch 0); unbekannte Felder werden verworfen", () => {
  assert.equal(buildCancellationPatchBody({ revision: 0, adminNote: "x" }).revision, 0);
  const body = buildCancellationPatchBody({ revision: 1, adminNote: "x", foo: "bar", internal_note: "nope" });
  assert.deepEqual(Object.keys(body).sort(), ["adminNote", "revision"]);
});

test("PATCH: ungültiger Status wird fail-closed abgelehnt", () => {
  assert.throws(() => buildCancellationPatchBody({ revision: 1, status: "weird" }), /invalid_status/);
  assert.deepEqual(SETTABLE_CANCELLATION_STATUS, ["pending", "in_review", "accepted", "rejected"]);
});
