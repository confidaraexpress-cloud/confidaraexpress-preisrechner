import React from "react";
import { Link } from "react-router-dom";
import { API } from "../../api/client";
import {
  LEGAL_READY, legalTermsDocument, legalGateError,
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
// Mit aktiver Schranke kommt ein Block „Vertragsunterlagen" mit den drei VERSIONIERTEN
// Dokumenten dazu, und beide Checkboxen verweisen auf die versionierte AGB-Fassung statt auf
// die Webseite.
//
// ─── Warum Datenschutz und B2B-Information KEINE Checkbox bekommen ──────────────────────────
// Sie werden bereitgestellt und angezeigt, nicht zugestimmt. Eine Checkbox „Ich akzeptiere die
// Datenschutzerklärung" würde eine Einwilligung behaupten, die es rechtlich nicht gibt und die
// serverseitig auch nirgends gespeichert wird — es entstehen ausschließlich zwei
// Acceptance-Zeilen (AGB + ausgeschlossene Güter). Die Zugehörigkeit dieser Informations-
// dokumente zur Buchung belegt das eingefrorene Set, keine Zustimmung.
//
// ─── Warum die zweite Checkbox auf DASSELBE AGB-PDF zeigt ───────────────────────────────────
// `/agb#paragraf-8` verweist auf die jeweils aktuelle Webseite. Bei aktiver Schranke wäre das
// ein beweglicher Text neben einem eingefrorenen Nachweis — der Kunde bestätigte etwas anderes,
// als gespeichert wird. Deshalb dort dieselbe versionierte Fassung. Ein DRITTER Acceptance-Typ
// entsteht dadurch nicht: die Bestätigung bleibt fachlich eine eigene Tatsachenaussage.
export function TermsModule({
  accepted, onChange, prohibitedAccepted, onProhibitedChange, prohibitedError,
  legalContext,
}) {
  const hasErr = !!prohibitedError;
  const aktiv = legalContext && legalContext.state === LEGAL_READY;
  const termsDoc = aktiv ? legalTermsDocument(legalContext) : null;
  const ladefehler = legalGateError(legalContext);

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

      <label className="booking-agb-label">
        <input type="checkbox" className="booking-agb-checkbox" checked={accepted} onChange={e => onChange(e.target.checked)} />
        <span className="booking-agb-text">
          Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
          {agbLink}
          {termsDoc ? <> (Stand {termsDoc.version})</> : null}{" "}
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
