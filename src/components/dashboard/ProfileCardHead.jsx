import React from "react";
import { Icon } from "../ui/Icon";

// Gemeinsamer Kartenkopf der Profilkarten — Icon, Titel, optionaler Untertitel,
// optionale Kopfaktion. EINE Fassung für Profile.jsx und die ausgelagerten
// Einstellungskarten (Lieferschein, Abrechnung, Firmenlogo); das Markup ist
// unverändert gegenüber der früheren Inline-Definition in Profile.jsx.
export const cardHead = (icon, title, subtitle, action) => (
  <div className="table-card-header profile-card-head">
    <div className="profile-card-icon"><Icon n={icon} s={21} /></div>
    <div className="profile-card-heading">
      <span className="table-card-title">{title}</span>
      {subtitle && <span className="profile-card-sub">{subtitle}</span>}
    </div>
    {action}
  </div>
);
