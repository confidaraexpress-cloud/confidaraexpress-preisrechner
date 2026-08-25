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
// Was hier bewusst NICHT liegt: die Filterregel selbst. Sie steht unverändert
// in den beiden Seiten (`filtered`, useMemo) und wurde nicht angefasst.
// `applyResultFilters` unten spiegelt sie ausschließlich für Tests; ein
// Governance-Test vergleicht beide Fassungen Zeichen für Zeichen, damit sie
// nicht auseinanderlaufen können.

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
export function deliveryChipLabel(latestDeliveryDate) {
  return latestDeliveryDate ? `Lieferung bis ${tagDE(latestDeliveryDate)}` : "Lieferung";
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
export function emptyFilterHint({ maxPrice, latestDeliveryDate } = {}) {
  if (maxPrice && latestDeliveryDate) return "Keine Angebote entsprechen den aktuell gesetzten Filtern.";
  if (latestDeliveryDate) {
    return `Kein Tarif stellt bis zum ${tagDE(latestDeliveryDate)} zu. `
         + "Wählen Sie eine spätere Lieferzeit oder entfernen Sie den Filter.";
  }
  if (maxPrice) return "Alle Tarife liegen über Ihrem Preislimit. Erhöhen Sie das Limit oder entfernen Sie den Filter.";
  return "Für diese Anfrage sind derzeit keine Angebote verfügbar.";
}

/** SPIEGEL der Filterregel aus NewShipmentPage/CalculatorPage — ausschließlich
 *  für Tests. Die produktive Regel steht unverändert in den beiden Seiten;
 *  `offersFilterView.test.mjs` vergleicht beide Fassungen und schlägt fehl,
 *  sobald eine der drei Stellen abweicht. Nicht in Produktivcode benutzen. */
export function applyResultFilters(tariffs, { maxPrice, latestDeliveryDate } = {}) {
  let f = [...tariffs];
  if (maxPrice) f = f.filter(t => t.netPrice != null && t.netPrice <= Number(maxPrice));
  if (latestDeliveryDate) f = f.filter(t => {
    const dd = t.deliveryDateMax || t.deliveryDate;
    if (!dd) return true;
    return String(dd).split("T")[0] <= latestDeliveryDate;
  });
  return f;
}
