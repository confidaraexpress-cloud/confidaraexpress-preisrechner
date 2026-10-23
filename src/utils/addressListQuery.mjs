/* ── Adressbuch — Listenabfrage und Listenzustand ─────────────────────────────
   Herausgelöst aus addressBookView.mjs (Modularisierungs-Audit). Fachmodul der
   Adressliste: Requestparameter, Query-String, Cache-Schlüssel, Pagination,
   Leerzustand und der Mutations-Refresh. Kein React, kein Netzwerk. */

import { TAB_SENDER, TAB_RECIPIENT, ROLE_SENDER, ROLE_RECIPIENT, belongsToTab } from "./addressRoles.mjs";

// ── Requestparameter (Suche/Filter/Pagination) ──────────────────────────────
// Nur explizit erlaubte Query-Parameter, leere Werte werden NICHT gesendet.
const ADDRESS_LIST_QUERY_KEYS = ["q", "role", "favorite", "default", "cursor", "limit"];

// Paket G (Master-Implementierungsauftrag 2026-10-23): `default=sender|recipient` liefert nur die
// Standardadresse dieser Rolle (je Konto höchstens eine). Der Wert folgt dem Reiter; ein unbekannter
// Reiter sendet keinen Filter.
const TAB_TO_DEFAULT_PARAM = { [TAB_SENDER]: "sender", [TAB_RECIPIENT]: "recipient" };
const TAB_TO_DEFAULT_FLAG = { [TAB_SENDER]: "isDefaultSender", [TAB_RECIPIENT]: "isDefaultRecipient" };

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
export function buildAddressListParams({ tab, q, favoritesOnly, defaultOnly, cursor, limit } = {}) {
  const params = {};
  const role = roleParamForTab(tab);
  if (role) params.role = role;
  const trimmedQ = typeof q === "string" ? q.trim() : "";
  if (trimmedQ) params.q = trimmedQ;
  if (favoritesOnly === true) params.favorite = "true";
  if (defaultOnly === true && TAB_TO_DEFAULT_PARAM[tab]) params.default = TAB_TO_DEFAULT_PARAM[tab];
  if (cursor != null && cursor !== "") params.cursor = String(cursor);
  if (limit != null) params.limit = String(limit);
  return params;
}

// Die Standardadresse eines Reiters aus einer Liste — erkannt am FLAG, nie an der Position. Ein
// Backend ohne den Filter liefert die gewöhnliche Liste; dann zählt nur ein Eintrag, der das Flag
// wirklich trägt (sonst stünde die neueste Adresse als „Standard“ im Absender).
export function defaultAddressForTab(items, tab) {
  const flag = TAB_TO_DEFAULT_FLAG[tab];
  if (!flag || !Array.isArray(items)) return null;
  return items.find((a) => a && a[flag] === true) || null;
}

// Ist diese Adresse die Standardadresse des Reiters? (Anzeige in der Adressauswahl.)
export function isDefaultForTab(address, tab) {
  const flag = TAB_TO_DEFAULT_FLAG[tab];
  return !!flag && !!address && address[flag] === true;
}

// Die Standardadresse steht in der Auswahl zuerst — einmal, auch wenn sie zugleich unter den
// neuesten Einträgen ist. Ohne Standardadresse bleibt die Liste unverändert.
export function withDefaultFirst(items, standard) {
  const list = Array.isArray(items) ? items : [];
  if (!standard || standard.id == null) return list;
  const id = String(standard.id);
  return [standard, ...list.filter((a) => !a || String(a.id) !== id)];
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
//
// Standard (Audit P7, 2026-10): Wird eine Adresse Standard-Absender bzw. -Empfänger, setzt der
// Server den bisherigen Standard in derselben Transaktion zurück. Dasselbe geschieht hier lokal —
// sonst trugen zwei Zeilen „Standard-Absender“ bis zum Neuladen, und ein Klick auf der alten Zeile
// konnte den alten Standard zurückholen. Kein Neuladen auf Seite 1.
//
// `view` (optional) beschreibt die sichtbare Ansicht: gehört die Adresse nach der Änderung nicht
// mehr hinein (Rolle gewechselt, Favorit entfernt unter „Nur Favoriten“), verschwindet sie hier.
export function applyAddressMutation(items, address, type, view = {}) {
  const list = items || [];
  if (type === "delete") {
    return list.filter((a) => a.id !== address.id);
  }
  if (type === "update" || type === "favorite" || type === "defaultSender" || type === "defaultRecipient") {
    const neuerAbsender = address?.isDefaultSender === true;
    const neuerEmpfaenger = address?.isDefaultRecipient === true;
    const { tab = null, favoritesOnly = false } = view || {};
    return list
      .map((a) => {
        if (a.id === address.id) return address;
        const absenderZurueck = neuerAbsender && a.isDefaultSender === true;
        const empfaengerZurueck = neuerEmpfaenger && a.isDefaultRecipient === true;
        if (!absenderZurueck && !empfaengerZurueck) return a;
        return {
          ...a,
          ...(absenderZurueck ? { isDefaultSender: false } : {}),
          ...(empfaengerZurueck ? { isDefaultRecipient: false } : {}),
        };
      })
      .filter((a) => a.id !== address.id
        || ((!tab || belongsToTab(a, tab)) && (!favoritesOnly || a.favorite === true)));
  }
  return list;
}

// Der Server hat nach dem Löschen des Standard-Absenders eine andere Adresse nachrücken lassen
// (DELETE → newDefaultSenderId). Die sichtbare Liste folgt lokal, ohne auf Seite 1 zu springen.
export function applyPromotedDefaultSender(items, newDefaultSenderId) {
  const list = items || [];
  if (newDefaultSenderId == null) return list;
  const id = String(newDefaultSenderId);
  return list.map((a) => {
    if (String(a.id) === id) return a.isDefaultSender === true ? a : { ...a, isDefaultSender: true };
    return a.isDefaultSender === true ? { ...a, isDefaultSender: false } : a;
  });
}
