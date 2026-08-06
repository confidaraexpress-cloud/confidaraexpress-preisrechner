import React from "react";
import { Icon } from "../ui/Icon";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatFormRecipient, formatFormRoute, formatFormPackage, formFormShippingDate } from "../../utils/formDraftsView.mjs";
import { DraftActionsMenu } from "./DraftActionsMenu";

// Desktop-Zeile für einen FRÜHEN Formularentwurf (kind:"form"): noch nicht
// berechnet — daher KEIN Carrier/Tarif/Preis/Laufzeit/Tracking/Label/JUMiNGO-ID.
// Zusätzlich zum Löschen bietet er „Fortsetzen" (Detail laden → NewShipmentPage).
// Der Badge kennzeichnet den Typ zusätzlich zur Farbe (nicht rein farblich).
export function FormDraftDesktopRow({ draft, busy, resuming, onDelete, onResume }) {
  const pkg = formatFormPackage(draft);
  const shipDate = formFormShippingDate(draft);
  const anyBusy = busy || resuming;
  return (
    <tr>
      <td className="dft-cell-recipient">
        <span className="dft-badge dft-badge-form"><Icon n="form" s={11} c="currentColor" /> Formularentwurf</span>
        <span className="dft-cell-recipient-name">{formatFormRecipient(draft)}</span>
      </td>
      <td className="dft-cell-route">{formatFormRoute(draft)}</td>
      <td>
        <div className="dft-cell-package">
          <span className="dft-cell-package-count">{pkg.countLabel || "—"}</span>
          <span>{pkg.weightLabel || "Gewicht noch offen"}</span>
        </div>
      </td>
      <td className="dft-cell-date">{shipDate ? fmtDE(shipDate) : "Versanddatum noch offen"}</td>
      <td className="dft-cell-updated">{draft.updatedAt ? dtDE(draft.updatedAt) : "—"}</td>
      <td>
        <div className="dft-cell-actions">
          <button type="button" className="btn btn-outline btn-sm dft-resume-btn" onClick={() => onResume(draft)} disabled={anyBusy}>
            {resuming ? <span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> : <Icon n="arrowRight" s={14} />} Fortsetzen
          </button>
          <DraftActionsMenu draft={draft} busy={busy} disabled={resuming} onDelete={onDelete} />
        </div>
      </td>
    </tr>
  );
}
