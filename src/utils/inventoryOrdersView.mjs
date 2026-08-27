/* ── Lager & Aufträge — Anzeigemodell der Aufträge ───────────────────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). Fachmodul der
   Auftragsliste und -detailseite. Reine Abbildungen — keine API, kein React,
   kein Zustand. Unbekannte Status laufen über statusFallback(). */

import { statusFallback } from "./statusFallback.mjs";
import { zahlOderNull, positionLabel, unitLabel } from "./inventoryFormat.mjs";

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
