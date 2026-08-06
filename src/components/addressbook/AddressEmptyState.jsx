import React from "react";
import { EmptyState, NoResultsState } from "../ui/StateView";
import { TAB_SENDER } from "../../utils/addressBookView.mjs";

// Unterscheidet drei Leerzustände (siehe resolveEmptyStateKind): „noch keine
// Adressen" (mit CTA, tab-abhängiger Text) vs. „keine Suchtreffer" / „keine
// Favoriten" (ohne CTA — das sind Filterzustände, keine echte Leere).
const COPY = {
  none: {
    [TAB_SENDER]: { title: "Sie haben noch keine eigenen Absenderadressen gespeichert.", cta: "Eigene Adresse anlegen" },
    recipient: { title: "Sie haben noch keine Empfängeradressen gespeichert.", cta: "Empfänger anlegen" },
  },
  "no-results": { title: "Keine passenden Adressen gefunden." },
  "no-favorites": { title: "Keine Favoriten in diesem Bereich." },
};

export function AddressEmptyState({ kind, tab, onCreate }) {
  if (!kind) return null;
  if (kind === "none") {
    const entry = COPY.none[tab];
    if (!entry) return null;
    return (
      <EmptyState
        icon="idcard"
        title={entry.title}
        text="Legen Sie eine Adresse an, um sie künftig schnell wiederzuverwenden."
        action={<button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>{entry.cta}</button>}
      />
    );
  }
  const entry = COPY[kind];
  if (!entry) return null;
  return <NoResultsState title={entry.title} />;
}
