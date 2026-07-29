// Gemeinsame, reine Logik für die Admin-Stornierungsanfragen (Liste + Detail):
// kanonische Response-Normalisierung, Anzeige-Meta, erlaubte Statusübergänge und
// getrennte Dirty-Erkennung. Kein JSX, kein State, kein Fetch — testbar unter
// Node (`.mjs`). Enthält bewusst KEINE Buchungs-, Carrier-, JUMiNGO- oder
// Erstattungslogik: Eine Stornierungsanfrage ist ein rein INTERNER
// Verwaltungsvorgang; das Ändern von Status/Notiz stößt hier NICHTS beim
// Carrier/JUMiNGO an. Die serverseitige Prüfung bleibt maßgeblich.

// [badge-Klasse, Label] für den Anfragestatus. Unbekannt → grau + Rohwert
// (harmlos). Nur die vier belegten Status des Backend-Vertrags werden übersetzt.
// Einheitliche Begriffe in der gesamten Adminoberfläche (Liste, Filter, Detail,
// Dialoge) — zuvor wichen Badge-, Filter- und Dialogtexte voneinander ab.
const STATUS_META = {
  pending: ["badge-yellow", "Offen"],
  in_review: ["badge-blue", "In Prüfung"],
  accepted: ["badge-green", "Angenommen"],
  rejected: ["badge-red", "Abgelehnt"],
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
    // Geschäftliche Sendungskennung. `orderNumber` ist die vom Listen-/Detailvertrag
    // gelieferte JUMiNGO-Ordernummer; `businessOrderNumber` die interne Bestellnummer,
    // falls sie ein Endpunkt mitliefert. Es wird NIE eine Nummer aus der ID gebildet.
    orderNumber: firstOf(s, "orderNumber", "order_number"),
    businessOrderNumber: firstOf(s, "businessOrderNumber", "business_order_number"),
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
    // Der Backendvertrag liefert den Ansprechpartner als `contactName`; die übrigen
    // Varianten bleiben als defensive Abbildung erhalten.
    name: firstOf(c, "contactName", "contact_name", "name", "full_name") ?? firstOf(root, "contactName", "name"),
    email: firstOf(c, "email", "e_mail") ?? firstOf(root, "email"),
    // Kundennummer NUR, wenn der Server sie liefert — sie wird nie aus einer ID gebildet.
    customerNumber: firstOf(c, "customerNumber", "customer_number") ?? firstOf(root, "customer_number"),
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
    // Der LISTEN-Endpunkt liefert ausschließlich `reasonPreview` (serverseitig auf 120
    // Zeichen gekürzt), der DETAIL-Endpunkt den vollen `reason`. Beide werden hier auf
    // dasselbe kanonische Feld abgebildet — ohne die Liste sonst leer bliebe. Es wird
    // KEIN Ersatz aus anderen Feldern abgeleitet.
    reason: firstOf(raw, "reason", "reasonPreview", "reason_preview",
      "customer_reason", "customerReason", "cancellation_reason", "message") ?? null,
    // Kennzeichnet, ob der Wert nur die serverseitige Vorschau ist (Liste) — die
    // Detailseite zeigt den vollen Text, die Liste nie mehr als die Vorschau.
    reasonIsPreview: firstOf(raw, "reason") === undefined
      && firstOf(raw, "reasonPreview", "reason_preview") !== undefined,
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

// ── Optimistic-Locking-Konflikt ──────────────────────────────────────────────
// Das Backend antwortet auf eine veraltete Revision mit 409
// CANCELLATION_REQUEST_CONFLICT und liefert additiv den AKTUELLEN Bearbeitungs-
// stand mit (status, revision, adminNote, reviewedAt, reviewedBy, updatedAt) —
// bewusst OHNE den Grundtext. Damit kann die Oberfläche den Konflikt auflösen,
// ohne die Seite blind neu zu laden.
export const CANCELLATION_CONFLICT_CODE = "CANCELLATION_REQUEST_CONFLICT";
export const CANCELLATION_CONFLICT_TEXT =
  "Diese Stornierungsanfrage wurde zwischenzeitlich von einem anderen Administrator geändert.";
export const CANCELLATION_CONFLICT_RELOAD = "Aktuellen Stand laden";

// Erkennt einen Konflikt und liest den mitgelieferten Stand — defensiv, damit ein
// älteres Backend ohne `current` weiterhin sauber behandelt wird (dann null).
// → { conflict: boolean, current: object|null }
export function readCancellationConflict(status, body) {
  const b = body && typeof body === "object" ? body : {};
  const code = typeof b.code === "string" ? b.code : (typeof b.error === "string" ? b.error : "");
  if (status !== 409 || code !== CANCELLATION_CONFLICT_CODE) return { conflict: false, current: null };
  const raw = b.current && typeof b.current === "object" ? b.current : null;
  return { conflict: true, current: raw ? normalizeCancellationRequest(raw) : null };
}

// Der Konflikt wird NIE automatisch überschrieben: die lokale Revision bleibt
// unverändert, bis der Admin den aktuellen Stand bewusst übernimmt.
// → { status, adminNote, revision } aus dem Serverstand.
export function applyConflictState(current) {
  if (!current || typeof current !== "object") return null;
  return {
    status: current.status ?? null,
    adminNote: current.adminNote ?? "",
    revision: current.revision,
  };
}

// ── Bestätigungstexte für terminale Entscheidungen ───────────────────────────
// Beide benennen ausdrücklich, dass KEINE Carrier-/JUMiNGO-Stornierung ausgelöst
// wird — die Anfrage ist ein reiner Verwaltungsvorgang.
export const CANCELLATION_DECISION_DIALOG = Object.freeze({
  accepted: Object.freeze({
    title: "Stornierungsanfrage annehmen?",
    text: "Der Verwaltungsstatus wird auf „Angenommen“ gesetzt. Dadurch wird keine automatische Carrier- oder JUMiNGO-Stornierung ausgelöst.",
    confirm: "Anfrage annehmen",
  }),
  rejected: Object.freeze({
    title: "Stornierungsanfrage ablehnen?",
    text: "Der Verwaltungsstatus wird auf „Abgelehnt“ gesetzt. Die Entscheidung wird protokolliert.",
    confirm: "Anfrage ablehnen",
  }),
});

// ── Liste: Anzeige-Helfer ────────────────────────────────────────────────────
export const CANCELLATION_NO_ORDER_NUMBER = "Ohne Bestellnummer";
export const CANCELLATION_UNKNOWN_CUSTOMER = "Kunde nicht auflösbar";

// Fachliche Kennung einer Anfrage — „Anfrage #123", die technische ID bleibt sekundär.
export function cancellationLabel(row) {
  const id = row && row.id != null ? row.id : null;
  return id != null ? `Anfrage #${id}` : "Anfrage";
}

// Kundendarstellung: Firma primär, Ansprechpartner/Kundennummer sekundär.
// Die technische user_id ist NIE die Hauptdarstellung.
// → { primary, secondary, known }
export function cancellationCustomerCell(row) {
  const c = (row && row.customer) || {};
  const secondary = [c.customerNumber, c.name].filter(Boolean).join(" · ");
  if (c.company) return { primary: c.company, secondary, known: true };
  if (c.name) return { primary: c.name, secondary: c.customerNumber || "", known: true };
  return { primary: CANCELLATION_UNKNOWN_CUSTOMER, secondary: "", known: false };
}

// Sendungsdarstellung: geschäftliche Nummer primär, Route/Carrier sekundär.
// Fehlt die Nummer, wird das ehrlich benannt — nie aus der ID konstruiert.
// → { primary, secondary, known, id }
export function cancellationShipmentCell(row) {
  const s = (row && row.shipment) || {};
  const number = s.businessOrderNumber || s.orderNumber || "";
  const from = s.fromCountry ? String(s.fromCountry).toUpperCase() : "";
  const to = s.toCountry ? String(s.toCountry).toUpperCase() : "";
  const route = from || to ? `${from || "?"} → ${to || "?"}` : "";
  return {
    primary: number || CANCELLATION_NO_ORDER_NUMBER,
    secondary: [s.carrier, route].filter(Boolean).join(" · "),
    known: !!number,
    id: s.id ?? null,
  };
}

// ── Leer- und Fehlerzustände ─────────────────────────────────────────────────
export const CANCELLATION_LIST_ERROR = "Die Stornierungsanfragen konnten nicht geladen werden.";

export function cancellationEmptyState({ count = 0, status = "" } = {}) {
  if (count > 0) return { show: false, title: "", text: "" };
  if (status) {
    return { show: true, title: "Für diesen Status wurden keine Stornierungsanfragen gefunden.",
      text: "Wählen Sie einen anderen Status — oder setzen Sie den Filter zurück." };
  }
  return { show: true, title: "Noch keine Stornierungsanfragen vorhanden.",
    text: "Sobald Kunden eine Stornierung anfragen, erscheinen sie hier." };
}

// Nur belegte Query-Parameter (Backendvertrag: status, limit, offset). „Alle" sendet
// keinen Status — ein ungültiger Wert würde serverseitig 400 auslösen.
export function toCancellationApiFilters(status) {
  const s = typeof status === "string" ? status.trim() : "";
  return s && CANCELLATION_STATUS_ORDER.includes(s) ? { status: s } : {};
}
