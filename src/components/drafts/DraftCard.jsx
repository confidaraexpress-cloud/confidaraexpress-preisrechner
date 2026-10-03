import React from "react";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatRecipientDisplay, formatRoute, formatPackageSummary, shippingDateValue } from "../../utils/draftsView.mjs";
import { DraftActionsMenu } from "./DraftActionsMenu";

// Mobil-Karte — Empfänger prominent, Route und Paketdaten sekundär, alles als
// Text ohne Symbole (Redesign 2026-10).
// „Fortsetzen" steht wie beim Formularentwurf direkt sichtbar; das Löschen bleibt
// die sekundäre Aktion im Kebab-Menü.
export function DraftCard({ draft, busy, resuming, onDelete, onResume }) {
  const pkg = formatPackageSummary(draft);
  const shipDate = shippingDateValue(draft);
  const anyBusy = busy || resuming;
  return (
    <li className="dft-card">
      <div>
        <div className="dft-card-recipient">{formatRecipientDisplay(draft)}</div>
        <div className="dft-card-route">{formatRoute(draft)}</div>
      </div>
      <dl className="dft-card-info">
        <div className="dft-card-info-row">
          <dt>Paketdaten</dt>
          <dd>{pkg.countLine || "—"}{pkg.dimsLine ? ` · ${pkg.dimsLine}` : ""}</dd>
        </div>
        <div className="dft-card-info-row">
          <dt>Versanddatum</dt>
          <dd>{shipDate ? fmtDE(shipDate) : "Noch nicht festgelegt"}</dd>
        </div>
      </dl>
      <div className="dft-card-meta">
        {draft.updatedAt ? `Zuletzt gespeichert: ${dtDE(draft.updatedAt)}` : ""}
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
