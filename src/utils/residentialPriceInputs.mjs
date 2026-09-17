/* utils/residentialPriceInputs.mjs — „Art der Lieferadresse" NACH der Angebotsauswahl.

   Reine Funktionen: kein Netz, kein Zustand, kein React. Die Buchungsseite ruft die beiden
   Endpunkte (src/api/client.js) und reicht die Antworten hierher; hier wird nur gelesen,
   geprüft und für die Anzeige aufbereitet.

   ─── WORUM ES GEHT ───────────────────────────────────────────────────────────
   Manche Angebote tragen einen Zuschlag, wenn die Lieferadresse eine Privatadresse ist. Die
   Frage steht deshalb NICHT mehr im Sendungsformular, sondern erst auf der Buchungsseite eines
   solchen Angebots — und nur dort. Welches Angebot sie braucht, sagt der Server:
   `requiredPriceInputs` enthält `deliveryIsResidential`. Ein Angebot ohne diesen Schlüssel
   bekommt keine Frage, keine Optionsanfrage und keine Bindung.

   ─── DER BETRAG KOMMT VOM SERVER ─────────────────────────────────────────────
   „+ X,XX €" ist der Zuschlag aus der Optionsantwort des Servers, nie eine Zahl dieser Datei.
   Nach der Bindung gelten ausschließlich die Server-Totals und die Serverbestandteile; hier
   wird nichts addiert, nichts gerundet und kein Betrag aus einem anderen abgeleitet.

   ─── DHL FOUNDATION: ERHOBEN, ABER OHNE ZUSCHLAG ─────────────────────────────
   Nennt der Server die Angabe zusätzlich in `surchargeFreePriceInputs`, wird sie genauso erfragt
   und gebunden — nach dem belegten Vertrag trägt sie aber keinen Zuschlag. Dann steht kein
   Zuschlagshinweis auf der Karte, beide Optionen tragen „+ 0,00 €" und denselben Preis, und keine
   Bindung trägt eine Zuschlagszeile. Fehlt die Liste, gilt der bisherige Vertrag. Welche Angebote
   das betrifft, entscheidet ausschließlich dieses Feld — keine Service- oder Carrierprüfung.

   ─── DREIWERTIG ──────────────────────────────────────────────────────────────
   `true` (Privatadresse), `false` (Geschäftsadresse) und `null` (noch nicht gewählt) sind drei
   Zustände. `false` ist eine vollwertige Antwort.

   ─── KEIN PROVIDERNAME ───────────────────────────────────────────────────────
   Weder in Feldnamen noch in Texten. */
import { money } from "./formatters.js";
import { readPriceComponents, hasResidentialSurcharge, hasSameDayCollectionSurcharge } from "./priceComponentsView.mjs";
import {
  readSameDayCollectionBlock, SAME_DAY_COLLECTION_UNAVAILABLE_CODE, SAME_DAY_UNAVAILABLE_KIND, sameDayUnavailableKindOf,
  SAME_DAY_TEXT,
} from "./sameDayCollectionView.mjs";
import { OFFER_ALREADY_USED_TEXT } from "./bookingErrors.mjs";
import { offerAwaitsPriceInputs, PRICE_INPUT_DELIVERY_RESIDENTIAL } from "./offerIdentity.mjs";

export { PRICE_INPUT_DELIVERY_RESIDENTIAL };

/* Die sichtbaren Texte — hier und nicht im JSX, damit sie geprüft werden können. */
export const RESIDENTIAL_TEXT = Object.freeze({
  sectionTitle: "Art der Lieferadresse",
  business: "Geschäftsadresse",
  private: "Privatadresse",
  gross: "brutto",
  net: "netto",
  loading: "Zuschlag wird berechnet …",
  error: "Der Zuschlag konnte nicht berechnet werden.",
  retry: "Erneut versuchen",
  binding: "Auswahl wird übernommen …",
  required: "Bitte wählen Sie zuerst die Art der Lieferadresse.",
  surchargeHint: "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.",
  // DHL Foundation: dieselbe Frage ohne belegten Zuschlag — kein Zuschlag wird angekündigt oder berechnet.
  addressTypeHint: "Die Art der Lieferadresse wird vor der Buchung abgefragt.",
  loadingNoSurcharge: "Preis wird geprüft …",
  errorNoSurcharge: "Der Preis konnte nicht geprüft werden.",
  rebind: "Der Preis für dieses Angebot hat sich geändert. Bitte wählen Sie die Art der Lieferadresse erneut.",
  reconfirm: "Die Angaben zum Zuschlag wurden aktualisiert. Bitte wählen Sie die Art der Lieferadresse erneut.",
  insuranceAfterChoice:
    "Die zusätzliche Transportabsicherung steht zur Verfügung, sobald die Art der Lieferadresse gewählt ist.",
  insuranceReset:
    "Die Art der Lieferadresse wurde geändert. Bitte wählen Sie die zusätzliche Transportabsicherung bei Bedarf erneut.",
  recalculate: "Dieses Angebot kann derzeit nicht gebucht werden. Bitte berechnen Sie die Angebote neu.",
  recalculateAction: "Angebote neu berechnen",
  used: OFFER_ALREADY_USED_TEXT,
  shipmentsAction: "Zu meinen Sendungen",
});

export const RESIDENTIAL_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  BINDING: "binding",
  ERROR: "error",
});

/* Was nach einer abgelehnten Options- oder Bindungsanfrage zu tun ist. */
export const RESIDENTIAL_ACTION = Object.freeze({
  RELOAD: "reload",            // Stand veraltet: Optionen neu laden, Kunde wählt erneut
  USED: "used",                // Angebot verbraucht: in die Sendungsliste
  RECALCULATE: "recalculate",  // Angebot trägt nicht mehr: neu berechnen
  RETRY: "retry",              // vorübergehend: Fehlerhinweis mit „Erneut versuchen"
  // TG22/TG23 Same-Day: die Abholung heute trägt nicht — ein späterer Abholtag, also neu berechnen. Je Art ein
  // eigener Satz: zeitlich abgelaufen, nicht bestätigt, nicht verifizierbar (auch jede unbekannte Art).
  SAME_DAY_UNAVAILABLE: "same_day_unavailable",
  SAME_DAY_UNCONFIRMED: "same_day_unconfirmed",
  SAME_DAY_UNVERIFIABLE: "same_day_unverifiable",
});

// TG22/TG23 Same-Day: die Aktion je Art der Antwort und der Satz je Aktion.
const SAME_DAY_AKTION_JE_ART = Object.freeze({
  [SAME_DAY_UNAVAILABLE_KIND.EXPIRED]: RESIDENTIAL_ACTION.SAME_DAY_UNAVAILABLE,
  [SAME_DAY_UNAVAILABLE_KIND.UNCONFIRMED]: RESIDENTIAL_ACTION.SAME_DAY_UNCONFIRMED,
  [SAME_DAY_UNAVAILABLE_KIND.UNVERIFIABLE]: RESIDENTIAL_ACTION.SAME_DAY_UNVERIFIABLE,
});
const SAME_DAY_TEXT_JE_AKTION = Object.freeze({
  [RESIDENTIAL_ACTION.SAME_DAY_UNAVAILABLE]: SAME_DAY_TEXT.bookingUnavailable,
  [RESIDENTIAL_ACTION.SAME_DAY_UNCONFIRMED]: SAME_DAY_TEXT.bookingUnconfirmed,
  [RESIDENTIAL_ACTION.SAME_DAY_UNVERIFIABLE]: SAME_DAY_TEXT.bookingUnverifiable,
});
const istSameDayAktion = (w) => typeof w === "string" && Object.prototype.hasOwnProperty.call(SAME_DAY_TEXT_JE_AKTION, w);

const RELOAD_CODES = Object.freeze(["PRICE_INPUT_OPTIONS_EXPIRED", "OFFER_PRICE_CONFLICT", "PRICE_CONFIRMATION_REQUIRED"]);
const RECALCULATE_CODES = Object.freeze([
  "OFFER_NOT_FOUND", "OFFER_MISMATCH", "OFFER_NOT_BOOKABLE", "SHIPMENT_DECLARATIONS_MISSING",
  "SHIPMENT_NOT_DRAFT", "PRICE_INPUTS_NOT_SUPPORTED",
]);

const TOTALS_FELDER = Object.freeze([
  "customerShippingNet", "shippingVat", "customerShippingGross",
  "insuranceGross", "customerTotalNet", "customerTotalGross",
]);

const istObjekt = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const betrag = (w) => (typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : null);
const revision = (w) => (Number.isSafeInteger(w) && w >= 0 ? w : null);
const kennung = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

/** Braucht DIESES Angebot die Angabe zur Lieferadresse? Die Liste kommt vom Server. */
export function offerRequiresResidentialChoice(tariff) {
  const t = istObjekt(tariff) ? tariff : {};
  return Array.isArray(t.requiredPriceInputs) && t.requiredPriceInputs.includes(PRICE_INPUT_DELIVERY_RESIDENTIAL);
}

/**
 * Trägt die Angabe zur Lieferadresse DIESES Angebots nach dem Vertrag keinen Zuschlag? Die Liste kommt vom
 * Server (`surchargeFreePriceInputs`); fehlt sie oder nennt sie die Angabe nicht, gilt der bisherige Vertrag.
 */
export function offerResidentialSurchargeFree(tariff) {
  const t = istObjekt(tariff) ? tariff : {};
  return offerRequiresResidentialChoice(t)
    && Array.isArray(t.surchargeFreePriceInputs) && t.surchargeFreePriceInputs.includes(PRICE_INPUT_DELIVERY_RESIDENTIAL);
}

/** Der Hinweis der Angebotskarte — nur, solange die Angabe noch aussteht; ohne Zuschlag ein neutraler Satz. */
export function offerSurchargeHint(tariff) {
  if (!offerAwaitsPriceInputs(tariff)) return null;
  return offerResidentialSurchargeFree(tariff) ? RESIDENTIAL_TEXT.addressTypeHint : RESIDENTIAL_TEXT.surchargeHint;
}

/** Der Preisstand des Angebots — 0, solange der Server keinen anderen genannt hat. */
export function offerRevisionOf(tariff) {
  const t = istObjekt(tariff) ? tariff : {};
  const r = revision(t.offerRevision);
  return r === null ? 0 : r;
}

/**
 * Die am Angebot gebundene Angabe — nur, wenn das Angebot die vollständige Bindung trägt
 * (buchbar, vollständig bepreist, gültige Serverbestandteile). Sonst `null`.
 */
export function residentialBoundValue(tariff) {
  const t = istObjekt(tariff) ? tariff : {};
  if (!offerRequiresResidentialChoice(t)) return null;
  const angaben = istObjekt(t.priceInputs) ? t.priceInputs : {};
  const wert = angaben[PRICE_INPUT_DELIVERY_RESIDENTIAL];
  if (wert !== true && wert !== false) return null;
  const komponenten = readPriceComponents(t.priceComponents);
  if (t.bookable !== true || t.priceCompleteness !== "complete" || komponenten === null) return null;
  // Ohne belegten Zuschlag trägt keine der beiden Adressarten eine Zuschlagszeile.
  const zuschlagErwartet = offerResidentialSurchargeFree(t) ? false : wert;
  return hasResidentialSurcharge(komponenten) === zuschlagErwartet ? wert : null;
}

/** Der Körper der Optionsanfrage — genau zwei Felder, kein Preis. */
export function optionsRequestBody(tariff, offerRevisionOverride) {
  const t = istObjekt(tariff) ? tariff : {};
  const offerId = kennung(t.offerId);
  if (!offerId) return null;
  const vorgabe = revision(offerRevisionOverride);
  return { offerId, offerRevision: vorgabe === null ? offerRevisionOf(t) : vorgabe };
}

function leseTotals(t) {
  if (!istObjekt(t)) return null;
  const aus = {};
  for (const feld of TOTALS_FELDER) {
    const b = betrag(t[feld]);
    if (b === null) return null;
    aus[feld] = b;
  }
  return Object.freeze(aus);
}

function leseZuschlag(s) {
  if (!istObjekt(s)) return null;
  const net = betrag(s.net);
  const vat = betrag(s.vat);
  const gross = betrag(s.gross);
  if (net === null || vat === null || gross === null) return null;
  return Object.freeze({ net, vat, gross });
}

/**
 * Liest die Optionsantwort. Fail closed: eine Antwort in anderer Form ergibt `null`, und die
 * Seite zeigt den Fehlerhinweis statt einer geratenen Option.
 *
 * @returns {{offerId, offerRevision, optionsId, expiresAt, boundValue, options}|null}
 */
export function readPriceInputOptions(body, tariff) {
  const d = istObjekt(body) ? body : null;
  if (!d) return null;
  const offerId = kennung(d.offerId);
  const optionsId = kennung(d.optionsId);
  const offerRevision = revision(d.offerRevision);
  if (!offerId || !optionsId || offerRevision === null) return null;
  if (tariff !== undefined && kennung(istObjekt(tariff) ? tariff.offerId : null) !== offerId) return null;
  if (d.priceInput !== PRICE_INPUT_DELIVERY_RESIDENTIAL) return null;
  if (!Array.isArray(d.options) || d.options.length !== 2) return null;
  const options = [];
  for (const [index, wert] of [[0, false], [1, true]]) {
    const o = d.options[index];
    if (!istObjekt(o) || o.value !== wert) return null;
    const surcharge = leseZuschlag(o.surcharge);
    const totals = leseTotals(o.totals);
    if (!surcharge || !totals) return null;
    options.push(Object.freeze({ value: wert, surcharge, totals }));
  }
  // Die Geschäftsadresse trägt keinen Zuschlag. Nennt die Antwort einen, beschreibt sie etwas
  // anderes als diesen Vertrag.
  const geschaeft = options[0].surcharge;
  if (geschaeft.net !== 0 || geschaeft.vat !== 0 || geschaeft.gross !== 0) return null;
  // Ohne belegten Zuschlag trägt auch die Privatadresse keinen, und beide Optionen tragen denselben Preis.
  if (tariff !== undefined && offerResidentialSurchargeFree(tariff)) {
    const privat = options[1];
    if (privat.surcharge.net !== 0 || privat.surcharge.vat !== 0 || privat.surcharge.gross !== 0) return null;
    if (TOTALS_FELDER.some((feld) => privat.totals[feld] !== options[0].totals[feld])) return null;
  }
  // TG22 Same-Day: eine Abholung am selben Tag nennt der Server als eigenen Block (Zuschlag, bis wann heute,
  // „bereit ab"). Ein Block in anderer Form beschreibt etwas anderes als diesen Vertrag — fail closed.
  const selberTag = readSameDayCollectionBlock(d.sameDayCollection);
  if (!selberTag.ok) return null;
  return Object.freeze({
    offerId,
    offerRevision,
    optionsId,
    expiresAt: typeof d.expiresAt === "string" ? d.expiresAt : null,
    boundValue: d.boundValue === true ? true : (d.boundValue === false ? false : null),
    options: Object.freeze(options),
    ...(selberTag.value ? { sameDayCollection: selberTag.value } : {}),
  });
}

/** Die Option zu einem Wert — oder `null`. */
export function optionFor(options, value) {
  if (!options || !Array.isArray(options.options)) return null;
  return options.options.find((o) => o.value === value) || null;
}

/**
 * Der Körper der Bindung: die Auswahl des Kunden plus der Versandbetrag, den er gesehen hat.
 * `expectedShippingGross` ist ein Konsistenzwächter, keine Preisangabe.
 */
export function bindRequestBody({ tariff, options, value } = {}) {
  if (value !== true && value !== false) return null;
  const t = istObjekt(tariff) ? tariff : {};
  const offerId = kennung(t.offerId);
  if (!offerId || !options || options.offerId !== offerId) return null;
  const option = optionFor(options, value);
  if (!option) return null;
  return {
    offerId,
    offerRevision: options.offerRevision,
    optionsId: options.optionsId,
    deliveryIsResidential: value,
    expectedShippingGross: option.totals.customerShippingGross,
  };
}

/**
 * Liest die Bindungsantwort. Fail closed in jeder Richtung: fehlende Bestandteile, ein
 * Zuschlag bei der Geschäftsadresse (oder keiner bei der Privatadresse), ein nicht
 * vollständiger Preisstand oder ein Angebotsausschnitt ohne Beträge ergeben `null`.
 */
export function readPriceInputBinding(body, { tariff, value } = {}) {
  const d = istObjekt(body) ? body : null;
  if (!d) return null;
  const offerId = kennung(d.offerId);
  const offerRevision = revision(d.offerRevision);
  if (!offerId || offerRevision === null) return null;
  if (tariff !== undefined && kennung(istObjekt(tariff) ? tariff.offerId : null) !== offerId) return null;
  const angaben = istObjekt(d.priceInputs) ? d.priceInputs : {};
  const wert = angaben[PRICE_INPUT_DELIVERY_RESIDENTIAL];
  if (wert !== true && wert !== false) return null;
  if (value !== undefined && value !== wert) return null;
  if (d.priceCompleteness !== "complete") return null;
  const components = readPriceComponents(d.components);
  // Ohne belegten Zuschlag trägt auch die gebundene Privatadresse keine Zuschlagszeile.
  const zuschlagErwartet = tariff !== undefined && offerResidentialSurchargeFree(tariff) ? false : wert;
  if (!components || hasResidentialSurcharge(components) !== zuschlagErwartet) return null;
  // TG22 Same-Day: nennt die Bindung eine Abholung am selben Tag, muss der gebundene Preis ihren Zuschlag
  // tragen. Umgekehrt genügt der Bestandteil: der Block trägt die Abholzeit, nicht den Preis.
  const selberTag = readSameDayCollectionBlock(d.sameDayCollection);
  if (!selberTag.ok || (selberTag.value && !hasSameDayCollectionSurcharge(components))) return null;
  // Eine Bindung beschreibt den Versand — eine Absicherung gehört nicht dazu.
  if (components.some((k) => k.taxable !== true)) return null;
  const totals = leseTotals(d.totals);
  if (!totals) return null;
  const o = istObjekt(d.offer) ? d.offer : null;
  if (!o) return null;
  const overlay = {};
  for (const feld of ["netPrice", "vatAmount", "finalPrice"]) {
    const b = betrag(o[feld]);
    if (b === null) return null;
    overlay[feld] = b;
  }
  if (o.bookable !== true && o.bookable !== false) return null;
  if (o.priceCompleteness !== "complete") return null;
  // Ausschnitt und Totals beschreiben denselben Versandpreis — sonst stünden zwei Wahrheiten da.
  if (overlay.finalPrice !== totals.customerShippingGross || overlay.netPrice !== totals.customerShippingNet
      || overlay.vatAmount !== totals.shippingVat) return null;
  overlay.bookable = o.bookable;
  overlay.unavailableReason = kennung(o.unavailableReason);
  overlay.priceCompleteness = "complete";
  // `requiredPriceInputs` gehört NICHT zum Ausschnitt: die Liste ist eine feste Eigenschaft des
  // Angebots aus dem Preisvergleich und bleibt beim Zusammenführen unverändert erhalten.
  overlay.insuranceAvailable = o.insuranceAvailable === true;
  overlay.insuranceDetails = istObjekt(o.insuranceDetails) ? o.insuranceDetails : null;
  return Object.freeze({
    offerId, offerRevision, value: wert, components, totals,
    overlay: Object.freeze(overlay),
    insuranceReset: d.insuranceReset === true,
    idempotent: d.idempotent === true,
    ...(selberTag.value ? { sameDayCollection: selberTag.value } : {}),
  });
}

/**
 * Das Angebot nach einer Bindung: die Serverwerte des Angebotsausschnitts, der neue Preisstand,
 * die gebundene Angabe und die Serverbestandteile. Es wird nichts gerechnet.
 *
 * `requiredPriceInputs` bleibt die Liste des Preisvergleichs — der Ausschnitt trägt sie nicht,
 * und nur mit ihr bleibt die Auswahl nach der Bindung sichtbar und änderbar.
 */
export function tariffWithPriceInputBinding(tariff, binding) {
  const t = istObjekt(tariff) ? tariff : null;
  if (!t || !binding || kennung(t.offerId) !== binding.offerId) return null;
  // TG22 Same-Day: die Bindung nennt die „bereit ab"-Zeit, die JETZT gälte — sie ersetzt die des
  // Angebotsvergleichs. Für einen anderen Abholtag als den des Angebots gilt sie nicht: fail closed.
  const selberTag = binding.sameDayCollection || null;
  if (selberTag && kennung(t.collectionDate) !== null && kennung(t.collectionDate) !== selberTag.collectionDate) {
    return null;
  }
  return {
    ...t,
    ...binding.overlay,
    requiredPriceInputs: t.requiredPriceInputs,
    offerRevision: binding.offerRevision,
    priceInputs: { [PRICE_INPUT_DELIVERY_RESIDENTIAL]: binding.value },
    priceComponents: binding.components,
    ...(selberTag ? { collectionReadyFrom: selberTag.collectionReadyFrom } : {}),
  };
}

/**
 * Der Optionsstand nach einer gelungenen Bindung: dieselben Optionen (derselbe Serverstand), aber
 * der neue Preisstand und die gebundene Wahl. Ohne diesen Schritt trüge ein Wechsel danach den
 * alten Preisstand und liefe in einen Konflikt.
 */
export function optionsAfterBinding(options, binding) {
  if (!options || !binding || options.offerId !== binding.offerId) return null;
  return Object.freeze({ ...options, offerRevision: binding.offerRevision, boundValue: binding.value });
}

/** Stimmt die Bindung am Angebot mit der Serveraussage der Optionsantwort überein? */
export function tariffMatchesOptionsBinding(tariff, options) {
  if (!options || options.boundValue === null) return false;
  return residentialBoundValue(tariff) === options.boundValue && offerRevisionOf(tariff) === options.offerRevision;
}

/**
 * Der Teil des /book-Körpers für ein solches Angebot: der Preisstand (Pflicht) und — nur als
 * Konsistenzwächter — die gebundene Angabe. Für jedes andere Angebot entsteht nichts.
 */
export function residentialBookPayload(tariff) {
  if (!offerRequiresResidentialChoice(tariff)) return {};
  const wert = residentialBoundValue(tariff);
  return wert === null
    ? { offerRevision: offerRevisionOf(tariff) }
    : { offerRevision: offerRevisionOf(tariff), priceInputs: { [PRICE_INPUT_DELIVERY_RESIDENTIAL]: wert } };
}

/** Was nach einer abgelehnten Anfrage zu tun ist — über den CODE entschieden, nie über den Text. */
export function residentialErrorAction(status, body) {
  const code = istObjekt(body) && typeof body.code === "string" ? body.code : null;
  if (code === "OFFER_ALREADY_USED") return RESIDENTIAL_ACTION.USED;
  if (code === SAME_DAY_COLLECTION_UNAVAILABLE_CODE) return SAME_DAY_AKTION_JE_ART[sameDayUnavailableKindOf(body)];
  if (code && RELOAD_CODES.includes(code)) return RESIDENTIAL_ACTION.RELOAD;
  if ((code && RECALCULATE_CODES.includes(code)) || status === 404) return RESIDENTIAL_ACTION.RECALCULATE;
  return RESIDENTIAL_ACTION.RETRY;
}

/** Der aktuelle Preisstand aus einer Konfliktantwort — oder `null`. */
export function conflictRevisionOf(body) {
  return istObjekt(body) ? revision(body.offerRevision) : null;
}

/** Verlangt die Antwort eine neue Bestätigung der Lieferadresse? */
export const isRebindRequired = (body) => istObjekt(body) && body.priceInputsRebindRequired === true;

/** Fehlt die Bindung der Lieferadresse (Absicherung oder Buchung ohne Auswahl)? */
export const isPriceInputsRequired = (body) => istObjekt(body) && body.code === "PRICE_INPUTS_REQUIRED";

/**
 * Das Anzeigemodell des Abschnitts „Art der Lieferadresse".
 *
 * Während geladen wird, gibt es keine Karten — eine veraltete Option darf nicht gebunden
 * werden. Während gebunden wird, sind beide Karten gesperrt; die angeklickte ist markiert.
 *
 * `errorKind` ist eine RESIDENTIAL_ACTION: „erneut versuchen" (vorübergehend), „neu berechnen"
 * (das Angebot trägt nicht mehr) oder „verwendet" (in die Sendungen). Es gibt keinen lokalen
 * Ersatzpreis und keine Karte neben einem Fehler.
 *
 * `surchargeFree` (aus `offerResidentialSurchargeFree`): dieselbe Auswahl ohne belegten Zuschlag —
 * Lade- und Fehlertext sprechen dann vom Preis, nicht von einem Zuschlag.
 */
export function residentialModuleView({ status, options, boundValue, pendingValue, errorKind, notice, surchargeFree } = {}) {
  const laedt = status === RESIDENTIAL_STATUS.LOADING || status === RESIDENTIAL_STATUS.IDLE;
  const bindet = status === RESIDENTIAL_STATUS.BINDING;
  const fehler = status === RESIDENTIAL_STATUS.ERROR;
  const ohneZuschlag = surchargeFree === true;
  const art = !fehler ? null
    : (errorKind === RESIDENTIAL_ACTION.USED || errorKind === RESIDENTIAL_ACTION.RECALCULATE
       || istSameDayAktion(errorKind)
      ? errorKind : RESIDENTIAL_ACTION.RETRY);
  const zeigtKarten = !!options && (status === RESIDENTIAL_STATUS.READY || bindet);
  const cards = zeigtKarten ? options.options.map((o) => Object.freeze({
    value: o.value,
    id: o.value ? "residential-delivery-private" : "residential-delivery-business",
    label: o.value ? RESIDENTIAL_TEXT.private : RESIDENTIAL_TEXT.business,
    grossText: `+ ${money(o.surcharge.gross)} ${RESIDENTIAL_TEXT.gross}`,
    netText: `${money(o.surcharge.net)} ${RESIDENTIAL_TEXT.net}`,
    checked: bindet ? pendingValue === o.value : boundValue === o.value,
    disabled: bindet,
  })) : [];
  return Object.freeze({
    showLoading: laedt,
    loadingText: ohneZuschlag ? RESIDENTIAL_TEXT.loadingNoSurcharge : RESIDENTIAL_TEXT.loading,
    showError: fehler,
    errorText: art === null ? null
      : art === RESIDENTIAL_ACTION.USED ? RESIDENTIAL_TEXT.used
      : art === RESIDENTIAL_ACTION.RECALCULATE ? RESIDENTIAL_TEXT.recalculate
      : istSameDayAktion(art) ? SAME_DAY_TEXT_JE_AKTION[art]
      : ohneZuschlag ? RESIDENTIAL_TEXT.errorNoSurcharge
      : RESIDENTIAL_TEXT.error,
    // TG22 Same-Day: dieselbe Handlung wie „neu berechnen" — ein späterer Abholtag entsteht nur so.
    errorAction: istSameDayAktion(art) ? RESIDENTIAL_ACTION.RECALCULATE : art,
    cards: Object.freeze(cards),
    locked: bindet,
    bindingText: bindet ? RESIDENTIAL_TEXT.binding : null,
    notice: typeof notice === "string" && notice ? notice : null,
  });
}

/**
 * Sperrt die fehlende oder unbestätigte Angabe die Buchung?
 *
 * Gebucht werden darf nur, wenn der Abschnitt bereit ist, eine Auswahl gilt UND das Angebot
 * genau diese Bindung trägt — zum selben Preisstand wie der zuletzt bestätigte Optionsstand.
 * Ohne den Preisstand stünde nach einer Neubestätigung derselben Wahl für einen Moment die ältere
 * Bindung als gültig da (das gebundene Angebot erreicht die Seite einen Render später).
 */
export function residentialBlocksBooking({ required, status, boundValue, tariff, options } = {}) {
  if (required !== true) return false;
  if (status !== RESIDENTIAL_STATUS.READY) return true;
  if (boundValue !== true && boundValue !== false) return true;
  if (residentialBoundValue(tariff) !== boundValue) return true;
  return !!options && offerRevisionOf(tariff) !== options.offerRevision;
}
