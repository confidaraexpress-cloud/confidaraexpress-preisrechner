// ─────────────────────────────────────────────────────────────────────────────
// Zusätzliche Transportabsicherung mit frei gewähltem Versicherungswert — reine
// Logik der Buchungsseite (framework-frei, mit `node --test` prüfbar).
//
// WAS DIESES MODELL VOM STUFENMODELL UNTERSCHEIDET
//   Das bestehende Modell kennt drei Stufen (none/standard/premium) mit „ab"-Preisen
//   aus dem Tarif. Dieses Modell kennt:
//     • einen Versicherungswert, den der Kunde selbst wählt (getrennt vom Warenwert),
//     • zwei PFLICHTfragen zur Ware (neu? zerbrechlich?) — dreiwertig, ohne Vorbelegung,
//     • eine Selbstbeteiligung, die ausschließlich der Server nennt,
//     • einen Preis, der NUR aus der Neubepreisung stammt — nie aus einer Tabelle.
//
// WELCHES MODELL GILT, SAGT DER TARIF
//   `insuranceDetails.selectionModel === "cover_value"`. Kein Providervergleich, kein
//   Schluss aus Carrier oder Übergabeart. Fehlt das Feld, gilt das Stufenmodell —
//   exakt wie vor diesem Paket.
//
// DER SERVER BLEIBT DIE AUTORITÄT
//   Hier entsteht kein Preis und keine Selbstbeteiligung. Die Payload-Erbauer senden
//   ausschließlich die Kundenangaben; Preis, Quote und Bindung liegen serverseitig.
// ─────────────────────────────────────────────────────────────────────────────
import { COVER_INSURANCE_TEXT } from "./insuranceTerms.mjs";
import { getBookingModules } from "./bookingModules.js";
import { PRICE_CHANGE_KIND, priceChangeAnsicht } from "./priceChangeView.mjs";

export const INSURANCE_TYPE_TRANSIT_COVER = "transit_cover";
export const SELECTION_MODEL_COVER_VALUE = "cover_value";

// Dieselbe Eingabegrenze wie beim Warenwert. Sie ist KEINE Deckungsgrenze — eine
// solche ist nicht belegt und wird hier nicht erfunden. Ob ein Betrag angenommen
// wird, entscheidet die Neubepreisung.
export const COVER_VALUE_INPUT_MAX = 9999999;

const TIER_TYPES = Object.freeze(["standard", "premium"]);

const detailsOf = (tariff) =>
  tariff && typeof tariff === "object" && tariff.insuranceDetails && typeof tariff.insuranceDetails === "object"
    ? tariff.insuranceDetails : null;

/** Trägt dieser Tarif das Deckungsbetragsmodell? */
export function isCoverValueModel(tariff) {
  const d = detailsOf(tariff);
  return !!d && d.selectionModel === SELECTION_MODEL_COVER_VALUE;
}

/** Die Selbstbeteiligung, wie der Server sie am Tarif nennt — sonst `null`. */
export function coverExcessValue(tariff) {
  const d = detailsOf(tariff);
  const v = d ? d.excessValue : null;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Dreiwertig: nur echtes true/false ist eine Antwort. */
export const tristateAnswer = (v) => (v === true ? true : v === false ? false : null);

/** Fehlertext einer unbeantworteten Pflichtfrage — `""`, wenn beantwortet. */
export function goodsAnswerError(v) {
  return v === true || v === false ? "" : COVER_INSURANCE_TEXT.answerRequired;
}

// Kommaeingaben werden wie im übrigen Buchungsbereich akzeptiert.
const normalisiert = (raw) => String(raw ?? "").trim().replace(",", ".");

/** Fehlertext des Versicherungswerts — `""`, wenn gültig. */
export function coverValueError(raw) {
  const s = normalisiert(raw);
  if (s === "") return "Bitte geben Sie den Versicherungswert an.";
  const n = Number(s);
  if (!Number.isFinite(n)) return "Bitte geben Sie einen gültigen Betrag ein.";
  if (n <= 0) return "Der Versicherungswert muss größer als 0 € sein.";
  // Ein Wert mit mehr als zwei Nachkommastellen ist kein Centbetrag. Still zu runden
  // hieße, einen anderen Betrag abzusichern als den, der dasteht.
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "Bitte geben Sie höchstens zwei Nachkommastellen an.";
  if (n > COVER_VALUE_INPUT_MAX) return "Der Versicherungswert darf höchstens 9.999.999 € betragen.";
  return "";
}

/** Der gültige Versicherungswert als Zahl — sonst `null`. */
export function parseCoverValue(raw) {
  return coverValueError(raw) === "" ? Number(normalisiert(raw)) : null;
}

/**
 * Anfragekörper der Neubepreisung. GENAU vier Felder — kein Preis, kein Tarif, keine
 * Sendungsreferenz, keine Selbstbeteiligung. Der Server liest alles Übrige aus dem
 * gespeicherten Angebot.
 */
export function buildCoverRepricePayload({ offerId, coverValue, goodsAreNew, goodsAreFragile } = {}) {
  return {
    offerId: offerId ?? null,
    coverValue,
    goodsAreNew: tristateAnswer(goodsAreNew),
    goodsAreFragile: tristateAnswer(goodsAreFragile),
  };
}

/**
 * Der Versicherungsteil des /book-Körpers. Die Werte sind ein KONSISTENZWÄCHTER gegen
 * die serverseitige Bindung, keine Eingabe; `confirmedTotalGross` ist der bestätigte
 * Gesamtbetrag aus der Neubepreisung und bei versicherter Buchung Pflicht.
 */
export function buildCoverBookInsurancePayload({ coverValue, goodsAreNew, goodsAreFragile, repriceResult } = {}) {
  const totals = repriceResult && typeof repriceResult === "object" ? repriceResult.totals : null;
  return {
    insuranceSelection: {
      type: INSURANCE_TYPE_TRANSIT_COVER,
      coverValue,
      goodsAreNew: tristateAnswer(goodsAreNew),
      goodsAreFragile: tristateAnswer(goodsAreFragile),
    },
    confirmedTotalGross: totals ? totals.customerTotalGross : undefined,
  };
}

/**
 * Eine gespeicherte Auswahl passt nur zum Modell DIESES Tarifs. Eine Stufe an einem
 * Deckungsbetragstarif (oder umgekehrt) wird nicht umgedeutet, sondern verworfen —
 * der Kunde wählt dann bewusst neu.
 */
export function insuranceTypeForTariff(type, tariff) {
  if (isCoverValueModel(tariff)) return type === INSURANCE_TYPE_TRANSIT_COVER ? type : "none";
  return TIER_TYPES.includes(type) ? type : "none";
}

// Kundentexte der Neubepreisung — über den CODE entschieden, nie über den Rohtext.
const REPRICE_TEXT = Object.freeze({
  INSURANCE_SELECTION_INVALID: "Bitte geben Sie einen gültigen Versicherungswert an und beantworten Sie beide Fragen zur Ware.",
  INSURANCE_UNAVAILABLE: COVER_INSURANCE_TEXT.unavailable,
  PRICE_CHANGED: "Der Preis für dieses Angebot hat sich geändert. Bitte berechnen Sie die Angebote neu.",
  OFFER_NOT_BOOKABLE: "Dieses Angebot kann derzeit nicht gebucht werden. Bitte berechnen Sie die Angebote neu.",
  OFFER_ALREADY_USED: "Dieses Angebot wurde bereits verwendet. Bitte berechnen Sie die Angebote neu.",
  SHIPMENT_NOT_DRAFT: "Diese Sendung kann nicht mehr geändert werden.",
  PRICE_UNCONFIRMED: "Der Preis konnte gerade nicht bestätigt werden. Bitte versuchen Sie es erneut.",
});

/** Kundentext eines fehlgeschlagenen Neubepreisungs-Aufrufs. */
export function coverRepriceErrorText(status, body) {
  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code : null;
  if (code && REPRICE_TEXT[code]) return REPRICE_TEXT[code];
  if (status === 429) return "Zu viele Anfragen. Bitte später erneut versuchen.";
  if (status === 503) return REPRICE_TEXT.PRICE_UNCONFIRMED;
  return COVER_INSURANCE_TEXT.summaryError;
}

// Kundentexte der Buchungsablehnungen zur Absicherung.
const BOOK_TEXT = Object.freeze({
  INSURANCE_NOT_BOUND: "Der Preis der Transportabsicherung wird neu bestätigt. Bitte prüfen Sie den Betrag und buchen Sie erneut.",
  INSURANCE_SELECTION_MISMATCH: "Die Angaben zur Transportabsicherung haben sich geändert. Der Preis wird neu bestätigt — bitte buchen Sie danach erneut.",
  PRICE_CONFIRMATION_REQUIRED: "Bitte bestätigen Sie den Gesamtbetrag mit zusätzlicher Transportabsicherung erneut.",
  INSURANCE_UNAVAILABLE: COVER_INSURANCE_TEXT.unavailable,
});

/** Kundentext einer abgelehnten versicherten Buchung (409 außer PRICE_CHANGED). */
export function coverBookErrorText(body) {
  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code : null;
  return (code && BOOK_TEXT[code]) || "Der Preis der Transportabsicherung muss neu bestätigt werden. Bitte buchen Sie danach erneut.";
}

// Die Ablehnungscodes, die die Absicherung SELBST betreffen. Nur sie gehören in den
// Absicherungszweig der Buchungsseite — ein anderer 409 (etwa ein unbekannter Konflikt)
// darf keine Absicherungsmeldung bekommen und keine Neubepreisung auslösen.
export const COVER_BOOK_ERROR_CODES = Object.freeze([
  "INSURANCE_NOT_BOUND", "INSURANCE_SELECTION_MISMATCH", "PRICE_CONFIRMATION_REQUIRED", "INSURANCE_UNAVAILABLE",
]);
const REPRICE_BEHEBT = Object.freeze(["INSURANCE_NOT_BOUND", "INSURANCE_SELECTION_MISMATCH", "PRICE_CONFIRMATION_REQUIRED"]);

const codeVon = (body) => (body && typeof body === "object" && typeof body.code === "string" ? body.code : null);

/** Betrifft diese Ablehnung die Absicherung selbst? */
export function isCoverBookError(body) {
  return COVER_BOOK_ERROR_CODES.includes(codeVon(body));
}

/** Behebt eine Neubepreisung diese Ablehnung? (Nicht bei Nichtverfügbarkeit, nie bei fremden Codes.) */
export function coverBookErrorRequiresReprice(body) {
  return REPRICE_BEHEBT.includes(codeVon(body));
}

const istBetrag = (w) => typeof w === "number" && Number.isFinite(w);

/**
 * Preisänderung einer VERSICHERTEN Buchung.
 *
 * Der Server nennt hier den neuen GESAMTbetrag (`price`), der Client kennt den zuletzt
 * bestätigten aus der Neubepreisung. Anders als im unversicherten Weg schickt die
 * Bestätigung NICHT dieselbe Anfrage erneut: sie löst eine neue Neubepreisung aus, die
 * Preis und Bindung serverseitig erneuert. Der Einwand aus `priceChangeView.mjs` gegen
 * einen Einzelbetrag trifft deshalb nicht zu — beide Beträge sind echt, und der zweite
 * Versuch beruht auf einer neuen Bindung.
 *
 * Fehlt einer der beiden Beträge, bleibt es beim neutralen Hinweis mit Neuberechnung.
 */
export function insuredPriceChangeView(body, previousTotalGross) {
  const d = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const basis = priceChangeAnsicht(d);
  if (basis.kind === PRICE_CHANGE_KIND.CONFIRMABLE) return { ...basis, insured: true };
  if (istBetrag(d.price) && istBetrag(previousTotalGross)) {
    return { kind: PRICE_CHANGE_KIND.CONFIRMABLE, oldPrice: previousTotalGross, newPrice: d.price, insured: true };
  }
  return basis;
}

/**
 * Was die Angebotskarte über die Absicherung sagen darf — mit DEMSELBEN Gate wie die
 * Buchungsseite (`getBookingModules`). Eine Karte, die „möglich" sagt, während die
 * Buchungsseite kein Modul zeigt (oder umgekehrt), wäre ein Widerspruch im Produkt.
 */
export function offerCardInsurance(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  const d = detailsOf(t);
  const insurable = getBookingModules(t).insurance === true;
  return {
    insurable,
    explicitlyUnavailable: !insurable && (t.insuranceAvailable === false || (d !== null && d.isInsurable === false)),
    coverModel: insurable && isCoverValueModel(t),
    excessValue: coverExcessValue(t),
  };
}
