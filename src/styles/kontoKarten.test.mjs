// Kontoeinstellungen als Abschnittskarten — Premium UX 4.0 (Betreiberentscheidung A5, 2026-11-22).
//
// Reine Quelltextprüfung (kein DOM); die Laufzeit decken die E2E-Suiten pwaInstallCta, salesPartnerPortal,
// salesPartnerCreditNotes, billingMode, profilMenue und dashboardAccountPaketD ab.
//
//   K1  Ein Abschnitt ist EINE Karte: Titel, Erklärung und Aktion stehen im Kartenkopf (in dieser Reihenfolge), der
//       Inhalt darunter; der Titel bleibt direktes Kind des Kopfs (E2E-Vertrag salesPartnerPortal)
//   K2  „Bearbeiten“ ist im Kunden- und Partnerbereich ein umrandeter Knopf, keine Textaktion
//   K3  Grundregeln: keine 240-px-Titelspalte, keine Karte in der Karte, begrenzte Spalte, Aktion am Telefon darunter
//   K4  Die Spaltenbreite ist EIN Token
//   K5  Kunde: Kartenmaterial wie der Kontokopf, keine 15rem-Zweispaltenregel, Kontokopf ab 84rem als klebende Spalte
//   K6  Profil: ein Rahmen um Kontokopf, Speicherhinweis und Abschnitte — in dieser DOM-Reihenfolge
//   K7  Partner: §13 steht innerhalb von @media screen, Kopflinie in der Partnerlinie, Gerätekarten mit demselben Kopf
//   K8  Kein Zusatzrand zwischen Gerätekarten mehr (den Abstand trägt die Abschnittsliste)
//   K9  Nur Darstellung: keine Änderung an Feldern, Speichern, Prüfungen oder Endpunkten der Abschnitte
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const ohneJsKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// Inhalt des ERSTEN Blocks, dessen Selektor exakt `sel` lautet (ohne Kommentare).
function block(css, sel) {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, `Block „${sel}“ fehlt`);
  return css.slice(i, css.indexOf("}", i));
}

const kopf = read("components/dashboard/ProfileCardHead.jsx");
const profil = read("components/dashboard/Profile.jsx");
const partnerAbrechnung = read("components/partner/PartnerBillingDetailsSection.jsx");
const basis = ohneKommentare(read("styles/dashboard-premium.css"));
const kunde = ohneKommentare(read("styles/premium-editorial.css"));
const variablen = ohneKommentare(read("styles/variables.css"));
const partnerRoh = read("styles/partner-nacht.css");
const geraete = ohneKommentare(read("styles/geraete.css"));

test("K1 — Titel, Erklärung und Aktion stehen im Kartenkopf, der Inhalt darunter", () => {
  const jsx = ohneJsKommentare(kopf);
  assert.match(jsx, new RegExp(
    '<div className="table-card-header profile-card-head">\\s*'
    + '<h2 className="table-card-title"[^>]*>\\{title\\}</h2>\\s*'
    + '\\{subtitle && <p className="profile-card-sub">\\{subtitle\\}</p>\\}\\s*'
    + '\\{action && <div className="profile-card-toolbar">\\{action\\}</div>\\}\\s*'
    + "</div>"));
  assert.match(jsx, /<div className="profile-card-body">\s*\{children\}\s*<\/div>/, "der Inhalt trägt wieder eine Aktion");
  assert.equal((jsx.match(/profile-card-toolbar/g) || []).length, 1, "die Aktion steht an zwei Stellen");
});

test("K2 — „Bearbeiten“ ist im Kunden- und im Partnerbereich ein umrandeter Knopf", () => {
  assert.match(profil, /className="btn btn-outline btn-sm profile-card-edit-action"/);
  assert.match(partnerAbrechnung, /className="btn btn-outline btn-sm profile-card-edit-action"/);
  for (const [name, src] of [["Profile.jsx", profil], ["PartnerBillingDetailsSection.jsx", partnerAbrechnung]]) {
    assert.ok(!/btn-ghost btn-sm profile-card-edit-action/.test(src), `${name}: wieder eine Textaktion`);
  }
  // Keine eigene Knopffassung mehr: Farbe, Rahmen und Höhe kommen aus dem Buttonprimitive des Bereichs.
  const regel = block(basis, ".btn.profile-card-edit-action");
  assert.ok(!/color:|background|border|padding|font-size/.test(regel), "die Bearbeiten-Aktion führt wieder eine eigene Fassung");
});

test("K3 — Grundregeln: keine Titelspalte, keine Karte in der Karte, begrenzte Spalte", () => {
  assert.ok(!/minmax\(0,\s*240px\)/.test(basis), "die frühere 240-px-Titelspalte ist zurück");
  assert.match(block(basis, ".profile-sections"), /max-width:\s*var\(--ce-konto-spalte\)/);
  assert.match(block(basis, ".profile-sections"), /gap:\s*var\(--ce-space-5\)/);
  const inhalt = block(basis, ".profile-card-body");
  assert.ok(!/background|border|box-shadow/.test(inhalt), "der Inhalt ist wieder eine zweite Karte in der Karte");
  const kartenkopf = block(basis, ".profile-sections .profile-card-head");
  assert.match(kartenkopf, /display:\s*grid/);
  assert.match(kartenkopf, /gap:\s*0 var\(--ce-space-4\)/, "der Zeilenabstand des Basiskopfs reißt Titel und Erklärung auseinander");
  assert.match(kartenkopf, /border-bottom:\s*1px solid/);
  assert.match(basis, /\.profile-sections \.profile-card-head > \.profile-card-toolbar \{ grid-column: 2; grid-row: 1 \/ span 2; \}/);
  // Am Telefon steht die Aktion unter der Erklärung (langer Titel „Unternehmensdaten“).
  const telefon = basis.slice(basis.lastIndexOf("@media (max-width: 600px)"));
  assert.match(telefon, /\.profile-sections \.profile-card-head > \.profile-card-toolbar \{\s*grid-column: 1;\s*grid-row: auto;/);
  // Die alten Ränder des Zeilenlayouts (Karte ohne Material) sind weg.
  assert.ok(!/\.profile-sections > \.profile-card \{ padding: var\(--ce-space-6\) 0; \}/.test(basis));
  assert.ok(!/\.profile-sections > \.profile-card \{ grid-template-columns/.test(basis));
  // Formulare in einer ruhigen Spalte.
  assert.match(basis, /\.profile-sections \.profile-inline-form \{ max-width: 46rem; \}/);
});

test("K4 — die Spaltenbreite ist ein Token", () => {
  assert.match(variablen, /:root \{ --ce-konto-spalte: 75rem; \}/);
  assert.equal((variablen.match(/--ce-konto-spalte:/g) || []).length, 1, "zweite Fassung der Spaltenbreite");
});

test("K5 — Kunde: Kartenmaterial, keine Zweispaltenregel, Kontokopf ab 84rem daneben", () => {
  assert.ok(!/minmax\(0,\s*15rem\)/.test(kunde), "die 15rem-Titelspalte ist zurück");
  const karte = block(kunde, ':root[data-ce-bereich="kunde"] .profile-sections > .profile-card');
  for (const p of [/background:\s*var\(--ce-color-surface\)/, /border:\s*1px solid var\(--ce-pr-hairline\)/,
    /border-radius:\s*var\(--ce-pr-radius-panel\)/, /box-shadow:\s*var\(--ce-pr-shadow-card\)/]) {
    assert.match(karte, p);
  }
  const breit = kunde.slice(kunde.indexOf("@container ce-seite (width >= 84rem)"));
  assert.ok(breit.length > 40, "die breite Stufe fehlt");
  // Kontokopf als Spalte (schmal und Seitenspalte): gestreckt statt nach Inhalt bemessen. Mit flex-start ragten lange
  // Firmennamen und E-Mails bei großer Browserschrift über den Kopf hinaus (responsiveLayoutIntegrity L4).
  const schmal = kunde.slice(kunde.indexOf("@container ce-seite (width < 36rem)"), kunde.indexOf("@container ce-seite (width >= 84rem)"));
  assert.match(schmal, /\.profile-account-identity \{ flex-direction: column; align-items: stretch;/);
  assert.match(block(breit, '  :root[data-ce-bereich="kunde"] .profile-layout > .profile-account-header > .profile-account-identity'),
    /align-items:\s*stretch/);
  assert.ok(!/profile-account-identity[^}]*align-items:\s*flex-start/.test(kunde), "eine Kontokopf-Identität steht wieder auf flex-start");
  assert.match(breit, /grid-template-columns:\s*minmax\(0, var\(--ce-konto-spalte\)\) minmax\(24rem, 1fr\)/);
  const seitenspalte = block(breit, '  :root[data-ce-bereich="kunde"] .profile-layout > .profile-account-header');
  assert.match(seitenspalte, /position:\s*sticky/);
  assert.match(seitenspalte, /grid-column:\s*2/);
  // Der Kontokopf führt sein Material weiterhin nicht selbst (Test 9 in dashboardAccountCommunication).
  assert.ok(!/background|border:|box-shadow/.test(seitenspalte));
});

test("K6 — Profil: ein Rahmen um Kontokopf, Speicherhinweis und Abschnitte, in dieser Reihenfolge", () => {
  const jsx = ohneJsKommentare(profil);
  const rahmen = jsx.indexOf('<div className="profile-layout">');
  const kontokopf = jsx.indexOf('<div className="ce-card profile-account-header">');
  const hinweis = jsx.indexOf("Profil erfolgreich gespeichert.");
  const abschnitte = jsx.indexOf('<div className="profile-sections">');
  assert.ok(rahmen > 0 && rahmen < kontokopf && kontokopf < hinweis && hinweis < abschnitte,
    "Rahmen, Kontokopf, Speicherhinweis und Abschnitte stehen nicht in dieser Reihenfolge");
  assert.match(jsx, /<AppInstallCard \/>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);\s*\}\s*$/, "der Rahmen schließt nicht nach den Abschnitten");
});

test("K7 — Partner: §13 innerhalb von @media screen, Kopflinien in der Partnerlinie", () => {
  const css = ohneKommentare(partnerRoh);
  assert.match(css, /^\s*@media screen \{/, "partner-nacht.css beginnt nicht mehr mit @media screen");
  const stelle = partnerRoh.indexOf("13 · KONTO");
  assert.ok(stelle > 0, "§13 fehlt");
  const tiefe = (s) => [...ohneKommentare(s)].reduce((d, c) => d + (c === "{" ? 1 : c === "}" ? -1 : 0), 0);
  assert.equal(tiefe(partnerRoh.slice(0, stelle)), 1, "§13 steht nicht innerhalb von @media screen");
  assert.equal(tiefe(partnerRoh), 0, "die Klammern von partner-nacht.css gehen nicht auf");
  assert.match(css, /#spp-account \.profile-card-head \{ border-bottom-color: var\(--pn-linie\); \}/);
  assert.match(css, /#spp-account > \.ce-geraete > \.ce-geraete-kopf \{[^}]*border-bottom: 1px solid var\(--pn-linie\)/);
  assert.match(css, /\.page-body:has\(#spp-account\) > :is\(\.ce-page-header, \.spp-notice\) \{ max-width: var\(--ce-konto-spalte\); \}/);
  // Die gemeinsame Gerätekarte bleibt im Adminbereich unberührt: alle neuen Regeln hängen an #spp-account.
  const p13 = ohneKommentare(partnerRoh.slice(stelle));
  for (const z of p13.split("\n").filter((l) => l.includes(".ce-geraete"))) {
    assert.match(z, /#spp-account/, `Gerätekarten-Regel ohne Partnerbezug: ${z.trim()}`);
  }
});

test("K8 — zwischen den Gerätekarten kein Zusatzrand mehr", () => {
  assert.ok(!/\.profile-sections > \.ce-geraete \+ \.ce-geraete/.test(geraete));
});

test("K9 — nur Darstellung: Felder, Speichern und Endpunkte der Abschnitte bleiben", () => {
  // Profil: dieselben Speicherwege und Prüfungen.
  for (const p of [/const saveCard = async \(which\)/, /companySaveConfirmed\(patch, d\.user\)/, /isEditActionDisabled\(editCard, card\)/,
    /onClick=\{\(\) => saveCard\(which\)\}/]) {
    assert.match(profil, p);
  }
  // Partner: dasselbe Formular, dieselbe Absendung, IBAN weiterhin nur maskiert angezeigt.
  for (const p of [/<form className="profile-form-body profile-inline-form spp-billing-form" id="spp-billing-form" noValidate onSubmit=\{speichern\}>/,
    /id="spp-billing-edit" onClick=\{oeffnen\} aria-label="Abrechnungsdaten bearbeiten"/,
    /<PartnerRows items=\{partnerBillingRows\(details\)\} idPrefix="spp-billing-row" \/>/]) {
    assert.match(partnerAbrechnung, p);
  }
});
