import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API, authH } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money } from "../utils/formatters";
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
  const [form, setForm] = useState({
    sender_name: user?.company_name || "", sender_street: user?.street || "",
    sender_zip: user?.zip || "", sender_city: user?.city || "", sender_country: user?.country || "DE",
    rec_name: "", rec_street: "", rec_zip: "", rec_city: "", rec_country: "DE",
    content: "",
  });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const tariff = bookingData?.tariff;

  const doBook = async () => {
    if (!agbAccepted) return;
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/api/jumingo/book`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          shipmentId: bookingData?.shipmentId, tariffId: tariff?.id,
          shipperTariffId: tariff?.shipper_tariff_id, carrier: tariff?.carrier,
          price_original: tariff?.originalPrice, price_final: tariff?.finalPrice,
          senderAddress: `${form.sender_name}, ${form.sender_street}, ${form.sender_zip} ${form.sender_city}`,
          recipientAddress: `${form.rec_name}, ${form.rec_street}, ${form.rec_zip} ${form.rec_city}, ${form.rec_country}`,
          weight: bookingData?.form?.weight, content: form.content,
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Buchung fehlgeschlagen");
      setBooking(d); setStep(5);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  if (!tariff) return (
    <div className="page-with-navbar booking-no-tariff">
      <div className="text-center">
        <p className="text-muted mb-16">Kein Angebot ausgewählt</p>
        <button className="btn btn-primary" onClick={() => navigate("/calculator")}>Zum Preisrechner</button>
      </div>
    </div>
  );

  const steps = ["Angebot", "Adressen", "Übersicht", "Bestätigung", "Fertig"];

  return (
    <div className="page-with-navbar">
      <div className="container booking-wrap">
        <h1 className="heading booking-title mb-24">Sendung buchen</h1>
        <div className="steps-bar mb-24">
          {steps.map((s, i) => (
            <div key={i} className="step-item">
              <div className="step-wrap">
                <div className={`step-circle ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>{i + 1 < step ? "✓" : i + 1}</div>
                <span className={`step-label ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className={`step-line ${i + 1 < step ? "done" : ""}`} />}
            </div>
          ))}
        </div>
        {error && <div className="alert alert-error mb-16">{error}</div>}

        {step === 1 && (
          <div>
            <div className="calc-panel">
              <div className="calc-panel-header"><Icon n="truck" s={18} c="#1D4ED8" /><h3>Ausgewähltes Angebot</h3></div>
              <div className="calc-panel-body">
                <div className="flex-between">
                  <div>
                    <div className="booking-carrier-name">{tariff.carrier}</div>
                    <div className="text-sm text-muted">{tariff.tariffName} · {tariff.deliveryTime || "Auf Anfrage"}</div>
                    {tariff.serviceType && (
                      <div className="booking-service-info">
                        {tariff.serviceType === "pickup" ? "🚐 Abholung" : "🏪 Shopabgabe"}
                        {tariff.shopName && ` · ${tariff.shopName}`}
                        {tariff.pickupToday && " · Abholung heute"}
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
            <button className="btn btn-primary btn-full mt-16" onClick={() => setStep(2)}>Weiter: Adressen <Icon n="arrow" s={16} /></button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="map" s={18} c="#1D4ED8" /><h3>Absender</h3></div>
              <div className="calc-panel-body">
                <div className="field"><label className="field-label">Name / Firma</label><input className="field-input" value={form.sender_name} onChange={e => upd("sender_name", e.target.value)} /></div>
                <div className="field"><label className="field-label">Straße & Hausnummer</label><input className="field-input" value={form.sender_street} onChange={e => upd("sender_street", e.target.value)} /></div>
                <div className="field-row field-row-3">
                  <div className="field"><label className="field-label">PLZ</label><input className="field-input" value={form.sender_zip} onChange={e => upd("sender_zip", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Stadt</label><input className="field-input" value={form.sender_city} onChange={e => upd("sender_city", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.sender_country} onChange={e => upd("sender_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                </div>
              </div>
            </div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="map" s={18} c="#1D4ED8" /><h3>Empfänger</h3></div>
              <div className="calc-panel-body">
                <div className="field"><label className="field-label">Name / Firma</label><input className="field-input" value={form.rec_name} onChange={e => upd("rec_name", e.target.value)} /></div>
                <div className="field"><label className="field-label">Straße & Hausnummer</label><input className="field-input" value={form.rec_street} onChange={e => upd("rec_street", e.target.value)} /></div>
                <div className="field-row field-row-3">
                  <div className="field"><label className="field-label">PLZ</label><input className="field-input" value={form.rec_zip} onChange={e => upd("rec_zip", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Stadt</label><input className="field-input" value={form.rec_city} onChange={e => upd("rec_city", e.target.value)} /></div>
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.rec_country} onChange={e => upd("rec_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                </div>
                <div className="field"><label className="field-label">Sendungsinhalt</label><input className="field-input" value={form.content} onChange={e => upd("content", e.target.value)} placeholder="z.B. Elektronik" /></div>
              </div>
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(1)}>← Zurück</button>
              <button className="btn btn-primary btn-grow" onClick={() => setStep(3)} disabled={!form.rec_name || !form.rec_zip || !form.sender_name || !form.sender_zip}>Weiter: Übersicht →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Zusammenfassung</h3></div>
              <div className="calc-panel-body">
                {[
                  ["Carrier", tariff.carrier],
                  ["Service", tariff.tariffName],
                  ["Lieferzeit", tariff.deliveryTime || "Auf Anfrage"],
                  ...(tariff.netPrice != null ? [["Netto", money(tariff.netPrice)]] : []),
                  ...(tariff.vatAmount != null ? [["MwSt. 19%", money(tariff.vatAmount)]] : []),
                  ["Gesamtbetrag (brutto)", money(tariff.finalPrice)],
                  ["Absender", `${form.sender_name}, ${form.sender_street}, ${form.sender_zip} ${form.sender_city}`],
                  ["Empfänger", `${form.rec_name}, ${form.rec_street}, ${form.rec_zip} ${form.rec_city}, ${form.rec_country}`],
                  ["Inhalt", form.content || "—"],
                ].map(([k, v], i, arr) => (
                  <div key={i} className={`summary-detail-row${i < arr.length - 1 ? " summary-detail-row-border" : ""}`}>
                    <span className="text-sm text-muted summary-detail-key">{k}</span>
                    <span className="text-sm font-bold summary-detail-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(2)}>← Zurück</button>
              <button className="btn btn-primary btn-grow" onClick={() => setStep(4)}>Weiter: Verbindlich bestellen →</button>
            </div>
          </div>
        )}

        {step === 4 && (
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
                    <span className="text-sm font-bold booking-confirm-val">{tariff.carrier} — {tariff.tariffName}</span>
                  </div>
                  <div className="booking-confirm-row">
                    <span className="text-sm text-muted">Absender</span>
                    <span className="text-sm font-bold booking-confirm-val">{form.sender_name}, {form.sender_zip} {form.sender_city}</span>
                  </div>
                  <div className="booking-confirm-row mb-16">
                    <span className="text-sm text-muted">Empfänger</span>
                    <span className="text-sm font-bold booking-confirm-val">{form.rec_name}, {form.rec_zip} {form.rec_city}</span>
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
                    inkl. 19% MwSt. · Zahlung auf Rechnung · {user?.payment_term || 7} Tage Zahlungsziel
                  </p>
                </div>
                <label className="booking-agb-label">
                  <input type="checkbox" className="booking-agb-checkbox" checked={agbAccepted} onChange={e => setAgbAccepted(e.target.checked)} />
                  <span className="booking-agb-text">
                    Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
                    <span className="booking-agb-link">Allgemeinen Geschäftsbedingungen</span>{" "}
                    zu. Mir ist bewusst, dass diese Bestellung verbindlich ist und eine Zahlungsverpflichtung auslöst.
                  </span>
                </label>
                {error && <div className="alert alert-error">{error}</div>}
                <button className="btn btn-primary btn-full booking-book-btn" onClick={doBook} disabled={loading || !agbAccepted}>
                  {loading ? <><span className="spinner" /> Sendung wird gebucht…</> : "✓ Jetzt verbindlich bestellen"}
                </button>
                <p className="booking-email-note">
                  Nach der Buchung erhalten Sie eine Bestätigung per E-Mail an {user?.email}
                </p>
              </div>
            </div>
            <button className="btn btn-outline btn-full" onClick={() => setStep(3)} disabled={loading}>← Zurück zur Übersicht</button>
          </div>
        )}

        {step === 5 && booking && (
          <div className="booking-success-wrap">
            <div className="booking-success-icon">✓</div>
            <h2 className="booking-success-title">Sendung gebucht!</h2>
            <p className="text-muted mb-8">Rechnungsnummer: <strong style={{ color: "var(--navy)" }}>{booking.invoiceNumber}</strong></p>
            <p className="text-muted mb-24">Bestätigung wurde an {user?.email} gesendet.</p>
            <div className="flex-center gap-12">
              <button className="btn btn-primary" onClick={() => navigate("/dashboard", { state: { justBooked: true } })}>Zum Dashboard</button>
              <button className="btn btn-outline" onClick={() => navigate("/calculator")}>Neue Sendung</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
