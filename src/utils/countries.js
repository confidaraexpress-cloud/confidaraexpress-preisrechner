// Länderliste für ALLE Auswahlfelder (Absender/Empfänger, Profil, Adressbuch,
// Zoll, Registrierung) — einzige Quelle der Wahrheit. Die Einträge werden beim
// Export vollständig alphabetisch nach dem deutschen Anzeigenamen sortiert
// (localeCompare "de" → korrekte Umlaut-/ß-Einordnung). ISO-Codes bleiben
// unverändert; nur die Anzeigereihenfolge ändert sich (kein Backend-/Payload-
// Einfluss). Alle Konsumenten greifen ausschließlich über .find(c => c.code === …)
// bzw. .map(...) zu — keine Positions-/Index-Abhängigkeit.
const COUNTRY_LIST = [
  { code: "DE", name: "Deutschland" },
  { code: "AT", name: "Österreich" },
  { code: "CH", name: "Schweiz" },
  { code: "AL", name: "Albanien" },
  { code: "BE", name: "Belgien" },
  { code: "BA", name: "Bosnien und Herzegowina" },
  { code: "BG", name: "Bulgarien" },
  { code: "DK", name: "Dänemark" },
  { code: "EE", name: "Estland" },
  { code: "FI", name: "Finnland" },
  { code: "FR", name: "Frankreich" },
  { code: "GR", name: "Griechenland" },
  { code: "GB", name: "Großbritannien" },
  { code: "IE", name: "Irland" },
  { code: "IS", name: "Island" },
  { code: "IT", name: "Italien" },
  { code: "XK", name: "Kosovo" },
  { code: "HR", name: "Kroatien" },
  { code: "LV", name: "Lettland" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Litauen" },
  { code: "LU", name: "Luxemburg" },
  { code: "MT", name: "Malta" },
  { code: "MD", name: "Moldau" },
  { code: "ME", name: "Montenegro" },
  { code: "NL", name: "Niederlande" },
  { code: "MK", name: "Nordmazedonien" },
  { code: "NO", name: "Norwegen" },
  { code: "PL", name: "Polen" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Rumänien" },
  { code: "RU", name: "Russland" },
  { code: "SE", name: "Schweden" },
  { code: "RS", name: "Serbien" },
  { code: "SK", name: "Slowakei" },
  { code: "SI", name: "Slowenien" },
  { code: "ES", name: "Spanien" },
  { code: "CZ", name: "Tschechien" },
  { code: "TR", name: "Türkei" },
  { code: "UA", name: "Ukraine" },
  { code: "HU", name: "Ungarn" },
  { code: "BY", name: "Weißrussland" },
  { code: "CY", name: "Zypern" },
  { code: "AR", name: "Argentinien" },
  { code: "BR", name: "Brasilien" },
  { code: "CL", name: "Chile" },
  { code: "CA", name: "Kanada" },
  { code: "CO", name: "Kolumbien" },
  { code: "MX", name: "Mexiko" },
  { code: "US", name: "USA" },
  { code: "AE", name: "Arabische Emirate" },
  { code: "AU", name: "Australien" },
  { code: "CN", name: "China" },
  { code: "IN", name: "Indien" },
  { code: "ID", name: "Indonesien" },
  { code: "IL", name: "Israel" },
  { code: "JP", name: "Japan" },
  { code: "KZ", name: "Kasachstan" },
  { code: "MY", name: "Malaysia" },
  { code: "NZ", name: "Neuseeland" },
  { code: "PH", name: "Philippinen" },
  { code: "SA", name: "Saudi-Arabien" },
  { code: "SG", name: "Singapur" },
  { code: "KR", name: "Südkorea" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "HK", name: "Hongkong" },
  { code: "DZ", name: "Algerien" },
  { code: "EG", name: "Ägypten" },
  { code: "KE", name: "Kenia" },
  { code: "MA", name: "Marokko" },
  { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "Südafrika" },
];

// Vollständig alphabetisch nach deutschem Anzeigenamen. localeCompare("de")
// ordnet Umlaute/ß korrekt ein (ä~a, ö~o, ü~u, ß~ss). Kopie via Spread — die
// Quell-Liste bleibt unmutiert.
export const countries = [...COUNTRY_LIST].sort((a, b) => a.name.localeCompare(b.name, "de"));

// ── Ein Auswahlfeld darf nie einen Wert tragen, den es nicht darstellen kann ──
// Ein `<select>` mit einem `value`, das in keiner `<option>` vorkommt, zeigt gar
// keine Auswahl an — die Oberfläche behauptet dann etwas anderes, als im State
// steht. Genau das passierte mit Profilen, deren `users.country` kein ISO-2-Code
// ist: das Feld sah unauffällig aus, während der Zustand „DEU" trug, und jeder
// Formularentwurf dieses Kontos scheiterte am Server (400 auf sender.country) —
// ebenso jede Buchung (routes/jumingo.js validateAddress verlangt ISO-2).
//
// `users.country` ist VARCHAR(10) ohne CHECK; ein solcher Wert konnte also
// tatsächlich entstehen. Diese Funktion ist die Grenze davor: sie nimmt einen
// beliebigen gespeicherten Wert entgegen und liefert einen, den die Liste kennt.
//
// Sie RÄT NICHT: „DEU" wird nicht zu „DE" gemacht (das wäre eine erfundene
// Länderzuordnung). Was die Liste nicht kennt, fällt auf den Ausgangswert
// zurück — denselben, den ein Konto ganz ohne Land ohnehin bekommt. Der
// gespeicherte Profilwert bleibt dabei unberührt und ist in den
// Kontoeinstellungen weiterhin sicht- und korrigierbar.
export function normalizeCountryCode(value, fallback = "DE") {
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!v) return fallback;
  return countries.some((c) => c.code === v) ? v : fallback;
}
