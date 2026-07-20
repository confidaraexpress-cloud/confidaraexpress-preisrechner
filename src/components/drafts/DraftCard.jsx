import React from "react";
import { Icon } from "../ui/Icon";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatRecipientDisplay, formatRoute, formatPackageSummary, shippingDateValue } from "../../utils/draftsView.mjs";

// Mobil-Karte — Route + Empfänger prominent, Paketdaten sekundär, Löschen als
// vollwertiger, gut tappbarer Button mit Textlabel (kein Icon-only-Versehen).
export function DraftCard({ draft, busy, onDelete }) {
  const pkg = formatPackageSummary(draft);
  const shipDate = shippingDateValue(draft);
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
        <button type="button" className="btn btn-outline dft-delete-btn" onClick={() => onDelete(draft)} disabled={busy}>
          {busy ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : <Icon n="trash" s={15} />} Löschen
        </button>
      </div>
    </li>
  );
}
