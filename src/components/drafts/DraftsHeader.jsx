import React from "react";
import { Icon } from "../ui/Icon";
import { PageHeader } from "../ui/PageHeader";

// Seitenkopf „Entwürfe" — seit Paket A, Phase 3 über das eine gemeinsame
// PageHeader-Muster (vorher .dft-header-top/-text/-cta mit eigener Titelstufe).
//
// KEINE Gesamtzahl-Kennzahl: GET /drafts liefert kein total, nur eine
// paginierte Teilmenge — eine Zahl aus items.length wäre irreführend.
export function DraftsHeader({ onNewShipment, utility }) {
  return (
    <PageHeader
      title="Entwürfe"
      subtitle="Gespeicherte Sendungen später weiterbearbeiten oder löschen."
      utility={utility}
      actions={(
        <button type="button" className="btn btn-primary" onClick={onNewShipment}>
          <Icon n="plus" s={16} /> Neue Sendung
        </button>
      )}
    />
  );
}
