import React from "react";
import { dtDE } from "../../utils/formatters";
import { fmtDE } from "../../utils/date";
import { formatRecipientDisplay, formatRoute, formatPackageSummary, shippingDateValue } from "../../utils/draftsView.mjs";
import { DraftActionsMenu } from "./DraftActionsMenu";

// Desktop-Zeile — bewusst KEINE Spalten für Carrier/Tarif/Preis/Tracking/Label:
// diese Daten sind auf dem Draft nicht autoritativ vorhanden.
//
// „Fortsetzen" führt zurück nach „Neue Sendung", NICHT in die Buchung: die
// gespeicherten Preise und Tarife sind zum Zeitpunkt des Fortsetzens nicht mehr
// zugesichert. Dieselbe Aktion, dasselbe Aussehen und dieselbe Sperrlogik wie beim
// Formularentwurf (FormDraftDesktopRow) — der Kunde soll zwei Entwurfsarten nicht
// an zwei verschiedenen Bedienmustern auseinanderhalten müssen.
export function DraftDesktopRow({ draft, busy, resuming, onDelete, onResume }) {
  const pkg = formatPackageSummary(draft);
  const shipDate = shippingDateValue(draft);
  const anyBusy = busy || resuming;
  return (
    <tr>
      <td className="dft-cell-recipient">
        <span className="dft-cell-recipient-name">{formatRecipientDisplay(draft)}</span>
        <span className="dft-cell-updated">{draft.updatedAt ? `Zuletzt gespeichert: ${dtDE(draft.updatedAt)}` : "—"}</span>
      </td>
      <td className="dft-cell-route">{formatRoute(draft)}</td>
      <td>
        <div className="dft-cell-package">
          <span className="dft-cell-package-count">{pkg.countLine || "—"}</span>
          {pkg.dimsLine && <span>{pkg.dimsLine}</span>}
        </div>
      </td>
      <td className="dft-cell-date">{shipDate ? fmtDE(shipDate) : "Noch nicht festgelegt"}</td>
      <td>
        <div className="dft-cell-actions">
          <button type="button" className="btn btn-outline btn-sm dft-resume-btn" onClick={() => onResume(draft)} disabled={anyBusy}>
            {resuming && <span className="spinner spinner-dark spinner-sm" />} Fortsetzen
          </button>
          <DraftActionsMenu draft={draft} busy={busy} disabled={resuming} onDelete={onDelete} />
        </div>
      </td>
    </tr>
  );
}
