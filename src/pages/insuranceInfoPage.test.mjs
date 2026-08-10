// Informationen zur Transportversicherung — Inhalt, Herkunft, White Label.
//
// Die Seite macht Aussagen über ein Versicherungsprodukt. Diese Tests sichern
// vor allem ab, was NICHT passieren darf: eine erfundene Deckungszusage, eine
// abschließend wirkende Aufzählung, eine Frist ohne Quelle, die Nennung des
// internen Upstream-Anbieters oder eine Rollenbehauptung über ConfidaraExpress.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  INSURANCE_INFO_PAGE,
  INSURANCE_INFO_ROUTE,
  INSURANCE_INFO_SECTIONS,
  QUELLE_LABEL,
  insuranceInfoToc,
} from "../utils/insuranceInfo.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const info    = read("../utils/insuranceInfo.mjs");
const seite   = read("./InsuranceInfoPage.jsx");
const app     = read("../App.jsx");
const css     = read("../styles/insurance-info.css");
const dialog  = read("../components/booking/InsuranceDetailsDialog.jsx");
const indexCss = read("../styles/index.css");

const infoText  = ohneKommentare(info);
const seiteText = ohneKommentare(seite);
// Der gesamte ausgelieferte Text der Seite an einem Ort.
const ALLER_TEXT = [
  INSURANCE_INFO_PAGE.eyebrow, INSURANCE_INFO_PAGE.title,
  INSURANCE_INFO_PAGE.lead, INSURANCE_INFO_PAGE.disclaimer,
  ...INSURANCE_INFO_SECTIONS.flatMap(s => [s.title, s.lead || "", s.note || "", ...(s.items || [])]),
].join("\n");

/* ── 1./2. Route und Titel ───────────────────────────────────────────────── */

test("1 — die Route ist registriert und lazy eingebunden", () => {
  assert.equal(INSURANCE_INFO_ROUTE, "/versicherungsinformationen");
  assert.match(app, /const InsuranceInfoPage = React\.lazy\(\(\) => import\("\.\/pages\/InsuranceInfoPage"\)\)/,
    "die Seite ist nicht lazy eingebunden");
  assert.match(app, /<Route path="\/versicherungsinformationen" element=\{<InsuranceInfoPage \/>\} \/>/,
    "die Route fehlt");
  // Sie liegt bei den übrigen Leseseiten (öffentliches NavbarLayout), nicht im
  // Adminbereich und nicht als Sidebar-Hauptpunkt.
  assert.ok(app.indexOf('path="/versicherungsinformationen"') > app.indexOf('path="/widerruf"'),
    "die Route steht nicht bei den Leseseiten");
  assert.ok(!read("../components/layout/DashboardSidebar.jsx").includes("versicherungsinformationen"),
    "die Seite ist unnötig als Sidebar-Hauptpunkt eingetragen");
  // Das Stylesheet ist eingebunden.
  assert.match(indexCss, /@import '\.\/insurance-info\.css';/);
});

test("2 — Seitentitel und Einstieg sind korrekt", () => {
  assert.equal(INSURANCE_INFO_PAGE.title, "Informationen zur Transportversicherung");
  assert.equal(INSURANCE_INFO_PAGE.eyebrow, "Transportversicherung");
  // Kein Rechtstexttitel, solange keine freigegebene eigene Vollfassung existiert.
  assert.ok(!/Rechtsverbindlich|Versicherungsbedingungen$/.test(INSURANCE_INFO_PAGE.title),
    "der Titel behauptet einen Rechtstext");
  assert.match(INSURANCE_INFO_PAGE.lead, /Transportversicherung/);
});

/* ── 3. Alle geforderten Kapitel ─────────────────────────────────────────── */

test("3 — alle 15 Inhaltsbereiche sind vorhanden und eindeutig", () => {
  const ERWARTET = [
    "ueberblick", "umfang", "versicherbare-gueter", "besondere-voraussetzungen",
    "nicht-versicherbare-gueter", "ausgeschlossene-risiken", "hoechstgrenzen",
    "selbstbeteiligung", "standardversicherung", "premiumversicherung",
    "verpackung", "schadenfall", "meldefristen", "verschollenheit", "wichtige-hinweise",
  ];
  assert.deepEqual(INSURANCE_INFO_SECTIONS.map(s => s.id), ERWARTET);
  assert.equal(new Set(ERWARTET).size, 15, "die Abschnitts-IDs sind nicht eindeutig");
  // Jeder Abschnitt trägt Titel, Einleitung und eine Quelle.
  for (const s of INSURANCE_INFO_SECTIONS) {
    assert.ok(s.title && s.title.length > 3, `${s.id}: kein Titel`);
    assert.ok(s.lead && s.lead.length > 30, `${s.id}: keine Einleitung`);
    assert.ok(Object.keys(QUELLE_LABEL).includes(s.quelle), `${s.id}: keine gültige Quelle`);
  }
  // Das Inhaltsverzeichnis wird abgeleitet, nicht zweitgepflegt.
  assert.deepEqual(insuranceInfoToc().map(t => t.id), ERWARTET);
  assert.match(seite, /insuranceInfoToc\(\)/, "das Inhaltsverzeichnis ist doppelt gepflegt");
});

/* ── 4./5. White Label und Rollenaussagen ────────────────────────────────── */

test("4 — der interne Upstream-Anbieter erscheint nirgends", () => {
  for (const [name, quelle] of [["insuranceInfo.mjs", info], ["InsuranceInfoPage.jsx", seite], ["insurance-info.css", css]]) {
    for (const begriff of ["JUMiNGO", "JUMINGO", "Jumingo", "jumingo", "jumingo.com", "KRAVAG", "Kravag"]) {
      assert.ok(!quelle.includes(begriff), `${name} nennt „${begriff}"`);
    }
  }
  // Und kein externer Link überhaupt auf der Seite — sie ist rein intern.
  assert.ok(!/https?:\/\//.test(seiteText), "die Seite enthält einen externen Link");
  assert.ok(!/https?:\/\//.test(infoText), "das Inhaltsmodul enthält einen externen Link");
  assert.ok(!/target="_blank"/.test(seite), "die Seite öffnet ein neues Fenster");
});

test("5 — keine unbelegte Rolle von ConfidaraExpress", () => {
  const verboten = [
    "Versicherungsvermittler", "Versicherungsmakler", "Versicherungsvermittlung",
    "vermittelt die Versicherung", "ist Versicherer", "ConfidaraExpress-Versicherung",
    "Versicherung von ConfidaraExpress", "ConfidaraExpress versichert",
    "Versicherungsschutz durch ConfidaraExpress", "schließt die Versicherung für Sie ab",
    "Versicherungsnehmer",
  ];
  for (const satz of verboten) {
    assert.ok(!ALLER_TEXT.includes(satz), `unbelegte Rollenaussage: „${satz}"`);
  }
  // Auch keine Versicherungsgesellschaft.
  for (const g of ["Versicherung AG", "Allianz", "AXA", "Zurich", "R+V"]) {
    assert.ok(!ALLER_TEXT.includes(g), `pauschal benannter Versicherer: „${g}"`);
  }
});

/* ── 6.–9. Produktaussagen ───────────────────────────────────────────────── */

test("6 — keine absolute Deckungszusage", () => {
  assert.ok(!/100\s*%/.test(ALLER_TEXT), "eine 100-%-Aussage ist zurück");
  for (const verboten of ["vollständig versichert", "alles versichert",
                          "höhere Deckung", "umfassender Schutz", "besserer Versicherungsschutz"]) {
    assert.ok(!ALLER_TEXT.includes(verboten), `Absolutaussage: „${verboten}"`);
  }
  // „Rundumschutz" darf NUR verneint vorkommen — die Seite sagt ausdrücklich,
  // dass die Versicherung keiner ist.
  for (const m of ALLER_TEXT.matchAll(/(.{0,20})Rundumschutz/g)) {
    assert.match(m[1], /kein/i, `„Rundumschutz" ohne Verneinung: „${m[0]}"`);
  }
  // Die Seite sagt ausdrücklich, dass es keine pauschale Zusage gibt.
  const versicherbar = INSURANCE_INFO_SECTIONS.find(s => s.id === "versicherbare-gueter");
  assert.match(versicherbar.lead, /keine pauschale Zusage|Eine pauschale Zusage/i);
});

test("7 — die Standard-Selbstbeteiligung steht korrekt und einheitlich", () => {
  const sb = INSURANCE_INFO_SECTIONS.find(s => s.id === "selbstbeteiligung");
  assert.ok(sb.items.some(t => /Standardversicherung: 50,00 €/.test(t)), "50,00 € fehlt");
  const std = INSURANCE_INFO_SECTIONS.find(s => s.id === "standardversicherung");
  assert.ok(std.items.some(t => /50,00 € Selbstbeteiligung je Schadenfall/.test(t)));
  // Kein abweichender Betrag irgendwo auf der Seite.
  const betraege = [...ALLER_TEXT.matchAll(/(\d[\d.]*,\d{2})\s*€\s*Selbstbeteiligung/g)].map(m => m[1]);
  assert.deepEqual([...new Set(betraege)], ["50,00"], "es gibt zwei verschiedene Selbstbeteiligungen");
});

test("8 — Premium nennt keine Selbstbeteiligung für den Kunden", () => {
  const sb = INSURANCE_INFO_SECTIONS.find(s => s.id === "selbstbeteiligung");
  assert.ok(sb.items.some(t => /Premiumversicherung: keine Selbstbeteiligung für Sie/i.test(t)));
  const prem = INSURANCE_INFO_SECTIONS.find(s => s.id === "premiumversicherung");
  assert.ok(prem.items.some(t => /Keine Selbstbeteiligung für Sie/i.test(t)));
  // Keine Information darüber, wer sie wirtschaftlich trägt.
  assert.ok(!/übernimmt|übernommen|trägt die Selbstbeteiligung/.test(ALLER_TEXT),
    "die Seite verrät, wer die Selbstbeteiligung wirtschaftlich trägt");
});

test("9 — Premium ist Serviceerweiterung, nicht mehr Deckung", () => {
  const prem = INSURANCE_INFO_SECTIONS.find(s => s.id === "premiumversicherung");
  assert.match(prem.lead, /Serviceerweiterung/);
  assert.match(prem.lead, /kein anderer und kein weitergehender Versicherungsschutz|dieselben zugrunde liegenden/);
  assert.ok(prem.items.some(t => /[Gg]leiche zugrunde liegende Versicherungsbedingungen/.test(t)));
  assert.match(prem.note, /erweitert die Betreuung, nicht den Versicherungsumfang/);
});

/* ── 10.–12. Ausschluss, Freigabe, Verpackung ────────────────────────────── */

test("10 — Ausschlüsse sind benannt und ausdrücklich nicht abschließend", () => {
  const aus = INSURANCE_INFO_SECTIONS.find(s => s.id === "ausgeschlossene-risiken");
  const nicht = INSURANCE_INFO_SECTIONS.find(s => s.id === "nicht-versicherbare-gueter");
  for (const stichwort of ["Verzögerung", "Verpackung", "Krieg", "Beschlagnahme"]) {
    assert.ok(aus.items.some(t => t.includes(stichwort)), `Risiko „${stichwort}" fehlt`);
  }
  for (const stichwort of ["Bargeld", "Edelmetalle", "Wertpapiere", "Gefahrgut"]) {
    assert.ok(nicht.items.some(t => t.includes(stichwort)), `Gut „${stichwort}" fehlt`);
  }
  // Beide Listen sagen ausdrücklich, dass sie nicht abschließend sind.
  assert.match(nicht.lead, /nicht abschließend|insbesondere/);
  assert.match(aus.note, /nicht abschließend/);
});

test("11 — freigabepflichtige Güter haben einen eigenen, deutlichen Abschnitt", () => {
  const frei = INSURANCE_INFO_SECTIONS.find(s => s.id === "besondere-voraussetzungen");
  assert.match(frei.lead, /besondere Voraussetzungen/);
  for (const stichwort of ["Antiquitäten", "Edelmetalle", "Pflanzen", "Umzugsgut", "lebende Tiere", "Unverpackte"]) {
    assert.ok(frei.items.some(t => t.includes(stichwort)), `Kategorie „${stichwort}" fehlt`);
  }
  assert.match(frei.note, /gesonderte Freigabe erforderlich/);
  // Die Freigabeaussage steht auch im Dialog (mittlere Ebene).
  assert.match(read("../utils/insuranceTerms.mjs"), /vorherige Freigabe benötigen/);
});

test("12 — die Verpackungspflicht ist eigener Abschnitt und sachlich formuliert", () => {
  const v = INSURANCE_INFO_SECTIONS.find(s => s.id === "verpackung");
  assert.match(v.lead, /beanspruchungsgerechte Verpackung/);
  assert.match(v.lead, /beeinträchtigt|entfallen/);
  // Keine Angstcopy.
  for (const wort of ["Achtung!", "Vorsicht!", "verlieren Sie", "kein Geld zurück"]) {
    assert.ok(!ALLER_TEXT.includes(wort), `Angstcopy: „${wort}"`);
  }
});

/* ── 13./14. Schadenfall und Fristen ─────────────────────────────────────── */

test("13 — der Schadenfall ist erklärt und führt in den bestehenden Supportweg", () => {
  const s = INSURANCE_INFO_SECTIONS.find(s => s.id === "schadenfall");
  assert.equal(s.title, "Was tun im Schadenfall?");
  for (const stichwort of ["sofort", "aufbewahren", "Fotos", "Support"]) {
    assert.ok(s.items.some(t => t.toLowerCase().includes(stichwort.toLowerCase())),
      `Schritt „${stichwort}" fehlt`);
  }
  // Der Supportweg ist der BESTEHENDE — kein neuer Schadenworkflow, keine neue API.
  assert.match(seite, /to="\/dashboard\?page=support"/, "der bestehende Supportweg fehlt");
  // Kein eigener Schadenworkflow und keine neue Schaden-API. (Wortgrenzen —
  // „disclaimer" enthält „claim" und ist kein Schadenprozess.)
  assert.ok(!/\bfetch\(|apiFetch\(|\/api\//.test(seiteText), "die Seite spricht eine API an");
  assert.ok(!/\bclaims?\b|Schadenmeldung|Schadensformular/i.test(seiteText),
    "es wurde ein eigener Schadenprozess gebaut");
});

test("14 — Fristen stammen aus einer benennbaren Quelle", () => {
  const f = INSURANCE_INFO_SECTIONS.find(s => s.id === "meldefristen");
  assert.equal(f.quelle, "agb", "die Fristen müssen als AGB-belegt ausgewiesen sein");
  assert.match(f.lead, /in unseren AGB genannten Fristen/);
  // Genau die drei Fristen, die die AGB führen — keine erfundene vierte.
  const agb = read("./AGBPage.jsx");
  for (const frist of ["24 Stunden", "7 Werktagen", "21 Tage"]) {
    assert.ok(f.items.some(t => t.includes(frist)), `Frist „${frist}" fehlt`);
    assert.ok(agb.includes(frist), `Frist „${frist}" ist in den AGB nicht belegt`);
  }
  // Und der Hinweis, dass für den Versicherungsfall zusätzlich eigene Fristen gelten.
  assert.match(f.note, /geltenden Fristen der\s+Versicherungsbedingungen|Versicherungsbedingungen maßgeblich/);
});

test("14b — Verschollenheit nennt keine erfundene Frist", () => {
  const v = INSURANCE_INFO_SECTIONS.find(s => s.id === "verschollenheit");
  assert.match(v.lead, /ergibt sich aus|hängt von der jeweils geltenden/);
  // Keine Tageszahl in diesem Abschnitt.
  const text = [v.lead, ...v.items].join(" ");
  assert.ok(!/\b\d+\s*(Tag|Tagen|Wochen|Monate)/.test(text),
    "es wird eine Verschollenheitsfrist behauptet");
});

/* ── 15. Verlinkung aus dem Dialog ───────────────────────────────────────── */

test("15 — der Dialog führt intern auf diese Seite", () => {
  assert.match(dialog, /import \{ INSURANCE_INFO_ROUTE \} from "\.\.\/\.\.\/utils\/insuranceInfo\.mjs"/);
  assert.match(dialog, /<Link className="insdlg-more-link" to=\{INSURANCE_INFO_ROUTE\}/);
  // Kein externer Absprung, kein neues Fenster aus dem Dialog.
  assert.ok(!/target="_blank"/.test(dialog), "der Dialog öffnet ein neues Fenster");
  assert.ok(!/https?:\/\//.test(ohneKommentare(dialog)), "der Dialog enthält einen externen Link");
});

/* ── Disclaimer und Herkunft ─────────────────────────────────────────────── */

test("16 — der Hinweis steht am Anfang UND am Ende und schränkt richtig ein", () => {
  assert.match(INSURANCE_INFO_PAGE.disclaimer, /verständlichen Zusammenfassung/);
  assert.match(INSURANCE_INFO_PAGE.disclaimer, /Maßgeblich sind die im jeweiligen Versicherungsfall geltenden Versicherungsbedingungen/);
  assert.ok(!/ersetzt die Versicherungsbedingungen/.test(INSURANCE_INFO_PAGE.disclaimer),
    "der Hinweis behauptet eine Ersetzung");
  assert.equal((seite.match(/INSURANCE_INFO_PAGE\.disclaimer/g) || []).length, 2,
    "der Hinweis steht nicht zweimal (Anfang und Ende)");
});

test("17 — jede Aussage weist ihre Herkunft aus", () => {
  assert.deepEqual(Object.keys(QUELLE_LABEL).sort(), ["agb", "bedingungen", "produkt"]);
  // AGB-gestützte Abschnitte verlinken die AGB.
  assert.match(seite, /s\.quelle === "agb" && <> — <Link className="insinfo-quelle-link" to="\/agb">/);
  const agbAbschnitte = INSURANCE_INFO_SECTIONS.filter(s => s.quelle === "agb").map(s => s.id);
  assert.ok(agbAbschnitte.includes("meldefristen") && agbAbschnitte.includes("schadenfall"),
    "Fristen und Schadenfall müssen als AGB-belegt gekennzeichnet sein");
  // „bedingungen" heißt: vorsichtig formuliert, nie als Zusage.
  for (const s of INSURANCE_INFO_SECTIONS.filter(s => s.quelle === "bedingungen")) {
    const text = [s.lead, ...(s.items || []), s.note || ""].join(" ");
    assert.ok(/kann|können|richtet sich|ergibt sich|vorgesehen/.test(text),
      `${s.id}: bedingungsabhängige Aussage ohne Vorbehalt`);
  }
});

/* ── Barrierefreiheit und Struktur (Quelle) ──────────────────────────────── */

test("18 — die Seite ist semantisch aufgebaut", () => {
  assert.match(seite, /<h1 className="insinfo-title">/, "kein h1");
  assert.equal((seite.match(/<h1/g) || []).length, 1, "mehr als ein h1");
  assert.match(seite, /<h2 className="insinfo-sec-title"/, "die Abschnitte tragen kein h2");
  assert.match(seite, /<nav className="insinfo-toc" aria-labelledby="insinfo-toc-title">/);
  assert.match(seite, /<main className="insinfo-main">/);
  assert.match(seite, /<section key=\{s\.id\} id=\{s\.id\} className="insinfo-sec" aria-labelledby=/);
  // Echte Listen statt Absätze mit Strichen.
  assert.match(seite, /<ul className="insinfo-list">/);
  assert.match(seite, /<ol className="insinfo-toc-list">/);
  // Dekoratives ist vor Screenreadern verborgen.
  assert.match(seite, /<span className="insinfo-sec-num" aria-hidden="true">/);
  assert.match(seite, /<span className="insinfo-item-ico" aria-hidden="true">/);
});

test("19 — Sprungziele, Fokus und Trefferflächen sind gesetzt", () => {
  // Anker zeigen auf die IDs der Abschnitte.
  assert.match(seite, /href=\{`#\$\{id\}`\}/);
  assert.match(css, /\.insinfo-sec\s*\{[^}]*scroll-margin-top/, "Ankersprung landet unter der Navbar");
  assert.match(css, /\.insinfo-toc-link:focus-visible\s*\{[^}]*outline: var\(--ce-focus-ring\)/);
  assert.match(css, /\.insinfo-quelle-link:focus-visible/);
  // Unter 600 px erreicht jeder Sprunglink 44 px.
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.insinfo-toc-link \{[^}]*min-height: 44px/);
});

test("20 — das Layout gibt nach, statt Text zu zerlegen", () => {
  assert.match(css, /grid-template-columns: 240px minmax\(0, 1fr\)/, "kein bodenloses Textraster");
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
    "die Sprungnavigation wandert nicht über den Inhalt");
  // Kein zeichenweises Zerlegen von Fließtext.
  for (const regel of ["break-all", "overflow-wrap: anywhere", "hyphens: auto"]) {
    assert.ok(!css.includes(regel), `verbotene Bruchregel: ${regel}`);
  }
  assert.ok(!css.includes("!important"), "!important im neuen Stylesheet");
});
