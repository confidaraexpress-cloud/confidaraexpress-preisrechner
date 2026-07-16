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
// Framework-frei und mit `node --test` prüfbar.
// ─────────────────────────────────────────────────────────────────────────────

// Zentrale Frontend-Grenze für den Versicherungswert. Entspricht der bereits
// bestehenden Inline-Grenze (BookingPage/InsuranceModule) und der Backend-Regel
// (extra_insurance_value 1..20000). Hier nur zentralisiert — kein neuer Wert.
export const INSURANCE_VALUE_MAX = 20000;

export const PRICE_STATUS = {
  BASE_CONFIRMED:    "BASE_CONFIRMED",    // keine Versicherung → Tarifpreis, bestätigt
  REPRICE_REQUIRED:  "REPRICE_REQUIRED",  // Standard/Premium, Werte unvollständig/ungültig
  REPRICING:         "REPRICING",         // Request läuft ODER Debounce wartet
  REPRICE_CONFIRMED: "REPRICE_CONFIRMED", // Preis vollständig aus repriceResult.totals
  REPRICE_ERROR:     "REPRICE_ERROR",     // Reprice fehlgeschlagen
  STALE:             "STALE",             // Auswahl/Eingabe seit letztem Reprice geändert
};

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

export function isInsuredType(insuranceType) {
  return insuranceType === "standard" || insuranceType === "premium";
}

// Zerlegt die Server-Totals (splitInsurancePricing) in die Anzeigefelder. `totalNet`
// = Versandnetto + Versicherung (Versicherung ist steuerfrei, netto=brutto) — reine
// Summe zweier BELEGTER Serverwerte, KEINE Prämienberechnung.
function fromTotals(totals) {
  const shippingNet   = num(totals.customerShippingNet);
  const shippingVat   = num(totals.shippingVat);
  const shippingGross = num(totals.customerShippingGross);
  const insuranceGross = num(totals.insuranceGross);
  const totalGross    = num(totals.customerTotalGross);
  const totalNet = (shippingNet != null && insuranceGross != null) ? round2(shippingNet + insuranceGross) : null;
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
export function buildBookingPriceView({
  tariff,
  insuranceType,
  repriceResult,
  repriceLoading = false,
  repriceStale = false,
  repriceError = false,
  insValid = true,
} = {}) {
  const t = tariff || {};
  const totals = (repriceResult && typeof repriceResult === "object"
    && repriceResult.totals && typeof repriceResult.totals === "object")
    ? repriceResult.totals : null;
  const hasError = repriceError === true || (typeof repriceError === "string" && repriceError.trim() !== "");

  // ── Status ──
  let status;
  if (!isInsuredType(insuranceType))      status = PRICE_STATUS.BASE_CONFIRMED;
  else if (hasError)                      status = PRICE_STATUS.REPRICE_ERROR;
  else if (insValid === false)            status = PRICE_STATUS.REPRICE_REQUIRED;
  else if (repriceLoading)                status = PRICE_STATUS.REPRICING;
  else if (repriceStale)                  status = totals ? PRICE_STATUS.STALE : PRICE_STATUS.REPRICING;
  else if (totals)                        status = PRICE_STATUS.REPRICE_CONFIRMED;
  else                                    status = PRICE_STATUS.REPRICE_REQUIRED; // fail-closed

  const base = {
    status,
    source: null,
    shippingNet: null, shippingVat: null, shippingGross: null,
    insuranceGross: null, totalNet: null, totalGross: null,
    hasConfirmedPrice: false,
    isRepricing: status === PRICE_STATUS.REPRICING,
    isStale:     status === PRICE_STATUS.STALE,
    hasError:    status === PRICE_STATUS.REPRICE_ERROR,
  };

  if (status === PRICE_STATUS.BASE_CONFIRMED) {
    const net = num(t.netPrice), vat = num(t.vatAmount), gross = num(t.finalPrice);
    return {
      ...base, source: "tariff",
      shippingNet: net, shippingVat: vat, shippingGross: gross,
      insuranceGross: 0, totalNet: net, totalGross: gross,
      hasConfirmedPrice: gross != null, // fail-closed ohne belegten Bruttopreis
    };
  }

  if (status === PRICE_STATUS.REPRICE_CONFIRMED) {
    const p = fromTotals(totals);
    return { ...base, source: "reprice", ...p, hasConfirmedPrice: p.totalGross != null && p.insuranceGross != null };
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
