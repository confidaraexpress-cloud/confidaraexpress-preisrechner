/* utils/tierInsuranceCover.mjs — die Grenzen der gestuften Zusatzversicherung (Standard/Premium).

   Reine Funktionen: kein Netz, kein Zustand, kein React.

   ─── BETREIBERENTSCHEIDUNGEN VOM 2026-11-10 ──────────────────────────────────
   E1  Liegt der Warenwert über der Höchstgrenze des konkreten Versicherungsangebots, wird KEINE
       Zusatzversicherung angeboten — auch keine, die nur einen Teil des Warenwerts deckt. Der Versand
       bleibt ohne Zusatzversicherung buchbar.
   E2  Der Versicherungswert ist nie höher als der Warenwert.

   Bis hierher stand 20.000 € als feste Grenze in dieser Oberfläche, und ein höherer Warenwert ließ
   sich mit einem Versicherungswert bis 20.000 € teilversichern.

   ─── DER SERVER NENNT DIE GRENZE ─────────────────────────────────────────────
   Je Stufe am Tarif (`tariff.insuranceCover.standard|premium`): `state`, `coverLimit` (aus der
   Tarifantwort des Kontos, je Strecke und Stufe) und `maxInsuredValue` (der Warenwert in ganzen Euro).
   Diese Datei liest nur — sie kennt keine Grenze, rechnet keine und erfindet keine. Fehlt die Aussage
   (ein Tarif aus einer älteren Antwort), ist keine Stufe wählbar: ohne bekannte Grenze lässt sich
   nicht zusagen, dass die Zusatzversicherung den ganzen Warenwert deckt.

   Die Entscheidung fällt serverseitig (Backend lib/jumingoInsuranceCover.js); die Prüfungen hier
   verhindern nur, dass der Kunde einen Knopf drückt, der garantiert abgelehnt wird. */
import { TIER_COVER_TEXT, tierCoverLimitText } from "./insuranceTerms.mjs";

export const TIER_INSURANCE_TYPES = Object.freeze(["standard", "premium"]);
export const TIER_COVER_STATE = Object.freeze({
  AVAILABLE: "available",
  ABOVE_COVER_LIMIT: "above_cover_limit",
});

const istGanzerBetrag = (v) => Number.isSafeInteger(v) && v >= 1;
const istPositiv = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Die Serveraussage einer Stufe — oder `null`. */
export function tierCoverEntry(tariff, type) {
  if (!TIER_INSURANCE_TYPES.includes(type)) return null;
  const alle = tariff && typeof tariff === "object" ? tariff.insuranceCover : null;
  const e = alle && typeof alle === "object" ? alle[type] : null;
  return e && typeof e === "object" && typeof e.state === "string" ? e : null;
}

/** Der höchste wählbare Versicherungswert einer Stufe (ganze Euro) — oder `null`, wenn sie nicht wählbar ist. */
export function maxInsuredValueFor(tariff, type) {
  const e = tierCoverEntry(tariff, type);
  return e && e.state === TIER_COVER_STATE.AVAILABLE && istGanzerBetrag(e.maxInsuredValue) ? e.maxInsuredValue : null;
}

/** Die Stufen, die für diesen Tarif und diesen Warenwert wählbar sind — in fester Reihenfolge. */
export function availableInsuranceTiers(tariff) {
  return TIER_INSURANCE_TYPES.filter((type) => maxInsuredValueFor(tariff, type) !== null);
}

/**
 * Was die Absicherungsfläche sagt, wenn KEINE Stufe wählbar ist — eine Information, kein Fehler;
 * gebucht wird ohne Zusatzversicherung. `null`, sobald eine Stufe wählbar ist.
 *
 * Liegt der Warenwert über einer Grenze, nennt der Satz die höchste Grenze dieses Tarifs (bis dahin
 * wäre überhaupt eine Stufe möglich). Sonst — Grenze unbekannt, Warenwert fehlt, ältere Antwort —
 * der neutrale Satz.
 */
export function tierCoverNotice(tariff) {
  if (availableInsuranceTiers(tariff).length > 0) return null;
  const grenzen = TIER_INSURANCE_TYPES
    .map((type) => tierCoverEntry(tariff, type))
    .filter((e) => e && e.state === TIER_COVER_STATE.ABOVE_COVER_LIMIT && istPositiv(e.coverLimit))
    .map((e) => e.coverLimit);
  if (grenzen.length > 0) {
    return { kind: TIER_COVER_STATE.ABOVE_COVER_LIMIT, text: tierCoverLimitText(Math.max(...grenzen)) };
  }
  const ueberGrenze = TIER_INSURANCE_TYPES.some((type) => tierCoverEntry(tariff, type)?.state === TIER_COVER_STATE.ABOVE_COVER_LIMIT);
  return ueberGrenze
    ? { kind: TIER_COVER_STATE.ABOVE_COVER_LIMIT, text: TIER_COVER_TEXT.limitExceeded }
    : { kind: "unavailable", text: TIER_COVER_TEXT.unavailable };
}

// Eine Betragseingabe als Zahl: das Dezimalkomma ist eine Schreibweise derselben Zahl.
function alsZahl(roh) {
  if (roh === undefined || roh === null) return null;
  if (typeof roh === "number") return Number.isFinite(roh) ? roh : null;
  const t = String(roh).trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * E2 und ganze Euro — der Fehlertext des Versicherungswerts, `""` wenn er zulässig ist.
 * `max` ist der Serverwert `maxInsuredValueFor`; fehlt er, ist die Stufe nicht wählbar.
 */
export function insuredValueError(roh, max) {
  if (roh === undefined || roh === null || String(roh).trim() === "") return TIER_COVER_TEXT.valueRequired;
  const n = alsZahl(roh);
  if (n === null) return TIER_COVER_TEXT.valueInvalid;
  if (!Number.isInteger(n)) return TIER_COVER_TEXT.valueWholeEuros;
  if (n < 1) return TIER_COVER_TEXT.valueMin;
  if (!istGanzerBetrag(max)) return TIER_COVER_TEXT.unavailable;
  if (n > max) return TIER_COVER_TEXT.valueExceedsGoods;
  return "";
}

/**
 * Liegt ein zulässiger Versicherungswert unter dem Warenwert? Dann der Satz zur anteiligen Kürzung —
 * damit eine Teilversicherung nie wie eine volle aussieht. Sonst `""`.
 */
export function underinsuranceHint(insuredRoh, goodsRoh) {
  const wert = alsZahl(insuredRoh);
  const ware = alsZahl(goodsRoh);
  if (wert === null || ware === null || !Number.isInteger(wert) || wert < 1 || ware <= 0) return "";
  return Math.round(wert * 100) < Math.round(ware * 100) ? TIER_COVER_TEXT.underinsurance : "";
}

/** Die Vorbelegung des Versicherungswerts: der volle Warenwert in ganzen Euro, wie der Server ihn nennt. */
export function defaultInsuredValue(tariff, type) {
  const max = maxInsuredValueFor(tariff, type);
  return max === null ? "" : String(max);
}
