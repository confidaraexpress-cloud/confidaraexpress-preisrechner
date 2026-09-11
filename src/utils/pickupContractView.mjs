/* pickupContractView — der Abholtermin eines Angebots, providerneutral und in der jeweils
 * belegten Genauigkeit.
 *
 * Reine Funktionen: kein React, kein Netz, kein Datum, kein Zufall.
 *
 * ─── EINE STELLE FUER TIMELINE UND DETAILBEREICH ───────────────────────────────────
 * Die Angebotskarte zeigt den Abholtermin an zwei Orten: im Startknoten der Timeline und im
 * Abschnitt „Termin & Abholung" der Details. Bis hierher las die Timeline beide Datenformen,
 * der Detailbereich nur das Von/Bis-Fenster — ein Angebot mit „bereit ab"-Zeit zeigte oben
 * einen Termin und unten keinen. Beide lesen deshalb jetzt DIESEN Helfer.
 *
 * ─── ZWEI FORMEN, DIE NICHT DASSELBE SIND ──────────────────────────────────────────
 *   echtes Von/Bis-Fenster     „09:00–17:00 Uhr"      (beide Grenzen geliefert)
 *   nur eine „bereit ab"-Zeit  „bereit ab 09:00 Uhr"  (kein Endzeitfeld im Vertrag)
 *
 * Die zweite zu einem Fenster aufzurunden waere eine erfundene Zusage: aus „ab 9 Uhr" folgt
 * kein „bis 17 Uhr". Traegt ein Angebot beides, gewinnt das Fenster — es ist die praezisere
 * Angabe.
 *
 * ─── ES WIRD NICHT NACH DER EINKAUFSQUELLE GEFRAGT ──────────────────────────────────
 * Entschieden wird an den FELDERN, die das Angebot traegt. Fehlt eine Angabe, entsteht
 * keine Zeile — kein Platzhalter, kein Gedankenstrich.
 */

const text = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

/**
 * Der Abholvertrag eines Angebots in neutraler Form.
 *
 * @param   {object} tarif  ein Angebot der calculate-price-Antwort
 * @returns {{day: string|null, windowFrom: string|null, windowUntil: string|null, readyFrom: string|null}}
 */
export function pickupContractOf(tarif) {
  const t = tarif && typeof tarif === "object" ? tarif : {};
  const day = text(t.pickupDate) || text(t.collectionDate);
  const from = text(t.pickupTimeFrom);
  const until = text(t.pickupTimeUntil);
  const hasWindow = from !== null && until !== null;
  return Object.freeze({
    day,
    windowFrom: hasWindow ? from : null,
    windowUntil: hasWindow ? until : null,
    readyFrom: hasWindow ? null : text(t.collectionReadyFrom),
  });
}

/** Die kompakte Zeitzeile der Timeline — Fenster ODER „bereit ab", sonst `null`. */
export function pickupTimeText(vertrag) {
  const v = vertrag && typeof vertrag === "object" ? vertrag : {};
  if (v.windowFrom && v.windowUntil) return `${v.windowFrom}–${v.windowUntil} Uhr`;
  if (v.readyFrom) return `bereit ab ${v.readyFrom} Uhr`;
  return null;
}

/** Das Fenster in der Schreibweise des Detailbereichs — oder `null` ohne echtes Fenster. */
export function pickupWindowDetailText(vertrag) {
  const v = vertrag && typeof vertrag === "object" ? vertrag : {};
  return v.windowFrom && v.windowUntil ? `${v.windowFrom} – ${v.windowUntil} Uhr` : null;
}
