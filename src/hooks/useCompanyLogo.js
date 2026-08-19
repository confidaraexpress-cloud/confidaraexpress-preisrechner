import { useEffect, useState } from "react";
import { getCompanyLogoUrl } from "../api/companyLogoApi";
import { companyLogoMeta } from "../utils/companyLogoView.mjs";

/* ── useCompanyLogo(user) ────────────────────────────────────────────────────
   Liefert die anzeigbare Object-URL des Firmenlogos — oder null.

   null bedeutet an JEDER Stelle dasselbe: „zeig die Initiale". Es gibt bewusst
   keinen Ladezustand nach außen. Ein kurzer Platzhalter zwischen Initiale und
   Logo wäre ein zusätzliches Flackern in einer 40-px-Fläche; die Initiale ist
   der richtige Anfangszustand und bleibt stehen, bis das Bild da ist.

   Der Abruf hängt AUSSCHLIESSLICH an der Version (gekürzter Inhaltshash aus der
   Profilantwort). Ändert sich das Logo, ändert sich die Version, und der
   Zwischenspeicher des Service greift nicht mehr — genau das ist der
   Cache-Busting-Mechanismus. Ohne Version (Konto ohne Logo ODER Backend ohne
   dieses Feld) wird gar nicht erst abgerufen.

   `alive` verhindert ein setState nach dem Unmount: der Chip wird bei jedem
   Bereichswechsel neu montiert. */
export function useCompanyLogo(user) {
  const version = companyLogoMeta(user)?.version || null;
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!version) { setUrl(null); return undefined; }
    let alive = true;
    getCompanyLogoUrl(version).then((u) => { if (alive) setUrl(u || null); });
    return () => { alive = false; };
  }, [version]);

  return url;
}
