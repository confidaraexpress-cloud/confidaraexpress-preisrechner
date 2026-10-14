import React from "react";
import { Link } from "react-router-dom";
import { API } from "../../api/client";
import {
  LEGAL_READY, legalTermsDocument, legalTermsNotices, legalGateError,
} from "../../utils/legalBookingView.mjs";

// AGB-Bestätigung + separate Pflichtbestätigung zu ausgeschlossenen Gütern —
// REINE DARSTELLUNG; die Zustände (agbAccepted, prohibitedGoodsAccepted) bleiben
// im Orchestrator. Es bleiben GENAU ZWEI Checkboxen. 7-Tage-Zahlungsziel-Wording unberührt.
//
// ─── Zwei Betriebsarten, eine Komponente (Go-Live Paket 4-B) ────────────────────────────────
// Ohne aktive Legal-Buchungsschranke (`legalContext.state !== "ready"`) sieht dieser Bereich
// exakt aus wie bisher: dieselben zwei Checkboxen, dieselben Links auf `/agb` und
// `/agb#paragraf-8`. Das ist der heutige Produktivzustand und bleibt unverändert.
//
// Mit aktiver Schranke kommt ein Block „Vertragsunterlagen" mit den VERSIONIERTEN Dokumenten
// des Sets dazu, und beide Checkboxen verweisen auf die versionierte AGB-Fassung statt auf die
// Webseite. Ein neues Set führt genau zwei: AGB und Datenschutzerklärung.
//
// Die Liste wird generisch aus `legalContext.documents` gerendert — sie zählt nichts fest ab.
// Deshalb hat der Wechsel von drei auf zwei Pflichtdokumente an dieser Komponente nichts
// geändert: sie zeigt, was das Set trägt.
//
// ─── Warum die Datenschutzerklärung KEINE Checkbox bekommt ──────────────────────────────────
// Sie wird bereitgestellt und angezeigt, nicht zugestimmt. Eine Checkbox „Ich akzeptiere die
// Datenschutzerklärung" würde eine Einwilligung behaupten, die es rechtlich nicht gibt und die
// serverseitig auch nirgends gespeichert wird — es entstehen ausschließlich zwei
// Acceptance-Zeilen (AGB + ausgeschlossene Güter). Die Zugehörigkeit des Informationsdokuments
// zur Buchung belegt das eingefrorene Set, keine Zustimmung.
//
// ─── Warum die zweite Checkbox auf DASSELBE AGB-PDF zeigt ───────────────────────────────────
// `/agb#paragraf-8` verweist auf die jeweils aktuelle Webseite. Bei aktiver Schranke wäre das
// ein beweglicher Text neben einem eingefrorenen Nachweis — der Kunde bestätigte etwas anderes,
// als gespeichert wird. Deshalb dort dieselbe versionierte Fassung. Ein DRITTER Acceptance-Typ
// entsteht dadurch nicht: die Bestätigung bleibt fachlich eine eigene Tatsachenaussage.
//
// ─── Buchungshinweise der AGB-Fassung ───────────────────────────────────────────────────────
// Trägt die aktive AGB-Fassung Hinweise (künftig: ADSp 2017 als Anlage, Hinweis nach § 449
// Abs. 2 HGB), erscheinen sie VOR den Bestätigungen, und der AGB-Zusatz steht im Text der
// ersten Checkbox. Wortlaut und Zeitpunkt bestimmt allein der Server über die registrierte
// Fassung — hier steht kein Hinweistext. Ohne Hinweise ändert sich an diesem Bereich nichts.
export function TermsModule({
  accepted, onChange, prohibitedAccepted, onProhibitedChange, prohibitedError,
  legalContext,
}) {
  const hasErr = !!prohibitedError;
  const aktiv = legalContext && legalContext.state === LEGAL_READY;
  const termsDoc = aktiv ? legalTermsDocument(legalContext) : null;
  const ladefehler = legalGateError(legalContext);
  const { labelSuffix, notices } = legalTermsNotices(legalContext);
  // Die Hinweise beschreiben die erste Bestätigung: ein Screenreader liest sie beim Fokus mit.
  const hinweisIds = notices.map((_, i) => `booking-legal-notice-${i}`);

  // Absolute Adresse: die Dokumente liegen auf der API, nicht auf der SPA-Domain.
  const docHref = (d) => `${API}${d.url}`;

  // AGB-Beschriftung — bei aktiver Schranke als versionierter PDF-Link, sonst unverändert
  // als interner Seitenlink.
  const agbLink = termsDoc
    ? <a href={docHref(termsDoc)} className="booking-agb-link" target="_blank" rel="noopener noreferrer">
        Allgemeinen Geschäftsbedingungen
      </a>
    : <Link to="/agb" className="booking-agb-link">Allgemeinen Geschäftsbedingungen</Link>;

  const gueterLink = termsDoc
    ? <a href={docHref(termsDoc)} className="booking-agb-link" target="_blank" rel="noopener noreferrer">
        verbotenen oder vom Transport ausgeschlossenen Gegenstände
      </a>
    : <Link to="/agb#paragraf-8" className="booking-agb-link" target="_blank" rel="noopener noreferrer">
        verbotenen oder vom Transport ausgeschlossenen Gegenstände
      </Link>;

  return (
    <>
      {ladefehler && (
        <p className="field-error booking-legal-error" role="alert">{ladefehler}</p>
      )}

      {aktiv && (
        <div className="booking-legal-docs">
          <p className="booking-legal-docs-title">Vertragsunterlagen</p>
          <ul className="booking-legal-docs-list">
            {legalContext.documents.map((d) => (
              <li key={d.type}>
                <a href={docHref(d)} className="booking-agb-link" target="_blank" rel="noopener noreferrer">
                  {d.label}
                </a>{" "}
                <span className="booking-legal-docs-version">· Stand {d.version}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aktiv && notices.map((n, i) => (
        <section key={hinweisIds[i]} id={hinweisIds[i]} className="booking-legal-notice"
          role="note" aria-labelledby={`${hinweisIds[i]}-title`}>
          <p id={`${hinweisIds[i]}-title`} className="booking-legal-notice-title">{n.title}</p>
          <p className="booking-legal-notice-text">{n.text}</p>
        </section>
      ))}

      <label className="booking-agb-label">
        <input type="checkbox" className="booking-agb-checkbox" checked={accepted} onChange={e => onChange(e.target.checked)}
          aria-describedby={aktiv && hinweisIds.length ? hinweisIds.join(" ") : undefined} />
        <span className="booking-agb-text">
          Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
          {agbLink}
          {termsDoc ? <> <span className="booking-nowrap">(Stand {termsDoc.version})</span>{labelSuffix ? <> {labelSuffix}</> : null}</> : null}{" "}
          zu. Mir ist bewusst, dass diese Bestellung verbindlich ist und eine Zahlungsverpflichtung auslöst.
        </span>
      </label>

      <label className="booking-agb-label">
        <input
          type="checkbox"
          id="booking-prohibited-goods"
          className="booking-agb-checkbox"
          checked={!!prohibitedAccepted}
          onChange={e => onProhibitedChange(e.target.checked)}
          aria-invalid={hasErr ? "true" : undefined}
          aria-describedby={hasErr ? "booking-prohibited-error" : undefined}
        />
        <span className="booking-agb-text">
          Ich bestätige, dass die Sendung keine{" "}
          {gueterLink}{" "}
          enthält.
        </span>
      </label>
      {hasErr && (
        <span id="booking-prohibited-error" className="field-error booking-prohibited-error" role="alert">
          {prohibitedError}
        </span>
      )}
    </>
  );
}
