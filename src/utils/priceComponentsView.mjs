/* utils/priceComponentsView.mjs — die Preisbestandteile einer Serverantwort, zur Anzeige gelesen.

   Reine Funktionen: kein Netz, kein Zustand, kein React.

   ─── DER SERVER IST DIE AUTORITÄT ───────────────────────────────────────────
   Die Bestandteile (Versand, Zuschlag Privatadresse, zusätzliche Transportabsicherung) kommen
   fertig aus der Serverantwort — mit Netto, MwSt. und Brutto je Zeile. Diese Datei rechnet
   NICHTS: sie addiert keine Zeile zu einem Gesamtbetrag, rundet nichts und leitet keinen
   Betrag aus einem anderen ab. Der Gesamtbetrag steht ausschließlich in den Server-Totals.

   ─── FAIL CLOSED ─────────────────────────────────────────────────────────────
   Ein unbekannter Typ, ein unbrauchbarer Betrag, eine doppelte Zeile oder eine Liste ohne
   Versandzeile an erster Stelle ergeben `null`: dann zeigt die Oberfläche KEINE
   Aufschlüsselung, nur die Server-Totals. Eine geratene Bezeichnung für einen unbekannten Typ
   wäre eine Aussage über einen Preisbestandteil, den diese Oberfläche nicht kennt.

   ─── KEIN PROVIDERNAME ───────────────────────────────────────────────────────
   Die Bezeichnungen sind Kundentexte. Kein Einkaufsname, kein Anbietercode. */

export const PRICE_COMPONENT_TYPE = Object.freeze({
  SHIPPING_BASE: "shipping_base",
  RESIDENTIAL_DELIVERY_SURCHARGE: "residential_delivery_surcharge",
  TRANSPORT_INSURANCE: "transport_insurance",
});

/* Die Bezeichnungen der Buchungsflächen — zentral aus dem Typ, nie aus der Antwort. */
export const PRICE_COMPONENT_LABELS = Object.freeze({
  [PRICE_COMPONENT_TYPE.SHIPPING_BASE]: "Versand",
  [PRICE_COMPONENT_TYPE.RESIDENTIAL_DELIVERY_SURCHARGE]: "Zuschlag Privatadresse",
  [PRICE_COMPONENT_TYPE.TRANSPORT_INSURANCE]: "Zusätzliche Transportabsicherung",
});

/* Steuerpflichtig oder steuerfrei — eine Eigenschaft des Typs. Weicht die Antwort davon ab,
   beschreibt sie etwas anderes als diesen Vertrag und wird nicht gezeigt. */
const STEUERPFLICHTIG = Object.freeze({
  [PRICE_COMPONENT_TYPE.SHIPPING_BASE]: true,
  [PRICE_COMPONENT_TYPE.RESIDENTIAL_DELIVERY_SURCHARGE]: true,
  [PRICE_COMPONENT_TYPE.TRANSPORT_INSURANCE]: false,
});

const MAX_KOMPONENTEN = 8;

const betrag = (w) => (typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : null);
const bekannterTyp = (typ) =>
  typeof typ === "string" && Object.prototype.hasOwnProperty.call(PRICE_COMPONENT_LABELS, typ);

/**
 * Liest die öffentliche Komponentenliste einer Serverantwort.
 *
 * @param {Array} liste  `[{ type, taxable, net, vat, gross }]` in Euro
 * @returns {ReadonlyArray<{type, label, taxable, net, vat, gross}>|null}
 */
export function readPriceComponents(liste) {
  if (!Array.isArray(liste) || liste.length === 0 || liste.length > MAX_KOMPONENTEN) return null;
  const gesehen = new Set();
  const aus = [];
  for (const k of liste) {
    if (!k || typeof k !== "object" || Array.isArray(k)) return null;
    if (!bekannterTyp(k.type) || gesehen.has(k.type)) return null;
    gesehen.add(k.type);
    const net = betrag(k.net);
    const vat = betrag(k.vat);
    const gross = betrag(k.gross);
    if (net === null || vat === null || gross === null) return null;
    const taxable = STEUERPFLICHTIG[k.type];
    if (k.taxable !== undefined && k.taxable !== taxable) return null;
    aus.push(Object.freeze({ type: k.type, label: PRICE_COMPONENT_LABELS[k.type], taxable, net, vat, gross }));
  }
  if (aus[0].type !== PRICE_COMPONENT_TYPE.SHIPPING_BASE) return null;
  return Object.freeze(aus);
}

/**
 * Die Zeilen der Preisaufstellung aus einem bestätigten Price-View — getrennt nach steuerpflichtig
 * (netto, die MwSt. steht in der eigenen Zeile) und steuerfrei (brutto).
 *
 * `null`, sobald die Bestandteile nicht zum bestätigten Preis passen: kein bestätigter Preis, keine
 * Bestandteile, oder eine Absicherung im Betrag ohne Absicherungszeile (bzw. umgekehrt). Dann zeigt
 * die Aufstellung ihre bisherigen Zeilen. Es wird nichts summiert und nichts nachgerechnet.
 */
export function priceSummaryComponents(view) {
  const v = view && typeof view === "object" ? view : {};
  if (v.hasConfirmedPrice !== true || v.isPriceChanged === true) return null;
  const liste = readPriceComponents(v.components);
  if (!liste) return null;
  const taxable = liste.filter((k) => k.taxable);
  const taxFree = liste.filter((k) => !k.taxable);
  const absicherungImBetrag = typeof v.insuranceGross === "number" && v.insuranceGross > 0;
  if (absicherungImBetrag !== (taxFree.length > 0)) return null;
  return Object.freeze({ taxable: Object.freeze(taxable), taxFree: Object.freeze(taxFree) });
}

/** Trägt diese (bereits gelesene) Liste einen Zuschlag für die Privatadresse? */
export function hasResidentialSurcharge(components) {
  return Array.isArray(components)
    && components.some((k) => k && k.type === PRICE_COMPONENT_TYPE.RESIDENTIAL_DELIVERY_SURCHARGE);
}
