import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiFetch, repriceInsurance, saveDraftPickupWindow } from "../api/client";
import { FormAlert } from "../components/ui/FormAlert";
import { mapBookRestError, mapBookThrownError, mapBookUnreadableSuccess } from "../utils/bookingErrors.mjs";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money } from "../utils/formatters";
import { publicCarrierDisplay, publicServiceName, publicDropoffLabel } from "../utils/carrierMap";
import { downloadLabel } from "../utils/downloadLabel";
import { useAuth } from "../context/AuthContext";
import { getBookingModules } from "../utils/bookingModules";
import { pickupWindowBlocksBooking, formatDuration } from "../utils/pickupWindowClient";
import { buildCustomsInvoiceMeta } from "../utils/customsInvoiceMeta";
import { PROFORMA, COMMERCIAL, isCommercialOnly, resolveInvoiceMode, canSelectProforma, customsInvoiceFieldsValid, commercialInvoiceMutationBusy } from "../utils/customsInvoiceMode";
import { useCommercialInvoice } from "../hooks/useCommercialInvoice";
import { OfferSummaryModule } from "../components/booking/OfferSummaryModule";
import { DropoffNoticeModule } from "../components/booking/DropoffNoticeModule";
import { PickupWindowModule } from "../components/booking/PickupWindowModule";
import { SaveDraftAction } from "../components/booking/SaveDraftAction";
import { ShipmentSummaryModule } from "../components/booking/ShipmentSummaryModule";
import { AdditionalOptionsModule } from "../components/booking/AdditionalOptionsModule";
import { CustomsModule } from "../components/booking/CustomsModule";
import { InsuranceModule } from "../components/booking/InsuranceModule";
import { PriceSummaryModule } from "../components/booking/PriceSummaryModule";
import { BookingLiveSummary } from "../components/booking/BookingLiveSummary";
import { TermsModule } from "../components/booking/TermsModule";
import { BookingActionModule } from "../components/booking/BookingActionModule";
import {
  buildBookingPriceView, priceViewBlocksBooking, insuranceCardPrice,
  autofillInsuranceValue, goodsExceedsInsuranceMax, INSURANCE_VALUE_MAX, PRICE_STATUS,
} from "../utils/bookingPriceView.mjs";
import {
  INVOICE_DELIVERY_MODE, INVOICES_DASHBOARD_TARGET, resolveInvoiceDeliveryMode, isTerminalDeliveryMode,
  findInvoiceByNumber, invoiceDeliveryHint, BOOKING_CONFIRMATION_LINE, INVOICE_AUTOCREATE_LINE,
} from "../utils/bookingSuccessView.mjs";
import { NUMBER_LABELS } from "../utils/businessNumbers.mjs";
import { CopyableNumber } from "../components/ui/CopyableNumber";
import { nextRefreshDelay } from "../utils/invoiceView.mjs";

// Serverseitige /book-Guard-Codes der Zollrechnung → klare deutsche Meldungen
// (keine Backend-Rohtexte/Stacks). Verhalten je Code steuert doBook (zurück zum
// Customs-Schritt, ggf. commercial erzwingen, genau EIN Status-GET).
const COMMERCIAL_INVOICE_BOOK_ERRORS = {
  COMMERCIAL_INVOICE_METADATA_INCOMPLETE: "Rechnungsnummer und Rechnungsdatum müssen gemeinsam angegeben werden.",
  COMMERCIAL_INVOICE_METADATA_REQUIRED: "Bei gewerblichen Waren sind Rechnungsnummer und Rechnungsdatum erforderlich.",
  COMMERCIAL_INVOICE_DOCUMENT_REQUIRED: "Für die eigene Handelsrechnung muss zuerst eine PDF erfolgreich hinterlegt werden.",
  COMMERCIAL_INVOICE_MODE_CONFLICT: "Für diese Sendung ist noch eine eigene Handelsrechnung hinterlegt. Entfernen Sie diese oder vervollständigen Sie die Angaben zur Handelsrechnung.",
};

export default function BookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state: bookingData } = useLocation();
  const [step, setStep] = useState(1);
  // Kundengewähltes Abholzeitfenster (nur Pickup) — im Seiten-State, damit die Auswahl den
  // Schrittwechsel übersteht; die Draft-Persistenz übernimmt PickupWindowModule. {from,until}|null.
  const [pickupWindow, setPickupWindow] = useState(null);
  // P0: Hydrierungsstatus des gespeicherten Abholfensters, vom PickupWindowModule gemeldet —
  // blockiert die Buchung, solange geladen wird ODER ein Ladefehler vorliegt. pickupWindowChanged
  // hält die /book-409-Antwort (neue frische Carrier-Grenzen) für den Spezialdialog.
  const [pickupHydration, setPickupHydration] = useState({ loading: false, error: false });
  const [pickupWindowChanged, setPickupWindowChanged] = useState(null); // { availableFrom, availableUntil, minimumMinutes, adjustable } | null
  const [pickupResetting, setPickupResetting] = useState(false);
  const [pickupResetError, setPickupResetError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(null);
  const [agbAccepted, setAgbAccepted] = useState(false);
  // Separate Pflichtbestätigung „keine ausgeschlossenen Güter" (eigenständig,
  // ersetzt/schwächt die AGB-Bestätigung nicht). Reines Frontend-Buchungs-Gate.
  const [prohibitedGoodsAccepted, setProhibitedGoodsAccepted] = useState(false);
  const [prohibitedShowError, setProhibitedShowError] = useState(false);
  const [conflict, setConflict] = useState("");
  const [addressError, setAddressError] = useState("");
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState("");
  // Rechnungs-Zustellungsmodus für den Erfolgsscreen — aus der Serverwahrheit der SOEBEN erzeugten
  // Rechnung abgeleitet (is_test_document + document_status), NICHT clientseitig geraten. Startet
  // neutral (PENDING) und wird kurz nachgeladen, bis das Dokument einen Endzustand erreicht.
  const [invoiceDeliveryMode, setInvoiceDeliveryMode] = useState(INVOICE_DELIVERY_MODE.PENDING);
  const invoiceModeTimerRef = useRef(null);

  // Auf dem Erfolgsscreen den Rechnungs-Zustellungsmodus auflösen: kurzes, gedeckeltes Nachladen der
  // BESTEHENDEN Kundenrechnungsliste (GET /kunde/invoices — keine neue/serverseitige Änderung),
  // Rechnung per Nummer finden und den Modus aus is_test_document/document_status ableiten. Stoppt,
  // sobald ein Endzustand (produktiv/Vorschau/fehlgeschlagen) erreicht ist oder die Backoff-Obergrenze
  // (≈ 2 Min) greift. Kein Einfluss auf Buchung/Rechnung/PDF/E-Mail. Timer wird bei Unmount/
  // Schrittwechsel vollständig bereinigt.
  useEffect(() => {
    if (step !== 3 || !booking || !booking.invoiceNumber) return undefined;
    let cancelled = false;
    let attempt = 0;
    const poll = async () => {
      try {
        const r = await apiFetch(`/kunde/invoices`, { auth: true });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          const mode = resolveInvoiceDeliveryMode(findInvoiceByNumber(d.invoices, booking.invoiceNumber));
          if (cancelled) return;
          setInvoiceDeliveryMode(mode);
          if (isTerminalDeliveryMode(mode)) return; // fertig aufgelöst → nicht weiter nachladen
        }
      } catch { /* still bleiben — neutraler PENDING-Hinweis ist nie irreführend */ }
      if (cancelled) return;
      const delay = nextRefreshDelay(attempt);
      if (delay == null) return; // Obergrenze erreicht
      attempt += 1;
      invoiceModeTimerRef.current = setTimeout(poll, delay);
    };
    // Erster Versuch nach dem ersten Backoff-Intervall (das PDF wird nach dem Commit asynchron erzeugt).
    const first = nextRefreshDelay(attempt);
    attempt += 1;
    invoiceModeTimerRef.current = setTimeout(poll, first);
    return () => {
      cancelled = true;
      if (invoiceModeTimerRef.current) { clearTimeout(invoiceModeTimerRef.current); invoiceModeTimerRef.current = null; }
    };
  }, [step, booking]);

  // ── F3: Preisdrift OHNE Versicherung — /book 409 PRICE_CHANGED ──────────────
  // Der Backend-Gate im none-Pfad vergleicht price_final. Hat sich der Preis seit
  // der Angebotsberechnung geändert, antwortet /book mit 409
  // { code:"PRICE_CHANGED", oldPrice, newPrice }. `priceChange` steuert den
  // Premium-Dialog; `confirmedFinalPriceRef` hält den vom Nutzer bewusst
  // bestätigten neuen Preis, der beim erneuten /book als price_final gesendet
  // wird (ausschließlich none-Pfad — der Versicherungspfad bleibt unberührt).
  const [priceChange, setPriceChange] = useState(null); // { oldPrice, newPrice } | null
  const confirmedFinalPriceRef = useRef(null);

  // ── Versicherung (F1/F2): Auswahl + Live-Repricing + Übergabe an /book ──────
  const [insuranceType, setInsuranceType]   = useState("none"); // "none" | "standard" | "premium"
  // Warenwert und Versicherungswert sind bewusst GETRENNT — eigener State, eigene
  // Validierung, eigene Payload-Felder: goodsValue → details.value_amount,
  // insuranceValue → value → extra_insurance_value. Beide als String-Eingabe.
  const [goodsValue, setGoodsValue]         = useState("");     // Warenwert (EUR)
  const [insuranceValue, setInsuranceValue] = useState("");     // Versicherungswert (EUR)
  // Progressive Disclosure: der Versicherungswert spiegelt den Warenwert, bis der
  // Nutzer ihn bewusst anpasst (insValueManual); das Feld ist bei Bedarf einblendbar
  // (insValueRevealed) und wird bei Warenwert über dem Maximum automatisch gezeigt.
  const [insValueManual, setInsValueManual]     = useState(false);
  const [insValueRevealed, setInsValueRevealed] = useState(false);
  const [repriceResult, setRepriceResult]   = useState(null);
  const [repriceLoading, setRepriceLoading] = useState(false);
  const [repriceError, setRepriceError]     = useState("");
  const [repriceStale, setRepriceStale]     = useState(false);
  const repriceSeq   = useRef(0);   // ignoriert veraltete Antworten
  const repriceAbort = useRef(null); // bricht In-Flight-Requests ab

  const [form, setForm] = useState({ content: "", reference: "" });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  // Referenznummer clientseitig an die Backend-Regeln angleichen: < und >
  // entfernen, hart auf 35 Zeichen kappen (optional → kein Fehlerzustand).
  const updReference = (v) => upd("reference", v.replace(/[<>]/g, "").slice(0, 35));

  // ── Zusatzoption: Labeldruckformat (A4/A6) ──────────────────────────────────
  // Reiner /book-Payload-Wert (Default A4), NUR A4|A6. Kein Einfluss auf Preis
  // oder Reprice — bewusst NICHT in den Reprice-Deps und ohne Stale-Gate.
  const [labelFormat, setLabelFormat] = useState("A4");

  // ── Zollangaben (Phase 2): State im Orchestrator, nur bei customsRequired ───
  const makeCustomsItem = () => ({
    description: "", value: "", quantity: "1", unitOfMeasurement: "PCS",
    netWeight: "", originCountry: bookingData?.form?.s_country || "DE", hsTariffNumber: "",
  });
  const [customsExportReason, setCustomsExportReason] = useState("");
  const [customsItems, setCustomsItems]               = useState(() => [makeCustomsItem()]);
  const [customsShowErrors, setCustomsShowErrors]     = useState(false);
  const addCustomsItem    = () => setCustomsItems(items => [...items, makeCustomsItem()]);
  const removeCustomsItem = (idx) => setCustomsItems(items => items.length > 1 ? items.filter((_, i) => i !== idx) : items);
  const updCustomsItem    = (idx, key, value) => setCustomsItems(items => items.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  // Optionale Zollrechnungs-Metadaten (nur customs_invoice; ohne Einfluss auf Kundenpreis/-rechnung).
  const [customsInvoiceNumber, setCustomsInvoiceNumber] = useState("");
  const [customsInvoiceDate,   setCustomsInvoiceDate]   = useState("");
  const [customsInvoiceRemark, setCustomsInvoiceRemark] = useState("");
  // Interner Confidara-Rechnungstyp (nur UI/Validierung; KEIN /book-Key, KEIN
  // JUMiNGO-Feld). customsInvoiceMode ist die bewusste Nutzerpräferenz für nicht
  // gewerbliche Exportgründe (Default proforma); der effektive Modus wird abgeleitet.
  const [customsInvoiceMode, setCustomsInvoiceMode]     = useState(PROFORMA);
  const [proformaBlockedHint, setProformaBlockedHint]   = useState("");

  const tariff = bookingData?.tariff;

  // Paketdaten (Gewicht/Maße) als fertiger Anzeige-String — einmal abgeleitet,
  // in Step 1 (ShipmentSummaryModule) und Step 2 (Zusammenfassung) verwendet.
  // Kein erzwungener Platzhalter: ergibt "" (falsy), wenn beides fehlt.
  const packageDims = bookingData?.form || {};
  const packageInfo = [
    packageDims.weight ? `${packageDims.weight} kg` : null,
    (packageDims.length && packageDims.width && packageDims.height)
      ? `${packageDims.length}×${packageDims.width}×${packageDims.height} cm`
      : null,
  ].filter(Boolean).join(" · ") || null;

  // ── Versicherung: abgeleitete Werte, Validierung, Repricing ────────────────
  const asNum = (v) => { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const asPos = (v) => { const n = asNum(v); return n != null && n > 0 ? n : null; };
  const asStr = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

  // Dünne Sichtbarkeits-/Modul-Konfiguration: aus belegten Tarif- (pro-Tarif) und
  // Routen-Feldern (Top-Level customsRequired) — bildet das bisherige Verhalten ab.
  // `modules.insurance` ersetzt das frühere `insurable`-Gate, `modules.customs`
  // schaltet die Zollangaben nur bei backendseitig zollpflichtiger Route.
  const modules = getBookingModules(tariff, bookingData?.customs);
  const isInsured = insuranceType === "standard" || insuranceType === "premium";
  const goodsValueNum     = asNum(goodsValue);
  const insuranceValueNum = asNum(insuranceValue);
  // Inhaltsbeschreibung: das sichtbare Feld wurde aus dem Versicherungsbereich
  // ENTFERNT. Der technische contentDescription-Vertrag bleibt UNVERÄNDERT — es wird
  // weiter der bestehende sichere Default (Sendungsinhalt → "Paket") an /reprice und
  // /book übergeben. Kein neues öffentliches Feld, keine Zoll-/Backend-Änderung.
  const contentDescription = (form.content.trim() || "Paket").slice(0, 35);

  // Read-only Anzeigewerte (Reprice-Response bevorzugt, sonst Tarif-Felder).
  const insDetails   = tariff?.insuranceDetails && typeof tariff.insuranceDetails === "object" ? tariff.insuranceDetails : null;
  const insStdPrice  = asPos(insDetails?.extraInsurancePriceBruttoPreselect);
  const insPremPrice = asPos(insDetails?.extraInsurancePremiumPriceBruttoPreselect);

  // insCards (Kartenpreise) werden nach dem zentralen Price-View-Model gebaut —
  // sie hängen von der bestätigten/gewählten Stufe ab (siehe unten, nach insValid).

  // Clientseitige Validierung (nur Standard/Premium), GETRENNT nach Backend-
  // Grenzen. Warenwert (goodsValue): 1..9.999.999. Versicherungswert (value):
  // 1..20.000. Komma-Eingaben werden über asNum() unterstützt. contentDescription
  // ist per maxLength/slice bereits ≤ 35 → keine separate Fehlermeldung nötig.
  const goodsValueError =
    !isInsured                 ? "" :
    !goodsValue.trim()         ? "Bitte geben Sie den Warenwert an." :
    goodsValueNum == null      ? "Bitte geben Sie einen gültigen Betrag ein." :
    goodsValueNum <= 0         ? "Der Warenwert muss größer als 0 € sein." :
    goodsValueNum > 9999999    ? "Der Warenwert darf höchstens 9.999.999 € betragen." :
    "";
  const insValueError =
    !isInsured                 ? "" :
    !insuranceValue.trim()     ? "Bitte geben Sie den Versicherungswert an." :
    insuranceValueNum == null  ? "Bitte geben Sie einen gültigen Betrag ein." :
    insuranceValueNum <= 0     ? "Der Versicherungswert muss größer als 0 € sein." :
    insuranceValueNum > 20000  ? "Der Versicherungswert darf höchstens 20.000 € betragen." :
    "";
  const insValid = !isInsured || (goodsValueError === "" && insValueError === "");

  // ── Zentrales Price-View-Model (Paket B) ────────────────────────────────────
  // EINZIGE Preisquelle für Live-Leiste, Versicherungskarten, Preiszusammenfassung
  // und Buchungs-Gate. Kein Preselect wird lokal zum Gesamtpreis addiert; der
  // Gesamtbetrag stammt immer aus dem Tarif (none) ODER 1:1 aus repriceResult.totals.
  const priceView = buildBookingPriceView({
    tariff, insuranceType, repriceResult, repriceLoading, repriceStale, repriceError, insValid,
  });

  // Kartenpreise: „ab"-Preselect ODER — nur für die AUSGEWÄHLTE, bestätigte Stufe —
  // der exakte Aufpreis aus dem Reprice. Keine zweite Reprice-Anfrage für die andere Stufe.
  const insCards = [
    { id: "standard", name: "Standardversicherung",    price: insuranceCardPrice({ cardType: "standard", selectedType: insuranceType, view: priceView, preselectGross: insStdPrice }) },
    { id: "premium",  name: "Premiumversicherung",     price: insuranceCardPrice({ cardType: "premium",  selectedType: insuranceType, view: priceView, preselectGross: insPremPrice }) },
    { id: "none",     name: "Kein Versicherungsschutz", price: insuranceCardPrice({ cardType: "none",     selectedType: insuranceType, view: priceView, preselectGross: null }) },
  ];

  // Progressive Disclosure des Versicherungswert-Felds + Warenwert-über-Maximum.
  const goodsOverMax = goodsExceedsInsuranceMax(goodsValue);
  const insValueFieldVisible = insValueRevealed || insValueManual || goodsOverMax;

  // Auto-Vorbelegung Versicherungswert = Warenwert, bis der Nutzer ihn manuell ändert.
  const handleGoodsValueChange = (v) => {
    setGoodsValue(v);
    const next = autofillInsuranceValue({ goodsValue: v, insuranceValueManual: insValueManual });
    if (next != null) setInsuranceValue(next);
  };
  const handleInsuranceValueChange = (v) => { setInsuranceValue(v); setInsValueManual(true); };
  const handleSelectInsuranceType = (id) => {
    setInsuranceType(id);
    if ((id === "standard" || id === "premium") && !insValueManual) setInsuranceValue(goodsValue);
  };

  // Reprice-Request mit Seq-/Abort-Schutz: veraltete Antworten überschreiben den
  // State nie. Sendet insuranceType FLACH, keine Client-Preise (Backend-Vertrag).
  const runReprice = async (type, goodsNum, insNum, content) => {
    const seq = ++repriceSeq.current;
    if (repriceAbort.current) repriceAbort.current.abort();
    const ac = new AbortController(); repriceAbort.current = ac;
    setRepriceLoading(true); setRepriceError("");
    try {
      const r = await repriceInsurance({
        shipmentId:          bookingData?.shipmentId,
        tariffId:            tariff?.id,
        shipperTariffId:     tariff?.shipper_tariff_id,
        insuranceType:       type,
        goodsValue:          goodsNum,
        extraInsuranceValue: insNum,
        contentDescription:  content,
      }, { signal: ac.signal });
      if (seq !== repriceSeq.current) return; // veraltet → ignorieren
      if (r.status === 401 || r.status === 403) { setRepriceLoading(false); return; } // zentraler Auth-Redirect
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        setRepriceResult(null); setRepriceStale(true);
        setRepriceError(
          r.status === 400 ? (asStr(d?.error) || "Die Angaben zur Versicherung sind ungültig.") :
          r.status === 409 ? "Der Preis hat sich geändert. Bitte aktualisieren Sie den Versicherungspreis." :
          r.status === 429 ? "Zu viele Anfragen. Bitte später erneut versuchen." :
          "Versicherungspreis konnte nicht bestätigt werden."
        );
        setRepriceLoading(false);
        return;
      }
      setRepriceResult(d); setRepriceStale(false); setRepriceLoading(false);
    } catch (e) {
      if (e?.name === "AbortError") return;        // durch neueren Request ersetzt
      if (seq !== repriceSeq.current) return;
      setRepriceResult(null); setRepriceStale(true);
      setRepriceError("Versicherungspreis konnte nicht bestätigt werden.");
      setRepriceLoading(false);
    }
  };

  // Auto-Reprice bei Typwechsel oder Wertänderung (debounced 500 ms). Jede
  // Änderung markiert das letzte Ergebnis als veraltet → Buchung erst nach
  // frischem Reprice. contentDescription beeinflusst den Preis nicht und ist
  // bewusst NICHT in den Deps.
  useEffect(() => {
    if (insuranceType === "none") {
      setRepriceResult(null); setRepriceStale(false); setRepriceError("");
      repriceSeq.current++; if (repriceAbort.current) repriceAbort.current.abort();
      return;
    }
    setRepriceStale(true);
    if (!insValid) { setRepriceResult(null); return; }
    const id = setTimeout(() => runReprice(insuranceType, goodsValueNum, insuranceValueNum, contentDescription), 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insuranceType, goodsValue, insuranceValue]);

  // Laufende Requests beim Unmount abbrechen.
  useEffect(() => () => { if (repriceAbort.current) repriceAbort.current.abort(); }, []);

  // Buchung bei versicherter Auswahl nur mit BESTÄTIGTEM Preis-View (Basis ODER
  // frischer Reprice). Identisch zum bisherigen Gate — jetzt aus der einen Quelle.
  const insuranceBlocksBooking = priceViewBlocksBooking(priceView);
  // P0: Abholfenster-Hydrierung blockiert die Buchung (nur Pickup) — laufend ODER Ladefehler.
  // Gemeinsame Wahrheit für Button-Deaktivierung (BookingActionModule) und doBook-Guard.
  const pickupHydrationBlocks = pickupWindowBlocksBooking({ serviceType: tariff?.serviceType, hydration: pickupHydration });

  // ── Zoll: Validierung (nur wenn Route zollpflichtig) ────────────────────────
  const customsRequired = modules.customs;
  const hsRequired = tariff?.hsTariffNumberRequired === true;

  // ── Zoll-Handelsrechnung: Statusautomat (GET/Upload/Delete) — nur bei
  // zollpflichtiger Route mit interner shipmentId. Der Hook lädt den Status
  // einmal und hält present/absent/… vor. ──────────────────────────────────────
  const ci = useCommercialInvoice({ shipmentId: bookingData?.shipmentId, enabled: customsRequired });
  const commercialOnly = isCommercialOnly(customsExportReason); // „Commercial"/Verkauf → Handelsrechnung zwingend
  const docActive = ci.status === "present" || ci.status === "uploading" || ci.status === "deleting";
  // Effektiver Rechnungstyp: gewerblich ODER Dokument aktiv → commercial; sonst
  // die bewusste Nutzerpräferenz (Default proforma) via resolveInvoiceMode.
  const invoiceMode = docActive ? COMMERCIAL : resolveInvoiceMode(customsExportReason, customsInvoiceMode);

  // Radio-Wechsel: Proforma bei gewerblich (disabled) oder bei vorhandenem/aktivem
  // Dokument (H-Regel) NICHT still zulassen — stattdessen klarer Hinweis.
  const selectInvoiceMode = (m) => {
    if (m === PROFORMA) {
      if (commercialOnly) return;
      if (!canSelectProforma(customsExportReason, ci.status)) {
        setProformaBlockedHint("Entfernen Sie zuerst die hinterlegte Handelsrechnung, bevor Sie zur Proforma-Rechnung wechseln.");
        return;
      }
      setProformaBlockedHint(""); setCustomsInvoiceMode(PROFORMA);
    } else {
      setProformaBlockedHint(""); setCustomsInvoiceMode(COMMERCIAL);
    }
  };

  // Exportgrund-Wechsel persistiert die gespeicherte Präferenz gemäß Confidara-
  // Regel: gewerblich → commercial; Wechsel weg von gewerblich darf commercial
  // behalten (resolveInvoiceMode ist idempotent, sobald der Effekt gelaufen ist).
  useEffect(() => {
    setCustomsInvoiceMode((prev) => resolveInvoiceMode(customsExportReason, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customsExportReason]);

  // Ein bestätigtes Dokument fixiert commercial (H-Regel): bleibt nach einem
  // späteren Delete erhalten, bis der Nutzer bewusst Proforma wählt.
  useEffect(() => {
    if (ci.status === "present") setCustomsInvoiceMode(COMMERCIAL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ci.status]);

  const intPos = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0; };
  const validateCustomsItem = (it) => {
    const e = {};
    if (!it.description.trim())                   e.description = "Warenbeschreibung erforderlich.";
    if (asPos(it.value) == null)                  e.value = "Warenwert größer als 0 erforderlich.";
    if (!intPos(it.quantity))                     e.quantity = "Ganze Zahl größer als 0.";
    if (asPos(it.netWeight) == null)              e.netWeight = "Gewicht größer als 0 erforderlich.";
    if (!it.originCountry)                        e.originCountry = "Ursprungsland erforderlich.";
    if (hsRequired && !it.hsTariffNumber.trim())  e.hsTariffNumber = "HS-Code erforderlich.";
    return e;
  };
  const customsItemErrors = customsItems.map(validateCustomsItem);
  const customsExportReasonError = customsRequired && !customsExportReason ? "Bitte wählen Sie einen Exportgrund." : "";
  // Optionales Rechnungsdatum: leer erlaubt; wenn gesetzt, exakt YYYY-MM-DD + echte
  // Kalendergültigkeit (spiegelt die Backend-Regel; <input type="date"> liefert i. d. R.
  // valide Werte, getippte/ungültige werden hier defensiv abgefangen). invoiceNumber/
  // -Remark sind reine Freitext-Optionalfelder ohne clientseitige Formatpflicht.
  const isValidISODate = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };
  // Rechnungsnummer/-datum sind NUR im commercial-Modus sichtbar UND dann Pflicht.
  // In proforma keine Zusatzpflicht (Felder sind ausgeblendet).
  const commercialActive = customsRequired && invoiceMode === COMMERCIAL;
  const invoiceNumberError = commercialActive && !customsInvoiceNumber.trim()
    ? "Bitte geben Sie die Rechnungsnummer an." : "";
  const invoiceDateTrim = customsInvoiceDate.trim();
  const invoiceDateValid = invoiceDateTrim !== "" && isValidISODate(invoiceDateTrim);
  const customsInvoiceDateError = commercialActive
    ? (!invoiceDateTrim
        ? "Bitte geben Sie das Rechnungsdatum an."
        : !invoiceDateValid ? "Bitte ein gültiges Datum (Format TT.MM.JJJJ) wählen." : "")
    : "";
  // ── A. Fachliche Zollrechnungs-Metadaten (dokument-UNABHÄNGIG) ──────────────
  // Die Handelsrechnungs-PDF ist optional; der Dokumentstatus ist NICHT Teil der
  // fachlichen Gültigkeit. Proforma stellt keine Zusatzpflicht, commercial
  // verlangt Rechnungsnummer + gültiges Datum (die PDF darf fehlen).
  const customsInvoiceMetaValid = customsInvoiceFieldsValid({
    mode: invoiceMode, invoiceNumber: customsInvoiceNumber, invoiceDateValid,
  });
  // ── B. Optionale Dokument-MUTATION (Upload/Löschen läuft) ───────────────────
  // Nur eine tatsächlich laufende Mutation schützt kurzfristig gegen einen Race
  // (Doppel-Submit während Upload/Löschen). Nur im commercial-Modus möglich →
  // Proforma wird nie durch einen Dokumentstatus blockiert. Initiales Loading
  // (idle/checking) und ein Statusfehler (error) blockieren bewusst NICHT.
  const commercialInvoiceBusy = commercialActive && commercialInvoiceMutationBusy(ci.status);
  const customsInvoiceBusyMessage =
    ci.status === "uploading" ? "Die Handelsrechnung wird noch hochgeladen. Bitte warten Sie einen Moment." :
    ci.status === "deleting"  ? "Die Handelsrechnung wird noch entfernt. Bitte warten Sie einen Moment." :
    "";
  // Fachliche Zollformular-Gültigkeit (A): Exportgrund + Warenpositionen (inkl.
  // HS-Code, wenn tarifbedingt erforderlich) + Rechnungsmetadaten. KEIN
  // Dokumentstatus. Die kurzfristige Mutations-Sperre (B) ist bewusst getrennt.
  const customsFieldsValid = !customsRequired || (
    !customsExportReasonError &&
    customsItems.length >= 1 &&
    customsItemErrors.every(e => Object.keys(e).length === 0) &&
    customsInvoiceMetaValid
  );
  const customsValid = customsFieldsValid && !commercialInvoiceBusy;

  const buildParty = (p) => {
    const f = bookingData?.form || {};
    return {
      ...(f[`${p}_company`]  ? { company:         f[`${p}_company`]  } : {}),
      fullName:        f[`${p}_fullName`],
      streetAndNumber: f[`${p}_street`],
      ...(f[`${p}_addition`] ? { addressAddition: f[`${p}_addition`] } : {}),
      postalCode:      f[`${p}_zip`],
      city:            f[`${p}_city`],
      country:         f[`${p}_country`],
      ...(f[`${p}_phone`] ? { phone: f[`${p}_phone`] } : {}),
      ...(f[`${p}_email`] ? { email: f[`${p}_email`] } : {}),
    };
  };

  const fmtAddr = (p) => {
    const f = bookingData?.form || {};
    const parts = [];
    if (f[`${p}_company`])  parts.push(f[`${p}_company`]);
    parts.push(f[`${p}_fullName`]);
    parts.push(f[`${p}_street`]);
    if (f[`${p}_addition`]) parts.push(f[`${p}_addition`]);
    const zipCity = [f[`${p}_zip`], f[`${p}_city`]].filter(Boolean).join(" ");
    if (zipCity) parts.push(zipCity);
    const cName = countries.find(c => c.code === f[`${p}_country`])?.name || f[`${p}_country`];
    parts.push(cName);
    return parts.filter(Boolean).join(", ");
  };

  const doBook = async () => {
    if (!agbAccepted) return;
    // Ausschlussgüter-Bestätigung ist Pflicht — zweite Sicherung gegen einen
    // programmatisch ausgelösten Submit (der Buchen-Button ist zusätzlich
    // deaktiviert). Fehlt sie, klare, an der Checkbox aria-verknüpfte Meldung.
    if (!prohibitedGoodsAccepted) {
      setProhibitedShowError(true);
      return;
    }
    // Abholzeitfenster: nicht buchen, solange das gespeicherte Fenster noch geladen
    // wird ODER ein Ladefehler vorliegt (kein unbemerktes Buchen mit einem anderen
    // als dem angezeigten Fenster). Nur Pickup betroffen; der finale /book bleibt
    // zusätzlich der autoritative fail-closed Gate (409 PICKUP_WINDOW_CHANGED).
    if (pickupHydrationBlocks) {
      setError(pickupHydration.error
        ? "Das gespeicherte Abholzeitfenster konnte nicht geladen werden. Bitte laden Sie die Seite neu."
        : "Das Abholzeitfenster wird noch geladen. Bitte einen Moment warten.");
      return;
    }
    // Bei versicherter Auswahl nur mit frischem, gültigem Reprice buchen (die
    // exakt gerepricte Auswahl wird gebucht — nie ein veralteter Stand).
    if (isInsured && (repriceStale || !repriceResult || repriceLoading || !insValid)) {
      setError("Bitte aktualisieren Sie den Versicherungspreis, bevor Sie buchen.");
      return;
    }
    // Bei zollpflichtiger Sendung erst buchen, wenn die FACHLICHEN Zollangaben
    // vollständig sind (dieselbe zentrale Regel wie das Weiter-Gate). Der optionale
    // Dokumentstatus (PDF) ist NICHT Teil dieser Prüfung; nur eine tatsächlich
    // laufende Upload-/Löschmutation schützt kurzfristig gegen einen Race. Gilt auch
    // bei direktem Funktionsaufruf → kein /book-Request.
    if (customsRequired && !customsValid) {
      setCustomsShowErrors(true);
      setError(
        commercialInvoiceBusy
          ? customsInvoiceBusyMessage
          : "Bitte vervollständigen Sie die Angaben zum Wareninhalt."
      );
      return;
    }
    setError(""); setConflict(""); setAddressError(""); setLoading(true);
    try {
      // /book erwartet insuranceSelection VERSCHACHTELT (nicht wie /reprice flach).
      // confirmedTotalGross ist reines Drift-Gate (nie Preisquelle) — nur bei
      // Standard/Premium senden. Für "none" nur { type: "none" }.
      const insurancePayload = isInsured
        ? {
            insuranceSelection: {
              type:               repriceResult?.selectedInsurance || insuranceType,
              value:              insuranceValueNum, // → extra_insurance_value
              goodsValue:         goodsValueNum,     // → details.value_amount
              contentDescription,
            },
            confirmedTotalGross: repriceResult?.totals?.customerTotalGross,
          }
        : { insuranceSelection: { type: "none" } };
      // customsData NUR bei zollpflichtiger Route (Backend-Vertrag). Sonst bleibt
      // der bestehende Payload unverändert (EU/DE ohne customsData).
      const customsPayload = customsRequired
        ? {
            customsData: {
              exportReason: customsExportReason,
              currency: "EUR",
              items: customsItems.map((it) => ({
                description:   it.description.trim(),
                quantity:      Number(it.quantity),
                netWeight:     Number(String(it.netWeight).replace(",", ".")),
                value:         Number(String(it.value).replace(",", ".")),
                originCountry: it.originCountry,
                unitOfMeasurement: it.unitOfMeasurement,
                ...(it.hsTariffNumber.trim() ? { hsTariffNumber: it.hsTariffNumber.trim() } : {}),
              })),
              // Rechnungs-Metadaten je nach internem Modus (KEIN invoiceMode-Key, KEIN
              // document/Upload-Key): Proforma sendet invoiceNumber/invoiceDate NICHT
              // (nur remarks), Commercial sendet Nummer (getrimmt) + Datum + remarks.
              // Der Helper lässt leere Werte weg (kein "" / kein null).
              ...buildCustomsInvoiceMeta({
                invoiceNumber: invoiceMode === COMMERCIAL ? customsInvoiceNumber : "",
                invoiceDate:   invoiceMode === COMMERCIAL ? customsInvoiceDate : "",
                invoiceRemark: customsInvoiceRemark,
              }),
            },
          }
        : {};
      const r = await apiFetch(`/api/jumingo/book`, {
        method: "POST", auth: true,
        body: JSON.stringify({
          shipmentId:      bookingData?.shipmentId,
          tariffId:        tariff?.id,
          shipperTariffId: tariff?.shipper_tariff_id,
          // F3: Bei bewusst bestätigter Preisänderung (nur none-Pfad) den neuen
          // Serverpreis als price_final senden — sonst der ursprüngliche
          // Tarifpreis. Der Versicherungspfad nutzt weiterhin tariff.finalPrice
          // (Drift-Gate dort ist confirmedTotalGross, unverändert).
          price_final:     (!isInsured && confirmedFinalPriceRef.current != null)
                             ? confirmedFinalPriceRef.current
                             : tariff?.finalPrice,
          sender:          buildParty("s"),
          recipient:       buildParty("r"),
          weight:          bookingData?.form?.weight,
          // `content` bleibt unveränderter Teil des /book-Payloads. Das wirkungs-
          // lose Eingabefeld wurde aus „Sendungsdetails" entfernt; der State
          // `form.content` bleibt bewusst intern bestehen (Default "") und dient
          // weiterhin als Fallback der Versicherungs-Inhaltsbeschreibung
          // (contentDescription). Kein neu erzeugter content-Wert in diesem Slice.
          content:         form.content,
          // Optionale Referenznummer nur senden, wenn nach trim ein Wert
          // vorliegt → leerer Fall lässt den bestehenden Payload unverändert.
          ...(form.reference.trim() ? { referenceNumber: form.reference.trim() } : {}),
          // Labeldruckformat immer mitsenden (Default A4, sonst A6) — reiner
          // Fulfillment-Parameter ohne Preis-/Drift-Einfluss.
          labelFormat,
          ...insurancePayload,
          ...customsPayload,
        }),
      });
      // Body defensiv lesen: leerer Body oder eine HTML-Fehlerseite (Proxy/502)
      // warf hier früher einen rohen JSON-Parserfehler bis ins Kundenbanner.
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      // Serverseitiger Zollrechnungs-Guard (stabile Codes, statusunabhängig). Zurück
      // zum Customs-/Übersichtsschritt, Felder markieren, KEIN Auto-Retry/-Upload/
      // -Delete/-Book. Bei DOCUMENT_REQUIRED/MODE_CONFLICT genau EIN kontrollierter GET.
      if (d?.code && COMMERCIAL_INVOICE_BOOK_ERRORS[d.code]) {
        setLoading(false);
        setStep(1);
        setCustomsShowErrors(true);
        setError(COMMERCIAL_INVOICE_BOOK_ERRORS[d.code]);
        if (d.code === "COMMERCIAL_INVOICE_METADATA_INCOMPLETE"
          || d.code === "COMMERCIAL_INVOICE_METADATA_REQUIRED"
          || d.code === "COMMERCIAL_INVOICE_DOCUMENT_REQUIRED") {
          setCustomsInvoiceMode(COMMERCIAL); // commercial erzwingen/erhalten
        }
        if (d.code === "COMMERCIAL_INVOICE_DOCUMENT_REQUIRED"
          || d.code === "COMMERCIAL_INVOICE_MODE_CONFLICT") {
          ci.refreshStatus(); // genau EIN GET; present-Effekt setzt danach ggf. commercial
        }
        return;
      }
      if (r.status === 409) {
        // P0 — Abholzeitfenster-Drift: das gespeicherte individuelle Fenster ist
        // gegen den frischen Tarif nicht mehr gültig. Eigener Code (NICHT Duplikat/
        // Preis) → Spezialdialog mit den neuen verfügbaren Grenzen; Buchung gestoppt,
        // das Fenster wird NICHT still überschrieben. Erst nach bewusster Bestätigung
        // wird der Wunsch verworfen (NULL/NULL) und eine erneute Buchung erlaubt.
        if (d?.code === "PICKUP_WINDOW_CHANGED") {
          setPickupWindowChanged({
            availableFrom: d.availableFrom,
            availableUntil: d.availableUntil,
            minimumMinutes: d.minimumMinutes,
            adjustable: d.adjustable,
          });
          setLoading(false);
          return;
        }
        // F3 — Preisdrift OHNE Versicherung: zuerst und getrennt von Duplikat-/
        // Versicherungskonflikten abfangen. Nur dieser Konflikt trägt den Code
        // "PRICE_CHANGED" (Duplikate/Versicherungsdrift tun das nicht) → sauber
        // unterscheidbar, kein Duplikat-Text. Öffnet den Preisdrift-Dialog.
        if (d?.code === "PRICE_CHANGED") {
          setPriceChange({ oldPrice: d.oldPrice, newPrice: d.newPrice });
          setLoading(false);
          return;
        }
        // Bei versicherter Buchung deutet 409 auf Preis-Drift → Reprice erzwingen
        // (auf der Seite bleiben). Ohne Versicherung bleibt das bisherige
        // Duplikat-Verhalten (Sendung bereits verarbeitet) unverändert.
        if (isInsured) {
          setRepriceStale(true);
          setError(asStr(d.error) || "Der Preis hat sich geändert. Bitte aktualisieren Sie den Versicherungspreis und bestätigen Sie erneut.");
          setLoading(false);
          return;
        }
        setConflict(d.error || "Diese Sendung wurde bereits verarbeitet oder befindet sich bereits in Bearbeitung.");
        setLoading(false);
        return;
      }
      if (r.status === 401 || r.status === 403) { setLoading(false); return; } // globaler Auth-Redirect übernimmt
      if (r.status === 400 || r.status === 422) {
        const backendMsg = asStr(d.error);
        // Bei zollpflichtiger Sendung stammt ein 400 typischerweise aus dem
        // Customs-Gate → konkrete Backend-Meldung anzeigen und auf der Seite
        // bleiben (NICHT in den Adressen-"neu berechnen"-Flow leiten).
        if (customsRequired) {
          setCustomsShowErrors(true);
          setError(backendMsg || "Die Zollangaben sind unvollständig oder ungültig. Bitte prüfen Sie die Angaben zum Wareninhalt.");
          setLoading(false);
          return;
        }
        // Sonst wie bisher: das Backend lehnt unvollständige/ungültige Adressdaten
        // früh ab → kundentaugliche Meldung + Rückführung zur Adresseingabe.
        setAddressError(
          backendMsg ||
          "Die Absender- oder Empfängeradresse ist unvollständig oder ungültig. Bitte vervollständigen Sie alle Pflichtfelder und berechnen Sie die Preise neu."
        );
        setLoading(false);
        return;
      }
      if (!r.ok) {
        // Restpfad (404/429/5xx/unlesbarer Body): früher ein Sammelwurf mit
        // rohem d.error — jetzt klare, unterscheidbare Meldungen. Der Kunde
        // bleibt auf Schritt 2, alle Angaben bleiben erhalten, der Button wird
        // über setLoading(false) unten wieder frei.
        setError(mapBookRestError(r.status, d));
        setLoading(false);
        return;
      }
      if (!d || typeof d !== "object") {
        // 2xx ohne lesbares Buchungsobjekt: KEIN Erfolg, keine Navigation.
        setError(mapBookUnreadableSuccess());
        setLoading(false);
        return;
      }
      setBooking(d); setStep(3);
    } catch (e) {
      // Netzabbruch/Timeout: kein „Failed to fetch" mehr im Banner.
      setError(mapBookThrownError(e));
    }
    setLoading(false);
  };

  // F3 — „Angebote neu berechnen": den nun veralteten Buchungs-Flow bewusst
  // verlassen und zur „+ Neue Sendung"-Seite führen, wo frische Angebote
  // berechnet werden. Kein erneuter /book, keine alte Buchung, keine kaputte
  // Navigation (gleicher Zielpfad wie „Zurück").
  const handlePriceChangeRecalculate = () => {
    setPriceChange(null);
    navigate("/dashboard?page=new");
  };

  // F3 — „Zum neuen Preis fortfahren": den bestätigten neuen Preis als price_final
  // festhalten und erneut buchen. Der nächste /book sendet nie wieder den alten
  // Preis. Ändert sich der Preis erneut, öffnet doBook den Dialog mit den neuen
  // Werten; bei Erfolg greift der normale Erfolgspfad. Keine Endlosschleife —
  // jede Bestätigung nutzt den aktuellen Serverpreis, der Nutzer entscheidet
  // je Runde bewusst.
  const continueWithNewPrice = () => {
    const np = asNum(priceChange?.newPrice);
    if (np == null) return;                  // ungültiger newPrice → nur Neuberechnung möglich
    confirmedFinalPriceRef.current = np;     // neuer price_final für den nächsten /book
    setPriceChange(null);
    doBook();
  };

  // P0 — „Angebote neu berechnen" aus dem Abholfenster-Dialog: den nun veralteten
  // Buchungs-Flow bewusst verlassen und frische Angebote berechnen (gleiches Ziel
  // wie „Zurück"). Kein erneuter /book, kein Draft-Reset.
  const handlePickupWindowRecalculate = () => {
    setPickupWindowChanged(null);
    navigate("/dashboard?page=new");
  };

  // P0 — „Neues Zeitfenster übernehmen": den gespeicherten individuellen Wunsch
  // bewusst verwerfen (Draft NULL/NULL → volles frisches Carrier-Fenster) und den
  // Dialog schließen. KEIN Auto-Rebook — erst nach dieser Bestätigung ist eine
  // erneute Buchung möglich (der Nutzer klickt bewusst erneut „Kostenpflichtig
  // buchen"). Schlägt das Zurücksetzen fehl, bleibt der Dialog offen: der alte
  // Wunsch bliebe sonst gespeichert und würde beim nächsten /book erneut 409 → das
  // ist fail-closed und wird als Fehler im Dialog gemeldet.
  const acceptNewPickupWindow = async () => {
    const sid = bookingData?.shipmentId;
    setPickupResetError("");
    setPickupResetting(true);
    try {
      if (sid) {
        const r = await saveDraftPickupWindow({ shipmentId: sid, pickupTimeFrom: null, pickupTimeUntil: null });
        if (r.status === 401 || r.status === 403) { setPickupResetting(false); return; } // zentraler Auth-Redirect
        if (!r.ok) { setPickupResetting(false); setPickupResetError("Das Zeitfenster konnte nicht zurückgesetzt werden. Bitte erneut versuchen."); return; }
      }
      setPickupWindow(null);
      setPickupWindowChanged(null);
      setPickupResetting(false);
    } catch {
      setPickupResetting(false);
      setPickupResetError("Das Zeitfenster konnte nicht zurückgesetzt werden. Bitte erneut versuchen.");
    }
  };

  const handleDownloadLabel = async () => {
    if (!booking?.shipmentId) return;
    setLabelLoading(true); setLabelError("");
    try {
      await downloadLabel(booking.shipmentId);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setLabelError(e.message); // globaler Auth-Redirect übernimmt sonst
    }
    setLabelLoading(false);
  };

  const addrReady =
    !!bookingData?.form?.s_fullName && !!bookingData?.form?.s_street &&
    !!bookingData?.form?.s_zip      && !!bookingData?.form?.s_city   &&
    !!bookingData?.form?.r_fullName && !!bookingData?.form?.r_street &&
    !!bookingData?.form?.r_zip      && !!bookingData?.form?.r_city;

  if (!tariff) return (
    <div className="page-with-navbar booking-no-tariff">
      <div className="text-center">
        <p className="text-muted mb-16">Kein Angebot ausgewählt</p>
        <button className="btn btn-primary" onClick={() => navigate("/calculator")}>Zum Preisrechner</button>
      </div>
    </div>
  );

  if (!addrReady) return (
    <div className="page-with-navbar booking-no-tariff">
      <div className="text-center">
        <p className="text-muted mb-16">Adressdaten unvollständig — bitte im Preisrechner ausfüllen</p>
        <button className="btn btn-primary" onClick={() => navigate("/calculator")}>Zum Preisrechner</button>
      </div>
    </div>
  );

  // Weiter-Gate (Step 1 → 2): bei zollpflichtiger Sendung erst fortfahren, wenn die
  // Zollangaben vollständig sind — inkl. commercial (Nummer/Datum/bestätigtes Dokument).
  // Erste Hälfte der doppelten Absicherung; die zweite ist der Guard in doBook.
  const goToStep2 = () => {
    // Abholfenster-Ladefehler: auf Step 1 bleiben, wo die Fehlermeldung des Moduls
    // (mit Reload-Hinweis) sichtbar ist. Ein laufender Ladevorgang ist kurz und wird
    // hier nicht blockiert — der finale Buchungs-Guard fängt beide Fälle ohnehin ab.
    if (tariff?.serviceType === "pickup" && pickupHydration.error) {
      setError("Das gespeicherte Abholzeitfenster konnte nicht geladen werden. Bitte laden Sie die Seite neu, bevor Sie fortfahren.");
      return;
    }
    if (customsRequired && !customsValid) {
      setCustomsShowErrors(true);
      // Blockiert wird ausschließlich wegen unvollständiger FACHLICHER Zollangaben
      // ODER einer aktuell laufenden Dokument-Mutation (Upload/Löschen). Ein
      // fehlendes/ungeklärtes/fehlerhaftes Dokument blockiert NICHT (PDF optional).
      setError(
        commercialInvoiceBusy
          ? customsInvoiceBusyMessage
          : "Bitte vervollständigen Sie die Zollangaben, bevor Sie fortfahren."
      );
      return;
    }
    setError(""); setStep(2);
  };

  const steps = ["Übersicht", "Buchung", "Fertig"];

  return (
    <div className="page-with-navbar">
      <div className="container booking-wrap">
        <h1 className="heading booking-title mb-24">Sendung buchen</h1>

        {/* Step-Indicator */}
        <div className="steps-bar mb-24">
          {steps.map((s, i) => (
            <div key={i} className="step-item">
              <div className="step-wrap">
                <div className={`step-circle ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>
                  {i + 1 < step ? "✓" : i + 1}
                </div>
                <span className={`step-label ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className={`step-line ${i + 1 < step ? "done" : ""}`} />}
            </div>
          ))}
        </div>

        {/* Permanente Live-Zusammenfassung (Schritt 1 + 2) — dieselbe Preisquelle
            wie Karten und Preiszusammenfassung (zentrales Price-View-Model). */}
        {(step === 1 || step === 2) && (
          <BookingLiveSummary tariff={tariff} priceView={priceView} pickupWindow={pickupWindow} />
        )}

        {error && (typeof error === "object"
          ? <FormAlert tone="error" title={error.title} message={error.message} className="mb-16" />
          : <div className="alert alert-error mb-16" role="alert">{error}</div>)}

        {/* ── Step 1: Übersicht ── */}
        {step === 1 && (
          <div>
            <OfferSummaryModule tariff={tariff} />

            {tariff.serviceType === "dropoff" && (
              <DropoffNoticeModule
                tariff={tariff}
                senderPrefill={{
                  postCode: bookingData?.form?.s_zip,
                  city:     bookingData?.form?.s_city,
                  country:  bookingData?.form?.s_country,
                  street:   bookingData?.form?.s_street,
                }}
              />
            )}

            {tariff.serviceType === "pickup" && tariff.pickupTimeFrom && tariff.pickupTimeUntil && (
              <PickupWindowModule
                tariff={tariff}
                shipmentId={bookingData?.shipmentId}
                value={pickupWindow}
                onChange={setPickupWindow}
                onHydrationChange={setPickupHydration}
              />
            )}

            <ShipmentSummaryModule
              senderAddr={fmtAddr("s")}
              recipientAddr={fmtAddr("r")}
              packageInfo={packageInfo}
            />

            <AdditionalOptionsModule
              reference={form.reference}
              onReferenceChange={updReference}
              labelFormat={labelFormat}
              onLabelFormatChange={setLabelFormat}
            />

            {modules.customs && (
              <CustomsModule
                exportReason={customsExportReason}
                onExportReasonChange={setCustomsExportReason}
                items={customsItems}
                onItemChange={updCustomsItem}
                onAddItem={addCustomsItem}
                onRemoveItem={removeCustomsItem}
                hsRequired={hsRequired}
                itemErrors={customsItemErrors}
                exportReasonError={customsExportReasonError}
                showErrors={customsShowErrors}
                invoiceMode={invoiceMode}
                onSelectInvoiceMode={selectInvoiceMode}
                commercialOnly={commercialOnly}
                proformaHint={docActive ? proformaBlockedHint : ""}
                invoiceNumber={customsInvoiceNumber}
                onInvoiceNumberChange={setCustomsInvoiceNumber}
                invoiceNumberError={invoiceNumberError}
                invoiceDate={customsInvoiceDate}
                onInvoiceDateChange={setCustomsInvoiceDate}
                invoiceDateError={customsInvoiceDateError}
                invoiceRemark={customsInvoiceRemark}
                onInvoiceRemarkChange={setCustomsInvoiceRemark}
                ci={{
                  status: ci.status,
                  message: ci.message,
                  messageType: ci.messageType,
                  errorScope: ci.errorScope,
                  onFileSelected: ci.upload,
                  onRemove: ci.remove,
                  onRetryStatus: ci.refreshStatus,
                }}
              />
            )}

            <SaveDraftAction
              shipmentId={bookingData?.shipmentId}
              onNavigateDrafts={() => navigate("/dashboard?page=drafts")}
            />

            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => navigate("/dashboard?page=new")}>← Zurück</button>
              <button className="btn btn-primary btn-grow" onClick={goToStep2}>
                Weiter: Buchung <Icon n="arrow" s={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Buchung ── */}
        {step === 2 && (
          <div>
            <div className="calc-panel booking-confirm-panel mb-16">
              <div className="calc-panel-header booking-confirm-header">
                <Icon n="shield" s={18} c="white" />
                <h3>Verbindliche Bestellung</h3>
              </div>
              <div className="calc-panel-body">
                {/* ── Zusatzversicherung (Modul) — Sichtbarkeit über die Config ── */}
                {modules.insurance ? (
                  <InsuranceModule
                    insCards={insCards}
                    insuranceType={insuranceType}
                    onSelectType={handleSelectInsuranceType}
                    isInsured={isInsured}
                    goodsValue={goodsValue}
                    onGoodsValueChange={handleGoodsValueChange}
                    goodsValueError={goodsValueError}
                    insuranceValue={insuranceValue}
                    onInsuranceValueChange={handleInsuranceValueChange}
                    insValueError={insValueError}
                    insValueFieldVisible={insValueFieldVisible}
                    onRevealInsValue={() => setInsValueRevealed(true)}
                    goodsOverMax={goodsOverMax}
                    insuranceValueMax={INSURANCE_VALUE_MAX}
                    repriceError={repriceError}
                    isRepricing={priceView.isRepricing}
                    isStale={priceView.isStale}
                    repriceConfirmed={priceView.status === PRICE_STATUS.REPRICE_CONFIRMED}
                  />
                ) : (
                  <p className="booking-ins-unavailable">
                    Für diesen Tarif ist keine Zusatzversicherung verfügbar.
                  </p>
                )}

                <div className="booking-confirm-box">
                  <div className="booking-confirm-row">
                    <span className="text-sm text-muted">Carrier</span>
                    <span className="text-sm font-bold booking-confirm-val">{publicCarrierDisplay(tariff).name} — {publicServiceName(tariff)}</span>
                  </div>
                  {tariff.serviceType && (
                    <div className="booking-confirm-row">
                      <span className="text-sm text-muted">Serviceart</span>
                      <span className="text-sm font-bold booking-confirm-val">
                        {tariff.serviceType === "pickup" ? "Abholung" : "Shopabgabe"}{publicDropoffLabel(tariff) ? ` · ${publicDropoffLabel(tariff)}` : ""}
                      </span>
                    </div>
                  )}
                  <div className="booking-confirm-row">
                    <span className="text-sm text-muted">Absender</span>
                    <span className="text-sm font-bold booking-confirm-val">{fmtAddr("s")}</span>
                  </div>
                  <div className={`booking-confirm-row${packageInfo ? "" : " mb-16"}`}>
                    <span className="text-sm text-muted">Empfänger</span>
                    <span className="text-sm font-bold booking-confirm-val">{fmtAddr("r")}</span>
                  </div>
                  {packageInfo && (
                    <div className="booking-confirm-row mb-16">
                      <span className="text-sm text-muted">Paket</span>
                      <span className="text-sm font-bold booking-confirm-val">{packageInfo}</span>
                    </div>
                  )}
                  <PriceSummaryModule priceView={priceView} paymentTerm={user?.payment_term || 7} />
                </div>
                {modules.printerNote && (
                  <div className="booking-printer-note" role="note">
                    <Icon n="printer" s={15} c="currentColor" />
                    <span>
                      Für diesen Tarif ist ein Drucker erforderlich, da das Versandlabel
                      vor Übergabe ausgedruckt werden muss.
                    </span>
                  </div>
                )}
                <TermsModule
                  accepted={agbAccepted}
                  onChange={setAgbAccepted}
                  prohibitedAccepted={prohibitedGoodsAccepted}
                  onProhibitedChange={(v) => { setProhibitedGoodsAccepted(v); if (v) setProhibitedShowError(false); }}
                  prohibitedError={prohibitedShowError && !prohibitedGoodsAccepted
                    ? "Bitte bestätigen Sie, dass die Sendung keine ausgeschlossenen Gegenstände enthält."
                    : ""}
                />
                <BookingActionModule
                  error={error}
                  conflict={conflict}
                  addressError={addressError}
                  loading={loading}
                  agbAccepted={agbAccepted}
                  prohibitedGoodsAccepted={prohibitedGoodsAccepted}
                  insuranceBlocksBooking={insuranceBlocksBooking}
                  pickupBlocksBooking={pickupHydrationBlocks}
                  onBook={doBook}
                  onNavigateShipments={() => navigate("/dashboard?page=shipments")}
                  onNavigateNew={() => navigate("/dashboard?page=new")}
                  userEmail={user?.email}
                />
              </div>
            </div>
            <button className="btn btn-outline btn-full" onClick={() => setStep(1)} disabled={loading}>← Zurück zur Übersicht</button>
          </div>
        )}

        {/* ── Step 3: Buchung erfolgreich ── */}
        {step === 3 && booking && (
          <div className="booking-success-wrap">
            <div className="booking-success-icon">✓</div>
            <h2 className="booking-success-title">Sendung erfolgreich gebucht!</h2>
            {/* Die Confidara-Bestellnummer ist die primäre Vorgangsnummer und steht zuerst;
                die Rechnungsnummer wird getrennt daneben ausgewiesen und dient NICHT mehr als
                allgemeine Vorgangsnummer. Fehlt die Bestellnummer (Legacy-/Bestandsfall), wird
                die Zeile ausgelassen — es wird keine Ersatznummer erzeugt. */}
            <div className="booking-success-numbers mb-16" style={{ display: "flex", flexWrap: "wrap", gap: "10px 32px", justifyContent: "center" }}>
              {booking.businessOrderNumber && (
                <div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{NUMBER_LABELS.businessOrder}</div>
                  <CopyableNumber value={booking.businessOrderNumber} label={NUMBER_LABELS.businessOrder} size="lg" />
                </div>
              )}
              <div>
                <div className="text-muted" style={{ fontSize: 12 }}>{NUMBER_LABELS.invoice}</div>
                <CopyableNumber value={booking.invoiceNumber} label={NUMBER_LABELS.invoice} size="lg" />
              </div>
            </div>
            {/* Klare Trennung: Buchungsbestätigung (bereits versendet) ≠ spätere Rechnung/Rechnungs-E-Mail. */}
            <div className="booking-success-delivery mb-16">
              <p className="text-muted mb-4">{BOOKING_CONFIRMATION_LINE}{user?.email ? ` (an ${user.email})` : ""}</p>
              <p className="text-muted mb-8">{INVOICE_AUTOCREATE_LINE}</p>
              {(() => {
                const hint = invoiceDeliveryHint(invoiceDeliveryMode);
                const cls = hint.tone === "success" ? "alert-success" : hint.tone === "error" ? "alert-error" : "alert-info";
                const icon = hint.tone === "success" ? "check" : "info";
                return (
                  <div className={`alert ${cls}`} role="status" aria-live="polite">
                    <Icon n={icon} s={16} />{hint.text}
                  </div>
                );
              })()}
            </div>

            {/* Kompakter Recap — ausschließlich aus bereits vorhandenem Tarif-/
                Formular-State abgeleitet, keine neue Server-Anfrage. */}
            <div className="calc-panel booking-success-recap mb-16">
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Ihre Buchung</h3></div>
              <div className="calc-panel-body">
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">Carrier</span>
                  <span className="text-sm font-bold summary-detail-val">{publicCarrierDisplay(tariff).name} — {publicServiceName(tariff)}</span>
                </div>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">Route</span>
                  <span className="text-sm font-bold summary-detail-val">{bookingData.form.s_city} → {bookingData.form.r_city}</span>
                </div>
                {tariff.serviceType && (
                  <div className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">Serviceart</span>
                    <span className="text-sm font-bold summary-detail-val">{tariff.serviceType === "pickup" ? "Abholung" : "Shopabgabe"}</span>
                  </div>
                )}
                <PriceSummaryModule priceView={priceView} paymentTerm={user?.payment_term || 7} />
              </div>
            </div>

            {labelError && <div className="alert alert-error mb-16" role="alert">{labelError}</div>}
            {booking?.shipmentId && (
              <button className="btn btn-primary btn-full mb-16" onClick={handleDownloadLabel} disabled={labelLoading}>
                {labelLoading ? <><span className="spinner" /> Label wird geladen…</> : "Label herunterladen"}
              </button>
            )}
            {/* Ruhiger Hinweis — bewusst KEIN sofortiger Tracking-Call/Polling
                direkt nach der Buchung (Status wäre ohnehin „new"/nicht verfügbar).
                Der Trackingstatus erscheint später in „Meine Sendungen". Ist
                trackingAvailable am Tarif explizit false, würde der optimistische
                Text irreführen — dann ehrlicher Hinweis statt „wird vorbereitet". */}
            {tariff.trackingAvailable === false ? (
              <p className="booking-tracking-note">
                <Icon n="truck" s={15} c="currentColor" />
                <span>Für diesen Tarif ist keine Sendungsverfolgung verfügbar.</span>
              </p>
            ) : (
              <p className="booking-tracking-note">
                <Icon n="truck" s={15} c="currentColor" />
                <span>
                  Tracking wird vorbereitet. Die Sendungsverfolgung erscheint in Ihren
                  Sendungen, sobald der Versanddienstleister die Sendung übernommen hat.
                </span>
              </p>
            )}
            <div className="flex-center gap-12" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => navigate(INVOICES_DASHBOARD_TARGET)}>
                <Icon n="invoice" s={16} /> Zu meinen Rechnungen
              </button>
              <button className="btn btn-outline" onClick={() => navigate("/dashboard?page=shipments", { state: { justBooked: true } })}>Zu meinen Sendungen</button>
              <button className="btn btn-outline" onClick={() => navigate("/calculator")}>Neue Sendung</button>
            </div>
          </div>
        )}

      </div>

      {/* ── F3: Preisdrift-Dialog („Preisänderung erkannt") — Premium-Overlay ──
          Erscheint bei /book-Antwort 409 PRICE_CHANGED (none-Pfad). Ruhige,
          nicht-aggressive Optik; der Nutzer entscheidet bewusst zwischen
          Neuberechnung und Fortfahren zum neuen Preis. */}
      {priceChange && (
        <div className="price-drift-overlay" role="presentation">
          <div
            className="price-drift-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-drift-title"
            aria-describedby="price-drift-desc"
          >
            <div className="price-drift-badge" aria-hidden="true"><Icon n="info" s={24} c="#1D4ED8" /></div>
            <h2 id="price-drift-title" className="price-drift-title">Preisänderung erkannt</h2>
            <p id="price-drift-desc" className="price-drift-desc">
              Der Preis hat sich seit Ihrer Angebotsberechnung geändert.
            </p>

            <div className="price-drift-compare">
              <div className="price-drift-col">
                <span className="price-drift-col-label">Bisheriger Preis</span>
                <span className="price-drift-old">{money(priceChange.oldPrice)}</span>
              </div>
              <span className="price-drift-arrow" aria-hidden="true"><Icon n="arrow" s={18} c="#94a3b8" /></span>
              <div className="price-drift-col price-drift-col--new">
                <span className="price-drift-col-label">Neuer Preis</span>
                <span className="price-drift-new">{money(priceChange.newPrice)}</span>
              </div>
            </div>

            <div className="price-drift-actions">
              <button
                type="button"
                className="btn btn-outline price-drift-btn"
                onClick={handlePriceChangeRecalculate}
                disabled={loading}
              >
                Angebote neu berechnen
              </button>
              <button
                type="button"
                className="btn btn-primary price-drift-btn"
                onClick={continueWithNewPrice}
                disabled={loading || asNum(priceChange.newPrice) == null}
              >
                {loading ? <><span className="spinner" /> Wird gebucht…</> : "Zum neuen Preis fortfahren"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── P0: Abholzeitfenster-Drift-Dialog („Abholzeitfenster geändert") ──
          Erscheint bei /book-Antwort 409 PICKUP_WINDOW_CHANGED. Zeigt die neuen
          verfügbaren Grenzen, stoppt die Buchung und überschreibt das gewählte
          Fenster NICHT still. Der Nutzer entscheidet bewusst: Angebote neu
          berechnen ODER das neue vollständige Fenster übernehmen (Draft NULL/NULL,
          erst danach erneut buchbar). Bewusst KEINE generische Duplikatmeldung. */}
      {pickupWindowChanged && (
        <div className="price-drift-overlay" role="presentation">
          <div
            className="price-drift-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pickup-drift-title"
            aria-describedby="pickup-drift-desc"
          >
            <div className="price-drift-badge" aria-hidden="true"><Icon n="clock" s={24} c="#1D4ED8" /></div>
            <h2 id="pickup-drift-title" className="price-drift-title">Abholzeitfenster geändert</h2>
            <p id="pickup-drift-desc" className="price-drift-desc">
              Das verfügbare Abholzeitfenster hat sich seit Ihrer Auswahl geändert. Ihr zuvor
              gewähltes Fenster ist nicht mehr verfügbar.
            </p>

            <div className="price-drift-compare" style={{ justifyContent: "center" }}>
              <div className="price-drift-col price-drift-col--new">
                <span className="price-drift-col-label">Neu verfügbar</span>
                <span className="price-drift-new">{pickupWindowChanged.availableFrom}–{pickupWindowChanged.availableUntil} Uhr</span>
              </div>
            </div>
            {Number.isFinite(pickupWindowChanged.minimumMinutes) && pickupWindowChanged.minimumMinutes > 0 && (
              <p className="price-drift-desc">Mindestdauer des Fensters: {formatDuration(pickupWindowChanged.minimumMinutes)}.</p>
            )}

            {pickupResetError && <div className="alert alert-error mb-16">{pickupResetError}</div>}

            <div className="price-drift-actions">
              <button
                type="button"
                className="btn btn-outline price-drift-btn"
                onClick={handlePickupWindowRecalculate}
                disabled={pickupResetting}
              >
                Angebote neu berechnen
              </button>
              <button
                type="button"
                className="btn btn-primary price-drift-btn"
                onClick={acceptNewPickupWindow}
                disabled={pickupResetting}
              >
                {pickupResetting ? <><span className="spinner" /> Wird übernommen…</> : "Neues Zeitfenster übernehmen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
