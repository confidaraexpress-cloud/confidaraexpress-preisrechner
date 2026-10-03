import React from "react";
import { PageHeader } from "../ui/PageHeader";

// Seitenkopf „Entwürfe" — seit Paket A, Phase 3 über das eine gemeinsame
// PageHeader-Muster (vorher .dft-header-top/-text/-cta mit eigener Titelstufe).
//
// KEINE Gesamtzahl-Kennzahl: GET /drafts liefert kein total, nur eine
// paginierte Teilmenge — eine Zahl aus items.length wäre irreführend.
//
// `showCreate` (Redesign 2026-10): ist die Liste nachweislich leer, trägt der
// Leerzustand die eine Hauptaktion — der Kopf wiederholt „Neue Sendung" dann
// nicht (Auditbefund E06: doppelte Hauptaktion). Derselbe Handler.
export function DraftsHeader({ onNewShipment, utility, showCreate = true }) {
  return (
    <PageHeader
      title="Entwürfe"
      subtitle="Gespeicherte Sendungen später weiterbearbeiten oder löschen."
      utility={utility}
      actions={showCreate ? (
        <button type="button" className="btn btn-primary" onClick={onNewShipment}>
          Neue Sendung
        </button>
      ) : null}
    />
  );
}
