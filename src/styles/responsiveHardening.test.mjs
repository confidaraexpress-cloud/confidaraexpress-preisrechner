// ─────────────────────────────────────────────────────────────────────────────
// Responsive-Härtung — Quelltext-Governance.
//
// Sichert die vier Root Causes des systemweiten Responsive-Audits gegen
// Rückfall ab:
//   R1  .badge zerlegte Wörter zeichenweise (overflow-wrap:anywhere+hyphens)
//   R2  .btn bleibt bewusst nowrap — Aktionsbereiche müssen selbst reflowen
//   R3  Karten-Umschalter hingen am Viewport statt an der realen Contentbreite
//   R4  Der Seitenkopf-Aside konnte nicht schrumpfen (Button lief aus dem Bild)
// sowie die Textregeln: technische Strings brechen LOKAL, normaler Text nie
// mitten im Wort, keine globalen Wrapping-/min-width-Hämmer.
//
// Läuft wie alle Stil-Suiten rein auf dem Quelltext (node --test).
// ─────────────────────────────────────────────────────────────────────────────
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const STYLES = new URL(".", import.meta.url);
const ALLE_CSS = readdirSync(STYLES).filter((f) => f.endsWith(".css")).sort();
const css = Object.fromEntries(ALLE_CSS.map((f) => [f, ohneKommentare(read(`./${f}`))]));

const block = (datei, selektor) => {
  const m = css[datei].match(new RegExp(`(^|\\})\\s*${selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `${datei}: Selektor ${selektor} nicht gefunden`);
  return m[2];
};

/* ══════════ 1 — Badge ist eine Einheit (R1) ═══════════════════════════════ */

test("1 — .badge bricht nie mitten im Wort und nie per Silbentrennung", () => {
  const b = block("primitives.css", ".badge");
  assert.ok(!/overflow-wrap:\s*anywhere/.test(b), ".badge trägt wieder overflow-wrap: anywhere");
  assert.ok(!/word-break:\s*break-all/.test(b), ".badge trägt word-break: break-all");
  assert.ok(!/hyphens:\s*auto/.test(b), ".badge trägt wieder automatische Silbentrennung");
  // Mehrwort-Badges DÜRFEN an Wortgrenzen fließen — nowrap wäre die andere,
  // ebenso falsche Extremlösung (sprengte enge Admin-Fixspalten).
  assert.match(b, /white-space:\s*normal/, ".badge darf nicht nowrap werden — Umbruch an Wortgrenzen bleibt erlaubt");
  assert.match(b, /overflow-wrap:\s*normal/, ".badge muss overflow-wrap: normal explizit tragen");
});

test("2 — kein Stylesheet legt anywhere/break-all auf Badge-Klassen", () => {
  for (const [datei, text] of Object.entries(css)) {
    for (const m of text.matchAll(/(^|\})([^{}]*\.badge[^{}]*)\{([^}]*)\}/g)) {
      assert.ok(!/overflow-wrap:\s*anywhere|word-break:\s*break-all|hyphens:\s*auto/.test(m[3]),
        `${datei}: Badge-Regel „${m[2].trim().slice(0, 60)}" zerlegt Wörter`);
    }
  }
});

/* ══════════ 3 — technische Strings bleiben lokal geregelt ════════════════ */

test("3 — die lokalen Bruchregeln technischer Strings bestehen weiter", () => {
  // E-Mail im Adressbuch (neu), Rechnungsnummern, E-Mail-Änderung, Tracking-Meta.
  assert.match(css["addressbook.css"], /\.abk-contact-email\s*\{[^}]*overflow-wrap:\s*anywhere/,
    "die Adressbuch-E-Mail hat ihre lokale anywhere-Regel verloren");
  assert.match(css["dashboard.css"], /\.inv-cell-number-value\s*\{[^}]*overflow-wrap:\s*anywhere/,
    "Rechnungsnummern haben ihre lokale Bruchregel verloren");
  assert.match(css["calculator.css"], /\.tracking-hero-meta-value\s*\{[^}]*overflow-wrap:\s*anywhere/,
    "Tracking-Metawerte (IDs) haben ihre lokale Bruchregel verloren");
  // Und das Telefon bleibt eine Einheit.
  assert.match(css["addressbook.css"], /\.abk-contact-phone\s*\{[^}]*white-space:\s*nowrap/,
    "das Telefon darf nicht mehr als Einheit stehen");
});

/* ══════════ 4 — Buttons (R2) ═════════════════════════════════════════════ */

test("4 — .btn behält sein bewusstes nowrap", () => {
  assert.match(block("buttons.css", ".btn"), /white-space:\s*nowrap/,
    ".btn hat sein nowrap verloren — Buttonbeschriftungen sind Bedieneinheiten");
});

/* ══════════ 5 — Reflow-Regeln existieren (R3/R4 + Adressbuch) ════════════ */

test("5 — die Reflow-Stufen des Adressbuchs existieren und messen den Container", () => {
  const ab = css["addressbook.css"];
  assert.match(ab, /\.abk-list-wrap\s*\{[^}]*container-type:\s*inline-size/,
    "der Listen-Wrapper ist kein Size-Container mehr");
  assert.match(ab, /@container \(max-width: 879px\)/, "die zweizeilige Zwischenstufe fehlt");
  assert.match(ab, /@container \(max-width: 639px\)/, "die Kartenstufe am Container fehlt");
  // Badge-Spalte mit Boden statt kollabierender fr-Spalte.
  assert.match(block("addressbook.css", ".abk-row"), /fit-content\(/,
    "die Badge-Spalte hat ihren fit-content-Boden verloren");
  assert.ok(!/grid-template-columns:[^;]*0\.6fr/.test(block("addressbook.css", ".abk-row")),
    "die bodenlose 0.6fr-Badge-Spalte ist zurück");
  // Kontaktzeile wrappt.
  assert.match(block("addressbook.css", ".abk-row-meta"), /flex-wrap:\s*wrap/,
    "die Kontaktzeile kann nicht mehr umbrechen");
  // Viewport-Fallback nur noch für Browser ohne Container-Queries.
  assert.match(ab, /@supports not \(container-type: inline-size\)/,
    "der Viewport-Fallback des Umschalters fehlt");
});

test("6 — die Listen-Umschalter sind shell-bewusst (1100er-Muster)", () => {
  // Generikum (Sendungen) und Entwürfe folgen der gemessenen Rechnungs-Schwelle.
  assert.match(css["patterns.css"], /@media \(max-width: 1100px\)\s*\{\s*\.ce-list-table\s*\{\s*display:\s*none/,
    ".ce-list-* schaltet nicht mehr bei 1100");
  assert.match(css["drafts.css"], /@media \(max-width: 1100px\)\s*\{\s*\.dft-table-card\s*\{\s*display:\s*none/,
    "die Entwurfstabelle schaltet nicht mehr bei 1100");
  assert.match(css["dashboard.css"], /@media \(max-width: 1100px\)/,
    "die Rechnungs-Referenzschwelle ist verschwunden");
});

test("7 — der Seitenkopf kann schrumpfen, der Chip ellipsiert (R4)", () => {
  assert.ok(!/flex-shrink:\s*0/.test(block("patterns.css", ".ce-page-header-aside")),
    "der Aside ist wieder shrink-fest — der Primärbutton kann aus dem Bild laufen");
  assert.match(block("patterns.css", ".ce-page-header-aside"), /min-width:\s*0/,
    "dem Aside fehlt das Schrumpfglied");
  const uname = block("overview.css", ".pp-uname");
  assert.match(uname, /text-overflow:\s*ellipsis/, "der Chip-Name ellipsiert nicht mehr");
  assert.match(block("overview.css", ".pp-uchip"), /max-width/,
    "der Chip hat seinen Deckel verloren");
  // Volltext bleibt zugänglich: der Chip-title trägt die Identität.
  assert.match(read("../components/ui/UserChip.jsx"), /title=\{`\$\{label\}: \$\{fullIdentity\}`\}/,
    "der Chip-title trägt die vollständige Identität nicht mehr");
});

/* ══════════ 8 — keine globalen Hämmer ════════════════════════════════════ */

test("8 — keine globale min-width-0-, anywhere- oder break-all-Regel", () => {
  for (const [datei, text] of Object.entries(css)) {
    for (const m of text.matchAll(/(^|\})\s*([^{}]+)\{([^}]*)\}/g)) {
      const sel = m[2].trim();
      const body = m[3];
      const istGlobal = sel === "*" || sel === "html" || sel === "body" || sel === ":root"
        || sel === "*, *::before, *::after";
      if (!istGlobal) continue;
      assert.ok(!/min-width:\s*0/.test(body), `${datei}: globales min-width:0 auf „${sel}"`);
      assert.ok(!/overflow-wrap:\s*anywhere/.test(body), `${datei}: globales anywhere auf „${sel}"`);
      assert.ok(!/word-break:\s*break-all/.test(body), `${datei}: globales break-all auf „${sel}"`);
    }
  }
  // Und `anywhere` bleibt insgesamt die Ausnahme technischer Strings und von
  // Nutzer-Freitext — die Zahl der Vorkommen darf nicht wieder wachsen.
  // Stand nach dem Härtungspaket: exakt 30 (gemessen), jedes davon lokal an
  // einem konkreten Element (IDs, Nummern, E-Mail, pre-wrap-Freitext,
  // Admin-Dichtekompromisse). Wer ein weiteres braucht, begründet es hier.
  //
  // +1 (31) für `.inv-cell-sku` im Lagermodul: eine SKU ist ein vom Kunden frei
  // vergebener technischer String ohne Wortgrenzen ("ART-2026-DE-XL-0001") und
  // steht in einer schmalen Tabellenspalte. Genau der sanktionierte Fall —
  // lokal an EINEM Element, nicht auf einem Container. Der Artikelpicker teilt
  // sich diese Klasse, statt eine zweite Regel zu führen.
  const gesamt = Object.entries(css)
    .filter(([f]) => f !== "auth.css")
    .reduce((n, [, t]) => n + (t.match(/overflow-wrap:\s*anywhere/g) || []).length, 0);
  assert.ok(gesamt <= 31, `overflow-wrap:anywhere breitet sich wieder aus (${gesamt} Vorkommen, erlaubt 31)`);
});

/* ══════════ 9 — Toolbar-Falle bleibt geschlossen ═════════════════════════ */

test("9 — die gestapelte Adressbuch-Toolbar setzt die flex-basis zurück", () => {
  assert.match(css["addressbook.css"],
    /@media \(max-width: 767px\)[\s\S]*?\.abk-search\s*\{[^}]*flex:\s*1 1 auto/,
    "die Suchfeld-Basis wird in der Spaltenrichtung nicht zurückgesetzt (260px-Höhen-Falle)");
});

/* ══════════ 10 — Formularraster mit Boden ════════════════════════════════ */

test("10 — die Feldraster nutzen minmax(0, 1fr)", () => {
  for (const klasse of [".field-row-2", ".field-row-3", ".field-row-5"]) {
    assert.match(block("forms.css", klasse), /minmax\(0,\s*1fr\)/,
      `${klasse} ist auf bodenlose 1fr-Spuren zurückgefallen`);
  }
});
