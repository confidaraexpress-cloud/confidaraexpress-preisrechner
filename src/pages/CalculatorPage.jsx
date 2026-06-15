import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API, apiFetch, jsonH } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { resolveCarrierName } from "../utils/carrierMap";
import { OffersList } from "../components/offers/OffersList";
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

// ─── Validation ──────────────────────────────────────────────────────────────
const ZIP_RE = /^[A-Z0-9][A-Z0-9 \-]{1,9}$/i;

// ─── Service options ─────────────────────────────────────────────────────────
const SERVICE_OPTIONS = [
  { id: "all",          icon: "dashboard", label: "Alle Dienstleistungen", desc: "Abholung und Shopabgabe anzeigen" },
  { id: "pickup",       icon: "truck",     label: "Nur Abholung",          desc: "Abholung Zuhause oder im Büro"  },
  { id: "dropoff",      icon: "map",       label: "Nur Abgabe",            desc: "Abgabe in einem Paketshop"      },
  { id: "pickup_today", icon: "zap",       label: "Abholung heute",        desc: "Tarife mit Abholung noch heute" },
];

export default function CalculatorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Service filter ──
  const [serviceFilter, setServiceFilter]         = useState("all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);

  // ── Shipping date ──
  const [shippingDate, setShippingDate]     = useState(() => todayISO());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // ── Sort ──
  const [sortMode, setSortMode] = useState("recommended");

  // ── VAT display mode ──
  const [vatMode, setVatMode] = useState("net");

  // ── Carrier filter ──
  const [carrierFilters, setCarrierFilters]           = useState([]);
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [availableCarriers, setAvailableCarriers]     = useState([]);
  const carrierRef = useRef(null);

  // ── Form — route (country + zip) + package data only ──
  const [form, setForm] = useState({
    from_country: user?.country || "DE",
    from_zip:     user?.zip     || "",
    to_country:   "CH",
    to_zip:       "",
    weight: "", length: "", width: "", height: "",
    max_price: "", max_days: "",
  });

  // ── Results ──
  const [tariffs, setTariffs]       = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [selected, setSelected]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [hasResults, setHasResults] = useState(false);

  const selectedOption = SERVICE_OPTIONS.find(o => o.id === serviceFilter) || SERVICE_OPTIONS[0];

  const carrierLabel =
    carrierFilters.length === 0 ? "Alle Dienstleister" :
    carrierFilters.length <= 2  ? carrierFilters.map(resolveCarrierName).join(", ") :
    `${carrierFilters.length} ausgewählt`;

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const getValidationError = () => {
    const w = Number(form.weight);
    if (!form.weight)                          return "Gewicht ist ein Pflichtfeld.";
    if (isNaN(w) || w < 0.1 || w > 1000)      return "Gewicht muss zwischen 0,1 und 1.000 kg liegen.";
    if (form.length) {
      const v = Number(form.length);
      if (isNaN(v) || v < 0.1 || v > 300)     return "Länge muss zwischen 0,1 und 300 cm liegen.";
    }
    if (form.width) {
      const v = Number(form.width);
      if (isNaN(v) || v < 0.1 || v > 300)     return "Breite muss zwischen 0,1 und 300 cm liegen.";
    }
    if (form.height) {
      const v = Number(form.height);
      if (isNaN(v) || v < 0.1 || v > 300)     return "Höhe muss zwischen 0,1 und 300 cm liegen.";
    }
    if (!form.from_zip)                        return "Herkunfts-PLZ ist ein Pflichtfeld.";
    if (!ZIP_RE.test(form.from_zip.trim()))    return "Herkunfts-PLZ hat ein ungültiges Format (z. B. 70173 oder 8001).";
    if (!form.to_zip)                          return "Ziel-PLZ ist ein Pflichtfeld.";
    if (!ZIP_RE.test(form.to_zip.trim()))      return "Ziel-PLZ hat ein ungültiges Format (z. B. 70173 oder 8001).";
    return null;
  };

  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  const calcValid = !!form.from_zip && !!form.to_zip && !!form.weight;

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

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/jumingo/carriers`, { auth: true })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (d.carriers?.length) setAvailableCarriers(d.carriers); })
      .catch(() => {});
  }, []);

  const applyFilter = useCallback((list) => {
    let f = [...list];
    if (form.max_price) f = f.filter(t => t.netPrice != null && t.netPrice <= Number(form.max_price));
    if (form.max_days)  f = f.filter(t => t.transitDaysMax != null && t.transitDaysMax <= Number(form.max_days));
    setFiltered(f);
  }, [form.max_price, form.max_days]);

  useEffect(() => { applyFilter(tariffs); }, [tariffs, applyFilter]);

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

  const handleDateChange = (iso) => {
    if (!iso || iso < todayISO()) return;
    setShippingDate(iso);
    setDatePickerOpen(false);
    resetResults();
  };

  const calculate = async () => {
    const validErr = getValidationError();
    if (validErr) { setError(validErr); return; }
    setError(""); setLoading(true); setSelected(null);
    try {
      const r = await fetch(`${API}/api/jumingo/calculate-price`, {
        method: "POST", headers: jsonH,
        body: JSON.stringify({
          from_country:   form.from_country,
          from_zip:       form.from_zip,
          to_country:     form.to_country,
          to_zip:         form.to_zip,
          weight:         Number(form.weight),
          length:         Number(form.length) || 30,
          width:          Number(form.width)  || 20,
          height:         Number(form.height) || 15,
          serviceFilter:  serviceFilter,
          shippingDate:   shippingDate,
          carrierFilters: carrierFilters,
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Fehler bei Preisberechnung");
      const newCarriers = d.availableCarriers || [];
      setAvailableCarriers(newCarriers);
      if (newCarriers.length > 0)
        setCarrierFilters(prev => prev.filter(c => newCarriers.includes(c)));
      setTariffs(d.tariffs || []); setHasResults(true);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // Preisrechner has no full address form → redirect to "Neue Sendung" to complete booking
  const handleBook = () => {
    navigate("/dashboard?page=new");
  };

  return (
    <div className="page-with-navbar">
      <div className="container calc-page-wrap">
        <div className="mb-24">
          <h1 className="heading calc-page-title">Versandpreis berechnen</h1>
          <p className="calc-page-sub">Vergleichen Sie Preise von 10+ Carriern in Echtzeit</p>
        </div>
        {error && <div className="alert alert-error mb-16"><Icon n="x" s={16} />{error}</div>}

        <div className="offers-form-section">

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
                        <span className="carrier-option-label">{resolveCarrierName(carrier)}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Versandroute — Land + PLZ ── */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="globe" s={18} c="#1D4ED8" /><h3>Versandroute</h3></div>
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
                    <label className="field-label">PLZ *</label>
                    <input
                      className="field-input"
                      value={form.from_zip}
                      onChange={e => { upd("from_zip", e.target.value); resetResults(); }}
                      placeholder="70173"
                    />
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
                    <label className="field-label">PLZ *</label>
                    <input
                      className="field-input"
                      value={form.to_zip}
                      onChange={e => { upd("to_zip", e.target.value); resetResults(); }}
                      placeholder="8001"
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ── Paketdaten ── */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="package" s={18} c="#1D4ED8" /><h3>Paketdaten</h3></div>
            <div className="calc-panel-body">
              <div className="field-row field-row-4">
                <div className="field"><label className="field-label">Länge cm</label><input className="field-input" type="number" value={form.length} onChange={e => upd("length", e.target.value)} placeholder="30" /></div>
                <div className="field"><label className="field-label">Breite cm</label><input className="field-input" type="number" value={form.width}  onChange={e => upd("width",  e.target.value)} placeholder="20" /></div>
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

          {/* ── Calculate CTA ── */}
          <div className="offers-calc-cta">
            <button className="btn btn-primary btn-full" onClick={calculate} disabled={loading || !calcValid}>
              {loading ? <><span className="spinner" /> Berechne…</> : <><Icon n="zap" s={16} /> Preise berechnen</>}
            </button>
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
            maxDays={form.max_days}
            onMaxPriceChange={v => upd("max_price", v)}
            onMaxDaysChange={v => upd("max_days", v)}
            vatMode={vatMode}
            onVatToggle={setVatMode}
          />
        )}
      </div>
    </div>
  );
}
