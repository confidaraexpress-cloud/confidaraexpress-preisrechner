/* offerMetadataView — belegte Angebotsmetadaten als fertige deutsche Zeilen.
 *
 * Reine Funktionen: kein Netz, kein React, kein Datum, kein Zufall. Zweimal dieselbe
 * Eingabe ergibt dieselbe Ausgabe.
 *
 * ─── SIE RECHNEN NICHTS AUS ────────────────────────────────────────────────────────
 * Beide Angaben kommen fertig vom Server und werden hier ausschliesslich FORMATIERT.
 * Insbesondere wird das Abrechnungsgewicht NIE aus Paketmassen abgeleitet: derselbe
 * Karton wird je Carrier gemessen verschieden bewertet (5,4 kg · 6,75 kg · 5 kg), und
 * eine eigene Formel waere eine erfundene Zahl auf einer Preiskarte.
 *
 * ─── SIE FRAGEN NIE NACH DEM PROVIDER ──────────────────────────────────────────────
 * Es gibt hier keinen Vergleich mit „transglobal", „jumingo" oder `debug.provider`.
 * Angezeigt wird, was DA ist — fehlt es, entsteht keine Zeile. Damit verhaelt sich die
 * gemeinsame Karte fuer beide Einkaufsquellen gleich, ohne eine davon zu kennen.
 *
 * ─── FEHLT ETWAS, STEHT DA NICHTS ──────────────────────────────────────────────────
 * Kein „unbekannt", kein „nicht verfuegbar", kein Gedankenstrich. Eine Karte ohne
 * belegte Angabe sieht aus wie heute.
 */

/* Eine echte, endliche Zahl groesser null — sonst nichts. `Number("")` ist 0 und
   `Number(true)` ist 1: ein fehlender Wert darf nie als belegte Null erscheinen. */
const zahl = (w) => (typeof w === "number" && Number.isFinite(w) && w > 0 ? w : null);

/* Kilogramm mit zwei Nachkommastellen, deutsches Komma: 5.4 → „5,40". Zwei Stellen sind
   Absicht — „5,4 kg" und „5,40 kg" sind dieselbe Zahl, aber die feste Stellenzahl macht
   nebeneinanderliegende Karten vergleichbar. */
const KG = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Das Abrechnungsgewicht als fertige Zeile — oder `null`.
 *
 * @param   {object} tarif  ein Angebot der calculate-price-Antwort
 * @returns {string|null}   z. B. „5,40 kg"
 */
export function chargeableWeightLine(tarif) {
  const w = zahl(tarif && tarif.chargeableWeight);
  return w === null ? null : `${KG.format(w)} kg`;
}

/* Eine Liste kurzer Bezeichnungen. Der Server hat sie bereits geprueft und entdoppelt;
   hier wird nur noch gegen Unfug abgesichert (kein Array, leere Strings, Nichtstrings). */
const bezeichnungen = (w) =>
  (Array.isArray(w) ? w : []).filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());

/**
 * Die Labelfaehigkeiten als fertige Zeile — oder `null`.
 *
 * „PDF · A4 / Thermal" — Formate und Groessen durch einen Mittelpunkt getrennt, die Werte
 * innerhalb einer Gruppe durch Schraegstrich. Fehlt eine der beiden Gruppen, entsteht die
 * andere allein; fehlen beide, entsteht nichts.
 *
 * ─── DIESE ZEILE SAGT NICHT, DASS JEMAND DRUCKEN MUSS ──────────────────────────────
 * Sie nennt Formate, in denen ein Label ENTSTEHEN kann. „Drucker erforderlich" ist eine
 * andere Aussage, kommt aus einem anderen Feld (`printerRequired`) und wird an anderer
 * Stelle dargestellt. Aus „PDF" folgt hier nichts, aus „Thermal" auch nicht.
 *
 * @param   {object} tarif
 * @returns {string|null}
 */
export function labelCapabilityLine(tarif) {
  const t = tarif && typeof tarif === "object" ? tarif : {};
  const formate = bezeichnungen(t.labelFormats);
  const groessen = bezeichnungen(t.labelSizes);
  const teile = [];
  if (formate.length > 0) teile.push(formate.join(" / "));
  if (groessen.length > 0) teile.push(groessen.join(" / "));
  return teile.length === 0 ? null : teile.join(" · ");
}

/* Die sichtbaren Beschriftungen. Sie stehen HIER und nicht im JSX, damit sie sich nicht
   an zwei Orten auseinanderentwickeln — dieselbe Regel wie bei den Adressfragen. */
export const OFFER_METADATA_LABEL = Object.freeze({
  chargeableWeight: "Abrechnungsgewicht",
  labelCapability:  "Verfügbare Labelformate",
});
