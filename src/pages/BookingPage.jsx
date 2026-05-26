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
    <div style={{ paddingTop: 88, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="text-center">
        <p className="text-muted mb-16">Kein Angebot ausgewählt</p>
        <button className="btn btn-primary" onClick={() => navigate("/calculator")}>Zum Preisrechner</button>
      </div>
    </div>
  );

  const steps = ["Angebot", "Adressen", "Übersicht", "Bestätigung", "Fertig"];

  return (
    <div className="page-with-navbar">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 760 }}>
        <h1 className="heading mb-24" style={{ fontSize: 24, color: "var(--navy)" }}>Sendung buchen</h1>
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
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--navy)" }}>{tariff.carrier}</div>
                    <div className="text-sm text-muted">{tariff.tariffName} · {tariff.deliveryTime || "Auf Anfrage"}</div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", fontFamily: "DM Mono, monospace" }}>{money(tariff.finalPrice)}</div>
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
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)} disabled={!form.rec_name || !form.rec_zip || !form.sender_name || !form.sender_zip}>Weiter: Übersicht →</button>
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
                  ["Preis", money(tariff.finalPrice)],
                  ["Absender", `${form.sender_name}, ${form.sender_street}, ${form.sender_zip} ${form.sender_city}`],
                  ["Empfänger", `${form.rec_name}, ${form.rec_street}, ${form.rec_zip} ${form.rec_city}, ${form.rec_country}`],
                  ["Inhalt", form.content || "—"],
                ].map(([k, v], i, arr) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", gap: 16 }}>
                    <span className="text-sm text-muted" style={{ flexShrink: 0 }}>{k}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)", textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={() => setStep(2)}>← Zurück</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(4)}>Weiter: Verbindlich bestellen →</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="calc-panel mb-16" style={{ border: "2px solid var(--blue)" }}>
              <div className="calc-panel-header" style={{ background: "linear-gradient(135deg, var(--navy), var(--blue2))" }}>
                <Icon n="shield" s={18} c="white" />
                <h3 style={{ color: "white" }}>Verbindliche Bestellung</h3>
              </div>
              <div className="calc-panel-body">
                <div style={{ background: "var(--gray50)", borderRadius: "var(--radius)", padding: "16px", marginBottom: "20px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span className="text-sm text-muted">Carrier</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>{tariff.carrier} — {tariff.tariffName}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span className="text-sm text-muted">Absender</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)", textAlign: "right" }}>{form.sender_name}, {form.sender_zip} {form.sender_city}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <span className="text-sm text-muted">Empfänger</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)", textAlign: "right" }}>{form.rec_name}, {form.rec_zip} {form.rec_city}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "2px solid var(--border)" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>Gesamtbetrag</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: "var(--blue2)", fontFamily: "DM Mono, monospace" }}>{money(tariff.finalPrice)}</span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "var(--gray400)", marginTop: 4 }}>
                    inkl. MwSt. · Zahlung auf Rechnung · {user?.payment_term || 28} Tage Zahlungsziel
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 20 }}>
                  <input type="checkbox" checked={agbAccepted} onChange={e => setAgbAccepted(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--blue)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "var(--gray600)", lineHeight: 1.6 }}>
                    Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
                    <span style={{ color: "var(--blue2)", fontWeight: 600 }}>Allgemeinen Geschäftsbedingungen</span>{" "}
                    zu. Mir ist bewusst, dass diese Bestellung verbindlich ist und eine Zahlungsverpflichtung auslöst.
                  </span>
                </label>
                {error && <div className="alert alert-error">{error}</div>}
                <button className="btn btn-primary btn-full" onClick={doBook} disabled={loading || !agbAccepted} style={{ fontSize: 15, padding: "13px", opacity: agbAccepted ? 1 : 0.5 }}>
                  {loading ? <><span className="spinner" /> Sendung wird gebucht…</> : "✓ Jetzt verbindlich bestellen"}
                </button>
                <p style={{ textAlign: "center", fontSize: 12, color: "var(--gray400)", marginTop: 12 }}>
                  Nach der Buchung erhalten Sie eine Bestätigung per E-Mail an {user?.email}
                </p>
              </div>
            </div>
            <button className="btn btn-outline btn-full" onClick={() => setStep(3)} disabled={loading}>← Zurück zur Übersicht</button>
          </div>
        )}

        {step === 5 && booking && (
          <div className="text-center" style={{ padding: "40px 0" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--success-bg)", border: "3px solid var(--success)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>✓</div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>Sendung gebucht!</h2>
            <p className="text-muted mb-8">Rechnungsnummer: <strong style={{ color: "var(--navy)" }}>{booking.invoiceNumber}</strong></p>
            <p className="text-muted mb-24">Bestätigung wurde an {user?.email} gesendet.</p>
            <div className="flex-center gap-12">
              <button className="btn btn-primary" onClick={() => navigate("/dashboard")}>Zum Dashboard</button>
              <button className="btn btn-outline" onClick={() => navigate("/calculator")}>Neue Sendung</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
