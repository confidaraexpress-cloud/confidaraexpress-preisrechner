import React from "react";
import { Link } from "react-router-dom";

/* Der Footer des ÖFFENTLICHEN Bereichs (NavbarLayout). Er trug seine Gestaltung
   inline und las dabei `--text-muted` — eine Variable, die es nie gab; gerendert
   wurde also der Fallback #6b7280. Fläche, Kante und Textfarbe kommen jetzt aus
   den Foundation-Rollen.

   Der Footer des eingeloggten Bereichs ist etwas anderes: LegalLinks.jsx
   rendert `.app-footer` innerhalb der App-Shell. */
export function Footer() {
  return (
    <footer className="public-footer">
      <nav className="public-footer-nav" aria-label="Rechtliche Hinweise">
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
        <Link to="/agb">AGB</Link>
        <Link to="/widerruf">Widerruf</Link>
      </nav>
    </footer>
  );
}
