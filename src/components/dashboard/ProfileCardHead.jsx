import React from "react";

// Gemeinsamer Abschnitt der Kontoeinstellungen (Redesign 2026-10).
//
// Vorher trug jede Einstellungskarte einen eigenen Kopf mit Iconkachel und
// stand als gleich gewichtete Karte im Zweispaltenraster. Jetzt folgt die Seite
// dem ruhigen Settings-Muster: links Titel und Erklärung, rechts die Daten bzw.
// Bedienelemente in EINER Inhaltsfläche; auf schmalen Breiten untereinander.
// Abschnitte trennt eine Linie, nicht eine weitere Karte. Keine Symbole.
//
// EINE Fassung für Profile.jsx und die ausgelagerten Einstellungsabschnitte
// (Lieferschein, Abrechnung, Firmenlogo). Die optionale Aktion („Bearbeiten")
// steht als Textaktion oben rechts in der Inhaltsfläche — nah an den Daten,
// die sie verändert.
export function SettingsSection({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`table-card profile-card${className ? ` ${className}` : ""}`}>
      <div className="table-card-header profile-card-head">
        <h2 className="table-card-title">{title}</h2>
        {subtitle && <p className="profile-card-sub">{subtitle}</p>}
      </div>
      <div className="profile-card-body">
        {action && <div className="profile-card-toolbar">{action}</div>}
        {children}
      </div>
    </section>
  );
}
