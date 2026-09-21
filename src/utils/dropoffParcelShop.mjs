// Reine, framework-freie Logik für die DPD-Paketshop-Abgabe (TG124) — testbar wie bookingGate.mjs.
//
// Ein Angebot mit Abgabe im Paketshop braucht vor der Buchung einen KONKRETEN Shop. Der Server bindet
// ihn; das Frontend übermittelt nur die zulässige Auswahl (parcelShopId + pickupLocationCode + Adresse).
// Ohne Shop ist die Buchung fail-closed gesperrt.
//
// „Ist das eine (suchbare) Shopabgabe?" beantwortet `offerSupportsAccessPointSearch` (carrierMap.js, baut
// auf handoverMode auf). Diese Datei baut die Regel NICHT nach: der boolesche Befund wird HEREINGEREICHT
// (`supportsAccessPointSearch`). So bleibt das Modul frei von der SVG-behafteten carrierMap und damit im
// Node-Test-Runner ladbar.
//
// TG124: NICHT jede suchbare Shopabgabe braucht die SERVERSEITIGE Portal-Suche. Eine gewöhnliche
// Carrier-Abgabe (JUMiNGO, DPD/UPS/…) sucht ihre Access Points weiter über den bestehenden Weg; nur ein
// Angebot mit `parcelShopSearch === "server"` (vom Backend gesetzt) verlangt die verbindliche Auswahl eines
// konkreten Abgabe-Paketshops über die serverseitig gekapselte Suche. „Braucht einen (Portal-)Shop" =
// auswählbares Angebot (`offerSelectable`) UND suchbare Shopabgabe UND serverseitige Paketshop-Suche.

import { offerSelectable } from "./offerIdentity.mjs";

/** Verlangt dieses Angebot vor der Buchung die Auswahl eines konkreten (serverseitig gesuchten) Abgabe-Paketshops? */
export function offerRequiresDropoffParcelShop(tariff, supportsAccessPointSearch) {
  if (!tariff || typeof tariff !== "object") return false;
  return offerSelectable(tariff) === true
    && supportsAccessPointSearch === true
    && tariff.parcelShopSearch === "server";
}

const s = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : (typeof v === "number" && Number.isFinite(v) ? String(v) : null));

/**
 * Normalisiert eine Shopauswahl (aus der TG124-Suche) auf die zulässige, buchungskompatible Form.
 * Fehlt eine Pflichtangabe (parcelShopId, pickupLocationCode, name, postcode, city) → `null` (fail-closed).
 */
export function normalizeDropoffParcelShop(shop) {
  if (!shop || typeof shop !== "object") return null;
  const parcelShopId = s(shop.parcelShopId ?? shop.id);
  const pickupLocationCode = s(shop.pickupLocationCode ?? shop.pudoId);
  const name = s(shop.name);
  const postcode = s(shop.postcode ?? shop.postCode);
  const city = s(shop.city);
  if (!parcelShopId || !pickupLocationCode || !name || !postcode || !city) return null;
  return {
    parcelShopId, pickupLocationCode, name, postcode, city,
    street: s(shop.street), houseNumber: s(shop.houseNumber), town: s(shop.town),
    countryCode: s(shop.countryCode) || "DE",
  };
}

/** Sperrt der fehlende/ungültige Abgabe-Shop die Buchung? (Nur für Angebote, die einen brauchen.) */
export function dropoffShopBlocksBooking(tariff, selectedShop, supportsAccessPointSearch) {
  if (!offerRequiresDropoffParcelShop(tariff, supportsAccessPointSearch)) return false;
  return normalizeDropoffParcelShop(selectedShop) === null;
}

/**
 * Der /book-Payloadzusatz: `{ dropoffParcelShop }` nur, wenn das Angebot einen Shop braucht UND eine
 * gültige Auswahl vorliegt. Sonst `{}` — der Server lehnt eine Buchung ohne Shop ohnehin fail-closed ab.
 */
export function dropoffParcelShopBookPayload(tariff, selectedShop, supportsAccessPointSearch) {
  if (!offerRequiresDropoffParcelShop(tariff, supportsAccessPointSearch)) return {};
  const shop = normalizeDropoffParcelShop(selectedShop);
  return shop ? { dropoffParcelShop: shop } : {};
}
