// Öffentlicher Preisrechner — Insel, Seitengerüst und Anfragevertrag.
//
//   • Einstieg: die erste Anweisung meldet den Seitenaufruf (prepare), nie abgewartet; danach die
//     gedrosselten Meldungen für Sichtbarkeit und Aktivität wie im Portal.
//   • Die Insel zieht nichts aus der Anwendung, was sie nicht braucht: kein index.css, kein Router,
//     kein Versandvorgang, kein Anmeldezustand, keine Dashboardmodule, keine Adressdienste, keine
//     Karte, kein Storage.
//   • Anfragen (ausgeführt gegen einen abgefangenen Client): prepare ohne Body und Kopfzeilen,
//     credentials "omit", keepalive; Preisabfrage mit 75 s; Länderscope ohne Cookies; die
//     Übernahmeprüfung meldet nur bei 401 ab.
//   • Seitengerüst: Reihenfolge der Abschnitte, belegte Aussagen, keine verbotenen Versprechen; der
//     Ergebnisbereich ist vor der ersten Berechnung leer, und das statische Formularskelett trägt
//     dieselben Zeilen und Felder wie die Insel (die Höhen misst tests/e2e/publicCalculator.test.mjs).
//
// Run: node --test src/public-calculator/publicCalculatorIsland.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HIER, "..");
const WURZEL = path.join(SRC, "..");
const lies = (abs) => fs.readFileSync(abs, "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MAIN = ohneKommentare(lies(path.join(HIER, "main.jsx")));
const INSEL = fs.readdirSync(HIER).filter((f) => /\.(jsx|mjs|js)$/.test(f) && !/\.test\./.test(f))
  .map((f) => [f, ohneKommentare(lies(path.join(HIER, f)))]);
const HTML = lies(path.join(WURZEL, "preisrechner", "index.html"));
const HTML_OHNE = HTML.replace(/<!--[\s\S]*?-->/g, "");

test("1 — die erste Anweisung des Einstiegs ist die Aufwärmmeldung, nie abgewartet, vor dem Rendern", () => {
  const koerper = MAIN.replace(/^import[^;]+;\s*$/gm, "").trim();
  assert.match(koerper, /^const ersteMeldung = preparePublicCalculator\("page"\);/,
    "vor der Aufwärmmeldung darf keine Anweisung stehen");
  assert.doesNotMatch(MAIN, /await\s+(ersteMeldung|preparePublicCalculator)/, "die Seite wartet nie auf prepare");
  assert.ok(koerper.indexOf("preparePublicCalculator(\"page\")") < koerper.indexOf("createRoot("));
  assert.ok(koerper.indexOf("preparePublicCalculator(\"page\")") < koerper.indexOf("fetchPublicLaunchScope("),
    "prepare ist die erste API-Anfrage");
  assert.match(MAIN, /createShippingWarmupSignal\(\{/);
  assert.match(MAIN, /trigger === "page" \? ersteMeldung :/, "der Seitenaufruf wird nicht doppelt gemeldet");
  assert.match(MAIN, /signal\.onPageEnter\(\);/);
  assert.match(MAIN, /"visibilitychange"/);
  assert.match(MAIN, /"pointerdown", aktivitaet, \{ capture: true, passive: true \}/);
  assert.match(MAIN, /"keydown", aktivitaet, \{ capture: true, passive: true \}/);
  assert.match(MAIN, /<ContentErrorBoundary bereich="preisrechner" wrapperClassName="pc-boundary">/);
});

test("2 — die Insel bleibt klein: nichts aus Router, Vorgang, Anmeldung, Dashboard, Adressdiensten, Karte", () => {
  const verboten = [
    /styles\/index\.css/, /react-router/, /ShippingFlowContext|useShippingFlow/, /AuthContext|useAuth/,
    /components\/dashboard\//, /pages\//, /AddressSuggestInput|addressValidation|geoapify/i, /maplibre/,
    /components\/offers\/OfferCard/, /localStorage|sessionStorage|indexedDB|document\.cookie/,
    /jumingo|transglobal/i, /assets\/carriers\/jumingo/,
  ];
  for (const [datei, src] of INSEL) {
    for (const muster of verboten) assert.doesNotMatch(src, muster, `${datei}: ${muster}`);
  }
  const api = ohneKommentare(lies(path.join(SRC, "api", "publicCalculatorApi.js")));
  assert.doesNotMatch(api, /localStorage|jumingo|transglobal/i);
  assert.doesNotMatch(lies(path.join(SRC, "utils", "carrierMap.js")), /import [^;]+jumingo\.svg/,
    "das Logo der Einkaufsquelle gehört in keinen Carrierimport");
});

async function ladeApi() {
  let src = lies(path.join(SRC, "api", "publicCalculatorApi.js"));
  const ersetze = (alt, neu) => {
    assert.equal(src.split(alt).length - 1, 1, `Ladeanker fehlt oder ist mehrdeutig: ${alt}`);
    src = src.replace(alt, neu);
  };
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "ce-public-api-"));
  fs.writeFileSync(path.join(ordner, "client.mjs"), [
    "export const aufrufe = [];",
    "export let abmeldungen = 0;",
    "export let antwortStatus = 200;",
    "export const setzeStatus = (s) => { antwortStatus = s; };",
    "export const authH = () => ({ \"Content-Type\": \"application/json\", Authorization: \"Bearer t\" });",
    "export const triggerAuthError = () => { abmeldungen += 1; };",
    "export async function apiFetch(pfad, opts = {}) { aufrufe.push({ pfad, opts }); return { status: antwortStatus, ok: antwortStatus < 300, json: async () => ({ destinationCountries: [\"DE\", \"AT\"], originCountries: [\"DE\"] }) }; }",
  ].join("\n"));
  ersetze('"./client.js"', JSON.stringify(pathToFileURL(path.join(ordner, "client.mjs")).href));
  ersetze('"../utils/launchScopeView.mjs"', JSON.stringify(pathToFileURL(path.join(SRC, "utils", "launchScopeView.mjs")).href));
  const datei = path.join(ordner, "publicCalculatorApi.mjs");
  fs.writeFileSync(datei, src);
  const client = await import(pathToFileURL(path.join(ordner, "client.mjs")).href);
  const api = await import(pathToFileURL(datei).href);
  return { api, client };
}

test("3 — Anfragevertrag: prepare als Simple-Request, Preisabfrage 75 s, Scope ohne Cookies, Prüfung ohne Pauschalabmeldung", async () => {
  const { api, client } = await ladeApi();
  await api.preparePublicCalculator("page");
  assert.deepEqual(client.aufrufe.at(-1), {
    pfad: "/api/public/price-quote/prepare?trigger=page",
    opts: { method: "POST", credentials: "omit", keepalive: true, timeoutMs: 10000 },
  }, "ohne Body, ohne Kopfzeilen, ohne Cookies");
  await api.preparePublicCalculator("irgendwas");
  assert.equal(client.aufrufe.at(-1).pfad, "/api/public/price-quote/prepare?trigger=page");
  for (const t of ["visible", "activity"]) {
    await api.preparePublicCalculator(t);
    assert.equal(client.aufrufe.at(-1).pfad, `/api/public/price-quote/prepare?trigger=${t}`);
  }

  await api.requestPublicPriceQuote({ from_country: "DE" }, { signal: null });
  const quote = client.aufrufe.at(-1);
  assert.equal(quote.pfad, "/api/public/price-quote");
  assert.deepEqual([quote.opts.method, quote.opts.credentials, quote.opts.timeoutMs], ["POST", "omit", 75000]);
  assert.deepEqual(quote.opts.headers, { "Content-Type": "application/json" }, "kein Authorization-Kopf");
  assert.equal(quote.opts.auth, undefined);

  const scope = await api.fetchPublicLaunchScope();
  assert.deepEqual(client.aufrufe.at(-1), { pfad: "/api/public/launch-scope", opts: { credentials: "omit" } });
  assert.deepEqual(scope.codes, ["DE", "AT"]);

  await api.verifyPriceQuoteHandoff("h1.abc");
  const pruefung = client.aufrufe.at(-1);
  assert.equal(pruefung.pfad, "/api/price-quote/handoff/verify");
  assert.equal(pruefung.opts.auth, undefined, "ein fachliches 403 darf nicht pauschal abmelden");
  assert.equal(pruefung.opts.headers.Authorization, "Bearer t");
  assert.equal(client.abmeldungen, 0);
  client.setzeStatus(403);
  await api.verifyPriceQuoteHandoff("h1.abc");
  assert.equal(client.abmeldungen, 0, "403 meldet nicht ab");
  client.setzeStatus(401);
  await api.verifyPriceQuoteHandoff("h1.abc");
  assert.equal(client.abmeldungen, 1, "401 meldet über den zentralen Handler ab");
});

test("4 — Seitengerüst: Kopf, Hero, Ergebnisse, Ablauf, Plattform, FAQ mit Service, Fuß in dieser Reihenfolge", () => {
  const marken = [
    'class="pc-skip"', 'class="pc-header"', 'id="pc-hero-title"', 'id="pc-calculator-card"', 'id="pc-calculator"',
    'id="pc-results"', 'id="pc-steps-title"', 'id="pc-platform-title"', 'id="pc-faq-title"', 'id="pc-service-title"',
    'class="pc-footer"',
  ];
  let letzte = -1;
  for (const m of marken) {
    const i = HTML_OHNE.indexOf(m);
    assert.ok(i > letzte, `${m} fehlt oder steht an falscher Stelle`);
    letzte = i;
  }
  assert.match(HTML_OHNE, /<h1 class="pc-display" id="pc-hero-title"><span class="pc-display-line">Versand für Unternehmen\.<\/span> <span class="pc-display-line pc-display-line--soft">Einfach vergleichen\.<\/span><\/h1>/);
  assert.match(HTML_OHNE, /<p class="pc-eyebrow">Digitale Versand- und Logistikplattform<\/p>/);
  assert.match(HTML_OHNE, /<p class="pc-lead">Mehrere Versanddienstleister auf einer Plattform: transparente Nettopreise für Ihre Sendung, effizient gebucht im Kundenbereich — mit persönlichem Ansprechpartner\.<\/p>/);
  // Bereich 2 gibt es erst nach der ersten Berechnung: vorher steht dort nichts, auch keine Überschrift.
  assert.match(HTML_OHNE, /<div id="pc-results"><\/div>/);
  assert.doesNotMatch(HTML_OHNE, /id="pc-results-title"|id="pc-results-section"/);
  for (const ziel of ["login", "register", "impressum", "datenschutz", "agb"]) {
    assert.ok(HTML_OHNE.includes(`href="https://confidaraexpress.de/${ziel}"`), `Link auf /${ziel} der Hauptdomain fehlt`);
  }
  assert.match(HTML_OHNE, /<main id="pc-main">/);
  assert.match(HTML_OHNE, /<html lang="de">/);
});

test("5 — Kopf: preconnect zur API, genau zwei vorgeladene Schriftschnitte, nur Marken-Lockups", () => {
  assert.match(HTML_OHNE, /<link rel="preconnect" href="https:\/\/api\.confidaraexpress\.de" crossorigin \/>/);
  const preloads = [...HTML_OHNE.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin \/>/g)].map((m) => m[1]);
  assert.deepEqual(preloads, ["../src/assets/fonts/dmsans-300.woff2", "../src/assets/fonts/cormorantgaramond-400.woff2"]);
  const bilder = [...HTML_OHNE.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]);
  // Kopf und Fuß liegen auf dunklem Grund: zweimal das helle Lockup.
  assert.deepEqual(bilder, ["../src/assets/brand/lockup-reverse.svg", "../src/assets/brand/lockup-reverse.svg"],
    "keine Logo-Wand der Carrier, kein Master-SVG");
  assert.doesNotMatch(HTML_OHNE, /<style|style="|<script(?![^>]*src="\/main\.js")/, "CSP: nichts inline");
});

test("6 — keine Versprechen ohne Beleg und keine Einkaufsquelle", () => {
  const text = HTML_OHNE.replace(/<[^>]+>/g, " ");
  const verboten = [
    /garantier|Garantie/i, /günstigst|billigst|Bestpreis|Tiefpreis/i, /Ersparnis|sparen Sie|\d+\s*%/i,
    /Bewertung|Sterne|Siegel|Auszeichnung|zertifiziert|TÜV/i, /offizieller? Partner/i,
    /\d[\d.]*\s*(\+\s*)?(Kunden|Unternehmen|Sendungen|Pakete)\b/, /seit \d{4}|\d+\s*Jahre/i,
    /in \d+\s*(Minuten|Stunden|Sekunden)|innerhalb von/i, /Vertriebspartner|Partnerprogramm|Provision/i,
    /jumingo|transglobal/i,
  ];
  for (const muster of verboten) assert.doesNotMatch(text, muster, String(muster));
  // Die sechs Plattformvorteile stehen in Canonical §2.
  for (const titel of ["Tarifvergleich", "Buchung", "Versanddokumente", "Tracking", "Rechnungen", "Adressbuch"]) {
    assert.ok(HTML_OHNE.includes(`<h3 class="pc-feature-title">${titel}</h3>`), titel);
  }
  // Kontakt aus der bestehenden Quelle (seit Schritt 3 src/config/companyProfile.js, die das Impressum liest).
  const profil = lies(path.join(SRC, "config", "companyProfile.js"));
  assert.ok(profil.includes("support@confidaraexpress.de") && HTML_OHNE.includes("support@confidaraexpress.de"));
  // Gesamtauftrag C (2026-10-24): neue Telefonnummer und der Ansprechpartner — dieselben Werte wie im Profil.
  assert.ok(profil.includes('phone: "016092717124"') && HTML_OHNE.includes('<a href="tel:+4916092717124">016092717124</a>'));
  assert.ok(!HTML_OHNE.includes("015118003775"), "die alte Telefonnummer steht noch auf der Seite");
  assert.ok(profil.includes('contactPerson: "Miguel Vance"') && HTML_OHNE.includes("Ansprechpartner: Miguel Vance"));
  assert.ok(!HTML_OHNE.includes("Patrick Werner") && !/Geschäftsführ/.test(HTML_OHNE), "nur der Ansprechpartner, kein Geschäftsführer");
});

function skelettVorab() {
  const start = HTML_OHNE.indexOf('<div class="pc-form pc-form--skeleton" aria-hidden="true" inert>');
  return HTML_OHNE.slice(start, HTML_OHNE.indexOf('<div class="pc-hero-body">'));
}

test("7 — Formularskelett: dieselben Zeilen und Felder wie die Insel, nicht bedienbar, ohne reservierte Höhe", () => {
  const app = lies(path.join(HIER, "PublicCalculatorApp.jsx"));
  const start = HTML_OHNE.indexOf('<div class="pc-form pc-form--skeleton" aria-hidden="true" inert>');
  assert.ok(start > HTML_OHNE.indexOf('id="pc-calculator"'), "Skelett fehlt oder steht nicht in #pc-calculator");
  const skelett = HTML_OHNE.slice(start, HTML_OHNE.indexOf('<div class="pc-hero-body">'));
  // Zeilen und Feldbeschriftungen in derselben Reihenfolge.
  const zeilen = (src, re) => [...src.matchAll(re)].map((m) => m[1]);
  const appZeilen = zeilen(app, /<span className="pc-row-label" id="[^"]+">([^<]+)<\/span>/g);
  // Die Ortsfelder baut `ortFelder` — einmal für den Absender, einmal für den Empfänger.
  const hilfe = app.slice(app.indexOf("const ortFelder = "), app.indexOf("return (", app.indexOf("const ortFelder = ") + 40) + 2000);
  const ort = zeilen(hilfe.slice(0, hilfe.indexOf("</div>")), /<Field [^>]*?label="([^"]+)"/g);
  // Die Paketfelder baut seit Canonical v2.79 der gemeinsame Paketeditor (Variante „public“).
  assert.match(app, /<PackageLinesEditor\s+variant="public"/, "der Paketeditor fehlt in der Insel");
  const editor = lies(path.join(SRC, "components", "shipping", "PackageLinesEditor.jsx"));
  const oeffentlich = editor.slice(editor.indexOf("public: Object.freeze(["),
    editor.indexOf("]),", editor.indexOf("public: Object.freeze([")));
  const paket = zeilen(oeffentlich, /label: "([^"]+)"/g);
  assert.deepEqual(app.match(/\{ortFelder\("(from|to)"\)\}/g), ['{ortFelder("from")}', '{ortFelder("to")}']);
  const appFelder = [...ort, ...ort, ...paket];
  assert.deepEqual(appZeilen, ["Absender", "Empfänger", "Paket"], "Anker in PublicCalculatorApp.jsx nicht gefunden");
  assert.deepEqual(ort, ["Land", "PLZ", "Stadt"], "Ortsfelder: nur Land, PLZ und Stadt");
  assert.deepEqual(paket, ["Anzahl", "Gewicht", "Länge", "Breite", "Höhe"], "Paket: Anzahl, Gewicht und Maße");
  // Kein Versanddatum, keine Abholung/Abgabe, keine Versandart (Betreiberentscheidung 2026-10-16).
  assert.doesNotMatch(app, /pc-shipping-date|pc-service-filter|pc-shipping-mode|type="date"/);
  assert.doesNotMatch(skelettVorab(), /Versanddatum|Abholung \/ Abgabe|Versandart|type="date"/);
  assert.deepEqual(zeilen(skelett, /<span class="pc-row-label">([^<]+)<\/span>/g), appZeilen);
  assert.deepEqual(zeilen(skelett, /<label class="field-label">([^<]+?)(?:<span> \*<\/span>)?<\/label>/g), appFelder);
  assert.deepEqual(zeilen(skelett, /class="pc-row-fields (pc-row-fields--\w+)"/g),
    ["pc-row-fields--place", "pc-row-fields--place", "pc-row-fields--package"]);
  assert.deepEqual(zeilen(app, /className="pc-row-fields (pc-row-fields--\w+)"/g), ["pc-row-fields--place"]);
  assert.match(editor, /public: \{ row: "pc-row-fields pc-row-fields--package"/, "die Paketreihe des Editors trägt andere Klassen");
  // Einheiten an denselben Feldern.
  assert.deepEqual(zeilen(skelett, /<span class="ce-field-unit">(\w+)<\/span>/g),
    [...zeilen(app, /unit="(\w+)"/g), ...zeilen(oeffentlich, /unit: "(\w+)"/g)]);
  // „Paket hinzufügen“ steht in der Startansicht — das Skelett trägt dieselbe Aktion (nicht bedienbar)
  // in derselben Klasse, damit beide gleich hoch bleiben (B5 in publicCalculatorBuild).
  assert.match(skelett, /<div class="pkg-lines-foot"><span class="pc-line-action pc-line-action--add">Paket hinzufügen<\/span><\/div>/);
  assert.match(editor, /add: "pc-line-action pc-line-action--add"/);
  assert.match(editor, />\s*Paket hinzufügen\s*</);
  // Nicht bedienbar: keine ids (keine Doppelungen mit der Insel), keine Namen, nichts im Tabulatorweg.
  assert.doesNotMatch(skelett, /\sid="|\sname="|<form|<button/);
  for (const feld of skelett.match(/<(input|select)[^>]*>/g)) assert.match(feld, /tabindex="-1"/, feld);
  // Die frühere feste Mindesthöhe der Wurzel ist entfallen — das Skelett gibt die Höhe vor.
  const css = lies(path.join(SRC, "styles", "public-calculator.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const wurzel = css.match(/\.pc-calculator-root \{([^}]*)\}/);
  assert.ok(wurzel, ".pc-calculator-root fehlt");
  assert.doesNotMatch(wurzel[1], /min-height|height:/);
  assert.doesNotMatch(css, /\.pc-calculator-root \{[^}]*min-height/);
});
