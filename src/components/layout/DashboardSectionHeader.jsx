import React from "react";
import { PageHeader } from "../ui/PageHeader";

/* ── Kompatibilitätsschicht (Paket A, Phase 3) ───────────────────────────────
   Der Seitenkopf der Dashboard-Unterseiten läuft seit Phase 3 über das eine
   gemeinsame PageHeader-Muster. Dieser Name bleibt als Aufrufweg bestehen,
   damit kein Aufrufer angefasst werden musste — er reicht nur durch und nimmt
   zusätzlich Utility-Cluster, Seitenaktionen und eine Metazeile entgegen. */
export function DashboardSectionHeader({ title, subtitle, utility, actions, meta, eyebrow }) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      meta={meta}
      utility={utility}
      actions={actions}
    />
  );
}
