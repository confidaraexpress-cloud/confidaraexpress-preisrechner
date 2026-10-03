import React from "react";

/* Rechtsseite im gemeinsamen Leselayout (Redesign 2026-10): Titel und Stand
   auf dem Canvas, der Text auf EINER ruhigen weißen Fläche (layout.css,
   .legal-*). Der Rechtstext selbst ist wortgleich; Anker unverändert. */

export default function ImpressumPage() {
  return (
    <div className="page-with-navbar">
      <div className="legal-wrap">
        <header className="legal-head">
          <h1 className="legal-title">Impressum</h1>
        </header>
        <article className="legal-sheet">

            <div className="legal-section">
              <h2 className="legal-h2">Angaben gemäß § 5 DDG</h2>
              <p className="legal-p">
                Confidara Express GbR<br />
                Weiherstraße 25<br />
                73207 Plochingen<br />
                Deutschland
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Vertreten durch die Gesellschafter</h2>
              <p className="legal-p">
                Miguel Vance<br />
                Patrick Werner
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Kontakt</h2>
              <p className="legal-p">
                Telefon: 015118003775<br />
                E-Mail:{" "}
                <a href="mailto:support@confidaraexpress.de">
                  support@confidaraexpress.de
                </a>
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Umsatzsteuer-Identifikationsnummer</h2>
              <p className="legal-p">Eine Umsatzsteuer-Identifikationsnummer ist nicht vorhanden.</p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Handelsregister</h2>
              <p className="legal-p">Die Gesellschaft ist nicht im Handelsregister eingetragen.</p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
              <p className="legal-p">
                Miguel Vance<br />
                Patrick Werner<br />
                Weiherstraße 25<br />
                73207 Plochingen<br />
                Deutschland
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Datenquellen und Lizenzhinweise</h2>
              <p className="legal-p">
                Für die Prüfung und Vervollständigung von Postleitzahlen, Orten und Straßennamen in
                Deutschland, Österreich, der Schweiz und Liechtenstein nutzen wir das offene
                Verzeichnis der <strong>OpenPLZ API</strong> (openplzapi.org).
              </p>
              <p className="legal-p">
                Die dort bereitgestellten Daten stehen unter der{" "}
                <strong>Open Data Commons Open Database License (ODbL) v1.0</strong>. Der Lizenztext
                ist unter{" "}
                <a
                  href="https://opendatacommons.org/licenses/odbl/1-0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  opendatacommons.org/licenses/odbl/1-0/
                </a>{" "}
                abrufbar. Die ODbL verlangt diese Namensnennung; sie erfolgt hier für die genannte
                Datenquelle.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
              <p className="legal-p">
                Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>

        </article>
      </div>
    </div>
  );
}
