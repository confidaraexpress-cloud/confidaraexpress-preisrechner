// ─── Lieferzeit-Darstellung der Angebotsliste — reine Auswertung ──────────────
//
// QUELLE. Ausschließlich das bereits serverseitig normalisierte Feldpaar
// `deliveryTimeUntil` ("HH:MM", Ortszeit) und `deliveryTimeUntilMinutes`
// (Minuten seit Mitternacht, Ortszeit). Das JUMiNGO-Rohfeld
// `delivery_time_until` wird NICHT benutzt und darf es auch nicht: gemessen
// über 43 Rohtarife zweier unabhängiger Antworten liegt es AUSNAHMSLOS exakt
// 120 Minuten unter dem lokalen Wert (UTC). Der Tarif „EXPRESS 12:00“ trägt
// dort "10:00:00", während `deliveryTimeUntilMinutes` 720 (= 12:00) meldet —
// der Produktname belegt, dass 720 der richtige Wert ist. Wer „näher an die
// Quelle" ginge, zeigte systematisch zwei Stunden zu früh an. Es wird hier
// auch nichts umgerechnet: keine Zeitzone, kein Date-Objekt, kein Parsen von
// Zeitstempeln.
//
// KEINE ZUSAGE. Es gibt kein Feld, das eine Zustellzeit als garantiert
// ausweist: `guaranteed_delivery_date` steht auf allen gemessenen Rohtarifen
// auf 0, beide Badge-Textfelder sind durchgehend leer. Die Oberfläche nennt
// die Zeit deshalb ausschließlich als Tatsache („bis 12:00 Uhr“) und niemals
// als Zusicherung — kein „garantiert“, kein „zugesichert“, kein „fix“.
//
// KEIN shippingMode. Die Hervorhebung darf sich niemals an `shippingMode`
// aufhängen. Belegt: `FEDEX FIRST®` stellt bis 10:00 zu, wird vom
// serverseitigen Namens-Regex aber als `standard` eingestuft; umgekehrt ist
// `UPS EXPRESS SAVER ®` als `express` klassifiziert und trägt nur den
// Tagesendwert 17:00. Entschieden wird allein an der Uhrzeit.

/** Grenze, ab der eine Zustellzeit als „früh“ HERVORGEHOBEN wird: 900 Minuten
 *  = 15:00 Uhr.
 *
 *  Das ist eine UI-DARSTELLUNGSHEURISTIK und ausdrücklich KEINE
 *  Geschäftsregel, keine Carrierzusage und keine Filtergrenze — der
 *  Lieferzeitfilter kommt ohne sie aus. Abgeleitet aus der beobachteten
 *  Datenverteilung zweier vollständiger Antworten derselben Route: 19 von 41
 *  Tarifen tragen den generischen Tagesendwert (17:00/18:00), 22 tragen eine
 *  konkrete Produktzeit (08:00 – 13:00). Dazwischen liegt kein einziger
 *  gemessener Wert. Wer die Zahl ändert, ändert nur, was optisch betont wird —
 *  nie, welcher Tarif angeboten oder gefiltert wird. */
export const FRUEHZUSTELLUNG_GRENZE_MINUTEN = 900;

/** „HH:MM“ oder "" — nie etwas anderes. Akzeptiert zusätzlich eine einstellige
 *  Stunde ("9:00" → "09:00"), damit der lexikografische Vergleich des Filters
 *  nicht an einer ungepolsterten Antwort zerbricht; alle bisher gemessenen
 *  Werte kamen bereits fünfstellig. Alles Unparsbare ergibt "" — es wird nichts
 *  geraten und nichts ergänzt. */
export function normalizeDeliveryTime(value) {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Minuten seit Mitternacht aus einem Tarif — bevorzugt das gelieferte
 *  Zahlenfeld, ersatzweise aus "HH:MM" abgeleitet. `null`, wenn beides fehlt.
 *  0 (Mitternacht) ist ein GÜLTIGER Wert, deshalb `Number.isFinite` statt einer
 *  Falsy-Prüfung. */
export function deliveryTimeMinutes(tariff) {
  const roh = tariff?.deliveryTimeUntilMinutes;
  if (Number.isFinite(roh)) return roh;
  const s = normalizeDeliveryTime(tariff?.deliveryTimeUntil);
  if (!s) return null;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

/** true, wenn die Zustellzeit früh genug ist, um hervorgehoben zu werden.
 *  Liest ausschließlich die Uhrzeit — nie `shippingMode`, nie den Tarifnamen,
 *  nie das Wort „Express“. Ohne Zeitangabe: false (nichts wird behauptet). */
export function isEarlyDelivery(tariff) {
  const m = deliveryTimeMinutes(tariff);
  return m != null && m < FRUEHZUSTELLUNG_GRENZE_MINUTEN;
}

/** Sichtbarer Zeittext eines Tarifs: „bis 12:00 Uhr“ — oder "" ohne Angabe.
 *  Bewusst dieselbe Form für frühe und für Tagesendzeiten: unterschieden wird
 *  über die Gewichtung, nicht über den Wortlaut. */
export function deliveryTimeLabel(tariff) {
  const s = normalizeDeliveryTime(tariff?.deliveryTimeUntil);
  return s ? `bis ${s} Uhr` : "";
}

/** Auswahlmöglichkeiten des Uhrzeitfilters — abgeleitet aus den TATSÄCHLICH
 *  geladenen Tarifen, nie aus einer festen Liste.
 *
 *  Grund: eine hartcodierte Liste böte auf vielen Routen Uhrzeiten an, zu denen
 *  garantiert kein Tarif zustellt — eine Filteroption mit sicher null Treffern
 *  behauptet eine Funktion, die es nicht gibt. So hat jede angebotene Uhrzeit
 *  mindestens einen realen Tarifbezug. Dedupliziert und aufsteigend sortiert;
 *  Tarife ohne verwertbare Zeit werden übergangen. */
export function deliveryTimeOptions(tariffs) {
  const menge = new Set();
  for (const t of Array.isArray(tariffs) ? tariffs : []) {
    const s = normalizeDeliveryTime(t?.deliveryTimeUntil);
    if (s) menge.add(s);
  }
  return [...menge].sort();
}
