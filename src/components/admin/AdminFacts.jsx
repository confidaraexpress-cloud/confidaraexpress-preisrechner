import React from "react";

/* ── „Auf einen Blick“ (Admin-Vereinfachung 2026-11-10) ───────────────────────
   Die wichtigsten Werte einer Detailseite in einer Zeile direkt unter dem
   Seitenkopf: Beschriftung, Wert und höchstens eine kurze Zusatzzeile. Reine
   Darstellung — jeder Wert kommt fertig aus der Seite (Serverwerte, nie im
   Browser gerechnet). Ein Eintrag ohne Wert (`null`/`undefined`) entfällt.
   `tone`: "warning" | "danger" | "success" färbt nur den Wert, die Bedeutung
   steht immer auch im Text. */
export function AdminFacts({ items, label = "Auf einen Blick", id }) {
  const sichtbar = (items || []).filter((it) => it && it.value !== null && it.value !== undefined && it.value !== "");
  if (sichtbar.length === 0) return null;
  return (
    <dl className="adm-facts" aria-label={label} id={id}>
      {sichtbar.map((it) => (
        <div key={it.label} className={`adm-fact${it.tone ? ` adm-fact--${it.tone}` : ""}`} id={it.id}>
          <dt>{it.label}</dt>
          <dd>
            <span className="adm-fact-value">{it.value}</span>
            {it.hint && <span className="adm-fact-hint">{it.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default AdminFacts;
