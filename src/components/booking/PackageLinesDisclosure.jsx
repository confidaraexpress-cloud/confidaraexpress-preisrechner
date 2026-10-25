import React, { useId, useState } from "react";

// „Pakete anzeigen“ — die Zeilen unterschiedlicher Pakete unter der Paketsumme der Buchungsübersicht
// (Canonical v2.79, §15): zugeklappt nur die Textaktion, aufgeklappt je Paketart eine Zeile wie
// „1 × 15 kg · 20 × 20 × 20 cm“. Die Liste steht immer im DOM (`hidden`), damit `aria-controls` auf
// ein vorhandenes Element zeigt. Bei gleichen Paketen (eine Paketart) erscheint nichts.
export function PackageLinesDisclosure({ lines, className = "" }) {
  const [offen, setOffen] = useState(false);
  const id = useId();
  if (!Array.isArray(lines) || lines.length < 2) return null;
  return (
    <div className={`pkg-disclosure ${className}`.trim()}>
      <button type="button" className="btn btn-ghost btn-sm pkg-disclosure-toggle" aria-expanded={offen}
        aria-controls={id} onClick={() => setOffen((o) => !o)}>
        {offen ? "Pakete ausblenden" : "Pakete anzeigen"}
      </button>
      <ul className="pkg-disclosure-lines" id={id} hidden={!offen}>
        {lines.map((text, i) => <li key={i}>{text}</li>)}
      </ul>
    </div>
  );
}

export default PackageLinesDisclosure;
