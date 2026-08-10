import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
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

const TOC = insuranceInfoToc();

export default function InsuranceInfoPage() {
  return (
    <div className="page-with-navbar">
      <div className="insinfo-wrap">
        <header className="insinfo-head">
          <span className="insinfo-eyebrow">{INSURANCE_INFO_PAGE.eyebrow}</span>
          <h1 className="insinfo-title">{INSURANCE_INFO_PAGE.title}</h1>
          <p className="insinfo-lead">{INSURANCE_INFO_PAGE.lead}</p>
        </header>

        {/* Der Hinweis steht am Anfang UND am Ende — wer nur überfliegt, soll
            ihn trotzdem sehen. */}
        <p className="insinfo-disclaimer" role="note">
          <Icon n="info" s={16} c="currentColor" />
          <span>{INSURANCE_INFO_PAGE.disclaimer}</span>
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
                      <li key={k} className="insinfo-item">
                        <span className="insinfo-item-ico" aria-hidden="true">
                          <Icon n="check" s={14} c="currentColor" />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {s.note && (
                  <p className="insinfo-note">
                    <Icon n="info" s={14} c="currentColor" />
                    <span>{s.note}</span>
                  </p>
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
              <Icon n="info" s={16} c="currentColor" />
              <span>{INSURANCE_INFO_PAGE.disclaimer}</span>
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
