import React from "react";
import { ErrorState, LoadingState } from "../ui/StateView";
import { LegalDocumentView } from "./LegalDocumentView";
import { useRegistryLegalPage } from "../../hooks/useRegistryLegalPage";
import { legalDocumentUrl } from "../../api/legalApi";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";
import { LEGAL_PAGE_TEXTS, legalVersionLine } from "../../utils/legalPageState.mjs";

/* ── Rechtsseite, die der AKTIVEN Fassung der Legal-Registry folgt ──────────
   /agb und /datenschutz zeigen genau die Fassung, der im Checkout zugestimmt
   wird (utils/legalPageState.mjs):
     • Webfassung vorhanden      → deren Text (LegalDocumentView)
     • heutige Fassung aktiv     → die bisherige Seite (`Legacy`), unverändert
     • andere Fassung, kein Text → kein Text aus dem Frontend, nur die PDF
     • Ladefehler               → Hinweis und „Erneut versuchen"
   `title` ist die Überschrift der Lade-, PDF- und Fehlerzustände. */
export function RegistryLegalPage({ documentType, title, legacy: Legacy, tocMaxLevel = 2 }) {
  const s = useRegistryLegalPage(documentType);

  if (!s.loading && s.mode === "legacy") return <Legacy />;
  if (!s.loading && s.mode === "content") {
    return (
      <div className="page-with-navbar" data-legal-mode="content">
        <LegalDocumentView
          markdown={s.markdown}
          versionLine={legalVersionLine({ version: s.version, effectiveFrom: s.effectiveFrom })}
          documentUrl={legalDocumentUrl(s.documentPath)}
          tocMaxLevel={tocMaxLevel}
        />
      </div>
    );
  }

  let inhalt;
  if (s.loading) {
    inhalt = <LoadingState text={LEGAL_PAGE_TEXTS.loading} />;
  } else if (s.mode === "pdf") {
    const url = legalDocumentUrl(s.documentPath);
    inhalt = (
      <div className="legal-section" id="legal-pdf-only">
        <p className="legal-p">{LEGAL_PAGE_TEXTS.pdfOnly(s.version)}</p>
        {url && (
          <div className="legal-doc-actions">
            <a className="btn btn-primary" id="legal-pdf" href={url} target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
              {LEGAL_PAGE_TEXTS.openPdf}<span className="sr-only"> {LEGAL_PAGE_TEXTS.opensInNewTab}</span>
            </a>
          </div>
        )}
      </div>
    );
  } else {
    inhalt = (
      <ErrorState
        title={LEGAL_PAGE_TEXTS.loadError}
        text={LEGAL_PAGE_TEXTS.retryHint}
        action={<button type="button" className="btn btn-primary btn-sm" id="legal-retry" onClick={s.retry}>Erneut versuchen</button>}
      />
    );
  }
  return (
    <div className="page-with-navbar" data-legal-mode={s.loading ? "loading" : s.mode}>
      <div className="legal-wrap">
        <header className="legal-head">
          <h1 className="legal-title">{title}</h1>
          {s.mode === "pdf" && <p className="legal-stand">{`Fassung ${s.version}`}</p>}
        </header>
        <article className="legal-sheet" aria-busy={s.loading ? "true" : undefined}>{inhalt}</article>
      </div>
    </div>
  );
}
