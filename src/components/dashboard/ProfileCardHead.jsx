import React from "react";

// Gemeinsamer Abschnitt der Kontoeinstellungen.
//
// Premium UX 4.0 (Betreiberentscheidung A5, 2026-11-22): Jeder Abschnitt ist EINE Karte mit integriertem Kopf —
// Titel und Erklärung oben in der Karte, die optionale Aktion („Bearbeiten“) rechts daneben, darunter die Daten bzw.
// Bedienelemente. Vorher standen Titel und Erklärung in einer eigenen linken Spalte neben der Inhaltsfläche: Der
// Inhalt begann weit rechts, links blieb eine leere Spalte, und Überschrift und Daten fielen optisch auseinander.
// Die Kartengrenze ist zugleich die Reichweite der Aktion: „Bearbeiten“ ändert genau die Daten dieser Karte.
// Keine Symbole.
//
// EINE Fassung für Profile.jsx, die ausgelagerten Einstellungsabschnitte (Lieferschein, Abrechnung, Firmenlogo) und
// die Kontoseite des Partnerbereichs. Der Titel bleibt direktes Kind von .profile-card-head (E2E-Vertrag
// salesPartnerPortal); die Aktion steht im DOM nach Titel und Erklärung, also auch in der Tab-Reihenfolge danach.
//
// Sprungziel (Profilmenü, 2026-11-08): Mit `id`, `abschnittRef` und `titelRef`
// kann ein Abschnitt angesprungen werden — der Titel nimmt dann den Fokus
// programmatisch an (tabIndex -1), ohne in die Tab-Reihenfolge zu kommen.
export function SettingsSection({ title, subtitle, action, children, className = "", id, abschnittRef, titelRef }) {
  return (
    <section id={id} ref={abschnittRef} className={`table-card profile-card${className ? ` ${className}` : ""}`}>
      <div className="table-card-header profile-card-head">
        <h2 className="table-card-title" ref={titelRef} tabIndex={titelRef ? -1 : undefined}>{title}</h2>
        {subtitle && <p className="profile-card-sub">{subtitle}</p>}
        {action && <div className="profile-card-toolbar">{action}</div>}
      </div>
      <div className="profile-card-body">
        {children}
      </div>
    </section>
  );
}
