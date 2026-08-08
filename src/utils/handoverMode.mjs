/* ── Übergabeart einer Sendung: Abholung oder Abgabe im Paketshop ────────────
   Die EINE Stelle, die entscheidet, wie eine Sendung den Absender verlässt.
   Sie liest ausschließlich `serviceType` — ein vom Backend klassifiziertes,
   strukturiertes Feld. NIEMALS Carriername, Servicebezeichnung oder Titel:
   die Angebotsnamen sind dafür untauglich (ein Abholtarif kann „Shopabgabe
   Express" heißen, ein Shopabgabetarif schlicht „Standardversand").

   Bewusst OHNE Carrier-Wissen: Ob es zu einem Shopabgabe-Angebot eine
   durchsuchbare Paketshop-Liste gibt, ist eine ANDERE Frage. Ein Angebot ohne
   auflösbaren Suchcode ist trotzdem eine Abgabe im Paketshop — es bekommt nur
   keinen Finder. Die Suchbarkeit baut deshalb auf dieser Datei auf
   (offerSupportsAccessPointSearch in carrierMap.js), nicht neben ihr. */

export const HANDOVER_PICKUP = "pickup";
export const HANDOVER_DROPOFF = "dropoff";

/**
 * Die Übergabeart eines Tarifs.
 *
 * @returns "pickup" | "dropoff" | null
 *
 * `null` bedeutet: das Backend hat die Übergabeart für dieses Angebot nicht
 * klassifiziert. Dann wird KEINE behauptet — lieber keine Kennzeichnung als
 * eine geratene. Ein dritter Typ wird nicht erfunden; belegt sind genau diese
 * beiden Werte (siehe buildStart in OfferCard und den Dropoff-Guardrail).
 */
export function handoverMode(tariff) {
  const t = tariff?.serviceType;
  if (t === HANDOVER_PICKUP) return HANDOVER_PICKUP;
  if (t === HANDOVER_DROPOFF) return HANDOVER_DROPOFF;
  return null;
}

/* Die sichtbaren Texte. Sie stehen in Satzschreibung; die Versalien macht das
   Stylesheet (text-transform). Grund: ein Screenreader spricht „ABGABE" sonst
   je nach Stimme als Buchstabenfolge, und die Suche im Browser fände den Text
   nicht mehr. Die Optik ist identisch. */
const HANDOVER_LABELS = {
  [HANDOVER_PICKUP]: "Abholung an Ihrer Adresse",
  [HANDOVER_DROPOFF]: "Abgabe im Paketshop",
};

/**
 * Die Kennzeichnung zu einer Übergabeart — oder null, wenn keine belegt ist.
 * Bewusst carrier-unabhängig: „Abgabe im Paketshop" gilt für DPD wie für UPS.
 */
export function handoverLabel(mode) {
  return HANDOVER_LABELS[mode] ?? null;
}

/** Kurzform: die Kennzeichnung direkt zum Tarif. */
export function handoverLabelForTariff(tariff) {
  return handoverLabel(handoverMode(tariff));
}
