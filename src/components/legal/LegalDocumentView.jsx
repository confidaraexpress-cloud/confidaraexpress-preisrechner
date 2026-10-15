import React, { useMemo } from "react";
import { LegalBlocks, LegalInline } from "./LegalMarkdown";
import { legalDocumentModel } from "../../utils/legalMarkdown.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";
import { LEGAL_PAGE_TEXTS } from "../../utils/legalPageState.mjs";

/* ── Eine Rechtsseite aus ihrer Webfassung ───────────────────────────────────
   Dasselbe Leselayout wie die bisherigen Seiten (layout.css, .legal-*): Titel und
   Fassung auf dem Canvas, Inhaltsverzeichnis und Text auf EINER Fläche. Der Titel
   ist die erste Überschrift der Fassung; das Inhaltsverzeichnis entsteht aus den
   Überschriften (Sprungmarken wie #paragraf-8, siehe utils/legalMarkdown.mjs).

   Dieselbe Komponente setzt die öffentliche Seite UND die geschützte Vorschau —
   die Vorschau sieht deshalb genau so aus wie die spätere Seite. `before` nimmt
   Zusätze der Vorschau auf (Hinweis, offene Punkte); öffentlich bleibt er leer. */
export function LegalDocumentView({ markdown, versionLine, documentUrl, tocMaxLevel = 2, before = null, after = null }) {
  const model = useMemo(() => legalDocumentModel(markdown, { tocMaxLevel }), [markdown, tocMaxLevel]);
  return (
    <div className="legal-wrap">
      <header className="legal-head">
        <h1 className="legal-title"><LegalInline text={model.title || ""} /></h1>
        {versionLine && <p className="legal-stand" id="legal-version">{versionLine}</p>}
      </header>
      {before}
      <article className="legal-sheet" id="legal-document">
        {documentUrl && (
          <div className="legal-doc-actions legal-doc-actions--top">
            <a className="btn btn-outline btn-sm" id="legal-pdf" href={documentUrl} target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
              {LEGAL_PAGE_TEXTS.openPdf}<span className="sr-only"> {LEGAL_PAGE_TEXTS.opensInNewTab}</span>
            </a>
          </div>
        )}
        {model.toc.length > 1 && (
          <nav className="legal-toc" aria-labelledby="legal-toc-title">
            <p className="legal-toc-title" id="legal-toc-title">Inhaltsverzeichnis</p>
            <ol className="legal-toc-list" role="list">
              {model.toc.map((t) => (
                <li key={t.id} className={t.level > 2 ? "legal-toc-sub" : undefined}>
                  <a href={`#${t.id}`} className="legal-toc-link">{t.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <LegalBlocks blocks={model.blocks} ids={model.ids} />
      </article>
      {after}
    </div>
  );
}
