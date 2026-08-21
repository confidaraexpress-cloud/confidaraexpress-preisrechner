// Floating-Label-Prototyp — Quelltextgovernance.
//
// Zwei Aussagen sichert diese Datei ab, und beide sind für einen PROTOTYP
// entscheidend:
//
//   1. Es gibt genau EINE zentrale Feldkomponente, und sie ist von Anfang an
//      barrierefrei korrekt (Verbindung Label↔Feld, aria-invalid,
//      aria-describedby, aria-required).
//   2. Die Floating-Variante ist strikt OPT-IN. Kein Standardfeld, kein
//      Adminfeld und kein Auth-Feld darf durch dieses Paket seine Erscheinung
//      ändern — sonst wäre es kein Prototyp mehr, sondern eine stille
//      systemweite Migration.
//
// Das gemessene VERHALTEN (Position, Höhe, Abstände, Fokus, Autofill) prüft
// tests/e2e/newShipmentFloatingLabels.test.mjs im echten Browser; hier stehen
// nur die Zusicherungen, die ein Quelltext tragen kann.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (p) => readFileSync(path.join(wurzel, p), "utf8");

// Kommentarfreier Quelltext — ein erklärender Kommentar darf keine Zusicherung
// belegen, die der ausgeführte Code nicht trägt. Gleiche Konvention wie in
// prelivesandboxUi.test.mjs und im Backend.
const ohneKommentare = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

const feldSrc      = lies("src/components/ui/Field.jsx");
const feld         = ohneKommentare(feldSrc);
const seite        = ohneKommentare(lies("src/pages/NewShipmentPage.jsx"));
const suggestSrc   = lies("src/components/address/AddressSuggestInput.jsx");
const suggest      = ohneKommentare(suggestSrc);
const formsRoh     = lies("src/styles/forms.css");
const variablen    = lies("src/styles/variables.css");

// Alle CSS-Regeln als { selektor, body } — dieselbe grobe Zerlegung wie in
// interfacePrimitives.test.mjs.
function regeln(text) {
  const ohne = text.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...ohne.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selektor: m[1].replace(/\s+/g, " ").trim(), body: m[2] }))
    .filter((r) => r.selektor && !r.selektor.startsWith("@"));
}
const formRegeln = regeln(formsRoh);
const floatingRegeln = formRegeln.filter((r) => /ce-field/.test(r.selektor));

/* ══════════ 1 — eine zentrale Komponente ═════════════════════════════════ */

test("1 — es gibt genau eine zentrale Feldkomponente", () => {
  assert.ok(existsSync(path.join(wurzel, "src/components/ui/Field.jsx")),
    "src/components/ui/Field.jsx fehlt");
  assert.match(feld, /export function Field\(/, "Field wird nicht exportiert");

  // Und daneben entsteht kein zweiter allgemeiner Wrapper. Die beiden
  // historischen `Feld`-Wrapper des Lagerbereichs bleiben unangetastet — sie
  // gehören nicht zum Scope dieses Prototyps, sind aber auch nicht vermehrt
  // worden.
  const dateien = [];
  const sammle = (rel) => {
    for (const e of readdirSync(path.join(wurzel, rel), { withFileTypes: true })) {
      if (e.isDirectory()) sammle(path.join(rel, e.name));
      else if (e.name.endsWith(".jsx")) dateien.push(path.join(rel, e.name));
    }
  };
  sammle("src");
  const wrapper = dateien.filter((d) => /^\s*function Feld\(/m.test(ohneKommentare(lies(d))));
  assert.deepEqual(wrapper.sort(),
    ["src/components/inventory/OrderCreateForm.jsx", "src/components/inventory/ProductForm.jsx"],
    "es ist ein weiterer lokaler Feld-Wrapper entstanden");
});

/* ══════════ 2 — Barrierefreiheit ist eingebaut, nicht optional ═══════════ */

test("2 — jedes Feld ist mit seiner Beschriftung verbunden", () => {
  assert.match(feld, /useId\(\)/, "ohne useId gäbe es Felder ohne id");
  assert.match(feld, /const feldId = id \|\| `fld-\$\{reactId\}`/,
    "die id muss notfalls selbst entstehen");
  // Beide Zweige (gestapelt und schwebend) verbinden über htmlFor.
  const htmlFor = [...feld.matchAll(/htmlFor=\{feldId\}/g)].length;
  assert.equal(htmlFor, 2, `htmlFor fehlt in einem Zweig (gefunden: ${htmlFor})`);
});

test("3 — Fehler und Hinweis sind programmatisch verknüpft", () => {
  assert.match(feld, /"aria-invalid": error \? "true" : undefined/);
  assert.match(feld, /"aria-required": required \? "true" : undefined/);
  assert.match(feld, /"aria-describedby": beschreibung \|\| undefined/);
  // Beschrieben wird nur, was auch im DOM steht: bei einem Fehler verschwindet
  // die Hinweiszeile — ein describedby darauf zeigte ins Leere.
  assert.match(feld, /error \? fehlerId : null/);
  assert.match(feld, /!error && hint \? hinweisId : null/);
  assert.match(feld, /id=\{fehlerId\}/, "die Fehlermeldung braucht ihre id");
  assert.match(feld, /id=\{hinweisId\}/, "der Hinweis braucht seine id");
});

test("4 — kein Platzhalter und kein aria-label als Ersatz für die Beschriftung", () => {
  assert.ok(!/aria-label=/.test(feld), "Field darf kein aria-label setzen");
  // Der sichtbare Stern ist dekorativ; die Pflicht steht semantisch im
  // aria-required (siehe Test 3).
  assert.match(feld, /<span aria-hidden="true"> \*<\/span>/);
});

test("5 — die Einheit wird nie doppelt vorgelesen", () => {
  // Sichtbar: dekorativ. Zugänglich: als unsichtbarer Zusatz der Beschriftung.
  assert.match(feld, /className="ce-field-unit" aria-hidden="true"/);
  assert.match(feld, /unitLabel && <span className="sr-only"> \{unitLabel\}<\/span>/);
});

/* ══════════ 6–8 — Floating ist strikt Opt-in ═════════════════════════════ */

test("6 — die Vorgabe ist die bisherige gestapelte Beschriftung", () => {
  assert.match(feld, /labelMode = "stacked"/, "die Vorgabe muss stacked sein");
  assert.match(feld, /const floating = labelMode === "floating"/);
  // Der gestapelte Zweig rendert exakt das bisherige Markup.
  assert.match(feld, /if \(!floating\) \{[\s\S]*?className="field-label" htmlFor=\{feldId\}/);
});

test("7 — nur „Neue Sendung\" aktiviert Floating", () => {
  assert.ok(seite.includes('labelMode="floating"'), "die Seite nutzt die Variante nicht");

  const dateien = [];
  const sammle = (rel) => {
    for (const e of readdirSync(path.join(wurzel, rel), { withFileTypes: true })) {
      if (e.isDirectory()) sammle(path.join(rel, e.name));
      else if (/\.(jsx|js|mjs)$/.test(e.name) && !e.name.includes(".test.")) dateien.push(path.join(rel, e.name));
    }
  };
  sammle("src");
  const nutzer = dateien.filter((d) => /labelMode="floating"|<AddressSuggestInput[\s\S]{0,400}?\bfloating\b/
    .test(ohneKommentare(lies(d))));
  assert.deepEqual(nutzer, ["src/pages/NewShipmentPage.jsx"],
    `Floating ist über den Prototyp hinaus aktiviert: ${nutzer.join(", ")}`);
});

test("8 — AddressSuggestInput bleibt ohne die Prop unverändert", () => {
  assert.match(suggest, /floating = false/, "die Prop muss standardmäßig aus sein");
  // Die zusätzlichen ARIA-Attribute und Klassen hängen ausnahmslos an `floating`
  // — Adressbuch und Auftragsdialog bekommen dadurch kein anderes Markup.
  for (const muster of [
    /aria-required=\{floating && required \? "true" : undefined\}/,
    /aria-describedby=\{floating \? beschreibung : undefined\}/,
    /\$\{floating \? " ce-field-input" : ""\}/,
    /\{!floating && beschriftung\}/,
    /\{floating && beschriftung\}/,
  ]) assert.match(suggest, muster, `Opt-in-Verdrahtung fehlt: ${muster}`);
  // Combobox-Verhalten unverändert.
  for (const attr of ['role="combobox"', "aria-expanded", "aria-controls", "aria-autocomplete", "aria-activedescendant"])
    assert.ok(suggest.includes(attr), `${attr} ist verloren gegangen`);
});

/* ══════════ 9–13 — das CSS bleibt gescopet ═══════════════════════════════ */

test("9 — jede Floating-Regel hängt an .ce-field--floating", () => {
  assert.ok(floatingRegeln.length > 0, "es gibt gar keine Floating-Regeln");
  for (const r of floatingRegeln) {
    for (const einzeln of r.selektor.split(",")) {
      assert.match(einzeln, /\.ce-field--(floating|has-unit)/,
        `ungescopte Regel: ${einzeln.trim()}`);
    }
  }
});

test("10 — die globalen Bedienhöhen sind unverändert", () => {
  assert.match(variablen, /--ce-size-control-md:\s*40px/);
  assert.match(variablen, /--ce-size-control-admin:\s*36px/);
  assert.match(variablen, /--ce-size-touch-target:\s*44px/);
  // Die 54/56 px stehen ausschließlich in der gescopten Variante.
  for (const wert of ["54px", "56px"]) {
    const treffer = formRegeln.filter((r) => r.body.includes(`min-height: ${wert}`));
    assert.ok(treffer.length > 0, `${wert} kommt gar nicht vor`);
    for (const r of treffer)
      assert.match(r.selektor, /\.ce-field--floating/, `${wert} steht ungescopt in ${r.selektor}`);
  }
});

test("11 — keine Größenskalierung per transform, keine Größe außerhalb der Skala", () => {
  const block = floatingRegeln.map((r) => r.body).join("\n");
  assert.ok(!/transform:\s*scale/.test(block),
    "scale() drückte die Beschriftung optisch unter 11 px und zwischen zwei Stufen");
  const groessen = [...block.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
  const skala = new Set([...variablen.matchAll(/--ce-text-[\w-]+-size(?:-mobile)?:\s*(\d+)px/g)]
    .map((m) => Number(m[1])));
  for (const g of groessen) {
    assert.ok(Number.isInteger(g), `Halbpixel: ${g}px`);
    assert.ok(skala.has(g), `${g}px liegt nicht auf der Typografieskala`);
  }
});

test("12 — kein Schatten, keine eigene Rahmenbreite, keine freie Farbe", () => {
  for (const r of floatingRegeln) {
    assert.ok(!/box-shadow/.test(r.body), `${r.selektor} bringt einen Schatten mit`);
    assert.ok(!/^\s*border:/m.test(r.body), `${r.selektor} setzt eine eigene Rahmenkurzform`);
    const farben = [...r.body.matchAll(/(?:^|\s)color:\s*([^;]+);/g)].map((m) => m[1].trim());
    for (const f of farben)
      assert.match(f, /^var\(--ce-color-/, `${r.selektor}: freie Farbe ${f}`);
  }
});

test("12b — die Autofill-Ergänzung existiert und ist ein Geschwisterselektor", () => {
  // Chrome füllt in seiner Vorschauphase, ohne den Wert an JavaScript zu geben:
  // der React-Zustand kann das Label dort nicht anheben, CSS schon.
  //
  // Warum das hier steht und nicht im Browser-Smoke: `document.styleSheets`
  // liefert im Vite-Dev-Modus 0 Regeln (gemessen) — das CSSOM ist dort keine
  // Beweisquelle. Und warum kein `:has()`: Chromium verwirft eine Regel mit
  // `:has(:-webkit-autofill)` beim Parsen vollständig, sie existiert dann gar
  // nicht. Deshalb Geschwisterselektor — und deshalb steht die Eingabe im DOM
  // VOR der Beschriftung.
  for (const pseudo of [":-webkit-autofill", ":autofill"]) {
    const re = new RegExp(`\\.ce-field-input${pseudo} ~ \\.ce-field-label`);
    assert.match(formsRoh, re, `${pseudo}-Ergänzung fehlt`);
  }
  // Gegen den KOMMENTARFREIEN Quelltext: die Begründung oben in forms.css nennt
  // die verworfene Variante ausdrücklich beim Namen.
  assert.ok(!/:has\([^)]*autofill/.test(ohneKommentare(formsRoh)),
    ":has(:-webkit-autofill) wird von Chromium verworfen — die Regel wäre wirkungslos");
  // Die DOM-Reihenfolge, von der der Selektor abhängt.
  assert.match(feld, /\{eingabe\}\s*\n\s*<label className="field-label ce-field-label"/,
    "Field.jsx: die Eingabe muss VOR der Beschriftung stehen");
  assert.match(suggest, /\/>\s*\n\s*\{floating && beschriftung\}/,
    "AddressSuggestInput: die Eingabe muss VOR der Beschriftung stehen");
});

test("12c — der Fehlerzustand gewinnt gegen den Fokus", () => {
  // Nach einer Feldablehnung springt der Fokus genau in dieses Feld
  // (focusFirstError). Die Fokusregel ist höher spezifisch als eine einfache
  // `.is-error`-Regel — ohne die zweite, ebenso spezifische Fehlerregel trug die
  // Beschriftung dort das Markenindigo statt der Fehlerfarbe (im Browser
  // gemessen).
  assert.match(formsRoh,
    /\.ce-field\.ce-field--floating\.is-error \.ce-field-label,\s*\n\s*\.ce-field\.ce-field--floating\.is-error:focus-within \.ce-field-label \{[^}]*--ce-color-status-error-fg/,
    "die Fehlerfarbe muss auch im Fokus gelten");
  const fokusIdx = formsRoh.indexOf(".is-floating:focus-within .ce-field-label");
  const fehlerIdx = formsRoh.indexOf(".is-error:focus-within .ce-field-label");
  assert.ok(fokusIdx > 0 && fehlerIdx > fokusIdx,
    "die Fehlerregel muss NACH der Fokusregel stehen — bei Gleichstand entscheidet die Reihenfolge");
});

test("13 — Bewegung nur über die Bewegungstokens, und abschaltbar", () => {
  const uebergaenge = floatingRegeln
    .flatMap((r) => [...r.body.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1].trim()))
    // `transition: none` ist die Abschaltung aus dem Reduced-Motion-Block — sie
    // trägt naturgemäß kein Bewegungstoken.
    .filter((u) => u !== "none");
  assert.ok(uebergaenge.length > 0, "es gibt gar keinen Übergang");
  for (const u of uebergaenge) {
    assert.match(u, /var\(--ce-motion-fast\)/, `freier Zeitwert: ${u}`);
    assert.match(u, /var\(--ce-motion-ease-standard\)/, `freie Kurve: ${u}`);
  }
  assert.match(formsRoh,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.ce-field\.ce-field--floating[\s\S]*?transition: none/,
    "die Floating-Variante respektiert prefers-reduced-motion nicht");
});

/* ══════════ 14–16 — Admin, Auth und die übrigen Seiten ═══════════════════ */

test("14 — Adminportal und Auth-Bereich sind nicht berührt", () => {
  for (const datei of ["src/styles/admin.css", "src/styles/auth.css"]) {
    assert.ok(!/ce-field/.test(lies(datei)), `${datei} hat Floating-Material bekommen`);
  }
  // Und keine Floating-Regel greift in eine Admin- oder Auth-Klasse hinein.
  for (const r of floatingRegeln) {
    assert.ok(!/\.adm-|\.auth-/.test(r.selektor), `${r.selektor} greift in einen fremden Bereich`);
  }
});

test("15 — keine neue Abhängigkeit, kein DOM-Hack, kein Polling", () => {
  const pkg = JSON.parse(lies("package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),
    ["@vitejs/plugin-react", "maplibre-gl", "react", "react-dom", "react-router-dom", "vite"].sort(),
    "es ist eine Abhängigkeit hinzugekommen");
  for (const verboten of ["setInterval", "setTimeout", "querySelector", "document.", "window."]) {
    assert.ok(!feld.includes(verboten),
      `Field.jsx darf ${verboten} nicht benutzen — der Zustand kommt aus React`);
  }
});

test("16 — der Nullzustand von „Neue Sendung\" ist unangetastet", () => {
  // Die Beispiele bleiben Platzhalter aus der einen Quelle und werden nie Werte.
  for (const k of ["packageCount", "weight", "length", "width", "height"])
    assert.ok(seite.includes(`placeholder={PACKAGE_PLACEHOLDERS.${k}}`),
      `${k}: Platzhalter nicht mehr aus PACKAGE_PLACEHOLDERS`);
  assert.ok(!/defaultValue/.test(seite), "defaultValue im Formular");
  assert.ok(!/\|\|\s*(30|20|15)\b/.test(seite), "Maß-Ersatzwert eingeschleppt");
  assert.ok(seite.includes("createEmptyShipmentForm()"), "der leere Ausgangszustand ist verloren");
  // Und Field selbst erfindet nie einen Wert.
  assert.ok(!/defaultValue|value = ["']/.test(feld), "Field setzt einen Ersatzwert");
});

/* ══════════ 17 — die Seite nutzt die Komponente wirklich ═════════════════ */

test("17 — alle Adress- und Paketfelder laufen über <Field /> bzw. den Picker", () => {
  // Kein rohes Eingabeelement mehr im Formularteil der Seite: die verbliebenen
  // <input>/<select> wären ein Rückfall in die Handverdrahtung.
  assert.ok(!/<input\s/.test(seite), "es steht noch ein rohes <input> auf der Seite");
  assert.ok(!/<select\s/.test(seite), "es steht noch ein rohes <select> auf der Seite");

  // Die fünf Paketfelder samt Einheiten.
  for (const [id, label] of [["ns-packageCount", "Anzahl"], ["ns-weight", "Gewicht"],
                             ["ns-length", "Länge"], ["ns-width", "Breite"], ["ns-height", "Höhe"]])
    assert.match(seite, new RegExp(`id="${id}"[\\s\\S]{0,200}label="${label}"`), `${id} fehlt`);
  assert.match(seite, /unit="kg" unitLabel="in Kilogramm"/);
  assert.equal([...seite.matchAll(/unit="cm" unitLabel="in Zentimetern"/g)].length, 3,
    "Länge, Breite und Höhe brauchen alle drei ihre Einheit");

  // Adressvalidierung und Adressbuch unverändert eingebunden.
  assert.match(seite, /useAddressValidation\(\{/);
  assert.match(seite, /<AddressSuggestInput\b/);
  assert.match(seite, /<AddressStatusLine\b/);
  assert.match(seite, /<AddressPickerButton\b/);
});
