import { statusFallback } from "./statusFallback.mjs";
// Reine Logik für die Kunden-Stornierungsanfrage (Sichtbarkeit, Reason-
// Validierung, Statusanzeige, Fehlerklassifikation). Kein JSX, kein State, kein
// Fetch — testbar unter Node (`.mjs`). Enthält bewusst KEINE Buchungs-, Carrier-
// oder JUMiNGO-Stornierungslogik: Dies ist ausschließlich eine ANFRAGE an
// ConfidaraExpress; die serverseitige Prüfung bleibt maßgeblich.

// Reason-Grenzen — exakt passend zum Backend (mind. 10 nach Trim, max. 1000).
export const CANCELLATION_REASON_MIN = 10;
export const CANCELLATION_REASON_MAX = 1000;

// Sendungsstatus, aus denen heraus eine Stornierungsanfrage möglich ist.
export const CANCELLABLE_SHIPMENT_STATUSES = ["booked", "label_ready"];

// Kunden-seitige Statusanzeige der Anfrage: [badge-Klasse, Label]. Nur die vier
// belegten Status werden übersetzt; Unbekanntes → grau + Rohwert (harmlos).
const STATUS_META = {
  pending: ["badge-yellow", "Stornierung angefragt"],
  in_review: ["badge-blue", "Stornierungsanfrage in Bearbeitung"],
  accepted: ["badge-green", "Stornierungsanfrage angenommen"],
  rejected: ["badge-gray", "Stornierungsanfrage abgelehnt"],
};
export const customerCancellationStatusMeta = (status) =>
  STATUS_META[status] || statusFallback(status);

// Hat die Sendung bereits eine Stornierungsanfrage (irgendein Status)?
export function hasCancellationRequest(shipment) {
  const cs = shipment && shipment.cancellation_status;
  return cs !== undefined && cs !== null && cs !== "";
}

// Darf für diese Sendung eine Stornierung angefragt werden? Nur bei
// booked/label_ready, ohne bestehende Anfrage und mit vorhandener
// jumingo_shipment_id (ohne die ist der Request nicht adressierbar — analog zum
// Label-Button, der dieselbe ID benötigt).
export function canRequestCancellation(shipment) {
  if (!shipment) return false;
  if (hasCancellationRequest(shipment)) return false;
  if (!CANCELLABLE_SHIPMENT_STATUSES.includes(shipment.status)) return false;
  const jid = shipment.jumingo_shipment_id;
  return jid !== undefined && jid !== null && String(jid).trim() !== "";
}

// Zustand des Reason-Textes für Zeichenzähler und Button-Freigabe. `length` ist
// die Rohlänge (für den Zähler „N / 1000"); die Mindestlänge gilt nach Trim,
// reiner Whitespace ist damit ungültig.
export function cancellationReasonState(reason) {
  const raw = reason == null ? "" : String(reason);
  const length = raw.length;
  const trimmedLength = raw.trim().length;
  const empty = trimmedLength === 0;
  const tooShort = trimmedLength < CANCELLATION_REASON_MIN;
  const tooLong = length > CANCELLATION_REASON_MAX;
  return { length, trimmedLength, empty, tooShort, tooLong, valid: !tooShort && !tooLong };
}

export const isCancellationReasonValid = (reason) => cancellationReasonState(reason).valid;

// Klassifiziert eine Fehlerantwort des POST cancellation-request. Primär nach
// Backend-Code, mit HTTP-Status als Rückfallebene. Liefert eine
// kundenfreundliche Meldung plus UX-Flags:
//   keepDialogOpen — Dialog offen lassen (korrigierbarer Fehler)
//   refetch        — Sendungsliste danach neu laden (Serverzustand geändert)
//   markPending    — Zeile optimistisch auf „angefragt" setzen
// Kein Roh-Body, kein Stacktrace, keine Carrierdetails.
export function classifyCancellationError(status, code) {
  const c = typeof code === "string" ? code : "";

  if (c === "CANCELLATION_REQUEST_ALREADY_EXISTS" || status === 409) {
    return {
      kind: "already_exists",
      message: "Für diese Sendung wurde bereits eine Stornierungsanfrage gestellt.",
      keepDialogOpen: false, refetch: true, markPending: true,
    };
  }
  if (c === "SHIPMENT_CANCELLATION_NOT_ALLOWED") {
    return {
      kind: "not_allowed",
      message: "Für diese Sendung kann keine Stornierungsanfrage mehr gestellt werden.",
      keepDialogOpen: false, refetch: true, markPending: false,
    };
  }
  // FACHLICHER 404: nur wenn das Backend ausdrücklich SHIPMENT_NOT_FOUND meldet.
  if (c === "SHIPMENT_NOT_FOUND") {
    return {
      kind: "not_found",
      message: "Die Sendung wurde nicht gefunden oder ist nicht mehr verfügbar.",
      keepDialogOpen: false, refetch: true, markPending: false,
    };
  }
  // GENERISCHER 404 (z. B. der globale Not-Found-Handler bei falschem Pfad, ein
  // Proxy- oder Deploymentfehler): das ist KEIN Sendungsproblem. Genau diese
  // Verwechslung hat den kaputten Routenpfad monatelang verdeckt — der Kunde las
  // „Sendung nicht gefunden", obwohl seine Sendung existierte und der Endpunkt
  // schlicht nicht erreichbar war. Der Dialog bleibt offen, damit ein erneuter
  // Versuch möglich ist, und die Zeile wird NICHT als angefragt markiert.
  if (status === 404) {
    return {
      kind: "unavailable",
      message: "Die Stornierungsanfrage konnte nicht übermittelt werden. Bitte versuchen Sie es erneut.",
      keepDialogOpen: true, refetch: false, markPending: false,
    };
  }
  if (c === "CANCELLATION_REASON_INVALID" || status === 422) {
    return {
      kind: "reason_invalid",
      message: "Bitte gib einen Stornierungsgrund mit 10 bis 1000 Zeichen ein.",
      keepDialogOpen: true, refetch: false, markPending: false,
    };
  }
  if (status === 429) {
    return {
      kind: "rate_limited",
      message: "Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut.",
      keepDialogOpen: true, refetch: false, markPending: false,
    };
  }
  return {
    kind: "generic",
    message: "Die Stornierungsanfrage konnte nicht gesendet werden. Bitte versuche es erneut.",
    keepDialogOpen: true, refetch: false, markPending: false,
  };
}

// Liest einen Backend-Fehlercode defensiv aus dem JSON-Body (error/code/…).
export function readErrorCode(body) {
  if (!body || typeof body !== "object") return "";
  for (const k of ["error", "code", "error_code", "errorCode"]) {
    if (typeof body[k] === "string" && body[k]) return body[k];
  }
  return "";
}

// Kurzes, PII-armes Label zur Sendungsidentifikation im Dialog: Referenznummer
// bevorzugt, sonst maskierte jumingo_shipment_id (letzte 4). Nie Adressen.
export function shipmentDialogLabel(shipment) {
  if (!shipment) return "";
  const ref = shipment.reference_number;
  if (ref !== undefined && ref !== null && String(ref).trim() !== "") return String(ref).trim();
  const jid = shipment.jumingo_shipment_id;
  if (jid !== undefined && jid !== null && String(jid).trim() !== "") {
    const s = String(jid).trim();
    return `••••${s.slice(-4)}`;
  }
  return "";
}
