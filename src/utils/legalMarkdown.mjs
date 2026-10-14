// ── Rechtstexte: Markdown → Blöcke (rein, ohne DOM) ───────────────────────────
//
// EINE Lesart für alle Rechtstexte im Frontend: die Arbeitsfassungen im Admin
// (Entwürfe G1–G9), die geschützte Seitenvorschau und — nach der Freigabe — die
// öffentlichen Seiten, deren Wortlaut als Webfassung der registrierten Fassung
// vom Server kommt. Die Regeln entsprechen dem PDF-Satz im Backend
// (lib/legalDocumentPdf.js): dieselben Blöcke, dieselbe Gliederung.
//
// Bewusst eine kleine Teilmenge — genau das, was die Texte benutzen:
//   Überschriften (#…######), Absätze (JEDE Zeile bleibt eine eigene Zeile — die
//   Texte setzen Zeilenumbrüche bewusst, etwa im Impressum), Listen (-, *, 1., a)),
//   Zitate (>), Tabellen (| … |), Trennlinien (---); inline **fett**, *kursiv*,
//   `Bezeichner`, [Text](https://…), nackte https-Adressen.
// Entwurfsmarken werden erkannt und getrennt ausgezeichnet: Platzhalter [[…]],
// Lücken/Varianten *[…]*, offene Punkte ⟦…⟧ (nur in Arbeitsfassungen).
//
// Kein HTML: es gibt keinen Weg, auf dem ein Text Markup erzeugt. Links nur auf
// https:// — alles andere bleibt Text.

const UEBERSCHRIFT = /^(#{1,6})\s+(.*)$/;
const LISTE = /^(\s*)([-*]|\d+[.)]|[a-z][.)])\s+(.*)$/;
const TABELLE = /^\s*\|/;
const ZITAT = /^\s*>/;
const LINIE = /^\s*---+\s*$/;

function istNeuerBlock(zeile) {
  return UEBERSCHRIFT.test(zeile) || LISTE.test(zeile) || TABELLE.test(zeile) || ZITAT.test(zeile) || LINIE.test(zeile);
}

/** Markdown → Blockliste. */
export function parseLegalMarkdown(markdown) {
  const zeilen = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const bloecke = [];
  let i = 0;
  while (i < zeilen.length) {
    const z = zeilen[i];
    if (z.trim() === "") { i++; continue; }
    // HTML-Kommentare (Markierungen der Entwürfe) erscheinen nie.
    if (/^\s*<!--.*-->\s*$/.test(z)) { i++; continue; }
    const h = UEBERSCHRIFT.exec(z);
    if (h) { bloecke.push({ type: "heading", level: h[1].length, text: h[2].trim() }); i++; continue; }
    if (LINIE.test(z)) { bloecke.push({ type: "rule" }); i++; continue; }
    if (TABELLE.test(z)) {
      const reihen = [];
      while (i < zeilen.length && TABELLE.test(zeilen[i])) {
        const zellen = zeilen[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!zellen.every((c) => /^:?-{2,}:?$/.test(c))) reihen.push(zellen);
        i++;
      }
      if (reihen.length) bloecke.push({ type: "table", head: reihen[0], rows: reihen.slice(1) });
      continue;
    }
    if (ZITAT.test(z)) {
      const innen = [];
      while (i < zeilen.length && ZITAT.test(zeilen[i])) innen.push(zeilen[i++].replace(/^\s*>\s?/, ""));
      bloecke.push({ type: "quote", blocks: parseLegalMarkdown(innen.join("\n")) });
      continue;
    }
    const l = LISTE.exec(z);
    if (l) {
      const punkte = [];
      const geordnet = !/^[-*]$/.test(l[2]);
      while (i < zeilen.length) {
        const m = LISTE.exec(zeilen[i]);
        if (!m || (!/^[-*]$/.test(m[2])) !== geordnet) break;
        const text = [m[3]];
        i++;
        while (i < zeilen.length && zeilen[i].trim() !== "" && !istNeuerBlock(zeilen[i])) text.push(zeilen[i++].trim());
        punkte.push({ marker: geordnet ? m[2] : null, depth: Math.min(3, Math.floor(m[1].replace(/\t/g, "  ").length / 2)), lines: text });
      }
      bloecke.push({ type: "list", ordered: geordnet, items: punkte });
      continue;
    }
    const absatz = [];
    while (i < zeilen.length && zeilen[i].trim() !== "" && !istNeuerBlock(zeilen[i])) absatz.push(zeilen[i++].trim());
    bloecke.push({ type: "paragraph", lines: absatz });
  }
  return bloecke;
}

// ── Inline ─────────────────────────────────────────────────────────────────
// → [{ kind: "text"|"strong"|"code"|"link"|"placeholder"|"gap"|"marker", text, href?, children? }]
const INLINE = /(\*\*[^*\n]+\*\*|⟦[^⟧\n]*⟧|\[\[[A-Z0-9_]+\]\]|(?<!\*)\*\[(?!\[)(?:[^\]\n]|\](?!\*))*\]\*|\[[^\]\n]+\]\(https:\/\/[^)\s]+\)|`[^`\n]+`|https:\/\/[^\s)<>„“"]+[^\s)<>„“".,;:!?])/g;

export function parseLegalInline(text) {
  const out = [];
  const quelle = String(text ?? "");
  let last = 0;
  for (const m of quelle.matchAll(INLINE)) {
    if (m.index > last) out.push(...kursivFrei(quelle.slice(last, m.index)));
    const t = m[0];
    if (t.startsWith("**")) out.push({ kind: "strong", children: parseLegalInline(t.slice(2, -2)) });
    else if (t.startsWith("⟦")) out.push({ kind: "marker", text: t });
    else if (t.startsWith("[[")) out.push({ kind: "placeholder", text: t });
    else if (t.startsWith("*[")) out.push({ kind: "gap", text: t.slice(1, -1) });
    else if (t.startsWith("`")) out.push({ kind: "code", text: t.slice(1, -1) });
    else if (t.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(t);
      out.push({ kind: "link", text: lm[1], href: lm[2] });
    } else out.push({ kind: "link", text: t, href: t });
    last = m.index + t.length;
  }
  if (last < quelle.length) out.push(...kursivFrei(quelle.slice(last)));
  return out;
}

// *kursiv* wird als normaler Text gesetzt (wie im PDF) — die Sternchen fallen.
function kursivFrei(text) {
  return [{ kind: "text", text: text.replace(/(^|[\s(„])\*([^*\s][^*]*?)\*(?=[\s,.;:)“]|$)/g, "$1$2") }];
}

// ── Sprungmarken ─────────────────────────────────────────────────────────────
// Stabil und lesbar, damit Verweise wie /agb#paragraf-8 funktionieren:
//   „§ 8 …“            → paragraf-8
//   „Anlage 1 …“       → anlage-1 (und alles darunter mit Präfix anlage-1-)
//   „Teil B — …“       → teil-b
//   „3. Überblick“ / „Ziff. 4 …“ → ziffer-3 / ziffer-4
//   sonst ein Slug des Texts. Doppelte bekommen -2, -3 …
const UMLAUT = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "ae", Ö: "oe", Ü: "ue" };
function slug(text) {
  return String(text).replace(/[äöüßÄÖÜ]/g, (c) => UMLAUT[c]).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "abschnitt";
}

export function headingIds(blocks) {
  const vergeben = new Map();
  let praefix = "";
  return blocks.map((b) => {
    if (b.type !== "heading" || b.level === 1) return null;
    const t = b.text.replace(/\*\*/g, "").trim();
    let id;
    const anlage = /^Anlage\s+(\d+)\b/.exec(t);
    if (b.level === 2) praefix = anlage ? `anlage-${anlage[1]}-` : "";
    if (anlage && b.level === 2) id = `anlage-${anlage[1]}`;
    else if (/^§\s*(\d+[a-z]?)\b/.test(t)) id = `${praefix}paragraf-${/^§\s*(\d+[a-z]?)/.exec(t)[1]}`;
    else if (/^Teil\s+([A-Z])\b/.test(t)) id = `${praefix}teil-${/^Teil\s+([A-Z])/.exec(t)[1].toLowerCase()}`;
    else if (/^(?:Ziff\.\s*)?(\d+(?:\.\d+)*)\.?\s/.test(t)) id = `${praefix}ziffer-${/^(?:Ziff\.\s*)?(\d+(?:\.\d+)*)/.exec(t)[1].replace(/\./g, "-")}`;
    else id = `${praefix}${slug(t)}`;
    const n = (vergeben.get(id) || 0) + 1;
    vergeben.set(id, n);
    return n === 1 ? id : `${id}-${n}`;
  });
}

/** Titel (erste H1), Blöcke ohne Titel, Sprungmarken und Inhaltsverzeichnis. */
export function legalDocumentModel(markdown, { tocMaxLevel = 2 } = {}) {
  const alle = parseLegalMarkdown(markdown);
  const titelIndex = alle.findIndex((b) => b.type === "heading" && b.level === 1);
  const title = titelIndex === -1 ? null : alle[titelIndex].text;
  const blocks = titelIndex === -1 ? alle : alle.filter((_, k) => k !== titelIndex);
  const ids = headingIds(blocks);
  const toc = blocks
    .map((b, k) => (b.type === "heading" && b.level >= 2 && b.level <= tocMaxLevel ? { level: b.level, text: b.text.replace(/\*\*/g, ""), id: ids[k] } : null))
    .filter(Boolean);
  return { title, blocks, ids, toc };
}

/** Zählt Entwurfsmarken — eine veröffentlichte Fassung hat keine. */
export function countDraftMarks(markdown) {
  const t = String(markdown ?? "");
  return {
    placeholders: (t.match(/\[\[[A-Z0-9_]+\]\]/g) || []).length,
    gaps: (t.match(/(?<!\*)\*\[(?!\[)(?:[^\]\n]|\](?!\*))*\]\*/g) || []).length,
    markers: (t.match(/⟦[^⟧\n]*⟧/g) || []).length,
  };
}
