// Governance für Paket B — Premium-Versandprozess.
//
// Geprüft wird die Migration von Preisrechner, Angebotsvergleich, Neue
// Sendung und Buchung auf die Paket-A-Primitives/-Muster — UND, mindestens
// ebenso wichtig, dass dabei keine Business-, API- oder Routingverträge
// angefasst wurden: JUMiNGO-Payloads, Preis-/Abholfensterkonflikte,
// Dropoff-Guardrail und Geschäftsnummern bleiben wörtlich nachweisbar
// unverändert. Reine Quelltextprüfung (kein DOM) — die Laufzeitseite
// (App-Shell-Rendering, Überlauf, Tastaturbedienung) prüft
// tests/e2e/shippingProcessPaketB.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const appJsx = read("../App.jsx");
const dashboardLayout = read("../components/layout/DashboardLayout.jsx");
const bookingPage = read("../pages/BookingPage.jsx");
const calculatorPage = read("../pages/CalculatorPage.jsx");
const newShipmentPage = read("../pages/NewShipmentPage.jsx");
const dropoffModule = read("../components/booking/DropoffNoticeModule.jsx");
const offerCard = read("../components/offers/OfferCard.jsx");
const calculatorCss = stripComments(read("./calculator.css"));
const offersCss = stripComments(read("./offers.css"));
const dashboardCss = stripComments(read("./dashboard.css"));

/* ══════════ 1/2 — App-Shell statt NavbarLayout ═══════════════════════════ */

test("1 — die eingeloggte Buchung läuft in der App-Shell (DashboardLayout)", () => {
  const shellGroup = appJsx.match(
    /<Route element=\{<ProtectedRoute><DashboardLayout \/><\/ProtectedRoute>\}>([\s\S]*?)<\/Route>/
  );
  assert.ok(shellGroup, "die App-Shell-Routengruppe muss auffindbar sein");
  assert.match(shellGroup[1], /path="\/calculator"/, "Preisrechner bleibt in der App-Shell-Gruppe");
  assert.match(shellGroup[1], /path="\/booking"/, "Buchung muss in derselben App-Shell-Gruppe wie Preisrechner stehen");
});

test("2 — kein öffentliches NavbarLayout im eingeloggten Buchungsprozess", () => {
  const navbarGroup = appJsx.match(/<Route element=\{<NavbarLayout \/>\}>([\s\S]*?)<\/Route>/);
  assert.ok(navbarGroup, "die öffentliche NavbarLayout-Gruppe muss auffindbar sein");
  assert.ok(!/path="\/booking"/.test(navbarGroup[1]), "/booking darf nicht mehr unter NavbarLayout stehen");
  // DashboardLayout selbst rendert die App-Shell, nicht die öffentliche Navbar.
  assert.ok(!/<Navbar\s*\/>/.test(dashboardLayout), "DashboardLayout darf die öffentliche Navbar nicht rendern");
  assert.match(dashboardLayout, /className="app-shell"/);
});

/* ══════════ 3/4/5 — keine Glow-Schatten, kein backdrop-filter, keine
   Legacy-Blau-Vollflächen im Versandprozess ════════════════════════════════ */

test("3 — keine farbigen Glow-Schatten mehr im Versandprozess", () => {
  // Die früheren, namentlich dokumentierten Glow-Stellen: Filter-Trigger,
  // Mega-CTA, Auswahlkarten (Versicherung/Label/Angebot), Schrittkreis,
  // Slider-Griffe. Keine davon darf einen farbigen (rgba mit Alpha) Schatten
  // tragen — nur die Foundation-Elevationen oder gar keiner.
  const VERDÄCHTIG = [
    /\.offers-calc-cta \.btn-primary[^{]*\{[^}]*box-shadow:\s*[^;]*rgba/,
    /\.step-circle\.active\s*\{[^}]*box-shadow:\s*[^;]*rgba/,
    /\.step-circle\.done\s*\{[^}]*box-shadow:\s*[^;]*rgba/,
    /\.ins-card--selected\s*\{[^}]*box-shadow:\s*[^;]*rgba/,
    /\.labelfmt-card--selected\s*\{[^}]*box-shadow:\s*[^;]*rgba/,
    /\.offer-card--selected\s*\{[^}]*box-shadow:\s*[^;]*rgba/,
    /\.offer-card:hover\s*\{[^}]*box-shadow:\s*[^;]*rgba\(29,\s*78,\s*216/,
    /\.pw-range:hover::-webkit-slider-thumb\s*\{[^}]*(scale|rgba\(29,\s*78,\s*216)/,
  ];
  for (const muster of VERDÄCHTIG) {
    assert.ok(!muster.test(calculatorCss) && !muster.test(offersCss),
      `Glow-Muster wieder aufgetaucht: ${muster}`);
  }
});

test("4 — kein backdrop-filter im Versandprozess", () => {
  const aktiv = /backdrop-filter:\s*(?!none)[a-z]/i;
  assert.ok(!aktiv.test(calculatorCss), "calculator.css darf keinen aktiven backdrop-filter mehr enthalten");
  assert.ok(!aktiv.test(offersCss), "offers.css darf keinen aktiven backdrop-filter enthalten");
});

test("5 — keine großflächige Navy-zu-Blau-Ergebnisleiste/Bestätigungskopf mehr", () => {
  assert.ok(!/\.offers-result-header\s*\{[^}]*linear-gradient/.test(offersCss),
    "der Angebots-Ergebniskopf darf keinen Verlauf mehr tragen");
  assert.ok(!/\.calc-panel-header\.booking-confirm-header\s*\{[^}]*linear-gradient/.test(calculatorCss),
    "der Bestätigungskopf in Schritt 2 darf keinen Navy-zu-Blau-Verlauf mehr tragen");
  assert.ok(!/booking-confirm-panel\.calc-panel\s*\{[^}]*border:\s*2px solid var\(--blue\)/.test(calculatorCss),
    "kein spezieller blauer Rahmen mehr um das Bestätigungspanel");
});

/* ══════════ 6/7 — Preisrechner/Angebote auf den Primitives ═══════════════ */

test("6 — der Preisrechner nutzt die globale Primary Large statt eines eigenen Mega-CTA", () => {
  assert.match(calculatorPage, /className="btn btn-primary btn-lg btn-full"/,
    "die Preisrechner-CTA muss die globale Primary Large sein");
  assert.match(newShipmentPage, /className="btn btn-primary btn-lg dft-cta-primary"/,
    "die Neue-Sendung-CTA muss ebenfalls die globale Primary Large sein");
  // Kein eigenes Höhen-/Farbverlauf-Rezept mehr für den CTA.
  assert.ok(!/\.offers-calc-cta \.btn-primary\s*\{[^}]*background:\s*linear-gradient/.test(calculatorCss),
    "der CTA darf keine eigene Verlaufsfläche mehr setzen");
});

test("7 — Angebotskarten sind auf Interactive-Card-Tokens umgestellt", () => {
  const karte = calculatorCss.match(/\.offer-card\s*\{([^}]*)\}/) || offersCss.match(/\.offer-card\s*\{([^}]*)\}/);
  const regel = offersCss.match(/\.offer-card\s*\{([^}]*)\}/);
  assert.ok(regel, ".offer-card muss in offers.css definiert sein");
  assert.match(regel[1], /var\(--ce-color-border-default\)/);
  assert.match(regel[1], /var\(--ce-radius-lg\)/);
  assert.match(regel[1], /var\(--ce-elevation-1\)/);
  const ausgewaehlt = offersCss.match(/\.offer-card--selected\s*\{([^}]*)\}/);
  assert.ok(ausgewaehlt, ".offer-card--selected muss definiert sein");
  assert.match(ausgewaehlt[1], /var\(--ce-color-brand\)/, "ausgewählt trägt die Brand-Border");
  assert.match(ausgewaehlt[1], /var\(--ce-color-brand-soft\)/, "ausgewählt trägt Brand Soft als Fläche");
});

/* ══════════ 8 — Badge-Logik: „Günstigste" nie auf nicht verfügbarem Angebot ═ */

test("8 — 'Günstigste'/'Schnellste' werden nie einem nicht verfügbaren Angebot zugewiesen", async () => {
  const { assignBadges } = await import("../utils/offerBadges.js");
  const tariffs = [
    { id: "teuer-verfuegbar", netPrice: 20, transitDaysMax: 3, transitDaysMin: 2, availableForDate: true },
    { id: "billig-NICHT-verfuegbar", netPrice: 5, transitDaysMax: 1, transitDaysMin: 1, availableForDate: false },
    { id: "mittel-verfuegbar", netPrice: 12, transitDaysMax: 4, transitDaysMin: 3, availableForDate: true },
  ];
  const badges = assignBadges(tariffs);
  assert.ok(!badges.has("billig-NICHT-verfuegbar"),
    "ein nicht verfügbares Angebot darf auch dann kein Badge tragen, wenn es objektiv am günstigsten/schnellsten wäre");
  assert.equal(badges.get("mittel-verfuegbar")?.key, "cheapest", "das günstigste VERFÜGBARE Angebot trägt das Badge");
  assert.equal(badges.get("teuer-verfuegbar")?.key, "fastest", "das schnellste VERFÜGBARE Angebot trägt das Badge");

  // Randfall: ist überhaupt nichts verfügbar, gibt es auch kein Badge.
  const alleGesperrt = assignBadges([
    { id: "a", netPrice: 1, availableForDate: false },
    { id: "b", netPrice: 2, availableForDate: false },
  ]);
  assert.equal(alleGesperrt.size, 0, "ohne ein einziges verfügbares Angebot darf kein Badge vergeben werden");
});

test("8b — die Angebotskarte zeigt einen verständlichen Grund statt eines Rohwerts", () => {
  assert.match(offerCard, /Nicht verfügbar für dieses Datum/);
  assert.ok(!/\{t\.unavailableReason\}/.test(offerCard) && !/\{tariff\.reason\}/.test(offerCard),
    "kein roher Backend-Grund darf direkt gerendert werden");
});

/* ══════════ 9 — Dropoff-Guardrail unverändert ═════════════════════════════ */

test("9 — die Dropoff-Guardrail-Formulierung ist unverändert erhalten", () => {
  // Wortwahl, die eine verbindliche Buchung am Paketshop suggerieren würde,
  // darf nicht auftauchen; die bestehende, bewusst zurückhaltende Formulierung
  // ("Orientierung", "nicht erforderlich") muss bestehen bleiben.
  assert.match(dropoffModule, /Diese Sendung wird nicht abgeholt/);
  assert.match(dropoffModule, /AccessPointFinder/, "die Paketshop-Suche bleibt eingebunden");
  assert.ok(!/verbindlich(e|er)? Buchung.*Paketshop/i.test(dropoffModule),
    "kein Text darf eine verbindliche Buchung am Paketshop behaupten");
});

/* ══════════ 10/11 — Pickup-/Dropoff-Payload & JUMiNGO-Felder unverändert ══ */

test("10 — der /book-Payload trägt weiterhin dieselben Absender-/Empfänger-/Paketfelder", () => {
  const bookCall = bookingPage.match(/apiFetch\(`\/api\/jumingo\/book`,\s*\{([\s\S]*?)\n\s{6}\}\);/);
  assert.ok(bookCall, "der /book-Aufruf muss unverändert auffindbar sein");
  const body = bookCall[1];
  for (const feld of [
    "sender:", "recipient:", "weight:", "content:", "referenceNumber:", "labelFormat,",
    "shipmentId:", "tariffId:", "shipperTariffId:", "price_final:",
    "...insurancePayload", "...customsPayload",
  ]) {
    assert.ok(body.includes(feld), `/book-Payload fehlt erwartetes Feld: ${feld}`);
  }
  // insuranceSelection/customsData werden separat aufgebaut und hier eingemischt
  // (...insurancePayload/...customsPayload) — die Schlüssel selbst müssen im
  // Aufbau der beiden Payload-Objekte weiterhin vorkommen.
  assert.match(bookingPage, /insuranceSelection:\s*\{/);
  assert.match(bookingPage, /customsData:\s*\{/);
});

test("11 — JUMiNGO-Endpunkte sind unverändert", () => {
  assert.match(bookingPage, /apiFetch\(`\/api\/jumingo\/book`/);
  assert.match(calculatorPage, /apiFetch\(`\/api\/jumingo\/calculate-price`/);
  assert.match(newShipmentPage, /apiFetch\(`\/api\/jumingo\/calculate-price`/);
  const client = read("../api/client.js");
  assert.match(client, /`\/api\/jumingo\/draft\/pickup-window/);
  assert.match(client, /`\/api\/jumingo\/reprice-insurance`/);
  assert.match(client, /`\/api\/jumingo\/access-points-search`/);
});

/* ══════════ 12/13 — Konfliktdialoge funktional unverändert ═══════════════ */

test("12 — der Preisänderungsdialog (PRICE_CHANGED) ist funktional unverändert", () => {
  assert.match(bookingPage, /d\?\.code === "PRICE_CHANGED"/);
  assert.match(bookingPage, /const continueWithNewPrice = /);
  assert.match(bookingPage, /const handlePriceChangeRecalculate = /);
  assert.match(bookingPage, /confirmedFinalPriceRef\.current = np;/);
  // Migriert: Fokusfalle über den gemeinsamen Hook, aber dieselbe Konflikterkennung.
  assert.match(bookingPage, /useDialog\(\{ open: !!priceChange, onClose: \(\) => setPriceChange\(null\) \}\)/);
});

test("13 — der Abholfensterkonflikt (PICKUP_WINDOW_CHANGED) ist funktional unverändert", () => {
  assert.match(bookingPage, /d\?\.code === "PICKUP_WINDOW_CHANGED"/);
  assert.match(bookingPage, /const acceptNewPickupWindow = /);
  assert.match(bookingPage, /const handlePickupWindowRecalculate = /);
  assert.match(bookingPage, /saveDraftPickupWindow\(\{ shipmentId: sid, pickupTimeFrom: null, pickupTimeUntil: null \}\)/);
});

/* ══════════ 14 — Buchungserfolg zeigt dieselben Geschäftsnummern ═════════ */

test("14 — der Erfolgsscreen zeigt weiterhin Bestellnummer und Rechnungsnummer über CopyableNumber", () => {
  assert.match(bookingPage, /booking\.businessOrderNumber/);
  assert.match(bookingPage, /booking\.invoiceNumber/);
  assert.match(bookingPage, /<CopyableNumber/);
  assert.match(bookingPage, /NUMBER_LABELS\.businessOrder/);
  assert.match(bookingPage, /NUMBER_LABELS\.invoice/);
});

/* ══════════ 15 — kein Routing-, API- oder Backendvertrag geändert ════════ */

test("15 — Routen und API-Helfer sind unverändert", () => {
  assert.match(appJsx, /path="\/booking"/);
  assert.match(appJsx, /path="\/calculator"/);
  assert.match(appJsx, /path="\/dashboard"/);
  // api/client.js-Helfer unangetastet.
  const client = read("../api/client.js");
  assert.match(client, /export const API = import\.meta\.env\.VITE_API_URL;/);
  assert.match(client, /export const token = \(\)/);
});

/* ══════════ 17 — Tastaturbedienung der Auswahlkarten ══════════════════════ */

test("17 — Auswahlkarten bleiben echte <input type=\"radio\">, keine unechten Div-Radios", () => {
  const insuranceModule = read("../components/booking/InsuranceModule.jsx");
  const additionalOptions = read("../components/booking/AdditionalOptionsModule.jsx");
  for (const [datei, quelle] of [["InsuranceModule.jsx", insuranceModule], ["AdditionalOptionsModule.jsx", additionalOptions]]) {
    assert.match(quelle, /<input\s+type="radio"/, `${datei} muss ein echtes Radio-Input verwenden`);
  }
  // Keine der Auswahlkarten-Klassen darf stattdessen per bloßem onClick auf
  // einem <div> "ausgewählt" simulieren.
  assert.ok(!/<div[^>]*className="ins-card[^"]*"[^>]*onClick/.test(insuranceModule),
    "die Versicherungskarte darf keine Div-Click-Auswahl ohne echtes Input sein");
});

/* ══════════ 18 — bestehende Paket-A-Governance bleibt eingebunden ════════ */

test("18 — die Paket-A-Governance-Dateien sind weiterhin im Testlauf verdrahtet", () => {
  const pkg = read("../../package.json");
  for (const datei of [
    "designTokens.test.mjs", "interfacePrimitives.test.mjs", "typography.test.mjs",
    "interfacePatterns.test.mjs", "appShellChrome.test.mjs",
  ]) {
    assert.ok(pkg.includes(datei), `${datei} muss weiterhin im npm-test-Skript stehen`);
  }
  assert.ok(pkg.includes("shippingProcess.test.mjs"), "diese Datei muss sich selbst im Testlauf eintragen");
});
