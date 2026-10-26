import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { normalizeCountryCode } from "../utils/countries";
import { useLaunchScope } from "../hooks/useLaunchScope";
import { publicCarrierChipLabel, publicCarrierDisplay, publicServiceName } from "../utils/carrierMap";
import { applyResultFilters, lateResultOffers, deliveryDeadlineAssessment, DELIVERY_DEADLINE }
  from "../utils/offersFilterView.mjs";
import { deliveryDeadlineOptions } from "../utils/deliveryTimeView.mjs";
import { revealOffers } from "../utils/revealOffers.mjs";
import { OffersList } from "../components/offers/OffersList";
import { ShipmentFilterBar } from "../components/offers/ShipmentFilterBar";
import { OfferComparisonLoadingOverlay } from "../components/offers/OfferComparisonLoadingOverlay";
import { useComparisonLoadingFocus } from "../hooks/useComparisonLoadingFocus";
import { useShippingWarmup } from "../hooks/useShippingWarmup";
import { useAuth } from "../context/AuthContext";
import { todayISO } from "../utils/date";
import { FormAlert } from "../components/ui/FormAlert";
import { errorFromResponse, normalizeThrownError, summaryMessage } from "../utils/apiError.mjs";
import { sourceCoverageNotice } from "../utils/sourceCoverageView.mjs";
import { getCalculatorErrors, firstErrorField, CALCULATOR_FIELD_MAP, CITY_MAX_LENGTH } from "../utils/calculatorValidation.mjs";
import { focusFirstError } from "../utils/focusField";
import { visibleFieldErrors, markFieldTouched, withoutFieldError, keepFocusOnMouseDown } from "../utils/fieldTouchState.mjs";
import { Field } from "../components/ui/Field";
import { DEFAULT_ORIGIN_COUNTRY } from "../utils/newShipmentForm.mjs";
import {
  formPackageLines, formPatchFromPackageLines, hasExtraPackageLines, hasMixedPackageLines, packageLinesKey, packageLinesPayload,
} from "../utils/packageLines.mjs";
import { PackageLinesEditor } from "../components/shipping/PackageLinesEditor";
import { postalCodeHint, postalCodeInputMode, postalCodeMaxLength } from "../utils/postalCode";
import { useShippingFlow } from "../context/ShippingFlowContext";
import { formHasInput, droppedNotice } from "../utils/shippingFlowState.mjs";
import { calculatorSelectionToShipmentTransfer } from "../utils/calculatorShipmentHandoff.mjs";
import { OFFER_SELECTION_STAGE } from "../utils/offerIdentity.mjs";
import { AddressSuggestInput } from "../components/address/AddressSuggestInput";
import { useAddressValidation } from "../hooks/useAddressValidation";
import { cityFromSuggestion } from "../utils/addressValidationView.mjs";

// Reine Client-Filter (kein neuer /calculate-price-Request nötig): Änderungen
// hieran verwerfen KEINE bestehenden Angebote. Alle übrigen Formularfelder
// (Route + Paketdaten inkl. packageCount) invalidieren dagegen alte Angebote.
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
    const aMax = a.transitDaysMax ?? 999;
    const bMax = b.transitDaysMax ?? 999;
    if (aMax !== bMax) return aMax - bMax;
    const aMin = a.transitDaysMin ?? 999;
    const bMin = b.transitDaysMin ?? 999;
    if (aMin !== bMin) return aMin - bMin;
    return (a.netPrice ?? Infinity) - (b.netPrice ?? Infinity);
  });
  return copy;
}

// ─── Service options ─────────────────────────────────────────────────────────
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

export default function CalculatorPage() {
  // Nur die Länder, die ConfidaraExpress heute anbietet — die Liste kommt vom Server
  // (GET /api/shipping/launch-scope), nicht aus einer zweiten Aufzählung im Client.
  // Zwei Listen: die Herkunft ist auf die Versandursprünge beschränkt, das Ziel nicht.
  const { countries: launchCountries, originCountries: launchOriginCountries } = useLaunchScope();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Laufender Vorgang (mount-once) ──────────────────────────────────────────
  // Derselbe Provider wie in „Neue Sendung", eigener Bereich („calculator"):
  // die beiden Seiten führen fachlich verschiedene Formulare (Adressen vs.
  // Land/PLZ) und werden deshalb bewusst NICHT zusammengelegt — sie teilen sich
  // nur das Zustandsmodell und den Speicher.
  //
  // Wie dort läuft die Wiederherstellung ausschließlich über die
  // useState-Initialisierer. Ein feldweiser Restore über upd() würde
  // invalidateResults() auslösen und die Angebote sofort wieder verwerfen.
  const { calculator: flowCalculator, setScope: setFlowScope, clearScope: clearFlowScope,
          droppedReason, consumeDroppedReason } = useShippingFlow();
  const flowInitRef = useRef(undefined);
  if (flowInitRef.current === undefined) {
    flowInitRef.current = (flowCalculator
      && (formHasInput(flowCalculator.form, "calculator") || flowCalculator.tariffs.length > 0))
      ? flowCalculator : null;
  }
  const flowInit = flowInitRef.current;
  const flowNoticeRef = useRef(undefined);
  if (flowNoticeRef.current === undefined) {
    flowNoticeRef.current = flowInit ? droppedNotice(droppedReason) : null;
  }
  const [flowNotice, setFlowNotice] = useState(flowNoticeRef.current);

  // ── Service filter ──
  const [serviceFilter, setServiceFilter]         = useState(flowInit ? flowInit.serviceFilter : "all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);

  // ── Shipping mode filter ──
  const [shippingModeFilter, setShippingModeFilter] = useState(flowInit ? flowInit.shippingModeFilter : "all");
  const [shippingModeOpen, setShippingModeOpen]     = useState(false);

  // ── Shipping date ──
  const [shippingDate, setShippingDate]     = useState(() => (flowInit && flowInit.shippingDate) ? flowInit.shippingDate : todayISO());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // ── Sort ──
  const [sortMode, setSortMode] = useState(flowInit ? flowInit.sortMode : "recommended");

  // ── VAT display mode ──
  const [vatMode, setVatMode] = useState(flowInit ? flowInit.vatMode : "net");

  // ── Carrier filter ──
  const [selectedPublicCarrierIds, setSelectedPublicCarrierIds] = useState(flowInit ? flowInit.selectedPublicCarrierIds : []);
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [publicCarriers, setPublicCarriers]           = useState(flowInit ? flowInit.publicCarriers : []);
  const carrierRef = useRef(null);

  // ── Späteste Lieferzeit — Popover-Status (Wert latestDeliveryDate liegt im form) ──
  const [latestOpen, setLatestOpen] = useState(false);

  // ── Form — route (country + zip) + package data only ──
  const [form, setForm] = useState(() => flowInit ? flowInit.form : ({
    // Wie in „Neue Sendung": über die Länderliste, nie roh aus dem Profil.
    // `users.country` ist VARCHAR(10) ohne CHECK — ein Wert wie „DEU" ginge sonst
    // unverändert an /calculate-price und ins Auswahlfeld, das ihn nicht anzeigen kann.
    // Absenderland: Deutschland, der einzige Ursprung, den der Server erlaubt (Auftrag 1, P11).
    // PLZ und Ort kommen nur dann aus dem Profil, wenn das Profil ebenfalls in Deutschland liegt —
    // sonst stünde eine fremde Postleitzahl unter „Deutschland". Der Ort wird NIE aus der
    // Postleitzahl abgeleitet.
    from_country: DEFAULT_ORIGIN_COUNTRY,
    from_zip:     normalizeCountryCode(user?.country) === DEFAULT_ORIGIN_COUNTRY ? (user?.zip || "") : "",
    from_city:    normalizeCountryCode(user?.country) === DEFAULT_ORIGIN_COUNTRY ? (user?.city || "") : "",
    // Das Empfängerland bleibt wie bisher frei wählbar (Auftrag 1, P11 ändert nur die Herkunft).
    to_country:   "DE",
    to_zip:       "",
    to_city:      "",
    packageCount: "1",
    weight: "", length: "", width: "", height: "",
    max_price: "", latestDeliveryDate: "", latestDeliveryTime: "",
  }));

  // ── Results ──
  const [tariffs, setTariffs]       = useState(flowInit ? flowInit.tariffs : []);
  const [selected, setSelected]     = useState(flowInit ? flowInit.selected : null);
  const [loading, setLoading]       = useState(false);
  // `error` trägt jetzt { title, message } statt eines einzelnen Strings, damit
  // die Meldung das Problem benennt UND die Korrektur erklärt.
  const [error, setError]           = useState(null);
  // Auftrag 2 / P5: Hinweis des Servers, dass die Angebotsliste unvollständig sein kann (null = nichts zu sagen).
  const [coverageNotice, setCoverageNotice] = useState(null);
  // Feldbezogene Fehler (Auftrag 1, P11, 2026-10-17). Geprüft wird immer mit
  // getCalculatorErrors(form) — der einzigen Regel dieses Formulars. SICHTBAR ist davon nur, was
  // der Kunde schon verlassen hat (`touched`) oder was ein Klick auf „Angebote vergleichen"
  // angefordert hat (`submitted`), dazu das `field` einer Serverantwort, bis das Feld geändert
  // wird. Unberührte leere Felder bleiben neutral; eine Korrektur nimmt die Markierung sofort weg.
  const [touched, setTouched]           = useState({});
  const [submitted, setSubmitted]       = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [focusRequest, setFocusRequest] = useState(null);
  const [hasResults, setHasResults] = useState(!!(flowInit && flowInit.tariffs.length > 0));
  // Zeitpunkt der Preisberechnung — trägt die Ablauffrist des Vorgangs.
  const calculatedAtRef = useRef(flowInit ? flowInit.calculatedAt : null);

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
  // kämen an einer State-Prüfung vorbei. Der Ref wirkt sofort. (Dieselbe
  // Konstruktion wie in NewShipmentPage; hier fehlte sie bislang — der Abort
  // verhinderte zwar zwei GLEICHZEITIGE Antworten, der zweite Klick löste aber
  // trotzdem einen weiteren Provideraufruf aus.)
  const calcInFlight = useRef(false);
  // Schlüssel der zuletzt ERFOLGREICH berechneten Angebote. Nur gesetzt, wenn
  // Tarife tatsächlich angekommen sind — ein Fehlversuch hinterlässt hier
  // nichts, der nächste Klick rechnet also neu.
  const lastCalcKeyRef = useRef("");
  /* Anker des Angebotsbereichs. Einziger Zweck: die bereits gültigen Angebote
     sichtbar machen, wenn der Wiederverwendungszweig greift und deshalb NICHT
     neu gerechnet wird. Dieselbe Rolle wie `offersRef` in NewShipmentPage. */
  const offersRef = useRef(null);
  // „Angebote vergleichen" — Rückgabeziel des Fokus nach einem Fehler.
  const calcCtaRef = useRef(null);
  // Während des Vergleichs ist der Seiteninhalt inert; wohin der Fokus danach
  // gehört, meldet calculate() hierüber (hooks/useComparisonLoadingFocus.js).
  const fokusNachVergleich = useComparisonLoadingFocus(loading, { offersRef, triggerRef: calcCtaRef });
  // „Versandbereich aktiv": still beim Betreten, beim Wieder-Sichtbarwerden und bei Aktivität nach Ruhe — der Server
  // wärmt ggf. den Anbieter vor, damit der spätere Vergleich nicht kalt startet (hooks/useShippingWarmup.js).
  useShippingWarmup();

  /* ── Spiegelung in den laufenden Vorgang ─────────────────────────────────
     Abhängigkeiten sind die tatsächlichen Zustandswerte; der Effekt läuft
     genau dann, wenn sich fachlich etwas geändert hat. setFlowScope ändert
     keine dieser Abhängigkeiten → keine Schleife. */
  useEffect(() => {
    setFlowScope("calculator", {
      form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
      sortMode, vatMode, tariffs, publicCarriers, selected,
      calculatedAt: calculatedAtRef.current,
    });
  }, [form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
      sortMode, vatMode, tariffs, publicCarriers, selected, setFlowScope]);

  // Der Ablaufhinweis wird genau einmal gezeigt.
  useEffect(() => {
    consumeDroppedReason();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Scrollposition wiederherstellen ─────────────────────────────────────
     Erst wenn die Angebote gerendert sind. Genau einmal je Mount; ohne
     wiederhergestellten Vorgang passiert nichts. */
  const scrollWiederhergestelltRef = useRef(false);
  useEffect(() => {
    if (scrollWiederhergestelltRef.current) return;
    const ziel = flowInit?.scrollY;
    if (!ziel) { scrollWiederhergestelltRef.current = true; return; }
    if (flowInit.tariffs.length > 0 && !hasResults) return;
    scrollWiederhergestelltRef.current = true;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, ziel));
    });
    return () => cancelAnimationFrame(id);
  }, [flowInit, hasResults]);

  const selectedOption       = SERVICE_OPTIONS.find(o => o.id === serviceFilter)            || SERVICE_OPTIONS[0];
  const selectedShippingMode = SHIPPING_MODE_OPTIONS.find(o => o.id === shippingModeFilter) || SHIPPING_MODE_OPTIONS[0];

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
    // Nur der Serverfehler DIESES Feldes fällt weg; alle übrigen Markierungen bleiben.
    setServerErrors(p => withoutFieldError(p, k));
    // Stale-State-Schutz (Muster wie NewShipmentPage): Ändert sich ein route-/
    // paketrelevantes Feld (nicht die reinen Client-Filter max_price/latestDeliveryDate),
    // werden alte Angebote sofort verworfen → nie veraltete Preise zu neuen
    // Eingaben (z. B. 1-Paket-Angebote nach Wechsel der Anzahl auf 3).
    if (!FILTER_ONLY_FIELDS.has(k)) invalidateResults();
  };

  // Paketzeilen (Canonical v2.79) — wie in „Neue Sendung“: Zeile 1 in die flachen Felder, weitere unter
  // `extraPackageLines`; die Serverfehler der geänderten Felder fallen weg, alte Angebote verfallen.
  const updPakete = (zeilen, { changedKeys = [] } = {}) => {
    setForm(p => ({ ...p, ...formPatchFromPackageLines(zeilen) }));
    setServerErrors(p => changedKeys.reduce((rest, k) => withoutFieldError(rest, k), p));
    invalidateResults();
  };

  // Die frühere Prüfung lief über EIN landesunabhängiges Regex und lieferte EINEN
  // Sammeltext. Dadurch bestand „4444" als deutsche PLZ, wurde ans Backend
  // geschickt, dort korrekt mit 422 abgelehnt — und die Ablehnung ging im Client
  // verloren. Jetzt greift dieselbe zentrale Landesregel wie in „Neue Sendung"
  // (src/utils/calculatorValidation.mjs → postalCode.mjs), und das Ergebnis ist
  // feldbezogen. Siehe dort auch die internationale Behandlung: keine pauschale
  // Fünfstelligkeit.

  // Ortsvorschläge zur PLZ — dieselbe zentrale Adresslogik wie in den Adressformularen, hier
  // ohne Straße (der Preisrechner fragt keine Straße ab) und damit ohne Gesamtprüfung.
  // Genau ein gefundener Ort wird in ein LEERES Feld übernommen; bei mehreren bleibt es bei
  // Vorschlägen. Ein bereits eingetragener Ort wird nie überschrieben.
  const fromCityHelp = useAddressValidation({ country: form.from_country, postalCode: form.from_zip, city: form.from_city, street: "" });
  const toCityHelp = useAddressValidation({ country: form.to_country, postalCode: form.to_zip, city: form.to_city, street: "" });
  useEffect(() => {
    if (fromCityHelp.cityOptions.length === 1 && !String(form.from_city || "").trim()) upd("from_city", fromCityHelp.cityOptions[0]);
  }, [fromCityHelp.cityOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (toCityHelp.cityOptions.length === 1 && !String(form.to_city || "").trim()) upd("to_city", toCityHelp.cityOptions[0]);
  }, [toCityHelp.cityOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Das Volumengewicht ist ein Wert für EIN Paket — es steht deshalb nur bei einer Paketzeile.
  const volWeight = !hasExtraPackageLines(form) && form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  // Maße sind seit „verpflichtende Paketmaße" ebenfalls Pflicht — ohne sie gibt
  // es keinen Tarif mehr (weder hier noch serverseitig).
  // Ort beider Seiten ist Pflicht: der Server ersetzte einen fehlenden Ort bisher
  // still durch die Hauptstadt des Landes (COUNTRY_DEFAULTS) — der Kunde bekam
  // einen Tarif für „Berlin", ohne das je gesagt zu haben. Dieselbe Klasse
  // stiller Ersatzwerte wie zuvor bei den Paketmaßen.
  // Sichtbare Feldfehler, abgeleitet (siehe oben). Kein zweiter Regelsatz: dieselbe Funktion
  // entscheidet über Markierung, Klickprüfung und Request.
  const liveFieldErrors = useMemo(() => getCalculatorErrors(form).fieldErrors, [form]);
  const fieldErrors = visibleFieldErrors({ live: liveFieldErrors, touched, submitted, server: serverErrors });
  const markTouched = (k) => setTouched(t => markFieldTouched(t, k));
  // Fokus erst NACH dem Rendern der Markierungen — dann trägt das Feld schon aria-invalid und
  // seinen Fehlertext.
  useEffect(() => {
    if (focusRequest && focusRequest.field) focusFirstError(focusRequest.field);
  }, [focusRequest]);

  const resetResults = () => {
    setHasResults(false);
    setTariffs([]);
    setCoverageNotice(null);
    setSelected(null);
    setError(null);
    // Feldmarkierungen bleiben: ob ein Feld rot ist, entscheidet seine eigene Prüfung (siehe
    // `fieldErrors`). Bis 2026-10 löschte jede Eingabe hier ALLE Markierungen (Auftrag 1, P11).
    calculatedAtRef.current = null;
    setFlowNotice(null);
  };

  // Verwirft ein vorhandenes Ergebnis nur, wenn überhaupt eines existiert —
  // vermeidet unnötige Re-Renders bei jedem Tastendruck im noch leeren Formular
  // (vor der ersten Berechnung gibt es nichts zu invalidieren).
  const invalidateResults = () => {
    if (hasResults || tariffs.length > 0 || selected) resetResults();
  };

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

  // `filtered` ist vollständig aus tariffs + den reinen Client-Filtern
  // (max_price, späteste Lieferzeit) ableitbar → als useMemo statt State +
  // useEffect + setFiltered. Das spart pro Filteränderung (v. a. Preis-Slider)
  // den zusätzlichen zweiten Render (setFiltered) und wendet den Filter im selben
  // Render an. Filterbedingungen und Reihenfolge sind unverändert; tariffs wird
  // nie mutiert (Kopie via Spread).
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

  // TG-L2: fällt die Auswahl durch eine neue Frist in die eingeklappte Gruppe „Zu spät", wird sie gelöst. Nur bei
  // einer Änderung der Frist: wer „Zu spät" aufklappt und dort bewusst wählt, behält seine Wahl.
  useEffect(() => {
    if (!form.latestDeliveryDate) return;
    const frist = { latestDeliveryDate: form.latestDeliveryDate, latestDeliveryTime: form.latestDeliveryTime };
    setSelected((vorher) => (vorher && deliveryDeadlineAssessment(vorher, frist) === DELIVERY_DEADLINE.TOO_LATE
      ? null : vorher));
  }, [form.latestDeliveryDate, form.latestDeliveryTime]);

  const handleServiceFilter = (id) => {
    setServiceFilter(id);
    setServiceFilterOpen(false);
    resetResults();
  };

  const handleShippingMode = (id) => {
    setShippingModeFilter(id);
    setShippingModeOpen(false);
    resetResults();
  };

  const handleDateChange = (iso) => {
    if (!iso || iso < todayISO()) return;
    setShippingDate(iso);
    setDatePickerOpen(false);
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
    from_country: form.from_country, from_zip: form.from_zip,
    to_country:   form.to_country,   to_zip:   form.to_zip,
    packageCount: form.packageCount, weight:   form.weight,
    length:       form.length,       width:    form.width, height: form.height,
    // Weitere Paketzeilen (Canonical v2.79) — leer, solange es nur eine Zeile gibt.
    pakete: hasExtraPackageLines(form) ? packageLinesKey(form) : "",
    serviceFilter, shippingModeFilter, shippingDate, publicCarrierIds: selectedPublicCarrierIds,
  });

  const calculate = async () => {
    // Genau EIN Preisrequest je Nutzeraktion (Muster aus NewShipmentPage).
    if (calcInFlight.current) return;
    // Unveränderte Eingaben → die vorhandenen Angebote gelten weiter. Kein
    // zweiter /calculate-price, kein zweites JUMiNGO-Shipment. Der Schlüssel
    // enthält ausschließlich preisbestimmende Größen; ändert sich eine davon,
    // hat `upd` bereits `invalidateResults()` gerufen und `hasResults`/`tariffs`
    // sind leer — dieser Zweig greift dann gar nicht erst.
    if (
      hasResults && tariffs.length > 0 &&
      lastCalcKeyRef.current !== "" && lastCalcKeyRef.current === calcKeyRef.current
    ) {
      setError(null);
      // Der Knopf darf nicht tot wirken. Es wird NICHTS neu berechnet, nichts
      // sortiert und nichts zurückgesetzt — der bereits gültige Angebotsbereich
      // rückt lediglich ins Bild. Begründung und Motion-Regel stehen in
      // `utils/revealOffers.mjs`.
      revealOffers(offersRef.current);
      return;
    }
    setHasResults(false); setTariffs([]);
    lastCalcKeyRef.current = "";
    // Ungültige Eingaben werden gar nicht erst gesendet: Der Kunde bekommt die
    // Korrekturanweisung sofort am Feld, statt nach einem Netzwerkumlauf einen
    // Sammeltext zu sehen.
    const { fieldErrors: preErrors, banner } = getCalculatorErrors(form);
    if (Object.keys(preErrors).length > 0) {
      setSubmitted(true);
      const anzahl = Object.keys(preErrors).length;
      setError({
        title: banner?.title || "Angaben prüfen",
        message: anzahl > 1 ? `${banner?.message || ""} ${summaryMessage(anzahl)}`.trim() : banner?.message,
      });
      setFocusRequest({ field: firstErrorField(preErrors), at: Date.now() });
      return;
    }
    setServerErrors({});
    calcInFlight.current = true;   // erst NACH der Validierung: ein abgelehnter Klick blockiert nichts
    // Betreiberentscheidung 2026-10-02: jede ECHTE neue Preisberechnung startet in Netto — wie in
    // „Neue Sendung" erst hier, nach der Validierung. Der Einblende-Zweig oben behält die Wahl.
    setVatMode("net");
    setError(null); setLoading(true); setSelected(null);

    // Race-Schutz: diesen Aufruf als neuesten markieren, laufenden Request
    // abbrechen und die aktuellen Eingaben als Referenz festhalten.
    const seq    = ++calcSeq.current;
    const reqKey = calcKeyRef.current;
    if (calcAbort.current) calcAbort.current.abort();
    const ac = new AbortController();
    calcAbort.current = ac;

    try {
      const r = await apiFetch(`/api/jumingo/calculate-price`, {
        // 75 s statt der 30-s-Vorgabe: der Server fragt für die Tarifliste die Anbieter
        // mit eigenen Fristen an (bis 55 s) — der Browser muss danach noch auf die
        // Antwort warten können.
        method: "POST", auth: true, signal: ac.signal, timeoutMs: 75000,
        body: JSON.stringify({
          from_country:       form.from_country,
          from_zip:           form.from_zip,
          from_city:          String(form.from_city ?? "").trim(),
          to_country:         form.to_country,
          to_zip:             form.to_zip,
          to_city:            String(form.to_city ?? "").trim(),
          // Genau die eingegebenen Werte — kein Ersatzwert. Hier stand
          // `Number(form.length) || 30` (und 20/15): `Number("")` ist 0 und
          // damit falsy, ein leeres Feld wurde also zu 30 cm. Die Vorprüfung
          // oben lässt einen unvollständigen Request gar nicht mehr zu.
          // Paketzeilen (Canonical v2.79): eine Paketart geht flach wie bisher
          // (Anzahl, Gewicht, Länge, Breite, Höhe), unterschiedliche Pakete als `packageLines`.
          ...packageLinesPayload(formPackageLines(form)),
          serviceFilter:      serviceFilter,
          shippingModeFilter: shippingModeFilter,
          shippingDate:       shippingDate,
          publicCarrierIds:   selectedPublicCarrierIds,
        })
      });
      if (seq !== calcSeq.current) return;                              // durch neueren Aufruf ersetzt
      // Session ungültig/abgelaufen (Backend-Auth-Guard): apiFetch(auth:true) hat den
      // Token entfernt und den zentralen Auth-Redirect (AuthContext) bereits ausgelöst
      // → hier nur sauber aussteigen (kein irreführender Preisfehler, kein hängendes Loading).
      if (r.status === 401 || r.status === 403) { setLoading(false); return; }
      if (!r.ok) {
        // HIER ging die konkrete Meldung bisher verloren: gelesen wurde nur
        // `d.error`, doch der providerneutrale PLZ-422 trägt `message`, `code`,
        // `field` und `example` — und gar kein `error`. Der Normalizer liest alle
        // Formen und ordnet Ergebnis, Feld und Fehlerart zu.
        const norm = await errorFromResponse(r, { fieldMap: CALCULATOR_FIELD_MAP });
        if (seq !== calcSeq.current) return;
        if (reqKey !== calcKeyRef.current) { setLoading(false); return; }
        if (norm.field) {
          setServerErrors({ [norm.field]: norm.fieldMessage || norm.message });
        }
        // Angesprungen wird das Feld (sonst der Knopf) erst nach dem Laden — bis
        // dahin ist der Seiteninhalt inert, ein Fokus jetzt liefe ins Leere.
        fokusNachVergleich(norm.field ? "feld" : "ausloeser", norm.field);
        setError({ title: norm.title, message: norm.message });
        setLoading(false);
        return;
      }
      const d = await r.json();
      if (seq !== calcSeq.current) return;                              // während des Parsens ersetzt
      if (reqKey !== calcKeyRef.current) { setLoading(false); return; } // Eingaben geändert → verwerfen
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
      calculatedAtRef.current = Date.now();   // Ablauffrist des Vorgangs beginnt jetzt
      // Erst JETZT gilt der Schlüssel als berechnet: `reqKey` ist der Stand beim
      // ABSENDEN — eine zwischenzeitliche Eingabe hätte den Request oben schon
      // verworfen.
      lastCalcKeyRef.current = reqKey;
      // Alle Angebote erscheinen gemeinsam; danach rückt der Bereich ins Bild
      // und der Fokus geht auf die Ergebniszeile (erst nach dem Laden).
      fokusNachVergleich("angebote");
      setHasResults(true);
      setLoading(false);
    } catch (e) {
      if (e?.name === "AbortError") return;      // abgebrochen (neuer Request/Unmount) → kein Fehler, Loading gehört dem neuen Request
      if (seq !== calcSeq.current) return;       // veralteter Request → ignorieren
      // Nur noch echte Ausnahmen (Verbindungsabbruch, nicht lesbare Antwort)
      // landen hier — fachliche Ablehnungen sind oben bereits behandelt. Der
      // rohe Text („Failed to fetch") erreicht den Kunden nicht mehr.
      const norm = normalizeThrownError(e);
      setError({ title: norm.title, message: norm.message });
      fokusNachVergleich("ausloeser");
      setLoading(false);
    } finally {
      // Genau hier — und nur hier — wird der nächste Klick wieder freigegeben.
      // `finally` deckt auch die frühen Returns im try-Block ab (veralteter
      // Request, Abbruch, fachliche Ablehnung), sodass der CTA nie dauerhaft
      // blockiert bleibt.
      calcInFlight.current = false;
    }
  };

  // Preisrechner has no full address form → redirect to "Neue Sendung" to complete booking.
  //
  // Produktionsbefund 2026-10-02: hier stand nur `navigate(...)` — „Neue Sendung" öffnete leer,
  // das Datum sprang auf heute, das gewählte Angebot war weg. Der Preisrechner-Stand lebt im
  // Bereich „calculator", „Neue Sendung" liest „shipment". Jetzt wird EXPLIZIT übergeben
  // (utils/calculatorShipmentHandoff.mjs): was der Preisrechner kennt, und das Angebot nur als
  // Absicht. Ein alter Sendungsvorgang wird dafür vollständig ersetzt, nichts wird gemischt.
  // Gebucht wird erst nach einer Neuberechnung mit den vollständigen Angaben.
  //
  // Die Werte liest der Knopf aus einer Ref: so bleibt onBook eine stabile Referenz, und die
  // memoisierten OfferCards rendern durch ihn nicht unnötig neu.
  const uebergabeRef = useRef(null);
  uebergabeRef.current = { form, shippingDate, serviceFilter, shippingModeFilter, vatMode };
  const handleBook = useCallback((tariff) => {
    const uebergabe = calculatorSelectionToShipmentTransfer({
      calculator: uebergabeRef.current,
      tariff,
      label: `${publicCarrierDisplay(tariff).name} · ${publicServiceName(tariff)}`,
    });
    // Der eigene Bereich merkt sich Auswahl und Scrollposition — ein Browser-Zurück findet den
    // Preisrechner so vor, wie er verlassen wurde (dieselbe Geste wie in „Neue Sendung").
    setSelected(tariff);
    setFlowScope("calculator", { selected: tariff, scrollY: Math.round(window.scrollY || 0) });
    clearFlowScope("shipment");
    setFlowScope("shipment", uebergabe);
    navigate("/dashboard?page=new");
  }, [navigate, setFlowScope, clearFlowScope]);

  // Stabiles senderPrefill-Objekt (nur Paketshop-Suche bei Dropoff nutzt es).
  // useMemo verhindert ein neues Objekt bei jedem Render → sonst würde es den
  // React.memo-Vergleich der OfferCards bei jeder Parent-Änderung brechen.
  //
  // DOKUMENTIERTE SUCHGRENZE: Der Preisrechner erhebt bewusst nur Land und PLZ
  // — es gibt hier weder ein Orts- noch ein Straßenfeld, und es wird auch keins
  // eingeführt (der Preis hängt nicht davon ab). Es wird deshalb KEINE Straße
  // vorbelegt; erfunden wird schon gar nichts. Folge: Der Suchmittelpunkt der
  // Paketshop-Suche ist hier der PLZ-/Ortsmittelpunkt und damit ungenauer als
  // in der Sendungserfassung, wo die vollständige Absenderadresse vorliegt.
  // Wer es genauer braucht, trägt Ort und Straße direkt im Finder nach — beide
  // Felder sind dort sichtbar, die Straße ist optional.
  const senderPrefill = useMemo(
    () => ({ postCode: form.from_zip, city: "", street: "", country: form.from_country }),
    [form.from_zip, form.from_country]
  );

  return (
    <div className="page-with-navbar">
      {/* Ladeoverlay des Vergleichs (Portal an <body>). Solange es steht, ist der
          Seiteninhalt darunter inert und aria-busy. */}
      <OfferComparisonLoadingOverlay active={loading} />
      {/* .page-body: derselbe Inhaltsrahmen wie jede andere App-Shell-Seite —
          .calc-page-wrap bleibt für das vertikale Innenabstandsmaß dieser Seite
          zuständig, auf einem eigenen verschachtelten Element statt gemeinsam
          mit .page-body auf einem Knoten (vermeidet einen Kaskade-Konflikt bei
          padding-top/-bottom). `--calculator` begrenzt die Formularbreite
          (Redesign 2026-10): Route und Paket werden nicht unnötig über die
          volle Inhaltsbreite gestreckt; die Angebotsliste darunter bleibt breit. */}
      <div className="page-body">
        <div className="calc-page-wrap calc-page-wrap--calculator" inert={loading} aria-busy={loading || undefined}>
        <div className="offers-form-section">

          {/* ── Obere Premium-Filterleiste: vier Filter nebeneinander (Desktop),
                 responsives Grid auf Tablet/Mobile. Reine Darstellung. ── */}
          <ShipmentFilterBar
            serviceFilterOpen={serviceFilterOpen} setServiceFilterOpen={setServiceFilterOpen}
            selectedOption={selectedOption} SERVICE_OPTIONS={SERVICE_OPTIONS}
            serviceFilter={serviceFilter} handleServiceFilter={handleServiceFilter}
            datePickerOpen={datePickerOpen} setDatePickerOpen={setDatePickerOpen}
            shippingDate={shippingDate} handleDateChange={handleDateChange}
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
            idPrefix="calc-form"
            carrierEmptyHint="Zuerst Preise berechnen, um Carrier-Filter zu aktivieren"
          />

          {/* ── Versandroute — Land + PLZ + Ort ──
              Betreiberentscheidung Auftrag 1, P11 (2026-10-17): schwebende Beschriftungen über
              <Field /> und das Vorschlagsfeld (wie „Neue Sendung"), keine Musterplatzhalter —
              das PLZ-Format steht als Hinweiszeile unter dem Feld. Jedes Feld trägt `data-field`
              (Ziel von focusFirstError) und wird beim Verlassen „berührt". */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><h3>Versandroute</h3></div>
            <div className="calc-panel-body">
              <div className="booking-addr-grid">
                {[
                  { side: "from", title: "Herkunft", liste: launchOriginCountries, help: fromCityHelp },
                  { side: "to",   title: "Ziel",     liste: launchCountries,       help: toCityHelp },
                ].map(({ side, title, liste, help }) => {
                  const land = form[`${side}_country`];
                  const plzHinweis = postalCodeHint(land) || undefined;
                  return (
                    <div key={side}>
                      <div className="calc-section-title">{title}</div>
                      <Field
                        id={`calc-${side}-country`}
                        fieldKey={`${side}_country`}
                        labelMode="floating"
                        as="select"
                        label="Land"
                        required
                        value={land}
                        onChange={(v) => { upd(`${side}_country`, v); resetResults(); }}
                        onBlur={() => markTouched(`${side}_country`)}
                        error={fieldErrors[`${side}_country`]}
                      >
                        <option value="">Land auswählen</option>
                        {liste.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </Field>
                      <Field
                        id={`calc-${side}-zip`}
                        fieldKey={`${side}_zip`}
                        labelMode="floating"
                        label="PLZ"
                        required
                        value={form[`${side}_zip`]}
                        onChange={(v) => { upd(`${side}_zip`, v); resetResults(); }}
                        onBlur={() => markTouched(`${side}_zip`)}
                        inputMode={postalCodeInputMode(land)}
                        maxLength={postalCodeMaxLength()}
                        error={fieldErrors[`${side}_zip`]}
                        hint={plzHinweis}
                      />
                      <AddressSuggestInput
                        id={`calc-${side}-city`}
                        label="Ort"
                        required
                        floating
                        className="field"
                        value={form[`${side}_city`]}
                        onChange={v => { upd(`${side}_city`, v); resetResults(); }}
                        onSelect={item => { upd(`${side}_city`, cityFromSuggestion(item)); resetResults(); }}
                        onBlur={() => markTouched(`${side}_city`)}
                        suggestions={help.cityOptions}
                        maxLength={CITY_MAX_LENGTH}
                        dataField={`${side}_city`}
                        error={fieldErrors[`${side}_city`]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Paketdaten ── */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><h3>Paketdaten</h3></div>
            <div className="calc-panel-body">
              {/* Reihenfolge: Anzahl · Gewicht · Länge · Breite · Höhe (Bindings/State-Keys
                  unverändert). Anzahl = Anzahl identischer Pakete (pro Paket: Gewicht + Maße),
                  nur an /calculate-price. Dieselbe Feldsprache wie „Neue Sendung": schwebende
                  Beschriftung, Einheit rechts im Feld (dekorativ, vorgelesen über unitLabel),
                  kein Beispielplatzhalter; eine unvollständige Zahl hält die Beschriftung oben. */}
              {/* Der gemeinsame Paketeditor (Canonical v2.79, §15) — dieselben Felder, IDs (calc-…)
                  und Schlüssel wie bisher; weitere Zeilen tragen calc-weight-2 usw. */}
              <PackageLinesEditor
                variant="app"
                idBase="calc-"
                lines={formPackageLines(form)}
                onLinesChange={updPakete}
                errors={fieldErrors}
                onFieldBlur={markTouched}
              />
              <p className="pkg-count-note">
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

          {/* ── Calculate CTA ── */}
          <div className="offers-calc-cta">
            {/* Auftrag 1, P11: bedienbar auch bei fehlenden Angaben — gesperrt nur, während gerechnet
                wird. Ein Klick auf ein unvollständiges Formular sendet nichts, markiert alle Pflicht-
                felder und springt zum ersten; onMouseDown hält den Fokus bis zum Klick im Feld. */}
            <button
              type="button"
              ref={calcCtaRef}
              className="btn btn-primary btn-lg btn-full"
              onClick={calculate}
              onMouseDown={keepFocusOnMouseDown}
              disabled={loading}
            >
              {loading ? <><span className="spinner" /> Berechne…</> : "Angebote vergleichen"}
            </button>
            {/* Direkt am Aktionsbutton: benennt das Problem und erklärt die
                Korrektur. Bei mehreren Feldfehlern steht zusätzlich die
                Zusammenfassung („Bitte korrigieren Sie die N markierten Angaben."). */}
            {error && <FormAlert tone="error" title={error.title} message={error.message} className="mt-16" />}
            {/* Wiederhergestellter Vorgang, dessen Angebote nicht mehr gezeigt
                werden dürfen. Bestehender Hinweisstil, keine Rohmeldung. */}
            {flowNotice && !error && (
              <FormAlert tone="info" title="Bitte neu berechnen" message={flowNotice} className="mt-16" />
            )}
          </div>
        </div>

        {/* ── Offers ── */}
        {(hasResults || loading) && (
          <div ref={offersRef}>
          <OffersList
            /* Der Preisrechner wählt VOR den Sendungsangaben: auswählbar ist, was mit ihnen buchbar wird. */
            selectionStage={OFFER_SELECTION_STAGE.BEFORE_SHIPMENT_DETAILS}
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
          />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
