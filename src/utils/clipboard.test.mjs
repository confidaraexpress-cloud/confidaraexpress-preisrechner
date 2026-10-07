// Kopieren in die Zwischenablage (UX-Paket 1): „Kopiert" erst nach echtem Kopieren,
// sonst false und ein manueller Weg. Beide Wege (Clipboard-API, älterer
// execCommand-Weg) werden mit einer nachgebildeten Umgebung geprüft.
//
// Run: node --test src/utils/clipboard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { COPY_TEXTS, copyToClipboard, selectElementText } from "./clipboard.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");
const ohneKommentare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// Nachgebildetes DOM — nur, was der ältere Kopierweg braucht.
function fakeDocument({ execResult = true, execThrows = false } = {}) {
  const log = [];
  const button = { focused: 0, focus() { this.focused += 1; } };
  const body = {
    children: [],
    appendChild(el) { this.children.push(el); log.push("append"); },
    removeChild(el) { this.children = this.children.filter((c) => c !== el); log.push("removeChild"); },
  };
  const doc = {
    body,
    activeElement: button,
    createElement(tag) {
      const el = {
        tag, value: "", attrs: {}, style: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        select() { log.push(`select:${this.value}`); },
        remove() { body.children = body.children.filter((c) => c !== el); log.push("remove"); },
      };
      return el;
    },
    execCommand(cmd) {
      log.push(`exec:${cmd}`);
      if (execThrows) throw new Error("nicht unterstützt");
      return execResult;
    },
  };
  return { doc, log, button, body };
}

test("1 — Clipboard-API erfolgreich → true, kein älterer Weg", async () => {
  const geschrieben = [];
  const { doc, log } = fakeDocument();
  const env = { navigator: { clipboard: { writeText: async (t) => { geschrieben.push(t); } } }, document: doc };
  assert.equal(await copyToClipboard("https://confidaraexpress.de/register?ref=ABCD2345", env), true);
  assert.deepEqual(geschrieben, ["https://confidaraexpress.de/register?ref=ABCD2345"]);
  assert.deepEqual(log, [], "der ältere Weg läuft nur, wenn die API scheitert");
});

test("2 — Clipboard-API lehnt ab, älterer Weg kopiert → true; Textfeld wieder entfernt, Fokus zurück", async () => {
  const { doc, log, button, body } = fakeDocument({ execResult: true });
  const env = { navigator: { clipboard: { writeText: async () => { throw new Error("NotAllowedError"); } } }, document: doc };
  assert.equal(await copyToClipboard("CE-AB26-00042", env), true);
  assert.deepEqual(log, ["append", "select:CE-AB26-00042", "exec:copy", "remove"]);
  assert.equal(body.children.length, 0, "kein verwaistes Textfeld");
  assert.equal(button.focused, 1, "der Fokus kehrt zum auslösenden Knopf zurück");
});

test("3 — beide Wege scheitern → false (keine falsche Erfolgsmeldung)", async () => {
  const abgelehnt = { navigator: { clipboard: { writeText: async () => { throw new Error("NotAllowedError"); } } } };
  assert.equal(await copyToClipboard("ABCD2345", { ...abgelehnt, document: fakeDocument({ execResult: false }).doc }), false);
  assert.equal(await copyToClipboard("ABCD2345", { ...abgelehnt, document: fakeDocument({ execThrows: true }).doc }), false);
  // Ohne Clipboard-API (z. B. unsichere Herkunft) und ohne DOM.
  assert.equal(await copyToClipboard("ABCD2345", { navigator: {} }), false);
  assert.equal(await copyToClipboard("ABCD2345", {}), false);
  assert.equal(await copyToClipboard("ABCD2345", null), false);
});

test("4 — leerer Wert → false, ohne Kopierversuch", async () => {
  let aufrufe = 0;
  const env = { navigator: { clipboard: { writeText: async () => { aufrufe += 1; } } } };
  assert.equal(await copyToClipboard("", env), false);
  assert.equal(await copyToClipboard(null, env), false);
  assert.equal(aufrufe, 0);
});

test("5 — Markieren für das manuelle Kopieren", () => {
  const auswahl = { ranges: [], removeAllRanges() { this.ranges = []; }, addRange(r) { this.ranges.push(r); } };
  const env = {
    document: { createRange: () => ({ node: null, selectNodeContents(n) { this.node = n; } }) },
    getSelection: () => auswahl,
  };
  const el = { id: "link" };
  assert.equal(selectElementText(el, env), true);
  assert.equal(auswahl.ranges.length, 1);
  assert.equal(auswahl.ranges[0].node, el);
  assert.equal(selectElementText(null, env), false);
  assert.equal(selectElementText(el, {}), false);
  assert.equal(selectElementText(el, { document: { createRange: () => { throw new Error("x"); } }, getSelection: () => auswahl }), false);
});

test("6 — Texte: kurz, deutsch, mit manuellem Weg", () => {
  assert.equal(COPY_TEXTS.copied, "Kopiert");
  assert.match(COPY_TEXTS.failedSelected, /^Kopieren nicht möglich/);
  assert.match(COPY_TEXTS.failedSelected, /manuell kopieren/);
  assert.match(COPY_TEXTS.failed, /markieren und manuell kopieren/);
});

test("7 — CopyableNumber meldet Erfolg erst nach dem Kopieren und markiert bei Fehlschlag", () => {
  const src = ohneKommentare(read("components/ui/CopyableNumber.jsx"));
  assert.match(src, /const ok = await copyToClipboard\(text\);/);
  assert.match(src, /if \(ok\) \{\s*setFeedback\(\{ ok: true, text: COPY_TEXTS\.copied \}\);/);
  assert.match(src, /selectElementText\(textRef\.current\)/);
  assert.doesNotMatch(src, /\.catch\(\(\) => \{\}\);\s*setCopied\(true\)/, "der frühere falsch-positive Weg ist zurück");
  assert.doesNotMatch(src, /navigator\.clipboard/, "Kopieren läuft nur über utils/clipboard.mjs");
  // Barrierefreiheit unverändert (businessNumbers.test.mjs, Test 16).
  assert.match(src, /role="status"/);
  assert.match(src, /aria-live="polite"/);
  assert.match(src, /wordBreak: "break-all"/);
});
