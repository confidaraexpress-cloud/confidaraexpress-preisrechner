// ── Operations-Queues (Admin) — reine Anzeigelogik der Übersicht ────────────
//
// Die Übersicht zeigt, wo im Betrieb etwas liegen bleibt: ungeklärte
// Buchungsvorgänge, fehlende Belege, gescheiterte Mails, offene Stornierungen.
// Datenquelle ist AUSSCHLIESSLICH `GET /admin/operations/queues` — eine reine
// Leseantwort je Queue `{ count, oldestAt, oldestId }`. Es wird nichts
// geschätzt und nichts aus einer Liste hochgerechnet.
//
// Aus einer Queue folgt KEINE automatische Handlung. Eine Diagnose (etwa eine
// gesperrte Sendung ohne offenen Versuch) ist ausdrücklich nie aktionsfähig:
// dort ist der Beginn des Provider-Calls unbekannt, und das Runbook entscheidet.

// `target` sagt, WORAUF `oldestId` zeigt — damit der Link zum ältesten Fall nie geraten wird.
export const OPERATIONS_QUEUES = Object.freeze([
  { key: "reconciliation_open", label: "Offene Buchungsklärungen", icon: "shieldCheck",
    hint: "Neuester ungeklärter Versuch einer gesperrten Sendung", target: "attempt",
    listTo: "/admin/reconciliation", tone: "warning" },
  { key: "booking_overdue", label: "Buchungsklärung überfällig", icon: "clockDelay",
    hint: "Offener Versuch älter als 10 Minuten", target: "attempt",
    listTo: "/admin/reconciliation", tone: "warning" },
  { key: "booking_without_open_attempt", label: "Gesperrt ohne offenen Versuch", icon: "info",
    hint: "Diagnose — Beginn des Provider-Calls unbekannt, nicht automatisch aktionsfähig",
    target: "shipment", listTo: null, tone: "diagnostic" },
  { key: "invoice_drift_unreviewed", label: "Ungeprüfte Rechnungsabweichungen", icon: "euro",
    hint: "Anbieterrechnung weicht vom erwarteten Einkauf ab", target: "attempt", listTo: null, tone: "warning" },
  { key: "awb_missing", label: "Trackingnummer fehlt", icon: "mapPin",
    hint: "Gebucht, ohne Trackingreferenz nach der Betriebsfrist", target: "shipment", listTo: null, tone: "warning" },
  { key: "label_missing", label: "Label fehlt", icon: "invoice",
    hint: "Gebucht, ohne gesicherten Labelbeleg nach der Betriebsfrist", target: "shipment", listTo: null, tone: "warning" },
  { key: "cancellations_open", label: "Offene Stornierungen", icon: "ban",
    hint: "Offen oder in Prüfung", target: "cancellation", listTo: "/admin/cancellation-requests", tone: "warning" },
  { key: "additional_emails_failed", label: "Zusatzmails fehlgeschlagen", icon: "mail",
    hint: "Tracking-, Label- und Hinweismails", target: "shipment", listTo: null, tone: "warning" },
  { key: "invoice_mail_failed", label: "Rechnungsmails fehlgeschlagen", icon: "invoice",
    hint: "Versand der Rechnung gescheitert", target: "invoice", listTo: "/admin/invoices", tone: "warning" },
  { key: "order_confirmation_mail_failed", label: "Auftragsbestätigungen fehlgeschlagen", icon: "mail",
    hint: "Versand der Auftragsbestätigung gescheitert", target: "shipment", listTo: null, tone: "warning" },
]);

export const OPERATIONS_DIAGNOSTICS = Object.freeze([
  { key: "superseded_unresolved", label: "Überholte ungeklärte Versuche", icon: "info",
    hint: "Neben einem neueren Versuch — nicht aktionsfähig", target: "attempt", listTo: null, tone: "diagnostic" },
  { key: "orphaned_unresolved", label: "Verwaiste ungeklärte Versuche", icon: "info",
    hint: "Sendung gelöscht — nicht aktionsfähig", target: "attempt", listTo: null, tone: "diagnostic" },
  { key: "contradictory_evidence", label: "Widersprüchliche Evidenz", icon: "info",
    hint: "Anbieterausgang und Entscheidung passen nicht zusammen", target: "attempt", listTo: null, tone: "diagnostic" },
  { key: "booking_without_attempt", label: "Gesperrt ohne jeden Versuch", icon: "info",
    hint: "Altbestand — Beginn des Provider-Calls unbekannt", target: "shipment", listTo: null, tone: "diagnostic" },
]);

export const OPERATIONS_UNAVAILABLE = "Anzahl nicht verfügbar";
export const OPERATIONS_START_UNKNOWN = "Beginn unbekannt";
export const OPERATIONS_LOAD_ERROR = "Die Betriebs-Queues konnten nicht geladen werden.";

/** Pfad zum Datensatz hinter `oldestId` — oder `null`, wenn er nicht eindeutig ist. */
export function operationsTargetPath(target, id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  switch (target) {
    case "attempt": return `/admin/reconciliation/${n}`;
    case "shipment": return `/admin/shipments/${n}`;
    case "cancellation": return `/admin/cancellation-requests/${n}`;
    case "invoice": return `/admin/invoices/${n}`;
    default: return null;
  }
}

function eintrag(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const count = Number(raw.count);
  if (!Number.isSafeInteger(count) || count < 0) return null;
  const oldestId = Number(raw.oldestId);
  const actionableCount = Number(raw.actionableCount);
  return {
    count,
    oldestAt: typeof raw.oldestAt === "string" && raw.oldestAt !== "" ? raw.oldestAt : null,
    oldestId: Number.isSafeInteger(oldestId) && oldestId > 0 ? oldestId : null,
    actionableCount: Number.isSafeInteger(actionableCount) && actionableCount >= 0 ? actionableCount : null,
    startUnknown: raw.startUnknown === true,
  };
}

/**
 * Anzeigemodell EINER Queue. Zwei Zustände: "ready" (echter Serverwert) und
 * "unavailable" (kein verwertbarer Wert) — nie eine geschätzte Zahl.
 */
export function operationsQueueView(def, raw) {
  const e = eintrag(raw);
  if (!e) {
    return { ...def, state: "unavailable", count: null, display: "—", oldestAt: null, oldestTo: null,
      actionableCount: null, startUnknown: false, actionable: false };
  }
  return {
    ...def,
    state: "ready",
    count: e.count,
    display: String(e.count),
    oldestAt: e.oldestAt,
    oldestTo: e.count > 0 ? operationsTargetPath(def.target, e.oldestId) : null,
    actionableCount: e.actionableCount,
    // Ohne belegbaren Beginn wird kein Alter behauptet — auch wenn ein Wert mitkäme.
    startUnknown: e.startUnknown || def.tone === "diagnostic" && def.target === "shipment",
    // Eine Diagnose ist nie eine Handlungsaufforderung.
    actionable: def.tone === "warning" && e.count > 0,
  };
}

export function operationsViews(response) {
  const r = response && typeof response === "object" && !Array.isArray(response) ? response : {};
  const q = r.queues && typeof r.queues === "object" ? r.queues : {};
  const d = r.diagnostics && typeof r.diagnostics === "object" ? r.diagnostics : {};
  return {
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : null,
    queues: OPERATIONS_QUEUES.map((def) => operationsQueueView(def, q[def.key])),
    diagnostics: OPERATIONS_DIAGNOSTICS.map((def) => operationsQueueView(def, d[def.key])),
  };
}

/** Wie der älteste Fall beschrieben wird: mit Zeitpunkt, als „Beginn unbekannt" oder gar nicht. */
export function oldestDescription(view) {
  if (!view || view.state !== "ready" || !view.count) return { kind: "none", at: null };
  if (view.startUnknown) return { kind: "unknown_start", at: null };
  return view.oldestAt ? { kind: "date", at: view.oldestAt } : { kind: "none", at: null };
}
