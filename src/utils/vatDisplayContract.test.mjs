// Netto/Brutto-Anzeigevertrag (Betreiberentscheidung 2026-10-02).
//
//   • Jede ECHTE neue Preisberechnung startet in Netto — in „Neue Sendung" und im Preisrechner; das bloße
//     Wiedereinblenden gültiger Ergebnisse (kein Request) behält die Wahl.
//   • Netto/Brutto bleibt umschaltbar und gilt durchgehend: Karte, Tarifdetails, Optionen, Buchung, Erfolg.
//   • Die Umschaltung ist REINE DARSTELLUNG: kein Request, keine Neubepreisung, keine Bindung, kein
//     Buchungskörper, kein anderer Betrag.
//   • Der zahlbare Bruttobetrag bleibt in der Nettoanzeige erkennbar; nichts wird gerechnet.
//
// Reine Funktionen werden direkt geprüft; die Verdrahtung über Quelltextanker auf kommentarfreiem Code.
// Das Verhalten im Browser (0 Requests beim Umschalten, unveränderter /book-Körper) prüft
// tests/e2e/vatDisplayContract.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  vatDisplay, normalizeVatMode, isGrossVatMode, vatSuffixText, VAT_TEXT,
  VAT_MODE_NET, VAT_MODE_GROSS,
} from "./vatDisplayView.mjs";
import { residentialModuleView, RESIDENTIAL_STATUS } from "./residentialPriceInputs.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => readFileSync(path.join(HIER, p), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (p) => ohneKommentare(lies(p));
const abschnitt = (quelle, von, bis) => {
  const a = quelle.indexOf(von);
  assert.ok(a >= 0, `Anker fehlt: ${von}`);
  const b = quelle.indexOf(bis, a + von.length);
  assert.ok(b > a, `Endanker fehlt: ${bis}`);
  return quelle.slice(a, b);
};
// Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen.
const nbsp = (s) => String(s).replace(/[  ]/g, " ");

const NEUE_SENDUNG = "../pages/NewShipmentPage.jsx";
const PREISRECHNER = "../pages/CalculatorPage.jsx";
const BUCHUNG = "../pages/BookingPage.jsx";
const KARTE = "../components/offers/OfferCard.jsx";
const LISTE = "../components/offers/OffersList.jsx";
const UMSCHALTER = "../components/offers/VatModeToggle.jsx";
const LIVE = "../components/booking/BookingLiveSummary.jsx";
const STICKY = "../components/booking/BookingStickySummary.jsx";
const AUSWAHL = "../components/booking/OfferSummaryModule.jsx";
const AUFSTELLUNG = "../components/booking/PriceSummaryModule.jsx";
const ERFOLG = "../components/booking/BookingSuccessStep.jsx";
const ADRESSART = "../components/booking/ResidentialPriceInputModule.jsx";

/* ══════════ §1  DER PRÄSENTATOR — WÄHLT, RECHNET NIE ═══════════════════════════════ */

test("1 — Netto ist die Standardanzeige; nur „gross“ ist brutto", () => {
  assert.equal(normalizeVatMode(undefined), VAT_MODE_NET);
  assert.equal(normalizeVatMode(null), VAT_MODE_NET);
  assert.equal(normalizeVatMode(""), VAT_MODE_NET);
  assert.equal(normalizeVatMode("brutto"), VAT_MODE_NET);
  assert.equal(normalizeVatMode("net"), VAT_MODE_NET);
  assert.equal(normalizeVatMode("gross"), VAT_MODE_GROSS);
  assert.equal(isGrossVatMode("gross"), true);
  assert.equal(isGrossVatMode("net"), false);
  assert.equal(isGrossVatMode(undefined), false);
});

test("2 — Netto-Modus: netto vorn, der zahlbare Bruttobetrag dahinter — beide unverändert vom Server", () => {
  const v = vatDisplay({ net: 12, gross: 14.28 }, "net");
  assert.deepEqual(v, { mode: "net", primary: { amount: 12, isGross: false }, secondary: { amount: 14.28, isGross: true } });
});

test("3 — Brutto-Modus: brutto vorn, netto dahinter", () => {
  const v = vatDisplay({ net: 12, gross: 14.28 }, "gross");
  assert.deepEqual(v, { mode: "gross", primary: { amount: 14.28, isGross: true }, secondary: { amount: 12, isGross: false } });
});

test("4 — ein fehlender Betrag bleibt fehlend: kein Ersatz, keine Ersatzberechnung", () => {
  // Brutto fehlt → in der Bruttoanzeige KEIN Nettobetrag unter „inkl. MwSt.".
  assert.equal(vatDisplay({ net: 12, gross: null }, "gross").primary.amount, null);
  assert.equal(vatDisplay({ net: 12, gross: undefined }, "net").secondary.amount, null);
  // Netto fehlt → in der Nettoanzeige kein aus dem Brutto abgeleiteter Wert.
  assert.equal(vatDisplay({ net: null, gross: 14.28 }, "net").primary.amount, null);
  // Nur echte Zahlen sind Beträge.
  for (const kaputt of ["12", "", NaN, Infinity, true, {}, []]) {
    assert.equal(vatDisplay({ net: kaputt, gross: kaputt }, "net").primary.amount, null, String(kaputt));
    assert.equal(vatDisplay({ net: kaputt, gross: kaputt }, "gross").primary.amount, null, String(kaputt));
  }
  assert.deepEqual(vatDisplay(null, "net").primary, { amount: null, isGross: false });
  assert.deepEqual(vatDisplay(undefined, undefined).secondary, { amount: null, isGross: true });
  // 0 ist ein echter Betrag (z. B. ein Zuschlag von 0,00 €), keine fehlende Angabe.
  assert.equal(vatDisplay({ net: 0, gross: 0 }, "gross").primary.amount, 0);
});

test("5 — Beschriftungen: wörtlich wie Umschalter und Karte", () => {
  assert.equal(vatSuffixText(true), "inkl. MwSt.");
  assert.equal(vatSuffixText(false), "exkl. MwSt.");
  assert.equal(VAT_TEXT.gross, "brutto");
  assert.equal(VAT_TEXT.net, "netto");
  assert.equal(VAT_TEXT.payable, "zahlbar");
  assert.equal(VAT_TEXT.netTotal, "Gesamtbetrag netto");
});

test("6 — das Modul rechnet nicht: keine Arithmetik, kein Steuersatz", () => {
  const modul = code("./vatDisplayView.mjs")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/=>/g, "");
  assert.ok(!/[\w)\]]\s*[*/+-]\s*[\w(]/.test(modul), "im Präsentator steht eine Rechnung");
  assert.ok(!/0\.19|1\.19|vatRate|VAT_RATE/.test(modul), "der Präsentator kennt einen Steuersatz");
});

/* ══════════ §2  NEUE ECHTE BERECHNUNG → NETTO; EINBLENDEN → WAHL BLEIBT ══════════════ */

for (const [name, datei, validierungsEnde] of [
  ["Neue Sendung", NEUE_SENDUNG, "focusFirstError(firstShipmentErrorField(errs));"],
  ["Preisrechner", PREISRECHNER, "focusFirstError(firstErrorField(preErrors));"],
]) {
  test(`7 — ${name}: setVatMode("net") genau einmal in calculate — nach Einblende-Zweig und Validierung, vor dem Request`, () => {
    const quelle = code(datei);
    const calc = abschnitt(quelle, "const calculate = async () => {", "apiFetch(`/api/jumingo/calculate-price`");
    const treffer = calc.match(/setVatMode\("net"\)/g) || [];
    assert.equal(treffer.length, 1, `${name}: setVatMode("net") nicht genau einmal vor dem Request`);
    const reset = calc.indexOf('setVatMode("net")');
    const einblenden = calc.indexOf("revealOffers(offersRef.current);");
    const validiert = calc.indexOf(validierungsEnde);
    const inFlight = calc.indexOf("calcInFlight.current = true;");
    assert.ok(einblenden > 0 && reset > einblenden, `${name}: Netto wird schon im Einblende-Zweig gesetzt`);
    assert.ok(validiert > 0 && reset > validiert, `${name}: Netto wird vor der Validierung gesetzt`);
    assert.ok(inFlight > 0 && reset > inFlight, `${name}: Netto wird vor dem Start des Requests gesetzt`);
    // Der Einblende-Zweig endet mit `return` VOR dem Reset — dort bleibt die Wahl des Kunden.
    const zweig = calc.slice(einblenden, reset);
    assert.match(zweig, /return;/);
  });
}

test("8 — Startzustand: ohne laufenden Vorgang netto, sonst dessen Wahl (shippingFlowState)", () => {
  for (const datei of [NEUE_SENDUNG, PREISRECHNER]) {
    assert.match(code(datei), /const \[vatMode, setVatMode\] = useState\(flowInit \? flowInit\.vatMode : "net"\);/);
  }
});

/* ══════════ §3  UMSCHALTEN = REINE DARSTELLUNG ═════════════════════════════════════ */

test("9 — der Umschalter meldet nur den Modus: kein Request, kein Betrag", () => {
  const u = code(UMSCHALTER);
  assert.ok(!/fetch\(|apiFetch|from "\.\.\/\.\.\/api\//.test(u), "der Umschalter spricht mit dem Backend");
  assert.match(u, /onClick=\{\(\) => onChange\(VAT_MODE_NET\)\}/);
  assert.match(u, /onClick=\{\(\) => onChange\(VAT_MODE_GROSS\)\}/);
  assert.match(u, /aria-pressed=\{!brutto\}/);
  assert.match(u, /aria-pressed=\{brutto\}/);
  // Angebotsliste und Buchungsseite benutzen DIESELBE Komponente.
  assert.match(code(LISTE), /<VatModeToggle vatMode=\{vatMode\} onChange=\{onVatToggle\} labelledBy=\{vatLabelId\} \/>/);
  assert.match(code(BUCHUNG), /<VatModeToggle vatMode=\{vatMode\} onChange=\{waehleVatMode\} labelledBy="booking-vat-label" \/>/);
});

test("10 — Buchungsseite: Modus aus dem laufenden Vorgang, die Wahl schreibt NUR die Anzeigepräferenz", () => {
  const seite = code(BUCHUNG);
  assert.match(seite, /const \[vatMode, setVatMode\] = useState\(\(\) => normalizeVatMode\(flowShipment\?\.vatMode\)\);/);
  const wahl = abschnitt(seite, "const waehleVatMode = useCallback((mode) => {", "}, [flowShipment, setFlowScope]);");
  // Genau drei Anweisungen: normalisieren, lokal setzen, im Vorgang merken — kein Request, keine Bindung.
  assert.ok(!/fetch|apiFetch|reprice|bind|book|load|setRepriceResult|setResBoundValue/i.test(wahl.replace("waehleVatMode", "")),
    "die Wahl löst mehr aus als die Darstellung");
  assert.match(wahl, /setFlowScope\("shipment", \{ vatMode: naechster \}\);/);
});

test("11 — der Modus verlässt die Seite nie: nur Darstellungs-Props, kein API-/Buchungskörper", () => {
  const seite = code(BUCHUNG);
  const erlaubt = [
    /^\s*const \[vatMode, setVatMode\] = useState\(\(\) => normalizeVatMode\(flowShipment\?\.vatMode\)\);$/,
    /^\s*const waehleVatMode = useCallback\(\(mode\) => \{$/,
    /^\s*const naechster = normalizeVatMode\(mode\);$/,
    /^\s*setVatMode\(naechster\);$/,
    /^\s*if \(flowShipment\) setFlowScope\("shipment", \{ vatMode: naechster \}\);$/,
    /^\s*vatMode,$/,
    /^\s*<VatModeToggle vatMode=\{vatMode\} onChange=\{waehleVatMode\} labelledBy="booking-vat-label" \/>$/,
    /^\s*<BookingLiveSummary .*vatMode=\{vatMode\} \/>$/,
    /^\s*<BookingStickySummary .*vatMode=\{vatMode\} \/>$/,
    /^\s*<OfferSummaryModule .*vatMode=\{vatMode\} \/>$/,
    /^\s*vatMode=\{vatMode\}$/,
    /^\s*import \{ normalizeVatMode, VAT_TEXT \} from "\.\.\/utils\/vatDisplayView\.mjs";$/,
  ];
  const zeilen = seite.split("\n").filter((z) => /vatMode|VatMode/.test(z));
  assert.ok(zeilen.length > 0);
  for (const z of zeilen) {
    if (/^\s*import \{ VatModeToggle \}/.test(z)) continue;
    assert.ok(erlaubt.some((re) => re.test(z)), `unerwartete Verwendung des Anzeigemodus: ${z.trim()}`);
  }
  // Kein Anfragekörper und kein Client nennt den Modus.
  assert.ok(!/vatMode/.test(code("../api/client.js")), "der API-Client kennt den Anzeigemodus");
  const buchenAufruf = abschnitt(seite, "const doBook = async", "\n  };\n");
  assert.ok(!/vatMode/.test(buchenAufruf), "der Buchungsaufruf liest den Anzeigemodus");
});

/* ══════════ §4  ALLE PREISFLÄCHEN FOLGEN DEM MODUS — OHNE EIGENE BETRAGSLOGIK ═══════ */

test("12 — Karte: Hauptpreis im Modus, darunter der andere Serverbetrag; fehlt der Betrag, steht „—“", () => {
  const karte = code(KARTE);
  assert.match(karte, /const preisAnzeige = vatDisplay\(\{ net: t\.netPrice, gross: t\.finalPrice \}, vatMode\);/);
  const block = abschnitt(karte, 'className="offer-price-block"', "className={`offer-cta-btn ${ctaClass}`}");
  assert.match(block, /\{preisAnzeige\.primary\.amount != null \? money\(preisAnzeige\.primary\.amount\) : "—"\}/);
  assert.match(block, /\{vatSuffixText\(preisAnzeige\.primary\.isGross\)\}/);
  assert.match(block, /preisAnzeige\.secondary\.amount != null && \(\s*<div className="offer-price-alt">/);
  assert.ok(!/finalPrice \?\? t\.netPrice/.test(karte), "der Kartenpreis fällt wieder auf den Nettobetrag zurück");
  // Tarifdetails: beide Beträge, hervorgehoben der des Modus.
  assert.match(karte, /<DetailRow label="Netto" {2}value=\{money\(t\.netPrice\)\} strong=\{!isGrossVatMode\(vatMode\)\} \/>/);
  assert.match(karte, /<DetailRow label="Brutto" value=\{money\(t\.finalPrice\)\} strong=\{isGrossVatMode\(vatMode\)\} \/>/);
  assert.match(karte, /<DetailsPanel tariff=\{t\} senderPrefill=\{senderPrefill\} vatMode=\{vatMode\} \/>/);
});

test("13 — Live- und Sticky-Leiste: Brutto-Element trägt immer brutto, Netto-Element immer netto", () => {
  for (const [datei, klasse] of [[LIVE, "blsum"], [STICKY, "bsum"]]) {
    const q = code(datei);
    assert.match(q, new RegExp(`<span className="${klasse}-price-gross">\\s*\\{preis\\.gross != null \\? money\\(preis\\.gross\\) : "—"\\}\\s*<span className="${klasse}-price-unit"> brutto<\\/span>`));
    assert.match(q, new RegExp(`<span className="${klasse}-price-net">\\{money\\(preis\\.net\\)\\}<span className="${klasse}-price-unit"> netto<\\/span><\\/span>`));
    assert.match(q, /const nettoZuerst = !isGrossVatMode\(vatMode\) && preis\.net != null;/);
    assert.ok(!/preis\.(net|gross)\s*[-+*/]|[-+*/]\s*preis\.(net|gross)/.test(q), `${datei}: es wird gerechnet`);
  }
  // Die große Leiste nennt in der Nettoanzeige den zahlbaren Bruttobetrag ausdrücklich.
  assert.match(code(LIVE), /\{preis\.gross != null && <span className="blsum-price-payable"> · \{VAT_TEXT\.payable\}<\/span>\}/);
  // Die kompakte Leiste bleibt ohne Bedienelement.
  assert.ok(!/<button|VatModeToggle/.test(code(STICKY)));
});

test("14 — ausgewähltes Angebot: netto vorn (bisher), in der Bruttoanzeige brutto vorn — Hinweise bleiben beim Brutto", () => {
  const q = code(AUSWAHL);
  assert.match(q, /const bruttoZuerst = isGrossVatMode\(vatMode\) && preis\.gross != null;/);
  assert.match(q, /\{!bruttoZuerst && nettoZeile\}/);
  assert.match(q, /\{bruttoZuerst && nettoZeile\}/);
  assert.match(q, /<div className="offsum-price-gross">\{money\(preis\.gross\)\} brutto<\/div>/);
});

test("15 — Aufstellung: „Gesamtbetrag netto“ nur aus totalNet, vor „Gesamtbetrag brutto“, nur in der Nettoanzeige", () => {
  const q = code(AUFSTELLUNG);
  assert.match(q, /const nettoGesamt = !isGrossVatMode\(vatMode\) && typeof v\.totalNet === "number" && Number\.isFinite\(v\.totalNet\)\s*\? v\.totalNet : null;/);
  const netto = q.indexOf("{VAT_TEXT.netTotal}");
  const brutto = q.indexOf('<span className="booking-total-label">Gesamtbetrag brutto</span>', netto);
  assert.ok(netto > 0 && brutto > netto, "die Nettozeile steht nicht vor dem zahlbaren Bruttobetrag");
  assert.ok(!/totalNet\s*[-+*/]|[-+*/]\s*v\.totalNet|insuranceGross\s*\+|shippingNet\s*\+/.test(q), "die Aufstellung rechnet");
  // Steuerfreie Absicherung unverändert: Bruttobetrag mit „steuerfrei", keine MwSt.
  assert.match(q, /<span className="booking-tax-chip">steuerfrei<\/span>/);
});

test("16 — Erfolg: gebuchter Bruttobetrag bleibt die Quelle; Netto nur in der cent-gleichen Aufstellung", () => {
  const q = code(ERFOLG);
  assert.match(q, /Gesamtbetrag brutto<\/span>\s*<span className="booking-total-amount">\{money\(betrag\.totalGross\)\}/);
  assert.match(q, /<PriceSummaryModule priceView=\{\{ \.\.\.priceView, totalGross: betrag\.totalGross, components: bookingSuccessComponents\(booking, priceView\) \}\} paymentTerm=\{user\?\.payment_term \|\| 7\} vatMode=\{vatMode\} \/>/);
});

test("17 — Optionen (Art der Lieferadresse): Zuschlag im Modus vorn, der andere darunter — beide aus der Optionsantwort", () => {
  const optionen = {
    options: [
      { value: false, surcharge: { net: 0, vat: 0, gross: 0 } },
      { value: true, surcharge: { net: 3.18, vat: 0.6, gross: 3.78 } },
    ],
  };
  const netto = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: optionen, vatMode: "net" });
  const brutto = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: optionen, vatMode: "gross" });
  const privat = (v) => v.cards.find((k) => k.value === true);
  assert.equal(nbsp(privat(netto).primaryText), "+ 3,18 € netto");
  assert.equal(nbsp(privat(netto).secondaryText), "3,78 € brutto");
  assert.equal(nbsp(privat(brutto).primaryText), "+ 3,78 € brutto");
  assert.equal(nbsp(privat(brutto).secondaryText), "3,18 € netto");
  // Der bisherige Vertrag bleibt in beiden Modi unverändert.
  for (const v of [netto, brutto]) {
    assert.equal(nbsp(privat(v).grossText), "+ 3,78 € brutto");
    assert.equal(nbsp(privat(v).netText), "3,18 € netto");
  }
  // Ohne Modus: die Standardanzeige netto.
  const ohne = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: optionen });
  assert.equal(nbsp(privat(ohne).primaryText), "+ 3,18 € netto");
  const modul = code(ADRESSART);
  assert.match(modul, /<span className="res-card-price-val">\{k\.primaryText\}<\/span>/);
  assert.match(modul, /<span className="res-card-price-sub">\{k\.secondaryText\}<\/span>/);
});

test("18 — Preisänderung: beide Beträge sind ausdrücklich Bruttobeträge", () => {
  const seite = code(BUCHUNG);
  assert.match(seite, /<span className="price-drift-col-label">Bisheriger Preis \(\{VAT_TEXT\.gross\}\)<\/span>/);
  assert.match(seite, /<span className="price-drift-col-label">Neuer Preis \(\{VAT_TEXT\.gross\}\)<\/span>/);
});

test("19 — keine Fläche rechnet MwSt.: kein Steuersatzfaktor in Karte, Leisten, Aufstellung und Seite", () => {
  for (const datei of [KARTE, LIVE, STICKY, AUSWAHL, AUFSTELLUNG, ERFOLG, ADRESSART, BUCHUNG, LISTE]) {
    const q = code(datei);
    assert.ok(!/\*\s*1\.19|\*\s*0\.19|\/\s*1\.19|\/\s*0\.19/.test(q), `${datei} rechnet MwSt.`);
  }
});
