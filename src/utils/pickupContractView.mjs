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
 *
 * ─── DER GEWUENSCHTE TAG UND DER FRUEHESTE ─────────────────────────────────────────
 * Der Kunde waehlt beim Rechnen einen Versandtag. Ist er fuer ein Angebot nicht abholbar
 * — Wochenende, oder heute zu spaet —, traegt das Angebot den FRUEHESTEN tatsaechlich
 * moeglichen Tag. Der Server sagt das mit einem Ja/Nein (`collectionDateAdjusted`): ohne
 * Grund, ohne den Wunschtag und ohne Anbieterbezug.
 *
 * Diese Karte darf den verschobenen Tag deshalb nicht wie den gewaehlten aussehen lassen.
 * Sie sagt genau das eine, was belegt ist — „Fruehester Abholtag" —, und erfindet keinen
 * Grund dazu. WARUM der Wunschtag nicht ging, weiss die Oberflaeche nicht und behauptet
 * es auch nicht.
 */

const text = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

// Dieselbe Aussage in zwei Schreibweisen: als Beschriftung einer Zeile und als Unterzeile
// unter dem Datum. Beide stehen hier, damit die Formulierung nicht an zwei Orten driftet.
const ABHOLTAG_LABEL = "Frühester Abholtag";
const ABHOLTAG_NOTIZ = "frühester Abholtag";

/**
 * Der Abholvertrag eines Angebots in neutraler Form.
 *
 * @param   {object} tarif  ein Angebot der calculate-price-Antwort
 * @returns {{day: string|null, windowFrom: string|null, windowUntil: string|null, readyFrom: string|null,
 *            dayAdjusted: boolean}}
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
    // Ohne Tag sagt die Verschiebung nichts — sie beschreibt einen Tag, der dann nicht dasteht.
    dayAdjusted: day !== null && t.collectionDateAdjusted === true,
  });
}

/**
 * Die Beschriftung der Abholtagszeile.
 *
 * Der Standardtext unterscheidet sich je Flaeche („Abholtermin" in den Angebotsdetails,
 * „Abholung" in der Zusammenfassung) — die abweichende Aussage ist ueberall dieselbe.
 *
 * @param   {object} vertrag   Ergebnis von `pickupContractOf`
 * @param   {string} standard  die Beschriftung, solange der Wunschtag gehalten wurde
 * @returns {string}
 */
export function pickupDayLabel(vertrag, standard = "Abholtermin") {
  const v = vertrag && typeof vertrag === "object" ? vertrag : {};
  return v.dayAdjusted ? ABHOLTAG_LABEL : standard;
}

/** Die Unterzeile unter einem verschobenen Abholtag — sonst `null`. */
export function pickupAdjustedNote(vertrag) {
  const v = vertrag && typeof vertrag === "object" ? vertrag : {};
  return v.dayAdjusted ? ABHOLTAG_NOTIZ : null;
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

/**
 * Die Abholangabe der Buchungsflaechen (ausgewaehltes Angebot, Live-Leiste): Tag und Zeitzeile.
 *
 * TG22 Golden Offer Contract — bis hierher bildeten beide Flaechen die Zeile selbst. Jetzt lesen
 * sie denselben Vertrag wie die Angebotskarte.
 *
 * Ein vom Kunden gewaehltes Zeitfenster gilt NUR, wenn das Angebot selbst ein Fenster traegt. Ein
 * Angebot mit „bereit ab"-Zeit kennt keine Fensterwahl — aus einer Wahl darf dort keine Endzeit
 * werden.
 *
 * @param   {object} tarif               ein Angebot der calculate-price-Antwort
 * @param   {{from?: string, until?: string}|null} gewaehltesFenster  die Auswahl des Kunden
 * @returns {{day: string|null, time: string|null, dayAdjusted: boolean}}
 */
export function pickupSummaryOf(tarif, gewaehltesFenster) {
  const vertrag = pickupContractOf(tarif);
  const wahl = gewaehltesFenster && typeof gewaehltesFenster === "object" ? gewaehltesFenster : {};
  const von = text(wahl.from);
  const bis = text(wahl.until);
  const zeit = vertrag.windowFrom && vertrag.windowUntil && von && bis
    ? `${von}–${bis} Uhr`
    : pickupTimeText(vertrag);
  return Object.freeze({ day: vertrag.day, time: zeit, dayAdjusted: vertrag.dayAdjusted });
}
