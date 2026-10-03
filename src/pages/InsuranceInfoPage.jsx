import React from "react";
import { Link } from "react-router-dom";
import {
  INSURANCE_INFO_PAGE,
  INSURANCE_INFO_SECTIONS,
  QUELLE_LABEL,
  insuranceInfoToc,
} from "../utils/insuranceInfo.mjs";

// Informationen zur Transportversicherung — die AUSFÜHRLICHE Ebene des
// dreistufigen Informationssystems (Karte → Dialog → diese Seite).
//
// Sie liegt bewusst außerhalb der Buchung: der Buchungsprozess bleibt kompakt,
// wer mehr wissen will, findet hier die Tiefe. Der gesamte Text kommt aus
// utils/insuranceInfo.mjs — die Seite rendert nur, sie formuliert nicht.
//
// Kein Rechtstext: die Seite heißt „Informationen zur Transportversicherung"
// und sagt an zwei Stellen ausdrücklich, dass die geltenden
// Versicherungsbedingungen maßgeblich sind. Sie ersetzt sie nicht und gibt auch
// nicht vor, sie wiederzugeben.
//
// Redesign 2026-10 (Audit H39): dieselbe ruhige Lesesprache wie die
// Rechtsseiten — Text statt Symbolen (keine Häkchenliste, keine Infoicons in
// den Hinweisen), keine Versal-Eyebrow über dem Titel (sie wiederholte nur
// „Transportversicherung"), EINE Lesefläche statt einer Karte je Abschnitt.
// Inhalt, Reihenfolge, Quellen und Hinweise sind unverändert.

const TOC = insuranceInfoToc();

export default function InsuranceInfoPage() {
  return (
    <div className="page-with-navbar">
      <div className="insinfo-wrap">
        <header className="insinfo-head">
          <h1 className="insinfo-title">{INSURANCE_INFO_PAGE.title}</h1>
          <p className="insinfo-lead">{INSURANCE_INFO_PAGE.lead}</p>
        </header>

        {/* Der Hinweis steht am Anfang UND am Ende — wer nur überfliegt, soll
            ihn trotzdem sehen. */}
        <p className="insinfo-disclaimer" role="note">
          {INSURANCE_INFO_PAGE.disclaimer}
        </p>

        <div className="insinfo-body">
          {/* Sprungnavigation: echte Ankerlinks auf echte Überschriften-IDs. */}
          <nav className="insinfo-toc" aria-labelledby="insinfo-toc-title">
            <p className="insinfo-toc-title" id="insinfo-toc-title">Inhalt</p>
            <ol className="insinfo-toc-list">
              {TOC.map(({ id, title }, i) => (
                <li key={id}>
                  <a className="insinfo-toc-link" href={`#${id}`}>
                    <span className="insinfo-toc-num">{String(i + 1).padStart(2, "0")}</span>
                    <span>{title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <main className="insinfo-main">
            {INSURANCE_INFO_SECTIONS.map((s, i) => (
              <section key={s.id} id={s.id} className="insinfo-sec" aria-labelledby={`${s.id}-title`}>
                <div className="insinfo-sec-head">
                  <span className="insinfo-sec-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="insinfo-sec-title" id={`${s.id}-title`}>{s.title}</h2>
                </div>

                {s.lead && <p className="insinfo-sec-lead">{s.lead}</p>}

                {s.items?.length > 0 && (
                  <ul className="insinfo-list">
                    {s.items.map((item, k) => (
                      <li key={k} className="insinfo-item">{item}</li>
                    ))}
                  </ul>
                )}

                {s.note && (
                  <p className="insinfo-note">{s.note}</p>
                )}

                {/* Herkunft der Aussage — nicht als Dekoration, sondern damit
                    nachvollziehbar bleibt, was belegt ist und was sich nach den
                    geltenden Bedingungen richtet. */}
                {s.quelle && (
                  <p className="insinfo-quelle">
                    {QUELLE_LABEL[s.quelle]}
                    {s.quelle === "agb" && <> — <Link className="insinfo-quelle-link" to="/agb">AGB öffnen</Link></>}
                  </p>
                )}
              </section>
            ))}

            <section className="insinfo-sec insinfo-sec--support" aria-labelledby="insinfo-support-title">
              <h2 className="insinfo-sec-title" id="insinfo-support-title">Noch Fragen?</h2>
              <p className="insinfo-sec-lead">
                Wenn Sie vor der Buchung klären möchten, ob Ihre Ware versicherbar ist oder eine
                Freigabe braucht, melden Sie sich bei uns.
              </p>
              <Link className="btn btn-primary" to="/dashboard?page=support">Support kontaktieren</Link>
            </section>

            <p className="insinfo-disclaimer insinfo-disclaimer--end" role="note">
              {INSURANCE_INFO_PAGE.disclaimer}
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
