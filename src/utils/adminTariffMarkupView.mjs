// ─────────────────────────────────────────────────────────────────────────────
// Versandpreise optimieren (Adminbereich, Preisoptimierung 2026-11-17) — reine,
// framework-freie Logik für die Karte auf der Kundendetailseite.
//
// Je Kunde: sieben Transglobal-Produkte und neun JUMiNGO-Preisgruppen, je ein Satz
// „alle Gewichte“ und je ein Satz für vier Gewichtsklassen (Betreiberentscheidung
// M.1). Ein Satz ERSETZT den Konto- bzw. Expressaufschlag, er addiert nie.
//
// Gemeinsame Tarifübersicht (finale Vereinfachung 2026-11-17): je Transglobal-Produkt
// ein Bereich mit Transglobal links und dem JUMiNGO-Registerpaar rechts (tariffAreas),
// je Gewichtsklasse dasselbe Beispielpaket für beide Seiten (commonScenarioId) und vier
// Zahlen je Anbieter — Unser Einkauf, Kunde zahlt, Unser Verdienst, Ihr Aufschlag —
// aus classMetrics. Kernaussage (verdictOf) und Vergleichsbeziehung (pairLink) nur aus
// Vergleichsurteilen des Servers; eine Empfehlung gilt nur mit vergleichbarem Angebot
// (reliableRecommendation) — ohne Vergleich ist der Serverwert die Untergrenze.
//
// PROZENTVERTRAG wie utils/customerMarkup.mjs: 35 = 35 %, 17,5 = 17,5 %, 0 = 0 %
// (ein echter Wert), leer = „kein eigener Satz“ (das Backend erhält null).
//
// AUTORITÄT: Der Server rechnet. Diese Datei wählt aus und formatiert Cent-Beträge
// und Prozentwerte, die der Server liefert (Projektion des Preisvergleichs); sie
// enthält keine Preisformel. Die Untergrenze prüft sie nur vorab für eine sofortige
// Meldung am Feld — dieselbe Regel wie der Server (neuer Wert ≥ Untergrenze, ein
// unverändert gebliebener Bestandswert bleibt erlaubt); verbindlich ist der Server.
// ─────────────────────────────────────────────────────────────────────────────

import { parseMarkupInput, markupInputValue, MARKUP_INPUT_ERRORS } from "./customerMarkup.mjs";

export const TARIFF_PROVIDERS = Object.freeze(["transglobal", "jumingo"]);
export const PROVIDER_LABELS = Object.freeze({ transglobal: "Transglobal", jumingo: "JUMiNGO" });
export const WEIGHT_CLASS_ALL = 0;

// Wortlaute der Karte. Vereinfachung 2026-11-17: vorne nur drei Kennzahlen und zwei Aktionen je Gewichtsklasse,
// alles Weitere steht unter „Details anzeigen“.
export const TARIFF_TEXTS = Object.freeze({
  sectionTitle: "Versandpreise optimieren",
  individual: "individuell",
  loading: "Versandpreise werden geladen …",
  loadError: "Die Versandpreise dieses Kunden konnten nicht geladen werden.",
  reload: "Erneut laden",
  destination: "Zielland",
  refresh: "Preise vergleichen",
  refreshing: "Preise werden verglichen …",
  stand: "Stand",
  noBase: "Empfehlungen erscheinen nach „Preise vergleichen“.",
  refreshRequired: "Preisvergleich erneut ausführen",
  refreshRequiredDetail: "Der letzte Preisvergleich ist älter als 24 Stunden oder gehört zu einem anderen Zielland.",
  previewing: "Vorschau wird berechnet …",
  previewFailed: "Keine Vorschau",
  notCompared: "Noch nicht verglichen",
  notComparedText: "„Preise vergleichen“ holt die Einkaufspreise für Empfehlung und Zustand.",
  current: "Ihr Aufschlag",
  recommended: "Empfohlen",
  upTo: "bis",
  perShipment: "pro Sendung",
  unsaved: "ungespeicherte Änderungen",
  unsavedOne: "ungespeicherte Änderung",
  weightTabs: "Gewichtsklasse",
  metricMore: "Mehr pro Sendung",
  metricLess: "Weniger pro Sendung",
  noRecommendation: "Keine Empfehlung verfügbar",
  fits: "Passt bereits",
  needsComparison: "Erst Preise vergleichen",
  withSameDay: "mit Abholzuschlag",
  gapUnavailable: "Tarif hier nicht verfügbar",
  gapFetch: "Preise nicht abrufbar",
  gapFetchComparison: "Vergleichspreise nicht abrufbar",
  gapNoComparable: "Kein vergleichbares Angebot",
  noExample: "Kein Beispielpaket",
  noChange: "Keine Änderung vorgeschlagen",
  withDraft: "mit Ihrer Eingabe",
  withRecommendation: "mit Empfehlung",
  contributionExample: "Deckungsbeitrag, Beispiel",
  adopt: "Empfehlung übernehmen",
  adopted: "Empfehlung eingetragen",
  custom: "Selbst festlegen",
  newValue: "Neuer Aufschlag",
  minimum: "Mindestens",
  emptyMeans: "Leer = kein eigener Satz.",
  draftPending: "noch nicht gespeichert",
  draftWarning: "Mit Ihrer Eingabe:",
  allWeights: "Alle Gewichte",
  allWeightsHint: "Gilt für jedes Gewicht ohne eigenen Satz.",
  change: "Ändern",
  ownRate: "eigener Satz",
  noInput: "kein eigener Satz",
  details: "Details anzeigen",
  detailExample: "Beispielpaket",
  chargeable: "abrechenbar",
  detailPurchase: "Einkaufspreis",
  detailCustomer: "Kundenpreis",
  detailComparison: "Vergleichsangebot",
  detailContribution: "Deckungsbeitrag",
  detailReason: "Begründung",
  detailBasis: "Datenbasis",
  sameDayLegend: "Vergleich für UPS Standard",
  sameDayWithout: "Ohne Abholzuschlag",
  sameDayWith: "Mit Abholzuschlag",
  howRecommended: "Die sichere Obergrenze ist der höchste Aufschlag, bei dem der Kunde auch nach 3 % Einkaufsschwankung mindestens 1 % weniger zahlt als beim günstigsten vergleichbaren Angebot. Empfohlen wird die Mitte zwischen Untergrenze und Obergrenze, auf 5 % abgerundet.",
  upperBound: "Sichere Obergrenze",
  upperBoundNone: "kein sicherer Spielraum über der Untergrenze",
  limitedBy: "begrenzt durch",
  comparedSamples: "Verglichene Pakete",
  of: "von",
  samplesTitle: "Alle Beispielpakete",
  colPackage: "Paket",
  colPurchase: "Einkauf",
  colOffer: "Vergleichsangebot",
  colOfferPurchase: "Einkauf Vergleich",
  colOfferRate: "Satz Vergleich",
  colOfferCustomer: "Kunde zahlt dort",
  colDistance: "Abstand",
  colBound: "Obergrenze",
  tariffId: "Tarif-ID",
  equivalent: "gleichwertig",
  similar: "ähnlich",
  detailDestination: "Zielland",
  detailSender: "Absender",
  detailRecipient: "Empfänger",
  detailCollection: "Abholung",
  detailConditions: "Bedingungen",
  detailConditionsText: "Fahrerabholung, Geschäftsadressen, ein Packstück, keine Zusatzleistungen. Transglobal: Vorabpreis der Preisauskunft. Alle Beträge netto.",
  contributionNote: "„Unser Verdienst“ ist der Deckungsbeitrag: Kundenpreis minus Einkaufspreis, netto, je Beispielsendung. Er ist kein Nettogewinn – Fixkosten, Zahlungs- und Personalkosten sind nicht abgezogen, und er ist keine Prognose. Beispielpreise für diese Versanddaten, keine Preisgarantie für andere Sendungen.",
  noChanges: "Keine Änderungen",
  save: "Änderungen prüfen",
  discard: "Verwerfen",
  dialogTitle: "Neue Aufschläge speichern?",
  dialogText: "Die Aufschläge gelten danach für neue Preisanfragen dieses Kunden.",
  dialogConfirm: "Ja, speichern",
  dialogBusy: "Wird gespeichert …",
  dialogNote: "Bereits angezeigte Angebote melden beim Buchen eine Preisänderung. Jede Änderung wird mit Ihrem Namen protokolliert.",
  dialogBasis: "Grundlage: Preisvergleich vom",
  dialogNoBasis: "Ohne aktuellen Preisvergleich – die Wirkung auf Kundenpreise ist nicht berechnet.",
  dialogExample: "Beispielpaket",
  dialogCustomer: "Kunde zahlt",
  dialogInstead: "statt",
  dialogWarnAtRisk: "Preisvorteil gefährdet",
  dialogWarnWeak: "Empfehlung wenig belegt",
  dialogWarnNone: "Kein verlässlicher Vergleich",
  saved: "Gespeichert. Die Aufschläge gelten ab jetzt für neue Preisanfragen dieses Kunden.",
  historyTitle: "Verlauf",
  historyLoading: "Verlauf wird geladen …",
  historyEmpty: "Noch keine Änderung protokolliert.",
  historyError: "Der Verlauf konnte nicht geladen werden.",
  revert: "Auf alten Wert zurücksetzen",
  revertCurrent: "Entspricht dem aktuellen Wert.",
  revertFloor: "Alter Wert unter der Untergrenze – nicht mehr speicherbar.",
  revertUnknown: "Tarif nicht mehr vorhanden.",
  revertDone: "Der alte Wert ist eingetragen. Bitte prüfen und speichern.",
  customTitle: "Eigenes Paket vergleichen",
  customHint: "Zielland und Versandbedingungen wie beim Preisvergleich, mit den gespeicherten Aufschlägen. Fragt beide Einkaufsquellen für genau dieses Paket an.",
  customWeight: "Gewicht",
  customLength: "Länge",
  customWidth: "Breite",
  customHeight: "Höhe",
  compare: "Vergleichen",
  comparing: "Vergleich läuft …",
  colTariff: "Tarif",
  colCustomer: "Kunde zahlt",
  colCompare: "Vergleichsangebot",
  fetchFailed: "Preise konnten nicht abgerufen werden",
  // Gemeinsame Tarifübersicht (finale Vereinfachung 2026-11-17)
  overview: "Tarifübersicht",
  purchase: "Unser Einkauf",
  customerPays: "Kunde zahlt",
  earnings: "Unser Verdienst",
  numbersAfterCompare: "Einkauf, Kundenpreis und Verdienst erscheinen nach „Preise vergleichen“.",
  possible: "Möglich",
  possibleUpTo: "Möglich bis",
  withDraftLead: "Mit Ihrer Eingabe",
  exampleCalc: "Beispielrechnung",
  noHigherRate: "Ein höherer Aufschlag wird nicht empfohlen.",
  candidateLegend: "JUMiNGO-Tarif zum Vergleich",
  noPartner: "Kein JUMiNGO-Tarif zugeordnet",
  moreTariffs: "Weitere JUMiNGO-Tarife",
  moreTariffsHint: "JUMiNGO-Preisgruppen ohne festes Transglobal-Gegenstück. Ihr Aufschlag lässt sich hier genauso einstellen.",
  similarTo: "Im Preisvergleich ähnlich zu",
  before: "Bisher",
  after: "Neu",
  belowMinimumShort: "Unter",
  detailPackage: "Gewicht und Maße",
  detailPickup: "Abholtag",
  detailSurcharges: "Zuschläge",
  deviating: "abweichend",
  purchaseAdvantage: "Einkaufsvorteil",
  validUntil: "gültig bis",
});

// Fünf Zustände (Auftrag §13), je mit Farbton UND Wortlaut — nie Farbe allein.
export const STATUS_VIEW = Object.freeze({
  good: Object.freeze({ tone: "success", label: "Gut eingestellt", text: "Der Kunde zahlt sicher weniger als beim vergleichbaren Angebot, und der Aufschlag liegt nahe an der Empfehlung." }),
  more_profit: Object.freeze({ tone: "info", label: "Hier ist mehr Gewinn möglich", text: "Der Aufschlag kann steigen – der Kunde zahlt dann immer noch mindestens 1\u00a0% weniger als beim vergleichbaren Angebot." }),
  at_risk: Object.freeze({ tone: "warning", label: "Preisvorteil gefährdet", text: "Der Kunde zahlt fast so viel wie beim vergleichbaren Angebot oder mehr." }),
  below_target: Object.freeze({ tone: "error", label: "Unter dem Zielaufschlag", text: "Der Aufschlag liegt unter der Untergrenze. Er bleibt, bis Sie ihn ändern; neue Werte brauchen mindestens die Untergrenze." }),
  no_comparison: Object.freeze({ tone: "neutral", label: "Kein verlässlicher Vergleich", text: "Für dieses Gewicht gibt es kein vergleichbares Angebot – empfohlen wird die Untergrenze." }),
  not_compared: Object.freeze({ tone: "neutral", label: TARIFF_TEXTS.notCompared, text: TARIFF_TEXTS.notComparedText }),
});
const STATUS_RANG = Object.freeze(["below_target", "at_risk", "more_profit", "good", "no_comparison", "not_compared"]);

export const HINT_TEXTS = Object.freeze({
  little_headroom: "Wenig Spielraum: schon kleine Preisänderungen können den Preisvorteil aufheben.",
});
export function hintText(hint, provider) {
  if (hint === "other_provider_cheaper") {
    return provider === "jumingo" ? "Transglobal kauft dieses Gewicht günstiger ein." : "JUMiNGO kauft dieses Gewicht günstiger ein.";
  }
  return HINT_TEXTS[hint] || null;
}

export const SAMPLE_REASON_TEXTS = Object.freeze({
  own_unavailable: "Tarif für dieses Paket nicht verfügbar",
  fetch_failed: "Preise konnten nicht abgerufen werden",
  no_comparable: "Kein vergleichbares Angebot (Carrier, Abholtag, Leistung oder Uhrzeit passen nicht)",
});

export const TARIFF_SAVE_ERRORS = Object.freeze({
  INVALID_TARIFF_MARKUP_PERCENT: "Ein Aufschlag ist ungültig: erlaubt sind 0 bis 100 Prozent mit höchstens zwei Nachkommastellen.",
  UNKNOWN_TARIFF_PRODUCT: "Für diesen Tarif ist kein eigener Aufschlag vorgesehen.",
  UNKNOWN_TARIFF_PROVIDER: "Für diese Einkaufsquelle ist kein eigener Aufschlag vorgesehen.",
  INVALID_WEIGHT_CLASS: "Diese Gewichtsklasse gibt es nicht. Bitte die Seite neu laden.",
  INVALID_TARIFF_MARKUP_REQUEST: "Die Änderung konnte nicht übermittelt werden. Bitte die Seite neu laden.",
  MARKUP_BELOW_MINIMUM: "Neue Aufschläge müssen mindestens die Untergrenze erreichen. Ein bestehender niedrigerer Wert bleibt, solange Sie ihn nicht ändern.",
  404: "Das Kundenkonto wurde nicht gefunden.",
  429: "Zu viele Änderungen in kurzer Zeit. Bitte in einigen Minuten erneut versuchen.",
  default: "Die Aufschläge konnten nicht gespeichert werden. Es wurde nichts geändert.",
});

export const COMPARISON_ERRORS = Object.freeze({
  COMPARISON_EXPIRED: TARIFF_TEXTS.refreshRequiredDetail,
  EXAMPLE_ADDRESS_MISSING: "Für dieses Zielland ist noch keine geprüfte Beispieladresse hinterlegt.",
  INVALID_DESTINATION_COUNTRY: "Bitte ein Zielland des Launch-Scopes wählen.",
  INVALID_CUSTOM_PACKAGE: "Bitte Gewicht, Länge, Breite und Höhe des Pakets gültig angeben.",
  COMPARISON_RUNNING: "Es läuft bereits ein Preisvergleich. Bitte warten, bis er abgeschlossen ist.",
  429: "Höchstens fünf Preisvergleiche je 15 Minuten. Bitte etwas später erneut versuchen.",
  default: "Preise konnten nicht abgerufen werden. Bitte erneut versuchen.",
});

const numOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v) => (typeof v === "string" ? v : "");
const hat = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

export const tariffKey = (provider, productKey) => `${provider}:${productKey}`;
export const draftKey = (provider, productKey, weightClass) => `${provider}:${productKey}:${weightClass}`;

// ── Serverantwort GET/PUT tariff-markups → geprüftes Anzeigemodell ──────────
function satzZeile(x) {
  const z = x && typeof x === "object" ? x : {};
  return { overridePercent: numOrNull(z.overridePercent), effectivePercent: numOrNull(z.effectivePercent), source: text(z.source) || null };
}
export function selectTariffMarkups(payload) {
  const p = payload && typeof payload === "object" ? payload : null;
  if (!p || !Array.isArray(p.tariffs)) return null;
  const tariffs = p.tariffs
    .filter((t) => t && TARIFF_PROVIDERS.includes(t.provider) && Number.isInteger(Number(t.productKey)) && text(t.label))
    .map((t) => ({
      id: tariffKey(t.provider, Number(t.productKey)),
      provider: t.provider,
      productKey: Number(t.productKey),
      kind: text(t.kind),
      label: text(t.label),
      carrier: text(t.carrier),
      pricingClass: t.pricingClass === "EXPRESS" ? "EXPRESS" : "STANDARD",
      note: text(t.note) || null,
      inheritedPercent: numOrNull(t.inheritedPercent),
      inheritedSource: t.inheritedSource === "express" ? "express" : "standard",
      allWeights: satzZeile(t.allWeights),
      classes: (Array.isArray(t.classes) ? t.classes : [])
        .filter((c) => c && Number.isInteger(Number(c.weightClass)) && Number(c.weightClass) > 0)
        .map((c) => ({ weightClass: Number(c.weightClass), label: text(c.label), ...satzZeile(c) }))
        .sort((a, b) => a.weightClass - b.weightClass),
    }))
    .filter((t) => t.classes.length > 0);
  if (tariffs.length === 0) return null;
  const account = p.account && typeof p.account === "object" ? p.account : {};
  const comparison = p.comparison && typeof p.comparison === "object" ? p.comparison : {};
  return {
    userId: numOrNull(p.userId),
    minimumMarkupPercent: numOrNull(p.minimumMarkupPercent),
    account: { standardPercent: numOrNull(account.standardPercent), expressPercent: numOrNull(account.expressPercent) },
    tariffs,
    comparison: {
      destinations: Array.isArray(comparison.destinations)
        ? comparison.destinations.filter((d) => d && typeof d.country === "string").map((d) => ({ country: d.country.toUpperCase(), hasExampleAddress: d.hasExampleAddress === true }))
        : [],
      maxAgeHours: numOrNull(comparison.maxAgeHours),
    },
  };
}

// Zahl der gespeicherten eigenen Sätze (alle Gewichte + Klassen) — Kurzfassung im Kartenkopf.
export function countOverrides(tariffs) {
  let n = 0;
  for (const t of tariffs || []) {
    if (t.allWeights.overridePercent !== null) n += 1;
    for (const c of t.classes) if (c.overridePercent !== null) n += 1;
  }
  return n;
}

export function savedOverride(tariff, weightClass) {
  if (!tariff) return null;
  if (weightClass === WEIGHT_CLASS_ALL) return tariff.allWeights.overridePercent;
  const c = tariff.classes.find((k) => k.weightClass === weightClass);
  return c ? c.overridePercent : null;
}
export function savedEffective(tariff, weightClass) {
  if (!tariff) return { percent: null, source: null };
  const z = weightClass === WEIGHT_CLASS_ALL ? tariff.allWeights : tariff.classes.find((k) => k.weightClass === weightClass);
  return z ? { percent: z.effectivePercent, source: z.source } : { percent: null, source: null };
}

// ── Eingabe ─────────────────────────────────────────────────────────────────
export function parseTariffInput(raw) {
  const s = typeof raw === "string" ? raw.trim() : raw === null || raw === undefined ? "" : String(raw);
  if (s === "") return { ok: true, value: null, code: null, error: null };
  return parseMarkupInput(s);
}
export const TARIFF_INPUT_ERRORS = MARKUP_INPUT_ERRORS;
export const tariffInputValue = (percent) => (percent === null || percent === undefined ? "" : markupInputValue(percent));

export function draftValue(drafts, tariff, weightClass) {
  const k = draftKey(tariff.provider, tariff.productKey, weightClass);
  return drafts && hat(drafts, k) ? drafts[k] : tariffInputValue(savedOverride(tariff, weightClass));
}

export const floorText = (minimum) => (minimum === null || minimum === undefined
  ? TARIFF_SAVE_ERRORS.MARKUP_BELOW_MINIMUM
  : `Neue Aufschläge müssen mindestens ${formatPercent(minimum)} betragen. Ein bestehender niedrigerer Wert bleibt, solange Sie ihn nicht ändern.`);
// Kurzhinweis am Eingabefeld.
export const fieldHint = (minimum) => (numOrNull(minimum) === null
  ? TARIFF_TEXTS.emptyMeans
  : `${TARIFF_TEXTS.minimum} ${formatPercent(minimum)}. ${TARIFF_TEXTS.emptyMeans}`);

// Reiter der Gewichtsklassen (Betreiberauftrag 2026-11-17: „Bis 5 kg | 5–10 kg | 10–20 kg | Über 20 kg“):
// „über 5 bis 10 kg“ → „5–10 kg“. Die Grenzen kommen nur aus der Klassenbezeichnung des Servers; diese Funktion
// kürzt den Wortlaut, sie kennt keine Gewichte.
export function weightTabLabel(label) {
  const s = text(label).trim()
    .replace(/^(?:über\s+)?(\d+(?:[.,]\d+)?)\s+bis\s+(\d+(?:[.,]\d+)?)/i, "$1–$2")
    .replace(/\s+kg$/, `${NB}kg`);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// Änderungen gegenüber dem gespeicherten Stand.
//   entries  alle gültig geparsten Abweichungen (auch unter der Untergrenze — die Vorschau zeigt ihre Wirkung)
//   invalid  { key: Text } — Eingabefehler UND neue Werte unter der Untergrenze; sperrt das Speichern
//   floor    { key: true } — nur die Untergrenzenfälle
export function tariffDraftChanges(tariffs, drafts, minimumPercent) {
  const entries = [];
  const invalid = {};
  const floor = {};
  const minimum = numOrNull(minimumPercent);
  for (const t of tariffs || []) {
    for (const wc of [WEIGHT_CLASS_ALL, ...t.classes.map((c) => c.weightClass)]) {
      const key = draftKey(t.provider, t.productKey, wc);
      if (!drafts || !hat(drafts, key)) continue;
      const parsed = parseTariffInput(drafts[key]);
      if (!parsed.ok) { invalid[key] = parsed.error; continue; }
      const saved = savedOverride(t, wc);
      if (parsed.value === saved) continue;
      entries.push({ provider: t.provider, productKey: t.productKey, weightClass: wc, markupPercent: parsed.value });
      if (parsed.value !== null && minimum !== null && parsed.value < minimum) { invalid[key] = floorText(minimum); floor[key] = true; }
    }
  }
  return { entries, count: entries.length, invalid, floor };
}
export const buildTariffEntriesBody = (entries) => ({
  entries: (entries || []).map((e) => ({ provider: e.provider, productKey: e.productKey, weightClass: e.weightClass, markupPercent: e.markupPercent })),
});

export function sourceText(source) {
  switch (source) {
    case "weight_class": return "eigener Satz für dieses Gewicht";
    case "all_weights": return "Satz für alle Gewichte";
    case "express": return "Expressaufschlag des Kontos";
    case "standard": return "Standardaufschlag des Kontos";
    case "draft": return "Ihre Eingabe";
    default: return "Aufschlag des Kontos";
  }
}

// ── Formate ─────────────────────────────────────────────────────────────────
// Zahl und Einheit stehen untrennbar (geschütztes Leerzeichen, wie Intl beim Euro): kein „15 / %“ am Zeilenende.
export const NB = "\u00a0";
export function formatCents(cents) {
  if (!Number.isInteger(cents)) return "—";
  return `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NB}€`;
}
export function formatSignedCents(cents) {
  if (!Number.isInteger(cents)) return "—";
  if (cents === 0) return `±0,00${NB}€`;
  return `${cents > 0 ? "+" : "−"}${formatCents(Math.abs(cents))}`;
}
// 35 → „35 %“, 17,5 → „17,5 %“
export function formatPercent(p) {
  const n = numOrNull(p);
  if (n === null) return "—";
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${NB}%`;
}
// Abstand zum Vergleichsangebot: negativ = günstiger.
export function distanceText(differencePercent) {
  const d = numOrNull(differencePercent);
  if (d === null) return null;
  if (d === 0) return "gleich teuer";
  const betrag = Math.abs(d).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return d < 0 ? `bei uns ${betrag}${NB}% günstiger` : `bei uns ${betrag}${NB}% teurer`;
}
export function packageLabel(pkg) {
  if (!pkg) return "—";
  const kg = Number(pkg.weightKg);
  const kgText = Number.isFinite(kg) ? kg.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "?";
  return `${kgText}${NB}kg · ${pkg.lengthCm} × ${pkg.widthCm} × ${pkg.heightCm}${NB}cm`;
}
export const kgText = (kg) => (kg !== null && kg !== undefined && Number.isFinite(Number(kg)) ? `${Number(kg).toLocaleString("de-DE", { maximumFractionDigits: 2 })}${NB}kg` : "—");
export function formatStand(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}
export function formatDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}

// ── Vergleichsbasis (Projektion des Servers) ────────────────────────────────
export function selectComparison(payload, userId) {
  const p = payload && typeof payload === "object" ? payload : null;
  if (!p || typeof p.runId !== "string" || !Array.isArray(p.tariffs) || !Array.isArray(p.scenarios)) return null;
  return { ...p, userId: numOrNull(userId) };
}
// Eine Basis gilt nur für denselben Kunden, dasselbe Zielland und innerhalb ihrer Lebensdauer. Die Sätze rechnet
// der Server bei jeder Vorschau frisch aus der Datenbank — eine Kontoänderung macht die Basis nicht ungültig.
export function comparisonBaseStatus({ base, userId, destination, now = Date.now() } = {}) {
  if (!base) return "missing";
  if (numOrNull(base.userId) !== numOrNull(userId)) return "stale";
  if (text(base.destinationCountry).toUpperCase() !== text(destination).toUpperCase()) return "stale";
  const ablauf = Date.parse(base.expiresAt || "");
  if (Number.isFinite(ablauf) && ablauf <= now) return "expired";
  return "ok";
}

// Auswertung einer Klasse; bei UPS 22 wahlweise die Variante mit Abholzuschlag (Auftrag: 22 mit und ohne Abholzuschlag; der Betrag kommt aus dem Backend).
export function projectionClass(projection, provider, productKey, weightClass, { sameDay = false } = {}) {
  if (!projection || !Array.isArray(projection.tariffs)) return null;
  const t = projection.tariffs.find((x) => x && x.provider === provider && Number(x.productKey) === Number(productKey));
  const c = t && Array.isArray(t.classes) ? t.classes.find((k) => k && k.weightClass === weightClass) : null;
  if (!c) return null;
  if (sameDay && c.sameDay && typeof c.sameDay === "object") {
    const { feeNetCents, ...auswertung } = c.sameDay;
    return { ...c, ...auswertung, sameDayFeeNetCents: numOrNull(feeNetCents) };
  }
  return c;
}
export function hasSameDay(projection, provider, productKey) {
  const c = projectionClass(projection, provider, productKey, 1);
  return !!(c && c.sameDay);
}

export function sampleById(cls, scenarioId) {
  if (!cls || !Array.isArray(cls.samples) || !scenarioId) return null;
  return cls.samples.find((s) => s && s.scenarioId === scenarioId) || null;
}
export const exampleSample = (cls) => sampleById(cls, cls && cls.exampleScenarioId);

export function statusOf(cls) {
  return cls && STATUS_VIEW[cls.status] ? cls.status : "not_compared";
}
// Ein Satz Begründung je Zeile: der Wortlaut des Zustands, genauer, wenn kein Vergleich möglich war, plus Hinweis.
export function statusText(cls, provider) {
  const status = statusOf(cls);
  const proben = cls && Array.isArray(cls.samples) ? cls.samples : [];
  let satz = STATUS_VIEW[status].text;
  if (status === "no_comparison") {
    if (proben.length === 0) satz = "Im Preisvergleich gibt es für dieses Gewicht kein Beispielpaket.";
    else if (proben.every((p) => p && p.reason === "own_unavailable")) satz = "Dieser Tarif ist für dieses Ziel und Gewicht nicht verfügbar.";
    else if (proben.every((p) => p && p.reason === "fetch_failed")) satz = "Die Preise konnten für dieses Gewicht nicht abgerufen werden.";
  }
  const hinweis = cls ? hintText(cls.hint, provider) : null;
  return hinweis ? `${satz} ${hinweis}` : satz;
}
// Ohne Vergleichsbasis: rot nur, wenn der gespeicherte Satz unter der Untergrenze des Servers liegt.
export function statusWithoutComparison(effectivePercent, minimumPercent) {
  const e = numOrNull(effectivePercent);
  const m = numOrNull(minimumPercent);
  return e !== null && m !== null && e < m ? "below_target" : "not_compared";
}

// Gewinn und Kundenpreis je Klasse: heute (gespeicherte Projektion) gegen neu (Entwurf aus der Vorschau, sonst die
// Empfehlung). Immer dasselbe Beispielpaket — das gezeigte (scenarioId) bzw. das der gespeicherten Projektion.
// Ohne eigenen Preis im Paket: available false mit dem Grund des Servers (own_unavailable, fetch_failed).
export function profitRow(baseClass, previewClass, scenarioId = null) {
  const b = scenarioId ? sampleById(baseClass, scenarioId) : exampleSample(baseClass);
  if (!b || !b.own) return { available: false, scenarioId: b ? b.scenarioId : scenarioId, reason: b ? b.reason || null : null, weightKg: b ? numOrNull(b.weightKg) : null };
  const heute = {
    percent: numOrNull(baseClass.currentPercent),
    purchaseNetCents: b.own.purchaseNetCents,
    customerNetCents: b.own.customerNetCents,
    contributionCents: b.own.contributionCents,
    comparisonNetCents: b.comparison ? b.comparison.customerNetCents : null,
    differencePercent: numOrNull(b.differencePercent),
  };
  let neu = null;
  let art = null;
  const entwurf = !!previewClass && (!!previewClass.draft || numOrNull(previewClass.currentPercent) !== heute.percent);
  const p = entwurf ? sampleById(previewClass, b.scenarioId) : null;
  if (p && p.own) {
    art = "draft";
    neu = {
      percent: numOrNull(previewClass.currentPercent),
      customerNetCents: p.own.customerNetCents,
      contributionCents: p.own.contributionCents,
      comparisonNetCents: p.comparison ? p.comparison.customerNetCents : null,
      differencePercent: numOrNull(p.differencePercent),
    };
  } else if (!entwurf && baseClass.suggestedPercent !== null && baseClass.suggestedPercent !== undefined && b.atRecommended) {
    art = "recommendation";
    neu = {
      percent: numOrNull(b.atRecommended.percent),
      customerNetCents: b.atRecommended.customerNetCents,
      contributionCents: b.atRecommended.contributionCents,
      comparisonNetCents: heute.comparisonNetCents,
      differencePercent: numOrNull(b.atRecommended.differencePercent),
    };
  }
  return {
    available: true,
    scenarioId: b.scenarioId,
    reason: null,
    weightKg: numOrNull(b.weightKg),
    chargeableKg: numOrNull(b.chargeableKg),
    heute,
    neu,
    art,
    plusCents: neu && Number.isInteger(neu.contributionCents) && Number.isInteger(heute.contributionCents) ? neu.contributionCents - heute.contributionCents : null,
  };
}

// Belastbar ist eine Empfehlung nur mit vergleichbarem Angebot. Ohne Vergleich liefert der Server die Untergrenze —
// die Karte zeigt dann „Keine Empfehlung verfügbar“ und bietet nichts zum Übernehmen an.
export function reliableRecommendation(cls) {
  return !!cls && cls.status !== "no_comparison" && cls.comparisonStatus !== "no_comparison" && numOrNull(cls.recommendedPercent) !== null;
}
// Kurzgrund unter „Keine Empfehlung verfügbar“.
export function noRecommendationText(cls) {
  const proben = cls && Array.isArray(cls.samples) ? cls.samples : [];
  if (proben.length === 0) return TARIFF_TEXTS.noExample;
  if (proben.every((p) => p && p.reason === "own_unavailable")) return TARIFF_TEXTS.gapUnavailable;
  // fetch_failed mit eigenem Preis: der ANDERE Anbieter war nicht erreichbar (Server: own gesetzt, comparison null).
  if (proben.every((p) => p && p.reason === "fetch_failed")) return proben.every((p) => p.own) ? TARIFF_TEXTS.gapFetchComparison : TARIFF_TEXTS.gapFetch;
  return TARIFF_TEXTS.gapNoComparable;
}

// Die Zahlen eines Anbieters in einer Gewichtsklasse — alle Werte vom Server, hier wird nur ausgewählt:
//   current      gespeicherter wirksamer Satz und seine Herkunft (Klasse, alle Gewichte, Konto)
//   recommended  Empfehlung nur, wenn belastbar; sonst null mit Kurzgrund
//   adoptPercent Wert für „Empfehlung übernehmen“ (suggestedPercent des Servers; null = nichts zu übernehmen)
//   more         Änderung des Deckungsbeitrags am Beispielpaket: mit Ihrer Eingabe (Vorschau) oder mit Empfehlung
//   numbers      Unser Einkauf, Kunde zahlt, Unser Verdienst am gezeigten Beispielpaket (scenarioId); mit Entwurf
//                zusätzlich Kundenpreis und Verdienst laut Vorschau. Ohne eigenen Preis der Grund des Servers.
// pending: es gibt Entwürfe in diesem Tarif, die Vorschau steht aber noch aus — dann keine veraltete Zahl.
export function classMetrics({ tariff, weightClass, baseClass = null, previewClass = null, hasBase = false, pending = false, previewFailed = false, sameDay = false, scenarioId = null } = {}) {
  const T = TARIFF_TEXTS;
  const current = savedEffective(tariff, weightClass);
  const belastbar = hasBase && reliableRecommendation(baseClass);
  const passt = belastbar && (baseClass.suggestedPercent === null || baseClass.suggestedPercent === undefined);
  // „Passt bereits“ nur ohne Risiko: Ist der Preisvorteil gefährdet und die Empfehlung schon erreicht, erklärt der Hinweis.
  const gefaehrdet = belastbar && (baseClass.status === "at_risk" || baseClass.comparisonStatus === "at_risk");
  const recommended = belastbar
    ? { percent: numOrNull(baseClass.recommendedPercent), note: [passt && !gefaehrdet ? T.fits : null, sameDay ? T.withSameDay : null].filter(Boolean).join(", ") || null }
    : { percent: null, note: !hasBase ? T.needsComparison : noRecommendationText(baseClass) };
  const adoptPercent = belastbar && !passt ? numOrNull(baseClass.suggestedPercent) : null;
  const row = hasBase && baseClass ? profitRow(baseClass, pending ? null : previewClass, scenarioId) : { available: false, reason: null, weightKg: null };
  const ohneZahl = (note) => ({ cents: null, direction: null, art: null, label: T.metricMore, value: "—", note, example: null });
  let more;
  if (!hasBase) more = ohneZahl(T.needsComparison);
  else if (pending) more = ohneZahl(previewFailed ? T.previewFailed : T.previewing);
  else if (!row.available) more = ohneZahl(T.noExample);
  else if (Number.isInteger(row.plusCents) && (row.art === "draft" || (row.art === "recommendation" && belastbar))) {
    const direction = row.plusCents > 0 ? "more" : row.plusCents < 0 ? "less" : "same";
    more = {
      cents: row.plusCents,
      direction,
      art: row.art,
      // Sinkt der Deckungsbeitrag (Empfehlung schützt den Preisvorteil), heißt die Kennzahl „Weniger pro Sendung“.
      label: direction === "less" ? T.metricLess : T.metricMore,
      value: direction === "less" ? formatCents(Math.abs(row.plusCents)) : formatSignedCents(row.plusCents),
      note: row.art === "draft" ? T.withDraft : T.withRecommendation,
      example: `${T.contributionExample} ${kgText(row.weightKg)}`,
    };
  } else more = ohneZahl(belastbar ? T.noChange : T.noRecommendation);
  const numbers = !hasBase ? { available: false, reason: "not_compared" }
    : !row.available ? { available: false, reason: row.reason || "no_sample", weightKg: row.weightKg }
      : {
        available: true,
        reason: null,
        weightKg: row.weightKg,
        purchaseCents: row.heute.purchaseNetCents,
        customerCents: row.heute.customerNetCents,
        contributionCents: row.heute.contributionCents,
        draft: row.art === "draft" && row.neu
          ? { percent: row.neu.percent, customerCents: row.neu.customerNetCents, contributionCents: row.neu.contributionCents } : null,
      };
  return { current, recommended, adoptPercent, more, row, numbers };
}

// Hinweise, die die Entscheidung beeinflussen und deshalb vorne sichtbar bleiben: Preisvorteil gefährdet und
// gespeicherter Satz unter der Untergrenze. Mit Entwurf zählt die Vorschau (draft: true).
export function classWarnings({ baseClass = null, previewClass = null, currentPercent = null, minimumPercent = null, provider = null, hasBase = false } = {}) {
  const entwurf = !!previewClass && !!baseClass
    && (!!previewClass.draft || numOrNull(previewClass.currentPercent) !== numOrNull(baseClass.currentPercent));
  const k = entwurf ? previewClass : baseClass;
  const out = [];
  if (hasBase && k) {
    // Ein Entwurf unter der Untergrenze meldet das Feld selbst.
    if (!entwurf && k.status === "below_target") out.push({ status: "below_target", text: STATUS_VIEW.below_target.text, draft: false });
    if (k.status === "at_risk" || k.comparisonStatus === "at_risk") {
      out.push({ status: "at_risk", text: [STATUS_VIEW.at_risk.text, hintText(k.hint, provider)].filter(Boolean).join(" "), draft: entwurf });
    }
  } else if (statusWithoutComparison(currentPercent, minimumPercent) === "below_target") {
    out.push({ status: "below_target", text: STATUS_VIEW.below_target.text, draft: false });
  }
  return out;
}

// Kurzfassung eines Tarifs für die Tarifliste: wichtigster Zustand, möglicher Mehrgewinn je Sendung (nur aus
// belastbaren Empfehlungen), Spanne der heutigen und empfohlenen Sätze.
export function tariffSummary(tariff, base, { sameDay = false, minimumPercent = null } = {}) {
  const heute = tariff.classes.map((c) => c.effectivePercent).filter((v) => v !== null);
  const spanne = (werte) => (werte.length === 0 ? null : { min: Math.min(...werte), max: Math.max(...werte) });
  if (!base) {
    const status = tariff.classes.some((c) => statusWithoutComparison(c.effectivePercent, minimumPercent) === "below_target") ? "below_target" : "not_compared";
    return { status, plusCents: null, today: spanne(heute), recommended: null };
  }
  const klassen = tariff.classes.map((c) => projectionClass(base, tariff.provider, tariff.productKey, c.weightClass, { sameDay })).filter(Boolean);
  const zustaende = klassen.map(statusOf);
  const status = STATUS_RANG.find((s) => zustaende.includes(s)) || "not_compared";
  const belastbar = klassen.filter(reliableRecommendation);
  let plus = null;
  for (const k of belastbar) {
    const r = profitRow(k, null);
    if (r.available && r.art === "recommendation" && Number.isInteger(r.plusCents) && r.plusCents > 0) plus = Math.max(plus || 0, r.plusCents);
  }
  const empfohlen = belastbar.map((k) => numOrNull(k.recommendedPercent)).filter((v) => v !== null);
  return { status, plusCents: plus, today: spanne(heute), recommended: spanne(empfohlen) };
}
export function rangeText(r) {
  if (!r) return "—";
  return r.min === r.max ? formatPercent(r.min) : `${formatPercent(r.min).replace(`${NB}%`, "")}–${formatPercent(r.max)}`;
}
// ── Gemeinsame Tarifübersicht (finale Vereinfachung 2026-11-17) ─────────────
// Vergleichsbeziehung zweier Angebote, je mit Wortlaut; die Farbe ist nur Zusatz (none ohne Marke).
export const RELATION_VIEW = Object.freeze({
  equivalent: Object.freeze({ tone: "info", label: "Gleichwertig" }),
  similar: Object.freeze({ tone: "neutral", label: "Ähnlicher Tarif" }),
  none: Object.freeze({ tone: null, label: "Kein direkter Vergleich möglich" }),
});
export const VERDICT_TEXTS = Object.freeze({
  transglobal: "Transglobal kauft günstiger ein.",
  jumingo: "JUMiNGO kauft günstiger ein.",
  same: "Beide kaufen gleich günstig ein.",
  none: "Diese Angebote sind nicht direkt vergleichbar.",
  not_compared: "Noch nicht verglichen",
});
export const JU_KIND_REGISTER = "register";

// Bereiche: je Transglobal-Produkt einer, in der Reihenfolge des Servers. Das JUMiNGO-Gegenstück ist die
// Registergruppe des Servers (kind "register") mit derselben Bezeichnung und demselben Carrier — im Backend dasselbe
// kanonische Produkt (config/customerTariffMarkupProducts.js ↔ config/jumingoMarkupGroups.js). Nur eine auf beiden
// Seiten eindeutige Entsprechung wird gepaart. Preisgruppen (kind "price_group") und jede nicht eindeutig zuordenbare
// Gruppe stehen unter „Weitere JUMiNGO-Tarife“: keine Zuordnung aus Namensähnlichkeit, nichts wird zusammengelegt.
export function tariffAreas(tariffs) {
  const liste = Array.isArray(tariffs) ? tariffs : [];
  const tg = liste.filter((t) => t.provider === "transglobal");
  const ju = liste.filter((t) => t.provider === "jumingo");
  const passt = (t, j) => !!t.carrier && j.kind === JU_KIND_REGISTER && j.label === t.label && j.carrier === t.carrier;
  const vergeben = new Set();
  const areas = tg.map((t) => {
    const treffer = ju.filter((j) => passt(t, j));
    const pair = treffer.length === 1 && tg.filter((x) => passt(x, treffer[0])).length === 1 ? treffer[0] : null;
    if (pair) vergeben.add(pair.id);
    return { id: t.id, label: t.label, transglobal: t, pair };
  });
  return { areas, extra: ju.filter((j) => !vergeben.has(j.id)) };
}

// Ein Beispielpaket vergleicht der Server mit genau diesem Transglobal-Produkt (Tarif-ID = Produktschlüssel).
function vergleichtMit(sample, productKey) {
  const c = sample && sample.comparison;
  return !!c && c.provider === "transglobal" && String(c.tariffId) === String(productKey);
}
// Mit welchen Transglobal-Produkten der Server die Beispielpakete einer JUMiNGO-Gruppe verglichen hat (alle Klassen).
function verglicheneProdukte(base, juTariff) {
  const out = new Map();
  for (const k of juTariff.classes || []) {
    const cls = projectionClass(base, juTariff.provider, juTariff.productKey, k.weightClass);
    for (const s of cls && Array.isArray(cls.samples) ? cls.samples : []) {
      const c = s && s.comparison;
      if (!c || c.provider !== "transglobal" || !/^\d+$/.test(String(c.tariffId))) continue;
      const key = Number(c.tariffId);
      if (out.get(key) !== "equivalent") out.set(key, c.relation === "equivalent" ? "equivalent" : "similar");
    }
  }
  return out;
}
// JUMiNGO-Kandidaten eines Bereichs: das Registerpaar, dazu jede Gruppe aus „Weitere JUMiNGO-Tarife“, deren eigene
// Beispielpakete der Server im Preisvergleich mit genau diesem Transglobal-Produkt vergleicht. Ohne Vergleich nur das Paar.
export function areaCandidates(area, extra, base) {
  const out = area && area.pair ? [{ tariff: area.pair, relation: "equivalent" }] : [];
  if (!area || !base) return out;
  for (const j of extra || []) {
    const rel = verglicheneProdukte(base, j).get(area.transglobal.productKey);
    if (rel) out.push({ tariff: j, relation: rel });
  }
  return out;
}
// „Weitere JUMiNGO-Tarife“: Transglobal-Produkte, mit denen der Server diese Gruppe verglichen hat.
export function extraComparedWith(base, juTariff, tgTariffs) {
  if (!base || !juTariff) return [];
  const m = verglicheneProdukte(base, juTariff);
  return (tgTariffs || []).filter((t) => m.has(t.productKey)).map((t) => ({ tariff: t, relation: m.get(t.productKey) }));
}

// Ein Beispielpaket je Bereich und Gewichtsklasse, damit beide Spalten dasselbe Paket zeigen: bevorzugt eines, für das
// BEIDE Seiten einen eigenen Preis haben — zuerst das Beispielpaket des Servers für Transglobal, dann das für JUMiNGO,
// dann das erste weitere der Klasse. Sonst das Beispielpaket einer Seite (die andere zeigt ihren Grund).
export function commonScenarioId(tgClass, juClass) {
  const eigen = (cls, id) => { const s = sampleById(cls, id); return !!(s && s.own); };
  const beide = (id) => !!id && eigen(tgClass, id) && eigen(juClass, id);
  const tgEx = tgClass ? tgClass.exampleScenarioId || null : null;
  const juEx = juClass ? juClass.exampleScenarioId || null : null;
  const alle = [tgEx, juEx, ...[tgClass, juClass].flatMap((c) => (c && Array.isArray(c.samples) ? c.samples.map((s) => s && s.scenarioId) : []))].filter(Boolean);
  return alle.find(beide) || tgEx || juEx || alle[0] || null;
}

// Verbindung der beiden Spalten im gezeigten Beispielpaket — nur aus Vergleichsurteilen des Servers:
//   Transglobal-Seite (nur Registerpaar): das Vergleichsangebot ist „gleichwertig“, also dasselbe kanonische Produkt;
//   JUMiNGO-Seite: das Beispielpaket der Gruppe hat genau dieses Transglobal-Produkt als Vergleichsangebot.
// null = kein direkter Vergleich (kein Preis, andere Leistung, Uhrzeit oder Abholtag, Abruffehler).
export function pairLink({ tgClass = null, juClass = null, tgProductKey = null, isPair = false, scenarioId = null } = {}) {
  const tgS = sampleById(tgClass, scenarioId);
  const juS = sampleById(juClass, scenarioId);
  const vt = tgS && tgS.own ? tgS.comparison : null;
  if (isPair && vt && vt.provider === "jumingo" && vt.relation === "equivalent") return { relation: "equivalent", from: "transglobal", comparison: vt };
  if (juS && juS.own && vergleichtMit(juS, tgProductKey)) {
    return { relation: juS.comparison.relation === "equivalent" ? "equivalent" : "similar", from: "jumingo", comparison: juS.comparison };
  }
  return null;
}

// Kernaussage: nur für Angebote, die der Server im gezeigten Paket vergleicht; verglichen werden die beiden
// Einkaufspreise, die die Spalten zeigen (Serverwerte). Ohne Basis „not_compared“, ohne Verbindung „none“.
export function verdictOf({ hasBase = false, link = null, tgPurchaseCents = null, juPurchaseCents = null } = {}) {
  if (!hasBase) return "not_compared";
  if (!link || !Number.isInteger(tgPurchaseCents) || !Number.isInteger(juPurchaseCents)) return "none";
  return tgPurchaseCents < juPurchaseCents ? "transglobal" : juPurchaseCents < tgPurchaseCents ? "jumingo" : "same";
}

// „Möglich: +X € pro Sendung“ je Anbieter: nur aus einer belastbaren Empfehlung des Servers mit mehr Deckungsbeitrag
// am gezeigten Beispielpaket; mit Entwurf die Wirkung Ihrer Eingabe laut Vorschau (auch weniger). Sonst null.
export function chanceLine(provider, metrics) {
  const more = metrics && metrics.more;
  const row = metrics && metrics.row;
  if (!more || !more.art || !Number.isInteger(more.cents) || !row || !row.heute || !row.neu) return null;
  if (more.art === "recommendation" && more.direction !== "more") return null;
  return { provider, art: more.art, cents: more.cents, fromPercent: row.heute.percent, toPercent: row.neu.percent, weightKg: row.weightKg };
}
export function chanceText(line) {
  const anbieter = PROVIDER_LABELS[line.provider] || "";
  const paket = line.weightKg !== null && line.weightKg !== undefined ? ` (${TARIFF_TEXTS.detailExample} ${kgText(line.weightKg)})` : "";
  if (line.art === "draft") {
    return { lead: `${TARIFF_TEXTS.withDraftLead}: ${formatSignedCents(line.cents)} ${TARIFF_TEXTS.perShipment}`,
      detail: `${anbieter}-Aufschlag ${formatPercent(line.fromPercent)} → ${formatPercent(line.toPercent)}${paket}.` };
  }
  return { lead: `${TARIFF_TEXTS.possible}: ${formatSignedCents(line.cents)} ${TARIFF_TEXTS.perShipment}`,
    detail: `wenn der ${anbieter}-Aufschlag von ${formatPercent(line.fromPercent)} auf ${formatPercent(line.toPercent)} steigt${paket}.` };
}

// „Möglich bis“ in der Übersicht: der größte Mehrverdienst je Sendung aus belastbaren Empfehlungen über alle
// Gewichtsklassen beider Spalten — je Klasse am selben Beispielpaket wie in der geöffneten Fläche (commonScenarioId),
// damit Übersicht und Fläche dieselbe Zahl zeigen. Entwürfe zählen hier nicht. null = keine solche Empfehlung.
export function bestChanceCents({ base = null, transglobal = null, jumingo = null, sameDay = false } = {}) {
  if (!base) return null;
  const klassen = [...new Set([transglobal, jumingo].flatMap((t) => (t ? t.classes.map((c) => c.weightClass) : [])))];
  let best = null;
  for (const wc of klassen) {
    const tgBk = transglobal ? projectionClass(base, transglobal.provider, transglobal.productKey, wc, { sameDay }) : null;
    const juBk = jumingo ? projectionClass(base, jumingo.provider, jumingo.productKey, wc) : null;
    const sz = commonScenarioId(tgBk, juBk);
    for (const [t, bk] of [[transglobal, tgBk], [jumingo, juBk]]) {
      if (!t || !bk) continue;
      const l = chanceLine(t.provider, classMetrics({ tariff: t, weightClass: wc, baseClass: bk, hasBase: true, scenarioId: sz }));
      if (l && l.art === "recommendation" && l.cents > 0) best = Math.max(best ?? 0, l.cents);
    }
  }
  return best;
}

// Einkaufsvorteil laut Server (purchaseAdvantagePercent = (Einkauf Vergleich − eigener Einkauf) / Einkauf Vergleich).
export function advantageText(provider, comparison) {
  const a = comparison ? numOrNull(comparison.purchaseAdvantagePercent) : null;
  if (a === null) return null;
  const eigen = PROVIDER_LABELS[provider] || "";
  const anderer = PROVIDER_LABELS[comparison.provider] || "";
  if (a === 0) return `${eigen} kauft gleich teuer ein wie ${anderer}`;
  const betrag = Math.abs(a).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return `${eigen} kauft ${betrag}${NB}% ${a > 0 ? "günstiger" : "teurer"} ein als ${anderer}`;
}
export function scenarioOf(base, scenarioId) {
  if (!base || !Array.isArray(base.scenarios) || !scenarioId) return null;
  return base.scenarios.find((s) => s && s.id === scenarioId) || null;
}

// Hinweise für den Bestätigungsdialog je Änderung (aus der Vorschau): gefährdet, kein Vergleich, wenig belegt.
export function changeWarnings(previewClass) {
  if (!previewClass) return [];
  const w = [];
  if (previewClass.status === "at_risk" || previewClass.comparisonStatus === "at_risk") w.push("at_risk");
  if (previewClass.comparisonStatus === "no_comparison") w.push("no_comparison");
  else if (Number.isInteger(previewClass.comparedSamples) && previewClass.comparedSamples < 2) w.push("weak");
  return w;
}

// ── Verlauf (GET /admin/audit-logs?action=user.tariff_markup_change) ────────
export function selectTariffHistory(payload, tariffs) {
  const logs = payload && Array.isArray(payload.logs) ? payload.logs : [];
  return logs
    .filter((l) => l && l.metadata && typeof l.metadata === "object")
    .map((l) => {
      const m = l.metadata;
      const provider = TARIFF_PROVIDERS.includes(m.tariff_provider) ? m.tariff_provider : "transglobal";
      const productKey = numOrNull(m.tariff_product_key);
      const weightClass = numOrNull(m.tariff_weight_class) ?? WEIGHT_CLASS_ALL;
      const tariff = (tariffs || []).find((t) => t.provider === provider && t.productKey === productKey) || null;
      const klasse = tariff && weightClass !== WEIGHT_CLASS_ALL ? tariff.classes.find((c) => c.weightClass === weightClass) : null;
      const cleared = m.tariff_markup_change === "cleared";
      return {
        id: l.id,
        at: text(l.created_at),
        actorName: l.actor && typeof l.actor.name === "string" ? l.actor.name : "—",
        provider, productKey, weightClass,
        tariffLabel: tariff ? tariff.label : `Tarif ${productKey ?? "?"}`,
        classLabel: weightClass === WEIGHT_CLASS_ALL ? TARIFF_TEXTS.allWeights : klasse ? klasse.label : `Klasse ${weightClass}`,
        before: numOrNull(m.tariff_markup_percent_before),
        after: cleared ? null : numOrNull(m.tariff_markup_percent),
        cleared,
      };
    })
    .filter((e) => e.productKey !== null);
}
export function historyRevert(entry, tariffs, minimumPercent) {
  const tariff = (tariffs || []).find((t) => t.provider === entry.provider && t.productKey === entry.productKey) || null;
  if (!tariff) return { allowed: false, reason: "unknown" };
  const saved = savedOverride(tariff, entry.weightClass);
  if (entry.before === saved) return { allowed: false, reason: "current" };
  const m = numOrNull(minimumPercent);
  if (entry.before !== null && m !== null && entry.before < m) return { allowed: false, reason: "floor" };
  return { allowed: true, reason: null, key: draftKey(entry.provider, entry.productKey, entry.weightClass), value: tariffInputValue(entry.before) };
}
export const historyValue = (v) => (v === null ? TARIFF_TEXTS.noInput : formatPercent(v));

// ── Eigenes Paket: eine Zeile je Tarif mit eigenem Preis ────────────────────
export function customRows(projection) {
  if (!projection || !Array.isArray(projection.scenarios) || projection.scenarios.length === 0) return [];
  const s = projection.scenarios[0];
  return (projection.tariffs || [])
    .map((t) => {
      const c = (t.classes || []).find((k) => k.weightClass === s.weightClass);
      const x = c ? sampleById(c, s.id) : null;
      if (!x || !x.own) return null;
      return { id: tariffKey(t.provider, t.productKey), label: t.label, provider: t.provider, customerNetCents: x.own.customerNetCents,
        comparisonNetCents: x.comparison ? x.comparison.customerNetCents : null, differencePercent: numOrNull(x.differencePercent), reason: x.reason || null };
    })
    .filter(Boolean);
}

// Zielländer: Deutschland zuerst, danach nach deutschem Namen.
export function destinationOptions(destinations, countryNames) {
  const name = (code) => (countryNames && countryNames[code]) || code;
  return [...(destinations || [])]
    .map((d) => ({ code: d.country, name: name(d.country), hasExampleAddress: d.hasExampleAddress !== false }))
    .sort((a, b) => (a.code === "DE" ? -1 : b.code === "DE" ? 1 : a.name.localeCompare(b.name, "de")));
}

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
export function tariffSaveError(status, body, minimumPercent = null) {
  if (status === 401 || status === 403) return null; // zentraler Redirect
  const code = body && typeof body.code === "string" ? body.code : null;
  const basis = code === "MARKUP_BELOW_MINIMUM" ? floorText(numOrNull(minimumPercent))
    : (code && TARIFF_SAVE_ERRORS[code]) || TARIFF_SAVE_ERRORS[status] || TARIFF_SAVE_ERRORS.default;
  const key = body && TARIFF_PROVIDERS.includes(body.provider) && Number.isInteger(Number(body.productKey)) && Number.isInteger(Number(body.weightClass))
    ? draftKey(body.provider, Number(body.productKey), Number(body.weightClass)) : null;
  return { text: basis, key, code };
}
export function comparisonError(status, body) {
  if (status === 401 || status === 403) return null;
  const code = body && typeof body.code === "string" ? body.code : null;
  const stale = code === "COMPARISON_EXPIRED" || status === 410;
  return { text: (code && COMPARISON_ERRORS[code]) || COMPARISON_ERRORS[status] || COMPARISON_ERRORS.default, code, stale };
}
