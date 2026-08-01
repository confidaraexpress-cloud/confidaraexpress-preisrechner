import React from "react";
import { Link } from "react-router-dom";

/**
 * Zentraler Footer des eingeloggten Kundenbereichs — links das Copyright,
 * rechts die Rechtlinks. Wird von DashboardPage (alle Unterseiten inklusive
 * Übersicht) und DashboardLayout (Preisrechner) gerendert; es gibt genau
 * diesen einen Footer in der App-Shell.
 *
 * Die Linkziele sind unverändert die bereits bestehenden Routen aus App.jsx
 * (/impressum, /datenschutz, /agb, /widerruf) — keine neuen Seiten, keine
 * neuen Rechtstexte. Links öffnen in einem neuen Tab, damit der Seitenzustand
 * (z. B. das Preisrechner-Formular) erhalten bleibt.
 *
 * Bewusst NICHT die Footer-Komponente: die gehört zum öffentlichen
 * NavbarLayout und bleibt davon unberührt.
 */
export function LegalLinks() {
  return (
    <footer className="app-footer">
      <p className="app-footer-copy">© 2026 ConfidaraExpress</p>
      <nav className="app-footer-legal" aria-label="Rechtliche Informationen">
        <Link to="/impressum"   target="_blank" rel="noopener noreferrer">Impressum</Link>
        <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</Link>
        <Link to="/agb"         target="_blank" rel="noopener noreferrer">AGB</Link>
        <Link to="/widerruf"    target="_blank" rel="noopener noreferrer">Widerruf</Link>
      </nav>
    </footer>
  );
}
