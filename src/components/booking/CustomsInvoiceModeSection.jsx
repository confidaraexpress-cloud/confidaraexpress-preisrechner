import React from "react";
import { CommercialInvoiceUpload } from "./CommercialInvoiceUpload";

// „Zollrechnung" — REINE DARSTELLUNG. Radio-Gruppe (Proforma / eigene Handels-
// rechnung) + die davon abhängigen Zollrechnungsfelder. State/Validierung/Upload
// liegen im Orchestrator (BookingPage/useCommercialInvoice) und kommen als Props.
// Betrifft ausschließlich die Zollrechnung — nie Kundenpreis/-rechnung/MwSt.
export function CustomsInvoiceModeSection({
  mode, onSelectMode, commercialOnly, proformaHint,
  invoiceNumber, onInvoiceNumberChange, invoiceNumberError,
  invoiceDate, onInvoiceDateChange, invoiceDateError,
  invoiceRemark, onInvoiceRemarkChange,
  showErrors, ci,
}) {
  const isCommercial = mode === "commercial";
  const numErr = showErrors ? invoiceNumberError : "";
  const dateErr = showErrors ? invoiceDateError : "";

  return (
    <div className="customs-invoice-meta">
      <h4 className="customs-invoice-meta-title">Zollrechnung</h4>

      <fieldset className="ci-mode">
        <legend className="ci-mode-legend">Art der Zollrechnung</legend>
        <p className="customs-hint" id="ci-mode-help">
          Wählen Sie, ob wir eine Proforma-Rechnung erstellen oder Sie eine eigene Handelsrechnung hinterlegen.
        </p>

        <label className="ci-mode-option" htmlFor="ci-mode-proforma">
          <input
            type="radio"
            id="ci-mode-proforma"
            name="customsInvoiceMode"
            value="proforma"
            className="ci-mode-radio"
            checked={mode === "proforma"}
            disabled={commercialOnly}
            onChange={() => onSelectMode("proforma")}
            aria-describedby="ci-mode-proforma-help"
          />
          <span className="ci-mode-option-text">
            <span className="ci-mode-option-title">Proforma-Rechnung erstellen lassen</span>
            <span id="ci-mode-proforma-help" className="field-hint">
              Geeignet für nicht gewerbliche Waren, Geschenke, Muster oder Waren ohne kommerziellen Verkaufszweck.
            </span>
          </span>
        </label>

        <label className="ci-mode-option" htmlFor="ci-mode-commercial">
          <input
            type="radio"
            id="ci-mode-commercial"
            name="customsInvoiceMode"
            value="commercial"
            className="ci-mode-radio"
            checked={mode === "commercial"}
            onChange={() => onSelectMode("commercial")}
            aria-describedby="ci-mode-commercial-help"
          />
          <span className="ci-mode-option-text">
            <span className="ci-mode-option-title">Eigene Handelsrechnung verwenden</span>
            <span id="ci-mode-commercial-help" className="field-hint">
              Erforderlich, wenn die Sendung einen kommerziellen Hintergrund hat.
            </span>
          </span>
        </label>

        {commercialOnly && (
          <p className="ci-mode-forced" role="note">
            Bei gewerblichen Waren ist eine eigene Handelsrechnung erforderlich.
          </p>
        )}
        {proformaHint && (
          <p className="field-error ci-mode-blocked" role="alert">{proformaHint}</p>
        )}
      </fieldset>

      {/* Zollwert-Währung — in beiden Modi sichtbar, read-only, unverändert. */}
      <div className="customs-grid">
        <div className="field">
          <label className="field-label" htmlFor="customs-invoice-currency">Zollwert-Währung</label>
          <input
            id="customs-invoice-currency"
            className="field-input"
            value="EUR"
            readOnly
            aria-readonly="true"
            aria-describedby="customs-invoice-currency-hint"
          />
          <span id="customs-invoice-currency-hint" className="field-hint">
            Währung der Zollwertangaben. Ihre ConfidaraExpress-Rechnung bleibt in EUR.
          </span>
        </div>

        {/* Rechnungsnummer + Rechnungsdatum — nur im commercial-Modus, dann Pflicht. */}
        {isCommercial && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="customs-invoice-number">Rechnungsnummer</label>
              <input
                id="customs-invoice-number"
                className={`field-input${numErr ? " field-input-error" : ""}`}
                value={invoiceNumber}
                onChange={e => onInvoiceNumberChange(e.target.value)}
                placeholder="z. B. RE-2026-0042"
                aria-invalid={numErr ? "true" : undefined}
                aria-describedby={numErr ? "customs-invoice-number-error" : undefined}
              />
              {numErr && <span id="customs-invoice-number-error" className="field-error">{numErr}</span>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="customs-invoice-date">Rechnungsdatum</label>
              <input
                id="customs-invoice-date"
                type="date"
                className={`field-input${dateErr ? " field-input-error" : ""}`}
                value={invoiceDate}
                onChange={e => onInvoiceDateChange(e.target.value)}
                aria-invalid={dateErr ? "true" : undefined}
                aria-describedby={dateErr ? "customs-invoice-date-error" : undefined}
              />
              {dateErr && <span id="customs-invoice-date-error" className="field-error">{dateErr}</span>}
            </div>
          </>
        )}

        {/* Rechnungshinweis — in beiden Modi sichtbar, optional, unverändert. */}
        <div className="field customs-col-full">
          <label className="field-label" htmlFor="customs-invoice-remark">Rechnungshinweis (optional)</label>
          <textarea
            id="customs-invoice-remark"
            className="field-input customs-invoice-remark"
            value={invoiceRemark}
            onChange={e => onInvoiceRemarkChange(e.target.value)}
            rows={2}
            placeholder="z. B. Warensendung ohne Handelswert"
          />
        </div>
      </div>

      {/* PDF-Upload — nur im commercial-Modus. */}
      {isCommercial && (
        <CommercialInvoiceUpload
          status={ci.status}
          message={ci.message}
          messageType={ci.messageType}
          requiredError={ci.requiredError}
          onFileSelected={ci.onFileSelected}
          onRemove={ci.onRemove}
        />
      )}
    </div>
  );
}
