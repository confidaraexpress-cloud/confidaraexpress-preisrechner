import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API, jsonH } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";

const SERVICE_OPTIONS = [
  { id: "all",     icon: "dashboard", label: "Alle Dienstleistungen", desc: "Abholung und Shopabgabe anzeigen" },
  { id: "pickup",  icon: "truck",     label: "Nur Abholung",          desc: "Abholung Zuhause oder im Büro" },
  { id: "dropoff", icon: "map",       label: "Nur Abgabe",            desc: "Abgabe in einem Paketshop" },
  { id: "today",   icon: "zap",       label: "Abholung heute",        desc: "Tarife mit Abholung noch heute" },
];

export default function CalculatorPage() {
  const { authed } = useAuth();
  const navigate = useNavigate();
  const [serviceFilter, setServiceFilter] = useState("all");
  const [form, setForm] = useState({
    from_country: "DE", from_zip: "", to_country: "CH", to_zip: "",
    weight: "", length: "", width: "", height: "",
    max_price: "", max_days: "",
  });
  const [tariffs, setTariffs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [shipmentId, setShipmentId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasResults, setHasResults] = useState(false);

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  const applyFilter = useCallback((list) => {
    let f = [...list];
    if (form.max_price) f = f.filter(t => t.finalPrice <= Number(form.max_price));
    if (form.max_days) f = f.filter(t => { const m = t.deliveryTime?.match(/(\d+)/); return m ? Number(m[1]) <= Number(form.max_days) : true; });
    setFiltered(f);
  }, [form.max_price, form.max_days]);

  useEffect(() => { applyFilter(tariffs); }, [tariffs, applyFilter]);

  const handleServiceFilter = (id) => {
    setServiceFilter(id);
    // Clear results so user recalculates with the new filter
    setHasResults(false);
    setTariffs([]);
    setFiltered([]);
    setSelected(null);
  };

  const calculate = async () => {
    if (!form.weight) { setError("Bitte Gewicht angeben"); return; }
    setError(""); setLoading(true); setSelected(null);
    try {
      const r = await fetch(`${API}/api/jumingo/calculate-price`, {
        method: "POST", headers: jsonH,
        body: JSON.stringify({
          weight: Number(form.weight), length: Number(form.length) || 30,
          width: Number(form.width) || 20, height: Number(form.height) || 15,
          from_country: form.from_country, from_zip: form.from_zip,
          to_country: form.to_country, to_zip: form.to_zip,
          service_filter: serviceFilter,
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Fehler bei Preisberechnung");
      setTariffs(d.tariffs || []); setShipmentId(d.shipmentId); setHasResults(true);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="page-with-navbar">
      <div className="container calc-page-wrap">
        <div className="mb-24">
          <h1 className="heading calc-page-title">Versandpreis berechnen</h1>
          <p className="calc-page-sub">Vergleichen Sie Preise von 10+ Carriern in Echtzeit</p>
        </div>
        {error && <div className="alert alert-error mb-16"><Icon n="x" s={16} />{error}</div>}
        <div className="calc-wrap">
          <div>
            {/* Service Filter */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="zap" s={18} c="#1D4ED8" /><h3>Welchen Service bevorzugen Sie?</h3></div>
              <div className="calc-panel-body">
                <div className="service-filter-grid">
                  {SERVICE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-card ${serviceFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleServiceFilter(opt.id)}
                    >
                      <div className="service-filter-card-title">
                        <Icon n={opt.icon} s={13} c={serviceFilter === opt.id ? "#1d4ed8" : "#64748b"} />
                        {opt.label}
                      </div>
                      <div className="service-filter-card-desc">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Route */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="globe" s={18} c="#1D4ED8" /><h3>Versandroute</h3></div>
              <div className="calc-panel-body">
                <div className="calc-section-title">Absender</div>
                <div className="field-row field-row-2">
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.from_country} onChange={e => upd("from_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                  <div className="field"><label className="field-label">PLZ (optional)</label><input className="field-input" value={form.from_zip} onChange={e => upd("from_zip", e.target.value)} placeholder="z.B. 70173" /></div>
                </div>
                <div className="calc-section-title">Empfänger</div>
                <div className="field-row field-row-2">
                  <div className="field"><label className="field-label">Land</label><select className="field-input field-select" value={form.to_country} onChange={e => upd("to_country", e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
                  <div className="field"><label className="field-label">PLZ (optional)</label><input className="field-input" value={form.to_zip} onChange={e => upd("to_zip", e.target.value)} placeholder="z.B. 8001" /></div>
                </div>
              </div>
            </div>

            {/* Package */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="package" s={18} c="#1D4ED8" /><h3>Paketdaten</h3></div>
              <div className="calc-panel-body">
                <div className="field-row field-row-4">
                  <div className="field"><label className="field-label">Länge cm</label><input className="field-input" type="number" value={form.length} onChange={e => upd("length", e.target.value)} placeholder="30" /></div>
                  <div className="field"><label className="field-label">Breite cm</label><input className="field-input" type="number" value={form.width} onChange={e => upd("width", e.target.value)} placeholder="20" /></div>
                  <div className="field"><label className="field-label">Höhe cm</label><input className="field-input" type="number" value={form.height} onChange={e => upd("height", e.target.value)} placeholder="15" /></div>
                  <div className="field"><label className="field-label">Gewicht kg *</label><input className="field-input" type="number" value={form.weight} onChange={e => upd("weight", e.target.value)} placeholder="5" /></div>
                </div>
                {volWeight && (
                  <div className="vol-weight-box">
                    <span className="vol-weight-label">Volumengewicht: {volWeight} kg</span>
                    <span className="vol-weight-value">Abrechn.: {chargeWeight} kg</span>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile CTA */}
            {!hasResults && (
              <div className="calc-mobile-cta">
                <button className="btn btn-primary btn-full" onClick={calculate} disabled={loading}>
                  {loading ? <><span className="spinner" /> Berechne…</> : <><Icon n="zap" s={16} /> Preise berechnen</>}
                </button>
              </div>
            )}

            {/* Client-side filter (only after results) */}
            {hasResults && (
              <div className="calc-panel">
                <div className="calc-panel-header"><Icon n="filter" s={18} c="#1D4ED8" /><h3>Filtern</h3></div>
                <div className="calc-panel-body">
                  <div className="field-row field-row-2">
                    <div className="field"><label className="field-label">Max. Preis (€)</label><input className="field-input" type="number" value={form.max_price} onChange={e => upd("max_price", e.target.value)} placeholder="Alle" /></div>
                    <div className="field"><label className="field-label">Max. Lieferzeit (Tage)</label><input className="field-input" type="number" value={form.max_days} onChange={e => upd("max_days", e.target.value)} placeholder="Alle" /></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results panel */}
          <div className="results-panel">
            <div className="results-header">
              <h3>{hasResults ? `${filtered.length} Angebote gefunden` : "Versandangebote"}</h3>
              <p>{hasResults ? "Wählen Sie Ihr Angebot" : "Füllen Sie das Formular aus"}</p>
            </div>
            <div className="results-body">

              {/* Initial state */}
              {!hasResults && !loading && (
                <div className="results-empty">
                  <div className="results-empty-icon">📦</div>
                  <p className="text-sm text-muted">Preise berechnen um Angebote zu sehen</p>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="loading-center">
                  <span className="spinner spinner-dark" />
                  <span className="text-sm text-muted">Preise werden geladen…</span>
                </div>
              )}

              {/* API returned 0 tariffs */}
              {!loading && hasResults && tariffs.length === 0 && (
                <div className="results-empty">
                  <div className="results-empty-icon">🔍</div>
                  <p className="results-empty-title">Keine Tarife gefunden</p>
                  <p className="text-sm text-muted">Für diese Route wurden keine Tarife für den gewählten Servicetyp gefunden. Wählen Sie „Alle Dienstleistungen" und berechnen Sie erneut.</p>
                </div>
              )}

              {/* Client filter reduced to 0 */}
              {!loading && hasResults && tariffs.length > 0 && filtered.length === 0 && (
                <div className="results-empty">
                  <div className="results-empty-icon">🎯</div>
                  <p className="results-empty-title">Filter anpassen</p>
                  <p className="text-sm text-muted">Alle Tarife wurden durch Ihre Preisfilter ausgeblendet. Erhöhen Sie das Preislimit oder entfernen Sie den Filter.</p>
                </div>
              )}

              {/* Tariff cards */}
              {!loading && filtered.map(t => (
                <div key={t.id} className={`tariff-card ${selected?.id === t.id ? "selected" : ""}`} onClick={() => setSelected(t)}>
                  <div className="tariff-card-top">
                    <div><div className="tariff-carrier">{t.carrier}</div><div className="tariff-service">{t.tariffName}</div></div>
                    <div><div className="tariff-price">{money(t.finalPrice)}</div><div className="tariff-price-sub">inkl. Marge</div></div>
                  </div>
                  <div className="tariff-tags">
                    {t.deliveryTime && <span className="tariff-tag">⏱ {t.deliveryTime}</span>}
                    {t.trackingAvailable && <span className="tariff-tag green">✓ Tracking</span>}
                    {t.serviceType === "pickup"  && <span className="tariff-tag blue">🚐 Abholung</span>}
                    {t.serviceType === "dropoff" && <span className="tariff-tag">🏪 Shopabgabe</span>}
                  </div>
                  {(t.shopName || t.pickupDate || t.pickupToday || t.printerRequired) && (
                    <div className="tariff-service-row">
                      {t.serviceType === "dropoff" && t.shopName && (
                        <span className="tariff-service-detail"><Icon n="map" s={11} /> {t.shopName}</span>
                      )}
                      {t.serviceType === "pickup" && t.pickupToday && (
                        <span className="tariff-service-detail pickup-today"><Icon n="zap" s={11} /> Abholung heute möglich</span>
                      )}
                      {t.serviceType === "pickup" && t.pickupDate && !t.pickupToday && (
                        <span className="tariff-service-detail"><Icon n="truck" s={11} /> Abholung: {t.pickupDate}</span>
                      )}
                      {t.printerRequired && (
                        <span className="tariff-printer-note"><Icon n="x" s={11} /> Drucker erforderlich</span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* CTA */}
              {hasResults && !loading && (
                <div className="results-cta">
                  {selected ? (
                    <button className="btn btn-primary btn-full" onClick={() => authed
                      ? navigate("/booking", { state: { tariff: selected, shipmentId, form } })
                      : navigate("/login")}>
                      {authed ? "Jetzt buchen →" : "Anmelden & buchen →"}
                    </button>
                  ) : <button className="btn btn-outline btn-full" disabled>Angebot auswählen</button>}
                  <button className="btn btn-ghost btn-full mt-8" onClick={calculate}><Icon n="refresh" s={14} /> Neu berechnen</button>
                </div>
              )}

              {!loading && !hasResults && (
                <div className="calc-desktop-cta">
                  <button className="btn btn-primary btn-full" onClick={calculate} disabled={loading}>
                    {loading ? <span className="spinner" /> : <><Icon n="zap" s={16} /> Preise berechnen</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
