import React from "react";

/* Datenzeilen der Kontoflächen im Muster der Kontoeinstellungen (.profile-row):
   links die Bezeichnung, rechts der Wert; ein fehlender Wert ist gedämpft.
   Mit `idPrefix` trägt jede Zeile eine stabile Kennung (`${idPrefix}-${key}`). */
export function PartnerRows({ items, idPrefix }) {
  return items.map((it, i) => (
    <div
      key={it.key}
      id={idPrefix ? `${idPrefix}-${it.key}` : undefined}
      className={`profile-row${i < items.length - 1 ? " profile-row-border" : ""}`}
    >
      <span className="profile-row-key">{it.k}</span>
      <span className={`profile-row-val${it.empty ? " profile-row-empty" : ""}`}>{it.v}</span>
    </div>
  ));
}

export default PartnerRows;
