/* utils/sameDayCollectionView.mjs — Abholung am selben Tag, zur Anzeige gelesen (TG22 Same-Day).

   Reine Funktionen: kein Netz, kein Zustand, kein React und KEINE Uhr.

   ─── DER SERVER ENTSCHEIDET ──────────────────────────────────────────────────
   Ob ein Angebot heute abgeholt werden kann, bis wann das möglich ist und welcher Zuschlag dafür
   anfällt, sagt ausschließlich der Server: als Felder am Angebot (`pickupToday`, `pickupTodayUntil`,
   `sameDaySurchargeNet`, `sameDaySurchargeGross`), als Block `sameDayCollection` der Options-, Bindungs-
   und Buchungsantwort, als Preisbestandteil `same_day_collection_surcharge` und als einer von drei Gründen
   (`same_day_unavailable`, `same_day_unconfirmed`, `same_day_unverifiable`) bzw. — bei einer abgelehnten
   Anfrage — als Art `sameDayUnavailableKind` (`expired`, `unconfirmed`, `unverifiable`). Diese Datei
   vergleicht kein Datum, liest keine Uhr und gibt nichts frei: fehlt eine Angabe oder ist sie unbrauchbar,
   entsteht keine Zeile; eine unbekannte Art ergibt den zurückhaltenden Satz „kann derzeit nicht bestätigt
   werden" — nie „nicht mehr möglich".

   ─── ES WIRD NICHTS GERECHNET ────────────────────────────────────────────────
   Der Angebotspreis enthält den Zuschlag bereits. Die Zeile nennt ihn — sie addiert ihn nicht, und
   kein Betrag entsteht aus einem anderen.

   ─── KEIN PROVIDERNAME ───────────────────────────────────────────────────────
   Die Texte nennen weder Einkaufsquelle noch Anbietercode, Abholschluss des Anbieters oder einen
   Positionstext einer Anbieterrechnung. */
import { money, isoDayDE } from "./formatters.js";
import { readPriceComponents, PRICE_COMPONENT_TYPE, PRICE_COMPONENT_LABELS } from "./priceComponentsView.mjs";
import {
  OFFER_SAME_DAY_UNAVAILABLE_TEXT, OFFER_SAME_DAY_UNCONFIRMED_TEXT, OFFER_SAME_DAY_UNVERIFIABLE_TEXT,
  OFFER_SAME_DAY_UNAVAILABLE_HINT, OFFER_SAME_DAY_REASONS,
} from "./offerIdentity.mjs";

/** Der Grund eines Angebots, dessen Abholung heute ZEITLICH nicht mehr möglich ist. */
export const SAME_DAY_UNAVAILABLE_REASON = "same_day_unavailable";
/** Alle drei Gründe einer nicht angebotenen Abholung heute (abgelaufen, nicht bestätigt, nicht verifizierbar). */
export const SAME_DAY_UNAVAILABLE_REASONS = OFFER_SAME_DAY_REASONS;
/** Der Ablehnungscode von Optionen, Bindung, Neubepreisung und Buchung. */
export const SAME_DAY_COLLECTION_UNAVAILABLE_CODE = "SAME_DAY_COLLECTION_UNAVAILABLE";
/** Die Art einer solchen Ablehnung (`sameDayUnavailableKind` der Antwort). */
export const SAME_DAY_UNAVAILABLE_KIND = Object.freeze({
  EXPIRED: "expired",
  UNCONFIRMED: "unconfirmed",
  UNVERIFIABLE: "unverifiable",
});

/* Die sichtbaren Texte — hier und nicht im JSX, damit sie geprüft werden können. */
export const SAME_DAY_TEXT = Object.freeze({
  surchargeLabel: PRICE_COMPONENT_LABELS[PRICE_COMPONENT_TYPE.SAME_DAY_COLLECTION_SURCHARGE],
  unavailable: OFFER_SAME_DAY_UNAVAILABLE_TEXT,
  unconfirmed: OFFER_SAME_DAY_UNCONFIRMED_TEXT,
  unverifiable: OFFER_SAME_DAY_UNVERIFIABLE_TEXT,
  unavailableHint: OFFER_SAME_DAY_UNAVAILABLE_HINT,
  bookingUnavailable: `${OFFER_SAME_DAY_UNAVAILABLE_TEXT} ${OFFER_SAME_DAY_UNAVAILABLE_HINT}`,
  bookingUnconfirmed: `${OFFER_SAME_DAY_UNCONFIRMED_TEXT} ${OFFER_SAME_DAY_UNAVAILABLE_HINT}`,
  bookingUnverifiable: `${OFFER_SAME_DAY_UNVERIFIABLE_TEXT} ${OFFER_SAME_DAY_UNAVAILABLE_HINT}`,
  pickupLabel: "Abholung",
});

// Kurzsatz und vollständiger Satz je Art — die EINE Zuordnung der Oberfläche.
const TEXT_JE_ART = Object.freeze({
  [SAME_DAY_UNAVAILABLE_KIND.EXPIRED]: Object.freeze({
    title: SAME_DAY_TEXT.unavailable, message: SAME_DAY_TEXT.bookingUnavailable }),
  [SAME_DAY_UNAVAILABLE_KIND.UNCONFIRMED]: Object.freeze({
    title: SAME_DAY_TEXT.unconfirmed, message: SAME_DAY_TEXT.bookingUnconfirmed }),
  [SAME_DAY_UNAVAILABLE_KIND.UNVERIFIABLE]: Object.freeze({
    title: SAME_DAY_TEXT.unverifiable, message: SAME_DAY_TEXT.bookingUnverifiable }),
});

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const KALENDERTAG = /^\d{4}-\d{2}-\d{2}$/;

const istObjekt = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const betrag = (w) => (typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : null);
const uhrzeit = (w) => (typeof w === "string" && UHRZEIT.test(w.trim()) ? w.trim() : null);
const kalendertag = (w) => (typeof w === "string" && KALENDERTAG.test(w.trim()) ? w.trim() : null);

/**
 * Die Art einer Ablehnung `SAME_DAY_COLLECTION_UNAVAILABLE` — aus `sameDayUnavailableKind` der Antwort.
 * Eine fehlende oder unbekannte Art ist fail closed „nicht verifizierbar": die Oberfläche behauptet keinen
 * zeitlichen Ablauf, den der Server nicht genannt hat.
 */
export function sameDayUnavailableKindOf(body) {
  const art = istObjekt(body) ? body.sameDayUnavailableKind : null;
  return Object.prototype.hasOwnProperty.call(TEXT_JE_ART, art) ? art : SAME_DAY_UNAVAILABLE_KIND.UNVERIFIABLE;
}

/** Kurzsatz (`title`) und vollständiger Satz mit Hinweis (`message`) einer solchen Ablehnung. */
export function sameDayUnavailableView(body) {
  return TEXT_JE_ART[sameDayUnavailableKindOf(body)];
}

/** Der Kundentext einer solchen Ablehnung — Satz der Art und „Bitte wählen Sie einen späteren Abholtag.". */
export function sameDayUnavailableBookingText(body) {
  return sameDayUnavailableView(body).message;
}

/**
 * Die Aussage einer Angebotskarte zur Abholung am selben Tag — oder `null`.
 *
 * Nur, wenn der Server sie VOLLSTÄNDIG trifft: `pickupToday === true`, eine lesbare Uhrzeit, bis zu der
 * die Abholung heute möglich ist, und beide Zuschlagsbeträge. Ein Angebot mit `pickupToday`, aber ohne
 * diese Angaben (ein Tarif, dessen Abholung heute keinen eigenen Zuschlag trägt), bekommt keine Zeile.
 *
 * @returns {{until: string, untilText: string, surchargeNet: number, surchargeGross: number}|null}
 */
export function sameDayOfferView(tariff) {
  const t = istObjekt(tariff) ? tariff : {};
  if (t.pickupToday !== true) return null;
  const until = uhrzeit(t.pickupTodayUntil);
  const surchargeNet = betrag(t.sameDaySurchargeNet);
  const surchargeGross = betrag(t.sameDaySurchargeGross);
  if (until === null || surchargeNet === null || surchargeGross === null) return null;
  if (!(surchargeNet > 0) || surchargeGross < surchargeNet) return null;
  return Object.freeze({
    until,
    untilText: `Abholung heute möglich bis ${until} Uhr`,
    surchargeNet,
    surchargeGross,
  });
}

/** „Zuschlag für Abholung am selben Tag: +X,XX €" — netto oder brutto, wie der Kartenpreis darüber. */
export function sameDaySurchargeLine(view, vatMode) {
  if (!view) return null;
  const wert = vatMode === "gross" ? view.surchargeGross : view.surchargeNet;
  return `${SAME_DAY_TEXT.surchargeLabel}: +${money(wert)}`;
}

/** Die Detailzeile der Preisaufschlüsselung — beide Beträge, beide vom Server. */
export function sameDayDetailValue(view) {
  if (!view) return null;
  return `+${money(view.surchargeNet)} netto · +${money(view.surchargeGross)} brutto`;
}

/** „Abholung heute möglich bis HH:MM Uhr" eines Angebots — oder `null`. */
export function sameDayUntilText(tariff) {
  const v = sameDayOfferView(tariff);
  return v ? v.untilText : null;
}

/**
 * Die kurze Zeile der Buchungszusammenfassungen: „inkl. Zuschlag für Abholung am selben Tag X,XX €".
 *
 * Zum bestätigten Preis aus dem Serverbestandteil. Solange der Preis nicht bestätigt ist (Art der
 * Lieferadresse offen, Absicherung wird bepreist), aus den Serverfeldern des Angebots — dessen Preis den
 * Zuschlag bereits enthält. Nach einer gemeldeten Preisänderung gilt kein Betrag, also auch keine Zeile.
 */
export function sameDaySummaryNote(priceView, tariff) {
  const v = istObjekt(priceView) ? priceView : {};
  if (v.isPriceChanged === true) return null;
  if (v.hasConfirmedPrice === true) {
    const liste = readPriceComponents(v.components);
    if (liste) {
      const k = liste.find((b) => b.type === PRICE_COMPONENT_TYPE.SAME_DAY_COLLECTION_SURCHARGE);
      return k ? `inkl. ${k.label} ${money(k.gross)}` : null;
    }
  }
  const angebot = sameDayOfferView(tariff);
  return angebot ? `inkl. ${SAME_DAY_TEXT.surchargeLabel} ${money(angebot.surchargeGross)}` : null;
}

/**
 * Der Block `sameDayCollection` einer Options- oder Bindungsantwort.
 *
 * @returns {{ok: true, value: object|null} | {ok: false}}  `value: null` ohne Block; `ok: false` bei einem
 *          Block in anderer Form — dann beschreibt die Antwort etwas anderes als diesen Vertrag.
 */
export function readSameDayCollectionBlock(roh) {
  if (roh === undefined || roh === null) return { ok: true, value: null };
  if (!istObjekt(roh)) return { ok: false };
  const pickupTodayUntil = uhrzeit(roh.pickupTodayUntil);
  const collectionDate = kalendertag(roh.collectionDate);
  const collectionReadyFrom = uhrzeit(roh.collectionReadyFrom);
  const s = istObjekt(roh.surcharge) ? roh.surcharge : {};
  const net = betrag(s.net);
  const vat = betrag(s.vat);
  const gross = betrag(s.gross);
  if (pickupTodayUntil === null || collectionDate === null || collectionReadyFrom === null) return { ok: false };
  if (net === null || vat === null || gross === null || !(gross > 0)) return { ok: false };
  return {
    ok: true,
    value: Object.freeze({
      pickupTodayUntil, collectionDate, collectionReadyFrom,
      surcharge: Object.freeze({ net, vat, gross }),
    }),
  };
}

/**
 * Die tatsächlich gesendete Abholung einer Buchung am selben Tag — „TT.MM.JJJJ · bereit ab HH:MM Uhr" —
 * oder `null`. Ausschließlich aus der Buchungsantwort, nie aus dem Angebot: die Uhrzeit, die der Server
 * beim Buchen gesendet hat, kann später liegen als die beim Angebotsvergleich genannte.
 */
export function sameDaySuccessPickupText(booking) {
  const b = istObjekt(booking) ? booking : {};
  const a = istObjekt(b.sameDayCollection) ? b.sameDayCollection : null;
  if (!a) return null;
  const tag = kalendertag(a.collectionDate);
  const ab = uhrzeit(a.collectionReadyFrom);
  if (tag === null || ab === null) return null;
  return `${isoDayDE(tag)} · bereit ab ${ab} Uhr`;
}
