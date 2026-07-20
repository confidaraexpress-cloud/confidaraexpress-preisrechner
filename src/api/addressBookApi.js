import { apiFetch } from "./client";
import { buildAddressListParams, toQueryString } from "../utils/addressBookView.mjs";

// ── Adressbuch-API (dünner Wrapper um das zentrale apiFetch) ────────────────
// Alle Aufrufe laufen über apiFetch(..., { auth: true }): Bearer-Header und das
// zentrale 401/403-Handling (Token-Entfernung + Logout/Redirect) greifen unver-
// ändert. Diese Schicht ist bewusst „dünn": sie baut nur eine saubere Query
// (buildAddressListParams/toQueryString aus addressBookView.mjs, allowlisted,
// keine erfundenen Parameter) und reicht die rohe Response zurück — der
// Aufrufer wertet Status/JSON selbst aus (konsistent mit searchAccessPoints/
// repriceInsurance in client.js).
//
// Backend-Kontrakt (siehe Aufgabenstellung „Adressbuch-MVP"):
//   GET    /api/kunde/addresses
//   GET    /api/kunde/addresses/:id
//   POST   /api/kunde/addresses
//   PUT    /api/kunde/addresses/:id
//   DELETE /api/kunde/addresses/:id            (= archivieren, kein Hard-Delete)
//   POST   /api/kunde/addresses/:id/restore
// Listenresponse: { items: [], nextCursor: null }. DELETE ist das archivieren-
// Äquivalent (Backend liefert weiterhin einen Restore-Pfad → nicht destruktiv).

export function getAddresses(listParams, { signal } = {}) {
  const params = buildAddressListParams(listParams || {});
  return apiFetch(`/api/kunde/addresses${toQueryString(params)}`, { auth: true, signal });
}

export function getAddress(id) {
  return apiFetch(`/api/kunde/addresses/${encodeURIComponent(String(id))}`, { auth: true });
}

export function createAddress(payload) {
  return apiFetch(`/api/kunde/addresses`, {
    method: "POST", auth: true, body: JSON.stringify(payload),
  });
}

export function updateAddress(id, payload) {
  return apiFetch(`/api/kunde/addresses/${encodeURIComponent(String(id))}`, {
    method: "PUT", auth: true, body: JSON.stringify(payload),
  });
}

// Archivieren (soft-delete, wiederherstellbar über restoreAddress). KEIN
// destruktiver Hard-Delete-Endpunkt in diesem MVP.
export function archiveAddress(id) {
  return apiFetch(`/api/kunde/addresses/${encodeURIComponent(String(id))}`, {
    method: "DELETE", auth: true,
  });
}

export function restoreAddress(id) {
  return apiFetch(`/api/kunde/addresses/${encodeURIComponent(String(id))}/restore`, {
    method: "POST", auth: true,
  });
}
