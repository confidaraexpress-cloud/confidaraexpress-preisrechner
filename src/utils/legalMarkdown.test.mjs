import test from "node:test";
import assert from "node:assert/strict";
import { countDraftMarks, headingIds, legalDocumentModel, parseLegalInline, parseLegalMarkdown } from "./legalMarkdown.mjs";

test("Blöcke: Überschrift, Absatz mit harten Zeilenumbrüchen, Listen, Tabelle, Zitat, Linie", () => {
  const b = parseLegalMarkdown("# Titel\n\nZeile 1\nZeile 2\n\n- a\n- b\n\n1. eins\n2. zwei\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n> Hinweis\n\n---\n<!-- intern -->");
  assert.deepEqual(b.map((x) => x.type), ["heading", "paragraph", "list", "list", "table", "quote", "rule"]);
  assert.deepEqual(b[1].lines, ["Zeile 1", "Zeile 2"]);
  assert.equal(b[2].ordered, false);
  assert.deepEqual(b[3].items.map((i) => i.marker), ["1.", "2."]);
  assert.deepEqual(b[4].head, ["x", "y"]);
  assert.deepEqual(b[4].rows, [["1", "2"]]);
});

test("Inline: fett, Bezeichner, https-Links, Entwurfsmarken — nie HTML", () => {
  const r = parseLegalInline("**Fett** `ce_token` [Lizenz](https://example.org/x) https://a.example/b. [[UG_FIRMA]] *[offen: Entscheidung H1]* ⟦TECHNIK: x⟧ <b>nein</b> [x](javascript:alert(1))");
  const arten = r.filter((x) => x.kind !== "text").map((x) => x.kind);
  assert.deepEqual(arten, ["strong", "code", "link", "link", "placeholder", "gap", "marker"]);
  assert.equal(r.find((x) => x.kind === "link").href, "https://example.org/x");
  assert.equal(r.filter((x) => x.kind === "link")[1].href, "https://a.example/b", "Satzpunkt gehört nicht zur Adresse");
  const text = r.filter((x) => x.kind === "text").map((x) => x.text).join("");
  assert.match(text, /<b>nein<\/b>/, "HTML bleibt Text");
  assert.match(text, /\[x\]\(javascript:alert\(1\)\)/, "kein Link außer https");
});

test("bereits fett gesetzte ADSp-Kennzeichnung ist keine Entwurfsmarke", () => {
  const r = parseLegalInline("Satz. **[Abweichung von Ziff. 29.1 ADSp]**");
  assert.ok(r.some((x) => x.kind === "strong"));
  assert.ok(!r.some((x) => x.kind === "gap"));
  assert.equal(countDraftMarks("Satz. **[Abweichung von Ziff. 29.1 ADSp]**").gaps, 0);
});

test("Sprungmarken: § → paragraf-n, Anlagen mit Präfix, Teile, Ziffern, Dubletten eindeutig", () => {
  const md = [
    "# AGB", "## Teil A — Allgemeines", "### § 1 Geltung", "### § 15 Haftung",
    "## Anlage 1 zu den AGB: ADSp", "### ADSp 2017", "#### 1. Begriffsbestimmungen",
    "## Anlage 2 zu den AGB", "#### Teil A — Grundsätze", "## Hinweise", "## Hinweise",
  ].join("\n\n");
  const m = legalDocumentModel(md, { tocMaxLevel: 3 });
  assert.equal(m.title, "AGB");
  const ids = m.ids.filter(Boolean);
  assert.deepEqual(ids, ["teil-a", "paragraf-1", "paragraf-15", "anlage-1", "anlage-1-adsp-2017", "anlage-1-ziffer-1",
    "anlage-2", "anlage-2-teil-a", "hinweise", "hinweise-2"]);
  assert.deepEqual(m.toc.map((t) => t.id), ["teil-a", "paragraf-1", "paragraf-15", "anlage-1", "anlage-1-adsp-2017", "anlage-2", "hinweise", "hinweise-2"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("headingIds: Absätze bekommen keine Marke", () => {
  assert.deepEqual(headingIds(parseLegalMarkdown("Text\n\n## 3. Überblick")), [null, "ziffer-3"]);
});

test("Entwurfsmarken zählen", () => {
  assert.deepEqual(countDraftMarks("[[A]] [[B]] *[x]* ⟦TECHNIK: y⟧ **[Abweichung von Ziff. 1 ADSp]**"), { placeholders: 2, gaps: 1, markers: 1 });
  assert.deepEqual(countDraftMarks("Freigegebener Text."), { placeholders: 0, gaps: 0, markers: 0 });
});
