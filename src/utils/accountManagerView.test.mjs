// Persönlicher ConfidaraExpress-Ansprechpartner der Seitenleiste (Canonical 1A, v2.90) — Ansichtslogik und
// Quelltextanker der Karte, des Datenflusses (/kundenbereich → AuthContext → Seitenleiste) und der Stile.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ANSPRECH_TEXT, PULS_SPEICHER_SCHLUESSEL, ansprechpartnerAnsicht, emailTeile, initialen, pulsAngehalten, pulsMerken,
} from "./accountManagerView.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PATRICK = {
  key: "patrick", name: "Patrick Werner", phone: { display: "0175 4167701", href: "tel:+491754167701" },
  email: "p.werner@confidaraexpress.de", photo: { version: "f9f2e8726f13" },
};

test("1 — Person: Anzeige nur aus dem Serverfeld, Links fertig, Initialen, Fotoversion", () => {
  const a = ansprechpartnerAnsicht(PATRICK);
  assert.equal(a.art, "person");
  assert.deepEqual([a.name, a.rolle, a.initialen, a.fotoVersion], ["Patrick Werner", "Ihr Ansprechpartner", "PW", "f9f2e8726f13"]);
  assert.deepEqual(a.telefon, { anzeige: "0175 4167701", href: "tel:+491754167701" });
  assert.deepEqual(a.email, { adresse: "p.werner@confidaraexpress.de", href: "mailto:p.werner@confidaraexpress.de", lokal: "p.werner", domain: "@confidaraexpress.de" });
  assert.equal(ansprechpartnerAnsicht({ ...PATRICK, photo: null }).fotoVersion, null, "ohne Foto Initialen");
});

test("2 — ohne oder mit unvollständiger Zuordnung: Kundenservice, nie eine geratene oder halbe Person", () => {
  const faelle = [
    null, undefined, {}, "miguel",
    { ...PATRICK, name: " " }, { ...PATRICK, phone: null }, { ...PATRICK, phone: { display: "0175", href: "tel:01754167701" } },
    { ...PATRICK, email: "kein-postfach" }, { ...PATRICK, key: "Patrick" }, { ...PATRICK, phone: { display: "", href: "tel:+491754167701" } },
  ];
  for (const f of faelle) {
    const a = ansprechpartnerAnsicht(f);
    assert.deepEqual([a.art, a.name, a.rolle, a.telefon, a.email, a.fotoVersion], ["service", "ConfidaraExpress", "Kundenservice", null, null, null], JSON.stringify(f));
  }
  assert.equal(ansprechpartnerAnsicht({ ...PATRICK, photo: { version: "../x" } }).fotoVersion, null, "Version nur als Hash");
});

test("3 — Hilfen: Initialen aus erstem und letztem Wort, E-Mail an der Umbruchstelle vor dem @", () => {
  assert.deepEqual(["Miguel Vance", "Anna Maria Berger", "Cher", "", null].map(initialen), ["MV", "AB", "C", "", ""]);
  assert.deepEqual(emailTeile("m.vance@confidaraexpress.de"), { lokal: "m.vance", domain: "@confidaraexpress.de" });
});

test("4 — Pulsieren: Standard an, nur „aus“ wird gemerkt, gesperrter Speicher bricht nichts", () => {
  const speicher = new Map();
  const s = { getItem: (k) => (speicher.has(k) ? speicher.get(k) : null), setItem: (k, v) => speicher.set(k, v), removeItem: (k) => speicher.delete(k) };
  assert.equal(pulsAngehalten(s), false);
  pulsMerken(s, true);
  assert.deepEqual([pulsAngehalten(s), speicher.get(PULS_SPEICHER_SCHLUESSEL)], [true, "aus"]);
  pulsMerken(s, false);
  assert.deepEqual([pulsAngehalten(s), speicher.has(PULS_SPEICHER_SCHLUESSEL)], [false, false]);
  const kaputt = { getItem() { throw new Error("gesperrt"); }, setItem() { throw new Error("gesperrt"); }, removeItem() { throw new Error("gesperrt"); } };
  assert.equal(pulsAngehalten(kaputt), false);
  assert.doesNotThrow(() => pulsMerken(kaputt, true));
  assert.equal(pulsAngehalten(null), false);
});

test("5 — Wortlaut: keine Aussage über Erreichbarkeit; der Schalter nennt die Handlung", () => {
  const alle = Object.values(ANSPRECH_TEXT).join(" | ");
  assert.doesNotMatch(alle, /online|verfügbar|erreichbar|live|aktiv|anwesend/i);
  assert.equal(ANSPRECH_TEXT.pulsAnhalten, "Pulsieren des Punkts anhalten");
  assert.equal(ANSPRECH_TEXT.pulsFortsetzen, "Pulsieren des Punkts fortsetzen");
});

test("6 — Datenfluss: AuthContext faltet accountManager und gibt das Foto beim Abmelden und bei 401/403 frei", () => {
  const ctx = lies("context/AuthContext.jsx");
  assert.match(ctx, /const accountManager = d\?\.accountManager \?\? u\.accountManager \?\? null;/);
  assert.match(ctx, /return \{ \.\.\.u, accountManager, /);
  assert.equal((ohneKommentare(ctx).match(/clearAccountManagerPhotoCache\(\)/g) || []).length, 2, "Abmelden und zentraler Auth-Fehler");
  const api = lies("api/accountManagerApi.js");
  assert.match(api, /const FOTO_PATH = "\/api\/kunde\/account-manager\/photo";/);
  assert.match(api, /apiFetch\(FOTO_PATH, \{ auth: true \}\)/);
  assert.doesNotMatch(ohneKommentare(api), /localStorage|sessionStorage|caches\./, "das Foto wird nie gespeichert");
  // Die öffentliche Demo zeigt den Kundenservice: keine Person, kein Foto.
  assert.match(lies("demo/demoBackend.mjs"), /pfad === "\/kundenbereich"\) return json\(\{[^\n]*accountManager: null \}\)/);
});

test("7 — Seitenleiste: die Karte ersetzt den festen Kontakt; keine Personen- oder Kontaktdaten im Frontend-Code", () => {
  const sidebar = ohneKommentare(lies("components/layout/DashboardSidebar.jsx"));
  assert.match(sidebar, /<AccountManagerCard \/>/);
  assert.doesNotMatch(sidebar, /COMPANY_PROFILE|contactPerson|pp-ansprech-zeichen/, "der feste Kontakt lebt noch");
  const karte = ohneKommentare(lies("components/layout/AccountManagerCard.jsx"));
  for (const verboten of ["Miguel", "Vance", "Patrick", "Werner", "016092717124", "01754167701", "confidaraexpress.de", "COMPANY_PROFILE", "support@"]) {
    assert.ok(!karte.includes(verboten), `Karte schreibt „${verboten}“ selbst`);
  }
  // Der Kundenservice ohne Zuordnung führt nicht ins Postfach: Support läuft über den Dialog darunter.
  assert.equal((karte.match(/href=\{ansicht\.email\.href\}/g) || []).length, 1);
  assert.doesNotMatch(karte, /mailto:/);
});

test("8 — Karte: Punkt Schmuck, Schalter benennt die Handlung, reduzierte Bewegung ohne Schalter, Foto ohne Alternativtext", () => {
  const karte = ohneKommentare(lies("components/layout/AccountManagerCard.jsx"));
  assert.equal((karte.match(/<span className="pp-ansprech-punkt" aria-hidden="true" \/>/g) || []).length, 2, "Punkt ist Schmuck");
  assert.match(karte, /if \(reduziert\) return <span className="pp-ansprech-punkt" aria-hidden="true" \/>;/);
  assert.match(karte, /<button type="button" className="pp-ansprech-puls" data-puls=\{angehalten \? "aus" : "an"\}\s+aria-label=\{name\} title=\{name\} onClick=\{umschalten\}>/);
  assert.match(karte, /useSyncExternalStore\(abonniereBewegung, bewegungReduziert, \(\) => false\)/);
  assert.match(karte, /const BEWEGUNG_REDUZIERT = "\(prefers-reduced-motion: reduce\)";/);
  assert.match(karte, /<img className="pp-ansprech-foto" src=\{fotoUrl\} alt="" width="48" height="48" decoding="async"/);
  assert.match(karte, /<span className="pp-ansprech-initialen" aria-hidden="true">\{ansicht\.initialen\}<\/span>/);
  // Sichtbarer Text im zugänglichen Namen (WCAG 2.5.3), die Handlung davor nur vorgelesen; Umbruch vor dem @.
  assert.match(karte, /<span className="sr-only">\{ANSPRECH_TEXT\.anrufen\}<\/span>\{ansicht\.telefon\.anzeige\}/);
  assert.match(karte, /<span className="sr-only">\{ANSPRECH_TEXT\.mailen\}<\/span>\{ansicht\.email\.lokal\}<wbr \/>\{ansicht\.email\.domain\}/);
  assert.match(karte, /<address className="pp-ansprech pp-ansprech--person"/);
  assert.match(karte, /<BrandLogo variant="signet" tone="reverse" alt="" \/>/);
});

test("9 — Stile: nur Kundenbereich, Puls nur ohne reduzierte Bewegung und nur im Zustand „an“, Telefon bricht nie", () => {
  const css = readFileSync(path.join(SRC, "styles", "premium-editorial.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const abschnitt = css.slice(css.indexOf(':root[data-ce-bereich="kunde"] .pp-ansprech {'));
  assert.ok(abschnitt.length > 500, "Abschnitt 25 fehlt");
  assert.match(abschnitt, /@media \(prefers-reduced-motion: no-preference\) \{\s*:root\[data-ce-bereich="kunde"\] \.pp-ansprech-puls\[data-puls="an"\] \.pp-ansprech-punkt::after \{\s*animation: ce-ansprech-puls var\(--ce-pr-ed-ansprech-puls-dauer\) var\(--ce-pr-ed-ansprech-puls-kurve\) infinite;/);
  assert.equal((abschnitt.match(/animation\s*:/g) || []).length, 1, "nur der Lichthof bewegt sich");
  assert.match(abschnitt, /@keyframes ce-ansprech-puls \{\s*0% \{ transform: scale\(1\); opacity: 0\.55; \}\s*64% \{ transform: scale\(2\.75\); opacity: 0; \}\s*100% \{ transform: scale\(2\.75\); opacity: 0; \}\s*\}/);
  assert.match(abschnitt, /\.pp-ansprech-tel \{[^}]*white-space: nowrap;/);
  assert.match(abschnitt, /\.pp-ansprech-puls \{[^}]*width: 1\.5rem;[^}]*height: 1\.5rem;/, "Schalter mindestens 24 px");
  assert.match(abschnitt, /@media \(pointer: coarse\) \{\s*:root\[data-ce-bereich="kunde"\] \.pp-ansprech-puls::before \{[^}]*inset: -0\.625rem;/, "Touch 44 px");
  const tokens = readFileSync(path.join(SRC, "styles", "variables.css"), "utf8");
  assert.match(tokens, /--ce-pr-ed-ansprech-punkt: var\(--ce-pr-ed-mark-delivered\);/);
  assert.match(tokens, /--ce-pr-ed-ansprech-puls-dauer: 2800ms;/);
  // Die alten Regeln der festen Karte sind entfernt — keine zweite Fassung in der Bereichsebene.
  assert.doesNotMatch(readFileSync(path.join(SRC, "styles", "premium-redesign.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /\.pp-ansprech/);
});
