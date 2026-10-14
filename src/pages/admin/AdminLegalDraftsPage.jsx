import React, { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { listAdminLegalDrafts, getAdminLegalDraft } from "../../api/adminApi";

// Nur lesende Entwurfsvorschau. Geltende AGB kommen weiterhin aus /api/legal/current.
// Markdown wird als React-Text gerendert (kein innerHTML, keine Script-Ausfuehrung).
function Inline({ value }) {
  const pieces = String(value || "").split(/(\*\*[^*]+\*\*|\x60[^\x60]+\x60|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return pieces.filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const tick = String.fromCharCode(96);
    if (part.startsWith(tick) && part.endsWith(tick)) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function MarkdownPreview({ markdown }) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = i;
    if (!line.trim()) { i += 1; continue; }
    if (line.startsWith(String.fromCharCode(96).repeat(3))) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith(String.fromCharCode(96).repeat(3))) code.push(lines[i++]);
      if (i < lines.length) i += 1;
      blocks.push(<pre key={key}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const H = "h" + Math.min(heading[1].length + 1, 6);
      blocks.push(<H key={key}><Inline value={heading[2]} /></H>);
      i += 1;
      continue;
    }
    if (/^---+\s*$/.test(line)) { blocks.push(<hr key={key} />); i += 1; continue; }
    if (line.trimStart().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        const row = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
        if (!row.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(row);
        i += 1;
      }
      if (rows.length) {
        blocks.push(
          <div className="adm-ld-table-scroll" key={key}>
            <table>
              <thead><tr>{rows[0].map((cell, j) => <th key={j}><Inline value={cell} /></th>)}</tr></thead>
              <tbody>{rows.slice(1).map((row, r) =>
                <tr key={r}>{row.map((cell, j) => <td key={j}><Inline value={cell} /></td>)}</tr>
              )}</tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    if (/^\s*>/.test(line)) {
      blocks.push(<blockquote key={key}><Inline value={line.replace(/^\s*>\s?/, "")} /></blockquote>);
      i += 1; continue;
    }
    const item = /^(\s*)([-*]|\d+[.)])\s+(.+)$/.exec(line);
    if (item) {
      blocks.push(<p key={key} className="adm-ld-list-line">
        <span aria-hidden="true">{item[2]}</span> <Inline value={item[3]} />
      </p>);
      i += 1; continue;
    }
    blocks.push(<p key={key}><Inline value={line} /></p>);
    i += 1;
  }
  return <article className="adm-ld-markdown">{blocks}</article>;
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
          setDetail({ loading: false, error: "Dieser Entwurf ist noch nicht abrufbar. Bitte prüfen Sie Backend-PR #427.", markdown: "", title: "" });
        } else {
          setDetail({ loading: false, error: "", markdown: data.markdown, title: data.title || "Rechtsentwurf" });
        }
      })
      .catch(() => { if (active) setDetail({ loading: false, error: "Dieser Entwurf konnte nicht geladen werden.", markdown: "", title: "" }); });
    return () => { active = false; };
  }, [selected]);

  return (
    <div className="adm-page">
      <PageHeader variant="admin" title="Rechtstexte – Vorschau"
        subtitle="Die vorhandenen Entwürfe G1–G9 lesen und prüfen, ohne die gültigen Vertragsfassungen zu verändern." />
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
                <MarkdownPreview markdown={detail.markdown} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
