import React from "react";
import { Icon } from "../ui/Icon";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatFormRecipient, formatFormRoute, formatFormPackage, formFormShippingDate } from "../../utils/formDraftsView.mjs";

// Mobil-Karte für einen frühen Formularentwurf — Route + Empfänger prominent,
// Typ-Badge (nicht rein farblich), „Fortsetzen" + „Löschen" als vollwertige,
// gut tappbare Buttons mit Textlabel (kein Icon-only-Versehen).
export function FormDraftCard({ draft, busy, resuming, onDelete, onResume }) {
  const pkg = formatFormPackage(draft);
  const shipDate = formFormShippingDate(draft);
  const anyBusy = busy || resuming;
  return (
    <li className="dft-card">
      <span className="dft-badge dft-badge-form"><Icon n="form" s={11} c="currentColor" /> Formularentwurf</span>
      <div>
        <div className="dft-card-route">{formatFormRoute(draft)}</div>
        <div className="dft-card-recipient">{formatFormRecipient(draft)}</div>
      </div>
      <div className="dft-card-info">
        <div className="dft-card-info-row">
          <Icon n="package" s={13} />
          <span>{pkg.countLabel || "—"}{pkg.weightLabel ? ` · ${pkg.weightLabel}` : " · Gewicht noch offen"}</span>
        </div>
        <div className="dft-card-info-row">
          <Icon n="calendar" s={13} />
          <span>{shipDate ? fmtDE(shipDate) : "Versanddatum noch offen"}</span>
        </div>
      </div>
      <div className="dft-card-meta">
        {draft.updatedAt ? `Zuletzt bearbeitet: ${dtDE(draft.updatedAt)}` : ""}
      </div>
      <div className="dft-card-actions">
        <button type="button" className="btn btn-outline dft-resume-btn" onClick={() => onResume(draft)} disabled={anyBusy}>
          {resuming ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : <Icon n="arrowRight" s={15} />} Fortsetzen
        </button>
        <button type="button" className="btn btn-outline dft-delete-btn" onClick={() => onDelete(draft)} disabled={anyBusy}>
          {busy ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : <Icon n="trash" s={15} />} Löschen
        </button>
      </div>
    </li>
  );
}
