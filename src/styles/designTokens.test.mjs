// Governance für Paket A, Phase 1 — Foundation-Tokens und Legacy-Aliase.
//
// Phase 1 legt die semantische Tokenbasis (--ce-color-*, --ce-text-*, --ce-space-*,
// --ce-radius-*, --ce-elevation-*, --ce-z-*, --ce-motion-*, --ce-bp-*, --ce-size-*)
// und hängt die historischen Tokennamen darauf um. Sie migriert bewusst noch keine
// Komponente. Dieser Test hält genau das fest:
//
//   • Die Foundation ist vollständig und trägt die Werte der freigegebenen
//     Spezifikation — inklusive der vier Werte, an denen die ganze Farbwelt hängt
//     (#5367e8, #111a33, #667284, #8891a3).
//   • Die Legacy-Namen zeigen auf die vorgesehenen Foundation-Tokens, damit ein
//     Wertwechsel künftig an EINER Stelle passiert.
//   • Die beiden bisher undefinierten Tokens sind definiert.
//   • Kein Token ist zweimal mit widersprüchlichem Wert deklariert.
//
// Bewusst NICHT geprüft: dass jeder neue Token bereits referenziert wird. Die
// Foundation ist der Vertrag für Phase 2 (Primitives); ungenutzte Tokens sind hier
// der Normalfall, kein Fehler.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const roh = readFileSync(new URL("./variables.css", import.meta.url), "utf8");
// Kommentare enthalten Tokennamen zu Dokumentationszwecken — vor dem Parsen weg.
const css = roh.replace(/\/\*[\s\S]*?\*\//g, "");

// Alle Deklarationen einsammeln (Werte dürfen mehrzeilig sein, etwa Verläufe).
const deklarationen = [...css.matchAll(/--([\w-]+):\s*([^;]+);/g)]
  .map(([, name, wert]) => [name, wert.replace(/\s+/g, " ").trim()]);

const werte = new Map();
const doppelt = [];
for (const [name, wert] of deklarationen) {
  if (werte.has(name) && werte.get(name) !== wert) doppelt.push(`--${name}`);
  else werte.set(name, wert);
}

// Wert eines Tokens, ein var()-Verweis wird aufgelöst.
function wert(name, tiefe = 0) {
  const v = werte.get(name);
  if (v === undefined) return undefined;
  const verweis = v.match(/^var\(--([\w-]+)\)$/);
  return verweis && tiefe < 5 ? wert(verweis[1], tiefe + 1) : v;
}
// Rohwert ohne Auflösung — für die Alias-Prüfung.
const roheZuweisung = (name) => werte.get(name);

test("1 — kein Token doppelt mit widersprüchlichem Wert", () => {
  assert.deepEqual(doppelt, [], `mehrfach mit unterschiedlichem Wert deklariert: ${doppelt.join(", ")}`);
});

test("2 — die Farb-Foundation ist vollständig", () => {
  const pflicht = [
    "ce-color-brand", "ce-color-brand-hover", "ce-color-brand-active", "ce-color-brand-ink",
    "ce-color-brand-soft", "ce-color-brand-border", "ce-color-brand-violet",
    "ce-color-text-primary", "ce-color-text-secondary", "ce-color-text-muted",
    "ce-color-text-placeholder", "ce-color-text-disabled", "ce-color-text-inverse",
    "ce-color-text-inverse-soft",
    "ce-color-bg-canvas-top", "ce-color-bg-canvas-mid", "ce-color-bg-canvas-bottom",
    "ce-color-bg-sheen",
    "ce-color-surface", "ce-color-surface-subtle", "ce-color-surface-muted",
    "ce-color-surface-raised", "ce-color-surface-inverse", "ce-color-surface-inverse-edge",
    "ce-color-border-subtle", "ce-color-border-default", "ce-color-border-strong",
    "ce-color-border-interactive", "ce-color-border-interactive-hover", "ce-color-border-focus",
    "ce-color-overlay", "ce-color-overlay-drawer", "ce-color-focus-ring",
    "ce-color-danger-solid", "ce-color-success-solid",
  ];
  const fehlend = pflicht.filter((t) => wert(t) === undefined);
  assert.deepEqual(fehlend, [], `fehlende Farbtokens: ${fehlend.join(", ")}`);
});

test("3 — die vier tragenden Farbwerte stimmen exakt", () => {
  assert.equal(wert("ce-color-brand"), "#5367e8", "Markenakzent");
  assert.equal(wert("ce-color-text-primary"), "#111a33", "Navy / Primärtext");
  assert.equal(wert("ce-color-text-muted"), "#667284", "gedämpfter Text");
  assert.equal(wert("ce-color-border-interactive"), "#8891a3", "Kante bedienbarer Elemente");
  // Die abgeleiteten Markenzustände hängen an denselben Entscheidungen.
  assert.equal(wert("ce-color-brand-hover"), "#4658d9");
  assert.equal(wert("ce-color-brand-active"), "#3b4cc4");
  assert.equal(wert("ce-color-brand-ink"), "#3d4fcf");
  assert.equal(wert("ce-color-brand-soft"), "#eef0fd");
});

test("4 — die Ivory-Rampe trägt die Werte der Spezifikation", () => {
  assert.equal(wert("ce-color-bg-canvas-top"), "#faf9f6");
  assert.equal(wert("ce-color-bg-canvas-mid"), "#f5f3ef");
  assert.equal(wert("ce-color-bg-canvas-bottom"), "#eff0f2");
  assert.equal(wert("ce-color-surface"), "#ffffff");
  // Die Chrome-Tokens der App-Shell speisen sich aus derselben Quelle.
  for (const [chrome, quelle] of [
    ["ce-app-bg-top", "ce-color-bg-canvas-top"],
    ["ce-app-bg-mid", "ce-color-bg-canvas-mid"],
    ["ce-app-bg-bottom", "ce-color-bg-canvas-bottom"],
  ]) {
    assert.equal(roheZuweisung(chrome), `var(--${quelle})`, `--${chrome} muss auf --${quelle} zeigen`);
  }
});

test("5 — alle zehn Statusgruppen sind vollständig (Fläche, Text, Kante)", () => {
  const gruppen = [
    "neutral", "info", "progress", "success", "warning",
    "overdue", "error", "blocked", "cancelled", "archived",
  ];
  const fehlend = [];
  for (const g of gruppen) {
    for (const teil of ["surface", "fg", "border"]) {
      const name = `ce-color-status-${g}-${teil}`;
      if (wert(name) === undefined) fehlend.push(`--${name}`);
    }
  }
  assert.deepEqual(fehlend, [], `unvollständige Statusgruppen: ${fehlend.join(", ")}`);
});

test("6 — Typografie-, Abstands-, Radius-, Tiefen-, Ebenen-, Bewegungs- und Maßfamilien sind vollständig", () => {
  const fehlend = [];
  const pruefe = (namen) => namen.forEach((n) => { if (wert(n) === undefined) fehlend.push(`--${n}`); });

  pruefe(["ce-font-display", "ce-font-sans", "ce-font-numeric"]);

  const stufen = [
    "display-xl", "display-l", "title-page", "title-section", "title-card",
    "body-l", "body", "body-s", "label", "micro", "numeric-display",
  ];
  for (const s of stufen) {
    pruefe([
      `ce-text-${s}-size`, `ce-text-${s}-size-mobile`,
      `ce-text-${s}-weight`, `ce-text-${s}-line`, `ce-text-${s}-tracking`,
    ]);
  }
  pruefe(Array.from({ length: 13 }, (_, i) => `ce-space-${i}`));
  pruefe(["ce-radius-0", "ce-radius-sm", "ce-radius-md", "ce-radius-lg", "ce-radius-xl", "ce-radius-full"]);
  pruefe([
    "ce-elevation-0", "ce-elevation-1", "ce-elevation-2", "ce-elevation-3",
    "ce-elevation-material-raised", "ce-elevation-material-signature", "ce-elevation-focus-ring",
  ]);
  pruefe([
    "ce-z-base", "ce-z-raised", "ce-z-sticky", "ce-z-dropdown", "ce-z-topbar",
    "ce-z-drawer", "ce-z-overlay", "ce-z-dialog", "ce-z-toast", "ce-z-emergency",
  ]);
  pruefe([
    "ce-motion-instant", "ce-motion-fast", "ce-motion-standard", "ce-motion-slow",
    "ce-motion-ease-standard", "ce-motion-ease-entrance",
  ]);
  pruefe(["ce-bp-sm", "ce-bp-md", "ce-bp-shell", "ce-bp-lg", "ce-bp-xl", "ce-bp-2xl"]);
  pruefe([
    "ce-size-content", "ce-size-content-wide", "ce-size-content-admin",
    "ce-size-form", "ce-size-prose", "ce-size-sidebar", "ce-size-sidebar-admin",
    "ce-size-dialog-sm", "ce-size-dialog-md", "ce-size-dialog-lg", "ce-size-dialog-xl",
  ]);

  assert.deepEqual(fehlend, [], `fehlende Foundation-Tokens: ${fehlend.join(", ")}`);
});

test("7 — Skalenwerte entsprechen der Spezifikation", () => {
  assert.equal(wert("ce-space-0"), "0");
  for (const [i, px] of [[1, 4], [2, 8], [3, 12], [4, 16], [5, 20], [6, 24], [7, 32], [8, 40], [9, 48], [10, 64], [11, 80], [12, 96]]) {
    assert.equal(wert(`ce-space-${i}`), `${px}px`, `--ce-space-${i}`);
  }
  assert.equal(wert("ce-radius-sm"), "8px");
  assert.equal(wert("ce-radius-md"), "12px");
  assert.equal(wert("ce-radius-lg"), "16px");
  assert.equal(wert("ce-radius-xl"), "20px");
  assert.equal(wert("ce-radius-full"), "9999px");
  assert.equal(wert("ce-size-content"), "1240px");
  assert.equal(wert("ce-size-sidebar"), "252px");
  assert.equal(wert("ce-bp-shell"), "860px");
  // Keine Halbpixel in der Typografieskala.
  for (const [name, v] of werte) {
    if (/^ce-text-.*-size(-mobile)?$/.test(name)) {
      assert.match(v, /^\d+px$/, `--${name} ist keine ganze Pixelzahl: ${v}`);
      assert.ok(parseInt(v, 10) >= 11, `--${name} unterschreitet die Untergrenze von 11px: ${v}`);
    }
  }
});

test("8 — die bisher undefinierten Tokens sind definiert", () => {
  // Beide wurden bislang nur über Inline-Fallbacks benutzt und liefen faktisch
  // ins Leere: --border-strong in overview.css/dashboard-premium.css,
  // --shadow-card-lg in notifications.css.
  assert.equal(roheZuweisung("border-strong"), "var(--ce-color-border-strong)");
  assert.equal(wert("border-strong"), "#c3cad6");
  assert.equal(roheZuweisung("shadow-card-lg"), "var(--ce-elevation-3)");
  assert.ok(wert("shadow-card-lg").includes("rgba"), "--shadow-card-lg muss zu einem Schattenwert auflösen");
});

test("9 — Legacy-Tokens zeigen auf die vorgesehenen Foundation-Tokens", () => {
  const abbildung = {
    navy: "ce-color-text-primary",
    blue: "ce-color-brand-active",
    blue2: "ce-color-brand",
    blue3: "ce-color-brand",
    "blue-light": "ce-color-brand-soft",
    accent: "ce-color-brand",
    white: "ce-color-surface",
    success: "ce-color-success-solid",
    "success-bg": "ce-color-status-success-surface",
    warn: "ce-color-status-warning-fg",
    "warn-bg": "ce-color-status-warning-surface",
    danger: "ce-color-danger-solid",
    "danger-bg": "ce-color-status-error-surface",
    border: "ce-color-border-default",
    border2: "ce-color-border-strong",
    "radius-lg": "ce-radius-lg",
    "radius-xl": "ce-radius-xl",
    "radius-full": "ce-radius-full",
    "sidebar-width": "ce-size-sidebar",
    surface: "ce-color-surface",
    "surface-subtle": "ce-color-surface-subtle",
    "surface-muted": "ce-color-surface-muted",
    "border-subtle": "ce-color-border-subtle",
    "text-primary": "ce-color-text-primary",
    "text-secondary": "ce-color-text-secondary",
    "text-tertiary": "ce-color-text-muted",
    "accent-blue": "ce-color-brand",
    "accent-blue-strong": "ce-color-brand-hover",
    "accent-blue-soft": "ce-color-brand-soft",
    "accent-blue-border": "ce-color-brand-border",
    "shadow-card": "ce-elevation-1",
    "shadow-card-hover": "ce-elevation-2",
    "shadow-overlay": "ce-elevation-3",
    "ce-kpi-navy": "ce-color-text-primary",
    "ce-kpi-active": "ce-color-brand",
  };
  const abweichungen = [];
  for (const [alt, neu] of Object.entries(abbildung)) {
    const ist = roheZuweisung(alt);
    if (ist !== `var(--${neu})`) abweichungen.push(`--${alt}: ${ist} (erwartet var(--${neu}))`);
  }
  assert.deepEqual(abweichungen, [], `falsch abgebildete Legacy-Tokens:\n  ${abweichungen.join("\n  ")}`);
});

test("10 — bewusst noch nicht umgehängte Legacy-Tokens behalten ihren Wert", () => {
  // Diese vier würden in Phase 1 sichtbare Änderungen erzeugen, die nicht
  // freigegeben sind (Formänderung an Buttons/Eingaben bzw. Tiefenwechsel).
  // Sie wandern zusammen mit den Primitives in Phase 2.
  assert.equal(wert("radius-sm"), "6px", "Zielwert 8px gehört zu Phase 2");
  assert.equal(wert("radius"), "10px", "Zielwert 12px gehört zu Phase 2");
  assert.match(wert("shadow-sm"), /^0 1px 3px/);
  assert.match(wert("shadow-lg"), /^0 12px 40px/);
});

test("11 — die Foundation ist die einzige Quelle: keine zweite Definition außerhalb variables.css", () => {
  // Bereichsstylesheets dürfen Foundation-Tokens lesen, aber nicht neu belegen.
  const dateien = [
    "dashboard-premium.css", "dashboard.css", "overview.css", "admin.css",
    "auth.css", "calculator.css", "offers.css", "notifications.css",
    "addressbook.css", "drafts.css", "support.css", "cancellation.css", "email-change.css",
  ];
  const treffer = [];
  for (const datei of dateien) {
    const inhalt = readFileSync(new URL(`./${datei}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of inhalt.matchAll(/--(ce-(?:color|font|text|space|radius|elevation|z|motion|bp|size)-[\w-]+):\s*[^;]+;/g)) {
      treffer.push(`${datei}: --${m[1]}`);
    }
  }
  assert.deepEqual(treffer, [], `Foundation-Tokens dürfen nur in variables.css definiert werden: ${treffer.join(", ")}`);
});

test("12 — die DM-Sans-Gewichtsfrage (O1) ist durch einen echten Messtest abgesichert", () => {
  const pfad = new URL("../../tests/e2e/fontWeightAxis.test.mjs", import.meta.url);
  const inhalt = readFileSync(pfad, "utf8");
  assert.match(inhalt, /font-synthesis:none|font-synthesis: none/,
    "ohne abgeschaltete Kunstfettung wäre die Gewichtsmessung nicht aussagekräftig");
  assert.match(inhalt, /fvar/, "die binäre Achsenprüfung fehlt");
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts["test:e2e"], /tests\/e2e\/fontWeightAxis\.test\.mjs/,
    "der Gewichtstest muss im e2e-Lauf registriert sein");
});
