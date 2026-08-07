// Governance für Paket A, Phase 2 — die globalen Interface-Primitives.
//
// Geprüft wird die Primitive-Ebene (buttons.css, forms.css, primitives.css) und
// die Icon-Komponente: dass es genau EIN Button-, Formular-, Badge- und
// Karten-Grundsystem gibt, dass es ausschließlich aus Foundation-Tokens
// gebaut ist, und dass die in Phase 2 bewusst entfernten Mittel (Glow, farbige
// Schatten, Bewegung beim Drücken, pauschale opacity, Pill-Badges, freie
// Radien) nicht zurückkehren.
//
// Bewusst NICHT geprüft: die Legacy-Bereiche, deren vollständige Migration in
// ihr Seitenpaket verschoben wurde (Auth-CTA, Preisrechner-Mega-CTA,
// pp-net-cta). Sie sind unten als dokumentierte Übergangsscopes festgehalten —
// der Test hält fest, DASS sie dokumentiert sind, nicht dass sie schon dem
// Zielsystem entsprechen.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const buttonsRaw    = read("./buttons.css");
const formsRaw      = read("./forms.css");
const primitivesRaw = read("./primitives.css");
const variablesRaw  = read("./variables.css");
const indexCss      = read("./index.css");

const buttons    = stripComments(buttonsRaw);
const forms      = stripComments(formsRaw);
const primitives = stripComments(primitivesRaw);
const primitiveCss = `${buttons}\n${forms}\n${primitives}`;

// Tokenwert aus variables.css, var()-Verweise werden aufgelöst.
function tok(name, tiefe = 0) {
  const m = stripComments(variablesRaw).match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) return undefined;
  const wert = m[1].replace(/\s+/g, " ").trim();
  const verweis = wert.match(/^var\(--([\w-]+)\)$/);
  return verweis && tiefe < 5 ? tok(verweis[1], tiefe + 1) : wert;
}

// Regelblöcke einer Datei: [{ selektor, body }]. @media-Klammern werden vorher
// entfernt, damit die inneren Regeln einzeln erfasst werden.
function regeln(css) {
  const flach = css.replace(/@media[^{]*\{/g, "").replace(/\}\s*\}/g, "}\n}");
  const out = [];
  for (const m of flach.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selektor = m[1].replace(/\s+/g, " ").trim();
    if (!selektor || selektor.startsWith("@")) continue;
    out.push({ selektor, body: m[2] });
  }
  return out;
}
const buttonRegeln    = regeln(buttons);
const formRegeln      = regeln(forms);
const primitivRegeln  = regeln(primitives);
const alleRegeln      = [...buttonRegeln, ...formRegeln, ...primitivRegeln];

// Deklarationen einer Regelgruppe als [name, wert].
const deklarationen = (body) =>
  [...body.matchAll(/([-\w]+)\s*:\s*([^;]+);/g)].map(([, n, v]) => [n.trim(), v.replace(/\s+/g, " ").trim()]);

/* ══════════ 1 — Buttonhöhen ══════════════════════════════════════════════ */

test("1 — das Buttonsystem kennt nur die drei definierten Höhen", () => {
  const erlaubt = new Map([
    ["var(--ce-size-control-sm)", "Small 32px"],
    ["var(--ce-size-control-md)", "Medium 40px"],
    ["var(--ce-size-control-lg)", "Large 48px"],
    ["var(--ce-size-touch-target)", "Touchziel 44px (nur grober Zeiger)"],
  ]);
  const gesetzt = [];
  for (const r of buttonRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "--ce-btn-height") continue;
      gesetzt.push(wert);
      assert.ok(erlaubt.has(wert), `${r.selektor}: unzulässige Buttonhöhe ${wert}`);
    }
  }
  assert.ok(gesetzt.length >= 4, "Basis, Small, Extra-Small und Large müssen eine Höhe setzen");

  // Die Skalenwerte selbst stehen fest.
  assert.equal(tok("ce-size-control-sm"), "32px");
  assert.equal(tok("ce-size-control-md"), "40px");
  assert.equal(tok("ce-size-control-lg"), "48px");
  assert.equal(tok("ce-size-touch-target"), "44px");

  // Keine freie Höhe an einem .btn-Selektor vorbei an der Variable. Der
  // Iconslot (.btn > svg / .btn > .spinner) ist kein Button, sondern sein
  // Inhalt — er läuft über --ce-btn-icon-size.
  for (const r of buttonRegeln) {
    if (r.selektor.includes(">")) continue;
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "height" && name !== "min-height") continue;
      assert.match(
        wert, /^var\(--ce-btn-height\)$/,
        `${r.selektor}: ${name} muss über --ce-btn-height laufen, gefunden ${wert}`,
      );
    }
  }
});

/* ══════════ 2 — Buttonvarianten ══════════════════════════════════════════ */

test("2 — es gibt genau die sechs definierten Buttonvarianten", () => {
  const varianten = ["btn-primary", "btn-outline", "btn-ghost", "btn-danger", "btn-icon", "btn-link"];
  for (const v of varianten) {
    assert.ok(
      buttonRegeln.some((r) => new RegExp(`\\.${v}(?![\\w-])`).test(r.selektor)),
      `die Variante .${v} fehlt im Buttonsystem`,
    );
  }
  // Klassennamen, die eine SIEBTE allgemeine Variante wären, gibt es nicht.
  const klassen = new Set();
  for (const r of buttonRegeln) {
    for (const m of r.selektor.matchAll(/\.(btn-[\w-]+)/g)) klassen.add(m[1]);
  }
  const erlaubt = new Set([
    ...varianten,
    "btn-sm", "btn-xs", "btn-lg",   // Höhen (btn-xs ist der dokumentierte Alias)
    "btn-full", "btn-grow",         // Breitenmodifikatoren
  ]);
  const zusaetzlich = [...klassen].filter((k) => !erlaubt.has(k));
  assert.deepEqual(zusaetzlich, [], `unbekannte Buttonklassen: ${zusaetzlich.join(", ")}`);

  // Primary/Hover/Active/Danger hängen an den vorgeschriebenen Tokens.
  const block = (sel) => buttonRegeln.filter((r) => r.selektor === sel).map((r) => r.body).join("");
  assert.match(block(".btn-primary"), /var\(--ce-color-brand\)/);
  assert.match(block(".btn-primary:hover:not(:disabled)"), /var\(--ce-color-brand-hover\)/);
  assert.match(block(".btn-primary:active:not(:disabled)"), /var\(--ce-color-brand-active\)/);
  assert.match(
    buttonRegeln.find((r) => /\.btn-danger,/.test(r.selektor) || r.selektor.startsWith(".btn-danger")).body,
    /var\(--ce-color-danger-solid\)/,
  );

  // Die bestehenden Klassennamen bleiben kompatibel bedienbar.
  for (const alt of ["btn-primary", "btn-outline", "btn-ghost", "btn-sm", "btn-xs", "adm-btn-danger"]) {
    assert.ok(
      buttonRegeln.some((r) => new RegExp(`\\.${alt}(?![\\w-])`).test(r.selektor)),
      `der bestehende Klassenname .${alt} muss weiter funktionieren`,
    );
  }
});

/* ══════════ 3 — kein Glow ════════════════════════════════════════════════ */

test("3 — die globalen Buttons tragen keinen Glow und keinen farbigen Schatten", () => {
  for (const r of buttonRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name === "box-shadow") {
        assert.fail(`${r.selektor}: box-shadow ist im Buttonsystem nicht zulässig (${wert})`);
      }
      if (name === "filter" || name === "backdrop-filter") {
        assert.fail(`${r.selektor}: ${name} ist im Buttonsystem nicht zulässig`);
      }
    }
  }
  // Auch kein Verlauf als Fläche — Primary ist ein Vollton.
  assert.doesNotMatch(buttons, /linear-gradient|radial-gradient/,
    "das Buttonsystem arbeitet mit Volltonflächen, nicht mit Verläufen");
  // Und keine pauschale Deckkraft als Disabled-Ersatz.
  for (const r of buttonRegeln) {
    for (const [name] of deklarationen(r.body)) {
      assert.notEqual(name, "opacity",
        `${r.selektor}: Disabled wird über eigene Flächen-/Textrollen vermittelt, nicht über opacity`);
    }
  }
});

/* ══════════ 4 — keine Bewegung beim Drücken ══════════════════════════════ */

test("4 — kein translateY und kein scale in den globalen Buttons", () => {
  for (const r of buttonRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "transform") continue;
      assert.fail(`${r.selektor}: transform (${wert}) ist im Buttonsystem nicht zulässig`);
    }
  }
  assert.doesNotMatch(buttons, /translateY|scale\(/,
    "Druck- und Hoverzustände werden über Farbe vermittelt, nicht über Bewegung");
  // Die Übergänge laufen über die Bewegungstokens und nur über Farbe/Kante.
  const basis = buttonRegeln.find((r) => r.selektor === ".btn").body;
  assert.match(basis, /transition:[^;]*var\(--ce-motion-fast\)/);
  assert.doesNotMatch(basis, /transition:[^;]*transform/);
});

/* ══════════ 5 — Eingabekante ═════════════════════════════════════════════ */

test("5 — alle Eingaben tragen die interaktive Rahmenfarbe", () => {
  const basis = formRegeln.find((r) => /\.field-input,/.test(r.selektor) && /border:/.test(r.body));
  assert.ok(basis, "die gemeinsame Eingabe-Grundregel fehlt");
  assert.match(basis.body, /border:\s*1px solid var\(--ce-color-border-interactive\)/);
  assert.match(basis.body, /border-radius:\s*var\(--ce-radius-md\)/);
  assert.match(basis.body, /color:\s*var\(--ce-color-text-primary\)/);

  // Alle neun Eingabetypen laufen durch dieselbe Grundregel bzw. deren Gruppe.
  for (const sel of [".field-input", ".field-select", ".field-textarea",
                     ".adm-filter-field input", ".adm-filter-field select",
                     ".adm-edit-select", ".adm-note-input", ".adm-modal-input"]) {
    assert.ok(basis.selektor.includes(sel), `${sel} fehlt in der gemeinsamen Eingabe-Grundregel`);
  }
  assert.match(forms, /input\[type="checkbox"\],\s*input\[type="radio"\]/,
    "Checkbox und Radio brauchen eine Grundregel");

  // Hover, Platzhalter und Dichtestufen.
  assert.match(forms, /border-color:\s*var\(--ce-color-border-interactive-hover\)/);
  assert.match(forms, /color:\s*var\(--ce-color-text-placeholder\)/);
  assert.match(forms, /min-height:\s*var\(--ce-size-control-md\)/, "Kundenportal 40px");
  assert.match(forms, /min-height:\s*var\(--ce-size-control-admin\)/, "Adminportal 36px");
  assert.match(forms, /min-height:\s*var\(--ce-size-touch-target\)/, "Touchziel 44px");
  assert.equal(tok("ce-size-control-admin"), "36px");

  // Fokus vergrößert keinen Schatten und verschiebt kein Layout.
  const fokus = formRegeln.find((r) => /\.field-input:focus,/.test(r.selektor));
  assert.ok(fokus, "die gemeinsame Fokusregel der Eingaben fehlt");
  assert.match(fokus.body, /box-shadow:\s*none/, "kein wachsender Schatten im Fokus");
  assert.match(fokus.body, /border-color:\s*var\(--ce-color-border-focus\)/);
  // Rahmenbreite ist in allen Zuständen 1px → kein Layoutsprung.
  for (const r of formRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "border") continue;
      assert.match(wert, /^1px /, `${r.selektor}: Eingaben tragen genau 1px Rahmen, gefunden ${wert}`);
    }
  }
});

/* ══════════ 6 — Fokuszustände ════════════════════════════════════════════ */

test("6 — der Fokusstandard läuft über die Foundation-Tokens", () => {
  assert.equal(tok("ce-focus-ring"), "2px solid var(--ce-color-border-focus)");
  assert.equal(tok("ce-focus-ring-offset"), "2px");
  assert.equal(tok("ce-color-border-focus"), "#5367e8");

  // Grundlinie mit Spezifität 0 deckt alles Fokussierbare ab.
  assert.match(primitives, /:where\(a\[href\], button, input, select, textarea, summary, \[tabindex\]\):focus-visible/);

  // Buttons, Eingaben, Checkbox/Radio und interaktive Karten nutzen denselben Ring.
  const mitRing = alleRegeln.filter((r) => /outline:\s*var\(--ce-focus-ring\)/.test(r.body));
  const abgedeckt = mitRing.map((r) => r.selektor).join(" | ");
  for (const sel of [".btn:focus-visible", "input[type=\"checkbox\"]:focus-visible",
                     ".field-input:focus", ".ce-card-interactive:focus-visible"]) {
    assert.ok(abgedeckt.includes(sel), `${sel} fehlt im Fokusstandard (abgedeckt: ${abgedeckt})`);
  }
  for (const r of mitRing) {
    assert.match(r.body, /outline-offset:\s*var\(--ce-focus-ring-offset\)/,
      `${r.selektor}: der Ring braucht den Foundation-Offset`);
  }

  // Kein outline:none ohne gleichwertigen Ersatz in der Primitive-Ebene.
  for (const r of alleRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "outline" || wert !== "none") continue;
      assert.fail(`${r.selektor}: outline:none ohne Ersatz ist nicht zulässig`);
    }
  }

  // Projektweit gibt es keine Fokus-Outline mit einem Farbliteral mehr — die
  // Sonderfälle auf dunklem Grund laufen ebenfalls über Tokens.
  const literale = [];
  for (const datei of readdirSync(new URL(".", import.meta.url))) {
    if (!datei.endsWith(".css")) continue;
    const inhalt = stripComments(readFileSync(new URL(`./${datei}`, import.meta.url), "utf8"));
    // Auf Deklarationsgrenze verankert — sonst trifft der Ausdruck auch
    // Klassennamen, die auf „outline" enden (.offer-cta-btn-outline:hover …).
    for (const m of inhalt.matchAll(/[{;]\s*outline:\s*[^;]*?(#[0-9a-fA-F]{3,8}|rgba?\()[^;]*;/g)) {
      literale.push(`${datei}: ${m[0].replace(/^[{;]\s*/, "").trim()}`);
    }
  }
  const AUSNAHMEN = ["email-change.css"];  // eigener dunkler Bestätigungsdialog, folgt im Seitenpaket
  const verstoesse = literale.filter((l) => !AUSNAHMEN.some((a) => l.startsWith(a)));
  assert.deepEqual(verstoesse, [], `Fokusfarben gehören in Tokens:\n  ${verstoesse.join("\n  ")}`);
});

/* ══════════ 7 — Radien ═══════════════════════════════════════════════════ */

test("7 — die Primitives verwenden nur die definierten Radiuswerte", () => {
  const erlaubt = new Set([
    "var(--ce-radius-0)", "var(--ce-radius-sm)", "var(--ce-radius-md)",
    "var(--ce-radius-lg)", "var(--ce-radius-xl)", "var(--ce-radius-full)",
    "0", "50%",
  ]);
  for (const r of alleRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "border-radius") continue;
      assert.ok(erlaubt.has(wert), `${r.selektor}: Radius ${wert} liegt außerhalb der Skala`);
    }
  }
  // Buttons und Eingaben tragen exakt md.
  assert.match(buttonRegeln.find((r) => r.selektor === ".btn").body, /border-radius:\s*var\(--ce-radius-md\)/);
  assert.equal(tok("ce-radius-md"), "12px");
  // Badges tragen sm (8px) — kein Pill.
  assert.match(primitivRegeln.find((r) => r.selektor === ".badge").body, /border-radius:\s*var\(--ce-radius-sm\)/);
  assert.equal(tok("ce-radius-sm"), "8px");
});

/* ══════════ 8 — Statusbadges ═════════════════════════════════════════════ */

test("8 — Badges tragen einen Statuspunkt und genau die zehn Statusgruppen", () => {
  const basis = primitivRegeln.find((r) => r.selektor === ".badge");
  assert.ok(basis, ".badge fehlt");
  assert.match(basis.body, /min-height:\s*24px/, "Kunde: mindestens 24px");
  assert.match(basis.body, /font-size:\s*var\(--ce-text-label-size\)/);
  assert.equal(tok("ce-text-label-size"), "12px");
  assert.equal(tok("ce-text-label-weight"), "600");
  assert.doesNotMatch(basis.body, /white-space:\s*nowrap/, "lange deutsche Begriffe müssen umbrechen dürfen");
  assert.match(basis.body, /overflow-wrap:\s*anywhere/);

  // Statuspunkt ist Pflicht.
  const punkt = primitivRegeln.find((r) => r.selektor === ".badge::before");
  assert.ok(punkt, "der Statuspunkt (.badge::before) fehlt");
  assert.match(punkt.body, /border-radius:\s*var\(--ce-radius-full\)/);
  assert.match(punkt.body, /background:\s*currentColor/);

  // Adminstufe.
  assert.match(primitives, /\.adm-shell \.badge \{[^}]*min-height:\s*22px/);

  // Alle zehn Gruppen sind da und lesen ausschließlich Foundation-Statusfarben.
  const gruppen = ["neutral", "info", "progress", "success", "warning",
                   "overdue", "error", "blocked", "cancelled", "archived"];
  for (const g of gruppen) {
    const r = primitivRegeln.find((x) => new RegExp(`\\.badge--${g}(?![\\w-])`).test(x.selektor));
    assert.ok(r, `die Statusgruppe .badge--${g} fehlt`);
    for (const teil of ["surface", "fg", "border"]) {
      assert.match(r.body, new RegExp(`var\\(--ce-color-status-${g}-${teil}\\)`),
        `.badge--${g} muss --ce-color-status-${g}-${teil} verwenden`);
    }
  }
  // Die historischen Farbklassen bleiben als Alias gültig.
  for (const [alt, gruppe] of [["badge-gray", "neutral"], ["badge-blue", "info"],
                               ["badge-green", "success"], ["badge-yellow", "warning"],
                               ["badge-red", "error"]]) {
    const r = primitivRegeln.find((x) => new RegExp(`\\.${alt}(?![\\w-])`).test(x.selektor));
    assert.ok(r, `.${alt} muss weiter funktionieren`);
    assert.match(r.body, new RegExp(`var\\(--ce-color-status-${gruppe}-surface\\)`),
      `.${alt} muss auf die Statusgruppe ${gruppe} zeigen`);
  }
  // Kein zweites Badge-Grundsystem in dashboard.css.
  assert.doesNotMatch(stripComments(read("./dashboard.css")), /^\s*\.badge\s*\{/m,
    "es darf nur EIN .badge-Grundsystem geben");
});

/* ══════════ 9 — Kartenprimitives ═════════════════════════════════════════ */

test("9 — Karten verwenden ausschließlich Foundation-Elevations", () => {
  const kartenSelektoren = [".ce-card", ".ce-card-raised", ".ce-card-interactive",
                            ".ce-card-muted", ".ce-card-inverse", ".ce-table-container"];
  for (const sel of kartenSelektoren) {
    assert.ok(
      primitivRegeln.some((r) => new RegExp(`\\${sel}(?![\\w-])`).test(r.selektor)),
      `der Kartentyp ${sel} fehlt`,
    );
  }
  const erlaubteTiefen = new Set([
    "var(--ce-elevation-0)", "var(--ce-elevation-1)", "var(--ce-elevation-2)",
    "var(--ce-elevation-3)", "var(--ce-elevation-material-raised)",
    "var(--ce-elevation-material-signature)", "var(--ce-elevation-focus-ring)",
  ]);
  for (const r of primitivRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "box-shadow") continue;
      assert.ok(erlaubteTiefen.has(wert), `${r.selektor}: Schatten ${wert} liegt außerhalb der Elevationsskala`);
    }
  }
  assert.doesNotMatch(primitives, /backdrop-filter/, "kein backdrop-filter in den Primitives");

  // Hover nur bei tatsächlich interaktiven Karten.
  const hover = primitivRegeln.filter((r) => /^\.(ce-card|tile|table-card|adm-card)[^:]*:hover/.test(r.selektor));
  for (const r of hover) {
    assert.match(r.selektor, /ce-card-interactive/,
      `${r.selektor}: informative Karten bekommen keinen Hoverzustand`);
  }
  assert.match(primitivRegeln.find((r) => r.selektor === ".ce-card-interactive").body, /cursor:\s*pointer/);
  for (const sel of [".ce-card", ".ce-card-muted"]) {
    assert.doesNotMatch(primitivRegeln.find((r) => r.selektor.startsWith(sel)).body, /cursor:/,
      `${sel}: informative Karten tragen keinen Cursorhinweis`);
  }

  // Die bestehenden Klassennamen hängen an der einen Kartenbasis, und ihr
  // Material ist aus den Bereichsdateien verschwunden.
  const basis = primitivRegeln.find((r) => r.selektor.startsWith(".ce-card,"));
  for (const alt of [".tile", ".adm-card", ".adm-filters"]) {
    assert.ok(basis.selektor.includes(alt), `${alt} muss an der Kartenbasis hängen`);
  }
  assert.ok(
    primitivRegeln.find((r) => r.selektor.includes(".ce-table-container")).selektor.includes(".table-card"),
    ".table-card muss am Table-Container hängen",
  );
  assert.doesNotMatch(stripComments(read("./overview.css")), /^\s*\.tile\s*\{/m,
    ".tile darf sein Material nicht doppelt führen");
  assert.doesNotMatch(stripComments(read("./dashboard.css")), /^\s*\.table-card\s*\{/m,
    ".table-card darf sein Material nicht doppelt führen");
  assert.doesNotMatch(stripComments(read("./admin.css")), /^\s*\.adm-card\s*\{[^}]*background/m,
    ".adm-card darf sein Material nicht doppelt führen");
});

/* ══════════ 10 — keine neuen Emojis ══════════════════════════════════════ */

// Die Emoji-Leerzustände gehören zum späteren State-System und bleiben in
// dieser Phase unangetastet — aber es darf keiner dazukommen. Der Bestand ist
// gegen origin/main gemessen (Extended_Pictographic über alle Quelldateien
// außer Tests) und enthält neben den Leerzustands-Emojis auch die
// typografischen Zeichen © und ↔.
const EMOJI_BESTAND = 30;

function quelldateien(dir = new URL("../", import.meta.url)) {
  const out = [];
  for (const eintrag of readdirSync(dir)) {
    const pfad = new URL(`${eintrag}${eintrag.includes(".") ? "" : "/"}`, dir);
    if (statSync(pfad).isDirectory()) { out.push(...quelldateien(pfad)); continue; }
    if (/\.(jsx?|mjs)$/.test(eintrag) && !eintrag.endsWith(".test.mjs")) out.push(pfad);
  }
  return out;
}

test("10 — es kommen keine neuen Emojis dazu", () => {
  const treffer = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/\p{Extended_Pictographic}/gu)) {
      treffer.push(`${pfad.pathname.split("/src/")[1]}: ${m[0]}`);
    }
  }
  assert.ok(
    treffer.length <= EMOJI_BESTAND,
    `neue Emojis sind nicht zulässig (Bestand ${EMOJI_BESTAND}, gefunden ${treffer.length}):\n  ${treffer.join("\n  ")}`,
  );
  // Und in der Primitive-Ebene selbst gibt es gar keine.
  for (const [name, css] of [["buttons.css", buttonsRaw], ["forms.css", formsRaw], ["primitives.css", primitivesRaw]]) {
    assert.doesNotMatch(css, /\p{Extended_Pictographic}/u, `${name} enthält ein Emoji`);
  }
});

/* ══════════ 11 — keine neue Icondependency ═══════════════════════════════ */

test("11 — das Iconsystem bleibt intern, ohne neue Abhängigkeit", () => {
  const pkg = JSON.parse(read("../../package.json"));
  const erlaubt = ["@vitejs/plugin-react", "maplibre-gl", "react", "react-dom", "react-router-dom", "vite"];
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), erlaubt.sort(),
    "es wird keine Abhängigkeit hinzugefügt"
    + " (lucide-react war nie importiert, wurde von vier Tests ausdrücklich verboten"
    + " und ist im Abschlusspaket samt Lockfile-Eintrag entfernt)");
  assert.deepEqual(Object.keys(pkg.devDependencies), ["playwright"]);

  // Kein Quellcode importiert eine Iconbibliothek.
  const importe = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    if (/from\s+["'](lucide-react|react-icons|@heroicons|@tabler\/icons|feather-icons)/.test(inhalt)) {
      importe.push(pfad.pathname.split("/src/")[1]);
    }
  }
  assert.deepEqual(importe, [], `Iconbibliotheken sind nicht zulässig: ${importe.join(", ")}`);

  // Die Grundregeln der internen Komponente.
  const icon = read("../components/ui/Icon.jsx");
  assert.match(icon, /strokeWidth="1\.75"/, "stroke-width 1.75");
  assert.equal((icon.match(/strokeWidth="1\.75"/g) || []).length, 2, "beide Zweige (truck + Pfad) gleich");
  assert.match(icon, /strokeLinecap="round"/);
  assert.match(icon, /strokeLinejoin="round"/);
  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.match(icon, /c = "currentColor"/, "Icons folgen der Textfarbe");
  assert.match(icon, /"aria-hidden": "true"/, "dekorative Icons sind für Screenreader unsichtbar");
  assert.match(icon, /role: "img"/, "ein beschriftetes Icon ist Inhalt");
  assert.match(icon, /ICON_SIZE = \{ sm: 16, md: 18, lg: 24, xl: 40 \}/, "die Größenleiter 16/18/24/40");
  for (const [name, px] of [["sm", "16px"], ["md", "18px"], ["lg", "24px"], ["xl", "40px"]]) {
    assert.equal(tok(`ce-icon-${name}`), px);
  }

  // Ein Iconbutton ohne sichtbaren Namen braucht ein aria-label.
  const ohneLabel = [];
  for (const pfad of quelldateien()) {
    if (!pfad.pathname.endsWith(".jsx")) continue;
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/<button\b([^>]*)>\s*(?:\{[^{}]*\})?\s*<Icon\b[^/]*\/>\s*<\/button>/g)) {
      if (!/aria-label/.test(m[1])) ohneLabel.push(`${pfad.pathname.split("/src/")[1]}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(ohneLabel, [], `Iconbuttons ohne aria-label:\n  ${ohneLabel.join("\n  ")}`);
});

/* ══════════ 12 — höchstens Gewicht 600 ═══════════════════════════════════ */

test("12 — die Primitive-Regeln nutzen kein font-weight 700", () => {
  for (const r of alleRegeln) {
    for (const [name, wert] of deklarationen(r.body)) {
      if (name !== "font-weight") continue;
      const aufgeloest = wert.startsWith("var(") ? tok(wert.slice(6, -1)) : wert;
      const zahl = Number(aufgeloest);
      assert.ok(
        Number.isFinite(zahl) && zahl <= 600,
        `${r.selektor}: font-weight ${wert} (${aufgeloest}) überschreitet das höchste UI-Gewicht 600`,
      );
    }
  }
  // DM Sans 700 bleibt technisch in der Schriftdatei vorhanden, aber ungenutzt:
  // fonts.css deklariert dafür KEINE Instanz. Die früheren 700/800-Blöcke
  // gehörten zur auslaufenden Displayschrift Libre Franklin und sind mit dem
  // Abschlusspaket samt Fontdateien entfernt.
  const fonts = stripComments(read("./fonts.css"));
  const flaechen = [...fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const dmSansGewichte = flaechen
    .filter((b) => /font-family:\s*'DM Sans'/.test(b))
    .map((b) => (b.match(/font-weight:\s*([^;]+);/) || [])[1]?.trim());
  assert.deepEqual(dmSansGewichte, ["300", "300", "400", "500", "600"],
    `für DM Sans darf keine 700er-Instanz deklariert werden (gefunden: ${dmSansGewichte.join(", ")})`);
  // Keine neue oder ersetzte Schriftdatei.
  const dateien = [...fonts.matchAll(/url\('\.\.\/assets\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(dateien)].sort(), [
    "cormorantgaramond-400-italic.woff2", "cormorantgaramond-400.woff2",
    "dmsans-300-italic.woff2", "dmsans-300.woff2",
  ], "es wird keine Schriftdatei hinzugefügt und keine ersetzt");
  // Und keine @font-face-Regel verweist auf eine Datei, die es nicht gibt.
  for (const d of new Set(dateien)) {
    assert.ok(existsSync(new URL(`../assets/fonts/${d}`, import.meta.url)),
      `fonts.css lädt ${d}, die Datei fehlt`);
  }
});

/* ══════════ 13 — Phase-1-Governance und Einbindung ═══════════════════════ */

test("13 — die Phase-1-Governance bleibt registriert und die Primitives sind eingebunden", () => {
  const pkg = JSON.parse(read("../../package.json"));
  for (const t of ["src/styles/designTokens.test.mjs", "src/styles/numericFontAudit.test.mjs",
                   "src/components/layout/appShellChrome.test.mjs",
                   "src/components/dashboard/overviewKpiCards.test.mjs"]) {
    assert.ok(pkg.scripts.test.includes(t), `die bestehende Governance ${t} muss im Testlauf bleiben`);
  }
  assert.ok(pkg.scripts.test.includes("src/styles/interfacePrimitives.test.mjs"),
    "diese Governance muss selbst registriert sein");

  // Die Primitive-Ebene ist genau einmal eingebunden, nach buttons/forms und
  // vor den Bereichs-Stylesheets.
  const reihenfolge = [...indexCss.matchAll(/@import '\.\/([\w-]+\.css)'/g)].map((m) => m[1]);
  assert.equal(reihenfolge.filter((f) => f === "primitives.css").length, 1);
  const idx = (f) => reihenfolge.indexOf(f);
  assert.ok(idx("primitives.css") > idx("buttons.css"), "primitives.css steht nach buttons.css");
  assert.ok(idx("primitives.css") > idx("forms.css"), "primitives.css steht nach forms.css");
  for (const bereich of ["auth.css", "calculator.css", "dashboard.css", "admin.css", "overview.css"]) {
    assert.ok(idx("primitives.css") < idx(bereich), `primitives.css steht vor ${bereich}`);
  }

  // Die Foundation bleibt die einzige Tokenquelle: die Primitive-Dateien
  // definieren keine --ce-*-Tokens (die lokalen --ce-btn-* sind Rechenwerte
  // der Komponente, keine Foundation).
  for (const [name, css] of [["buttons.css", buttons], ["forms.css", forms], ["primitives.css", primitives]]) {
    const treffer = [...css.matchAll(/--(ce-(?:color|font|text|space|radius|elevation|z|motion|bp|size|icon|focus)-[\w-]+):/g)];
    assert.deepEqual(treffer.map((m) => m[1]), [],
      `${name} darf keine Foundation-Tokens definieren: ${treffer.map((m) => m[1]).join(", ")}`);
  }

  // Die bewusst zurückgestellten Legacy-Bereiche sind als Übergangsscope
  // dokumentiert — nicht stillschweigend liegengeblieben.
  assert.match(buttonsRaw, /auth-cta/, "der Auth-CTA muss als zurückgestellt dokumentiert sein");
  assert.match(buttonsRaw, /pp-net-cta/, "pp-net-cta muss als zurückgestellt dokumentiert sein");
  // Der frühere Glow-Mega-CTA des Preisrechners (.offers-calc-cta .btn-primary)
  // ist seit Paket B (Premium-Versandprozess) KEIN Übergangsscope mehr — siehe
  // shippingProcess.test.mjs, das die Migration auf die Primary Large prüft.
});
