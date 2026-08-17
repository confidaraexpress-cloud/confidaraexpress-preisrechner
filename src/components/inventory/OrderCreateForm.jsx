import React, { useState, useCallback, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { InlineError, ProductPicker } from "./InventoryShared";
import { getProducts, getWarehouses } from "../../api/inventoryApi";
import { formatUnits } from "../../utils/inventoryView.mjs";

/* ── Auftrag erstellen ───────────────────────────────────────────────────────
   Empfänger + Positionen. Die Empfängerfelder entsprechen EXAKT dem
   bestehenden Adressvertrag des Versands (fullName/streetAndNumber/
   postalCode/city/country/company/addressAddition/phone/email) — der Auftrag
   speichert genau diese Form als Snapshot, sodass sie später unverändert in
   den Versandprozess übernommen werden kann.

   „Verfügbar: X" ist Orientierung, keine Zusage. Ob eine Menge reserviert
   werden darf, entscheidet allein das Backend — und zwar atomar beim Anlegen.
   Der Client blockiert die Eingabe deshalb bewusst NICHT vorab; er zeigt nur
   einen Hinweis. */

const LEER_EMPFAENGER = {
  company: "", fullName: "", streetAndNumber: "", addressAddition: "",
  postalCode: "", city: "", country: "DE", phone: "", email: "",
};

function Feld({ id, label, value, onChange, error, ...rest }) {
  return (
    <div className="inv-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}
             aria-invalid={error ? "true" : undefined} {...rest} />
      {error && <p className="inv-field-error">{error}</p>}
    </div>
  );
}

export function OrderCreateForm({ busy, error, onSubmit, onCancel }) {
  const [recipient, setRecipient] = useState({ ...LEER_EMPFAENGER });
  const [customerReference, setCustomerReference] = useState("");
  const [notes, setNotes] = useState("");
  const [positions, setPositions] = useState([]);  // [{ product, quantity }]
  const [errs, setErrs] = useState({});

  const [pickerItems, setPickerItems] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState("");

  const set = (k) => (val) => setRecipient((cur) => ({ ...cur, [k]: val }));

  useEffect(() => {
    getWarehouses({ limit: 50 }).then(async (r) => {
      if (!r.ok) return;
      const list = (await r.json()).warehouses || [];
      setWarehouses(list);
      const def = list.find(w => w.isDefault) || list[0];
      if (def) setWarehouseId(def.id);
    }).catch(() => {});
  }, []);

  const sucheArtikel = useCallback(async (term) => {
    setPickerLoading(true);
    try {
      const res = await getProducts({ limit: 20, q: term || undefined, status: "active" });
      if (res.ok) setPickerItems((await res.json()).products || []);
    } catch { /* Fehler zeigt das Formular beim Absenden */ }
    finally { setPickerLoading(false); }
  }, []);

  useEffect(() => { if (pickerOpen) sucheArtikel(""); }, [pickerOpen, sucheArtikel]);

  const positionHinzu = (product) => {
    setPositions((cur) => {
      // Derselbe Artikel wird zusammengefasst statt doppelt geführt — das
      // Backend erlaubt je Auftrag genau eine Position je Artikel.
      const idx = cur.findIndex(p => p.product.id === product.id);
      if (idx >= 0) {
        const kopie = [...cur];
        kopie[idx] = { ...kopie[idx], quantity: String(Number(kopie[idx].quantity || 0) + 1) };
        return kopie;
      }
      return [...cur, { product, quantity: "1" }];
    });
    setPickerOpen(false);
  };

  const mengeSetzen = (id, wert) => {
    setPositions((cur) => cur.map(p => (p.product.id === id ? { ...p, quantity: wert } : p)));
  };
  const positionWeg = (id) => setPositions((cur) => cur.filter(p => p.product.id !== id));

  const pruefe = () => {
    const e = {};
    if (!recipient.fullName.trim()) e.fullName = "Name ist erforderlich.";
    if (!recipient.streetAndNumber.trim()) e.streetAndNumber = "Straße und Hausnummer sind erforderlich.";
    if (!recipient.city.trim()) e.city = "Ort ist erforderlich.";
    if (!/^[A-Za-z]{2}$/.test(recipient.country.trim())) e.country = "Zweistelliger Ländercode, z. B. DE.";
    if (!recipient.postalCode.trim()) e.postalCode = "PLZ ist erforderlich.";
    if (recipient.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email.trim())) e.email = "Ungültige E-Mail-Adresse.";
    if (positions.length === 0) e.positions = "Mindestens eine Position ist erforderlich.";
    for (const p of positions) {
      const n = Number(p.quantity);
      if (!Number.isInteger(n) || n < 1) { e.positions = "Jede Position braucht eine ganze Menge größer null."; break; }
    }
    return e;
  };

  const absenden = (ev) => {
    ev.preventDefault();
    const gefunden = pruefe();
    setErrs(gefunden);
    if (Object.keys(gefunden).length > 0) return;
    onSubmit({
      recipient: {
        ...recipient,
        country: recipient.country.trim().toUpperCase(),
        company: recipient.company.trim() || null,
        addressAddition: recipient.addressAddition.trim() || null,
        phone: recipient.phone.trim() || null,
        email: recipient.email.trim() || null,
      },
      warehouseId: warehouseId || undefined,
      customerReference: customerReference.trim() || null,
      notes: notes.trim() || null,
      items: positions.map(p => ({ productId: p.product.id, quantity: Number(p.quantity) })),
    });
  };

  return (
    <form onSubmit={absenden} className="inv-form" noValidate>
      <InlineError text={error} />

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Empfänger</legend>
        <div className="inv-grid-2">
          <Feld id="o-company" label="Firma" value={recipient.company} onChange={set("company")} maxLength={35} />
          <Feld id="o-name" label="Name *" value={recipient.fullName} onChange={set("fullName")} error={errs.fullName} maxLength={35} />
        </div>
        <div className="inv-grid-2">
          <Feld id="o-street" label="Straße und Hausnummer *" value={recipient.streetAndNumber} onChange={set("streetAndNumber")} error={errs.streetAndNumber} maxLength={35} />
          <Feld id="o-add" label="Adresszusatz" value={recipient.addressAddition} onChange={set("addressAddition")} maxLength={100} />
        </div>
        <div className="inv-grid-3">
          <Feld id="o-zip" label="PLZ *" value={recipient.postalCode} onChange={set("postalCode")} error={errs.postalCode} maxLength={10} />
          <Feld id="o-city" label="Ort *" value={recipient.city} onChange={set("city")} error={errs.city} maxLength={30} />
          <Feld id="o-country" label="Land *" value={recipient.country} onChange={set("country")} error={errs.country} maxLength={2} />
        </div>
        <div className="inv-grid-2">
          <Feld id="o-phone" label="Telefon" value={recipient.phone} onChange={set("phone")} maxLength={40} />
          <Feld id="o-email" label="E-Mail" value={recipient.email} onChange={set("email")} error={errs.email} maxLength={254} type="email" />
        </div>
      </fieldset>

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Positionen</legend>
        {errs.positions && <p className="inv-field-error">{errs.positions}</p>}

        {positions.length > 0 && (
          <ul className="inv-positions">
            {positions.map(({ product, quantity }) => {
              const verfuegbar = Number(product.stock?.available ?? 0);
              const gewuenscht = Number(quantity);
              const knapp = Number.isFinite(gewuenscht) && gewuenscht > verfuegbar;
              return (
                <li key={product.id} className="inv-position">
                  <div className="inv-position-main">
                    <span className="inv-cell-sku">{product.sku}</span>
                    <span className="inv-position-name">{product.name}</span>
                    <span className="inv-cell-meta">Verfügbar: <span className="ce-num">{formatUnits(verfuegbar)}</span></span>
                  </div>
                  <div className="inv-position-qty">
                    <label className="sr-only" htmlFor={`pos-${product.id}`}>Menge für {product.name}</label>
                    <input id={`pos-${product.id}`} className="field-input" type="number" min="1" step="1"
                           value={quantity} onChange={(e) => mengeSetzen(product.id, e.target.value)} />
                    <button type="button" className="btn btn-icon btn-sm" aria-label={`Position ${product.name} entfernen`}
                            onClick={() => positionWeg(product.id)}>
                      <Icon n="trash" s={16} />
                    </button>
                  </div>
                  {knapp && (
                    // Hinweis, KEINE Sperre: die verbindliche Prüfung läuft
                    // serverseitig und atomar beim Anlegen.
                    <p className="inv-position-warn">
                      Aktuell sind nur {formatUnits(verfuegbar)} verfügbar. Der Auftrag kann so nicht reserviert werden.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pickerOpen
          ? <ProductPicker products={pickerItems} loading={pickerLoading} value={null} onChange={positionHinzu} onSearch={sucheArtikel} disabled={busy} />
          : (
            <button type="button" className="btn btn-outline" onClick={() => setPickerOpen(true)}>
              <Icon n="plus" s={16} />Position hinzufügen
            </button>
          )}
      </fieldset>

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Zusatzangaben</legend>
        <div className="inv-grid-2">
          {warehouses.length > 1 && (
            <div className="inv-field">
              <label className="field-label" htmlFor="o-wh">Lager</label>
              <select id="o-wh" className="field-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          <Feld id="o-ref" label="Ihre Referenz" value={customerReference} onChange={setCustomerReference} maxLength={80} />
        </div>
        <div className="inv-field">
          <label className="field-label" htmlFor="o-notes">Notiz</label>
          <textarea id="o-notes" className="field-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </div>
      </fieldset>

      <p className="inv-form-note">
        Mit dem Anlegen wird der Bestand reserviert. Ausgebucht wird erst mit der Buchung der Sendung.
      </p>

      <div className="inv-form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Wird angelegt …" : "Auftrag anlegen"}
        </button>
      </div>
    </form>
  );
}
