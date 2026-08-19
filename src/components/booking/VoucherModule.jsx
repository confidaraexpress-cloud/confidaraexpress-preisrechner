import React, { useId } from "react";
import { Icon } from "../ui/Icon";
import { money } from "../../utils/formatters";
import { VOUCHER_STATUS, VOUCHER_INVALID_MESSAGE, VOUCHER_ERROR_MESSAGE, canSubmitVoucher } from "../../utils/voucherView.mjs";

// Gutscheinfeld im Bestätigungsschritt — REINE DARSTELLUNG. Es rechnet nichts und kennt keine
// gültigen Codes: ob ein Code gilt und was er bewirkt, sagt ausschließlich die serverbestätigte
// Antwort (siehe utils/voucherView.mjs). Ein manipulierter Client kann hier keinen 0-Euro-Preis
// erzeugen — die Buchung prüft unmittelbar vor der Bestellung erneut gegen den Provider.
//
// Bewusst KEINE eigene große Karte: das Feld sitzt innerhalb der bestehenden Bestellübersicht
// direkt unter der Preisaufstellung und über den Bestätigungen. Es nutzt die vorhandenen
// Primitives (.btn, .field-input) — kein neues Bedienmuster.
export function VoucherModule({ status, code, percent, inputCode, onInputChange, onApply, onRemove, disabled }) {
  const inputId = useId();
  const checking = status === VOUCHER_STATUS.CHECKING;
  const applied  = status === VOUCHER_STATUS.APPLIED;
  const message =
    status === VOUCHER_STATUS.INVALID ? VOUCHER_INVALID_MESSAGE :
    status === VOUCHER_STATUS.ERROR   ? VOUCHER_ERROR_MESSAGE   : "";

  if (applied) {
    return (
      <div className="booking-voucher booking-voucher--applied">
        <div className="booking-voucher-applied-row">
          <Icon n="check" s={16} c="currentColor" />
          <span className="booking-voucher-applied-text">
            Gutschein angewendet
            <span className="booking-voucher-applied-meta">
              {code}{Number.isFinite(percent) ? ` · ${percent} %` : ""}
            </span>
          </span>
          <button
            type="button"
            className="btn btn-link btn-sm booking-voucher-remove"
            onClick={onRemove}
            disabled={disabled}
          >
            Entfernen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-voucher">
      <label className="booking-voucher-label" htmlFor={inputId}>Gutscheincode</label>
      <div className="booking-voucher-row">
        <input
          id={inputId}
          type="text"
          className="field-input booking-voucher-input"
          value={inputCode}
          onChange={(e) => onInputChange(e.target.value)}
          // Enter im Feld löst dieselbe Aktion aus wie der Knopf; das Feld steht in einem
          // größeren Formularkontext, deshalb wird das Standardverhalten unterdrückt.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canSubmitVoucher(inputCode, status) && !disabled) onApply();
            }
          }}
          autoComplete="off"
          spellCheck={false}
          disabled={checking || disabled}
          aria-invalid={message ? "true" : undefined}
          aria-describedby={message ? `${inputId}-msg` : undefined}
        />
        <button
          type="button"
          className="btn btn-outline booking-voucher-apply"
          onClick={onApply}
          disabled={!canSubmitVoucher(inputCode, status) || disabled}
        >
          {checking ? <span className="spinner spinner-dark" /> : null}
          {checking ? "Wird geprüft …" : "Anwenden"}
        </button>
      </div>
      {message && (
        <p id={`${inputId}-msg`} className="booking-voucher-msg" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
