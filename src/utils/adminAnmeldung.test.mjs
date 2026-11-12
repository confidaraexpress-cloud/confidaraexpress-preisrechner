// Admin-Anmeldung /admin/login (Canonical v2.130): reine Logik, Wortlaut und Quelltextgrenzen der Seite.
// Run: node --test src/utils/adminAnmeldung.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ADMIN_ANMELDUNG_TEXT, ADMIN_ANMELDE_FEHLER, ADMIN_VERGESSEN_ERFOLG, ADMIN_LOGIN_PATH, ADMIN_HOME,
  mapAdminAnmeldeFehler, mapAdminVergessenFehler, adminZielNachAnmeldung, anmeldeseiteFuer,
  ohneSitzungsweiterleitung, resetTokenAus,
} from "./adminAnmeldung.mjs";
import { AUTH_CODE_TEXTE, istAdminAnmeldungVerweis } from "./authErrors.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("1 — Pfade: /admin/login und /admin", () => {
  assert.equal(ADMIN_LOGIN_PATH, "/admin/login");
  assert.equal(ADMIN_HOME, "/admin");
});

test("2 — Anmeldefehler: Codes steuern, ohne Passwort verrät nichts das Konto", () => {
  assert.equal(mapAdminAnmeldeFehler(401, { code: "INVALID_CREDENTIALS" }), ADMIN_ANMELDE_FEHLER.INVALID_CREDENTIALS);
  assert.equal(mapAdminAnmeldeFehler(401, null), ADMIN_ANMELDE_FEHLER.INVALID_CREDENTIALS);
  assert.equal(mapAdminAnmeldeFehler(403, { code: "ADMIN_ACCESS_REQUIRED", error: "roh" }), "Für dieses Konto besteht kein Zugang zum Adminbereich.");
  assert.equal(mapAdminAnmeldeFehler(403, { code: "ACCOUNT_BLOCKED" }), ADMIN_ANMELDE_FEHLER.ACCOUNT_BLOCKED);
  assert.equal(mapAdminAnmeldeFehler(403, { code: "ACCOUNT_PENDING_APPROVAL" }), ADMIN_ANMELDE_FEHLER.ACCOUNT_PENDING_APPROVAL);
  assert.equal(mapAdminAnmeldeFehler(403, { error: "Serverrohtext" }), ADMIN_ANMELDE_FEHLER.ADMIN_ACCESS_REQUIRED, "nie ein Rohtext");
  assert.equal(mapAdminAnmeldeFehler(429, { error: "Zu viele" }), ADMIN_ANMELDE_FEHLER.ZU_VIELE);
  assert.match(mapAdminAnmeldeFehler(500, null), /nicht möglich/);
  assert.match(mapAdminAnmeldeFehler(404, null), /nicht möglich/, "ein fehlender Eingang ist ein Serverfehler, kein Anmeldefehler");
  // Kein Text nennt die Rolle eines Kontos ohne gültiges Passwort.
  assert.doesNotMatch(ADMIN_ANMELDE_FEHLER.INVALID_CREDENTIALS, /Admin|Kunde|Partner/);
});

test("3 — Passwort vergessen: immer neutral, Fehler ohne Rohtext", () => {
  assert.match(ADMIN_VERGESSEN_ERFOLG, /^Falls zu dieser E-Mail-Adresse ein Konto besteht/);
  assert.match(mapAdminVergessenFehler(429), /Zu viele Anfragen/);
  assert.match(mapAdminVergessenFehler(400), /gültige E-Mail-Adresse/);
  assert.match(mapAdminVergessenFehler(500), /nicht verarbeitet/);
});

test("4 — Ziel nach der Anmeldung: nur geprüfte Adminziele, sonst /admin", () => {
  assert.equal(adminZielNachAnmeldung("/admin/users/7"), "/admin/users/7");
  assert.equal(adminZielNachAnmeldung("/admin/audit-logs"), "/admin/audit-logs");
  for (const fremd of ["/dashboard", "/partner", "https://evil.example/admin", "//evil.example", "/admin/login", null, undefined, 42]) {
    assert.equal(adminZielNachAnmeldung(fremd), "/admin", `durchgelassen: ${String(fremd)}`);
  }
});

test("5 — Sitzungsende: Adminbereich → /admin/login, sonst /login; keine Weiterleitung auf den Anmeldeseiten", () => {
  for (const p of ["/admin", "/admin/users", "/admin/users/5", "/admin/partners/credit-notes", "/vorschau/rechtstexte/agb", "/admin/login"]) {
    assert.equal(anmeldeseiteFuer(p), "/admin/login", p);
  }
  for (const p of ["/dashboard", "/calculator", "/booking", "/partner", "/administration", "/", undefined]) {
    assert.equal(anmeldeseiteFuer(p), "/login", String(p));
  }
  for (const p of ["/login", "/admin/login", "/confirm-email-change"]) assert.equal(ohneSitzungsweiterleitung(p), true, p);
  for (const p of ["/admin", "/dashboard", "/register"]) assert.equal(ohneSitzungsweiterleitung(p), false, p);
});

test("6 — Einmallink aus der Adresse: nur die Form eines Tokens", () => {
  const t = "a".repeat(64);
  assert.equal(resetTokenAus(`?reset=${t}`), t);
  assert.equal(resetTokenAus(`?x=1&reset=${t}`), t);
  for (const s of ["", "?reset=", "?reset=kurz", `?reset=${"a".repeat(64)}%3Cscript`, "?reset=../../x", null, undefined]) {
    assert.equal(resetTokenAus(s), null, String(s));
  }
});

test("7 — Wortlaut nach Auftrag: Adminbereich, Passwort vergessen?, kein Werbe- oder Sicherheitstext", () => {
  assert.equal(ADMIN_ANMELDUNG_TEXT.titel, "Adminbereich");
  assert.equal(ADMIN_ANMELDUNG_TEXT.vergessen, "Passwort vergessen?");
  const alles = Object.values(ADMIN_ANMELDUNG_TEXT).join(" ");
  for (const verboten of [/autorisiert/i, /registrier/i, /Konto erstellen/i, /sicher(er|e) Zugang/i, /Willkommen/i]) {
    assert.doesNotMatch(alles, verboten);
  }
});

test("8 — Kundenlogin (Stufe 2): Verweis auf die Admin-Anmeldung über den Code, nie über den Text", () => {
  assert.equal(istAdminAnmeldungVerweis({ code: "ADMIN_LOGIN_REQUIRED" }), true);
  assert.equal(istAdminAnmeldungVerweis({ error: "Administratoren melden sich über die Admin-Anmeldung an." }), false);
  assert.equal(istAdminAnmeldungVerweis(null), false);
  assert.match(AUTH_CODE_TEXTE.ADMIN_LOGIN_REQUIRED, /Admin-Anmeldung/);
  const seite = ohneKommentare(lies("pages/AuthPage.jsx"));
  assert.match(seite, /setAdminWeg\(istAdminAnmeldungVerweis\(d\)\)/);
  assert.match(seite, /<Link className="auth-card-wechsel-btn" to="\/admin\/login">Zur Admin-Anmeldung<\/Link>/);
});

test("9 — Seite: eigener Eingang, keine Registrierung, kein „Angemeldet bleiben“, Bühne dekorativ", () => {
  const seite = ohneKommentare(lies("pages/AdminAnmeldungPage.jsx"));
  const api = lies("api/adminAnmeldungApi.js");
  assert.match(api, /apiFetch\("\/auth\/admin-login", \{ method: "POST"/);
  assert.doesNotMatch(api, /rememberMe/, "der Admin-Eingang kennt kein „Angemeldet bleiben“");
  assert.match(seite, /useCeBereich\("auth"\)/);
  // Canonical v2.131: Bühne „Leitstand“ hinter allem, das Hologramm als erstes Element der Mitte (vor dem Panel), der
  // Glanz als erstes Kind des Panels — alles dekorativ.
  assert.match(seite, /<AdminLeitstand \/>\s*<main className="auth-admin-mitte">\s*<AdminHologramm \/>\s*<section className="auth-admin-panel"/);
  assert.match(seite, /<section className="auth-admin-panel"[^>]*>\s*<span className="auth-admin-glanz" aria-hidden="true" \/>/);
  // Angemeldeter Admin → Adminpanel, außer die Seite kam mit einem Einmallink (Einrichtung bei offener Sitzung eines
  // anderen Kontos): dann der Link-Schritt, und nach dem Speichern endet die offene Sitzung (E2E G2).
  assert.match(seite, /if \(authed && isAdmin\(user\) && !resetToken\) return <Navigate to=\{ziel\} replace \/>;/);
  assert.match(seite, /setNeu\(""\); setNeuWdh\(""\);\s*if \(authed\) logout\(\);/, "nach dem Speichern endet eine offene Sitzung");
  assert.match(seite, /if \(!isAdmin\(angemeldet\)\) \{ logout\(\);/, "Schutz in der Tiefe: Nicht-Admins werden sofort abgemeldet");
  assert.doesNotMatch(seite, /register|Registrieren|rememberMe|Angemeldet bleiben|dangerouslySetInnerHTML/);
  assert.doesNotMatch(seite, /https?:\/\//, "keine externen Ressourcen");
  assert.match(seite, /autoComplete="username"/);
  assert.match(seite, /autoComplete="current-password"/);
  assert.equal((seite.match(/autoComplete="new-password"/g) || []).length, 2);
  // Passwort anzeigen/verbergen ist per Tastatur erreichbar und benannt.
  assert.match(seite, /aria-pressed=\{sichtbar\}/);
  assert.doesNotMatch(seite, /tabIndex=\{-1\}[^>]*auth-admin-auge/);
  const buehne = lies("components/auth/AdminLeitstand.jsx");
  assert.match(buehne, /className="auth-admin-buehne" aria-hidden="true"/);
  const holo = lies("components/auth/AdminHologramm.jsx");
  assert.match(holo, /className="auth-admin-holo" aria-hidden="true"/);
  for (const quelle of [buehne, holo]) {
    // Kein Bild, kein Text, keine Interaktion, keine externe Ressource: Netz und Pfeile kommen aus dem Stylesheet.
    assert.doesNotMatch(ohneKommentare(quelle), /<img|<svg|onClick|onPointer|tabIndex|https?:\/\//);
    const jsx = ohneKommentare(quelle);
    const markup = jsx.slice(jsx.indexOf("<div className="), jsx.lastIndexOf("</div>"));
    assert.doesNotMatch(markup.replace(/<[^>]*>/g, ""), /[A-Za-zÄÖÜäöüß]{2,}/, "kein sichtbarer Text");
  }
});

test("10 — Route: /admin/login im Auth-Bereich, außerhalb von AdminRoute; Abmelden und Schutzroute führen dorthin", () => {
  const app = ohneKommentare(lies("App.jsx"));
  const auth = app.slice(app.indexOf("<Route element={<AuthAreaBoundary />}>"), app.indexOf("</Route>", app.indexOf("<Route element={<AuthAreaBoundary />}>")));
  assert.match(auth, /<Route path="\/admin\/login" element=\{<AdminAnmeldungSeite \/>\} \/>/);
  const adminBlock = app.slice(app.indexOf("<Route element={<AdminRoute><AdminLayout /></AdminRoute>}>"));
  assert.doesNotMatch(adminBlock.slice(0, adminBlock.indexOf("</Route>")), /admin\/login/);
  assert.match(ohneKommentare(lies("components/layout/AdminSidebar.jsx")), /logout\(\); navigate\("\/admin\/login"\);/);
  assert.match(ohneKommentare(lies("routes/AdminRoute.jsx")), /<Navigate to="\/admin\/login" replace/);
});

test("11 — Gestaltung: Bewegung nur über transform/opacity, Standbild bei reduzierter Bewegung, Kontrastmodus", () => {
  const css = lies("styles/auth.css");
  const abschnitt = css.slice(css.indexOf("Admin-Anmeldung /admin/login (Canonical v2.131)"));
  assert.ok(abschnitt.length > 2000, "Abschnitt fehlt");
  // Keyframes bewegen nur translate/scale/rotate/transform und opacity (Blöcke per Klammerzählung gelesen).
  let anzahl = 0;
  for (const m of abschnitt.matchAll(/@keyframes [\w-]+ \{/g)) {
    let tiefe = 1, i = m.index + m[0].length;
    while (tiefe > 0 && i < abschnitt.length) { if (abschnitt[i] === "{") tiefe++; else if (abschnitt[i] === "}") tiefe--; i++; }
    const koerper = abschnitt.slice(m.index + m[0].length, i - 1);
    const eigenschaften = [...koerper.matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
    for (const e of eigenschaften) assert.ok(["translate", "scale", "rotate", "transform", "opacity"].includes(e), `${m[0]} animiert ${e}`);
    anzahl++;
  }
  assert.ok(anzahl >= 8, "die Keyframes wurden nicht gelesen");
  const rm = abschnitt.slice(abschnitt.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(rm, /\.auth-admin-holo \*, \.auth-admin-holo \*::before, \.auth-admin-holo \*::after,[^{]*\{ animation: none; \}/);
  // Standbild, nicht leer: Scanlinie und Scanebene stehen in der Mitte des Pakets, die Impulse auf ihren Routen.
  assert.match(rm, /\.auth-admin-holo-scan \{ opacity: 1; translate: /, "die Scanlinie steht als Standbild da");
  assert.match(rm, /\.auth-admin-holo-scanebene \{ opacity: 1; translate: /);
  assert.match(rm, /\.auth-admin-holo-impuls \{ opacity: 0\.85; translate: /, "die Impulse stehen als Standbild da");
  assert.match(abschnitt, /@media \(forced-colors: active\) \{\s*\.auth-admin-buehne, \.auth-admin-holo \{ display: none; \}/);
  assert.match(abschnitt, /\.auth-admin-buehne \{\s*position: fixed; inset: 0; z-index: 0;\s*overflow: hidden; pointer-events: none;/);
  // Das Hologramm fängt keine Klicks ab; im Seitengerüst ruht es (die Startwerte der Bewegung sind sein Ruhezustand).
  assert.match(abschnitt, /\.auth-admin-holo \{[^}]*pointer-events: none;/);
  assert.match(abschnitt, /\.auth-admin-geruest \.auth-admin-holo \*,\s*\.auth-admin-geruest \.auth-admin-holo \*::before,\s*\.auth-admin-geruest \.auth-admin-holo \*::after \{ animation: none; \}/);
  // Das Panel blendet nicht ein: Das Gerüst zeigt es schon im ersten Bild, eine Einblendung ließe es kurz verschwinden.
  const panel = abschnitt.slice(abschnitt.indexOf(".auth-admin-panel {"), abschnitt.indexOf("}", abschnitt.indexOf(".auth-admin-panel {")));
  assert.doesNotMatch(panel, /animation/);
  assert.doesNotMatch(abschnitt, /url\(["']?https?:/, "keine externen Ressourcen im Stil");
  // Fokus ist sichtbar: Eingaben, Auge, Link, Knopf.
  for (const sel of [".auth-admin-eingabe:focus-within", ".auth-admin-auge:focus-visible", ".auth-admin-link:focus-visible", ".auth-admin-cta:focus-visible"]) {
    assert.ok(abschnitt.includes(sel), `Fokuszustand fehlt: ${sel}`);
  }
});

test("12 — Seitengerüst admin-login.html: dieselbe Bühne, dasselbe Hologramm, ein Panel mit demselben Wortlaut", () => {
  const html = readFileSync(path.join(SRC, "..", "admin-login.html"), "utf8").replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const tags = (text, attr) => [...text.matchAll(new RegExp(String.raw`<(div|span)\b(?:\s+${attr}="([^"]*)")?`, "g"))].map((m) => `${m[1]}.${m[2] || ""}`);
  const zwischen = (text, von, bis) => { const a = text.indexOf(von); const b = text.indexOf(bis, a); assert.ok(a >= 0 && b > a, `${von} … ${bis} fehlt`); return text.slice(a, b); };
  // Bühne und Hologramm: Element für Element gleich (Tag und Klassen), damit React das Gerüst ohne Sprung ersetzt.
  const leitstand = ohneKommentare(lies("components/auth/AdminLeitstand.jsx"));
  const hologramm = ohneKommentare(lies("components/auth/AdminHologramm.jsx"));
  assert.deepEqual(tags(zwischen(html, '<div class="auth-admin-buehne"', "<main"), "class"),
    tags(leitstand.slice(leitstand.indexOf('<div className="auth-admin-buehne"')), "className"));
  const holoJsx = tags(hologramm.slice(hologramm.indexOf('<div className="auth-admin-holo"')), "className");
  assert.deepEqual(tags(zwischen(html, '<div class="auth-admin-holo"', '<section class="auth-admin-panel">'), "class"), holoJsx);
  assert.ok(holoJsx.length > 30, "das Hologramm wurde nicht gelesen");
  // Das Panel im Gerüst: derselbe Wortlaut wie die Seite, keine Formularelemente, keine ids, nicht bedienbar.
  const T = ADMIN_ANMELDUNG_TEXT;
  assert.match(html, /<main class="auth-admin-mitte" aria-hidden="true" inert>/);
  const panel = zwischen(html, '<section class="auth-admin-panel">', "</main>");
  for (const text of [T.titel, T.email, T.passwort, T.vergessen, T.anmelden]) assert.ok(panel.includes(`>${text}<`), `Text fehlt: ${text}`);
  assert.doesNotMatch(panel, /<form|<input|<button|<label|\sid=|tabindex|href=/);
  assert.match(panel, /<img class="ce-brandmark-img" src="\/src\/assets\/brand\/lockup-reverse\.svg" alt="ConfidaraExpress" draggable="false" \/>/);
  assert.match(html, /<nav class="auth-admin-recht" aria-label="Rechtliche Informationen">/);
  assert.equal(T.recht, "Rechtliche Informationen");
  // Symbole wie components/ui/Icon.jsx (E-Mail, Schloss, Auge).
  const icon = lies("components/ui/Icon.jsx");
  for (const n of ["mail", "lock", "eye"]) {
    const d = icon.match(new RegExp(String.raw`\n\s*${n}:\s*"([^"]+)"`))[1];
    assert.ok(panel.includes(`<path d="${d}" />`), `Symbol ${n} weicht von Icon.jsx ab`);
  }
});
