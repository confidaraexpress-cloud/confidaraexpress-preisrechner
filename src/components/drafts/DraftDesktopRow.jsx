import React from "react";
import { Icon } from "../ui/Icon";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatRecipientDisplay, formatRoute, formatPackageSummary, shippingDateValue } from "../../utils/draftsView.mjs";

// Desktop-Zeile — bewusst KEINE Spalten für Carrier/Tarif/Preis/Tracking/Label:
// diese Daten sind auf dem Draft nicht autoritativ vorhanden.
export function DraftDesktopRow({ draft, busy, onDelete }) {
  const pkg = formatPackageSummary(draft);
  const shipDate = shippingDateValue(draft);
  return (
    <tr>
      <td className="dft-cell-recipient">{formatRecipientDisplay(draft)}</td>
      <td className="dft-cell-route">{formatRoute(draft)}</td>
      <td>
        <div className="dft-cell-package">
          <span className="dft-cell-package-count">{pkg.countLine || "—"}</span>
          {pkg.dimsLine && <span>{pkg.dimsLine}</span>}
        </div>
      </td>
      <td className="dft-cell-date">{shipDate ? fmtDE(shipDate) : "Noch nicht festgelegt"}</td>
      <td className="dft-cell-updated">{draft.updatedAt ? dtDE(draft.updatedAt) : "—"}</td>
      <td>
        <div className="dft-cell-actions">
          <button type="button" className="btn btn-outline btn-sm dft-delete-btn" onClick={() => onDelete(draft)} disabled={busy}>
            {busy ? <span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> : <Icon n="trash" s={14} />} Löschen
          </button>
        </div>
      </td>
    </tr>
  );
}
