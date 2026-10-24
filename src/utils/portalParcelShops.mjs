// TG124: die serverseitig gekapselten DPD-Portalshops auf die Trefferlistenform des Finders abbilden.
//
// Die Portalsuche liefert Kennungen, Name, Anschrift und eine Entfernung (`distanceKm`, vom Server aus der
// Portalseite gelesen), aber weder Öffnungszeiten noch einen Öffnungsstatus (belegt 2026-10-24). Die Zeile trägt
// deshalb nur, was die Quelle liefert: `status`, `hours` und `hoursOfOperation` sind `null` — keine Platzhalter.
// `dropoffShop` trägt die buchungskompatiblen Kennungen der verbindlichen Auswahl. Eine Kartenposition geht nur
// durch, wenn der Server sie mitliefert (`latitude`/`longitude`, geprüft); geschätzt oder erfunden wird nichts.
// Texte kommen dekodiert vom Server und werden hier nicht verändert.
import { normalizeDropoffParcelShop } from "./dropoffParcelShop.mjs";

const entfernung = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

export function mapPortalShopsToList(shops) {
  return (Array.isArray(shops) ? shops : []).map((s) => {
    const dropoffShop = normalizeDropoffParcelShop(s);
    const strasse = [s?.street, s?.houseNumber].filter(Boolean).join(" ");
    const km = entfernung(s?.distanceKm);
    return {
      // Der Schlüssel wird im Fenster ohnehin neu vergeben; hier reicht ein stabiler Wert.
      key: s?.pickupLocationCode || null,
      name: s?.name || null,
      address: [strasse, [s?.postcode, s?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      postCode: s?.postcode || null,
      city: s?.city || null,
      countryCode: s?.countryCode || "DE",
      status: null,
      hours: null,
      hoursOfOperation: null,
      distance: km,
      distanceCode: km === null ? null : "km",
      latitude: s?.latitude ?? null,
      longitude: s?.longitude ?? null,
      positionSource: typeof s?.positionSource === "string" ? s.positionSource : null,
      dropoffShop, // { parcelShopId, pickupLocationCode, … } | null — trägt die verbindliche Auswahl
    };
  }).filter((x) => x.dropoffShop); // nur gültige, auswählbare Shops
}
