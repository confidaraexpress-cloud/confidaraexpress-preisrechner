// Statische Seitengerüste der Kunden-Anmeldung (Komplettabschluss, Abschnitt 5, 2026-10-28).
//
// login.html und register.html zeigen vor dem ersten Rendern das Endlayout der Anmeldung. Weil ein statisches
// Dokument nichts importieren kann, hält dieser Test die Gerüste mit ihren Quellen gleich:
//   • Satz, Unterzeile und Kartenlegende — utils/authSeitenText.mjs (dieselben Worte wie AuthPage und Preisrechner)
//   • Ansprechpartner, E-Mail und Telefon — config/companyProfile.js (Unternehmensangaben nur von dort)
//   • die Pfade — utils/kundenAuthPfad.mjs, gespiegelt in nginx.conf (mit vollständigem Sicherheitsheaderblock) und
//     in der Entwicklungs-/Vorschauweiche samt Builder-Eingängen (vite.config.js)
//   • das Blatt im Gerüst ist nicht bedienbar: aria-hidden, inert, keine ids, keine Namen, nichts im Tabulatorweg.
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

test("2 — Ansprechpartner, E-Mail und Telefon nur aus companyProfile — im Gerüst wie in AuthPage", () => {
  const { contactPerson, email, phone } = COMPANY_PROFILE;
  const initialen = contactPerson.split(/\s+/).map((w) => w[0]).join("");
  for (const datei of Object.keys(GERUESTE)) {
    const html = ohneKommentare(lies(datei));
    assert.ok(html.includes(`<span class="auth-kontakt-zeichen" aria-hidden="true">${initialen}</span>`), `${datei}: Initialen`);
    assert.ok(html.includes(`<p class="auth-kontakt-name">${contactPerson}, Ihr persönlicher Ansprechpartner</p>`), `${datei}: Name`);
    assert.ok(html.includes(`<a href="mailto:${email}">${email}</a>`), `${datei}: E-Mail`);
    assert.ok(html.includes(`<a href="tel:${phone}">${phone}</a>`), `${datei}: Telefon`);
    for (const ziel of ["impressum", "datenschutz", "agb", "widerruf"]) {
      assert.ok(html.includes(`<a href="/${ziel}" target="_blank" rel="noopener noreferrer">`), `${datei}: Link /${ziel}`);
    }
    // Kein Preisrechner-Knopf auf der Anmeldung (Audit D2), keine Vertrauensleiste ohne Beleg.
    assert.doesNotMatch(html, /preisrechner\.confidaraexpress\.de|Ihre Daten in besten Händen|auth-trust/);
  }
  const seite = lies("src/pages/AuthPage.jsx");
  assert.match(seite, /<p className="auth-kontakt-name">\{COMPANY_PROFILE\.contactPerson\}, Ihr persönlicher Ansprechpartner<\/p>/);
  assert.doesNotMatch(seite, new RegExp(`${contactPerson}|${email.replace(/\./g, "\\.")}|${phone}`), "AuthPage schreibt Kontaktdaten selbst");
});

test("3 — das Blatt im Gerüst ist nicht bedienbar und trägt die Gestalt des Formulars", () => {
  for (const [datei, art] of Object.entries(GERUESTE)) {
    const html = ohneKommentare(lies(datei));
    const start = html.indexOf('<div class="auth-card-bereich" aria-hidden="true" inert>');
    assert.ok(start > 0, `${datei}: das Blatt ist nicht aria-hidden und inert`);
    const ende = html.indexOf('<div class="auth-kontakt">', start);
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
  assert.deepEqual(STATISCHE_AUTH_SEITEN, { "/login": "login.html", "/register": "register.html", "/registrieren": "register.html" });
  assert.equal(statischeAuthSeite("/login/"), "login.html");
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
});

test("5 — main.jsx, App.jsx, AuthContext: ohne Token kein Ladebildschirm, mit Token die Prüfung auf dunklem Grund, die Seite ist vorgeladen", () => {
  const main = lies("src/main.jsx");
  assert.match(main, /if \(!DEMO_ZUSTAND\.aktiv && istKundenAuthPfad\(pfad\)\) \{/);
  assert.match(main, /seite\.vorladen\(\)\.then\(starten, starten\);/, "der Start wartet nicht auf die vorgeladene Seite");
  const app = lies("src/App.jsx");
  // Mit gespeichertem Token wartet die Anwendung auf jedem Pfad auf die Sitzungsprüfung (sonst überschriebe eine
  // verspätete Antwort eine neue Anmeldung oder die E-Mail-Bestätigung) — auf den Seiten mit Gerüst auf dunklem Grund.
  assert.match(app, /if \(loadingUser\) return <LoadingScreen dunkel=\{statischeAuthSeite\(pathname\) !== null\} \/>;/);
  assert.doesNotMatch(app, /istKundenAuthPfad/, "App.jsx nimmt die Anmeldepfade wieder von der Sitzungsprüfung aus");
  const lade = lies("src/components/common/LoadingScreen.jsx");
  assert.match(lade, /tone=\{dunkel \? "reverse" : "standard"\}/, "das Signet steht auf Navy nicht in der hellen Fassung");
  assert.match(lies("src/styles/layout.css"), /\.loading-screen--dunkel \{ background: var\(--ce-pr-navy-950, var\(--ce-sidebar-bg-bottom\)\); \}/);
  const kontext = lies("src/context/AuthContext.jsx");
  assert.match(kontext, /useState\(\(\) => Boolean\(getToken\(\)\)\)/, "ohne Token startet die Sitzungsprüfung trotzdem als ladend");
});
