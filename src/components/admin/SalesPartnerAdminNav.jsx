import React from "react";
import { NavLink } from "react-router-dom";
import { preliveEnabled } from "../../utils/salesPartnerPrelive.mjs";

/* ── Teilnavigation des Partnerprogramms (UX-Paket 2) ─────────────────────────
   Eine Linkleiste unter dem Seitenkopf aller Bereichsseiten des Programms statt
   gleichrangiger Kopfbuttons. Reine Navigation: kein zweiter Seitenkopf, kein
   <h1>, keine eigene Datenabfrage. Die Ids der Einträge bleiben die der
   früheren Kopfbuttons.

   „Pre-Live-Test" erscheint ausschließlich, wenn der Server den Testmodus
   meldet (`enabled: true`); den Stand reicht die Seite aus ihrem
   usePreliveStatus() herein — fail-closed: ohne Stand kein Eintrag. */
const EINTRAEGE = Object.freeze([
  Object.freeze({ to: "/admin/partners", label: "Partner", id: "adm-sp-list-link", end: true }),
  Object.freeze({ to: "/admin/partners/dispatch-evidence", label: "Versandnachweise", id: "adm-sp-evidence-link" }),
  Object.freeze({ to: "/admin/partners/credit-notes", label: "Gutschriften", id: "adm-sp-credit-notes-link" }),
  Object.freeze({ to: "/admin/partners/settings", label: "Einstellungen", id: "adm-sp-settings-link" }),
]);
const PRELIVE = Object.freeze({ to: "/admin/partners/prelive", label: "Pre-Live-Test", id: "adm-sp-prelive-link" });

export function SalesPartnerAdminNav({ prelive }) {
  const eintraege = preliveEnabled(prelive && prelive.status) ? [...EINTRAEGE, PRELIVE] : EINTRAEGE;
  return (
    <nav className="adm-subnav" aria-label="Bereiche des Partnerprogramms">
      {eintraege.map((e) => (
        <NavLink
          key={e.to}
          to={e.to}
          end={e.end}
          id={e.id}
          className={({ isActive }) => `adm-subnav-link${isActive ? " adm-subnav-link-on" : ""}`}
        >
          {e.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default SalesPartnerAdminNav;
