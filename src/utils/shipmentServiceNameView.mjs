/* shipmentServiceNameView — der gebuchte Servicename einer Sendung in „Meine Sendungen".
 *
 * Reine Funktion: kein React, kein Netz.
 *
 * Der Server liefert je Sendung den öffentlichen Servicenamen, den der Kunde bei der Buchung
 * auf der Angebotskarte gelesen hat (`applied_tariff_display_name`, z. B. „Standard"). Er ist
 * serverseitig kuratiert — hier wird nichts gebildet, nichts übersetzt und nichts ergänzt.
 * Fehlt er oder ist er unbrauchbar, entsteht KEINE Zeile: ältere Sendungen sehen aus wie
 * bisher.
 */

// Ein Servicename ist eine kurze Produktbezeichnung. Ein ungewöhnlich langer Wert ist kein
// Anzeigename, sondern eine kaputte Antwort — er wird nicht gezeigt.
const MAX_LAENGE = 80;

/** Der gebuchte Servicename — oder `null`. */
export function shipmentServiceNameOf(sendung) {
  const roh = sendung && typeof sendung.applied_tariff_display_name === "string"
    ? sendung.applied_tariff_display_name.trim() : "";
  return roh !== "" && roh.length <= MAX_LAENGE ? roh : null;
}

/** Beschriftung der Zeile. */
export const SHIPMENT_SERVICE_LABEL = "Service";
