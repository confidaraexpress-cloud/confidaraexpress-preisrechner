import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { apiFetch } from "../api/client";
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
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState("");

  const [form, setForm] = useState({ content: "" });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const tariff = bookingData?.tariff;

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
    setError(""); setConflict(""); setLoading(true);
    try {
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
        }),
      });
      const d = await r.json();
      if (r.status === 409) {
        setConflict(d.error || "Diese Sendung wurde bereits verarbeitet oder befindet sich bereits in Bearbeitung.");
        setLoading(false);
        return;
      }
      if (r.status === 401 || r.status === 403) { setLoading(false); return; } // globaler Auth-Redirect übernimmt
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

  if (!tariff || !addrReady) return (
    <div className="page-with-navbar booking-no-tariff">
      <div className="text-center">
        <p className="text-muted mb-16">
          {!tariff ? "Kein Angebot ausgewählt" : "Adressdaten unvollständig — bitte im Preisrechner ausfüllen"}
        </p>
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
                  <p className="booking-payment-note">
                    inkl. 19 % MwSt. · Abrechnung per Rechnung ·{" "}
                    {user?.payment_term
                      ? `zahlbar innerhalb von ${user.payment_term} Tagen`
                      : "zahlbar gemäß vereinbartem Zahlungsziel"}
                  </p>
                </div>
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
                ) : (
                  <button className="btn btn-primary btn-full booking-book-btn" onClick={doBook} disabled={loading || !agbAccepted}>
                    {loading ? <><span className="spinner" /> Sendung wird gebucht…</> : "✓ Jetzt verbindlich bestellen"}
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
