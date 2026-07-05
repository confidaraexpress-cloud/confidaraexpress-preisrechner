import React from "react";
import { Icon } from "../ui/Icon";

// Step 1 — „Sendungsdetails": Absender/Empfänger/Paket (read-only) + Sendungsinhalt.
// Reine Darstellung; die Adress-/Paket-Strings und der Inhalt-State bleiben im
// Orchestrator (BookingPage) und werden hereingereicht. `packageInfo` ist optional
// und wird nur angezeigt, wenn der Orchestrator einen nicht-leeren String liefert
// (kein erzwungener Platzhalter, falls Gewicht/Maße fehlen).
export function ShipmentSummaryModule({ senderAddr, recipientAddr, packageInfo, content, onContentChange }) {
  const rows = [
    ["Absender",  senderAddr],
    ["Empfänger", recipientAddr],
    ...(packageInfo ? [["Paket", packageInfo]] : []),
  ];
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Sendungsdetails</h3></div>
      <div className="calc-panel-body">
        {rows.map(([k, v], i) => (
          <div key={i} className="summary-detail-row summary-detail-row-border">
            <span className="text-sm text-muted summary-detail-key">{k}</span>
            <span className="text-sm font-bold summary-detail-val">{v}</span>
          </div>
        ))}
        <div className="field mt-12 booking-content-field">
          <label className="field-label">
            Sendungsinhalt <span className="field-optional">(optional)</span>
          </label>
          <input
            className="field-input"
            value={content}
            onChange={e => onContentChange(e.target.value)}
            placeholder="z.B. Elektronik, Dokumente …"
            maxLength={200}
          />
        </div>
      </div>
    </div>
  );
}
