import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { apiFetch, repriceInsurance } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money } from "../utils/formatters";
import { resolveCarrier, resolveCarrierName } from "../utils/carrierMap";
import { downloadLabel } from "../utils/downloadLabel";
import { useAuth } from "../context/AuthContext";

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

  const [form, setForm] = useState({ content: "" });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const tariff = bookingData?.tariff;

  // ── Versicherung: abgeleitete Werte, Validierung, Repricing ────────────────
  const asNum = (v) => { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const asPos = (v) => { const n = asNum(v); return n != null && n > 0 ? n : null; };
  const asStr = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const insurable = tariff?.insuranceAvailable === true || tariff?.insuranceDetails?.isInsurable === true;
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
          ...insurancePayload,
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
        // Das Backend lehnt unvollständige/ungültige (Pickup-)Adressdaten früh
        // mit 400/422 ab. Wir zeigen die Backend-Meldung kundentauglich an und
        // führen klar zurück zur vollständigen Adresseingabe — kein stilles
        // Scheitern, kein hängender Loading-State. Beim erneuten Berechnen wird
        // eine frische shipmentId erzeugt, der alte Tarif also nie weiterverbucht.
        setAddressError(
          d.error ||
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
            {/* Tariff */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="truck" s={18} c="#1D4ED8" /><h3>Ausgewähltes Angebot</h3></div>
              <div className="calc-panel-body">
                <div className="flex-between">
                  <div>
                    <div className="booking-carrier-wrap">
                      {resolveCarrier(tariff.carrier).logo && (
                        <img src={resolveCarrier(tariff.carrier).logo} alt="" aria-hidden="true" className="booking-carrier-logo" />
                      )}
                      <span className="booking-carrier-name">{resolveCarrierName(tariff.carrier)}</span>
                    </div>
                    <div className="text-sm text-muted">{tariff.tariffName} · {tariff.deliveryTime || "Auf Anfrage"}</div>
                    {tariff.serviceType && (
                      <div className="booking-service-info">
                        {tariff.serviceType === "pickup" ? "🚐 Abholung" : "🏪 Shopabgabe"}
                        {tariff.shopName        && ` · ${tariff.shopName}`}
                        {tariff.pickupToday     && " · Abholung heute"}
                        {tariff.printerRequired && " · Drucker erforderlich"}
                      </div>
                    )}
                  </div>
                  <div className="booking-price-col">
                    {tariff.netPrice != null ? (
                      <div className="booking-price-display">{money(tariff.netPrice)}</div>
                    ) : (
                      <div className="tariff-price-na">Preis fehlt</div>
                    )}
                    {tariff.netPrice != null && <div className="tariff-price-sub">exkl. MwSt.</div>}
                    {tariff.vatAmount != null && tariff.finalPrice != null && (
                      <div className="booking-price-detail">
                        <div>MwSt. 19% {money(tariff.vatAmount)}</div>
                        <div className="booking-price-detail-total">Brutto {money(tariff.finalPrice)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sendungsdetails */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Sendungsdetails</h3></div>
              <div className="calc-panel-body">
                {[
                  ["Absender",  fmtAddr("s")],
                  ["Empfänger", fmtAddr("r")],
                ].map(([k, v], i) => (
                  <div key={i} className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">{k}</span>
                    <span className="text-sm font-bold summary-detail-val">{v}</span>
                  </div>
                ))}
                <div className="field mt-12 booking-content-field">
                  <label className="field-label">
                    Sendungsinhalt <span className="field-optional">(optional)</span>
                  </label>
                  <input
                    className="field-input"
                    value={form.content}
                    onChange={e => upd("content", e.target.value)}
                    placeholder="z.B. Elektronik, Dokumente …"
                    maxLength={200}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => navigate(-1)}>← Zurück</button>
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
                {/* ── Zusatzversicherung: Auswahl-Cards + Live-Preis (Darstellung) ── */}
                {insurable ? (
                  <div className="booking-insurance-box">
                    <div className="ins-head">
                      <span className="ins-head-title"><Icon n="shield" s={16} c="currentColor" /> Zusatzversicherung</span>
                      <span className="ins-badge-taxfree">steuerfrei</span>
                    </div>
                    <p className="ins-head-sub">
                      Optional — sichern Sie den Warenwert Ihrer Sendung zusätzlich ab.
                    </p>

                    <div className="ins-cards" role="radiogroup" aria-label="Zusatzversicherung wählen">
                      {insCards.map(c => {
                        const selected = insuranceType === c.id;
                        return (
                          <label
                            key={c.id}
                            className={`ins-card${selected ? " ins-card--selected" : ""}${c.muted ? " ins-card--muted" : ""}${c.hero ? " ins-card--hero" : ""}`}
                          >
                            <input
                              type="radio"
                              name="insuranceType"
                              value={c.id}
                              checked={selected}
                              onChange={() => setInsuranceType(c.id)}
                            />
                            <span className="ins-card-radio" aria-hidden="true" />
                            <span className="ins-card-main">
                              <span className="ins-card-name">{c.name}</span>
                              <span className="ins-card-desc">{c.desc}</span>
                              {c.trust && <span className="ins-card-trust">{c.trust}</span>}
                            </span>
                            <span className="ins-card-price">
                              {c.priceVal != null && (
                                <span className="ins-card-price-val">{c.pricePrefix}{c.priceVal}</span>
                              )}
                              {c.priceSub && <span className="ins-card-price-sub">{c.priceSub}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {isInsured && (
                      <div className="ins-fields">
                        <div className="field">
                          <label className="field-label" htmlFor="ins-value">Versicherter Wert (EUR)</label>
                          <input
                            id="ins-value"
                            className={`field-input${insValueError ? " field-input-error" : ""}`}
                            type="number" inputMode="decimal" min="0" max="20000" step="0.01"
                            value={insuredValue}
                            onChange={e => setInsuredValue(e.target.value)}
                            placeholder="z. B. 500"
                          />
                          {insValueError && <span className="field-error">{insValueError}</span>}
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="ins-content">
                            Inhaltsbeschreibung <span className="field-optional">(max. 35 Zeichen)</span>
                          </label>
                          <input
                            id="ins-content"
                            className="field-input"
                            value={insContent}
                            onChange={e => setInsContent(e.target.value)}
                            placeholder={form.content?.trim() ? form.content.trim().slice(0, 35) : "Paket"}
                            maxLength={35}
                          />
                        </div>
                        {/* Live-Status statt manuellem Button — der debounced Reprice
                            läuft automatisch (Logik unverändert). */}
                        <div className="ins-status" aria-live="polite">
                          {repriceError ? (
                            <span className="ins-status-error"><Icon n="info" s={14} c="currentColor" /> {repriceError}</span>
                          ) : repricePending ? (
                            <span className="ins-status-loading"><span className="spinner spinner-dark" /> Preis wird aktualisiert…</span>
                          ) : (repriceResult && !repriceStale) ? (
                            <span className="ins-status-ok">✓ Preis aktualisiert</span>
                          ) : null}
                        </div>
                        <p className="ins-note">
                          Die Zusatzversicherung ist steuerfrei und wird ohne 19 % MwSt. separat ausgewiesen.
                        </p>
                      </div>
                    )}
                  </div>
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
                  <div className="booking-confirm-row">
                    <span className="text-sm text-muted">Absender</span>
                    <span className="text-sm font-bold booking-confirm-val">
                      {bookingData.form.s_fullName}, {bookingData.form.s_zip} {bookingData.form.s_city}
                    </span>
                  </div>
                  <div className="booking-confirm-row mb-16">
                    <span className="text-sm text-muted">Empfänger</span>
                    <span className="text-sm font-bold booking-confirm-val">
                      {bookingData.form.r_fullName}, {bookingData.form.r_zip} {bookingData.form.r_city}
                    </span>
                  </div>
                  {showRepriceTotals ? (
                    // Preisaufteilung ausschließlich aus response.totals — keine
                    // clientseitige Addition, keine MwSt./Marge auf Versicherung.
                    <>
                      <div className="booking-confirm-row">
                        <span className="text-sm text-muted">Versand (brutto)</span>
                        <span className="text-sm font-bold booking-confirm-val">{money(rt.customerShippingGross)}</span>
                      </div>
                      <div className="booking-confirm-subrow">
                        <span className="booking-confirm-subnote">
                          Netto {money(rt.customerShippingNet)} · MwSt. 19 % {money(rt.shippingVat)}
                        </span>
                      </div>
                      <div className="booking-confirm-row mb-16">
                        <span className="text-sm text-muted">
                          Zusatzversicherung <span className="booking-tax-chip">steuerfrei</span>
                        </span>
                        <span className="text-sm font-bold booking-confirm-val">{money(rt.insuranceGross)}</span>
                      </div>
                      <div className="booking-total-row">
                        <span className="booking-total-label">Gesamtbetrag</span>
                        <span className="booking-total-amount">{money(rt.customerTotalGross)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {tariff.netPrice != null && (
                        <div className="booking-confirm-row">
                          <span className="text-sm text-muted">Nettobetrag</span>
                          <span className="text-sm font-bold booking-confirm-val">{money(tariff.netPrice)}</span>
                        </div>
                      )}
                      {tariff.vatAmount != null && (
                        <div className="booking-confirm-row">
                          <span className="text-sm text-muted">MwSt. 19%</span>
                          <span className="text-sm font-bold booking-confirm-val">{money(tariff.vatAmount)}</span>
                        </div>
                      )}
                      <div className="booking-total-row">
                        <span className="booking-total-label">Gesamtbetrag brutto</span>
                        <span className="booking-total-amount">{money(tariff.finalPrice)}</span>
                      </div>
                    </>
                  )}
                  <p className="booking-payment-note">
                    inkl. 19 % MwSt. auf Versand · Zahlung: {user?.payment_term || 7} Tage auf Rechnung
                  </p>
                </div>
                {tariff.printerRequired === true && (
                  <div className="booking-printer-note" role="note">
                    <Icon n="printer" s={15} c="currentColor" />
                    <span>
                      Für diesen Tarif ist ein Drucker erforderlich, da das Versandlabel
                      vor Übergabe ausgedruckt werden muss.
                    </span>
                  </div>
                )}
                <label className="booking-agb-label">
                  <input type="checkbox" className="booking-agb-checkbox" checked={agbAccepted} onChange={e => setAgbAccepted(e.target.checked)} />
                  <span className="booking-agb-text">
                    Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
                    <Link to="/agb" className="booking-agb-link">Allgemeinen Geschäftsbedingungen</Link>{" "}
                    zu. Mir ist bewusst, dass diese Bestellung verbindlich ist und eine Zahlungsverpflichtung auslöst.
                  </span>
                </label>
                {error && <div className="alert alert-error">{error}</div>}
                {conflict ? (
                  <div className="booking-conflict-box">
                    <p className="booking-conflict-text"><Icon n="shield" s={16} c="#1D4ED8" /> {conflict}</p>
                    <button className="btn btn-primary btn-full" onClick={() => navigate("/dashboard?page=shipments")}>
                      Zu meinen Sendungen
                    </button>
                  </div>
                ) : addressError ? (
                  <div className="booking-conflict-box">
                    <p className="booking-conflict-text"><Icon n="info" s={16} c="#1D4ED8" /> {addressError}</p>
                    <button className="btn btn-primary btn-full" onClick={() => navigate("/dashboard?page=new")}>
                      Adressen vervollständigen &amp; neu berechnen
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-primary btn-full booking-book-btn" onClick={doBook} disabled={loading || !agbAccepted || insuranceBlocksBooking}>
                    {loading ? <><span className="spinner" /> Sendung wird gebucht…</> : "Kostenpflichtig buchen"}
                  </button>
                )}
                <p className="booking-email-note">
                  Nach der Buchung erhalten Sie eine Bestätigung per E-Mail an {user?.email}
                </p>
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
            {labelError && <div className="alert alert-error mb-16">{labelError}</div>}
            {booking?.shipmentId && (
              <button className="btn btn-primary btn-full mb-16" onClick={handleDownloadLabel} disabled={labelLoading}>
                {labelLoading ? <><span className="spinner" /> Label wird geladen…</> : "Label herunterladen"}
              </button>
            )}
            {/* Ruhiger Hinweis — bewusst KEIN sofortiger Tracking-Call/Polling
                direkt nach der Buchung (Status wäre ohnehin „new"/nicht verfügbar).
                Der Trackingstatus erscheint später in „Meine Sendungen". */}
            <p className="booking-tracking-note">
              <Icon n="truck" s={15} c="currentColor" />
              <span>
                Tracking wird vorbereitet. Die Sendungsverfolgung erscheint in Ihren
                Sendungen, sobald der Versanddienstleister die Sendung übernommen hat.
              </span>
            </p>
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
