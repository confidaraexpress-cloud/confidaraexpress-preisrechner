/* ── Sendungsverfolgung im Kundenbereich: Schnellwahl der laufenden Sendungen (Audit B.7, 2026-10-28) ──────
   Die Seite stand mit einem einzigen Feld auf leerer Fläche. Im Kundenbereich nennt sie darunter die eigenen
   laufenden Sendungen — aus der bereits geladenen Sendungsliste (GET /kunde/shipments), keine neue Abfrage. Ein
   Klick verfolgt genau die Trackingnummer, die die Liste trägt; die Abfrage selbst ist unverändert.

   Laufend heißt dasselbe wie in der Kennzahl „Aktive Sendungen“ (utils/kpis.mjs, isActive). Nur Sendungen mit
   Trackingnummer kommen in Frage — ohne Nummer gibt es nichts zu verfolgen. Reine Abbildung, kein React. */
import { isActive } from "./kpis.mjs";
import { customerShipmentNumbers, NO_ORDER_CONFIRMATION_TEXT } from "./businessNumbers.mjs";
import { shipmentRecipientLine } from "./shipmentRecipientView.mjs";

export const TRACKING_QUICKPICK_TEXT = Object.freeze({
  title: "Ihre laufenden Sendungen",
  hint: "Eine Sendung wählen, um ihren Stand abzufragen.",
});

/**
 * @returns {Array<{ id: string|number, trackingNumber: string, title: string, detail: string, carrierRaw: string }>}
 *   carrierRaw — der rohe Carrierwert der Sendung; den Anzeigenamen bildet die Komponente (utils/carrierMap.js)
 */
export function trackingQuickPick(shipments, limit = 6) {
  const out = [];
  for (const s of Array.isArray(shipments) ? shipments : []) {
    if (!s || !isActive(s)) continue;
    const nums = customerShipmentNumbers(s);
    const nummer = typeof nums.trackingNumber === "string" ? nums.trackingNumber.trim() : "";
    if (!nummer) continue;
    out.push({
      id: s.id,
      trackingNumber: nummer,
      title: nums.orderConfirmationNumber || NO_ORDER_CONFIRMATION_TEXT,
      detail: shipmentRecipientLine(s),
      carrierRaw: typeof s.selected_carrier === "string" ? s.selected_carrier : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}
