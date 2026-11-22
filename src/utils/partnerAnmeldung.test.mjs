// Partner-Anmeldung /partner/login — Premium UX 4.0 (Betreiberentscheidungen A1/A4, 2026-11-22).
// Die Bühne beschreibt nur, was der Partnerbereich zeigt: keine Provisionshöhe, kein Verdienstversprechen, keine Zusage
// einer Freischaltung (Partnerprogramm 12A: Bewerbung, Schalter aus). Die Bedienung bleibt der bisherige Vertrag:
// dieselben Kennungen, Autofill, „Angemeldet bleiben“, „Passwort vergessen“ und der Weg zur Bewerbung.
//
// Run: node --test src/utils/partnerAnmeldung.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PARTNER_ANMELDE_TEXT, PARTNER_BUEHNE_TEXT } from "./partnerAnmeldung.mjs";
import { PARTNER_BEREICHE } from "./salesPartnerView.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(hier, rel), "utf8");
const seite = lies("../pages/PartnerAnmeldungPage.jsx");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const partnerCss = ohneKommentare(lies("../styles/partner.css"));
const nachtCss = ohneKommentare(lies("../styles/partner-nacht.css"));

const buehnenTexte = () => [
  PARTNER_BUEHNE_TEXT.titel,
  PARTNER_BUEHNE_TEXT.text,
  PARTNER_BUEHNE_TEXT.vorteileName,
  ...PARTNER_BUEHNE_TEXT.vorteile.flatMap((v) => [v.titel, v.text]),
];

test("A1 — die Bühne nennt keine Zahl, keinen Betrag und kein Versprechen", () => {
  for (const t of buehnenTexte()) {
    assert.equal(typeof t, "string");
    assert.ok(t.trim().length > 0, "leerer Bühnentext");
    assert.doesNotMatch(t, /\d/, `Zahl in einem Bühnentext: ${t}`);
    assert.doesNotMatch(t, /[%€$]|prozent|euro/i, `Betrag oder Satz in einem Bühnentext: ${t}`);
    assert.doesNotMatch(t, /garant|versprech|sicher(?:n|t)? Ihnen|bis zu|mindestens|lukrativ|passiv/i,
      `Versprechen in einem Bühnentext: ${t}`);
    assert.doesNotMatch(t, /freischalt|sofort|aktiviert|zugelassen/i, `Zusage einer Freischaltung: ${t}`);
    // Partnerprogramm 12A nicht aktiviert, Partnervereinbarung nicht veröffentlicht: kein Vergütungsmodell auf der Bühne.
    assert.doesNotMatch(t, /grundprovision|teamprovision|bonus|ebene|pdf/i, `Vergütungsbestandteil in einem Bühnentext: ${t}`);
  }
});

test("A2 — drei Punkte, benannt wie die Bereiche der Seitenleiste des Portals", () => {
  assert.ok(Object.isFrozen(PARTNER_BUEHNE_TEXT) && Object.isFrozen(PARTNER_BUEHNE_TEXT.vorteile));
  const titel = PARTNER_BUEHNE_TEXT.vorteile.map((v) => v.titel);
  assert.deepEqual(titel, ["Meine Kunden", "Verdienst", "Mein Team"]);
  const bereiche = new Set(PARTNER_BEREICHE.map((b) => b.label));
  for (const t of titel) assert.ok(bereiche.has(t), `„${t}“ ist kein Bereich des Partnerportals`);
  for (const v of PARTNER_BUEHNE_TEXT.vorteile) assert.ok(Object.isFrozen(v));
});

test("A3 — die Bedienung bleibt: Kennungen, Autofill, Angemeldet bleiben, Passwort vergessen, Bewerbung", () => {
  for (const m of [
    'id="spp-login-email"', 'autoComplete="username"', 'inputMode="email"',
    'id="spp-login-password"', 'autoComplete="current-password"',
    'id="spp-login-submit"', "disabled={laeuft}", 'aria-busy={laeuft ? "true" : undefined}',
    'id="spp-vergessen-email"', 'setSchritt("vergessen")', "onSubmit={anmelden}", "onSubmit={vergessenSenden}",
    'to="/partner-registrieren"', "{T.partnerWerdenLink}", 'role="alert"', 'role="status"',
  ]) assert.ok(seite.includes(m), `PartnerAnmeldungPage: ${m} fehlt`);
  // Texte des Formulars unverändert (Bestandsvertrag der E2E-Suiten).
  assert.equal(PARTNER_ANMELDE_TEXT.titel, "Anmelden");
  assert.equal(PARTNER_ANMELDE_TEXT.anmelden, "Anmelden");
  assert.equal(PARTNER_ANMELDE_TEXT.partnerWerdenLink, "Jetzt Vertriebspartner werden");
});

test("A4 — Gliederung: ein h1 (der Satz der Bühne), das Blatt benannt durch sein h2, eine Marke", () => {
  assert.equal([...seite.matchAll(/<h1\b/g)].length, 1, "genau ein h1");
  assert.match(seite, /<h1 className="spp-anmeldung-buehnentitel">\{B\.titel\}<\/h1>/);
  assert.match(seite, /<section className="spp-anmeldung-panel" aria-labelledby=\{`\$\{uid\}-titel`\}>/);
  assert.equal([...seite.matchAll(/<h2 className="spp-anmeldung-titel" id=\{`\$\{uid\}-titel`\}>/g)].length, 2,
    "Anmelden und Passwort zurücksetzen tragen je das h2 des Blatts");
  assert.equal([...seite.matchAll(/<BrandLogo\b/g)].length, 1, "genau eine Marke");
  assert.match(seite, /<ul className="spp-anmeldung-vorteile" aria-label=\{B\.vorteileName\}>/);
});

test("A5 — die Ringe sind Dekor: verborgen, ohne Bewegung, ohne Markenasset, in Kontrast- und Telefonlagen aus", () => {
  assert.match(seite, /<svg className="spp-anmeldung-orbit" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">/);
  const ringe = seite.match(/function PartnerRinge\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(ringe.includes("<svg"), "Ringbauteil nicht gefunden");
  assert.ok(!/<img|<use|href=/.test(ringe), "kein Bild und kein Markenasset im Dekor");
  assert.ok(!/assets\/brand/.test(seite), "die Seite lädt kein Markenasset selbst — nur über BrandLogo");
  // Keine Bewegung: weder Keyframes noch Animation auf den Elementen der Anmeldung.
  const anmeldeRegeln = [...partnerCss.matchAll(/([^{}]*\.spp-(?:anmeldung|orbit)[^{}]*)\{([^}]*)\}/g)];
  assert.ok(anmeldeRegeln.length > 10, "Regeln der Anmeldung nicht gefunden");
  for (const [, sel, block] of anmeldeRegeln) {
    assert.doesNotMatch(block, /animation|transition/, `${sel.trim()}: Bewegung auf der Anmeldung`);
  }
  for (const [, sel, block] of [...nachtCss.matchAll(/([^{}]*\.spp-(?:anmeldung|orbit)[^{}]*)\{([^}]*)\}/g)]) {
    assert.doesNotMatch(block, /animation/, `${sel.trim()}: Animation auf der Anmeldung`);
  }
  // Einspaltig (unter 64em) und bei erzwungenen Farben entfallen die Ringe; das Licht bleibt.
  assert.match(partnerCss, /@media \(max-width: 63\.9375em\)[\s\S]*?\.spp-anmeldung-orbit \{ display: none; \}/);
  assert.match(nachtCss, /@media \(forced-colors: active\)[\s\S]*?\.spp-anmeldung-orbit \{ display: none; \}/);
});

test("A6 — Maß statt Mitwachsen: Bühne begrenzt, eine Großbildstufe, Felder mindestens 48 px", () => {
  assert.match(partnerCss, /\.spp-anmeldung-buehne \{[^}]*max-width: 78rem;/);
  assert.match(partnerCss, /@media \(min-width: 2240px\) \{[^@]*\.spp-anmeldung-buehne \{[^}]*max-width: 94rem;/);
  assert.match(partnerCss, /\.spp-anmeldung-input \{[^}]*min-height: var\(--ce-size-control-lg\);/);
  // Der Bühnentitel ist die eine Displaygröße der Partner-Anmeldung (Betreiberentscheidung A4); er bleibt begrenzt.
  const titel = [...partnerCss.matchAll(/\.spp-anmeldung-buehnentitel \{[^}]*font-size: (clamp\([^;]+\));/g)].map((m) => m[1]);
  assert.ok(titel.length >= 2, "Bühnentitel ohne Größenregel");
  for (const c of titel) {
    const obergrenze = Number(c.match(/,\s*([\d.]+)rem\)$/)?.[1]);
    assert.ok(obergrenze > 0 && obergrenze <= 4.5, `Bühnentitel über 4.5rem: ${c}`);
  }
});
