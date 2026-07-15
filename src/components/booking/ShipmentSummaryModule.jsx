import React from "react";
import { Icon } from "../ui/Icon";

// Step 1 — „Sendungsdetails": kompakte, reine Read-only-Zusammenfassung von
// Absender/Empfänger/Paket. Die Adress-/Paket-Strings kommen aus dem Orchestrator
// (BookingPage); `packageInfo` ist optional und erscheint nur bei nicht-leerem
// Wert (kein erzwungener Platzhalter). KEIN Eingabefeld mehr — die frühere
// „Sendungsinhalt"-Eingabe war wirkungslos (der Wert wird backendseitig nur auf
// Länge geprüft, danach verworfen und im normalen Pfad nicht an JUMiNGO übergeben)
// und wurde entfernt. Der Inhalt für die Versicherung wird unverändert im
// Versicherungsmodul (insContent) erfasst; der /book-Payload bleibt unverändert.
export function ShipmentSummaryModule({ senderAddr, recipientAddr, packageInfo }) {
  const rows = [
    ["Absender",  senderAddr],
    ["Empfänger", recipientAddr],
    ...(packageInfo ? [["Paket", packageInfo]] : []),
  ];
  return (
    <div className="calc-panel shipment-summary-card mb-16">
      <div className="calc-panel-header"><Icon n="invoice" s={18} c="#1D4ED8" /><h3>Sendungsdetails</h3></div>
      <div className="calc-panel-body">
        {/* Trennlinien nur ZWISCHEN den Zeilen — die letzte Zeile bleibt randlos,
            damit nach dem Entfernen des Eingabefelds keine Rest-Trennlinie „ins
            Leere" läuft und keine ungenutzte Fläche darunter entsteht. */}
        {rows.map(([k, v], i) => (
          <div
            key={i}
            className={`summary-detail-row${i < rows.length - 1 ? " summary-detail-row-border" : ""}`}
          >
            <span className="text-sm text-muted summary-detail-key">{k}</span>
            <span className="text-sm font-bold summary-detail-val">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
