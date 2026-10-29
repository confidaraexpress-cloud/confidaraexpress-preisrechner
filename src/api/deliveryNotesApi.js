import { apiFetch } from "./client";
import { toQuery } from "./inventoryApi";

// ── Lieferscheinverwaltung — API-Schicht (dünner Wrapper um das zentrale apiFetch) ──
//
// Backend-Vertrag: confidaraexpress-api docs/BACKEND_ARCHITECTURE.md §21.
//   GET  /api/kunde/delivery-notes                              Übersicht je gebuchte Sendung
//   GET  /api/shipments/:id/delivery-note                       maßgeblicher Lieferschein (PDF)
//   GET  /api/shipments/:id/delivery-notes                      Verlauf einer Sendung
//   GET  /api/shipments/:id/delivery-notes/confidara            Confidara-Lieferschein (PDF)
//   GET  /api/shipments/:id/delivery-notes/versions/:v          eigene Fassung (PDF)
//   POST /api/shipments/:id/delivery-notes/uploads              eigenes PDF (multipart: file, documentNumber)
//   POST /api/shipments/:id/delivery-notes/from-template        aus der Briefpapier-Vorlage
//   POST /api/shipments/:id/delivery-notes/confidara            Confidara-Lieferschein nachträglich
//   POST /api/shipments/:id/delivery-notes/versions/:v/withdraw Fassung zurückziehen
//   GET/POST/PATCH/DELETE /api/kunde/delivery-note-template…    Briefpapier-Vorlage
//
// Der Server entscheidet, welcher Lieferschein gilt, ob etwas erlaubt ist und ob eine Datei
// sicher ist; diese Schicht trägt nur Pfade und Formen.

const sid = (v) => encodeURIComponent(String(v ?? "").trim());
const TEMPLATE = "/api/kunde/delivery-note-template";

export const deliveryNotePaths = Object.freeze({
  effective: (shipmentId) => `/api/shipments/${sid(shipmentId)}/delivery-note`,
  confidara: (shipmentId) => `/api/shipments/${sid(shipmentId)}/delivery-notes/confidara`,
  version: (shipmentId, version) => `/api/shipments/${sid(shipmentId)}/delivery-notes/versions/${sid(version)}`,
  templatePreview: (which) => `${TEMPLATE}/${which === "active" ? "active" : "draft"}/preview`,
});

export function getDeliveryNotes(params, { signal } = {}) {
  return apiFetch(`/api/kunde/delivery-notes${toQuery(params)}`, { auth: true, signal });
}

export function getDeliveryNoteHistory(shipmentId, { signal } = {}) {
  return apiFetch(`/api/shipments/${sid(shipmentId)}/delivery-notes`, { auth: true, signal });
}

/** Lädt ein eigenes PDF hoch. `documentNumber` undefined = nicht angegeben. */
export function uploadDeliveryNote(shipmentId, file, documentNumber) {
  const form = new FormData();
  if (documentNumber !== undefined) form.append("documentNumber", documentNumber ?? "");
  form.append("file", file, file && file.name ? file.name : "lieferschein.pdf");
  return apiFetch(`/api/shipments/${sid(shipmentId)}/delivery-notes/uploads`, {
    method: "POST", auth: true, body: form, timeoutMs: 120000,
  });
}

/** Erstellt einen eigenen Lieferschein aus der aktiven Vorlage. Ohne Nummer belegt der Server vor. */
export function createDeliveryNoteFromTemplate(shipmentId, documentNumber) {
  return apiFetch(`/api/shipments/${sid(shipmentId)}/delivery-notes/from-template`, {
    method: "POST", auth: true, body: JSON.stringify(documentNumber === undefined ? {} : { documentNumber }),
  });
}

export function createConfidaraDeliveryNote(shipmentId) {
  return apiFetch(`/api/shipments/${sid(shipmentId)}/delivery-notes/confidara`, { method: "POST", auth: true, body: "{}" });
}

export function withdrawDeliveryNoteVersion(shipmentId, version) {
  return apiFetch(`/api/shipments/${sid(shipmentId)}/delivery-notes/versions/${sid(version)}/withdraw`, {
    method: "POST", auth: true, body: "{}",
  });
}

/** Ein Lieferschein-PDF über einen der Pfade oben (Vorschau und Download). */
export function fetchDeliveryNotePdf(path) {
  return apiFetch(path, { auth: true });
}

// ── Briefpapier-Vorlage ──
export function getDeliveryNoteTemplate({ signal } = {}) {
  return apiFetch(TEMPLATE, { auth: true, signal });
}

export function uploadDeliveryNoteTemplate(file) {
  const form = new FormData();
  form.append("file", file, file && file.name ? file.name : "briefpapier.pdf");
  return apiFetch(TEMPLATE, { method: "POST", auth: true, body: form, timeoutMs: 120000 });
}

export function updateDeliveryNoteTemplateDraft(areas) {
  return apiFetch(`${TEMPLATE}/draft`, { method: "PATCH", auth: true, body: JSON.stringify(areas) });
}

export function deleteDeliveryNoteTemplateDraft() {
  return apiFetch(`${TEMPLATE}/draft`, { method: "DELETE", auth: true });
}

export function activateDeliveryNoteTemplateDraft() {
  return apiFetch(`${TEMPLATE}/draft/activate`, { method: "POST", auth: true, body: "{}" });
}

export function draftDeliveryNoteTemplateFromActive() {
  return apiFetch(`${TEMPLATE}/draft/from-active`, { method: "POST", auth: true, body: "{}" });
}

export function deactivateDeliveryNoteTemplate() {
  return apiFetch(`${TEMPLATE}/active/deactivate`, { method: "POST", auth: true, body: "{}" });
}
