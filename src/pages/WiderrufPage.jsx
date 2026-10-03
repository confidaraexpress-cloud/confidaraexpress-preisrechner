import React from "react";
import { Link } from "react-router-dom";

/* Rechtsseite im gemeinsamen Leselayout (Redesign 2026-10): Titel und Stand
   auf dem Canvas, der Text auf EINER ruhigen weißen Fläche (layout.css,
   .legal-*). Der Rechtstext selbst ist wortgleich; Anker unverändert. */

export default function WiderrufPage() {
  return (
    <div className="page-with-navbar">
      <div className="legal-wrap">
        <header className="legal-head">
          <h1 className="legal-title">Widerrufsbelehrung</h1>
        </header>
        <article className="legal-sheet">

            <div className="legal-section">
              <h2 className="legal-h2">Kein gesetzliches Widerrufsrecht für Unternehmer</h2>
              <p className="legal-p">
                Confidara Express richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Keine Nutzung durch Verbraucher</h2>
              <p className="legal-p">
                Eine Nutzung der Plattform durch Verbraucher im Sinne des § 13 BGB ist nicht vorgesehen
                und nicht gestattet.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Kein Widerrufsrecht nach Fernabsatzrecht</h2>
              <p className="legal-p">
                Da sämtliche Verträge über die Plattform ausschließlich im unternehmerischen
                Geschäftsverkehr geschlossen werden, besteht kein gesetzliches Widerrufsrecht nach
                den Vorschriften über Verbraucherverträge und Fernabsatzverträge.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">Stornierung von Sendungen</h2>
              <p className="legal-p">
                Die Stornierung einer bereits gebuchten Sendung richtet sich ausschließlich nach
                den{" "}
                <Link to="/agb">
                  Allgemeinen Geschäftsbedingungen
                </Link>{" "}
                von Confidara Express.
              </p>
            </div>

            <div className="legal-section legal-section--end">
              <p className="legal-stand">
                Stand: Mai 2026
              </p>
            </div>

        </article>
      </div>
    </div>
  );
}
