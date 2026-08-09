// Versicherungsbereich der BookingPage: Fachlichkeit, Linklogik, Sicherheit.
//
// Zwei Arten von Prüfungen in einer Datei, weil sie dieselbe Sache absichern:
//   • Verhalten des reinen Textmoduls (utils/insuranceTerms.mjs) — echt ausgeführt.
//   • Quell-Invarianten der Komponenten — dort, wo ein Verhalten nur im Browser
//     entstünde und der E2E-Lauf (tests/e2e/insuranceTerms.test.mjs) es prüft.
//
// Leitgedanke: Aussagen über ein Versicherungsprodukt dürfen nicht versehentlich
// zurückkehren. Deshalb prüfen mehrere Tests ausdrücklich die ABWESENHEIT von
// Text — „100 % versichert“, der CE-AGB-Link, eine Carriername-Tabelle.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  INSURANCE_CARD_COPY,
  INSURANCE_DIALOG,
  INSURANCE_TEXT,
  JUMINGO_INSURANCE_TERMS_URL,
  carrierTermsHref,
} from "../../utils/insuranceTerms.mjs";
import { httpUrlOrNull, isHttpUrl, EXTERNAL_LINK_REL } from "../../utils/externalLink.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// Kommentare abziehen: eine Begründung darf den alten Wortlaut nennen —
// verboten ist er als ausgelieferter Text.
const ohneKommentare = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const modul     = read("./InsuranceModule.jsx");
const dialog    = read("./InsuranceDetailsDialog.jsx");
const terms     = read("../../utils/insuranceTerms.mjs");
const booking   = read("../../pages/BookingPage.jsx");
const css       = read("../../styles/calculator.css");
const flow      = read("../../utils/shippingFlowState.mjs");
const pkg       = JSON.parse(read("../../../package.json"));

const modulText  = ohneKommentare(modul);
const dialogText = ohneKommentare(dialog);
const termsText  = ohneKommentare(terms);
const alleTexte  = [modulText, dialogText, termsText];

/* ── 1. Keine absolute Deckungszusage mehr ───────────────────────────────── */

test("1 — „Wert zu 100 % versichert“ existiert nirgends mehr", () => {
  // Beide Schreibweisen (mit und ohne Leerzeichen) und die generische Form.
  for (const [name, quelle] of [["InsuranceModule", modulText], ["Dialog", dialogText], ["Textmodul", termsText]]) {
    assert.ok(!/100\s*%/.test(quelle), `${name} enthält noch eine 100-%-Aussage`);
    assert.ok(!/vollständig versichert|zu 100/i.test(quelle), `${name} enthält noch eine absolute Deckungszusage`);
  }
  // Auch keine andere Absolutbehauptung über die Deckung.
  for (const verboten of ["höhere Deckung", "besserer Versicherungsschutz", "umfassender Schutz"]) {
    for (const quelle of alleTexte) assert.ok(!quelle.includes(verboten), `verbotene Aussage „${verboten}“`);
  }
});

/* ── 2./3. Standard und Premium fachlich getrennt ────────────────────────── */

test("2 — Standard nennt Transportversicherung und 50,00 € Selbstbeteiligung", () => {
  const s = INSURANCE_CARD_COPY.standard;
  assert.match(s.description, /Transportversicherung/);
  assert.match(s.description, /Versicherungsbedingungen/);
  const bullets = s.bullets.map(b => b.text);
  assert.ok(bullets.some(t => /50,00 €/.test(t) && /Selbstbeteiligung/.test(t)),
    "Selbstbeteiligung 50,00 € je Schadenfall fehlt");
  assert.ok(bullets.some(t => /Schadenbearbeitung/.test(t)), "reguläre Schadenbearbeitung fehlt");
  assert.equal(s.hasDetails, true, "Standard braucht den Detaileintrag");
});

test("3 — Premium ist Serviceerweiterung auf derselben Versicherung", () => {
  const p = INSURANCE_CARD_COPY.premium;
  assert.match(p.badge, /Service/, "das Badge darf keinen besseren Schutz behaupten");
  assert.match(p.description, /[Gg]leiche zugrunde liegende Versicherungsbedingungen/);
  const bullets = p.bullets.map(b => b.text);
  assert.ok(bullets.some(t => /Keine Selbstbeteiligung/.test(t)), "Selbstbeteiligungsvorteil fehlt");
  assert.ok(bullets.some(t => /[Pp]riorisierter Support/.test(t)), "priorisierter Support fehlt");
  assert.ok(bullets.some(t => /Status-Updates/.test(t)), "Status-Updates fehlen");
  assert.equal(p.hasDetails, true, "Premium braucht den Detaileintrag");
});

/* ── 4. Dritte Option korrekt bezeichnet ─────────────────────────────────── */

test("4 — die dritte Option heißt „Keine zusätzliche Transportversicherung“", () => {
  assert.ok(booking.includes('name: "Keine zusätzliche Transportversicherung"'),
    "der Kartenname im Orchestrator ist nicht aktualisiert");
  assert.ok(!ohneKommentare(booking).includes("Kein Versicherungsschutz"),
    "der alte, fachlich falsche Name lebt noch");
  // Sie nennt neutral die Carrierbedingungen — und KEINE Haftungssumme.
  assert.match(INSURANCE_CARD_COPY.none.description, /Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters/);
  for (const quelle of alleTexte) {
    assert.ok(!/gewichtsabhängig/.test(quelle), "die statische Gewichtsaussage lebt noch");
    assert.ok(!/bis\s+\d+\s*€/.test(quelle), "es wird eine feste Haftungssumme behauptet");
  }
});

/* ── 5. Kein CE-AGB-Link mehr im Versicherungsbereich ────────────────────── */

test("5 — /agb#paragraf-10 wird im Versicherungsbereich nicht mehr verwendet", () => {
  // Kommentare abgezogen: die Begründung DARF den entfernten Link benennen.
  for (const [name, quelle] of [["InsuranceModule", modulText], ["Dialog", dialogText], ["Textmodul", termsText]]) {
    assert.ok(!quelle.includes("paragraf-10"), `${name} verlinkt noch AGB § 10`);
    assert.ok(!/["'`]\/agb/.test(quelle), `${name} verlinkt noch die CE-AGB`);
  }
  // Und es gibt gar keinen React-Router-Link mehr im Versicherungsbereich.
  assert.ok(!/from "react-router-dom"/.test(modul), "das Modul importiert noch den Router-Link");
  // Die CE-AGB selbst bleiben unberührt — Seite und Footer-Link existieren weiter.
  const app = read("../../App.jsx");
  assert.match(app, /path="\/agb"/, "die AGB-Route darf nicht entfernt worden sein");
  assert.match(read("../layout/LegalLinks.jsx"), /\/agb/, "der Legal-Footer muss die AGB weiter führen");
});

/* ── 6./7. Carrier-Link kommt aus dem konkreten Tarif ────────────────────── */

test("6 — vorhandener carrierLinks.agb wird durchgereicht", () => {
  const url = "https://beispiel-carrier.example/agb?lang=de";
  assert.equal(carrierTermsHref({ carrierLinks: { agb: url } }), url);
  // Getrimmt, aber sonst unverändert (Query-Parameter bleiben erhalten).
  assert.equal(carrierTermsHref({ carrierLinks: { agb: `  ${url}  ` } }), url);
  // Die Komponente reicht ihn tatsächlich in den href.
  assert.match(modul, /const carrierTerms = carrierTermsHref\(tariff\)/);
  assert.match(modul, /href=\{carrierTerms\}/);
  assert.match(booking, /tariff=\{tariff\}/, "der Tarif erreicht das Modul nicht");
});

test("7 — fehlender oder unsicherer carrierLinks.agb erzeugt keinen Link", () => {
  for (const eingabe of [
    undefined, null, {}, { carrierLinks: null }, { carrierLinks: {} },
    { carrierLinks: { agb: null } }, { carrierLinks: { agb: "" } }, { carrierLinks: { agb: "   " } },
    { carrierLinks: { agb: "/agb" } }, { carrierLinks: { agb: "javascript:alert(1)" } },
    { carrierLinks: { agb: "data:text/html,<b>x</b>" } }, { carrierLinks: { agb: "//example.com/agb" } },
    { carrierLinks: { agb: 42 } },
  ]) {
    assert.equal(carrierTermsHref(eingabe), null, `unsicherer Wert durchgelassen: ${JSON.stringify(eingabe)}`);
  }
  // Und die Karte rendert den Linkblock nur, wenn ein Link existiert.
  assert.match(modul, /copy\.hasCarrierTerms && carrierTerms && \(/,
    "der Linkblock hängt nicht an der Existenz des Links");
});

/* ── 8. Keine Carriername-Tabelle ────────────────────────────────────────── */

test("8 — es gibt keine statische Carrier-URL-Zuordnung", () => {
  for (const [name, quelle] of [["InsuranceModule", modulText], ["Textmodul", termsText], ["Dialog", dialogText]]) {
    // Kein Carriername steht neben einer URL — Quelle ist immer der Tarif.
    for (const carrier of ["dpd", "gls", "ups", "dhl", "fedex", "tnt", "hermes"]) {
      assert.ok(!new RegExp(`${carrier}[^\\n]{0,40}https?://`, "i").test(quelle),
        `${name} bildet ${carrier} auf eine feste URL ab`);
    }
    assert.ok(!/publicCarrierId|carrierName|CARRIER_URLS/.test(quelle),
      `${name} entscheidet nach Carrier statt nach Tarif`);
  }
  // Der Zugriff erfolgt ausschließlich über carrierLinks.agb.
  assert.match(terms, /links\.agb/);
  assert.equal((terms.match(/carrierLinks/g) || []).length >= 1, true);
});

/* ── 9. Zentrale Produkt-URL ─────────────────────────────────────────────── */

test("9 — die JUMiNGO-Versicherungsbedingungen stehen genau einmal zentral", () => {
  assert.equal(JUMINGO_INSURANCE_TERMS_URL, "https://www.jumingo.com/de-de/info/versicherungsbedingungen");
  assert.ok(isHttpUrl(JUMINGO_INSURANCE_TERMS_URL) && JUMINGO_INSURANCE_TERMS_URL.startsWith("https://"));
  // Genau EIN Literal im ganzen Quellbaum: das im Textmodul. Alle Verwender
  // importieren die Konstante.
  assert.equal((terms.match(/jumingo\.com\/de-de\/info\/versicherungsbedingungen/g) || []).length, 1);
  for (const [name, quelle] of [["InsuranceModule", modul], ["Dialog", dialog]]) {
    assert.ok(!quelle.includes("jumingo.com"), `${name} hartcodiert die URL statt sie zu importieren`);
  }
  assert.match(dialog, /JUMINGO_INSURANCE_TERMS_URL/);
});

/* ── 10./11. Sichere externe Links ───────────────────────────────────────── */

test("10 — der externe Versicherungslink trägt die Sicherheitsattribute", () => {
  assert.equal(EXTERNAL_LINK_REL, "noopener noreferrer");
  const anker = dialog.slice(dialog.indexOf("insdlg-terms-link"));
  assert.match(anker, /target=\{EXTERNAL_LINK_TARGET\}/);
  assert.match(anker, /rel=\{EXTERNAL_LINK_REL\}/);
  // Kein iframe, keine Anfrage beim Laden der Seite.
  for (const quelle of [modul, dialog]) {
    assert.ok(!/<iframe/i.test(quelle), "kein iframe im Versicherungsbereich");
    assert.ok(!/fetch\(|apiFetch\(|XMLHttpRequest/.test(quelle), "kein Request aus dem Versicherungsbereich");
  }
});

test("11 — der Carrierlink trägt dieselben Sicherheitsattribute", () => {
  const anker = modul.slice(modul.indexOf("ins-card-terms-link"));
  assert.match(anker, /target=\{EXTERNAL_LINK_TARGET\}/);
  assert.match(anker, /rel=\{EXTERNAL_LINK_REL\}/);
  // Und die Prüfung existiert genau einmal im Projekt, nicht je Komponente neu.
  assert.ok(!/const isHttpUrl/.test(modul), "eigener URL-Validator im Modul");
  assert.ok(!/https\?:/.test(termsText), "eigener URL-Regex im Textmodul statt der gemeinsamen Prüfung");
  assert.match(terms, /import \{ httpUrlOrNull \} from "\.\/externalLink\.mjs"/);
  for (const datei of ["../offers/OfferCard.jsx", "../dashboard/ShipmentsList.jsx"]) {
    assert.ok(!/const isHttpUrl = /.test(read(datei)), `${datei} hält noch eine eigene Kopie`);
  }
});

test("11b — die gemeinsame Prüfung ist fail-closed", () => {
  for (const gut of ["https://a.example/x", "http://a.example/x", "  https://a.example/x  "]) {
    assert.equal(httpUrlOrNull(gut), gut.trim());
  }
  for (const schlecht of ["javascript:alert(1)", "data:text/html,x", "//a.example", "/agb", "ftp://a.example", "", "   ", null, 7, {}]) {
    assert.equal(httpUrlOrNull(schlecht), null, `durchgelassen: ${String(schlecht)}`);
  }
});

/* ── 12. Kein Pseudo-Link mehr ───────────────────────────────────────────── */

test("12 — es gibt kein klickbar aussehendes Element ohne Funktion", () => {
  assert.ok(!modul.includes("ins-card-cond-link--static"), "der inerte Pseudo-Link lebt noch");
  assert.ok(!css.includes("ins-card-cond-link--static"), "die Pseudo-Link-Optik lebt noch im CSS");
  assert.ok(!/role="note"[^>]*>\s*\{?copy\.link/.test(modul), "inertes note-Element mit Linkoptik");
  // Was in der Kartenfußzeile steht, ist entweder ein <button> oder ein <a>.
  assert.match(modul, /<button type="button" className="ins-card-details-btn"/);
  assert.match(modul, /<a\s+className="ins-card-terms-link"/);
});

/* ── 13.–16. Unveränderte Buchungs-, Reprice- und Persistenzlogik ────────── */

test("13 — der /book-Payload ist unverändert", () => {
  assert.match(booking, /insuranceSelection:\s*\{/);
  for (const feld of ["type:", "value:", "goodsValue:", "contentDescription:"]) {
    assert.ok(booking.includes(feld), `Payloadfeld ${feld} fehlt`);
  }
  assert.match(booking, /\{ type: "none" \}/, "der none-Payload ist verändert");
  // Der Versicherungsbereich schickt nichts Eigenes mit.
  for (const quelle of [modul, dialog, terms]) {
    assert.ok(!/insuranceSelection/.test(quelle), "das Darstellungsmodul baut am Payload mit");
  }
});

test("14 — die Reprice-Mechanik ist unverändert", () => {
  assert.match(booking, /setTimeout\(\(\) => runReprice\([^)]*\), 500\)/, "500-ms-Debounce verändert");
  assert.match(booking, /new AbortController\(\)/, "AbortController fehlt");
  assert.match(booking, /if \(seq !== repriceSeq\.current\) return;/, "Sequenzschutz fehlt");
  assert.match(booking, /if \(isInsured && \(repriceStale \|\| !repriceResult \|\| repriceLoading \|\| !insValid\)\)/,
    "das Buchungs-Gate der Versicherung ist verändert");
  // insValid rechnet weiter mit den ROHEN Fehlern — die Anzeigeschwelle wirkt
  // ausschließlich auf die Darstellung.
  assert.match(booking, /const insValid = !isInsured \|\| \(goodsValueError === "" && insValueError === ""\)/);
  assert.match(booking, /goodsValueError=\{insShowErrors \? goodsValueError : ""\}/);
});

test("15 — das Vorgangsschema ist unverändert (keine neuen Schlüssel)", () => {
  assert.match(flow, /"insuranceType", "goodsValue", "insuranceValue", "insValueManual"/);
  assert.ok(!/insShowErrors/.test(flow), "der reine Anzeigezustand darf nicht persistiert werden");
  assert.ok(!/detailsOpen/.test(flow), "der Dialogzustand darf nicht persistiert werden");
  assert.match(flow, /ce_shipping_flow_v1|SCHEMA_VERSION/, "Schemaversion/Schlüssel nicht auffindbar");
});

test("16 — Tarifobjekte überleben die Persistenz unverändert (inkl. carrierLinks)", () => {
  // objectList reicht ganze Tarifobjekte durch — carrierLinks wird nicht
  // herausgefiltert. Das ist die Grundlage dafür, dass der Bedingungslink eine
  // Rückkehr auf die Buchungsseite übersteht.
  assert.match(flow, /tariffs: objectList\(src\.tariffs, 120\)/);
  assert.ok(!/carrierLinks/.test(flow), "die Persistenz kennt (und beschneidet) carrierLinks nicht");
});

/* ── 17. Keine neue Abhängigkeit ─────────────────────────────────────────── */

test("17 — keine neue Abhängigkeit", () => {
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),
    ["@vitejs/plugin-react", "maplibre-gl", "react", "react-dom", "react-router-dom", "vite"]);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ["playwright"]);
  for (const quelle of [modul, dialog, terms]) {
    for (const fremd of ["lucide-react", "react-modal", "@headlessui", "react-aria"]) {
      assert.ok(!quelle.includes(`from "${fremd}`), `fremde UI-Bibliothek importiert: ${fremd}`);
    }
  }
});

/* ── Dialog: Aufbau und Barrierefreiheit (Quelle) ────────────────────────── */

test("18 — der Dialog nutzt das globale Dialogsystem", () => {
  assert.match(dialog, /useDialog\(\{ open, onClose, returnFocusTo \}\)/, "gemeinsames Dialogverhalten fehlt");
  assert.match(dialog, /className="ce-dialog-overlay"/);
  assert.match(dialog, /className="ce-dialog ce-dialog--md insdlg"/, "keine der vier zulässigen Breiten");
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby="insdlg-title"/);
  assert.match(dialog, /id="insdlg-title"/);
  assert.match(dialog, /aria-label="Versicherungsdetails schließen"/, "Schließknopf ohne zugänglichen Namen");
  // Keine zweite Dialogmechanik, kein eigener Overlayton, kein backdrop-filter.
  assert.ok(!/position: fixed/.test(css.slice(css.indexOf(".insdlg"))), "eigener Overlay-Nachbau");
  assert.ok(!/backdrop-filter/.test(dialog));
});

test("19 — der Dialog zeigt Zusammenfassung statt Volltext", () => {
  assert.equal(INSURANCE_DIALOG.title, "Transportversicherung");
  assert.match(INSURANCE_DIALOG.intro, /Versicherungsbedingungen von JUMiNGO/);
  assert.match(INSURANCE_DIALOG.intro, /KRAVAG LOGISTIC Versicherung AG/);
  assert.deepEqual(INSURANCE_DIALOG.sections.map(s => s.id), ["standard", "premium"]);
  assert.match(INSURANCE_DIALOG.notice, /ausgeschlossen|Freigabe/);
  // Kompakt: die Zusammenfassung bleibt kurz, der Volltext liegt extern.
  const zeichen = INSURANCE_DIALOG.sections.flatMap(s => s.items).join(" ").length;
  assert.ok(zeichen < 600, `die Zusammenfassung ist mit ${zeichen} Zeichen zu lang — Volltext gehört zu JUMiNGO`);
  assert.equal(INSURANCE_TEXT.fullTerms, "Vollständige Versicherungsbedingungen öffnen");
});

test("20 — keine unbelegte Rollenaussage über ConfidaraExpress", () => {
  const verboten = [
    "vermittelt die Versicherung", "Versicherungsvermittler", "ist Versicherer",
    "Versicherungsmakler", "Versicherungsvermittlung",
  ];
  for (const quelle of alleTexte) {
    for (const satz of verboten) {
      assert.ok(!quelle.includes(satz), `unbelegte Rollenaussage: „${satz}“`);
    }
  }
});

/* ── Copy-Konsistenz ─────────────────────────────────────────────────────── */

test("21 — im Modul gilt je Sache genau ein Begriff", () => {
  assert.equal(INSURANCE_TEXT.sectionTitle, "Transportversicherung");
  assert.equal(INSURANCE_TEXT.detailsAction, "Versicherungsdetails");
  assert.match(INSURANCE_TEXT.carrierTerms, /^Haftungs- & Beförderungsbedingungen/);
  for (const parallel of ["Versicherungskonditionen", "Haftungs-AGB", "Versicherungs-AGB", "Schutzbedingungen"]) {
    for (const quelle of alleTexte) assert.ok(!quelle.includes(parallel), `Parallelbegriff „${parallel}“`);
  }
});

/* ── Warenwert: Fehler erst nach echter Interaktion ──────────────────────── */

test("22 — Wertfehler erscheinen nicht beim ersten Rendern", () => {
  assert.match(booking, /const \[insShowErrors, setInsShowErrors\] = useState\(false\)/,
    "die Anzeigeschwelle fehlt oder startet nicht bei false");
  assert.match(booking, /onGoodsValueBlur=\{\(\) => setInsShowErrors\(true\)\}/, "Blur-Auslöser fehlt");
  assert.match(booking, /onInsuranceValueBlur=\{\(\) => setInsShowErrors\(true\)\}/, "Blur-Auslöser fehlt");
  assert.match(booking, /insValueError=\{insShowErrors \? insValueError : ""\}/);
  // Auch der Versuch weiterzugehen bzw. zu buchen deckt die Fehler auf.
  assert.equal((booking.match(/if \(!insValid\) setInsShowErrors\(true\)/g) || []).length, 2,
    "Weiter-Gate und Buchungs-Guard müssen die Fehler aufdecken");
  // Das Modul reicht die Auslöser an die echten Felder durch.
  assert.match(modul, /onBlur=\{onGoodsValueBlur\}/);
  assert.match(modul, /onBlur=\{onInsuranceValueBlur\}/);
});

test("23 — ohne Zusatzversicherung entstehen keine Wertfehler", () => {
  // Die Rohfehler sind bei „none“ leer, und die Felder werden gar nicht gerendert.
  assert.match(booking, /const goodsValueError =\s*\n\s*!isInsured\s*\?\s*""/);
  assert.match(booking, /const insValueError =\s*\n\s*!isInsured\s*\?\s*""/);
  assert.match(modul, /\{isInsured && \(\s*\n\s*<div className="ins-inputs">/);
});

/* ── Kein zusätzliches Feld für den Wareninhalt ──────────────────────────── */

test("24 — contentDescription bleibt ohne eigenes Feld", () => {
  assert.match(booking, /const contentDescription = \(form\.content\.trim\(\) \|\| "Paket"\)\.slice\(0, 35\)/);
  assert.ok(!/contentDescription/.test(modulText), "das Modul erfasst den Inhalt erneut");
});
