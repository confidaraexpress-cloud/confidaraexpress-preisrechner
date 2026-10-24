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
 *
 * ─── BEI EINER SHOPABGABE IST ES DER ABGABETAG ─────────────────────────────────────
 * Produktionsbefund 2026-10-02: eine Shopabgabe zeigte „Versandart: Shopabgabe",
 * „Abgabestelle: …" und daneben „Abholtermin". Der Tag beschreibt dort die Abgabe des
 * Kunden im Paketshop, keine Abholung. Der Vertrag traegt deshalb die Uebergabeart
 * (`handoverMode`, also allein `serviceType` — nie Carrier oder Name), und die
 * Beschriftungen folgen ihr: „Abgabetermin" bzw. „Fruehester Abgabetag". Ohne belegte
 * Uebergabeart bleibt es bei den bisherigen Texten.
 */

import { handoverMode, HANDOVER_DROPOFF, HANDOVER_PICKUP } from "./handoverMode.mjs";
import { isPickupWindowAdjustable } from "./pickupWindowClient.mjs";

const text = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

// Dieselbe Aussage in zwei Schreibweisen: als Beschriftung einer Zeile und als Unterzeile
// unter dem Datum. Beide stehen hier, damit die Formulierung nicht an zwei Orten driftet.
const ABHOLTAG_LABEL = "Frühester Abholtag";
const ABHOLTAG_NOTIZ = "frühester Abholtag";
// Dieselben Aussagen fuer eine Shopabgabe.
const ABGABETERMIN_LABEL = "Abgabetermin";
const ABGABETAG_LABEL = "Frühester Abgabetag";
const ABGABETAG_NOTIZ = "frühester Abgabetag";

/**
 * Der Abholvertrag eines Angebots in neutraler Form.
 *
 * @param   {object} tarif  ein Angebot der calculate-price-Antwort
 * @returns {{day: string|null, windowFrom: string|null, windowUntil: string|null, readyFrom: string|null,
 *            dayAdjusted: boolean, handover: "pickup"|"dropoff"|null}}
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
    // Wessen Tag ist das — der Abholung oder der Abgabe im Paketshop? Allein aus `serviceType`.
    handover: handoverMode(t),
  });
}

/**
 * Die Beschriftung der Abholtagszeile.
 *
 * Der Standardtext unterscheidet sich je Flaeche („Abholtermin" in den Angebotsdetails,
 * „Abholung" in der Zusammenfassung) — die abweichende Aussage ist ueberall dieselbe.
 * Bei einer Shopabgabe gilt auf jeder Flaeche „Abgabetermin" bzw. „Fruehester Abgabetag".
 *
 * @param   {object} vertrag   Ergebnis von `pickupContractOf` (oder `pickupSummaryOf`)
 * @param   {string} standard  die Beschriftung, solange der Wunschtag gehalten wurde
 * @returns {string}
 */
export function pickupDayLabel(vertrag, standard = "Abholtermin") {
  const v = vertrag && typeof vertrag === "object" ? vertrag : {};
  if (v.handover === HANDOVER_DROPOFF) return v.dayAdjusted ? ABGABETAG_LABEL : ABGABETERMIN_LABEL;
  return v.dayAdjusted ? ABHOLTAG_LABEL : standard;
}

/** Die Unterzeile unter einem verschobenen Abhol- bzw. Abgabetag — sonst `null`. */
export function pickupAdjustedNote(vertrag) {
  const v = vertrag && typeof vertrag === "object" ? vertrag : {};
  if (!v.dayAdjusted) return null;
  return v.handover === HANDOVER_DROPOFF ? ABGABETAG_NOTIZ : ABHOLTAG_NOTIZ;
}

/** Der Titel des Terminabschnitts der Angebotsdetails — bei einer Shopabgabe ohne „Abholung". */
export function pickupSectionTitle(vertrag) {
  const v = vertrag && typeof vertrag === "object" ? vertrag : {};
  return v.handover === HANDOVER_DROPOFF ? "Termin & Abgabe" : "Termin & Abholung";
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
 * @returns {{day: string|null, time: string|null, dayAdjusted: boolean, handover: "pickup"|"dropoff"|null}}
 */
export function pickupSummaryOf(tarif, gewaehltesFenster) {
  const vertrag = pickupContractOf(tarif);
  const wahl = gewaehltesFenster && typeof gewaehltesFenster === "object" ? gewaehltesFenster : {};
  const von = text(wahl.from);
  const bis = text(wahl.until);
  // Einheitlicher Abholtermin (2026-10-24): eine Wahl gibt es nur an einem VERSTELLBAREN Fenster. Ein fester
  // Zeitraum (etwa der Portalzeitraum 09:00–17:00) bleibt fest — auch wenn noch eine Auswahl im Seitenzustand liegt.
  const zeit = vertrag.windowFrom && vertrag.windowUntil && isPickupWindowAdjustable(tarif) && von && bis
    ? `${von}–${bis} Uhr`
    : pickupTimeText(vertrag);
  return Object.freeze({ day: vertrag.day, time: zeit, dayAdjusted: vertrag.dayAdjusted, handover: vertrag.handover });
}

/* ─── DER ABSCHNITT „ABHOLTERMIN" DER BUCHUNGSSEITE (Einheitlicher Abholtermin, 2026-10-24) ─────────────
 *
 * JEDE Abholung bekommt denselben Abschnitt — in genau der Genauigkeit, die das Angebot belegt:
 *
 *   window_adjustable  ein Von/Bis-Fenster, das der Anbieter verstellen laesst      → Zwei-Griff-Regler (JUMiNGO)
 *   window_fixed       ein Von/Bis-Fenster ohne Wahl                                → fester Zeitraum
 *   ready_from         nur eine „bereit ab"-Zeit, kein Ende im Anbietervertrag      → „Sendung bereit ab …"
 *   date_only          ein Abholtag ohne belastbare Uhrzeit                         → nur das Datum
 *   none               Paketshopabgabe oder kein Abholtag                           → kein Abschnitt
 *
 * Entschieden wird ausschliesslich an den FELDERN des Angebots — nie am Provider, nie an einer ServiceID. Ein
 * Regler entsteht nur, wo der Server `pickupWindowAdjustable: true` UND ein echtes Fenster nennt; eine Zeit wird
 * nie zu einem Fenster ergaenzt, ein fester Zeitraum nie zur Wahl.
 */
export const PICKUP_PROFILE = Object.freeze({
  ADJUSTABLE: "window_adjustable",
  FIXED: "window_fixed",
  READY_FROM: "ready_from",
  DATE_ONLY: "date_only",
  NONE: "none",
});

// Die Kundentexte des Abschnitts — an EINER Stelle, damit Abschnitt, Tests und Dokumentation nicht driften.
export const PICKUP_SECTION_TEXT = Object.freeze({
  titleChoice: "Gewünschter Abholtermin",
  title: "Abholtermin",
  dayLabel: "Datum",
  windowLabel: "Abholzeitfenster",
  readyFromLabel: "Sendung bereit ab",
  fixedNote: "Vom Versanddienstleister vorgegeben. Die Abholung erfolgt in diesem Zeitraum; eine genaue Uhrzeit wird nicht zugesagt.",
  readyFromNote: "Bitte halten Sie die Sendung ab dieser Uhrzeit bereit. Ein festes Abholzeitfenster nennt der Versanddienstleister für diesen Tarif nicht.",
  dateOnlyNote: "Die Uhrzeit der Abholung legt der Versanddienstleister fest.",
});

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Welche Variante des Abschnitts „Abholtermin" ein Angebot traegt — und mit welchen Werten.
 *
 * `sameDayBookBy` ist der wirksame Buchungsschluss einer Abholung HEUTE (`pickupTodayUntil` vom Server, „HH:MM")
 * — kein Abholende. Fehlt er oder ist er unbrauchbar, ist er `null`.
 *
 * @param   {object} tarif  ein Angebot der calculate-price-Antwort
 * @returns {{kind: string, day: string|null, dayAdjusted: boolean, handover: string|null,
 *            from: string|null, until: string|null, readyFrom: string|null, minMinutes: number|null,
 *            sameDayBookBy: string|null}}
 */
export function pickupTimeProfileOf(tarif) {
  const t = tarif && typeof tarif === "object" ? tarif : {};
  const vertrag = pickupContractOf(t);
  const leer = { day: null, dayAdjusted: false, handover: vertrag.handover, from: null, until: null,
                 readyFrom: null, minMinutes: null, sameDayBookBy: null };
  // Nur eine Fahrerabholung hat einen Abholtermin. Eine Paketshopabgabe (oder eine unbelegte Uebergabeart) nicht.
  if (vertrag.handover !== HANDOVER_PICKUP) return Object.freeze({ kind: PICKUP_PROFILE.NONE, ...leer });
  // Ohne Abholtag UND ohne jede Uhrzeit gibt es nichts zu zeigen. Ein Fenster ohne Tag bleibt sichtbar (wie bisher).
  if (!vertrag.day && !(vertrag.windowFrom && vertrag.windowUntil) && !vertrag.readyFrom) {
    return Object.freeze({ kind: PICKUP_PROFILE.NONE, ...leer });
  }
  const basis = {
    ...leer,
    day: vertrag.day,
    dayAdjusted: vertrag.dayAdjusted,
    sameDayBookBy: t.pickupToday === true && typeof t.pickupTodayUntil === "string" && UHRZEIT.test(t.pickupTodayUntil)
      ? t.pickupTodayUntil : null,
  };
  if (vertrag.windowFrom && vertrag.windowUntil) {
    const fenster = { ...basis, from: vertrag.windowFrom, until: vertrag.windowUntil };
    if (!isPickupWindowAdjustable(t)) return Object.freeze({ kind: PICKUP_PROFILE.FIXED, ...fenster });
    const min = Number.isFinite(t.pickupWindowMinMinutes) && t.pickupWindowMinMinutes > 0 ? t.pickupWindowMinMinutes : null;
    return Object.freeze({ kind: PICKUP_PROFILE.ADJUSTABLE, ...fenster, minMinutes: min });
  }
  if (vertrag.readyFrom) return Object.freeze({ kind: PICKUP_PROFILE.READY_FROM, ...basis, readyFrom: vertrag.readyFrom });
  return Object.freeze({ kind: PICKUP_PROFILE.DATE_ONLY, ...basis });
}
