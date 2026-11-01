// Struktur- und Gestaltungstests der Inhaltsabschnitte der Kundenübersicht
// (Redesign 2026-10).
//
// Bewusst quelltextnah, wie overviewKpiCards.test.mjs: das Repository hat kein
// jsdom und keine Renderbibliothek.
//
// Freigegebener Vertrag (Audit G/H01, Feinkorrektur 2026-10): Die Übersicht
// ist eine Arbeitsübersicht — Seitenkopf mit persönlicher Begrüßung „Guten
// Tag, [Name]", Datum/Einordnung und EINER Hauptaktion, Kennzahlenband,
// letzte Sendungen (mit Empfänger) und offene Rechnungen (≈ 2 : 1), Lager und
// Aufträge neben vorhandenen Meldungen, darunter „Ihre Versanddienstleister“.
//
// Komplettabschluss (Betreiberentscheidungen G1/G2, Audit B.4/B.5/B.10,
// 2026-10-27): die feste Navy-Werbefläche „Fünf Carrier. Eine zentrale
// Plattform.“ mit Laufzeiten ohne Beleg ist durch die Carrier aus
// GET /kunde/carriers ersetzt (keine feste Liste) — seit der UX-Korrektur C
// (Betreiberentscheidung 2026-10-27) wieder auf einer Navy-Fläche mit feinen
// Linien, ohne erfundene Angaben; „Lager und Aufträge“ zeigt
// den Stand des eigenen Lagers; die Onboarding-Abschnitte („Ablauf“ und die
// Funktionen Versand und Logistik) stehen ausschließlich für Konten OHNE
// operative Daten, als ruhiger Text ohne Symbole — die Zusicherungen ohne
// Beleg sind entfallen. Alle Daten lädt DashboardPage; Übersicht und Module
// laden nichts selbst.
//
// Geprüft wird weiterhin, was bei einer Umgestaltung tatsächlich kaputtgehen
// kann: Inhalte gehen verloren, die Vergleichsaktion verliert ihr Ziel, die
// Sichtbarkeitsregel der Onboardingtexte kippt, Daten/Routing ändern sich.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const overview = src("./Overview.jsx");
const code = stripComments(overview);
const modules = stripComments(src("./OverviewModules.jsx"));
const css = src("../../styles/overview.css");
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Rumpf der ERSTEN Regel mit exakt diesem Selektor.
function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = cssBare.match(new RegExp(`(?:^|[};{])\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  return m ? m[1] : null;
}
// Die Einträge eines Datenarrays aus Overview.jsx als Rohtext.
function array(name) {
  const start = code.indexOf(`const ${name} = [`);
  assert.ok(start > -1, `Datenarray ${name} nicht gefunden`);
  const ende = code.indexOf("\n];", start);
  assert.ok(ende > start, `Ende von ${name} nicht gefunden`);
  return code.slice(start, ende);
}
const STEPS = array("STEPS");
const FUNKTIONEN = array("FUNKTIONEN");
const zaehle = (block, re) => (block.match(re) || []).length;

// ══════════ Seitenaufbau ══════════

test("1 — Reihenfolge: Seitenkopf → Kennzahlen → Sendungen/Rechnungen → Lager und Meldungen → Versanddienstleister", () => {
  const pos = [
    code.indexOf("<PageHeader"),
    code.indexOf('<section className="ov-kpis"'),
    code.indexOf('<div className="ov-mod-grid">'),
    code.indexOf('<div className="ov-mod-grid ov-mod-grid--lager">'),
    code.indexOf("<InventorySnapshot"),
    code.indexOf("<OverviewNotifications"),
    code.indexOf("<CarrierPortfolio"),
  ];
  assert.ok(pos.every((p) => p > -1), `ein Baustein fehlt: ${JSON.stringify(pos)}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, "die Reihenfolge der Übersicht stimmt nicht");
});

test("2 — der Seitenkopf begrüßt persönlich, nennt Datum und Einordnung, GENAU eine Hauptaktion", () => {
  // Feinkorrektur 2026-10: „Guten Tag, [Name]" ist der Seitentitel. Der Name
  // kommt aus dem bestehenden Nutzerkontext (Name, sonst Firmenname); ohne
  // beides bleibt „Guten Tag" — kein Platzhaltername, keine Tageszeitlogik.
  assert.match(code, /const greetingName = String\(user\?\.name \|\| user\?\.company_name \|\| ""\)\.trim\(\);/,
    "der Name kommt nicht aus dem bestehenden Nutzerkontext");
  assert.match(code, /Guten Tag, <span className="ov-greeting-name">\{greetingName\}<\/span>/, "die Begrüßung mit Namen fehlt");
  assert.match(code, /: "Guten Tag"\}/, "ohne Namen fehlt die neutrale Begrüßung");
  assert.ok(!/Guten (Morgen|Abend)|getHours|"Kunde"/.test(code), "Tageszeitlogik oder Platzhaltername in der Begrüßung");
  // Komplettabschluss (G1, 2026-10-27): die Übersicht umfasst Versand UND Logistik — die Einordnung sagt beides.
  assert.match(code, /`\$\{todayLabel\} · Versand und Logistik im Überblick`/, "Datum und Einordnung fehlen in der Kontextzeile");
  assert.ok(!/Ihr Versand im Überblick/.test(code), "die Einordnung nennt nur den Versand");
  assert.equal(zaehle(code, /btn btn-primary/g), 1, "genau eine Hauptaktion erwartet");
  assert.match(code, /onClick=\{onNewShipment\}>\s*Neue Sendung/, "„Neue Sendung“ nutzt nicht den bestehenden Handler");
  // Kein Serifengruß, keine Chips: der Name ist nur über die Markentinte
  // hervorgehoben — dieselbe Schrift, dieselbe Größe, kein Kursiv.
  assert.ok(!/pp-pill|pp-h1|pp-hname/.test(code), "Serifengruß oder Chips sind zurück");
  const name = rule(".ov-greeting-name");
  assert.ok(name, ".ov-greeting-name fehlt");
  assert.match(name, /color:\s*var\(--ce-color-brand-ink\)/, "der Name trägt nicht die Markentinte");
  assert.ok(!/font-(family|style|size|weight)/.test(name), "der Name bekommt ein eigenes Schriftbild");
});

test("2b — Begrüßung (Betreiberentscheidung 2026-11-01): ein Satz in der Gruß-Skala, in jeder Stufe kleiner als die Seitentitel", () => {
  const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const variablen = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const kopf = ':root[data-ce-bereich="kunde"] .main-content:has(.ov-page) .ce-page-header-title {';
  const start = editorial.indexOf(kopf);
  assert.ok(start > -1, "die Regel der Begrüßung fehlt");
  const regel = editorial.slice(start, editorial.indexOf("}", start));
  assert.match(regel, /font-size: var\(--ce-pr-ed-gruss-size\);/, "die Begrüßung steht nicht in der Gruß-Skala");
  assert.match(regel, /font-weight: 500;/, "die Begrüßung ist wieder ein fetter Titel");
  assert.match(regel, /font-stretch: 100%;/, "die Begrüßung steht nicht in normaler Breite");
  // Jede Stufe der Titelskala hat ihre Gruß-Stufe in derselben Medienabfrage (em: greift auch bei großer Grundschrift).
  for (const [stufe, gruss] of [["68.75em", "tablet"], ["37.5em", "mobile"]]) {
    const block = editorial.slice(editorial.indexOf(`@media (max-width: ${stufe}) {`));
    assert.match(block.slice(0, block.indexOf("\n}")),
      new RegExp(`\\.main-content:has\\(\\.ov-page\\) \\.ce-page-header-title \\{ font-size: var\\(--ce-pr-ed-gruss-size-${gruss}\\); \\}`),
      `die Gruß-Stufe ${gruss} fehlt`);
  }
  // Kleiner als der Seitentitel derselben Stufe; die übrigen Seiten behalten die Titelskala.
  const rem = (name) => parseFloat(variablen.match(new RegExp(`--${name}:\\s*([\\d.]+)rem;`))[1]);
  for (const stufe of ["", "-tablet", "-mobile"]) {
    assert.ok(rem(`ce-pr-ed-gruss-size${stufe}`) < rem(`ce-pr-ed-headline-size${stufe}`), `Gruß${stufe} ist nicht kleiner als der Seitentitel`);
  }
  // Gruß und Name sprechen mit einer Stimme: der Name erbt Farbe und Gewicht.
  assert.match(editorial, /\.ce-page-header-title \.ov-greeting-name \{ color: inherit; font-weight: inherit; \}/);
});

test("3 — Sendungen und Rechnungen stehen ≈ 2 : 1 nebeneinander, darunter einspaltig", () => {
  assert.equal(rule(".ov-mod-grid").match(/grid-template-columns:\s*([^;]+)/)[1].trim(),
    "minmax(0, 2fr) minmax(0, 1fr)");
  assert.match(cssBare, /@media \(max-width: 1120px\) \{[\s\S]*?\.ov-mod-grid \{ grid-template-columns: minmax\(0, 1fr\);/,
    "unterhalb von 1120 px stehen die Module nicht untereinander");
});

test("4 — jedes Modul ist über aria-labelledby mit seiner Überschrift verbunden", () => {
  for (const id of ["ov-ship-title", "ov-inv-title", "ov-ntf-title", "ov-lager-title", "ov-car-title"]) {
    assert.ok(modules.includes(`aria-labelledby="${id}"`), `aria-labelledby ${id} fehlt`);
    assert.ok(modules.includes(`id="${id}"`), `Überschrift mit id ${id} fehlt`);
  }
});

// ══════════ Letzte Sendungen ══════════

test("5 — Letzte Sendungen: Nummer/Datum, Empfänger, Carrier, Status, Preis — keine redundante „Öffnen“-Aktion", () => {
  const block = modules.slice(modules.indexOf("export function RecentShipments"), modules.indexOf("export function OpenInvoices"));
  assert.match(block, /recentShipments\(shipments, 4\)/, "die Auswahl der letzten vier Sendungen hat sich geändert");
  // Audit B.4 (2026-10-27): der Empfänger steht mit in der Zeile — aus recipient_address der Kundenliste
  // (utils/shipmentRecipientView.mjs), ohne Angabe „—“; der Carrier mit Logo (CarrierMarke).
  for (const teil of ["orderConfirmationNumber", "<CarrierMarke raw={s.selected_carrier} />", "dateDE(s.created_at)",
    "<StatusBadge status={s.status} />", "money(s.price_final)", "shipmentRecipient(s)", 'empfaenger?.name || "—"']) {
    assert.ok(block.includes(teil), `${teil} fehlt in der Zeile`);
  }
  // Die frühere Zeilenaktion führte zur ganzen Liste — dasselbe Ziel wie
  // „Alle Sendungen". Sie ist entfallen (Audit P1 Aktionssemantik).
  assert.ok(!/Öffnen/.test(block), "die redundante „Öffnen“-Aktion ist zurück");
  assert.ok(!/onOpen/.test(block), "eine Zeilenaktion ohne eigenes Ziel ist zurück");
  assert.match(block, /actionLabel="Alle Sendungen"/, "„Alle Sendungen“ fehlt");
  // Kein eigener Empfängertext: die Zeile liest nur die gemeinsame Abbildung, nie die Rohfelder.
  assert.ok(!/recipient_address|recipientAddress/.test(block), "die Zeile liest die Empfängerfelder wieder direkt");
});

test("6 — Status und Betrag stehen als ganze Einheiten (kein Umbruch im Wort)", () => {
  assert.match(rule(".ov-list-status"), /flex:\s*none/, "der Status darf nicht gestaucht werden");
  assert.match(rule(".ov-list-num"), /flex:\s*none/, "der Betrag darf nicht gestaucht werden");
  assert.match(modules, /className="ov-list-num ce-num"/, "der Betrag ist keine Zahlenspalte");
});

// ══════════ Offene Rechnungen und Meldungen ══════════

test("7 — Offene Rechnungen kommen unverändert aus der Serversummary", () => {
  const block = modules.slice(modules.indexOf("export function OpenInvoices"), modules.indexOf("export function OverviewNotifications"));
  assert.match(block, /overviewInvoiceFacts\(invoices, summary\)/, "die Rechnungsquelle wurde verändert");
  assert.match(block, /actionLabel="Alle Rechnungen"/, "„Alle Rechnungen“ fehlt");
  assert.match(block, /badge badge--overdue/, "Überfälligkeit ist nicht mehr als Status erkennbar");
});

test("8 — Meldungen: höchstens drei, ungelesen als Wort „Neu“, kein Punkt, keine Symbole", () => {
  const block = modules.slice(modules.indexOf("export function OverviewNotifications"));
  assert.match(block, /topNotifications\(items, 3\)/, "die Auswahl der Meldungen hat sich geändert");
  assert.match(block, /if \(rows\.length === 0\) return null;/, "ohne Meldungen darf keine leere Karte stehen");
  assert.match(block, /\{!n\.read && <span className="ov-ntf-new">Neu<\/span>\}/, "ungelesen steht nicht als Wort da");
  assert.ok(!/ov-ntf-dot|<Icon\b/.test(block), "Punkt oder Symbol ist zurück");
});

// ══════════ Onboarding (nur ohne operative Daten) ══════════

test("9 — Onboarding-Abschnitte erscheinen ausschließlich ohne operative Daten", () => {
  assert.match(code, /const operational = hasOperationalData\(\{ shipments, invoices, ready \}\);/,
    "die Sichtbarkeitsregel wurde verändert");
  for (const id of ["ov-sec-flow", "ov-sec-why"]) {
    const pos = code.indexOf(`id="${id}"`);
    assert.ok(pos > -1, `Abschnitt ${id} fehlt`);
    const davor = code.slice(code.lastIndexOf("{!operational && (", pos), pos);
    assert.ok(davor.length > 0 && davor.length < 300, `Abschnitt ${id} hängt nicht an !operational`);
  }
  // Die operativen Module erscheinen umgekehrt NUR mit Daten.
  assert.match(code, /\{operational && \(\s*<div className="ov-mod-grid">/);
});

test("10 — alle vier Prozessschritte bleiben inhaltlich erhalten, als echte Reihenfolge", () => {
  for (const t of ["Paketdaten eingeben", "Angebote vergleichen", "Versand buchen", "Tracking verfolgen"]) {
    assert.ok(STEPS.includes(`title: "${t}"`), `Schritt „${t}“ fehlt`);
  }
  assert.equal(zaehle(STEPS, /title:/g), 4);
  assert.match(code, /<ol className="ov-steps">/, "die Schritte sind keine geordnete Liste");
  assert.match(code, /<span className="ov-step-no">\{i \+ 1\}<\/span>/, "die Schrittnummer fehlt");
});

test("11 — Funktionen statt Werbezeilen: Versand, Rechnungen und Adressbuch, Lager und Aufträge (G1)", () => {
  // Komplettabschluss (G1, Audit B.10, 2026-10-27): „Weniger Aufwand. Mehr Kontrolle.“ mit vier Werbezeilen ist
  // durch die tatsächlichen Funktionen ersetzt — Versand UND Logistik, aus EINER Datenquelle.
  for (const t of ["Versand", "Rechnungen und Adressbuch", "Lager und Aufträge"]) {
    assert.ok(FUNKTIONEN.includes(`title: "${t}"`), `Funktion „${t}“ fehlt`);
  }
  assert.equal(zaehle(FUNKTIONEN, /title:/g), 3);
  assert.match(code, /\{FUNKTIONEN\.map\(\(w\) => \(/, "die Funktionen laufen nicht über EINE Datenquelle");
  assert.match(code, /<h2 className="ov-section-title" id="ov-sec-why">Versand und Logistik in Ihrem Kundenbereich<\/h2>/);
  assert.ok(!/Beste Preise|für das beste Angebot|Weniger Aufwand\. Mehr Kontrolle\./.test(code), "die Werbezeilen sind zurück");
  // Ehrlichkeitsgrenze: das eigene Lager des Kunden — ConfidaraExpress lagert nicht ein.
  assert.ok(FUNKTIONEN.includes("Ihres eigenen Lagers"), "die Lagerfunktion nennt nicht das eigene Lager");
  assert.ok(!/Fulfillment|einlager|Lagerhaltung für/i.test(code), "ein Fulfillment-Versprechen ist entstanden");
});

test("12 — keine Zusicherungen ohne Beleg; keine Preisgarantie, keine Konformitäts- oder Echtzeitbehauptung", () => {
  // Komplettabschluss (Audit B.10, 2026-10-27): die drei Zusicherungen („Verschlüsselte Übertragung“, „Persönlicher
  // Support — schnell und zuverlässig“, „Preise im Vergleich“) sind entfallen — Behauptung statt Beweis. Go-Live
  // (Paket E): weder „Tiefpreisgarantie“ noch „DSGVO-konform“ noch „in Echtzeit“.
  assert.ok(!/const TRUST = \[|ov-trust|schnell und zuverlässig/.test(code), "die Zusicherungen sind zurück");
  for (const block of [STEPS, FUNKTIONEN]) {
    assert.ok(!/garantier|Tiefpreis|DSGVO-konform|Echtzeit|aller führenden/i.test(block), `unbelegte Werbeaussage zurück: ${block.slice(0, 80)}`);
  }
});

test("13 — Onboarding ist ruhiger Text: keine Symbole, keine dunklen Flächen, kein Wasserzeichen", () => {
  for (const verboten of ["icon:", "<Icon", "pp-bento", "pp-flow", "pp-medal", "pp-trust-watermark", "signet-standard"]) {
    assert.ok(!code.includes(verboten), `${verboten} gehört nicht mehr in die Übersicht`);
  }
  // Schritte und Vorteile teilen sich EINE Grundregel (gruppierter Selektor).
  const r = cssBare.match(/\.ov-steps,\s*\.ov-facts \{([^}]*)\}/)?.[1];
  assert.ok(r, "die gemeinsame Grundregel von .ov-steps/.ov-facts fehlt");
  assert.match(r, /background:\s*var\(--ce-color-surface\)/, "helle Fläche erwartet");
  assert.match(r, /border:\s*1px solid var\(--ce-color-border-subtle\)/, "ruhige 1-px-Kante erwartet");
  assert.match(r, /box-shadow:\s*var\(--ce-elevation-1\)/, "die leichte Tiefe der Arbeitsflächen fehlt");
  assert.ok(!/gradient/.test(r), "kein Verlauf");
});

// ══════════ Carrier-Bereich ══════════

test("14 — „Ihre Versanddienstleister“: Navy-Fläche mit Linien, nur aus GET /kunde/carriers, mit der Vergleichsaktion (G2, UX-Korrektur C)", () => {
  // Betreiberentscheidung G2 (2026-10-27): alle aktuell angebotenen Carrier, keine feste Liste, nicht nur die
  // bisher gebuchten; keine Laufzeiten, keine Dienstnamen, keine Zahl im Titel. UX-Korrektur C (Betreiberentscheidung
  // 2026-10-27): die Fläche trägt wieder Navy mit feinen geschwungenen Linien — in den Farben der Navy-Bühne
  // (--ce-pr-*), nicht der früheren Familie --ce-net-*, und ohne „Fünf Carrier. Eine zentrale Plattform.“ samt
  // erfundenen Diensten und Laufzeiten (Audit B.5, D8).
  assert.ok(!/const CARRIERS = \[|assets\/carriers\//.test(code), "die feste Carrierliste ist zurück");
  for (const tot of ["Fünf Carrier", "Eine zentrale Plattform", "ov-carrier-time", "ov-carrier-service", "--ce-net-"]) {
    assert.ok(!(code + modules).includes(tot), `${tot}: der frühere Carrier-Bereich mit erfundenen Angaben ist zurück`);
  }
  assert.ok(!/--ce-net-/.test(cssBare), "die Farbfamilie der früheren Navy-Fläche lebt noch in overview.css");
  assert.match(code, /<CarrierPortfolio carriers=\{carriers\} onCompare=\{\(\) => navigate\("\/calculator"\)\} \/>/,
    "die Vergleichsaktion führt nicht zum Versandkostenrechner");
  const block = modules.slice(modules.indexOf("export function CarrierPortfolio"));
  assert.match(block, /if \(!Array\.isArray\(carriers\) \|\| carriers\.length === 0\) return null;/,
    "ohne Serverliste darf keine Fläche stehen");
  assert.match(block, /resolvePublicCarrier\(c\.id\)\.logo/, "das Logo kommt nicht aus der öffentlichen Carrierzuordnung");
  assert.match(block, /<span className="ov-carrier-name">\{c\.name\}<\/span>/, "der Name fehlt");
  assert.match(block, /data-carrier=\{c\.id\}/, "die optische Logoangleichung braucht die öffentliche Carrier-ID");
  assert.match(block, /onClick=\{onCompare\}>\s*\{CARRIER_PORTFOLIO_TEXT\.action\}/, "die Vergleichsaktion fehlt");
  assert.ok(!/service|Laufzeit|Tage|time/.test(block), "Laufzeiten oder Dienste in der Carrierfläche");
  // Die Linien: dekorativ, statisch, nur in der Fläche und hinter dem Inhalt.
  const linien = modules.slice(modules.indexOf("function CarrierLinien"), modules.indexOf("export function CarrierPortfolio"));
  assert.match(linien, /<svg className="ov-carrier-linien" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">/);
  assert.match(block, /<CarrierLinien \/>/);
  assert.match(rule(".ov-carrier-zeile"), /background:\s*var\(--ce-pr-stage\)/, "die Fläche ist nicht Navy");
  assert.match(rule(".ov-carrier-zeile"), /overflow:\s*hidden/, "die Linien laufen über die Fläche hinaus");
  assert.match(rule(".ov-carrier-linien"), /position:\s*absolute;[\s\S]*z-index:\s*-1;[\s\S]*pointer-events:\s*none/);
  assert.match(rule(".ov-carrier-routen path"), /vector-effect:\s*non-scaling-stroke/, "die Linien werden mit der Fläche dicker");
  assert.match(rule(".ov-carrier-titel"), /color:\s*var\(--ce-color-text-inverse\)/);
  assert.match(rule(".ov-carrier-zeile .ov-carrier-aktion:focus-visible"), /outline:\s*2px solid var\(--ce-pr-signal-on-navy\)/,
    "der Fokus ist auf Navy nicht sichtbar");
  // Die Kacheln sind keine Aktion — kein Hover.
  assert.doesNotMatch(cssBare, /\.ov-carrier-(eintrag|logo|liste)[^{]*:hover/, "Hover auf einer Kachel ohne Aktion");
  // Das Laden liegt bei DashboardPage — die Übersicht und ihre Module laden nichts.
  const dash = src("../../pages/DashboardPage.jsx");
  assert.match(dash, /fetchCarrierPortfolio\(\),/);
  assert.match(dash, /carriers=\{carrierPortfolio\}/);
  // Logos in Originalproportion — eingepasst, nie verzerrt.
  assert.match(rule(".ov-carrier-logo img"), /object-fit:\s*contain/, "Logos werden nicht eingepasst");
});

test("14b — Lager und Aufträge (G1/D7): Stand aus DashboardPage, Einstieg ohne Artikel, Fehler mit Wiederholung", () => {
  const block = modules.slice(modules.indexOf("export function InventorySnapshot"), modules.indexOf("export function CarrierPortfolio"));
  assert.match(block, /export function InventorySnapshot\(\{ stand: standProp = null, onRetry = null, onNavigate \}\)/);
  for (const teil of ['stand.status === "laden"', 'stand.status === "fehler"', "isInventoryEmpty(stats)",
    'gehe("orders", "open")', 'gehe("stock", "low")', 'gehe("inventory")']) {
    assert.ok(block.includes(teil), `${teil} fehlt im Lagermodul`);
  }
  assert.match(code, /<InventorySnapshot stand=\{lagerStand\} onRetry=\{onLagerRetry\} onNavigate=\{onNavigate\} \/>/);
  // Geladen wird mit derselben Abfrage wie die Lagerübersicht — jedes Mal, wenn die Übersicht geöffnet wird.
  const dash = src("../../pages/DashboardPage.jsx");
  assert.match(dash, /if \(page !== "overview"\) return undefined;/);
  assert.match(dash, /getInventoryOverview\(\{ signal \}\)/);
  assert.match(dash, /lagerStand=\{lagerStand\}/);
});

// ══════════ Ruhe und Daten ══════════

test("15 — keine Animation, kein Blur, kein backdrop-filter, keine Farbliterale in der Übersicht", () => {
  assert.doesNotMatch(cssBare, /@keyframes|animation:|backdrop-filter|filter:\s*blur/, "Effekte in overview.css");
  const literale = cssBare.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) || [];
  assert.deepEqual(literale, [], `Farbliterale in overview.css: ${literale.join(", ")}`);
});

test("16 — sichtbare Zahlen nutzen die normale Zahlenschrift", () => {
  assert.match(rule(".ov-step-no"), /font-family:\s*var\(--ce-font-numeric\)/, "Schrittnummer");
  assert.match(rule(".ov-kpi-value"), /font-family:\s*var\(--ce-font-numeric\)/, "Kennzahl");
  assert.match(rule(".ov-inv-amount"), /font-family:\s*var\(--ce-font-numeric\)/, "Rechnungsbetrag");
});

test("17 — Daten, Routing und Zustände der Übersicht sind unverändert", () => {
  // Keine neue API-Abfrage, kein Polling, keine neue Abhängigkeit.
  assert.ok(!/fetch\(|apiFetch|setInterval/.test(code), "die Übersicht darf keine eigenen Daten laden");
  assert.ok(!/lucide-react/.test(overview), "lucide-react ist im Projekt nicht zulässig");
  assert.match(code, /kpisFromServerStats\(serverStats\) \|\| computeKpis\(shipments\)/, "die KPI-Berechnung wurde verändert");
  assert.match(code, /notificationTarget\(n\)/, "das Ziel einer Meldung wird nicht mehr aus der bestehenden Zuordnung abgeleitet");
  for (const t of ["Noch nicht abgeschlossen", "Auf dem Weg zum Empfänger", "Im aktuellen Monat", "Über dem geplanten Liefertermin"]) {
    assert.ok(code.includes(t), `KPI-Kontextzeile „${t}“ wurde verändert`);
  }
});
