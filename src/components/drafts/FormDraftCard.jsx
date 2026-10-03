import React from "react";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatFormRecipient, formatFormRoute, formatFormPackage, formFormShippingDate } from "../../utils/formDraftsView.mjs";
import { DraftActionsMenu } from "./DraftActionsMenu";

// Mobil-Karte für einen frühen Formularentwurf — Empfänger prominent, Route
// und Paketdaten sekundär, der Typ als Text („Formularentwurf"); „Fortsetzen"
// und „Weitere Aktionen" als gut tappbare Textbuttons (Redesign 2026-10).
export function FormDraftCard({ draft, busy, resuming, onDelete, onResume }) {
  const pkg = formatFormPackage(draft);
  const shipDate = formFormShippingDate(draft);
  const anyBusy = busy || resuming;
  return (
    <li className="dft-card">
      <span className="dft-badge dft-badge-form">Formularentwurf</span>
      <div>
        <div className="dft-card-recipient">{formatFormRecipient(draft)}</div>
        <div className="dft-card-route">{formatFormRoute(draft)}</div>
      </div>
      <dl className="dft-card-info">
        <div className="dft-card-info-row">
          <dt>Paketdaten</dt>
          <dd>{pkg.countLabel || "—"}{pkg.weightLabel ? ` · ${pkg.weightLabel}` : " · Gewicht noch offen"}</dd>
        </div>
        <div className="dft-card-info-row">
          <dt>Versanddatum</dt>
          <dd>{shipDate ? fmtDE(shipDate) : "Noch offen"}</dd>
        </div>
      </dl>
      <div className="dft-card-meta">
        {draft.updatedAt ? `Zuletzt bearbeitet: ${dtDE(draft.updatedAt)}` : ""}
      </div>
      <div className="dft-card-actions">
        <button type="button" className="btn btn-outline btn-sm dft-resume-btn" onClick={() => onResume(draft)} disabled={anyBusy}>
          {resuming && <span className="spinner spinner-dark spinner-sm" />} Fortsetzen
        </button>
        <DraftActionsMenu draft={draft} busy={busy} disabled={resuming} onDelete={onDelete} />
      </div>
    </li>
  );
}
