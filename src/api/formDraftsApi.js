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
