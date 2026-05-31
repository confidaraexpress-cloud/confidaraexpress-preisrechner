import React from "react";

const SECTION_STYLE = { marginBottom: 28 };
const H2_STYLE      = { fontSize: 15, fontWeight: 700, marginBottom: 8, color: "var(--text, #111)" };
const P_STYLE       = { lineHeight: 1.75, margin: 0, color: "var(--text-muted, #374151)" };

export default function ImpressumPage() {
  return (
    <div className="page-with-navbar">
      <div className="container" style={{ maxWidth: 720, padding: "40px 16px 80px" }}>
        <h1 className="heading mb-24">Impressum</h1>
        <div className="calc-panel">
          <div className="calc-panel-body" style={{ lineHeight: 1.75 }}>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Angaben gemäß § 5 DDG</h2>
              <p style={P_STYLE}>
                Confidara Express GbR<br />
                Musterstraße 1<br />
                73207 Plochingen<br />
                Deutschland
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Vertreten durch die Gesellschafter</h2>
              <p style={P_STYLE}>
                Miguel Vance<br />
                Patrick Werner
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Kontakt</h2>
              <p style={P_STYLE}>
                Telefon: 015118003775<br />
                E-Mail:{" "}
                <a href="mailto:support@confidaraexpress.de" style={{ color: "inherit" }}>
                  support@confidaraexpress.de
                </a>
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Umsatzsteuer-Identifikationsnummer</h2>
              <p style={P_STYLE}>Wird nachgetragen, sofern vorhanden.</p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Handelsregister</h2>
              <p style={P_STYLE}>Wird nachgetragen, sofern vorhanden.</p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
              <p style={P_STYLE}>
                Miguel Vance<br />
                Patrick Werner<br />
                Musterstraße 1<br />
                73207 Plochingen<br />
                Deutschland
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
              <p style={P_STYLE}>
                Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>

            <div style={{ ...SECTION_STYLE, marginBottom: 0, paddingTop: 20, borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <p style={{ ...P_STYLE, fontSize: 13, color: "var(--text-muted, #6b7280)" }}>
                <strong>Hinweis:</strong> Dieses Impressum enthält aktuell noch eine Platzhalteranschrift.
                Die Angabe „Musterstraße 1" muss vor dem produktiven Go-Live durch die tatsächliche
                Geschäftsanschrift ersetzt werden.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
