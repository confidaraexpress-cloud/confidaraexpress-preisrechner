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
 *  Bewusst dieselbe Form für frühe und für Tagesendzeiten: die NORMALE
 *  Lieferzeile der Timeline zeigt beide identisch und neutral. Unterschieden
 *  wird ausschließlich über das zusätzliche Hinweisfeld (siehe
 *  `earlyDeliveryNote`) — nicht über eine eingefärbte Stelle mitten in der
 *  Datumszeile. Genau diese Inline-Färbung hat im Livebild nicht getragen: sie
 *  presste Datum und Uhrzeit in eine Zeile und markierte einen Teil davon
 *  farbig, statt die Sonderinformation als eigene Aussage zu zeigen. */
export function deliveryTimeLabel(tariff) {
  const s = normalizeDeliveryTime(tariff?.deliveryTimeUntil);
  return s ? `bis ${s} Uhr` : "";
}

/** Die in den geladenen Tarifen TATSÄCHLICH vorkommenden Zustellzeiten —
 *  dedupliziert, aufsteigend sortiert, Tarife ohne verwertbare Zeit übergangen.
 *
 *  Das ist der reale Anteil der Auswahlliste. Ohne Tarife ist er leer; es wird
 *  hier nichts ergänzt und nichts geraten. Die Liste, die das Auswahlfeld
 *  wirklich anbietet, entsteht in `deliveryDeadlineOptions()`. */
export function deliveryTimeOptions(tariffs) {
  const menge = new Set();
  for (const t of Array.isArray(tariffs) ? tariffs : []) {
    const s = normalizeDeliveryTime(t?.deliveryTimeUntil);
    if (s) menge.add(s);
  }
  return [...menge].sort();
}

/** Allgemeines Fristenraster des Uhrzeitfilters.
 *
 *  DIESE ZEITEN SIND KEINE CARRIERZUSAGEN und behaupten nicht, dass irgendein
 *  Tarif zu ihnen zustellt. Sie sind Fristen des KUNDEN: „ich brauche das
 *  Paket bis …". Zulässig sind sie, weil der Filter `<=` vergleicht und nicht
 *  `=` (siehe `applyResultFilters` in `offersFilterView.mjs`) — die Frist
 *  16:00 hält jeder Tarif ein, der um 13:00 zustellt, auch wenn kein einziger
 *  Tarif exakt 16:00 trägt.
 *
 *  Genau daran hing der behobene Fehler: solange die Auswahl ausschließlich
 *  aus den geladenen Tarifen entstand, war sie VOR der ersten Preisberechnung
 *  zwangsläufig leer — das Feld stand bedienbar da und bot nur „Beliebig“ an.
 *  Der Kunde konnte seine Frist also erst benennen, nachdem er die Angebote
 *  schon gesehen hatte. Das kehrt die Reihenfolge um, die die Seite meint.
 *
 *  Die frühere Begründung gegen eine feste Liste („eine Option mit garantiert
 *  null Treffern behauptet eine Funktion, die es nicht gibt“) trifft auf einen
 *  GLEICHHEITSfilter zu, nicht auf einen Fristenfilter. Bleibt eine Frist ohne
 *  Treffer, sagt der bestehende Leerzustand das wahrheitsgemäß und nennt die
 *  wirksame Handlung (spätere Uhrzeit oder Filter entfernen).
 *
 *  Ganze Stunden, bewusst grob: das Raster ist eine Bedienhilfe, keine
 *  Nachbildung eines Produktkatalogs. Die feinen realen Werte (10:30, 17:00 …)
 *  kommen aus den Tarifen dazu, sobald es welche gibt. */
export const LIEFERFRIST_RASTER = Object.freeze([
  "08:00", "09:00", "10:00", "12:00", "13:00", "16:00", "18:00",
]);

/** Die Auswahlmöglichkeiten des Uhrzeitfilters: Fristenraster VEREINIGT mit den
 *  echten Tarifzeiten, dedupliziert und aufsteigend sortiert.
 *
 *  Zwei Eigenschaften, die beide gebraucht werden:
 *    • Ohne Tarife steht das Raster allein — die Frist ist vor der ersten
 *      Berechnung wählbar.
 *    • Das Raster bleibt AUCH NACH der Berechnung Teil der Menge. Nur dadurch
 *      überlebt eine vorab gewählte Frist die Ankunft der Tarife: das
 *      Auswahlfeld fällt auf „Beliebig“ zurück, sobald der gespeicherte Wert
 *      nicht mehr in seiner Optionsliste steht.
 *
 *  „HH:MM“ sortiert lexikografisch bereits chronologisch — es wird nichts
 *  geparst und keine Zeit umgerechnet. */
export function deliveryDeadlineOptions(tariffs) {
  const menge = new Set(LIEFERFRIST_RASTER);
  for (const s of deliveryTimeOptions(tariffs)) menge.add(s);
  return [...menge].sort();
}

/** Beschriftung EINER Uhrzeitoption der Auswahl: „10:30 Uhr“ — und „Beliebig“
 *  für den Leerwert. Reine Darstellung: der gespeicherte Wert bleibt "10:30"
 *  beziehungsweise "". „Uhr“ steht nie im Datenwert. */
export function deliveryTimeOptionLabel(zeit) {
  const s = normalizeDeliveryTime(zeit);
  return s ? `${s} Uhr` : "Beliebig";
}

/** Wert des Formularfelds „Späteste Lieferzeit“ — EIN Formatierer für beide
 *  Seiten, damit dort nicht zwei Textlogiken nebeneinander entstehen.
 *
 *  Der bereits formatierte Datumstext wird übergeben (die Seiten benutzen
 *  `fmtShortDE`, der Ergebnischip dagegen das kompakte Tagesformat) — hier wird
 *  ausschließlich die Uhrzeit angehängt, nie ein Datum formatiert:
 *
 *      ""                        → „Beliebig“
 *      „Mi., 26. Aug.“           → „Mi., 26. Aug.“
 *      „Mi., 26. Aug.“ + „10:30“ → „Mi., 26. Aug. · 10:30“
 *
 *  Ohne Datum ist auch eine gesetzte Uhrzeit bedeutungslos und wird nicht
 *  gezeigt — es gibt keinen Zustand „Uhrzeit ohne Datum“. */
export function latestDeliveryFieldValue(datumText, zeit) {
  const d = String(datumText ?? "").trim();
  if (!d) return "Beliebig";
  const z = normalizeDeliveryTime(zeit);
  return z ? `${d} · ${z}` : d;
}

/** Text des zusätzlichen Hinweisfelds für besonders frühe Zustellzeiten —
 *  „Lieferung bis 10:30 Uhr“ — oder "" für jeden anderen Tarif.
 *
 *  Es wird AUSSCHLIESSLICH der vorliegende Providerzeitwert wiedergegeben. Kein
 *  „garantiert“, kein „zugesichert“, kein „Express“: es gibt kein Feld, das
 *  eine Zustellzeit als zugesichert ausweist (`guaranteed_delivery_date` steht
 *  auf allen gemessenen Rohtarifen auf 0). Der Hinweis sagt, was der Tarif
 *  angibt — nicht, was jemand verspricht. */
export function earlyDeliveryNote(tariff) {
  if (!isEarlyDelivery(tariff)) return "";
  const zeit = deliveryTimeLabel(tariff);
  return zeit ? `Lieferung ${zeit}` : "";
}
