/* ── Lager & Aufträge — Fehlercode → Kundentext ──────────────────────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). EINE
   Verantwortung: die Übersetzung der Backend-Vertragscodes in kundenseitigen
   Text. Bewusst bereichsübergreifend (Bestand, Artikel, Lager, Aufträge,
   Reservierungen) — der Vertrag ist es auch (lib/inventory.js). */

// Die Codes sind der Vertrag des Backends (lib/inventory.js). Die Texte hier
// sind die kundenseitige Übersetzung — ein Rohcode erscheint nie im UI.
const ERROR_TEXTS = Object.freeze({
  INSUFFICIENT_STOCK: "Dafür ist nicht genügend Bestand verfügbar.",
  PRODUCT_NOT_FOUND: "Der Artikel wurde nicht gefunden.",
  WAREHOUSE_NOT_FOUND: "Das Lager wurde nicht gefunden.",
  ORDER_NOT_FOUND: "Der Auftrag wurde nicht gefunden.",
  ORDER_NOT_SHIPPABLE: "Dieser Auftrag ist nicht mehr versandbereit.",
  INVALID_QUANTITY: "Bitte prüfen Sie Ihre Eingabe.",
  CONCURRENT_STOCK_CHANGE: "Der Bestand hat sich zwischenzeitlich geändert. Bitte erneut versuchen.",
  RESERVATION_NOT_FOUND: "Die Reservierung wurde nicht gefunden.",
  PRODUCT_SKU_DUPLICATE: "Diese SKU ist bereits vergeben.",
  WAREHOUSE_DUPLICATE: "Ein Lager mit diesem Namen existiert bereits.",
  LOCATION_DUPLICATE: "Dieser Lagerplatz existiert bereits.",
  DUPLICATE_ENTRY: "Dieser Eintrag existiert bereits.",
  INVENTORY_RATE_LIMITED: "Zu viele Vorgänge in kurzer Zeit. Bitte einen Moment warten.",
  // Eigener Satz: hier fehlt GESPERRTER Bestand, nicht verfügbarer.
  INSUFFICIENT_BLOCKED_STOCK: "Es ist weniger Bestand gesperrt, als Sie freigeben möchten.",
  // Auftrags-Race (Finding 2): eine Reservierung dieses Auftrags wird gerade
  // exklusiv für eine laufende Buchung gehalten — kein Bestandsfehler, sondern ein
  // zeitlicher Konflikt. Betrifft POST /api/kunde/orders/:id/cancel.
  ORDER_RESERVATION_IN_USE: "Für diesen Auftrag wird gerade eine Sendung gebucht. Bitte versuchen Sie es in Kürze erneut.",
});

/**
 * Fehlerantwort → kundenseitiger Text.
 * Bevorzugt den bekannten Code; ein unbekannter Code fällt auf den
 * Servertext zurück, und erst danach auf einen neutralen Satz. Der Code selbst
 * erscheint nie im sichtbaren Text.
 */
export function inventoryErrorText(body, fallback = "Der Vorgang konnte nicht ausgeführt werden.") {
  const known = body && typeof body.code === "string" ? ERROR_TEXTS[body.code] : null;
  if (known) return known;
  if (body && typeof body.error === "string" && body.error.trim()) return body.error.trim();
  return fallback;
}
