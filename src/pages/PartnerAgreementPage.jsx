import React, { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState, LoadingState } from "../components/ui/StateView";
import { agreementDocumentUrl, getSalesPartnerAgreement } from "../api/partnerApi";
import { getLegalContent } from "../api/legalApi";
import { LegalDocumentView } from "../components/legal/LegalDocumentView";
import { legalVersionLine, readLegalContent } from "../utils/legalPageState.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../utils/externalLink.mjs";
import {
  AGREEMENT_TEXTS,
  agreementValidityLabel,
  agreementVersionLabel,
  readAgreementResponse,
} from "../utils/salesPartnerAgreement.mjs";

/* ── Vertriebspartnervereinbarung (/partnervereinbarung) ─────────────────────
   Öffentliche Leseseite im gemeinsamen Rechtslayout (layout.css, .legal-*).
   Die Vereinbarung selbst ist ausschließlich das registrierte Dokument des
   Servers: die Seite nennt Fassung und Gültigkeit und öffnet das Dokument in
   einem neuen Tab — sie gibt keinen Vertragstext wieder und bettet nichts ein
   (der API-Host liefert das Dokument mit X-Frame-Options DENY aus).

   Zustände: Laden · keine veröffentlichte Fassung · Fassung mit Dokument ·
   Ladefehler mit „Erneut versuchen". Ein Fehler wird nie als „keine Fassung"
   ausgegeben.

   Trägt die gültige Fassung eine Webfassung (`contentPath`, aus derselben Datei
   erzeugt wie die PDF), steht ihr Wortlaut auf der Seite — im selben Leselayout
   wie /agb (components/legal/LegalDocumentView.jsx). Ist sie nicht ladbar, bleibt
   es bei Fassung, Gültigkeit und Dokumentknopf: dieselbe Fassung, kein anderer Text. */
export default function PartnerAgreementPage() {
  const [state, setState] = useState({ loading: true, error: false, agreement: null, markdown: null });
  const laufRef = useRef(0);

  const load = useCallback(async () => {
    const lauf = ++laufRef.current;
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const r = await getSalesPartnerAgreement();
      if (lauf !== laufRef.current) return;
      let d = null;
      if (r.ok) {
        try { d = await r.json(); } catch { d = null; }
      }
      if (lauf !== laufRef.current) return;
      const gelesen = r.ok ? readAgreementResponse(d) : { ok: false, agreement: null };
      let markdown = null;
      if (gelesen.ok && gelesen.agreement && gelesen.agreement.contentPath) {
        try {
          const c = await getLegalContent(gelesen.agreement.contentPath);
          let cb = null;
          try { cb = await c.json(); } catch { cb = null; }
          const inhalt = readLegalContent(c.status, cb, gelesen.agreement.version);
          if (inhalt.ok) markdown = inhalt.markdown;
        } catch { markdown = null; }
        if (lauf !== laufRef.current) return;
      }
      setState({ loading: false, error: !gelesen.ok, agreement: gelesen.agreement, markdown });
    } catch {
      if (lauf === laufRef.current) setState({ loading: false, error: true, agreement: null });
    }
  }, []);

  useEffect(() => {
    load();
    return () => { laufRef.current += 1; };
  }, [load]);

  const { loading, error, agreement, markdown } = state;
  const dokument = agreement ? agreementDocumentUrl(agreement.documentPath) : null;
  const gueltigkeit = agreement ? agreementValidityLabel(agreement) : null;

  let inhalt;
  if (loading) {
    inhalt = <LoadingState text="Die Vereinbarung wird geladen …" />;
  } else if (error) {
    inhalt = (
      <ErrorState
        title={AGREEMENT_TEXTS.loadError}
        text={AGREEMENT_TEXTS.retryHint}
        action={<button type="button" className="btn btn-primary btn-sm" id="spa-retry" onClick={load}>Erneut versuchen</button>}
      />
    );
  } else if (!agreement) {
    inhalt = <p className="legal-p" id="spa-none">{AGREEMENT_TEXTS.none}</p>;
  } else {
    inhalt = (
      <div className="legal-section" id="spa-agreement">
        <p className="legal-doc-version" id="spa-version">{agreementVersionLabel(agreement.version)}</p>
        {gueltigkeit && <p className="legal-p" id="spa-validity">{gueltigkeit}</p>}
        {dokument ? (
          <div className="legal-doc-actions">
            <a className="btn btn-primary" id="spa-document" href={dokument}
              target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
              {AGREEMENT_TEXTS.open}
              <span className="sr-only"> {AGREEMENT_TEXTS.opensInNewTab}</span>
            </a>
          </div>
        ) : (
          <p className="legal-p" id="spa-no-document">{AGREEMENT_TEXTS.noDocument}</p>
        )}
      </div>
    );
  }

  if (!loading && !error && agreement && markdown) {
    return (
      <div className="page-with-navbar" data-legal-mode="content">
        <LegalDocumentView
          markdown={markdown}
          versionLine={legalVersionLine({ version: agreement.version, effectiveFrom: agreement.effectiveFrom })}
          documentUrl={dokument}
          tocMaxLevel={2}
        />
      </div>
    );
  }

  return (
    <div className="page-with-navbar">
      <div className="legal-wrap">
        <header className="legal-head">
          <h1 className="legal-title">{AGREEMENT_TEXTS.title}</h1>
        </header>
        <article className="legal-sheet" id="spa-sheet" aria-busy={loading ? "true" : undefined}>
          {inhalt}
        </article>
      </div>
    </div>
  );
}
