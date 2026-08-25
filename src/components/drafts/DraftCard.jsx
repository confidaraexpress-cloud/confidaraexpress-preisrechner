import React from "react";
import { Icon } from "../ui/Icon";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatRecipientDisplay, formatRoute, formatPackageSummary, shippingDateValue } from "../../utils/draftsView.mjs";
import { DraftActionsMenu } from "./DraftActionsMenu";

// Mobil-Karte — Route + Empfänger prominent, Paketdaten sekundär, Löschen als
// vollwertiger, gut tappbarer Button mit Textlabel (kein Icon-only-Versehen).
// „Fortsetzen" steht wie beim Formularentwurf direkt sichtbar; das Löschen bleibt
// die sekundäre Aktion im Kebab-Menü.
export function DraftCard({ draft, busy, resuming, onDelete, onResume }) {
  const pkg = formatPackageSummary(draft);
  const shipDate = shippingDateValue(draft);
  const anyBusy = busy || resuming;
  return (
    <li className="dft-card">
      <div>
        <div className="dft-card-route">{formatRoute(draft)}</div>
        <div className="dft-card-recipient">{formatRecipientDisplay(draft)}</div>
      </div>
      <div className="dft-card-info">
        <div className="dft-card-info-row">
          <Icon n="package" s={13} />
          <span>{pkg.countLine || "—"}{pkg.dimsLine ? ` · ${pkg.dimsLine}` : ""}</span>
        </div>
        <div className="dft-card-info-row">
          <Icon n="calendar" s={13} />
          <span>{shipDate ? fmtDE(shipDate) : "Versanddatum noch nicht festgelegt"}</span>
        </div>
      </div>
      <div className="dft-card-meta">
        {draft.updatedAt ? `Zuletzt gespeichert: ${dtDE(draft.updatedAt)}` : ""}
      </div>
      <div className="dft-card-actions">
        <button type="button" className="btn btn-outline btn-sm dft-resume-btn" onClick={() => onResume(draft)} disabled={anyBusy}>
          {resuming ? <span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> : <Icon n="arrowRight" s={14} />} Fortsetzen
        </button>
        <DraftActionsMenu draft={draft} busy={busy} disabled={resuming} onDelete={onDelete} />
      </div>
    </li>
  );
}
