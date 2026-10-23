// ─── Ergebnisfilter der Angebotsliste — reine Auswertung ─────────────────────
//
// „Ergebnisfilter" sind die rein clientseitigen Filter, die die BEREITS
// berechnete Tarifliste verkleinern, ohne die Buchungsgrundlage zu berühren:
// Maximalpreis und späteste Lieferzeit. Sie lösen keinen `/calculate-price`
// aus (siehe FILTER_ONLY_FIELDS in NewShipmentPage/CalculatorPage).
//
// WARUM ES DIESES MODUL GIBT. `OffersList` zählte als aktiven Filter
// ausschließlich `maxPrice`. Die späteste Lieferzeit filterte aber mit — und
// zwar wirksam: gemessen an einer echten Antwort reduzierte
// `latestDeliveryDate = "2026-08-31"` 41 Tarife auf 21, während die
// Überschrift unverändert „41 Angebote gefunden" meldete, kein Filterchip
// erschien und der Zurücksetzen-Knopf ausgeblendet blieb. Für den Kunden sah
// das aus wie fehlende Angebote. Die Zählung und die Fallunterscheidung des
// Leerzustands liegen deshalb hier — an EINER Stelle, prüfbar, ohne React.
//
// Seit der Uhrzeit-Erweiterung liegt auch die Filterregel selbst hier:
// `applyResultFilters` ist die EINZIGE Fassung und wird von beiden Seiten
// importiert. Vorher stand sie dreimal im Repository — zweimal produktiv
// (NewShipmentPage, CalculatorPage) und einmal als Testspiegel —, und ein
// Governance-Test verglich die drei Fassungen Zeichen für Zeichen gegeneinander.
// Das hat Drift zuverlässig gemeldet, aber nicht verhindert. Mit einer Uhrzeit
// als zweiter Dimension wäre die Regel spürbar länger geworden; drei Kopien
// einer längeren Regel sind kein Zustand, den ein Textvergleich noch trägt.
// Der Governance-Test prüft jetzt die stärkere Aussage: die Seiten enthalten
// GAR KEINE eigene Regel mehr.

import { normalizeDeliveryTime } from "./deliveryTimeView.mjs";
import { readDeliveryProjection } from "./deliveryProjectionView.mjs";

// „YYYY-MM-DD" → „DD.MM.YYYY". Eigene, string-basierte Fassung statt eines
// Imports aus utils/date.js: dieses Modul soll ohne Browser-/Zeitzonenbezug
// testbar bleiben. Kein Parsen, kein Date-Objekt, keine Zeitzone.
function tagDE(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("T")[0].split("-");
  if (!y || !m || !d) return "";
  return `${d}.${m}.${y}`;
}

/** Anzahl aktiver Ergebnisfilter. Leerer String / null / undefined zählen nicht.
 *  Wer einen weiteren Ergebnisfilter einführt, ergänzt ihn HIER — und in
 *  FILTER_ONLY_FIELDS der beiden Seiten. */
export function activeResultFilterCount({ maxPrice, latestDeliveryDate } = {}) {
  return [maxPrice, latestDeliveryDate].filter(Boolean).length;
}

/** true, sobald mindestens ein Ergebnisfilter greift. Steuert Überschrift
 *  („x von y") UND die Sichtbarkeit des Zurücksetzen-Knopfs. */
export function hasActiveResultFilter(filters) {
  return activeResultFilterCount(filters) > 0;
}

/** Beschriftung des Lieferzeit-Chips. Ohne gesetztes Datum bleibt der Chip ein
 *  neutraler Öffner („Lieferung"), mit Datum benennt er die Wirkung vollständig
 *  — der Kunde soll beim Lesen der Ergebnisse nie raten müssen, ob ein
 *  Lieferzeitfilter gesetzt ist. */
export function deliveryChipLabel(latestDeliveryDate, latestDeliveryTime) {
  if (!latestDeliveryDate) return "Lieferung";
  const zeit = normalizeDeliveryTime(latestDeliveryTime);
  // Bewusst ohne „Uhr" — der Chip steht in einer waagerecht scrollenden Leiste
  // und soll kompakt bleiben. Auf der Tarifkarte steht weiterhin die volle
  // Form („bis 12:00 Uhr"), dort ist Platz und dort ist es ein Satz.
  return zeit
    ? `Lieferung bis ${tagDE(latestDeliveryDate)}, ${zeit}`
    : `Lieferung bis ${tagDE(latestDeliveryDate)}`;
}

/** Beschriftung der Ergebnisüberschrift. Genannt wird ausschließlich die Zahl
 *  der TATSÄCHLICH sichtbaren Angebote — nicht mehr „x von y … angezeigt".
 *
 *  Grund: die frühere Fassung erklärte den Filterzustand ein zweites Mal. Seit
 *  der Lieferzeitfilter einen eigenen, dauerhaft sichtbaren Chip an derselben
 *  Leiste hat („Lieferung bis 31.08.2026"), ist der Bezug auf die Gesamtzahl
 *  redundant: der Chip sagt bereits, DASS gefiltert wird, und der Knopf
 *  „Zurücksetzen" daneben, wie man es rückgängig macht. Die Überschrift
 *  beantwortet dafür die eine Frage, die der Kunde beim Scannen der Liste
 *  wirklich hat — wie viele Angebote stehen hier.
 *
 *  Der Singular ist ein eigener Zweig, kein angehängtes „e": „1 Angebot". */
export function offersCountLabel(visibleCount) {
  const n = Number.isFinite(visibleCount) ? visibleCount : 0;
  return n === 1 ? "1 Angebot" : `${n} Angebote`;
}

/** Hinweistext, wenn ALLE Tarife weggefiltert wurden. Drei unterscheidbare
 *  Fälle, weil die Handlungsanweisung je Fall eine andere ist — vorher stand
 *  dort unabhängig vom gesetzten Filter „Erhöhen Sie das Preislimit", was bei
 *  gesetzter Lieferzeit ins Leere führte. Der vierte Zweig ist über die
 *  Oberfläche unerreichbar (ohne Filter ist `filtered === tariffs`) und
 *  existiert nur, damit hier nie eine leere Fläche entsteht. */
export function emptyFilterHint({ maxPrice, latestDeliveryDate, latestDeliveryTime } = {}) {
  if (maxPrice && latestDeliveryDate) return "Keine Angebote entsprechen den aktuell gesetzten Filtern.";
  if (latestDeliveryDate) {
    const zeit = normalizeDeliveryTime(latestDeliveryTime);
    // Mit Uhrzeit nennt der Satz beides — ohne sie bliebe unklar, woran es lag.
    // Kein „garantiert": die Aussage ist, dass kein Tarif diese Zeit ANGIBT.
    if (zeit) {
      return `Kein Angebot stellt bis zum ${tagDE(latestDeliveryDate)} um ${zeit} zu. `
           + "Wählen Sie eine spätere Uhrzeit oder entfernen Sie den Filter.";
    }
    return `Kein Tarif stellt bis zum ${tagDE(latestDeliveryDate)} zu. `
         + "Wählen Sie eine spätere Lieferzeit oder entfernen Sie den Filter.";
  }
  if (maxPrice) return "Alle Tarife liegen über Ihrem Preislimit. Erhöhen Sie das Limit oder entfernen Sie den Filter.";
  return "Für diese Anfrage sind derzeit keine Angebote verfügbar.";
}

// ─── LIEFERFRIST: VIER AUSGÄNGE (TG-L2, Betreiberentscheidung 2026-10-23) ───
// Bis TG-L2 (Betreiberentscheidung K2, 2026-10-02) bewertete die Frist
// AUSSCHLIESSLICH Zustelldaten des Anbieters; jedes Angebot ohne sie war „nicht
// bewertbar" — praktisch jedes Transglobal-Angebot. Seit TG-L1 rechnet der
// Server für alle Transglobal-Launchprodukte eine Prognose (`deliveryProjection`,
// mit belegter Uhrzeit nur bei den Zeitprodukten). Sie zählt jetzt — aber als
// eigene, ehrlich benannte Stufe, nie als Anbieterzusage:
//
//   "met"             A  Zustelldaten des Anbieters halten die Frist ein   → „Passend"
//   "projected"       B  die Prognose des Servers hält die Frist ein        → „Voraussichtlich passend"
//   "not_assessable"  C  keine sicher vergleichbare Angabe                  → „Frist nicht bestätigt"
//   "too_late"        D  nach den verfügbaren Daten nach der Frist          → „Zu spät" (eingeklappt)
//
// Es wird kein Termin geschätzt, kein Tag gezählt und keine Uhrzeit aus einem
// Tarifnamen gelesen: verglichen werden ausschließlich die Felder, die der
// Server liefert. Anbieterdaten haben Vorrang (der Server setzt nie beides).
// Ein Zeitraum, der über die Frist hinausreicht, ist für beide Quellen gleich
// „zu spät" — seine späteste Zustellung liegt danach; ein nach oben offenes
// Fenster („1+") mit frühestem Tag in der Frist ist nicht bestätigt.
//
// Den früheren Kartenhinweis „Zustelltermin nicht bewertbar" ersetzt die
// Gruppe „Frist nicht bestätigt" mit Kopf und Satz (`DEADLINE_GROUP_TEXT`).
export const DELIVERY_DEADLINE = Object.freeze({
  MET: "met",
  PROJECTED: "projected",
  NOT_ASSESSABLE: "not_assessable",
  TOO_LATE: "too_late",
});

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/* Ein Zustelltag (und die Uhrzeit an ihm, "" ohne) gegen die Frist (Tag, Uhrzeit oder "").
   `passend` ist der Ausgang einer eingehaltenen Frist — A für Anbieterdaten, B für die Prognose.
     Tag vor der Frist                    → passend (die Uhrzeit braucht es dafür nicht)
     Tag nach der Frist                   → zu spät
     am Fristtag ohne Fristuhrzeit        → passend
     am Fristtag, Fristuhrzeit, keine Zeit → nicht bestätigt (es wird keine Zeit unterstellt)
     am Fristtag, Zeit ≤ Fristuhrzeit     → passend, sonst zu spät
   Beide Werte sind fest formatiert ("YYYY-MM-DD" bzw. "HH:MM", nullgepolstert) — der lexikografische Vergleich
   ist hier zugleich der chronologische. */
function gegenFrist(tag, zeit, fristTag, fristZeit, passend) {
  if (tag < fristTag) return passend;
  if (tag > fristTag) return DELIVERY_DEADLINE.TOO_LATE;
  if (!fristZeit) return passend;
  if (!zeit) return DELIVERY_DEADLINE.NOT_ASSESSABLE;
  return zeit <= fristZeit ? passend : DELIVERY_DEADLINE.TOO_LATE;
}

/** Bewertet EIN Angebot gegen den gesetzten Lieferzeitfilter:
 *
 *  - `null`             kein Lieferzeitfilter gesetzt — nichts zu bewerten
 *  - `"met"`            die Zustelldaten des Anbieters halten die Frist ein (A)
 *  - `"projected"`      die Prognose des Servers hält die Frist ein (B)
 *  - `"not_assessable"` keine sicher vergleichbare Angabe (C)
 *  - `"too_late"`       nach den verfügbaren Daten nach der Frist (D)
 *
 *  Anbieterdaten: der späteste Zustelltag (`deliveryDateMax`, ersatzweise
 *  `deliveryDate`) mit `deliveryTimeUntil` — die Regel von Block B unverändert.
 *  Ein Liefertag in anderer Form ist keine vergleichbare Zusage (C).
 *
 *  Prognose (nur ohne Anbieterdaten): frühester Tag nach der Frist → D; nach
 *  oben offen („1+") → C; sonst der späteste Tag mit der belegten Uhrzeit
 *  (`timeUntil`, nur an einem einzelnen Tag) nach derselben Regel → B oder D,
 *  am Fristtag mit Fristuhrzeit ohne Uhrzeit → C. Weder Anbieterdaten noch
 *  Prognose → C. */
export function deliveryDeadlineAssessment(tariff, { latestDeliveryDate, latestDeliveryTime } = {}) {
  if (!latestDeliveryDate) return null;
  const fristZeit = normalizeDeliveryTime(latestDeliveryTime);
  const dd = tariff?.deliveryDateMax || tariff?.deliveryDate;
  if (dd) {
    const tag = String(dd).split("T")[0];
    if (!ISO_TAG.test(tag)) return DELIVERY_DEADLINE.NOT_ASSESSABLE;
    return gegenFrist(tag, normalizeDeliveryTime(tariff?.deliveryTimeUntil), latestDeliveryDate, fristZeit,
      DELIVERY_DEADLINE.MET);
  }
  const prognose = readDeliveryProjection(tariff);
  if (!prognose) return DELIVERY_DEADLINE.NOT_ASSESSABLE;
  if (prognose.dateMin > latestDeliveryDate) return DELIVERY_DEADLINE.TOO_LATE;
  if (prognose.dateMax === null) return DELIVERY_DEADLINE.NOT_ASSESSABLE;
  return gegenFrist(prognose.dateMax, normalizeDeliveryTime(prognose.timeUntil), latestDeliveryDate, fristZeit,
    DELIVERY_DEADLINE.PROJECTED);
}

// Die Preisgrenze — eine Regel für die sichtbare Liste UND die eingeklappte Gruppe „Zu spät".
const imPreis = (t, maxPrice) => !maxPrice || (t.netPrice != null && t.netPrice <= Number(maxPrice));

/** DIE Ergebnisfilter-Regel — von NewShipmentPage UND CalculatorPage
 *  importiert, nicht kopiert. Rein: kein React, kein Date-Objekt, keine
 *  Zeitzone, keine Mutation der Eingabe.
 *
 *  Der Lieferzeitfilter entfernt ausschließlich die zu späten Angebote (D,
 *  `deliveryDeadlineAssessment` oben) aus der sichtbaren Liste — sie stehen
 *  eingeklappt in einer eigenen Gruppe (`lateResultOffers`). A, B und C bleiben
 *  stehen, unverändert und ohne Zusatzfeld; die Gruppen bildet die Liste beim
 *  Anzeigen aus demselben Ergebnis (`deliveryDeadlineGroups`). */
export function applyResultFilters(tariffs, { maxPrice, latestDeliveryDate, latestDeliveryTime } = {}) {
  let f = [...tariffs];
  if (maxPrice) f = f.filter(t => imPreis(t, maxPrice));
  if (latestDeliveryDate) {
    f = f.filter(t => deliveryDeadlineAssessment(t, { latestDeliveryDate, latestDeliveryTime }) !== DELIVERY_DEADLINE.TOO_LATE);
  }
  return f;
}

/** Die zu späten Angebote (D) innerhalb der Preisgrenze — die eingeklappte
 *  Gruppe „Zu spät". Ohne Lieferzeitfilter leer. Reihenfolge der Eingabe. */
export function lateResultOffers(tariffs, { maxPrice, latestDeliveryDate, latestDeliveryTime } = {}) {
  if (!latestDeliveryDate) return [];
  return (Array.isArray(tariffs) ? tariffs : []).filter(t => imPreis(t, maxPrice)
    && deliveryDeadlineAssessment(t, { latestDeliveryDate, latestDeliveryTime }) === DELIVERY_DEADLINE.TOO_LATE);
}

/** Die sichtbare Liste in den Fristgruppen — oder `null` ohne Lieferzeitfilter
 *  (dann bleibt die Liste ungegliedert). Die Reihenfolge innerhalb jeder Gruppe
 *  ist die der Eingabe, also die gewählte Sortierung. Zu späte Angebote (die
 *  `applyResultFilters` bereits entfernt hat) erscheinen hier nicht. */
export function deliveryDeadlineGroups(visible, filters = {}) {
  if (!filters.latestDeliveryDate) return null;
  const groups = { confirmed: [], projected: [], unconfirmed: [] };
  for (const t of Array.isArray(visible) ? visible : []) {
    const a = deliveryDeadlineAssessment(t, filters);
    if (a === DELIVERY_DEADLINE.MET) groups.confirmed.push(t);
    else if (a === DELIVERY_DEADLINE.PROJECTED) groups.projected.push(t);
    else if (a === DELIVERY_DEADLINE.NOT_ASSESSABLE) groups.unconfirmed.push(t);
  }
  return groups;
}

/** Kopf und Satz der Fristgruppen. Kein „garantiert", keine Quelle, kein Anbietername. */
export const DEADLINE_GROUP_TEXT = Object.freeze({
  confirmed: Object.freeze({
    title: "Passend",
    sub: "Die Zustelldaten des Versanddienstleisters liegen in Ihrer Frist.",
  }),
  projected: Object.freeze({
    title: "Voraussichtlich passend",
    sub: "Aus Versandtag und Laufzeit berechnet: Die Zustellung liegt voraussichtlich in Ihrer Frist.",
  }),
  unconfirmed: Object.freeze({
    title: "Frist nicht bestätigt",
    sub: "Für diese Angebote reichen die Zeitangaben nicht aus, um Ihre Frist zu bewerten.",
  }),
  late: Object.freeze({
    title: "Zu spät",
    sub: "Nach den verfügbaren Daten stellen diese Angebote nach Ihrer Frist zu.",
  }),
  noneFitting: "Kein Angebot hält Ihre Frist nach den verfügbaren Daten ein.",
});

/** Beschriftung des Aufklappers der Gruppe „Zu spät". */
export function lateGroupToggleLabel(count, open) {
  if (open) return "Zu späte Angebote ausblenden";
  const n = Number.isFinite(count) ? count : 0;
  return n === 1
    ? "1 Angebot stellt nach Ihrer Frist zu – anzeigen"
    : `${n} Angebote stellen nach Ihrer Frist zu – anzeigen`;
}
