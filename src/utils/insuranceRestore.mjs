// TG22 Paket B — eine gespeicherte Absicherung gehört zu GENAU EINEM Angebot.
//
// ─── Der Befund ──────────────────────────────────────────────────────────────
// Der Buchungsteil des laufenden Vorgangs hielt Absicherungstyp, Versicherungswert und die
// beiden Antworten zur Ware — aber nicht, zu welchem Angebot sie gehörten. Wer Angebot A
// absicherte, zurück in den Vergleich ging und Angebot B wählte, fand auf B dieselbe
// Absicherung samt Antworten vor, und beim Öffnen lief sofort eine Neubepreisung für B los:
// eine Wahl, die für B nie getroffen wurde.
//
// ─── Die Regel ───────────────────────────────────────────────────────────────
// Wiederhergestellt wird nur, wenn der gespeicherte Angebotsschlüssel (`offerKey`) dem des
// aktuellen Angebots entspricht. `null` passt NIE — weder ein fehlender gespeicherter noch ein
// fehlender aktueller Schlüssel. Ein Entwurf trägt keinen Schlüssel und stellt deshalb nie
// eine Absicherung wieder her. Preisstand (`priceRevision`) und Sendungshandle
// (`ceShipmentId`) sind bewusst NICHT Teil des Schlüssels: sie ändern sich bei einer
// Preisübernahme, das Angebot bleibt dasselbe.
import { offerKey } from "./offerIdentity.mjs";
import { insuranceTypeForTariff, tristateAnswer } from "./coverInsuranceView.mjs";

/** Gehört der gespeicherte Absicherungsstand zu genau diesem Angebot? */
export function insuranceRestoreApplies(flowBooking, tariff) {
  const gespeichert = flowBooking && typeof flowBooking === "object" ? flowBooking.insuranceOfferKey : null;
  if (typeof gespeichert !== "string" || gespeichert === "") return false;
  const aktuell = offerKey(tariff);
  return aktuell !== null && aktuell === gespeichert;
}

/**
 * Startzustand von Schritt und Absicherung. Passt der Schlüssel nicht, gilt der neutrale
 * Ausgangszustand: Schritt 1, keine Absicherung, keine Werte, keine Antworten.
 */
export function restoredInsuranceState(flowBooking, tariff) {
  if (!insuranceRestoreApplies(flowBooking, tariff)) {
    return { step: 1, insuranceType: "none", insuranceValue: "", insValueManual: false,
             goodsAreNew: null, goodsAreFragile: null };
  }
  return {
    step: flowBooking.step === 2 ? 2 : 1,
    insuranceType: insuranceTypeForTariff(flowBooking.insuranceType || "none", tariff),
    insuranceValue: typeof flowBooking.insuranceValue === "string" ? flowBooking.insuranceValue : "",
    insValueManual: flowBooking.insValueManual === true,
    goodsAreNew: tristateAnswer(flowBooking.goodsAreNew),
    goodsAreFragile: tristateAnswer(flowBooking.goodsAreFragile),
  };
}
