import React from "react";
import { parseLegalInline } from "../../utils/legalMarkdown.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";

/* ── Rechtstext als React-Elemente ──────────────────────────────────────────
   Setzt die Blöcke aus utils/legalMarkdown.mjs in das gemeinsame Leselayout der
   Rechtsseiten (layout.css, .legal-*). Kein innerHTML: jeder Text wird als
   Text gesetzt, Links nur auf https://. Entwurfsmarken (Platzhalter, Lücken,
   offene Punkte) erscheinen ausgezeichnet — eine veröffentlichte Fassung trägt
   keine (der Server nimmt sie gar nicht erst an). */

export function LegalInline({ text }) {
  return parseLegalInline(text).map((r, i) => <LegalRun key={i} run={r} />);
}

function LegalRun({ run }) {
  switch (run.kind) {
    case "strong": return <strong>{run.children.map((c, j) => <LegalRun key={j} run={c} />)}</strong>;
    case "link":
      return <a href={run.href} target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>{run.text}</a>;
    case "code": return <span className="legal-ident">{run.text}</span>;
    case "placeholder": return <mark className="legal-mark legal-mark--placeholder">{run.text}</mark>;
    case "gap": return <mark className="legal-mark legal-mark--gap">{run.text}</mark>;
    case "marker": return <mark className="legal-mark legal-mark--open">{run.text}</mark>;
    default: return <React.Fragment>{run.text}</React.Fragment>;
  }
}

function Zeilen({ lines }) {
  return lines.map((l, i) => (
    <React.Fragment key={i}>{i > 0 && <br />}<LegalInline text={l} /></React.Fragment>
  ));
}

// Ebene 1 kommt nur in Arbeitsfassungen vor (der Titel einer Seite steht im Seitenkopf);
// sie wird wie ein Abschnitt gesetzt, nie als zweite <h1>.
const UEBERSCHRIFT = { 1: "legal-h2", 2: "legal-h2", 3: "legal-h3", 4: "legal-h4", 5: "legal-h5", 6: "legal-h5" };

export function LegalBlocks({ blocks, ids = [] }) {
  // Jede Tabelle trägt eine (für Screenreader lesbare) Beschriftung: die Überschrift davor.
  let letzteUeberschrift = "Tabelle";
  return blocks.map((b, k) => {
    if (b.type === "heading") {
      letzteUeberschrift = b.text.replace(/\*\*/g, "");
      const Tag = `h${Math.min(6, Math.max(2, b.level))}`;
      return <Tag key={k} id={ids[k] || undefined} className={`${UEBERSCHRIFT[b.level] || "legal-h5"} legal-anchor`}><LegalInline text={b.text} /></Tag>;
    }
    if (b.type === "rule") return <hr key={k} className="legal-rule" />;
    if (b.type === "paragraph") return <p key={k} className="legal-p"><Zeilen lines={b.lines} /></p>;
    if (b.type === "quote") return <blockquote key={k} className="legal-callout"><LegalBlocks blocks={b.blocks} /></blockquote>;
    if (b.type === "list") {
      return (
        <ul key={k} className={`legal-list legal-md-list${b.ordered ? " legal-md-list--marked" : ""}`}>
          {b.items.map((it, j) => (
            <li key={j} className={it.depth ? `legal-md-depth-${it.depth}` : undefined}>
              {b.ordered && <span className="legal-md-marker" aria-hidden="true">{it.marker}</span>}
              <span className="legal-md-item">{b.ordered && <span className="sr-only">{it.marker} </span>}<Zeilen lines={it.lines} /></span>
            </li>
          ))}
        </ul>
      );
    }
    if (b.type === "table") {
      return (
        <div key={k} className="legal-table-wrap" role="region" aria-label={letzteUeberschrift} tabIndex={0}>
          <table className="legal-table">
            <caption className="sr-only">{letzteUeberschrift}</caption>
            <thead><tr>{b.head.map((c, j) => <th key={j} scope="col"><LegalInline text={c} /></th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>{b.head.map((_, j) => <td key={j} data-label={b.head[j].replace(/\*\*/g, "")}><LegalInline text={r[j] ?? ""} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return null;
  });
}
