import React, { useState } from "react";
import { InlineError } from "./InventoryShared";

/* ── Artikelformular ─────────────────────────────────────────────────────────
   Anlegen und Bearbeiten teilen sich dieses eine Formular — es gibt keine
   zweite Feldliste, die auseinanderlaufen könnte.

   Einheiten folgen exakt dem bestehenden Versandvertrag: Gewicht in kg
   (0,1–1.000), Maße in cm (0,1–300), Geldwerte in EUR. Kein zweites
   Einheitenmodell.

   Die Prüfung hier ist Bedienkomfort, nicht Sicherheit: dieselben Regeln laufen
   serverseitig erneut und sind dort verbindlich. */

const LEER = {
  sku: "", name: "", description: "", ean: "",
  weightKg: "", lengthCm: "", widthCm: "", heightCm: "",
  unitValue: "", hsCode: "", countryOfOrigin: "", customsDescription: "",
  minStock: "", status: "active",
};

function ausInitial(p) {
  if (!p) return { ...LEER };
  return {
    sku: p.sku ?? "", name: p.name ?? "", description: p.description ?? "", ean: p.ean ?? "",
    weightKg: p.weightKg != null ? String(p.weightKg) : "",
    lengthCm: p.lengthCm != null ? String(p.lengthCm) : "",
    widthCm: p.widthCm != null ? String(p.widthCm) : "",
    heightCm: p.heightCm != null ? String(p.heightCm) : "",
    unitValue: p.unitValue != null ? String(p.unitValue) : "",
    hsCode: p.hsCode ?? "", countryOfOrigin: p.countryOfOrigin ?? "",
    customsDescription: p.customsDescription ?? "",
    minStock: p.minStock != null ? String(p.minStock) : "",
    status: p.status ?? "active",
  };
}

// Leere optionale Felder werden als null gesendet (= „bewusst geleert"), nicht
// weggelassen — sonst ließe sich ein einmal gesetzter Wert nie wieder entfernen.
function zuPayload(v) {
  const opt = (s) => (s.trim() === "" ? null : s.trim());
  const num = (s) => (s.trim() === "" ? null : Number(s.trim().replace(",", ".")));
  return {
    sku: v.sku.trim(),
    name: v.name.trim(),
    description: opt(v.description),
    ean: opt(v.ean),
    weightKg: num(v.weightKg),
    lengthCm: num(v.lengthCm),
    widthCm: num(v.widthCm),
    heightCm: num(v.heightCm),
    unitValue: num(v.unitValue),
    hsCode: opt(v.hsCode),
    countryOfOrigin: opt(v.countryOfOrigin),
    customsDescription: opt(v.customsDescription),
    minStock: v.minStock.trim() === "" ? null : Number(v.minStock.trim()),
    status: v.status,
  };
}

function pruefe(v) {
  const e = {};
  if (!v.sku.trim()) e.sku = "SKU ist erforderlich.";
  else if (v.sku.trim().length > 64) e.sku = "Höchstens 64 Zeichen.";
  if (!v.name.trim()) e.name = "Bezeichnung ist erforderlich.";
  else if (v.name.trim().length > 255) e.name = "Höchstens 255 Zeichen.";
  const w = Number(v.weightKg.replace(",", "."));
  if (v.weightKg.trim() === "" || !Number.isFinite(w) || w < 0.1 || w > 1000)
    e.weightKg = "Gewicht zwischen 0,1 und 1.000 kg.";
  for (const [k, label] of [["lengthCm", "Länge"], ["widthCm", "Breite"], ["heightCm", "Höhe"]]) {
    if (v[k].trim() === "") continue;
    const n = Number(v[k].replace(",", "."));
    if (!Number.isFinite(n) || n < 0.1 || n > 300) e[k] = `${label} zwischen 0,1 und 300 cm.`;
  }
  if (v.unitValue.trim() !== "") {
    const n = Number(v.unitValue.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) e.unitValue = "Warenwert darf nicht negativ sein.";
  }
  if (v.hsCode.trim() !== "" && !/^[0-9]{4,12}$/.test(v.hsCode.trim()))
    e.hsCode = "HS-Code besteht aus 4 bis 12 Ziffern.";
  if (v.countryOfOrigin.trim() !== "" && !/^[A-Za-z]{2}$/.test(v.countryOfOrigin.trim()))
    e.countryOfOrigin = "Zweistelliger Ländercode, z. B. DE.";
  if (v.minStock.trim() !== "") {
    const n = Number(v.minStock.trim());
    if (!Number.isInteger(n) || n < 0) e.minStock = "Ganze Zahl ab 0.";
  }
  return e;
}

function Feld({ id, label, value, onChange, error, hint, ...rest }) {
  return (
    <div className="inv-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}
             aria-invalid={error ? "true" : undefined} {...rest} />
      {error && <p className="inv-field-error">{error}</p>}
      {!error && hint && <p className="inv-field-hint">{hint}</p>}
    </div>
  );
}

export function ProductForm({ initial, busy, error, onSubmit, onCancel }) {
  const [v, setV] = useState(() => ausInitial(initial));
  const [errs, setErrs] = useState({});
  const set = (k) => (val) => setV((cur) => ({ ...cur, [k]: val }));

  const absenden = (e) => {
    e.preventDefault();
    const gefunden = pruefe(v);
    setErrs(gefunden);
    if (Object.keys(gefunden).length > 0) return;
    onSubmit(zuPayload(v));
  };

  return (
    <form onSubmit={absenden} className="inv-form" noValidate>
      <InlineError text={error} />

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Stammdaten</legend>
        <div className="inv-grid-2">
          <Feld id="p-sku" label="SKU *" value={v.sku} onChange={set("sku")} error={errs.sku}
                hint="Innerhalb Ihres Kontos eindeutig." maxLength={64} />
          <Feld id="p-ean" label="EAN / GTIN" value={v.ean} onChange={set("ean")} maxLength={20} />
        </div>
        <Feld id="p-name" label="Bezeichnung *" value={v.name} onChange={set("name")} error={errs.name} maxLength={255} />
        <div className="inv-field">
          <label className="field-label" htmlFor="p-desc">Beschreibung</label>
          <textarea id="p-desc" className="field-textarea" rows={2} value={v.description}
                    onChange={(e) => set("description")(e.target.value)} maxLength={5000} />
        </div>
      </fieldset>

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Versanddaten</legend>
        <div className="inv-grid-4">
          <Feld id="p-weight" label="Gewicht kg *" value={v.weightKg} onChange={set("weightKg")} error={errs.weightKg} inputMode="decimal" />
          <Feld id="p-length" label="Länge cm" value={v.lengthCm} onChange={set("lengthCm")} error={errs.lengthCm} inputMode="decimal" />
          <Feld id="p-width"  label="Breite cm" value={v.widthCm}  onChange={set("widthCm")}  error={errs.widthCm}  inputMode="decimal" />
          <Feld id="p-height" label="Höhe cm"   value={v.heightCm} onChange={set("heightCm")} error={errs.heightCm} inputMode="decimal" />
        </div>
        <p className="inv-form-note">
          Artikelmaße sind Stammdaten, keine Paketmaße. Sie werden beim Versand nicht automatisch
          zu einem Paket verrechnet — die Paketdaten bestätigen Sie weiterhin selbst.
        </p>
      </fieldset>

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Zoll- und Wertangaben</legend>
        <div className="inv-grid-3">
          <Feld id="p-value" label="Warenwert je Stück (EUR)" value={v.unitValue} onChange={set("unitValue")} error={errs.unitValue} inputMode="decimal" />
          <Feld id="p-hs" label="HS-Code" value={v.hsCode} onChange={set("hsCode")} error={errs.hsCode} inputMode="numeric" maxLength={12} />
          <Feld id="p-origin" label="Ursprungsland" value={v.countryOfOrigin} onChange={set("countryOfOrigin")} error={errs.countryOfOrigin} maxLength={2} placeholder="DE" />
        </div>
        <Feld id="p-customs" label="Zollbeschreibung" value={v.customsDescription} onChange={set("customsDescription")} maxLength={255}
              hint="Wird bei zollpflichtigen Sendungen als Warenbeschreibung vorgeschlagen." />
      </fieldset>

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Bestandsführung</legend>
        <div className="inv-grid-2">
          <Feld id="p-min" label="Mindestbestand" value={v.minStock} onChange={set("minStock")} error={errs.minStock} inputMode="numeric"
                hint="Unterhalb dieses Werts wird der Artikel als niedriger Bestand markiert." />
          <div className="inv-field">
            <label className="field-label" htmlFor="p-status">Status</label>
            <select id="p-status" className="field-select" value={v.status} onChange={(e) => set("status")(e.target.value)}>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
            <p className="inv-field-hint">Inaktive Artikel bleiben mit ihrer Historie erhalten, können aber nicht beauftragt werden.</p>
          </div>
        </div>
      </fieldset>

      <div className="inv-form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Wird gespeichert …" : (initial ? "Änderungen speichern" : "Artikel anlegen")}
        </button>
      </div>
    </form>
  );
}
