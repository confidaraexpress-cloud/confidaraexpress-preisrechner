// ─────────────────────────────────────────────────────────────────────────────
// Individuelle Versandtarife (Adminbereich, Betreiberentscheidung 2026-11-10) —
// reine, framework-freie Logik für die Karte „Individuelle Versandtarife“.
//
// Sieben Transglobal-Produkte, je Kunde ein eigener Prozentsatz, der den
// Standard- bzw. Expressaufschlag des Kontos für genau dieses Produkt ERSETZT;
// dazu der Preisvergleich gegen den CE-Preis über JUMiNGO desselben Kunden.
//
// PROZENTVERTRAG wie utils/customerMarkup.mjs: 35 = 35 %, 17,5 = 17,5 %, 0 = 0 %
// (ein echter Wert), leer = „Standard verwenden“ (das Backend erhält null).
//
// AUTORITÄT: Der Server rechnet. Diese Datei formatiert Cent-Beträge und Prozent-
// werte, die der Server liefert; sie enthält keine Preisformel. Eine Vorschau mit
// geänderten Sätzen entsteht ausschließlich über den Vorschau-Endpunkt.
// ─────────────────────────────────────────────────────────────────────────────

import { parseMarkupInput, formatMarkupPercent, markupInputValue, MARKUP_INPUT_ERRORS } from "./customerMarkup.mjs";

export const TARIFF_PRODUCT_KEYS = Object.freeze([22, 23, 29, 84, 85, 86, 87]);

export const TARIFF_TEXTS = Object.freeze({
  sectionTitle: "Individuelle Versandtarife",
  intro: "Ein eigener Prozentsatz ersetzt für dieses Produkt den Standard- bzw. Expressaufschlag des Kontos. Leer heißt: Standard verwenden. 0 ist ein echter Wert.",
  loading: "Versandtarife werden geladen …",
  loadError: "Die individuellen Versandtarife konnten nicht geladen werden.",
  reload: "Erneut laden",
  colProduct: "Versandtarif",
  colMarkup: "Aufschlag",
  colEffective: "Wirksam",
  useStandard: "Standard verwenden",
  unsaved: "Ungespeicherte Änderungen",
  unsavedOne: "Ungespeicherte Änderung",
  noChanges: "Keine Änderungen",
  save: "Tarifaufschläge speichern",
  saving: "Wird gespeichert …",
  saved: "Die Tarifaufschläge wurden gespeichert. Sie gelten für neue Preisanfragen dieses Kunden.",
  effectHint: "Gilt für neue Preisanfragen dieses Kunden. Bereits angezeigte Angebote melden beim Buchen eine Preisänderung und werden neu berechnet.",
  individual: "individuell",
  draft: "Entwurf",
  fromAccountStandard: "Standardaufschlag des Kontos",
  fromAccountExpress: "Expressaufschlag des Kontos",
  comparisonTitle: "Vorläufiger Preisvergleich",
  comparisonIntro: "CE-Verkaufspreis über Transglobal gegen den CE-Verkaufspreis über JUMiNGO für fünf Beispielpakete. Transglobal-Preise sind Vorabpreise der Preisauskunft (Geschäftsadressen, ohne Zusatzleistungen). Alle Beträge netto zzgl. MwSt.",
  destination: "Zielland",
  refresh: "Preise aktualisieren",
  refreshing: "Preise werden abgerufen …",
  refreshHint: "Ruft für die fünf Beispielpakete neue Preise bei beiden Einkaufsquellen ab.",
  noBase: "Noch keine Preise abgerufen. „Preise aktualisieren“ holt die Vergleichsbasis für das gewählte Zielland.",
  refreshRequired: "Aktualisierung erforderlich",
  refreshRequiredDetail: "Die Vergleichsbasis passt nicht mehr (Zielland, Kunde oder Kontoaufschlag geändert oder älter als 24 Stunden). Bitte Preise aktualisieren.",
  previewing: "Vorschau wird berechnet …",
  previewNote: "Vorschau mit den eingegebenen Sätzen — noch nicht gespeichert.",
  stand: "Stand",
  rowProduct: "Paket",
  rowTg: "CE über TG",
  rowJumingo: "CE über JUMiNGO",
  rowDiff: "Unterschied",
  comparisonOf: "Preisvergleich",
  customTitle: "Eigenes Paket vergleichen",
  customWeight: "Gewicht",
  customLength: "Länge",
  customWidth: "Breite",
  customHeight: "Höhe",
  compare: "Vergleichen",
  comparing: "Vergleich läuft …",
  customInvalid: "Eingabe ungültig",
  customHint: "Zielland und Versandbedingungen wie oben. Der Vergleich fragt beide Einkaufsquellen für genau dieses Paket an.",
  detailsTitle: "Vergleichsdetails",
  detailSender: "Absender",
  detailRecipient: "Empfänger",
  detailCollection: "Abholung",
  detailHandover: "Übergabe",
  detailHandoverPickup: "Fahrerabholung",
  detailAddressType: "Adressart",
  detailAddressBusiness: "Geschäftsadressen (Absender und Empfänger)",
  detailPackages: "Packstücke",
  detailExtras: "Zusatzleistungen",
  detailExtrasNone: "keine (keine Absicherung, keine Optionen)",
  detailPriceBasis: "Preisgrundlage",
  detailPriceBasisText: "Transglobal: Vorabpreis der Preisauskunft (Minimalquote, Geschäftsadresse); JUMiNGO: Ratenauskunft desselben Kundenkontos. Preise netto.",
  disclaimer: "Beispielpreise für diese Versanddaten – keine Preisgarantie für andere Sendungen.",
  unavailable: "Tarif nicht verfügbar",
  noReference: "Kein vergleichbares Angebot",
  // Nicht belastbare Referenz: die JUMiNGO-Spalte nennt den Servergrund, die Unterschiedsspalte das Ergebnis.
  notComparable: "Kein belastbarer Vergleich",
  referenceNotComparable: "Nicht vergleichbar",
  referenceCollectionMismatch: "Abweichender Abholtag",
  referenceCollectionMissing: "Abholtag nicht belegt",
  referenceDeliveryMismatch: "Andere Zustellzusage",
  referenceDeliveryUnverified: "Zustellzusage nicht belegt",
  fetchFailed: "Preise konnten nicht abgerufen werden",
  cheaper: "günstiger",
  moreExpensive: "teurer",
  equal: "Gleich teuer",
  comparedTo: "als über JUMiNGO",
  examplePrices: "Beispielpreise",
  scenarioPartial: "Eine Einkaufsquelle hat nicht geantwortet – Teilergebnis.",
  scenarioFailed: "Preise konnten nicht abgerufen werden.",
});

export const TARIFF_SAVE_ERRORS = Object.freeze({
  INVALID_TARIFF_MARKUP_PERCENT: "Ein Aufschlag ist ungültig: erlaubt sind 0 bis 100 Prozent mit höchstens zwei Nachkommastellen.",
  UNKNOWN_TARIFF_PRODUCT: "Für dieses Versandprodukt ist kein individueller Aufschlag vorgesehen.",
  INVALID_TARIFF_MARKUP_REQUEST: "Die Änderung konnte nicht übermittelt werden. Bitte die Seite neu laden.",
  404: "Das Kundenkonto wurde nicht gefunden.",
  429: "Zu viele Änderungen in kurzer Zeit. Bitte in einigen Minuten erneut versuchen.",
  default: "Die Tarifaufschläge konnten nicht gespeichert werden. Bitte erneut versuchen.",
});

export const COMPARISON_ERRORS = Object.freeze({
  COMPARISON_STALE: TARIFF_TEXTS.refreshRequiredDetail,
  COMPARISON_EXPIRED: TARIFF_TEXTS.refreshRequiredDetail,
  EXAMPLE_ADDRESS_MISSING: "Für dieses Zielland ist noch keine geprüfte Beispieladresse hinterlegt.",
  INVALID_DESTINATION_COUNTRY: "Bitte ein Zielland des Launch-Scopes wählen.",
  INVALID_CUSTOM_PACKAGE: "Bitte Gewicht, Länge, Breite und Höhe des Pakets gültig angeben.",
  429: "Zu viele Aktualisierungen in kurzer Zeit. Bitte in einigen Minuten erneut versuchen.",
  default: "Preise konnten nicht abgerufen werden. Bitte erneut versuchen.",
});

const numOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v) => (typeof v === "string" ? v : "");

// ── Serverantwort GET/PUT tariff-markups → geprüftes Anzeigemodell ──────────
export function selectTariffMarkups(payload) {
  const p = payload && typeof payload === "object" ? payload : null;
  if (!p || !Array.isArray(p.products)) return null;
  const products = p.products
    .map((x) => ({
      productKey: Number(x.productKey),
      label: text(x.label),
      carrier: text(x.carrier),
      pricingClass: x.pricingClass === "EXPRESS" ? "EXPRESS" : "STANDARD",
      inheritedPercent: numOrNull(x.inheritedPercent),
      inheritedSource: x.inheritedSource === "express" ? "express" : "standard",
      overridePercent: numOrNull(x.overridePercent),
      effectivePercent: numOrNull(x.effectivePercent),
      source: ["product", "express", "standard"].includes(x.source) ? x.source : "standard",
      setAt: text(x.setAt) || null,
      setBy: numOrNull(x.setBy),
    }))
    .filter((x) => Number.isInteger(x.productKey) && x.label);
  if (products.length === 0) return null;
  const account = p.account && typeof p.account === "object" ? p.account : {};
  const comparison = p.comparison && typeof p.comparison === "object" ? p.comparison : {};
  return {
    userId: numOrNull(p.userId),
    account: { standardPercent: numOrNull(account.standardPercent), expressPercent: numOrNull(account.expressPercent) },
    products,
    comparison: {
      destinations: Array.isArray(comparison.destinations)
        ? comparison.destinations.filter((d) => d && typeof d.country === "string").map((d) => ({ country: d.country.toUpperCase(), hasExampleAddress: d.hasExampleAddress === true }))
        : [],
      sender: comparison.sender && typeof comparison.sender === "object" ? comparison.sender : null,
      standardPackages: Array.isArray(comparison.standardPackages) ? comparison.standardPackages : [],
      refreshLimit: comparison.refreshLimit && typeof comparison.refreshLimit === "object" ? comparison.refreshLimit : null,
      maxAgeHours: numOrNull(comparison.maxAgeHours),
    },
  };
}

// ── Eingabe je Zeile ────────────────────────────────────────────────────────
// Leer = „Standard verwenden“ (null). Sonst derselbe Prozentvertrag wie der Kundenaufschlag.
export function parseTariffInput(raw) {
  const s = typeof raw === "string" ? raw.trim() : raw === null || raw === undefined ? "" : String(raw);
  if (s === "") return { ok: true, value: null, code: null, error: null };
  return parseMarkupInput(s);
}
export const TARIFF_INPUT_ERRORS = MARKUP_INPUT_ERRORS;

// Eingabewert aus dem gespeicherten Produktsatz („35,00“) — null → „“.
export const tariffInputValue = (percent) => (percent === null || percent === undefined ? "" : markupInputValue(percent));

// Entwürfe aus dem Servermodell: { "22": "35,00", "23": "", … }
export function draftsFromProducts(products) {
  const out = {};
  for (const p of Array.isArray(products) ? products : []) out[String(p.productKey)] = tariffInputValue(p.overridePercent);
  return out;
}

// Änderungen gegenüber dem gespeicherten Stand: nur Zeilen, deren geparster Wert abweicht.
//   { changes: { "22": 35, "84": null }, count, invalid: { "23": "Text" } }
export function tariffDraftChanges(products, drafts) {
  const changes = {};
  const invalid = {};
  let count = 0;
  for (const p of Array.isArray(products) ? products : []) {
    const key = String(p.productKey);
    const raw = drafts && Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : tariffInputValue(p.overridePercent);
    const parsed = parseTariffInput(raw);
    if (!parsed.ok) { invalid[key] = parsed.error; continue; }
    const saved = p.overridePercent === null || p.overridePercent === undefined ? null : Number(p.overridePercent);
    if (parsed.value !== saved) { changes[key] = parsed.value; count += 1; }
  }
  return { changes, count, invalid };
}

export const buildTariffMarkupsBody = (changes) => ({ markups: { ...(changes || {}) } });

// Der wirksame Satz einer Zeile unter Berücksichtigung des Entwurfs (nur Anzeige; der Server rechnet).
//   → { percent, source: "product"|"express"|"standard"|"draft", draft: boolean }
export function effectiveForRow(product, draftRaw) {
  const parsed = parseTariffInput(draftRaw);
  const saved = product.overridePercent === null || product.overridePercent === undefined ? null : Number(product.overridePercent);
  if (!parsed.ok || parsed.value === saved) {
    return { percent: product.effectivePercent, source: product.source, draft: false };
  }
  if (parsed.value === null) return { percent: product.inheritedPercent, source: product.inheritedSource, draft: true };
  return { percent: parsed.value, source: "draft", draft: true };
}

export function sourceLabel(source) {
  if (source === "product" || source === "draft") return TARIFF_TEXTS.individual;
  if (source === "express") return TARIFF_TEXTS.fromAccountExpress;
  return TARIFF_TEXTS.fromAccountStandard;
}

export function effectiveLine(eff) {
  if (!eff || eff.percent === null || eff.percent === undefined) return "—";
  const basis = `${formatMarkupPercent(eff.percent)} ${sourceLabel(eff.source)}`;
  return eff.draft ? `${basis} (${TARIFF_TEXTS.draft})` : basis;
}

// ── Beträge und Differenzen (Server liefert Cent) ───────────────────────────
export function formatCents(cents) {
  if (!Number.isInteger(cents)) return "—";
  return `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
export function formatPercentValue(p) {
  if (p === null || p === undefined || !Number.isFinite(Number(p))) return null;
  return `${Math.abs(Number(p)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

// „4,60 € (26,65 %) günstiger“ · „3,20 € (18,48 %) teurer“ · „Gleich teuer“
export function differenceLabel(diff) {
  if (!diff || !Number.isInteger(diff.cents)) return null;
  if (diff.verdict === "equal" || diff.cents === 0) return TARIFF_TEXTS.equal;
  const betrag = formatCents(Math.abs(diff.cents));
  const prozent = formatPercentValue(diff.percent);
  const wort = diff.cents > 0 ? TARIFF_TEXTS.cheaper : TARIFF_TEXTS.moreExpensive;
  return prozent ? `${betrag} (${prozent}) ${wort}` : `${betrag} ${wort}`;
}

export function transglobalCellText(cell) {
  if (!cell) return TARIFF_TEXTS.fetchFailed;
  if (cell.status === "ok") return formatCents(cell.customerNetCents);
  if (cell.status === "unavailable") return TARIFF_TEXTS.unavailable;
  return TARIFF_TEXTS.fetchFailed;
}
// Wortlaut einer nicht belastbaren Referenz nach ihrem Servergrund (REFERENCE_REASON des Backends) — steht in der
// JUMiNGO-Spalte; die Unterschiedsspalte sagt dann „Kein belastbarer Vergleich“.
export function referenceReasonText(reason) {
  switch (reason) {
    case "collection_date_mismatch": return TARIFF_TEXTS.referenceCollectionMismatch;
    case "collection_date_missing": return TARIFF_TEXTS.referenceCollectionMissing;
    case "delivery_promise_mismatch": return TARIFF_TEXTS.referenceDeliveryMismatch;
    case "delivery_promise_unverified": return TARIFF_TEXTS.referenceDeliveryUnverified;
    default: return TARIFF_TEXTS.referenceNotComparable;
  }
}
export function referenceCellText(cell) {
  if (!cell) return TARIFF_TEXTS.fetchFailed;
  if (cell.status === "ok") return formatCents(cell.customerNetCents);
  if (cell.status === "not_comparable") return referenceReasonText(cell.reason);
  if (cell.status === "no_reference") return TARIFF_TEXTS.noReference;
  return TARIFF_TEXTS.fetchFailed;
}
// Die Unterschiedsspalte: Differenz oder der Grund, warum es keine gibt.
export function differenceCellText(row) {
  if (!row) return "—";
  const d = differenceLabel(row.difference);
  if (d) return d;
  if (row.transglobal && row.transglobal.status !== "ok") return "—";
  if (row.reference && row.reference.status === "not_comparable") return TARIFF_TEXTS.notComparable;
  if (row.reference && row.reference.status === "no_reference") return TARIFF_TEXTS.noReference;
  return "—";
}

export function packageLabel(pkg) {
  if (!pkg) return "—";
  const kg = Number(pkg.weightKg);
  const kgText = Number.isFinite(kg) ? kg.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "?";
  return `${kgText} kg · ${pkg.lengthCm} × ${pkg.widthCm} × ${pkg.heightCm} cm`;
}

// ── Vergleichsbasis: Zustand und Veraltet-Erkennung ─────────────────────────
// Eine Basis gilt nur für genau: denselben Kunden, dasselbe Zielland, dieselben Kontosätze
// (Standard/Express) und innerhalb ihrer Lebensdauer. Sonst „Aktualisierung erforderlich“.
export function comparisonBaseStatus({ base, userId, destination, account, now = Date.now() } = {}) {
  if (!base) return "missing";
  if (numOrNull(base.userId) !== numOrNull(userId)) return "stale";
  if (text(base.destinationCountry).toUpperCase() !== text(destination).toUpperCase()) return "stale";
  const basis = base.accountMarkup || {};
  if (account && (numOrNull(basis.standardPercent) !== numOrNull(account.standardPercent) || numOrNull(basis.expressPercent) !== numOrNull(account.expressPercent))) return "stale";
  const ablauf = Date.parse(base.expiresAt || "");
  if (Number.isFinite(ablauf) && ablauf <= now) return "expired";
  return "ok";
}

export function selectComparison(payload, userId) {
  const p = payload && typeof payload === "object" ? payload : null;
  if (!p || typeof p.runId !== "string" || !Array.isArray(p.products) || !Array.isArray(p.scenarios)) return null;
  return { ...p, userId: numOrNull(userId) };
}

// Zielländer: Deutschland zuerst, danach nach deutschem Namen.
export function destinationOptions(destinations, countryNames) {
  const name = (code) => (countryNames && countryNames[code]) || code;
  return [...(destinations || [])]
    .map((d) => ({ code: d.country, name: name(d.country), hasExampleAddress: d.hasExampleAddress !== false }))
    .sort((a, b) => (a.code === "DE" ? -1 : b.code === "DE" ? 1 : a.name.localeCompare(b.name, "de")));
}

// ── Eigenes Paket ───────────────────────────────────────────────────────────
// Komma oder Punkt; Grenzen entscheidet der Server (dieselben wie im Kundenrechner).
export function parseCustomPackageInput({ weight, length, width, height } = {}) {
  const zahl = (v) => {
    const s = String(v ?? "").trim().replace(",", ".");
    if (s === "" || !/^\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const out = { weightKg: zahl(weight), lengthCm: zahl(length), widthCm: zahl(width), heightCm: zahl(height) };
  const ok = Object.values(out).every((v) => v !== null);
  return ok ? { ok: true, value: out } : { ok: false, value: null, error: COMPARISON_ERRORS.INVALID_CUSTOM_PACKAGE };
}

// ── Fehlerübersetzung ───────────────────────────────────────────────────────
export function tariffSaveError(status, body) {
  if (status === 401 || status === 403) return null; // zentraler Redirect
  const code = body && typeof body.code === "string" ? body.code : null;
  const base = (code && TARIFF_SAVE_ERRORS[code]) || TARIFF_SAVE_ERRORS[status] || TARIFF_SAVE_ERRORS.default;
  const productKey = body && body.productKey !== undefined ? String(body.productKey) : null;
  return { text: base, productKey, code };
}
export function comparisonError(status, body) {
  if (status === 401 || status === 403) return null;
  const code = body && typeof body.code === "string" ? body.code : null;
  const stale = code === "COMPARISON_STALE" || code === "COMPARISON_EXPIRED";
  return { text: (code && COMPARISON_ERRORS[code]) || COMPARISON_ERRORS[status] || COMPARISON_ERRORS.default, code, stale };
}

export function formatStand(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}
export function formatDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}
