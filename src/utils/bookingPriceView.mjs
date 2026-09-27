// ─────────────────────────────────────────────────────────────────────────────
// Zentrales, reines Preis-View-Model der BookingPage (Paket B).
//
// EINZIGE Quelle für jeden sichtbaren Preis: Live-Zusammenfassungsleiste,
// Preiszusammenfassung, Versicherungskarten und Buchungs-Gate lesen ausschließlich
// dieses View-Model — keine parallele Inline-Auswahl zwischen `tariff.*` und
// `repriceResult.totals` mehr.
//
// HARTE REGEL: keine clientseitige Preisberechnung. Der Gesamtbetrag ist IMMER
// entweder der ursprüngliche Tarifpreis (keine Versicherung) ODER 1:1 aus
// `repriceResult.totals` (Server, versichert). Ein Preselect-/„ab"-Betrag wird
// NIEMALS lokal zum Gesamtpreis addiert. Fehlt ein belegter Preis, gilt er als
// NICHT bestätigt (fail-closed) — nie als geschätzter Gesamtbetrag.
//
// Zusätzlich (rein additiv, reine Anzeige) stellt das View-Model den IMMER
// verfügbaren Basis-Versandpreis (baseShipping*) und den „ab"-Preselect der
// gewählten Stufe (selectedInsurancePreselectGross / hasInsurancePreselect, plus
// beide Rohwerte) bereit — damit die obere Preiszone und die Live-Leiste bereits
// bei Standard/Premium-Auswahl OHNE Warenwert reagieren können, ohne je einen
// unbestätigten Gesamtpreis zu erfinden.
//
// Framework-frei und mit `node --test` prüfbar.
// ─────────────────────────────────────────────────────────────────────────────

import { INSURANCE_TYPE_TRANSIT_COVER } from "./coverInsuranceView.mjs";
import { readPriceComponents } from "./priceComponentsView.mjs";

// Zentrale Frontend-Grenze für den Versicherungswert. Entspricht der bereits
// bestehenden Inline-Grenze (BookingPage/InsuranceModule) und der Backend-Regel
// (extra_insurance_value 1..20000). Hier nur zentralisiert — kein neuer Wert.
// Gilt AUSSCHLIESSLICH für das Stufenmodell (Standard/Premium). Die zusätzliche
// Transportabsicherung kennt diese Grenze nicht: ihr Versicherungswert ist der Warenwert, und
// ihre Grenzen nennt der Server (utils/coverInsuranceView.mjs).
export const INSURANCE_VALUE_MAX = 20000;

export const PRICE_STATUS = {
  BASE_CONFIRMED:    "BASE_CONFIRMED",    // keine Versicherung → Tarifpreis, bestätigt
  REPRICE_REQUIRED:  "REPRICE_REQUIRED",  // Standard/Premium, Werte unvollständig/ungültig
  REPRICING:         "REPRICING",         // Request läuft ODER Debounce wartet
  REPRICE_CONFIRMED: "REPRICE_CONFIRMED", // Preis vollständig aus repriceResult.totals
  REPRICE_ERROR:     "REPRICE_ERROR",     // Reprice fehlgeschlagen
  STALE:             "STALE",             // Auswahl/Eingabe seit letztem Reprice geändert
  PRICE_CHANGED:     "PRICE_CHANGED",     // Server meldet Preisänderung → kein Betrag gilt, Buchung gesperrt
  // TG22 Residential: das Angebot braucht die Art der Lieferadresse, und sie ist nicht (mehr)
  // gebunden → der Angebotspreis ist vorläufig, Buchung gesperrt.
  PRICE_INPUTS_REQUIRED: "PRICE_INPUTS_REQUIRED",
};

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Wie num(), aber nur strikt positive Werte gelten (0/negativ → null). Semantik
// identisch zum `asPos`/`posNum` der Konsumenten (BookingPage/OfferCard): ein „ab"-
// Preselect zählt nur, wenn er ein echter, positiver Betrag ist — nie 0,00 €.
function pos(v) {
  const n = num(v);
  return n != null && n > 0 ? n : null;
}

// Versichert ist jede gewählte Absicherung — die beiden Stufen UND die zusätzliche
// Transportabsicherung bis zum Warenwert.
export function isInsuredType(insuranceType) {
  return insuranceType === "standard" || insuranceType === "premium"
    || insuranceType === INSURANCE_TYPE_TRANSIT_COVER;
}

// Zerlegt die Server-Totals in die Anzeigefelder — jedes Feld 1:1 aus der Antwort.
//
// TG22 Golden Offer Contract: auch der Nettogesamtbetrag (`customerTotalNet`) kommt
// vom Server, centgenau aus denselben Bestandteilen gebildet wie der Bruttobetrag.
// Bis hierher addierte diese Datei Versandnetto und Versicherung selbst — eine
// zweite Rechnung neben der des Servers. Fehlt das Feld (ältere Serverantwort),
// bleibt `totalNet` null: es wird angezeigt, was der Server bestätigt, nie eine
// eigene Rekonstruktion.
function fromTotals(totals) {
  const shippingNet   = num(totals.customerShippingNet);
  const shippingVat   = num(totals.shippingVat);
  const shippingGross = num(totals.customerShippingGross);
  const insuranceGross = num(totals.insuranceGross);
  const totalGross    = num(totals.customerTotalGross);
  const totalNet      = num(totals.customerTotalNet);
  return { shippingNet, shippingVat, shippingGross, insuranceGross, totalNet, totalGross };
}

function shippingRefFromTariff(t) {
  // Bekannte Versand-Teilwerte (nur als Referenz, NIE als bestätigter Gesamtpreis).
  return {
    shippingNet: num(t.netPrice), shippingVat: num(t.vatAmount), shippingGross: num(t.finalPrice),
    insuranceGross: null, totalNet: null, totalGross: null,
  };
}

// Kernfunktion. `insValid` = clientseitige Feldgültigkeit (Warenwert/Versicherungs-
// wert); default true (abwärtssicher). `repriceError` akzeptiert bool ODER Fehlertext.
// `priceChangePending` = der Server hat eine Preisänderung gemeldet, über die der
// Kunde noch nicht entschieden hat (TG22 Golden Offer Contract).
// `priceInputsRequired` = das Angebot braucht die Art der Lieferadresse, und sie ist nicht
// gebunden (TG22 Residential). `components` überschreibt optional die Bestandteile; ohne Angabe
// gelten die des gebundenen Angebots (ohne Absicherung) bzw. der Neubepreisung (mit Absicherung).
// Bestandteile werden NUR zu einem bestätigten Preis ausgegeben und nie addiert.
export function buildBookingPriceView({
  tariff,
  insuranceType,
  repriceResult,
  repriceLoading = false,
  repriceStale = false,
  repriceError = false,
  insValid = true,
  priceChangePending = false,
  priceInputsRequired = false,
  // JUM-06: der Anbieterentwurf trägt noch die Versicherung einer früheren Neubepreisung und wird
  // gerade ohne Versicherung neu bepreist — bis das bestätigt ist, ist auch „keine“ nicht bestätigt.
  draftResetPending = false,
  components,
} = {}) {
  const t = tariff || {};
  const totals = (repriceResult && typeof repriceResult === "object"
    && repriceResult.totals && typeof repriceResult.totals === "object")
    ? repriceResult.totals : null;
  const hasError = repriceError === true || (typeof repriceError === "string" && repriceError.trim() !== "");

  // ── Basis-Versandpreis + „ab"-Preselect (REINE ANZEIGE) ─────────────────────
  // Der Versandpreis des Tarifs ist IMMER bekannt und wird in jedem Status ausgewiesen
  // (auch während Reprice/Fehler) — er ist NIE der bestätigte Gesamtpreis. Der „ab"-
  // Preselect stammt aus den belegten Tariffeldern (nur positiv; sonst null) und dient
  // ausschließlich der „ab X €"-Anzeige der gewählten Stufe. Er wird NIEMALS zum
  // Gesamtpreis addiert.
  const baseShippingNet   = num(t.netPrice);
  const baseShippingVat   = num(t.vatAmount);
  const baseShippingGross = num(t.finalPrice);
  const insDet = (t.insuranceDetails && typeof t.insuranceDetails === "object") ? t.insuranceDetails : null;
  const standardPreselectGross = pos(insDet?.extraInsurancePriceBruttoPreselect);
  const premiumPreselectGross  = pos(insDet?.extraInsurancePremiumPriceBruttoPreselect);
  const selectedInsuranceType = isInsuredType(insuranceType) ? insuranceType : "none";
  const selectedInsurancePreselectGross =
    selectedInsuranceType === "standard" ? standardPreselectGross :
    selectedInsuranceType === "premium"  ? premiumPreselectGross  : null;
  const hasInsurancePreselect = selectedInsurancePreselectGross != null;

  // ── Status ──
  // Eine gemeldete Preisänderung sticht jeden anderen Zustand: der zuletzt bestätigte
  // Betrag — Basistarif ODER Neubepreisung — ist damit nicht mehr bestätigt. Schließt der
  // Kunde den Dialog, bleibt dieser Zustand; er endet erst mit Übernahme oder Neuberechnung.
  let status;
  if (priceChangePending === true)        status = PRICE_STATUS.PRICE_CHANGED;
  else if (priceInputsRequired === true)  status = PRICE_STATUS.PRICE_INPUTS_REQUIRED;
  else if (!isInsuredType(insuranceType)) {
    status = draftResetPending === true ? PRICE_STATUS.REPRICING : PRICE_STATUS.BASE_CONFIRMED;
  }
  else if (hasError)                      status = PRICE_STATUS.REPRICE_ERROR;
  else if (insValid === false)            status = PRICE_STATUS.REPRICE_REQUIRED;
  else if (repriceLoading)                status = PRICE_STATUS.REPRICING;
  else if (repriceStale)                  status = totals ? PRICE_STATUS.STALE : PRICE_STATUS.REPRICING;
  else if (totals)                        status = PRICE_STATUS.REPRICE_CONFIRMED;
  else                                    status = PRICE_STATUS.REPRICE_REQUIRED; // fail-closed

  // Zusätzliche Transportabsicherung: versicherter Betrag und Selbstbeteiligung — reine
  // Anzeige, ausschließlich aus der Serverantwort der Neubepreisung (nie aus dem Tarif,
  // nie aus der Eingabe). Im Stufenmodell stehen beide auf null.
  const coverIns = selectedInsuranceType === INSURANCE_TYPE_TRANSIT_COVER
    && repriceResult && typeof repriceResult === "object"
    && repriceResult.insurance && typeof repriceResult.insurance === "object"
    ? repriceResult.insurance : null;
  const coverInsuredAmount = coverIns ? num(coverIns.coverValue) : null;
  const coverExcessValue   = coverIns ? num(coverIns.excessValue) : null;

  const base = {
    status,
    source: null,
    coverInsuredAmount, coverExcessValue,
    shippingNet: null, shippingVat: null, shippingGross: null,
    insuranceGross: null, totalNet: null, totalGross: null,
    // Immer verfügbarer Basis-Versandpreis (Referenz, nie bestätigter Gesamtpreis).
    baseShippingNet, baseShippingVat, baseShippingGross,
    // „ab"-Preselect der gewählten Stufe (+ beide Rohwerte); reine Anzeige.
    selectedInsuranceType, selectedInsurancePreselectGross, hasInsurancePreselect,
    standardPreselectGross, premiumPreselectGross,
    hasConfirmedPrice: false,
    isRepricing: status === PRICE_STATUS.REPRICING,
    isStale:     status === PRICE_STATUS.STALE,
    hasError:    status === PRICE_STATUS.REPRICE_ERROR,
    isPriceChanged: status === PRICE_STATUS.PRICE_CHANGED,
    isPriceInputsRequired: status === PRICE_STATUS.PRICE_INPUTS_REQUIRED,
    // Serverbestandteile des bestätigten Preises (Versand, Zuschlag, Absicherung) — sonst null.
    components: null,
  };

  if (status === PRICE_STATUS.PRICE_CHANGED) {
    // Kein bestätigter Betrag, keine Versandreferenz — der Basis-Versandpreis steht nur
    // noch als Rohwert im Modell (baseShipping*), die Anzeige zeigt ihn in diesem Zustand
    // nicht (bookingSummaryView.priceInfo, PriceSummaryModule).
    return { ...base, source: null, hasConfirmedPrice: false };
  }

  if (status === PRICE_STATUS.PRICE_INPUTS_REQUIRED) {
    // Der Angebotspreis ist vorläufig: als Referenz sichtbar, nie bestätigt, keine Bestandteile.
    return { ...base, source: null, ...shippingRefFromTariff(t), hasConfirmedPrice: false };
  }

  if (status === PRICE_STATUS.BASE_CONFIRMED) {
    const net = num(t.netPrice), vat = num(t.vatAmount), gross = num(t.finalPrice);
    return {
      ...base, source: "tariff",
      shippingNet: net, shippingVat: vat, shippingGross: gross,
      insuranceGross: 0, totalNet: net, totalGross: gross,
      hasConfirmedPrice: gross != null, // fail-closed ohne belegten Bruttopreis
      components: readPriceComponents(components !== undefined ? components : t.priceComponents),
    };
  }

  if (status === PRICE_STATUS.REPRICE_CONFIRMED) {
    const p = fromTotals(totals);
    return { ...base, source: "reprice", ...p, hasConfirmedPrice: p.totalGross != null && p.insuranceGross != null,
             components: readPriceComponents(components !== undefined ? components : repriceResult.components) };
  }

  if (status === PRICE_STATUS.STALE) {
    // Alter Serverpreis nur SEKUNDÄR (nicht bestätigt).
    return { ...base, source: "reprice", ...fromTotals(totals), hasConfirmedPrice: false };
  }

  if (status === PRICE_STATUS.REPRICING) {
    // Ein evtl. noch vorhandener vorheriger Serverpreis darf sichtbar bleiben, aber
    // nicht bestätigt; sonst nur Versand-Referenz.
    if (totals) return { ...base, source: "reprice", ...fromTotals(totals), hasConfirmedPrice: false };
    return { ...base, source: null, ...shippingRefFromTariff(t), hasConfirmedPrice: false };
  }

  // REPRICE_ERROR | REPRICE_REQUIRED → kein bestätigter Gesamtpreis, kein Schätzpreis.
  return { ...base, source: null, ...shippingRefFromTariff(t), hasConfirmedPrice: false };
}

// Buchungs-Gate aus dem View-Model: nur ein bestätigter Preis (Basis ODER Reprice)
// erlaubt die Buchung. Identisch zum bisherigen `insuranceBlocksBooking`.
export function priceViewBlocksBooking(view) {
  const s = view && view.status;
  return !(s === PRICE_STATUS.BASE_CONFIRMED || s === PRICE_STATUS.REPRICE_CONFIRMED);
}

// ── Kartenpreis-Ableitung (rein) ─────────────────────────────────────────────
// „none" → immer 0,00 (kein „ab"). Standard/Premium: exakter Aufpreis (+X) NUR wenn
// diese Stufe AUSGEWÄHLT und der Reprice bestätigt ist; sonst der Preselect-„ab"-
// Betrag; fehlt der Preselect → „Preis nach Warenwert". Es wird bewusst KEINE zweite
// Reprice-Anfrage für die nicht gewählte Stufe ausgelöst.
export function insuranceCardPrice({ cardType, selectedType, view, preselectGross }) {
  if (cardType === "none") return { kind: "zero", value: 0 };
  const isSelected = selectedType === cardType;
  const exact = num(view && view.insuranceGross);
  if (isSelected && view && view.status === PRICE_STATUS.REPRICE_CONFIRMED && exact != null) {
    return { kind: "exact", value: exact };
  }
  const pre = num(preselectGross);
  if (pre != null) return { kind: "preselect", value: pre };
  return { kind: "unknown", value: null };
}

// ── Progressive-Disclosure-Helfer (rein) ─────────────────────────────────────
export function insuranceValueFieldsVisible(insuranceType) {
  return isInsuredType(insuranceType);
}

// Solange der Nutzer den Versicherungswert nicht manuell überschrieben hat, spiegelt
// er den Warenwert 1:1 (als String, keine Rundung/Kappung). Rückgabe: zu setzender
// String ODER null (= nicht ändern).
export function autofillInsuranceValue({ goodsValue, insuranceValueManual }) {
  if (insuranceValueManual) return null;
  return typeof goodsValue === "string" ? goodsValue : (goodsValue == null ? "" : String(goodsValue));
}

// Warenwert oberhalb des maximal versicherbaren Betrags → Anpassungsbereich sichtbar,
// Erklärung anzeigen, Reprice/Buchung blockieren (via insValid=false außerhalb).
export function goodsExceedsInsuranceMax(goodsValue) {
  const g = num(goodsValue);
  return g != null && g > INSURANCE_VALUE_MAX;
}
