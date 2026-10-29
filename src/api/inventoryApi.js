import { apiFetch } from "./client";

// ── Lager & Aufträge — API-Schicht (dünner Wrapper um das zentrale apiFetch) ──
//
// Aufbau exakt wie addressBookApi.js: jeder Aufruf läuft über
// apiFetch(..., { auth: true }), sodass Bearer-Header und das zentrale
// 401/403-Handling (Token entfernen + Logout/Redirect) unverändert greifen.
// Die Schicht ist bewusst „dünn": sie baut die Query und reicht die ROHE
// Response zurück — Status und JSON wertet der Aufrufer aus. Es entsteht kein
// zweites Fehler- oder Ladekonzept.
//
// Es gibt bewusst KEINE Funktion, die einen Bestand direkt setzt: Bestand ändert
// sich ausschließlich über Wareneingang und Korrektur, beide serverseitig mit
// Bewegung im Ledger. Der angezeigte `available`-Wert ist eine Anzeige, nie eine
// Eingabe — ob reserviert werden darf, entscheidet immer das Backend.
//
// Backend-Kontrakt:
//   GET    /api/kunde/warehouses                      POST /api/kunde/warehouses
//   GET    /api/kunde/warehouses/:id                  PATCH /api/kunde/warehouses/:id
//   GET    /api/kunde/warehouses/:id/locations        POST /api/kunde/warehouses/:id/locations
//   GET    /api/kunde/products                        POST /api/kunde/products
//   GET    /api/kunde/products/:id                    PATCH /api/kunde/products/:id
//   GET    /api/kunde/inventory/balances              GET  /api/kunde/inventory/movements
//   POST   /api/kunde/inventory/receipt               POST /api/kunde/inventory/adjustment
//   GET    /api/kunde/inventory/overview
//   GET    /api/kunde/orders                          POST /api/kunde/orders
//   GET    /api/kunde/orders/:id                      POST /api/kunde/orders/:id/cancel
//   GET    /api/kunde/orders/:id/shipping-prefill

const id = (v) => encodeURIComponent(String(v));

// Baut eine Query ausschließlich aus bekannten Schlüsseln mit gesetztem Wert.
// Keine erfundenen Parameter, keine leeren Schlüssel — identisch zur Regel in
// addressBookView.toQueryString.
export function toQuery(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ── Lager ─────────────────────────────────────────────────────────────────────
export function getWarehouses(params, { signal } = {}) {
  return apiFetch(`/api/kunde/warehouses${toQuery(params)}`, { auth: true, signal });
}
export function createWarehouse(payload) {
  return apiFetch(`/api/kunde/warehouses`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}
export function updateWarehouse(warehouseId, payload) {
  return apiFetch(`/api/kunde/warehouses/${id(warehouseId)}`, { method: "PATCH", auth: true, body: JSON.stringify(payload) });
}
export function getWarehouseLocations(warehouseId, { signal } = {}) {
  return apiFetch(`/api/kunde/warehouses/${id(warehouseId)}/locations`, { auth: true, signal });
}
export function createWarehouseLocation(warehouseId, payload) {
  return apiFetch(`/api/kunde/warehouses/${id(warehouseId)}/locations`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}

// ── Artikel ───────────────────────────────────────────────────────────────────
export function getProducts(params, { signal } = {}) {
  return apiFetch(`/api/kunde/products${toQuery(params)}`, { auth: true, signal });
}
export function getProduct(productId, { signal } = {}) {
  return apiFetch(`/api/kunde/products/${id(productId)}`, { auth: true, signal });
}
export function createProduct(payload) {
  return apiFetch(`/api/kunde/products`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}
export function updateProduct(productId, payload) {
  return apiFetch(`/api/kunde/products/${id(productId)}`, { method: "PATCH", auth: true, body: JSON.stringify(payload) });
}

// ── Bestand und Bewegungen ────────────────────────────────────────────────────
export function getBalances(params, { signal } = {}) {
  return apiFetch(`/api/kunde/inventory/balances${toQuery(params)}`, { auth: true, signal });
}
export function getMovements(params, { signal } = {}) {
  return apiFetch(`/api/kunde/inventory/movements${toQuery(params)}`, { auth: true, signal });
}
export function getInventoryOverview({ signal } = {}) {
  return apiFetch(`/api/kunde/inventory/overview`, { auth: true, signal });
}
// Wareneingang: erhöht on_hand und schreibt eine RECEIPT-Bewegung.
export function postReceipt(payload) {
  return apiFetch(`/api/kunde/inventory/receipt`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}
// Bestandskorrektur: `countedQuantity` ist der GEZÄHLTE Ist-Bestand; das Delta
// bildet der Server gegen den gespeicherten Stand. Der Client rechnet nichts aus.
export function postAdjustment(payload) {
  return apiFetch(`/api/kunde/inventory/adjustment`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}
// Bestand sperren / freigeben. Beide senden eine MENGE, nie einen Zielwert:
// „sperre N" und „gib N frei" sind nachvollziehbar, ein gesetzter Absolutwert
// wäre es nicht. `on_hand` verändert sich dabei nicht — eine Sperre ist keine
// physische Warenbewegung, sondern verschiebt verfügbaren in gesperrten Bestand.
export function postBlock(payload) {
  return apiFetch(`/api/kunde/inventory/block`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}
export function postUnblock(payload) {
  return apiFetch(`/api/kunde/inventory/unblock`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}

// ── Aufträge ──────────────────────────────────────────────────────────────────
export function getOrders(params, { signal } = {}) {
  return apiFetch(`/api/kunde/orders${toQuery(params)}`, { auth: true, signal });
}
export function getOrder(orderId, { signal } = {}) {
  return apiFetch(`/api/kunde/orders/${id(orderId)}`, { auth: true, signal });
}
export function createOrder(payload) {
  return apiFetch(`/api/kunde/orders`, { method: "POST", auth: true, body: JSON.stringify(payload) });
}
export function cancelOrder(orderId) {
  return apiFetch(`/api/kunde/orders/${id(orderId)}/cancel`, { method: "POST", auth: true });
}
// Liefert Empfänger, offene Positionen und einen Gewichts-Ausgangspunkt für den
// bestehenden Versandprozess. Ausdrücklich OHNE Paketmaße — Artikelmaße sind
// keine Paketmaße, und es gibt kein Bin Packing.
export function getOrderShippingPrefill(orderId, { signal } = {}) {
  return apiFetch(`/api/kunde/orders/${id(orderId)}/shipping-prefill`, { auth: true, signal });
}

// ── Artikel- und Bestandsimport ───────────────────────────────────────────────
// Upload-Vertrag: multipart mit GENAU EINEM Dateiteil `document` (application/json,
// kanonisches Importdokument, utils/inventoryImportDocument.mjs). Der Server prüft und
// plant (Vorschau), übernimmt erst nach Bestätigung in Abschnitten und bucht Bestand nur
// über Wareneingang bzw. Zählbestand-Korrektur.
//   POST /api/kunde/inventory/imports                 GET  /api/kunde/inventory/imports?status=open
//   GET  /api/kunde/inventory/imports/:id             GET  /api/kunde/inventory/imports/:id/rows
//   POST /api/kunde/inventory/imports/:id/apply       POST /api/kunde/inventory/imports/:id/recheck
//   POST /api/kunde/inventory/imports/:id/discard
export function analyzeInventoryImport(document) {
  const formData = new FormData();
  formData.append("document", new Blob([JSON.stringify(document)], { type: "application/json" }), "import.json");
  // Eigenes Zeitlimit: bis zu 10.000 Zeilen werden serverseitig geprüft und gespeichert.
  return apiFetch(`/api/kunde/inventory/imports`, { method: "POST", auth: true, body: formData, timeoutMs: 120000 });
}
export function getOpenInventoryImport({ signal } = {}) {
  return apiFetch(`/api/kunde/inventory/imports?status=open`, { auth: true, signal });
}
export function getInventoryImport(importId, { signal } = {}) {
  return apiFetch(`/api/kunde/inventory/imports/${id(importId)}`, { auth: true, signal });
}
export function getInventoryImportRows(importId, params, { signal } = {}) {
  return apiFetch(`/api/kunde/inventory/imports/${id(importId)}/rows${toQuery(params)}`, { auth: true, signal });
}
// Ein Aufruf übernimmt höchstens einen Abschnitt; wiederholbar ohne Doppelbuchung.
export function applyInventoryImport(importId, flags) {
  return apiFetch(`/api/kunde/inventory/imports/${id(importId)}/apply`, {
    method: "POST", auth: true, body: JSON.stringify(flags || {}), timeoutMs: 60000,
  });
}
export function recheckInventoryImport(importId) {
  return apiFetch(`/api/kunde/inventory/imports/${id(importId)}/recheck`, { method: "POST", auth: true, body: "{}" });
}
export function discardInventoryImport(importId) {
  return apiFetch(`/api/kunde/inventory/imports/${id(importId)}/discard`, { method: "POST", auth: true, body: "{}" });
}
