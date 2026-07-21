import { apiFetch } from "./client";
import { buildDraftListParams, toQueryString } from "../utils/draftsView.mjs";

// ── Formularentwürfe-API (dünner Wrapper um das zentrale apiFetch) ───────────
// Frühe, noch nicht berechnete Entwürfe (kind:"form") — getrennt von den bereits
// berechneten Shipment-Drafts (kind:"shipment", client.js → getDrafts/deleteDraft).
// Alle Aufrufe laufen über apiFetch(..., { auth: true }): Bearer-Header und das
// zentrale 401/403-Handling (Token-Entfernung + Logout/Redirect) greifen unver-
// ändert. Die Schicht ist bewusst „dünn": sie baut nur eine allowlisted Query
// (buildDraftListParams/toQueryString aus draftsView.mjs — Cursor bleibt opak,
// keine erfundenen Parameter) und reicht die rohe Response zurück; der Aufrufer
// wertet Status/JSON selbst aus (konsistent mit getDrafts/getAddresses).
//
// Hinweis zur Ablage: Das Repo hat KEIN src/services-Verzeichnis; die bestehende
// API-Schicht liegt unter src/api (client.js, addressBookApi.js, adminApi.js).
// Diese Datei folgt dieser Konvention statt eine neue Abstraktionsebene
// einzuführen (siehe CLAUDE.md: „API-Aufrufe über src/api").
//
// Backend-Kontrakt (siehe Aufgabenstellung, bereits gemergt & deployed):
//   GET    /api/kunde/form-drafts?limit=20&cursor=...  → { drafts: [...], nextCursor }
//   GET    /api/kunde/form-drafts/:id                  → { draft: {...} }
//   DELETE /api/kunde/form-drafts/:id                  → 204 (kein Body)
// :id ist die interne numerische Formularentwurf-ID (eigener Namensraum,
// getrennt von der Shipment-Draft-ID).

export function getFormDrafts({ limit, cursor } = {}, { signal } = {}) {
  const params = buildDraftListParams({ limit, cursor });
  return apiFetch(`/api/kunde/form-drafts${toQueryString(params)}`, { auth: true, signal });
}

export function getFormDraft(id, { signal } = {}) {
  return apiFetch(`/api/kunde/form-drafts/${encodeURIComponent(String(id))}`, { auth: true, signal });
}

export function deleteFormDraft(id) {
  return apiFetch(`/api/kunde/form-drafts/${encodeURIComponent(String(id))}`, {
    method: "DELETE", auth: true,
  });
}

// Legt einen NEUEN Formularentwurf an (nur bewusster „Als Entwurf speichern"-
// Klick — nie beim bloßen Öffnen). Payload: { schemaVersion, formData } — KEINE
// id, KEINE user_id (der Server leitet den Besitzer aus dem Bearer-Token ab).
// Rohe Response zurück; der Aufrufer wertet Status/JSON selbst aus.
export function createFormDraft(payload) {
  return apiFetch(`/api/kunde/form-drafts`, {
    method: "POST", auth: true, body: JSON.stringify(payload),
  });
}

// Aktualisiert einen bestehenden Formularentwurf. Payload: { schemaVersion,
// revision, formData } — die mitgesendete Revision ist die optimistische Sperre
// (Backend antwortet 409 FORM_DRAFT_CONFLICT bei Drift). :id in der URL, KEINE
// id/user_id im Body.
export function updateFormDraft(id, payload) {
  return apiFetch(`/api/kunde/form-drafts/${encodeURIComponent(String(id))}`, {
    method: "PATCH", auth: true, body: JSON.stringify(payload),
  });
}
