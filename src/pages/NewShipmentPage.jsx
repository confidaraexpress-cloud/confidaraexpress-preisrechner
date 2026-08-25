import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { Icon } from "../components/ui/Icon";
// `normalizeCountryCode` wird hier nicht mehr gebraucht: die Länder-
// Normalisierung ist mit dem Profil-Seed nach newShipmentForm.mjs gewandert
// (senderPatchFromProfile) — sie greift dort unverändert weiter.
import { countries } from "../utils/countries";
import { money, fmtDelivery } from "../utils/formatters";
import { publicCarrierChipLabel } from "../utils/carrierMap";
import { applyResultFilters } from "../utils/offersFilterView.mjs";
import { deliveryDeadlineOptions, latestDeliveryFieldValue } from "../utils/deliveryTimeView.mjs";
import { revealOffers } from "../utils/revealOffers.mjs";
import DeliveryTimeSelect from "../components/offers/DeliveryTimeSelect.jsx";
import { resumeInitialState, missingFieldsHint } from "../utils/newShipmentResume.mjs";
import { validatePostalCode, postalCodeExample, postalCodeInputMode, postalCodeMaxLength, isPostalCodeRequired } from "../utils/postalCode";
import { OffersList } from "../components/offers/OffersList";
import { useAuth } from "../context/AuthContext";
import { todayISO, addDaysISO, labelForDate, fmtShortDE } from "../utils/date";
import { DateCalendar } from "../components/common/DateCalendar";
import { getFormDraft, createFormDraft, updateFormDraft } from "../api/formDraftsApi";
import { normalizeApiError, normalizeThrownError, summaryMessage } from "../utils/apiError.mjs";
import { focusFirstError } from "../utils/focusField";
import { Field } from "../components/ui/Field";
import { useShippingFlow } from "../context/ShippingFlowContext";
import { formHasInput, pickRestoreSource, droppedNotice } from "../utils/shippingFlowState.mjs";
import {
  createEmptyShipmentForm, senderPatchFromProfile, hasProfileSenderData,
  packageErrors, packageComplete, packageHint, packagePayload, PACKAGE_PLACEHOLDERS,
} from "../utils/newShipmentForm.mjs";

// Backend-Feldpfad → Formularschlüssel dieser Seite. Damit landet ein
// serverseitiger Feldfehler am richtigen Eingabefeld, statt nur im Banner.
// Vollständig für BEIDE Absender: /calculate-price und die Entwurfsroute
// benennen ihre Felder identisch (sender.*/recipient.*/packages.*). Die Karte
// war bisher auf die vier Route-Felder beschränkt — jeder andere abgelehnte
// Feldpfad landete deshalb ohne Markierung im Sammeltext. Additiv ergänzt, kein
// Eintrag geändert.
const SHIPMENT_FIELD_MAP = {
  "sender.company": "s_company",
  "sender.fullName": "s_fullName",
  "sender.streetAndNumber": "s_street",
  "sender.addressAddition": "s_addition",
  "sender.postalCode": "s_zip",
  "sender.city": "s_city",
  "sender.country": "s_country",
  "sender.phone": "s_phone",
  "sender.email": "s_email",
  "recipient.company": "r_company",
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
const SHIPMENT_FIELD_ORDER = [
  "s_fullName", "s_company", "s_street", "s_addition", "s_zip", "s_city", "s_email",
  "r_fullName", "r_company", "r_street", "r_addition", "r_zip", "r_city", "r_email",
  "packageCount", "weight", "length", "width", "height", "shippingDate",
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
  hasUsableShipmentReference,
} from "../utils/formDraftsView.mjs";
import { draftBookingOptionsToFlow, hasAnyDraftBookingOption } from "../utils/draftBookingOptions.mjs";
import { getShipmentFormSnapshot, isShipmentFormDirty, hasMeaningfulShipmentInput } from "../utils/shipmentFormSnapshot.mjs";
import { AddressPickerButton } from "../components/addressbook/AddressPickerButton";
import { AddressSuggestInput } from "../components/address/AddressSuggestInput";
import { AddressStatusLine } from "../components/address/AddressStatusLine";
import { useAddressValidation } from "../hooks/useAddressValidation";
import { ADDRESS_STATUS, addressBlocksSubmit, applyStreetSuggestion } from "../utils/addressValidationView.mjs";
import { mapAddressToShipmentFormPatch, TAB_SENDER, TAB_RECIPIENT } from "../utils/addressBookView.mjs";
import { ShipmentDraftLeaveDialog } from "../components/drafts/ShipmentDraftLeaveDialog";
import { ShipmentResetConfirmDialog } from "../components/drafts/ShipmentResetConfirmDialog";

// Quittung nach einer Adressbuchübernahme. Sie sagt beides in einem Satz: die
// Werte sind da, UND sie gehören jetzt diesem Formular — eine spätere Korrektur
// hier ändert den Adressbucheintrag nicht.
const ADDRESS_TAKEN_NOTE = "Adresse aus dem Adressbuch übernommen. Sie können sie hier frei anpassen.";
const PROFILE_SENDER_NOTE = "Absenderadresse aus Ihrem Konto übernommen. Sie können sie hier frei anpassen.";

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
// lassen Tarife + shipmentId unangetastet — sie filtern lediglich die bereits
// berechnete Liste, ohne die Buchungsgrundlage zu ändern.
// `latestDeliveryTime` gehört zwingend hierher: eine Uhrzeitauswahl arbeitet
// ausschließlich auf den BEREITS geladenen Tarifen und darf niemals einen neuen
// /calculate-price-Request auslösen. Sie steht aus demselben Grund NICHT im
// calcKey — der Schlüssel beschreibt die Payload, nicht die Anzeige.
const FILTER_ONLY_FIELDS = new Set(["max_price", "latestDeliveryDate", "latestDeliveryTime"]);

function getErrors(form) {
  const e = {};

  if (!form.s_fullName?.trim())             e.s_fullName = "Name ist ein Pflichtfeld.";
  else if (form.s_fullName.length > 100)    e.s_fullName = "Name darf maximal 100 Zeichen enthalten.";
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
  if (form.s_email) {
    if (form.s_email.length > 254)          e.s_email    = "E-Mail darf maximal 254 Zeichen enthalten.";
    else if (!EMAIL_RE.test(form.s_email))  e.s_email    = "E-Mail-Adresse ist ungültig.";
  }

  if (!form.r_fullName?.trim())             e.r_fullName = "Name ist ein Pflichtfeld.";
  else if (form.r_fullName.length > 100)    e.r_fullName = "Name darf maximal 100 Zeichen enthalten.";
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
  if (form.r_email) {
    if (form.r_email.length > 254)          e.r_email    = "E-Mail darf maximal 254 Zeichen enthalten.";
    else if (!EMAIL_RE.test(form.r_email))  e.r_email    = "E-Mail-Adresse ist ungültig.";
  }

  // Anzahl, Gewicht UND alle drei Maße sind Pflicht — eine Quelle für alle
  // fünf (newShipmentForm.mjs), dieselben Grenzen wie serverseitig.
  //
  // Bis hierher galten Länge, Breite und Höhe als optional: geprüft wurde nur,
  // WENN bereits etwas eingetragen war (`if (form.length) { … }`). Ein leeres
  // Feld kam damit ohne Beanstandung durch den Knopf „Angebote vergleichen",
  // und das Backend ersetzte es still durch 30/20/15 cm. Der Kunde bekam einen
  // Preis für Maße, die er nie eingegeben hat.
  Object.assign(e, packageErrors(form));

  return e;
}

// ─── Filter / Sort options ─────────────────────────────────────────────────────
const SERVICE_OPTIONS = [
  { id: "all",          icon: "dashboard", label: "Alle Dienstleistungen", desc: "Tarife für die Abholung Zuhause / im Büro und für die Shopabgabe anzeigen" },
  { id: "pickup",       icon: "truck",     label: "Nur Abholung",          desc: "Tarife für die Abholung Zuhause / im Büro anzeigen"  },
  { id: "dropoff",      icon: "map",       label: "Nur Abgabe",            desc: "Tarife für die Abgabe in einem Paketshop anzeigen"      },
  { id: "pickup_today", icon: "zap",       label: "Abholung heute",        desc: "Tarife mit Abholung noch heute anzeigen" },
];

const SHIPPING_MODE_OPTIONS = [
  { id: "all",      icon: "package", label: "Alle Versandarten", desc: "Standard, Express und Economy anzeigen" },
  { id: "standard", icon: "truck",   label: "Standard",          desc: "Regulärer Versand ohne Aufpreis"        },
  { id: "express",  icon: "zap",     label: "Express",           desc: "Schnellste verfügbare Zustellung"       },
  { id: "economy",  icon: "clock",   label: "Economy",           desc: "Günstigster Tarif, längere Laufzeit"    },
];

export default function NewShipmentPage({ prefillAddress, onPrefillApplied, prefillInventory, onInventoryPrefillApplied, resumeDraft, onResumeApplied, registerLeaveGuard, commitLeave } = {}) {
  const { authed, user } = useAuth();
  const navigate = useNavigate();

  // ── Fortsetzen eines Formularentwurfs (mount-once) ───────────────────────────
  // Ein gültiger Resume-Payload rehydriert das Formular aus dem Snapshot und hat
  // Vorrang vor dem Profil-Prefill (das Profil wird dann NICHT als Sender-Seed
  // verwendet). Einmalig beim Mount berechnet — Prop-Änderungen (das Zurücksetzen
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
      ? resumeInitialState(buildResumeInitialState(resumeDraft.formData, { today: todayISO() }))
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
  //   Entwurf fortsetzen > Adressbuch-Prefill > Sitzungsvorgang > Profil-Seed
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

  // ── Filters ──
  const [serviceFilter, setServiceFilter]         = useState(resumeInit ? resumeInit.serviceFilter : flowInit ? flowInit.serviceFilter : "all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
  const [shippingModeFilter, setShippingModeFilter] = useState(resumeInit ? resumeInit.shippingModeFilter : flowInit ? flowInit.shippingModeFilter : "all");
  const [shippingModeOpen, setShippingModeOpen]     = useState(false);
  const [shippingDate, setShippingDate]             = useState(() =>
    (resumeInit && resumeInit.shippingDate) ? resumeInit.shippingDate
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
  // System angenommen hat. Das Profil bleibt Datenquelle, aber ausschließlich
  // für die bewusste Übernahme (`uebernimmProfilAbsender`, siehe unten).
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
  // Sitzungs-Restore setzt Tarife, shipmentId, Zollentscheidung und Auswahl
  // ATOMAR beim Mount — genau die Gruppe, die resetResults() zusammen verwirft.
  // Es wird KEIN calculate-price ausgelöst: die Daten kommen aus dem Vorgang.
  const [tariffs, setTariffs]       = useState(flowInit ? flowInit.tariffs : []);
  const [shipmentId, setShipmentId] = useState(flowInit ? flowInit.shipmentId : null);
  // ConfidaraExpress-Sendungshandle (shipments.id) DESSELBEN Entwurfs. Streng
  // getrennt von `shipmentId` (JUMiNGO-Referenz, Eingabe für /book): nur dieser
  // Wert darf an „Als Entwurf speichern" gehen, weil der Save-Endpunkt
  // ausschließlich shipments.id auflöst.
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
  const [hasResults, setHasResults] = useState(!!(flowInit && flowInit.tariffs.length > 0));
  // Zeitpunkt der Preisberechnung — trägt die Ablauffrist des Vorgangs.
  const calculatedAtRef = useRef(flowInit ? flowInit.calculatedAt : null);
  // Fortgesetzter Entwurf: unvollständige Pflichtangaben werden SOFORT markiert.
  // Ein abgebrochener Entwurf sieht ausgefüllt aus, deaktiviert den CTA aber
  // stillschweigend — ohne Vorbelegung erklärt nichts, welche Angabe fehlt, und
  // der Nutzer klickt wirkungslos. Bei einer neuen Sendung bleibt es unverändert
  // beim leeren Fehlerobjekt (der Nutzer füllt das Formular gerade erst aus).
  const [errors, setErrors]         = useState(() => (resumeInit ? getErrors(resumeInit.form) : {}));

  // Quittung je Seite nach einer Adressbuchübernahme („s" | „r"). Reiner
  // Anzeigezustand: er wandert NICHT in den Vorgang, nicht in den Entwurf und
  // nicht in die Baseline — er sagt nur, was gerade passiert ist.
  const [addressNote, setAddressNote] = useState({ s: "", r: "" });

  // ── Fortsetzen-Status (nur aktiv, wenn ein Formularentwurf fortgesetzt wird) ──
  // resumeSource trägt die Übergangs-Metadaten (interne Formularentwurf-ID +
  // Revision), die beim nächsten „Preise berechnen" EINMALIG mitgesendet werden.
  const [resumeSource, setResumeSource]       = useState(() => resumeSourceFromDraft(resumeDraft)); // { id, revision } | null
  const [resumeNotice, setResumeNotice]       = useState("");     // nicht blockierender Hinweis
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
      sortMode, vatMode, tariffs, publicCarriers, selected, shipmentId, ceShipmentId, customs,
      inventoryContext,
      calculatedAt: calculatedAtRef.current,
    });
  }, [form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
      sortMode, vatMode, tariffs, publicCarriers, selected, shipmentId, ceShipmentId, customs,
      inventoryContext, setFlowScope]);

  /* ── Scrollposition wiederherstellen ─────────────────────────────────────
     Erst NACHDEM Formular und Angebotsbereich gerendert sind — vorher ist das
     Dokument zu kurz und der Sprung liefe ins Leere. Genau einmal je Mount.
     Ohne wiederhergestellten Vorgang passiert nichts; das normale
     ScrollToTop-Verhalten bleibt für alle anderen Wege unberührt. */
  const scrollWiederhergestelltRef = useRef(false);
  const offersRef = useRef(null);
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
        if (ziel > 0) { window.scrollTo(0, ziel); return; }
        if (offersRef.current) {
          offersRef.current.scrollIntoView({ behavior: sanft ? "smooth" : "auto", block: "start" });
          return;
        }
        window.scrollTo(0, 0);
      });
    });
    return () => cancelAnimationFrame(id);
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
    setErrors(p => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; });
    // Stale-State-Schutz: Ändert sich ein buchungsrelevantes Feld (Absender-,
    // Empfänger-, Paket- oder Routendaten), werden alte Tarife UND die
    // shipmentId verworfen. So kann niemals ein veralteter Tarif / eine alte
    // shipmentId mit nachträglich geänderten Daten an /book gehen — der Nutzer
    // muss zwingend erneut „Preise berechnen“ ausführen.
    if (!FILTER_ONLY_FIELDS.has(k)) invalidateResults();
  };

  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  const calcValid = Object.keys(getErrors(form)).length === 0;
  // Hinweis am CTA — NUR aus bereits sichtbar markierten Feldern (`errors`), nie
  // aus einer stillen Vorabvalidierung des laufenden Tippens. Bei einer neuen
  // Sendung ist `errors` bis zum ersten Klick leer → kein Hinweis, Verhalten
  // unverändert. Bei einem fortgesetzten Entwurf ist es beim Mount vorbelegt.
  const calcHint = calcValid ? null : missingFieldsHint(errors);
  // Zweite, sanftere Erklärung für den häufigsten Fall: das Paket ist noch nicht
  // vollständig. Sie erscheint als Hinweiszeile am deaktivierten Knopf, ohne
  // dass ein einziges Feld rot markiert wird — ein frisches Formular soll
  // erklären, was fehlt, und nicht wie ein Fehlerprotokoll aussehen. Die roten
  // Markierungen entstehen unverändert erst beim Weiterklicken (getErrors).
  const paketHinweis = packageComplete(form) ? "" : packageHint(form);

  const buildParty = (p) => ({
    ...(form[`${p}_company`]  ? { company:         form[`${p}_company`]  } : {}),
    fullName:        form[`${p}_fullName`],
    streetAndNumber: form[`${p}_street`],
    ...(form[`${p}_addition`] ? { addressAddition: form[`${p}_addition`] } : {}),
    postalCode:      form[`${p}_zip`],
    city:            form[`${p}_city`],
    country:         form[`${p}_country`],
    // Nur bei gesetztem Bundesstaat — für alle Länder ohne Bundesstaatpflicht entsteht das
    // Feld nicht und der Payload ist unverändert.
    ...(form[`${p}_state`] ? { state: form[`${p}_state`] } : {}),
    ...(form[`${p}_phone`] ? { phone: form[`${p}_phone`] } : {}),
    ...(form[`${p}_email`] ? { email: form[`${p}_email`] } : {}),
  });

  const resetResults = () => {
    setHasResults(false);
    setTariffs([]);
    setSelected(null);
    setShipmentId(null); // alte shipmentId mit verwerfen → nie mit neuen Daten buchbar
    setCeShipmentId(null); // gehört zum selben Entwurf — dieselbe verworfene Gruppe
    setCustoms(null);    // alte Zollentscheidung mit verwerfen
    setError("");
    calculatedAtRef.current = null;
    setFlowNotice(null); // ein neuer Anlauf beginnt ohne alten Ablaufhinweis
  };

  // Verwirft ein vorhandenes Ergebnis nur, wenn überhaupt eines existiert.
  // Vermeidet unnötige Re-Renders bei jedem Tastendruck im noch leeren
  // Formular (vor der ersten Preisberechnung gibt es nichts zu invalidieren).
  const invalidateResults = () => {
    if (hasResults || shipmentId || tariffs.length > 0 || selected) resetResults();
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
  // 3. Alte Angebote, shipmentId/ceShipmentId, Zollentscheidung und Auswahl
  //    fallen über invalidateResults() weg — eine geänderte Route darf niemals
  //    mit einem Tarif von vorher gebucht werden.
  const uebernimmAdressbuchAdresse = (address, prefix) => {
    const patch = mapAddressToShipmentFormPatch(address, prefix);
    const keys = Object.keys(patch);
    setForm(p => ({ ...p, ...patch }));
    // Sichtbare Feldfehler der ersetzten Felder verschwinden mit ihrem Wert —
    // dieselbe Regel wie in upd(), nur für alle neun Schlüssel auf einmal.
    setErrors(p => {
      if (!keys.some(k => p[k])) return p;
      const n = { ...p };
      for (const k of keys) delete n[k];
      return n;
    });
    invalidateResults();
    setAddressNote(p => ({ ...p, [prefix]: ADDRESS_TAKEN_NOTE }));
  };

  // ── Komfortfunktion: eigene Absenderadresse übernehmen ──────────────────────
  // Das Gegenstück zum entfallenen automatischen Profil-Prefill. Dieselben
  // Daten, derselbe Normalisierungsweg — nur wird jetzt der Kunde gefragt, statt
  // sie ihm unterzuschieben.
  //
  // Aufbau exakt wie die Adressbuchübernahme darüber: EIN gebündelter Patch,
  // GENAU EINE invalidateResults(), Feldfehler der ersetzten Felder fallen weg.
  // Und wie dort wird die Baseline bewusst NICHT nachgezogen — das ist eine
  // Nutzeraktion, die Seite gilt danach zu Recht als geändert (Verlassen-Hinweis
  // erscheint, „Als Entwurf speichern" ist bedienbar).
  const profilAbsenderVerfuegbar = hasProfileSenderData(user);
  const uebernimmProfilAbsender = () => {
    const patch = senderPatchFromProfile(user);
    const keys = Object.keys(patch);
    setForm(p => ({ ...p, ...patch }));
    setErrors(p => {
      if (!keys.some(k => p[k])) return p;
      const n = { ...p };
      for (const k of keys) delete n[k];
      return n;
    });
    invalidateResults();
    setAddressNote(p => ({ ...p, s: PROFILE_SENDER_NOTE }));
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
  // vorhandene Preis-/Tarif-/shipmentId-Ergebnisse (Buchungssicherheit); es
  // werden KEINE Formularfelder verändert. Gebunden direkt am <select> onChange.

  const handleTogglePublicCarrier = (id) => {
    setSelectedPublicCarrierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    resetResults();
  };

  // Setzt ALLE reinen Ergebnisfilter zurück. Beide Schlüssel stehen in
  // FILTER_ONLY_FIELDS — `upd` ruft für sie bewusst KEIN invalidateResults(),
  // die bereits berechneten Tarife und die shipmentId bleiben also erhalten
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
    setErrors({});
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
    resetResults();
    // Baseline auf den frischen Seed ziehen → das zurückgesetzte Formular ist
    // nicht „dirty" und der Verlassen-Guard schweigt zu Recht.
    setBaseline(getShipmentFormSnapshot({
      form: seed, shippingDate: todayISO(), serviceFilter: "all",
      shippingModeFilter: "all", selectedPublicCarrierIds: [],
    }));
    clearFlowScope("shipment");
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
    try {
      const r = isPatch
        ? await updateFormDraft(source.id, { schemaVersion: source.schemaVersion ?? 1, revision: source.revision, formData: snapshot })
        : await createFormDraft({ schemaVersion: 1, formData: snapshot });
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
          setErrors((prev) => ({ ...prev, [norm.field]: norm.fieldMessage || norm.message }));
          focusFirstError(norm.field);
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
      const init = buildResumeInitialState(payload.formData, { today: todayISO() });
      const nextDate = init.shippingDate || todayISO();
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
      ? (hasMeaningfulShipmentInput(currentSnapshot, baseline) ? "Keine ungespeicherten Änderungen." : "Gib zuerst Sendungsdaten ein.")
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
    || hasMeaningfulShipmentInput(currentSnapshot, baseline);

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

  const sorted = React.useMemo(() => {
    if (sortMode === "recommended") return filtered;
    const copy = [...filtered];
    if (sortMode === "cheapest") return copy.sort((a, b) => (a.netPrice ?? Infinity) - (b.netPrice ?? Infinity));
    if (sortMode === "priciest") return copy.sort((a, b) => (b.netPrice ?? -1) - (a.netPrice ?? -1));
    if (sortMode === "fastest")  return copy.sort((a, b) => {
      const aMax = a.transitDaysMax ?? 999, bMax = b.transitDaysMax ?? 999;
      if (aMax !== bMax) return aMax - bMax;
      return (a.transitDaysMin ?? 999) - (b.transitDaysMin ?? 999);
    });
    return copy;
  }, [filtered, sortMode]);

  const handleServiceFilter = (id) => { setServiceFilter(id); setServiceFilterOpen(false); resetResults(); };
  const handleShippingMode  = (id) => { setShippingModeFilter(id); setShippingModeOpen(false); resetResults(); };
  const handleDateChange    = (iso) => {
    if (!iso || iso < todayISO()) return;
    setShippingDate(iso); setDatePickerOpen(false);
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
    const errs = getErrors(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Zahl der betroffenen Angaben nennen und zum ersten fehlerhaften Feld
      // springen — bisher blieb der Kunde am Button stehen und musste das Feld
      // in einem langen Formular selbst suchen.
      setError(summaryMessage(Object.keys(errs).length));
      focusFirstError(firstShipmentErrorField(errs));
      return;
    }
    setErrors({});
    calcInFlight.current = true;   // erst NACH der Validierung: ein abgelehnter Klick blockiert nichts
    setError(""); setLoading(true); setSelected(null);
    setResumeNotice(""); setResumeConflict(false);
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
        method: "POST", auth: true, signal: ac.signal,
        body: JSON.stringify({
          // Genau die eingegebenen Werte — kein Ersatzwert. Hier stand bis zu
          // diesem Paket `Number(form.length) || 30` (und 20/15): `Number("")`
          // ist 0 und damit falsy, ein leeres Feld wurde also zu 30 cm. Der
          // Kunde bekam einen Preis für Maße, die er nie eingegeben hat.
          // `packagePayload()` liefert null, sobald etwas fehlt — dieser Zweig
          // ist dann durch getErrors() oben ohnehin schon abgebrochen.
          ...packagePayload(form),
          sender:             buildParty("s"),
          recipient:          buildParty("r"),
          serviceFilter:      serviceFilter,
          shippingModeFilter: shippingModeFilter,
          shippingDate:       shippingDate,
          publicCarrierIds:   selectedPublicCarrierIds,
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
          setErrors((prev) => ({ ...prev, [norm.field]: norm.fieldMessage || norm.message }));
          focusFirstError(norm.field);
        }
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
        // (shipment_persistence_failed); ergänzend muss ein Sendungsbezug
        // vorliegen, mit dem /book, Label und Abholfenster arbeiten können.
        // Source-Metadaten bleiben bei blockiertem, NICHT verbrauchtem Entwurf
        // erhalten, damit ein bewusster erneuter Klick den Übergang neu versucht
        // (keine automatische Wiederholung).
        if (t.blocking || !hasUsableShipmentReference(d.shipmentId)) {
          setError(SHIPMENT_PERSISTENCE_FAILED_MESSAGE);
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
      setTariffs(d.tariffs || []);
      setShipmentId(d.shipmentId);
      setCeShipmentId(d.ceShipmentId ?? null);
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
      setHasResults(true);
      setLoading(false);
    } catch (e) {
      if (e?.name === "AbortError") return;      // abgebrochen (neuer Request/Unmount) → kein Fehler, Loading gehört dem neuen Request
      if (seq !== calcSeq.current) return;       // veralteter Request → ignorieren
      // Nur noch echte Ausnahmen (Verbindungsabbruch, unlesbare Antwort) — die
      // fachlichen Ablehnungen sind oben behandelt. Kein roher Technikertext
      // („Failed to fetch") mehr im Kundenbanner.
      setError(normalizeThrownError(e).message);
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
        setResumeNotice("Dieser Entwurf ist nicht mehr verfügbar. Du kannst die aktuellen Angaben als neue Sendung weiterverwenden.");
        setReloadingResume(false); return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!mountedRef.current) return;
      const payload = buildResumePayload(d?.draft);
      if (!r.ok || !isValidResumeDraft(payload)) throw new Error("Die aktuelle Version konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
      const init = buildResumeInitialState(payload.formData, { today: todayISO() });
      setForm(init.form);
      setShippingDate(init.shippingDate || todayISO());
      setServiceFilter(init.serviceFilter);
      setShippingModeFilter(init.shippingModeFilter);
      setSelectedPublicCarrierIds(init.selectedPublicCarrierIds);
      setInventoryContext(init.inventoryContext); // Audit-Finding 1/3: Lagerbezug + Hinweis folgen der geladenen Version
      resetResults();                                  // frische Grundlage → alte Ergebnisse verwerfen
      setResumeSource(resumeSourceFromDraft(payload)); // aktualisierte Revision
      setResumeConflict(false); setResumeNotice("");
    } catch (e) {
      if (mountedRef.current) setError(e?.message || "Die aktuelle Version konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
    }
    if (mountedRef.current) setReloadingResume(false);
  };

  // useCallback mit vollständigen Dependencies: Der Buchungs-Payload (tariff,
  // shipmentId, form, customs) bleibt exakt gleich; die Referenz ist nur stabil,
  // solange sich diese Werte nicht ändern → memoisierte OfferCards rendern durch
  // onBook nicht unnötig neu (bei reinen Angebots-Interaktionen ändern sie sich
  // nicht). setSelected ist als State-Setter stabil.
  const handleBook = useCallback((tariff) => {
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
      navigate("/booking", { state: { tariff, shipmentId, ceShipmentId, form, customs }, replace: ausRueckkehr });
    } else {
      navigate("/login");
    }
  }, [authed, shipmentId, ceShipmentId, form, customs, navigate, setFlowScope, setFlowStep]);

  // Stabiles senderPrefill-Objekt (nur Paketshop-Suche bei Dropoff nutzt es) →
  // sonst bräche ein neues Objekt bei jedem Render den React.memo-Vergleich der
  // OfferCards. Werte 1:1 wie zuvor.
  const senderPrefill = useMemo(
    () => ({ postCode: form.s_zip, city: form.s_city, country: form.s_country, street: form.s_street }),
    [form.s_zip, form.s_city, form.s_country, form.s_street]
  );

  // ── Address field helpers ──
  // ── Adressvalidierung (Absender und Empfänger) ─────────────────────────────
  // Ein Hook je Adresse. Er prüft ausschließlich Land, PLZ, Ort und Straßenname —
  // Name, Firma, Telefon und E-Mail werden nie mitgeschickt. Für Länder ohne
  // Abdeckung (alles außer DE/AT/CH/LI) bleibt der Ablauf unverändert: der Hook
  // meldet dann `unsupported` und zeigt gar nichts an.
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

  // Ein Vorschlag korrigiert die Schreibweise der STRASSE und behält die vom Kunden
  // eingegebene Hausnummer bei — sie wird weder verworfen noch erfunden.
  const applyStreet = (prefix, suggestion) => {
    const key = `${prefix}_street`;
    const text = typeof suggestion === "string" ? suggestion : suggestion?.street;
    upd(key, applyStreetSuggestion(form[key], text));
  };

  // Ein eindeutiger Widerspruch (PLZ/Ort nachweislich unvereinbar) blockiert die
  // Preisberechnung. `unverified` und `unavailable` blockieren AUSDRÜCKLICH nicht —
  // eine Datenlücke oder ein Ausfall des Prüfdienstes darf niemanden am Versand hindern.
  const addressBlocksCalculation =
    addressBlocksSubmit(senderCheck.status) || addressBlocksSubmit(recipientCheck.status);

  /* ── Felder dieser Seite laufen über <Field labelMode="floating" /> ─────────
     Prototyp der künftigen systemweiten Feldsprache: die Beschriftung liegt IM
     Feld und wandert bei Fokus oder vorhandenem Wert nach oben. Aktiviert ist
     das ausschließlich hier — jede andere Seite nutzt dieselbe Komponente
     unverändert im gestapelten Modus bzw. gar nicht.

     Nebenbei geschlossen: die Beschriftungen dieser Seite hatten bisher weder
     `id` noch `htmlFor` (13 Stellen). Ein Label ohne Verbindung ist für einen
     Screenreader kein Label — <Field /> erzwingt beides. Ebenso trägt jedes Feld
     jetzt `data-field`, womit focusFirstError() nach einem Serverfehler nicht
     mehr nur die beiden PLZ-Felder findet. */
  const addrField = (p, key, label, type = "text", placeholder = "", optional = false) => {
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
        placeholder={placeholder}
        error={errors[fk]}
      />
    );
  };

  // PLZ: Beschriftung und Beispiel sind zwei verschiedene Dinge. Der Platzhalter
  // trägt deshalb ausschließlich das landesabhängige Beispiel — der frühere
  // Rückfallwert "PLZ" hätte im Floating-Modus nur die Beschriftung wiederholt.
  // Hinweiszeile, Eingabemodus, Maximallänge und Validierung sind unverändert.
  const zipField = (p) => {
    const fk = `${p}_zip`;
    const land = form[`${p}_country`];
    const beispiel = postalCodeExample(land);
    return (
      <Field
        id={`ns-${p}-zip`}
        fieldKey={fk}
        labelMode="floating"
        label="PLZ"
        required
        value={form[fk]}
        onChange={(v) => upd(fk, v)}
        placeholder={beispiel || ""}
        inputMode={postalCodeInputMode(land)}
        maxLength={postalCodeMaxLength()}
        error={errors[fk]}
        hint={beispiel
          ? `Beispiel: ${beispiel}`
          : (!isPostalCodeRequired(land) ? "Für dieses Land optional." : undefined)}
      />
    );
  };

  // Das Land startet LEER. Ein vorausgewähltes „DE" war eine Annahme über die
  // Sendung — beim Empfänger besonders fragwürdig, und beim Absender überschrieb
  // sie stillschweigend das, was im Konto stand. Die Auswahl bleibt Pflicht
  // (getErrors), die Optionsliste ist unverändert dieselbe wie überall sonst.
  // Ein <select> zeigt immer einen Wert an — auch „Land auswählen" ist einer.
  // Es gibt dort keinen sichtbaren Leerzustand, den eine ruhende Beschriftung
  // besetzen könnte; ihr Label steht deshalb dauerhaft oben (in <Field /> aus
  // `as="select"` abgeleitet), statt einen Leerzustand vorzutäuschen.
  const countrySelect = (p) => (
    <Field
      id={`ns-${p}-country`}
      fieldKey={`${p}_country`}
      as="select"
      labelMode="floating"
      label="Land"
      required
      value={form[`${p}_country`]}
      onChange={(v) => upd(`${p}_country`, v)}
      error={errors[`${p}_country`]}
    >
      <option value="">Land auswählen</option>
      {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
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
        as="select"
        labelMode="floating"
        label="Bundesstaat"
        required
        value={form[`${p}_state`]}
        onChange={(v) => upd(`${p}_state`, v)}
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

      {/* Kein .page-body hier: der Elternknoten (DashboardPage.jsx, page==="new")
          bringt .page-body bereits mit — .calc-page-wrap liefert nur noch das
          vertikale Innenabstandsmaß (Paket B, keine zweite max-width). */}
      <div className="calc-page-wrap">
        <div className="mb-24">
          {/* "Neue Sendung" ist bereits der Seitentitel im PageHeader
              (DashboardPage.jsx, PAGE_HEADERS.new). Dieser Titel war bisher ein
              zweiter, konkurrierender <h1> — er wird zum Abschnittskopf der
              Formularsektion herabgestuft (Paket B), Inhalt bleibt erhalten. */}
          <h2 className="calc-page-title">Versandpreis berechnen</h2>
          <p className="calc-page-sub">Vergleichen Sie Preise von 8+ Carriern in Echtzeit</p>
        </div>

        {/* ── Form section ── */}
        <div className="offers-form-section">

          {/* Fortsetzen-Kontext (nur bei aktivem Formularentwurf-Übergang). */}
          {resumeSource && !resumeConflict && (
            <div className="dft-resume-note" role="note">
              <Icon n="form" s={16} c="var(--ce-color-brand-ink)" />
              <span>Sie setzen einen gespeicherten Formularentwurf fort. Prüfen Sie die Angaben und berechnen Sie die Preise neu.</span>
            </div>
          )}
          {resumeConflict && (
            <div className="dft-resume-conflict" role="alert">
              <Icon n="info" s={16} c="currentColor" />
              <span className="dft-resume-conflict-text">Dieser Entwurf wurde inzwischen geändert. Lade die aktuelle Version neu, bevor du fortfährst.</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={reloadFormDraft} disabled={reloadingResume}>
                {reloadingResume ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Wird geladen …</> : "Aktuelle Version laden"}
              </button>
            </div>
          )}
          {resumeNotice && (
            <div className="dft-resume-info" role="status">
              <Icon n="info" s={16} c="currentColor" /><span>{resumeNotice}</span>
            </div>
          )}
          {/* Herkunftshinweis eines Vorgangs aus Lager oder Auftrag. Bewusst
              derselbe Hinweisstil wie beim Fortsetzen eines Entwurfs — es gibt
              keine zweite Hinweisdarstellung. Bei jeder normalen Sendung ist der
              Text leer und die Zeile erscheint nicht. */}
          {inventoryNotice && (
            <div className="dft-resume-info" role="status">
              <Icon n="layers" s={16} c="currentColor" /><span>{inventoryNotice}</span>
            </div>
          )}

          {/* Obere Premium-Filterleiste: fünf Filter nebeneinander (Desktop),
              responsives Grid auf Tablet/Mobile. Reine Darstellung. */}
          <div className="calc-filter-bar mb-16">
            {/* Service Filter */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setServiceFilterOpen(o => !o)}
                aria-expanded={serviceFilterOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n={selectedOption.icon} s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Abholung / Shopabgabe</div>
                    <div className="service-filter-trigger-val">{selectedOption.label}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${serviceFilterOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {serviceFilterOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Abholung / Shopabgabe">
                  {SERVICE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ${serviceFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleServiceFilter(opt.id)}
                      role="radio"
                      aria-checked={serviceFilter === opt.id}
                    >
                      <span className="service-filter-radio" aria-hidden="true" />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Versanddatum */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setDatePickerOpen(o => !o)}
                aria-expanded={datePickerOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="clock" s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Versanddatum</div>
                    <div className="service-filter-trigger-val">{labelForDate(shippingDate)}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${datePickerOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {datePickerOpen && (
                <div className="date-picker-body">
                  <div className="date-quick-options">
                    <button className={`date-quick-btn ${shippingDate === todayISO()    ? "active" : ""}`} onClick={() => handleDateChange(todayISO())}>Heute</button>
                    <button className={`date-quick-btn ${shippingDate === addDaysISO(1) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(1))}>Morgen</button>
                    <button className={`date-quick-btn ${shippingDate === addDaysISO(2) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(2))}>Übermorgen</button>
                  </div>
                  <DateCalendar
                    value={shippingDate}
                    onSelect={handleDateChange}
                    minDate={todayISO()}
                    onClose={() => setDatePickerOpen(false)}
                  />
                </div>
              )}
            </div>

            {/* Carrier Filter */}
            <div className="calc-panel" ref={carrierRef}>
              <button
                className="service-filter-trigger"
                onClick={() => setCarrierDropdownOpen(o => !o)}
                aria-expanded={carrierDropdownOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="truck" s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Versanddienst</div>
                    <div className="service-filter-trigger-val">{carrierLabel}</div>
                  </div>
                  {selectedPublicCarrierIds.length > 0 && (
                    <span className="carrier-badge">{selectedPublicCarrierIds.length}</span>
                  )}
                </div>
                <div className={`service-filter-chevron ${carrierDropdownOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {carrierDropdownOpen && (
                <div className="carrier-dropdown" role="group" aria-label="Versanddienst">
                  {/* Multi-Select mit Premium-Radio-Optik (wie „Versandart"): runder
                      Auswahlkreis + Label. role="checkbox" behält die Mehrfachauswahl-
                      Semantik; Chip-Key = publicCarrier.id, Label = publicCarrier.name
                      („other" → „Versanddienstleister"). */}
                  <button
                    type="button"
                    className={`service-filter-option service-filter-option--radio ${selectedPublicCarrierIds.length === 0 ? "selected" : ""}`}
                    role="checkbox"
                    aria-checked={selectedPublicCarrierIds.length === 0}
                    onClick={() => { setSelectedPublicCarrierIds([]); resetResults(); }}
                  >
                    <span className="service-filter-radio" aria-hidden="true" />
                    <div className="service-filter-option-text">
                      <div className="service-filter-option-label">Alle Dienstleister</div>
                    </div>
                  </button>
                  {publicCarriers.length === 0 ? (
                    <div className="carrier-empty-hint">Noch keine Versanddienstleister verfügbar</div>
                  ) : (
                    <>
                      <div className="carrier-divider" />
                      {publicCarriers.map(pc => (
                        <button
                          key={pc.id}
                          type="button"
                          className={`service-filter-option service-filter-option--radio ${selectedPublicSet.has(pc.id) ? "selected" : ""}`}
                          role="checkbox"
                          aria-checked={selectedPublicSet.has(pc.id)}
                          onClick={() => handleTogglePublicCarrier(pc.id)}
                        >
                          <span className="service-filter-radio" aria-hidden="true" />
                          <div className="service-filter-option-text">
                            <div className="service-filter-option-label">{publicCarrierChipLabel(pc)}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Versandart */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setShippingModeOpen(o => !o)}
                aria-expanded={shippingModeOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n={selectedShippingMode.icon} s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Versandart</div>
                    <div className="service-filter-trigger-val">{selectedShippingMode.label}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${shippingModeOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {shippingModeOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Versandart">
                  {SHIPPING_MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ${shippingModeFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleShippingMode(opt.id)}
                      role="radio"
                      aria-checked={shippingModeFilter === opt.id}
                    >
                      <span className="service-filter-radio" aria-hidden="true" />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Späteste Lieferzeit — collapsible (reiner Client-Filter, kein Recalc) ── */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setLatestOpen(o => !o)}
                aria-expanded={latestOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="calendar" s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Späteste Lieferzeit</div>
                    <div className="service-filter-trigger-val">{latestDeliveryFieldValue(
                      form.latestDeliveryDate ? fmtShortDE(form.latestDeliveryDate) : "",
                      form.latestDeliveryTime,
                    )}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${latestOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {latestOpen && (
                <div className="date-picker-body date-picker-body--latest">
                  <div className="date-quick-options">
                    <button className={`date-quick-btn ${!form.latestDeliveryDate ? "active" : ""}`} onClick={() => handleLatestDeliveryChange("")}>Beliebig</button>
                  </div>
                  <DateCalendar
                    value={form.latestDeliveryDate}
                    onSelect={handleLatestDeliveryChange}
                    minDate={shippingDate}
                    onClose={() => setLatestOpen(false)}
                  />
                  <DeliveryTimeSelect
                    options={zeitOptionen}
                    value={form.latestDeliveryTime}
                    onChange={handleLatestDeliveryTimeChange}
                    hasDate={!!form.latestDeliveryDate}
                    idPrefix="ns-form"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Versandroute */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="globe" s={18} c="var(--ce-color-brand-ink)" /><h3>Versandroute</h3></div>
            <div className="calc-panel-body">
              <div className="booking-addr-grid">
                <div>
                  {/* Die Adressbuchauswahl steht IN der Überschriftszeile, nicht
                      als zweiter großer Knopf darunter: sie ist eine Abkürzung
                      neben einem vollständig bedienbaren Formular. Auf schmalen
                      Viewports bricht die Zeile um (flex-wrap), der Auslöser
                      rutscht unter die Überschrift — nichts wird abgeschnitten. */}
                  <div className="calc-section-head">
                    <div className="calc-section-title">Absender</div>
                    {/* Zwei Abkürzungen nebeneinander, beide ausdrücklich vom
                        Nutzer ausgelöst: die eigene Kontoanschrift und das
                        Adressbuch. Der frühere automatische Profil-Prefill ist
                        genau dadurch ersetzt — dieselben Daten, nur auf Wunsch.
                        Ohne hinterlegte Kontoanschrift erscheint der linke
                        Knopf gar nicht erst: eine Aktion, die sichtbar nichts
                        tut, ist schlechter als keine. */}
                    {profilAbsenderVerfuegbar && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={uebernimmProfilAbsender}
                        disabled={loading}
                        title="Absenderadresse aus Ihrem Konto übernehmen"
                      >
                        <Icon n="user" s={16} />
                        Eigene Adresse
                      </button>
                    )}
                    <AddressPickerButton
                      tab={TAB_SENDER}
                      onSelect={(a) => uebernimmAdressbuchAdresse(a, "s")}
                      disabled={loading}
                      title="Absenderadresse aus dem Adressbuch wählen"
                    />
                  </div>
                  {addressNote.s && <p className="calc-section-note">{addressNote.s}</p>}
                  {addrField("s", "company",  "Unternehmen",       "text",  "Firma GmbH",     true)}
                  {addrField("s", "fullName", "Vor- und Nachname", "text",  "Max Mustermann")}
                  <AddressSuggestInput
                    id="ns-s-street"
                    floating
                    label="Straße & Hausnr."
                    required
                    value={form.s_street}
                    onChange={(v) => upd("s_street", v)}
                    onSelect={(item) => applyStreet("s", item)}
                    suggestions={senderCheck.streetOptions}
                    placeholder="Musterstraße 1"
                    error={errors.s_street}
                    autoComplete="address-line1"
                  />
                  {addrField("s", "addition", "Adresszusatz",      "text",  "Etage, c/o …",   true)}
                  <div className="field-row field-row-2">
                    {zipField("s")}
                    <AddressSuggestInput
                      id="ns-s-city"
                      floating
                      label="Stadt"
                      required
                      value={form.s_city}
                      onChange={(v) => upd("s_city", v)}
                      onSelect={(item) => upd("s_city", typeof item === "string" ? item : item.city)}
                      suggestions={senderCheck.cityOptions}
                      placeholder="Stuttgart"
                      error={errors.s_city}
                      autoComplete="address-level2"
                    />
                  </div>
                  {countrySelect("s")}
                  {stateSelect("s")}
                  {/* Ergebnis der Adressprüfung. Erscheint erst, wenn es etwas zu sagen gibt —
                      im Ausgangszustand und für Länder ohne Abdeckung bleibt hier nichts stehen. */}
                  <AddressStatusLine
                    status={senderCheck.status}
                    acknowledged={senderCheck.acknowledged}
                    onAcknowledge={senderCheck.acknowledge}
                    citySuggestions={senderCheck.cityOptions}
                    onPickCity={(c) => upd("s_city", c)}
                  />
                  {addrField("s", "phone", "Telefon", "tel",   "+49 711 …",    true)}
                  {addrField("s", "email", "E-Mail",  "email", "max@firma.de", true)}
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
                  {addrField("r", "company",  "Unternehmen",       "text",  "Firma AG",     true)}
                  {addrField("r", "fullName", "Vor- und Nachname", "text",  "Erika Muster")}
                  <AddressSuggestInput
                    id="ns-r-street"
                    floating
                    label="Straße & Hausnr."
                    required
                    value={form.r_street}
                    onChange={(v) => upd("r_street", v)}
                    onSelect={(item) => applyStreet("r", item)}
                    suggestions={recipientCheck.streetOptions}
                    placeholder="Beispielweg 5"
                    error={errors.r_street}
                    autoComplete="address-line1"
                  />
                  {addrField("r", "addition", "Adresszusatz",      "text",  "Etage, c/o …", true)}
                  <div className="field-row field-row-2">
                    {zipField("r")}
                    <AddressSuggestInput
                      id="ns-r-city"
                      floating
                      label="Stadt"
                      required
                      value={form.r_city}
                      onChange={(v) => upd("r_city", v)}
                      onSelect={(item) => upd("r_city", typeof item === "string" ? item : item.city)}
                      suggestions={recipientCheck.cityOptions}
                      placeholder="Zürich"
                      error={errors.r_city}
                      autoComplete="address-level2"
                    />
                  </div>
                  {countrySelect("r")}
                  {stateSelect("r")}
                  {/* Ergebnis der Adressprüfung. Erscheint erst, wenn es etwas zu sagen gibt —
                      im Ausgangszustand und für Länder ohne Abdeckung bleibt hier nichts stehen. */}
                  <AddressStatusLine
                    status={recipientCheck.status}
                    acknowledged={recipientCheck.acknowledged}
                    onAcknowledge={recipientCheck.acknowledge}
                    citySuggestions={recipientCheck.cityOptions}
                    onPickCity={(c) => upd("r_city", c)}
                  />
                  {addrField("r", "phone", "Telefon", "tel",   "+41 44 …",       true)}
                  {addrField("r", "email", "E-Mail",  "email", "erika@firma.ch", true)}
                </div>
              </div>
            </div>
          </div>

          {/* Paketdaten */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="package" s={18} c="var(--ce-color-brand-ink)" /><h3>Paketdaten</h3></div>
            <div className="calc-panel-body">
              {/* Reihenfolge: Anzahl · Gewicht · Länge · Breite · Höhe (nur Anzeige;
                  Bindings/State-Keys/Validierung unverändert). Anzahl = Anzahl
                  identischer Pakete (pro Paket: Gewicht + Maße), nur an /calculate-price. */}
              {/* Die Einheit steht nicht mehr im sichtbaren Beschriftungstext
                  („Gewicht kg *"), sondern als eigenes, dekoratives Zeichen rechts
                  im Feld. Für Screenreader trägt die Beschriftung sie unsichtbar
                  weiter (unitLabel) — sichtbar „Gewicht", vorgelesen „Gewicht in
                  Kilogramm", nicht doppelt. Die Platzhalter bleiben unverändert
                  Beispiele aus PACKAGE_PLACEHOLDERS und werden nie zu Werten. */}
              <div className="field-row field-row-5">
                <Field id="ns-packageCount" fieldKey="packageCount" labelMode="floating"
                       label="Anzahl" required type="number" min="1" max="99" step="1"
                       value={form.packageCount} onChange={(v) => upd("packageCount", v)}
                       placeholder={PACKAGE_PLACEHOLDERS.packageCount}
                       error={errors.packageCount} hint="Identische Pakete" />
                <Field id="ns-weight" fieldKey="weight" labelMode="floating"
                       label="Gewicht" required type="number" unit="kg" unitLabel="in Kilogramm"
                       value={form.weight} onChange={(v) => upd("weight", v)}
                       placeholder={PACKAGE_PLACEHOLDERS.weight} error={errors.weight} />
                <Field id="ns-length" fieldKey="length" labelMode="floating"
                       label="Länge" required type="number" unit="cm" unitLabel="in Zentimetern"
                       value={form.length} onChange={(v) => upd("length", v)}
                       placeholder={PACKAGE_PLACEHOLDERS.length} error={errors.length} />
                <Field id="ns-width" fieldKey="width" labelMode="floating"
                       label="Breite" required type="number" unit="cm" unitLabel="in Zentimetern"
                       value={form.width} onChange={(v) => upd("width", v)}
                       placeholder={PACKAGE_PLACEHOLDERS.width} error={errors.width} />
                <Field id="ns-height" fieldKey="height" labelMode="floating"
                       label="Höhe" required type="number" unit="cm" unitLabel="in Zentimetern"
                       value={form.height} onChange={(v) => upd("height", v)}
                       placeholder={PACKAGE_PLACEHOLDERS.height} error={errors.height} />
              </div>
              <p className="pkg-count-note">
                <Icon n="info" s={13} c="currentColor" />
                <span>Gewicht und Maße gelten je Paket. Der Preis gilt für alle Pakete zusammen.</span>
              </p>
              {volWeight && (
                <div className="vol-weight-box">
                  <span className="vol-weight-label">Volumengewicht: {volWeight} kg</span>
                  <span className="vol-weight-value">Abrechn.: {chargeWeight} kg</span>
                </div>
              )}
            </div>
          </div>

          {/* Calculate CTA + sichtbare „Als Entwurf speichern"-Aktion (sekundär) */}
          <div className="offers-calc-cta">
            <div className="dft-cta-row">
              {/* Ein eindeutiger PLZ/Ort-Widerspruch blockiert die Preisberechnung: eine
                  Tarifabfrage mit einer nachweislich unmöglichen Adresse liefert nur
                  wertlose Ergebnisse. `unverified`/`unavailable` blockieren NICHT — eine
                  Datenlücke darf niemanden am Versand hindern. */}
              <button
                className="btn btn-primary btn-lg dft-cta-primary"
                onClick={calculate}
                disabled={loading || !calcValid || saving || addressBlocksCalculation}
                title={addressBlocksCalculation
                  ? "Bitte korrigieren Sie zuerst PLZ und Ort."
                  : (calcHint || paketHinweis || undefined)}
              >
                {loading
                  ? <><span className="spinner" /> Berechne…</>
                  : <><Icon n="zap" s={18} /> Angebote vergleichen</>
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
                  : <><Icon n="form" s={16} /> Als Entwurf speichern</>
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
                <Icon n="info" s={15} c="currentColor" /><span>{flowNotice}</span>
              </div>
            )}

            {/* Erklärt den deaktivierten CTA. Ohne diesen Hinweis wirkt ein
                fortgesetzter, unvollständiger Entwurf wie ein toter Button:
                die Felder sind zwar markiert, liegen aber weiter oben außerhalb
                des Sichtbereichs. Die Felder selbst bleiben die Detailanzeige. */}
            {calcHint && !loading && (
              <div className="dft-save-status" role="status">
                <Icon n="info" s={15} c="currentColor" /><span>{calcHint}</span>
              </div>
            )}

            {/* Erklärt den deaktivierten CTA auf einem FRISCHEN Formular, ohne
                ein einziges Feld rot zu markieren. `calcHint` speist sich aus
                bereits sichtbaren Fehlern und ist vor dem ersten Klick leer —
                der Kunde stünde sonst vor einem toten Knopf ohne Begründung.
                Sobald geklickt wurde, übernimmt `calcHint` (spezifischer). */}
            {!calcHint && paketHinweis && !loading && (
              <div className="dft-save-status" role="status">
                <Icon n="info" s={15} c="currentColor" /><span>{paketHinweis}</span>
              </div>
            )}

            {showInlineSave && saveStatus === "saved" && !isDirty && !saving && (
              <div className="dft-save-status" role="status"><Icon n="check" s={15} c="var(--success)" /><span>Entwurf gespeichert.</span></div>
            )}
            {showInlineSave && saveMode === "error" && (
              <div className="dft-save-alert" role="alert"><Icon n="info" s={14} c="currentColor" /><span>Der Entwurf konnte nicht gespeichert werden. Bitte versuche es erneut.</span></div>
            )}
            {/* Getrennt von "error": hier hilft kein erneuter Versuch, sondern nur
                die Korrektur des markierten Feldes. */}
            {showInlineSave && saveMode === "fieldError" && (
              <div className="dft-save-alert" role="alert"><Icon n="info" s={14} c="currentColor" /><span>Eine Angabe im Formular ist nicht gültig. Das markierte Feld bitte korrigieren und erneut speichern.</span></div>
            )}
            {showInlineSave && saveMode === "notFound" && (
              <div className="dft-save-alert" role="status"><Icon n="info" s={14} c="currentColor" /><span>Dieser Entwurf ist nicht mehr verfügbar. Du kannst die aktuellen Angaben als neuen Entwurf speichern.</span></div>
            )}
            {showInlineSave && saveMode === "rateLimited" && (
              <div className="dft-save-alert" role="alert"><Icon n="info" s={14} c="currentColor" /><span>Zu viele Speicheranfragen. Bitte versuche es in Kürze erneut.</span></div>
            )}
            {showInlineSave && saveMode === "conflict" && (
              <div className="dft-save-alert dft-save-conflict" role="alert">
                <Icon n="info" s={14} c="currentColor" />
                <span className="dft-save-conflict-text">Dieser Entwurf wurde inzwischen an anderer Stelle geändert.</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={reloadCurrentDraft} disabled={saving}>
                  {saving ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Wird geladen …</> : "Aktuelle Version laden"}
                </button>
              </div>
            )}
            {error && <div className="alert alert-error mt-16"><Icon n="x" s={16} />{error}</div>}
          </div>
        </div>

        {/* ── Offers section ── */}
        {/* Stabiler Anker für die Rückkehr aus der Buchung: Ohne gemerkte
            Scrollposition wird gezielt hierher gescrollt — kein Pixelwert. */}
        {(hasResults || loading) && (
          <div ref={offersRef} id="angebotsbereich">
          <OffersList
            sorted={sorted}
            filtered={filtered}
            tariffs={tariffs}
            loading={loading}
            hasResults={hasResults}
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
          />
          </div>
        )}
      </div>
    </div>
  );
}
