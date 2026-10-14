import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { AdminBackLink } from "../../components/admin/AdminBackLink";
import { LegalBlocks } from "../../components/legal/LegalMarkdown";
import { headingIds, parseLegalMarkdown } from "../../utils/legalMarkdown.mjs";
import { listAdminLegalDrafts, getAdminLegalDraft } from "../../api/adminApi";

// Nur lesende Ansicht der ARBEITSFASSUNGEN G1–G9 (mit allen Vermerken und offenen
// Punkten). Geltende Fassungen kommen weiterhin aus der Legal-Registry.
// Gesetzt mit demselben Renderer wie die Rechtsseiten (components/legal/LegalMarkdown):
// kein innerHTML, keine Script-Ausführung, offene Punkte ⟦…⟧ ausgezeichnet.

function DraftDocument({ markdown }) {
  const { blocks, ids } = useMemo(() => {
    const b = parseLegalMarkdown(markdown);
    return { blocks: b, ids: headingIds(b) };
  }, [markdown]);
  return <article className="legal-sheet adm-ld-sheet"><LegalBlocks blocks={blocks} ids={ids} /></article>;
}

const GROUPS = ["Kunden", "Partner", "Intern"];
export default function AdminLegalDraftsPage() {
  const [list, setList] = useState({ loading: true, error: "", documents: [] });
  const [selected, setSelected] = useState("agb");
  const [detail, setDetail] = useState({ loading: true, error: "", markdown: "", title: "" });

  useEffect(() => {
    let active = true;
    listAdminLegalDrafts()
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok || !Array.isArray(data?.documents)) {
          setList({ loading: false, error: "Die Entwurfsliste konnte nicht geladen werden.", documents: [] });
        } else {
          setList({ loading: false, error: "", documents: data.documents });
        }
      })
      .catch(() => { if (active) setList({ loading: false, error: "Die Entwurfsliste konnte nicht geladen werden.", documents: [] }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setDetail({ loading: true, error: "", markdown: "", title: "" });
    getAdminLegalDraft(selected)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok || typeof data?.markdown !== "string") {
          setDetail({ loading: false, error: "Dieser Entwurf ist in diesem Backend noch nicht abrufbar.", markdown: "", title: "" });
        } else {
          setDetail({ loading: false, error: "", markdown: data.markdown, title: data.title || "Rechtsentwurf" });
        }
      })
      .catch(() => { if (active) setDetail({ loading: false, error: "Dieser Entwurf konnte nicht geladen werden.", markdown: "", title: "" }); });
    return () => { active = false; };
  }, [selected]);

  return (
    <div className="adm-page">
      <PageHeader variant="admin" title="Rechtstexte – Arbeitsfassungen"
        backLink={<AdminBackLink to="/admin/invoices/backfill" label="Zurück zu den internen Vorschauen" />}
        subtitle="Die vorbereiteten Entwürfe G1–G9 mit allen Vermerken und offenen Punkten lesen, ohne die gültigen Vertragsfassungen zu verändern." />
      <div className="adm-note adm-note--warning adm-ld-warning" role="note">
        <strong>ENTWURF – nicht veröffentlicht und rechtlich noch nicht freigegeben.</strong>
        <span>Die öffentlichen Seiten /agb und /datenschutz sowie die aktive Buchungsfassung bleiben unverändert.</span>
      </div>
      {list.loading ? (
        <p role="status">Entwurfsliste wird geladen …</p>
      ) : list.error ? (
        <div role="alert" className="adm-note adm-note--error">{list.error}</div>
      ) : (
        <div className="adm-ld-layout">
          <nav className="adm-ld-menu" aria-label="Rechtstext-Entwürfe">
            {GROUPS.map((group) => (
              <section key={group} aria-label={group}>
                <h2>{group === "Kunden" ? "Kunden und Verträge" : group === "Partner" ? "Vertriebspartner" : "Interne Unterlagen"}</h2>
                {list.documents.filter((doc) => doc.group === group).map((doc) => (
                  <button type="button" key={doc.id}
                    className={"adm-ld-navitem" + (selected === doc.id ? " adm-ld-navitem--selected" : "")}
                    aria-current={selected === doc.id ? "page" : undefined}
                    onClick={() => setSelected(doc.id)}>{doc.title}</button>
                ))}
              </section>
            ))}
          </nav>
          <div className="adm-ld-content">
            {detail.loading ? (
              <p role="status">Dokument wird geladen …</p>
            ) : detail.error ? (
              <div role="alert" className="adm-note adm-note--error">{detail.error}</div>
            ) : (
              <>
                <div className="adm-ld-document-heading">
                  <div><span className="adm-ld-draft-label">ENTWURF v0.1</span><h2>{detail.title}</h2></div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>Drucken</button>
                </div>
                <DraftDocument markdown={detail.markdown} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
