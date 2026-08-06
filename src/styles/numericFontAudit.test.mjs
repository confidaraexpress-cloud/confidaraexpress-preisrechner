// Systemweite Absicherung: durchgestrichene Null vollständig entfernt.
//
// DM Mono trägt eine durchgestrichene Null als NICHT abschaltbaren Standard-
// glyphen (belegt per Pixel-Scanline-Analyse und A/B-Test gegen
// `font-feature-settings: "zero" 0/1` in der vorangegangenen Analyse — beide
// wirkungslos). Jede Ziffern- oder Geschäftsnummernfläche verwendet deshalb
// ausschließlich `var(--ce-font-numeric)` (zeigt auf DM Sans). Dieser Test
// deckt zwei Dinge ab, die reine Stichproben nicht erreichen:
//   1. Es existiert AKTUELL keine aktive `'DM Mono'`-/generische-Monospace-
//      Referenz mehr in nutzerseitig sichtbaren Quelldateien.
//   2. Ein KÜNFTIGES Wiedereinführen von DM Mono (oder eines unkontrollierten
//      System-Monospace-Stapels) in einer Zahlenfläche lässt genau diesen
//      Test fehlschlagen — ohne dass die Testdatei dafür angepasst werden muss.
//
// Bewusst quelltextnah (kein DOM, keine neue Abhängigkeit) — Projektkonvention
// dieses Repos. Die Glyphen-Regressionsprüfung (Canvas-Rendering der echten
// DM-Sans-Datei) liegt separat in tests/e2e/numericFontGlyph.test.mjs, weil sie
// einen Browser braucht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const SRC = path.join(ROOT, "src");

// Alle Quelldateien unter src/ rekursiv einsammeln (kein node_modules/dist —
// die liegen ohnehin außerhalb von src/). Testdateien selbst ausgenommen: sie
// dürfen den Namen zu Dokumentationszwecken nennen (dieser Kommentarblock hier
// zum Beispiel).
function collectSourceFiles(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) { collectSourceFiles(full, exts, out); continue; }
    if (entry.endsWith(".test.mjs") || entry.endsWith(".test.js")) continue;
    if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const cssFiles = collectSourceFiles(path.join(SRC, "styles"), [".css"]);
const jsFiles = collectSourceFiles(SRC, [".jsx", ".js", ".mjs"]).filter((f) => !f.includes(`${path.sep}styles${path.sep}`));

const read = (f) => readFileSync(f, "utf8");
const rel = (f) => path.relative(ROOT, f);

test("1 — keine aktive 'DM Mono'-Referenz mehr in src/ (Literal, Kommentar oder Token)", () => {
  const treffer = [];
  for (const f of [...cssFiles, ...jsFiles]) {
    if (read(f).includes("DM Mono")) treffer.push(rel(f));
  }
  assert.deepEqual(treffer, [], `'DM Mono' taucht noch auf in: ${treffer.join(", ")}`);
});

test("2 — kein --fm-Token mehr definiert oder referenziert", () => {
  const definiert = [], referenziert = [];
  for (const f of cssFiles) {
    const c = read(f);
    if (/--fm\s*:/.test(c)) definiert.push(rel(f));
    if (/var\(--fm\)/.test(c)) referenziert.push(rel(f));
  }
  assert.deepEqual(definiert, [], `--fm wird noch definiert in: ${definiert.join(", ")}`);
  assert.deepEqual(referenziert, [], `var(--fm) wird noch referenziert in: ${referenziert.join(", ")}`);
});

test("3 — kein generischer 'monospace'/'ui-monospace'-Stapel mehr für sichtbare Zahlen", () => {
  // Explizite Allowlist für Fälle, die NICHT ziffernlastige, sichtbare UI sind.
  // Aktuell leer: die letzte bekannte Ausnahme (.sup-ticket, Support-Ticketnummer)
  // wurde auf --ce-font-numeric migriert. Jeder neue Treffer muss bewusst either
  // hierher (mit Begründung) oder auf --ce-font-numeric migriert werden.
  const ALLOWLIST = [];
  const treffer = [];
  for (const f of cssFiles) {
    const c = read(f);
    for (const m of c.matchAll(/font-family:\s*([^;]+);/g)) {
      const decl = m[1];
      if (/\bmonospace\b|\bui-monospace\b/i.test(decl) && !ALLOWLIST.includes(rel(f))) {
        treffer.push(`${rel(f)}: ${decl.trim()}`);
      }
    }
  }
  assert.deepEqual(treffer, [], `generischer Monospace-Stapel gefunden: ${treffer.join(" | ")}`);
  // Inline-JSX-Styles ebenfalls prüfen (fontFamily: "monospace" o. ä.).
  const jsxTreffer = [];
  for (const f of jsFiles) {
    const c = read(f);
    for (const m of c.matchAll(/fontFamily:\s*["'`]([^"'`]+)["'`]/g)) {
      if (/\bmonospace\b|\bui-monospace\b/i.test(m[1])) jsxTreffer.push(`${rel(f)}: ${m[1]}`);
    }
  }
  assert.deepEqual(jsxTreffer, [], `generischer Monospace-Stapel in Inline-Style: ${jsxTreffer.join(" | ")}`);
});

test("4 — --ce-font-numeric ist global definiert und zeigt auf DM Sans mit Sans-Fallback", () => {
  const vars = read(path.join(SRC, "styles", "variables.css"));
  const m = vars.match(/--ce-font-numeric:\s*([^;]+);/);
  assert.ok(m, "--ce-font-numeric fehlt in variables.css");
  assert.match(m[1], /'DM Sans'/, "der Token muss auf DM Sans zeigen");
  assert.ok(!/monospace/i.test(m[1]), "der Numeric-Token darf keinen Monospace-Fallback enthalten");
  // In :root definiert (global), nicht in einem Shell-Scope gefangen —
  // sonst erreichen admin.css/calculator.css/drafts.css/offers.css/support.css
  // (außerhalb .app-shell) den Token nicht.
  const rootBlock = vars.slice(vars.indexOf(":root"), vars.indexOf("--ce-font-numeric"));
  assert.ok(!rootBlock.includes("}"), "--ce-font-numeric muss innerhalb von :root stehen, nicht in einem Shell-Scope");
});

/* Alle Regelrümpfe eines Selektors — nicht nur den ersten. Ein Selektor kann
   mehrfach vorkommen (Grundregel + Responsive-Block); `String.match` liefert
   die textlich erste Fundstelle, und die muss nicht die Grundregel sein.
   Geprüft wird deshalb, ob die Zusicherung IRGENDWO für diesen Selektor steht. */
function regelRuempfe(css, selektor) {
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]);
}

test("5 — bekannte Ziffern-/Geschäftsnummernselektoren verwenden var(--ce-font-numeric)", () => {
  const SELEKTOREN = [
    ["overview.css", ".pp-step-no"],
    ["overview.css", ".pp-car-time"],
    ["dashboard.css", ".inv-cell-number-value"],
    ["dashboard-premium.css", ".ce-mail-dialog-addr"],
    ["drafts.css", ".dft-cell-route"],
    ["drafts.css", ".dft-card-route"],
    ["offers.css", ".offer-detail-row--subtle .offer-detail-value"],
    ["offers.css", ".offer-feature-value--subtle"],
    ["calculator.css", ".vol-weight-value"],
    ["calculator.css", ".booking-price-display"],
    ["calculator.css", ".offsum-price-net"],
    ["calculator.css", ".booking-total-amount"],
    ["calculator.css", ".ins-card-price-val"],
    ["calculator.css", ".blsum-price-net"],
    ["calculator.css", ".blsum-price-gross"],
    ["calculator.css", ".price-drift-old"],
    ["calculator.css", ".price-drift-new"],
    ["calculator.css", ".tracking-id-value"],
    ["admin.css", ".adm-action-raw"],
    ["admin.css", ".adm-party-id"],
    ["admin.css", ".adm-mono"],
    ["admin.css", ".adm-mask"],
    ["admin.css", ".adm-idlink"],
    ["admin.css", ".adm-modal-input"],
    ["admin.css", ".adm-markup-input"],
    ["admin.css", ".adm-ship-no"],
    ["admin.css", ".adm-ship-no-muted"],
    ["admin.css", ".adm-ship-cust-no"],
    ["admin.css", ".adm-inv-no"],
    ["admin.css", ".adm-inv-cust-no"],
    ["admin.css", ".adm-canc-ship-no"],
    ["admin.css", ".adm-canc-ship-no-muted"],
    ["layout.css", ".mono"],
    ["support.css", ".sup-ticket"],
  ];
  const cache = {};
  for (const [datei, selektor] of SELEKTOREN) {
    cache[datei] ??= read(path.join(SRC, "styles", datei));
    const ruempfe = regelRuempfe(cache[datei], selektor);
    assert.ok(ruempfe.length, `${selektor} nicht gefunden in ${datei}`);
    assert.ok(ruempfe.some((r) => /font-family:\s*var\(--ce-font-numeric\)/.test(r)),
      `${selektor} in ${datei} verwendet nicht var(--ce-font-numeric): ${ruempfe.join(" | ").trim()}`);
  }
});

test("6 — Ausrichtung (tabular-nums) bleibt an spaltenkritischen Stellen erhalten", () => {
  const admin = read(path.join(SRC, "styles", "admin.css"));
  const calc = read(path.join(SRC, "styles", "calculator.css"));
  const dashboard = read(path.join(SRC, "styles", "dashboard.css"));
  for (const [c, sel] of [
    [admin, ".adm-mono"], [admin, ".adm-ship-no"], [admin, ".adm-inv-no"],
    [admin, ".adm-markup-input"], [calc, ".booking-price-display"],
    [calc, ".ins-card-price-val"], [calc, ".blsum-price-gross"],
    [dashboard, ".inv-cell-number-value"],
  ]) {
    const ruempfe = regelRuempfe(c, sel);
    assert.ok(ruempfe.length, `${sel} nicht gefunden`);
    assert.ok(ruempfe.some((r) => /font-variant-numeric:\s*tabular-nums/.test(r)),
      `${sel}: tabular-nums fehlt`);
  }
});

test("7 — KPI-Karten bleiben unverändert (kein --fm, keine Regression aus vorheriger Session)", () => {
  const overview = read(path.join(SRC, "styles", "overview.css"));
  const kpiStart = overview.indexOf(".pp-kpis");
  const kpiSektion = overview.slice(kpiStart, overview.indexOf(".pp-sec {", kpiStart));
  assert.ok(!/var\(--fm\)/.test(kpiSektion), "KPI-Sektion darf --fm nicht referenzieren");
  assert.match(kpiSektion, /\.knum\s*\{[^}]*font-family:\s*var\(--fs\)/, "KPI-Wert muss weiterhin --fs (DM Sans) nutzen");
});

test("8 — DM-Mono-Fontdateien sind aus dem Repository entfernt", () => {
  const fontsDir = path.join(SRC, "assets", "fonts");
  for (const datei of ["dmmono-400.woff2", "dmmono-500.woff2"]) {
    assert.ok(!existsSync(path.join(fontsDir, datei)), `${datei} sollte entfernt sein, existiert aber noch`);
  }
  const fontsCss = read(path.join(SRC, "styles", "fonts.css"));
  assert.ok(!/font-family:\s*'DM Mono'/.test(fontsCss), "fonts.css deklariert noch eine DM-Mono-@font-face-Regel");
});

test("9 — DM Sans (der neue Zahlen-Font) ist weiterhin real eingebunden", () => {
  const fontsCss = read(path.join(SRC, "styles", "fonts.css"));
  assert.match(fontsCss, /font-family:\s*'DM Sans'/, "DM Sans muss weiterhin per @font-face geladen werden");
  const fontsDir = path.join(SRC, "assets", "fonts");
  assert.ok(existsSync(path.join(fontsDir, "dmsans-300.woff2")), "die DM-Sans-Fontdatei fehlt");
});
