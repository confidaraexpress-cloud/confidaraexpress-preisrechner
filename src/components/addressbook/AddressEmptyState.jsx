import React from "react";
import { Icon } from "../ui/Icon";
import { TAB_SENDER } from "../../utils/addressBookView.mjs";

// Unterscheidet vier Leerzustände (siehe resolveEmptyStateKind): „noch keine
// Adressen" (mit CTA, tab-abhängiger Text) vs. „keine Suchtreffer" / „keine
// Favoriten" / „keine archivierten Adressen" (ohne CTA — das sind Filterzustände,
// keine echte Leere).
const COPY = {
  none: {
    [TAB_SENDER]: { title: "Sie haben noch keine eigenen Absenderadressen gespeichert.", cta: "Eigene Adresse anlegen" },
    recipient: { title: "Sie haben noch keine Empfängeradressen gespeichert.", cta: "Empfänger anlegen" },
  },
  "no-results": { title: "Keine passenden Adressen gefunden." },
  "no-favorites": { title: "Keine Favoriten in diesem Bereich." },
  "no-archived": { title: "Keine archivierten Adressen vorhanden." },
};

export function AddressEmptyState({ kind, tab, onCreate }) {
  if (!kind) return null;
  const entry = kind === "none" ? COPY.none[tab] : COPY[kind];
  if (!entry) return null;
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true"><Icon n="idcard" s={40} c="var(--gray300, #cbd5e1)" /></div>
      <div className="empty-title">{entry.title}</div>
      {entry.cta && (
        <>
          <p className="abk-empty-desc">Legen Sie eine Adresse an, um sie künftig schnell wiederzuverwenden.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>{entry.cta}</button>
        </>
      )}
    </div>
  );
}
