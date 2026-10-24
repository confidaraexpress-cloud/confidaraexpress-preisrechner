/* Verteilung der Browser-E2E-Suiten auf CI-Teile nach gemessener Laufzeit.
 *
 * Verfahren: längste Suite zuerst, jeweils in den gerade leichtesten Teil (bei Gleichstand der Teil mit der
 * kleineren Nummer). Das ist deterministisch — jeder CI-Job berechnet aus denselben Eingaben dieselben Teile — und
 * hält den Unterschied zwischen schwerstem und leichtestem Teil unter der Dauer der längsten Suite.
 *
 * Eingaben:
 *   suiten      die AUFGEFUNDENEN Suiten (scripts/run-e2e.mjs) — nur sie werden verteilt, jede genau einmal
 *   laufzeiten  { "<dateiname>": sekunden } aus scripts/e2e-laufzeiten.json (gemessen in der CI)
 *   gesamt      Anzahl der Teile
 *
 * Eine Suite ohne Messwert (etwa eine neu angelegte) zählt mit dem Median der gemessenen Suiten. Sie läuft also
 * immer mit; nur ihr Platz in der Balance ist geschätzt, bis die Laufzeiten erneuert werden
 * (`node scripts/e2e-laufzeiten-aktualisieren.mjs <protokoll …>`).
 */

/** Schlüssel einer Suite in der Laufzeitdatei: der Dateiname, unabhängig vom Pfadtrenner des Systems. */
export function suitenSchluessel(datei) {
  return String(datei).replace(/\\/g, "/").split("/").pop();
}

export function gewichtung(laufzeiten) {
  const werte = Object.values(laufzeiten || {}).filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => a - b);
  const median = werte.length ? werte[Math.floor(werte.length / 2)] : 60;
  return (datei) => {
    const s = (laufzeiten || {})[suitenSchluessel(datei)];
    return Number.isFinite(s) && s > 0 ? s : median;
  };
}

/**
 * @returns {{teil: number, last: number, suiten: string[]}[]}  Teile 1…gesamt, Suiten je Teil alphabetisch
 */
export function verteileSuiten(suiten, laufzeiten, gesamt) {
  if (!Number.isInteger(gesamt) || gesamt < 1) throw new Error(`Teilanzahl ungültig: ${gesamt}`);
  const gewicht = gewichtung(laufzeiten);
  const teile = Array.from({ length: gesamt }, (_, i) => ({ teil: i + 1, last: 0, suiten: [] }));
  const reihenfolge = [...suiten].sort((a, b) =>
    gewicht(b) - gewicht(a) || (suitenSchluessel(a) < suitenSchluessel(b) ? -1 : suitenSchluessel(a) > suitenSchluessel(b) ? 1 : 0));
  for (const datei of reihenfolge) {
    let ziel = teile[0];
    for (const t of teile) if (t.last < ziel.last) ziel = t;
    ziel.suiten.push(datei);
    ziel.last += gewicht(datei);
  }
  for (const t of teile) t.suiten.sort();
  return teile;
}
