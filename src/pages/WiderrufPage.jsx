import React from "react";
import { Link } from "react-router-dom";

const SECTION_STYLE = { marginBottom: 28 };
const H2_STYLE      = { fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text, #111)" };
const P_STYLE       = { lineHeight: 1.75, margin: 0, color: "var(--text-muted, #374151)" };

export default function WiderrufPage() {
  return (
    <div className="page-with-navbar">
      <div className="container" style={{ maxWidth: 720, padding: "40px 16px 80px" }}>
        <h1 className="heading mb-24">Widerrufsbelehrung</h1>
        <div className="calc-panel">
          <div className="calc-panel-body" style={{ lineHeight: 1.75 }}>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Kein gesetzliches Widerrufsrecht für Unternehmer</h2>
              <p style={P_STYLE}>
                Confidara Express richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB.
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Keine Nutzung durch Verbraucher</h2>
              <p style={P_STYLE}>
                Eine Nutzung der Plattform durch Verbraucher im Sinne des § 13 BGB ist nicht vorgesehen
                und nicht gestattet.
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Kein Widerrufsrecht nach Fernabsatzrecht</h2>
              <p style={P_STYLE}>
                Da sämtliche Verträge über die Plattform ausschließlich im unternehmerischen
                Geschäftsverkehr geschlossen werden, besteht kein gesetzliches Widerrufsrecht nach
                den Vorschriften über Verbraucherverträge und Fernabsatzverträge.
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Stornierung von Sendungen</h2>
              <p style={P_STYLE}>
                Die Stornierung einer bereits gebuchten Sendung richtet sich ausschließlich nach
                den{" "}
                <Link to="/agb" style={{ color: "var(--blue, #1D4ED8)" }}>
                  Allgemeinen Geschäftsbedingungen
                </Link>{" "}
                von Confidara Express.
              </p>
            </div>

            <div style={{ ...SECTION_STYLE, marginBottom: 0, paddingTop: 20, borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <p style={{ ...P_STYLE, fontSize: 13, color: "var(--text-muted, #6b7280)" }}>
                Stand: Mai 2026
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
