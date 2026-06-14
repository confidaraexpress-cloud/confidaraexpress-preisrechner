import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API, apiFetch, jsonH } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money, fmtDelivery } from "../utils/formatters";
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
const ZIP_RE   = /^[A-Z0-9][A-Z0-9 \-]{1,9}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getErrors(form) {
  const e = {};

  // ── Absender ──
  if (!form.s_fullName?.trim())                          e.s_fullName  = "Name ist ein Pflichtfeld.";
  else if (form.s_fullName.length > 100)                 e.s_fullName  = "Name darf maximal 100 Zeichen enthalten.";

  if (form.s_company?.length > 200)                      e.s_company   = "Unternehmen darf maximal 200 Zeichen enthalten.";

  if (!form.s_street?.trim())                            e.s_street    = "Straße ist ein Pflichtfeld.";
  else if (form.s_street.length > 200)                   e.s_street    = "Straße darf maximal 200 Zeichen enthalten.";

  if (form.s_addition?.length > 100)                     e.s_addition  = "Adresszusatz darf maximal 100 Zeichen enthalten.";

  if (!form.s_zip?.trim())                               e.s_zip       = "PLZ ist ein Pflichtfeld.";
  else if (!ZIP_RE.test(form.s_zip.trim()))              e.s_zip       = "PLZ ist ungültig.";

  if (!form.s_city?.trim())                              e.s_city      = "Stadt ist ein Pflichtfeld.";
  else if (form.s_city.length > 100)                     e.s_city      = "Stadt darf maximal 100 Zeichen enthalten.";

  if (form.s_email) {
    if (form.s_email.length > 254)                       e.s_email     = "E-Mail darf maximal 254 Zeichen enthalten.";
    else if (!EMAIL_RE.test(form.s_email))               e.s_email     = "E-Mail-Adresse ist ungültig.";
  }

  // ── Empfänger ──
  if (!form.r_fullName?.trim())                          e.r_fullName  = "Name ist ein Pflichtfeld.";
  else if (form.r_fullName.length > 100)                 e.r_fullName  = "Name darf maximal 100 Zeichen enthalten.";

  if (form.r_company?.length > 200)                      e.r_company   = "Unternehmen darf maximal 200 Zeichen enthalten.";

  if (!form.r_street?.trim())                            e.r_street    = "Straße ist ein Pflichtfeld.";
  else if (form.r_street.length > 200)                   e.r_street    = "Straße darf maximal 200 Zeichen enthalten.";

  if (form.r_addition?.length > 100)                     e.r_addition  = "Adresszusatz darf maximal 100 Zeichen enthalten.";

  if (!form.r_zip?.trim())                               e.r_zip       = "PLZ ist ein Pflichtfeld.";
  else if (!ZIP_RE.test(form.r_zip.trim()))              e.r_zip       = "PLZ ist ungültig.";

  if (!form.r_city?.trim())                              e.r_city      = "Stadt ist ein Pflichtfeld.";
  else if (form.r_city.length > 100)                     e.r_city      = "Stadt darf maximal 100 Zeichen enthalten.";

  if (form.r_email) {
    if (form.r_email.length > 254)                       e.r_email     = "E-Mail darf maximal 254 Zeichen enthalten.";
    else if (!EMAIL_RE.test(form.r_email))               e.r_email     = "E-Mail-Adresse ist ungültig.";
  }

  // ── Paket ──
  if (!form.weight)                                      e.weight      = "Gewicht ist ein Pflichtfeld.";
  else { const w = Number(form.weight);
    if (isNaN(w) || w < 0.1 || w > 1000)                e.weight      = "Gewicht muss zwischen 0,1 und 1.000 kg liegen.";
  }
  if (form.length) { const v = Number(form.length);
    if (isNaN(v) || v < 0.1 || v > 300)                 e.length      = "Länge muss zwischen 0,1 und 300 cm liegen.";
  }
  if (form.width)  { const v = Number(form.width);
    if (isNaN(v) || v < 0.1 || v > 300)                 e.width       = "Breite muss zwischen 0,1 und 300 cm liegen.";
  }
  if (form.height) { const v = Number(form.height);
    if (isNaN(v) || v < 0.1 || v > 300)                 e.height      = "Höhe muss zwischen 0,1 und 300 cm liegen.";
  }

  return e;
}

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

// ─── Shipping mode options ────────────────────────────────────────────────────
const SHIPPING_MODE_OPTIONS = [
  { id: "all",      icon: "package", label: "Alle Versandarten", desc: "Standard, Express und Economy anzeigen" },
  { id: "standard", icon: "truck",   label: "Standard",          desc: "Regulärer Versand ohne Aufpreis"        },
  { id: "express",  icon: "zap",     label: "Express",           desc: "Schnellste verfügbare Zustellung"       },
  { id: "economy",  icon: "clock",   label: "Economy",           desc: "Günstigster Tarif, längere Laufzeit"    },
];

export default function NewShipmentPage() {
  const { authed, user } = useAuth();
  const navigate = useNavigate();

  // ── Service filter ──
  const [serviceFilter, setServiceFilter]         = useState("all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);

  // ── Shipping mode filter ──
  const [shippingModeFilter, setShippingModeFilter] = useState("all");
  const [shippingModeOpen, setShippingModeOpen]     = useState(false);

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
    // Absender
    s_company:  user?.company_name || "",
    s_fullName: user?.name         || "",
    s_street:   user?.street       || "",
    s_addition: "",
    s_zip:      user?.zip          || "",
    s_city:     user?.city         || "",
    s_country:  user?.country      || "DE",
    s_phone:    user?.phone        || "",
    s_email:    user?.email        || "",
    // Empfänger
    r_company:  "",
    r_fullName: "",
    r_street:   "",
    r_addition: "",
    r_zip:      "",
    r_city:     "",
    r_country:  "CH",
    r_phone:    "",
    r_email:    "",
    // Paket
    weight: "", length: "", width: "", height: "",
    // Filter
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
  const [errors, setErrors]       = useState({});

  const selectedOption       = SERVICE_OPTIONS.find(o => o.id === serviceFilter)       || SERVICE_OPTIONS[0];
  const selectedShippingMode = SHIPPING_MODE_OPTIONS.find(o => o.id === shippingModeFilter) || SHIPPING_MODE_OPTIONS[0];

  const carrierLabel =
    carrierFilters.length === 0   ? "Alle Dienstleister" :
    carrierFilters.length <= 2    ? carrierFilters.join(", ") :
    `${carrierFilters.length} ausgewählt`;

  const upd = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; });
  };

  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  const calcValid = Object.keys(getErrors(form)).length === 0;

  const buildParty = (p) => ({
    ...(form[`${p}_company`]  ? { company:         form[`${p}_company`]  } : {}),
    fullName:        form[`${p}_fullName`],
    streetAndNumber: form[`${p}_street`],
    ...(form[`${p}_addition`] ? { addressAddition: form[`${p}_addition`] } : {}),
    postalCode:      form[`${p}_zip`],
    city:            form[`${p}_city`],
    country:         form[`${p}_country`],
    ...(form[`${p}_phone`] ? { phone: form[`${p}_phone`] } : {}),
    ...(form[`${p}_email`] ? { email: form[`${p}_email`] } : {}),
  });

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

  const handleShippingMode = (id) => {
    setShippingModeFilter(id);
    setShippingModeOpen(false);
    resetResults();
  };

  const handleDateChange = (iso) => {
    if (!iso || iso < todayISO()) return;
    setShippingDate(iso);
    setDatePickerOpen(false);
    resetResults();
  };

  const calculate = async () => {
    const errs = getErrors(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setError("Bitte korrigieren Sie die markierten Felder.");
      return;
    }
    setErrors({});
    setError(""); setLoading(true); setSelected(null);
    try {
      const r = await fetch(`${API}/api/jumingo/calculate-price`, {
        method: "POST", headers: jsonH,
        body: JSON.stringify({
          weight: Number(form.weight), length: Number(form.length) || 30,
          width: Number(form.width) || 20, height: Number(form.height) || 15,
          sender:    buildParty("s"),
          recipient: buildParty("r"),
          serviceFilter:      serviceFilter,
          shippingModeFilter: shippingModeFilter,
          shippingDate:       shippingDate,
          carrierFilters:     carrierFilters,
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

  // ── Render helpers for address fields ──
  const addrField = (p, key, label, type = "text", placeholder = "", optional = false) => {
    const fk = `${p}_${key}`;
    const errMsg = errors[fk];
    return (
      <div className="field">
        <label className="field-label">
          {label}{optional && <span className="field-optional"> (optional)</span>}
        </label>
        <input
          className={`field-input${errMsg ? " field-input-error" : ""}`}
          type={type}
          value={form[fk]}
          onChange={e => upd(fk, e.target.value)}
          placeholder={placeholder}
        />
        {errMsg && <span className="field-error">{errMsg}</span>}
      </div>
    );
  };

  const countrySelect = (p) => (
    <div className="field">
      <label className="field-label">Land</label>
      <select
        className="field-input field-select"
        value={form[`${p}_country`]}
        onChange={e => upd(`${p}_country`, e.target.value)}
      >
        {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
    </div>
  );

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

            {/* ── Versandart — collapsible ── */}
            <div className="calc-panel mb-16">
              <button
                className="service-filter-trigger"
                onClick={() => setShippingModeOpen(o => !o)}
                aria-expanded={shippingModeOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n={selectedShippingMode.icon} s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Versandart</div>
                    <div className="service-filter-trigger-val">{selectedShippingMode.label} · {selectedShippingMode.desc}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${shippingModeOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {shippingModeOpen && (
                <div className="service-filter-dropdown">
                  {SHIPPING_MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option ${shippingModeFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleShippingMode(opt.id)}
                    >
                      <Icon n={opt.icon} s={15} c={shippingModeFilter === opt.id ? "#1d4ed8" : "#64748b"} />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                      {shippingModeFilter === opt.id && <span className="service-filter-option-check">✓</span>}
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
                    <div className="carrier-empty-hint">Noch keine Versanddienstleister verfügbar</div>
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

            {/* ── Versandroute — full address forms ── */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="globe" s={18} c="#1D4ED8" /><h3>Versandroute</h3></div>
              <div className="calc-panel-body">
                <div className="booking-addr-grid">

                  {/* Absenderadresse */}
                  <div>
                    <div className="calc-section-title">Absender</div>
                    {addrField("s", "company",  "Unternehmen",         "text",  "Firma GmbH",       true)}
                    {addrField("s", "fullName", "Vor- und Nachname *", "text",  "Max Mustermann")}
                    {addrField("s", "street",   "Straße & Hausnr. *",  "text",  "Musterstraße 1")}
                    {addrField("s", "addition", "Adresszusatz",        "text",  "Etage, c/o …",     true)}
                    <div className="field-row field-row-2">
                      <div className="field">
                        <label className="field-label">PLZ *</label>
                        <input className={`field-input${errors.s_zip  ? " field-input-error" : ""}`} value={form.s_zip}  onChange={e => upd("s_zip",  e.target.value)} placeholder="70173" />
                        {errors.s_zip  && <span className="field-error">{errors.s_zip}</span>}
                      </div>
                      <div className="field">
                        <label className="field-label">Stadt *</label>
                        <input className={`field-input${errors.s_city ? " field-input-error" : ""}`} value={form.s_city} onChange={e => upd("s_city", e.target.value)} placeholder="Stuttgart" />
                        {errors.s_city && <span className="field-error">{errors.s_city}</span>}
                      </div>
                    </div>
                    {countrySelect("s")}
                    {addrField("s", "phone", "Telefon",  "tel",   "+49 711 …",    true)}
                    {addrField("s", "email", "E-Mail",   "email", "max@firma.de", true)}
                  </div>

                  {/* Empfängeradresse */}
                  <div>
                    <div className="calc-section-title">Empfänger</div>
                    {addrField("r", "company",  "Unternehmen",         "text",  "Firma AG",          true)}
                    {addrField("r", "fullName", "Vor- und Nachname *", "text",  "Erika Muster")}
                    {addrField("r", "street",   "Straße & Hausnr. *",  "text",  "Beispielweg 5")}
                    {addrField("r", "addition", "Adresszusatz",        "text",  "Etage, c/o …",      true)}
                    <div className="field-row field-row-2">
                      <div className="field">
                        <label className="field-label">PLZ *</label>
                        <input className={`field-input${errors.r_zip  ? " field-input-error" : ""}`} value={form.r_zip}  onChange={e => upd("r_zip",  e.target.value)} placeholder="8001" />
                        {errors.r_zip  && <span className="field-error">{errors.r_zip}</span>}
                      </div>
                      <div className="field">
                        <label className="field-label">Stadt *</label>
                        <input className={`field-input${errors.r_city ? " field-input-error" : ""}`} value={form.r_city} onChange={e => upd("r_city", e.target.value)} placeholder="Zürich" />
                        {errors.r_city && <span className="field-error">{errors.r_city}</span>}
                      </div>
                    </div>
                    {countrySelect("r")}
                    {addrField("r", "phone", "Telefon",  "tel",   "+41 44 …",       true)}
                    {addrField("r", "email", "E-Mail",   "email", "erika@firma.ch", true)}
                  </div>

                </div>
              </div>
            </div>

            {/* ── Paketdaten ── */}
            <div className="calc-panel mb-16">
              <div className="calc-panel-header"><Icon n="package" s={18} c="#1D4ED8" /><h3>Paketdaten</h3></div>
              <div className="calc-panel-body">
                <div className="field-row field-row-4">
                  <div className="field">
                    <label className="field-label">Länge cm</label>
                    <input className={`field-input${errors.length ? " field-input-error" : ""}`} type="number" value={form.length} onChange={e => upd("length", e.target.value)} placeholder="30" />
                    {errors.length && <span className="field-error">{errors.length}</span>}
                  </div>
                  <div className="field">
                    <label className="field-label">Breite cm</label>
                    <input className={`field-input${errors.width  ? " field-input-error" : ""}`} type="number" value={form.width}  onChange={e => upd("width",  e.target.value)} placeholder="20" />
                    {errors.width  && <span className="field-error">{errors.width}</span>}
                  </div>
                  <div className="field">
                    <label className="field-label">Höhe cm</label>
                    <input className={`field-input${errors.height ? " field-input-error" : ""}`} type="number" value={form.height} onChange={e => upd("height", e.target.value)} placeholder="15" />
                    {errors.height && <span className="field-error">{errors.height}</span>}
                  </div>
                  <div className="field">
                    <label className="field-label">Gewicht kg *</label>
                    <input className={`field-input${errors.weight ? " field-input-error" : ""}`} type="number" value={form.weight} onChange={e => upd("weight", e.target.value)} placeholder="5" />
                    {errors.weight && <span className="field-error">{errors.weight}</span>}
                  </div>
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
                <button className="btn btn-primary btn-full" onClick={calculate} disabled={loading || !calcValid}>
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
                    <div>
                      {t.netPrice != null ? (
                        <>
                          <div className="tariff-price">{money(t.netPrice)}</div>
                          <div className="tariff-price-sub">exkl. MwSt.</div>
                        </>
                      ) : (
                        <div className="tariff-price-na">Preis fehlt</div>
                      )}
                    </div>
                  </div>
                  <div className="tariff-tags">
                    {fmtDelivery(t) && <span className="tariff-tag">⏱ {fmtDelivery(t)}</span>}
                    {t.shippingModeLabel && <span className="tariff-tag">{t.shippingModeLabel}</span>}
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
                  <button className="btn btn-primary btn-full" onClick={calculate} disabled={loading || !calcValid}>
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
