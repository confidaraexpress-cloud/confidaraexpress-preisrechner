/* acceptedOfferPrice — der Versandpreis eines Angebots nach einer UEBERNOMMENEN Preisaenderung.
 *
 * Reine Funktionen: kein React, kein Netz, keine Rechnung.
 *
 * ─── WARUM ES DAS GIBT ─────────────────────────────────────────────────────────────
 * Uebernimmt der Kunde eine Preisaenderung, bindet der Server den neuen Versandpreis an genau
 * dieses Angebot (neue Preisrevision). Die Buchungsseite zeigte danach den neuen Gesamtbetrag —
 * die Angebotsliste beim Zuruecknavigieren aber weiter den alten Versandpreis, und ohne
 * Absicherung stand er auf der Buchungsseite sogar wieder als Preis da.
 *
 * ─── ES WIRD NICHTS GERECHNET ──────────────────────────────────────────────────────
 * Uebernommen werden ausschliesslich die drei Versandbetraege der Serverantwort — netto, MwSt.,
 * brutto — und nur, wenn alle drei echte Betraege sind. Fehlt einer, bleibt das Angebot
 * unveraendert: es entsteht nie ein halb aktualisierter Preis.
 *
 * ─── ES GILT GENAU EIN ANGEBOT ─────────────────────────────────────────────────────
 * Ersetzt wird ueber `sameOffer` — dieselbe Identitaetsregel wie ueberall im Frontend. Ein
 * Angebot ohne Kennung ersetzt nichts.
 */

import { sameOffer } from "./offerIdentity.mjs";

const betrag = (w) => (typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : null);

/** Die Versandbetraege einer bestaetigten Neubepreisung im Feldschnitt des Angebots — oder `null`. */
export function acceptedShippingPrice(totals) {
  const t = totals && typeof totals === "object" && !Array.isArray(totals) ? totals : null;
  if (!t) return null;
  const netPrice = betrag(t.customerShippingNet);
  const vatAmount = betrag(t.shippingVat);
  const finalPrice = betrag(t.customerShippingGross);
  if (netPrice === null || vatAmount === null || finalPrice === null) return null;
  return Object.freeze({ netPrice, vatAmount, finalPrice });
}

/**
 * Das Angebot mit dem uebernommenen Versandpreis — oder `null`, wenn es nichts zu uebernehmen gibt
 * (keine vollstaendigen Serverbetraege oder derselbe Preis wie bisher).
 */
export function tariffWithAcceptedShippingPrice(tariff, totals) {
  const t = tariff && typeof tariff === "object" && !Array.isArray(tariff) ? tariff : null;
  const preis = acceptedShippingPrice(totals);
  if (!t || !preis) return null;
  if (t.netPrice === preis.netPrice && t.vatAmount === preis.vatAmount && t.finalPrice === preis.finalPrice) {
    return null;
  }
  return { ...t, ...preis };
}

/** Die Angebotsliste, in der genau dieses Angebot ersetzt ist. */
export function replaceOffer(tariffs, tariff) {
  if (!Array.isArray(tariffs)) return [];
  return tariffs.map((x) => (sameOffer(x, tariff) ? tariff : x));
}
