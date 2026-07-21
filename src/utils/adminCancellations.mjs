// Gemeinsame, reine Anzeige-/Übergangslogik für die Admin-Stornierungsanfragen
// (Liste + Detail). Kein JSX, kein State, kein Fetch — testbar unter Node
// (`.mjs`, wie adminInvoices.mjs). Enthält bewusst KEINE Buchungs-, Carrier-,
// JUMiNGO- oder Erstattungslogik: Eine Stornierungsanfrage ist ein rein
// INTERNER Verwaltungsvorgang. Das Ändern des Status stößt hier NICHTS beim
// Carrier/JUMiNGO an — die serverseitige Prüfung bleibt maßgeblich.

// [badge-Klasse, Label] für den Anfragestatus. Unbekannt → grau + Rohwert
// (harmlos; nie ein technischer Wert ohne Kontext). Nur die vier belegten
// Status des Backend-Vertrags werden übersetzt — kein Raten weiterer Werte.
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

// Terminale Status — abgeschlossen, KEIN Reopen (bewusste Produktregel). Für
// terminale Anfragen bietet das UI keinerlei Mutation an (weder Statuswechsel
// noch Notiz-Änderung); das Backend bleibt zusätzlich autoritativ.
export const TERMINAL_CANCELLATION_STATUSES = ["accepted", "rejected"];
export const isTerminalCancellationStatus = (status) => TERMINAL_CANCELLATION_STATUSES.includes(status);

// Erlaubte Ziel-Status (ohne den aktuellen), die ein Admin von einem
// NICHT-terminalen Status aus setzen darf. Bewusst vorwärtsgerichtet:
//   pending   → in_review | accepted | rejected
//   in_review → accepted | rejected
// Ein terminaler oder unbekannter Ausgangsstatus erlaubt KEINE Übergänge.
// (Das Backend prüft Übergänge zusätzlich serverseitig — dies ist reine UX.)
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

// Optionen für das Status-Select im Detail: der aktuelle Status (als valide,
// vorausgewählte Option) plus die erlaubten Ziel-Status, in stabiler
// Reihenfolge. Für terminale oder unbekannte Status → leer (kein Editor).
export function cancellationStatusOptions(current) {
  if (isTerminalCancellationStatus(current) || !STATUS_META[current]) return [];
  const set = new Set([current, ...allowedCancellationTargets(current)]);
  return CANCELLATION_STATUS_ORDER
    .filter((s) => set.has(s))
    .map((s) => ({ value: s, label: cancellationStatusMeta(s)[1] }));
}

// Darf die Anfrage im UI überhaupt bearbeitet werden (Status/Notiz)? Nur, wenn
// der aktuelle Status bekannt UND nicht terminal ist.
export function isCancellationEditable(current) {
  return !!STATUS_META[current] && !isTerminalCancellationStatus(current);
}

// Normalisiert einen Notiztext für den Vergleich „hat sich etwas geändert?":
// null/undefined → "", getrimmt. So gilt „nur Leerzeichen getippt" nicht als
// Änderung und ein Speichern ohne echte Änderung wird verhindert.
export function normalizeNote(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// Gibt es eine speicherbare Änderung gegenüber dem geladenen Stand? Entweder der
// Status wurde auf einen anderen (erlaubten) Wert gesetzt, oder der interne
// Vermerk unterscheidet sich (getrimmt) vom geladenen Wert. Verhindert leere
// PATCHes (kein No-Op-Request, keine unnötige Revision-Kollision).
export function hasCancellationEdit({ currentStatus, nextStatus, currentNote, nextNote }) {
  const statusChanged = !!nextStatus && nextStatus !== currentStatus;
  const noteChanged = normalizeNote(nextNote) !== normalizeNote(currentNote);
  return statusChanged || noteChanged;
}
