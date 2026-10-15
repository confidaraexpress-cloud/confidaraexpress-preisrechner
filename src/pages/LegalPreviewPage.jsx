import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/ui/StateView";
import { LegalDocumentView } from "../components/legal/LegalDocumentView";
import { getAdminLegalPublication, getAdminLegalPublicationPdf, listAdminLegalPublications } from "../api/adminApi";
import { countDraftMarks } from "../utils/legalMarkdown.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../utils/externalLink.mjs";

/* ── Geschützte Seitenvorschau der künftigen Rechtsseiten ────────────────────
   /vorschau/rechtstexte/:seite — nur für Administratoren (AdminRoute; die Daten
   liefern ausschließlich /admin/legal-publications/*, serverseitig requireAdmin).

   Gezeigt wird die VERÖFFENTLICHUNGSFASSUNG, die das Backend aus den Entwürfen
   ableitet — derselbe Text, aus dem auch die PDF entsteht — im öffentlichen
   Seitenrahmen und mit DERSELBEN Komponente wie /agb (LegalDocumentView). So sieht
   die Seite nach der Freigabe aus. Offene Stellen sind ausgezeichnet: Platzhalter
   [[…]], Lücken und Varianten *[…]*; die Liste der offenen Punkte steht oberhalb.
   Nichts hiervon ist veröffentlicht oder registriert. */

const ART = {
  ENTSCHEIDUNG: "Entscheidung", "JURISTISCHE PRÜFUNG": "Juristische Prüfung",
  "NACHWEIS OFFEN": "Nachweis offen", TECHNIK: "Technik", HINWEIS: "Redaktioneller Hinweis",
};

function OffenePunkte({ detail }) {
  const marks = countDraftMarks(detail.markdown);
  const gruppen = Object.keys(ART)
    .map((k) => [k, detail.openPoints.filter((o) => o.kind === k)])
    .filter(([, l]) => l.length);
  return (
    <section className="legal-preview-open" aria-labelledby="legal-preview-open-title">
      <h2 className="legal-preview-open-title" id="legal-preview-open-title">Was vor der Veröffentlichung noch offen ist</h2>
      <ul className="legal-preview-counts">
        <li><strong>{marks.placeholders}</strong> Platzhalter ({detail.placeholders.length} verschiedene)</li>
        <li><strong>{Number.isFinite(detail.counts?.gaps) ? detail.counts.gaps : marks.gaps}</strong> Stellen mit Lücken oder Varianten im Text</li>
        <li><strong>{detail.openPoints.length}</strong> offene Punkte im Entwurf</li>
      </ul>
      {detail.placeholders.length > 0 && (
        <details className="legal-preview-details">
          <summary>Platzhalter</summary>
          <p className="legal-preview-chips">
            {detail.placeholders.map((p) => <span key={p.key} className="legal-mark legal-mark--placeholder">{`[[${p.key}]]`}{p.count > 1 ? ` ×${p.count}` : ""}</span>)}
          </p>
        </details>
      )}
      {gruppen.map(([art, liste]) => (
        <details key={art} className="legal-preview-details">
          <summary>{ART[art]} ({liste.length})</summary>
          <ul className="legal-preview-list">
            {liste.map((o, i) => (
              <li key={i}>{o.section && <span className="legal-preview-section">{o.section}: </span>}{o.text.length > 400 ? `${o.text.slice(0, 400)} …` : o.text}</li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

function CheckoutHinweis({ notices }) {
  if (!notices) return null;
  return (
    <section className="legal-preview-open" aria-labelledby="legal-preview-checkout-title">
      <h2 className="legal-preview-open-title" id="legal-preview-checkout-title">Im Checkout an der AGB-Bestätigung (Hinweis nach § 449 HGB)</h2>
      <p className="legal-p">
        Diese Angaben stehen mit der AGB-Fassung in der Registry und erscheinen im Checkout und in der
        Auftragsbestätigung, sobald die Fassung aktiv ist.
      </p>
      {notices.labelSuffix && <p className="legal-p"><strong>Zusatz zur Bestätigung:</strong> „… {notices.labelSuffix}“</p>}
      {notices.notices.map((n, i) => (
        <div key={i} className="legal-callout"><p className="legal-p"><strong>{n.title}</strong></p><p className="legal-p">{n.text}</p></div>
      ))}
    </section>
  );
}

export default function LegalPreviewPage() {
  const { seite = "agb" } = useParams();
  const navigate = useNavigate();
  const [liste, setListe] = useState([]);
  const [state, setState] = useState({ loading: true, error: null, detail: null });
  const [pdf, setPdf] = useState({ loading: false, url: null, error: false });
  const laufRef = useRef(0);

  useEffect(() => {
    let aktiv = true;
    listAdminLegalPublications()
      .then(async (r) => { const d = await r.json().catch(() => null); if (aktiv && r.ok && Array.isArray(d?.publications)) setListe(d.publications); })
      .catch(() => {});
    return () => { aktiv = false; };
  }, []);

  const load = useCallback(async () => {
    const lauf = ++laufRef.current;
    setState({ loading: true, error: null, detail: null });
    try {
      const r = await getAdminLegalPublication(seite);
      const d = await r.json().catch(() => null);
      if (lauf !== laufRef.current) return;
      if (r.ok && typeof d?.markdown === "string") setState({ loading: false, error: null, detail: d });
      else setState({ loading: false, error: d?.code === "LEGAL_DRAFTS_NOT_AVAILABLE" ? "missing" : r.status === 404 ? "unknown" : "load", detail: null });
    } catch {
      if (lauf === laufRef.current) setState({ loading: false, error: "load", detail: null });
    }
  }, [seite]);

  useEffect(() => { load(); return () => { laufRef.current += 1; }; }, [load]);

  // Eine erzeugte PDF gehört zur angezeigten Seite; beim Wechsel wird sie verworfen.
  useEffect(() => () => { if (pdf.url) URL.revokeObjectURL(pdf.url); }, [pdf.url]);
  useEffect(() => { setPdf({ loading: false, url: null, error: false }); }, [seite]);

  const pdfErzeugen = async () => {
    setPdf({ loading: true, url: null, error: false });
    try {
      const r = await getAdminLegalPublicationPdf(seite);
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      setPdf({ loading: false, url: URL.createObjectURL(blob), error: false });
    } catch {
      setPdf({ loading: false, url: null, error: true });
    }
  };

  const d = state.detail;
  const leiste = (
    <div className="legal-preview-bar" role="region" aria-label="Vorschau-Hinweis">
      <div className="legal-preview-bar-inner">
        <p className="legal-preview-flag">
          <strong>Geschützte Vorschau · ENTWURF</strong>
          <span> — nicht veröffentlicht und rechtlich nicht freigegeben.{d && d.route ? ` So sähe ${d.route} nach der Freigabe aus.` : ""}</span>
        </p>
        <div className="legal-preview-actions">
          <label className="legal-preview-select">
            <span>Seite</span>
            <select value={seite} onChange={(e) => navigate(`/vorschau/rechtstexte/${e.target.value}`)} id="legal-preview-page">
              {(liste.length ? liste : [{ id: seite, title: seite }]).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          {pdf.url ? (
            <a className="btn btn-primary btn-sm" id="legal-preview-pdf-open" href={pdf.url} target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>PDF-Vorschau öffnen</a>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" id="legal-preview-pdf" onClick={pdfErzeugen} disabled={pdf.loading || !d}>
              {pdf.loading ? "PDF wird erzeugt …" : "PDF-Vorschau erzeugen"}
            </button>
          )}
          <Link className="btn btn-outline btn-sm" to="/admin/legal-drafts">Arbeitsfassungen</Link>
        </div>
        {pdf.error && <p className="legal-preview-error" role="alert">Die PDF-Vorschau konnte nicht erzeugt werden.</p>}
      </div>
    </div>
  );

  if (state.loading || !d) {
    return (
      <div className="page-with-navbar">
        {leiste}
        <div className="legal-wrap">
          <article className="legal-sheet" aria-busy={state.loading ? "true" : undefined}>
            {state.loading ? <LoadingState text="Vorschau wird erzeugt …" /> : (
              <ErrorState
                title={state.error === "missing" ? "Die Entwürfe sind in diesem Backend noch nicht bereitgestellt."
                  : state.error === "unknown" ? "Diese Seite gibt es in der Vorschau nicht." : "Die Vorschau konnte nicht geladen werden."}
                text="Bitte versuchen Sie es erneut."
                action={<button type="button" className="btn btn-primary btn-sm" id="legal-preview-retry" onClick={load}>Erneut versuchen</button>}
              />
            )}
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="page-with-navbar" data-legal-mode="preview">
      {leiste}
      <LegalDocumentView
        markdown={d.markdown}
        versionLine={`ENTWURF${d.route ? ` · künftig ${d.route}` : " · ohne festgelegten Ort"}${d.registryType ? " · neue Fassung in der Registry" : " · Infoseite ohne Registry"}`}
        tocMaxLevel={d.id === "agb" || d.id === "partnervereinbarung" ? 3 : 2}
        before={<><OffenePunkte detail={d} /><CheckoutHinweis notices={d.bookingNotices} /></>}
      />
    </div>
  );
}
