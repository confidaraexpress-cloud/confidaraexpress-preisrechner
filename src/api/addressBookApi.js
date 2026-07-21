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
//   DELETE /api/kunde/addresses/:id            (echte, dauerhafte Löschung)
// Listenresponse: { items: [], nextCursor: null }. DELETE ist ein echter,
// dauerhafter Hard-Delete (kein Archivieren, keine Wiederherstellung); die
// Response ist { deleted, addressId, newDefaultSenderId, message }.

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

// Echte, dauerhafte Löschung der Adressbuchzeile. Bereits gebuchte Sendungen
// bleiben unberührt (serverseitig Snapshot, keine Referenz). Kein Body nötig.
export function deleteAddress(id) {
  return apiFetch(`/api/kunde/addresses/${encodeURIComponent(String(id))}`, {
    method: "DELETE", auth: true,
  });
}
