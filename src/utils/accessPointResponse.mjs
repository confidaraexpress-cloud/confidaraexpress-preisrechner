import {
  normalizeAccessPointWorkState,
  todayOpeningHoursText,
  sortAccessPointsByDistance,
  toDistanceNumber,
} from "./accessPointView.mjs";

/* ── Antwort der Access-Point-Suche in eine darstellbare Liste bringen ────────
   Bis zum Umzug des Finders in die Angebote lag das hier unverändert in
   AccessPointFinder.jsx. Es steht jetzt als eigenes Modul daneben, weil der
   Finder-Zustand in einen gemeinsamen Provider gewandert ist und diese reine
   Umformung weder React noch den Provider braucht — und weil sie sich so
   direkt prüfen lässt.

   BEWUSST OHNE Carrier-Wissen: die Frage, WELCHER Suchcode zu einem Tarif
   gehört und ob ein Angebot die Suche überhaupt anbieten kann, steht in
   carrierMap.js — dort liegt die Carrier-Klassifikation ohnehin. Hier bliebe
   sie nicht nur fehl am Platz, sie zöge auch die SVG-Importe der Logotabelle
   mit und machte dieses Modul für einen reinen Node-Test unerreichbar.

   Der Backend-Vertrag (access-points-search) normalisiert Access Points u. a.
   mit: name, type, street, postCode, city, countryCode, distance, distanceCode,
   latitude, longitude, workState, hoursOfOperation. Wir lesen diese Felder
   defensiv aus und übernehmen NUR sicher renderbare, vorhandene Werte —
   niemals erfundene Daten, niemals Objekte, keine fachliche Interpretation von
   Statuswerten. Zusätzliche konventionelle Aliasse bleiben als Fallback. */

/** Ersten vorhandenen, nicht-leeren Wert aus einer Liste möglicher Feldnamen. */
const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== "") return v;
  }
  return null;
};

/**
 * Ein Ergebnis-Item normalisieren — oder null, wenn nichts Brauchbares
 * enthalten ist (→ das Item wird übersprungen, sauberer Leerzustand).
 */
export function normalizeAccessPointItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  const nameRaw = pick(raw, ["name", "shopName", "locationName", "companyName", "label"]);
  const name = typeof nameRaw === "string" ? nameRaw : null;

  // Adresse: fertige Zeichenkette bevorzugen, sonst aus Einzelteilen bauen.
  let address = pick(raw, ["address", "fullAddress", "formattedAddress"]);
  if (typeof address !== "string") {
    const street  = pick(raw, ["street", "streetAndNumber", "addressLine1"]);
    const houseNo = pick(raw, ["houseNumber", "streetNumber"]);
    const zip     = pick(raw, ["postCode", "postalCode", "zip", "zipCode"]);
    const town    = pick(raw, ["city", "town", "locality"]);
    const isText  = (v) => typeof v === "string" || typeof v === "number";
    const line1 = [street, houseNo].filter(isText).join(" ").trim();
    const line2 = [zip, town].filter(isText).join(" ").trim();
    address = [line1, line2].filter(Boolean).join(", ") || null;
  }

  // Entfernung: number ODER numerischer String ("1.2"/"1,2"); sonst null.
  const distance = toDistanceNumber(pick(raw, ["distance", "distanceKm", "distanceInKm"]));
  // Einheit aus distanceCode (Backend) verbatim, falls nicht-leerer String.
  const distCodeRaw = pick(raw, ["distanceCode"]);
  const distanceCode = typeof distCodeRaw === "string" && distCodeRaw.trim() ? distCodeRaw.trim() : null;

  // Öffnungszeiten: hoursOfOperation ist bei JUMiNGO ein Array aus Objekten
  // ({ dayName, workingHours, lunchBreak, workingDay }). Die Normalisierung
  // liegt in accessPointView.mjs und liefert genau eine Zeile für HEUTE —
  // Alt-Formate (String / String-Array) bleiben unverändert lesbar.
  const hoursOfOperation = pick(raw, ["hoursOfOperation", "openingHours", "hours", "openingTimes"]);
  const hours = todayOpeningHoursText(hoursOfOperation);

  // Öffnungsstatus: allein aus workState. JUMiNGO bestimmt ihn selbst — hier
  // wird er nur in einen deutschen Text und eine Statusfarbe übersetzt. Kein
  // Rohwert wird sichtbar, und es gibt keine eigene Uhrzeitregel.
  const status = normalizeAccessPointWorkState(pick(raw, ["workState"]));

  // Ländercode roh übernehmen; ob angezeigt wird, entscheidet der Renderer
  // kontextabhängig (nur wenn vom gesuchten Land abweichend → kein Clutter).
  const ccRaw = pick(raw, ["countryCode"]);
  const countryCode = typeof ccRaw === "string" && ccRaw.trim() ? ccRaw.trim().toUpperCase() : null;

  if (!name && !address) return null; // nichts Brauchbares → überspringen

  // hoursOfOperation UND latitude/longitude wandern als Rohwerte mit, weil
  // spätere Stufen GENAU diese Felder lesen: der Öffnungszeitenfilter und die
  // Wochenansicht das eine, die Kartenmarker das andere — nicht die
  // Anzeigeform (`hours`) daneben. Fehlte eines, liefe die betroffene Stufe
  // still ins Leere: die Liste sähe richtig aus und wäre es nicht (genau das
  // ist mit hoursOfOperation schon einmal passiert und wurde erst vom
  // E2E-Test aufgedeckt). Koordinaten werden NICHT erfunden — fehlen sie,
  // bleibt der Shop in der Liste und bekommt nur keinen Marker.
  return {
    name, address, distance, distanceCode, hours, status, hoursOfOperation, countryCode,
    latitude: pick(raw, ["latitude", "lat"]),
    longitude: pick(raw, ["longitude", "lng", "lon"]),
  };
}

/**
 * Die vollständige Antwort → sortierte Trefferliste.
 *
 * Normalisieren und Sortieren entfernen NICHTS: die vollständige Liste bleibt
 * erhalten. Sortiert wird stabil nach der von JUMiNGO gelieferten Entfernung;
 * Einträge ohne Entfernung bleiben erhalten und hängen in unveränderter
 * Reihenfolge hinten an. Kein Eintrag wird wegen workState entfernt.
 */
export function normalizeAccessPointList(data) {
  const arr =
    Array.isArray(data)               ? data :
    Array.isArray(data?.accessPoints) ? data.accessPoints :
    Array.isArray(data?.results)      ? data.results :
    Array.isArray(data?.data)         ? data.data :
    Array.isArray(data?.items)        ? data.items : [];
  return sortAccessPointsByDistance(arr.map(normalizeAccessPointItem).filter(Boolean));
}
