import React from "react";

const SECTION_STYLE = { marginBottom: 28 };
const H2_STYLE      = { fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text, #111)" };
const P_STYLE       = { lineHeight: 1.75, margin: 0, color: "var(--legal-text)" };

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
                Weiherstraße 25<br />
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
              <p style={P_STYLE}>Eine Umsatzsteuer-Identifikationsnummer ist nicht vorhanden.</p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Handelsregister</h2>
              <p style={P_STYLE}>Die Gesellschaft ist nicht im Handelsregister eingetragen.</p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
              <p style={P_STYLE}>
                Miguel Vance<br />
                Patrick Werner<br />
                Weiherstraße 25<br />
                73207 Plochingen<br />
                Deutschland
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Datenquellen und Lizenzhinweise</h2>
              <p style={P_STYLE}>
                Für die Prüfung und Vervollständigung von Postleitzahlen, Orten und Straßennamen in
                Deutschland, Österreich, der Schweiz und Liechtenstein nutzen wir das offene
                Verzeichnis der <strong>OpenPLZ API</strong> (openplzapi.org).
              </p>
              <p style={P_STYLE}>
                Die dort bereitgestellten Daten stehen unter der{" "}
                <strong>Open Data Commons Open Database License (ODbL) v1.0</strong>. Der Lizenztext
                ist unter{" "}
                <a
                  href="https://opendatacommons.org/licenses/odbl/1-0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ce-color-brand-ink)" }}
                >
                  opendatacommons.org/licenses/odbl/1-0/
                </a>{" "}
                abrufbar. Die ODbL verlangt diese Namensnennung; sie erfolgt hier für die genannte
                Datenquelle.
              </p>
            </div>

            <div style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
              <p style={P_STYLE}>
                Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
