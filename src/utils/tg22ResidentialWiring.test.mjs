// TG22 Residential — Verdrahtung auf den Seiten (Quelltextanker auf kommentarfreiem Code).
//
// Die reinen Helfer prüft residentialPriceInputs.test.mjs, das gerenderte Verhalten
// tests/e2e/tg22ResidentialPriceInputs.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HIER = path.dirname(fileURLToPath(import.meta.url));
// CRLF-Checkouts (Windows) auf LF bringen — die Anker unten enthalten Zeilenumbrüche.
const lies = (p) => readFileSync(path.join(HIER, p), "utf8").replace(/\r\n/g, "\n");
// Ganze Zeilenkommentare zuerst (siehe tg22PackageBWiring.test.mjs), dann Blockkommentare.
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (p) => ohneKommentare(lies(p));

const booking = code("../pages/BookingPage.jsx");
const neu     = code("../pages/NewShipmentPage.jsx");
const karte   = code("../components/offers/OfferCard.jsx");
const modul   = code("../components/booking/ResidentialPriceInputModule.jsx");
const summe   = code("../components/booking/PriceSummaryModule.jsx");
const erfolg  = code("../components/booking/BookingSuccessStep.jsx");
const client  = code("../api/client.js");
const restore = code("insuranceRestore.mjs");
const css     = lies("../styles/calculator.css");

const abschnitt = (quelle, von, bis) => {
  const a = quelle.indexOf(von);
  assert.ok(a >= 0, `Anker fehlt: ${von}`);
  const b = quelle.indexOf(bis, a + von.length);
  assert.ok(b > a, `Endanker fehlt: ${bis}`);
  return quelle.slice(a, b);
};

test("W1 — „Neue Sendung“ fragt keine Adressart mehr und bepreist nur Inhalt und Warenwert", () => {
  assert.doesNotMatch(neu, /AddressTypeModule|addressTypeQuestions|collectionIsResidential|deliveryIsResidential|FELD_ABHOLUNG|FELD_ZUSTELLUNG/);
  assert.match(neu, /declarations: \[form\.declaredContent, form\.declaredGoodsValue\],/);
  assert.doesNotMatch(neu, /ResidentialPriceInputModule|loadPriceInputOptions|bindPriceInputs/,
    "die Frage nach der Lieferadresse steht wieder vor dem Vergleich");
});

test("W2 — die Buchungsseite zeigt die Auswahl nur für ein Angebot, das sie nennt, und lädt die Optionen selbst", () => {
  assert.doesNotMatch(booking, /addressTypeQuestions|AddressTypeModule|AddressTypeSummary|adresstyp|adressangaben/);
  assert.match(booking, /import \{ ResidentialPriceInputModule \} from "\.\.\/components\/booking\/ResidentialPriceInputModule";/);
  assert.match(booking, /const residentialRequired = offerRequiresResidentialChoice\(tariff\);/);
  assert.match(booking, /\{residentialRequired && \(\s*<ResidentialPriceInputModule\s+view=\{residentialView\}\s+onSelect=\{waehleLieferadresse\}\s+onRetry=\{erneutZuschlagLaden\}/);
  assert.match(booking, /if \(!residentialRequired \|\| step === 3 \|\| resStatus !== RESIDENTIAL_STATUS\.IDLE\) return;\s*ladeZuschlagsoptionen\(\);/);
  assert.match(booking, /priceInputsRequired: residentialBlocks,/);
  assert.match(booking, /const residentialBlocks = residentialBlocksBooking\(\{\s*required: residentialRequired, status: resStatus, boundValue: resBoundValue, tariff, options: resOptions,\s*\}\);/);
});

test("W3 — /book: Preisstand und gebundene Wahl über den Helfer, vor der Absicherung; nie ein Formularwert", () => {
  const body = abschnitt(booking, "const r = await apiFetch(`/api/jumingo/book`", "let d = null;");
  assert.doesNotMatch(body, /priceInputs:/, "die Seite setzt priceInputs wieder selbst");
  const residential = body.indexOf("...residentialBookPayload(tariff),");
  const absicherung = body.indexOf("...insurancePayload,");
  assert.ok(residential > 0 && absicherung > residential, "der bestätigte Preisstand der Absicherung muss gewinnen");
  assert.match(body, /\.\.\.bookingContentPayload\(form\.content, noetigeAdressangaben\),/);
});

test("W4 — ohne Bindung entsteht kein Buchungsrequest und kein Schritt 2", () => {
  const buchung = abschnitt(booking, "const doBook = async", "const handlePriceChangeRecalculate");
  const sperre = buchung.search(/if \(residentialBlocks\) \{\s*setStep\(1\);\s*setError\(RESIDENTIAL_TEXT\.required\);\s*return;\s*\}/);
  const request = buchung.indexOf("await apiFetch(`/api/jumingo/book`");
  assert.ok(sperre > 0 && request > sperre, "die Sperre steht nicht vor dem Request");
  const weiter = abschnitt(booking, "const goToStep2 = () => {", 'setError(""); setStep(2);');
  assert.match(weiter, /if \(residentialBlocks\) \{\s*setError\(RESIDENTIAL_TEXT\.required\);\s*return;\s*\}/);
});

test("W5 — 409 bei /book: Neubestätigung VOR Preisänderungs- und Absicherungszweig", () => {
  const buchung = abschnitt(booking, "const doBook = async", "const handlePriceChangeRecalculate");
  const konflikt = buchung.slice(buchung.indexOf("if (r.status === 409) {"));
  const neubindung = konflikt.search(/if \(residentialRequired && \(isRebindRequired\(d\) \|\| isPriceInputsRequired\(d\)/);
  const preis = konflikt.indexOf('if (d?.code === "PRICE_CHANGED") {');
  const deckung = konflikt.indexOf("if (isInsured && coverModel && isCoverBookError(d)) {");
  assert.ok(neubindung > 0 && preis > neubindung && deckung > neubindung, "Reihenfolge der 409-Zweige");
  assert.match(konflikt, /d\?\.code === "PRICE_CONFIRMATION_REQUIRED" \|\| d\?\.code === "OFFER_PRICE_CONFLICT"/);
  assert.match(konflikt, /forderNeubindung\(isRebindRequired\(d\) \? RESIDENTIAL_TEXT\.rebind/);
});

test("W6 — Absicherung: keine Neubepreisung vor der Bindung; Neubestätigung statt Preisdialog", () => {
  const eff = abschnitt(booking, "useEffect(() => {\n    repriceSeq.current++;",
    "}, [insuranceType, goodsValue, insuranceValue, goodsAreNew, goodsAreFragile, residentialBlocks]);");
  const sperre = eff.indexOf("if (residentialBlocks) {");
  const debounce = eff.indexOf("setTimeout(() => runReprice(");
  assert.ok(sperre > 0 && debounce > sperre, "vor der Bindung wird bepreist");

  const lauf = abschnitt(booking, "const runReprice = async", "useEffect(() => {\n    repriceSeq.current++;");
  const neubindung = lauf.search(/if \(residentialRequired && \(isRebindRequired\(d\) \|\| isPriceInputsRequired\(d\)\)\) \{/);
  const dialog = lauf.indexOf("const versicherteAenderung = ");
  assert.ok(neubindung > 0 && dialog > neubindung, "eine Neubestätigung öffnet den Übernahmedialog");

  const annahme = abschnitt(booking, "const acceptInsuredPriceChange = async", "const continueWithNewPrice");
  assert.match(annahme, /if \(residentialRequired && \(isRebindRequired\(d\) \|\| isPriceInputsRequired\(d\)\)\) \{\s*setPriceChange\(null\);\s*forderNeubindung\(/);

  assert.match(booking, /\{residentialRequired && residentialBlocks \? \(\s*<p className="booking-ins-unavailable" id="insurance-after-residential">\s*\{RESIDENTIAL_TEXT\.insuranceAfterChoice\}\s*<\/p>\s*\) : modules\.insurance \? \(/);
});

test("W7 — Optionen: genau ein Konfliktversuch, Wiederherstellung über boundValue, sonst still binden", () => {
  const laden = abschnitt(booking, "const ladeZuschlagsoptionen = async", "const bindeZuschlag = async");
  assert.equal((laden.match(/if \(seq !== resSeq\.current\) return;/g) || []).length, 3,
    "nach dem Request, nach dem Lesen und im Fehlerpfad muss die Sequenz geprüft werden");
  assert.match(laden, /if \(!erneut && d\?\.code === "OFFER_PRICE_CONFLICT" && aktuell !== null && aktuell !== body\.offerRevision\) \{\s*ladeZuschlagsoptionen\(\{ revision: aktuell, verwerfeBindung, erneut: true \}\);/);
  assert.match(laden, /const optionen = readPriceInputOptions\(d, tariff\);\s*if \(!optionen\) \{ setzeZuschlagsfehler\(0, null\); return; \}/);
  assert.match(laden, /if \(!verwerfeBindung && optionen\.boundValue !== null\) \{\s*if \(tariffMatchesOptionsBinding\(tariff, optionen\)\) \{/);
  assert.match(laden, /bindeZuschlag\(optionen\.boundValue, optionen, \{ still: true \}\);/);
  assert.doesNotMatch(laden, /finalPrice|netPrice|\* |\+ tariff/, "beim Laden entsteht ein lokaler Preis");

  const neubindung = abschnitt(booking, "const forderNeubindung = ", "const waehleLieferadresse = ");
  assert.match(neubindung, /setResBoundValue\(null\);/);
  assert.match(neubindung, /setStep\(1\);/);
  assert.match(neubindung, /ladeZuschlagsoptionen\(\{ verwerfeBindung: true \}\);/);
});

test("W8 — Bindung: genau eine zur Zeit, Serverwerte ins Angebot und in die Liste, Absicherung zurückgesetzt", () => {
  const binden = abschnitt(booking, "const bindeZuschlag = async", "const forderNeubindung = ");
  assert.match(binden, /if \(resBinding\.current\) return;/);
  assert.match(binden, /resBinding\.current = true;/);
  assert.match(binden, /const body = bindRequestBody\(\{ tariff, options: optionen, value: wert \}\);/);
  assert.match(binden, /const bindung = readPriceInputBinding\(d, \{ tariff, value: wert \}\);/);
  assert.match(binden, /const neu = bindung \? tariffWithPriceInputBinding\(tariff, bindung\) : null;/);
  assert.match(binden, /setResOptions\(optionsAfterBinding\(optionen, bindung\)\);/);
  assert.match(binden, /if \(bindung\.insuranceReset \|\| bindung\.offerRevision !== vorherigerStand\) \{\s*setInsuranceType\("none"\);/);
  assert.match(binden, /if \(aktion === RESIDENTIAL_ACTION\.RELOAD\) \{\s*setResNotice\(RESIDENTIAL_TEXT\.reconfirm\);\s*ladeZuschlagsoptionen\(\{ revision: conflictRevisionOf\(d\) \?\? undefined, verwerfeBindung: true \}\);/);
  assert.match(binden, /uebernimmGebundenesAngebot\(neu\);/);
  assert.match(binden, /finally \{\s*if \(seq === resSeq\.current\) resBinding\.current = false;\s*\}/);
  assert.doesNotMatch(binden, /doBook\(|\/api\/jumingo\/book/, "die Bindung bucht");

  const uebernahme = abschnitt(booking, "const uebernimmGebundenesAngebot = ", "const setzeZuschlagsfehler = ");
  assert.match(uebernahme, /tariffs: replaceOffer\(flowShipment\.tariffs, neu\),/);
  assert.match(uebernahme, /sameOffer\(flowShipment\.selected, neu\) \? \{ selected: neu \} : \{\}/);
  assert.match(uebernahme, /navigate\(`\$\{location\.pathname\}\$\{location\.search\}`, \{ replace: true, state: \{ \.\.\.navState, tariff: neu \} \}\);/);
});

test("W9 — der Absicherungsstand gehört zu Angebot UND Preisstand", () => {
  assert.match(booking, /const insuranceOfferKey = insuranceRestoreKey\(bookingData\?\.tariff\);/);
  assert.match(restore, /return schluessel === null \? null : `\$\{schluessel\}:\$\{preisstand\(tariff\)\}`;/);
});

test("W10 — Angebotskarte: auswählbar über die eine Regel, Zuschlagshinweis aus dem Helfer", () => {
  assert.match(karte, /const unavailable = !offerSelectable\(t\);/);
  assert.match(karte, /const surchargeHint = offerSurchargeHint\(t\);/);
  assert.match(karte, /\{surchargeHint && <p className="offer-cta-hint offer-surcharge-hint">\{surchargeHint\}<\/p>\}/);
  assert.ok(karte.includes("const handleSelect = () => { if (!unavailable) onSelect(t); };"));
  assert.doesNotMatch(karte, /Bei einer privaten Lieferadresse/, "der Hinweis steht als Literal in der Karte");
});

test("W11 — die Auswahl: stabile Kennungen, dreiwertig, Texte nur aus dem Modul", () => {
  for (const id of ['id="residential-price-inputs"', 'id="residential-options-loading"', 'id="residential-options-error"',
                    'id="residential-options-retry"', 'id="residential-options-recalculate"', 'id="residential-options-shipments"']) {
    assert.ok(modul.includes(id), `Kennung fehlt: ${id}`);
  }
  assert.match(modul, /type="radio"\s+id=\{k\.id\}\s+name="residential-delivery"\s+checked=\{k\.checked === true\}\s+disabled=\{k\.disabled === true\}/);
  assert.doesNotMatch(modul, /Geschäftsadresse|Privatadresse|Zuschlag wird berechnet|Erneut versuchen|brutto|netto/,
    "ein Kundentext steht als Literal im Bauteil");
  assert.doesNotMatch(modul, /<Switch/);
});

test("W12 — Aufstellung und Erfolg: Bestandteile aus dem Price-View bzw. der Buchungsantwort", () => {
  assert.match(summe, /const bestandteile = priceSummaryComponents\(v\);/);
  assert.match(summe, /data-component=\{k\.type\}/);
  assert.match(summe, /Versand netto/, "die bisherige Zeile ohne Bestandteile fehlt");
  assert.match(erfolg, /components: bookingSuccessComponents\(booking, priceView\)/);
});

test("W13 — API: genau die Felder des Vertrags, über den einen Client", () => {
  assert.match(client, /export function loadPriceInputOptions\(\{ offerId, offerRevision \}, \{ signal \} = \{\}\) \{\s*return apiFetch\(`\/api\/offers\/price-input-options`, \{\s*method: "POST",\s*auth: true,\s*body: JSON\.stringify\(\{ offerId, offerRevision \}\),/);
  assert.match(client, /return apiFetch\(`\/api\/offers\/price-inputs`, \{\s*method: "POST",\s*auth: true,\s*body: JSON\.stringify\(\{ offerId, offerRevision, optionsId, deliveryIsResidential, expectedShippingGross \}\),/);
  assert.match(booking, /import \{ apiFetch, repriceInsurance, saveDraftPickupWindow, checkVoucher, loadPriceInputOptions, bindPriceInputs \} from "\.\.\/api\/client";/);
  assert.doesNotMatch(booking, /fetch\(`\/api\/offers/, "ein zweiter Weg zum Backend");
});

test("W14 — Gestaltung: Zahlen in der Zahlenschrift, keine Farbliterale, schmale Breiten stapeln", () => {
  const block = css.slice(css.indexOf("TG22 Residential: „Art der Lieferadresse"), css.indexOf(".res-notice"));
  assert.ok(block.length > 0, "der Stilblock fehlt");
  for (const klasse of [".res-card-price-val", ".res-card-price-sub"]) {
    const regel = css.slice(css.indexOf(`${klasse} {`), css.indexOf("}", css.indexOf(`${klasse} {`)));
    assert.match(regel, /font-family: var\(--ce-font-numeric\)/, klasse);
    assert.match(regel, /font-variant-numeric: tabular-nums/, klasse);
  }
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, "Farbliteral im Stilblock");
  assert.match(css, /@media \(max-width: 520px\) \{ \.res-cards \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
});
