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

// ─── LIEFERFRIST: DREI AUSGÄNGE (Betreiberentscheidung K2, 2026-10-02) ──────
// Ein Angebot wird gegen die späteste Lieferzeit AUSSCHLIESSLICH mit der
// Zusage des Anbieters bewertet: `deliveryDateMax` (ersatzweise
// `deliveryDate`) und `deliveryTimeUntil`. Fehlt eine Zusage, die sich sicher
// mit der Frist vergleichen lässt, ist das KEIN Ausschlussgrund: das Angebot
// bleibt sichtbar und trägt diesen neutralen Hinweis. Es wird kein Termin
// geschätzt, keine Uhrzeit aus einem Tarifnamen gelesen und keine CE-Rechnung
// zur Anbieterzusage gemacht. Nur ein nachweislich zu spätes Angebot fällt —
// wie bisher — heraus.
export const DELIVERY_NOT_ASSESSABLE_TEXT = "Zustelltermin nicht bewertbar";

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Bewertet EIN Angebot gegen den gesetzten Lieferzeitfilter:
 *
 *  - `null`             kein Lieferzeitfilter gesetzt — nichts zu bewerten
 *  - `"met"`            die Anbieterzusage hält die Frist nachweislich ein
 *  - `"too_late"`       die Anbieterzusage liegt nachweislich nach der Frist
 *  - `"not_assessable"` keine sicher vergleichbare Anbieterzusage
 *
 *  NUR Datum → der späteste Liefertag muss am Stichtag oder davor liegen.
 *  Datum UND Uhrzeit → Vergleich des PAARES (Tag, Uhrzeit): ein Tag davor
 *  hält die Frist ein, ein Tag danach nicht — die Uhrzeit braucht es dafür
 *  nicht. Am Stichtag selbst entscheidet die genannte Zeit: „bis 17:00"
 *  erfüllt „bis 12:00" nicht, es wird keine Zeit unterstellt, die der Anbieter
 *  nicht nennt. Nennt er am Stichtag GAR KEINE Zeit, ist die Frist nicht
 *  bewertbar — bis Block B fiel das Angebot hier heraus.
 *
 *  Beide Werte sind fest formatiert ("YYYY-MM-DD" bzw. "HH:MM", beide
 *  nullgepolstert), deshalb ist der lexikografische Vergleich hier zugleich
 *  der chronologische. `normalizeDeliveryTime` erzwingt die Polsterung; ein
 *  Liefertag in anderer Form ist keine vergleichbare Zusage. */
export function deliveryDeadlineAssessment(tariff, { latestDeliveryDate, latestDeliveryTime } = {}) {
  if (!latestDeliveryDate) return null;
  const dd = tariff?.deliveryDateMax || tariff?.deliveryDate;
  const tag = dd ? String(dd).split("T")[0] : "";
  if (!ISO_TAG.test(tag)) return "not_assessable";
  const grenzzeit = normalizeDeliveryTime(latestDeliveryTime);
  if (!grenzzeit) return tag <= latestDeliveryDate ? "met" : "too_late";
  if (tag < latestDeliveryDate) return "met";
  if (tag > latestDeliveryDate) return "too_late";
  const zeit = normalizeDeliveryTime(tariff?.deliveryTimeUntil);
  if (!zeit) return "not_assessable";
  return zeit <= grenzzeit ? "met" : "too_late";
}

/** true genau dann, wenn ein Lieferzeitfilter gesetzt ist UND das Angebot
 *  gegen ihn nicht bewertbar ist — die Karte zeigt dann den Hinweis. Ohne
 *  Filter nie. */
export function deliveryDeadlineNotAssessable(tariff, filters) {
  return deliveryDeadlineAssessment(tariff, filters) === "not_assessable";
}

/** DIE Ergebnisfilter-Regel — von NewShipmentPage UND CalculatorPage
 *  importiert, nicht kopiert. Rein: kein React, kein Date-Objekt, keine
 *  Zeitzone, keine Mutation der Eingabe.
 *
 *  Der Lieferzeitfilter entfernt ausschließlich nachweislich zu späte Angebote
 *  (`deliveryDeadlineAssessment` oben). Ein nicht bewertbares Angebot bleibt
 *  stehen — unverändert, ohne Zusatzfeld; den Hinweis bildet die Liste beim
 *  Anzeigen aus demselben Ergebnis. */
export function applyResultFilters(tariffs, { maxPrice, latestDeliveryDate, latestDeliveryTime } = {}) {
  let f = [...tariffs];
  if (maxPrice) f = f.filter(t => t.netPrice != null && t.netPrice <= Number(maxPrice));
  if (latestDeliveryDate) {
    f = f.filter(t => deliveryDeadlineAssessment(t, { latestDeliveryDate, latestDeliveryTime }) !== "too_late");
  }
  return f;
}
