// System-Teilen der Empfehlungslinks (Betreiberauftrag 2026-11-22): nur auf Touchgeräten mit navigator.share, geteilt
// wird nur die Adresse, ein Abbruch ist kein Fehler. Geprüft mit nachgebildeter Umgebung.
//
// Run: node --test src/utils/teilen.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { TEILEN_TEXT, linkTeilen, teilenMoeglich } from "./teilen.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const umgebung = ({ share, grob = true, matchMedia } = {}) => ({
  navigator: share === undefined ? {} : { share },
  matchMedia: matchMedia ?? ((q) => ({ matches: q === "(pointer: coarse)" && grob })),
});

test("1 — Teilen nur mit navigator.share UND grobem Zeiger (Touch)", () => {
  const share = async () => {};
  assert.equal(teilenMoeglich(umgebung({ share })), true);
  assert.equal(teilenMoeglich(umgebung({ share, grob: false })), false, "Desktop: Kopieren bleibt die Hauptaktion");
  assert.equal(teilenMoeglich(umgebung({})), false, "ohne navigator.share");
  assert.equal(teilenMoeglich(umgebung({ share: "nein" })), false, "share ist keine Funktion");
  assert.equal(teilenMoeglich({ navigator: { share } }), false, "ohne matchMedia");
  assert.equal(teilenMoeglich(umgebung({ share, matchMedia: () => { throw new Error("x"); } })), false);
  assert.equal(teilenMoeglich(null), false);
  assert.equal(teilenMoeglich({}), false);
});

test("2 — geteilt wird genau die Adresse mit Titel, kein Werbetext", async () => {
  const aufrufe = [];
  const ergebnis = await linkTeilen("https://confidaraexpress.de/register?ref=ABCD2345",
    umgebung({ share: async (d) => { aufrufe.push(d); } }));
  assert.equal(ergebnis, "geteilt");
  assert.deepEqual(aufrufe, [{ title: "ConfidaraExpress", url: "https://confidaraexpress.de/register?ref=ABCD2345" }]);
});

test("3 — Abbruch ist kein Fehler; jede andere Ablehnung ist einer", async () => {
  const ablehnen = (name) => umgebung({ share: async () => { const e = new Error(name); e.name = name; throw e; } });
  assert.equal(await linkTeilen("https://x.example", ablehnen("AbortError")), "abgebrochen");
  assert.equal(await linkTeilen("https://x.example", ablehnen("NotAllowedError")), "fehler");
  assert.equal(await linkTeilen("https://x.example", umgebung({ share: () => { throw new TypeError("sync"); } })), "fehler");
  assert.equal(await linkTeilen("https://x.example", umgebung({})), "fehler", "ohne share kein stiller Erfolg");
  assert.match(TEILEN_TEXT.fehler, /kopieren/i, "der Fehler nennt den Weg über Kopieren");
});

test("4 — die Komponente nutzt diese Funktionen und ruft navigator.share nicht selbst auf", () => {
  const src = readFileSync(path.join(SRC, "components/partner/PartnerLinkCopy.jsx"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/utils\/teilen\.mjs"/);
  assert.match(src, /teilenMoeglich\(\)/);
  assert.match(src, /linkTeilen\(url\)/);
  // Nur Code zählt — der Kopfkommentar der Komponente darf navigator.share erwähnen.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /navigator\.share/);
});
