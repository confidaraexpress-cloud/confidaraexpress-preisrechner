/* ── Lager & Aufträge — Anzeigemodell des Bestands ───────────────────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). Fachmodul der
   Bestandsseite: Mindestbestand, Vorgangs-Vorschauen, Korrektur- und
   Sperrgründe. Reine Abbildungen — keine API, kein React, kein Zustand.

   Die Regel aus dem bestehenden System gilt unverändert: der Client rechnet
   keine Datenbankwahrheit aus. `available` wird ANGEZEIGT, nie berechnet oder
   gesendet; ob reserviert werden darf, entscheidet allein das Backend. */

import { zahlOderNull } from "./inventoryFormat.mjs";

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
