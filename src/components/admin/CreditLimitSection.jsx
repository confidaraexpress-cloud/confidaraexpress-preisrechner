import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../utils/formatters";
import {
  creditFacts, selectCredit, parseCreditLimitInput, creditLimitInputValue, CREDIT_ADMIN_TEXT,
} from "../../utils/creditLimitView.mjs";
import { ConfirmDialog } from "./ConfirmDialog";

// ───────────────────────────────────────────────────────�
// Sektion „Buchungsrahmen" in der Admin-Kundendetailansicht (Paket F, 2026-10-23;
// Backend Paket E).
//
// Zeigt Rahmen, offene Belege, reservierte Beträge und den verfügbaren Spielraum —
// dieselben Werte, die das Buchungs-Gate des Backends unter Sperre berechnet — und
// erlaubt, den Rahmen zu setzen. Rein darstellend; der Request liegt in der Seite
// (ein Request-Pfad, ein Zustand), dieselbe Aufteilung wie bei `BillingModeSection`.
//
// MIT Bestätigungsdialog: der Rahmen ist eine Geschäftskondition mit Geldwirkung, er wird
// protokolliert und gilt sofort für neue Buchungen. Die Eingabe wird vorab geprüft
// (0 … 1.000.000 €, zwei Nachkommastellen); das Backend prüft erneut und bleibt verbindlich.
// Ohne Rahmen in der Antwort (altes Backend) steht hier nichts.
// ───────────────────────────────────────────────────────�

export const CREDIT_LIMIT_SECTION_ID = "adm-credit-limit-section";
export const CREDIT_LIMIT_INPUT_ID = "adm-credit-limit-input";

export function CreditLimitSection({
  credit,                 // Rahmenobjekt der Kundenantwort (selectCredit-tauglich)
  userId = null,          // für den Verlauf im Audit-Log (Aktion „Buchungsrahmen geändert")
  busy = false,
  error = "",
  successText = "",
  onSave,                 // (value: number) => void — nach bestätigtem Dialog
}) {
  const c = selectCredit(credit);
  const f = creditFacts(c);
  const [input, setInput] = useState(() => creditLimitInputValue(c));
  const [inputError, setInputError] = useState("");
  const [pending, setPending] = useState(null); // { value } während der Bestätigung
  // Ein frisch gesetzter Rahmen (Serverwahrheit) landet im Feld — nicht der getippte Wert.
  useEffect(() => { setInput(creditLimitInputValue(c)); setInputError(""); }, [c ? c.limit : null]);
  if (!c) return null;

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    const p = parseCreditLimitInput(input);
    if (!p.ok) { setInputError(p.error); return; }
    setInputError("");
    if (Math.round(p.value * 100) === Math.round(c.limit * 100)) { setInputError(CREDIT_ADMIN_TEXT.unchanged); return; }
    setPending({ value: p.value });
  };

  return (
    <div className="adm-card" id={CREDIT_LIMIT_SECTION_ID}>
      {/* Der Zustand steht doppelt codiert da: als Wort im Kartenkopf und in den Zahlen — nie allein farblich. */}
      <div className="adm-card-head">
        {CREDIT_ADMIN_TEXT.title}
        <span className={`badge ${f.exhausted ? "badge--warning" : "badge--neutral"} adm-card-head-action`}>
          {f.exhausted ? CREDIT_ADMIN_TEXT.exhaustedBadge : CREDIT_ADMIN_TEXT.availableBadge(c.available)}
        </span>
      </div>
      <div className="adm-card-body">
        <div className="adm-summary">
          <div className="adm-stat"><div className="adm-stat-label">{CREDIT_ADMIN_TEXT.stats.limit}</div><div className="adm-stat-value">{money(c.limit)}</div></div>
          <div className="adm-stat"><div className="adm-stat-label">{CREDIT_ADMIN_TEXT.stats.open}</div><div className="adm-stat-value">{money(c.open)}</div></div>
          <div className="adm-stat"><div className="adm-stat-label">{CREDIT_ADMIN_TEXT.stats.reserved}</div><div className="adm-stat-value">{money(c.reserved)}</div></div>
          <div className="adm-stat"><div className="adm-stat-label">{CREDIT_ADMIN_TEXT.stats.available}</div><div className="adm-stat-value">{money(c.available)}</div></div>
        </div>
        <form className="adm-credit-form mt-16" onSubmit={submit} noValidate>
          <label className="field-label" htmlFor={CREDIT_LIMIT_INPUT_ID}>{CREDIT_ADMIN_TEXT.fieldLabel}</label>
          <div className="adm-credit-row">
            <input
              id={CREDIT_LIMIT_INPUT_ID}
              className={`field-input${inputError ? " field-input-error" : ""}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={input}
              disabled={busy}
              aria-invalid={inputError ? "true" : undefined}
              aria-describedby={`${CREDIT_LIMIT_INPUT_ID}-hint${inputError ? ` ${CREDIT_LIMIT_INPUT_ID}-error` : ""}`}
              onChange={(e) => { setInput(e.target.value); if (inputError) setInputError(""); }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Wird gespeichert…" : CREDIT_ADMIN_TEXT.save}
            </button>
          </div>
          <p className="field-hint mt-8" id={`${CREDIT_LIMIT_INPUT_ID}-hint`}>{CREDIT_ADMIN_TEXT.hint}</p>
          {inputError && (
            <p className="field-error mt-8" id={`${CREDIT_LIMIT_INPUT_ID}-error`} role="alert">{inputError}</p>
          )}
        </form>
        <div className="adm-note mt-8">
          <span>{CREDIT_ADMIN_TEXT.note}</span>
        </div>
        {/* Verlauf: jede Änderung ist mit Vorher/Nachher auditiert — der Link öffnet das Audit-Log
            vorgefiltert auf dieses Konto und diese Aktion. */}
        {userId != null && (
          <div className="mt-8">
            <Link
              className="btn btn-link btn-sm adm-credit-history"
              to={`/admin/audit-logs?action=user.credit_limit_change&target_user_id=${encodeURIComponent(userId)}`}
            >
              {CREDIT_ADMIN_TEXT.history}
            </Link>
          </div>
        )}
        {error && (
          <div className="adm-note adm-note--error mt-8" role="alert">
            <span>{error}</span>
          </div>
        )}
        {successText && !error && (
          <p className="profile-saved mt-8" role="status">{successText}</p>
        )}
      </div>
      {pending && (
        <ConfirmDialog
          title={CREDIT_ADMIN_TEXT.confirmTitle}
          text={CREDIT_ADMIN_TEXT.confirmText(c.limit, pending.value)}
          confirmLabel={CREDIT_ADMIN_TEXT.confirmLabel}
          busy={busy}
          onCancel={() => { if (!busy) setPending(null); }}
          onConfirm={() => { const v = pending.value; setPending(null); onSave && onSave(v); }}
        />
      )}
    </div>
  );
}
