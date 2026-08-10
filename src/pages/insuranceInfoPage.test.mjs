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

test("3 — der Kapitelbestand ist vollständig und eindeutig", () => {
  // 14 statt ursprünglich 15: die drei Güterkapitel sind zu zwei zusammengelegt
  // (Versicherung vs. Versandverbot der AGB — zwei verschiedene Quellen), und
  // „Meldefristen“ heißt jetzt „Schadenmeldung: Fristen“ ohne Zahlen.
  const ERWARTET = [
    "ueberblick", "umfang", "gueter-voraussetzungen", "versandausschluesse",
    "ausgeschlossene-risiken", "hoechstgrenzen", "selbstbeteiligung",
    "standardversicherung", "premiumversicherung", "verpackung", "schadenfall",
    "meldefrist", "verschollenheit", "wichtige-hinweise",
  ];
  assert.deepEqual(INSURANCE_INFO_SECTIONS.map(s => s.id), ERWARTET);
  assert.equal(new Set(ERWARTET).size, 14, "die Abschnitts-IDs sind nicht eindeutig");
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
      assert.ok(!quelle.includes(begriff), `${name} nennt „${begriff}“`);
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
    assert.ok(!ALLER_TEXT.includes(satz), `unbelegte Rollenaussage: „${satz}“`);
  }
  // Auch keine Versicherungsgesellschaft.
  for (const g of ["Versicherung AG", "Allianz", "AXA", "Zurich", "R+V"]) {
    assert.ok(!ALLER_TEXT.includes(g), `pauschal benannter Versicherer: „${g}“`);
  }
});

/* ── 6.–9. Produktaussagen ───────────────────────────────────────────────── */

test("6 — keine absolute Deckungszusage", () => {
  assert.ok(!/100\s*%/.test(ALLER_TEXT), "eine 100-%-Aussage ist zurück");
  for (const verboten of ["vollständig versichert", "alles versichert",
                          "höhere Deckung", "umfassender Schutz", "besserer Versicherungsschutz"]) {
    assert.ok(!ALLER_TEXT.includes(verboten), `Absolutaussage: „${verboten}“`);
  }
  // „Rundumschutz“ darf NUR verneint vorkommen — die Seite sagt ausdrücklich,
  // dass die Versicherung keiner ist.
  for (const m of ALLER_TEXT.matchAll(/(.{0,20})Rundumschutz/g)) {
    assert.match(m[1], /kein/i, `„Rundumschutz“ ohne Verneinung: „${m[0]}“`);
  }
  // Die Seite sagt ausdrücklich, dass es keine pauschale Zusage gibt.
  const gueter = INSURANCE_INFO_SECTIONS.find(s => s.id === "gueter-voraussetzungen");
  assert.ok(gueter.items.some(t => /pauschale Zusage/.test(t)),
    "die Seite sagt nicht ausdrücklich, dass es keine pauschale Zusage gibt");
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

test("10 — Versicherungsausschluss und Versandverbot bleiben getrennt", () => {
  const vers = INSURANCE_INFO_SECTIONS.find(x => x.id === "gueter-voraussetzungen");
  const agb  = INSURANCE_INFO_SECTIONS.find(x => x.id === "versandausschluesse");
  assert.equal(vers.quelle, "bedingungen");
  assert.equal(agb.quelle, "agb", "die Versandverbote müssen als AGB-Quelle gekennzeichnet sein");
  // Das Versicherungskapitel nennt bewusst KEINE Güternamen: welche Kategorie
  // ausgeschlossen ist und welche nur eine Freigabe braucht, unterscheidet sich
  // je Bedingungswerk. Eine Liste hier wäre eine Profilvermischung.
  const versText = [vers.lead, ...vers.items, vers.note || ""].join(" ");
  for (const gut of ["Antiquität", "Kunstgegenstand", "Kunstgegenstände", "Edelmetall", "Edelstein",
                     "Uhren", "Bargeld", "Wertpapier", "Schmuck", "Gefahrgut", "Waffen", "Pflanzen",
                     "Umzugsgut", "lebende Tiere"]) {
    assert.ok(!versText.includes(gut),
      `das Versicherungskapitel nennt „${gut}“ — profilabhängige Güterlisten gehören nicht hierher`);
  }
  // Das AGB-Kapitel sagt selbst, dass es NICHT der Versicherungsumfang ist.
  assert.match(agb.title, /Vom Versand ausgeschlossene Güter/);
  assert.match(agb.lead, /etwas anderes als\s+der Umfang des Versicherungsschutzes/);
});

test("10b — die Versandverbote geben die AGB korrekt wieder", () => {
  const agb = INSURANCE_INFO_SECTIONS.find(x => x.id === "versandausschluesse");
  const agbSeite = read("./AGBPage.jsx");
  // Jedes genannte Gut muss in § 8.1 der AGB belegt sein.
  for (const stichwort of ["ADR", "Schusswaffen", "Lebende Tiere", "Bargeld", "Edelmetalle", "Betäubungsmittel"]) {
    assert.ok(agb.items.some(t => t.includes(stichwort)) , `Gut „${stichwort}“ fehlt`);
    assert.ok(agbSeite.includes(stichwort), `„${stichwort}“ ist in den AGB nicht belegt`);
  }
  // Die Einschränkungen der AGB werden mitgeführt, nicht weggelassen.
  assert.ok(agb.items.some(t => /Schusswaffen ohne behördliche Genehmigung/.test(t)),
    "Waffen werden ohne die Genehmigungs-Einschränkung genannt");
  assert.ok(agb.items.some(t => /Edelmetalle und Edelsteine ohne Sondervereinbarung/.test(t)),
    "Edelmetalle werden ohne die Sondervereinbarungs-Einschränkung genannt");
});

test("11 — die korrigierten Einzelfehler können nicht zurückkehren", () => {
  // (1) Kunst/Antiquitäten mit 1.000-EUR-Schwelle: falsche Kombination aus dem
  //     deutschen (Freigabe, ohne Schwelle) und dem französischen Bedingungswerk
  //     (1.000 EUR, aber für Uhren).
  assert.ok(!/1\.000|1000\s*(EUR|€)/.test(ALLER_TEXT), "eine 1.000-EUR-Schwelle ist zurück");
  for (const wort of ["Antiquität", "Antiquitäten", "Kunstgegenstände", "Uhren"]) {
    assert.ok(!ALLER_TEXT.includes(wort), `profilabhängige Güterkategorie „${wort}“ ist zurück`);
  }
  // (2) Edelmetalle/Edelsteine dürfen NICHT als bloß freigabepflichtig erscheinen.
  for (const s of INSURANCE_INFO_SECTIONS.filter(x => x.quelle !== "agb")) {
    const t = [s.lead, ...(s.items || []), s.note || ""].join(" ");
    assert.ok(!/Edelmetall|Edelstein/.test(t),
      `${s.id}: Edelmetalle/Edelsteine stehen außerhalb des AGB-Kapitels`);
  }
  // (3) „menschliche Überreste“ ist in der Versicherungsquelle nicht belegt.
  assert.ok(!/menschliche Überreste|Organe|Körperteile/i.test(ALLER_TEXT),
    "eine in der Versicherungsquelle unbelegte Kategorie ist zurück");
  // (4) „Gefahrgut“ nur im AGB-Kapitel und nur mit den konkreten Regelwerken.
  for (const m of ALLER_TEXT.matchAll(/Gefahrgut/g)) {
    const umfeld = ALLER_TEXT.slice(m.index, m.index + 60);
    assert.match(umfeld, /ADR|IATA|IMDG/, "„Gefahrgut“ ohne die konkreten Regelwerke");
  }
  const gefahrgutKapitel = INSURANCE_INFO_SECTIONS.filter(
    s => [s.lead, ...(s.items || [])].join(" ").includes("Gefahrgut")).map(s => s.id);
  assert.deepEqual(gefahrgutKapitel, ["versandausschluesse"],
    "„Gefahrgut“ steht außerhalb des AGB-Kapitels");
});

test("12 — keine Versicherungsfrist und keine Höchstsumme als Zahl", () => {
  // (6) CE-AGB-Reklamationsfristen dürfen NICHT als Versicherungsfristen
  //     erscheinen — sie sind ein anderes Fristsystem.
  for (const frist of ["24 Stunden", "48 Stunden", "7 Werktage", "7 Werktagen",
                       "7 Kalendertage", "7 Kalendertagen", "21 Tage", "21 Tagen"]) {
    assert.ok(!ALLER_TEXT.includes(frist), `konkrete Frist auf der Versicherungsseite: „${frist}“`);
  }
  const f = INSURANCE_INFO_SECTIONS.find(x => x.id === "meldefrist");
  assert.match(f.lead, /unverzüglich zu melden/);
  assert.match(f.lead, /richtet\s+sich nach den für den jeweiligen Versicherungsfall anwendbaren/);
  // Und die Abgrenzung zu den CE-Reklamationsfristen steht ausdrücklich da.
  assert.match(f.note, /Davon zu unterscheiden/);
  assert.match(f.note, /nicht mit der versicherungs\u00ADrechtlichen Meldefrist identisch/);

  // (7) Keine pauschale 50.000-EUR-Zusage.
  assert.ok(!/50\.000|50000/.test(ALLER_TEXT), "die 50.000-EUR-Zahl ist zurück");
  const h = INSURANCE_INFO_SECTIONS.find(x => x.id === "hoechstgrenzen");
  assert.match(h.lead, /Je nach Güterart und anwendbaren Versicherungsbedingungen/);
  assert.match(h.lead, /allgemein gültige Obergrenze für jede Sendung gibt es nicht/);
});

test("13 — die Profile werden nicht vermischt", () => {
  // (8) Kein Bedingungswerk wird benannt oder einem Land zugeordnet, und keine
  //     profilspezifische Regel wird als allgemeingültig ausgegeben.
  for (const wort of ["deutsche Fassung", "französische Fassung", "deutschen Bedingungen",
                      "französischen Bedingungen", "DE-Profil", "FR-Profil", "Frankreich"]) {
    assert.ok(!ALLER_TEXT.includes(wort), `Profilnennung im Kundentext: „${wort}“`);
  }
  // Bedingungsabhängige Aussagen tragen durchgehend einen Vorbehalt.
  for (const s of INSURANCE_INFO_SECTIONS.filter(x => x.quelle === "bedingungen")) {
    const t = [s.lead, ...(s.items || []), s.note || ""].join(" ");
    assert.match(t, /kann|können|richtet sich|ergibt sich|vorgesehen|anwendbaren/,
      `${s.id}: bedingungsabhängige Aussage ohne Vorbehalt`);
  }
  // Die Quellenkennzeichnung sagt „anwendbar“, nicht „geltend/allgemein“.
  assert.match(QUELLE_LABEL.bedingungen, /anwendbaren Versicherungsbedingungen/);
});

test("14 — der Schadenfall bleibt praktisch und fristfrei", () => {
  const s = INSURANCE_INFO_SECTIONS.find(x => x.id === "schadenfall");
  assert.equal(s.title, "Was tun im Schadenfall?");
  for (const stichwort of ["sofort", "aufbewahren", "Fotos", "Support"]) {
    assert.ok(s.items.some(t => t.toLowerCase().includes(stichwort.toLowerCase())),
      `Schritt „${stichwort}“ fehlt`);
  }
  // Keine Frist in diesem Kapitel.
  const t = [s.lead, ...s.items, s.note || ""].join(" ");
  assert.ok(!/\b\d+\s*(Stunde|Stunden|Tag|Tagen|Werktag|Werktagen)/.test(t),
    "im Schadenfall-Kapitel steht eine konkrete Frist");
  // Der Supportweg ist der BESTEHENDE — kein neuer Schadenprozess, keine API.
  assert.match(seite, /to="\/dashboard\?page=support"/, "der bestehende Supportweg fehlt");
  assert.ok(!/\bfetch\(|apiFetch\(|\/api\//.test(seiteText), "die Seite spricht eine API an");
  assert.ok(!/\bclaims?\b|Schadenmeldung|Schadensformular/i.test(seiteText),
    "es wurde ein eigener Schadenprozess gebaut");
});

test("14b — Verschollenheit nennt keine erfundene Frist", () => {
  const v = INSURANCE_INFO_SECTIONS.find(x => x.id === "verschollenheit");
  assert.match(v.lead, /ergibt sich aus|anwendbaren Versicherungsbedingungen/);
  const text = [v.lead, ...v.items].join(" ");
  assert.ok(!/\b\d+\s*(Tag|Tagen|Wochen|Monate)/.test(text),
    "es wird eine Verschollenheitsfrist behauptet");
});

test("14c — Source Governance ist im Modul dokumentiert", () => {
  // Der Kommentarkopf hält fest, woraus Versicherungscopy stammen darf — und
  // dass ein Implementierungs-Prompt keine Quelle ist.
  assert.match(info, /SOURCE GOVERNANCE/);
  assert.match(info, /Implementierungs-Prompt ist AUSDRÜCKLICH KEINE Quelle/);
  assert.match(info, /ZWEI VERSICHERUNGSPROFILE — NICHT MISCHEN/);
  // Und der technische Befund, warum die Seite den gemeinsamen Kern erklärt.
  assert.match(info, /NICHT belegbar, dass alle\s*\n\/\/ CE-Buchungen nach demselben Profil laufen|NICHT belegbar/);
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
  assert.ok(agbAbschnitte.includes("meldefrist") && agbAbschnitte.includes("schadenfall")
    && agbAbschnitte.includes("versandausschluesse"),
    "Fristabgrenzung, Schadenfall und Versandverbote müssen als AGB-belegt gekennzeichnet sein");
  // „bedingungen“ heißt: vorsichtig formuliert, nie als Zusage.
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
