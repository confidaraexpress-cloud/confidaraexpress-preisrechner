// Reine, framework-freie Helfer für die Handelsrechnung (.mjs, testbar). KEIN
// React, KEIN fetch, KEINE Persistenz. Deckt die Client-Vorprüfung der PDF und
// das Backend-Code→Meldung-Mapping ab. Das Backend bleibt autoritativ; die
// Vorprüfung verhindert nur offensichtlich untaugliche Uploads.

// Aktuelles Confidara-Sicherheitslimit: 10 MiB.
export const MAX_COMMERCIAL_INVOICE_BYTES = 10 * 1024 * 1024;

// Client-Vorprüfung genau EINER Datei. Erwartet ein File-artiges Objekt
// ({ name, type, size }). Gibt { ok, code } zurück; code ist ein technischer
// Backend-kompatibler Schlüssel (für kontrollierte Verzweigung, nie roh ins DOM).
// KEINE PDF-Tiefenanalyse, KEINE Base64-Konvertierung.
export function validateCommercialInvoiceFile(file, { maxBytes = MAX_COMMERCIAL_INVOICE_BYTES } = {}) {
  if (!file) return { ok: false, code: "FILE_REQUIRED" };
  const name = typeof file.name === "string" ? file.name : "";
  if (!/\.pdf$/i.test(name)) return { ok: false, code: "INVALID_EXTENSION" };
  // MIME nur prüfen, wenn der Browser einen Typ liefert (manche liefern "").
  if (file.type && file.type !== "application/pdf") return { ok: false, code: "INVALID_MIME_TYPE" };
  if (typeof file.size === "number" && file.size <= 0) return { ok: false, code: "EMPTY_FILE" };
  if (typeof file.size === "number" && file.size > maxBytes) return { ok: false, code: "FILE_TOO_LARGE" };
  return { ok: true, code: null };
}

// Backend-/Client-Codes → klare deutsche UI-Meldungen (keine Rohantworten/Stacks).
const MESSAGES = {
  FILE_REQUIRED: "Bitte wählen Sie eine PDF-Datei aus.",
  INVALID_MIME_TYPE: "Bitte wählen Sie eine PDF-Datei aus.",
  INVALID_EXTENSION: "Bitte wählen Sie eine PDF-Datei aus.",
  INVALID_PDF: "Die ausgewählte Datei konnte nicht als gültige PDF erkannt werden.",
  EMPTY_FILE: "Die ausgewählte PDF ist leer.",
  FILE_TOO_LARGE: "Die PDF darf maximal 10 MB groß sein.",
  TOO_MANY_FILES: "Bitte wählen Sie genau eine PDF-Datei aus.",
  UNEXPECTED_FIELD: "Die Datei konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
  COMMERCIAL_INVOICE_EXISTS: "Für diese Sendung ist bereits eine Handelsrechnung hinterlegt.",
  COMMERCIAL_INVOICE_LOCKED: "Die Handelsrechnung wird gerade verarbeitet. Bitte versuchen Sie es gleich erneut.",
  COMMERCIAL_INVOICE_UPLOAD_REJECTED: "Die Handelsrechnung wurde nicht akzeptiert. Bitte prüfen Sie das Dokument und versuchen Sie es erneut.",
  COMMERCIAL_INVOICE_NOT_CONFIRMED: "Die Handelsrechnung konnte bei unserem Versandpartner nicht bestätigt werden. Bitte versuchen Sie es erneut.",
  COMMERCIAL_INVOICE_NOT_DELETED: "Die Handelsrechnung konnte nicht entfernt werden. Bitte versuchen Sie es erneut.",
  SHIPMENT_NOT_EDITABLE: "Die Handelsrechnung kann für diese bereits bearbeitete Sendung nicht mehr geändert werden.",
  NOT_CUSTOMS_SHIPMENT: "Für diese Sendung ist keine Handelsrechnung erforderlich.",
  NOT_FOUND: "Die Handelsrechnung ist derzeit nicht verfügbar.",
  INVALID_SHIPMENT_ID: "Die Sendung konnte nicht zugeordnet werden.",
  UPSTREAM_ERROR: "Die Handelsrechnung konnte bei unserem Versandpartner nicht bestätigt werden. Bitte versuchen Sie es erneut.",
};
const DEFAULT_MESSAGE = "Die Handelsrechnung konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.";

export function commercialInvoiceErrorMessage(code) {
  return (code && MESSAGES[code]) || DEFAULT_MESSAGE;
}

// Technischen Code defensiv aus einer Backend-Antwort ziehen (nur { code }).
export function pickErrorCode(body) {
  return body && typeof body === "object" && typeof body.code === "string" ? body.code : null;
}
