// ── Adminübersicht: gemeinsame Listen-Selektoren und Kennzahlenmodell ────────
//
// Zwei Dinge in einer Datei, weil beide dieselbe Frage beantworten: „Was sagt
// eine paginierte Adminliste über ihren Gesamtbestand?"
//
//   1. selectListTotal / selectListHasMore — die EINE Fassung der Selektoren,
//      die vorher in sechs Adminseiten fast wortgleich dupliziert war
//      (AdminUsers, AdminShipments, AdminInvoices, AdminCancellationRequests,
//      AdminSupportRequests, AdminBackfill) und einmal leicht abweichend in
//      AuditLogPage.
//   2. Das Kennzahlenmodell der Adminübersicht.
//
// WICHTIG — Ehrlichkeit der Kennzahlen:
// Es wird KEIN neuer Endpunkt erfunden und KEINE Zahl geschätzt. Jede Kennzahl
// stammt aus dem `total` der bereits vorhandenen Listen-Endpunkte, abgefragt mit
// pageSize 1 (die Zeilen selbst werden verworfen — nur der Gesamtzähler zählt).
// Liefert das Backend keinen Gesamtzähler, zeigt die Karte „nicht verfügbar"
// statt einer aus der Seitengröße hochgerechneten Zahl.
//
// Bewusst NICHT als Kennzahl enthalten: „offene Freischaltungen". GET
// /admin/users kennt laut Backendvertrag KEINEN Statusfilter (USER_PARAMS =
// limit/offset). Die Zahl ließe sich nur aus der aktuell geladenen Seite
// hochrechnen — das wäre genau die simulierte Kennzahl, die hier nicht
// entstehen soll. Sie braucht einen serverseitigen Filter und ist bis dahin
// zurückgestellt.

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

/** Gesamtzahl einer paginierten Adminliste — oder null, wenn das Backend
 *  keinen Zähler mitliefert. Nie geraten, nie hochgerechnet. */
export function selectListTotal(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const pag = d.pagination && typeof d.pagination === "object" ? d.pagination : {};
  const t = firstDefined(
    pag.total, pag.count, pag.total_count, pag.totalCount,
    d.total, d.total_count, d.totalCount, d.count,
  );
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Gibt es eine weitere Seite? Reihenfolge: expliziter Gesamtzähler → explizites
 *  has_more-Flag → Heuristik „volle Seite". Identisch zum bisherigen Verhalten
 *  aller Adminlisten. */
export function selectListHasMore(d, rowCount, page, size, total) {
  if (Number.isFinite(total)) return page * size < total;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const pag = d.pagination && typeof d.pagination === "object" ? d.pagination : {};
    if (typeof pag.has_more === "boolean") return pag.has_more;
    if (typeof pag.hasMore === "boolean") return pag.hasMore;
    if (typeof d.has_more === "boolean") return d.has_more;
    if (typeof d.hasMore === "boolean") return d.hasMore;
  }
  return rowCount >= size;
}

/** Zeilen einer Listenantwort — die Schlüsselnamen gibt der Aufrufer vor, weil
 *  jeder Endpunkt seinen eigenen fachlichen Namen nutzt. */
export function selectListRows(d, keys = []) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of [...keys, "data", "items", "results", "rows"]) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
}

export const ADMIN_TOTAL_UNAVAILABLE = "Anzahl nicht verfügbar";

// ── Kennzahlen der Adminübersicht ───────────────────────────────────────────
// `params` sind exakt die Filter, die der jeweilige Endpunkt laut Vertrag
// kennt (siehe api/adminApi.js) — keine erfundenen Felder. `tone: "warning"`
// markiert Kennzahlen, die eine Handlung nahelegen, sobald sie über 0 liegen.
export const ADMIN_METRICS = Object.freeze([
  {
    key: "customers",
    label: "Kunden",
    hint: "Alle angelegten Konten",
    icon: "admin",
    to: "/admin/users",
    linkLabel: "Zur Kundenliste",
    params: {},
  },
  {
    key: "invoicesOpen",
    label: "Offene Rechnungen",
    hint: "Status „offen“",
    icon: "invoice",
    to: "/admin/invoices",
    linkLabel: "Zur Rechnungsliste",
    params: { status: "unpaid" },
  },
  {
    key: "invoicesOverdue",
    label: "Überfällige Rechnungen",
    hint: "Fälligkeit überschritten",
    icon: "clockDelay",
    to: "/admin/invoices",
    linkLabel: "Zur Rechnungsliste",
    params: { overdue: "true" },
    tone: "warning",
  },
  {
    key: "cancellations",
    label: "Offene Stornierungen",
    hint: "Warten auf Prüfung",
    icon: "ban",
    to: "/admin/cancellation-requests",
    linkLabel: "Zu den Stornierungsanfragen",
    params: { status: "pending" },
    tone: "warning",
  },
  {
    key: "support",
    label: "Offene Supportanfragen",
    hint: "Warten auf Bearbeitung",
    icon: "mail",
    to: "/admin/support-requests",
    linkLabel: "Zu den Supportanfragen",
    params: { status: "open" },
    tone: "warning",
  },
]);

/**
 * Anzeigemodell einer einzelnen Kennzahl.
 *
 * Drei Zustände, klar getrennt:
 *   • "loading"     — die Abfrage läuft und es liegt noch kein Wert vor
 *   • "unavailable" — geladen, aber ohne Gesamtzähler (oder Abruf gescheitert)
 *   • "ready"       — echter Serverwert
 *
 * Ein bereits geladener Wert bleibt bei einem späteren Fehler stehen; nur ohne
 * jeden Wert wird „nicht verfügbar" gezeigt. Dieselbe Regel wie im
 * Benachrichtigungspanel (Paket D): ein Ladefehler löscht nichts.
 */
export function adminMetricView(metric, entry) {
  const wert = entry && Number.isFinite(entry.total) ? entry.total : null;
  if (wert !== null) {
    return {
      ...metric,
      state: "ready",
      value: wert,
      display: String(wert),
      actionable: Boolean(metric.tone === "warning" && wert > 0),
    };
  }
  if (entry && entry.loading) {
    return { ...metric, state: "loading", value: null, display: "…", actionable: false };
  }
  return {
    ...metric,
    state: "unavailable",
    value: null,
    display: "—",
    unavailableText: ADMIN_TOTAL_UNAVAILABLE,
    actionable: false,
  };
}

/** Alle Kennzahlen in Anzeigeform. `entries` ist ein Objekt key → { total, loading }. */
export function adminMetricViews(entries) {
  const e = entries && typeof entries === "object" ? entries : {};
  return ADMIN_METRICS.map((m) => adminMetricView(m, e[m.key]));
}

/** Sind ALLE Kennzahlen ohne Wert? Dann ersetzt eine einzige Fehlerzeile die
 *  Kartenreihe, statt fünfmal dasselbe „nicht verfügbar" zu wiederholen. */
export function allMetricsUnavailable(views) {
  const list = Array.isArray(views) ? views : [];
  return list.length > 0 && list.every((v) => v.state === "unavailable");
}

/** Klassifiziert einen Ladedurchlauf anhand der Erfolgs-/Fehlerzahl:
 *  "none" — kein einziger Fehler → keine Fehlerzeile.
 *  "partial" — mindestens ein Erfolg UND mindestens ein Fehler.
 *  "full" — kein einziger Erfolg (alles fehlgeschlagen). */
export function metricsFailureKind(succeeded, failed) {
  const s = Number.isFinite(succeeded) ? Math.max(0, succeeded) : 0;
  const f = Number.isFinite(failed) ? Math.max(0, failed) : 0;
  if (f === 0) return "none";
  return s > 0 ? "partial" : "full";
}
