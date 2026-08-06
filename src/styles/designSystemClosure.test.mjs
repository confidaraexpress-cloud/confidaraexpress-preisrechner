// Abschluss-Governance des Designsystems (Pakete A–E).
//
// Diese Datei prüft nicht ein einzelnes Paket, sondern den Endzustand: dass es
// systemweit GENAU EIN Designsystem gibt und dass sich kein toter Bestand mehr
// ansammeln kann. Sie ist bewusst die einzige Stelle, an der die
// bereichsübergreifenden Verbote zentral stehen — die Paket-Tests bleiben für
// ihre jeweiligen Bereichsausnahmen zuständig.
//
// Drei dokumentierte Ausnahmen, jede mit eigener Begründung und eigener
// Governance:
//   • auth.css                — Glaswelt des Auth-Bereichs (eigenes Paket)
//   • overview.css            — die vier KPI-Karten (overviewKpiCards.test.mjs)
//   • dashboard-premium.css   — Sidebar-Chrome (appShellChrome.test.mjs)
//
// Run: node --test src/styles/designSystemClosure.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const STYLES = new URL("./", import.meta.url);
const SRC = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const ALLE_CSS = readdirSync(STYLES).filter((f) => f.endsWith(".css")).sort();
const css = Object.fromEntries(ALLE_CSS.map((f) => [f, ohneKommentare(read(`./${f}`))]));
const variables = css["variables.css"];

/** Alle produktiven Quelldateien (ohne Tests). */
function quellen(verzeichnis = SRC, gesammelt = []) {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = new URL(eintrag, verzeichnis);
    if (statSync(pfad).isDirectory()) { quellen(new URL(`${eintrag}/`, verzeichnis), gesammelt); continue; }
    if (!/\.(jsx|js|mjs)$/.test(eintrag) || eintrag.includes(".test.")) continue;
    gesammelt.push([eintrag, readFileSync(pfad, "utf8")]);
  }
  return gesammelt;
}
const QUELLEN = quellen();
const QUELLTEXT = QUELLEN.map(([, t]) => t).join("\n");

// Bereichsdateien, die ihr eigenes, geprüftes Material tragen.
const EIGENMATERIAL = ["auth.css", "overview.css", "dashboard-premium.css"];
const MIGRIERT = ALLE_CSS.filter((f) => f !== "variables.css" && f !== "fonts.css" && !EIGENMATERIAL.includes(f));

/* ══════════ 1 — eine Markenfarbe, eine Textfarbrolle ═════════════════════ */

test("1 — es gibt genau eine Markenfarbe und ein Legacy-Blau zeigt darauf", () => {
  assert.match(variables, /--ce-color-brand:\s*#5367e8;/);
  // Jeder verbliebene Blaualias löst auf die Marke auf.
  for (const [alias, ziel] of [["blue", "ce-color-brand-active"], ["blue2", "ce-color-brand"],
                               ["blue3", "ce-color-brand"], ["blue-light", "ce-color-brand-soft"],
                               ["accent-blue", "ce-color-brand"]]) {
    assert.match(variables, new RegExp(`--${alias}:\\s*var\\(--${ziel}\\);`), `--${alias} zeigt nicht auf --${ziel}`);
  }
  // Und in den migrierten Blättern taucht kein rohes Legacy-Blau mehr auf.
  const LEGACY_BLAU = /#1d4ed8|#2563eb|#1e40af|rgba\(\s*29\s*,\s*78\s*,\s*216/i;
  const treffer = MIGRIERT.filter((f) => LEGACY_BLAU.test(css[f])).map((f) => f);
  assert.deepEqual(treffer, [], `Legacy-Blau als Literal: ${treffer.join(", ")}`);
});

/* ══════════ 2 — kein toter Tokenbestand ═════════════════════════════════ */

test("2 — jeder Legacy-Alias hat einen produktiven Aufrufer", () => {
  const namen = [...variables.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])
    .filter((n) => !n.startsWith("--ce-"));
  const bereichsCss = MIGRIERT.concat(EIGENMATERIAL).map((f) => css[f]).join("\n");
  const ohne = namen.filter((n) => {
    const muster = new RegExp(n.replace(/-/g, "\\-") + "(?![\\w-])");
    return !muster.test(bereichsCss) && !muster.test(QUELLTEXT);
  });
  assert.deepEqual([...new Set(ohne)], [],
    `Legacy-Aliase ohne produktiven Aufrufer:\n  ${[...new Set(ohne)].join("\n  ")}`);
});

test("3 — keine Bereichsdatei liest eine Variable, die es nicht gibt", () => {
  const definiert = new Set([...variables.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
  // Lokale Custom Properties, die eine Regel selbst setzt, zählen ebenfalls.
  for (const f of ALLE_CSS) {
    for (const m of css[f].matchAll(/(--[\w-]+):\s*[^;]+;/g)) definiert.add(m[1]);
  }
  const fehlend = [];
  for (const f of ALLE_CSS) {
    for (const m of css[f].matchAll(/var\((--[\w-]+)\s*(,|\))/g)) {
      // Mit Fallback ist es eine bewusste Absicherung, ohne Fallback ein Fehler.
      if (m[2] === ")" && !definiert.has(m[1])) fehlend.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(fehlend)], [],
    `undefinierte Variablen ohne Fallback:\n  ${[...new Set(fehlend)].join("\n  ")}`);
});

/* ══════════ 4 — Material: Radius, Tiefe, Overlay, Glow ══════════════════ */

test("4 — kein freier Schatten und kein farbiger Glow außerhalb des Auth-Bereichs", () => {
  // (a) Tiefe steht als Wert NUR in variables.css. Eine Regel schreibt keinen
  //     Farbwert in ihren Schatten — sie verweist. Das ist die schärfere
  //     Fassung: sie prüft nicht, aus welcher Datei ein Schatten kommt,
  //     sondern dass überhaupt keiner frei geschrieben wird.
  const frei = [];
  for (const f of ALLE_CSS) {
    if (f === "variables.css" || f === "auth.css") continue;   // Werteablage · Glaswelt
    for (const m of css[f].matchAll(/box-shadow:\s*([^;}]+)/g)) {
      const v = m[1].trim().replace(/\s+/g, " ");
      if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(v)) frei.push(`${f}: ${v.slice(0, 60)}`);
    }
  }
  assert.deepEqual(frei, [], `frei geschriebene Schatten:\n  ${frei.join("\n  ")}`);

  // (b) Kein farbiger Glow. Jeder Schattenton der Ablage ist neutral (Navy
  //     rgba(17,26,51) / rgba(6,10,24)) oder weißes Streiflicht. Einzige
  //     Ausnahme: --auth-blue-glow, das Signaturlicht des Auth-Bereichs.
  const bunt = [];
  for (const m of variables.matchAll(/(--[\w-]*(?:shadow|elevation|glow)[\w-]*):\s*([^;]+);/g)) {
    if (m[1].startsWith("--auth-")) continue;
    for (const c of m[2].matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      const [r, g, b] = [+c[1], +c[2], +c[3]];
      const neutralGrau = Math.max(r, g, b) - Math.min(r, g, b) < 45;
      const navy = b > r && b < 90 && r < 40;
      if (!neutralGrau && !navy) bunt.push(`${m[1]}: rgb(${r},${g},${b})`);
    }
  }
  assert.deepEqual(bunt, [], `farbiger Schatten:\n  ${bunt.join("\n  ")}`);

  // backdrop-filter und Blur ausschließlich im Auth-Bereich.
  for (const f of ALLE_CSS) {
    if (f === "auth.css") continue;
    for (const m of css[f].matchAll(/backdrop-filter:\s*([^;}]+)/g)) {
      assert.equal(m[1].trim(), "none", `${f}: backdrop-filter ${m[1]}`);
    }
    assert.doesNotMatch(css[f], /filter:\s*blur\(/, `${f}: Blur außerhalb des Auth-Bereichs`);
  }
});

test("5 — es gibt genau einen Overlayton", () => {
  const eigen = [];
  for (const f of ALLE_CSS) {
    for (const m of css[f].matchAll(/([-\w.]*overlay[-\w.]*)\s*\{([^}]*)\}/gi)) {
      if (/position:\s*fixed/.test(m[2]) && /background:\s*(rgba|#)/.test(m[2])) {
        eigen.push(`${f}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(eigen, [], `eigener Overlayton:\n  ${eigen.join("\n  ")}`);
  assert.match(variables, /--ce-color-overlay:\s*rgba\(17, 26, 51, 0\.45\);/);
  assert.match(variables, /--ce-color-overlay-drawer:\s*rgba\(17, 26, 51, 0\.55\);/);
});

/* ══════════ 6 — Schrift ═════════════════════════════════════════════════ */

test("6 — es werden nur die beiden benutzten Schriftfamilien geladen", () => {
  const fonts = ohneKommentare(read("./fonts.css"));
  const familien = [...new Set([...fonts.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(familien, ["Cormorant Garamond", "DM Sans"]);
  // Jede geladene Datei existiert, und es liegt keine ungenutzte Datei herum.
  const geladen = new Set([...fonts.matchAll(/url\('\.\.\/assets\/fonts\/([^']+)'\)/g)].map((m) => m[1]));
  const vorhanden = new Set(readdirSync(new URL("../assets/fonts/", import.meta.url)));
  for (const d of geladen) assert.ok(vorhanden.has(d), `fonts.css lädt ${d}, die Datei fehlt`);
  for (const d of vorhanden) assert.ok(geladen.has(d), `${d} liegt ungenutzt im Repository`);
  // Kein UI-Gewicht über 600.
  for (const f of ALLE_CSS) {
    for (const m of css[f].matchAll(/font-weight:\s*(\d+|bold|bolder)/g)) {
      if (f === "fonts.css") continue;
      const w = m[1] === "bold" || m[1] === "bolder" ? 700 : Number(m[1]);
      assert.ok(w <= 600, `${f}: font-weight ${m[1]}`);
    }
  }
});

/* ══════════ 7 — Abhängigkeiten ══════════════════════════════════════════ */

test("7 — es gibt keine ungenutzte UI-Abhängigkeit", () => {
  const pkg = JSON.parse(read("../../package.json"));
  const deps = Object.keys(pkg.dependencies || {}).sort();
  assert.deepEqual(deps, ["@vitejs/plugin-react", "react", "react-dom", "react-router-dom", "vite"]);
  // Keine fremde Iconbibliothek — das Produkt hat sein eigenes System.
  for (const [name, inhalt] of QUELLEN) {
    assert.doesNotMatch(inhalt, /from\s+["'](lucide-react|react-icons|@heroicons|@tabler\/icons|feather-icons)/,
      `${name}: fremde Iconbibliothek`);
  }
  assert.ok(existsSync(new URL("../components/ui/Icon.jsx", import.meta.url)));
  // Und das Lockfile kennt sie ebenfalls nicht mehr.
  assert.doesNotMatch(read("../../package-lock.json"), /"node_modules\/lucide-react"/,
    "lucide-react steht noch im Lockfile");
});

/* ══════════ 8 — Zustände und Beschriftungen ═════════════════════════════ */

test("8 — kein Emoji als Bedienelement, keine unbeschrifteten Iconbuttons", () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const mitEmoji = QUELLEN.filter(([, t]) => emoji.test(t)).map(([n]) => n);
  assert.deepEqual(mitEmoji, [], `Emoji in Quelldateien: ${mitEmoji.join(", ")}`);

  const ohneLabel = [];
  for (const [name, t] of QUELLEN) {
    for (const m of t.matchAll(/<button\b([^>]*)>\s*(?:\{[^{}]*\}\s*)?<Icon\b[^/]*\/>\s*<\/button>/g)) {
      if (!/aria-label|title=/.test(m[1])) ohneLabel.push(name);
    }
  }
  assert.deepEqual([...new Set(ohneLabel)], [], `Iconbuttons ohne Beschriftung: ${ohneLabel.join(", ")}`);
});

test("9 — jede Tabelle ist beschriftet und jede Zahlenspalte markiert", () => {
  const ohneCaption = [];
  for (const [name, t] of QUELLEN) {
    for (const m of t.matchAll(/<table\b[^>]*>/g)) {
      if (!/<caption/.test(t.slice(m.index, m.index + 400))) ohneCaption.push(name);
    }
  }
  assert.deepEqual([...new Set(ohneCaption)], [], `Tabellen ohne <caption>: ${ohneCaption.join(", ")}`);
  // Die beiden Zahlenmarker richten rechts aus und laufen tabellarisch.
  for (const [datei, sel] of [["primitives.css", ".ce-num"], ["admin.css", ".adm-num"]]) {
    const block = css[datei].match(new RegExp(`\\${sel} \\{([^}]*)\\}`))[1];
    assert.match(block, /text-align:\s*right/, `${sel}: nicht rechtsbündig`);
    assert.match(block, /font-variant-numeric:\s*tabular-nums/, `${sel}: keine Tabellenziffern`);
    assert.match(block, /font-feature-settings:\s*"tnum"/, `${sel}: tnum fehlt`);
  }
});

/* ══════════ 10 — Fokus und Menüs ════════════════════════════════════════ */

test("10 — jedes Aktionsmenü gibt den Fokus an seinen Trigger zurück", () => {
  // Alle drei Kebab-Menüs des Produkts. Sie öffnen Dialoge; ohne diese Rückgabe
  // merkt sich der Dialog den verschwindenden Menüeintrag und der Fokus landet
  // nach dem Schließen auf <body>.
  for (const pfad of ["components/addressbook/AddressActionsMenu.jsx",
                      "components/drafts/DraftActionsMenu.jsx",
                      "components/admin/CustomerRowActions.jsx"]) {
    const src = read(`../${pfad}`);
    assert.match(src, /triggerRef\.current\?\.focus\(\);\s*\n\s*(fn|onDelete|onSelect)\?\./,
      `${pfad}: Fokusrückgabe fehlt oder steht nach der Aktion`);
    assert.match(src, /e\.key === "Escape"/, `${pfad}: Escape fehlt`);
  }
  // Der gemeinsame Dialoghook liefert Falle, Escape und Rückgabe.
  const hook = read("../hooks/useDialog.js");
  for (const zusicherung of [/e\.key !== "Tab"/, /e\.key === "Escape"/,
                             /rueckgabeRef\.current = document\.activeElement/, /ziel\.focus\(\)/]) {
    assert.match(hook, zusicherung, "useDialog ist unvollständig");
  }
});

/* ══════════ 11 — Grenzen ════════════════════════════════════════════════ */

test("11 — weder API noch Routen wurden im Abschlusspaket verändert", () => {
  const api = read("../api/adminApi.js");
  const client = read("../api/client.js");
  const app = read("../App.jsx");
  // Die Transportschicht bleibt die eine Stelle.
  assert.match(client, /export const API = import\.meta\.env\.VITE_API_URL/);
  assert.match(client, /localStorage\.getItem\("ce_token"\)/);
  // Adminverträge unberührt.
  assert.match(api, /const USER_PARAMS = \["limit", "offset"\];/);
  assert.match(api, /const SETTABLE_USER_STATUS = \["pending", "approved", "blocked"\];/);
  assert.match(api, /const ANONYMIZE_CONFIRM = "ANONYMIZE_USER";/);
  // Routenbestand vollständig — und zwar GENAU dieser. Der Vergleich läuft in
  // beide Richtungen: keine Route ist verschwunden und keine dazugekommen.
  const ROUTEN = ["/login", "/register", "/confirm-email-change", "/calculator", "/booking",
                  "/tracking", "/impressum", "/datenschutz", "/agb", "/widerruf", "/dashboard",
                  "/admin", "/admin/users", "/admin/users/:id",
                  "/admin/shipments", "/admin/shipments/:id",
                  "/admin/invoices", "/admin/invoices/backfill", "/admin/invoices/:id",
                  "/admin/cancellation-requests", "/admin/cancellation-requests/:id",
                  "/admin/support-requests", "/admin/support-requests/:id",
                  "/admin/audit-logs", "*"];
  const gefunden = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(gefunden.sort(), [...ROUTEN].sort(), "der Routenbestand hat sich verändert");

  // Entwürfe, Adressbuch, Tracking und Support sind bewusst KEINE Routen,
  // sondern Werte des lokalen page-States (CLAUDE.md, Navigationsmodell). Das
  // Abschlusspaket hat daran nichts gedreht.
  const dash = read("../pages/DashboardPage.jsx");
  assert.match(dash, /\["overview", "new", "drafts", "addressbook", "shipments", "invoices", "profile", "tracking", "support"\]/,
    "der page-State des Dashboards hat sich verändert");
  for (const p of ["drafts", "addressbook"]) {
    assert.ok(!app.includes(`path="/${p}"`), `${p} ist zu einer Route geworden`);
  }
  // Keine Datei baut sich eine eigene Transportschicht: die Basis-URL kommt
  // ausschließlich aus client.js (nie als Literal), und das JWT wird nur dort
  // GELESEN. Schreiben/Löschen bleibt bewusst bei AuthContext und AuthPage —
  // das ist der Bestand, nicht die Abweichung.
  for (const [name, t] of QUELLEN) {
    if (name === "adminApi.js") continue;                  // nennt sie in einem Kommentar
    assert.doesNotMatch(t, /["'`]https:\/\/api\.confidaraexpress\.de/, `${name}: API-URL als Literal`);
    if (name === "client.js") continue;
    assert.doesNotMatch(t, /localStorage\.getItem\(\s*["']ce_token["']\s*\)/,
      `${name}: liest das JWT an client.js vorbei`);
  }
});

/* ══════════ 12 — Selbsttest ═════════════════════════════════════════════ */

test("12 — die Prüflogik greift tatsächlich", () => {
  assert.ok(ALLE_CSS.length >= 20, `nur ${ALLE_CSS.length} Stylesheets gefunden`);
  assert.ok(QUELLEN.length >= 100, `nur ${QUELLEN.length} Quelldateien gefunden`);
  assert.ok(variables.length > 5000, "variables.css wurde beim Entkommentieren zerlegt");
  // Kommentare werden entfernt (sonst prüften mehrere Tests Prosa).
  assert.equal(ohneKommentare("/* #ff0000 */ .a { color: #00ff00; }").includes("#ff0000"), false);
  // Und ein eingeschmuggeltes Emoji würde auffallen.
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test("Versand 🚚"), true);
});
