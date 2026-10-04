import React from "react";
import { PageHeader } from "../ui/PageHeader";

/* ── Kompatibilitätsschicht (Paket A, Phase 3) ───────────────────────────────
   Der Seitenkopf der Dashboard-Unterseiten läuft über das eine gemeinsame
   PageHeader-Muster. Dieser Name bleibt als Aufrufweg bestehen, damit kein
   Aufrufer angefasst werden musste — er reicht nur durch und nimmt zusätzlich
   Utility-Cluster, Seitenaktionen und eine Metazeile entgegen. Eine übergebene
   `eyebrow` wird seit dem Redesign (2026-10) nicht mehr dargestellt.
   `className` reicht einen Kopf-Modifier durch (etwa die Achse der zentrierten
   Buchungsspalte, `.ce-page-header--booking`). */
export function DashboardSectionHeader({ title, subtitle, utility, actions, meta, className }) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      meta={meta}
      utility={utility}
      actions={actions}
      className={className}
    />
  );
}
