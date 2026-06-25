import React from "react";
import { Link } from "react-router-dom";

/**
 * Small, theme-neutral legal-link row used on the logged-in dashboard
 * sub-pages and the logged-in calculator, so Impressum, Datenschutz, AGB
 * and Widerruf stay reachable from every authenticated view.
 *
 * Links open in a new tab to preserve the current page state (e.g. the
 * calculator form). This is intentionally NOT the Footer component.
 */
export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="Rechtliche Informationen">
      <Link to="/impressum"   target="_blank" rel="noopener noreferrer">Impressum</Link>
      <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</Link>
      <Link to="/agb"         target="_blank" rel="noopener noreferrer">AGB</Link>
      <Link to="/widerruf"    target="_blank" rel="noopener noreferrer">Widerruf</Link>
    </nav>
  );
}
