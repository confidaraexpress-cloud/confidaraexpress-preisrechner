/* ── Lager & Aufträge — reines Anzeigemodell ─────────────────────────────────
   Enthält AUSSCHLIESSLICH seiteneffektfreie Abbildungen: Statusbezeichnungen,
   Badgeklassen, Mengenformatierung und die beiden Prefill-Abbildungen in den
   bestehenden Versandprozess. Keine API, kein React, kein Zustand.

   Zwei Regeln aus dem bestehenden System gelten hier unverändert:
     • Kein roher Backendwert im sichtbaren Text — unbekannte Status laufen über
       statusFallback() und zeigen „Unbekannter Status"; der Rohwert steht
       höchstens im title-Attribut.
     • Der Client rechnet keine Datenbankwahrheit aus. `available` wird
       ANGEZEIGT, nie berechnet oder gesendet; ob reserviert werden darf,
       entscheidet allein das Backend. */

import { statusFallback } from "./statusFallback.mjs";

/* ══════════ Auftragsstatus ══════════════════════════════════════════════ */

// Vier Zustände — bewusst reduziert (siehe db/init.js): die Reservierung
// entsteht beim Anlegen, ein Auftrag ist also ab Sekunde eins versandbereit.
// Trackingzustände der Sendung sind hier ausdrücklich NICHT abgebildet.
const ORDER_STATUS = Object.freeze({
  open: ["badge--info", "Offen"],
  partially_shipped: ["badge--progress", "Teilweise versendet"],
  shipped: ["badge--success", "Versendet"],
  cancelled: ["badge--cancelled", "Storniert"],
});

/** Rückgabe: [badgeKlasse, sichtbarerText, rohwertFuerTitle|null] */
export function orderStatusView(status) {
  const known = ORDER_STATUS[status];
  return known ? [known[0], known[1], null] : statusFallback(status);
}

/** Ein Auftrag ist versandbereit, solange noch etwas offen ist. */
export function isOrderShippable(order) {
  if (!order) return false;
  if (order.status !== "open" && order.status !== "partially_shipped") return false;
  return Number(order.openQuantity ?? 0) > 0;
}

/* ══════════ Bewegungstypen ══════════════════════════════════════════════ */

// Reihenfolge = Reihenfolge im Filter. V1 erzeugt die ersten fünf; die drei
// übrigen sind bereits benannt, damit eine spätere Erweiterung nicht als
// „Unbekannter Typ" erscheint.
export const MOVEMENT_TYPES = Object.freeze([
  "RECEIPT", "SHIPMENT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE",
  "RETURN", "TRANSFER_IN", "TRANSFER_OUT",
]);

const MOVEMENT_LABELS = Object.freeze({
  RECEIPT: ["badge--success", "Wareneingang"],
  SHIPMENT: ["badge--info", "Versand"],
  ADJUSTMENT_IN: ["badge--neutral", "Korrektur Zugang"],
  ADJUSTMENT_OUT: ["badge--neutral", "Korrektur Abgang"],
  DAMAGE: ["badge--warning", "Bruch / Schwund"],
  RETURN: ["badge--neutral", "Rücknahme"],
  TRANSFER_IN: ["badge--neutral", "Umlagerung Zugang"],
  TRANSFER_OUT: ["badge--neutral", "Umlagerung Abgang"],
});

/** Rückgabe: [badgeKlasse, sichtbarerText, rohwertFuerTitle|null] */
export function movementTypeView(type) {
  const known = MOVEMENT_LABELS[type];
  return known ? [known[0], known[1], null] : statusFallback(type);
}

/* ══════════ Bestand ═════════════════════════════════════════════════════ */

// Fehlender Wert → null. Bewusst VOR jedem Number()-Aufruf: Number(null) und
// Number("") sind beide 0. Ohne diese Prüfung erschiene ein fehlender Bestand als
// „0" — nicht unterscheidbar von einem echten Nullbestand, und damit eine stille
// Falschaussage über Ware.
function zahlOderNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Vorzeichenbehaftete Menge mit explizitem Plus — im Ledger trägt das Vorzeichen Bedeutung. */
export function signedQuantity(value) {
  const n = zahlOderNull(value);
  if (n === null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

/** Ganze Stückzahl in deutscher Schreibweise; nie „NaN" und nie ein Rohwert. */
export function formatUnits(value) {
  const n = zahlOderNull(value);
  if (n === null) return "—";
  return n.toLocaleString("de-DE");
}

/** Gewicht in kg, höchstens drei Nachkommastellen, ohne unnötige Nullen. */
export function formatKg(value) {
  const n = zahlOderNull(value);
  if (n === null) return "—";
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 3 })} kg`;
}

/**
 * Niedriger Bestand: verfügbar UNTER Mindestbestand. Ohne gesetzten
 * Mindestbestand gibt es keine Aussage — dann ist nichts „niedrig".
 * Bewusst `<`, nicht `<=`: genau der Mindestbestand ist der Sollzustand.
 */
export function isLowStock(row) {
  if (!row) return false;
  const min = row.minStock;
  if (min === null || min === undefined) return false;
  const available = Number(row.available ?? row.stock?.available);
  if (!Number.isFinite(available)) return false;
  return available < Number(min);
}

/** Rückgabe: [badgeKlasse, sichtbarerText] — nur wenn ein Mindestbestand gepflegt ist. */
export function stockLevelView(row) {
  if (!row || row.minStock === null || row.minStock === undefined) return null;
  return isLowStock(row)
    ? ["badge--warning", "Niedriger Bestand"]
    : ["badge--success", "Bestand ausreichend"];
}

/* ══════════ Prefill in den bestehenden Versandprozess ═══════════════════ */

// Beide Wege (Artikel versenden, Auftrag versenden) münden in DENSELBEN
// bestehenden Versandprozess. Diese Abbildungen erzeugen deshalb genau das,
// was NewShipmentPage ohnehin kennt: einen Werte-Patch auf die r_*/Paketfelder
// plus die Lagerabsicht, die bei /calculate-price mitgeschickt wird.
//
// AUSDRÜCKLICH NICHT enthalten: Paketmaße. Artikelmaße sind keine Paketmaße —
// fünf Artikel à 20 × 10 × 5 cm ergeben kein rechnerisch bestimmbares Paket.
// Es gibt kein Bin Packing; Maße bestätigt weiterhin der Mensch.

/**
 * Auftrag → Versand-Prefill.
 * Erwartet die Antwort von GET /api/kunde/orders/:id/shipping-prefill.
 * Rückgabe: { form, inventory, notice } — oder null, wenn nichts Brauchbares da ist.
 */
export function mapOrderPrefillToShipment(prefill) {
  if (!prefill || typeof prefill !== "object") return null;
  const r = prefill.recipient && typeof prefill.recipient === "object" ? prefill.recipient : null;
  if (!r) return null;

  const form = {
    r_company: r.company || "",
    r_fullName: r.fullName || "",
    r_street: r.streetAndNumber || "",
    r_addition: r.addressAddition || "",
    r_zip: r.postalCode || "",
    r_city: r.city || "",
    r_country: (r.country || "DE").toUpperCase(),
    r_phone: r.phone || "",
    r_email: r.email || "",
  };
  // Das Warengewicht ist ein AUSGANGSPUNKT, kein Ergebnis: es wird nur gesetzt,
  // wenn der Server für jede offene Position ein Stückgewicht hatte. Sonst bleibt
  // das Feld leer — lieber keine Zahl als eine zu niedrige.
  if (typeof prefill.suggestedWeightKg === "number" && prefill.suggestedWeightKg > 0) {
    form.weight = String(prefill.suggestedWeightKg);
  }

  const orderNumber = prefill.order && typeof prefill.order.orderNumber === "string" ? prefill.order.orderNumber : null;
  return {
    form,
    inventory: { orderId: String(prefill.order?.id ?? ""), orderNumber },
    notice: orderNumber
      ? `Versand aus Auftrag ${orderNumber}. Bitte Paketdaten prüfen und ergänzen.`
      : "Versand aus einem Auftrag. Bitte Paketdaten prüfen und ergänzen.",
  };
}

/**
 * Artikel → Versand-Prefill (Direktversand ohne Auftrag).
 * Der Empfänger bleibt leer — ein Artikel kennt keinen Empfänger.
 * Rückgabe: { form, inventory, notice } — oder null bei ungültiger Menge.
 */
export function mapProductToShipment(product, quantity, warehouseId = null) {
  if (!product || typeof product !== "object") return null;
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000000) return null;

  const form = {};
  const unit = Number(product.weightKg);
  if (Number.isFinite(unit) && unit > 0) {
    const total = Number((unit * qty).toFixed(3));
    // Die Versandvalidierung lässt 0,1–1000 kg zu. Ein rechnerisch größeres
    // Gesamtgewicht wird NICHT gekappt — dann bleibt das Feld leer und der
    // Kunde entscheidet (mehrere Pakete, Teilmenge, andere Aufteilung).
    if (total >= 0.1 && total <= 1000) form.weight = String(total);
  }

  return {
    form,
    inventory: {
      warehouseId: warehouseId != null ? String(warehouseId) : null,
      items: [{ productId: String(product.id), quantity: qty }],
    },
    notice: `Versand von ${qty} × ${product.name || product.sku || "Artikel"}. Bitte Empfänger und Paketdaten ergänzen.`,
  };
}

/* ══════════ Fehlermeldungen ═════════════════════════════════════════════ */

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
