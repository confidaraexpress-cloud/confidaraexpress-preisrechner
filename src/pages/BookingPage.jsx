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
import { OfferSummaryModule } from "../components/booking/OfferSummaryModule";
import { DropoffNoticeModule } from "../components/booking/DropoffNoticeModule";
import { ShipmentSummaryModule } from "../components/booking/ShipmentSummaryModule";
import { ReferenceModule } from "../components/booking/ReferenceModule";
import { CustomsModule } from "../components/booking/CustomsModule";
import { InsuranceModule } from "../components/booking/InsuranceModule";
import { PriceSummaryModule } from "../components/booking/PriceSummaryModule";
import { TermsModule } from "../components/booking/TermsModule";
import { BookingActionModule } from "../components/booking/BookingActionModule";

export default function BookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state: bookingData } = useLocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(null);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [conflict, setConflict] = useState("");
  const [addressError, setAddressError] = useState("");
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState("");

  // ── Versicherung (F1/F2): Auswahl + Live-Repricing + Übergabe an /book ──────
  const [insuranceType, setInsuranceType]   = useState("none"); // "none" | "standard" | "premium"
  const [insuredValue, setInsuredValue]     = useState("");     // Versicherter Wert (EUR), String-Eingabe
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
  const valueNum  = asNum(insuredValue);
  // Inhaltsbeschreibung: eigenes Feld → sonst Sendungsinhalt → sonst "Paket"; hart auf 35 Zeichen.
  const contentDescription = (insContent.trim() || form.content.trim() || "Paket").slice(0, 35);

  // Read-only Anzeigewerte (Reprice-Response bevorzugt, sonst Tarif-Felder).
  const insDetails   = tariff?.insuranceDetails && typeof tariff.insuranceDetails === "object" ? tariff.insuranceDetails : null;
  const insModel     = tariff?.insuranceModel   && typeof tariff.insuranceModel   === "object" ? tariff.insuranceModel   : null;
  const insBase      = asNum(repriceResult?.includedInsuranceValue) ?? asNum(insDetails?.insuranceValue);
  const insProvider  = asStr(repriceResult?.insuranceProvider) || asStr(insDetails?.insuranceProvider) || asStr(insModel?.provider);
  const insStdPrice  = asPos(insDetails?.extraInsurancePriceBruttoPreselect);
  const insPremPrice = asPos(insDetails?.extraInsurancePremiumPriceBruttoPreselect);

  // Auswahl-Cards (reine Darstellung): Name + Beschreibung + Trust + Preis. Alle
  // Werte stammen aus vorhandenen read-only Feldern — keine erfundenen Daten.
  const insTrust = insProvider ? `Versicherer: ${insProvider}` : null;
  const insCards = [
    {
      id: "none",
      name: "Keine Zusatzversicherung",
      desc: "Nur die im Tarif enthaltene Grunddeckung.",
      trust: insBase != null
        ? `Grunddeckung: max. ${money(insBase)}${insProvider ? ` · ${insProvider}` : ""}`
        : insTrust,
      priceVal: insBase != null ? `max. ${money(insBase)}` : "inklusive",
      priceSub: "Grunddeckung",
      pricePrefix: "",
      muted: true,
    },
    {
      id: "standard",
      name: "Standard",
      desc: "Absicherung Ihres Warenwerts.",
      trust: insTrust,
      priceVal: insStdPrice != null ? money(insStdPrice) : null,
      priceSub: insStdPrice != null ? "steuerfrei" : "nach Warenwert",
      pricePrefix: insStdPrice != null ? "ab " : "",
    },
    {
      id: "premium",
      name: "Premium",
      desc: "Absicherung Ihres Warenwerts.",
      trust: insTrust,
      priceVal: insPremPrice != null ? money(insPremPrice) : null,
      priceSub: insPremPrice != null ? "steuerfrei" : "nach Warenwert",
      pricePrefix: insPremPrice != null ? "ab " : "",
      hero: true,
    },
  ];

  // Clientseitige Validierung (nur Standard/Premium). contentDescription ist per
  // maxLength/slice bereits ≤ 35 → keine separate Fehlermeldung nötig.
  const insValueError =
    !isInsured                 ? "" :
    !insuredValue.trim()       ? "Bitte geben Sie den Warenwert an." :
    valueNum == null           ? "Bitte geben Sie einen gültigen Betrag ein." :
    valueNum <= 0              ? "Der Wert muss größer als 0 € sein." :
    valueNum > 20000           ? "Der versicherte Wert darf höchstens 20.000 € betragen." :
    "";
  const insValid = !isInsured || insValueError === "";

  // Reprice-Request mit Seq-/Abort-Schutz: veraltete Antworten überschreiben den
  // State nie. Sendet insuranceType FLACH, keine Client-Preise (Backend-Vertrag).
  const runReprice = async (type, valNum, content) => {
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
        goodsValue:          valNum,
        extraInsuranceValue: valNum,
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
    const id = setTimeout(() => runReprice(insuranceType, valueNum, contentDescription), 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insuranceType, insuredValue]);

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
  const customsValid = !customsRequired || (
    !customsExportReasonError &&
    customsItems.length >= 1 &&
    customsItemErrors.every(e => Object.keys(e).length === 0)
  );

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
    // Bei versicherter Auswahl nur mit frischem, gültigem Reprice buchen (die
    // exakt gerepricte Auswahl wird gebucht — nie ein veralteter Stand).
    if (isInsured && (repriceStale || !repriceResult || repriceLoading || !insValid)) {
      setError("Bitte aktualisieren Sie den Versicherungspreis, bevor Sie buchen.");
      return;
    }
    // Bei zollpflichtiger Sendung erst buchen, wenn die Wareninhalt-Angaben
    // vollständig sind → Fehler einblenden statt in einen 400 zu laufen.
    if (customsRequired && !customsValid) {
      setCustomsShowErrors(true);
      setError("Bitte vervollständigen Sie die Angaben zum Wareninhalt.");
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
              value:              valueNum,
              goodsValue:         valueNum,
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
          price_original:  tariff?.originalPrice,
          price_final:     tariff?.finalPrice,
          sender:          buildParty("s"),
          recipient:       buildParty("r"),
          weight:          bookingData?.form?.weight,
          content:         form.content,
          // Optionale Referenznummer nur senden, wenn nach trim ein Wert
          // vorliegt → leerer Fall lässt den bestehenden Payload unverändert.
          ...(form.reference.trim() ? { referenceNumber: form.reference.trim() } : {}),
          ...insurancePayload,
          ...customsPayload,
        }),
      });
      const d = await r.json();
      if (r.status === 409) {
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

            <ReferenceModule value={form.reference} onChange={updReference} />

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
              />
            )}

            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => navigate("/dashboard?page=new")}>← Zurück</button>
              <button className="btn btn-primary btn-grow" onClick={() => setStep(2)}>
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
                    insuredValue={insuredValue}
                    onInsuredValueChange={setInsuredValue}
                    insContent={insContent}
                    onInsContentChange={setInsContent}
                    insValueError={insValueError}
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
                <TermsModule accepted={agbAccepted} onChange={setAgbAccepted} />
                <BookingActionModule
                  error={error}
                  conflict={conflict}
                  addressError={addressError}
                  loading={loading}
                  agbAccepted={agbAccepted}
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
    </div>
  );
}
