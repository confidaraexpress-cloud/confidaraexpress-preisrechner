// Tests für das Kennzahlenmodell der Adminübersicht: korrekte Statusparameter
// je Kennzahl (verhindert die Wiederholung des Bugs, bei dem der Literal
// "open" fälschlich auch für Rechnungen und Stornierungen verwendet wurde,
// obwohl er dort kein gültiger Backend-Statuswert ist) und die Klassifizierung
// eines Ladedurchlaufs in "none" / "partial" / "full" für die Fehlerzeile.
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminOverview.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_METRICS,
  adminMetricView,
  adminMetricViews,
  allMetricsUnavailable,
  metricsFailureKind,
  ADMIN_TOTAL_UNAVAILABLE,
} from "./adminOverview.mjs";

const metric = (key) => ADMIN_METRICS.find((m) => m.key === key);

// ── Statusparameter je Kennzahl ──────────────────────────────────────────────
// Jede Kennzahl ruft einen eigenen Endpunkt mit eigenem Statuswertraum auf;
// derselbe Literal "open" ist nur bei Support gültig. Damit darf derselbe
// Fehler nicht erneut durch Copy/Paste zwischen den fünf Einträgen entstehen.
test("customers: kein Statusfilter (GET /admin/users kennt keinen)", () => {
  assert.deepEqual(metric("customers").params, {});
});

test("invoicesOpen: status=unpaid, nicht „open“ (Rechnungen kennen „open“ nicht als Statuswert)", () => {
  assert.equal(metric("invoicesOpen").params.status, "unpaid");
});

test("invoicesOverdue: overdue=true", () => {
  assert.equal(metric("invoicesOverdue").params.overdue, "true");
});

test("cancellations: status=pending, nicht „open“ (Backend kennt nur pending/in_review/accepted/rejected und lehnt „open“ mit 400 ab)", () => {
  assert.equal(metric("cancellations").params.status, "pending");
});

test("support: status=open bleibt unverändert („open“ ist bei Support der echte Initialstatus)", () => {
  assert.equal(metric("support").params.status, "open");
});

test("keine Kennzahl außer support sendet noch den Wert „open“", () => {
  for (const m of ADMIN_METRICS) {
    if (m.key === "support") continue;
    assert.notEqual(m.params.status, "open", `${m.key} darf „open“ nicht mehr senden`);
  }
});

// ── metricsFailureKind: none / partial / full ───────────────────────────────
test("5/5 erfolgreich, 0 gescheitert → \"none\" (keine Fehlerzeile)", () => {
  assert.equal(metricsFailureKind(5, 0), "none");
});

test("4/5 erfolgreich, 1 gescheitert → \"partial\"", () => {
  assert.equal(metricsFailureKind(4, 1), "partial");
});

test("1/5 erfolgreich, 4 gescheitert → \"partial\"", () => {
  assert.equal(metricsFailureKind(1, 4), "partial");
});

test("0/5 erfolgreich, 5 gescheitert → \"full\"", () => {
  assert.equal(metricsFailureKind(0, 5), "full");
});

test("0 Fehler ist immer \"none\", unabhängig von der Erfolgszahl", () => {
  assert.equal(metricsFailureKind(0, 0), "none");
  assert.equal(metricsFailureKind(3, 0), "none");
});

test("nicht-endliche/negative Eingaben fallen sicher auf 0 zurück", () => {
  assert.equal(metricsFailureKind(NaN, NaN), "none");
  assert.equal(metricsFailureKind(undefined, 2), "full");
  assert.equal(metricsFailureKind(-1, 2), "full");
});

// ── Sichtbarkeit während eines Partial-Failure ──────────────────────────────
// Ein Ladefehler darf bereits geladene Werte nicht verdrängen — dieselbe Regel
// wie im Benachrichtigungspanel (Paket D). Eine Kennzahl ohne jeden Wert zeigt
// weiterhin "—" / "Anzahl nicht verfügbar", nie eine geratene Zahl.
test("erfolgreiche Kennzahlen bleiben bei einem Partial-Failure sichtbar, die gescheiterte zeigt „nicht verfügbar“", () => {
  const entries = {
    customers: { total: 42, loading: false },
    invoicesOpen: { total: 7, loading: false },
    invoicesOverdue: { total: 2, loading: false },
    cancellations: { total: null, loading: false }, // gescheitert, kein vorheriger Wert
    support: { total: 3, loading: false },
  };
  const views = adminMetricViews(entries);
  const byKey = Object.fromEntries(views.map((v) => [v.key, v]));

  assert.equal(byKey.customers.state, "ready");
  assert.equal(byKey.customers.display, "42");
  assert.equal(byKey.invoicesOpen.state, "ready");
  assert.equal(byKey.invoicesOpen.display, "7");
  assert.equal(byKey.invoicesOverdue.state, "ready");
  assert.equal(byKey.support.state, "ready");

  assert.equal(byKey.cancellations.state, "unavailable");
  assert.equal(byKey.cancellations.display, "—");
  assert.equal(byKey.cancellations.unavailableText, ADMIN_TOTAL_UNAVAILABLE);

  // Nicht ALLE ohne Wert → die Kartenreihe bleibt, keine volle Fehlerkarte.
  assert.equal(allMetricsUnavailable(views), false);
});

test("ein zuvor geladener Wert bleibt nach einem erneuten Fehlschlag stehen", () => {
  // Zweiter Ladedurchlauf: cancellations hatte vorher 5, der neue Versuch
  // scheitert (kein neuer total) — die 5 bleibt sichtbar statt "—".
  const view = adminMetricView(metric("cancellations"), { total: 5, loading: false });
  assert.equal(view.state, "ready");
  assert.equal(view.display, "5");
});

test("alle fünf ohne Wert → allMetricsUnavailable meldet die volle Fehlerkarte", () => {
  const entries = Object.fromEntries(
    ADMIN_METRICS.map((m) => [m.key, { total: null, loading: false }]));
  const views = adminMetricViews(entries);
  assert.equal(allMetricsUnavailable(views), true);
});
