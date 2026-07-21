// Gemeinsame, reine Logik für die Admin-Stornierungsanfragen (Liste + Detail):
// kanonische Response-Normalisierung, Anzeige-Meta, erlaubte Statusübergänge und
// getrennte Dirty-Erkennung. Kein JSX, kein State, kein Fetch — testbar unter
// Node (`.mjs`). Enthält bewusst KEINE Buchungs-, Carrier-, JUMiNGO- oder
// Erstattungslogik: Eine Stornierungsanfrage ist ein rein INTERNER
// Verwaltungsvorgang; das Ändern von Status/Notiz stößt hier NICHTS beim
// Carrier/JUMiNGO an. Die serverseitige Prüfung bleibt maßgeblich.

// [badge-Klasse, Label] für den Anfragestatus. Unbekannt → grau + Rohwert
// (harmlos). Nur die vier belegten Status des Backend-Vertrags werden übersetzt.
const STATUS_META = {
  pending: ["badge-yellow", "Offen"],
  in_review: ["badge-blue", "In Bearbeitung"],
  accepted: ["badge-green", "Anfrage angenommen"],
  rejected: ["badge-red", "Anfrage abgelehnt"],
};
export const cancellationStatusMeta = (status) => STATUS_META[status] || ["badge-gray", status ?? "—"];

// Stabile Anzeige-Reihenfolge der Status (Liste/Filter/Select).
export const CANCELLATION_STATUS_ORDER = ["pending", "in_review", "accepted", "rejected"];

// Auswahl für den Status-Filter der Liste. „Alle" sendet keinen Filter.
export const CANCELLATION_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Alle" },
  ...CANCELLATION_STATUS_ORDER.map((s) => ({ value: s, label: cancellationStatusMeta(s)[1] })),
];

// Terminale Status. Terminal betrifft AUSSCHLIESSLICH Statusänderungen: aus
// accepted/rejected heraus ist kein Statuswechsel/kein Reopen möglich. Die
// interne Notiz bleibt weiterhin bearbeitbar (Backend erlaubt reine
// Notizänderung auch im terminalen Zustand).
export const TERMINAL_CANCELLATION_STATUSES = ["accepted", "rejected"];
export const isTerminalCancellationStatus = (status) => TERMINAL_CANCELLATION_STATUSES.includes(status);

// Erlaubte Ziel-Status (ohne den aktuellen), die ein Admin von einem
// NICHT-terminalen Status aus setzen darf. Vorwärtsgerichtet:
//   pending   → in_review | accepted | rejected
//   in_review → accepted | rejected
// Terminaler oder unbekannter Ausgangsstatus erlaubt KEINE Statusübergänge.
export function allowedCancellationTargets(current) {
  switch (current) {
    case "pending":
      return ["in_review", "accepted", "rejected"];
    case "in_review":
      return ["accepted", "rejected"];
    default:
      return [];
  }
}

// Optionen für das Status-Select im Detail: der aktuelle Status (valide,
// vorausgewählt) plus die erlaubten Ziel-Status, in stabiler Reihenfolge. Für
// terminale/unbekannte Status → leer (kein Status-Select).
export function cancellationStatusOptions(current) {
  if (isTerminalCancellationStatus(current) || !STATUS_META[current]) return [];
  const set = new Set([current, ...allowedCancellationTargets(current)]);
  return CANCELLATION_STATUS_ORDER
    .filter((s) => set.has(s))
    .map((s) => ({ value: s, label: cancellationStatusMeta(s)[1] }));
}

// Darf der STATUS geändert werden? Nur bei bekanntem, nicht-terminalem Status.
// (Die Notiz ist davon unabhängig immer bearbeitbar, solange die Ressource
// geladen ist.)
export function isCancellationStatusEditable(current) {
  return !!STATUS_META[current] && !isTerminalCancellationStatus(current);
}

// ── Kanonische Response-Normalisierung ───────────────────────────────────────
// Genau EINE kanonische Frontendform. Das Backend liefert primär camelCase
// (Vertrag); snake_case wird hier zentral einmal abgebildet, damit Komponenten
// ausschließlich mit den kanonischen Feldern arbeiten (keine Feldvarianten in
// den Komponenten). Kanonische Backendform wird zuerst behandelt.

// Erstes „belegtes" Feld (überspringt undefined/null/"" — 0 und false bleiben).
function firstOf(obj, ...keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function normalizeShipment(raw, root) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    id: firstOf(s, "id", "shipment_id", "shipmentId") ?? firstOf(root, "shipment_id", "shipmentId"),
    carrier: firstOf(s, "carrier", "selected_carrier", "carrier_name") ?? firstOf(root, "carrier"),
    serviceType: firstOf(s, "service_type", "serviceType", "service") ?? firstOf(root, "service_type", "serviceType"),
    status: firstOf(s, "status", "state"),
    price: firstOf(s, "price_final", "price_gross", "priceGross", "price"),
    fromCountry: firstOf(s, "from_country", "fromCountry", "origin_country"),
    toCountry: firstOf(s, "to_country", "toCountry", "destination_country"),
  };
}

function normalizeCustomer(raw, root) {
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    id: firstOf(c, "id", "user_id", "userId", "customer_id", "customerId")
      ?? firstOf(root, "user_id", "userId", "customer_id", "customerId"),
    company: firstOf(c, "company_name", "company", "firma") ?? firstOf(root, "company_name"),
    name: firstOf(c, "name", "full_name", "contact_name") ?? firstOf(root, "name"),
    email: firstOf(c, "email", "e_mail") ?? firstOf(root, "email"),
  };
}

export function normalizeCancellationRequest(raw) {
  if (!raw || typeof raw !== "object") return null;

  // revision erlaubt 0 als gültigen Wert.
  let revision;
  for (const k of ["revision", "rev", "version"]) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") { revision = v; break; }
  }

  return {
    id: firstOf(raw, "id", "cancellation_request_id", "request_id", "requestId"),
    status: firstOf(raw, "status", "state") ?? null,
    reason: firstOf(raw, "reason", "customer_reason", "customerReason", "cancellation_reason", "message") ?? null,
    // Kanonische Notiz: `adminNote` zuerst, dann dokumentiertes snake_case
    // `admin_note`. `??` erhält einen bewusst leeren String ("") als „geleerte"
    // Notiz; erst null/undefined fallen durch auf null.
    adminNote: raw.adminNote ?? raw.admin_note ?? null,
    revision,
    createdAt: firstOf(raw, "createdAt", "created_at", "requested_at", "requestedAt", "cancellation_requested_at", "created"),
    updatedAt: firstOf(raw, "updatedAt", "updated_at"),
    reviewedAt: firstOf(raw, "reviewedAt", "reviewed_at"),
    reviewedBy: firstOf(raw, "reviewedBy", "reviewed_by"),
    shipment: normalizeShipment(raw.shipment ?? raw.shipment_data, raw),
    customer: normalizeCustomer(raw.customer ?? raw.user, raw),
    invoice: raw.invoice ?? raw.invoice_data ?? null,
    notification: raw.notification ?? null,
  };
}

// Erkennt eine No-op-Antwort des Backends (keine tatsächliche Änderung).
export function isNoOpResponse(d) {
  return !!(d && typeof d === "object" && (d.noOp === true || d.no_op === true || d.noop === true));
}

// ── Dirty-Erkennung (getrennt nach Status und Notiz) ─────────────────────────
// Normalisiert einen Notiztext für den Vergleich: null/undefined → "", getrimmt.
// So gilt reine Whitespace-Änderung nicht als Änderung und null↔"" ist gleich.
export function normalizeNote(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// Statusänderung? Nur relevant/erlaubt bei bearbeitbarem (nicht-terminalem)
// Status; bei terminalem Status ist der Statuswechsel gesperrt → immer false.
export function isStatusDirty(baselineStatus, nextStatus) {
  if (!isCancellationStatusEditable(baselineStatus)) return false;
  return !!nextStatus && nextStatus !== baselineStatus;
}

// Inhaltliche Notizänderung (getrimmt)? Erfasst auch das bewusste Leeren einer
// zuvor vorhandenen Notiz ("x" → "").
export function isNoteDirty(baselineNote, nextNote) {
  return normalizeNote(baselineNote) !== normalizeNote(nextNote);
}

// ── PATCH-Body-Aufbau (kanonischer Backend-Vertrag) ──────────────────────────
// Setzbare Statuswerte laut Vertrag.
export const SETTABLE_CANCELLATION_STATUS = ["pending", "in_review", "accepted", "rejected"];

// Baut den kanonischen PATCH-Body: `revision` (immer, sofern übergeben — auch 0
// ist gültig) plus die tatsächlich zu ändernden Felder. Die interne Notiz wird
// AUSSCHLIESSLICH als `adminNote` gesendet — niemals internal_note/admin_note/
// note. `adminNote` wird nur aufgenommen, wenn explizit übergeben; ein bewusst
// leerer String ("") oder null (Notiz leeren) bleibt erhalten, `undefined` lässt
// das Feld unangetastet. Ungültige Statuswerte werden fail-closed abgelehnt.
export function buildCancellationPatchBody(payload = {}) {
  const { revision, status, adminNote } = payload || {};
  const body = {};
  if (revision !== undefined && revision !== null) body.revision = revision;
  if (status !== undefined && status !== null) {
    if (!SETTABLE_CANCELLATION_STATUS.includes(status)) {
      throw new Error("invalid_status");
    }
    body.status = status;
  }
  if (adminNote !== undefined) body.adminNote = adminNote;
  return body;
}
