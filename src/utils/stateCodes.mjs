/* Bundesstaat / Provinz für US- und CA-Adressen — reine Daten und Regeln, kein React.
   =============================================================================
   Der Backendvertrag (JUMiNGO StateCode) verlangt den Bundesstaat AUSDRÜCKLICH nur für die
   USA und Kanada: „the state is required only for US and Canada". Für jedes andere Land
   existiert das Feld nicht — es wird nicht angezeigt, nicht geprüft und nicht gesendet.
   Der nationale Versand und alle bisherigen Ziele verhalten sich damit unverändert.

   Diese Datei ist die FRONTENDseitige Entsprechung von lib/stateCode.js im Backend. Beide
   führen dieselben 64 Codes; das Backend bleibt die prüfende Instanz (es weist eine ungültige
   Adresse unabhängig von dieser Datei ab). Hier stehen zusätzlich die Anzeigenamen — die
   braucht nur die Oberfläche, gesendet wird ausschließlich der zweistellige Code.

   Zwei Kollisionen, bewusst behandelt: `DE` ist Delaware UND Deutschlands Ländercode, `NL` ist
   Newfoundland UND der der Niederlande. Deshalb wird immer gegen die Liste des KONKRETEN
   Landes geprüft, nie gegen die Gesamtmenge, und Länder- und Bundesstaatlisten bleiben
   getrennte Namensräume. */

export const US_STATES = Object.freeze([
  { code: "AL", name: "Alabama" },        { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },        { code: "AR", name: "Arkansas" },
  { code: "CA", name: "Kalifornien" },    { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },    { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },        { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },          { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },        { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },         { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },      { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },       { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },       { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },    { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },        { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },         { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },     { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },       { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },   { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },       { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },   { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },      { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },           { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },       { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
]);

export const CA_STATES = Object.freeze([
  { code: "AB", name: "Alberta" },              { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },             { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Neufundland und Labrador" }, { code: "NT", name: "Nordwest-Territorien" },
  { code: "NS", name: "Nova Scotia" },          { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },              { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Québec" },               { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
]);

const BY_COUNTRY = Object.freeze({ US: US_STATES, CA: CA_STATES });

const normLand = (c) => (typeof c === "string" ? c.trim().toUpperCase() : "");

/** Verlangt dieses Land einen Bundesstaat? Nur dann erscheint das Feld überhaupt. */
export function requiresState(country) {
  return Object.prototype.hasOwnProperty.call(BY_COUNTRY, normLand(country));
}

/** Auswahlliste für ein Land — leeres Array für Länder ohne Bundesstaatpflicht. */
export function statesForCountry(country) {
  return BY_COUNTRY[normLand(country)] || [];
}

/** Gültiger Code für dieses Land, sonst "" — es wird nichts geraten und nichts übersetzt. */
export function normalizeStateCode(country, value) {
  const liste = BY_COUNTRY[normLand(country)];
  if (!liste) return "";
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  return liste.some((s) => s.code === v) ? v : "";
}

/** Fehlertext für das Feld, oder "" wenn in Ordnung. Dieselbe Regel wie serverseitig:
 *  Pflicht nur bei US/CA, und dort nur ein belegter Code. */
export function stateFieldError(country, value) {
  if (!requiresState(country)) return "";
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return "Bundesstaat ist für dieses Land erforderlich";
  return normalizeStateCode(country, v) ? "" : "Bitte einen gültigen Bundesstaat wählen";
}
