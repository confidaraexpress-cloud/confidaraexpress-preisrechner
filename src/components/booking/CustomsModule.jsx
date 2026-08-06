import React from "react";
import { Icon } from "../ui/Icon";
import { money } from "../../utils/formatters";
import { countries } from "../../utils/countries";
import { CustomsInvoiceModeSection } from "./CustomsInvoiceModeSection";

// Exportgründe: Anzeige deutsch, gesendet wird der englische Enum-Wert.
const EXPORT_REASONS = [
  { value: "Commercial", label: "Verkauf" },
  { value: "Gift",       label: "Geschenk" },
  { value: "Sample",     label: "Muster" },
  { value: "Return",     label: "Rücksendung" },
  { value: "Personal",   label: "Persönliche Gegenstände" },
  { value: "Claim",      label: "Reklamation" },
  { value: "Temporary",  label: "Vorübergehende Ausfuhr" },
  { value: "Relocation", label: "Umzugsgut" },
];

// Mengeneinheiten: Anzeige deutsch, gesendet wird der Enum-Wert. Default PCS.
const UNITS = [
  { value: "PCS", label: "Stück" },
  { value: "KG",  label: "Kilogramm" },
  { value: "M",   label: "Meter" },
  { value: "M2",  label: "Quadratmeter" },
  { value: "M3",  label: "Kubikmeter" },
  { value: "L",   label: "Liter" },
];

const asNum = (v) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// „Angaben zum Wareninhalt" — REINE DARSTELLUNG. State (Positionen, Exportgrund)
// und Validierung liegen im Orchestrator (BookingPage) und werden hereingereicht.
// Feldfehler erscheinen erst, wenn showErrors gesetzt ist (nach Buchungsversuch).
export function CustomsModule({
  exportReason, onExportReasonChange,
  items, onItemChange, onAddItem, onRemoveItem,
  hsRequired, itemErrors, exportReasonError, showErrors,
  invoiceMode, onSelectInvoiceMode, commercialOnly, proformaHint,
  invoiceNumber, onInvoiceNumberChange, invoiceNumberError,
  invoiceDate, onInvoiceDateChange, invoiceDateError,
  invoiceRemark, onInvoiceRemarkChange,
  ci,
}) {
  const totalValue = items.reduce((s, it) => s + asNum(it.value), 0);
  const totalWeight = items.reduce((s, it) => s + asNum(it.netWeight), 0);
  const weightFmt = totalWeight.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const err = (i, key) => (showErrors ? itemErrors?.[i]?.[key] : null);

  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="globe" s={18} c="var(--ce-color-brand-ink)" /><h3>Angaben zum Wareninhalt</h3></div>
      <div className="calc-panel-body">
        <p className="customs-hint">
          Für Sendungen außerhalb der EU benötigen wir Angaben zum Wareninhalt.
          Diese Angaben werden für die Zollabfertigung benötigt.
        </p>

        <div className="field">
          <label className="field-label" htmlFor="customs-reason">Exportgrund</label>
          <select
            id="customs-reason"
            className={`field-input field-select${showErrors && exportReasonError ? " field-input-error" : ""}`}
            value={exportReason}
            onChange={e => onExportReasonChange(e.target.value)}
          >
            <option value="">Bitte wählen …</option>
            {EXPORT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {showErrors && exportReasonError && <span className="field-error">{exportReasonError}</span>}
          {exportReason === "Personal" && (
            <span className="field-hint">
              „Persönlich" bezeichnet persönliche oder nicht zum Verkauf bestimmte Waren Ihres Unternehmens und keinen privaten Kundenaccount.
            </span>
          )}
        </div>

        {items.map((it, i) => (
          <div key={i} className="customs-item">
            <div className="customs-item-head">
              <span className="customs-item-title">Position {i + 1}</span>
              <button
                type="button"
                className="customs-item-remove"
                onClick={() => onRemoveItem(i)}
                disabled={items.length <= 1}
                title={items.length <= 1 ? "Mindestens eine Position erforderlich" : "Position entfernen"}
              >
                <Icon n="x" s={13} c="currentColor" /> Entfernen
              </button>
            </div>

            <div className="customs-grid">
              <div className="field customs-col-full">
                <label className="field-label">Warenbeschreibung</label>
                <input
                  className={`field-input${err(i, "description") ? " field-input-error" : ""}`}
                  value={it.description}
                  onChange={e => onItemChange(i, "description", e.target.value)}
                  placeholder="z. B. Baumwoll-T-Shirts"
                  maxLength={200}
                />
                {err(i, "description") && <span className="field-error">{err(i, "description")}</span>}
              </div>

              <div className="field">
                <label className="field-label">Warenwert (EUR)</label>
                <input
                  className={`field-input${err(i, "value") ? " field-input-error" : ""}`}
                  type="number" inputMode="decimal" min="0" step="0.01"
                  value={it.value}
                  onChange={e => onItemChange(i, "value", e.target.value)}
                  placeholder="z. B. 120"
                />
                {err(i, "value") && <span className="field-error">{err(i, "value")}</span>}
              </div>

              <div className="field">
                <label className="field-label">Menge</label>
                <input
                  className={`field-input${err(i, "quantity") ? " field-input-error" : ""}`}
                  type="number" inputMode="numeric" min="1" step="1"
                  value={it.quantity}
                  onChange={e => onItemChange(i, "quantity", e.target.value)}
                  placeholder="1"
                />
                {err(i, "quantity") && <span className="field-error">{err(i, "quantity")}</span>}
              </div>

              <div className="field">
                <label className="field-label">Einheit</label>
                <select
                  className="field-input field-select"
                  value={it.unitOfMeasurement}
                  onChange={e => onItemChange(i, "unitOfMeasurement", e.target.value)}
                >
                  {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="field-label">Nettogewicht (kg)</label>
                <input
                  className={`field-input${err(i, "netWeight") ? " field-input-error" : ""}`}
                  type="number" inputMode="decimal" min="0" step="0.01"
                  value={it.netWeight}
                  onChange={e => onItemChange(i, "netWeight", e.target.value)}
                  placeholder="z. B. 0,5"
                />
                {err(i, "netWeight") && <span className="field-error">{err(i, "netWeight")}</span>}
              </div>

              <div className="field">
                <label className="field-label">Ursprungsland</label>
                <select
                  className={`field-input field-select${err(i, "originCountry") ? " field-input-error" : ""}`}
                  value={it.originCountry}
                  onChange={e => onItemChange(i, "originCountry", e.target.value)}
                >
                  <option value="">Bitte wählen …</option>
                  {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                {err(i, "originCountry") && <span className="field-error">{err(i, "originCountry")}</span>}
              </div>

              {hsRequired && (
                <div className="field customs-col-full">
                  <label className="field-label">
                    Zolltarifnummer (HS-Code)
                  </label>
                  <input
                    className={`field-input${err(i, "hsTariffNumber") ? " field-input-error" : ""}`}
                    value={it.hsTariffNumber}
                    onChange={e => onItemChange(i, "hsTariffNumber", e.target.value)}
                    placeholder="z. B. 6109 1000"
                    maxLength={20}
                  />
                  <span className="field-hint">Internationale Warennummer für die Zollabfertigung.</span>
                  {err(i, "hsTariffNumber") && <span className="field-error">{err(i, "hsTariffNumber")}</span>}
                </div>
              )}
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-outline btn-sm customs-add-btn" onClick={onAddItem}>
          <Icon n="plus" s={14} c="currentColor" /> Weitere Position hinzufügen
        </button>

        <div className="customs-summary">
          <span className="customs-summary-item">Warenwert gesamt: <strong>{money(totalValue)}</strong></span>
          <span className="customs-summary-item">Nettogewicht gesamt: <strong>{weightFmt} kg</strong></span>
        </div>

        {/* Zollrechnung — Rechnungstyp (Proforma/Handelsrechnung) + abhängige Felder.
            Betrifft ausschließlich die Zollrechnung, nie die ConfidaraExpress-Kundenrechnung. */}
        <CustomsInvoiceModeSection
          mode={invoiceMode}
          onSelectMode={onSelectInvoiceMode}
          commercialOnly={commercialOnly}
          proformaHint={proformaHint}
          invoiceNumber={invoiceNumber}
          onInvoiceNumberChange={onInvoiceNumberChange}
          invoiceNumberError={invoiceNumberError}
          invoiceDate={invoiceDate}
          onInvoiceDateChange={onInvoiceDateChange}
          invoiceDateError={invoiceDateError}
          invoiceRemark={invoiceRemark}
          onInvoiceRemarkChange={onInvoiceRemarkChange}
          showErrors={showErrors}
          ci={ci}
        />
      </div>
    </div>
  );
}
