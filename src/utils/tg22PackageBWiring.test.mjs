// TG22 Paket B — Verdrahtung auf den Seiten (Quelltextanker auf kommentarfreiem Code).
//
// Die reinen Helfer prüft tg22PackageBCustomerParity.test.mjs, das gerenderte Verhalten
// tests/e2e/tg22PackageBParity.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// CRLF-Checkouts (Windows) auf LF bringen — die Anker unten enthalten Zeilenumbrüche.
const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// Reihenfolge ist tragend: ganze Zeilenkommentare ZUERST. Ein Zeilenkommentar wie
// „(Seite + components/booking/*)" enthielte sonst ein „/*", das die Blockentfernung bis zum
// nächsten „*/" weiterlaufen ließe — und Code dazwischen verschluckte.
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (p) => ohneKommentare(lies(p));

const booking   = code("../pages/BookingPage.jsx");
const optionen  = code("../components/booking/AdditionalOptionsModule.jsx");
const aktion    = code("../components/booking/BookingActionModule.jsx");
const erfolg    = code("../components/booking/BookingSuccessStep.jsx");
const neu       = code("../pages/NewShipmentPage.jsx");
const liste     = code("../components/dashboard/ShipmentsList.jsx");
const tracking  = code("../pages/TrackingPage.jsx");
const karte     = code("../components/offers/OfferCard.jsx");

const abschnitt = (quelle, von, bis) => {
  const a = quelle.indexOf(von);
  assert.ok(a >= 0, `Anker fehlt: ${von}`);
  const b = quelle.indexOf(bis, a + von.length);
  assert.ok(b > a, `Endanker fehlt: ${bis}`);
  return quelle.slice(a, b);
};

/* ══════════ 1 — Labelformat ══════════ */

test("1 — die Auswahl hängt an den Optionen des Angebots; ohne sie höchstens der Lieferhinweis", () => {
  assert.match(optionen, /Array\.isArray\(labelFormatOptions\)\s*\?\s*LABEL_FORMATS\.filter\(f => labelFormatOptions\.includes\(f\.id\)\)/);
  assert.match(optionen, /\{wahlformate\.length > 0 \? \(/);
  assert.match(optionen, /id="booking-label-delivery-info"/);
  assert.match(optionen, /wahlformate\.map\(f =>/);
  assert.match(booking, /labelFormatOptions=\{labelFormatOptions\}/);
  assert.match(booking, /labelDeliveryInfo=\{labelInfo\}/);
  assert.match(booking, /const labelFormatOptions = labelFormatOptionsOf\(tariff\);/);
});

test("2 — /book sendet labelFormat nur über den Angebotshelfer; Wiederherstellung nur bei Unterstützung", () => {
  const body = abschnitt(booking, "const r = await apiFetch(`/api/jumingo/book`", "let d = null;");
  assert.match(body, /\.\.\.labelFormatBookPayload\(tariff, labelFormat\),/);
  assert.doesNotMatch(body, /^\s*labelFormat,\s*$/m, "labelFormat wird wieder bedingungslos gesendet");
  assert.match(booking, /useState\(\(\) => restoredLabelFormat\(bookingData\?\.tariff, flowBooking\?\.labelFormat\)\)/);
  // Ein Entwurf speichert eine aktive Formatwahl nur, wenn das Angebot überhaupt eine Auswahl hat.
  const speichern = abschnitt(booking, "bookingOptions={buildDraftBookingOptions({", "})}");
  assert.match(speichern, /labelFormatEnabled: labelFormatOptions\.length > 0 && labelFormatEnabled/);
});

/* ══════════ 2 — Absicherung und Neubepreisung ══════════ */

test("3 — Schritt und Absicherung starten aus dem angebotsgebundenen Startzustand", () => {
  assert.match(booking, /startzustandRef\.current = restoredInsuranceState\(flowBooking, bookingData\?\.tariff\);/);
  for (const re of [
    /const \[step, setStep\] = useState\(\(\) => startzustand\.step\);/,
    /useState\(\(\) => startzustand\.insuranceType\)/,
    /useState\(startzustand\.insuranceValue\)/,
    /useState\(\(\) => startzustand\.goodsAreNew\)/,
    /useState\(\(\) => startzustand\.goodsAreFragile\)/,
    /useState\(startzustand\.insValueManual\)/,
  ]) assert.match(booking, re);
  // Kein Rückfall auf den ungebundenen Vorgangswert.
  assert.doesNotMatch(booking, /flowBooking\?\.(insuranceType|insuranceValue|goodsAreNew|goodsAreFragile|insValueManual|step)\b/);
});

test("4 — der Spiegel trägt den Angebotsschlüssel", () => {
  const eff = abschnitt(booking, "setFlowBooking({", "const tariff = bookingData");
  assert.match(eff, /goodsAreNew, goodsAreFragile,\s*insuranceOfferKey,/);
  assert.match(eff, /goodsAreNew, goodsAreFragile, insuranceOfferKey,\s*trackingEmailEnabled/);
  assert.match(booking, /const insuranceOfferKey = offerKey\(bookingData\?\.tariff\);/);
});

test("5 — Race: jede Änderung zählt die Sequenz hoch und bricht ab, bevor irgendetwas anderes passiert", () => {
  const eff = abschnitt(booking, "useEffect(() => {\n    repriceSeq.current++;", "}, [insuranceType, goodsValue, insuranceValue, goodsAreNew, goodsAreFragile]);");
  const seq = eff.indexOf("repriceSeq.current++");
  const abbruch = eff.indexOf("repriceAbort.current.abort()");
  const none = eff.indexOf('if (insuranceType === "none")');
  const debounce = eff.indexOf("setTimeout(() => runReprice(");
  assert.ok(seq >= 0 && abbruch > seq && none > abbruch && debounce > none, "Reihenfolge Sequenz → Abbruch → Zweige → Debounce");
  const lauf = abschnitt(booking, "const runReprice = async", "useEffect(() => {\n    repriceSeq.current++;");
  assert.equal((lauf.match(/if \(seq !== repriceSeq\.current\) return;/g) || []).length, 3,
    "nach dem Request, nach dem Lesen und im Fehlerpfad muss die Sequenz geprüft werden");
  const erfolgIdx = lauf.indexOf("setRepriceResult(d); setRepriceStale(false);");
  assert.ok(erfolgIdx > lauf.lastIndexOf("if (seq !== repriceSeq.current) return;", erfolgIdx),
    "nur die aktuelle Antwort darf den Preis bestätigen");
});

test("6 — OFFER_ALREADY_USED bei der Neubepreisung ersetzt den Bestellknopf", () => {
  const lauf = abschnitt(booking, "const runReprice = async", "useEffect(() => {\n    repriceSeq.current++;");
  assert.match(lauf, /if \(d\?\.code === "OFFER_ALREADY_USED"\) \{\s*setRepriceError\(OFFER_ALREADY_USED_TEXT\);\s*setConflict\(OFFER_ALREADY_USED_TEXT\);/);
  const annahme = abschnitt(booking, "const acceptInsuredPriceChange = async", "const continueWithNewPrice");
  assert.match(annahme, /if \(d\?\.code === "OFFER_ALREADY_USED"\) \{\s*setPriceChange\(null\);\s*setConflict\(OFFER_ALREADY_USED_TEXT\);/);
});

test("7 — versicherter 409 ohne Code löst die bestehende Neubepreisung aus, nie eine Buchung", () => {
  const zweig = abschnitt(booking, "if (isInsured) {\n          setRepriceResult(null); setRepriceStale(true);", "setConflict(asStr(d?.error)");
  assert.match(zweig, /runReprice\(insuranceType, goodsValueNum, insuranceValueNum, contentDescription\)/);
  assert.doesNotMatch(zweig, /doBook\(/);
});

/* ══════════ 3 — Buchungsfehler ══════════ */

test("8 — 400/422: Profil, Neuberechnung und Referenzfeld stehen vor den Feld-, Zoll- und Adresszweigen", () => {
  const zweig = abschnitt(booking, "if (r.status === 400 || r.status === 422) {", "setAddressError(");
  const profil = zweig.indexOf('d?.code === "BUSINESS_PROFILE_INCOMPLETE"');
  const neuberechnen = zweig.indexOf("fordertNeuberechnung(d)");
  const referenz = zweig.indexOf('d?.code === "INVALID_REFERENCE_NUMBER"');
  const email = zweig.indexOf('d?.field === "trackingEmail"');
  assert.ok(profil >= 0 && neuberechnen > profil && referenz > neuberechnen && email > referenz);
  assert.match(zweig, /setProfileHint\(normalizeApiError\(\{ status: r\.status, body: d \}\)\.message\);/);
  assert.match(zweig, /setReferenceError\(REFERENCE_INVALID_TEXT\);\s*setStep\(1\);/);
  assert.match(zweig, /setRecalcNotice\(mapBookRestError\(r\.status, d\)\.message\);/);
});

test("9 — Profilhinweis: eigene Fläche mit Weg ins Profil, keine Abmeldung", () => {
  assert.match(aktion, /\{profileHint && \(/);
  assert.match(aktion, /onClick=\{onNavigateProfile\}/);
  assert.match(aktion, /Unternehmensprofil vervollständigen/);
  assert.match(booking, /profileHint=\{profileHint\}/);
  assert.match(booking, /onNavigateProfile=\{\(\) => navigate\(PROFILE_DASHBOARD_TARGET\)\}/);
  assert.doesNotMatch(booking + aktion, /logout\(|removeItem\("ce_token"\)/);
});

test("10 — die Referenzeingabe wird bereinigt, der Feldfehler steht am Feld", () => {
  assert.match(booking, /const updReference = \(v\) => \{ setReferenceError\(""\); upd\("reference", sanitizeReferenceInput\(v\)\); \};/);
  assert.match(booking, /referenceError=\{referenceError\}/);
  assert.match(optionen, /aria-describedby=\{referenceError \? "booking-reference-error" : undefined\}/);
  assert.match(optionen, /id="booking-reference-error"/);
});

/* ══════════ 4 — Erfolgsbetrag ══════════ */

test("11 — der Erfolgsbildschirm zeigt ausschließlich den gebuchten Betrag", () => {
  assert.match(erfolg, /const betrag = bookingSuccessAmountView\(booking, priceView\);/);
  assert.match(erfolg, /betrag\.showBreakdown \? \(\s*<PriceSummaryModule priceView=\{\{ \.\.\.priceView, totalGross: betrag\.totalGross \}\}/);
  assert.match(erfolg, /Gesamtbetrag brutto<\/span>\s*<span className="booking-total-amount">\{money\(betrag\.totalGross\)\}/);
  assert.match(erfolg, /id="booking-success-amount-hint">\{betrag\.hint\}/);
  assert.doesNotMatch(erfolg, /<PriceSummaryModule priceView=\{priceView\}/, "die ungeprüfte Aufstellung steht wieder da");
});

/* ══════════ 5 — Entwurfsdatum ══════════ */

test("12 — ein fortgesetzter Entwurf bekommt kein Ersatzdatum; ohne Datum keine Berechnung", () => {
  assert.equal((neu.match(/buildResumeInitialState\([^)]*\{ today: businessTodayISO\(\) \}\)/g) || []).length, 3);
  assert.doesNotMatch(neu, /buildResumeInitialState\([^)]*todayISO\(\)/);
  assert.doesNotMatch(neu, /init\.shippingDate \|\| todayISO\(\)/);
  assert.match(neu, /resumeInit \? \(resumeInit\.shippingDate \|\| null\)/);
  assert.match(neu, /disabled=\{loading \|\| !calcValid \|\| saving \|\| addressBlocksCalculation \|\| datumFehlt\}/);
  const berechnen = abschnitt(neu, "const calculate = async", "const reloadFormDraft");
  assert.ok(berechnen.indexOf("if (!shippingDate) {") < berechnen.indexOf("setHasResults(false); setTariffs([]);"));
  assert.match(neu, /resumeInit && resumeInit\.shippingDateExpired \? RESUME_PAST_DATE_NOTICE : ""/);
});

test("13 — Preisberechnung: 422 BUSINESS_PROFILE_INCOMPLETE mit Profilweg, ohne Abmeldung", () => {
  assert.match(neu, /setProfileIncomplete\(norm\.code === "BUSINESS_PROFILE_INCOMPLETE"\);/);
  assert.match(neu, /onClick=\{\(\) => navigate\(PROFILE_DASHBOARD_TARGET\)\}/);
  // Der echte Auth-Fall bleibt, wie er war.
  assert.match(neu, /if \(r\.status === 401 \|\| r\.status === 403\) \{ setLoading\(false\); return; \}/);
});

/* ══════════ 6 — Tracking ══════════ */

test("14 — dieselbe Trackingansicht in Tabelle und Mobilkarte, mit Antwortschutz und aria-expanded", () => {
  assert.match(liste, /function ShipmentTrackingDetail\(\{ tracking, loading, onRefresh \}\)/);
  assert.equal((liste.match(/<ShipmentTrackingDetail /g) || []).length, 2);
  assert.match(liste, /className="shipment-card-tracking"/);
  assert.match(liste, /aria-expanded=\{expanded === true\}/);
  assert.equal((liste.match(/expanded=\{trackingId === s\.id\}/g) || []).length, 2);
  assert.match(liste, /const aktuell = \(\) => mountedRef\.current && anfrage === trackRequest\.current;/);
  const abruf = abschnitt(liste, "const fetchTracking = async", "const loadTracking");
  assert.ok(abruf.indexOf("if (!aktuell()) return;") < abruf.indexOf("setTracking(res);"));
});

test("15 — öffentliche Trackingseite: der Knopf übergibt kein Klickereignis als Nummer", () => {
  assert.match(tracking, /onClick=\{\(\) => track\(\)\}/);
  assert.doesNotMatch(tracking, /onClick=\{track\}/);
});

test("16 — date_unavailable: Hinweis unter dem CTA, der Grund steht weiter nur im Knopf", () => {
  assert.match(karte, /const unavailableHint = offerBlockedHint\(t\);/);
  assert.match(karte, /\{unavailableHint && <p className="offer-cta-hint">\{unavailableHint\}<\/p>\}/);
});

/* ══════════ 7 — Responsive ══════════ */

test("17 — Umbruch statt Überlauf: Preisdialog, Absicherungsfragen, Erfolg, Mobiltracking", () => {
  const calculator = lies("../styles/calculator.css");
  const responsive = lies("../styles/responsive.css");
  const dashboard  = lies("../styles/dashboard.css");
  assert.match(calculator, /\.price-drift-actions \{ display: flex; flex-wrap: wrap; gap: 12px; \}/);
  assert.match(calculator, /\.booking-success-delivery p \{ overflow-wrap: anywhere; \}/);
  assert.match(calculator, /\.booking-success-wrap \.btn-full \{ white-space: normal; overflow-wrap: anywhere; \}/);
  assert.match(responsive, /\.ins-goods-question \.ci-mode-option \{ min-height: 44px; align-items: center; \}/);
  assert.match(dashboard, /\.track-info \{ flex: 1; min-width: 0; padding-top: 4px; overflow-wrap: anywhere; \}/);
  assert.match(dashboard, /\.shipment-card-tracking \{[^}]*padding:/);
  // Die Grundregel für Buttons bleibt unangetastet.
  assert.match(lies("../styles/buttons.css"), /white-space: nowrap;/);
});
