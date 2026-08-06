import React from "react";
import { Icon } from "../ui/Icon";

// Zusätzliche Optionen — REINE DARSTELLUNG. Bündelt die optionale Referenznummer
// (Wert/Sanitizing bleiben im Orchestrator: BookingPage.form.reference +
// updReference) und die Wahl des Labeldruckformats (A4/A6). Bewusst KEINE
// E-Mail-Optionen (White-Label-/Branding-Entscheid noch offen). Keine eigene
// Businesslogik: labelFormat ist reiner /book-Payload-Wert ohne Preis-/Reprice-
// Einfluss; Default A4 wird im Orchestrator gesetzt und hier sichtbar vorausgewählt.
const LABEL_FORMATS = [
  { id: "A4", name: "DIN A4", desc: "Standarddruck auf normalem Papier." },
  { id: "A6", name: "DIN A6", desc: "Kompaktes Etikettenformat (z. B. Labeldrucker)." },
];

export function AdditionalOptionsModule({ reference, onReferenceChange, labelFormat, onLabelFormatChange }) {
  return (
    <div className="calc-panel addopt-panel mb-16">
      <div className="calc-panel-header"><Icon n="settings" s={18} c="var(--ce-color-brand-ink)" /><h3>Zusätzliche Optionen</h3></div>
      <div className="calc-panel-body">
        {/* 1) Optionale Referenznummer — Funktion unverändert (max. 35, < > entfernt). */}
        <div className="field addopt-field">
          <label className="field-label" htmlFor="booking-reference">
            Referenznummer / Bestellnummer <span className="field-optional">(optional)</span>
          </label>
          <input
            id="booking-reference"
            className="field-input"
            value={reference}
            onChange={e => onReferenceChange(e.target.value)}
            placeholder="z. B. Bestellnummer, Kostenstelle …"
            maxLength={35}
          />
          <span className="field-hint">
            Optional – z. B. Bestellnummer, Kostenstelle oder interne Referenz. Max. 35 Zeichen.
          </span>
        </div>

        {/* 2) Labeldruckformat — nur A4/A6, Default A4. */}
        <div className="addopt-block">
          <span className="field-label addopt-group-label">Labelformat</span>
          <div className="labelfmt-group" role="radiogroup" aria-label="Labelformat wählen">
            {LABEL_FORMATS.map(f => {
              const selected = labelFormat === f.id;
              return (
                <label key={f.id} className={`labelfmt-card${selected ? " labelfmt-card--selected" : ""}`}>
                  <input
                    type="radio"
                    name="labelFormat"
                    value={f.id}
                    checked={selected}
                    onChange={() => onLabelFormatChange(f.id)}
                  />
                  <span className="labelfmt-radio" aria-hidden="true" />
                  <span className="labelfmt-main">
                    <span className="labelfmt-name">{f.name}</span>
                    <span className="labelfmt-desc">{f.desc}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <span className="field-hint">Bestimmt das Druckformat Ihres Versandlabels.</span>
        </div>
      </div>
    </div>
  );
}
