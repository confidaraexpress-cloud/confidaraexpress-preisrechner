/* ── Minimale Access-Point-Fixture (DPD, Umkreis Plochingen) ─────────────────
   Quelle: eine echte, im Browser mitgeschnittene JUMiNGO-Antwort auf
   POST /app/carrier/access-points-search mit
   { carrierCodes: ["dpd"], countryCode: "DE", city: "Plochingen",
     postCode: "73207", street: "Weiherstraße 25", radius: 10, onlyOpen: false }.

   Die vollständige Antwort führt 20 Access Points:
     10 × „Geschlossen“ · 5 × „Geöffnet“ · 5 × „schließt bald“
   JUMiNGOs eigene Oberfläche zeigt bei identischer Suche und „Alle
   Öffnungszeiten“ als erste Treffer DPD-Paketstation → AYDESIGNZ → K naro
   Supermarket — also NICHT die näheren Einträge Kopier und Werbestudio
   (0,579 km) und Intermarkt (0,893 km). Genau die „Geschlossen“-Einträge
   fehlen dort. Das ist der Beleg für die Eligibility-Stufe.

   Hier stehen die neun Einträge, die belegt sind — eine repräsentative
   Teilmenge mit allen drei workState-Werten. Die übrigen elf sind im
   Mitschnitt nicht namentlich dokumentiert und werden deshalb NICHT erfunden.

   Übernommen sind AUSSCHLIESSLICH die sachlich notwendigen Anzeigefelder:
   name, ggf. Adressteile, distance, distanceCode, workState, hoursOfOperation.

   BEWUSST NICHT übernommen: die HAR-Datei selbst, Cookies, Session- und
   Header-Werte, Tokens, JUMiNGO-Zugangsdaten, Koordinaten und die
   carrier-internen Access-Point-IDs. Nichts davon wird für eine einzige
   Zusicherung gebraucht — und nichts davon gehört in ein Repository.

   Ebenfalls bewusst NICHT ergänzt:
     • Öffnungszeiten für Wochentage, die nicht belegt sind. Für die Shops mit
       Tagesangabe lag nachweislich der Freitag vor; die Tests pinnen die Uhr
       entsprechend, statt einen Wochenplan zu erfinden.
     • Adressen der Einträge, für die nur Name, Entfernung und workState
       vorliegen. Ein Access Point ohne Adresse ist testbar — eine erfundene
       Adresse wäre es nicht.

   Zur Reihenfolge des Arrays: Dokumentiert ist nur, dass die Antwort NICHT
   nach Entfernung sortiert ankommt (im Mitschnitt stand K naro vor
   DPD-Paketstation vor AYDESIGNZ). Diese drei stehen deshalb in ihrer
   belegten relativen Reihenfolge; die übrigen sind bewusst dazwischen
   gestreut, damit die Sortierung testbar bleibt. Die Array-Reihenfolge ist
   eine Testeigenschaft, keine Aussage über JUMiNGO. */

const ALLE_TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const freitag = (workingHours) => [{ dayName: "Freitag", workingHours, lunchBreak: null, workingDay: true }];

// Die vier „Geschlossen“-Einträge lagen zur Messzeit (ca. 16:06) INNERHALB
// ihrer eigenen Öffnungszeiten — der Beweis, dass workState kein Uhrzeitstatus
// ist. Die Liste ist absichtlich weder nach Entfernung noch nach workState
// geordnet (siehe Kopfkommentar).
export const DPD_ACCESS_POINTS = [
  { name: "Kopier und Werbestudio", distance: 0.579, distanceCode: "km",
    workState: "Geschlossen", hoursOfOperation: freitag("10:00-17:00") },

  { name: "K naro Supermarket", street: "Kirchstr. 3", postCode: "73776", city: "Altbach",
    countryCode: "DE", distance: 3.462022, distanceCode: "km",
    workState: "schließt bald", hoursOfOperation: freitag("10:00-19:30") },

  { name: "NKD Deutschland GmbH", distance: 2.661, distanceCode: "km",
    workState: "Geschlossen", hoursOfOperation: freitag("09:00-18:30") },

  { name: "DPD-Paketstation", street: "Kirchheimer Str. 93", postCode: "73249",
    city: "Wernau (Neckar)", countryCode: "DE", distance: 2.570787, distanceCode: "km",
    workState: "Geöffnet",
    hoursOfOperation: ALLE_TAGE.map((dayName) => ({
      dayName, workingHours: "00:01-23:59", lunchBreak: null, workingDay: true,
    })) },

  { name: "Intermarkt", distance: 0.893, distanceCode: "km",
    workState: "Geschlossen", hoursOfOperation: freitag("09:00-18:00") },

  { name: "AYDESIGNZ", street: "Bahnhofstr. 16", postCode: "73262",
    city: "Reichenbach an der Fils", countryCode: "DE", distance: 2.957714, distanceCode: "km",
    workState: "schließt bald", hoursOfOperation: freitag("08:30-19:30") },

  { name: "Änderungsschneiderei Sadra", distance: 2.943, distanceCode: "km",
    workState: "Geschlossen", hoursOfOperation: freitag("08:00-18:00") },

  { name: "Aral Tankstelle LD DPD-Paketstation", distance: 3.554, distanceCode: "km",
    workState: "Geöffnet" },

  { name: "Sonnenstudio Soleil", distance: 4.032, distanceCode: "km",
    workState: "Geöffnet" },
];

/** Die von JUMiNGO gelieferte Hülle — so kommt die Antwort an. */
export const DPD_RESPONSE = { accessPoints: DPD_ACCESS_POINTS };

/**
 * Nach Entfernung sortiert — ALLE neun. Sortieren entfernt nichts, auch keinen
 * „Geschlossen“-Eintrag. Das ist die Zwischenstufe, nicht die Anzeige.
 */
export const DPD_EXPECTED_SORTED = [
  "Kopier und Werbestudio",        // 0.579  Geschlossen
  "Intermarkt",                    // 0.893  Geschlossen
  "DPD-Paketstation",              // 2.571  Geöffnet
  "NKD Deutschland GmbH",          // 2.661  Geschlossen
  "Änderungsschneiderei Sadra",    // 2.943  Geschlossen
  "AYDESIGNZ",                     // 2.958  schließt bald
  "K naro Supermarket",            // 3.462  schließt bald
  "Aral Tankstelle LD DPD-Paketstation", // 3.554 Geöffnet
  "Sonnenstudio Soleil",           // 4.032  Geöffnet
];

/**
 * Nach der Eligibility-Stufe — das ist die Liste, die JUMiNGOs Oberfläche
 * zeigt und die ConfidaraExpress anbieten muss.
 */
export const DPD_EXPECTED_USABLE = [
  "DPD-Paketstation",
  "AYDESIGNZ",
  "K naro Supermarket",
  "Aral Tankstelle LD DPD-Paketstation",
  "Sonnenstudio Soleil",
];

/** Die vier belegten Einträge, die JUMiNGO nicht zur Auswahl stellt. */
export const DPD_EXPECTED_UNAVAILABLE = [
  "Kopier und Werbestudio",
  "Intermarkt",
  "NKD Deutschland GmbH",
  "Änderungsschneiderei Sadra",
];

/** Ein Freitag — der Wochentag, für den der Mitschnitt Öffnungszeiten belegt. */
export const FREITAG = "2026-08-07T12:00:00+02:00";
