import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiFetch, repriceInsurance } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money } from "../utils/formatters";
import { resolveCarrierName } from "../utils/carrierMap";
import { downloadLabel } from "../utils/downloadLabel";
import { useAuth } from "../context/AuthContext";
import { getBookingModules } from "../utils/bookingModules";
import { buildCustomsInvoiceMeta } from "../utils/customsInvoiceMeta";
import { PROFORMA, COMMERCIAL, isCommercialOnly, resolveInvoiceMode, canSelectProforma, customsInvoiceFieldsValid, commercialInvoiceMutationBusy } from "../utils/customsInvoiceMode";
import { useCommercialInvoice } from "../hooks/useCommercialInvoice";
import { OfferSummaryModule } from "../components/booking/OfferSummaryModule";
import { DropoffNoticeModule } from "../components/booking/DropoffNoticeModule";
import { ShipmentSummaryModule } from "../components/booking/ShipmentSummaryModule";
import { AdditionalOptionsModule } from "../components/booking/AdditionalOptionsModule";
import { CustomsModule } from "../components/booking/CustomsModule";
import { InsuranceModule } from "../components/booking/InsuranceModule";
import { PriceSummaryModule } from "../components/booking/PriceSummaryModule";
import { TermsModule } from "../components/booking/TermsModule";
import { BookingActionModule } from "../components/booking/BookingActionModule";

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
  const [insContent, setInsContent]         = useState("");     // Inhaltsbeschreibung (max. 35), Default "Paket"
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
  // Inhaltsbeschreibung: eigenes Feld → sonst Sendungsinhalt → sonst "Paket"; hart auf 35 Zeichen.
  const contentDescription = (insContent.trim() || form.content.trim() || "Paket").slice(0, 35);

  // Read-only Anzeigewerte (Reprice-Response bevorzugt, sonst Tarif-Felder).
  const insDetails   = tariff?.insuranceDetails && typeof tariff.insuranceDetails === "object" ? tariff.insuranceDetails : null;
  const insStdPrice  = asPos(insDetails?.extraInsurancePriceBruttoPreselect);
  const insPremPrice = asPos(insDetails?.extraInsurancePremiumPriceBruttoPreselect);

  // Auswahl-Cards (reine Darstellung): Titel + echter Preis (Fallback
  // „nach Warenwert"). Reihenfolge wie JUMiNGO: Standard · Premium · Kein Schutz.
  // Bulletpoints und Bedingungs-Links liefert das InsuranceModule (bewusst
  // übernommene statische Inhalte). Preise stammen aus echten Tariffeldern.
  const insCards = [
    {
      id: "standard",
      name: "Standardversicherung",
      tone: "positive",
      priceVal: insStdPrice != null ? money(insStdPrice) : "nach Warenwert",
      priceSub: insStdPrice != null ? "steuerfrei" : null,
      pricePrefix: insStdPrice != null ? "ab " : "",
    },
    {
      id: "premium",
      name: "Premiumversicherung",
      tone: "positive",
      priceVal: insPremPrice != null ? money(insPremPrice) : "nach Warenwert",
      priceSub: insPremPrice != null ? "steuerfrei" : null,
      pricePrefix: insPremPrice != null ? "ab " : "",
    },
    {
      id: "none",
      name: "Kein Versicherungsschutz",
      tone: "neutral",
      priceVal: null,
    },
  ];

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

  // Preis-/Total-Aufteilung ausschließlich aus der Reprice-Response.
  const rt = repriceResult?.totals || null;
  const showRepriceTotals = isInsured && rt && asPos(rt.insuranceGross) != null;
  // Dezenter Live-Status: ein Reprice ist ausstehend, sobald sich Auswahl/Wert
  // geändert haben und die Eingabe gültig ist (der debounced Effekt feuert dann).
  const repricePending = isInsured && (repriceLoading || (repriceStale && insValid && !repriceError));
  // Buchung bei versicherter Auswahl nur mit frischem, gültigem Reprice.
  const insuranceBlocksBooking = isInsured && (repriceLoading || repriceStale || !repriceResult || !!repriceError || !insValid);
  // Platzhalter für das Inhaltsbeschreibungs-Feld (unverändert: Sendungsinhalt → "Paket").
  const insContentPlaceholder = form.content?.trim() ? form.content.trim().slice(0, 35) : "Paket";

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
          carrier:         tariff?.carrier,
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
      const d = await r.json();
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
      if (!r.ok) throw new Error(d.error || "Buchung fehlgeschlagen");
      setBooking(d); setStep(3);
    } catch (e) { setError(e.message); }
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

        {error && <div className="alert alert-error mb-16">{error}</div>}

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

            <ShipmentSummaryModule
              senderAddr={fmtAddr("s")}
              recipientAddr={fmtAddr("r")}
              packageInfo={packageInfo}
              content={form.content}
              onContentChange={(v) => upd("content", v)}
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
                    onSelectType={setInsuranceType}
                    isInsured={isInsured}
                    goodsValue={goodsValue}
                    onGoodsValueChange={setGoodsValue}
                    goodsValueError={goodsValueError}
                    insuranceValue={insuranceValue}
                    onInsuranceValueChange={setInsuranceValue}
                    insValueError={insValueError}
                    insContent={insContent}
                    onInsContentChange={setInsContent}
                    contentPlaceholder={insContentPlaceholder}
                    repriceError={repriceError}
                    repricePending={repricePending}
                    repriceResult={repriceResult}
                    repriceStale={repriceStale}
                  />
                ) : (
                  <p className="booking-ins-unavailable">
                    Für diesen Tarif ist keine Zusatzversicherung verfügbar.
                  </p>
                )}

                <div className="booking-confirm-box">
                  <div className="booking-confirm-row">
                    <span className="text-sm text-muted">Carrier</span>
                    <span className="text-sm font-bold booking-confirm-val">{resolveCarrierName(tariff.carrier)} — {tariff.tariffName}</span>
                  </div>
                  {tariff.serviceType && (
                    <div className="booking-confirm-row">
                      <span className="text-sm text-muted">Serviceart</span>
                      <span className="text-sm font-bold booking-confirm-val">
                        {tariff.serviceType === "pickup" ? "Abholung" : "Shopabgabe"}{tariff.shopName ? ` · ${tariff.shopName}` : ""}
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
                  <PriceSummaryModule
                    showRepriceTotals={showRepriceTotals}
                    rt={rt}
                    tariff={tariff}
                    paymentTerm={user?.payment_term || 7}
                  />
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
            <p className="text-muted mb-8">Rechnungsnummer: <strong className="booking-invoice-num">{booking.invoiceNumber}</strong></p>
            <p className="text-muted mb-24">Bestätigung wurde an {user?.email} gesendet.</p>

            {/* Kompakter Recap — ausschließlich aus bereits vorhandenem Tarif-/
                Formular-State abgeleitet, keine neue Server-Anfrage. */}
            <div className="calc-panel booking-success-recap mb-16">
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Ihre Buchung</h3></div>
              <div className="calc-panel-body">
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">Carrier</span>
                  <span className="text-sm font-bold summary-detail-val">{resolveCarrierName(tariff.carrier)} — {tariff.tariffName}</span>
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
                <PriceSummaryModule
                  showRepriceTotals={showRepriceTotals}
                  rt={rt}
                  tariff={tariff}
                  paymentTerm={user?.payment_term || 7}
                />
              </div>
            </div>

            {labelError && <div className="alert alert-error mb-16">{labelError}</div>}
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
            <div className="flex-center gap-12">
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
    </div>
  );
}
