// Versionshinweis und Offlinehinweis — reine Logik + Strukturverträge.
//
// Run: node --test src/utils/appVersionCheck.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  extractEntryScript, isComparableEntry, hasNewerVersion, updateNoticeSuppressed,
  UPDATE_CHECK_MIN_INTERVAL_MS, UPDATE_CHECK_PERIOD_MS, APP_NOTICE_TEXT,
} from "./appVersionCheck.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

// So sieht die ausgelieferte index.html nach `vite build` aus (gekürzt).
const HTML = (hash) => `<!doctype html><html lang="de"><head>
<link rel="manifest" href="/manifest.webmanifest" />
<script type="module" crossorigin src="/assets/index-${hash}.js"></script>
<link rel="modulepreload" crossorigin href="/assets/jsx-runtime-C7oxC63R.js">
<link rel="stylesheet" crossorigin href="/assets/index-dowXf3DM.css">
</head><body><div id="root"></div></body></html>`;

test("1 — der gehashte Einstiegspunkt wird aus index.html gelesen", () => {
  assert.equal(extractEntryScript(HTML("DJJxlzgt")), "/assets/index-DJJxlzgt.js");
  // Reihenfolge der Attribute ist egal.
  assert.equal(extractEntryScript('<script src="/assets/index-Ab_9-x.js" type="module"></script>'), "/assets/index-Ab_9-x.js");
  // Entwicklungsserver und Fremdes sind nicht vergleichbar.
  assert.equal(extractEntryScript('<script type="module" src="/src/main.jsx"></script>'), null);
  assert.equal(extractEntryScript('<script src="/assets/index-abc.js"></script>'), null, "ohne type=module");
  assert.equal(extractEntryScript('<script type="module" src="https://evil.example/assets/index-x.js"></script>'), null);
  assert.equal(extractEntryScript(""), null);
  assert.equal(extractEntryScript(null), null);
});

test("2 — neue Version nur bei einem ANDEREN gehashten Einstiegspunkt", () => {
  const aktuell = "/assets/index-DJJxlzgt.js";
  assert.equal(hasNewerVersion(aktuell, HTML("DJJxlzgt")), false);
  assert.equal(hasNewerVersion(aktuell, HTML("BDAZmjvc")), true);
  assert.equal(hasNewerVersion(aktuell, "<html>Fehlerseite des Proxys</html>"), false, "unlesbare Antwort ist keine neue Version");
  assert.equal(hasNewerVersion("/src/main.jsx", HTML("BDAZmjvc")), false, "Entwicklungsserver: Prüfung aus");
  assert.equal(hasNewerVersion(null, HTML("BDAZmjvc")), false);
  assert.equal(isComparableEntry("/assets/index-DJJxlzgt.js"), true);
  assert.equal(isComparableEntry("/assets/other-DJJxlzgt.js"), false);
});

test("3 — kein Hinweis im laufenden Versandvorgang", () => {
  assert.equal(updateNoticeSuppressed({ pathname: "/booking" }), true);
  assert.equal(updateNoticeSuppressed({ page: "new" }), true);
  assert.equal(updateNoticeSuppressed({ pathname: "/calculator" }), false);
  assert.equal(updateNoticeSuppressed({ page: "invoices" }), false);
  assert.equal(updateNoticeSuppressed(), false);
});

test("4 — ruhige Prüftakte", () => {
  assert.equal(UPDATE_CHECK_MIN_INTERVAL_MS, 15 * 60 * 1000);
  assert.equal(UPDATE_CHECK_PERIOD_MS, 30 * 60 * 1000);
});

test("5 — Texte: sachlich, ohne Anbieter, Offline nennt Preise und Buchungen", () => {
  for (const t of Object.values(APP_NOTICE_TEXT)) {
    assert.doesNotMatch(t, /jumingo|transglobal|\bTG\b/i, t);
  }
  assert.match(APP_NOTICE_TEXT.offline, /^Keine Internetverbindung\./);
  assert.match(APP_NOTICE_TEXT.offline, /Preise und Buchungen/);
  assert.equal(APP_NOTICE_TEXT.reload, "Neu laden");
});

const hook = ohneKommentare(read("hooks/useAppUpdateAvailable.js"));
const notice = ohneKommentare(read("components/common/AppStatusNotice.jsx"));
const dashPage = ohneKommentare(read("pages/DashboardPage.jsx"));
const dashLayout = ohneKommentare(read("components/layout/DashboardLayout.jsx"));
const online = ohneKommentare(read("hooks/useOnlineStatus.js"));

test("6 — NIE automatisch neu laden: genau ein Reload, und der hängt an einem Klick", () => {
  assert.doesNotMatch(hook, /location\.reload|location\.href\s*=|location\.replace/, "die Prüfung darf nie selbst neu laden");
  const reloads = [...notice.matchAll(/window\.location\.reload\(\)/g)];
  assert.equal(reloads.length, 1, "genau eine Reload-Stelle in der Statuszeile");
  assert.match(notice, /onClick=\{\(\) => window\.location\.reload\(\)\}/, "Neuladen nur als Klickhandler");
  // Geprüft wird die eigene statische index.html — kein Backendaufruf.
  assert.match(hook, /fetch\("\/index\.html", \{ cache: "no-store", credentials: "same-origin" \}\)/);
  assert.doesNotMatch(hook, /apiFetch|VITE_API_URL|Authorization|localStorage/);
});

test("7 — beide Shells zeigen die Statuszeile, der Versandvorgang unterdrückt nur den Versionshinweis", () => {
  assert.match(dashPage, /<AppStatusNotice suppressUpdate=\{updateNoticeSuppressed\(\{ page \}\)\} \/>/);
  assert.match(dashLayout, /<AppStatusNotice suppressUpdate=\{updateNoticeSuppressed\(\{ pathname: location\.pathname \}\)\} \/>/);
  // Offline hat Vorrang und ist nicht unterdrückbar.
  assert.ok(notice.indexOf("if (!online)") < notice.indexOf("if (neueVersion && !suppressUpdate)"));
  // navigator.onLine ist nur ein Hinweis — keine Sperre, kein Modal.
  assert.doesNotMatch(notice, /disabled|aria-modal|role="dialog"/);
  assert.match(online, /navigator\.onLine !== false/);
});

test("8 — die Fehlergrenze nennt offline keinen Versionswechsel", () => {
  const grenze = ohneKommentare(read("components/common/ContentErrorBoundary.jsx"));
  assert.match(grenze, /offline: \{\s*title: "Keine Internetverbindung",/);
  assert.match(grenze, /const offline = chunk && typeof navigator !== "undefined" && navigator\.onLine === false;/);
  assert.match(grenze, /const t = offline \? TEXTE\.offline : chunk \? TEXTE\.chunk : TEXTE\.render;/);
  // Die Handlung bleibt dieselbe — Neuladen nur auf Klick (bestehender Vertrag).
  assert.match(grenze, /onClick=\{chunk \? this\.reload : this\.reset\}/);
});
