import React from "react";
import { PackageLinesDisclosure } from "./PackageLinesDisclosure";

// Step 1 — „Sendungsdetails": kompakte, reine Read-only-Zusammenfassung von
// Absender/Empfänger/Paket. Die Adress-/Paket-Strings kommen aus dem Orchestrator
// (BookingPage); `packageInfo` ist optional und erscheint nur bei nicht-leerem
// Wert (kein erzwungener Platzhalter). KEIN Eingabefeld mehr — die frühere
// „Sendungsinhalt"-Eingabe war wirkungslos (der Wert wird backendseitig nur auf
// Länge geprüft, danach verworfen und im normalen Pfad nicht an JUMiNGO übergeben)
// und wurde entfernt. Der Inhalt für die Versicherung wird unverändert im
// Versicherungsmodul (insContent) erfasst; der /book-Payload bleibt unverändert.
//
// Unterschiedliche Pakete (Canonical v2.79): `packageLines` trägt die Zeilentexte — unter der Summe
// („3 Pakete · 31 kg gesamt“) steht dann „Pakete anzeigen“.
export function ShipmentSummaryModule({ senderAddr, recipientAddr, packageInfo, packageLines = null }) {
  const paketZeilen = Array.isArray(packageLines) && packageLines.length > 1 ? packageLines : null;
  const rows = [
    ["Absender",  senderAddr],
    ["Empfänger", recipientAddr],
    ...(packageInfo ? [["Paket", packageInfo, paketZeilen ? <PackageLinesDisclosure lines={paketZeilen} /> : null]] : []),
  ];
  return (
    <div className="calc-panel shipment-summary-card mb-16">
      <div className="calc-panel-header"><h3>Sendungsdetails</h3></div>
      <div className="calc-panel-body">
        {/* Trennlinien nur ZWISCHEN den Zeilen — die letzte Zeile bleibt randlos,
            damit nach dem Entfernen des Eingabefelds keine Rest-Trennlinie „ins
            Leere" läuft und keine ungenutzte Fläche darunter entsteht. */}
        {rows.map(([k, v, zusatz], i) => (
          <div
            key={i}
            className={`summary-detail-row${zusatz ? " summary-detail-row--extra" : ""}${i < rows.length - 1 ? " summary-detail-row-border" : ""}`}
          >
            <span className="text-sm text-muted summary-detail-key">{k}</span>
            <span className="text-sm font-bold summary-detail-val">{v}</span>
            {zusatz}
          </div>
        ))}
      </div>
    </div>
  );
}
