// Struktur- und Gestaltungstests der Inhaltsabschnitte der Kundenübersicht
// (Redesign 2026-10).
//
// Bewusst quelltextnah, wie overviewKpiCards.test.mjs: das Repository hat kein
// jsdom und keine Renderbibliothek.
//
// Freigegebener Vertrag (Audit G/H01, Feinkorrektur 2026-10): Die Übersicht
// ist eine Arbeitsübersicht — Seitenkopf mit persönlicher Begrüßung „Guten
// Tag, [Name]", Datum/Einordnung und EINER Hauptaktion, Kennzahlenband,
// letzte Sendungen und offene Rechnungen (≈ 2 : 1), vorhandene Meldungen und
// der Carrier-Bereich: die acht Carrier mit „Carrier-Angebote vergleichen" —
// seit der Betreiberentscheidung 2026-10-04 wieder in der Optik vor dem
// Redesign (Navy-Fläche mit Routenlinien, weiße Logo-Kacheln), ausschließlich
// in diesem Block und ohne die alten pp-*-Klassen; die Onboarding-Abschnitte („Ablauf",
// „Vorteile", Zusicherungen) bleiben mit unverändertem Inhalt — aber
// ausschließlich für Konten OHNE operative Daten und als ruhiger Text ohne
// Symbole.
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
const WHY = array("WHY");
const TRUST = array("TRUST");
const zaehle = (block, re) => (block.match(re) || []).length;

// ══════════ Seitenaufbau ══════════

test("1 — Reihenfolge: Seitenkopf → Kennzahlen → Sendungen/Rechnungen → Meldungen → Carrier", () => {
  const pos = [
    code.indexOf("<PageHeader"),
    code.indexOf('<section className="ov-kpis"'),
    code.indexOf('<div className="ov-mod-grid">'),
    code.indexOf("<OverviewNotifications"),
    code.indexOf('<section className="ov-carriers"'),
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
  assert.match(code, /`\$\{todayLabel\} · Ihr Versand im Überblick`/, "Datum und Einordnung fehlen in der Kontextzeile");
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

test("3 — Sendungen und Rechnungen stehen ≈ 2 : 1 nebeneinander, darunter einspaltig", () => {
  assert.equal(rule(".ov-mod-grid").match(/grid-template-columns:\s*([^;]+)/)[1].trim(),
    "minmax(0, 2fr) minmax(0, 1fr)");
  assert.match(cssBare, /@media \(max-width: 1120px\) \{[\s\S]*?\.ov-mod-grid \{ grid-template-columns: minmax\(0, 1fr\);/,
    "unterhalb von 1120 px stehen die Module nicht untereinander");
});

test("4 — jedes Modul ist über aria-labelledby mit seiner Überschrift verbunden", () => {
  for (const id of ["ov-ship-title", "ov-inv-title", "ov-ntf-title"]) {
    assert.ok(modules.includes(`aria-labelledby="${id}"`), `aria-labelledby ${id} fehlt`);
    assert.ok(modules.includes(`id="${id}"`), `Überschrift mit id ${id} fehlt`);
  }
});

// ══════════ Letzte Sendungen ══════════

test("5 — Letzte Sendungen: Nummer, Carrier/Datum, Status, Preis — keine redundante „Öffnen“-Aktion", () => {
  const block = modules.slice(modules.indexOf("export function RecentShipments"), modules.indexOf("export function OpenInvoices"));
  assert.match(block, /recentShipments\(shipments, 4\)/, "die Auswahl der letzten vier Sendungen hat sich geändert");
  for (const teil of ["orderConfirmationNumber", "resolveCarrierName", "dateDE(s.created_at)", "<StatusBadge status={s.status} />", "money(s.price_final)"]) {
    assert.ok(block.includes(teil), `${teil} fehlt in der Zeile`);
  }
  // Die frühere Zeilenaktion führte zur ganzen Liste — dasselbe Ziel wie
  // „Alle Sendungen". Sie ist entfallen (Audit P1 Aktionssemantik).
  assert.ok(!/Öffnen/.test(block), "die redundante „Öffnen“-Aktion ist zurück");
  assert.ok(!/onOpen/.test(block), "eine Zeilenaktion ohne eigenes Ziel ist zurück");
  assert.match(block, /actionLabel="Alle Sendungen"/, "„Alle Sendungen“ fehlt");
  // Keine Empfänger-/Zielspalte — das Feld gibt es im Kundendatensatz nicht.
  assert.ok(!/recipient|empfaenger|Empfänger:/i.test(block), "eine erfundene Empfängerangabe ist hinzugekommen");
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

test("11 — alle vier Vorteile bleiben erhalten, aus EINER Datenquelle; kein Superlativ", () => {
  for (const t of ["Für Geschäftskunden entwickelt", "Konditionen direkt vergleichen", "Express & Standard", "Vollständige Transparenz"]) {
    assert.ok(WHY.includes(`title: "${t}"`), `Vorteil „${t}“ fehlt`);
  }
  assert.equal(zaehle(WHY, /title:/g), 4);
  assert.ok(!/Beste Preise|für das beste Angebot/.test(code), "die unbelegte Superlativ-Werbung ist zurück");
  assert.match(code, /\{WHY\.map\(\(w\) => \(/, "die Vorteile laufen nicht über EINE Datenquelle");
});

test("12 — die drei Zusicherungen bleiben wortgleich erhalten", () => {
  for (const t of ["Sicher & DSGVO-konform", "Persönlicher Support", "Tiefpreisgarantie"]) {
    assert.ok(TRUST.includes(`title: "${t}"`), `Zusicherung „${t}“ fehlt`);
  }
  assert.ok(TRUST.includes("Wir garantieren Ihnen die besten Versandpreise."), "der Wortlaut wurde verändert");
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

test("14 — der Carrier-Bereich: acht Carrier auf Navy mit Routenlinien, mit der Vergleichsaktion", () => {
  // Feinkorrektur 2026-10: inhaltlich zurück (Logos, Botschaft, Vergleich). Betreiberentscheidung
  // 2026-10-04: dazu wieder die Optik vor dem Redesign (Stand 2c4cf1b) — nur in diesem Block, mit
  // Klassen im ov-Namensraum statt der alten pp-*-Klassen.
  const carriers = array("CARRIERS");
  assert.equal(zaehle(carriers, /logo:/g), 8, "genau acht Carrier erwartet");
  assert.match(code, /Acht Carrier\. Eine zentrale Plattform\./, "der Titel nennt die Zahl nicht als Wort");
  for (const c of ["dhl", "ups", "dpd", "gls", "fedex", "tnt", "emons", "trans-o-flex"]) {
    assert.ok(overview.includes(`assets/carriers/${c}.svg`), `das Logo ${c} fehlt`);
  }
  assert.match(code,
    /<button type="button" className="btn btn-outline ov-carriers-cta" onClick=\{\(\) => navigate\("\/calculator"\)\}>\s*Carrier-Angebote vergleichen/,
    "„Carrier-Angebote vergleichen“ führt nicht zum Versandkostenrechner");
  // Die alten Klassen kommen nicht zurück — die Optik lebt im ov-Namensraum.
  for (const tot of ["pp-net", "NetworkPattern", "pp-cars", "pp-car-chip"]) {
    assert.ok(!code.includes(tot), `${tot}: eine alte pp-Klasse ist zurück`);
  }
  // Jede Kachel: Logo mit Markennamen als alt-Text, Leistung, Laufzeit.
  assert.match(code, /<img src=\{c\.logo\} alt=\{c\.alt\} \/>/, "das Logo trägt keinen alt-Text");
  assert.match(code, /className="ov-carrier-service">\{c\.service\}/, "die Leistung fehlt");
  assert.match(code, /className="ov-carrier-time">\{c\.time\}/, "die Laufzeit fehlt");
  // Die Routenlinien: rein dekorativ, als erstes Kind DIESES Blocks, der Inhalt liegt darüber.
  const block = code.slice(code.indexOf('<section className="ov-carriers"'), code.indexOf("</section>", code.indexOf('<section className="ov-carriers"')));
  assert.match(block, /<section className="ov-carriers" aria-labelledby="ov-car-title">\s*<CarrierRoutes \/>\s*<div className="ov-carriers-in">/,
    "die Routenlinien stehen nicht hinter dem Inhalt des Carrier-Bereichs");
  assert.match(code, /<svg className="ov-carriers-net" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">/,
    "die Routenlinien sind nicht rein dekorativ");
  assert.equal(zaehle(code, /<path d="/g), 3, "drei Routen erwartet");
  assert.equal(zaehle(code, /<circle cx="/g), 5, "fünf Knoten erwartet");
  assert.equal(zaehle(code, /<CarrierRoutes \/>/g), 1, "die Routenlinien gehören ausschließlich in den Carrier-Bereich");
  // Die Fläche: Navy aus der eigenen Familie, an der Rundung beschnitten; Linien hinter, Inhalt vor.
  const flaeche = rule(".ov-carriers");
  assert.match(flaeche, /position:\s*relative;\s*overflow:\s*hidden/, "die Linien werden nicht an der Karte beschnitten");
  assert.match(flaeche, /background:\s*var\(--ce-net-surface\)/, "die Navy-Fläche fehlt");
  assert.match(flaeche, /border:\s*1px solid var\(--ce-net-border\)/, "die Kante der Navy-Fläche fehlt");
  assert.match(flaeche, /box-shadow:\s*var\(--ce-net-shadow\)/, "die Tiefe der Navy-Fläche fehlt");
  assert.match(rule(".ov-carriers-net"), /position:\s*absolute;\s*inset:\s*0;[\s\S]*z-index:\s*0;\s*pointer-events:\s*none/);
  assert.match(rule(".ov-carriers-in"), /position:\s*relative;\s*z-index:\s*1/);
  assert.match(rule(".ov-carriers-route"), /stroke:\s*var\(--ce-net-line\)/);
  assert.match(rule(".ov-carriers-node"), /fill:\s*var\(--ce-net-node\)/);
  // Weiße Logo-Kacheln, Schrift und Aktion hell auf Navy — die Aktion bleibt der Secondary-Button.
  assert.match(rule(".ov-carrier-logo"), /background:\s*var\(--ce-net-chip\)/, "die weiße Logo-Kachel fehlt");
  assert.match(rule(".ov-carriers-title"), /color:\s*var\(--ce-net-ink\)/);
  assert.match(rule(".ov-carriers-desc"), /color:\s*var\(--ce-net-ink-soft\)/);
  assert.match(rule(".ov-carriers .ov-carriers-cta"), /color:\s*var\(--ce-net-ink\);\s*background:\s*var\(--ce-net-cta-face\);\s*border-color:\s*var\(--ce-net-cta-edge\)/);
  assert.match(rule(".ov-carriers .ov-carriers-cta:focus-visible"), /outline:\s*2px solid var\(--ce-net-focus\)/, "der Fokus ist auf Navy nicht sichtbar");
  // Die Familie --ce-net-* wird ausschließlich hier benutzt — keine globale Farb- oder Hintergrundänderung.
  for (const [name, inhalt] of [["Overview.jsx", code], ["OverviewModules.jsx", modules]]) {
    assert.ok(!/--ce-net-/.test(inhalt), `${name} setzt Navy-Werte inline`);
  }
  const netzRegeln = (cssBare.match(/[^{}]+\{[^}]*--ce-net-[^}]*\}/g) || []).map((r) => r.split("{")[0].trim());
  assert.ok(netzRegeln.length > 0 && netzRegeln.every((s) => s.split(",").every((t) => /\.ov-carrier/.test(t))),
    `Navy-Werte außerhalb des Carrier-Bereichs: ${netzRegeln.filter((s) => !/\.ov-carrier/.test(s)).join(" | ")}`);
  // Kompakt: breit eine Reihe zu acht, sonst vier, auf dem Telefon zwei.
  assert.match(rule(".ov-carrier-grid"), /grid-template-columns:\s*repeat\(8, minmax\(0, 1fr\)\)/);
  assert.match(cssBare, /@media \(max-width: 1359px\) \{\s*\.ov-carrier-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/,
    "unterhalb von 1360 px stehen die Carrier nicht zu viert");
  assert.match(cssBare, /@media \(max-width: 600px\) \{[\s\S]*?\.ov-carrier-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    "auf dem Telefon stehen die Carrier nicht zu zweit");
  // Logos in Originalproportion — eingepasst, nie verzerrt.
  assert.match(rule(".ov-carrier-logo img"), /object-fit:\s*contain/, "Logos werden nicht eingepasst");
});

test("14b — die Schrift auf der Navy-Fläche erfüllt WCAG AA an jeder Stelle des Verlaufs", () => {
  const vars = src("../../styles/variables.css");
  const wert = (name) => {
    const m = vars.match(new RegExp(`--${name}:\\s*([^;]+);`));
    assert.ok(m, `--${name} fehlt in variables.css`);
    return m[1].trim();
  };
  const farbe = (s) => {
    const hex = s.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
    const r = s.match(/^rgba?\(([^)]+)\)$/i);
    assert.ok(r, `unlesbare Farbe: ${s}`);
    const t = r[1].split(",").map((x) => Number(x.trim()));
    return [t[0], t[1], t[2], t.length > 3 ? t[3] : 1];
  };
  const mische = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
  const kanal = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const leuchte = ([r, g, b]) => 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
  const kontrast = (a, b) => { const [x, y] = [leuchte(a), leuchte(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const stellen = [...wert("ce-net-surface").matchAll(/#[0-9a-f]{6}/gi)].map((m) => farbe(m[0]).slice(0, 3));
  assert.equal(stellen.length, 3, "der Navy-Verlauf hat nicht drei Stellen");
  for (const stelle of stellen) {
    for (const rolle of ["ce-net-ink", "ce-net-ink-soft"]) {
      const c = kontrast(mische(farbe(wert(rolle)), stelle), stelle);
      assert.ok(c >= 4.5, `${rolle} auf ${stelle.join(",")}: ${c.toFixed(2)}:1 unterschreitet 4,5:1`);
    }
  }
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
