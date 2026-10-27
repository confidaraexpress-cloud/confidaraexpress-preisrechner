import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
// `normalizeCountryCode` wird hier nicht gebraucht: das Profil ist seit Paket G
// (2026-10-23) keine Absenderquelle mehr — der Absender kommt aus dem Adressbuch
// (Standard-Absender oder „Adresse suchen"), dessen Länder der Server prüft.
import { useLaunchScope } from "../hooks/useLaunchScope";
import { money, fmtDelivery } from "../utils/formatters";
import { publicCarrierChipLabel } from "../utils/carrierMap";
import { applyResultFilters, lateResultOffers, deliveryDeadlineAssessment, DELIVERY_DEADLINE }
  from "../utils/offersFilterView.mjs";
import { deliveryDeadlineOptions } from "../utils/deliveryTimeView.mjs";
import { revealOffers } from "../utils/revealOffers.mjs";
import { resumeInitialState, missingFieldsHint } from "../utils/newShipmentResume.mjs";
import { validatePostalCode, postalCodeExample, postalCodeHint, postalCodeInputMode, postalCodeMaxLength, isPostalCodeRequired } from "../utils/postalCode";
import { OffersList } from "../components/offers/OffersList";
import { ShipmentFilterBar } from "../components/offers/ShipmentFilterBar";
import { OfferComparisonLoadingOverlay } from "../components/offers/OfferComparisonLoadingOverlay";
import { useComparisonLoadingFocus } from "../hooks/useComparisonLoadingFocus";
import { useShippingWarmup } from "../hooks/useShippingWarmup";
import { useAuth } from "../context/AuthContext";
import { todayISO } from "../utils/date";
import { businessTodayISO } from "../utils/businessDate.mjs";
import { getFormDraft, createFormDraft, updateFormDraft } from "../api/formDraftsApi";
import { normalizeApiError, normalizeThrownError, summaryMessage } from "../utils/apiError.mjs";
import { sourceCoverageNotice } from "../utils/sourceCoverageView.mjs";
import { focusFirstError } from "../utils/focusField";
// Gesamtauftrag B: Firmenpflicht — eine Regelquelle für Karte und Seite.
import {
  offerKey, offerSelectable, offerBusinessRequirement, offerAwaitsBusinessDetails, offerBusinessConfirmId,
  offerAwaitsCustomerCorrection, offerCustomerCorrection,
  OFFER_BUSINESS_COMPANY_FIELD_MESSAGE, OFFER_BUSINESS_NOT_FOUND_NOTICE,
} from "../utils/offerIdentity.mjs";
import { visibleFieldErrors, markFieldTouched, withoutFieldError, keepFocusOnMouseDown } from "../utils/fieldTouchState.mjs";
import { Field } from "../components/ui/Field";
import { useShippingFlow } from "../context/ShippingFlowContext";
import { formHasInput, pickRestoreSource, droppedNotice } from "../utils/shippingFlowState.mjs";
import {
  resolveCalculatorIntent, calculatorIntentNotice, publicPriceComparison, PUBLIC_PRICE_COMPARISON_TEXT,
} from "../utils/calculatorShipmentHandoff.mjs";
import {
  createEmptyShipmentForm, partyHasInput,
  shipmentPackageErrors, shipmentPackagePayload,
  buildPartyPayload, shippingContactErrors,
} from "../utils/newShipmentForm.mjs";
import {
  dezimal, formPackageLines, formPatchFromPackageLines, hasExtraPackageLines, hasMixedPackageLines, packageLinesKey, PACKAGE_LINE_ERROR_ORDER,
} from "../utils/packageLines.mjs";
import { PackageLinesEditor } from "../components/shipping/PackageLinesEditor";
// Premium-Redesign (Konzept B, Betreiberentscheidung 2026-10-27): das Paket nimmt die eingegebenen Maße an.
import { Paketbuehne } from "../components/shipping/Paketbuehne";

// Backend-Feldpfad → Formularschlüssel dieser Seite. Damit landet ein
// serverseitiger Feldfehler am richtigen Eingabefeld, statt nur im Banner.
// Vollständig für BEIDE Absender: /calculate-price und die Entwurfsroute
// benennen ihre Felder identisch (sender.*/recipient.*/packages.*). Die Karte
// war bisher auf die vier Route-Felder beschränkt — jeder andere abgelehnte
// Feldpfad landete deshalb ohne Markierung im Sammeltext. Additiv ergänzt, kein
// Eintrag geändert.
const SHIPMENT_FIELD_MAP = {
  "sender.company": "s_company",
  "sender.firstName": "s_firstName",
  "sender.lastName": "s_lastName",
  "sender.fullName": "s_fullName",
  "sender.streetAndNumber": "s_street",
  "sender.addressAddition": "s_addition",
  "sender.postalCode": "s_zip",
  "sender.city": "s_city",
  "sender.country": "s_country",
  "sender.phone": "s_phone",
  "sender.email": "s_email",
  "recipient.company": "r_company",
  "recipient.firstName": "r_firstName",
  "recipient.lastName": "r_lastName",
  "recipient.fullName": "r_fullName",
  "recipient.streetAndNumber": "r_street",
  "recipient.addressAddition": "r_addition",
  "recipient.postalCode": "r_zip",
  "recipient.city": "r_city",
  "recipient.country": "r_country",
  "recipient.phone": "r_phone",
  "recipient.email": "r_email",
  "packages.packageCount": "packageCount",
  "packages.weight": "weight", "packages.length": "length",
  "packages.width": "width", "packages.height": "height",
  "shippingOptions.shippingDate": "shippingDate",
  from_zip: "s_zip", to_zip: "r_zip",
  from_country: "s_country", to_country: "r_country",
  weight: "weight", length: "length", width: "width", height: "height",
  packageCount: "packageCount", shippingDate: "shippingDate",
};

// Reihenfolge im Formular — bestimmt, welches Feld bei mehreren Fehlern
// angesprungen wird (immer das oberste).
// Genau die Reihenfolge der Darstellung (Auftrag 1, P11): das Versanddatum steht in der
// Filterleiste ÜBER den Adressen; je Seite Unternehmen, Vor-/Nachname, Land, Bundesstaat,
// Straße, Zusatz, PLZ, Stadt, Telefon, E-Mail. Bis 2026-10 standen Unternehmen und Name sowie
// E-Mail und Telefon vertauscht, der Bundesstaat fehlte, und das Datum stand am Ende.
const SHIPMENT_FIELD_ORDER = [
  "shippingDate",
  "s_company", "s_firstName", "s_lastName", "s_fullName", "s_country", "s_state", "s_street", "s_addition",
  "s_zip", "s_city", "s_phone", "s_email",
  "r_company", "r_firstName", "r_lastName", "r_fullName", "r_country", "r_state", "r_street", "r_addition",
  "r_zip", "r_city", "r_phone", "r_email",
  // Paketdaten: Zeile 1 mit den flachen Schlüsseln, danach jede weitere Paketzeile und zuletzt die
  // Summe (Canonical v2.79) — wieder genau die Reihenfolge der Darstellung.
  ...PACKAGE_LINE_ERROR_ORDER,
  // Die Sendungsangaben stehen ANS ENDE: sie sind im Formular unterhalb der Paketdaten,
  // und der Sprung zum ersten Fehler soll der Leserichtung folgen.
  "declaredContent", "declaredGoodsValue",
];
const firstShipmentErrorField = (errs) =>
  SHIPMENT_FIELD_ORDER.find((k) => errs[k]) || Object.keys(errs)[0] || null;
import { hasSavableShipmentId } from "../utils/draftsView.mjs";
import { inventoryOriginNotice } from "../utils/inventoryView.mjs";
import { requiresState, statesForCountry, stateFieldError } from "../utils/stateCodes.mjs";
import {
  buildResumeInitialState, resumeSourceFromDraft, isValidResumeDraft, buildResumePayload,
  isValidShipmentResumeDraft,
  classifyFormDraftTransition, mapFormDraftStartError, SHIPMENT_PERSISTENCE_FAILED_MESSAGE,
  RESUME_PAST_DATE_NOTICE, RESUME_ECONOMY_FILTER_NOTICE,
} from "../utils/formDraftsView.mjs";
import { PROFILE_DASHBOARD_TARGET } from "../utils/bookingSuccessView.mjs";
import { bookingProfileNotice } from "../utils/bookingProfileView.mjs";
import { draftBookingOptionsToFlow, hasAnyDraftBookingOption } from "../utils/draftBookingOptions.mjs";
import { declarationErrors, declarationsPayload, DECLARED_CONTENT_MAX } from "../utils/shipmentDeclarations.mjs";
import { getShipmentFormSnapshot, isShipmentFormDirty, hasMeaningfulShipmentInput, formDraftSchemaVersion } from "../utils/shipmentFormSnapshot.mjs";
import { AddressPickerButton } from "../components/addressbook/AddressPickerButton";
import { AddressSuggestInput } from "../components/address/AddressSuggestInput";
import { AddressStatusLine } from "../components/address/AddressStatusLine";
import { useAddressValidation } from "../hooks/useAddressValidation";
import { applyAddressSuggestion, cityFromSuggestion, shippingLengthHint, streetFieldHint } from "../utils/addressValidationView.mjs";
// Paket A (2026-10-23): der Hinweis unter dem Telefonfeld — was an die Anbieter geht, sobald es abweicht.
import { phoneTransmissionHint } from "../utils/phoneNumber.mjs";
import { mapAddressToShipmentFormPatch, defaultAddressForTab, TAB_SENDER, TAB_RECIPIENT } from "../utils/addressBookView.mjs";
import { getAddresses } from "../api/addressBookApi";
import { ShipmentDraftLeaveDialog } from "../components/drafts/ShipmentDraftLeaveDialog";
import { ShipmentResetConfirmDialog } from "../components/drafts/ShipmentResetConfirmDialog";

// Quittung nach einer Adressbuchübernahme. Sie sagt beides in einem Satz: die
// Werte sind da, UND sie gehören jetzt diesem Formular — eine spätere Korrektur
// hier ändert den Adressbucheintrag nicht.
const ADDRESS_TAKEN_NOTE = "Adresse aus dem Adressbuch übernommen. Sie können sie hier frei anpassen.";
// Paket G: steht der Standard-Absender unverändert im Formular, trägt der Titel „Absender" die Marke
// „Standard" — kompakt in der Kopfzeile, damit die beiden Adressspalten auf einer Höhe beginnen (am Titel
// „Absender" genügt das Wort; die Auswahl sagt „Standard-Absender", weil dort der Titel fehlt). Mobil passt
// so die Kopfzeile ab 360 px weiter in eine Zeile. Ändert der Kunde ein Feld, ist es nicht mehr der
// Standard, und die Marke verschwindet. Ohne Standard-Absender erklärt der Tipp am Ende der Spalte, wie der
// Absender künftig von selbst dasteht (nur solange der Absender leer ist).
const DEFAULT_SENDER_BADGE = "Standard";
const DEFAULT_SENDER_TIP = "Tipp: Legen Sie im Adressbuch eine Adresse als Standard-Absender fest – dann ist der Absender bei jeder neuen Sendung bereits eingetragen.";
// Der Absender eines leeren Formulars als Snapshot — Vergleichswert für „nur der Standard-Absender steht da".
const LEERER_ABSENDER = getShipmentFormSnapshot({ form: createEmptyShipmentForm() }).sender;

// ─── Validation ───────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Paket 1: länderspezifische PLZ-Fehlermeldung über den zentralen Helfer
// (src/utils/postalCode.mjs → generierte Regeln). Kein eigenes Regex hier.
function postalErr(country, value) {
  const pc = validatePostalCode(country, value);
  if (pc.valid) return null;
  if (pc.code === "POSTAL_CODE_REQUIRED") return "PLZ ist ein Pflichtfeld.";
  const ex = postalCodeExample(country);
  return ex ? `PLZ passt nicht zum Landesformat (Beispiel: ${ex}).` : "PLZ ist ungültig.";
}

// Buchungsrelevante Felder lösen bei Änderung ein Verwerfen alter Ergebnisse
// aus. Nur die rein clientseitigen Anzeige-Filter (max_price, latestDeliveryDate)
// lassen Tarife + Sendungskennung unangetastet — sie filtern lediglich die bereits
// berechnete Liste, ohne die Buchungsgrundlage zu ändern.
// `latestDeliveryTime` gehört zwingend hierher: eine Uhrzeitauswahl arbeitet
// ausschließlich auf den BEREITS geladenen Tarifen und darf niemals einen neuen
// /calculate-price-Request auslösen. Sie steht aus demselben Grund NICHT im
// calcKey — der Schlüssel beschreibt die Payload, nicht die Anzeige.
const FILTER_ONLY_FIELDS = new Set(["max_price", "latestDeliveryDate", "latestDeliveryTime"]);

// Die Sortierung der Angebotsliste — für die sichtbare Liste UND die eingeklappte Gruppe „Zu spät" (TG-L2).
// Reine Funktion; die Eingabe bleibt unverändert („recommended" gibt sie unverändert zurück).
function sortiereAngebote(liste, sortMode) {
  if (sortMode === "recommended") return liste;
  const copy = [...liste];
  if (sortMode === "cheapest") return copy.sort((a, b) => (a.netPrice ?? Infinity) - (b.netPrice ?? Infinity));
  if (sortMode === "priciest") return copy.sort((a, b) => (b.netPrice ?? -1) - (a.netPrice ?? -1));
  if (sortMode === "fastest")  return copy.sort((a, b) => {
    const aMax = a.transitDaysMax ?? 999, bMax = b.transitDaysMax ?? 999;
    if (aMax !== bMax) return aMax - bMax;
    return (a.transitDaysMin ?? 999) - (b.transitDaysMin ?? 999);
  });
  return copy;
}

function getErrors(form) {
  const e = {};

  // Vorname, Nachname, E-Mail und Telefon kommen aus dem gemeinsamen Versandkontakt-
  // vertrag (newShipmentForm.mjs), der `lib/shippingContact.js` des Backends spiegelt.
  // Sie werden hier NICHT ein zweites Mal formuliert — zwei Fassungen derselben Regel
  // liefen unweigerlich auseinander.
  Object.assign(e, shippingContactErrors(form, "s"));
  if (form.s_company?.length > 200)         e.s_company  = "Unternehmen darf maximal 200 Zeichen enthalten.";
  if (!form.s_street?.trim())               e.s_street   = "Straße ist ein Pflichtfeld.";
  else if (form.s_street.length > 200)      e.s_street   = "Straße darf maximal 200 Zeichen enthalten.";
  if (form.s_addition?.length > 100)        e.s_addition = "Adresszusatz darf maximal 100 Zeichen enthalten.";
  // Das Land startet leer („Land auswählen") statt mit einem vorausgewählten
  // „DE". Es muss deshalb ausdrücklich gewählt werden: ohne Land ist die
  // PLZ-Formatprüfung regellos (jedes Format gilt), und die Route stünde nicht
  // fest. Die Prüfung steht VOR der PLZ, damit ein fehlendes Land nicht als
  // PLZ-Fehler erscheint.
  if (!form.s_country?.trim())              e.s_country  = "Bitte wählen Sie ein Land.";
  { const m = postalErr(form.s_country, form.s_zip); if (m) e.s_zip = m; }
  // Bundesstaat: dieselbe Landesregel wie serverseitig (nur US/CA). Die Prüfung steht hier,
  // damit ein fehlender Bundesstaat schon im Formular sichtbar wird statt erst als
  // Feldfehler der Buchung — für alle übrigen Länder liefert stateFieldError "" und es
  // ändert sich nichts.
  { const m = stateFieldError(form.s_country, form.s_state); if (m) e.s_state = m; }
  if (!form.s_city?.trim())                 e.s_city     = "Stadt ist ein Pflichtfeld.";
  else if (form.s_city.length > 100)        e.s_city     = "Stadt darf maximal 100 Zeichen enthalten.";
  // (E-Mail: siehe shippingContactErrors — sie ist seit dem Versandkontaktvertrag
  //  Pflicht und wird dort geprüft, mit demselben Muster wie bisher.)

  Object.assign(e, shippingContactErrors(form, "r"));
  if (form.r_company?.length > 200)         e.r_company  = "Unternehmen darf maximal 200 Zeichen enthalten.";
  if (!form.r_street?.trim())               e.r_street   = "Straße ist ein Pflichtfeld.";
  else if (form.r_street.length > 200)      e.r_street   = "Straße darf maximal 200 Zeichen enthalten.";
  if (form.r_addition?.length > 100)        e.r_addition = "Adresszusatz darf maximal 100 Zeichen enthalten.";
  if (!form.r_country?.trim())              e.r_country  = "Bitte wählen Sie ein Land.";
  { const m = postalErr(form.r_country, form.r_zip); if (m) e.r_zip = m; }
  // Bundesstaat: dieselbe Landesregel wie serverseitig (nur US/CA). Die Prüfung steht hier,
  // damit ein fehlender Bundesstaat schon im Formular sichtbar wird statt erst als
  // Feldfehler der Buchung — für alle übrigen Länder liefert stateFieldError "" und es
  // ändert sich nichts.
  { const m = stateFieldError(form.r_country, form.r_state); if (m) e.r_state = m; }
  if (!form.r_city?.trim())                 e.r_city     = "Stadt ist ein Pflichtfeld.";
  else if (form.r_city.length > 100)        e.r_city     = "Stadt darf maximal 100 Zeichen enthalten.";
  // (E-Mail: siehe shippingContactErrors — sie ist seit dem Versandkontaktvertrag
  //  Pflicht und wird dort geprüft, mit demselben Muster wie bisher.)

  // Anzahl, Gewicht UND alle drei Maße sind Pflicht — eine Quelle für alle
  // fünf (newShipmentForm.mjs), dieselben Grenzen wie serverseitig.
  //
  // Bis hierher galten Länge, Breite und Höhe als optional: geprüft wurde nur,
  // WENN bereits etwas eingetragen war (`if (form.length) { … }`). Ein leeres
  // Feld kam damit ohne Beanstandung durch den Knopf „Angebote vergleichen",
  // und das Backend ersetzte es still durch 30/20/15 cm. Der Kunde bekam einen
  // Preis für Maße, die er nie eingegeben hat.
  //
  // Individuelle Mehrpaketsendungen (Canonical v2.79): jede Paketzeile mit denselben Regeln, ab zwei
  // Zeilen mit „Paket k: “ und der Summengrenze. Eine Zeile: exakt die bisherigen Fehler.
  Object.assign(e, shipmentPackageErrors(form));

  // Die beiden Sendungsangaben (Inhalt, Warenwert). Sie sind Pflicht,
  // weil aus ihnen ein abschliessend bepreisbarer Sendungskontext entsteht: ohne sie
  // wird vor dem Vergleich etwas anderes gefragt als vor der Buchung, und die Differenz
  // laesst sich danach nicht mehr von einer echten Preisaenderung unterscheiden.
  // Die Regeln stehen EINMAL (utils/shipmentDeclarations.mjs) und spiegeln den Server.
  Object.assign(e, declarationErrors(form));

  return e;
}

// ─── Filter / Sort options ─────────────────────────────────────────────────────
const SERVICE_OPTIONS = [
  { id: "all",          icon: "dashboard", label: "Alle Dienstleistungen", desc: "Tarife für die Abholung Zuhause / im Büro und für die Shopabgabe anzeigen" },
  { id: "pickup",       icon: "truck",     label: "Nur Abholung",          desc: "Tarife für die Abholung Zuhause / im Büro anzeigen"  },
  { id: "dropoff",      icon: "map",       label: "Nur Abgabe",            desc: "Tarife für die Abgabe in einem Paketshop anzeigen"      },
  { id: "pickup_today", icon: "zap",       label: "Abholung heute",        desc: "Tarife mit Abholung noch heute anzeigen" },
];

// Gesamtauftrag F (2026-10-24): drei Optionen. „Economy" ist keine Filteroption mehr — Economy-Produkte (etwa
// TNT Economy Express, DHL Economy Select) bleiben angeboten und erscheinen unter „Alle Versandarten". Ein
// gespeichertes „economy" fällt zentral auf „all" (utils/formDraftsView.mjs: FORM_SHIPPING_MODES).
const SHIPPING_MODE_OPTIONS = [
  { id: "all",      icon: "package", label: "Alle Versandarten", desc: "Alle Tarife anzeigen, auch Economy-Produkte" },
  { id: "standard", icon: "truck",   label: "Standard",          desc: "Regulärer Versand ohne Aufpreis"        },
  { id: "express",  icon: "zap",     label: "Express",           desc: "Schnellste verfügbare Zustellung"       },
];

export default function NewShipmentPage({ prefillAddress, onPrefillApplied, prefillInventory, onInventoryPrefillApplied, resumeDraft, onResumeApplied, registerLeaveGuard, commitLeave } = {}) {
  // Nur die Länder, die ConfidaraExpress heute anbietet — die Liste kommt vom Server
  // (GET /api/shipping/launch-scope), nicht aus einer zweiten Aufzählung im Client.
  // Zwei Listen: der ABSENDER ist auf die Versandursprünge beschränkt, der Empfänger nicht.
  const { countries: launchCountries, originCountries: launchOriginCountries } = useLaunchScope();
  const { authed, user } = useAuth();
  const navigate = useNavigate();
  // F1: fehlen dem Konto Angaben für die Rechnung, sagt es die Seite VOR dem Vergleich — nicht
  // erst beim Buchen. Status vom Backend (/kundenbereich → bookingProfile); fehlt er, kein Hinweis.
  const bookingProfileHinweis = bookingProfileNotice(user?.bookingProfile);

  // ── Fortsetzen eines Formularentwurfs (mount-once) ───────────────────────────
  // Ein gültiger Resume-Payload rehydriert das Formular aus dem Snapshot und hat
  // Vorrang vor dem Standard-Absender (er wird dann NICHT eingetragen, Paket G).
  // Einmalig beim Mount berechnet — Prop-Änderungen (das Zurücksetzen
  // im Elternteil über onResumeApplied) lösen KEINE erneute Anwendung aus.
  // resumeInitialState übernimmt alle echten Sendungs-/Berechnungsdaten des
  // Snapshots unverändert und neutralisiert ausschließlich den ergebnis-
  // abhängigen Versanddienst-Filter (siehe newShipmentResume.mjs): dessen
  // Auswahlliste entsteht erst aus einer Preisberechnungsantwort, die nach dem
  // Fortsetzen nicht mehr existiert. Ungeprüft übernommen würde er die ERSTE
  // Berechnung einschränken und könnte fälschlich null Angebote liefern.
  //
  // Zwei Herkünfte, EIN Weg ins Formular: ein Formularentwurf (`form_drafts`) und ein
  // gespeicherter Sendungsentwurf (`shipments`, is_saved_draft=true) liefern beide
  // dasselbe `formData` und laufen deshalb durch dieselbe Rehydration. Unterschiedlich
  // ist nur, was SONST noch am Entwurf hängt: der Formularentwurf trägt Revision und
  // serverseitigen Verbrauch (resumeSource → calculate-price), der Sendungsentwurf den
  // Entwurfszustand der „Zusätzlichen Optionen" (Effekt weiter unten). Für das Formular
  // selbst sind beide identisch — deshalb hier eine Oder-Verknüpfung und kein zweiter
  // Initialisierer.
  const resumeInitRef = useRef(undefined);
  if (resumeInitRef.current === undefined) {
    resumeInitRef.current = (isValidResumeDraft(resumeDraft) || isValidShipmentResumeDraft(resumeDraft))
      ? resumeInitialState(buildResumeInitialState(resumeDraft.formData, { today: businessTodayISO() }))
      : null;
  }
  const resumeInit = resumeInitRef.current;

  // ── Laufender Versandvorgang (mount-once) ──────────────────────────────────
  // Der Kunde kommt von der Buchungsseite zurück, hat über die Sidebar
  // gewechselt oder versehentlich neu geladen. Der Vorgang liegt dann im
  // ShippingFlowProvider (App.jsx, außerhalb <Routes>) und ggf. gespiegelt im
  // sessionStorage.
  //
  // WICHTIG — die Wiederherstellung läuft ausschließlich über diesen
  // Mount-once-Initialisierer, NIE feldweise über upd(). upd() ruft für jedes
  // buchungsrelevante Feld invalidateResults() auf; ein feldweiser Restore
  // würde die soeben zurückgeholten Angebote im selben Atemzug wieder löschen.
  //
  // Vorrang (shippingFlowState.mjs, RESTORE_PRIORITY):
  //   Entwurf fortsetzen > Adressbuch-Prefill > Sitzungsvorgang > Standard-Absender (Paket G)
  // Ein bewusst geöffneter Entwurf überschreibt den Sitzungsvorgang VOLLSTÄNDIG
  // — es wird nichts gemischt.
  const { shipment: flowShipment, setScope: setFlowScope, clearScope: clearFlowScope,
          setBooking: setFlowBooking,
          setStep: setFlowStep, droppedReason, consumeDroppedReason } = useShippingFlow();
  const flowInitRef = useRef(undefined);
  if (flowInitRef.current === undefined) {
    const hatVorgang = !!flowShipment
      && (formHasInput(flowShipment.form, "shipment") || flowShipment.tariffs.length > 0);
    flowInitRef.current =
      pickRestoreSource({ hasDraft: !!resumeInit, hasPrefill: !!prefillAddress, hasFlow: hatVorgang }) === "flow"
        ? flowShipment
        : null;
  }
  const flowInit = flowInitRef.current;

  // Hinweis, falls beim Wiederherstellen Angebote verworfen wurden (Frist
  // überschritten oder Versanddatum inzwischen in der Vergangenheit). Einmalig
  // beim Mount abgeholt, danach im Provider gelöscht.
  const flowNoticeRef = useRef(undefined);
  if (flowNoticeRef.current === undefined) {
    flowNoticeRef.current = flowInit ? droppedNotice(droppedReason) : null;
  }
  const [flowNotice, setFlowNotice] = useState(flowNoticeRef.current);

  // ── Angebotsabsicht aus dem Preisrechner (utils/calculatorShipmentHandoff.mjs) ──
  // Kommt nur mit dem Sitzungsvorgang herein, also nie gegen einen Entwurf oder Adressbuch-
  // Prefill (RESTORE_PRIORITY bleibt unverändert). Sie ist eine ABSICHT, kein Angebot: ausgewählt
  // wird erst nach der nächsten echten Neuberechnung — und nur bei eindeutig derselben Identität.
  const [calculatorIntent, setCalculatorIntent] = useState(() => (flowInit && flowInit.calculatorIntent) || null);
  const [calculatorIntentResolution, setCalculatorIntentResolution] = useState(null);

  // ── Filters ──
  const [serviceFilter, setServiceFilter]         = useState(resumeInit ? resumeInit.serviceFilter : flowInit ? flowInit.serviceFilter : "all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
  const [shippingModeFilter, setShippingModeFilter] = useState(resumeInit ? resumeInit.shippingModeFilter : flowInit ? flowInit.shippingModeFilter : "all");
  const [shippingModeOpen, setShippingModeOpen]     = useState(false);
  // TG22 Paket B: ein fortgesetzter Entwurf bekommt KEIN Ersatzdatum. Lag sein Versanddatum in
  // der Vergangenheit, bleibt es leer (`null`) — die Berechnung ist dann gesperrt, bis der Kunde
  // bewusst ein Datum wählt. Ein stilles „heute" wäre eine andere Sendung als die gespeicherte.
  const [shippingDate, setShippingDate]             = useState(() =>
    resumeInit ? (resumeInit.shippingDate || null)
      : (flowInit && flowInit.shippingDate) ? flowInit.shippingDate
      : todayISO());
  const [datePickerOpen, setDatePickerOpen]         = useState(false);
  // Der Carrier-Filter wird beim Fortsetzen eines Entwurfs bewusst neutralisiert
  // (newShipmentResume.mjs). Beim Sitzungs-Restore gilt das NICHT: dort kommt die
  // Auswahlliste (publicCarriers) mit demselben Vorgang zurück, die IDs sind also
  // weiterhin überprüfbar.
  const [selectedPublicCarrierIds, setSelectedPublicCarrierIds] = useState(
    resumeInit ? resumeInit.selectedPublicCarrierIds : flowInit ? flowInit.selectedPublicCarrierIds : []);
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  // Die Auswahlliste stammt ausschließlich aus der publicCarriers-Antwort einer
  // Preisberechnung — vor der ersten Berechnung gibt es nichts auszuwählen. Das
  // gilt auch für einen fortgesetzten Entwurf: dessen gespeicherter Filter wird
  // in resumeInitialState neutralisiert, sodass Auswahlliste und aktive Auswahl
  // hier immer denselben (leeren) Ausgangszustand haben.
  // Sitzungs-Restore bringt die Auswahlliste mit zurück — sonst stünden die
  // wiederhergestellten Chips ohne ihre Beschriftung da.
  const [publicCarriers, setPublicCarriers]         = useState(flowInit ? flowInit.publicCarriers : []);
  const carrierRef = useRef(null);

  // ── Späteste Lieferzeit — Popover-Status (Wert latestDeliveryDate liegt im form) ──
  const [latestOpen, setLatestOpen] = useState(false);

  // ── Sort ──
  const [sortMode, setSortMode] = useState(flowInit ? flowInit.sortMode : "recommended");

  // ── VAT display mode ──
  const [vatMode, setVatMode] = useState(flowInit ? flowInit.vatMode : "net");

  // ── Form ──
  // „Neue Sendung" startet LEER. Der frühere `profilSeed()` schrieb Firma, Name,
  // Straße, PLZ, Ort, Land, Telefon und E-Mail des Kontos automatisch ins
  // Formular — der Kunde sah ausgefüllte Felder, ohne etwas eingegeben zu haben,
  // und konnte nicht unterscheiden, was er selbst geprüft hatte und was das
  // System angenommen hat. Das Profil ist seit Paket G keine Absenderquelle mehr
  // („Eigene Adresse" entfallen). Einzige Vorbelegung danach: der Standard-
  // Absender, den der Kunde im Adressbuch selbst festgelegt hat — sichtbar
  // gekennzeichnet (DEFAULT_SENDER_BADGE), siehe `belegeStandardAbsenderVor`.
  const leeresFormular = useCallback(() => createEmptyShipmentForm(), []);

  // Resume-Fall: Formular kommt vollständig aus dem Snapshot (resumeInit.form) —
  //   das ist der EINZIGE Weg, auf dem gespeicherte Angaben zurückkommen, und er
  //   verlangt, dass der Kunde einen Entwurf ausdrücklich öffnet.
  // Sitzungs-Restore: aus dem laufenden Vorgang im Arbeitsspeicher (Wechsel
  //   innerhalb derselben SPA-Sitzung; ein Reload hat keinen Vorgang mehr).
  // Normalfall: leer.
  const [form, setForm] = useState(() =>
    resumeInit ? resumeInit.form : flowInit ? flowInit.form : leeresFormular());

  // ── Dirty-State / interner Verlassen-Guard ─────────────────────────────────
  // Baseline = fachlicher Snapshot NACH allen automatischen Startwerten
  // (Resume synchron beim Mount; Adressbuch-Prefill wird im Effekt weiter unten
  // nachgezogen). Reine Auto-Defaults erzeugen dadurch NIE Dirty.
  // Beim Sitzungs-Restore ist die Baseline bewusst das LEERE Formular, nicht der
  // wiederhergestellte Stand: der Vorgang ist weiterhin ungespeichert, also muss
  // der Verlassen-Guard weiter warnen. Ohne diese Unterscheidung fiele die
  // Warnung nach einem „Zurück" still weg.
  const [baseline, setBaseline] = useState(() =>
    getShipmentFormSnapshot(flowInit
      ? { form: leeresFormular(), shippingDate: todayISO(), serviceFilter: "all", shippingModeFilter: "all", selectedPublicCarrierIds: [] }
      // resumeInit statt eines Auto-Defaults: ein fortgesetzter Entwurf ist bereits
      // gespeichert — sein Lagerbezug ist der Ausgangspunkt, nicht etwas Ungespeichertes
      // (sonst zeigte ein order-/artikelbezogener Entwurf sofort nach dem Fortsetzen
      // fälschlich „ungespeicherte Änderungen", noch bevor der Nutzer etwas geändert hat).
      : { form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
          inventoryContext: (resumeInit && resumeInit.inventoryContext) || null })
  );
  const [pendingTarget, setPendingTarget] = useState(null); // { type, ... } | null — pausierte Zielnavigation
  // EIN Save-Zustand für BEIDE Oberflächen (Verlassen-Dialog + sichtbarer Button):
  // garantiert maximal einen laufenden Form-Draft-Save und einheitliches Fehler-Mapping.
  const [saving, setSaving]         = useState(false);
  const [saveMode, setSaveMode]     = useState("idle");   // idle | error | fieldError | conflict | notFound | rateLimited
  const [saveStatus, setSaveStatus] = useState("idle");   // idle | saved (Inline-Erfolg des sichtbaren Buttons)

  // ── Results ──
  // Sitzungs-Restore setzt Tarife, ceShipmentId, Zollentscheidung und Auswahl
  // ATOMAR beim Mount — genau die Gruppe, die resetResults() zusammen verwirft.
  // Es wird KEIN calculate-price ausgelöst: die Daten kommen aus dem Vorgang.
  const [tariffs, setTariffs]       = useState(flowInit ? flowInit.tariffs : []);
  // ConfidaraExpress-Sendungshandle (shipments.id) des Entwurfs — die EINZIGE
  // Sendungskennung des Vorgangs. Buchung, Neubepreisung, Warenkorbvorschau,
  // Abholzeitfenster, Handelsrechnung und „Als Entwurf speichern" adressieren
  // über ihn; eine Providerreferenz kennt der Client nicht (TG22 Paket A).
  const [ceShipmentId, setCeShipmentId] = useState(flowInit ? flowInit.ceShipmentId : null);
  // Optionaler Lagerbezug (Modul „Lager & Aufträge"): AUSSCHLIESSLICH IDs und
  // Mengen — keine Bestandswerte, keine Artikelstammdaten, keine Preise. Er
  // wird bei jeder Preisanfrage mitgeschickt; der Server löst daraus den
  // geprüften Kontext auf und friert ihn auf dem Entwurf ein.
  //
  // Anders als ceShipmentId gehört er zum FORMULAR, nicht zum Ergebnis: er
  // überlebt deshalb resetResults()/invalidateResults() (Paketdaten ändern und
  // neu rechnen lässt den Lagerbezug bestehen) und wird nur durch einen frischen
  // Vorgang gelöscht. Ohne Lagerbezug ist er null — für jede normale Sendung
  // ändert sich nichts.
  //
  // Vorrang beim Mount: fortgesetzter Formularentwurf > Sitzungsvorgang — exakt
  // dieselbe Priorität wie beim übrigen Formularzustand (RESTORE_PRIORITY,
  // shippingFlowState.mjs). resumeInit trug diesen Wert bislang gar nicht: ein
  // fortgesetzter Entwurf verlor seinen Lager-/Auftragsbezug genau hier
  // (Audit-Finding 1).
  const [inventoryContext, setInventoryContext] = useState(
    (resumeInit && resumeInit.inventoryContext) || (flowInit ? (flowInit.inventoryContext || null) : null)
  );
  // Herkunftshinweis: ABGELEITET, keine eigene Wahrheit (Audit-Finding 3) — siehe
  // inventoryOriginNotice() in inventoryView.mjs. Ein Reload oder ein
  // fortgesetzter Entwurf zeigt den Hinweis dadurch automatisch wieder, ohne ihn
  // an jeder Wiederherstellungsstelle erneut setzen zu müssen; er verschwindet
  // ebenso automatisch, sobald inventoryContext auf null gesetzt wird.
  const inventoryNotice = inventoryOriginNotice(inventoryContext);
  // Zoll-Top-Level aus calculate-price (routenbezogen, NICHT pro Tarif) — nur
  // gespeichert und an BookingPage weitergereicht. Keine eigene EU-Logik hier.
  const [customs, setCustoms]       = useState(flowInit ? flowInit.customs : null);
  const [selected, setSelected]     = useState(flowInit ? flowInit.selected : null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  // Auftrag 2 / P5: Hinweis des Servers, dass die Angebotsliste unvollständig sein kann (null = nichts zu sagen).
  const [coverageNotice, setCoverageNotice] = useState(null);
  // TG22 Paket B: die letzte Preisberechnung scheiterte an fehlenden Profilangaben (422).
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [hasResults, setHasResults] = useState(!!(flowInit && flowInit.tariffs.length > 0));
  // Zeitpunkt der Preisberechnung — trägt die Ablauffrist des Vorgangs.
  const calculatedAtRef = useRef(flowInit ? flowInit.calculatedAt : null);
  // Sichtbare Feldfehler (Auftrag 1, P11, 2026-10-17). Geprüft wird immer mit getErrors(form) —
  // der einzigen Formularregel dieser Seite. SICHTBAR ist davon nur, was der Kunde schon
  // verlassen hat (`touched`) oder was ein Klick auf „Angebote vergleichen" angefordert hat
  // (`submitted`), dazu Feldfehler des Servers, bis das Feld geändert wird (`serverErrors`).
  // Unberührte leere Felder bleiben neutral; eine Korrektur nimmt die Markierung sofort weg.
  //
  // Ein fortgesetzter Entwurf zeigt seine Lücken SOFORT (submitted beim Mount): er sieht
  // ausgefüllt aus, und ohne Markierung erklärte nichts, welche Angabe noch fehlt.
  const [touched, setTouched]           = useState({});
  const [submitted, setSubmitted]       = useState(() => Boolean(resumeInit));
  const [serverErrors, setServerErrors] = useState({});
  // Fokusauftrag für das erste Fehlerfeld — ausgeführt NACH dem Rendern (Effekt unten).
  const [focusRequest, setFocusRequest] = useState(null);
  // ─── Firmenpflicht (Gesamtauftrag B, 2026-10-24) ────────────────────────────────────────
  // Bestätigungen je Angebot (offerKey → true) — nur im Seitenzustand, nie im Vorgang oder Entwurf; sie fallen mit
  // jeder neuen Angebotsliste (resetResults, neuer Vergleich). Dazu die Karte, deren Bestätigung beim Klick fehlte,
  // und der Fokusauftrag für ihr Bestätigungsfeld (ausgeführt nach dem Rendern).
  const [firmenBestaetigt, setFirmenBestaetigt] = useState({});
  const [firmenBestaetigungFehlt, setFirmenBestaetigungFehlt] = useState(null);
  const [bestaetigungsFokus, setBestaetigungsFokus] = useState(null);
  const firmenBestaetigtRef = useRef(firmenBestaetigt);
  firmenBestaetigtRef.current = firmenBestaetigt;
  // Die gemerkte Auswahl, die nur auf einen Firmennamen wartet: { productKey, sender, recipient, vergleichGestartet }.
  // Seit 2026-10-26 ebenso auf eine Korrektur (zu lange Adressangabe, Inhalt): dann mit `feld` und `ausgangswert`.
  // Sie überlebt das Verwerfen der Angebote beim Tippen und wird vom nächsten erfolgreichen Vergleich aufgelöst.
  const firmenAbsichtRef = useRef(null);
  // Ehrlicher Hinweis, wenn das gemerkte Angebot nach dem neuen Vergleich fehlt oder nicht auswählbar ist.
  const [firmenHinweis, setFirmenHinweis] = useState("");
  // Dasselbe gilt für eine Übergabe aus dem Preisrechner: Route, Paket und Datum stehen da, Straße,
  // Kontakt und Sendungsangaben fehlen. Einmalig beim Mount und nur mit offener Absicht; die
  // Vorrangkette des Initialisierers darüber bleibt unberührt.
  useEffect(() => {
    if (flowInit && flowInit.calculatorIntent) setSubmitted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quittung je Seite nach einer Adressbuchübernahme („s" | „r"). Reiner
  // Anzeigezustand: er wandert NICHT in den Vorgang, nicht in den Entwurf und
  // nicht in die Baseline — er sagt nur, was gerade passiert ist.
  const [addressNote, setAddressNote] = useState({ s: "", r: "" });

  // ── Fortsetzen-Status (nur aktiv, wenn ein Formularentwurf fortgesetzt wird) ──
  // resumeSource trägt die Übergangs-Metadaten (interne Formularentwurf-ID +
  // Revision), die beim nächsten „Preise berechnen" EINMALIG mitgesendet werden.
  const [resumeSource, setResumeSource]       = useState(() => resumeSourceFromDraft(resumeDraft)); // { id, revision } | null
  // nicht blockierender Hinweis. TG22 Paket B: startet ein Entwurf mit vergangenem Versanddatum,
  // sagt er sofort, warum das Datum leer ist und die Berechnung auf eine Wahl wartet.
  const [resumeNotice, setResumeNotice]       = useState(() => (resumeInit && resumeInit.shippingDateExpired ? RESUME_PAST_DATE_NOTICE : ""));
  // Gesamtauftrag F: ein fortgesetzter Entwurf mit dem entfallenen Filter „Economy" zeigt „Alle Versandarten" und sagt es.
  // Eigener Hinweis neben dem Datumshinweis — beide können zugleich gelten. Er fällt, sobald eine Versandart gewählt wird.
  const [modeResetNotice, setModeResetNotice] = useState(() => (resumeInit && resumeInit.shippingModeReset ? RESUME_ECONOMY_FILTER_NOTICE : ""));
  const [resumeConflict, setResumeConflict]   = useState(false);  // 409 Konflikt → „Aktuelle Version laden"
  const [reloadingResume, setReloadingResume] = useState(false);

  // ── Race-Schutz für /calculate-price (Audit F1) ──
  // Verhindert, dass eine spät eintreffende Antwort neuere Eingaben überschreibt.
  //  • calcSeq    — steigende Sequence; nur die Antwort des jeweils neuesten
  //                 Aufrufs darf State/Loading verändern.
  //  • calcAbort  — bricht einen noch laufenden Request ab, sobald ein neuer
  //                 startet (und beim Unmount). Genau ein aktiver Request.
  //  • calcKeyRef — Live-Schlüssel der Payload-bestimmenden Eingaben (bei jedem
  //                 Render aktualisiert); erkennt, ob sich die Eingaben seit dem
  //                 Absenden geändert haben → veraltete Antwort verwerfen.
  const calcSeq    = useRef(0);
  const calcAbort  = useRef(null);
  const calcKeyRef = useRef("");
  // In-Flight-Guard als Ref, NICHT über den `loading`-State: mehrere Klicks
  // innerhalb desselben Ticks lesen alle denselben (noch alten) State-Wert und
  // kämen an einer State-Prüfung vorbei. Der Ref wirkt sofort.
  const calcInFlight = useRef(false);
  // Schlüssel der zuletzt ERFOLGREICH berechneten Angebote. Nur gesetzt, wenn
  // Tarife tatsächlich angekommen sind — ein Fehlversuch hinterlässt hier
  // nichts, der nächste Klick rechnet also neu.
  const lastCalcKeyRef = useRef("");


  /* ── Entwurf schlägt Sitzungsvorgang ─────────────────────────────────────
     Ein bewusst geöffneter Formularentwurf ersetzt den temporären Vorgang
     VOLLSTÄNDIG. Dieser Effekt steht vor dem Spiegel-Effekt und läuft deshalb
     zuerst: er leert den Bereich, danach schreibt der Spiegel den Entwurfsstand
     hinein. Es wird nichts gemischt. */
  useEffect(() => {
    if (!resumeInit) return;
    clearFlowScope("shipment");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── „Zusätzliche Optionen" eines Sendungsentwurfs zurückholen ────────────
     Der Entwurfszustand der vier Schalter gehört zur BUCHUNG, nicht zum Formular —
     er wird deshalb in den Buchungsbereich des Vorgangs geschrieben und von
     BookingPage beim Mount gelesen. Kein zweiter Übergabeweg, kein Prop-Durchreichen
     über zwei Seiten hinweg.

     Die REIHENFOLGE ist tragend: `clearScope("shipment")` im Effekt darüber setzt den
     Buchungsbereich mit zurück (ein Entwurf ersetzt den Vorgang vollständig). Dieser
     Effekt steht deshalb DANACH — umgekehrt hätte das Leeren die soeben
     wiederhergestellten Optionen sofort wieder verworfen. Dieselbe Falle wie beim
     Spiegel-Effekt, nur eine Ebene weiter.

     Nur bei einem SENDUNGSentwurf: ein Formularentwurf existiert vor Tarif und
     Checkout und kennt diese Optionen gar nicht. Und nur, wenn tatsächlich etwas
     eingestellt war — sonst würde ein Entwurf ohne Zusatzoptionen den Vorgang grundlos
     mit lauter Standardwerten beschreiben. */
  useEffect(() => {
    if (!isValidShipmentResumeDraft(resumeDraft)) return;
    if (!hasAnyDraftBookingOption(resumeDraft.bookingOptions)) return;
    setFlowBooking(draftBookingOptionsToFlow(resumeDraft.bookingOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Der Ablaufhinweis wird genau einmal gezeigt: die Seite hat ihn beim Mount
  // übernommen, der Provider vergisst ihn danach.
  useEffect(() => {
    consumeDroppedReason();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Spiegelung in den laufenden Vorgang ─────────────────────────────────
     Ein Effekt, dessen Abhängigkeiten die tatsächlichen Zustandswerte sind.
     React vergleicht referenziell: `form` ist bei jeder Eingabe ein neues
     Objekt, `tariffs` bei jeder Berechnung ein neues Array — der Effekt läuft
     also genau dann, wenn sich fachlich etwas geändert hat.

     Keine Schleife: setScope ändert den Context, nicht diese Abhängigkeiten.
     Der Provider schreibt zudem nur dann in den sessionStorage, wenn sich der
     Fingerabdruck (ohne Zeitstempel) unterscheidet. */
  useEffect(() => {
    setFlowScope("shipment", {
      form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
      sortMode, vatMode, tariffs, publicCarriers, selected, ceShipmentId, customs,
      inventoryContext, calculatorIntent,
      calculatedAt: calculatedAtRef.current,
    });
  }, [form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
      sortMode, vatMode, tariffs, publicCarriers, selected, ceShipmentId, customs,
      inventoryContext, calculatorIntent, setFlowScope]);

  /* ── Scrollposition wiederherstellen ─────────────────────────────────────
     Erst NACHDEM Formular und Angebotsbereich gerendert sind — vorher ist das
     Dokument zu kurz und der Sprung liefe ins Leere. Genau einmal je Mount.
     Ohne wiederhergestellten Vorgang passiert nichts; das normale
     ScrollToTop-Verhalten bleibt für alle anderen Wege unberührt. */
  const scrollWiederhergestelltRef = useRef(false);
  const offersRef = useRef(null);
  // „Angebote vergleichen" — Rückgabeziel des Fokus nach einem Fehler.
  const calcCtaRef = useRef(null);
  // Während des Vergleichs ist der Seiteninhalt inert; wohin der Fokus danach
  // gehört, meldet calculate() hierüber (hooks/useComparisonLoadingFocus.js).
  const fokusNachVergleich = useComparisonLoadingFocus(loading, { offersRef, triggerRef: calcCtaRef });
  // „Versandbereich aktiv": still beim Betreten, beim Wieder-Sichtbarwerden und bei Aktivität nach Ruhe — der Server
  // wärmt ggf. den Anbieter vor, damit der spätere Vergleich nicht kalt startet (hooks/useShippingWarmup.js).
  useShippingWarmup();
  // content-visibility (offers.css) lässt Karten außerhalb des Bildes nur mit
  // ihrem Platzhalter im Layout. Für den Sprung auf eine GEMERKTE Pixelposition
  // wäre das falsch: frisch montiert stünden alle Karten über dem Ziel mit
  // Platzhalterhöhe da — gemessen bis ~620 px daneben (108 Angebote, 390 px).
  // Bis der Sprung sitzt, liegen die Karten deshalb vollständig im Layout;
  // `contain-intrinsic-size: auto` merkt sich dabei ihre echten Höhen, danach
  // gilt wieder content-visibility, ohne dass sich etwas verschiebt.
  const [kartenVollLayouten, setKartenVollLayouten] = useState(() => (flowInit?.scrollY ?? 0) > 0);
  useEffect(() => {
    if (scrollWiederhergestelltRef.current) return;
    if (!flowInit) { scrollWiederhergestelltRef.current = true; return; }
    // Auf die Angebote warten, solange welche zum Vorgang gehören — vorher ist
    // das Dokument zu kurz und jeder Sprung liefe ins Leere.
    if (flowInit.tariffs.length > 0 && !hasResults) return;
    scrollWiederhergestelltRef.current = true;

    // Drei Stufen, in dieser Reihenfolge:
    //   1. gemerkte Scrollposition — sie trifft genau das, was der Kunde sah,
    //   2. sonst der Angebotsbereich selbst (kein Pixelwert, sondern das echte
    //      Element — es verschiebt sich mit jedem Layout mit),
    //   3. sonst der Formularanfang (Standardverhalten).
    const ziel = flowInit.scrollY;
    const sanft = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setKartenVollLayouten(false);   // wirkt erst nach diesem Rückruf — der Sprung rechnet noch mit echten Höhen
        if (ziel > 0) { window.scrollTo(0, ziel); return; }
        if (offersRef.current) {
          offersRef.current.scrollIntoView({ behavior: sanft ? "smooth" : "auto", block: "start" });
          return;
        }
        window.scrollTo(0, 0);
      });
    });
    return () => { cancelAnimationFrame(id); setKartenVollLayouten(false); };
  }, [flowInit, hasResults]);

  const selectedOption       = SERVICE_OPTIONS.find(o => o.id === serviceFilter)             || SERVICE_OPTIONS[0];
  const selectedShippingMode = SHIPPING_MODE_OPTIONS.find(o => o.id === shippingModeFilter)  || SHIPPING_MODE_OPTIONS[0];

  // Filter-State enthält ausschließlich öffentliche IDs; die deduplizierte
  // publicCarriers-Liste des Backends wird unverändert für die Chips verwendet.
  const selectedPublicSet = useMemo(() => new Set(selectedPublicCarrierIds), [selectedPublicCarrierIds]);
  const selectedLabels = useMemo(
    () => publicCarriers.filter(pc => selectedPublicSet.has(pc.id)).map(publicCarrierChipLabel),
    [publicCarriers, selectedPublicSet]
  );

  const carrierLabel =
    selectedPublicCarrierIds.length === 0 ? "Alle Dienstleister" :
    selectedLabels.length <= 2  ? selectedLabels.join(", ") :
    `${selectedPublicCarrierIds.length} ausgewählt`;

  const upd = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    // Nur der Serverfehler DIESES Feldes fällt weg; alle übrigen Markierungen bleiben. Ob das
    // Feld selbst noch rot ist, entscheidet getErrors mit dem neuen Wert (siehe `errors`).
    setServerErrors(p => withoutFieldError(p, k));
    // Stale-State-Schutz: Ändert sich ein buchungsrelevantes Feld (Absender-,
    // Empfänger-, Paket- oder Routendaten), werden alte Tarife UND die
    // Sendungskennung verworfen. So kann niemals ein veralteter Tarif / eine alte
    // Sendungskennung mit nachträglich geänderten Daten an /book gehen — der Nutzer
    // muss zwingend erneut „Preise berechnen“ ausführen.
    if (!FILTER_ONLY_FIELDS.has(k)) invalidateResults();
  };

  // Paketzeilen (Canonical v2.79): der Editor meldet die ganze Liste. Zeile 1 landet in den flachen
  // Feldern, weitere unter `extraPackageLines`. Wie bei `upd` fallen die Serverfehler der geänderten
  // Felder weg, und Paketdaten sind buchungsrelevant: vorhandene Angebote verfallen.
  const updPakete = (zeilen, { changedKeys = [] } = {}) => {
    setForm(p => ({ ...p, ...formPatchFromPackageLines(zeilen) }));
    setServerErrors(p => changedKeys.reduce((rest, k) => withoutFieldError(rest, k), p));
    invalidateResults();
  };

  // Das Volumengewicht ist ein Wert für EIN Paket — es steht deshalb nur bei einer Paketzeile.
  const volWeight = !hasExtraPackageLines(form) && form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  // Die Formularregel läuft EINMAL je Render — für die Sichtbarkeit, den Sammelhinweis und die
  // Klickprüfung. Keine zweite Fassung einer Regel.
  const liveErrors = useMemo(() => getErrors(form), [form]);
  const calcValid = Object.keys(liveErrors).length === 0;
  // TG22 Paket B: ohne Versanddatum keine Berechnung. Das tritt nur bei einem fortgesetzten
  // Entwurf auf, dessen Datum vergangen ist — dort wird bewusst nichts ersetzt.
  const datumFehlt = !shippingDate;
  const DATUM_FEHLT_HINWEIS = "Bitte wählen Sie ein Versanddatum, um Angebote zu vergleichen.";
  const errors = visibleFieldErrors({
    live: datumFehlt ? { shippingDate: "Bitte wählen Sie ein Versanddatum.", ...liveErrors } : liveErrors,
    touched, submitted, server: serverErrors,
  });
  // Verlassen eines Feldes: ab jetzt zeigt es seinen Fehler (nur dieses Feld).
  const markTouched = (k) => setTouched(t => markFieldTouched(t, k));
  // Hinweis am CTA — NUR aus bereits sichtbar markierten Feldern (`errors`), nie aus einer
  // stillen Vorabvalidierung des laufenden Tippens.
  const calcHint = calcValid && !datumFehlt ? null : missingFieldsHint(errors);

  // Fokus erst NACH dem Rendern der Markierungen (Auftrag 1, P11): dann trägt das Feld schon
  // aria-invalid und seinen Fehlertext, und ein Screenreader liest beides beim Fokus vor.
  // Bis 2026-10 lief der Fokus im Klick selbst — vor dem Rendern, also auf ein noch
  // unmarkiertes Feld.
  useEffect(() => {
    if (focusRequest && focusRequest.field) focusFirstError(focusRequest.field);
  }, [focusRequest]);
  // Gesamtauftrag B: fehlt beim Klick auf „Angebot auswählen" die Bestätigung, kommt ihr Feld ins Bild und bekommt
  // den Fokus — weich, bei reduzierter Bewegung ohne Animation (dieselbe Regel wie focusFirstError).
  useEffect(() => {
    if (!bestaetigungsFokus || !bestaetigungsFokus.id) return;
    const el = document.getElementById(bestaetigungsFokus.id);
    if (!el) return;
    const ruhig = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { el.scrollIntoView({ behavior: ruhig ? "instant" : "smooth", block: "center" }); } catch { el.scrollIntoView(); }
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  }, [bestaetigungsFokus]);
  const requestFocus = (field) => { if (field) setFocusRequest({ field, at: Date.now() }); };
  // Hinweis zur Angebotsabsicht aus dem Preisrechner — offen, ausgewählt oder nicht zuzuordnen.
  // Abgeleitet, keine eigene Wahrheit; ohne Übergabe ist er leer und erscheint nicht.
  const calculatorHinweis = calculatorIntentNotice({
    intent: calculatorIntent, resolution: calculatorIntentResolution, selected,
  });
  // Übernahme aus dem öffentlichen Preisrechner: der neu berechnete Preis NEBEN dem öffentlichen —
  // nur bei genau einem Treffer und solange genau dieses Angebot ausgewählt ist.
  const preisvergleich = publicPriceComparison({ resolution: calculatorIntentResolution, selected });

  // EINE gemeinsame Quelle mit der Buchungsseite (utils/newShipmentForm.mjs) — siehe dort,
  // warum die Liste nicht mehr zweimal gepflegt wird.
  const buildParty = (p) => buildPartyPayload(form, p);

  const resetResults = () => {
    setHasResults(false);
    setTariffs([]);
    setCoverageNotice(null);
    setSelected(null);
    setCeShipmentId(null); // alte Sendungskennung mit verwerfen → nie mit neuen Daten buchbar
    setCustoms(null);    // alte Zollentscheidung mit verwerfen
    setError("");
    calculatedAtRef.current = null;
    setFlowNotice(null); // ein neuer Anlauf beginnt ohne alten Ablaufhinweis
    // Gesamtauftrag B: mit der Liste fallen ihre Bestätigungen; die gemerkte Auswahl (Ref) bleibt bewusst stehen.
    setFirmenBestaetigt({});
    setFirmenBestaetigungFehlt(null);
    setFirmenHinweis("");
  };

  // Verwirft ein vorhandenes Ergebnis nur, wenn überhaupt eines existiert.
  // Vermeidet unnötige Re-Renders bei jedem Tastendruck im noch leeren
  // Formular (vor der ersten Preisberechnung gibt es nichts zu invalidieren).
  const invalidateResults = () => {
    if (hasResults || ceShipmentId || tariffs.length > 0 || selected) resetResults();
  };

  // ── Adressbuchauswahl IM Formular (Absender- und Empfängerkopf) ────────────
  // Reine Wertekopie in die neun s_*/r_*-Felder — dieselbe Feldauslegung wie
  // beim Prefill von der Adressbuchseite (mapAddressToShipmentFormPatch). Es
  // entsteht KEINE addressId-Referenz, nichts wird nachsynchronisiert und
  // nichts ins Adressbuch zurückgeschrieben; der Entwurfs-Snapshot bleibt
  // reine Werte (getShipmentFormSnapshot kennt kein Adressbuchfeld).
  //
  // Drei Dinge sind hier bewusst genau so und nicht anders:
  //
  // 1. EIN gebündelter Patch, EINE Invalidierung. Neun einzelne upd()-Aufrufe
  //    liefen neun Mal durch invalidateResults() und erzeugten neun Renders für
  //    einen einzigen Vorgang.
  // 2. Die Baseline wird NICHT nachgezogen — anders als beim automatischen
  //    Prefill beim Mount. Der Unterschied ist fachlich: das Prefill IST der
  //    Ausgangszustand der Seite, diese Auswahl ist eine NUTZERÄNDERUNG. Wer
  //    danach wegnavigiert, muss den Verlassen-Hinweis bekommen und den Entwurf
  //    speichern können.
  // 3. Alte Angebote, ceShipmentId, Zollentscheidung und Auswahl
  //    fallen über invalidateResults() weg — eine geänderte Route darf niemals
  //    mit einem Tarif von vorher gebucht werden.
  const uebernimmAdressbuchAdresse = (address, prefix) => {
    const patch = mapAddressToShipmentFormPatch(address, prefix);
    const keys = Object.keys(patch);
    setForm(p => ({ ...p, ...patch }));
    // Serverfehler der ersetzten Felder verschwinden mit ihrem Wert — dieselbe Regel wie in
    // upd(), nur für alle neun Schlüssel auf einmal. Ob ein ersetztes Feld noch rot ist,
    // entscheidet getErrors mit dem übernommenen Wert.
    setServerErrors(p => {
      if (!keys.some(k => p[k])) return p;
      const n = { ...p };
      for (const k of keys) delete n[k];
      return n;
    });
    invalidateResults();
    setAddressNote(p => ({ ...p, [prefix]: ADDRESS_TAKEN_NOTE }));
  };

  // ── Adressbuch → „Neue Sendung": optionaler Werte-Patch ─────────────────────
  // Reiner Wertekopie in das bestehende Formular (s_*/r_*-Felder) — KEINE
  // dauerhafte addressId-Referenz, KEINE automatische Preisberechnung/Buchung.
  // Wird genau einmal beim Mount angewendet (Effekt feuert nur, wenn
  // prefillAddress tatsächlich gesetzt ist) und danach über onPrefillApplied
  // im Elternteil zurückgesetzt — ein erneuter Mount ohne neues Prefill
  // wendet also nichts an. Ohne die Props (Default undefined) ist dieser
  // Effekt ein No-Op → bestehendes Verhalten bleibt vollständig unverändert.
  useEffect(() => {
    if (!prefillAddress) return;
    const merged = { ...form, ...prefillAddress };
    setForm(merged);
    // Adressbuch-Prefill ist der bewusste Ausgangszustand → Baseline nachziehen,
    // damit die Vorbelegung nicht als Nutzeränderung (Dirty) zählt. `form` ist
    // hier der Initial-Seed (Effekt läuft vor jeder Nutzerinteraktion beim Mount).
    setBaseline(getShipmentFormSnapshot({ form: merged, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds }));
    invalidateResults();
    onPrefillApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillAddress]);

  // ── Lager/Auftrag → „Neue Sendung": Werte-Patch + Lagerbezug ───────────────
  // Exakt dieselbe Einmal-Semantik wie beim Adressbuch-Prefill darüber: der
  // Effekt feuert nur bei gesetztem prefillInventory und meldet sich sofort
  // über onInventoryPrefillApplied ab. Ein erneuter Mount ohne neues Prefill
  // wendet nichts an — alte Artikel-/Auftragsdaten können bei einer späteren
  // normalen Sendung nicht wieder auftauchen.
  //
  // Der Unterschied zum Adressbuch ist nur der zusätzliche Lagerbezug; das
  // Formular selbst wird auf demselben Weg befüllt. Es entsteht keine zweite
  // Formularlogik.
  useEffect(() => {
    if (!prefillInventory || !prefillInventory.inventory) return;
    const merged = { ...form, ...(prefillInventory.form || {}) };
    setForm(merged);
    setInventoryContext(prefillInventory.inventory);
    // inventoryNotice ist abgeleitet (siehe oben) — sie folgt inventoryContext im
    // nächsten Render automatisch, kein separates Setzen mehr nötig.
    setBaseline(getShipmentFormSnapshot({
      form: merged, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
      inventoryContext: prefillInventory.inventory,
    }));
    invalidateResults();
    onInventoryPrefillApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillInventory]);

  // ── Länderwechsel ────────────────────────────────────────────────────────────
  // Das Land wird unmittelbar geändert (kein Bestätigungsdialog, keine
  // automatische Feldleerung). Adress-/Firmen-/Kontaktfelder bleiben vollständig
  // erhalten — nur der Country-State wird aktualisiert. Wie bei jedem anderen
  // buchungsrelevanten Feld verwirft upd() über invalidateResults() lediglich
  // vorhandene Preis-/Tarif-/Sendungskennungs-Ergebnisse (Buchungssicherheit); es
  // werden KEINE Formularfelder verändert. Gebunden direkt am <select> onChange.

  const handleTogglePublicCarrier = (id) => {
    setSelectedPublicCarrierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    resetResults();
  };

  // Setzt ALLE reinen Ergebnisfilter zurück. Beide Schlüssel stehen in
  // FILTER_ONLY_FIELDS — `upd` ruft für sie bewusst KEIN invalidateResults(),
  // die bereits berechneten Tarife und die Sendungskennung bleiben also erhalten
  // und es entsteht KEIN neuer /calculate-price-Request. Wer hier einen
  // weiteren Filter ergänzt, trägt ihn zusätzlich in FILTER_ONLY_FIELDS und
  // in activeFilterCount (OffersList) ein.
  const clearFilters = () => {
    upd("max_price", "");
    upd("latestDeliveryDate", "");
    upd("latestDeliveryTime", "");
  };

  useEffect(() => {
    if (!carrierDropdownOpen) return;
    const onOutside = (e) => {
      if (carrierRef.current && !carrierRef.current.contains(e.target))
        setCarrierDropdownOpen(false);
    };
    const onEscape = (e) => { if (e.key === "Escape") setCarrierDropdownOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [carrierDropdownOpen]);

  // Der Versanddienst-Filter wird ausschließlich aus der publicCarriers-Liste der
  // calculate-price-Antwort gespeist (öffentlicher Carrier-Vertrag). Vor der ersten
  // Berechnung bleibt er bewusst leer (neutraler Hinweis) — keine Rohwert-Vorbefüllung.

  // Laufenden /calculate-price-Request beim Unmount abbrechen (kein setState
  // nach Unmount, keine hängende Antwort).
  useEffect(() => () => { if (calcAbort.current) calcAbort.current.abort(); }, []);

  // Mounted-Schutz für den „Aktuelle Version laden"-Pfad (kein AbortController).
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Resume-Payload genau EINMAL annehmen und im Elternteil zurücksetzen, damit
  // ein späteres normales Öffnen von „Neue Sendung" nicht erneut rehydriert.
  const resumeAppliedRef = useRef(false);
  useEffect(() => {
    if (resumeDraft && !resumeAppliedRef.current) {
      resumeAppliedRef.current = true;
      onResumeApplied?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dirty-State + interner Verlassen-Guard ─────────────────────────────────
  // Aktueller fachlicher Snapshot (nur payload-bestimmende Felder). Dirty = echte
  // Änderung ggü. Baseline UND speicherbarer Zustand (shipmentFormSnapshot.mjs).
  const currentSnapshot = useMemo(
    () => getShipmentFormSnapshot({ form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds, inventoryContext }),
    [form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds, inventoryContext]
  );
  const isDirty = isShipmentFormDirty(currentSnapshot, baseline);
  // Live-Refs, damit der stabil registrierte Guard keinen veralteten Closure liest.
  const dirtyRef = useRef(isDirty); dirtyRef.current = isDirty;
  const pendingTargetRef = useRef(null); pendingTargetRef.current = pendingTarget;
  const savingRef = useRef(false); savingRef.current = saving;

  // ── Standard-Absender (Paket G, Master-Implementierungsauftrag 2026-10-23) ──────
  // „Standardabsender sinnvoll hervorheben beziehungsweise vorbelegen": eine NEUE Sendung startet mit der
  // Adresse, die der Kunde im Adressbuch selbst als Standard-Absender festgelegt hat. Das ist kein
  // Profil-Autoseed — die Werte stammen aus einer bewussten Einstellung des Kunden, laufen durch dieselbe
  // Feldauslegung wie „Adresse suchen" (mapAddressToShipmentFormPatch) und stehen sichtbar gekennzeichnet
  // da (Marke DEFAULT_SENDER_BADGE am Titel, solange die Werte unverändert sind).
  //
  // Nur auf einem frischen Formular: kein fortgesetzter Entwurf, kein Sitzungsvorgang, kein Adressbuch-
  // Prefill des Absenders. Die Antwort kommt asynchron — hat der Kunde bis dahin etwas geändert oder in den
  // Absender geschrieben, wird nichts überschrieben. Die Vorbelegung IST der Ausgangszustand: die Baseline
  // zieht nach (kein Dirty), genau wie beim Adressbuch-Prefill. Keine Invalidierung nötig: ohne Absender
  // gibt es noch kein Angebot.
  //
  // Status: "offen" (noch nicht geprüft) | "gesetzt" | "keiner" (kein Standard hinterlegt) |
  // "uebersprungen" (Kunde war schneller) | "fehler" (Abfrage gescheitert — still, das Formular bleibt bedienbar).
  const [standardAbsender, setStandardAbsender] = useState("offen");
  const standardPatchRef = useRef(null);
  const standardSeqRef = useRef(0);
  const zustandRef = useRef(null);
  zustandRef.current = { form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds, inventoryContext };
  const belegeStandardAbsenderVor = useCallback(async () => {
    const meins = ++standardSeqRef.current;
    standardPatchRef.current = null;
    setStandardAbsender("offen");
    const aktuell = () => mountedRef.current && standardSeqRef.current === meins;
    let adresse = null;
    try {
      const res = await getAddresses({ tab: TAB_SENDER, defaultOnly: true, limit: 1 });
      if (!aktuell()) return;
      if (!res.ok) { setStandardAbsender("fehler"); return; }
      const data = await res.json();
      if (!aktuell()) return;
      adresse = defaultAddressForTab(data && data.items, TAB_SENDER);
    } catch {
      if (aktuell()) setStandardAbsender("fehler");
      return;
    }
    if (!adresse) { setStandardAbsender("keiner"); return; }
    const stand = zustandRef.current;
    if (dirtyRef.current || partyHasInput(stand.form, "s")) { setStandardAbsender("uebersprungen"); return; }
    const patch = mapAddressToShipmentFormPatch(adresse, "s");
    const merged = { ...stand.form, ...patch };
    standardPatchRef.current = patch;
    setForm(merged);
    setBaseline(getShipmentFormSnapshot({ ...stand, form: merged }));
    setStandardAbsender("gesetzt");
  }, []);

  // Einmal beim Mount — nicht beim fortgesetzten Entwurf, nicht beim Sitzungsvorgang, nicht wenn ein
  // Adressbuch-Prefill den Absender schon trägt. Ein Prefill nur des Empfängers (oder ein Auftrag aus
  // „Lager & Aufträge", der nur r_* und Paketwerte setzt) bekommt den Standard-Absender dazu.
  const standardStartRef = useRef(false);
  useEffect(() => {
    if (standardStartRef.current) return;
    standardStartRef.current = true;
    const absenderAusPrefill = !!prefillAddress && Object.keys(prefillAddress).some((k) => k.startsWith("s_"));
    if (!authed || resumeInit || flowInit || absenderAusPrefill) { setStandardAbsender("uebersprungen"); return; }
    belegeStandardAbsenderVor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Steht im Absender unverändert der eingetragene Standard, trägt der Titel die Marke, und bei „Eingaben
  // zurücksetzen" ginge nichts verloren (der Reset trägt ihn wieder ein) — er zählt dort nicht als Eingabe.
  const absenderIstStandard = standardAbsender === "gesetzt" && !!standardPatchRef.current
    && Object.entries(standardPatchRef.current).every(([k, v]) => String(form[k] ?? "") === String(v ?? ""));
  const ohneStandardAbsender = (snap) => (absenderIstStandard ? { ...snap, sender: LEERER_ABSENDER } : snap);
  // Ohne Standard-Absender: ein leiser Tipp, solange der Absender leer ist und kein anderer Hinweis steht.
  const zeigeStandardTipp = standardAbsender === "keiner" && !addressNote.s && !partyHasInput(form, "s");

  // Guard beim Elternteil registrieren: Der Dashboard-Navigationspfad ruft ihn
  // VOR jeder internen Zielnavigation auf. Rückgabe true = abgefangen (Dialog
  // öffnet ODER Navigation blockiert), false = sofort erlauben. Policy: der ERSTE
  // Navigationswunsch bleibt verbindlich (kein stilles Zielwechseln, kein zweiter Dialog).
  useEffect(() => {
    if (!registerLeaveGuard) return undefined;
    registerLeaveGuard((target) => {
      // Während eines laufenden expliziten Saves: interne Navigation kurz
      // blockieren (kein zweiter Dialog, kein zweiter Request). Nach Save-Ende
      // klickt der Nutzer das Ziel erneut an.
      if (savingRef.current) return true;
      if (!dirtyRef.current) return false;
      if (!pendingTargetRef.current) { setSaveMode("idle"); setPendingTarget(target); }
      return true;
    });
    return () => registerLeaveGuard(null);
  }, [registerLeaveGuard]);

  // Pausierte Zielnavigation genau EINMAL ausführen (Elternteil kennt page/route/logout).
  const runPendingLeave = () => {
    const target = pendingTargetRef.current;
    setPendingTarget(null);
    setSaveMode("idle");
    if (target) commitLeave?.(target);
  };

  // ── Nach erfolgreichem Entwurfsspeichern: der aktive Vorgang ist beendet ────
  // Der Entwurf liegt jetzt sicher auf dem Server — der bisherige AKTIVE
  // temporäre ShippingFlow gehört fachlich nicht mehr zur nächsten „Neue
  // Sendung". Formular, Ergebnisse, Filter und der geteilte Flow werden
  // deshalb ATOMAR auf den echten Ausgangszustand zurückgesetzt.
  //
  // NICHT nur clearFlowScope() aufrufen: der Spiegel-Effekt weiter unten hängt
  // an den LOKALEN Zustandswerten (form, tariffs, selected, …), nicht am
  // Context. Blieben die unverändert, schriebe der Effekt beim nächsten
  // Tastenanschlag den gerade gelöschten, lokal aber noch immer vorhandenen
  // alten Stand sofort wieder in den Flow zurück. Der Reset muss deshalb
  // GENAU DIESELBEN Werte umfassen, die der Spiegel-Effekt beobachtet.
  //
  // Geteilte Grundlage für zwei Auslöser: den bewussten „Eingaben
  // zurücksetzen"-Button (applyReset) und den Erfolgspfad des
  // Entwurfsspeicherns (saveCurrentFormDraft) — beide stellen denselben
  // frischen Zustand her.
  const resetToFreshShipment = () => {
    const seed = leeresFormular();
    setForm(seed);
    setShippingDate(todayISO());
    setServiceFilter("all");
    setShippingModeFilter("all");
    setSelectedPublicCarrierIds([]);
    setPublicCarriers([]);
    setSortMode("recommended");
    setVatMode("net");
    setTouched({});
    setSubmitted(false);
    setServerErrors({});
    setAddressNote({ s: "", r: "" });
    setResumeSource(null);
    setResumeNotice("");
    setResumeConflict(false);
    setSaveMode("idle");
    // Ein frischer Vorgang hat keinen Lagerbezug mehr. Das ist der EINZIGE Ort,
    // an dem er gelöscht wird: resetResults() lässt ihn bewusst stehen, damit
    // eine geänderte Paketangabe mit erneuter Preisberechnung den Bezug zum
    // Artikel oder Auftrag nicht verliert. inventoryNotice folgt automatisch (abgeleitet).
    setInventoryContext(null);
    // Ebenso endet eine offene Angebotsabsicht aus dem Preisrechner mit dem Vorgang.
    setCalculatorIntent(null);
    setCalculatorIntentResolution(null);
    resetResults();
    // Baseline auf den frischen Seed ziehen → das zurückgesetzte Formular ist
    // nicht „dirty" und der Verlassen-Guard schweigt zu Recht.
    setBaseline(getShipmentFormSnapshot({
      form: seed, shippingDate: todayISO(), serviceFilter: "all",
      shippingModeFilter: "all", selectedPublicCarrierIds: [],
    }));
    clearFlowScope("shipment");
    // Paket G: ein frischer Vorgang beginnt wie beim Öffnen — mit dem Standard-Absender, sofern hinterlegt.
    belegeStandardAbsenderVor();
  };

  // ── EINZIGE Save-Orchestrierung (Dialog UND sichtbarer Button teilen sie) ────
  // PATCH (fortgesetzter/bereits gespeicherter Draft mit gültiger Source-ID) oder
  // POST (neuer Entwurf). Genau ein Request gleichzeitig (saving-Guard). Setzt
  // bei Erfolg den Vorgang vollständig zurück (resetToFreshShipment) — der
  // gespeicherte Entwurf bleibt serverseitig bestehen, der AKTIVE Vorgang endet
  // hier. Rückgabe { ok } — die JEWEILIGE Erfolgsaktion (navigieren vs.
  // bleiben) trifft der Aufrufer. Kein Fehler-Mapping und keine POST/PATCH-
  // Logik außerhalb dieser Funktion.
  const saveCurrentFormDraft = async () => {
    if (saving) return { ok: false };
    setSaving(true); setSaveMode("idle"); setSaveStatus("idle");
    // inventoryContext MUSS mit in den Snapshot (Audit-Finding 1): ohne ihn verlor
    // ein aus Lager/Auftrag stammender Vorgang seinen fachlichen Bezug genau hier —
    // der gemeinsame Reset im Erfolgspfad löscht ihn danach lokal, und ohne ihn im
    // gespeicherten Snapshot wäre er beim späteren Fortsetzen unwiderruflich weg.
    const snapshot = getShipmentFormSnapshot({ form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds, inventoryContext });
    const source = resumeSource;
    const isPatch = !!(source && hasSavableShipmentId(source.id));
    // Die Fassung folgt dem Inhalt (Canonical v2.79): unterschiedliche Pakete speichern Fassung 2,
    // alles andere Fassung 1 — auch beim Aktualisieren (der Server übernimmt die gesendete Fassung).
    const schemaVersion = formDraftSchemaVersion(snapshot);
    try {
      const r = isPatch
        ? await updateFormDraft(source.id, { schemaVersion, revision: source.revision, formData: snapshot })
        : await createFormDraft({ schemaVersion, formData: snapshot });
      if (!mountedRef.current) return { ok: false };
      if (r.status === 401 || r.status === 403) { setSaving(false); return { ok: false }; } // zentraler Auth-Redirect übernimmt
      if (isPatch && r.status === 409) { setSaveMode("conflict"); setSaving(false); return { ok: false }; }
      if (isPatch && r.status === 404) { setResumeSource(null); setSaveMode("notFound"); setSaving(false); return { ok: false }; } // nächster Save = POST
      if (r.status === 429) { setSaveMode("rateLimited"); setSaving(false); return { ok: false }; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!mountedRef.current) return { ok: false };
      // Ein abgelehntes Feld wird MARKIERT, nicht verschluckt.
      //
      // Bis hierher endete jede 400 im generischen „Der Entwurf konnte nicht
      // gespeichert werden. Bitte versuche es erneut." — und genau dieses
      // „erneut" war die falsche Auskunft: stammte der beanstandete Wert aus dem
      // Profil (Absenderland, Absender-PLZ), konnte kein Wiederholen der Welt
      // helfen. Der Server nennt das Feld längst (`field`); der Weg dorthin
      // existiert ebenfalls längst und wird hier nur benutzt — derselbe
      // Normalizer und dieselbe Feldzuordnung wie beim Preisrechner darüber.
      if (r.status === 400) {
        const norm = normalizeApiError({ status: r.status, body: d, fieldMap: SHIPMENT_FIELD_MAP });
        if (norm.field) {
          setServerErrors((prev) => ({ ...prev, [norm.field]: norm.fieldMessage || norm.message }));
          requestFocus(norm.field);
          setSaveMode("fieldError");
          setSaving(false);
          return { ok: false };
        }
      }
      if (!r.ok || !d?.draft) throw new Error("save failed");
      // Erfolg: der Entwurf ist gesichert — der aktive Vorgang ist damit
      // fachlich beendet, nicht nur „Baseline aktualisieren". Ein erneutes
      // „Speichern" aus dem jetzt frischen Formular heraus legt bewusst einen
      // NEUEN Entwurf an (POST), nicht ein PATCH auf den soeben gespeicherten
      // — resetToFreshShipment() setzt resumeSource deshalb auf null.
      resetToFreshShipment();
      setSaving(false);
      return { ok: true };
    } catch {
      if (mountedRef.current) { setSaveMode("error"); setSaving(false); }
      return { ok: false };
    }
  };

  // Aufrufer 1 — Verlassen-Dialog: nach Erfolg die pausierte Navigation ausführen.
  const saveDraftAndLeave = async () => { const res = await saveCurrentFormDraft(); if (res.ok) runPendingLeave(); };
  // Aufrufer 2 — sichtbarer Button: nach Erfolg im Formular bleiben + Inline-Hinweis.
  const saveDraftExplicit = async () => { const res = await saveCurrentFormDraft(); if (res.ok && mountedRef.current) setSaveStatus("saved"); };

  const discardAndLeave = () => { if (!saving) runPendingLeave(); };                       // ohne API, genau einmal
  const continueEditing = () => { if (!saving) { setPendingTarget(null); setSaveMode("idle"); } };

  // „Aktuelle Version laden" (Konflikt) — dieselbe Logik für BEIDE Oberflächen:
  // bewusster Detail-GET → rehydrieren, Ergebnis-State leeren, ID/Revision +
  // Baseline aktualisieren, Dirty=false; danach im Formular BLEIBEN (Dialog schließt,
  // falls offen; harmlos wenn geschlossen). Keine Navigation.
  const reloadCurrentDraft = async () => {
    if (saving || !resumeSource?.id) return;
    setSaving(true);
    try {
      const r = await getFormDraft(resumeSource.id);
      if (!mountedRef.current) return;
      if (r.status === 401 || r.status === 403) { setSaving(false); return; }
      if (r.status === 404) { setResumeSource(null); setSaveMode("notFound"); setSaving(false); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!mountedRef.current) return;
      const payload = buildResumePayload(d?.draft);
      if (!r.ok || !isValidResumeDraft(payload)) throw new Error("reload failed");
      // TG22 Paket B: Berliner Geschäftstag, und kein Ersatzdatum für ein vergangenes Entwurfsdatum.
      const init = buildResumeInitialState(payload.formData, { today: businessTodayISO() });
      const nextDate = init.shippingDate;
      setResumeNotice(init.shippingDateExpired ? RESUME_PAST_DATE_NOTICE : "");
      setModeResetNotice(init.shippingModeReset ? RESUME_ECONOMY_FILTER_NOTICE : "");
      setForm(init.form);
      setShippingDate(nextDate);
      setServiceFilter(init.serviceFilter);
      setShippingModeFilter(init.shippingModeFilter);
      setSelectedPublicCarrierIds(init.selectedPublicCarrierIds);
      setInventoryContext(init.inventoryContext); // Audit-Finding 1/3: Lagerbezug + Hinweis folgen der geladenen Version
      resetResults();
      setResumeSource(resumeSourceFromDraft(payload));
      setBaseline(getShipmentFormSnapshot({
        form: init.form, shippingDate: nextDate, serviceFilter: init.serviceFilter,
        shippingModeFilter: init.shippingModeFilter, selectedPublicCarrierIds: init.selectedPublicCarrierIds,
        inventoryContext: init.inventoryContext,
      }));
      setSaving(false);
      setSaveMode("idle"); setSaveStatus("idle");
      setPendingTarget(null); // im Formular bleiben — keine Navigation
    } catch {
      if (mountedRef.current) { setSaveMode("error"); setSaving(false); }
    }
  };

  // ── Ableitungen für die sichtbare „Als Entwurf speichern"-Aktion ────────────
  // Aktiv nur bei fachlicher, ungespeicherter Änderung (isDirty) und keinem
  // laufenden Save/Preisrequest. Leeres Formular, reine Defaults und ein
  // unveränderter fortgesetzter Entwurf → deaktiviert (kein unnötiger POST/PATCH).
  const canExplicitSave = isDirty && !saving && !loading;
  const explicitSaveHint = saving ? null
    : !isDirty
      ? (hasMeaningfulShipmentInput(ohneStandardAbsender(currentSnapshot), baseline) ? "Keine ungespeicherten Änderungen." : "Gib zuerst Sendungsdaten ein.")
      : null;
  // Inline-Feedback nur außerhalb des Verlassen-Dialogs — der Dialog zeigt seinen
  // eigenen Zustand, sodass jeder Save-Zustand an GENAU einer Stelle erscheint.
  const showInlineSave = !pendingTarget;

  /* ── Eingaben bewusst zurücksetzen ───────────────────────────────────────
     Der temporäre Vorgang bleibt bei Sidebar-Wechsel, Zurück, Vorwärts und
     Reload absichtlich stehen. Es braucht deshalb GENAU EINEN sichtbaren Weg,
     ihn bewusst zu beenden — sekundär, nie als Hauptaktion, und mit Rückfrage,
     sobald tatsächlich etwas verloren ginge. */
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const hatVerwerfbaresEingegeben = hasResults || tariffs.length > 0
    || hasMeaningfulShipmentInput(ohneStandardAbsender(currentSnapshot), baseline);

  const applyReset = () => {
    setResetConfirmOpen(false);
    resetToFreshShipment();
    setSaveStatus("idle");
    window.scrollTo(0, 0);
  };

  const requestReset = () => {
    if (hatVerwerfbaresEingegeben) { setResetConfirmOpen(true); return; }
    applyReset();   // nichts zu verlieren → keine Rückfrage
  };

  // `filtered` ist vollständig aus tariffs + den reinen Client-Filtern
  // (max_price, späteste Lieferzeit) ableitbar → als useMemo statt State +
  // useEffect + setFiltered. Das spart pro Filteränderung (v. a. Preis-Slider)
  // den zusätzlichen zweiten Render (setFiltered). Filterbedingungen und
  // Reihenfolge sind unverändert; tariffs wird nie mutiert (Kopie via Spread).
  const filtered = useMemo(
    // EINE Regel, importiert statt kopiert (utils/offersFilterView.mjs). Rein
    // clientseitig: kein Recalc, kein /calculate-price-Request — weder beim
    // Datum noch bei der Uhrzeit (beide stehen in FILTER_ONLY_FIELDS).
    () => applyResultFilters(tariffs, {
      maxPrice: form.max_price,
      latestDeliveryDate: form.latestDeliveryDate,
      latestDeliveryTime: form.latestDeliveryTime,
    }),
    [tariffs, form.max_price, form.latestDeliveryDate, form.latestDeliveryTime]);

  // Wählbare Fristen = allgemeines Raster + die tatsächlich geladenen
  // Tarifzeiten. Vor der ersten Berechnung ist `tariffs` leer und es bleibt das
  // Raster — der Kunde kann seine späteste Uhrzeit also nennen, BEVOR er
  // Angebote sieht. Weil das Raster auch danach Teil der Menge bleibt,
  // überlebt eine vorab gewählte Frist die Ankunft der Tarife.
  //
  // Bewusst aus `tariffs`, nicht aus `filtered`: sonst entfernte die eigene
  // Auswahl gerade die Option, mit der man sie wieder lockern wollte. Die
  // Werte stehen in `deliveryTimeView.mjs`, nicht hier.
  const zeitOptionen = useMemo(() => deliveryDeadlineOptions(tariffs), [tariffs]);

  const sorted = React.useMemo(() => sortiereAngebote(filtered, sortMode), [filtered, sortMode]);

  // TG-L2: die zu späten Angebote — eingeklappt in der Gruppe „Zu spät", sortiert wie die sichtbare Liste.
  // Dieselbe Regel wie `filtered` (utils/offersFilterView.mjs), rein clientseitig, kein Request.
  const spaet = useMemo(
    () => sortiereAngebote(lateResultOffers(tariffs, {
      maxPrice: form.max_price,
      latestDeliveryDate: form.latestDeliveryDate,
      latestDeliveryTime: form.latestDeliveryTime,
    }), sortMode),
    [tariffs, form.max_price, form.latestDeliveryDate, form.latestDeliveryTime, sortMode]);

  // TG-L2: fällt die Auswahl durch eine neue Frist in die eingeklappte Gruppe „Zu spät", wird sie gelöst — eine
  // markierte Karte, die man nicht sieht, wäre eine Buchung ins Ungewisse. Nur bei einer Änderung der Frist: wer „Zu
  // spät" aufklappt und dort bewusst wählt, behält seine Wahl.
  useEffect(() => {
    if (!form.latestDeliveryDate) return;
    const frist = { latestDeliveryDate: form.latestDeliveryDate, latestDeliveryTime: form.latestDeliveryTime };
    setSelected((vorher) => (vorher && deliveryDeadlineAssessment(vorher, frist) === DELIVERY_DEADLINE.TOO_LATE
      ? null : vorher));
  }, [form.latestDeliveryDate, form.latestDeliveryTime]);

  const handleServiceFilter = (id) => { setServiceFilter(id); setServiceFilterOpen(false); resetResults(); };
  const handleShippingMode  = (id) => { setShippingModeFilter(id); setShippingModeOpen(false); setModeResetNotice(""); resetResults(); };
  const handleDateChange    = (iso) => {
    if (!iso || iso < todayISO()) return;
    setShippingDate(iso); setDatePickerOpen(false);
    // TG22 Paket B: mit einem gewählten Datum ist der Hinweis auf das abgelaufene Entwurfsdatum erledigt.
    if (resumeNotice === RESUME_PAST_DATE_NOTICE) setResumeNotice("");
    if (error === DATUM_FEHLT_HINWEIS) setError("");
    // Späteste Lieferzeit darf nie vor dem Versanddatum liegen → ungültige
    // Auswahl beim Vorziehen des Versanddatums verwerfen.
    if (form.latestDeliveryDate && form.latestDeliveryDate < iso) {
      upd("latestDeliveryDate", "");
      upd("latestDeliveryTime", "");   // keine verwaiste Uhrzeit ohne Datum
    }
    resetResults();
  };

  // Auswahl im „Späteste Lieferzeit"-Kalender (reiner Client-Filter, kein Recalc).
  //
  // Eine Uhrzeit ohne Datum ergibt keinen Zeitpunkt und wäre ein Filter, der
  // nichts filtern kann — deshalb räumt JEDES Leeren des Datums die Uhrzeit
  // zwingend mit ab. Es gibt bewusst keinen Pfad, auf dem eine verwaiste
  // Uhrzeit stehen bleibt: dieselbe Funktion trägt Kalenderauswahl UND
  // „Beliebig".
  //
  // Das Popover schließt hier NICHT mehr automatisch: erst mit einem gesetzten
  // Datum wird die optionale Uhrzeitzeile darunter bedienbar, und ein sofortiges
  // Schließen hätte sie unerreichbar gemacht. Geschlossen wird über die Uhrzeit,
  // „Beliebig", Escape, einen Klick nach außen oder den Auslöser selbst.
  const handleLatestDeliveryChange = (iso) => {
    upd("latestDeliveryDate", iso || "");
    if (!iso) { upd("latestDeliveryTime", ""); setLatestOpen(false); }
  };

  // Uhrzeitauswahl — reiner Anzeigefilter auf den bereits geladenen Tarifen.
  const handleLatestDeliveryTimeChange = (zeit) => {
    upd("latestDeliveryTime", zeit || "");
    setLatestOpen(false);
  };

  // Live-Schlüssel der Payload-bestimmenden Eingaben (bewusst OHNE die reinen
  // Client-Filter max_price/latestDeliveryDate — diese lösen keinen Recalc aus
  // und dürfen eine laufende Antwort nicht verwerfen). Bei jedem Render gesetzt.
  calcKeyRef.current = JSON.stringify({
    packageCount: form.packageCount, weight: form.weight,
    length: form.length, width: form.width, height: form.height,
    s: [form.s_company, form.s_fullName, form.s_street, form.s_addition, form.s_zip, form.s_city, form.s_country, form.s_phone, form.s_email],
    r: [form.r_company, form.r_fullName, form.r_street, form.r_addition, form.r_zip, form.r_city, form.r_country, form.r_phone, form.r_email],
    serviceFilter, shippingModeFilter, shippingDate, publicCarrierIds: selectedPublicCarrierIds,
    // Die Sendungsangaben sind PREISBESTIMMEND und gehoeren deshalb in den
    // Schluessel: aendert der Kunde Inhalt oder Warenwert, gelten die
    // vorhandenen Angebote nicht mehr, und eine noch laufende Antwort darf nicht mehr
    // uebernommen werden. Die reinen Anzeigefilter bleiben unveraendert draussen.
    // Die Art der Lieferadresse gehoert NICHT hierher: sie wird erst nach der
    // Angebotsauswahl auf der Buchungsseite gefragt und aendert keine Angebotsliste.
    declarations: [form.declaredContent, form.declaredGoodsValue],
    // Weitere Paketzeilen (Canonical v2.79) — leer, solange es nur eine Zeile gibt.
    pakete: hasExtraPackageLines(form) ? packageLinesKey(form) : "",
  });

  const calculate = async () => {
    // Genau EIN Preisrequest je Nutzeraktion: schnelle Mehrfachklicks laufen sonst
    // alle vor dem nächsten Render los (der `loading`-State ist dann in jedem
    // Closure noch false) und erzeugen parallele Anfragen.
    if (calcInFlight.current) return;
    // Unveränderte Eingaben → die vorhandenen Angebote gelten weiter. Kein
    // zweiter /calculate-price, kein zweites JUMiNGO-Shipment, keine 2 Sekunden
    // Wartezeit für ein Ergebnis, das bereits auf dem Schirm steht.
    //
    // Der Vergleich läuft über denselben `calcKeyRef`, der auch veraltete
    // Antworten verwirft: er enthält AUSSCHLIESSLICH preisbestimmende Größen
    // (Paket, Absender, Empfänger, Versanddatum, Service-/Modusfilter,
    // Carrierauswahl) und bewusst NICHT die reinen Anzeigefilter. Ändert sich
    // eines dieser Felder, ruft `upd` bereits `invalidateResults()` — dann sind
    // `hasResults`/`tariffs` leer und dieser Zweig greift gar nicht erst.
    //
    // Zwei Fälle sind ausgenommen und MÜSSEN neu rechnen:
    //   • ein fortzusetzender Formularentwurf (`resumeSource`) — der Request
    //     verbraucht ihn serverseitig; ein übersprungener Aufruf ließe ihn stehen.
    //   • ein Lagerbezug (`inventoryContext`), der im Schlüssel nicht vorkommt.
    if (
      !resumeSource && !inventoryContext &&
      hasResults && tariffs.length > 0 &&
      lastCalcKeyRef.current !== "" && lastCalcKeyRef.current === calcKeyRef.current
    ) {
      setError("");
      // Der Knopf darf nicht tot wirken. Es wird NICHTS neu berechnet, nichts
      // sortiert und nichts zurückgesetzt — der bereits gültige Angebotsbereich
      // rückt lediglich ins Bild. Begründung und Motion-Regel stehen in
      // `utils/revealOffers.mjs`.
      revealOffers(offersRef.current);
      return;
    }
    setHasResults(false); setTariffs([]);
    lastCalcKeyRef.current = "";
    // Ungültige oder fehlende Angaben: KEIN Request. Alle Pflichtfelder zeigen ihren Fehler
    // (submitted), der Sammeltext nennt die Zahl, und nach dem Rendern springt der Fokus sanft
    // auf das oberste Fehlerfeld. TG22 Paket B: ohne Versanddatum wird nicht gerechnet — kein
    // Ersatzdatum; das Datum ist dabei ein Feld wie jedes andere.
    const errs = datumFehlt ? { shippingDate: DATUM_FEHLT_HINWEIS, ...getErrors(form) } : getErrors(form);
    const anzahl = Object.keys(errs).length;
    if (anzahl > 0) {
      setSubmitted(true);
      setError(anzahl === 1 && errs.shippingDate ? DATUM_FEHLT_HINWEIS : summaryMessage(anzahl));
      requestFocus(firstShipmentErrorField(errs));
      return;
    }
    setServerErrors({});
    calcInFlight.current = true;   // erst NACH der Validierung: ein abgelehnter Klick blockiert nichts
    // Betreiberentscheidung 2026-10-02: jede ECHTE neue Preisberechnung startet in Netto. Erst hier — nach
    // der Validierung, unmittelbar vor dem Request. Der Einblende-Zweig oben rechnet nicht neu und behält
    // die Wahl des Kunden; ein abgelehnter Klick ändert sie ebenfalls nicht.
    setVatMode("net");
    setError(""); setProfileIncomplete(false); setLoading(true); setSelected(null);
    setResumeNotice(""); setResumeConflict(false);
    // Ein früheres Auflösungsergebnis gehört zur vorigen Liste. Eine noch offene Absicht bleibt
    // stehen, bis eine Berechnung tatsächlich Angebote liefert.
    setCalculatorIntentResolution(null);
    // Preisberechnung ist nicht „Draft speichern": den Inline-Erfolgshinweis
    // neutralisieren (nach consumed:true existiert der Draft ohnehin nicht mehr).
    setSaveStatus("idle");

    // Race-Schutz: diesen Aufruf als neuesten markieren, laufenden Request
    // abbrechen und die aktuellen Eingaben als Referenz festhalten.
    const seq    = ++calcSeq.current;
    const reqKey = calcKeyRef.current;
    // Fortsetzen: Übergangs-Metadaten dieses Aufrufs festhalten (einmalig; werden
    // NUR bei einem fortgesetzten Formularentwurf mitgesendet).
    const sourceAtSend = resumeSource;
    if (calcAbort.current) calcAbort.current.abort();
    const ac = new AbortController();
    calcAbort.current = ac;

    try {
      const r = await apiFetch(`/api/jumingo/calculate-price`, {
        // 75 s statt der 30-s-Vorgabe: der Server fragt für die Tarifliste die Anbieter
        // mit eigenen Fristen an (ein voller Anbieterquote darf bis 55 s laufen) — der
        // Browser muss danach noch auf die Antwort warten können.
        method: "POST", auth: true, signal: ac.signal, timeoutMs: 75000,
        body: JSON.stringify({
          // Genau die eingegebenen Werte — kein Ersatzwert. Hier stand bis zu
          // diesem Paket `Number(form.length) || 30` (und 20/15): `Number("")`
          // ist 0 und damit falsy, ein leeres Feld wurde also zu 30 cm. Der
          // Kunde bekam einen Preis für Maße, die er nie eingegeben hat.
          // `shipmentPackagePayload()` liefert null, sobald etwas fehlt — dieser Zweig
          // ist dann durch getErrors() oben ohnehin schon abgebrochen. Eine Paketart geht
          // flach wie bisher, unterschiedliche Pakete als `packageLines` (Canonical v2.79).
          ...shipmentPackagePayload(form),
          sender:             buildParty("s"),
          recipient:          buildParty("r"),
          serviceFilter:      serviceFilter,
          shippingModeFilter: shippingModeFilter,
          shippingDate:       shippingDate,
          publicCarrierIds:   selectedPublicCarrierIds,
          // Die vier Sendungsangaben. Sie entstehen nur vollstaendig oder gar nicht —
          // `declarationsPayload` liefert `null`, solange etwas fehlt, und dieser Zweig
          // ist dann durch `getErrors()` oben ohnehin schon abgebrochen. Der Server
          // friert sie an der Entwurfszeile ein; der Buchungspfad liest sie von dort.
          declarations:       declarationsPayload(form),
          // Optionaler Lagerbezug: nur vorhanden, wenn der Vorgang aus Artikel
          // oder Auftrag gestartet wurde. Bei jeder normalen Sendung fehlt das
          // Feld vollständig — der Server erkennt daran „kein Lagerbezug" und
          // löst keine einzige Bestandsabfrage aus.
          ...(inventoryContext ? { inventory: inventoryContext } : {}),
          // Fortsetzen: Source-Felder AUSSCHLIESSLICH aus der geladenen Detail-
          // response (resumeSource) — nie aus URL-Parametern oder Form-State.
          ...(sourceAtSend ? { sourceFormDraftId: sourceAtSend.id, sourceFormDraftRevision: sourceAtSend.revision } : {}),
        })
      });
      if (seq !== calcSeq.current) return;                              // durch neueren Aufruf ersetzt
      // Session ungültig/abgelaufen (Backend-Auth-Guard): apiFetch(auth:true) hat den
      // Token entfernt und den zentralen Auth-Redirect (AuthContext) bereits ausgelöst
      // → hier nur sauber aussteigen (kein irreführender Preisfehler, kein hängendes Loading).
      if (r.status === 401 || r.status === 403) { setLoading(false); return; }
      const d = await r.json();
      if (seq !== calcSeq.current) return;                              // während des Parsens ersetzt
      if (reqKey !== calcKeyRef.current) { setLoading(false); return; } // Eingaben geändert → verwerfen

      // Fortsetzen — Start-Konflikte des Übergangs (nur wenn Source mitgesendet):
      // FORM_DRAFT_CONFLICT / FORM_DRAFT_NOT_FOUND / FORM_DRAFT_CONVERSION_IN_PROGRESS.
      // Niemals automatisch erneut senden.
      if (!r.ok) {
        const startErr = sourceAtSend ? mapFormDraftStartError(d?.code) : null;
        if (startErr) {
          if (startErr.clearsSource) setResumeSource(null);          // NOT_FOUND → nächster Versuch = normal
          if (startErr.kind === "conflict") setResumeConflict(true); // „Aktuelle Version laden" anbieten
          else if (startErr.kind === "notFound") setResumeNotice(startErr.message);
          else setError(startErr.message);                           // CONVERSION_IN_PROGRESS → Hinweis am CTA
          fokusNachVergleich("ausloeser");
          setLoading(false);
          return;
        }
        // Alle übrigen Ablehnungen laufen über den zentralen Normalizer: er liest
        // `error` UND `message`, wertet `code` und `field` aus und trennt
        // Eingabefehler von Geschäftsfällen und technischen Störungen. Trägt die
        // Antwort ein Feld, wird es markiert und angesprungen — statt nur einen
        // Sammeltext am Button zu zeigen.
        const norm = normalizeApiError({ status: r.status, body: d, fieldMap: SHIPMENT_FIELD_MAP });
        if (norm.field) {
          setServerErrors((prev) => ({ ...prev, [norm.field]: norm.fieldMessage || norm.message }));
        }
        // Angesprungen wird das Feld (sonst der Knopf) erst nach dem Laden — bis
        // dahin ist der Seiteninhalt inert, ein Fokus jetzt liefe ins Leere.
        fokusNachVergleich(norm.field ? "feld" : "ausloeser", norm.field);
        // TG22 Paket B: 422 BUSINESS_PROFILE_INCOMPLETE ist keine abgelaufene Sitzung — der Kunde
        // bleibt angemeldet und bekommt den direkten Weg ins Unternehmensprofil.
        setProfileIncomplete(norm.code === "BUSINESS_PROFILE_INCOMPLETE");
        setError(norm.message);
        setLoading(false);
        return;
      }

      // Fortsetzen — Übergang nach dem calculate-price.
      if (sourceAtSend) {
        const t = classifyFormDraftTransition(d.formDraftTransition);
        // Hat der Server den Entwurf verbraucht, ist die Source-ID aufgebraucht:
        // ein erneutes Senden träfe zwangsläufig FORM_DRAFT_NOT_FOUND und würde
        // einen weiteren Klick verschlucken. Das gilt auch dann, wenn der Guard
        // unten anschließend blockiert — deshalb VOR dem Guard lösen.
        if (t.consumed) setResumeSource(null);
        // Sicherheits-Guard: ohne verlässliche Sendungsgrundlage KEINE buchbaren
        // Angebote zeigen. Maßgeblich ist das serverseitige Signal
        // (shipment_persistence_failed); ergänzend muss die LOKALE Sendung
        // (ceShipmentId = shipments.id) existieren — an ihr hängen alle Angebote,
        // unabhängig vom Anbieter. Eine Providerreferenz kennt der Client nicht.
        // Source-Metadaten bleiben bei blockiertem, NICHT verbrauchtem Entwurf
        // erhalten, damit ein bewusster erneuter Klick den Übergang neu versucht
        // (keine automatische Wiederholung).
        if (t.blocking || !hasSavableShipmentId(d.ceShipmentId)) {
          setError(SHIPMENT_PERSISTENCE_FAILED_MESSAGE);
          fokusNachVergleich("ausloeser");
          setLoading(false);
          return;
        }
        // Fachlich erfolgreiche Preisberechnung mit gültiger interner Shipment-ID:
        // Source-Verknüpfung lokal deaktivieren → ein erneuter „Preise berechnen"
        // sendet keine alte Source-ID mehr (kein Doppel-Draft, kein Re-Consume).
        setResumeSource(null);
        if (t.notice) setResumeNotice(t.notice); // revision_changed / cleanup_failed (nicht blockierend)
      }

      // Öffentliche Carrier-Liste (deduplziert vom Backend) übernehmen; die
      // bestehende Auswahl bleibt erhalten, auf noch verfügbare IDs gefiltert.
      const newPublicCarriers = Array.isArray(d.publicCarriers) ? d.publicCarriers : [];
      setPublicCarriers(newPublicCarriers);
      if (newPublicCarriers.length > 0) {
        const validIds = new Set(newPublicCarriers.map(pc => pc.id));
        setSelectedPublicCarrierIds(prev => prev.filter(id => validIds.has(id)));
      }
      // Jedes gelieferte Angebot erscheint (Betreiberentscheidung 2026-10-02: kein Angebot wird wegen
      // eines konkurrierenden Providerpreises verborgen). Was angeboten wird, entscheidet der Server.
      setTariffs(Array.isArray(d.tariffs) ? d.tariffs : []);
      // Auftrag 2 / P5 (C6): sagt der Server, dass eine Einkaufsquelle ausgefallen ist, steht der
      // Hinweis über der Liste — die gelieferten Angebote bleiben, nichts wird wiederholt.
      setCoverageNotice(sourceCoverageNotice(d));
      setCeShipmentId(d.ceShipmentId ?? null);
      // Angebotsabsicht aus dem Preisrechner: genau EINMAL gegen diese frische, vollständig
      // berechnete Liste auflösen. Ausgewählt wird nur ein eindeutig identisches, auswählbares
      // Angebot — mit seinem NEUEN Serverpreis. Sonst nichts, und der Hinweis sagt es.
      if (calculatorIntent) {
        const aufloesung = resolveCalculatorIntent(d.tariffs, calculatorIntent);
        if (aufloesung && aufloesung.offer) setSelected(aufloesung.offer);
        setCalculatorIntentResolution(aufloesung);
        setCalculatorIntent(null);
      }
      // Gesamtauftrag B: eine neue Angebotsliste trägt keine alte Bestätigung. Eine gemerkte Auswahl mit Firmenpflicht
      // wird GENAU hier aufgelöst: dasselbe Produkt (productKey), genau ein auswählbarer Treffer, der nicht mehr auf
      // einen Firmennamen wartet — dann ist er ausgewählt, und sein Bestätigungsfeld bekommt nach dem Laden den Fokus.
      // Sonst ein ehrlicher Hinweis; ein ähnliches Angebot wird nie gewählt.
      setFirmenBestaetigt({});
      setFirmenBestaetigungFehlt(null);
      let firmenFokusId = null;
      const firmenAbsicht = firmenAbsichtRef.current;
      firmenAbsichtRef.current = null;
      if (firmenAbsicht) {
        const liste = Array.isArray(d.tariffs) ? d.tariffs : [];
        const treffer = firmenAbsicht.productKey ? liste.filter((x) => x && x.productKey === firmenAbsicht.productKey) : [];
        const angebot = treffer.length === 1 && offerSelectable(treffer[0]) && !offerAwaitsBusinessDetails(treffer[0])
          && !offerAwaitsCustomerCorrection(treffer[0]) ? treffer[0] : null;
        if (angebot) {
          setSelected(angebot);
          setFirmenHinweis("");
          if (firmenAbsicht.sender || firmenAbsicht.recipient) firmenFokusId = offerBusinessConfirmId(angebot);
        } else {
          setFirmenHinweis(OFFER_BUSINESS_NOT_FOUND_NOTICE);
        }
      } else {
        setFirmenHinweis("");
      }
      // Zoll-Felder additiv übernehmen (Backend entscheidet customsRequired).
      setCustoms({
        customsRequired:   d.customsRequired === true,
        fromCountryCode:   d.fromCountryCode ?? null,
        toCountryCode:     d.toCountryCode ?? null,
        exportDeclaration: d.exportDeclaration ?? null,
      });
      calculatedAtRef.current = Date.now();      // Ablauffrist des Vorgangs beginnt jetzt
      // Erst JETZT gilt der Schlüssel als berechnet: `reqKey` ist der Stand beim
      // ABSENDEN, nicht der aktuelle — eine zwischenzeitliche Eingabe hätte den
      // Request oben bereits verworfen.
      lastCalcKeyRef.current = reqKey;
      // Alle Angebote erscheinen gemeinsam; danach rückt der Bereich ins Bild
      // und der Fokus geht auf die Ergebniszeile (erst nach dem Laden) — nach einer geführten Ergänzung des
      // Firmennamens auf das Bestätigungsfeld des wiedergefundenen Angebots (fehlt es, wie bisher).
      if (firmenFokusId) fokusNachVergleich("element", firmenFokusId);
      else fokusNachVergleich("angebote");
      setHasResults(true);
      setLoading(false);
    } catch (e) {
      if (e?.name === "AbortError") return;      // abgebrochen (neuer Request/Unmount) → kein Fehler, Loading gehört dem neuen Request
      if (seq !== calcSeq.current) return;       // veralteter Request → ignorieren
      // Nur noch echte Ausnahmen (Verbindungsabbruch, unlesbare Antwort) — die
      // fachlichen Ablehnungen sind oben behandelt. Kein roher Technikertext
      // („Failed to fetch") mehr im Kundenbanner.
      setError(normalizeThrownError(e).message);
      fokusNachVergleich("ausloeser");
      setLoading(false);
    } finally {
      // Genau hier — und nur hier — wird der nächste Klick wieder freigegeben.
      // `finally` deckt auch die frühen Returns im try-Block ab (veralteter
      // Request, 401/403, Übergangsfehler), sodass der CTA nie dauerhaft blockiert.
      calcInFlight.current = false;
    }
  };

  // „Aktuelle Version laden" (nach 409 FORM_DRAFT_CONFLICT): den Snapshot bewusst
  // per Nutzerklick neu holen und Formular/Filter daraus ersetzen (keine stillen
  // Überschreibungen ohne Klick). Aktualisiert die Revision und verwirft alte
  // Ergebnisse — der Nutzer berechnet danach neu.
  const reloadFormDraft = async () => {
    if (!resumeSource?.id || reloadingResume) return;
    setReloadingResume(true);
    try {
      const r = await getFormDraft(resumeSource.id);
      if (!mountedRef.current) return;
      if (r.status === 401 || r.status === 403) { setReloadingResume(false); return; }
      if (r.status === 404) {
        setResumeSource(null); setResumeConflict(false);
        setResumeNotice("Dieser Entwurf ist nicht mehr verfügbar. Sie können die aktuellen Angaben als neue Sendung weiterverwenden.");
        setReloadingResume(false); return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!mountedRef.current) return;
      const payload = buildResumePayload(d?.draft);
      if (!r.ok || !isValidResumeDraft(payload)) throw new Error("Die aktuelle Version konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
      // TG22 Paket B: Berliner Geschäftstag, und kein Ersatzdatum für ein vergangenes Entwurfsdatum.
      const init = buildResumeInitialState(payload.formData, { today: businessTodayISO() });
      setForm(init.form);
      setShippingDate(init.shippingDate);
      setServiceFilter(init.serviceFilter);
      setShippingModeFilter(init.shippingModeFilter);
      setSelectedPublicCarrierIds(init.selectedPublicCarrierIds);
      setInventoryContext(init.inventoryContext); // Audit-Finding 1/3: Lagerbezug + Hinweis folgen der geladenen Version
      resetResults();                                  // frische Grundlage → alte Ergebnisse verwerfen
      setResumeSource(resumeSourceFromDraft(payload)); // aktualisierte Revision
      setResumeConflict(false); setResumeNotice(init.shippingDateExpired ? RESUME_PAST_DATE_NOTICE : "");
      setModeResetNotice(init.shippingModeReset ? RESUME_ECONOMY_FILTER_NOTICE : "");
    } catch (e) {
      if (mountedRef.current) setError(e?.message || "Die aktuelle Version konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
    }
    if (mountedRef.current) setReloadingResume(false);
  };

  // useCallback mit vollständigen Dependencies: Der Buchungs-Payload (tariff,
  // ceShipmentId, form, customs) bleibt exakt gleich; die Referenz ist nur stabil,
  // solange sich diese Werte nicht ändern → memoisierte OfferCards rendern durch
  // onBook nicht unnötig neu (bei reinen Angebots-Interaktionen ändern sie sich
  // nicht). setSelected ist als State-Setter stabil.
  // Gesamtauftrag B: das Bestätigungsfeld einer Karte. Stabil (keine Abhängigkeit), damit die memoisierten Karten
  // durch den Rückruf nicht neu rendern; neu rendert nur die Karte, deren Wahrheitswert sich ändert.
  const handleBusinessConfirm = useCallback((tariff, checked) => {
    const k = offerKey(tariff);
    if (!k) return;
    setFirmenBestaetigt((p) => {
      const n = { ...p };
      if (checked) n[k] = true; else delete n[k];
      return n;
    });
    if (checked) setFirmenBestaetigungFehlt((f) => (f === k ? null : f));
  }, []);

  const handleBook = useCallback((tariff) => {
    // Betreiberentscheidung 2026-10-26: eine kundenlösbare Korrektur (zu lange Adressangabe, fehlender Inhalt) — die
    // Karte ist auswählbar; die Seite führt zum betroffenen Feld (genauer Hinweis dort), merkt die Auswahl und setzt nach
    // der Korrektur mit genau einem neuen Vergleich fort. Gebucht wird erst, wenn der Server das Angebot buchbar nennt.
    const korrektur = offerCustomerCorrection(tariff);
    if (korrektur) {
      setSelected(tariff);
      firmenAbsichtRef.current = {
        productKey: typeof tariff.productKey === "string" ? tariff.productKey : null,
        sender: false, recipient: false, korrektur: true, feld: korrektur.field,
        ausgangswert: korrektur.field ? String(form[korrektur.field] ?? "") : null, vergleichGestartet: false,
      };
      if (korrektur.field) {
        setFirmenHinweis("");
        setServerErrors((p) => ({ ...p, [korrektur.field]: korrektur.message }));
        setFocusRequest({ field: korrektur.field, at: Date.now() });
      } else {
        setFirmenHinweis(korrektur.message);
      }
      return;
    }
    // Gesamtauftrag B: Firmenpflicht — erst der Firmenname, dann die Bestätigung, dann unverändert weiter. Fehlt der
    // Name, steht die Meldung genau an diesem Feld (Serverfehlerweg), das Feld kommt weich ins Bild und bekommt den
    // Fokus, und die Auswahl wird gemerkt. Der Server bleibt die Autorität: /book prüft unverändert.
    const pflicht = offerBusinessRequirement(tariff);
    if (pflicht.party) {
      const fehltAbsender = pflicht.sender && !String(form.s_company || "").trim();
      const fehltEmpfaenger = pflicht.recipient && !String(form.r_company || "").trim();
      if (fehltAbsender || fehltEmpfaenger) {
        setSelected(tariff);
        firmenAbsichtRef.current = {
          productKey: typeof tariff.productKey === "string" ? tariff.productKey : null,
          sender: pflicht.sender, recipient: pflicht.recipient, vergleichGestartet: false,
        };
        setFirmenHinweis("");
        setServerErrors((p) => ({
          ...p,
          ...(fehltAbsender ? { s_company: OFFER_BUSINESS_COMPANY_FIELD_MESSAGE.sender } : {}),
          ...(fehltEmpfaenger ? { r_company: OFFER_BUSINESS_COMPANY_FIELD_MESSAGE.recipient } : {}),
        }));
        setFocusRequest({ field: fehltAbsender ? "s_company" : "r_company", at: Date.now() });
        return;
      }
      const k = offerKey(tariff);
      if (!k || firmenBestaetigtRef.current[k] !== true) {
        setSelected(tariff);
        setFirmenBestaetigungFehlt(k);
        setBestaetigungsFokus({ id: offerBusinessConfirmId(tariff), at: Date.now() });
        return;
      }
    }
    firmenAbsichtRef.current = null;
    setSelected(tariff);
    if (authed) {
      // Vorgang festhalten, BEVOR der Teilbaum abgehängt wird: Auswahl,
      // Schritt und Scrollposition. Ohne diesen Schritt käme der Kunde zwar
      // mit Formular und Angeboten zurück, aber ganz oben und ohne Markierung.
      setFlowScope("shipment", { selected: tariff, scrollY: Math.round(window.scrollY || 0) });
      setFlowStep("booking");
      // `state` bleibt unverändert erhalten (Kompatibilität + Browser-Vorwärts).
      // Es werden KEINE zusätzlichen personenbezogenen Daten in weitere
      // History-Einträge kopiert — der Vorgang selbst trägt der Context.
      //
      // Der frühere Marker `fromFlow` ist entfallen: er steuerte ein
      // `navigate(-1)` im sichtbaren Zurück-Button der Buchungsseite. Dieser
      // Button navigiert jetzt gezielt und braucht keine Aussage mehr über den
      // vorherigen History-Eintrag.
      //
      // Push oder Replace? Beim ERSTEN Weg in die Buchung wird gepusht — sonst
      // übersprünge ein Browser-Zurück den Angebotsvergleich. Kommt der Kunde
      // dagegen gerade von dort zurück (der sichtbare Zurück-Button hinterlässt
      // `returnTarget: "offers"` im aktuellen Eintrag), wird ERSETZT. Sonst
      // wüchse die History bei jedem Wechsel Angebote ↔ Buchung um einen
      // Eintrag — genau der Kreislauf, der vermieden werden soll.
      const ausRueckkehr = typeof window !== "undefined"
        && window.history.state?.usr?.returnTarget === "offers";
      navigate("/booking", { state: { tariff, ceShipmentId, form, customs }, replace: ausRueckkehr });
    } else {
      navigate("/login");
    }
  }, [authed, ceShipmentId, form, customs, navigate, setFlowScope, setFlowStep]);

  // Stabiles senderPrefill-Objekt (nur Paketshop-Suche bei Dropoff nutzt es) →
  // sonst bräche ein neues Objekt bei jedem Render den React.memo-Vergleich der
  // OfferCards. Werte 1:1 wie zuvor.
  const senderPrefill = useMemo(
    () => ({ postCode: form.s_zip, city: form.s_city, country: form.s_country, street: form.s_street }),
    [form.s_zip, form.s_city, form.s_country, form.s_street]
  );

  // ── Address field helpers ──
  // ── Adressvorschläge und -prüfung (Absender und Empfänger) ─────────────────
  // Ein Hook je Adresse. Er sendet ausschließlich Land, PLZ, Ort sowie Straße und
  // Hausnummer — Name, Firma, Zusatz, Telefon und E-Mail werden nie mitgeschickt. Für
  // Länder ohne Abdeckung und ohne eingerichteten Dienst bleibt der Ablauf unverändert:
  // der Hook meldet dann `unsupported` und zeigt gar nichts an.
  const senderCheck = useAddressValidation({
    country: form.s_country, postalCode: form.s_zip, city: form.s_city, street: form.s_street,
  });
  const recipientCheck = useAddressValidation({
    country: form.r_country, postalCode: form.r_zip, city: form.r_city, street: form.r_street,
  });

  // Genau EIN gefundener Ort wird als Vorschlag angeboten — aber nur, solange das Feld
  // leer ist. Ein bereits eingetragener (und gültiger) Ort wird NIE überschrieben: bei
  // mehreren Orten zu einer PLZ wäre das schlicht geraten.
  const autofillCity = (prefix, check) => {
    const key = `${prefix}_city`;
    if (check.cityOptions.length === 1 && !String(form[key] || "").trim()) {
      upd(key, check.cityOptions[0]);
    }
  };
  useEffect(() => { autofillCity("s", senderCheck); }, [senderCheck.cityOptions]);
  useEffect(() => { autofillCity("r", recipientCheck); }, [recipientCheck.cityOptions]);

  // Ein ausgewählter Vorschlag füllt Straße und Hausnummer, PLZ und Ort — sonst nichts.
  // Firma, Namen, Zusatz, Kontakt und Bundesstaat bleiben, wie sie sind; eine getippte
  // Hausnummer bleibt erhalten, wenn der Vorschlag keine nennt. Jede Übernahme läuft über
  // `upd` und verwirft damit ein bereits berechnetes Angebot wie jede andere Eingabe.
  const applyStreet = (prefix, suggestion, check) => {
    const patch = applyAddressSuggestion(
      { country: form[`${prefix}_country`], street: form[`${prefix}_street`] }, suggestion);
    if (!patch.street) return;
    check.markSelected(patch.street);
    upd(`${prefix}_street`, patch.street);
    if (patch.postalCode) upd(`${prefix}_zip`, patch.postalCode);
    if (patch.city) upd(`${prefix}_city`, patch.city);
  };

  // Die Adressprüfung sperrt die Preisberechnung nie — weder ein Hinweis noch ein Ausfall des
  // Dienstes darf jemanden am Versand hindern. Verbindlich bleiben allein die Formular- und
  // Buchungsprüfungen.

  /* ── Felder dieser Seite laufen über <Field /> mit schwebender Beschriftung ──
     Betreiberentscheidung Auftrag 1, P11 (2026-10-17): die Beschriftung steht bei leerem
     Feld IM Feldrahmen und wandert bei Fokus oder Eingabe nach oben (labelMode="floating";
     vorher seit dem Redesign 2026-10 gestapelt darüber). Keine Musterplatzhalter mehr
     („Musterstraße 1", erfundene Personen und Firmen) — ein Format, das wirklich hilft (PLZ),
     steht als Hinweiszeile unter dem Feld.

     <Field /> erzwingt `id` + `htmlFor`, `aria-invalid`, `aria-describedby` und
     `aria-required`; jedes Feld trägt `data-field` — das Ziel von focusFirstError().
     Beim Verlassen wird das Feld „berührt" und zeigt ab dann seinen eigenen Fehler.

     Autofill: Kontaktfelder tragen ihr Token mit Abschnitt (section-absender /
     section-empfaenger), damit der Browser Absender und Empfänger nicht vermischt. Straße
     und Ort sind Vorschlagsfelder ohne Browser-Autofill (AddressSuggestInput, P5). */
  const AUTOFILL_TOKEN = {
    company: "organization", firstName: "given-name", lastName: "family-name",
    addition: "address-line2", phone: "tel", email: "email", zip: "postal-code", country: "country",
  };
  const autofill = (p, key) => (AUTOFILL_TOKEN[key]
    ? `section-${p === "s" ? "absender" : "empfaenger"} ${AUTOFILL_TOKEN[key]}` : undefined);

  // Gesamtauftrag B: verlässt der Kunde ein ergänztes Firmenfeld und wartet eine Auswahl auf genau diesen Namen,
  // startet GENAU EIN neuer Vergleich (normaler Ladezustand). Ohne gemerkte Auswahl, mit noch fehlendem Namen oder
  // während eines laufenden Vergleichs geschieht nichts — „Angebote vergleichen" bleibt der normale Weg.
  // 2026-10-26: dasselbe für eine gemerkte Korrektur — verlässt der Kunde GENAU dieses Feld mit einem geänderten Wert.
  const firmenfeldVerlassen = (fk = null) => {
    const absicht = firmenAbsichtRef.current;
    if (!absicht || absicht.vergleichGestartet) return;
    // Ohne genanntes Feld (der Server nannte keine Einzelheit) startet kein Feld den Vergleich — „Angebote
    // vergleichen" bleibt der Weg.
    if (absicht.korrektur) {
      if (!absicht.feld || fk !== absicht.feld || String(form[absicht.feld] ?? "") === absicht.ausgangswert) return;
    } else if (fk !== null && !fk.endsWith("_company")) return;
    const fehlt = (absicht.sender && !String(form.s_company || "").trim())
      || (absicht.recipient && !String(form.r_company || "").trim());
    if (fehlt || loading || calcInFlight.current) return;
    absicht.vergleichGestartet = true;
    calculate();
  };

  const addrField = (p, key, label, type = "text", optional = false) => {
    const fk = `${p}_${key}`;
    return (
      <Field
        id={`ns-${p}-${key}`}
        fieldKey={fk}
        labelMode="floating"
        label={label}
        required={!optional}
        optional={optional}
        type={type}
        value={form[fk]}
        onChange={(v) => upd(fk, v)}
        onBlur={() => { markTouched(fk); firmenfeldVerlassen(fk); }}
        autoComplete={autofill(p, key)}
        error={errors[fk]}
        // Paket A: unter dem Telefonfeld steht, was an die Anbieter geht, sobald es von der Schreibweise
        // abweicht oder eine Durchwahl bei Paketshop- und GLS-Tarifen entfällt — nichts geschieht still.
        hint={key === "company" ? shippingLengthHint("company", form[fk]) || undefined
          : key === "phone" ? phoneTransmissionHint(form[fk]) || undefined : undefined}
      />
    );
  };

  // PLZ: das landesabhängige Format steht als Hinweiszeile unter dem Feld („Beispiel: 70173").
  // Im schwebenden Feld wäre ein Platzhalter erst nach dem Fokus sichtbar und läge dort, wo die
  // Beschriftung im Ruhezustand steht (Auftrag 1, P11; vorher Platzhalter, 2026-10-15).
  // Eingabemodus (PL/PT mit Bindestrich: Texttastatur, P5), Maximallänge und Validierung sind
  // unverändert.
  const zipField = (p) => {
    const fk = `${p}_zip`;
    const land = form[`${p}_country`];
    const hinweis = land && !isPostalCodeRequired(land) ? "Für dieses Land optional." : (postalCodeHint(land) || undefined);
    return (
      <Field
        id={`ns-${p}-zip`}
        fieldKey={fk}
        labelMode="floating"
        label="PLZ"
        required
        value={form[fk]}
        onChange={(v) => upd(fk, v)}
        onBlur={() => markTouched(fk)}
        autoComplete={autofill(p, "zip")}
        inputMode={postalCodeInputMode(land)}
        maxLength={postalCodeMaxLength()}
        error={errors[fk]}
        hint={hinweis}
      />
    );
  };

  // Absenderland: bei einem neuen Vorgang Deutschland (createEmptyShipmentForm, Auftrag 1, P11 —
  // der Launch-Scope erlaubt als Ursprung nur DE). Das Empfängerland startet leer und wird frei
  // gewählt. Ein fortgesetzter Entwurf behält sein gespeichertes Land. Die Auswahl bleibt
  // Pflicht (getErrors), die Optionslisten sind dieselben wie überall sonst.
  const countrySelect = (p) => (
    <Field
      id={`ns-${p}-country`}
      fieldKey={`${p}_country`}
      labelMode="floating"
      as="select"
      label="Land"
      required
      value={form[`${p}_country`]}
      onChange={(v) => upd(`${p}_country`, v)}
      onBlur={() => markTouched(`${p}_country`)}
      autoComplete={autofill(p, "country")}
      error={errors[`${p}_country`]}
    >
      <option value="">Land auswählen</option>
      {(p === "s" ? launchOriginCountries : launchCountries)
        .map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
    </Field>
  );

  // Bundesstaat/Provinz — erscheint AUSSCHLIESSLICH bei US- und CA-Zielen, weil der
  // Providervertrag ihn nur dort verlangt. Bei jedem anderen Land wird das Feld gar nicht
  // gerendert; nationale und europäische Sendungen sehen exakt dasselbe Formular wie bisher.
  // Auswahlfeld statt Freitext: gesendet wird der zweistellige Code, und eine ausgeschriebene
  // Eingabe („Kalifornien") würde providerseitig abgelehnt.
  const stateSelect = (p) => {
    if (!requiresState(form[`${p}_country`])) return null;
    return (
      <Field
        id={`ns-${p}-state`}
        fieldKey={`${p}_state`}
        labelMode="floating"
        as="select"
        label="Bundesstaat"
        required
        value={form[`${p}_state`]}
        onChange={(v) => upd(`${p}_state`, v)}
        onBlur={() => markTouched(`${p}_state`)}
        error={errors[`${p}_state`]}
      >
        <option value="">Bundesstaat auswählen</option>
        {statesForCountry(form[`${p}_country`]).map(st => (
          <option key={st.code} value={st.code}>{st.name}</option>
        ))}
      </Field>
    );
  };

  return (
    <div className="page-with-navbar">

      {/* Interner Verlassen-Guard: pausiert die Zielnavigation, wenn ungespeicherte
          fachliche Angaben vorliegen. Nur bei interner Navigation — der reguläre
          Buchungs-Handoff (handleBook → /booking) läuft direkt, ungeguardet. */}
      {pendingTarget && (
        <ShipmentDraftLeaveDialog
          mode={saveMode}
          busy={saving}
          onSave={saveDraftAndLeave}
          onReloadCurrent={reloadCurrentDraft}
          onDiscard={discardAndLeave}
          onContinue={continueEditing}
        />
      )}

      {/* Bewusstes Zurücksetzen des laufenden Vorgangs — nur mit Rückfrage,
          wenn tatsächlich Angaben oder Angebote verloren gingen. */}
      <ShipmentResetConfirmDialog
        open={resetConfirmOpen}
        hasOffers={hasResults || tariffs.length > 0}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={applyReset}
      />

      {/* Ladeoverlay des Vergleichs (Portal an <body>). Solange es steht, ist der
          Seiteninhalt darunter inert und aria-busy — die Dialoge oben bleiben
          bewusst außerhalb. */}
      <OfferComparisonLoadingOverlay active={loading} />

      {/* Kein .page-body hier: der Elternknoten (DashboardPage.jsx, page==="new")
          bringt .page-body bereits mit — .calc-page-wrap liefert nur noch das
          vertikale Innenabstandsmaß (Paket B, keine zweite max-width). */}
      <div className="calc-page-wrap" inert={loading} aria-busy={loading || undefined}>
        {/* Kein zweiter Abschnittskopf: „Neue Sendung" ist der Seitentitel im
            PageHeader (DashboardPage.jsx, PAGE_HEADERS.new). Der frühere Kopf
            „Versandpreis berechnen" wiederholte ihn und riss eine große Lücke
            zwischen Titel und Formular auf (Auditbefund E03). */}
        {/* ── Form section ── */}
        <div className="offers-form-section">

          {/* Fortsetzen-Kontext (nur bei aktivem Formularentwurf-Übergang). */}
          {resumeSource && !resumeConflict && (
            <div className="dft-resume-note" role="note">
              <span>Sie setzen einen gespeicherten Formularentwurf fort. Prüfen Sie die Angaben und berechnen Sie die Preise neu.</span>
            </div>
          )}
          {resumeConflict && (
            <div className="dft-resume-conflict" role="alert">
              <span className="dft-resume-conflict-text">Dieser Entwurf wurde inzwischen geändert. Laden Sie die aktuelle Version neu, bevor Sie fortfahren.</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={reloadFormDraft} disabled={reloadingResume}>
                {reloadingResume ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Wird geladen …</> : "Aktuelle Version laden"}
              </button>
            </div>
          )}
          {resumeNotice && (
            <div className="dft-resume-info" role="status">
              <span>{resumeNotice}</span>
            </div>
          )}
          {modeResetNotice && (
            <div className="dft-resume-info" role="status">
              <span>{modeResetNotice}</span>
            </div>
          )}
          {/* Herkunftshinweis eines Vorgangs aus Lager oder Auftrag. Bewusst
              derselbe Hinweisstil wie beim Fortsetzen eines Entwurfs — es gibt
              keine zweite Hinweisdarstellung. Bei jeder normalen Sendung ist der
              Text leer und die Zeile erscheint nicht. */}
          {inventoryNotice && (
            <div className="dft-resume-info" role="status">
              <span>{inventoryNotice}</span>
            </div>
          )}
          {/* Angebot aus dem Preisrechner — derselbe Hinweisstil, keine zweite Darstellung. */}
          {calculatorHinweis && (
            <div className="dft-resume-info ns-calculator-intent" role="status">
              <span>{calculatorHinweis}</span>
            </div>
          )}
          {preisvergleich && (
            <div className={`${preisvergleich.changed ? "dft-resume-conflict" : "dft-resume-info"} ns-public-price-compare`}
              role="status" id="ns-public-price-compare" data-changed={preisvergleich.changed ? "true" : "false"}>
              <p className="ns-public-price-compare-title">{PUBLIC_PRICE_COMPARISON_TEXT.title}</p>
              <p>
                {PUBLIC_PRICE_COMPARISON_TEXT.publicLabel}: {preisvergleich.publicNet} netto
                {preisvergleich.publicGross && <> · {preisvergleich.publicGross} brutto</>}
              </p>
              <p>
                {PUBLIC_PRICE_COMPARISON_TEXT.customerLabel}: {preisvergleich.customerNet} netto
                {preisvergleich.customerGross && <> · {preisvergleich.customerGross} brutto</>}
              </p>
              {preisvergleich.fromNote && <p>{preisvergleich.fromNote}</p>}
              <p className="ns-public-price-compare-note">{preisvergleich.note}</p>
            </div>
          )}
          {/* F1: Konto noch nicht buchungsbereit (z. B. Rechnungsanschrift fehlt). Bewusst der
              vorhandene Warnstil mit Aktion — keine zweite Darstellung. Fehlt nur die Anschrift,
              bleibt der Preisvergleich möglich; der Weg ins Profil steht direkt am Hinweis. */}
          {bookingProfileHinweis && (
            <div className="dft-resume-conflict" role="note" id="ns-booking-profile-notice">
              <span className="dft-resume-conflict-text">{bookingProfileHinweis}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(PROFILE_DASHBOARD_TARGET)}>
                Unternehmensprofil vervollständigen
              </button>
            </div>
          )}

          {/* Obere Premium-Filterleiste: fünf Filter nebeneinander (Desktop),
              responsives Grid auf Tablet/Mobile. Reine Darstellung. */}
          <ShipmentFilterBar
            serviceFilterOpen={serviceFilterOpen} setServiceFilterOpen={setServiceFilterOpen}
            selectedOption={selectedOption} SERVICE_OPTIONS={SERVICE_OPTIONS}
            serviceFilter={serviceFilter} handleServiceFilter={handleServiceFilter}
            datePickerOpen={datePickerOpen} setDatePickerOpen={setDatePickerOpen}
            shippingDate={shippingDate} handleDateChange={handleDateChange}
            dateError={errors.shippingDate}
            carrierRef={carrierRef} carrierDropdownOpen={carrierDropdownOpen} setCarrierDropdownOpen={setCarrierDropdownOpen}
            carrierLabel={carrierLabel} selectedPublicCarrierIds={selectedPublicCarrierIds}
            setSelectedPublicCarrierIds={setSelectedPublicCarrierIds} resetResults={resetResults}
            publicCarriers={publicCarriers} selectedPublicSet={selectedPublicSet}
            handleTogglePublicCarrier={handleTogglePublicCarrier}
            shippingModeOpen={shippingModeOpen} setShippingModeOpen={setShippingModeOpen}
            selectedShippingMode={selectedShippingMode} SHIPPING_MODE_OPTIONS={SHIPPING_MODE_OPTIONS}
            shippingModeFilter={shippingModeFilter} handleShippingMode={handleShippingMode}
            latestOpen={latestOpen} setLatestOpen={setLatestOpen} form={form}
            handleLatestDeliveryChange={handleLatestDeliveryChange} handleLatestDeliveryTimeChange={handleLatestDeliveryTimeChange}
            zeitOptionen={zeitOptionen}
            idPrefix="ns-form"
            carrierEmptyHint="Noch keine Versanddienstleister verfügbar"
          />

          {/* Versandroute */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><h3>Versandroute</h3></div>
            <div className="calc-panel-body">
              <div className="booking-addr-grid">
                <div>
                  {/* Die Adressbuchauswahl steht IN der Überschriftszeile, nicht
                      als zweiter großer Knopf darunter: sie ist eine Abkürzung
                      neben einem vollständig bedienbaren Formular. Auf schmalen
                      Viewports bricht die Zeile um (flex-wrap), der Auslöser
                      rutscht unter die Überschrift — nichts wird abgeschnitten. */}
                  <div className="calc-section-head">
                    {/* Paket G (2026-10-23): „Eigene Adresse" (Kontoanschrift) ist
                        entfallen. Der Absender kommt aus dem Adressbuch — als
                        Standard-Absender schon beim Öffnen eingetragen (Marke am
                        Titel, solange unverändert) oder über „Adresse suchen", wo
                        der Standard zuerst steht. */}
                    <div className="calc-section-title">
                      Absender
                      {absenderIstStandard && <span className="badge badge-blue calc-section-badge">{DEFAULT_SENDER_BADGE}</span>}
                    </div>
                    <AddressPickerButton
                      tab={TAB_SENDER}
                      onSelect={(a) => uebernimmAdressbuchAdresse(a, "s")}
                      disabled={loading}
                      title="Absenderadresse aus dem Adressbuch wählen"
                    />
                  </div>
                  {addressNote.s && <p className="calc-section-note">{addressNote.s}</p>}
                  {addrField("s", "company",  "Unternehmen",  "text",  true)}
                  {/* Die Kontaktperson steht strukturiert. Ein einzelnes Namensfeld konnte
                      „Max Mustermann" und „Muster GmbH" nicht unterscheiden — die Firma
                      steht deshalb darüber und getrennt. Zwei Spalten im vorhandenen
                      Raster, unter 600 px stapeln sie wie jede andere `field-row-2`. */}
                  <div className="field-row field-row-2">
                    {addrField("s", "firstName", "Vorname",  "text")}
                    {addrField("s", "lastName",  "Nachname", "text")}
                  </div>
                  {/* Land ZUERST: Adressvorschläge gelten immer für ein Land. Ohne Auswahl
                      steht am Straßenfeld ein Hinweis; eine schon getippte Straße bleibt.
                      Der Bundesstaat (nur US/CA) folgt dem Land unmittelbar. */}
                  {countrySelect("s")}
                  {stateSelect("s")}
                  <AddressSuggestInput
                    id="ns-s-street"
                    label="Straße & Hausnr."
                    required
                    value={form.s_street}
                    onChange={(v) => upd("s_street", v)}
                    onSelect={(item) => applyStreet("s", item, senderCheck)}
                    suggestions={senderCheck.streetOptions}
                    loading={senderCheck.streetLoading}
                    noResults={senderCheck.streetNoResults}
                    floating
                    dataField="s_street"
                    onBlur={() => markTouched("s_street")}
                    error={errors.s_street}
                    hint={streetFieldHint(form.s_country, form.s_street) || undefined}
                    className="field"
                  />
                  {addrField("s", "addition", "Adresszusatz", "text",  true)}
                  <div className="field-row field-row-2">
                    {zipField("s")}
                    <AddressSuggestInput
                      id="ns-s-city"
                      label="Stadt"
                      required
                      value={form.s_city}
                      onChange={(v) => upd("s_city", v)}
                      onSelect={(item) => upd("s_city", cityFromSuggestion(item))}
                      suggestions={senderCheck.cityOptions}
                      floating
                      dataField="s_city"
                      onBlur={() => markTouched("s_city")}
                      error={errors.s_city}
                      hint={shippingLengthHint("city", form.s_city) || undefined}
                      className="field"
                    />
                  </div>
                  {/* Ergebnis der Adressprüfung. Der Platz ist reserviert; Text erscheint erst,
                      wenn es etwas zu sagen gibt — im Ausgangszustand und für Länder ohne
                      Abdeckung bleibt die Zeile leer. */}
                  <AddressStatusLine
                    status={senderCheck.status}
                    reason={senderCheck.reason}
                    citySuggestions={senderCheck.cityOptions}
                    onPickCity={(c) => upd("s_city", c)}
                  />
                  {/* Pflicht seit dem Versandkontaktvertrag — der Carrier braucht einen
                      erreichbaren Ansprechpartner, und ConfidaraExpress erhebt ihn
                      deshalb generell, nicht je nach Tarif. */}
                  {addrField("s", "phone", "Telefon", "tel")}
                  {addrField("s", "email", "E-Mail",  "email")}
                  {/* Paket G: am Ende der Spalte, damit beide Adressspalten auf einer Höhe beginnen. */}
                  {zeigeStandardTipp && <p className="calc-section-note calc-section-tip">{DEFAULT_SENDER_TIP}</p>}
                </div>
                <div>
                  <div className="calc-section-head">
                    <div className="calc-section-title">Empfänger</div>
                    <AddressPickerButton
                      tab={TAB_RECIPIENT}
                      onSelect={(a) => uebernimmAdressbuchAdresse(a, "r")}
                      disabled={loading}
                      title="Empfängeradresse aus dem Adressbuch wählen"
                    />
                  </div>
                  {addressNote.r && <p className="calc-section-note">{addressNote.r}</p>}
                  {addrField("r", "company",  "Unternehmen",  "text",  true)}
                  <div className="field-row field-row-2">
                    {addrField("r", "firstName", "Vorname",  "text")}
                    {addrField("r", "lastName",  "Nachname", "text")}
                  </div>
                  {/* Land ZUERST: Adressvorschläge gelten immer für ein Land. Ohne Auswahl
                      steht am Straßenfeld ein Hinweis; eine schon getippte Straße bleibt.
                      Der Bundesstaat (nur US/CA) folgt dem Land unmittelbar. */}
                  {countrySelect("r")}
                  {stateSelect("r")}
                  <AddressSuggestInput
                    id="ns-r-street"
                    label="Straße & Hausnr."
                    required
                    value={form.r_street}
                    onChange={(v) => upd("r_street", v)}
                    onSelect={(item) => applyStreet("r", item, recipientCheck)}
                    suggestions={recipientCheck.streetOptions}
                    loading={recipientCheck.streetLoading}
                    noResults={recipientCheck.streetNoResults}
                    floating
                    dataField="r_street"
                    onBlur={() => markTouched("r_street")}
                    error={errors.r_street}
                    hint={streetFieldHint(form.r_country, form.r_street) || undefined}
                    className="field"
                  />
                  {addrField("r", "addition", "Adresszusatz", "text",  true)}
                  <div className="field-row field-row-2">
                    {zipField("r")}
                    <AddressSuggestInput
                      id="ns-r-city"
                      label="Stadt"
                      required
                      value={form.r_city}
                      onChange={(v) => upd("r_city", v)}
                      onSelect={(item) => upd("r_city", cityFromSuggestion(item))}
                      suggestions={recipientCheck.cityOptions}
                      floating
                      dataField="r_city"
                      onBlur={() => markTouched("r_city")}
                      error={errors.r_city}
                      hint={shippingLengthHint("city", form.r_city) || undefined}
                      className="field"
                    />
                  </div>
                  {/* Ergebnis der Adressprüfung. Der Platz ist reserviert; Text erscheint erst,
                      wenn es etwas zu sagen gibt — im Ausgangszustand und für Länder ohne
                      Abdeckung bleibt die Zeile leer. */}
                  <AddressStatusLine
                    status={recipientCheck.status}
                    reason={recipientCheck.reason}
                    citySuggestions={recipientCheck.cityOptions}
                    onPickCity={(c) => upd("r_city", c)}
                  />
                  {addrField("r", "phone", "Telefon", "tel")}
                  {addrField("r", "email", "E-Mail",  "email")}
                </div>
              </div>
            </div>
          </div>

          {/* Paketdaten */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><h3>Paketdaten</h3></div>
            <div className="calc-panel-body">
              {/* Reihenfolge: Anzahl · Gewicht · Länge · Breite · Höhe (nur Anzeige;
                  Bindings/State-Keys/Validierung unverändert). Anzahl = Anzahl
                  identischer Pakete (pro Paket: Gewicht + Maße), nur an /calculate-price. */}
              {/* Die Einheit steht nicht mehr im sichtbaren Beschriftungstext
                  („Gewicht kg *"), sondern als eigenes, dekoratives Zeichen rechts
                  im Feld. Für Screenreader trägt die Beschriftung sie unsichtbar
                  weiter (unitLabel) — sichtbar „Gewicht", vorgelesen „Gewicht in
                  Kilogramm", nicht doppelt. Schwebende Beschriftung, keine Beispiel-
                  Platzhalter mehr (Auftrag 1, P11); eine unvollständige Zahl
                  („1e", „-") hält die Beschriftung oben (Field, badInput). */}
              {/* Der gemeinsame Paketeditor (Canonical v2.79, §15): Startansicht wie bisher — eine
                  Zeile, IDs ns-packageCount … ns-height, dieselben Schlüssel und Prüfungen; darunter
                  „Paket hinzufügen“. Weitere Zeilen tragen ns-weight-2 usw. */}
              {/* Paketbühne (Konzept B): breit neben den Feldern, schmal als Streifen darunter. Rein darstellend. */}
              <div className="ce-paket-raster">
                <div className="ce-paket-raster-innen">
                  <div className="ce-paket-raster-eingaben">
                    <PackageLinesEditor
                      variant="app"
                      idBase="ns-"
                      lines={formPackageLines(form)}
                      onLinesChange={updPakete}
                      errors={errors}
                      onFieldBlur={markTouched}
                    />
                    <p className="pkg-count-note">
                      <span>Gewicht und Maße gelten je Paket. Der Preis gilt für alle Pakete zusammen.</span>
                    </p>
                    {volWeight && (
                      <div className="vol-weight-box">
                        {/* Deutsch geschrieben („115,2 kg“); „Abrechn.“ erst, wenn ein Gewicht feststeht. */}
                        <span className="vol-weight-label">Volumengewicht: {dezimal(Number(volWeight))} kg</span>
                        {chargeWeight && <span className="vol-weight-value">Abrechn.: {dezimal(Number(chargeWeight))} kg</span>}
                      </div>
                    )}
                  </div>
                  <Paketbuehne lines={formPackageLines(form)} von={form.s_city} nach={form.r_city} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Angaben zur Sendung ───────────────────────────────────────────────
              Zwei Angaben, die den Preis mitbestimmen: WAS versendet wird und WAS es
              wert ist.

              Sie stehen HIER und nicht auf der Buchungsseite, weil sie den Preis
              beeinflussen: wer sie erst nach dem Vergleich erhebt, vergleicht Angebote
              auf einer anderen Grundlage, als er sie später bucht.

              Die Art der Lieferadresse steht bewusst NICHT hier: ein möglicher Zuschlag
              betrifft nur einzelne Angebote und wird erst nach deren Auswahl auf der
              Buchungsseite gefragt.

              Kein Providername, kein Vorgabewert, keine Vorauswahl. */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><h3>Angaben zur Sendung</h3></div>
            <div className="calc-panel-body">
              <div className="field-row field-row-2">
                <Field id="ns-declaredContent" fieldKey="declaredContent" labelMode="floating"
                       label="Inhalt der Sendung" required type="text"
                       maxLength={DECLARED_CONTENT_MAX}
                       value={form.declaredContent} onChange={(v) => upd("declaredContent", v)}
                       onBlur={() => { markTouched("declaredContent"); firmenfeldVerlassen("declaredContent"); }}
                       error={errors.declaredContent}
                       hint="Kurze Beschreibung des Inhalts." />
                <Field id="ns-declaredGoodsValue" fieldKey="declaredGoodsValue" labelMode="floating"
                       label="Warenwert" required type="number" unit="EUR" unitLabel="in Euro"
                       min="0" step="0.01"
                       value={form.declaredGoodsValue} onChange={(v) => upd("declaredGoodsValue", v)}
                       onBlur={() => markTouched("declaredGoodsValue")}
                       error={errors.declaredGoodsValue}
                       hint="Tatsächlicher Warenwert der Sendung." />
              </div>
            </div>
          </div>

          {/* Calculate CTA + sichtbare „Als Entwurf speichern"-Aktion (sekundär) */}
          <div className="offers-calc-cta">
            <div className="dft-cta-row">
              {/* Die Adressprüfung sperrt die Preisberechnung nicht: ihre Hinweise stehen an der
                  Adresse, der Kunde entscheidet. Verbindlich sind Formular- und Buchungsprüfung. */}
              {/* Betreiberentscheidung Auftrag 1, P11 (2026-10-17): der Knopf ist auch bei
                  fehlenden Angaben bedienbar — gesperrt nur, während gerechnet oder gespeichert
                  wird. Ein Klick auf ein unvollständiges Formular sendet nichts, markiert alle
                  fehlenden Pflichtfelder und springt zum ersten. onMouseDown hält den Fokus im
                  Feld, bis der Klick ausgelöst hat: sonst schöbe die Blur-Meldung den Knopf
                  zwischen Drücken und Loslassen weg. */}
              <button
                type="button"
                ref={calcCtaRef}
                className="btn btn-primary btn-lg dft-cta-primary"
                onClick={calculate}
                onMouseDown={keepFocusOnMouseDown}
                disabled={loading || saving}
              >
                {loading
                  ? <><span className="spinner" /> Berechne…</>
                  : "Angebote vergleichen"
                }
              </button>
              <button
                type="button"
                className="btn btn-outline dft-savedraft-cta"
                onClick={saveDraftExplicit}
                disabled={!canExplicitSave}
                aria-busy={saving || undefined}
                title={explicitSaveHint || undefined}
              >
                {saving
                  ? <><span className="spinner spinner-dark" /> Wird gespeichert …</>
                  : "Als Entwurf speichern"
                }
              </button>
              {/* Sekundärste Stufe: der laufende Vorgang bleibt bei einem Wechsel
                  innerhalb der Sitzung erhalten (Sidebar, Zurück) und endet mit
                  dem Reload — dies ist der eine bewusste Weg, ihn sofort zu
                  beenden. */}
              <button
                type="button"
                className="btn btn-link dft-reset-cta"
                onClick={requestReset}
                disabled={loading || saving}
              >
                Eingaben zurücksetzen
              </button>
            </div>

            {/* Wiederhergestellter Vorgang, dessen Angebote nicht mehr gezeigt
                werden dürfen (älter als eine Stunde oder Versanddatum
                inzwischen vergangen). Normaler Hinweisstil, keine Rohmeldung. */}
            {flowNotice && (
              <div className="dft-save-status" role="status">
                <span>{flowNotice}</span>
              </div>
            )}

            {/* Sammelhinweis: nennt, was markiert ist — die markierten Felder liegen oft weiter
                oben außerhalb des Sichtbereichs. Die Felder selbst bleiben die Detailanzeige.
                TG22 Paket B: ohne Versanddatum (vergangenes Entwurfsdatum) wird nicht gerechnet —
                hier steht, warum. */}
            {datumFehlt && !loading && (
              <div className="dft-save-status" role="status" id="ns-date-missing">
                <span>{DATUM_FEHLT_HINWEIS}</span>
              </div>
            )}

            {calcHint && !loading && (
              <div className="dft-save-status" role="status">
                <span>{calcHint}</span>
              </div>
            )}


            {showInlineSave && saveStatus === "saved" && !isDirty && !saving && (
              <div className="dft-save-status dft-save-status--ok" role="status"><span>Entwurf gespeichert.</span></div>
            )}
            {showInlineSave && saveMode === "error" && (
              <div className="dft-save-alert" role="alert"><span>Der Entwurf konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.</span></div>
            )}
            {/* Getrennt von "error": hier hilft kein erneuter Versuch, sondern nur
                die Korrektur des markierten Feldes. */}
            {showInlineSave && saveMode === "fieldError" && (
              <div className="dft-save-alert" role="alert"><span>Eine Angabe im Formular ist nicht gültig. Das markierte Feld bitte korrigieren und erneut speichern.</span></div>
            )}
            {showInlineSave && saveMode === "notFound" && (
              <div className="dft-save-alert" role="status"><span>Dieser Entwurf ist nicht mehr verfügbar. Sie können die aktuellen Angaben als neuen Entwurf speichern.</span></div>
            )}
            {showInlineSave && saveMode === "rateLimited" && (
              <div className="dft-save-alert" role="alert"><span>Zu viele Speicheranfragen. Bitte versuchen Sie es in Kürze erneut.</span></div>
            )}
            {showInlineSave && saveMode === "conflict" && (
              <div className="dft-save-alert dft-save-conflict" role="alert">
                <span className="dft-save-conflict-text">Dieser Entwurf wurde inzwischen an anderer Stelle geändert.</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={reloadCurrentDraft} disabled={saving}>
                  {saving ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Wird geladen …</> : "Aktuelle Version laden"}
                </button>
              </div>
            )}
            {error && <div className="alert alert-error mt-16" role="alert">{error}</div>}
            {/* TG22 Paket B: fehlende Profilangaben (422) — der Weg ins Profil steht direkt am Hinweis.
                Keine Abmeldung, der Vorgang bleibt erhalten. */}
            {error && profileIncomplete && (
              <div className="dft-resume-info mt-8" role="note" id="ns-profile-incomplete">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(PROFILE_DASHBOARD_TARGET)}>
                  Unternehmensprofil vervollständigen
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Offers section ── */}
        {/* Stabiler Anker für die Rückkehr aus der Buchung: Ohne gemerkte
            Scrollposition wird gezielt hierher gescrollt — kein Pixelwert. */}
        {(hasResults || loading) && (
          <div ref={offersRef} id="angebotsbereich" className={kartenVollLayouten ? "offers-cv-voll" : undefined}>
          {firmenHinweis && !loading && (
            <div className="dft-resume-info" role="status" id="ns-firmen-hinweis">
              <span>{firmenHinweis}</span>
            </div>
          )}
          <OffersList
            sorted={sorted}
            mixedPackages={hasMixedPackageLines(formPackageLines(form))}
            filtered={filtered}
            lateOffers={spaet}
            tariffs={tariffs}
            loading={loading}
            hasResults={hasResults}
            coverageNotice={coverageNotice}
            selected={selected}
            onSelect={setSelected}
            onBook={handleBook}
            sortMode={sortMode}
            onSortChange={setSortMode}
            onRecalculate={calculate}
            maxPrice={form.max_price}
            onMaxPriceChange={v => upd("max_price", v)}
            latestDeliveryDate={form.latestDeliveryDate}
            onLatestDeliveryChange={handleLatestDeliveryChange}
            latestDeliveryTime={form.latestDeliveryTime}
            onLatestDeliveryTimeChange={handleLatestDeliveryTimeChange}
            deliveryTimeOptions={zeitOptionen}
            shippingDate={shippingDate}
            onClearFilters={clearFilters}
            vatMode={vatMode}
            onVatToggle={setVatMode}
            senderPrefill={senderPrefill}
            businessConfirmations={firmenBestaetigt}
            businessConfirmError={firmenBestaetigungFehlt}
            onBusinessConfirm={handleBusinessConfirm}
          />
          </div>
        )}
      </div>
    </div>
  );
}
