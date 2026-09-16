/* utils/serviceDetailsView.mjs — das kuratierte Produktprofil eines Angebots als fertige Detailbereiche
   (TG22 Package A).

   Reine Funktionen: kein Netz, kein Zustand, kein React und KEINE Uhr.

   ─── DER SERVER BELEGT, DIESE DATEI FORMULIERT ────────────────────────────────
   Welche Produktangaben ein Angebot trägt, sagt ausschließlich der Server: `serviceDetails` (Codes und
   Zahlen), `tariffLimits`, `trackingAvailable`, `printerRequired`, `chargeableWeight`, die Labelangaben, die
   Laufzeit und die Absicherungsangaben. Hier entstehen daraus die Sätze — der Server schickt keinen Text.

   ─── OHNE PROFIL KEIN BEREICH ─────────────────────────────────────────────────
   Fehlt `serviceDetails` oder trägt es eine Form, die dieser Vertrag nicht kennt (ein unbekannter Code, ein
   Divisor, der keine ganze Zahl ist, unvollständige Grenzen), ist das Ergebnis `null`: die Karte zeigt dann
   unverändert ihren bisherigen Detailbereich. Gefragt wird nie nach der Einkaufsquelle, einer Kennung des
   Anbieters oder einem Carrier — entschieden wird an den DATEN.

   ─── ES WIRD NICHTS GERECHNET ─────────────────────────────────────────────────
   Das Abrechnungsgewicht kommt vom Server. Der Divisor steht nur in der Erklärung („L × B × H ÷ 5.000“) —
   aus ihm entsteht keine Zahl. Aus der Laufzeit wird kein Datum, aus einer Grenze kein Preis.

   ─── EIN NICHT BELEGTER DIVISOR ───────────────────────────────────────────────
   `volumetricDivisor: null` heißt „für diesen Service nicht belegt“ (UPS-Familie). Das Profil gilt dann
   trotzdem; es entfällt nur die Volumengewichtserklärung — keine Formel, kein Hinweis, kein Ersatzwert. */
import { fmtDelivery, money } from "./formatters.js";
import { handoverMode, HANDOVER_PICKUP } from "./handoverMode.mjs";
import { chargeableWeightLine, labelCapabilityLine, OFFER_METADATA_LABEL } from "./offerMetadataView.mjs";
import { offerCardInsurance } from "./coverInsuranceView.mjs";
import { COVER_INSURANCE_TEXT } from "./insuranceTerms.mjs";
import { readDeliveryProjection, projectedDeliveryText, DELIVERY_PROJECTION_TEXT } from "./deliveryProjectionView.mjs";

/* Die sichtbaren Texte — hier und nicht im JSX, damit sie geprüft werden können. */
export const SERVICE_DETAILS_TEXT = Object.freeze({
  mainTitle:             "Hauptmerkmale",
  transitTitle:          "Laufzeit",
  sizeTitle:             "Größe & Gewicht",
  coverTitle:            "Transportabsicherung",
  restrictionsTitle:     "Einschränkungen",
  pickup:                "Abholung an Ihrer Adresse",
  tracking:              "Sendungsverfolgung inklusive",
  label:                 "Versandlabel zum Ausdrucken",
  transitLabel:          "Voraussichtliche Laufzeit",
  transitNote:           "Die Laufzeit ist eine Schätzung des Versanddienstleisters und keine Zustellzusage.",
  packagesLabel:         "Packstücke",
  maxWeightLabel:        "Max. Gewicht",
  chargeableWeightLabel: OFFER_METADATA_LABEL.chargeableWeight,
  chargeableWeightNote:  "Für die Abrechnung zählt das höhere Gewicht aus tatsächlichem Gewicht und Volumengewicht.",
  volumetricLabel:       "Volumengewicht",
  basicCoverLabel:       "Grundabsicherung",
  additionalCoverLabel:  COVER_INSURANCE_TEXT.sectionTitle,
  excessLabel:           COVER_INSURANCE_TEXT.excessLabel,
  notAcceptedLabel:      "Nicht zugelassen",
});

/* Die Kurzbeschreibung je Code. Ein Code ohne Satz ergibt kein Profil. */
export const SERVICE_SUMMARY_TEXT = Object.freeze({
  economy_standard: "Wirtschaftlicher Standardversand für weniger eilige Sendungen.",
  express_urgent:   "Schneller Expressversand für eilige Sendungen.",
});

/* Die nicht zugelassenen Sendungsarten je Code. */
export const SERVICE_NOT_ACCEPTED_TEXT = Object.freeze({
  pallets:   "Paletten",
  suitcases: "Koffer",
});

const istObjekt = (w) => !!w && typeof w === "object" && !Array.isArray(w);
// Nur eigene Schlüssel: „constructor" oder „__proto__" sind kein Code.
const hat = (tabelle, code) => typeof code === "string" && Object.prototype.hasOwnProperty.call(tabelle, code);
const positiv = (w) => typeof w === "number" && Number.isFinite(w) && w > 0;

/* Ganze Zahlen mit Tausenderpunkt („5.000“), Gewichte mit höchstens zwei Nachkommastellen („31,5“). */
const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const KG = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
// Eine Grenze im Satz: glatte Beträge ohne Nachkommastellen („50 €“, „2.500 €“), sonst centgenau.
const grenzeEuro = (v) => new Intl.NumberFormat("de-DE", {
  style: "currency", currency: "EUR",
  minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
}).format(v);

/* Das Profil in genau der Form des Vertrags — oder `null`. Weitere Schlüssel werden nicht gelesen. */
function leseProfil(roh) {
  if (!istObjekt(roh)) return null;
  if (!hat(SERVICE_SUMMARY_TEXT, roh.summaryKey)) return null;
  // Eine positive ganze Zahl — oder ausdrücklich `null` („nicht belegt“). Ein fehlender Schlüssel ist keine Aussage.
  const divisorNichtBelegt = roh.volumetricDivisor === null;
  if (!divisorNichtBelegt && (!Number.isSafeInteger(roh.volumetricDivisor) || roh.volumetricDivisor <= 0)) return null;
  const liste = roh.notAccepted;
  if (!Array.isArray(liste) || liste.length === 0) return null;
  if (liste.some((code) => !hat(SERVICE_NOT_ACCEPTED_TEXT, code))) return null;
  if (new Set(liste).size !== liste.length) return null;
  const basis = roh.basicCoverMaxGoodsValue ?? null;
  const hoechst = roh.maxCoverValue ?? null;
  const ohneGrenzen = basis === null && hoechst === null;
  if (!ohneGrenzen && !(positiv(basis) && positiv(hoechst) && hoechst > basis)) return null;
  return {
    summaryKey: roh.summaryKey,
    volumetricDivisor: roh.volumetricDivisor,
    notAccepted: [...liste],
    basicCoverMaxGoodsValue: basis,
    maxCoverValue: hoechst,
  };
}

/* Eine Tarifgrenze „<=“ des Servers — nur mit echter positiver Zahl. */
function grenzeVon(tariffLimits, operant) {
  for (const l of Array.isArray(tariffLimits) ? tariffLimits : []) {
    if (istObjekt(l) && l.operant === operant && l.operator === "<=" && positiv(l.value)) return l.value;
  }
  return null;
}

/**
 * Das Produktprofil eines Angebots als fünf Detailbereiche — oder `null`.
 *
 * @returns {null | {
 *   main:         { summary: string, features: {id, icon, label, value: string|null}[] },
 *   transit:      { rows: {id, label, value}[], note: string } | null,
 *   size:         { rows: {id, label, value}[], note: string|null, formula: string|null } | null,
 *   cover:        { rows: {id, label, value}[], note: string|null } | null,
 *   restrictions: { rows: {id, label, value}[] },
 * }}
 */
export function serviceDetailsView(tariff) {
  if (!istObjekt(tariff)) return null;
  const t = tariff;
  const profil = leseProfil(t.serviceDetails);
  if (!profil) return null;
  // Eine Absicherung in Stufen (Standard/Premium) beschreibt dieses Profil nicht — dann bleibt der bisherige
  // Detailbereich, statt ihre Angaben zu verlieren.
  const absicherung = offerCardInsurance(t);
  if (absicherung.insurable && !absicherung.coverModel) return null;

  // ── 1. Hauptmerkmale ──────────────────────────────────────────────────────────
  // Nur, was das Angebot selbst belegt: die Übergabeart, eine Sendungsverfolgung, eine Druckpflicht.
  const features = [];
  if (handoverMode(t) === HANDOVER_PICKUP) {
    features.push({ id: "pickup", icon: "package", label: SERVICE_DETAILS_TEXT.pickup, value: null });
  }
  if (t.trackingAvailable === true) {
    features.push({ id: "tracking", icon: "truck", label: SERVICE_DETAILS_TEXT.tracking, value: null });
  }
  if (t.printerRequired === true) {
    features.push({ id: "label", icon: "printer", label: SERVICE_DETAILS_TEXT.label, value: labelCapabilityLine(t) });
  }

  // ── 2. Laufzeit — genau einmal, als Schätzung ─────────────────────────────────
  // TG22 Package B: darunter die voraussichtliche Lieferung, die der SERVER aus Abholtag und Laufzeit
  // gerechnet hat — mit eigenem kurzen Hinweis. Die Laufzeit des Anbieters bleibt stehen.
  const laufzeit = fmtDelivery(t);
  const prognose = projectedDeliveryText(readDeliveryProjection(t));
  const transitRows = [];
  if (laufzeit) transitRows.push({ id: "transit", label: SERVICE_DETAILS_TEXT.transitLabel, value: laufzeit });
  if (prognose) transitRows.push({ id: "projection", label: DELIVERY_PROJECTION_TEXT.label, value: prognose });
  const transit = transitRows.length > 0
    ? { rows: transitRows,
        note: laufzeit ? SERVICE_DETAILS_TEXT.transitNote : null,
        projectionNote: prognose ? DELIVERY_PROJECTION_TEXT.note : null }
    : null;

  // ── 3. Größe & Gewicht ────────────────────────────────────────────────────────
  const sizeRows = [];
  const packstuecke = grenzeVon(t.tariffLimits, "packages_count");
  if (packstuecke !== null && Number.isInteger(packstuecke)) {
    sizeRows.push({ id: "packages", label: SERVICE_DETAILS_TEXT.packagesLabel,
                    value: packstuecke === 1 ? "1 je Sendung" : `bis ${packstuecke} je Sendung` });
  }
  const hoechstgewicht = grenzeVon(t.tariffLimits, "weight");
  if (hoechstgewicht !== null) {
    sizeRows.push({ id: "maxWeight", label: SERVICE_DETAILS_TEXT.maxWeightLabel, value: `${KG.format(hoechstgewicht)} kg` });
  }
  const abrechnung = chargeableWeightLine(t);
  if (abrechnung !== null) {
    sizeRows.push({ id: "chargeableWeight", label: SERVICE_DETAILS_TEXT.chargeableWeightLabel, value: abrechnung });
  }
  // Die Volumengewichtserklärung nur mit belegtem Divisor; ohne Zeilen und ohne Erklärung kein Abschnitt.
  const mitDivisor = profil.volumetricDivisor !== null;
  const size = sizeRows.length > 0 || mitDivisor ? {
    rows: sizeRows,
    note: mitDivisor ? SERVICE_DETAILS_TEXT.chargeableWeightNote : null,
    formula: mitDivisor ? `${SERVICE_DETAILS_TEXT.volumetricLabel}: L × B × H ÷ ${ZAHL.format(profil.volumetricDivisor)}` : null,
  } : null;

  // ── 4. Transportabsicherung ───────────────────────────────────────────────────
  // Die Grenzen aus dem Profil; die Selbstbeteiligung ausschließlich aus der Absicherungsangabe des Angebots,
  // und nur, wo die zusätzliche Absicherung für diese Sendung wählbar ist.
  const coverRows = [];
  if (profil.basicCoverMaxGoodsValue !== null) {
    coverRows.push({ id: "basicCover", label: SERVICE_DETAILS_TEXT.basicCoverLabel,
                     value: `bis ${grenzeEuro(profil.basicCoverMaxGoodsValue)} Warenwert` });
    coverRows.push({ id: "additionalCover", label: SERVICE_DETAILS_TEXT.additionalCoverLabel,
                     value: `bis ${grenzeEuro(profil.maxCoverValue)} Warenwert` });
  }
  const waehlbar = absicherung.insurable && absicherung.coverModel;
  if (waehlbar && absicherung.excessValue !== null) {
    coverRows.push({ id: "excess", label: SERVICE_DETAILS_TEXT.excessLabel, value: money(absicherung.excessValue) });
  }
  const coverNote = absicherung.notice ? absicherung.notice.text : (waehlbar ? COVER_INSURANCE_TEXT.offerPriceNote : null);
  const cover = coverRows.length > 0 || coverNote !== null ? { rows: coverRows, note: coverNote } : null;

  // ── 5. Einschränkungen ────────────────────────────────────────────────────────
  const restrictions = {
    rows: [{ id: "notAccepted", label: SERVICE_DETAILS_TEXT.notAcceptedLabel,
             value: profil.notAccepted.map((code) => SERVICE_NOT_ACCEPTED_TEXT[code]).join(", ") }],
  };

  return {
    main: { summary: SERVICE_SUMMARY_TEXT[profil.summaryKey], features },
    transit,
    size,
    cover,
    restrictions,
  };
}
