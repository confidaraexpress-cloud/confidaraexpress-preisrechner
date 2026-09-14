import React from "react";
import { Icon } from "../ui/Icon";
import { SERVICE_DETAILS_TEXT } from "../../utils/serviceDetailsView.mjs";

/* TG22 Package A — das kuratierte Produktprofil eines Angebots im Detailbereich der Karte.

   Die Komponente zeigt ausschließlich, was `serviceDetailsView` gebildet hat: sie liest kein Angebot, kennt
   keine Einkaufsquelle und formuliert keinen Satz selbst. Fünf Abschnitte in fester Reihenfolge —
   Hauptmerkmale, Laufzeit, Größe & Gewicht, Transportabsicherung, Einschränkungen; ein Abschnitt ohne Inhalt
   entsteht nicht. Die Zeilen tragen die Klassen des bestehenden Detailbereichs, ergänzt um Umbruchschutz
   (`offer-profile-*`). */

function ProfilZeile({ zeile }) {
  return (
    <div className="offer-detail-row offer-profile-row" data-profile-row={zeile.id}>
      <span className="offer-detail-label">{zeile.label}</span>
      <span className="offer-detail-value">{zeile.value}</span>
    </div>
  );
}

function Abschnitt({ id, titel, children }) {
  return (
    <div className="offer-details-section offer-profile-section" data-profile-section={id}>
      <div className="offer-detail-section-title">{titel}</div>
      {children}
    </div>
  );
}

export function ServiceProfileDetails({ view }) {
  const { main, transit, size, cover, restrictions } = view;
  return (
    <>
      <Abschnitt id="main" titel={SERVICE_DETAILS_TEXT.mainTitle}>
        <p className="offer-profile-summary">{main.summary}</p>
        {main.features.length > 0 && (
          <ul className="offer-profile-features">
            {main.features.map((f) => (
              <li key={f.id} className="offer-profile-feature" data-profile-feature={f.id}>
                <span className="offer-feature-icon"><Icon n={f.icon} s={15} c="currentColor" /></span>
                <span className="offer-profile-feature-body">
                  <span className="offer-profile-feature-label">{f.label}</span>
                  {f.value && <span className="offer-profile-feature-value">{f.value}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Abschnitt>

      {transit && (
        <Abschnitt id="transit" titel={SERVICE_DETAILS_TEXT.transitTitle}>
          {transit.rows.map((z) => <ProfilZeile key={z.id} zeile={z} />)}
          {transit.note && <p className="offer-profile-note">{transit.note}</p>}
          {transit.projectionNote && (
            <p className="offer-profile-note" data-profile-note="projection">{transit.projectionNote}</p>
          )}
        </Abschnitt>
      )}

      <Abschnitt id="size" titel={SERVICE_DETAILS_TEXT.sizeTitle}>
        {size.rows.map((z) => <ProfilZeile key={z.id} zeile={z} />)}
        {size.note && <p className="offer-profile-note">{size.note}</p>}
        <p className="offer-profile-note" data-profile-note="formula">{size.formula}</p>
      </Abschnitt>

      {cover && (
        <Abschnitt id="cover" titel={SERVICE_DETAILS_TEXT.coverTitle}>
          {cover.rows.map((z) => <ProfilZeile key={z.id} zeile={z} />)}
          {cover.note && <p className="offer-profile-note">{cover.note}</p>}
        </Abschnitt>
      )}

      <Abschnitt id="restrictions" titel={SERVICE_DETAILS_TEXT.restrictionsTitle}>
        {restrictions.rows.map((z) => <ProfilZeile key={z.id} zeile={z} />)}
      </Abschnitt>
    </>
  );
}
