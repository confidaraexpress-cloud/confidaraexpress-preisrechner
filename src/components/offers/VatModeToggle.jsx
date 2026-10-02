import React from "react";
import { isGrossVatMode, VAT_MODE_GROSS, VAT_MODE_NET, VAT_TEXT } from "../../utils/vatDisplayView.mjs";

// Der Netto/Brutto-Umschalter — EINE Komponente für Angebotsliste und Buchungsseite.
//
// REINE DARSTELLUNGSWAHL: sie meldet nur den gewählten Modus an den Aufrufer. Sie löst
// keinen Request aus, ändert kein Angebot, keine Bindung und keinen Betrag (Betreiber-
// entscheidung 2026-10-02, utils/vatDisplayView.mjs).
//
// Die Segmentbeschriftungen bleiben WÖRTLICH wie auf den Angebotskarten („exkl. MwSt." /
// „inkl. MwSt."): der Schalter sagt damit exakt, was danach am Preis steht. Die
// Gruppenbeschriftung („Preisanzeige") setzt der Aufrufer und verweist über `labelledBy`.
export function VatModeToggle({ vatMode, onChange, labelledBy }) {
  const brutto = isGrossVatMode(vatMode);
  return (
    <div
      className="offers-vat-toggle offers-segment offers-segment--secondary"
      role="group"
      aria-labelledby={labelledBy}
    >
      <button
        className={`offers-sort-btn offers-segment-item${!brutto ? " active" : ""}`}
        onClick={() => onChange(VAT_MODE_NET)}
        type="button"
        aria-pressed={!brutto}
      >
        {VAT_TEXT.exclVat}
      </button>
      <button
        className={`offers-sort-btn offers-segment-item${brutto ? " active" : ""}`}
        onClick={() => onChange(VAT_MODE_GROSS)}
        type="button"
        aria-pressed={brutto}
      >
        {VAT_TEXT.inclVat}
      </button>
    </div>
  );
}
