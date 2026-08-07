/* ── Access-Point-Fixture (DPD, Umkreis Plochingen) — echte JUMiNGO-Antwort ──
   Quelle: ein im Browser mitgeschnittener Aufruf von JUMiNGOs Paketshopfinder,
   POST /app/carrier/access-points-search mit
   { carrierCodes: ["dpd"], countryCode: "DE", city: "Plochingen",
     postCode: "73207", street: "Weiherstraße 25", radius: 10,
     onlyOpen: false, filters: null }.

   Hier stehen ALLE 20 Access Points der Antwort, unverändert in den Werten,
   die die Oberfläche braucht. Verteilung: 10 × „Geschlossen“, 5 × „Geöffnet“,
   5 × „schließt bald“. Jeder Eintrag führt alle sieben Wochentage.

   BEWUSST NICHT übernommen: die HAR-Datei selbst, Cookies, Session- und
   Header-Werte, Tokens, JUMiNGO-Zugangsdaten, das Bundesland und die
   carrier-internen Access-Point-IDs. Nichts davon wird für eine einzige
   Zusicherung gebraucht — und nichts davon gehört in ein Repository.

   latitude/longitude sind seit der Kartenansicht DOCH übernommen (siehe
   KOORDINATEN unten): sie sind die Datengrundlage der Marker, ohne die sich
   weder fitBounds noch die Synchronisierung Liste ↔ Karte prüfen ließen.
   Es sind Standortdaten öffentlich auffindbarer Paketshops.

   Belegte Eigenschaften der Rohdaten, auf die sich Tests stützen:
     • distanceCode ist „KM“ (Großschreibung) — so kommt es wirklich an.
     • „Geschlossen“ in workingHours und workingDay: false treten IMMER
       gemeinsam auf (geprüft über alle 140 Tageseinträge).
     • type ist bei allen 20 Einträgen „Paketladen“ — es gibt also KEIN
       zusätzliches Eignungsmerkmal neben workState. Das Feld ist deshalb hier
       gar nicht erst übernommen.
     • Kein einziger Bereich läuft über Mitternacht; „00:01-23:59“ ist die
       Rund-um-die-Uhr-Schreibweise der beiden Paketstationen.
     • gaumenfreuden öffnet um exakt 07:30 — der reale Grenzfall für
       „Offen vor 7:30 Uhr“ (07:30 ist NICHT vor 07:30).
     • „NKD Deutschland GmbH“ kommt ZWEIMAL vor (2,66 km „Geschlossen“ und
       5,25 km „schließt bald“). Tests dürfen deshalb nicht über den Namen
       allein auf einen Eintrag schließen.
     • DIESE Antwort kommt bereits nach Entfernung sortiert an — eine frühere
       Aufzeichnung derselben Suche tat das NICHT. Auf die Reihenfolge der
       Antwort ist also kein Verlass; die eigene Sortierung bleibt nötig.

   Die Reihenfolge unten ist die echte Antwortreihenfolge.

   WICHTIG — workState ist reine Darstellung: Ein direkter 1:1-Vergleich mit
   JUMiNGOs eigener Oberfläche hat belegt, dass „Alle Öffnungszeiten“ dort
   dieselbe Menge zeigt wie diese Rohantwort — also ALLE 20, nicht nur die
   10 mit workState ungleich „Geschlossen“. Ein früherer Versuch, danach zu
   filtern, ist widerlegt und aus der Anwendung entfernt. Die zehn Einträge
   mit workState „Geschlossen“ (DPD_WORKSTATE_CLOSED unten) dienen deshalb
   jetzt umgekehrt dazu zu belegen, dass sie SICHTBAR bleiben. */

const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// Ein Shop kompakt: die sieben Tageswerte in Wochenreihenfolge, Mittagspausen
// nur dort, wo die Antwort welche führt. „Geschlossen“ heißt workingDay: false
// — genau so, wie JUMiNGO es liefert.
const shop = (name, street, postCode, city, distance, workState, stunden, pausen = {}) => ({
  name, street, postCode, city, countryCode: "DE",
  distance, distanceCode: "KM", workState,
  hoursOfOperation: WOCHENTAGE.map((dayName, i) => ({
    dayName,
    workingHours: stunden[i],
    lunchBreak: pausen[dayName] ?? null,
    workingDay: stunden[i] !== "Geschlossen",
  })),
});

/* Echte latitude/longitude derselben Antwort, in DERSELBEN Reihenfolge wie die
   Shopliste darunter. Sie stehen bewusst getrennt, damit die Shopzeilen lesbar
   bleiben; die Zuordnung ist rein positionell und wird unten mit einer harten
   Längenprüfung abgesichert (eine verrutschte Zeile fällt sofort auf, statt
   still falsche Marker zu setzen).

   Warum sie jetzt hier stehen, obwohl der Kopfkommentar sie früher ausdrücklich
   ausschloss: bis zur Kartenansicht brauchte sie keine einzige Zusicherung.
   Mit der Karte sind sie die Datengrundlage der Marker. Es sind Standortdaten
   öffentlich auffindbarer Paketshops — keine Zugangsdaten, keine IDs, keine
   personenbezogenen Daten. */
const KOORDINATEN = [
  [48.710737,     9.41599],      // Kopier und Werbestudio
  [48.7080891,    9.4332851],    // Intermarkt
  [48.68964,      9.42069],      // DPD-Paketstation
  [48.6888353978, 9.4204963019], // NKD Deutschland GmbH (2,66 km)
  [48.7090731,    9.4630051],    // Änderungsschneiderei Sadra
  [48.7082491,    9.4630131],    // AYDESIGNZ
  [48.7237751,    9.3792791],    // K naro Supermarket
  [48.7236292907, 9.3778584491], // Aral Tankstelle LD DPD-Paketstation
  [48.7150928,    9.3685339],    // Sonnenstudio Soleil
  [48.72584002,   9.36011002],   // ÄNDERUNGSSCHNEIDEREI AKARSU
  [48.72212002,   9.35599002],   // Uwe Teuke Metallblasinstrumentenbau
  [48.674293,     9.381716],     // NKD Deutschland GmbH (5,25 km)
  [48.6744475,    9.3813727],    // EMLUCK SchreibArt
  [48.6672661,    9.3925141],    // gaumenfreuden
  [48.7590531,    9.3770191],    // Ben's Schreibwaren & mehr
  [48.6740801,    9.3620151],    // AWG Travel-Shop
  [48.7327741,    9.332348],     // Kahraman´s Feinkost
  [48.6489421,    9.4463541],    // Media Markt im Nanz-Center
  [48.662515,     9.35832],      // Sandhu Indian Store
  [48.6488191,    9.4488231],    // Phone Touch
];

/** Alle 20 Access Points in der echten Antwortreihenfolge. */
const SHOPS_OHNE_KOORDINATEN = [
  shop("Kopier und Werbestudio", "Marktstr. 4-6", "73207", "Plochingen",
    0.5790258585077593, "Geschlossen",
    ["10:00-17:00", "10:00-17:00", "10:00-17:00", "10:00-17:00", "10:00-17:00", "10:00-14:00", "Geschlossen"]),
  shop("Intermarkt", "Käthe-Kollwitz-Weg 4", "73207", "Plochingen",
    0.8927151745547769, "Geschlossen",
    ["09:00-18:00", "09:00-13:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-14:00", "Geschlossen"],
    { Montag: "13:00-15:00", Mittwoch: "13:00-15:00", Donnerstag: "13:00-15:00", Freitag: "13:00-15:00" }),
  shop("DPD-Paketstation", "Kirchheimer Str. 93", "73249", "Wernau (Neckar)",
    2.5707870263878085, "Geöffnet",
    ["00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59"]),
  shop("NKD Deutschland GmbH", "Stadtplatz 5", "73249", "Wernau (Neckar)",
    2.661179477897706, "Geschlossen",
    ["09:00-18:30", "09:00-18:30", "09:00-18:30", "09:00-18:30", "09:00-18:30", "09:00-14:00", "Geschlossen"]),
  shop("Änderungsschneiderei Sadra", "Bahnhofstr. 3", "73262", "Reichenbach an der Fils",
    2.943239433933054, "Geschlossen",
    ["08:00-18:00", "08:00-18:00", "08:00-13:00", "08:00-18:00", "08:00-18:00", "08:00-13:00", "Geschlossen"],
    { Montag: "12:30-14:00", Dienstag: "12:30-14:00", Donnerstag: "12:30-14:00", Freitag: "12:30-14:00" }),
  shop("AYDESIGNZ", "Bahnhofstr. 16", "73262", "Reichenbach an der Fils",
    2.957714419291886, "schließt bald",
    ["10:00-19:30", "08:30-19:30", "08:30-19:30", "08:30-19:30", "08:30-19:30", "10:00-19:30", "Geschlossen"]),
  shop("K naro Supermarket", "Kirchstr. 3", "73776", "Altbach",
    3.4620229274003838, "schließt bald",
    ["10:00-19:30", "10:00-19:30", "10:00-19:30", "10:00-19:30", "10:00-19:30", "10:00-19:30", "Geschlossen"]),
  shop("Aral Tankstelle LD DPD-Paketstation", "Esslinger Str. 43", "73776", "Altbach",
    3.554076708644089, "Geöffnet",
    ["00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59", "00:01-23:59"]),
  shop("Sonnenstudio Soleil", "Herrenlandweg 6", "73779", "Deizisau",
    4.032304064753933, "Geöffnet",
    ["09:00-20:00", "09:00-20:00", "09:00-20:00", "09:00-20:00", "09:00-20:00", "09:00-18:00", "10:00-16:00"]),
  shop("ÄNDERUNGSSCHNEIDEREI AKARSU", "Bachstr. 21", "73730", "Esslingen am Neckar",
    4.867581039945602, "Geschlossen",
    ["09:00-16:30", "09:00-16:30", "09:00-16:30", "09:00-16:30", "09:00-16:30", "Geschlossen", "Geschlossen"]),
  shop("Uwe Teuke Metallblasinstrumentenbau", "Steinbeisstr. 14", "73730", "Esslingen am Neckar",
    5.054975227162982, "Geschlossen",
    ["10:00-18:00", "10:00-18:00", "Geschlossen", "10:00-18:00", "10:00-18:00", "10:00-13:30", "Geschlossen"],
    { Montag: "12:30-14:00", Dienstag: "12:30-14:00", Donnerstag: "12:30-14:00", Freitag: "12:30-14:00" }),
  shop("NKD Deutschland GmbH", "Unterboihinger Str. 7", "73240", "Wendlingen am Neckar",
    5.252688781308752, "schließt bald",
    ["09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-18:00", "Geschlossen"]),
  shop("EMLUCK SchreibArt", "Unterboihinger Str. 6", "73240", "Wendlingen am Neckar",
    5.253464536149363, "Geschlossen",
    ["09:00-18:00", "09:00-18:00", "09:00-13:00", "09:00-18:00", "09:00-18:00", "09:00-13:00", "Geschlossen"],
    { Montag: "12:30-14:00", Dienstag: "12:30-14:00", Donnerstag: "12:30-14:00", Freitag: "12:30-14:00" }),
  shop("gaumenfreuden", "Boßlerstr. 19", "73240", "Wendlingen am Neckar",
    5.537714521063243, "Geschlossen",
    ["07:30-16:30", "07:30-16:30", "07:30-16:30", "07:30-16:30", "07:30-16:30", "Geschlossen", "Geschlossen"]),
  shop("Ben's Schreibwaren & mehr", "Seestr. 2", "73773", "Aichwald",
    6.181529623621586, "Geschlossen",
    ["08:30-18:00", "08:30-12:30", "08:30-18:00", "08:30-12:30", "08:30-18:00", "08:00-12:30", "Geschlossen"],
    { Montag: "12:30-14:30", Mittwoch: "12:30-14:30", Freitag: "12:30-14:00" }),
  shop("AWG Travel-Shop", "Imanuel-Maier-Str. 3", "73257", "Köngen",
    6.224004616998647, "Geöffnet",
    ["09:00-20:00", "09:00-20:00", "09:00-20:00", "09:00-20:00", "09:00-20:00", "09:00-20:00", "Geschlossen"]),
  shop("Kahraman´s Feinkost", "Kreuzstr. 60", "73730", "Esslingen am Neckar",
    7.0449350955519225, "schließt bald",
    ["08:00-19:00", "08:00-19:00", "Geschlossen", "08:00-19:00", "08:00-19:00", "08:00-14:00", "Geschlossen"]),
  shop("Media Markt im Nanz-Center", "Stuttgarter Str. 1", "73230", "Kirchheim unter Teck",
    7.29345243594888, "schließt bald",
    ["10:00-19:00", "10:00-19:00", "10:00-19:00", "10:00-19:00", "10:00-19:00", "10:00-19:00", "Geschlossen"]),
  shop("Sandhu Indian Store", "Seerosenstr. 6", "72669", "Unterensingen",
    7.347188329519841, "Geschlossen",
    ["09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "Geschlossen"],
    { Montag: "13:30-14:30", Dienstag: "13:30-14:30", Mittwoch: "13:30-14:30", Donnerstag: "13:30-14:30", Freitag: "13:30-14:30", Samstag: "13:30-14:30" }),
  shop("Phone Touch", "Max-Eyth-Str. 10", "73230", "Kirchheim unter Teck",
    7.3509583063762065, "Geöffnet",
    ["09:30-20:00", "09:30-20:00", "09:30-20:00", "09:30-20:00", "09:30-20:00", "09:30-20:00", "Geschlossen"]),
];

// Positionelle Zuordnung Shop ↔ Koordinate. Die Längenprüfung ist Absicht:
// verrutscht eine Zeile, bricht der Import sofort — statt still die Marker
// einer Karte an die falschen Adressen zu setzen.
if (SHOPS_OHNE_KOORDINATEN.length !== KOORDINATEN.length) {
  throw new Error(
    `Fixture inkonsistent: ${SHOPS_OHNE_KOORDINATEN.length} Shops, ${KOORDINATEN.length} Koordinaten`,
  );
}

/** Alle 20 Access Points inklusive echter Koordinaten, echte Antwortreihenfolge. */
export const DPD_ACCESS_POINTS = SHOPS_OHNE_KOORDINATEN.map((s, i) => ({
  ...s,
  latitude: KOORDINATEN[i][0],
  longitude: KOORDINATEN[i][1],
}));

/** Die von JUMiNGO gelieferte Hülle — so kommt die Antwort an. */
export const DPD_RESPONSE = { accessPoints: DPD_ACCESS_POINTS };

/** Nach Entfernung sortiert — ALLE 20. Sortieren entfernt nichts. */
export const DPD_EXPECTED_SORTED = [
    "Kopier und Werbestudio",
    "Intermarkt",
    "DPD-Paketstation",
    "NKD Deutschland GmbH",
    "Änderungsschneiderei Sadra",
    "AYDESIGNZ",
    "K naro Supermarket",
    "Aral Tankstelle LD DPD-Paketstation",
    "Sonnenstudio Soleil",
    "ÄNDERUNGSSCHNEIDEREI AKARSU",
    "Uwe Teuke Metallblasinstrumentenbau",
    "NKD Deutschland GmbH",
    "EMLUCK SchreibArt",
    "gaumenfreuden",
    "Ben's Schreibwaren & mehr",
    "AWG Travel-Shop",
    "Kahraman´s Feinkost",
    "Media Markt im Nanz-Center",
    "Sandhu Indian Store",
    "Phone Touch",
];

/**
 * Die 10 Einträge mit workState „Geschlossen“ — durch den direkten JUMiNGO-
 * Vergleich belegt: sie bleiben bei „Alle Öffnungszeiten“ SICHTBAR (siehe
 * Kopfkommentar). Diese Liste dient Tests, die genau das nachweisen — nicht
 * dem Gegenteil.
 */
export const DPD_WORKSTATE_CLOSED = [
    "Kopier und Werbestudio",
    "Intermarkt",
    "NKD Deutschland GmbH",
    "Änderungsschneiderei Sadra",
    "ÄNDERUNGSSCHNEIDEREI AKARSU",
    "Uwe Teuke Metallblasinstrumentenbau",
    "EMLUCK SchreibArt",
    "gaumenfreuden",
    "Ben's Schreibwaren & mehr",
    "Sandhu Indian Store",
];

/** Öffnungszeitenfilter „Sonntags geöffnet“, angewendet auf die volle sortierte Liste. */
export const DPD_EXPECTED_SUNDAY = [
    "DPD-Paketstation",
    "Aral Tankstelle LD DPD-Paketstation",
    "Sonnenstudio Soleil",
];

/** „Offen vor 7:30 Uhr“ — nur die beiden Paketstationen (00:01). gaumenfreuden
 *  öffnet um exakt 07:30 und zählt deshalb nicht — unabhängig von workState. */
export const DPD_EXPECTED_BEFORE_0730 = [
    "DPD-Paketstation",
    "Aral Tankstelle LD DPD-Paketstation",
];

/** „Offen nach 21:00 Uhr“ — nur die beiden Paketstationen (23:59). */
export const DPD_EXPECTED_AFTER_2100 = [
    "DPD-Paketstation",
    "Aral Tankstelle LD DPD-Paketstation",
];

/** Ein Freitag — der Wochentag, für den Öffnungszeiten geprüft werden. */
export const FREITAG = "2026-08-07T12:00:00+02:00";
