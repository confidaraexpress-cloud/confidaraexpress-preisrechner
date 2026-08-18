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

/**
 * „Niedriger Bestand" als Information statt als Etikett.
 *
 * Gibt `null` zurück, wenn kein Mindestbestand gepflegt ist oder der Bestand
 * reicht — dann gibt es nichts zu sagen. Sonst die drei Zahlen, die den Satz
 * tragen: verfügbar, Mindestbestand, Fehlmenge. Die Fehlmenge wird hier NUR
 * angezeigt (Differenz zweier bereits vorhandener Werte), nicht als
 * Datenbankwahrheit behandelt.
 */
export function lowStockInfo(row) {
  if (!isLowStock(row)) return null;
  const available = zahlOderNull(row.available ?? row.stock?.available);
  const minStock = zahlOderNull(row.minStock);
  if (available === null || minStock === null) return null;
  return { available, minStock, missing: minStock - available };
}

/* ══════════ Vorschauen der Bestandsvorgänge ═══════════════════════════════

   Beide Funktionen sind reine DARSTELLUNG. Sie sagen dem Kunden, was sein
   eingetippter Wert bedeutet, bevor er ihn abschickt — sie entscheiden nichts.
   Gebucht wird ausschließlich das, was der Server aus dem TATSÄCHLICH
   gespeicherten Bestand ableitet; ob eine Einbuchung, eine Korrektur oder eine
   Sperre erlaubt ist, prüft weiterhin allein das Backend.

   Der angezeigte Ausgangsbestand kann veraltet sein (jemand anderes bucht
   parallel). Genau deshalb schickt der Client bei der Korrektur weiterhin den
   GEZÄHLTEN Wert und nie ein selbst gerechnetes Delta: die Differenz bildet der
   Server unter FOR UPDATE gegen den echten Stand. Weicht sie von dieser
   Vorschau ab, gewinnt der Server. */

// Ganze Zahl oder null. Strenger als zahlOderNull(): „2,5" und „abc" sind hier
// keine Menge, und ein leeres Feld ist keine Null.
function ganzzahlOderNull(value) {
  const n = zahlOderNull(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

// Der physische Bestand einer Zeile — Bestandsliste (`onHand`) und
// Artikeldetail (`stock.onHand`) liefern ihn unter verschiedenen Namen.
function physisch(row) {
  return zahlOderNull(row?.onHand ?? row?.stock?.onHand);
}

/**
 * Wareneingang: „Nach der Buchung: physischer Bestand 28."
 * Rückgabe `{ current, quantity, next }` — oder null, solange die Eingabe keine
 * verwertbare Menge ist oder der Ausgangsbestand unbekannt bleibt.
 */
export function receiptPreview(row, input) {
  const menge = ganzzahlOderNull(input);
  if (menge === null || menge < 1) return null;
  const aktuell = physisch(row);
  if (aktuell === null) return null;
  return { current: aktuell, quantity: menge, next: aktuell + menge };
}

/**
 * Korrektur: gespeichert / gezählt / Differenz / neuer Bestand.
 *
 * `next` IST der gezählte Wert — das ist der Sinn einer Zählung. `difference`
 * wird nur ANGEZEIGT; gesendet wird sie nie.
 * Rückgabe `{ stored, counted, difference, next, unchanged }` — oder null.
 */
export function adjustmentPreview(row, input) {
  const gezaehlt = ganzzahlOderNull(input);
  if (gezaehlt === null || gezaehlt < 0) return null;
  const gespeichert = physisch(row);
  if (gespeichert === null) return null;
  const differenz = gezaehlt - gespeichert;
  return { stored: gespeichert, counted: gezaehlt, difference: differenz, next: gezaehlt, unchanged: differenz === 0 };
}

/* ══════════ Korrekturgründe ═══════════════════════════════════════════════ */

// Die Codes stammen aus dem Backend (lib/inventory.js ADJUSTMENT_REASONS) und
// stehen dort als CHECK auf inventory_movements.reason. Die Beschriftung
// entsteht ausschließlich hier — ein Rohwert erscheint nie im sichtbaren Text.
//
// Beschädigung und Schwund buchen serverseitig denselben Bewegungstyp
// (Abgangsart „Bruch / Schwund"), sind aber zwei verschiedene Gründe: das eine
// ist kaputt, das andere ist weg. Die frühere Ja/Nein-Frage konnte das nicht
// unterscheiden.
export const ADJUSTMENT_REASONS = Object.freeze([
  { value: "stocktake", label: "Inventurdifferenz" },
  { value: "damaged", label: "Beschädigung" },
  { value: "shrinkage", label: "Schwund" },
  { value: "other", label: "Sonstiges" },
]);

/** Grundcode → sichtbarer Text. Ohne oder mit unbekanntem Code: null, nicht roh. */
export function adjustmentReasonLabel(value) {
  const bekannt = ADJUSTMENT_REASONS.find((r) => r.value === value);
  return bekannt ? bekannt.label : null;
}

/* ══════════ Sperrbestand ═══════════════════════════════════════════════════ */

// Die Codes stammen aus dem Backend (lib/inventory.js BLOCK_REASONS). Die
// Beschriftung entsteht ausschließlich hier — ein Rohwert erscheint nie im
// sichtbaren Text. Bewusst kurz und branchenneutral: ein Maschinenbauer, ein
// Handwerksbetrieb und ein Fachhändler müssen dieselbe Liste verstehen.
export const BLOCK_REASONS = Object.freeze([
  { value: "damaged", label: "Beschädigt" },
  { value: "inspection", label: "Prüfung erforderlich" },
  { value: "on_hold", label: "Zurückgestellt" },
  { value: "other", label: "Sonstiger Grund" },
]);

/** Grundcode → sichtbarer Text. Unbekannter Code → neutraler Ersatz, nie roh. */
export function blockReasonLabel(value) {
  const bekannt = BLOCK_REASONS.find((r) => r.value === value);
  return bekannt ? bekannt.label : "Grund nicht angegeben";
}

/**
 * Ein Eintrag der Sperrhistorie als Anzeigezeile.
 * `{ id, action, title, meta, quantityText, rawReason }`
 * `rawReason` gehört höchstens in ein title-Attribut, nie in den Fließtext.
 */
export function blockEntryView(entry) {
  if (!entry || typeof entry !== "object") return null;
  const menge = zahlOderNull(entry.quantity);
  const gesperrt = entry.action === "block";
  const bekannt = BLOCK_REASONS.some((r) => r.value === entry.reason);
  return {
    id: String(entry.id ?? ""),
    action: gesperrt ? "block" : "unblock",
    title: gesperrt ? blockReasonLabel(entry.reason) : "Sperre aufgehoben",
    note: typeof entry.note === "string" && entry.note.trim() ? entry.note.trim() : null,
    warehouseName: typeof entry.warehouseName === "string" ? entry.warehouseName : null,
    createdAt: entry.createdAt || null,
    quantityText: menge === null ? "—" : `${menge.toLocaleString("de-DE")} ${menge === 1 ? "Einheit" : "Einheiten"}`,
    blockedAfter: zahlOderNull(entry.blockedAfter),
    rawReason: gesperrt && !bekannt && entry.reason ? String(entry.reason) : null,
  };
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
  // Eigener Satz: hier fehlt GESPERRTER Bestand, nicht verfügbarer.
  INSUFFICIENT_BLOCKED_STOCK: "Es ist weniger Bestand gesperrt, als Sie freigeben möchten.",
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

/* ══════════ Kennzahlen der Lagerübersicht ══════════════════════════════════

   EINE Quelle für Beschriftung, Erklärung, Vorschau und Ziel jeder Kennzahl.
   Die Seite selbst enthält deshalb keinen einzigen Kennzahlentext.

   Sprachregel (Auftrag §1, §26): ConfidaraExpress hat Großhändler, Maschinenbauer,
   Handwerksbetriebe und Kanzleien als Kunden — nicht nur Onlineshops. Deshalb
   überall „Artikel", „Bestand", „Auftrag", „Empfänger", „Sendung" und nirgends
   Lagerfachjargon oder Shopvokabular.

   Verbindlich: `previewKey` MUSS dieselbe Menge beschreiben wie `key`. Eine Zahl,
   hinter der beim Aufklappen etwas anderes steht, ist schlimmer als gar kein
   Detail — der Nutzer zöge daraus falsche Schlüsse und merkte es nicht. Der
   Backendtest inventory-overview-previews.test.js prüft genau diese Paarung. */
export const OVERVIEW_METRICS = Object.freeze([
  {
    key: "activeProducts", previewKey: "activeProducts", icon: "cube",
    label: "Aktive Artikel", hint: "Im Sortiment geführt",
    dialogTitle: "Aktive Artikel",
    // Der Satz beantwortet die Frage, die die Zahl offen lässt.
    dialogLead: "Zuletzt angelegte Artikel Ihres Sortiments.",
    emptyText: "Noch keine aktiven Artikel angelegt.",
    linkLabel: "Alle aktiven Artikel anzeigen", target: "products",
  },
  {
    key: "availableUnits", previewKey: "availableProducts", icon: "layers",
    label: "Verfügbare Einheiten", hint: "Frei disponierbar",
    dialogTitle: "Verfügbare Einheiten",
    dialogLead: "Artikel mit dem meisten frei verfügbaren Bestand.",
    emptyText: "Aktuell ist kein Bestand verfügbar.",
    linkLabel: "Gesamten Bestand anzeigen", target: "stock",
  },
  {
    key: "reservedUnits", previewKey: "reservedItems", icon: "clock",
    label: "Reservierte Einheiten", hint: "Für offene Aufträge vorgemerkt",
    dialogTitle: "Reservierte Einheiten",
    // Der wichtigste Erklärsatz der ganzen Seite: „reserviert" ist sonst abstrakt.
    dialogLead: "Diese Einheiten liegen physisch im Lager, sind aber bereits für offene Aufträge eingeplant.",
    emptyText: "Aktuell ist nichts reserviert.",
    linkLabel: "Alle offenen Aufträge anzeigen", target: "orders",
  },
  {
    key: "lowStockCount", previewKey: "lowStockProducts", icon: "info",
    label: "Artikel mit niedrigem Bestand", hint: "Unter eingestelltem Mindestbestand",
    dialogTitle: "Artikel mit niedrigem Bestand",
    dialogLead: "Verfügbarer Bestand unter dem von Ihnen eingestellten Mindestbestand.",
    emptyText: "Kein Artikel liegt unter seinem Mindestbestand.",
    linkLabel: "Alle betroffenen Artikel anzeigen", target: "stock", targetFilter: "low",
    tone: "warn",
  },
  {
    key: "openOrders", previewKey: "openOrders", icon: "cart",
    label: "Offene Aufträge", hint: "Noch nicht vollständig versendet",
    dialogTitle: "Offene Aufträge",
    dialogLead: "Aufträge, aus denen noch etwas zu versenden ist.",
    emptyText: "Es gibt keine offenen Aufträge.",
    linkLabel: "Alle offenen Aufträge anzeigen", target: "orders", targetFilter: "open",
  },
  {
    key: "shippedToday", previewKey: "shippedToday", icon: "packageMove",
    label: "Heute versendet", hint: "Einheiten aus dem Lager",
    dialogTitle: "Heute versendet",
    dialogLead: "Heute aus dem Lager ausgebuchte Einheiten.",
    emptyText: "Heute wurde noch nichts aus dem Lager versendet.",
    linkLabel: "Alle heutigen Bewegungen anzeigen", target: "movements", targetFilter: "shipmentsToday",
  },
]);

/** Die Kennzahl zu einem Schlüssel — oder null. Kein Raten über Reihenfolge. */
export function overviewMetric(key) {
  return OVERVIEW_METRICS.find((m) => m.key === key) || null;
}

function text(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Vorschaueinträge → einheitliche Anzeigezeilen.
 *
 * Rückgabe je Zeile: { id, primary, secondary, meta, value }
 *   primary   — was es ist (Artikel- oder Auftragsbezeichnung)
 *   secondary — die Einordnung (SKU, Empfänger, Lager)
 *   meta      — der Bezug, NUR wenn er wirklich existiert (Auftrag, Sendung)
 *   value     — die Zahl, die zur Kennzahl beiträgt
 *
 * Alle Werte kommen unverändert aus der Antwort. Hier wird nichts gerechnet und
 * nichts ergänzt: fehlt ein Auftragsbezug, bleibt das Feld leer, statt einen zu
 * behaupten (Auftrag §13).
 */
export function overviewPreviewRows(metricKey, previews) {
  const metric = overviewMetric(metricKey);
  if (!metric) return [];
  const liste = previews && Array.isArray(previews[metric.previewKey]) ? previews[metric.previewKey] : [];

  return liste.map((e, i) => {
    switch (metricKey) {
      case "activeProducts":
        return {
          id: e.productId || `p${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          meta: null,
          value: `${formatUnits(e.available)} verfügbar`,
        };
      case "availableUnits":
        return {
          id: e.productId || `a${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          meta: null,
          value: `${formatUnits(e.available)} verfügbar`,
        };
      case "reservedUnits":
        return {
          id: e.reservationId || `r${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          // Eine Reservierung ohne Auftrag gehört zu einem laufenden
          // Direktversand — dann steht dort bewusst nichts.
          meta: text(e.orderNumber) ? `Auftrag ${e.orderNumber}` : null,
          value: `${formatUnits(e.quantity)} reserviert`,
        };
      case "lowStockCount":
        return {
          id: `${e.productId || i}-${e.warehouseName || ""}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          // Das Lager gehört dazu: derselbe Artikel kann in zwei Lagern liegen
          // und dann zweimal zählen — ohne Lagername wäre das unerklärlich.
          meta: text(e.warehouseName),
          value: `${formatUnits(e.available)} von ${formatUnits(e.minStock)} — ${formatUnits(e.missing)} fehlen`,
        };
      case "openOrders":
        return {
          id: e.orderId || `o${i}`,
          primary: text(e.orderNumber) || "—",
          secondary: text(e.recipientCompany) || text(e.recipientName),
          meta: text(e.createdAt) ? dateTimeShort(e.createdAt) : null,
          value: positionLabel(e.itemCount),
        };
      case "shippedToday":
        return {
          id: e.movementId || `m${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.shipmentNumber) ? `Sendung ${e.shipmentNumber}` : null,
          meta: text(e.orderNumber) ? `Auftrag ${e.orderNumber}` : null,
          value: `${formatUnits(e.quantity)} Einheiten`,
        };
      default:
        return null;
    }
  }).filter(Boolean);
}

/** „1 Position" / „3 Positionen" — nie „1 Positionen". */
export function positionLabel(count) {
  const n = zahlOderNull(count);
  if (n === null) return "—";
  return `${n.toLocaleString("de-DE")} ${n === 1 ? "Position" : "Positionen"}`;
}

/** „1 Einheit" / „5 Einheiten" — nie „1 Einheiten". */
export function unitLabel(count) {
  const n = zahlOderNull(count);
  if (n === null) return "—";
  return `${n.toLocaleString("de-DE")} ${n === 1 ? "Einheit" : "Einheiten"}`;
}

/**
 * Eine Auftragszeile in einem Satz: „3 Positionen · 7 Einheiten reserviert · 2 versendet".
 *
 * Der Satz ist nötig, weil die drei Zahlen NICHT dasselbe zählen: `itemCount`
 * ist ein COUNT über die Positionen, `openQuantity` und `shippedQuantity` sind
 * SUMMEN über Mengen (siehe routes/orders.js). Nebeneinander in einer
 * Zahlenreihe liest man sie leicht als dreimal dasselbe.
 *
 * Die Einheit steht bewusst nur EINMAL: „… 7 Einheiten reserviert · 2
 * versendet" — die zweite Zahl erbt sie aus der ersten und der Satz bleibt kurz.
 * Rückgabe null, wenn keine der drei Zahlen vorliegt — dann gibt es nichts zu
 * sagen.
 */
export function orderSummary(order) {
  if (!order || typeof order !== "object") return null;
  const positionen = zahlOderNull(order.itemCount);
  const reserviert = zahlOderNull(order.openQuantity);
  const versendet = zahlOderNull(order.shippedQuantity);
  const teile = [];
  if (positionen !== null) teile.push(positionLabel(positionen));
  if (reserviert !== null) teile.push(`${unitLabel(reserviert)} reserviert`);
  if (versendet !== null) teile.push(`${versendet.toLocaleString("de-DE")} versendet`);
  return teile.length > 0 ? teile.join(" · ") : null;
}

/**
 * Datum ohne Uhrzeit, zweistellig: „18.08.2026".
 *
 * `toLocaleDateString("de-DE")` allein liefert „18.8.2026" — im selben Modul
 * steht daneben dateTimeShort() mit zweistelligen Feldern, und beide Formen
 * nebeneinander sehen nach Zufall aus.
 */
export function dateShort(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Kurzer Zeitpunkt ohne Sekunden — dieselbe Regel wie dtDE() bei den Entwürfen. */
export function dateTimeShort(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Ist das Lager praktisch noch leer?
 *
 * Auslöser bewusst „kein Artikel" (Auftrag §18): ohne Artikel führt jeder
 * weitere Schritt ins Leere — Bestand einbuchen und Auftrag erstellen brauchen
 * beide einen Artikel. Ein Konto MIT Artikeln, aber ohne Bestand, bekommt kein
 * Onboarding mehr: dort ist der nächste Schritt offensichtlich.
 *
 * Solange nichts geladen ist (`stats == null`), gilt das Lager als eingerichtet —
 * sonst blitzt beim ersten Rendern das Onboarding auf. Dieselbe Regel wie
 * hasOperationalData() auf der Kundenübersicht.
 */
export function isInventoryEmpty(stats) {
  if (!stats) return false;
  return zahlOderNull(stats.activeProducts) === 0;
}

/* ══════════ Optionale Formularabschnitte des Artikels ═════════════════════ */

/* Welche Felder gehören zu welchem einklappbaren Abschnitt.
   Hier statt in der Komponente, weil es reine Zuordnung ist — und weil ein
   Test sie so ohne Browser prüfen kann. */
export const SECTION_FIELDS = Object.freeze({
  dimensions: ["lengthCm", "widthCm", "heightCm"],
  customs: ["unitValue", "hsCode", "countryOfOrigin", "customsDescription"],
});

/**
 * Trägt ein optionaler Abschnitt bereits Daten?
 *
 * Grundlage der Regel „vorhandene Angaben werden nie versteckt": ein Abschnitt
 * mit Inhalt startet beim Bearbeiten geöffnet. Geprüft werden die tatsächlichen
 * Formularwerte (Strings), nicht das Rohobjekt — dieselbe Aussage gilt damit
 * für Anlegen und Bearbeiten. Reiner Leerraum zählt nicht als Wert, eine
 * gesetzte 0 dagegen schon.
 */
export function sectionHasData(values, section) {
  const felder = SECTION_FIELDS[section] || [];
  return felder.some((k) => String(values?.[k] ?? "").trim() !== "");
}
