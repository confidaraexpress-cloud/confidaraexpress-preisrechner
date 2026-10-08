// Adminübersicht „Zu erledigen" (UX-Paket 2): eine Aufgabenliste aus vorhandenen
// Serverzählern — nichts geschätzt, Unbekanntes nie als 0, jede Queue genau einmal.
//
// Run: node --test src/utils/adminTodo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_COUNTS, ADMIN_DIAGNOSTICS, ADMIN_FIGURES, ADMIN_TODO, ADMIN_TODO_EXCLUDED_QUEUES, PARTNER_TASK_COUNTS,
  TODO_TEXTS, adminDiagnosticViews, adminFigureViews, adminTodoViews, diagnosticsSummary, groupAdminTodo,
  overviewWithoutValues,
} from "./adminTodo.mjs";
import { ADMIN_METRICS } from "./adminOverview.mjs";
import { OPERATIONS_DIAGNOSTICS, OPERATIONS_QUEUES } from "./adminOperations.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const bereit = (total) => ({ total, loading: false });
const ENTRIES = {
  customers: bereit(11), invoicesOpen: bereit(6), invoicesOverdue: bereit(2), cancellations: bereit(0),
  support: bereit(5), partnerApplications: bereit(3), dispatchEvidence: bereit(0),
};
const OPS = {
  queues: {
    reconciliation_open: { count: 1, oldestAt: "2026-10-07T08:00:00Z", oldestId: 41 },
    booking_overdue: { count: 0 }, booking_without_open_attempt: { count: 2, oldestId: 9 },
    invoice_drift_unreviewed: { count: 0 }, awb_missing: { count: 4, oldestAt: "2026-10-01T08:00:00Z", oldestId: 77 },
    label_missing: { count: 0 }, cancellations_open: { count: 5, oldestId: 3 },
    additional_emails_failed: { count: 0 }, invoice_mail_failed: { count: 0 }, order_confirmation_mail_failed: { count: 0 },
  },
  diagnostics: {
    superseded_unresolved: { count: 0 }, orphaned_unresolved: { count: 1, oldestAt: "2026-10-02T08:00:00Z", oldestId: 5 },
    contradictory_evidence: { count: 0 }, booking_without_attempt: { count: 0 },
  },
};

test("1 — jede Betriebs-Queue ist genau einmal zugeordnet: Aufgabe, Diagnose oder bewusst ausgelassen", () => {
  const todoQueues = ADMIN_TODO.filter((t) => t.source === "queue").map((t) => t.key);
  const alle = [...OPERATIONS_QUEUES, ...OPERATIONS_DIAGNOSTICS].map((q) => q.key);
  const zugeordnet = [...todoQueues, ...ADMIN_DIAGNOSTICS, ...ADMIN_TODO_EXCLUDED_QUEUES];
  assert.deepEqual([...zugeordnet].sort(), [...alle].sort(), "eine Queue fehlt oder ist doppelt");
  assert.equal(new Set(zugeordnet).size, zugeordnet.length);
  // Die ausgelassene Queue zählt dieselbe Menge wie die Kennzahl — sie fehlt nicht, sie steht einmal da.
  assert.deepEqual(ADMIN_TODO_EXCLUDED_QUEUES, ["cancellations_open"]);
  assert.ok(ADMIN_TODO.some((t) => t.key === "cancellations" && t.source === "count"));
  assert.equal(ADMIN_METRICS.find((m) => m.key === "cancellations").params.status, "open");
  // Eine Diagnose ist nie eine Aufgabe.
  for (const key of ADMIN_DIAGNOSTICS) assert.equal(todoQueues.includes(key), false, `${key} als Aufgabe`);
});

test("2 — jeder Listenzähler ist Aufgabe oder Kennzahl, genau einmal; die Partnerzähler nutzen nur Vertragsfilter", () => {
  const todoCounts = ADMIN_TODO.filter((t) => t.source === "count").map((t) => t.key);
  assert.deepEqual([...todoCounts, ...ADMIN_FIGURES].sort(), ADMIN_COUNTS.map((c) => c.key).sort());
  assert.deepEqual(PARTNER_TASK_COUNTS.map((c) => [c.key, c.params]),
    [["partnerApplications", { status: "pending" }], ["dispatchEvidence", {}]]);
  assert.equal(PARTNER_TASK_COUNTS[0].to, "/admin/partners?status=pending");
  assert.equal(PARTNER_TASK_COUNTS[1].to, "/admin/partners/dispatch-evidence");
});

test("3 — Reihenfolge nach Dringlichkeit, Werte nur aus der jeweiligen Quelle", () => {
  const views = adminTodoViews({ entries: ENTRIES, ops: OPS });
  assert.deepEqual(views.map((v) => v.key), ADMIN_TODO.map((t) => t.key));
  const nach = Object.fromEntries(views.map((v) => [v.key, v]));
  assert.equal(nach.reconciliation_open.count, 1);
  assert.equal(nach.reconciliation_open.oldestTo, "/admin/reconciliation/41");
  assert.equal(nach.reconciliation_open.to, "/admin/reconciliation");
  assert.equal(nach.awb_missing.count, 4);
  assert.equal(nach.awb_missing.to, "/admin/shipments/77", "ohne Liste führt der Weg zum ältesten Fall");
  assert.equal(nach.partnerApplications.count, 3);
  assert.equal(nach.partnerApplications.label, "Partneranträge");
  assert.equal(nach.support.label, "Supportanfragen");
  assert.equal(nach.cancellations.count, 0, "die Kennzahl, nicht die gleichnamige Queue (5)");
  // Der Weg zum ältesten Fall bleibt erhalten — aus der Queue derselben Menge.
  assert.equal(nach.cancellations.oldestTo, "/admin/cancellation-requests/3");
  assert.equal(nach.cancellations.to, "/admin/cancellation-requests");
  // Ohne Queuewert (oder bei 0) kein Link zum ältesten Fall.
  const ohne = Object.fromEntries(adminTodoViews({ entries: ENTRIES, ops: null }).map((v) => [v.key, v]));
  assert.equal(ohne.cancellations.oldestTo, null);
  const null0 = { ...OPS, queues: { ...OPS.queues, cancellations_open: { count: 0, oldestId: null } } };
  assert.equal(Object.fromEntries(adminTodoViews({ entries: ENTRIES, ops: null0 }).map((v) => [v.key, v])).cancellations.oldestTo, null);
  assert.equal(nach.invoicesOverdue.count, 2);
  assert.equal(nach.invoicesOverdue.oldestTo, null, "nur die Stornierungen tragen einen ältesten Fall");
});

test("4 — Gruppen: offen > 0, erledigt = 0, unbekannt nie als 0", () => {
  const g = groupAdminTodo(adminTodoViews({ entries: ENTRIES, ops: OPS }));
  assert.deepEqual(g.open.map((v) => v.key),
    ["reconciliation_open", "partnerApplications", "support", "invoicesOverdue", "awb_missing"]);
  assert.ok(g.done.some((v) => v.key === "cancellations"));
  assert.deepEqual(g.unavailable, []);
  assert.deepEqual(g.loading, []);

  // Ein Zähler ohne Wert (Fehler oder Antwort ohne total) ist „nicht verfügbar" — weder offen noch erledigt.
  const ohne = groupAdminTodo(adminTodoViews({ entries: { ...ENTRIES, partnerApplications: { total: null, loading: false } }, ops: OPS }));
  assert.ok(ohne.unavailable.some((v) => v.key === "partnerApplications"));
  assert.equal(ohne.done.some((v) => v.key === "partnerApplications"), false);
  assert.equal(ohne.open.some((v) => v.key === "partnerApplications"), false);
  const v = ohne.unavailable.find((x) => x.key === "partnerApplications");
  assert.equal(v.display, "—");
  assert.equal(v.count, null);

  // Queues ohne Antwort: unbekannt; vor dem ersten Stand: „lädt", nicht „nicht verfügbar".
  const ohneQueues = groupAdminTodo(adminTodoViews({ entries: ENTRIES, ops: null }));
  assert.ok(ohneQueues.unavailable.some((x) => x.key === "reconciliation_open"));
  const laedt = groupAdminTodo(adminTodoViews({ entries: ENTRIES, ops: null, opsLoading: true }));
  assert.ok(laedt.loading.some((x) => x.key === "reconciliation_open"));
  assert.equal(laedt.unavailable.some((x) => x.key === "reconciliation_open"), false);
});

test("5 — Kennzahlen und Diagnosen: nur Bestand bzw. nie aktionsfähig", () => {
  const figures = adminFigureViews(ENTRIES);
  assert.deepEqual(figures.map((f) => [f.key, f.display]), [["customers", "11"], ["invoicesOpen", "6"]]);
  assert.equal(figures.some((f) => f.actionable), false);

  const diag = adminDiagnosticViews({ ops: OPS });
  assert.deepEqual(diag.map((d) => d.key), ADMIN_DIAGNOSTICS);
  assert.equal(diag.some((d) => d.actionable), false, "eine Diagnose ist nie eine Handlungsaufforderung");
  assert.equal(diagnosticsSummary(diag), "3 Fälle");
  assert.equal(diagnosticsSummary(adminDiagnosticViews({ ops: null })), "Anzahl nicht verfügbar");
  assert.equal(diagnosticsSummary(adminDiagnosticViews({ ops: null, opsLoading: true })), "wird geladen");
  assert.equal(diagnosticsSummary(adminDiagnosticViews({ ops: { queues: {}, diagnostics: {} } })), "Anzahl nicht verfügbar");
  const einer = { queues: { booking_without_open_attempt: { count: 0 } }, diagnostics: { superseded_unresolved: { count: 1 } } };
  assert.equal(diagnosticsSummary(adminDiagnosticViews({ ops: einer })), "1 Fall (teilweise nicht verfügbar)");
});

test("6 — ohne jeden Wert ersetzt die Fehlerkarte die Liste; ein einzelner Wert genügt dagegen", () => {
  const leer = Object.fromEntries(ADMIN_COUNTS.map((c) => [c.key, { total: null, loading: false }]));
  const todo = adminTodoViews({ entries: leer, ops: null });
  assert.equal(overviewWithoutValues(todo, adminFigureViews(leer)), true);
  const einWert = { ...leer, customers: bereit(4) };
  assert.equal(overviewWithoutValues(adminTodoViews({ entries: einWert, ops: null }), adminFigureViews(einWert)), false);
});

test("7 — die Übersicht lädt nur vorhandene Listen mit pageSize 1 und rechnet nichts hoch", () => {
  const seite = ohneKommentare(read("../pages/admin/AdminOverviewPage.jsx"));
  assert.match(seite, /listAdminSalesPartners/);
  assert.match(seite, /listAdminDispatchEvidenceQueue/);
  assert.match(seite, /page: 1, pageSize: 1/);
  assert.match(seite, /getAdminOperationsQueues/);
  const modell = ohneKommentare(read("./adminTodo.mjs"));
  assert.equal(/rows\.length|\.length \* |estimate|schätz/i.test(modell), false);
  // Texte: kurz, ohne Technikbegriffe.
  for (const t of Object.values(TODO_TEXTS)) {
    assert.doesNotMatch(t, /Server|Backend|Queue|API|endpoint/i, t);
  }
});
