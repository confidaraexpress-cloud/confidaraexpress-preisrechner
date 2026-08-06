import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { publicCarrierChipLabel } from "../utils/carrierMap";
import { OffersList } from "../components/offers/OffersList";
import { useAuth } from "../context/AuthContext";
import { todayISO, addDaysISO, labelForDate, fmtShortDE } from "../utils/date";
import { DateCalendar } from "../components/common/DateCalendar";
import { FormAlert } from "../components/ui/FormAlert";
import { errorFromResponse, normalizeThrownError, summaryMessage } from "../utils/apiError.mjs";
import { getCalculatorErrors, firstErrorField, CALCULATOR_FIELD_MAP } from "../utils/calculatorValidation.mjs";
import { focusFirstError, fieldErrorProps } from "../utils/focusField";
import { postalCodeExample, postalCodeInputMode, postalCodeMaxLength } from "../utils/postalCode";

// Reine Client-Filter (kein neuer /calculate-price-Request nötig): Änderungen
// hieran verwerfen KEINE bestehenden Angebote. Alle übrigen Formularfelder
// (Route + Paketdaten inkl. packageCount) invalidieren dagegen alte Angebote.
const FILTER_ONLY_FIELDS = new Set(["max_price", "latestDeliveryDate"]);

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

  // ── Service filter ──
  const [serviceFilter, setServiceFilter]         = useState("all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);

  // ── Shipping mode filter ──
  const [shippingModeFilter, setShippingModeFilter] = useState("all");
  const [shippingModeOpen, setShippingModeOpen]     = useState(false);

  // ── Shipping date ──
  const [shippingDate, setShippingDate]     = useState(() => todayISO());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // ── Sort ──
  const [sortMode, setSortMode] = useState("recommended");

  // ── VAT display mode ──
  const [vatMode, setVatMode] = useState("net");

  // ── Carrier filter ──
  const [selectedPublicCarrierIds, setSelectedPublicCarrierIds] = useState([]);
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [publicCarriers, setPublicCarriers]           = useState([]);
  const carrierRef = useRef(null);

  // ── Späteste Lieferzeit — Popover-Status (Wert latestDeliveryDate liegt im form) ──
  const [latestOpen, setLatestOpen] = useState(false);

  // ── Form — route (country + zip) + package data only ──
  const [form, setForm] = useState({
    from_country: user?.country || "DE",
    from_zip:     user?.zip     || "",
    to_country:   "DE",
    to_zip:       "",
    packageCount: "1",
    weight: "", length: "", width: "", height: "",
    max_price: "", latestDeliveryDate: "",
  });

  // ── Results ──
  const [tariffs, setTariffs]       = useState([]);
  const [selected, setSelected]     = useState(null);
  const [loading, setLoading]       = useState(false);
  // `error` trägt jetzt { title, message } statt eines einzelnen Strings, damit
  // die Meldung das Problem benennt UND die Korrektur erklärt.
  const [error, setError]           = useState(null);
  // Feldbezogene Fehler: Schlüssel = Formularfeld, Wert = kurzer Text unter dem
  // Feld. Quelle sind sowohl die Client-Vorprüfung als auch das `field` einer
  // Serverantwort — dadurch landet auch ein Backend-Fehler am richtigen Feld.
  const [fieldErrors, setFieldErrors] = useState({});
  const [hasResults, setHasResults] = useState(false);

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

  const calcValid = !!form.from_zip && !!form.to_zip && !!form.weight && !!form.packageCount;

  const resetResults = () => {
    setHasResults(false);
    setTariffs([]);
    setSelected(null);
    setError(null);
    // Feldmarkierungen verschwinden, sobald der Kunde die Eingabe ändert — die
    // eingegebenen WERTE bleiben dabei unangetastet erhalten.
    setFieldErrors({});
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

  const clearFilters = () => {
    upd("max_price", "");
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
  const filtered = useMemo(() => {
    let f = [...tariffs];
    if (form.max_price) f = f.filter(t => t.netPrice != null && t.netPrice <= Number(form.max_price));
    // Client-Filter „Späteste Lieferzeit": spätestes Lieferdatum (deliveryDateMax →
    // deliveryDate). Tarife ohne Lieferdatum bleiben sichtbar (kein gültiges Angebot
    // ausblenden). Rein clientseitig — kein Recalc, kein /calculate-price-Request.
    if (form.latestDeliveryDate) f = f.filter(t => {
      const dd = t.deliveryDateMax || t.deliveryDate;
      if (!dd) return true;
      return String(dd).split("T")[0] <= form.latestDeliveryDate;
    });
    return f;
  }, [tariffs, form.max_price, form.latestDeliveryDate]);

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
    if (form.latestDeliveryDate && form.latestDeliveryDate < iso) upd("latestDeliveryDate", "");
    resetResults();
  };

  // Auswahl im „Späteste Lieferzeit"-Kalender (reiner Client-Filter, kein Recalc).
  const handleLatestDeliveryChange = (iso) => {
    upd("latestDeliveryDate", iso || "");
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
    setHasResults(false); setTariffs([]);
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
          length:             Number(form.length) || 30,
          width:              Number(form.width)  || 20,
          height:             Number(form.height) || 15,
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
      setTariffs(d.tariffs || []); setHasResults(true);
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
  const senderPrefill = useMemo(
    () => ({ postCode: form.from_zip, city: "", country: form.from_country }),
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
                  <div className="service-filter-trigger-val">{form.latestDeliveryDate ? fmtShortDE(form.latestDeliveryDate) : "Beliebig"}</div>
                </div>
              </div>
              <div className={`service-filter-chevron ${latestOpen ? "open" : ""}`}>
                <Icon n="chevron" s={16} c="#64748b" />
              </div>
            </button>
            {latestOpen && (
              <div className="date-picker-body date-picker-body--latest">
                <div className="date-quick-options">
                  <button className={`date-quick-btn ${!form.latestDeliveryDate ? "active" : ""}`} onClick={() => { upd("latestDeliveryDate", ""); setLatestOpen(false); }}>Beliebig</button>
                </div>
                <DateCalendar
                  value={form.latestDeliveryDate}
                  onSelect={handleLatestDeliveryChange}
                  minDate={shippingDate}
                  onClose={() => setLatestOpen(false)}
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
                  { key: "packageCount", label: "Anzahl",       ph: "1",  hint: "Identische Pakete", extra: { min: "1", max: "99", step: "1" } },
                  { key: "weight",       label: "Gewicht kg *", ph: "5"  },
                  { key: "length",       label: "Länge cm",     ph: "30" },
                  { key: "width",        label: "Breite cm",    ph: "20" },
                  { key: "height",       label: "Höhe cm",      ph: "15" },
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
          </div>
        </div>

        {/* ── Offers ── */}
        {(hasResults || loading) && (
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
            onClearFilters={clearFilters}
            vatMode={vatMode}
            onVatToggle={setVatMode}
            senderPrefill={senderPrefill}
          />
        )}
        </div>
      </div>
    </div>
  );
}
