import React from "react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid var(--border, #e5e7eb)",
      padding: "20px 16px",
      textAlign: "center",
      fontSize: 13,
      color: "var(--text-muted, #6b7280)",
    }}>
      <nav style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px 20px" }}>
        <Link to="/impressum"   style={{ color: "inherit", textDecoration: "none" }}>Impressum</Link>
        <Link to="/datenschutz" style={{ color: "inherit", textDecoration: "none" }}>Datenschutz</Link>
        <Link to="/agb"         style={{ color: "inherit", textDecoration: "none" }}>AGB</Link>
        <Link to="/widerruf"    style={{ color: "inherit", textDecoration: "none" }}>Widerruf</Link>
      </nav>
    </footer>
  );
}
