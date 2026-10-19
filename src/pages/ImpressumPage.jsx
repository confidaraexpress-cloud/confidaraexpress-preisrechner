import React, { useEffect, useState } from "react";
import { COMPANY_PROFILE as CP } from "../config/companyProfile";
import { getCompanyProfile } from "../api/legalApi";
import { readCompanyProfile, companyNameLine, countryName } from "../utils/companyProfileView.mjs";

/* Rechtsseite im gemeinsamen Leselayout (Redesign 2026-10): Titel und Stand
   auf dem Canvas, der Text auf EINER ruhigen weißen Fläche (layout.css,
   .legal-*). Anker unverändert.

   Schritt 3 (Betreiberentscheidung 2026-10-17): ConfidaraExpress ist keine gegründete GbR; die UG
   (haftungsbeschränkt) ist in Vorbereitung. Die Angaben kommen aus src/config/companyProfile.js — keine
   Rechtsform, die es nicht gibt, und keine erfundenen Register- oder Steuerangaben.

   Betreiberentscheidung 2026-10-19: Sobald der Server einen Aussteller freigibt, der einen gültigen Beleg ausstellen
   darf (GET /api/legal/company-profile, Backend INVOICE_ISSUER_*), nennt das Impressum GENAU diese Angaben — die
   echten Firmendaten werden bei der Gründung einmal in der Umgebung eingetragen, ohne neue Programmierung. Bis dahin,
   bei jedem Fehler und bei jeder fremden Antwort bleibt die Vorbereitungsdarstellung (utils/companyProfileView.mjs). */

function Anschrift({ profil }) {
  if (profil) {
    return (
      <>
        {profil.street}<br />
        {profil.postalCode} {profil.city}<br />
        {countryName(profil.country)}
      </>
    );
  }
  return (
    <>
      {CP.address.street}<br />
      {CP.address.zip} {CP.address.city}<br />
      {CP.address.country}
    </>
  );
}

export default function ImpressumPage() {
  const [profil, setProfil] = useState(null);
  useEffect(() => {
    const ctrl = new AbortController();
    getCompanyProfile({ signal: ctrl.signal })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((json) => { if (!ctrl.signal.aborted) setProfil(readCompanyProfile(json)); })
      .catch(() => { /* Vorbereitungsdarstellung bleibt */ });
    return () => ctrl.abort();
  }, []);
  const telefon = profil ? profil.phone : CP.phone;
  const email = profil ? profil.email : CP.email;
  return (
    <div className="page-with-navbar">
      <div className="legal-wrap">
        <header className="legal-head">
          <h1 className="legal-title">Impressum</h1>
        </header>
        <article className="legal-sheet">

            <div className="legal-section">
              <h2 className="legal-h2">Angaben gemäß § 5 DDG</h2>
              {profil ? (
                <>
                  <p className="legal-p" id="impressum-anbieter" data-company-source="issuer">
                    {companyNameLine(profil)}<br />
                    <Anschrift profil={profil} />
                  </p>
                  {profil.managingDirectors && (
                    <p className="legal-p" id="impressum-vertretung">Vertreten durch die Geschäftsführung: {profil.managingDirectors}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="legal-p" id="impressum-anbieter" data-company-source="pre_formation">
                    {CP.brand}<br />
                    {CP.operators.join(" und ")}<br />
                    <Anschrift />
                  </p>
                  <p className="legal-p" id="impressum-gruendung">{CP.formationStatus}.</p>
                </>
              )}
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Kontakt</h2>
              <p className="legal-p">
                {telefon && <>Telefon: {telefon}<br /></>}
                E-Mail:{" "}
                <a href={`mailto:${email}`}>
                  {email}
                </a>
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Umsatzsteuer-Identifikationsnummer</h2>
              <p className="legal-p">
                {profil && profil.vatId ? `Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${profil.vatId}` : CP.vatIdNote}
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Handelsregister</h2>
              <p className="legal-p">
                {profil
                  ? (profil.registerCourt ? `Registergericht: ${profil.registerCourt} · Registernummer: ${profil.registerNumber}` : "Es besteht keine Eintragung im Handelsregister.")
                  : CP.registerNote}
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
              <p className="legal-p">
                {profil
                  ? <>{profil.managingDirectors || companyNameLine(profil)}<br /></>
                  : CP.operators.map((n) => <React.Fragment key={n}>{n}<br /></React.Fragment>)}
                <Anschrift profil={profil} />
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
