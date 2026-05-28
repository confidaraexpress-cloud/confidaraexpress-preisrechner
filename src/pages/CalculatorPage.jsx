import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API, jsonH } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";

// ─── Date helpers ────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().split("T")[0];
const addDaysISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};
const fmtDE = (iso) => {
  if (!iso) return "";
  const date = iso.split("T")[0];
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
};
const labelForDate = (iso) => {
  if (iso === todayISO())    return `Heute, ${fmtDE(iso)}`;
  if (iso === addDaysISO(1)) return `Morgen, ${fmtDE(iso)}`;
  return fmtDE(iso);
};

// ─── Delivery-day parser (robust: string → days integer, fallback to date diff) ─
const parseDeliveryDays = (t) => {
  if (t.deliveryTime) {
    const m = t.deliveryTime.match(/(\d+)/);
    if (m) return Number(m[1]);
  }
  if (t.deliveryDate) {
    const today = new Date(new Date().toISOString().split("T")[0]);
    const dd    = new Date(t.deliveryDate.split("T")[0]);
    const diff  = Math.round((dd - today) / 86400000);
    return diff >= 0 ? diff : 999;
  }
  return 999;
};

// ─── Sort options ─────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { id: "recommended", label: "Empfehlung" },
  { id: "cheapest",    label: "Günstigste" },
  { id: "fastest",     label: "Schnellste" },
  { id: "priciest",    label: "Teuerste"   },
];

// ─── Service options ─────────────────────────────────────────────────────────
const SERVICE_OPTIONS = [
  { id: "all",          icon: "dashboard", label: "Alle Dienstleistungen", desc: "Abholung und Shopabgabe anzeigen" },
  { id: "pickup",       icon: "truck",     label: "Nur Abholung",          desc: "Abholung Zuhause oder im Büro"  },
  { id: "dropoff",      icon: "map",       label: "Nur Abgabe",            desc: "Abgabe in einem Paketshop"      },
  { id: "pickup_today", icon: "zap",       label: "Abholung heute",        desc: "Tarife mit Abholung noch heute" },
];

export default function CalculatorPage() {
  const { authed } = useAuth();
  const navigate = useNavigate();

  // ── Service filter ──
  const [serviceFilter, setServiceFilter]     = useState("all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);

  // ── Shipping date ──
  const [shippingDate, setShippingDate] = useState(() => todayISO());
  const [datePickerOpen, setDatePickerOpen]   = useState(false);

  // ── Sort ──
  const [sortMode, setSortMode] = useState("recommended");

  // ── Carrier filter ──
  const [carrierFilters, setCarrierFilters]           = useState([]);
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [availableCarriers, setAvailableCarriers]     = useState([]);
  const carrierRef = useRef(null);

  // ── Form ──
  const [form, setForm] = useState({
    from_country: "DE", from_zip: "", to_country: "CH", to_zip: "",
    weight: "", length: "", width: "", height: "",
    max_price: "", max_days: "",
  });

  // ── Results ──
  const [tariffs, setTariffs]     = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [shipmentId, setShipmentId] = useState(null);
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [hasResults, setHasResults] = useState(false);

  const selectedOption = SERVICE_OPTIONS.find(o => o.id === serviceFilter) || SERVICE_OPTIONS[0];

  const carrierLabel =
    carrierFilters.length === 0   ? "Alle Dienstleister" :
    carrierFilters.length <= 2    ? carrierFilters.join(", ") :
    `${carrierFilters.length} ausgewählt`;

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  const resetResults = () => {
    setHasResults(false);
    setTariffs([]);
    setFiltered([]);
    setSelected(null);
    setError("");
  };

  const toggleCarrier = (carrier) => {
    setCarrierFilters(prev =>
      prev.includes(carrier) ? prev.filter(c => c !== carrier) : [...prev, carrier]
    );
    resetResults();
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

  const applyFilter = useCallback((list) => {
    let f = [...list];
    if (form.max_price) f = f.filter(t => t.finalPrice <= Number(form.max_price));
    if (form.max_days) f = f.filter(t => { const m = t.deliveryTime?.match(/(\d+)/); return m ? Number(m[1]) <= Number(form.max_days) : true; });
    setFiltered(f);
  }, [form.max_price, form.max_days]);

  useEffect(() => { applyFilter(tariffs); }, [tariffs, applyFilter]);

  const sorted = React.useMemo(() => {
    if (sortMode === "recommended") return filtered;
    const copy = [...filtered];
    if (sortMode === "cheapest") return copy.sort((a, b) => a.finalPrice - b.finalPrice);
    if (sortMode === "priciest") return copy.sort((a, b) => b.finalPrice - a.finalPrice);
    if (sortMode === "fastest")  return copy.sort((a, b) => parseDeliveryDays(a) - parseDeliveryDays(b));
    return copy;
  }, [filtered, sortMode]);

  const handleServiceFilter = (id) => {
    setServiceFilter(id);
    setServiceFilterOpen(false);
    resetResults();
  };

  const handleDateChange = (iso) => {
    if (!iso || iso < todayISO()) return;
    setShippingDate(iso);
    setDatePickerOpen(false);
    resetResults();
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
          serviceFilter: serviceFilter,
          shippingDate: shippingDate,
          carrierFilters: carrierFilters,
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Fehler bei Preisberechnung");
      const newCarriers = d.availableCarriers || [];
      setAvailableCarriers(newCarriers);
      if (newCarriers.length > 0)
        setCarrierFilters(prev => prev.filter(c => newCarriers.includes(c)));
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

            {/* ── Service Filter — collapsible ── */}
            <div className="calc-panel mb-16">
              <button
                className="service-filter-trigger"
                onClick={() => setServiceFilterOpen(o => !o)}
                aria-expanded={serviceFilterOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n={selectedOption.icon} s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Welchen Service bevorzugen Sie?</div>
                    <div className="service-filter-trigger-val">{selectedOption.label} · {selectedOption.desc}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${serviceFilterOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {serviceFilterOpen && (
                <div className="service-filter-dropdown">
                  {SERVICE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option ${serviceFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleServiceFilter(opt.id)}
                    >
                      <Icon n={opt.icon} s={15} c={serviceFilter === opt.id ? "#1d4ed8" : "#64748b"} />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                      {serviceFilter === opt.id && <span className="service-filter-option-check">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Versanddatum — collapsible ── */}
            <div className="calc-panel mb-16">
              <button
                className="service-filter-trigger"
                onClick={() => setDatePickerOpen(o => !o)}
                aria-expanded={datePickerOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="clock" s={15} c="#1D4ED8" />
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
                  <input
                    type="date"
                    className="field-input"
                    value={shippingDate}
                    min={todayISO()}
                    onChange={e => handleDateChange(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* ── Carrier Filter — collapsible ── */}
            <div className="calc-panel mb-16" ref={carrierRef}>
              <button
                className="service-filter-trigger"
                onClick={() => setCarrierDropdownOpen(o => !o)}
                aria-expanded={carrierDropdownOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="truck" s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Versanddienst</div>
                    <div className="service-filter-trigger-val">{carrierLabel}</div>
                  </div>
                  {carrierFilters.length > 0 && (
                    <span className="carrier-badge">{carrierFilters.length}</span>
                  )}
                </div>
                <div className={`service-filter-chevron ${carrierDropdownOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {carrierDropdownOpen && (
                <div className="carrier-dropdown">
                  {availableCarriers.length === 0 ? (
                    <div className="carrier-empty-hint">Zuerst Preise berechnen, um Carrier-Filter zu aktivieren</div>
                  ) : (
                    <>
                      <label className={`carrier-option carrier-option-all ${carrierFilters.length === 0 ? "selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={carrierFilters.length === 0}
                          onChange={() => { setCarrierFilters([]); resetResults(); }}
                        />
                        <span className="carrier-option-label">Alle Dienstleister</span>
                      </label>
                      <div className="carrier-divider" />
                      {availableCarriers.map(carrier => (
                        <label
                          key={carrier}
                          className={`carrier-option ${carrierFilters.includes(carrier) ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={carrierFilters.includes(carrier)}
                            onChange={() => toggleCarrier(carrier)}
                          />
                          <span className="carrier-option-label">{carrier}</span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Route ── */}
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

            {/* ── Paketdaten ── */}
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

            {/* ── Mobile CTA ── */}
            {!hasResults && (
              <div className="calc-mobile-cta">
                <button className="btn btn-primary btn-full" onClick={calculate} disabled={loading}>
                  {loading ? <><span className="spinner" /> Berechne…</> : <><Icon n="zap" s={16} /> Preise berechnen</>}
                </button>
              </div>
            )}

            {/* ── Preisfilter (nach Ergebnissen) ── */}
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

          {/* ── Ergebnisse ── */}
          <div className="results-panel">
            <div className="results-header">
              <h3>{hasResults ? `${filtered.length} Angebote gefunden` : "Versandangebote"}</h3>
              <p>{hasResults ? "Wählen Sie Ihr Angebot" : "Füllen Sie das Formular aus"}</p>
            </div>
            <div className="results-body">

              {!hasResults && !loading && (
                <div className="results-empty">
                  <div className="results-empty-icon">📦</div>
                  <p className="text-sm text-muted">Preise berechnen um Angebote zu sehen</p>
                </div>
              )}

              {loading && (
                <div className="loading-center">
                  <span className="spinner spinner-dark" />
                  <span className="text-sm text-muted">Preise werden geladen…</span>
                </div>
              )}

              {!loading && hasResults && tariffs.length === 0 && (
                <div className="results-empty">
                  <div className="results-empty-icon">🔍</div>
                  <p className="results-empty-title">Keine Tarife gefunden</p>
                  <p className="text-sm text-muted">Für diese Route und das gewählte Datum wurden keine Tarife gefunden. Ändern Sie das Datum oder wählen Sie „Alle Dienstleistungen".</p>
                </div>
              )}

              {!loading && hasResults && tariffs.length > 0 && filtered.length === 0 && (
                <div className="results-empty">
                  <div className="results-empty-icon">🎯</div>
                  <p className="results-empty-title">Filter anpassen</p>
                  <p className="text-sm text-muted">Alle Tarife wurden durch Ihre Preisfilter ausgeblendet. Erhöhen Sie das Preislimit oder entfernen Sie den Filter.</p>
                </div>
              )}

              {hasResults && !loading && tariffs.length > 0 && (
                <div className="sort-bar">
                  <span className="sort-bar-label">Sortierung</span>
                  {SORT_OPTIONS.map(o => (
                    <button
                      key={o.id}
                      className={`sort-btn ${sortMode === o.id ? "active" : ""}`}
                      onClick={() => setSortMode(o.id)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}

              {!loading && sorted.map(t => (
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

                  {/* Service details (shop name, pickup info, printer) */}
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

                  {/* Date info (delivery date/time, pickup window, availability) */}
                  {(t.availableForDate === false || t.deliveryDate || t.pickupTimeFrom) && (
                    <div className="tariff-date-row">
                      {t.availableForDate === false && (
                        <span className="tariff-unavail-note">⚠ Nicht verfügbar für dieses Datum</span>
                      )}
                      {t.deliveryDate && t.availableForDate !== false && (
                        <span className="tariff-date-info">
                          📅 Lieferung: {fmtDE(t.deliveryDate)}
                          {t.deliveryTimeUntil ? ` bis ${t.deliveryTimeUntil} Uhr` : ""}
                        </span>
                      )}
                      {t.pickupTimeFrom && t.pickupTimeUntil && t.availableForDate !== false && (
                        <span className="tariff-date-info">
                          🕐 Abholung: {t.pickupTimeFrom}–{t.pickupTimeUntil} Uhr
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

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
