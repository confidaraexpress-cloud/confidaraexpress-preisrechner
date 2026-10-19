// Öffentlicher Preisrechner — Auslieferung (nginx, Dockerfile, Build, Service Worker).
//
// preisrechner.confidaraexpress.de lieferte bis 2026-10-16 dieselbe Anwendung aus wie die Hauptdomain.
// Seitdem hat die Domain einen eigenen server-Block mit eigener CSP und eine eigene statische Seite
// (zweiter Vite-Build). Diese Datei hält fest, was dabei nie auseinanderlaufen darf:
//   • der bisherige Block bleibt default_server und unverändert der erste (pwaGovernance liest ihn),
//   • der neue Block greift nur über server_name, mit einer CSP ohne Kartenkacheln und ohne
//     'unsafe-inline', und JEDE location mit eigenem add_header wiederholt den Sicherheitsblock,
//   • index.html und sw.js gehen no-cache hinaus, gehashte Assets ein Jahr immutable,
//   • die Seite gibt es genau unter „/“; Adressen der Anwendung (/login, /register …) leiten auf die
//     Hauptdomain, jede andere Adresse antwortet 404 mit eigener Seite — nie mit dem Rechner,
//   • das Dockerfile kopiert beide Builds, package.json baut den Hauptbuild unverändert zuerst,
//   • der Service Worker der Domain meldet sich nur ab und cacht nichts.
//
// Run: node --test src/styles/preisrechnerGovernance.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");
const ohneNginxKommentare = (s) => s.replace(/^\s*#.*$/gm, "");

const NGINX = ohneNginxKommentare(lies("nginx.conf"));
const BLOECKE = NGINX.split(/^server \{$/m).slice(1).map((b) => `server {${b}`);
const PREISRECHNER = BLOECKE.find((b) => /server_name preisrechner\.confidaraexpress\.de;/.test(b)) || "";
const kopfVon = (block) => block.slice(0, block.indexOf("location "));
const SICHERHEIT = (kopfVon(PREISRECHNER).match(/^\s*add_header .+ always;$/gm) || []).map((z) => z.trim());

function locationBlock(block, kopf) {
  const start = block.indexOf(kopf);
  assert.ok(start >= 0, `location fehlt: ${kopf}`);
  const ende = block.indexOf("\n    }", start);
  return block.slice(start, ende);
}

test("1 — genau zwei server-Blöcke: der bisherige zuerst und als default_server, danach der Preisrechner", () => {
  assert.equal(BLOECKE.length, 2);
  assert.match(BLOECKE[0], /^\s*listen 80 default_server;$/m);
  assert.match(BLOECKE[0], /^\s*root \/usr\/share\/nginx\/html;$/m);
  assert.doesNotMatch(BLOECKE[0], /server_name/, "der Anwendungsblock bleibt für jeden Host zuständig");
  assert.equal(BLOECKE[1], PREISRECHNER, "der Preisrechner-Block steht NACH dem bestehenden");
  assert.match(PREISRECHNER, /^\s*listen 80;$/m);
  assert.doesNotMatch(PREISRECHNER, /default_server/);
  assert.match(PREISRECHNER, /^\s*root \/usr\/share\/nginx\/preisrechner;$/m);
});

test("2 — eigene CSP: API als einzige fremde Verbindung, keine Kartenkacheln, kein unsafe-inline", () => {
  assert.equal(SICHERHEIT.length, 5, "fünf Sicherheitsheader auf Serverebene");
  const csp = SICHERHEIT.find((z) => z.startsWith("add_header Content-Security-Policy")) || "";
  assert.match(csp, /connect-src 'self' https:\/\/api\.confidaraexpress\.de;/);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /img-src 'self' data:;/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|openstreetmap|geoapify|blob:|frame-src/);
  // Die Verbindung folgt der Buildvariablen des API-Clients (CLAUDE.md: CSP ↔ Build-Variablen).
  const api = (lies(".env").match(/^VITE_API_URL=(.+)$/m) || [])[1];
  assert.equal(api && api.trim(), "https://api.confidaraexpress.de");
  for (const name of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
    assert.ok(SICHERHEIT.some((z) => z.startsWith(`add_header ${name} `)), `${name} fehlt`);
  }
});

test("3 — add_header wird nicht vererbt: jede location mit eigenem add_header wiederholt den Block", () => {
  const locations = [...PREISRECHNER.matchAll(/^ {4}location [^\n]+\{$/gm)].map((m) => m[0].trim());
  assert.ok(locations.length >= 5, `zu wenige locations: ${locations.join(" | ")}`);
  for (const kopf of locations) {
    const block = locationBlock(PREISRECHNER, kopf);
    if (!/add_header/.test(block)) continue;
    for (const zeile of SICHERHEIT) assert.ok(block.includes(zeile), `${kopf}: ${zeile.slice(0, 60)} fehlt`);
  }
});

test("4 — Caching: index.html und sw.js no-cache, gehashte Assets ein Jahr immutable", () => {
  for (const kopf of ["location = /index.html {", "location = /sw.js {"]) {
    const block = locationBlock(PREISRECHNER, kopf);
    assert.match(block, /add_header Cache-Control "no-cache[^"]*" always;/, kopf);
    assert.doesNotMatch(block, /expires|immutable/, kopf);
  }
  const assets = locationBlock(PREISRECHNER, "location ^~ /assets/ {");
  assert.match(assets, /expires 1y;/);
  assert.match(assets, /immutable/);
  // „/“ leitet intern auf /index.html (no-cache); alles andere fällt nicht mehr auf die Seite zurück.
  assert.match(locationBlock(PREISRECHNER, "location = / {"), /try_files \$uri \/index\.html;/);
  assert.match(locationBlock(PREISRECHNER, "location / {"), /try_files \$uri =404;/);
  const fehlerseite = locationBlock(PREISRECHNER, "location = /404.html {");
  assert.match(fehlerseite, /^\s*internal;$/m, "die 404-Seite ist nur intern erreichbar");
  assert.match(fehlerseite, /add_header Cache-Control "no-cache" always;/);
  assert.match(PREISRECHNER, /^\s*error_page 404 \/404\.html;$/m);
});

test("5 — Dockerfile kopiert beide Builds; package.json baut den Hauptbuild unverändert zuerst", () => {
  const docker = lies("Dockerfile");
  assert.match(docker, /^COPY --from=build \/app\/dist \/usr\/share\/nginx\/html$/m);
  assert.match(docker, /^COPY --from=build \/app\/dist-preisrechner \/usr\/share\/nginx\/preisrechner$/m);
  const pkg = JSON.parse(lies("package.json"));
  assert.equal(pkg.scripts.build, "vite build && vite build --config vite.preisrechner.config.js");
  assert.match(lies(".gitignore"), /^dist-preisrechner\/$/m);
});

test("6 — eigener Build: Wurzel preisrechner/, Ziel dist-preisrechner/, Umgebung aus der Repository-Wurzel", () => {
  const cfg = lies("vite.preisrechner.config.js");
  assert.match(cfg, /root: path\.join\(REPO, "preisrechner"\)/);
  assert.match(cfg, /publicDir: path\.join\(REPO, "preisrechner", "public"\)/);
  assert.match(cfg, /envDir: REPO/);
  assert.match(cfg, /outDir: path\.join\(REPO, "dist-preisrechner"\)/);
  assert.match(cfg, /apply: "serve"/, "die Asset-Umleitung gilt nur im Entwicklungsserver");
  const html = lies("preisrechner/index.html");
  assert.match(html, /<script type="module" src="\/main\.js"><\/script>/);
  assert.match(lies("preisrechner/main.js"), /^import "\.\.\/src\/public-calculator\/main\.jsx";$/m);
});

test("7 — der Service Worker der Domain meldet sich ab und cacht nichts", () => {
  const sw = lies("preisrechner/public/sw.js").replace(/\/\/.*$/gm, "");
  assert.match(sw, /self\.registration\.unregister\(\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.doesNotMatch(sw, /addEventListener\("fetch"|respondWith|caches\.open|cache\.(add|put)|caches\.match/);
  assert.match(sw, /name\.startsWith\("ce-offline-"\)/, "es werden nur die Offline-Ablagen der Anwendung entfernt");
  assert.doesNotMatch(lies("src/public-calculator/main.jsx"), /serviceWorker/, "die Seite registriert nichts");
});

test("8 — eigene robots.txt und dasselbe Favicon wie die Hauptdomain", () => {
  assert.match(lies("preisrechner/public/robots.txt"), /^User-agent: \*$/m);
  assert.equal(lies("preisrechner/public/favicon-v2.svg"), lies("public/favicon-v2.svg"));
});

// Auflösung wie nginx: exakte location zuerst, dann das längste Präfix; ^~ beendet die Suche, sonst
// gewinnt der erste passende reguläre Ausdruck (~ / ~*) in Dateireihenfolge, danach das Präfix.
function ordneZu(block, uri) {
  const orte = [...block.matchAll(/^ {4}location (=|\^~|~\*|~)? ?(\S+) \{$/gm)].map((m) => ({ mod: m[1] || "", muster: m[2] }));
  const exakt = orte.find((o) => o.mod === "=" && o.muster === uri);
  if (exakt) return `= ${exakt.muster}`;
  const praefix = orte.filter((o) => (o.mod === "" || o.mod === "^~") && uri.startsWith(o.muster))
    .sort((a, b) => b.muster.length - a.muster.length)[0];
  if (praefix && praefix.mod === "^~") return `^~ ${praefix.muster}`;
  const regex = orte.find((o) => (o.mod === "~" || o.mod === "~*") && new RegExp(o.muster, o.mod === "~*" ? "i" : "").test(uri));
  if (regex) return "weiterleitung";
  return praefix ? praefix.muster : null;
}

test("9 — Adressen: „/“ ist die Seite, Anwendungspfade gehen zur Hauptdomain, alles andere ist 404", () => {
  const zeile = PREISRECHNER.match(/^ {4}location ~\* \^\/\(([^)]+)\)\(\/\|\$\) \{$/m);
  assert.ok(zeile, "location für die Anwendungspfade fehlt");
  const weitergeleitet = zeile[1].split("|").sort();
  assert.match(locationBlock(PREISRECHNER, zeile[0].trim()), /^\s*return 302 https:\/\/confidaraexpress\.de\$request_uri;$/m,
    "Ziel ist fest die Hauptdomain, samt Pfad und Abfrage");
  // Die Liste folgt den Routen der Anwendung: jede erste Pfadstufe aus src/App.jsx, nichts darüber hinaus.
  const routen = [...new Set([...lies("src/App.jsx").matchAll(/<Route [^>]*\bpath="\/([^"/:*]+)/g)].map((m) => m[1]))].sort();
  assert.ok(routen.length >= 15, `zu wenige Routen erkannt: ${routen.join(", ")}`);
  assert.deepEqual(weitergeleitet, routen, "nginx-Weiterleitung und Routen in src/App.jsx laufen auseinander");

  const faelle = [
    ["/", "= /"], ["/index.html", "= /index.html"], ["/robots.txt", "= /robots.txt"], ["/sw.js", "= /sw.js"],
    ["/favicon-v2.svg", "^~ /favicon"], ["/assets/index-abc12345.js", "^~ /assets/"],
    ["/login", "weiterleitung"], ["/login/", "weiterleitung"], ["/LOGIN", "weiterleitung"], ["/register", "weiterleitung"],
    ["/registrieren", "weiterleitung"], ["/partner-registrieren", "weiterleitung"], ["/dashboard/settings", "weiterleitung"],
    ["/preisrechner-uebernahme", "weiterleitung"], ["/impressum", "weiterleitung"], ["/admin/users/7", "weiterleitung"],
    ["/loginx", "/"], ["/gibtsnicht", "/"], ["/preisrechner", "/"], ["/.env", "/"], ["/404.html", "= /404.html"],
  ];
  for (const [uri, erwartet] of faelle) assert.equal(ordneZu(PREISRECHNER, uri), erwartet, uri);
});

test("10 — die 404-Seite: eigener Eintrag im Build, ohne Skript, nicht indexiert, mit Weg zurück", () => {
  const cfg = lies("vite.preisrechner.config.js");
  assert.match(cfg, /index: path\.join\(REPO, "preisrechner", "index\.html"\)/);
  assert.match(cfg, /404: path\.join\(REPO, "preisrechner", "404\.html"\)/);
  const html = lies("preisrechner/404.html").replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(html, /<script|style="|<style/, "kein Skript (keine Aufwärmmeldung), nichts inline (CSP)");
  assert.match(html, /<meta name="robots" content="noindex" \/>/);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /href="\/"/, "Weg zurück zum Rechner");
  assert.match(html, /href="https:\/\/confidaraexpress\.de\/"/, "Weg zur Hauptdomain");
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /jumingo|transglobal/i);
});
