/* ── Minimale Access-Point-Fixture (DPD, Umkreis Plochingen) ─────────────────
   Quelle: eine echte, im Browser mitgeschnittene JUMiNGO-Antwort auf
   POST /app/carrier/access-points-search mit
   { carrierCodes: ["dpd"], countryCode: "DE", city: "Plochingen",
     postCode: "73207", street: "Weiherstraße 25", radius: 10, onlyOpen: false }.

   Übernommen sind AUSSCHLIESSLICH die sachlich notwendigen Anzeigefelder:
   name, address (street/postCode/city/countryCode), distance, distanceCode,
   workState, hoursOfOperation.

   BEWUSST NICHT übernommen: die HAR-Datei selbst, Cookies, Session- und
   Header-Werte, Tokens, JUMiNGO-Zugangsdaten, Koordinaten und die
   carrier-internen Access-Point-IDs. Nichts davon wird für eine einzige
   Zusicherung gebraucht — und nichts davon gehört in ein Repository.

   Ebenfalls bewusst NICHT ergänzt: Öffnungszeiten für Wochentage, die im
   Mitschnitt nicht belegt sind. Für AYDESIGNZ und K naro Supermarket lag
   nachweislich der Freitag vor — die übrigen Tage stehen hier deshalb nicht,
   auch wenn ein voller Wochenplan „vollständiger“ aussähe. Erfundene
   JUMiNGO-Daten sind in diesem Projekt ausgeschlossen; die Tests pinnen
   stattdessen die Uhr auf einen Freitag.

   Die drei Fälle decken genau das ab, worum es geht:
     • DPD-Paketstation — „Geöffnet“, rund um die Uhr, NÄCHSTER Shop (2,57 km),
       kommt in der JUMiNGO-Antwort aber NICHT zuerst
     • AYDESIGNZ       — „schließt bald“ (der Referenzfall: dieser Status darf
       weder verschwinden noch als „Geschlossen“ erscheinen)
     • K naro Supermarket — „schließt bald“, ENTFERNTESTER Shop (3,46 km), steht
       in der Antwort an erster Stelle → belegt, dass sortiert werden muss */

const ALLE_TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export const DPD_ACCESS_POINTS = [
  {
    name: "K naro Supermarket",
    street: "Kirchstr. 3",
    postCode: "73776",
    city: "Altbach",
    countryCode: "DE",
    distance: 3.462022,
    distanceCode: "km",
    workState: "schließt bald",
    hoursOfOperation: [
      { dayName: "Freitag", workingHours: "10:00-19:30", lunchBreak: null, workingDay: true },
    ],
  },
  {
    name: "DPD-Paketstation",
    street: "Kirchheimer Str. 93",
    postCode: "73249",
    city: "Wernau (Neckar)",
    countryCode: "DE",
    distance: 2.570787,
    distanceCode: "km",
    workState: "Geöffnet",
    hoursOfOperation: ALLE_TAGE.map((dayName) => ({
      dayName,
      workingHours: "00:01-23:59",
      lunchBreak: null,
      workingDay: true,
    })),
  },
  {
    name: "AYDESIGNZ",
    street: "Bahnhofstr. 16",
    postCode: "73262",
    city: "Reichenbach an der Fils",
    countryCode: "DE",
    distance: 2.957714,
    distanceCode: "km",
    workState: "schließt bald",
    hoursOfOperation: [
      { dayName: "Freitag", workingHours: "08:30-19:30", lunchBreak: null, workingDay: true },
    ],
  },
];

/** Die von JUMiNGO gelieferte Reihenfolge (unsortiert) — so kommt sie an. */
export const DPD_RESPONSE = { accessPoints: DPD_ACCESS_POINTS };

/** Die erwartete Reihenfolge nach Entfernung. */
export const DPD_EXPECTED_ORDER = ["DPD-Paketstation", "AYDESIGNZ", "K naro Supermarket"];

/** Ein Freitag — der Wochentag, für den der Mitschnitt Öffnungszeiten belegt. */
export const FREITAG = "2026-08-07T12:00:00+02:00";
