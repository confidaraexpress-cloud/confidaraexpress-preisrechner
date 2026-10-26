// ── Öffentlicher Preisrechner: Formular, Anfrage, Antwort und Kartentexte (rein) ─
//
// Die Insel des Preisrechners (src/public-calculator/) rechnet nichts und
// entscheidet nichts über Tarife. Liste, Preise, Verfügbarkeit und
// Preiskennzeichnung kommen vom Server (POST /api/public/price-quote) — für
// gleiche Versanddaten dieselbe Auswahl wie im Versandkostenrechner der Kunden.
// Dieses Modul übersetzt Formular und Antwort in Anfrage, Zustände und Texte:
// ohne fetch, ohne React, ohne Zustand, ohne Uhr (die Uhr reicht der Aufrufer).
//
// Gemeinsam mit dem Kundenrechner (keine zweite Fassung):
//   • Prüfung der Eingaben: getCalculatorErrors (utils/calculatorValidation.mjs)
//   • Abholung, Zustellung, Laufzeit: pickupContractView / deliveryContractView
//   • Sperrgründe: offerIdentity.mjs · Zuschlagshinweis: residentialPriceInputs.mjs
//   • Beträge: vatDisplayView.mjs · Carrier: carrierMap.js
//
// Bewusst anders als im Portal (reine Darstellung): auf der Karte nur der Nettopreis
// mit „zzgl. MwSt." (Betreiberentscheidung 2026-10-16), „ab" bei einem nicht exakten
// Preis, Carrierauswahl im Browser über `publicCarrierId` (kein neuer Request), keine
// Bestwahl-Markierung, und statt „Buchen" die Übernahme über die Registrierung.

import { getCalculatorErrors, firstErrorField } from "./calculatorValidation.mjs";
import { deliveryContractOf, DELIVERY_ON_REQUEST } from "./deliveryContractView.mjs";
import { projectedDeliveryText } from "./deliveryProjectionView.mjs";
import { pickupContractOf, pickupTimeText, pickupAdjustedNote } from "./pickupContractView.mjs";
import { handoverMode, HANDOVER_PICKUP, HANDOVER_DROPOFF } from "./handoverMode.mjs";
import { offerBlockedLabel, OFFER_BUSINESS_RECIPIENT_TEXT } from "./offerIdentity.mjs";
import { launchRouteBlockedText, ROUTE_NOT_SUPPORTED_TITLE } from "./launchRouteText.mjs";
import {
  offerRequiresResidentialChoice, offerResidentialSurchargeFree, RESIDENTIAL_TEXT,
} from "./residentialPriceInputs.mjs";
import { carrierAppliesLabel, LABEL_HANDLING_TEXT } from "./labelHandling.mjs";
import { deliveryTimeLabel, earlyDeliveryNote } from "./deliveryTimeView.mjs";
import { vatDisplay } from "./vatDisplayView.mjs";
// Individuelle Mehrpaketsendungen (Canonical v2.79): derselbe Paketeditor wie im Portal.
import {
  formPackageLines, normalizeExtraPackageLines, packageLinesPayload, packageLinesSummaryText,
  mapPackageLinesServerField, EXTRA_PACKAGE_LINES_KEY,
} from "./packageLines.mjs";

// ─── Feste Ziele auf der Hauptdomain ─────────────────────────────────────────
// Konstanten, kein Parameter: der Preisrechner kennt keinen Redirect-Wunsch.
export const MAIN_ORIGIN = "https://confidaraexpress.de";
export const PUBLIC_HANDOFF_URL = `${MAIN_ORIGIN}/preisrechner-uebernahme`;
export const LOGIN_URL = `${MAIN_ORIGIN}/login`;
export const REGISTER_URL = `${MAIN_ORIGIN}/register`;

// Ab dieser Wartezeit erklärt die Seite, warum es dauert — ohne eine Dauer zu versprechen.
export const SLOW_HINT_AFTER_MS = 10000;

// ─── Optionen: dieselben Werte wie im Kundenrechner ──────────────────────────
// Die Kennungen sind der Vertrag des Servers; die Texte folgen dem Portal, nur
// ohne Wertung („günstigster") — der öffentliche Auftritt verspricht nichts.
export const SERVICE_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ id: "all", label: "Alle Dienstleistungen", desc: "Abholung an Ihrer Adresse und Abgabe im Paketshop" }),
  Object.freeze({ id: "pickup", label: "Nur Abholung", desc: "Abholung an Ihrer Adresse" }),
  Object.freeze({ id: "dropoff", label: "Nur Abgabe", desc: "Abgabe in einem Paketshop" }),
  Object.freeze({ id: "pickup_today", label: "Abholung heute", desc: "Tarife mit Abholung noch heute" }),
]);
// Gesamtauftrag F (2026-10-24): ohne „Economy" — Economy-Produkte erscheinen unter „Alle Versandarten"; ein
// gespeichertes „economy" fällt über MODE_IDS auf „all".
export const SHIPPING_MODE_OPTIONS = Object.freeze([
  Object.freeze({ id: "all", label: "Alle Versandarten" }),
  Object.freeze({ id: "standard", label: "Standard" }),
  Object.freeze({ id: "express", label: "Express" }),
]);
// Dieselben vier Ordnungen wie im Portal (CalculatorPage). „Standardreihenfolge" ist die Reihenfolge
// des Servers — keine Empfehlung und keine Rangfolge.
export const SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: "recommended", label: "Standardreihenfolge" }),
  Object.freeze({ id: "cheapest", label: "Preis aufsteigend" }),
  Object.freeze({ id: "priciest", label: "Preis absteigend" }),
  Object.freeze({ id: "fastest", label: "Laufzeit" }),
]);

const SERVICE_IDS = SERVICE_FILTER_OPTIONS.map((o) => o.id);
const MODE_IDS = SHIPPING_MODE_OPTIONS.map((o) => o.id);
const SORT_IDS = SORT_OPTIONS.map((o) => o.id);

// ─── Formular ────────────────────────────────────────────────────────────────
export const PUBLIC_FORM_FIELDS = Object.freeze([
  "from_country", "from_zip", "from_city", "to_country", "to_zip", "to_city",
  "packageCount", "weight", "length", "width", "height",
]);

/** Der Startzustand. Ursprung ist Deutschland — der einzige Versandursprung (Serverliste). */
export function emptyPublicForm() {
  return {
    from_country: "DE", from_zip: "", from_city: "",
    to_country: "DE", to_zip: "", to_city: "",
    packageCount: "1", weight: "", length: "", width: "", height: "",
  };
}

const DEZIMALFELDER = Object.freeze(["weight", "length", "width", "height"]);

/** „2,5" → „2.5": dieselbe Zahl, wie sie der Kundenrechner prüft und sendet. Sonst unverändert. */
export function normalizeDecimalInput(wert) {
  if (typeof wert !== "string") return wert;
  const s = wert.trim();
  return /^\d+,\d+$/.test(s) ? s.replace(",", ".") : s;
}

function normalisiert(form) {
  const f = { ...emptyPublicForm(), ...(form && typeof form === "object" ? form : {}) };
  for (const k of DEZIMALFELDER) f[k] = normalizeDecimalInput(f[k]);
  f.packageCount = typeof f.packageCount === "string" ? f.packageCount.trim() : f.packageCount;
  // Weitere Paketzeilen: dieselbe Dezimalkomma-Regel je Zeile (Canonical v2.79).
  const weitere = normalizeExtraPackageLines(f[EXTRA_PACKAGE_LINES_KEY]).map((z) => {
    const zeile = { ...z, packageCount: z.packageCount.trim() };
    for (const k of DEZIMALFELDER) zeile[k] = normalizeDecimalInput(z[k]);
    return zeile;
  });
  if (weitere.length) f[EXTRA_PACKAGE_LINES_KEY] = weitere;
  else delete f[EXTRA_PACKAGE_LINES_KEY];
  return f;
}

/**
 * Dieselbe Prüfung wie im Kundenrechner (`getCalculatorErrors`).
 * @returns {{fieldErrors: object, banner: object|null, firstField: string|null}}
 */
export function publicFormErrors(form) {
  const { fieldErrors, banner } = getCalculatorErrors(normalisiert(form));
  return { fieldErrors, banner, firstField: firstErrorField(fieldErrors) };
}

/** Der heutige lokale Kalendertag als „YYYY-MM-DD" — `now` reicht der Aufrufer. */
export function localIsoDate(now) {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ein Versandtag ist zulässig, wenn er ein Kalendertag und nicht vor heute ist — wie im Kundenrechner. */
export function shippingDateAllowed(iso, now) {
  return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= localIsoDate(now);
}

/**
 * Der Anfragekörper — genau die 15 Felder des Kundenrechners, in seiner Schreibweise.
 * Die Carrierauswahl geschieht im Browser; gesendet wird deshalb eine leere Liste.
 * Unterschiedliche Pakete (Canonical v2.79): statt der fünf Paketfelder `packageLines` — wie im
 * Kundenrechner, an derselben Stelle; eine Paketart bleibt bytegleich der flache Körper.
 */
export function buildPublicQuoteRequest(form, { serviceFilter = "all", shippingModeFilter = "all", shippingDate } = {}) {
  const f = normalisiert(form);
  return {
    from_country: f.from_country,
    from_zip: String(f.from_zip ?? "").trim(),
    from_city: String(f.from_city ?? "").trim(),
    to_country: f.to_country,
    to_zip: String(f.to_zip ?? "").trim(),
    to_city: String(f.to_city ?? "").trim(),
    ...(packageLinesPayload(formPackageLines(f)) || {
      packageCount: Number(f.packageCount),
      weight: Number(f.weight),
      length: Number(f.length),
      width: Number(f.width),
      height: Number(f.height),
    }),
    serviceFilter: SERVICE_IDS.includes(serviceFilter) ? serviceFilter : "all",
    shippingModeFilter: MODE_IDS.includes(shippingModeFilter) ? shippingModeFilter : "all",
    shippingDate,
    publicCarrierIds: [],
  };
}

/** Kennung einer Anfrage: dieselbe Eingabe ergibt keinen neuen Request. */
export function requestKey(body) {
  return JSON.stringify(body);
}

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const zahlText = (w) => (typeof w === "number" && Number.isFinite(w) ? ZAHL.format(w) : null);

/**
 * Die Anfrage in einer Zeile über den Ergebnissen — damit klar bleibt, wofür die Preise gelten:
 * „DE 70173 Stuttgart → DE 10115 Berlin · 1 Paket · 2,5 kg · 30 × 20 × 10 cm". Das Versanddatum
 * wählt niemand (die Seite rechnet ab dem heutigen Geschäftstag) — es steht deshalb nicht darin.
 * Ohne Anfrage `null`.
 */
export function requestSummary(body) {
  const b = body && typeof body === "object" ? body : null;
  if (!b) return null;
  const ort = (land, plz, stadt) => [land, plz, stadt].filter((t) => typeof t === "string" && t.trim() !== "").join(" ");
  const teile = [];
  const von = ort(b.from_country, b.from_zip, b.from_city);
  const nach = ort(b.to_country, b.to_zip, b.to_city);
  if (von && nach) teile.push(`${von} → ${nach}`);
  // Unterschiedliche Pakete: die Summe wie im Portal („3 Pakete · 31 kg gesamt“).
  if (Array.isArray(b.packageLines)) {
    const summe = packageLinesSummaryText(b.packageLines);
    if (summe) teile.push(summe);
    return teile.length ? teile.join(" · ") : null;
  }
  const anzahl = Number.isInteger(b.packageCount) && b.packageCount > 0 ? b.packageCount : null;
  if (anzahl !== null) teile.push(anzahl === 1 ? "1 Paket" : `${anzahl} Pakete`);
  const gewicht = zahlText(b.weight);
  if (gewicht) teile.push(`${gewicht} kg${anzahl > 1 ? " je Paket" : ""}`);
  const masse = [b.length, b.width, b.height].map(zahlText);
  if (masse.every(Boolean)) teile.push(`${masse.join(" × ")} cm`);
  return teile.length ? teile.join(" · ") : null;
}

// ─── Ergebnisliste: Carrierauswahl und Ordnung im Browser ───────────────────
const istAngebot = (o) => !!o && typeof o === "object";

/** Nur die gewählten Carrier — ohne Auswahl alle. */
export function filterOffersByCarrier(offers, selectedIds) {
  const liste = Array.isArray(offers) ? offers.filter(istAngebot) : [];
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  return ids.length === 0 ? liste : liste.filter((o) => ids.includes(o.publicCarrierId));
}

/** Dieselben Ordnungen wie im Kundenrechner (CalculatorPage). Stabil; die Eingabe bleibt unverändert. */
export function sortPublicOffers(offers, mode) {
  const liste = Array.isArray(offers) ? [...offers] : [];
  const m = SORT_IDS.includes(mode) ? mode : "recommended";
  if (m === "recommended") return liste;
  if (m === "cheapest") return liste.sort((a, b) => (a.netPrice ?? Infinity) - (b.netPrice ?? Infinity));
  if (m === "priciest") return liste.sort((a, b) => (b.netPrice ?? -1) - (a.netPrice ?? -1));
  return liste.sort((a, b) => {
    const aMax = a.transitDaysMax ?? 999;
    const bMax = b.transitDaysMax ?? 999;
    if (aMax !== bMax) return aMax - bMax;
    const aMin = a.transitDaysMin ?? 999;
    const bMin = b.transitDaysMin ?? 999;
    if (aMin !== bMin) return aMin - bMin;
    return (a.netPrice ?? Infinity) - (b.netPrice ?? Infinity);
  });
}

/** Die Carrierauswahl: nur Carrier, die in der Antwort Angebote tragen, in der Reihenfolge des Servers. */
export function carrierChoices(publicCarriers, offers) {
  const mitAngebot = new Set((Array.isArray(offers) ? offers : []).filter(istAngebot).map((o) => o.publicCarrierId));
  return (Array.isArray(publicCarriers) ? publicCarriers : [])
    .filter((c) => c && typeof c.id === "string" && mitAngebot.has(c.id))
    .map((c) => ({ id: c.id, label: c.id === "other" ? "Versandpartner" : (typeof c.name === "string" && c.name.trim() ? c.name.trim() : c.id) }));
}

// ─── Preis ───────────────────────────────────────────────────────────────────
export const PRICE_TEXT = Object.freeze({
  from: "ab",
  fromNote: "Der Endpreis wird nach der Anmeldung mit vollständigen Sendungsangaben berechnet.",
  net: "netto",
  gross: "brutto",
  vatNote: "zzgl. MwSt.",
  onRequest: "Preis auf Anfrage",
});

const betrag = (w) => (typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : null);
const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** Ein Betrag in de-DE — ohne Betrag `null` (nie „0,00 €" für etwas Unbekanntes). */
export function formatEuro(wert) {
  const b = betrag(wert);
  return b === null ? null : EUR.format(b);
}

/**
 * Netto und Brutto einer Karte, mit „ab", wenn der Server den Preis nicht als exakt kennzeichnet.
 * @returns {{status: "exact"|"from", net: string|null, gross: string|null, note: string|null, onRequest: boolean}}
 */
export function offerPriceView(offer) {
  const o = istAngebot(offer) ? offer : {};
  const status = o.priceStatus === "exact" ? "exact" : "from";
  const anzeige = vatDisplay({ net: betrag(o.netPrice), gross: betrag(o.finalPrice) }, "net");
  const netto = anzeige && anzeige.primary ? formatEuro(anzeige.primary.amount) : formatEuro(o.netPrice);
  const brutto = anzeige && anzeige.secondary ? formatEuro(anzeige.secondary.amount) : formatEuro(o.finalPrice);
  if (netto === null) return { status, net: null, gross: null, note: null, onRequest: true };
  const prefix = status === "from" ? `${PRICE_TEXT.from} ` : "";
  return {
    status,
    net: `${prefix}${netto}`,
    gross: brutto === null ? null : `${prefix}${brutto}`,
    note: status === "from" ? PRICE_TEXT.fromNote : null,
    onRequest: false,
  };
}

// ─── Abholung, Zustellung, Laufzeit ──────────────────────────────────────────
export const SCHEDULE_TEXT = Object.freeze({
  byCarrier: "laut Versanddienstleister",
  // TG-L2: die voraussichtliche Zustellung rechnet ConfidaraExpress aus Versandtag und Laufzeit — sie steht nicht
  // „laut Versanddienstleister" da. Die Laufzeit und eine belegte Uhrzeit nennt der Versanddienstleister.
  estimated: "aus Versandtag und Laufzeit berechnet",
  pickup: "Abholung",
  dropoff: "Abgabe im Paketshop",
  pickupDay: "Abholtag",
  dropoffDay: "Abgabe ab",
});

const WOCHENTAG = Object.freeze(["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."]);
/** „2026-10-21" → „Mi., 21.10." — rein aus dem Kalendertag, ohne Zeitzone. */
export function shortDay(iso) {
  const m = typeof iso === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const utc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(utc.getTime())) return null;
  return `${WOCHENTAG[utc.getUTCDay()]}, ${m[3]}.${m[2]}.`;
}

/** Übergabe und Abholtag — dieselben Felder und dieselbe Regel wie die Karte im Portal. */
export function offerPickupView(offer) {
  const vertrag = pickupContractOf(offer);
  const modus = handoverMode(offer);
  const title = modus === HANDOVER_DROPOFF ? SCHEDULE_TEXT.dropoff
    : modus === HANDOVER_PICKUP ? (offer && offer.pickupToday === true ? "Abholung heute" : SCHEDULE_TEXT.pickup)
      : null;
  return {
    title,
    dayLabel: modus === HANDOVER_DROPOFF ? SCHEDULE_TEXT.dropoffDay : SCHEDULE_TEXT.pickupDay,
    day: vertrag.day ? shortDay(vertrag.day) : null,
    time: pickupTimeText(vertrag),
    adjustedNote: pickupAdjustedNote(vertrag),
  };
}

/** Zustellung oder Laufzeit mit dem Zusatz „laut Versanddienstleister" — eine voraussichtliche Zustellung des
 *  Servers (TG-L2) mit „aus Versandtag und Laufzeit berechnet". */
export function offerDeliveryView(offer) {
  const z = deliveryContractOf(offer);
  let value;
  if (z.kind === "range") value = `${shortDay(z.dayFrom)} – ${shortDay(z.dayUntil)}`;
  else if (z.kind === "date") value = shortDay(z.day);
  else if (z.kind === "estimate") value = projectedDeliveryText(z.estimate);
  else if (z.kind === "transit") value = z.transit;
  else value = null;
  if (!value) return { label: z.label, value: DELIVERY_ON_REQUEST, note: null, time: null };
  const frueh = earlyDeliveryNote(offer);
  return {
    label: z.label,
    value,
    note: z.kind === "estimate" ? SCHEDULE_TEXT.estimated : SCHEDULE_TEXT.byCarrier,
    time: frueh || deliveryTimeLabel(offer) || null,
  };
}

// ─── Hinweise und Aktion ─────────────────────────────────────────────────────
export const HINT_TEXT = Object.freeze({
  printerRequired: "Drucker für das Versandlabel erforderlich",
  printerNotRequired: "Kein Drucker erforderlich",
  businessRecipient: OFFER_BUSINESS_RECIPIENT_TEXT,
  labelAtPickup: `Versandlabel: ${LABEL_HANDLING_TEXT.offer}`,
});

/**
 * Die Zusatzhinweise einer Karte, in fester Reihenfolge. Nur aus Serverfeldern; ein fehlender Wert sagt nichts.
 * Der Zuschlagshinweis entsteht ausschließlich aus `requiredPriceInputs` — wie im Portal.
 */
export function offerHints(offer) {
  const o = istAngebot(offer) ? offer : {};
  const hinweise = [];
  if (offerRequiresResidentialChoice(o)) {
    hinweise.push(offerResidentialSurchargeFree(o) ? RESIDENTIAL_TEXT.addressTypeHint : RESIDENTIAL_TEXT.surchargeHint);
  }
  if (o.recipientRequirement === "business") hinweise.push(HINT_TEXT.businessRecipient);
  if (carrierAppliesLabel(o)) hinweise.push(HINT_TEXT.labelAtPickup);
  else if (o.printerRequired === true) hinweise.push(HINT_TEXT.printerRequired);
  else if (o.printerRequired === false) hinweise.push(HINT_TEXT.printerNotRequired);
  return hinweise;
}

const TOKEN_RE = /^h1\.[A-Za-z0-9_-]{16,4093}$/;

/** Darf die Karte die Übernahme anbieten? Nur mit Serverzusage UND gültigem Token. */
export function offerCanContinue(offer) {
  const o = istAngebot(offer) ? offer : {};
  return o.availableWithShipmentDetails === true && typeof o.handoffToken === "string" && TOKEN_RE.test(o.handoffToken);
}

/**
 * Warum keine Übernahme? Der Grundtext des Portals (offerIdentity.mjs) zum Grund des Servers — die Karte bleibt
 * sichtbar wie im Portal, nur ohne Aktion. Ohne bekannten Grund der neutrale Satz des Portals.
 */
export function offerUnavailableText(offer) {
  if (offerCanContinue(offer)) return null;
  const o = istAngebot(offer) ? offer : {};
  return offerBlockedLabel({ unavailableReason: o.unavailableReason ?? null, bookable: false });
}

/** Die feste Übernahmeadresse auf der Hauptdomain — das Token nur im Fragment. */
export function handoffUrl(token) {
  return TOKEN_RE.test(String(token ?? "")) ? `${PUBLIC_HANDOFF_URL}#t=${token}` : null;
}

// ─── Antwort und Fehler ──────────────────────────────────────────────────────
export const OUTCOME = Object.freeze({
  OK: "ok",
  PARTIAL: "partial",
  NO_OFFERS: "no_offers",
  INVALID: "invalid",
  ROUTE: "route",
  RATE_LIMITED: "rate_limited",
  UNAVAILABLE: "unavailable",
  UPSTREAM: "upstream",
  TIMEOUT: "timeout",
  NETWORK: "network",
  SERVER: "server",
});

export const OUTCOME_TEXT = Object.freeze({
  [OUTCOME.PARTIAL]: {
    title: "Nicht alle Versanddienstleister haben geantwortet",
    message: "Die Liste zeigt die Angebote, die rechtzeitig vorlagen. Eine erneute Berechnung kann weitere Angebote ergeben.",
  },
  [OUTCOME.NO_OFFERS]: {
    title: "Keine direkt buchbaren Angebote",
    message: "Für diese Strecke, dieses Datum und diese Paketdaten ist derzeit kein Angebot direkt buchbar. Ändern Sie zum Beispiel das Versanddatum oder die Auswahl „Abholung / Abgabe“.",
  },
  [OUTCOME.INVALID]: { title: "Angaben prüfen", message: "Bitte prüfen Sie die markierten Angaben." },
  // Paket C (2026-10-23): die Antwort nennt Grund, Seite und erkanntes Gebiet; `quoteOutcomeFromResponse`
  // legt den daraus formulierten Satz als `message` an den Ausgang (launchRouteText.mjs). Hier nur der Rückfall.
  [OUTCOME.ROUTE]: {
    title: ROUTE_NOT_SUPPORTED_TITLE,
    message: launchRouteBlockedText({}),
  },
  [OUTCOME.RATE_LIMITED]: {
    title: "Zu viele Anfragen",
    message: "Es wurden in kurzer Zeit zu viele Preise berechnet. Bitte versuchen Sie es in einigen Minuten erneut.",
  },
  [OUTCOME.UNAVAILABLE]: {
    title: "Der Preisrechner ist derzeit nicht verfügbar",
    message: "Bitte versuchen Sie es später erneut. Angemeldete Kundinnen und Kunden berechnen Preise jederzeit im Kundenbereich.",
  },
  [OUTCOME.UPSTREAM]: {
    title: "Preise gerade nicht verfügbar",
    message: "Die Preise konnten gerade nicht ermittelt werden. Bitte versuchen Sie es erneut.",
  },
  [OUTCOME.TIMEOUT]: {
    title: "Zeitüberschreitung",
    message: "Die Berechnung hat länger gedauert als erwartet. Bitte versuchen Sie es erneut.",
  },
  [OUTCOME.NETWORK]: {
    title: "Verbindung unterbrochen",
    message: "Die Verbindung wurde unterbrochen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
  },
  [OUTCOME.SERVER]: {
    title: "Technisches Problem",
    message: "Die Anfrage konnte gerade nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
  },
});

// Feldnamen des Servers → Formularfelder (Fehler am richtigen Feld).
const FELD = Object.freeze({
  from_country: "from_country", from_zip: "from_zip", from_city: "from_city",
  to_country: "to_country", to_zip: "to_zip", to_city: "to_city",
  packageCount: "packageCount", weight: "weight", length: "length", width: "width", height: "height",
});

const text = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

/**
 * Die Antwort des Servers als Zustand. Kein Rohtext erreicht die Seite außer der deutschen Validierungsmeldung
 * des Servers (die bestehenden Prüfcodes mit Feld) — und auch die nur an ihrem Feld.
 *
 * @param {number} status   HTTP-Status
 * @param {object} body     gelesener JSON-Körper (oder null)
 * @returns {{outcome: string, result?: object, field?: string|null, fieldMessage?: string|null}}
 */
export function quoteOutcomeFromResponse(status, body) {
  const b = body && typeof body === "object" ? body : {};
  if (status === 200) {
    const offers = Array.isArray(b.offers) ? b.offers.filter(istAngebot) : [];
    const result = {
      status: b.status === "partial" || b.status === "no_offers" ? b.status : "ok",
      quotedAt: text(b.quotedAt),
      offers,
      publicCarriers: Array.isArray(b.publicCarriers) ? b.publicCarriers : [],
      availableShippingModes: Array.isArray(b.availableShippingModes) ? b.availableShippingModes : [],
    };
    if (offers.length === 0) return { outcome: result.status === "partial" ? OUTCOME.PARTIAL : OUTCOME.NO_OFFERS, result };
    return { outcome: result.status === "partial" ? OUTCOME.PARTIAL : OUTCOME.OK, result };
  }
  if (status === 422 && b.code === "ROUTE_NOT_SUPPORTED") return { outcome: OUTCOME.ROUTE, message: launchRouteBlockedText(b) };
  // Unterschiedliche Pakete ohne Angebot (Canonical v2.79) sind kein Eingabefehler — kein Feld wäre markiert —,
  // sondern der Leerzustand einer leeren Liste: „Keine direkt buchbaren Angebote“ mit dem Paketzusatz, wie im
  // Portal (apiError.mjs).
  if (status === 422 && b.code === "PACKAGE_COMBINATION_UNAVAILABLE") {
    return { outcome: OUTCOME.NO_OFFERS, result: { status: "no_offers", quotedAt: null, offers: [], publicCarriers: [], availableShippingModes: [] } };
  }
  if (status === 400 || status === 422) {
    // Paketzeilen: `packageLines[i].<feld>` an Zeile i, `packageLines` an der Summe (Canonical v2.79).
    const field = typeof b.field === "string" && FELD[b.field] ? FELD[b.field] : mapPackageLinesServerField(b.field);
    return { outcome: OUTCOME.INVALID, field, fieldMessage: field ? text(b.error) : null };
  }
  if (status === 429) return { outcome: OUTCOME.RATE_LIMITED };
  if (status === 503) return { outcome: OUTCOME.UNAVAILABLE };
  if (status === 502 || status === 504) return { outcome: OUTCOME.UPSTREAM };
  return { outcome: OUTCOME.SERVER };
}

/** Ein geworfener Fehler (Netz, Zeitlimit) als Zustand. Ein Abbruch durch die Seite selbst ist kein Zustand. */
export function quoteOutcomeFromError(error) {
  if (error && error.name === "AbortError") return null;
  if (error && (error.name === "ApiTimeoutError" || error.code === "API_TIMEOUT")) return { outcome: OUTCOME.TIMEOUT };
  return { outcome: OUTCOME.NETWORK };
}

/** Die Ansage für Screenreader nach einer Berechnung. */
export function resultAnnouncement(outcome, count) {
  if (outcome === OUTCOME.OK || outcome === OUTCOME.PARTIAL) {
    if (count === 1) return "1 Angebot gefunden.";
    if (count > 1) return `${count} Angebote gefunden.`;
  }
  const t = OUTCOME_TEXT[outcome];
  return t ? t.title : "";
}

// ─── Verfügbarkeit (Aufwärmmeldung) ──────────────────────────────────────────
/** `true`/`false` aus der Antwort von prepare — sonst `null` (unbekannt: Absenden bleibt möglich). */
export function availabilityFromPrepare(body) {
  return body && typeof body === "object" && typeof body.available === "boolean" ? body.available : null;
}
