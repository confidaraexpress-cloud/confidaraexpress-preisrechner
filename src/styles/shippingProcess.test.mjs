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
import { pruefeImTestlauf } from "../../scripts/governance.mjs";
import { readFileSync } from "node:fs";
import { buchungsFlaeche } from "../testing/quelltext.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const appJsx = read("../App.jsx");
const dashboardLayout = read("../components/layout/DashboardLayout.jsx");
const bookingPage = buchungsFlaeche();
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
  // Etwas rechteckiger + klarer abgehoben: Radius MD, Ruheschatten Elevation 2.
  // Beides Tokens — die Regel schreibt keinen freien Radius- oder Schattenwert.
  assert.match(regel[1], /var\(--ce-radius-md\)/);
  assert.match(regel[1], /var\(--ce-elevation-2\)/);
  assert.ok(!/border-radius:\s*\d/.test(regel[1]), "kein freier Radiuswert");
  assert.ok(!/box-shadow:(?!\s*var\()/.test(regel[1]), "kein freier Schattenwert");
  // Hover hebt NICHT die Tiefe an (Elevation 3 ist der Dialog-Overlay), sondern
  // die Kante — sonst gäbe es für den Hover keine freie Stufe mehr.
  const hover = offersCss.match(/\.offer-card:hover\s*\{([^}]*)\}/);
  assert.ok(hover, ".offer-card:hover muss definiert sein");
  assert.match(hover[1], /var\(--ce-elevation-2\)/);
  assert.match(hover[1], /var\(--ce-color-border-strong\)/);
  const ausgewaehlt = offersCss.match(/\.offer-card--selected\s*\{([^}]*)\}/);
  assert.ok(ausgewaehlt, ".offer-card--selected muss definiert sein");
  assert.match(ausgewaehlt[1], /var\(--ce-color-brand\)/, "ausgewählt trägt die Brand-Border");
  assert.match(ausgewaehlt[1], /var\(--ce-color-brand-soft\)/, "ausgewählt trägt Brand Soft als Fläche");
});

test("7b — die Angebotssektion ist auf Desktop begrenzt und zentriert, Mobile bleibt voll", () => {
  const sektion = offersCss.match(/\.offers-section\s*\{([^}]*)\}/);
  assert.ok(sektion, ".offers-section muss definiert sein");
  const breite = sektion[1].match(/max-width:\s*(\d+)px/);
  assert.ok(breite, "die Sektion braucht eine Breitenbegrenzung");
  const px = Number(breite[1]);
  assert.ok(px >= 1000 && px <= 1120, `unerwartete Breite ${px}px`);
  assert.match(sektion[1], /margin-inline:\s*auto/, "ohne Zentrierung klebt die Liste links");

  // Die Begrenzung sitzt auf der SEKTION — Ergebniskopf, Filterleiste und Karten
  // halten dieselbe Kante. Eine zweite max-width auf der Karte liefe dem zuwider.
  const karte = offersCss.match(/\.offer-card\s*\{([^}]*)\}/);
  assert.ok(!/max-width/.test(karte[1]), ".offer-card darf keine eigene Breite setzen");

  // Gemessene Wirkung: Karte = Sektion − 2px Rahmen − 56px .offers-body-Padding.
  const body = offersCss.match(/\.offers-body\s*\{([^}]*)\}/);
  assert.match(body[1], /padding:\s*20px 28px/, "die Rechnung oben hängt an diesem Innenabstand");
  assert.equal(px - 2 - 56, 1022, "Kartenbreite auf breiten Desktops");

  // Mobile: keine erzwungene Breite, keine waagerechte Scrollfläche auf der Karte.
  const mobil = offersCss.slice(offersCss.indexOf("@media (max-width: 767px)"));
  assert.ok(!/\.offers-section\s*\{[^}]*width:/.test(mobil),
    "unter 768px darf die Sektion keine feste Breite bekommen");
  assert.ok(!/\.offer-card\s*\{[^}]*overflow-x/.test(mobil));
});

test("7c — das Frühzeit-Hinweisfeld nutzt Foundation-Tokens und trägt sichtbaren Text", () => {
  const regel = offersCss.match(/\.offer-early-note\s*\{([^}]*)\}/);
  assert.ok(regel, ".offer-early-note muss definiert sein");
  for (const token of ["--ce-color-status-success-surface", "--ce-color-status-success-border",
                       "--ce-color-status-success-fg", "--ce-radius-sm"]) {
    assert.ok(regel[1].includes(token), `${token} fehlt — keine freien Werte erlaubt`);
  }
  assert.ok(!/#[0-9a-f]{3,8}/i.test(regel[1]), "kein Hexliteral");
  assert.ok(!/border-radius:\s*(999|9999|50%)/.test(regel[1]), "keine Pillenform");

  // Kleiner Statushinweis, kein Button: Label-Stufe, kein Schatten.
  assert.match(regel[1], /font-size:\s*12px/);
  assert.match(regel[1], /font-weight:\s*600/);
  assert.ok(!/box-shadow/.test(regel[1]), "ein Statushinweis trägt keine Tiefe");

  // Die frühere Inline-Färbung IN der Datumszeile ist zurückgenommen.
  assert.ok(!/\.offer-tl-time-early\s*\{/.test(offersCss),
    "die Inline-Hervorhebung darf nicht wieder in der Datumszeile stehen");

  const karte = read("../components/offers/OfferCard.jsx");
  assert.ok(!/offer-tl-time-early/.test(karte), "die Karte darf die Inline-Klasse nicht mehr setzen");
  // Die normale Hauptzeile trägt wieder ausschließlich das Datum.
  assert.match(karte, /\{end\.primary && <span className="offer-tl-primary">\{end\.primary\}<\/span>\}/);
  // Farbe ist nie der alleinige Träger: der Text steht vollständig im Feld.
  assert.match(karte, /\{earlyNote\}/);
  assert.match(karte, /offer-early-note-icon[\s\S]{0,120}aria-hidden="true"/,
    "das dekorative Icon muss vor Screenreadern verborgen sein");
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
  // Die Paketshop-Suche bleibt eingebunden — seit der Integration in die
  // Angebote über denselben kleinen Einstieg wie dort, statt über ein zweites,
  // andersartiges Suchformular an dieser Stelle.
  assert.match(dropoffModule, /ParcelShopFinderTrigger/, "die Paketshop-Suche bleibt eingebunden");
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

test("14 — der Erfolgsscreen zeigt Auftragsbestätigungs- und Rechnungsnummer über CopyableNumber", () => {
  // Nummernumstellung: sichtbare Vorgangsnummer ist CE-AB…, nicht mehr CE-BS….
  // Gelesen über den zentralen Helper (businessNumbers.mjs), der die verschachtelte
  // /book-Form (orderConfirmation.number) versteht — nicht mehr über einen direkten,
  // an eine einzelne Form gebundenen Feldzugriff.
  assert.match(bookingPage, /orderConfirmationNumberOf\(booking\)/);
  assert.match(bookingPage, /booking\.invoiceNumber/);
  assert.match(bookingPage, /<CopyableNumber/);
  assert.match(bookingPage, /NUMBER_LABELS\.orderConfirmation/);
  assert.match(bookingPage, /NUMBER_LABELS\.invoice/);
  assert.ok(!/booking\.businessOrderNumber/.test(bookingPage),
    "die interne Bestellnummer steht wieder auf dem Erfolgsbildschirm");
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

test("18 — die Paket-A-Governance-Dateien laufen weiterhin mit", () => {
  // Seit der Umstellung auf Auffindung ist „steht im Skript" kein taugliches
  // Maß mehr: `npm test` nennt keine Datei mehr einzeln, sondern durchsucht
  // src/ rekursiv. Geprüft wird deshalb die Konjunktion aus „das Skript sucht
  // wirklich" und „die Datei liegt im durchsuchten Bereich" — beides zusammen
  // heißt: sie läuft.
  for (const datei of [
    "src/styles/designTokens.test.mjs", "src/styles/interfacePrimitives.test.mjs",
    "src/styles/typography.test.mjs", "src/styles/interfacePatterns.test.mjs",
    "src/components/layout/appShellChrome.test.mjs",
  ]) {
    assert.ok(pruefeImTestlauf(datei), `${datei} muss weiterhin mitlaufen`);
  }
  assert.ok(pruefeImTestlauf("src/styles/shippingProcess.test.mjs"),
    "diese Datei muss selbst mitlaufen");
});

/* ══════════ 19 — Sticky-Verhalten der Buchungszusammenfassung ═════════════
   Fehlerbild: `.booking-livesum` war ab 861 px SELBST `position: sticky`. Da
   die klebende Fläche damit die KARTE war und kein deckender Träger, lief der
   Inhalt sichtbar durch ihre abgerundeten Ecken und durch den transparenten
   20-px-Außenabstand darunter (gemessen mit elementFromPoint: dort stand der
   Kartenkopf von „Ausgewähltes Angebot"). Zusätzlich belegte die 87 px hohe
   Karte diesen Platz dauerhaft im Sichtfeld.

   Die klebende Rolle trägt jetzt eine eigene, schmale Leiste mit drei Ebenen:
   Layer (klebt, ohne eigene Höhe) · Fill (deckt ab) · Summary (Kartenmaterial). */

test("19 — die große Zusammenfassung klebt nicht mehr", () => {
  const block = calculatorCss;
  const regel = block.match(/\.booking-livesum \{[^}]*\}/);
  assert.ok(regel, ".booking-livesum nicht gefunden");
  assert.ok(!/position:\s*sticky/.test(regel[0]), "die große Zusammenfassung ist wieder sticky");
  // Auch keine Sonderregel in einer Media Query darf sie erneut ankleben.
  for (const m of block.matchAll(/\.booking-livesum\s*\{([^}]*)\}/g)) {
    assert.ok(!/position:\s*(sticky|fixed)/.test(m[1]),
      "eine Regel klebt .booking-livesum erneut an");
  }
});

test("20 — die kompakte Leiste hat Layer, deckenden Träger und Karte", () => {
  const block = calculatorCss;
  const layer = block.match(/\.booking-sticky-layer \{([^}]*)\}/);
  assert.ok(layer, ".booking-sticky-layer fehlt");
  assert.match(layer[1], /position:\s*sticky/, "der Layer klebt nicht");
  // Ohne eigene Höhe: sonst verlöre die Seite dauerhaft vertikalen Platz UND
  // das Ein-/Ausblenden erzeugte einen Layoutsprung.
  assert.match(layer[1], /height:\s*0/, "der Layer belegt Platz im Fluss");
  assert.match(layer[1], /z-index:\s*var\(--ce-z-raised\)/, "der Layer nutzt keinen Ebenen-Token");

  // Der deckende Träger ist der Grund, warum nichts mehr durchscheint.
  const fill = block.match(/\.booking-sticky-fill \{([^}]*)\}/);
  assert.ok(fill, ".booking-sticky-fill fehlt");
  assert.match(fill[1], /background:\s*var\(--ce-app-bg-mid\)/, "der Träger ist nicht deckend eingefärbt");
  assert.match(fill[1], /padding:/, "der Träger rahmt die Karte nicht");

  const bar = block.match(/\.booking-sticky-summary \{([^}]*)\}/);
  assert.ok(bar, ".booking-sticky-summary fehlt");
  assert.match(bar[1], /background:\s*var\(--ce-color-surface\)/, "die Leiste nutzt kein Kartenmaterial");
  assert.match(bar[1], /border-radius:\s*var\(--ce-radius-/, "Radius nicht aus der Skala");
  assert.match(bar[1], /box-shadow:\s*var\(--ce-elevation-/, "Tiefe nicht aus der Skala");
  // Informationsleiste, keine zweite große Karte.
  assert.match(bar[1], /min-height:\s*58px/, "die Leiste hält die kompakte Höhe nicht");
});

test("21 — die Leiste fängt Klicks nur im eingeblendeten Zustand ab", () => {
  const block = calculatorCss;
  const layer = block.match(/\.booking-sticky-layer \{([^}]*)\}/)[1];
  const stuck = block.match(/\.booking-sticky-layer\.is-stuck \{([^}]*)\}/);
  assert.ok(stuck, "der eingeblendete Zustand fehlt");
  // Verborgen: der Inhalt darunter muss bedienbar bleiben.
  assert.match(layer, /pointer-events:\s*none/, "die verborgene Leiste fängt Klicks ab");
  // Eingeblendet: sie verdeckt Inhalt und muss ihn deshalb auch abschirmen —
  // sonst ließe sich ein unsichtbares Bedienelement blind anklicken.
  assert.match(stuck[1], /pointer-events:\s*auto/, "die sichtbare Leiste lässt Klicks durch");
  assert.match(stuck[1], /opacity:\s*1/, "der eingeblendete Zustand ist nicht sichtbar");
});

test("22 — Sichtbarkeit über IntersectionObserver, nicht über Scrollpositionen", () => {
  const quelle = read("../components/booking/BookingStickySummary.jsx");
  assert.match(quelle, /new IntersectionObserver/, "es wird kein IntersectionObserver verwendet");
  assert.ok(!/addEventListener\(\s*["']scroll["']/.test(quelle), "es hängt ein Scroll-Handler daran");
  assert.ok(!/window\.scrollY|pageYOffset/.test(quelle), "es wird eine Scrollposition ausgewertet");
  // Der Klebeabstand wird am echten Layout gemessen (mobile Topbar), nicht als
  // Pixelgrenze in den Code geschrieben.
  assert.match(quelle, /\.mobile-topbar/, "der Klebeabstand wird nicht am Layout gemessen");
  assert.match(quelle, /--booking-sticky-top/, "der gemessene Abstand wird nicht ans CSS zurückgegeben");
  assert.match(quelle, /addEventListener\("resize"/, "der Abstand wird beim Größenwechsel nicht neu bestimmt");
  // Reine Darstellung: kein Zustand, keine Buchungs- oder Preislogik.
  assert.ok(!/fetch\(|apiFetch|useState\(\s*\{/.test(quelle), "die Leiste enthält Logik statt reiner Darstellung");
});

test("23 — beide Zusammenfassungen leiten aus derselben Quelle ab", () => {
  const modul = read("../utils/bookingSummaryView.mjs");
  for (const fn of ["handoverInfo", "deliveryInfo", "priceInfo"]) {
    assert.match(modul, new RegExp(`export function ${fn}\\(`), `${fn} fehlt im gemeinsamen Modul`);
  }
  // Keine zweite Preisberechnung: das Modul wählt nur aus vorhandenen Feldern.
  assert.ok(!/[*/+-]\s*(vat|tax|0\.19|1\.19)/i.test(modul), "im Modul wird ein Preis gerechnet");
  assert.match(modul, /hasConfirmedPrice/, "die Preisregel stammt nicht aus dem View-Model");

  const kompakt = read("../components/booking/BookingStickySummary.jsx");
  assert.match(kompakt, /from "\.\.\/\.\.\/utils\/bookingSummaryView\.mjs"/,
    "die kompakte Leiste nutzt das gemeinsame Modul nicht");
  // Sie darf Preise nur formatieren, nie bilden.
  assert.ok(!/netPrice|vatAmount|grossPrice|\*\s*1\.19/.test(kompakt),
    "die kompakte Leiste greift auf Rohpreisfelder zu statt auf das View-Model");
});
