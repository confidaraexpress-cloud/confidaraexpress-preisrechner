import React from "react";
import { COMPANY_PROFILE as CP } from "../config/companyProfile";

/* Rechtsseite im gemeinsamen Leselayout (Redesign 2026-10): Titel und Stand
   auf dem Canvas, der Text auf EINER ruhigen weißen Fläche (layout.css,
   .legal-*). Anker unverändert.

   Schritt 3 (Betreiberentscheidung 2026-10-17): ConfidaraExpress ist keine gegründete GbR; die UG
   (haftungsbeschränkt) ist in Vorbereitung. Die Angaben kommen aus src/config/companyProfile.js — keine
   Rechtsform, die es nicht gibt, und keine erfundenen Register- oder Steuerangaben. */

function Anschrift() {
  return (
    <>
      {CP.address.street}<br />
      {CP.address.zip} {CP.address.city}<br />
      {CP.address.country}
    </>
  );
}

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
              <p className="legal-p" id="impressum-anbieter">
                {CP.brand}<br />
                {CP.operators.join(" und ")}<br />
                <Anschrift />
              </p>
              <p className="legal-p" id="impressum-gruendung">{CP.formationStatus}.</p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Kontakt</h2>
              <p className="legal-p">
                Telefon: {CP.phone}<br />
                E-Mail:{" "}
                <a href={`mailto:${CP.email}`}>
                  {CP.email}
                </a>
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Umsatzsteuer-Identifikationsnummer</h2>
              <p className="legal-p">{CP.vatIdNote}</p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Handelsregister</h2>
              <p className="legal-p">{CP.registerNote}</p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
              <p className="legal-p">
                {CP.operators.map((n) => <React.Fragment key={n}>{n}<br /></React.Fragment>)}
                <Anschrift />
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Datenquellen und Lizenzhinweise</h2>
              <p className="legal-p">
                Für Adressvorschläge und die Prüfung von Anschriften nutzen wir den Dienst{" "}
                <strong>Geoapify</strong> (Powered by{" "}
                <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a>).
                Die Adressdaten stammen aus OpenStreetMap und weiteren offenen Quellen:{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                  © OpenStreetMap-Mitwirkende
                </a>.
              </p>
              <p className="legal-p">
                Die OpenStreetMap-Daten stehen unter der{" "}
                <strong>Open Data Commons Open Database License (ODbL) v1.0</strong>. Der Lizenztext
                ist unter{" "}
                <a
                  href="https://opendatacommons.org/licenses/odbl/1-0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  opendatacommons.org/licenses/odbl/1-0/
                </a>{" "}
                abrufbar. Die ODbL verlangt diese Namensnennung; sie erfolgt hier und an jeder
                Vorschlagsliste.
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
