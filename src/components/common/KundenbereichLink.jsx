import React from "react";
import { Link } from "react-router-dom";
import { kundenportalZiel } from "../../utils/appHost.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";

/* Verweis auf eine Seite des Kundenbereichs (Impressum, Datenschutz, Partnerregistrierung) — Admin-/Partner-Apps, FE-2.
   Im Kundenbereich unverändert ein Router-Link. In der Admin- oder Partner-App gibt es diese Seiten nicht: dort zeigt der
   Verweis absolut auf confidaraexpress.de und öffnet einen eigenen Tab — der Kundenbereich hat eine eigene Anmeldung und
   gehört in den Browser, nicht in das App-Fenster. Nur feste, eigene Pfade (kundenportalZiel wirft sonst). */
export function KundenbereichLink({ to, children, target, rel, ...rest }) {
  const ziel = kundenportalZiel(to);
  if (ziel === to) return <Link to={to} target={target} rel={rel} {...rest}>{children}</Link>;
  return <a href={ziel} target={target || EXTERNAL_LINK_TARGET} rel={rel || EXTERNAL_LINK_REL} {...rest}>{children}</a>;
}
