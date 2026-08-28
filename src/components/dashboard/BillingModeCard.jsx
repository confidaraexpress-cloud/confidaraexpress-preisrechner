import React, { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { FormAlert } from "../ui/FormAlert";
import { apiFetch, getCurrentConsolidatedPeriod } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import { money } from "../../utils/formatters";
import {
  BILLING_MODES, BILLING_MODE_TEXT, billingMode, buildBillingModePatch,
  consolidatedPeriodView,
} from "../../utils/billingModeView.mjs";
import { cardHead } from "./ProfileCardHead";

// Abrechnungsart der Kontoseite. Exakt dasselbe Muster wie die Lieferschein-
// einstellung: eine Auswahl aus zwei Optionen hat keinen Bearbeiten-Modus, sie
// wird umgestellt und über denselben PATCH /kunde/profil gespeichert. Keine
// zweite Speicherstrecke.
export function BillingModeCard({ user }) {
  const { updateUser } = useAuth();

  const [bmMode, setBmMode] = useState(() => billingMode(user));
  const [bmSaving, setBmSaving] = useState(false);
  const [bmError, setBmError] = useState("");
  const [bmSaved, setBmSaved] = useState(false);
  const serverBmMode = billingMode(user);
  useEffect(() => { setBmMode(serverBmMode); }, [serverBmMode]);

  // Vorschau auf den laufenden Sammelzeitraum. Sie wird NUR bei Sammelabrechnung geholt —
  // ein Einzelrechnungskonto stellt die Anfrage gar nicht erst. Der Abruf verändert
  // serverseitig nichts (read-only) und darf die Karte bei einem Ausfall nicht brechen:
  // ein Fehler ergibt eine ruhige Hinweiszeile, keine leere Fläche.
  const [periodData, setPeriodData] = useState(null);
  const [periodError, setPeriodError] = useState("");
  useEffect(() => {
    if (serverBmMode !== "consolidated_7d") { setPeriodData(null); setPeriodError(""); return undefined; }
    let alive = true;
    (async () => {
      try {
        const r = await getCurrentConsolidatedPeriod();
        if (!alive) return;
        if (!r.ok) { setPeriodError(BILLING_MODE_TEXT.periodLoadError); return; }
        setPeriodError(""); setPeriodData(r.data);
      } catch {
        if (alive) setPeriodError(BILLING_MODE_TEXT.periodLoadError);
      }
    })();
    return () => { alive = false; };
  }, [serverBmMode]);

  // Speichert die Abrechnungsart über denselben Profil-PATCH. Optimistische Anzeige mit
  // Rückfall auf die Serverwahrheit bei einem Fehler — es bleibt nie eine Auswahl stehen,
  // die nicht gespeichert wurde.
  const saveBillingMode = async (mode) => {
    if (bmSaving || mode === serverBmMode) return;
    setBmMode(mode);
    setBmSaving(true); setBmError(""); setBmSaved(false);
    try {
      const r = await apiFetch(`/kunde/profil`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(buildBillingModePatch(mode)),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBmMode(serverBmMode);
        setBmError(d?.error || "Die Einstellung konnte nicht gespeichert werden.");
        setBmSaving(false);
        return;
      }
      if (d.user) updateUser(d.user);
      setBmSaved(true);
    } catch (e) {
      setBmMode(serverBmMode);
      setBmError(normalizeThrownError(e).message);
    }
    setBmSaving(false);
  };

  // Dieselben nativen Radios auf demselben forms.css-Primitive wie die
  // Lieferscheinauswahl — kein zweites Auswahlbauteil, keine eigenen Klassen.
  const period = periodData ? consolidatedPeriodView(periodData) : null;
  return (
    <div className="table-card profile-card">
      {cardHead("invoice", BILLING_MODE_TEXT.title, BILLING_MODE_TEXT.subtitle, null)}
      <div className="profile-section-body">
        <fieldset className="dn-mode-fieldset" disabled={bmSaving}>
          <legend className="field-label">{BILLING_MODE_TEXT.fieldLabel}</legend>
          {BILLING_MODES.map((mode) => {
            const opt = BILLING_MODE_TEXT.options[mode];
            const id = `bm-mode-${mode}`;
            return (
              <label key={mode} className={`dn-mode-option${bmMode === mode ? " selected" : ""}`} htmlFor={id}>
                <input
                  id={id}
                  type="radio"
                  name="billingMode"
                  value={mode}
                  checked={bmMode === mode}
                  onChange={() => saveBillingMode(mode)}
                />
                <span className="dn-mode-text">
                  <span className="dn-mode-label">{opt.label}</span>
                  <span className="field-hint">{opt.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="field-hint mt-8">{BILLING_MODE_TEXT.changeNote}</p>
        {bmError && <FormAlert tone="error" message={bmError} className="mt-16" />}
        {bmSaved && !bmError && (
          <p className="profile-saved" role="status">
            <Icon n="check" s={14} /> Einstellung gespeichert
          </p>
        )}
        {/* Laufender Zeitraum — ausschließlich Serverwerte, nichts wird gerechnet.
            Erscheint nur bei Sammelabrechnung und nur, wenn der Server tatsächlich
            einen Zeitraum liefert; sonst steht dort der leere Zustand. */}
        {serverBmMode === "consolidated_7d" && (
          <div className="bm-period mt-16">
            <h4 className="field-label">{BILLING_MODE_TEXT.periodTitle}</h4>
            {periodError && <FormAlert tone="error" message={periodError} className="mt-8" />}
            {!periodError && (!period || !period.hasPeriod) && (
              <p className="field-hint">{BILLING_MODE_TEXT.periodEmpty}</p>
            )}
            {!periodError && period && period.hasPeriod && (
              <>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">Zeitraum</span>
                  <span className="text-sm font-bold summary-detail-val">{period.rangeLabel}</span>
                </div>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodCountLabel}</span>
                  <span className="text-sm font-bold summary-detail-val">{period.shipmentCount}</span>
                </div>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodAmountLabel}</span>
                  <span className="text-sm font-bold summary-detail-val">{money(period.grossAmount)}</span>
                </div>
                {period.invoiceDateLabel && (
                  <div className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodInvoiceDateLabel}</span>
                    <span className="text-sm font-bold summary-detail-val">{period.invoiceDateLabel}</span>
                  </div>
                )}
                <p className="field-hint mt-8">{BILLING_MODE_TEXT.periodPreviewNote}</p>
                {period.earlierCount > 0 && (
                  <p className="field-hint">
                    {period.earlierCount === 1
                      ? "1 weitere Sendung aus einem früheren Zeitraum wartet noch auf ihre Rechnung."
                      : `${period.earlierCount} weitere Sendungen aus früheren Zeiträumen warten noch auf ihre Rechnung.`}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
