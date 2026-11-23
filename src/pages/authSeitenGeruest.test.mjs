// Statische Seitengerüste der Kunden-Anmeldung (Komplettabschluss, Abschnitt 5, 2026-10-27).
//
// login.html und register.html zeigen vor dem ersten Rendern das Endlayout der Anmeldung. Weil ein statisches
// Dokument nichts importieren kann, hält dieser Test die Gerüste mit ihren Quellen gleich:
//   • Satz, Unterzeile und Kartenlegende — utils/authSeitenText.mjs (dieselben Worte wie AuthPage und Preisrechner)
//   • Kontakt (E-Mail und Telefon) — config/companyProfile.js (Unternehmensangaben nur von dort), Symbole aus
//     components/ui/Icon.jsx; seit 2026-11-06 ohne Namen und Initialen
//   • die Pfade — utils/kundenAuthPfad.mjs, gespiegelt in nginx.conf (mit vollständigem Sicherheitsheaderblock) und
//     in der Entwicklungs-/Vorschauweiche samt Builder-Eingängen (vite.config.js)
//   • das Blatt im Gerüst ist nicht bedienbar: aria-hidden, inert, keine ids, keine Namen, nichts im Tabulatorweg.
//   • die Wege für neue Besucher (Startklar, 2026-11-23) — Demo (demo/demoModus.mjs) und öffentlicher Preisrechner
//     (utils/publicQuoteHandoffView.mjs), Wortlaut aus utils/authSeitenText.mjs
// Die Deckungsgleichheit im Browser misst tests/e2e/authSeitengeruest.test.mjs.
//
// Run: node --test src/pages/authSeitenGeruest.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_TEXT } from "../utils/authSeitenText.mjs";
import { KUNDEN_AUTH_PFADE, STATISCHE_AUTH_SEITEN, istKundenAuthPfad, statischeAuthSeite } from "../utils/kundenAuthPfad.mjs";
import { COMPANY_PROFILE } from "../config/companyProfile.js";
import { DEMO_BASIS } from "../demo/demoModus.mjs";
import { PUBLIC_CALCULATOR_URL } from "../utils/publicQuoteHandoffView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, "..", "..");
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const GERUESTE = { "login.html": "login", "register.html": "register" };

test("1 — Satz, Unterzeile und Legende stehen wortgleich wie in AuthPage (AUTH_TEXT)", () => {
  const titel = AUTH_TEXT.titel.replace("­", "&shy;");
  for (const datei of Object.keys(GERUESTE)) {
    const html = ohneKommentare(lies(datei));
    assert.match(html, /<html lang="de" data-ce-bereich="auth">/, `${datei}: der Bereich fehlt am Dokument`);
    assert.ok(html.includes(`<h1 class="auth-title">${titel}</h1>`), `${datei}: der Satz weicht ab`);
    assert.ok(html.includes(`<p class="auth-sub-2">${AUTH_TEXT.lead}</p>`), `${datei}: die Unterzeile weicht ab`);
    assert.ok(html.includes(`</span>${AUTH_TEXT.kartenLegende}</figcaption>`), `${datei}: die Kartenlegende weicht ab`);
    assert.match(html, /<meta name="theme-color" content="#0A1636" \/>/);
    // Schrift und Kartenbild laden sofort; die Anwendung startet über denselben Einstieg wie index.html.
    assert.match(html, /<link rel="preload" href="\/src\/assets\/fonts\/instrumentsans-var\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
    // Blue Light (2026-11-16): die Titelschrift Host Grotesk lädt ebenso sofort — der Titel steht im ersten Bild in ihr.
    assert.match(html, /<link rel="preload" href="\/src\/assets\/fonts\/hostgrotesk-var\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
    assert.match(html, /<link rel="preload" href="\/src\/assets\/illustrations\/nachtkarte-eu\.svg" as="image" type="image\/svg\+xml" \/>/);
    assert.match(html, /<img class="auth-map-img" src="\/src\/assets\/illustrations\/nachtkarte-eu\.svg" alt="" width="536" height="497" decoding="async" \/>/);
    assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/);
    assert.doesNotMatch(html, /<style|style="/, `${datei}: Inline-Stile im Gerüst`);
  }
  const seite = lies("src/pages/AuthPage.jsx");
  assert.match(seite, /<h1 className="auth-title">\{AUTH_TEXT\.titel\}<\/h1>/);
  assert.match(seite, /<p className="auth-sub-2">\{AUTH_TEXT\.lead\}<\/p>/);
  // Botschaft G1: Versand UND Logistik, ohne Fulfillment-Versprechen.
  assert.match(AUTH_TEXT.titel, /^Versand- und Logistik­management für Unternehmen\.$/);
  assert.doesNotMatch(`${AUTH_TEXT.titel} ${AUTH_TEXT.lead}`, /Fulfillment|einlager|Lagerhaltung für/i);
});

test("2 — Kontakt: nur E-Mail und Telefon aus companyProfile, Symbole aus dem Icon-System — im Gerüst wie in AuthPage", () => {
  const { contactPerson, email, phone } = COMPANY_PROFILE;
  // Dieselben Pfade wie components/ui/Icon.jsx, dasselbe Markup, das <Icon> rendert — das Gerüst tippt nichts ab.
  const icon = lies("src/components/ui/Icon.jsx");
  const pfad = (n) => icon.match(new RegExp(`^\\s*${n}:\\s*"([^"]+)",`, "m"))[1];
  const svg = (n, s) => `<svg width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${pfad(n)}"/></svg>`;
  for (const datei of Object.keys(GERUESTE)) {
    const html = ohneKommentare(lies(datei));
    const start = html.indexOf('<div class="auth-kontakt">');
    assert.ok(start > 0, `${datei}: der Kontakt fehlt`);
    const kontakt = html.slice(start, html.indexOf('<nav class="auth-legal"', start));
    assert.ok(kontakt.includes(`<a class="auth-kontakt-weg" href="mailto:${email}"><span class="auth-kontakt-ico">${svg("mail", 18)}</span><span class="auth-kontakt-wert"><span class="sr-only">${AUTH_TEXT.kontaktMail}</span>${email}</span></a>`), `${datei}: E-Mail-Zeile`);
    assert.ok(kontakt.includes(`<a class="auth-kontakt-weg" href="tel:${phone}"><span class="auth-kontakt-ico">${svg("phone", 16)}</span><span class="auth-kontakt-wert"><span class="sr-only">${AUTH_TEXT.kontaktTelefon}</span>${phone}</span></a>`), `${datei}: Telefonzeile`);
    assert.equal((kontakt.match(/<a\b/g) || []).length, 2, `${datei}: genau zwei Kontaktwege`);
    // Betreiberentscheidung 2026-11-06: kein Name, keine Initialen, kein Titel „Ansprechpartner“ (im Formular der
    // Registrierung bleibt „Ansprechpartner“ die Beschriftung des Kundenfelds).
    assert.doesNotMatch(kontakt, /Ansprechpartner|auth-kontakt-(zeichen|name)/, `${datei}: Titel oder Initialen im Kontakt`);
    assert.doesNotMatch(html, new RegExp(contactPerson), `${datei}: Name im Gerüst`);
    for (const ziel of ["impressum", "datenschutz", "agb", "widerruf"]) {
      assert.ok(html.includes(`<a href="/${ziel}" target="_blank" rel="noopener noreferrer">`), `${datei}: Link /${ziel}`);
    }
    // Keine Vertrauensleiste ohne Beleg. Der Preisrechner steht seit Startklar nur als Weg für neue Besucher da (Test 2b).
    assert.doesNotMatch(html, /Ihre Daten in besten Händen|auth-trust/);
  }
  const seite = lies("src/pages/AuthPage.jsx");
  const code = seite.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(code, /<a className="auth-kontakt-weg" href=\{`mailto:\$\{COMPANY_PROFILE\.email\}`\}>\s*<span className="auth-kontakt-ico"><Icon n="mail" s=\{18\} \/><\/span>\s*<span className="auth-kontakt-wert"><span className="sr-only">\{AUTH_TEXT\.kontaktMail\}<\/span>\{COMPANY_PROFILE\.email\}<\/span>\s*<\/a>/);
  assert.match(code, /<a className="auth-kontakt-weg" href=\{`tel:\$\{COMPANY_PROFILE\.phone\}`\}>\s*<span className="auth-kontakt-ico"><Icon n="phone" s=\{16\} \/><\/span>\s*<span className="auth-kontakt-wert"><span className="sr-only">\{AUTH_TEXT\.kontaktTelefon\}<\/span>\{COMPANY_PROFILE\.phone\}<\/span>\s*<\/a>/);
  assert.doesNotMatch(code, /contactPerson|Ansprechpartner|auth-kontakt-(zeichen|name)/, "AuthPage nennt wieder einen Namen");
  assert.doesNotMatch(seite, new RegExp(`${contactPerson}|${email.replace(/\./g, "\\.")}|${phone}`), "AuthPage schreibt Kontaktdaten selbst");
});

test("2b — Wege für neue Besucher (Startklar, Konzept K4): Demo und Preisrechner im Kopf und unter dem Blatt", () => {
  // Betreiberentscheidung 2026-11-23 löst „kein Preisrechner-Knopf auf der Anmeldung“ (Audit D2) ab. Das Ziel von D2
  // bleibt: das Formular beginnt, wo es begann — die Wege stehen im Kopf neben der Marke und schmal unter dem Blatt.
  // Nur Verweise auf das Bestehende: dieselbe Demo, derselbe Rechner.
  assert.equal(DEMO_BASIS, "/demo");
  assert.equal(PUBLIC_CALCULATOR_URL, "https://preisrechner.confidaraexpress.de/");
  assert.deepEqual([AUTH_TEXT.wegeBereich, AUTH_TEXT.demo, AUTH_TEXT.preise, AUTH_TEXT.wegeFrage],
    ["Ohne Anmeldung umsehen", "Demo ansehen", "Versandpreise berechnen", "Erst einmal umsehen?"]);
  const kopf = `<nav class="auth-wege" aria-label="${AUTH_TEXT.wegeBereich}"><a class="auth-weg auth-weg--leise" href="${DEMO_BASIS}">${AUTH_TEXT.demo}</a><a class="auth-weg auth-weg--rand" href="${PUBLIC_CALCULATOR_URL}">${AUTH_TEXT.preise}</a></nav>`;
  const unten = `<div class="auth-wege-unten"><p class="auth-wege-frage">${AUTH_TEXT.wegeFrage}</p><a class="auth-weg-zeile" href="${PUBLIC_CALCULATOR_URL}">${AUTH_TEXT.preise}</a><a class="auth-weg-zeile" href="${DEMO_BASIS}">${AUTH_TEXT.demo}</a></div>`;
  for (const datei of Object.keys(GERUESTE)) {
    const html = ohneKommentare(lies(datei));
    const kopfBereich = html.slice(html.indexOf('<header class="auth-kopf">'), html.indexOf("</header>"));
    assert.ok(kopfBereich.includes(kopf), `${datei}: die Wege im Kopf weichen ab`);
    const blattEnde = html.indexOf('<div class="auth-wege-unten">');
    assert.ok(blattEnde > html.indexOf('<div class="auth-card-bereich"'), `${datei}: die Wege unten fehlen oder stehen vor dem Blatt`);
    assert.ok(html.slice(blattEnde, html.indexOf('<div class="auth-kontakt">')).trim() === unten, `${datei}: die Wege unten weichen ab`);
    // Genau diese beiden Stellen: kein weiterer Preisrechner-Knopf, keine zweite Demo.
    assert.equal(html.split(PUBLIC_CALCULATOR_URL).length - 1, 2, `${datei}: Preisrechner nicht genau zweimal`);
    assert.equal(html.split(`href="${DEMO_BASIS}"`).length - 1, 2, `${datei}: Demo nicht genau zweimal`);
  }
  const seite = lies("src/pages/AuthPage.jsx");
  const code = seite.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(code, /<header className="auth-kopf">\s*<BrandLogo variant="lockup" tone="reverse" className="auth-brand" \/>\s*<nav className="auth-wege" aria-label=\{AUTH_TEXT\.wegeBereich\}>\s*<a className="auth-weg auth-weg--leise" href=\{DEMO_BASIS\}>\{AUTH_TEXT\.demo\}<\/a>\s*<a className="auth-weg auth-weg--rand" href=\{PUBLIC_CALCULATOR_URL\}>\{AUTH_TEXT\.preise\}<\/a>\s*<\/nav>\s*<\/header>/);
  assert.match(code, /<div className="auth-wege-unten">\s*<p className="auth-wege-frage">\{AUTH_TEXT\.wegeFrage\}<\/p>\s*<a className="auth-weg-zeile" href=\{PUBLIC_CALCULATOR_URL\}>\{AUTH_TEXT\.preise\}<\/a>\s*<a className="auth-weg-zeile" href=\{DEMO_BASIS\}>\{AUTH_TEXT\.demo\}<\/a>\s*<\/div>\s*<div className="auth-kontakt">/);
  // Die Demo ist eine eigene Seitenladung (main.jsx schirmt Speicher und Netz vor dem ersten Rendern ab): ein
  // gewöhnlicher Link, kein Router-Link. Ziele nur aus den Quellmodulen, nie abgetippt.
  assert.doesNotMatch(code, /<Link[^>]*DEMO_BASIS|preisrechner\.confidaraexpress\.de|href="\/demo"/);
});

test("3 — das Blatt im Gerüst ist nicht bedienbar und trägt die Gestalt des Formulars", () => {
  for (const [datei, art] of Object.entries(GERUESTE)) {
    const html = ohneKommentare(lies(datei));
    const start = html.indexOf('<div class="auth-card-bereich" aria-hidden="true" inert>');
    assert.ok(start > 0, `${datei}: das Blatt ist nicht aria-hidden und inert`);
    // Das Blatt endet vor den Wegen für neue Besucher (Startklar) — die sind bedienbar wie Kontakt und Rechtliches.
    const ende = html.indexOf('<div class="auth-wege-unten">', start);
    assert.ok(ende > start, `${datei}: die Wege unter dem Blatt fehlen`);
    const blatt = html.slice(start, ende);
    assert.match(blatt, new RegExp(`<div class="auth-card auth-card--${art} auth-geruest">`), `${datei}: falsche Blattvariante`);
    assert.doesNotMatch(blatt, /\sid="|\sname="|<form[^>]*action|type="submit"|autofocus/, `${datei}: das Gerüst ist bedienbar oder trägt ids`);
    for (const feld of blatt.match(/<(input|button|a)\b[^>]*>/g) || []) {
      assert.match(feld, /tabindex="-1"/, `${datei}: ${feld} liegt im Tabulatorweg`);
    }
    // Kein Schein-Passwort als Platzhalter (Audit B.9).
    assert.doesNotMatch(blatt, /placeholder="•/);
  }
});

test("4 — die Pfade: kundenAuthPfad ↔ nginx (vollständiger Headerblock) ↔ Entwicklungsweiche und Build", () => {
  assert.deepEqual(KUNDEN_AUTH_PFADE, ["/login", "/register", "/registrieren", "/confirm-email-change"]);
  // Admin-Anmeldung (Canonical v2.130, bewusste Ankeränderung): /admin/login bekommt ein dunkles Gerüst.
  assert.deepEqual(STATISCHE_AUTH_SEITEN, { "/login": "login.html", "/register": "register.html", "/registrieren": "register.html",
    "/admin/login": "admin-login.html" });
  assert.equal(statischeAuthSeite("/login/"), "login.html");
  assert.equal(statischeAuthSeite("/admin/login"), "admin-login.html");
  assert.equal(istKundenAuthPfad("/admin/login"), false, "die Admin-Anmeldung ist kein Kundenpfad (eigenes Vorladen in main.jsx)");
  assert.equal(statischeAuthSeite("/confirm-email-change"), null, "die E-Mail-Bestätigung hat kein Gerüst");
  assert.equal(statischeAuthSeite("/partner-registrieren"), null, "die Partnerregistrierung bleibt unverändert");
  assert.equal(istKundenAuthPfad("/registrieren/"), true);
  assert.equal(istKundenAuthPfad("/partner-registrieren"), false);
  assert.equal(istKundenAuthPfad(undefined), false);

  const nginx = lies("nginx.conf");
  const app = nginx.slice(0, nginx.indexOf("server_name preisrechner.confidaraexpress.de"));
  const csp = app.match(/add_header Content-Security-Policy "([^"]+)" always;/)[1];
  for (const [pfad, datei] of Object.entries(STATISCHE_AUTH_SEITEN)) {
    const block = app.match(new RegExp(`location = ${pfad} \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(block, `nginx: location = ${pfad} fehlt`);
    assert.match(block[1], new RegExp(`try_files /${datei.replace(".", "\\.")} =404;`), `nginx ${pfad}: falsches Gerüst`);
    assert.match(block[1], /add_header Cache-Control "no-cache, must-revalidate" always;/, `nginx ${pfad}: wird gecacht`);
    for (const kopf of ["X-Content-Type-Options \"nosniff\"", "X-Frame-Options \"DENY\"", "Referrer-Policy", "Permissions-Policy"]) {
      assert.ok(block[1].includes(`add_header ${kopf}`), `nginx ${pfad}: ${kopf} fehlt (add_header wird nicht vererbt)`);
    }
    assert.ok(block[1].includes(`add_header Content-Security-Policy "${csp}" always;`), `nginx ${pfad}: andere CSP als die Anwendung`);
  }
  for (const datei of new Set(Object.values(STATISCHE_AUTH_SEITEN))) {
    assert.match(app, new RegExp(`location = /${datei.replace(".", "\\.")} \\{ return 302 /`), `nginx: /${datei} direkt erreichbar`);
  }

  const vite = lies("vite.config.js");
  assert.match(vite, /import \{ statischeAuthSeite \} from "\.\/src\/utils\/kundenAuthPfad\.mjs";/);
  assert.match(vite, /configureServer\(server\) \{ server\.middlewares\.use\(seitengeruestWeiche\); \}/);
  assert.match(vite, /configurePreviewServer\(server\) \{ server\.middlewares\.use\(seitengeruestWeiche\); \}/);
  for (const eingang of ["index", "login", "register"]) {
    assert.match(vite, new RegExp(`${eingang}: path\\.join\\(REPO, "${eingang}\\.html"\\)`), `Builder-Eingang ${eingang} fehlt`);
  }
  // Nur Seitenaufrufe (Accept: text/html), nie Dateien oder API-Pfade.
  assert.match(vite, /const html = String\(req\.headers\?\.accept \|\| ""\)\.includes\("text\/html"\);/);
  // EIN Einstieg (Versionsprüfung, utils/appVersionCheck.mjs): die Gerüste verlieren ihr Modulskript im Build und
  // tragen danach die Einstiegs-Tags der gebauten index.html — kein zweiter JavaScript-Einstieg.
  for (const anker of ['enforce: "post"', 'order: "pre"', 'html.replace(MODULSKRIPT, "")', 'order: "post"', "einstiege.length !== 1"]) {
    assert.ok(vite.includes(anker), `vite.config.js: ${anker} fehlt (ein Einstieg für die Versionsprüfung)`);
  }
  // Admin-Anmeldung (Canonical v2.130): eigenes Gerüst im Build, ebenfalls ohne eigenen JavaScript-Einstieg.
  assert.match(vite, /adminLogin: path\.join\(REPO, "admin-login\.html"\)/);
  assert.match(vite, /const GERUESTE = \["login\.html", "register\.html", "admin-login\.html"\];/);
});

test("4b — das Gerüst der Admin-Anmeldung: fertige Komposition ruhend, Bereich auth, kein Formular, nicht zu indizieren", () => {
  const html = lies("admin-login.html");
  assert.match(html, /<html lang="de" data-ce-bereich="auth">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(html, /<div class="auth-admin-seite auth-admin-geruest">/, "ruhend: im Gerüst läuft keine Bewegung");
  assert.match(html, /<div class="auth-admin-buehne" aria-hidden="true">/);
  assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/, "das Modulskript (fällt im Build weg)");
  // Canonical v2.131: Hologramm und Panel stehen ab dem ersten Bild (LCP vor dem Laden des Skripts), sind aber nicht
  // bedienbar — keine Formularelemente, keine ids, der ganze Inhalt inert und für Hilfstechnik verborgen.
  assert.match(html, /<main class="auth-admin-mitte" aria-hidden="true" inert>/);
  assert.doesNotMatch(ohneKommentare(html), /<form|<input|<button|<label|\sid="(?!root")/, "bedienbar ist erst die fertige Seite");
  const main = lies("src/main.jsx");
  assert.match(main, /AdminAnmeldungSeite\.vorladen\(\)\.then\(starten, starten\);/, "die Admin-Anmeldung wird vor dem ersten Rendern geladen");
});

test("5 — main.jsx, App.jsx, AuthContext: ohne Token kein Ladebildschirm, mit Token die Prüfung auf dunklem Grund, die Seite ist vorgeladen", () => {
  const main = lies("src/main.jsx");
  assert.match(main, /if \(!DEMO_ZUSTAND\.aktiv && istKundenAuthPfad\(pfad\)\) \{/);
  assert.match(main, /seite\.vorladen\(\)\.then\(starten, starten\);/, "der Start wartet nicht auf die vorgeladene Seite");
  const app = lies("src/App.jsx");
  // Mit gespeichertem Token wartet die Anwendung auf jedem Pfad auf die Sitzungsprüfung (sonst überschriebe eine
  // verspätete Antwort eine neue Anmeldung oder die E-Mail-Bestätigung) — auf den Seiten mit Gerüst auf dunklem Grund.
  // Confidara Obsidian (2026-11-15), seit 2026-11-16 Premium Blue Light: auf den Kundenpfaden zusätzlich auf dem Grund
  // des Kundenbereichs — nur
  // Darstellung, die Prüfung selbst bleibt auf jedem Pfad (utils/kundenBereichPfad.test.mjs, K4).
  // Confidara Leitstand Nacht (2026-11-17): auch auf Adminpfaden dunkel (kundenBereichPfad.test.mjs K8).
  assert.match(app, /if \(loadingUser\) return <LoadingScreen dunkel=\{statischeAuthSeite\(pathname\) !== null \|\| adminPfad\} kunde=\{kundenPfad\} \/>;/);
  assert.doesNotMatch(app, /istKundenAuthPfad/, "App.jsx nimmt die Anmeldepfade wieder von der Sitzungsprüfung aus");
  const lade = lies("src/components/common/LoadingScreen.jsx");
  assert.match(lade, /tone=\{dunkel \? "reverse" : "standard"\}/, "das Signet steht auf Navy nicht in der hellen Fassung");
  assert.match(lies("src/styles/layout.css"), /\.loading-screen--dunkel \{ background: var\(--ce-pr-navy-950, var\(--ce-sidebar-bg-bottom\)\); \}/);
  const kontext = lies("src/context/AuthContext.jsx");
  assert.match(kontext, /useState\(\(\) => Boolean\(getToken\(\)\)\)/, "ohne Token startet die Sitzungsprüfung trotzdem als ladend");
});
