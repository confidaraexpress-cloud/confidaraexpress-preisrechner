// Gemeinsame, reine Logik für die Admin-Supportanfragen (Liste + Detail + Kundenprofil):
// kanonische Response-Normalisierung, Anzeige-Meta, erlaubte Statusübergänge, getrennte
// Dirty-Erkennung und der PATCH-Body. Kein JSX, kein State, kein Fetch — testbar unter
// Node (`.mjs`).
//
// Eine Supportanfrage ist ein rein KOMMUNIKATIVER Vorgang: das Ändern von Status oder
// Vermerk verschickt keine Kundenmail, storniert nichts, verändert keine Sendung, keine
// Rechnung und keine Zahlung. Die serverseitige Prüfung bleibt maßgeblich.

// ── Kategorien ───────────────────────────────────────────────────────────────
// Technischer Wert ↔ deutscher Anzeigename, exakt wie im Backend (lib/support.js).
// Das Backend liefert `categoryLabel` in der Regel mit; diese Tabelle ist der Fallback,
// damit die Oberfläche nie einen technischen Rohwert anzeigt.
//
// Object.create(null) statt eines Objektliterals: bei einem normalen Objekt liefert
// LABELS["constructor"] die geerbte Object-Funktion — ein Statuswert „constructor"
// oder „toString" aus einer manipulierten Antwort würde dann als gültig gelten und
// im UI landen. Ohne Prototyp gibt es diese Treffer nicht.
const CATEGORY_LABELS = Object.assign(Object.create(null), {
  booking: "Buchung und Versand",
  tracking: "Sendungsverfolgung",
  invoice: "Rechnung",
  cancellation: "Stornierung",
  account: "Konto und Unternehmen",
  technical: "Technisches Problem",
  other: "Sonstiges",
});
export const SUPPORT_CATEGORY_ORDER = Object.freeze(Object.keys(CATEGORY_LABELS));
export const supportCategoryLabel = (value) =>
  Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value) ? CATEGORY_LABELS[value] : (value ?? "—");

// ── Status ───────────────────────────────────────────────────────────────────
// [badge-Klasse, Label]. Unbekannt → grau + Rohwert (harmlos). Einheitliche Begriffe in
// der gesamten Adminoberfläche (Liste, Filter, Detail).
// Prototyplos — siehe Begründung bei CATEGORY_LABELS.
const STATUS_META = Object.assign(Object.create(null), {
  open: ["badge-yellow", "Offen"],
  in_progress: ["badge-blue", "In Bearbeitung"],
  resolved: ["badge-green", "Erledigt"],
  closed: ["badge-gray", "Geschlossen"],
});
export const supportStatusMeta = (status) => STATUS_META[status] || ["badge-gray", status ?? "—"];

// Stabile Anzeige-Reihenfolge (Liste/Filter/Select).
export const SUPPORT_STATUS_ORDER = Object.freeze(["open", "in_progress", "resolved", "closed"]);

export const SUPPORT_STATUS_FILTER_OPTIONS = Object.freeze([
  { value: "", label: "Alle" },
  ...SUPPORT_STATUS_ORDER.map((s) => ({ value: s, label: supportStatusMeta(s)[1] })),
]);

// Erlaubte Ziel-Status (ohne den aktuellen). Spiegelt exakt den Backendvertrag:
//   open        → in_progress | resolved | closed
//   in_progress → open | resolved | closed
//   resolved    → in_progress | closed
//   closed      → open
// Anders als bei den Stornierungsanfragen ist KEIN Status terminal: eine geschlossene
// Anfrage lässt sich wieder öffnen, weil ein Kunde jederzeit nachfassen kann.
// Prototyplos — siehe Begründung bei CATEGORY_LABELS.
const TRANSITIONS = Object.assign(Object.create(null), {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: ["open"],
});
export function allowedSupportTargets(current) {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, current) ? [...TRANSITIONS[current]] : [];
}

// Optionen für das Status-Select im Detail: der aktuelle Status (valide, vorausgewählt)
// plus die erlaubten Ziele, in stabiler Reihenfolge. Unbekannter Status → leer.
export function supportStatusOptions(current) {
  if (!STATUS_META[current]) return [];
  const set = new Set([current, ...allowedSupportTargets(current)]);
  return SUPPORT_STATUS_ORDER.filter((s) => set.has(s)).map((s) => ({ value: s, label: supportStatusMeta(s)[1] }));
}

// Darf der Status geändert werden? Nur bei bekanntem Status mit mindestens einem Ziel.
export function isSupportStatusEditable(current) {
  return !!STATUS_META[current] && allowedSupportTargets(current).length > 0;
}

// ── Kanonische Response-Normalisierung ───────────────────────────────────────
// Genau EINE kanonische Frontendform. Das Backend liefert camelCase (Vertrag); snake_case
// wird hier zentral einmal abgebildet, damit Komponenten nur mit kanonischen Feldern
// arbeiten.

// Erstes „belegtes" Feld (überspringt undefined/null/"" — 0 und false bleiben).
function firstOf(obj, ...keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function normalizeCustomer(raw, root) {
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    id: firstOf(c, "id", "user_id", "userId", "customer_id", "customerId")
      ?? firstOf(root, "user_id", "userId", "customer_id", "customerId"),
    company: firstOf(c, "company_name", "company") ?? firstOf(root, "company_name"),
    name: firstOf(c, "contactName", "contact_name", "name") ?? firstOf(root, "contactName", "name"),
    email: firstOf(c, "email") ?? firstOf(root, "email"),
    // Kundennummer NUR, wenn der Server sie liefert — nie aus einer ID gebildet.
    customerNumber: firstOf(c, "customerNumber", "customer_number") ?? firstOf(root, "customer_number"),
    status: firstOf(c, "status"),
  };
}

export function normalizeSupportRequest(raw) {
  if (!raw || typeof raw !== "object") return null;

  // revision erlaubt 0 als gültigen Wert.
  let revision;
  for (const k of ["revision", "rev", "version"]) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") { revision = v; break; }
  }

  const category = firstOf(raw, "category") ?? null;

  return {
    id: firstOf(raw, "id", "support_request_id", "supportRequestId"),
    ticketNumber: firstOf(raw, "ticketNumber", "ticket_number") ?? null,
    category,
    // Serverlabel hat Vorrang; die lokale Tabelle ist nur Fallback.
    categoryLabel: firstOf(raw, "categoryLabel", "category_label") ?? (category ? supportCategoryLabel(category) : null),
    // Der LISTEN-Endpunkt liefert ausschließlich `subjectPreview` (serverseitig gekürzt),
    // der DETAIL-Endpunkt den vollen `subject`. Beide werden auf dasselbe kanonische Feld
    // abgebildet — sonst bliebe die Liste leer. Es wird KEIN Ersatz abgeleitet.
    subject: firstOf(raw, "subject", "subjectPreview", "subject_preview") ?? null,
    // Kennzeichnet, ob der Wert nur die serverseitige Vorschau ist (Liste).
    subjectIsPreview: firstOf(raw, "subject") === undefined
      && firstOf(raw, "subjectPreview", "subject_preview") !== undefined,
    // Nachrichtentext gibt es NUR im Detail — die Liste liefert ihn bewusst nicht.
    message: raw.message ?? null,
    status: firstOf(raw, "status") ?? null,
    statusLabel: firstOf(raw, "statusLabel", "status_label") ?? null,
    // `??` erhält einen bewusst leeren String ("") als „geleerten" Vermerk.
    adminNote: raw.adminNote ?? raw.admin_note ?? null,
    revision,
    createdAt: firstOf(raw, "createdAt", "created_at"),
    updatedAt: firstOf(raw, "updatedAt", "updated_at"),
    handledAt: firstOf(raw, "handledAt", "handled_at"),
    handledBy: raw.handledBy ?? raw.handled_by ?? null,
    customer: normalizeCustomer(raw.customer ?? raw.user, raw),
    notification: raw.notification ?? null,
  };
}

// Erkennt eine No-op-Antwort des Backends (keine tatsächliche Änderung).
export function isSupportNoOpResponse(d) {
  return !!(d && typeof d === "object" && (d.noOp === true || d.no_op === true || d.noop === true));
}

// ── Dirty-Erkennung ──────────────────────────────────────────────────────────
export function normalizeSupportNote(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function isSupportStatusDirty(baselineStatus, nextStatus) {
  if (!isSupportStatusEditable(baselineStatus)) return false;
  return !!nextStatus && nextStatus !== baselineStatus;
}

export function isSupportNoteDirty(baselineNote, nextNote) {
  return normalizeSupportNote(baselineNote) !== normalizeSupportNote(nextNote);
}

// ── PATCH-Body (kanonischer Backendvertrag) ──────────────────────────────────
export const SETTABLE_SUPPORT_STATUS = Object.freeze(["open", "in_progress", "resolved", "closed"]);

// `revision` (immer, sofern übergeben — auch 0 ist gültig) plus die tatsächlich zu
// ändernden Felder. Der interne Vermerk heißt ausschließlich `adminNote` — nie
// internal_note/admin_note/note. Ungültige Statuswerte werden fail-closed abgelehnt.
export function buildSupportPatchBody(payload = {}) {
  const { revision, status, adminNote } = payload || {};
  const body = {};
  if (revision !== undefined && revision !== null) body.revision = revision;
  if (status !== undefined && status !== null) {
    if (!SETTABLE_SUPPORT_STATUS.includes(status)) throw new Error("invalid_status");
    body.status = status;
  }
  if (adminNote !== undefined) body.adminNote = adminNote;
  return body;
}

// ── Optimistic-Locking-Konflikt ──────────────────────────────────────────────
export const SUPPORT_CONFLICT_CODE = "SUPPORT_REQUEST_CONFLICT";
export const SUPPORT_CONFLICT_TEXT =
  "Diese Supportanfrage wurde zwischenzeitlich von einem anderen Administrator geändert.";
export const SUPPORT_CONFLICT_RELOAD = "Aktuellen Stand laden";

// Liest den mitgelieferten aktuellen Stand defensiv — ein älteres Backend ohne `current`
// wird sauber als Konflikt ohne Stand behandelt (dann null).
export function readSupportConflict(status, body) {
  const b = body && typeof body === "object" ? body : {};
  const code = typeof b.code === "string" ? b.code : (typeof b.error === "string" ? b.error : "");
  if (status !== 409 || code !== SUPPORT_CONFLICT_CODE) return { conflict: false, current: null };
  const raw = b.current && typeof b.current === "object" ? b.current : null;
  return { conflict: true, current: raw ? normalizeSupportRequest(raw) : null };
}

// Der Konflikt wird NIE automatisch überschrieben: die lokale Revision bleibt unverändert,
// bis der Admin den aktuellen Stand bewusst übernimmt.
export function applySupportConflictState(current) {
  if (!current || typeof current !== "object") return null;
  return {
    status: current.status ?? null,
    adminNote: current.adminNote ?? "",
    revision: current.revision,
  };
}

// ── Anzeige-Helfer ───────────────────────────────────────────────────────────
export const SUPPORT_UNKNOWN_CUSTOMER = "Kunde nicht auflösbar";
export const SUPPORT_NO_TICKET = "Ohne Ticketnummer";

// Fachliche Kennung: die Ticketnummer ist die Hauptdarstellung, nicht die technische ID.
// Fehlt sie, wird das ehrlich benannt — nie aus der ID konstruiert.
export function supportLabel(row) {
  const t = row && typeof row.ticketNumber === "string" ? row.ticketNumber.trim() : "";
  return t || SUPPORT_NO_TICKET;
}

// Kundendarstellung: Firma primär, Ansprechpartner/Kundennummer sekundär.
export function supportCustomerCell(row) {
  const c = (row && row.customer) || {};
  const secondary = [c.customerNumber, c.name].filter(Boolean).join(" · ");
  if (c.company) return { primary: c.company, secondary, known: true };
  if (c.name) return { primary: c.name, secondary: c.customerNumber || "", known: true };
  return { primary: SUPPORT_UNKNOWN_CUSTOMER, secondary: "", known: false };
}

// ── Leer- und Fehlerzustände ─────────────────────────────────────────────────
export const SUPPORT_LIST_ERROR = "Die Supportanfragen konnten nicht geladen werden.";
export const SUPPORT_DETAIL_ERROR = "Die Supportanfrage konnte nicht geladen werden.";
export const SUPPORT_SAVE_ERROR = "Die Änderung konnte nicht gespeichert werden.";

export function supportEmptyState({ count = 0, status = "" } = {}) {
  if (count > 0) return { show: false, title: "", text: "" };
  if (status) {
    return {
      show: true,
      title: "Für diesen Status wurden keine Supportanfragen gefunden.",
      text: "Wählen Sie einen anderen Status — oder setzen Sie den Filter zurück.",
    };
  }
  return {
    show: true,
    title: "Noch keine Supportanfragen vorhanden.",
    text: "Sobald Kunden eine Anfrage stellen, erscheinen sie hier.",
  };
}

// Nur belegte Query-Parameter (Backendvertrag: status, userId, limit, offset). „Alle"
// sendet keinen Status — ein ungültiger Wert würde serverseitig 400 auslösen.
export function toSupportApiFilters(status) {
  const s = typeof status === "string" ? status.trim() : "";
  return s && SUPPORT_STATUS_ORDER.includes(s) ? { status: s } : {};
}
