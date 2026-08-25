import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries, normalizeCountryCode } from "../utils/countries";
import { publicCarrierChipLabel } from "../utils/carrierMap";
import { applyResultFilters } from "../utils/offersFilterView.mjs";
import { deliveryDeadlineOptions, latestDeliveryFieldValue } from "../utils/deliveryTimeView.mjs";
import { revealOffers } from "../utils/revealOffers.mjs";
import DeliveryTimeSelect from "../components/offers/DeliveryTimeSelect.jsx";
import { OffersList } from "../components/offers/OffersList";
import { useAuth } from "../context/AuthContext";
import { todayISO, addDaysISO, labelForDate, fmtShortDE } from "../utils/date";
import { DateCalendar } from "../components/common/DateCalendar";
import { FormAlert } from "../components/ui/FormAlert";
import { errorFromResponse, normalizeThrownError, summaryMessage } from "../utils/apiError.mjs";
import { getCalculatorErrors, firstErrorField, CALCULATOR_FIELD_MAP } from "../utils/calculatorValidation.mjs";
import { focusFirstError, fieldErrorProps } from "../utils/focusField";
import { postalCodeExample, postalCodeInputMode, postalCodeMaxLength } from "../utils/postalCode";
import { useShippingFlow } from "../context/ShippingFlowContext";
import { formHasInput, droppedNotice } from "../utils/shippingFlowState.mjs";

// Reine Client-Filter (kein neuer /calculate-price-Request nötig): Änderungen
// hieran verwerfen KEINE bestehenden Angebote. Alle übrigen Formularfelder
// (Route + Paketdaten inkl. packageCount) invalidieren dagegen alte Angebote.
// `latestDeliveryTime` gehört zwingend hierher: eine Uhrzeitauswahl arbeitet
// ausschließlich auf den BEREITS geladenen Tarifen und darf niemals einen neuen
// /calculate-price-Request auslösen. Sie steht aus demselben Grund NICHT im
// calcKey — der Schlüssel beschreibt die Payload, nicht die Anzeige.
const FILTER_ONLY_FIELDS = new Set(["max_price", "latestDeliveryDate", "latestDeliveryTime"]);

// ─── Service options ─────────────────────────────────────────────────────────
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

export default function CalculatorPage() {
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
  const { calculator: flowCalculator, setScope: setFlowScope, droppedReason, consumeDroppedReason } = useShippingFlow();
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
    from_country: normalizeCountryCode(user?.country),
    from_zip:     user?.zip     || "",
    to_country:   "DE",
    to_zip:       "",
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
  // Feldbezogene Fehler: Schlüssel = Formularfeld, Wert = kurzer Text unter dem
  // Feld. Quelle sind sowohl die Client-Vorprüfung als auch das `field` einer
  // Serverantwort — dadurch landet auch ein Backend-Fehler am richtigen Feld.
  const [fieldErrors, setFieldErrors] = useState({});
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
    // Stale-State-Schutz (Muster wie NewShipmentPage): Ändert sich ein route-/
    // paketrelevantes Feld (nicht die reinen Client-Filter max_price/latestDeliveryDate),
    // werden alte Angebote sofort verworfen → nie veraltete Preise zu neuen
    // Eingaben (z. B. 1-Paket-Angebote nach Wechsel der Anzahl auf 3).
    if (!FILTER_ONLY_FIELDS.has(k)) invalidateResults();
  };

  // Die frühere Prüfung lief über EIN landesunabhängiges Regex und lieferte EINEN
  // Sammeltext. Dadurch bestand „4444" als deutsche PLZ, wurde ans Backend
  // geschickt, dort korrekt mit 422 abgelehnt — und die Ablehnung ging im Client
  // verloren. Jetzt greift dieselbe zentrale Landesregel wie in „Neue Sendung"
  // (src/utils/calculatorValidation.mjs → postalCode.mjs), und das Ergebnis ist
  // feldbezogen. Siehe dort auch die internationale Behandlung: keine pauschale
  // Fünfstelligkeit.

  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  // Maße sind seit „verpflichtende Paketmaße" ebenfalls Pflicht — ohne sie gibt
  // es keinen Tarif mehr (weder hier noch serverseitig).
  const calcValid = !!form.from_zip && !!form.to_zip && !!form.weight && !!form.packageCount
    && !!form.length && !!form.width && !!form.height;

  const resetResults = () => {
    setHasResults(false);
    setTariffs([]);
    setSelected(null);
    setError(null);
    // Feldmarkierungen verschwinden, sobald der Kunde die Eingabe ändert — die
    // eingegebenen WERTE bleiben dabei unangetastet erhalten.
    setFieldErrors({});
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

  const sorted = React.useMemo(() => {
    if (sortMode === "recommended") return filtered;
    const copy = [...filtered];
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
  }, [filtered, sortMode]);

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
      setFieldErrors(preErrors);
      const anzahl = Object.keys(preErrors).length;
      setError({
        title: banner?.title || "Angaben prüfen",
        message: anzahl > 1 ? `${banner?.message || ""} ${summaryMessage(anzahl)}`.trim() : banner?.message,
      });
      focusFirstError(firstErrorField(preErrors));
      return;
    }
    setFieldErrors({});
    calcInFlight.current = true;   // erst NACH der Validierung: ein abgelehnter Klick blockiert nichts
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
        method: "POST", auth: true, signal: ac.signal,
        body: JSON.stringify({
          from_country:       form.from_country,
          from_zip:           form.from_zip,
          to_country:         form.to_country,
          to_zip:             form.to_zip,
          packageCount:       Number(form.packageCount),
          weight:             Number(form.weight),
          // Genau die eingegebenen Maße — kein Ersatzwert. Hier stand
          // `Number(form.length) || 30` (und 20/15): `Number("")` ist 0 und
          // damit falsy, ein leeres Feld wurde also zu 30 cm. Die Vorprüfung
          // oben lässt einen unvollständigen Request gar nicht mehr zu.
          length:             Number(form.length),
          width:              Number(form.width),
          height:             Number(form.height),
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
          setFieldErrors({ [norm.field]: norm.fieldMessage || norm.message });
          focusFirstError(norm.field);
        }
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
      setTariffs(d.tariffs || []);
      calculatedAtRef.current = Date.now();   // Ablauffrist des Vorgangs beginnt jetzt
      // Erst JETZT gilt der Schlüssel als berechnet: `reqKey` ist der Stand beim
      // ABSENDEN — eine zwischenzeitliche Eingabe hätte den Request oben schon
      // verworfen.
      lastCalcKeyRef.current = reqKey;
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
      setLoading(false);
    } finally {
      // Genau hier — und nur hier — wird der nächste Klick wieder freigegeben.
      // `finally` deckt auch die frühen Returns im try-Block ab (veralteter
      // Request, Abbruch, fachliche Ablehnung), sodass der CTA nie dauerhaft
      // blockiert bleibt.
      calcInFlight.current = false;
    }
  };

  // Preisrechner has no full address form → redirect to "Neue Sendung" to complete booking
  // useCallback: stabile Referenz, damit die memoisierten OfferCards durch onBook
  // nicht unnötig neu rendern (navigate ist von react-router her stabil).
  const handleBook = useCallback(() => {
    navigate("/dashboard?page=new");
  }, [navigate]);

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
      {/* .page-body: derselbe Inhaltsrahmen wie jede andere App-Shell-Seite
          (1240px, Paket B) — .calc-page-wrap bleibt für das vertikale
          Innenabstandsmaß dieser Seite zuständig, jetzt auf einem eigenen
          verschachtelten Element statt gemeinsam mit .page-body auf einem
          Knoten (vermeidet einen Kaskade-Konflikt bei padding-top/-bottom). */}
      <div className="page-body">
        <div className="calc-page-wrap">
        <div className="offers-form-section">

          {/* ── Obere Premium-Filterleiste: vier Filter nebeneinander (Desktop),
                 responsives Grid auf Tablet/Mobile. Reine Darstellung. ── */}
          <div className="calc-filter-bar mb-16">
          {/* ── Service Filter — collapsible ── */}
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

          {/* ── Versanddatum — collapsible ── */}
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

          {/* ── Carrier Filter — collapsible ── */}
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
                  <div className="carrier-empty-hint">Zuerst Preise berechnen, um Carrier-Filter zu aktivieren</div>
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

          {/* ── Versandart — collapsible ── */}
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
                  idPrefix="calc-form"
                />
              </div>
            )}
          </div>

          </div>{/* /calc-filter-bar */}

          {/* ── Versandroute — Land + PLZ ── */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="globe" s={18} c="var(--ce-color-brand-ink)" /><h3>Versandroute</h3></div>
            <div className="calc-panel-body">
              <div className="booking-addr-grid">

                {/* Herkunft */}
                <div>
                  <div className="calc-section-title">Herkunft</div>
                  <div className="field">
                    <label className="field-label">Land</label>
                    <select
                      className="field-input field-select"
                      value={form.from_country}
                      onChange={e => { upd("from_country", e.target.value); resetResults(); }}
                    >
                      {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="calc-from-zip">PLZ *</label>
                    <input
                      id="calc-from-zip"
                      className={`field-input${fieldErrors.from_zip ? " field-input-error" : ""}`}
                      value={form.from_zip}
                      onChange={e => { upd("from_zip", e.target.value); resetResults(); }}
                      placeholder={postalCodeExample(form.from_country) || "PLZ"}
                      inputMode={postalCodeInputMode(form.from_country)}
                      maxLength={postalCodeMaxLength()}
                      {...fieldErrorProps("from_zip", fieldErrors.from_zip).input}
                    />
                    {fieldErrors.from_zip
                      ? <span className="field-error" id={fieldErrorProps("from_zip", fieldErrors.from_zip).errorId}>{fieldErrors.from_zip}</span>
                      : (postalCodeExample(form.from_country) && <span className="field-hint">Beispiel: {postalCodeExample(form.from_country)}</span>)}
                  </div>
                </div>

                {/* Ziel */}
                <div>
                  <div className="calc-section-title">Ziel</div>
                  <div className="field">
                    <label className="field-label">Land</label>
                    <select
                      className="field-input field-select"
                      value={form.to_country}
                      onChange={e => { upd("to_country", e.target.value); resetResults(); }}
                    >
                      {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="calc-to-zip">PLZ *</label>
                    <input
                      id="calc-to-zip"
                      className={`field-input${fieldErrors.to_zip ? " field-input-error" : ""}`}
                      value={form.to_zip}
                      onChange={e => { upd("to_zip", e.target.value); resetResults(); }}
                      placeholder={postalCodeExample(form.to_country) || "PLZ"}
                      inputMode={postalCodeInputMode(form.to_country)}
                      maxLength={postalCodeMaxLength()}
                      {...fieldErrorProps("to_zip", fieldErrors.to_zip).input}
                    />
                    {fieldErrors.to_zip
                      ? <span className="field-error" id={fieldErrorProps("to_zip", fieldErrors.to_zip).errorId}>{fieldErrors.to_zip}</span>
                      : (postalCodeExample(form.to_country) && <span className="field-hint">Beispiel: {postalCodeExample(form.to_country)}</span>)}
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ── Paketdaten ── */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="package" s={18} c="var(--ce-color-brand-ink)" /><h3>Paketdaten</h3></div>
            <div className="calc-panel-body">
              {/* Reihenfolge: Anzahl · Gewicht · Länge · Breite · Höhe (nur Anzeige;
                  Bindings/State-Keys unverändert). Anzahl = Anzahl identischer Pakete
                  (pro Paket: Gewicht + Maße), nur an /calculate-price. */}
              {/* Jedes Paketfeld kann seinen eigenen Fehler tragen (markiert,
                  beschrieben, per aria-describedby verbunden und anspringbar). */}
              <div className="field-row field-row-5">
                {[
                  // Die Beispiele sind PLACEHOLDER, keine Werte. Eine nackte „5"
                  // in einem Zahlenfeld ist von einer echten Eingabe nicht zu
                  // unterscheiden — deshalb steht „z. B." davor.
                  { key: "packageCount", label: "Anzahl *",     ph: "1",  hint: "Identische Pakete", extra: { min: "1", max: "99", step: "1" } },
                  { key: "weight",       label: "Gewicht kg *", ph: "z. B. 5"  },
                  { key: "length",       label: "Länge cm *",   ph: "z. B. 30" },
                  { key: "width",        label: "Breite cm *",  ph: "z. B. 20" },
                  { key: "height",       label: "Höhe cm *",    ph: "z. B. 15" },
                ].map(({ key, label, ph, hint, extra }) => {
                  const err = fieldErrors[key];
                  const a11y = fieldErrorProps(key, err);
                  return (
                    <div className="field" key={key}>
                      <label className="field-label" htmlFor={`calc-${key}`}>{label}</label>
                      <input
                        id={`calc-${key}`}
                        className={`field-input${err ? " field-input-error" : ""}`}
                        type="number"
                        value={form[key]}
                        onChange={e => upd(key, e.target.value)}
                        placeholder={ph}
                        {...(extra || {})}
                        {...a11y.input}
                      />
                      {err
                        ? <span className="field-error" id={a11y.errorId}>{err}</span>
                        : (hint && <span className="field-hint">{hint}</span>)}
                    </div>
                  );
                })}
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

          {/* ── Calculate CTA ── */}
          <div className="offers-calc-cta">
            <button className="btn btn-primary btn-lg btn-full" onClick={calculate} disabled={loading || !calcValid}>
              {loading ? <><span className="spinner" /> Berechne…</> : <><Icon n="zap" s={18} /> Angebote vergleichen</>}
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
    </div>
  );
}
