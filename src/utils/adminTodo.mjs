// ── Adminübersicht: „Zu erledigen" ──────────────────────────────────────────
//
// EINE Liste für alles, was ein Admin bearbeiten muss (UX-Paket 2). Sie setzt
// sich ausschließlich aus Zählern zusammen, die der Server bereits liefert:
//
//   • Listenzähler: das `total` vorhandener Adminlisten, abgefragt mit
//     pageSize 1 — die fünf Kennzahlen aus adminOverview.mjs und zwei Zähler
//     des Partnerprogramms (offene Anträge, Versandnachweis-Queue).
//   • Betriebs-Queues: GET /admin/operations/queues (adminOperations.mjs).
//
// Es gibt keinen neuen Endpunkt und keine geschätzte Zahl. Ein unbekannter
// Zähler (Ladefehler, Antwort ohne Zähler) wird NIE als 0 gezeigt: er steht als
// „nicht verfügbar" da. Eine 0 heißt ausschließlich „keine offenen Fälle".
//
// Die Queue `cancellations_open` zählt dieselbe Menge wie die Kennzahl
// „cancellations" (Backendfilter `open` = pending UND in_review). Sie erscheint
// deshalb nur einmal — als Listenzähler mit dem Weg zur Liste; den Weg zum
// ältesten Fall steuert die Queue bei (die Zahl bleibt die der Liste).

import { ADMIN_METRICS, adminMetricView } from "./adminOverview.mjs";
import { OPERATIONS_DIAGNOSTICS, OPERATIONS_QUEUES, operationsQueueView } from "./adminOperations.mjs";

// Zwei Listenzähler des Partnerprogramms. `params` sind exakt die Filter des
// jeweiligen Endpunkts (api/adminApi.js) — keine erfundenen Felder.
export const PARTNER_TASK_COUNTS = Object.freeze([
  Object.freeze({
    key: "partnerApplications",
    label: "Partneranträge",
    hint: "Warten auf Prüfung und Freigabe",
    to: "/admin/partners?status=pending",
    linkLabel: "Anträge prüfen",
    params: Object.freeze({ status: "pending" }),
    tone: "warning",
  }),
  Object.freeze({
    key: "dispatchEvidence",
    label: "Versandnachweise",
    hint: "Versand fehlt oder ist ungeklärt",
    to: "/admin/partners/dispatch-evidence",
    linkLabel: "Nachweise prüfen",
    params: Object.freeze({}),
    tone: "warning",
  }),
]);

/** Alle Listenzähler der Übersicht: die fünf Kennzahlen und die zwei Partnerzähler. */
export const ADMIN_COUNTS = Object.freeze([...ADMIN_METRICS, ...PARTNER_TASK_COUNTS]);

// Reihenfolge = Dringlichkeit. Bei Listenzählern überschreibt die Aufgabe nur
// Beschriftung und Linktext — Filter und Ziel bleiben die der Kennzahl. Queues
// tragen ihre Beschriftung aus adminOperations.mjs (eine Fassung).
export const ADMIN_TODO = Object.freeze([
  Object.freeze({ key: "reconciliation_open", source: "queue" }),
  Object.freeze({ key: "booking_overdue", source: "queue" }),
  Object.freeze({ key: "partnerApplications", source: "count" }),
  Object.freeze({ key: "dispatchEvidence", source: "count" }),
  Object.freeze({ key: "cancellations", source: "count", label: "Stornierungsanfragen", linkLabel: "Anfragen öffnen",
    oldestFrom: "cancellations_open" }),
  Object.freeze({ key: "support", source: "count", label: "Supportanfragen", linkLabel: "Anfragen öffnen" }),
  Object.freeze({ key: "invoicesOverdue", source: "count", label: "Überfällige Rechnungen", linkLabel: "Rechnungen öffnen" }),
  Object.freeze({ key: "invoice_drift_unreviewed", source: "queue" }),
  Object.freeze({ key: "awb_missing", source: "queue" }),
  Object.freeze({ key: "label_missing", source: "queue" }),
  Object.freeze({ key: "invoice_mail_failed", source: "queue" }),
  Object.freeze({ key: "order_confirmation_mail_failed", source: "queue" }),
  Object.freeze({ key: "additional_emails_failed", source: "queue" }),
]);

/** Queues, die bewusst NICHT als eigene Aufgabe erscheinen (siehe Kopf der Datei). */
export const ADMIN_TODO_EXCLUDED_QUEUES = Object.freeze(["cancellations_open"]);

/** Ruhige Kennzahlen ohne Handlungsbedarf — Bestand, keine Aufgabe. */
export const ADMIN_FIGURES = Object.freeze(["customers", "invoicesOpen"]);

/** Diagnosen: nie automatisch aktionsfähig, eigener eingeklappter Bereich. */
export const ADMIN_DIAGNOSTICS = Object.freeze([
  "booking_without_open_attempt",
  ...OPERATIONS_DIAGNOSTICS.map((d) => d.key),
]);

export const TODO_TEXTS = Object.freeze({
  title: "Zu erledigen",
  empty: "Nichts zu erledigen – es gibt keine offenen Vorgänge.",
  unavailable: "Anzahl nicht verfügbar:",
  loading: "Wird noch geladen:",
  done: "Keine offenen Fälle:",
  partialError: "Einige Zahlen konnten nicht geladen werden.",
  fullError: "Die Übersicht konnte nicht geladen werden.",
  fullErrorText: "Die Bereiche unten sind davon unabhängig erreichbar.",
  diagnosticsNote: "Diagnosen lösen nie automatisch eine Aktion aus – über das weitere Vorgehen entscheidet das Runbook.",
});

const QUEUE_DEFS = new Map(
  [...OPERATIONS_QUEUES, ...OPERATIONS_DIAGNOSTICS].map((d) => [d.key, d]));
const COUNT_DEFS = new Map(ADMIN_COUNTS.map((d) => [d.key, d]));

function queueView(key, queues, queuesLoading) {
  const def = QUEUE_DEFS.get(key);
  const raw = queues && typeof queues === "object" ? queues[key] : undefined;
  const v = operationsQueueView(def, raw);
  // Ohne jeden geladenen Stand ist eine Queue „lädt", nicht „nicht verfügbar".
  if (v.state === "unavailable" && queuesLoading) return { ...v, source: "queue", state: "loading", display: "…" };
  return {
    ...v,
    source: "queue",
    to: def.listTo || v.oldestTo || null,
    linkLabel: def.listTo ? "Zur Liste" : "Ältesten Fall öffnen",
  };
}

function countView(task, entries, queues) {
  const def = COUNT_DEFS.get(task.key);
  const v = adminMetricView(def, entries && typeof entries === "object" ? entries[task.key] : undefined);
  // Ältester Fall aus der Queue derselben Menge — nur mit echtem Serverwert.
  const q = task.oldestFrom && queues ? operationsQueueView(QUEUE_DEFS.get(task.oldestFrom), queues[task.oldestFrom]) : null;
  const mitAeltestem = q && q.state === "ready" && q.count > 0 && q.oldestTo;
  return {
    ...v,
    source: "count",
    label: task.label || def.label,
    linkLabel: task.linkLabel || def.linkLabel,
    count: v.state === "ready" ? v.value : null,
    oldestTo: mitAeltestem ? q.oldestTo : null,
    oldestAt: mitAeltestem ? q.oldestAt : null,
  };
}

/**
 * Anzeigemodell der Aufgabenliste in fester Reihenfolge.
 *
 * @param entries   key → { total, loading } der Listenzähler (wie die Kennzahlen)
 * @param ops       Antwort von GET /admin/operations/queues oder null
 * @param opsLoading true, solange noch KEIN Stand der Queues vorliegt
 */
export function adminTodoViews({ entries, ops, opsLoading = false } = {}) {
  const q = ops && typeof ops === "object" && !Array.isArray(ops) && ops.queues && typeof ops.queues === "object"
    ? ops.queues : null;
  return ADMIN_TODO.map((task) => (task.source === "queue"
    ? queueView(task.key, q, opsLoading && !q)
    : countView(task, entries, q)));
}

/** Teilt die Aufgaben in offen (> 0), unbekannt, ladend und erledigt (= 0). */
export function groupAdminTodo(views) {
  const list = Array.isArray(views) ? views : [];
  return {
    open: list.filter((v) => v.state === "ready" && v.count > 0),
    unavailable: list.filter((v) => v.state === "unavailable"),
    loading: list.filter((v) => v.state === "loading"),
    done: list.filter((v) => v.state === "ready" && v.count === 0),
  };
}

/** Die ruhigen Kennzahlen (Bestand) im Muster der bisherigen Kennzahlenkarten. */
export function adminFigureViews(entries) {
  const e = entries && typeof entries === "object" ? entries : {};
  return ADMIN_FIGURES.map((key) => adminMetricView(COUNT_DEFS.get(key), e[key]));
}

/** Die Diagnosen der Betriebssicht — nie aktionsfähig. */
export function adminDiagnosticViews({ ops, opsLoading = false } = {}) {
  const r = ops && typeof ops === "object" && !Array.isArray(ops) ? ops : {};
  const quellen = { ...(r.queues && typeof r.queues === "object" ? r.queues : {}),
    ...(r.diagnostics && typeof r.diagnostics === "object" ? r.diagnostics : {}) };
  const geladen = Boolean(r.queues || r.diagnostics);
  return ADMIN_DIAGNOSTICS.map((key) => queueView(key, geladen ? quellen : null, opsLoading && !geladen));
}

/** Kurzfassung für die eingeklappte Zeile der Diagnosen. */
export function diagnosticsSummary(views) {
  const list = Array.isArray(views) ? views : [];
  if (list.length === 0 || list.some((v) => v.state === "loading")) return "wird geladen";
  if (list.every((v) => v.state === "unavailable")) return "Anzahl nicht verfügbar";
  const summe = list.reduce((s, v) => s + (v.state === "ready" ? v.count : 0), 0);
  const teilweise = list.some((v) => v.state === "unavailable") ? " (teilweise nicht verfügbar)" : "";
  if (summe === 0) return `keine Fälle${teilweise}`;
  return `${summe} ${summe === 1 ? "Fall" : "Fälle"}${teilweise}`;
}

/** Sind alle Zahlen der Seite ohne Wert? Dann ersetzt eine Fehlerkarte Liste und Kennzahlen. */
export function overviewWithoutValues(todoViews, figureViews) {
  const alle = [...(Array.isArray(todoViews) ? todoViews : []), ...(Array.isArray(figureViews) ? figureViews : [])];
  return alle.length > 0 && alle.every((v) => v.state === "unavailable");
}
