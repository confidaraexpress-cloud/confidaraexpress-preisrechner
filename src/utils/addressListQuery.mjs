/* ── Adressbuch — Listenabfrage und Listenzustand ─────────────────────────────
   Herausgelöst aus addressBookView.mjs (Modularisierungs-Audit). Fachmodul der
   Adressliste: Requestparameter, Query-String, Cache-Schlüssel, Pagination,
   Leerzustand und der Mutations-Refresh. Kein React, kein Netzwerk. */

import { TAB_SENDER, TAB_RECIPIENT, ROLE_SENDER, ROLE_RECIPIENT } from "./addressRoles.mjs";

// ── Requestparameter (Suche/Filter/Pagination) ──────────────────────────────
// Nur explizit erlaubte Query-Parameter, leere Werte werden NICHT gesendet.
const ADDRESS_LIST_QUERY_KEYS = ["q", "role", "favorite", "cursor", "limit"];

// WICHTIG — bewusste, dokumentierte Annahme (API-Gap, siehe Abschlussbericht):
// Das Backend ist extern und in diesem Repo nicht einsehbar; ob `role=sender`
// serverseitig bereits sender+both liefert (wie die Produktentscheidung #3/#4
// es für die ANZEIGE verlangt) konnte nicht verifiziert werden. Diese Zuordnung
// ist bewusst zentral UND isoliert gehalten: sollte sich die Annahme als falsch
// erweisen, genügt eine Anpassung dieser einen Konstante/Funktion.
const TAB_TO_ROLE_PARAM = { [TAB_SENDER]: ROLE_SENDER, [TAB_RECIPIENT]: ROLE_RECIPIENT };
export function roleParamForTab(tab) {
  return TAB_TO_ROLE_PARAM[tab] || null;
}

// Baut die Query-String-Params für GET /api/kunde/addresses. `cursor` wird 1:1
// aus dem vorherigen nextCursor übernommen (kein Erfinden/Verändern). Der
// Favoritenfilter wird nur bei true gesendet — kein „false" im Query-String,
// das der Server evtl. anders interpretiert.
export function buildAddressListParams({ tab, q, favoritesOnly, cursor, limit } = {}) {
  const params = {};
  const role = roleParamForTab(tab);
  if (role) params.role = role;
  const trimmedQ = typeof q === "string" ? q.trim() : "";
  if (trimmedQ) params.q = trimmedQ;
  if (favoritesOnly === true) params.favorite = "true";
  if (cursor != null && cursor !== "") params.cursor = String(cursor);
  if (limit != null) params.limit = String(limit);
  return params;
}

// Reiner Query-String-Builder (allowlisted Keys, leere Werte weggelassen) —
// getrennt von buildAddressListParams, damit die API-Schicht ihn direkt nutzen
// kann, ohne die Filter-Zuordnung zu duplizieren.
export function toQueryString(params) {
  const q = new URLSearchParams();
  for (const key of ADDRESS_LIST_QUERY_KEYS) {
    const raw = params?.[key];
    if (raw === undefined || raw === null) continue;
    const val = String(raw).trim();
    if (val !== "") q.set(key, val);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Stabiler Cache-Schlüssel für den aktuellen Such-/Filterzustand. Ändert er
// sich, muss der Aufrufer Cursor + geladene Items zurücksetzen (neue Suche);
// bleibt er gleich, ist ein „Mehr laden" (nur Cursor ändert sich) korrekt.
export function addressListStateKey({ tab, q, favoritesOnly }) {
  const trimmedQ = typeof q === "string" ? q.trim() : "";
  return JSON.stringify([tab, trimmedQ, !!favoritesOnly]);
}

// ── Pagination: Ergebnisse ohne Duplikate anfügen ───────────────────────────
export function appendPageResults(existingItems, newItems) {
  const seen = new Set((existingItems || []).map((a) => a.id));
  const deduped = (newItems || []).filter((a) => !seen.has(a.id));
  return [...(existingItems || []), ...deduped];
}

// ── Empty-State-Unterscheidung ──────────────────────────────────────────────
// „noch keine Adressen" vs. „keine Suchtreffer" vs. „keine Favoriten" — je nach
// aktivem Filter, NUR wenn resultCount===0.
export function resolveEmptyStateKind({ resultCount, hasQuery, favoritesOnly }) {
  if (resultCount > 0) return null;
  if (hasQuery) return "no-results";
  if (favoritesOnly) return "no-favorites";
  return "none";
}

// ── Listen-Mutationshelfer (sichere Mutation → Refresh-Ersatz ohne Reload) ──
// Löschen entfernt die Adresse aus der aktuell sichtbaren Liste. Andere
// Mutationen (Bearbeiten/Favorit/Standard) ersetzen den Eintrag 1:1 durch die
// vom Server bestätigte Version.
export function applyAddressMutation(items, address, type) {
  const list = items || [];
  if (type === "delete") {
    return list.filter((a) => a.id !== address.id);
  }
  if (type === "update" || type === "favorite" || type === "defaultSender" || type === "defaultRecipient") {
    return list.map((a) => (a.id === address.id ? address : a));
  }
  return list;
}
