// Tests für die Anzeigelogik der Betriebs-Queues (Adminübersicht, Package C):
// Vertragsschlüssel, Ziel des ältesten Falls, echte Serverwerte statt Schätzungen,
// Diagnosen ohne Handlungsaufforderung und ohne geratenen Beginn.
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminOperations.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPERATIONS_QUEUES,
  OPERATIONS_DIAGNOSTICS,
  OPERATIONS_UNAVAILABLE,
  OPERATIONS_START_UNKNOWN,
  operationsTargetPath,
  operationsQueueView,
  operationsViews,
  oldestDescription,
} from "./adminOperations.mjs";

const def = (key) => [...OPERATIONS_QUEUES, ...OPERATIONS_DIAGNOSTICS].find((d) => d.key === key);

test("genau die zehn Queues und vier Diagnosen des Backendvertrags — mit demselben Ziel je ältestem Fall", () => {
  assert.deepEqual(OPERATIONS_QUEUES.map((q) => q.key), [
    "reconciliation_open", "booking_overdue", "booking_without_open_attempt", "invoice_drift_unreviewed",
    "awb_missing", "label_missing", "cancellations_open", "additional_emails_failed", "invoice_mail_failed",
    "order_confirmation_mail_failed",
  ]);
  assert.deepEqual(OPERATIONS_DIAGNOSTICS.map((q) => q.key), [
    "superseded_unresolved", "orphaned_unresolved", "contradictory_evidence", "booking_without_attempt",
  ]);
  const ziele = Object.fromEntries([...OPERATIONS_QUEUES, ...OPERATIONS_DIAGNOSTICS].map((q) => [q.key, q.target]));
  assert.deepEqual(ziele, {
    reconciliation_open: "attempt", booking_overdue: "attempt", booking_without_open_attempt: "shipment",
    invoice_drift_unreviewed: "attempt", awb_missing: "shipment", label_missing: "shipment",
    cancellations_open: "cancellation", additional_emails_failed: "shipment", invoice_mail_failed: "invoice",
    order_confirmation_mail_failed: "shipment", superseded_unresolved: "attempt", orphaned_unresolved: "attempt",
    contradictory_evidence: "attempt", booking_without_attempt: "shipment",
  });
  // Kein Text nennt einen Einkaufsanbieter — die Übersicht ist providerneutral beschriftet.
  for (const q of [...OPERATIONS_QUEUES, ...OPERATIONS_DIAGNOSTICS]) {
    assert.doesNotMatch(`${q.label} ${q.hint}`, /jumingo|transglobal/i, q.key);
  }
});

test("der Link zum ältesten Fall führt zum Datensatztyp der Queue — nur mit gültiger Kennung", () => {
  assert.equal(operationsTargetPath("attempt", 41), "/admin/reconciliation/41");
  assert.equal(operationsTargetPath("shipment", "77"), "/admin/shipments/77");
  assert.equal(operationsTargetPath("cancellation", 12), "/admin/cancellation-requests/12");
  assert.equal(operationsTargetPath("invoice", 3), "/admin/invoices/3");
  for (const falsch of [0, -1, 1.5, "abc", null, undefined, "1e3"]) {
    assert.equal(operationsTargetPath("attempt", falsch), falsch === "1e3" ? "/admin/reconciliation/1000" : null, String(falsch));
  }
  assert.equal(operationsTargetPath("unbekannt", 5), null);
});

test("ein echter Serverwert wird angezeigt — nie geschätzt; ohne Wert „nicht verfügbar“ und kein Link", () => {
  const offen = operationsQueueView(def("reconciliation_open"), { count: 3, oldestAt: "2026-09-12T09:00:00Z", oldestId: 41, actionableCount: 2 });
  assert.deepEqual([offen.state, offen.display, offen.count, offen.oldestTo, offen.actionableCount, offen.actionable],
    ["ready", "3", 3, "/admin/reconciliation/41", 2, true]);
  const leer = operationsQueueView(def("label_missing"), { count: 0, oldestAt: null, oldestId: null });
  assert.deepEqual([leer.display, leer.oldestTo, leer.actionable], ["0", null, false]);
  for (const kaputt of [undefined, null, {}, { count: "x" }, { count: -1 }, { count: 1.5 }, []]) {
    const v = operationsQueueView(def("awb_missing"), kaputt);
    assert.deepEqual([v.state, v.display, v.count, v.oldestTo], ["unavailable", "—", null, null], JSON.stringify(kaputt));
  }
  assert.equal(OPERATIONS_UNAVAILABLE, "Anzahl nicht verfügbar");
});

test("Diagnosen sind nie aktionsfähig; gesperrt ohne (offenen) Versuch behauptet keinen Beginn", () => {
  for (const key of ["booking_without_open_attempt", "booking_without_attempt"]) {
    // Auch wenn ein Zeitpunkt mitkäme: ohne belegbaren Beginn wird kein Alter gezeigt.
    const v = operationsQueueView(def(key), { count: 2, oldestAt: "2026-01-01T00:00:00Z", oldestId: 7 });
    assert.equal(v.actionable, false, key);
    assert.equal(v.startUnknown, true, key);
    assert.deepEqual(oldestDescription(v), { kind: "unknown_start", at: null }, key);
    assert.equal(v.oldestTo, "/admin/shipments/7", "der Einstieg bleibt möglich — nur ohne Alter");
  }
  for (const key of ["superseded_unresolved", "orphaned_unresolved", "contradictory_evidence"]) {
    const v = operationsQueueView(def(key), { count: 1, oldestAt: "2026-09-12T08:00:00Z", oldestId: 9 });
    assert.equal(v.actionable, false, key);
    assert.deepEqual(oldestDescription(v), { kind: "date", at: "2026-09-12T08:00:00Z" });
  }
  assert.equal(OPERATIONS_START_UNKNOWN, "Beginn unbekannt");
  assert.deepEqual(oldestDescription(operationsQueueView(def("label_missing"), { count: 0 })), { kind: "none", at: null });
});

test("operationsViews liest nur queues und diagnostics — ein Backend ohne Endpunkt ergibt „nicht verfügbar“", () => {
  const r = operationsViews({
    generatedAt: "2026-09-12T10:00:00Z",
    queues: { reconciliation_open: { count: 1, oldestAt: "t", oldestId: 5 }, fremd: { count: 99 } },
    diagnostics: { booking_without_attempt: { count: 4, oldestAt: null, oldestId: 3, startUnknown: true } },
  });
  assert.equal(r.generatedAt, "2026-09-12T10:00:00Z");
  assert.equal(r.queues.length, 10);
  assert.equal(r.diagnostics.length, 4);
  assert.equal(r.queues.find((v) => v.key === "reconciliation_open").display, "1");
  assert.equal(r.queues.find((v) => v.key === "awb_missing").state, "unavailable");
  assert.ok(!r.queues.some((v) => v.key === "fremd"), "ein unbekannter Schlüssel wird nicht angezeigt");
  assert.equal(r.diagnostics.find((v) => v.key === "booking_without_attempt").display, "4");
  const alt = operationsViews({});
  assert.ok([...alt.queues, ...alt.diagnostics].every((v) => v.state === "unavailable"));
  assert.equal(operationsViews(null).generatedAt, null);
});
