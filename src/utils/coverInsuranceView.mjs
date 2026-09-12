// ─────────────────────────────────────────────────────────────────────────────
// Zusätzliche Transportabsicherung — reine Logik der Buchungsseite (framework-frei,
// mit `node --test` prüfbar).
//
// WAS DIESES MODELL VOM STUFENMODELL UNTERSCHEIDET
//   Das bestehende Modell kennt drei Stufen (none/standard/premium) mit „ab"-Preisen
//   aus dem Tarif. Dieses Modell kennt:
//     • einen Versicherungswert, der dem Warenwert der Sendung entspricht (TG22 Paket B —
//       vorher frei wählbar; bepreist wird aber ausschließlich der Warenwert),
//     • zwei PFLICHTfragen zur Ware (neu? zerbrechlich?) — dreiwertig, ohne Vorbelegung,
//     • eine Selbstbeteiligung, die ausschließlich der Server nennt,
//     • einen Preis, der NUR aus der Neubepreisung stammt — nie aus einer Tabelle,
//     • zwei Aussagen ohne Kauf: die enthaltene Grundabsicherung (kleiner Warenwert) und die
//       Höchstdeckung (großer Warenwert). Beide sind Informationen, keine Fehler.
//
// WELCHES MODELL GILT, SAGT DER TARIF
//   `insuranceDetails.selectionModel === "cover_value"`. Kein Providervergleich, kein
//   Schluss aus Carrier oder Übergabeart. Fehlt das Feld, gilt das Stufenmodell —
//   exakt wie vor diesem Paket.
//
// DER SERVER BLEIBT DIE AUTORITÄT
//   Hier entsteht kein Preis, keine Selbstbeteiligung und keine Grenze. Der mitgesendete
//   Versicherungswert ist ein Konsistenzwächter: der Server vergleicht ihn mit dem
//   eingefrorenen Warenwert und bepreist ausschließlich diesen.
// ─────────────────────────────────────────────────────────────────────────────
import { COVER_INSURANCE_TEXT, coverBasicCoverText, coverLimitText } from "./insuranceTerms.mjs";
import { getBookingModules } from "./bookingModules.js";
import { PRICE_CHANGE_KIND, priceChangeAnsicht } from "./priceChangeView.mjs";

export const INSURANCE_TYPE_TRANSIT_COVER = "transit_cover";
export const SELECTION_MODEL_COVER_VALUE = "cover_value";
// TG22 Paket B — woher der Versicherungswert kommt und was der Tarif über die Absicherung sagt.
export const COVER_VALUE_SOURCE_GOODS_VALUE = "goods_value";
export const COVER_STATE = Object.freeze({
  AVAILABLE: "available",
  BASIC_COVER_INCLUDED: "basic_cover_included",
  ABOVE_COVER_LIMIT: "above_cover_limit",
});

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

// Ein Geldbetrag in ganzen Cent: endlich, größer als 0, höchstens zwei Nachkommastellen.
const istCentBetrag = (w) => typeof w === "number" && Number.isFinite(w) && w > 0
  && Math.abs(w * 100 - Math.round(w * 100)) < 1e-6;

/**
 * TG22 Paket B — der Versicherungswert der zusätzlichen Transportabsicherung. Er IST der Warenwert:
 * bevorzugt der Betrag, den der Server am Tarif nennt, sonst der eingefrorene Warenwert des
 * Vorgangs (ein Tarif aus einer älteren Antwort trägt ihn noch nicht). Ohne gültigen Betrag
 * `null` — dann gibt es nichts zu bepreisen und nichts zu buchen.
 */
export function coverValueForTariff(tariff, goodsValue) {
  const d = detailsOf(tariff);
  if (d && istCentBetrag(d.coverValue)) return d.coverValue;
  const roh = String(goodsValue ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(roh)) return null;
  const n = Number(roh);
  return istCentBetrag(n) ? n : null;
}

/**
 * TG22 Paket B — was ein Tarif OHNE kaufbaren Zusatz über die Absicherung sagt: die enthaltene
 * Grundabsicherung oder die Höchstdeckung. Eine INFORMATION, kein Fehler. Ohne Aussage `null`.
 */
export function coverInsuranceNotice(tariff) {
  const d = detailsOf(tariff);
  if (!d || d.selectionModel !== SELECTION_MODEL_COVER_VALUE) return null;
  if (d.coverState === COVER_STATE.BASIC_COVER_INCLUDED) {
    return { kind: COVER_STATE.BASIC_COVER_INCLUDED, text: coverBasicCoverText(d.basicCoverMaxGoodsValue) };
  }
  if (d.coverState === COVER_STATE.ABOVE_COVER_LIMIT) {
    return { kind: COVER_STATE.ABOVE_COVER_LIMIT, text: coverLimitText(d.maxCoverValue) };
  }
  return null;
}

/**
 * Anfragekörper der Neubepreisung. Höchstens vier Felder — kein Preis, kein Tarif, keine
 * Sendungsreferenz, keine Selbstbeteiligung. Der Versicherungswert reist nur als gültiger
 * Betrag mit (Konsistenzwächter); fehlt er, nennt ihn der Server selbst.
 */
export function buildCoverRepricePayload({ offerId, coverValue, goodsAreNew, goodsAreFragile, acceptPriceChange } = {}) {
  const koerper = { offerId: offerId ?? null };
  if (istCentBetrag(coverValue)) koerper.coverValue = coverValue;
  koerper.goodsAreNew = tristateAnswer(goodsAreNew);
  koerper.goodsAreFragile = tristateAnswer(goodsAreFragile);
  // TG22 Paket A — die AUSDRÜCKLICHE Übernahme eines neuen Preises. Gesendet wird nur der
  // Gesamtbetrag, den der Server zuvor als neuen Preis genannt hat: ein Bestätigungswert, keine
  // Preisangabe. Der Server bindet ausschließlich seinen frischen Preis — und nur, wenn er exakt
  // diesem Betrag entspricht. Ohne gültigen Betrag entsteht das Feld nicht.
  const betrag = acceptPriceChange && typeof acceptPriceChange === "object" ? acceptPriceChange.expectedTotalGross : undefined;
  if (typeof betrag === "number" && Number.isFinite(betrag) && betrag >= 0) {
    koerper.acceptPriceChange = { expectedTotalGross: betrag };
  }
  return koerper;
}

/**
 * Der Versicherungsteil des /book-Körpers. Die Werte sind ein KONSISTENZWÄCHTER gegen
 * die serverseitige Bindung, keine Eingabe; `confirmedTotalGross` ist der bestätigte
 * Gesamtbetrag aus der Neubepreisung und bei versicherter Buchung Pflicht.
 */
export function buildCoverBookInsurancePayload({ coverValue, goodsAreNew, goodsAreFragile, repriceResult } = {}) {
  const totals = repriceResult && typeof repriceResult === "object" ? repriceResult.totals : null;
  // TG22 Paket A — der Preisstand, zu dem bestätigt wird. Nur wenn der Server ihn genannt hat;
  // weicht er beim Buchen ab (etwa nach einer Übernahme in einem zweiten Tab), bucht der Server
  // nicht, sondern verlangt eine neue Bestätigung.
  const revision = repriceResult && Number.isSafeInteger(repriceResult.priceRevision) && repriceResult.priceRevision >= 0
    ? repriceResult.priceRevision : undefined;
  const auswahl = { type: INSURANCE_TYPE_TRANSIT_COVER };
  if (istCentBetrag(coverValue)) auswahl.coverValue = coverValue;
  auswahl.goodsAreNew = tristateAnswer(goodsAreNew);
  auswahl.goodsAreFragile = tristateAnswer(goodsAreFragile);
  return {
    insuranceSelection: auswahl,
    confirmedTotalGross: totals ? totals.customerTotalGross : undefined,
    ...(revision !== undefined ? { offerRevision: revision } : {}),
  };
}

/**
 * Eine gespeicherte Auswahl passt nur zum Modell DIESES Tarifs. Eine Stufe an einem
 * Deckungsbetragstarif (oder umgekehrt) wird nicht umgedeutet, sondern verworfen —
 * der Kunde wählt dann bewusst neu. Sagt der Tarif, dass es keinen kaufbaren Zusatz gibt
 * (Grundabsicherung, Höchstdeckung), wird keine Absicherung wiederhergestellt.
 */
export function insuranceTypeForTariff(type, tariff) {
  if (isCoverValueModel(tariff)) {
    if (coverInsuranceNotice(tariff) !== null) return "none";
    return type === INSURANCE_TYPE_TRANSIT_COVER ? type : "none";
  }
  return TIER_TYPES.includes(type) ? type : "none";
}

// Kundentexte der Neubepreisung — über den CODE entschieden, nie über den Rohtext.
const REPRICE_TEXT = Object.freeze({
  INSURANCE_SELECTION_INVALID: "Bitte beantworten Sie beide Fragen zur Ware.",
  // TG22 Paket B: der mitgesendete Versicherungswert passt nicht zum eingefrorenen Warenwert — die
  // Seite zeigt einen anderen Stand als der Server.
  INSURANCE_SELECTION_MISMATCH: "Die Angaben zu dieser Sendung haben sich geändert. Bitte berechnen Sie die Angebote neu.",
  INSURANCE_UNAVAILABLE: COVER_INSURANCE_TEXT.unavailable,
  // TG22 Paket B: Aussagen des Tarifs, keine Fehler — hier nur für Wege ohne Hinweisfläche.
  INSURANCE_BASIC_COVER_INCLUDED: COVER_INSURANCE_TEXT.basicCoverIncludedGeneric,
  INSURANCE_COVER_LIMIT_EXCEEDED: COVER_INSURANCE_TEXT.coverLimitGeneric,
  PRICE_CHANGED: "Der Preis für dieses Angebot hat sich geändert. Bitte berechnen Sie die Angebote neu.",
  OFFER_NOT_BOOKABLE: "Dieses Angebot kann derzeit nicht gebucht werden. Bitte berechnen Sie die Angebote neu.",
  // TG22 Paket B: verbraucht heißt „es kann ein Auftrag bestehen" — der Weg führt in die
  // Sendungsliste, nie in eine Neuberechnung (wortgleich mit bookingErrors.mjs).
  OFFER_ALREADY_USED: "Dieses Angebot wurde bereits verwendet. Bitte prüfen Sie Ihre Sendungen.",
  SHIPMENT_NOT_DRAFT: "Diese Sendung kann nicht mehr geändert werden.",
  PRICE_UNCONFIRMED: "Der Preis konnte gerade nicht bestätigt werden. Bitte versuchen Sie es erneut.",
  // TG22 Paket A
  OFFER_PRICE_CONFLICT: "Der Preis wurde zwischenzeitlich aktualisiert. Bitte prüfen Sie den Betrag erneut.",
  PRICE_CONFIRMATION_REQUIRED: "Bitte bestätigen Sie den neuen Preis erneut.",
});

/* TG22 Paket A — Texte der versicherten Preisänderung. Kein Anbieter, kein Einkaufspreis. */
export const COVER_PRICE_CHANGE_TEXT = Object.freeze({
  intro: "Der Preis hat sich seit Ihrer letzten Bestätigung geändert. Es wurde nichts gebucht.",
  shippingLabel: "Versand",
  insuranceLabel: "Zusätzliche Transportabsicherung",
  unchanged: "unverändert",
  acceptLabel: "Neuen Preis übernehmen",
  accepting: "Wird übernommen…",
  accepted: "Der neue Preis wurde übernommen. Bitte prüfen Sie den Gesamtbetrag und buchen Sie danach verbindlich.",
  acceptFailed: "Der neue Preis konnte gerade nicht bestätigt werden. Bitte versuchen Sie es erneut oder berechnen Sie die Angebote neu.",
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

/**
 * TG22 Paket B — eine Antwort der Neubepreisung, die eine AUSSAGE ist und kein Fehler: die
 * Grundabsicherung ist enthalten, oder der Warenwert liegt über der Höchstdeckung. Den Betrag
 * nennt der Server im Körper; ohne ihn bleibt der Satz ohne Betrag. Jede andere Antwort → `null`.
 */
export function coverRepriceNotice(body) {
  const code = codeVon(body);
  if (code === "INSURANCE_BASIC_COVER_INCLUDED") return coverBasicCoverText(body.basicCoverMaxGoodsValue);
  if (code === "INSURANCE_COVER_LIMIT_EXCEEDED") return coverLimitText(body.maxCoverValue);
  return null;
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
  // TG22 Paket A: nennt der Server beide Beträge selbst, gelten ausschließlich sie — samt ihrer
  // Zusammensetzung. Der clientseitige Altbetrag ist dann ohne Bedeutung.
  if (basis.kind === PRICE_CHANGE_KIND.CONFIRMABLE) return { ...basis, insured: true, breakdown: aufschluesselung(d) };
  if (istBetrag(d.price) && istBetrag(previousTotalGross)) {
    return { kind: PRICE_CHANGE_KIND.CONFIRMABLE, oldPrice: previousTotalGross, newPrice: d.price, insured: true, breakdown: null };
  }
  return basis;
}

// Die serverseitige Zusammensetzung der Preisänderung — nur echte Zahlenpaare, sonst nichts.
function aufschluesselung(d) {
  const pc = d && d.priceChange && typeof d.priceChange === "object" && !Array.isArray(d.priceChange) ? d.priceChange : null;
  if (!pc) return null;
  const paar = (x) => (x && typeof x === "object" && istBetrag(x.oldGross) && istBetrag(x.newGross)
    ? { oldGross: x.oldGross, newGross: x.newGross } : null);
  const shipping = paar(pc.shipping);
  const insurance = paar(pc.insurance);
  return shipping || insurance ? { shipping, insurance } : null;
}

const alsCent = (w) => Math.round(w * 100);

/**
 * Die Zeilen, die der Dialog unter dem Gesamtvergleich zeigt: Versand und Absicherung, je mit
 * altem und neuem Betrag und dem Hinweis, ob sich dieser Teil geändert hat. Ohne serverseitige
 * Zusammensetzung gibt es keine Zeilen — es wird keine erfunden.
 */
export function priceChangeBreakdownLines(view) {
  const b = view && view.breakdown && typeof view.breakdown === "object" ? view.breakdown : null;
  if (!b) return [];
  const zeilen = [];
  if (b.shipping) {
    zeilen.push({ id: "shipping", label: COVER_PRICE_CHANGE_TEXT.shippingLabel, ...b.shipping,
                  changed: alsCent(b.shipping.oldGross) !== alsCent(b.shipping.newGross) });
  }
  if (b.insurance) {
    zeilen.push({ id: "insurance", label: COVER_PRICE_CHANGE_TEXT.insuranceLabel, ...b.insurance,
                  changed: alsCent(b.insurance.oldGross) !== alsCent(b.insurance.newGross) });
  }
  return zeilen;
}

/**
 * Was die Angebotskarte über die Absicherung sagen darf — mit DEMSELBEN Gate wie die
 * Buchungsseite (`getBookingModules`). Eine Karte, die „möglich" sagt, während die
 * Buchungsseite kein Modul zeigt (oder umgekehrt), wäre ein Widerspruch im Produkt.
 *
 * TG22 Paket B: ohne kaufbaren Zusatz kann der Tarif trotzdem etwas sagen — die enthaltene
 * Grundabsicherung oder die Höchstdeckung (`notice`). Das ist KEIN „nicht verfügbar".
 */
export function offerCardInsurance(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  const d = detailsOf(t);
  const insurable = getBookingModules(t).insurance === true;
  const notice = insurable ? null : coverInsuranceNotice(t);
  return {
    insurable,
    explicitlyUnavailable: !insurable && notice === null
      && (t.insuranceAvailable === false || (d !== null && d.isInsurable === false)),
    coverModel: insurable && isCoverValueModel(t),
    excessValue: coverExcessValue(t),
    notice,
  };
}
