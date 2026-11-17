// E2E: „Versandpreise optimieren“ im Admin-Kundendetail (vereinfacht 2026-11-17). Echter Dev-Server, echtes Chromium,
// GEMOCKTES Backend (helpers/tariffMarkupsMock.mjs) mit demselben Vertrag wie routes/admin/tariffMarkups.js und
// lib/admin/tariffRecommendation.js; die Datenbankseite misst Backend customer-tariff-markups-pg, die Rechenseite
// pricing-optimization und admin-tariff-comparison.
//
//   A  Öffnen: alle Tarife mit „Ihr Aufschlag“, Zustände nur bei Handlungsbedarf — kein Providerkontakt, kein Speichern
//   B  Tarif auswählen: vier Gewichtsreiter, drei Kennzahlen, ohne Vergleich keine Empfehlung; „Alle Gewichte“ als
//      eigene Zeile mit erkennbarer Quelle; Reiterwechsel speichert nichts
//   C  Preise vergleichen: genau EIN Abruf; Empfehlung und Mehr pro Sendung je Klasse; „Passt bereits“; fehlender
//      Vergleich → „Keine Empfehlung verfügbar“; Details (Einkauf, Kunde, Vergleich, Grenze, Datenbasis); UPS 22 mit
//      Abholzuschlag (Hinweis „Preisvorteil gefährdet“ bleibt vorne sichtbar)
//   D  „Empfehlung übernehmen“ füllt nur das Feld; „Selbst festlegen“; entprellte Vorschau; „Alle Gewichte“ bleibt
//      unangetastet; Verwerfen
//   E  Speichern → Bestätigungsdialog → genau EIN PUT; Fokus auf der Erfolgsmeldung; Verlauf; Zurücksetzen über
//      denselben Dialog
//   F  Untergrenze: neuer Wert unter 25 % gesperrt, unveränderter Bestandswert erlaubt; Server-400 am betroffenen Feld
//   G  Fehlerpfade: Abruf 500/429, Vorschau 410 ohne automatischen Abruf, Speichern 500, Verlauf 500
//   H  Tastatur: Tarifkopf, Reiter mit Pfeiltasten/Pos1/Ende, „Empfehlung übernehmen“, Dialog mit Escape
//   I  390 px und 200 % Zoom: kein Querüberlauf, Reiter 2 × 2, Kennzahlen untereinander, Ziele groß genug
//   J  Kundenwechsel in der App: Karte neu montiert, Entwürfe und Vergleichsbasis beginnen leer
//   K  Adminrechte: ein Kundenkonto sieht die Karte nicht und löst keinen Aufschlagsabruf aus
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { createTariffMock, KONTEN } from "./helpers/tariffMarkupsMock.mjs";

const PORT = 5772, BASE = `http://127.0.0.1:${PORT}`;
function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}
const KARTE = "#adm-tariff-section";
const ORT = Object.freeze({ timezoneId: "Europe/Berlin", locale: "de-DE" });
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const slug = (id) => String(id).replace(/[^a-z0-9]+/gi, "-");
const FLOOR = "Neue Aufschläge müssen mindestens 25 % betragen. Ein bestehender niedrigerer Wert bleibt, solange Sie ihn nicht ändern.";
const MEHR_GEWINN = "Der Aufschlag kann steigen – der Kunde zahlt dann immer noch mindestens 1 % weniger als beim vergleichbaren Angebot.";
const UNTER_ZIEL = "Der Aufschlag liegt unter der Untergrenze. Er bleibt, bis Sie ihn ändern; neue Werte brauchen mindestens die Untergrenze.";
const GEFAEHRDET = "Der Kunde zahlt fast so viel wie beim vergleichbaren Angebot oder mehr.";
const OHNE_BASIS = "Empfehlungen erscheinen nach „Preise vergleichen“.";
const REITER = ["Bis 5 kg", "Über 5–10 kg", "Über 10–20 kg", "Über 20 kg"];

let server, browser;

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

async function neueSeite(viewport = { width: 1280, height: 1000 }, mockOpts) {
  const page = await browser.newPage({ viewport, ...ORT });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  const mock = createTariffMock(mockOpts);
  await page.route("**/api.confidaraexpress.de/**", (route) => mock.handle(route));
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return { page, state: mock.state, fehler };
}
// Die Karte ist eingeklappt (Kurzfassung „N individuell“) — der Test öffnet sie wie ein Admin per Klick.
async function oeffne(page, id = 7) {
  await page.goto(`${BASE}/admin/users/${id}`, { waitUntil: "domcontentloaded" });
  const kopf = page.locator(`${KARTE} > summary`);
  await kopf.waitFor({ timeout: 30000 });
  if (!(await page.locator(KARTE).evaluate((d) => d.open))) await kopf.click();
  await page.locator("#adm-po-head-transglobal-22").waitFor({ timeout: 30000 });
}
async function warte(pruefung, ms = 5000) {
  const frist = Date.now() + ms;
  while (!(await pruefung())) {
    if (Date.now() > frist) throw new Error("Zeitüberschreitung beim Warten");
    await new Promise((r) => setTimeout(r, 40));
  }
}
async function vergleiche(page, state) {
  const vorher = state.refreshes.length;
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-stand`, { hasText: "Stand:" }).waitFor({ timeout: 10000 });
  assert.equal(state.refreshes.length, vorher + 1, "genau ein Abruf je Klick");
}
const kopf = (page, id) => page.locator(`#adm-po-head-${slug(id)}`);
const badge = (page, id) => kopf(page, id).locator(".adm-po-badge");
const panel = (page, id) => page.locator(`#adm-po-panel-${slug(id)}`);
const reiter = (page, id, wc) => page.locator(`#adm-po-tab-${slug(id)}-${wc}`);
const flaeche = (page, id) => page.locator(`#adm-po-tabpanel-${slug(id)}`);
const feld = (page, id, wc) => page.locator(`#adm-tarif-input-${slug(`${id}:${wc}`)}`);
const aktiv = () => (document.activeElement ? document.activeElement.id : "");
// Drei Kennzahlen der aktiven Gewichtsklasse als „Name: Wert | Hinweis“.
const kennzahlen = (page, id) => flaeche(page, id).locator(".adm-po-metric").evaluateAll((els) => Object.fromEntries(els.map((el) => {
  const t = (sel) => { const n = el.querySelector(sel); return n ? n.innerText.replace(/\s+/g, " ").trim() : ""; };
  const hinweis = t(".adm-po-metric-note");
  return [el.dataset.metric, `${t(".adm-po-metric-label")}: ${t(".adm-po-metric-value")}${hinweis ? ` | ${hinweis}` : ""}`];
})));
const hinweise = (page, id) => flaeche(page, id).locator("li.adm-po-warning").evaluateAll((els) => els.map((el) => [el.dataset.status, el.querySelector(".adm-po-warning-text").innerText.replace(/\s+/g, " ").trim()]));
const details = (page, id) => page.locator(`#adm-po-details-${slug(id)}`);
const detailListe = (page, id) => details(page, id).locator(".adm-po-details > dl.adm-po-detail-list").first().locator(":scope > div")
  .evaluateAll((els) => els.map((el) => [el.querySelector("dt").innerText.trim(), el.querySelector("dd").innerText.replace(/\s+/g, " ").trim()]));
const alleZeile = async (page, id) => norm(await panel(page, id).locator(".adm-po-all-line").innerText());
const reihenfolge = (page, provider) => page.locator(`${KARTE} .adm-po-group[data-provider="${provider}"] li.adm-po-tarif`).evaluateAll((els) => els.map((e) => e.dataset.tariff));
const zaehler = async (page) => norm(await page.locator("#adm-tarif-dirty").innerText());
const stand = async (page) => norm(await page.locator(`${KARTE} .adm-tarif-stand`).innerText());

test("A — Öffnen: alle Tarife mit „Ihr Aufschlag“, Zustände nur bei Handlungsbedarf; kein Providerkontakt, keine Vorschau, kein Speichern", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  assert.equal(norm(await page.locator(`${KARTE} .adm-disclosure-title`).innerText()), "Versandpreise optimieren");
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-badge`).innerText()), "3 individuell");
  assert.equal(await page.locator(`${KARTE} .adm-po-step, ${KARTE} .adm-po-facts, ${KARTE} table.adm-po-profit`).count(), 0, "keine Ablaufschritte, keine Faktenleiste, keine Gewinntabelle mehr");
  assert.equal(await stand(page), OHNE_BASIS);
  assert.deepEqual(await reihenfolge(page, "transglobal"), [22, 23, 29, 84, 85, 86, 87].map((k) => `transglobal:${k}`), "ohne Vergleich: Reihenfolge des Servers");
  assert.deepEqual(await reihenfolge(page, "jumingo"), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `jumingo:${k}`));
  // Ohne Vergleich: rot nur unter der Untergrenze (Bestandswert 0 %, geerbte 20 %); „noch nicht verglichen“ ist kein Zustand mehr.
  assert.equal(await badge(page, "transglobal:22").getAttribute("data-status"), "below_target");
  assert.equal(norm(await badge(page, "transglobal:22").innerText()), "Unter dem Zielaufschlag");
  assert.equal(await badge(page, "transglobal:23").count(), 0);
  assert.equal(await badge(page, "jumingo:1").getAttribute("data-status"), "below_target");
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-tarif-meta").innerText()), "Ihr Aufschlag 0 %");
  assert.equal(norm(await kopf(page, "jumingo:1").locator(".adm-po-tarif-meta").innerText()), "Ihr Aufschlag 20–30 %");
  assert.equal(await page.locator(`${KARTE} .adm-po-plus`).count(), 0, "ohne Vergleich kein Plus");
  assert.equal(await page.locator(`${KARTE} .adm-po-tarif-head[aria-expanded="true"]`).count(), 0);
  assert.equal(await page.locator("#adm-tarif-save").count(), 0, "ohne offenen Tarif und ohne Entwurf keine Speicherleiste");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length, state.audits.length], [0, 0, 0, 0], "Öffnen fragt nur die gespeicherten Sätze ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — Tarif auswählen: vier Gewichtsreiter, drei Kennzahlen, ohne Vergleich keine Empfehlung; „Alle Gewichte“ mit Quelle", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await kopf(page, "transglobal:22").click();
  assert.equal(await kopf(page, "transglobal:22").getAttribute("aria-expanded"), "true");
  const liste = page.locator('#adm-po-panel-transglobal-22 [role="tablist"]');
  assert.equal(await liste.getAttribute("aria-label"), "Gewichtsklasse: UPS Standard");
  assert.deepEqual((await liste.locator('[role="tab"]').allInnerTexts()).map(norm), REITER);
  assert.equal(await reiter(page, "transglobal:22", 1).getAttribute("aria-selected"), "true");
  assert.equal(await reiter(page, "transglobal:22", 2).getAttribute("tabindex"), "-1", "nur der aktive Reiter liegt in der Tab-Reihenfolge");
  assert.equal(await flaeche(page, "transglobal:22").getAttribute("aria-labelledby"), "adm-po-tab-transglobal-22-1");
  assert.deepEqual(await kennzahlen(page, "transglobal:22"), {
    current: "Ihr Aufschlag: 0 % | Satz für alle Gewichte",
    recommended: "Empfohlen: Keine Empfehlung verfügbar | Erst Preise vergleichen",
    more: "Mehr pro Sendung: — | Erst Preise vergleichen",
  });
  assert.deepEqual(await hinweise(page, "transglobal:22"), [["below_target", UNTER_ZIEL]], "entscheidungsrelevant: bleibt vorne sichtbar");
  assert.equal(await flaeche(page, "transglobal:22").locator(".adm-po-adopt").count(), 0, "ohne Vergleich nichts zu übernehmen");
  assert.equal(norm(await flaeche(page, "transglobal:22").locator(".adm-po-custom").innerText()), "Selbst festlegen");
  assert.equal(await feld(page, "transglobal:22", 1).count(), 0, "das Feld erscheint erst nach „Selbst festlegen“");
  assert.equal(await details(page, "transglobal:22").count(), 0, "Details erst mit Vergleich");
  assert.equal(await alleZeile(page, "transglobal:22"), "Alle Gewichte 0 % eigener Satz · Gilt für jedes Gewicht ohne eigenen Satz.");
  assert.equal(norm(await panel(page, "transglobal:22").locator(".adm-po-all-change").getAttribute("aria-label")), "Alle Gewichte: Ändern, UPS Standard");
  assert.equal(await zaehler(page), "Keine Änderungen");
  assert.equal(await page.locator("#adm-tarif-save").isDisabled(), true);
  // Reiter wechseln: die Klasse erbt weiter den Satz für alle Gewichte — sichtbar als Quelle, nichts wird übernommen.
  await reiter(page, "transglobal:22", 3).click();
  assert.equal(await reiter(page, "transglobal:22", 3).getAttribute("aria-selected"), "true");
  assert.equal(await flaeche(page, "transglobal:22").getAttribute("data-class"), "3");
  assert.equal((await kennzahlen(page, "transglobal:22")).current, "Ihr Aufschlag: 0 % | Satz für alle Gewichte");
  // Ein anderer Tarif schließt den ersten; JUMiNGO-Gruppe 1: eigener Satz in Klasse 1, Kontosatz in Klasse 2.
  await kopf(page, "jumingo:1").click();
  assert.equal(await kopf(page, "transglobal:22").getAttribute("aria-expanded"), "false");
  assert.equal(await panel(page, "transglobal:22").isHidden(), true);
  await reiter(page, "jumingo:1", 1).click();
  assert.equal((await kennzahlen(page, "jumingo:1")).current, "Ihr Aufschlag: 30 % | eigener Satz für dieses Gewicht");
  assert.deepEqual(await hinweise(page, "jumingo:1"), []);
  await reiter(page, "jumingo:1", 2).click();
  assert.equal((await kennzahlen(page, "jumingo:1")).current, "Ihr Aufschlag: 20 % | Standardaufschlag des Kontos");
  assert.deepEqual((await hinweise(page, "jumingo:1")).map(([s]) => s), ["below_target"]);
  assert.equal(await alleZeile(page, "jumingo:1"), "Alle Gewichte 20 % Standardaufschlag des Kontos · Gilt für jedes Gewicht ohne eigenen Satz.");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length], [0, 0, 0], "Tarif- und Reiterwechsel speichern und rufen nichts ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Preise vergleichen: genau ein Abruf; Empfehlung und Mehr pro Sendung je Klasse; fehlender Vergleich; Details; UPS 22 mit Abholzuschlag", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  assert.deepEqual(state.refreshes[0], { uid: 7, body: { destinationCountry: "DE" } });
  assert.equal(await stand(page), "Stand: 17.11.2026, 10:12 Uhr");
  assert.deepEqual(await reihenfolge(page, "transglobal"), [22, 23, 84, 29, 85, 86, 87].map((k) => `transglobal:${k}`), "größter Mehrgewinn zuerst");
  assert.deepEqual(await reihenfolge(page, "jumingo"), [5, 1, 2, 3, 4, 6, 7, 8, 9].map((k) => `jumingo:${k}`));
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-plus").innerText()), "bis +6,96 € pro Sendung");
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-tarif-meta").innerText()), "Ihr Aufschlag 0 % Empfohlen 30 %");
  assert.equal(await badge(page, "transglobal:22").getAttribute("data-status"), "below_target");
  assert.equal(norm(await badge(page, "transglobal:85").innerText()), "Preisvorteil gefährdet");
  assert.equal(await badge(page, "transglobal:23").count(), 0, "mehr Gewinn ist kein Warnzustand — das Plus sagt es");
  assert.equal(await kopf(page, "transglobal:29").locator(".adm-po-plus").count(), 0, "kein Plus ohne Empfehlung nach oben");

  // UPS Express Saver, bis 5 kg: Empfehlung 35 %, +0,72 € Deckungsbeitrag am begrenzenden Beispielpaket (5 kg).
  await kopf(page, "transglobal:23").click();
  await reiter(page, "transglobal:23", 1).click();
  assert.deepEqual(await kennzahlen(page, "transglobal:23"), {
    current: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
    recommended: "Empfohlen: 35 %",
    more: "Mehr pro Sendung: +0,72 € | mit Empfehlung Deckungsbeitrag, Beispiel 5 kg",
  });
  assert.equal(await flaeche(page, "transglobal:23").locator(".adm-po-metric--plus").count(), 1);
  assert.deepEqual(await hinweise(page, "transglobal:23"), []);
  const adopt = flaeche(page, "transglobal:23").locator(".adm-po-adopt");
  assert.equal(norm(await adopt.innerText()), "Empfehlung übernehmen");
  assert.equal(norm(await adopt.getAttribute("aria-label")), "Empfehlung übernehmen: UPS Express Saver, bis 5 kg, 35 %");
  // Details: Einkauf, Kundenpreis und Deckungsbeitrag heute → mit Empfehlung, Vergleichsangebot, Grenze, Datenbasis.
  await details(page, "transglobal:23").locator("> summary").click();
  assert.equal(norm(await details(page, "transglobal:23").locator("> summary").innerText()), "Details anzeigen");
  assert.equal(norm(await details(page, "transglobal:23").locator(".adm-po-detail-lead").innerText()), "Beispielpaket 5 kg · heute → mit Empfehlung");
  assert.deepEqual(await detailListe(page, "transglobal:23"), [
    ["Einkaufspreis", "14,40 €"], ["Kundenpreis", "18,72 € → 19,44 €"], ["Deckungsbeitrag", "4,32 € → 5,04 €"],
    ["Vergleichsangebot", "22,88 € · UPS Express Saver (JUMiNGO) · bei uns 15 % günstiger"],
  ]);
  const texte = (await details(page, "transglobal:23").locator("p.adm-po-detail-text").allInnerTexts()).map(norm);
  assert.equal(texte[0], `Begründung: ${MEHR_GEWINN}`);
  assert.equal(texte[2], "Sichere Obergrenze: 50 % (begrenzt durch 5 kg) · Verglichene Pakete: 2 von 2");
  assert.match(texte[3], /^Datenbasis: Stand 17\.11\.2026, 10:12 Uhr · Zielland Deutschland · Abholung /);
  assert.match(texte.at(-1), /^Deckungsbeitrag = Kundenpreis minus Einkaufspreis, netto, je Beispielsendung – ohne Fixkosten/);
  assert.deepEqual((await details(page, "transglobal:23").locator('tr[data-scenario="w5"] td').allInnerTexts()).map(norm),
    ["5 kg", "14,40 €", "UPS Express Saver · JUMiNGO · Tarif-ID 3702 · gleichwertig", "17,60 €", "30 %", "22,88 €", "bei uns 18,2 % günstiger", "50 %"]);
  // Über 20 kg: eigene Empfehlung der Klasse.
  await reiter(page, "transglobal:23", 4).click();
  assert.equal((await kennzahlen(page, "transglobal:23")).recommended, "Empfohlen: 40 %");

  // UPS Express, bis 5 kg: gut eingestellt — Empfehlung sichtbar, nichts zu übernehmen.
  await kopf(page, "transglobal:29").click();
  await reiter(page, "transglobal:29", 1).click();
  assert.deepEqual(await kennzahlen(page, "transglobal:29"), {
    current: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
    recommended: "Empfohlen: 30 % | Passt bereits",
    more: "Mehr pro Sendung: — | Keine Änderung vorgeschlagen",
  });
  assert.equal(await flaeche(page, "transglobal:29").locator(".adm-po-adopt").count(), 0);
  // Fehlender Vergleich: keine erfundene Empfehlung, kurzer Grund, nur „Selbst festlegen“.
  await kopf(page, "transglobal:86").click();
  await reiter(page, "transglobal:86", 4).click();
  assert.deepEqual(await kennzahlen(page, "transglobal:86"), {
    current: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
    recommended: "Empfohlen: Keine Empfehlung verfügbar | Kein vergleichbares Angebot",
    more: "Mehr pro Sendung: — | Keine Empfehlung verfügbar",
  });
  assert.equal(await flaeche(page, "transglobal:86").locator(".adm-po-adopt").count(), 0);
  assert.equal(await flaeche(page, "transglobal:86").locator(".adm-po-custom").count(), 1);
  await kopf(page, "transglobal:87").click();
  assert.equal((await kennzahlen(page, "transglobal:87")).recommended, "Empfohlen: Keine Empfehlung verfügbar | Tarif hier nicht verfügbar");

  // UPS 22: Vergleich ohne / mit Abholzuschlag — Variante des Servers, Warnung vorne.
  await kopf(page, "transglobal:22").click();
  await reiter(page, "transglobal:22", 1).click();
  assert.deepEqual(await kennzahlen(page, "transglobal:22"), {
    current: "Ihr Aufschlag: 0 % | Satz für alle Gewichte",
    recommended: "Empfohlen: 30 %",
    more: "Mehr pro Sendung: +2,88 € | mit Empfehlung Deckungsbeitrag, Beispiel 5 kg",
  });
  assert.deepEqual(await hinweise(page, "transglobal:22"), [["below_target", UNTER_ZIEL]]);
  await details(page, "transglobal:22").locator("> summary").click();
  const sd = details(page, "transglobal:22").locator(".adm-po-sameday");
  assert.equal(norm(await sd.locator("legend").innerText()), "Vergleich für UPS Standard");
  assert.deepEqual((await sd.locator("label").allInnerTexts()).map(norm), ["Ohne Abholzuschlag", "Mit Abholzuschlag (3,90 €)"]);
  await sd.locator("label", { hasText: "Mit Abholzuschlag" }).click();
  assert.deepEqual(await kennzahlen(page, "transglobal:22"), {
    current: "Ihr Aufschlag: 0 % | Satz für alle Gewichte",
    recommended: "Empfohlen: 25 % | mit Abholzuschlag",
    more: "Mehr pro Sendung: +3,38 € | mit Empfehlung Deckungsbeitrag, Beispiel 5 kg",
  });
  assert.deepEqual(await hinweise(page, "transglobal:22"), [["below_target", UNTER_ZIEL], ["at_risk", `${GEFAEHRDET} JUMiNGO kauft dieses Gewicht günstiger ein.`]]);
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-plus").innerText()), "bis +6,78 € pro Sendung");
  assert.deepEqual((await detailListe(page, "transglobal:22")).slice(1, 4), [
    ["Kundenpreis", "13,50 € → 16,88 €"], ["Deckungsbeitrag", "0,00 € → 3,38 €"], ["Vergleichsangebot", "14,30 € · UPS Standard (JUMiNGO) · bei uns 18 % teurer"],
  ]);
  await sd.locator("label", { hasText: "Ohne Abholzuschlag" }).click();
  assert.equal((await kennzahlen(page, "transglobal:22")).recommended, "Empfohlen: 30 %");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length], [1, 0, 0], "Ansehen, Reiter und Umschalten rufen nichts ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — „Empfehlung übernehmen“ füllt nur das Feld; „Selbst festlegen“; entprellte Vorschau; „Alle Gewichte“ unangetastet; Verwerfen", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await reiter(page, "transglobal:23", 1).click();
  await flaeche(page, "transglobal:23").locator(".adm-po-adopt").click();
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "35,00");
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-23-1");
  assert.equal(norm(await flaeche(page, "transglobal:23").locator(".adm-po-adopted").innerText()), "Empfehlung eingetragen");
  assert.equal(await flaeche(page, "transglobal:23").locator(".adm-po-adopt").count(), 0);
  assert.equal(norm(await flaeche(page, "transglobal:23").locator(".adm-po-edit-label").innerText()), "Neuer Aufschlag · bis 5 kg");
  assert.equal(norm(await page.locator("#adm-tarif-input-transglobal-23-1-hint").innerText()), "Mindestens 25 %. Leer = kein eigener Satz.");
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  assert.equal(norm(await kopf(page, "transglobal:23").locator(".adm-po-tarif-dirty").innerText()), "● 1 ungespeicherte Änderung");
  assert.equal(norm(await reiter(page, "transglobal:23", 1).innerText()), "Bis 5 kg (noch nicht gespeichert)");
  assert.equal(state.puts.length, 0, "Übernehmen speichert nicht");
  await warte(() => state.previews.length === 1);
  assert.deepEqual(state.previews[0], { uid: 7, runId: "41", body: { entries: [{ provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 }] } });
  await warte(async () => (await kennzahlen(page, "transglobal:23")).more.includes("mit Ihrer Eingabe"));
  assert.equal((await kennzahlen(page, "transglobal:23")).more, "Mehr pro Sendung: +0,72 € | mit Ihrer Eingabe Deckungsbeitrag, Beispiel 5 kg");
  assert.equal((await kennzahlen(page, "transglobal:23")).current, "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos", "„Ihr Aufschlag“ bleibt der gespeicherte Satz");
  // „Alle Gewichte“ wird weder übernommen noch überschrieben.
  assert.equal(await alleZeile(page, "transglobal:23"), "Alle Gewichte 30 % Expressaufschlag des Kontos · Gilt für jedes Gewicht ohne eigenen Satz.");
  assert.equal(await feld(page, "transglobal:23", 0).count(), 0);
  // Selbst festlegen (über 5–10 kg): Feld leer und fokussiert; mehrere Zeichen → genau EINE weitere Vorschau.
  await reiter(page, "transglobal:23", 2).click();
  assert.equal(await feld(page, "transglobal:23", 2).count(), 0);
  await flaeche(page, "transglobal:23").locator(".adm-po-custom").click();
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-23-2");
  assert.equal(await feld(page, "transglobal:23", 2).inputValue(), "");
  await feld(page, "transglobal:23", 2).pressSequentially("42", { delay: 40 });
  await warte(() => state.previews.length === 2);
  await page.waitForTimeout(450);
  assert.equal(state.previews.length, 2, "entprellt: kein Zwischenstand „4“");
  assert.deepEqual(state.previews[1].body.entries.map((e) => [e.productKey, e.weightClass, e.markupPercent]), [[23, 1, 35], [23, 2, 42]]);
  await warte(async () => (await kennzahlen(page, "transglobal:23")).more.startsWith("Mehr pro Sendung: +2,30 €"));
  assert.deepEqual(await kennzahlen(page, "transglobal:23"), {
    current: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
    recommended: "Empfohlen: 40 %",
    more: "Mehr pro Sendung: +2,30 € | mit Ihrer Eingabe Deckungsbeitrag, Beispiel 10 kg",
  });
  assert.equal(norm(await flaeche(page, "transglobal:23").locator(".adm-po-pending").innerText()), "noch nicht gespeichert");
  await details(page, "transglobal:23").locator("> summary").click();
  assert.equal(norm(await details(page, "transglobal:23").locator(".adm-po-detail-lead").innerText()), "Beispielpaket 10 kg · heute → mit Ihrer Eingabe");
  assert.deepEqual((await detailListe(page, "transglobal:23")).slice(1, 3), [["Kundenpreis", "24,96 € → 27,26 €"], ["Deckungsbeitrag", "5,76 € → 8,06 €"]]);
  assert.equal(await zaehler(page), "● 2 ungespeicherte Änderungen");
  // Verwerfen: Felder weg, keine Vorschau mehr, nichts gespeichert, kein Abruf.
  await page.locator("#adm-tarif-discard").click();
  assert.equal(await feld(page, "transglobal:23", 2).count(), 0);
  assert.equal(await zaehler(page), "Keine Änderungen");
  await page.waitForTimeout(450);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length], [1, 2, 0]);
  assert.equal((await kennzahlen(page, "transglobal:23")).more, "Mehr pro Sendung: +1,92 € | mit Empfehlung Deckungsbeitrag, Beispiel 10 kg");
  await reiter(page, "transglobal:23", 1).click();
  assert.equal(await feld(page, "transglobal:23", 1).count(), 0);
  assert.equal(await flaeche(page, "transglobal:23").locator(".adm-po-adopt").count(), 1, "nach dem Verwerfen wieder übernehmbar");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Speichern → Bestätigungsdialog → genau ein PUT; Fokus auf der Meldung; Verlauf; Zurücksetzen über denselben Dialog", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await reiter(page, "transglobal:23", 1).click();
  await flaeche(page, "transglobal:23").locator(".adm-po-adopt").click();
  // DHL Express 9:00: „Alle Gewichte“ nur über die eigene Zeile ändern.
  await kopf(page, "transglobal:85").click();
  await reiter(page, "transglobal:85", 1).click();
  assert.equal(await alleZeile(page, "transglobal:85"), "Alle Gewichte 35 % eigener Satz · Gilt für jedes Gewicht ohne eigenen Satz.");
  await panel(page, "transglobal:85").locator(".adm-po-all-change").click();
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-85-0");
  assert.equal(await feld(page, "transglobal:85", 0).inputValue(), "35,00");
  await feld(page, "transglobal:85", 0).fill("40");
  await warte(() => state.previews.length >= 1 && Array.isArray(state.previews.at(-1).body.entries) && state.previews.at(-1).body.entries.length === 2);
  await warte(async () => (await kennzahlen(page, "transglobal:85")).more.includes("mit Ihrer Eingabe"));
  assert.equal((await kennzahlen(page, "transglobal:85")).more, "Mehr pro Sendung: +3,60 € | mit Ihrer Eingabe Deckungsbeitrag, Beispiel 5 kg", "die Klasse erbt den Entwurf für alle Gewichte");
  assert.deepEqual((await hinweise(page, "transglobal:85")).map(([s, t]) => [s, t.startsWith("Mit Ihrer Eingabe: ")]), [["at_risk", true]]);
  assert.equal(await zaehler(page), "● 2 ungespeicherte Änderungen");
  assert.equal(norm(await page.locator("#adm-tarif-save").innerText()), "Speichern");
  await page.locator("#adm-tarif-save").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const text = norm(await dialog.innerText());
  assert.match(text, /Neue Aufschläge speichern\?/);
  assert.match(text, /Muster Logistik GmbH/);
  assert.match(text, /Grundlage: Preisvergleich vom 17\.11\.2026, 10:12 Uhr\./);
  assert.match(text, /Bereits angezeigte Angebote melden beim Buchen eine Preisänderung/);
  assert.equal(norm(await page.locator("#adm-tarif-confirm").innerText()), "Ja, speichern");
  const a = dialog.locator('li.adm-po-change[data-key="transglobal:23:1"]');
  assert.equal(norm(await a.locator(".adm-po-change-name").innerText()), "UPS Express Saver · Transglobal · bis 5 kg");
  assert.equal(norm(await a.locator(".adm-po-change-values").innerText()), "kein eigener Satz (30 %) → 35 %");
  assert.deepEqual((await a.locator(".adm-po-change-impact").allInnerTexts()).map(norm), ["bis 5 kg, Beispielpaket 5 kg: Kunde zahlt 19,44 € statt 18,72 € · bei uns 15 % günstiger"]);
  assert.equal(await a.locator(".adm-po-change-warn").count(), 0);
  const b = dialog.locator('li.adm-po-change[data-key="transglobal:85:0"]');
  assert.equal(norm(await b.locator(".adm-po-change-name").innerText()), "DHL Express 9:00 · Transglobal · Alle Gewichte");
  assert.equal(norm(await b.locator(".adm-po-change-values").innerText()), "35 % → 40 %");
  const wirkung = (await b.locator(".adm-po-change-impact").allInnerTexts()).map(norm);
  assert.equal(wirkung.length, 4, "eine Zeile je Gewichtsklasse");
  assert.equal(wirkung[0], "bis 5 kg, Beispielpaket 5 kg: Kunde zahlt 100,80 € statt 97,20 € · bei uns 76,2 % teurer");
  assert.equal(wirkung[2], "über 10 bis 20 kg, Beispielpaket 12 kg: Kunde zahlt 142,80 € statt 137,70 €");
  assert.deepEqual((await b.locator(".adm-po-change-warn .adm-po-badge").allInnerTexts()).map(norm), ["Preisvorteil gefährdet", "Kein verlässlicher Vergleich"]);
  // Abbrechen speichert nichts.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(state.puts.length, 0);
  // Bestätigen: genau EIN PUT mit genau den zwei Einträgen — der Bestandswert 0 % von UPS Standard ist nicht dabei.
  await page.locator("#adm-tarif-save").click();
  await page.locator("#adm-tarif-confirm").click();
  await page.locator(`${KARTE} .alert-success`).waitFor();
  assert.equal(state.puts.length, 1);
  assert.deepEqual(state.puts[0], { uid: 7, body: { entries: [
    { provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 },
    { provider: "transglobal", productKey: 85, weightClass: 0, markupPercent: 40 },
  ] } });
  assert.equal(norm(await page.locator(`${KARTE} .alert-success`).innerText()), "Gespeichert. Die Aufschläge gelten ab jetzt für neue Preisanfragen dieses Kunden.");
  await warte(() => page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("alert-success")));
  assert.equal(await zaehler(page), "Keine Änderungen");
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-badge`).innerText()), "4 individuell", "ein neuer Satz (23, bis 5 kg), einer geändert (85)");
  assert.equal((await kennzahlen(page, "transglobal:85")).current, "Ihr Aufschlag: 40 % | Satz für alle Gewichte");
  assert.equal(await alleZeile(page, "transglobal:85"), "Alle Gewichte 40 % eigener Satz · Gilt für jedes Gewicht ohne eigenen Satz.");
  assert.equal(await feld(page, "transglobal:85", 0).count(), 0, "nach dem Speichern wieder die ruhige Zeile");
  await warte(() => state.previews.length >= 1 && Object.keys(state.previews.at(-1).body).length === 0);
  assert.equal(state.refreshes.length, 1, "Speichern ruft keinen Provider; die Basis wird ohne Abruf neu gerechnet");

  // Verlauf: erst beim Aufklappen geladen, neueste Änderung zuerst.
  assert.equal(state.audits.length, 0);
  await page.locator("#adm-po-history > summary").click();
  await page.locator("#adm-po-history li.adm-po-history-item").first().waitFor();
  assert.deepEqual(state.audits[0], { action: "user.tariff_markup_change", target_user_id: "7", limit: "20", offset: "0" });
  const eintraege = page.locator("#adm-po-history li.adm-po-history-item");
  assert.deepEqual(await eintraege.evaluateAll((els) => els.map((e) => e.dataset.entry)), ["101", "100", "3", "2", "1"]);
  const was = async (id) => norm(await page.locator(`#adm-po-history li[data-entry="${id}"] .adm-po-history-what`).innerText());
  assert.equal(await was("101"), "DHL Express 9:00 · Transglobal · Alle Gewichte: 35 % → 40 %");
  assert.equal(norm(await page.locator('#adm-po-history li[data-entry="101"] .adm-po-history-when').innerText()), "17.11.2026, 11:15 Uhr · Anna Admin");
  assert.equal(await was("100"), "UPS Express Saver · Transglobal · bis 5 kg: kein eigener Satz → 35 %");
  assert.equal(await was("1"), "UPS Standard · Transglobal · Alle Gewichte: 20 % → 0 %");
  assert.equal(norm(await page.locator('#adm-po-history li[data-entry="1"] .adm-po-src').innerText()), "Alter Wert unter der Untergrenze – nicht mehr speicherbar.");
  assert.equal(await page.locator('#adm-po-history li[data-entry="1"] button').count(), 0, "20 % wäre ein neuer Wert unter 25 %");
  // Zurücksetzen trägt den alten Wert als Entwurf ein — gespeichert wird nur über denselben Dialog.
  await page.locator('#adm-po-history li[data-entry="101"] button', { hasText: "Auf alten Wert zurücksetzen" }).click();
  assert.equal(await kopf(page, "transglobal:85").getAttribute("aria-expanded"), "true");
  assert.equal(await feld(page, "transglobal:85", 0).inputValue(), "35,00");
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-85-0");
  assert.equal(norm(await page.locator(`${KARTE} .alert-info`).innerText()), "Der alte Wert ist eingetragen. Bitte prüfen und speichern.");
  assert.equal(state.puts.length, 1, "Zurücksetzen speichert nicht selbst");
  await page.locator("#adm-tarif-save").click();
  assert.equal(norm(await page.getByRole("dialog").locator('li[data-key="transglobal:85:0"] .adm-po-change-values').innerText()), "40 % → 35 %");
  await page.locator("#adm-tarif-confirm").click();
  await warte(() => state.puts.length === 2);
  assert.deepEqual(state.puts[1].body, { entries: [{ provider: "transglobal", productKey: 85, weightClass: 0, markupPercent: 35 }] });
  await warte(() => state.audits.length === 2);
  await warte(async () => (await eintraege.first().getAttribute("data-entry")) === "102");
  assert.equal(await was("102"), "DHL Express 9:00 · Transglobal · Alle Gewichte: 40 % → 35 %");
  assert.equal(state.refreshes.length, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — Untergrenze: neuer Wert unter 25 % gesperrt, unveränderter Bestandswert erlaubt, Server-400 am betroffenen Feld", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await kopf(page, "transglobal:22").click();
  await panel(page, "transglobal:22").locator(".adm-po-all-change").click();
  assert.equal(await feld(page, "transglobal:22", 0).inputValue(), "0,00", "der Bestandswert 0 % steht im Feld");
  await feld(page, "transglobal:22", 0).fill("0");
  assert.equal(await zaehler(page), "Keine Änderungen", "derselbe Bestandswert ist keine Änderung");
  await feld(page, "transglobal:22", 0).fill("10");
  await page.keyboard.press("Tab");
  const err = page.locator("#adm-tarif-input-transglobal-22-0-error");
  assert.equal(norm(await err.innerText()), FLOOR);
  assert.equal(await feld(page, "transglobal:22", 0).getAttribute("aria-invalid"), "true");
  assert.match(await feld(page, "transglobal:22", 0).getAttribute("aria-describedby"), /adm-tarif-input-transglobal-22-0-error/);
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  await page.locator("#adm-tarif-save").click();
  assert.equal(await page.getByRole("dialog").count(), 0, "unter der Untergrenze öffnet kein Dialog");
  assert.match(norm(await page.locator(`${KARTE} .adm-po-save p.field-error`).innerText()), /UPS Standard \(Transglobal\) · Alle Gewichte: Neue Aufschläge müssen mindestens 25 % betragen/);
  await feld(page, "transglobal:22", 0).fill("25");
  assert.equal(await err.count(), 0);
  // Der Server lehnt trotzdem ab (z. B. andere Untergrenze): Meldung am Feld, das er nennt — Tarif und Reiter öffnen sich.
  await kopf(page, "jumingo:1").click();
  await reiter(page, "jumingo:1", 2).click();
  await flaeche(page, "jumingo:1").locator(".adm-po-custom").click();
  await feld(page, "jumingo:1", 2).fill("25");
  state.putFehler = { status: 400, body: { error: "Neue Aufschläge müssen mindestens 25 % betragen. Bestehende niedrigere Werte bleiben unverändert, solange sie nicht geändert werden.",
    code: "MARKUP_BELOW_MINIMUM", provider: "jumingo", productKey: 1, weightClass: 2 } };
  await kopf(page, "transglobal:22").click();
  await reiter(page, "transglobal:22", 1).click();
  await page.locator("#adm-tarif-save").click();
  await page.locator("#adm-tarif-confirm").click();
  await page.locator(`${KARTE} .adm-po-save .alert-error`).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(state.puts.length, 1);
  assert.equal(await kopf(page, "jumingo:1").getAttribute("aria-expanded"), "true", "der betroffene Tarif öffnet sich");
  assert.equal(await reiter(page, "jumingo:1", 2).getAttribute("aria-selected"), "true", "auf dem betroffenen Gewicht");
  assert.equal(await feld(page, "jumingo:1", 2).getAttribute("aria-invalid"), "true");
  assert.match(norm(await page.locator("#adm-tarif-input-jumingo-1-2-error").innerText()), /mindestens 25 %/);
  assert.equal(await zaehler(page), "● 2 ungespeicherte Änderungen", "Entwürfe bleiben erhalten");
  assert.equal(state.refreshes.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("G — Fehlerpfade: Abruf 500/429, Vorschau 410 ohne automatischen Abruf, Speichern 500, Verlauf 500", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  state.refreshStatus = 500;
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-po-compare [role="alert"]`, { hasText: "Preise konnten nicht abgerufen werden. Bitte erneut versuchen." }).waitFor();
  assert.equal(await page.locator("#adm-tarif-refresh").getAttribute("aria-busy"), null);
  state.refreshStatus = 429;
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-po-compare [role="alert"]`, { hasText: "Höchstens fünf Preisvergleiche je 15 Minuten." }).waitFor();
  assert.equal(await stand(page), OHNE_BASIS, "kein Stand ohne Basis");
  state.refreshStatus = null;
  await vergleiche(page, state);
  assert.equal(await page.locator(`${KARTE} .adm-po-compare .alert-error`).count(), 0, "alte Meldung verschwindet");
  // Vorschau meldet „abgelaufen“: Basis verworfen, Hinweis, KEIN automatischer neuer Abruf; der Entwurf bleibt.
  state.previewStatus = 410;
  await kopf(page, "transglobal:23").click();
  await reiter(page, "transglobal:23", 1).click();
  await flaeche(page, "transglobal:23").locator(".adm-po-custom").click();
  await feld(page, "transglobal:23", 1).fill("40");
  await page.locator(`${KARTE} .adm-tarif-note--warn`).waitFor();
  assert.match(norm(await page.locator(`${KARTE} .adm-tarif-note--warn`).innerText()), /^Preisvergleich erneut ausführen\. Der letzte Preisvergleich ist älter als 24 Stunden/);
  assert.equal((await kennzahlen(page, "transglobal:23")).recommended, "Empfohlen: Keine Empfehlung verfügbar | Erst Preise vergleichen", "ohne Basis keine Empfehlung");
  assert.equal(await details(page, "transglobal:23").count(), 0);
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "40");
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung", "die Änderung bleibt offen");
  await page.waitForTimeout(400);
  assert.equal(state.refreshes.length, 3, "nichts wird automatisch abgerufen");
  state.previewStatus = null;
  await vergleiche(page, state);
  await warte(async () => (await kennzahlen(page, "transglobal:23")).more.includes("mit Ihrer Eingabe"));
  // Speichern scheitert: Dialog zu, Meldung, Entwurf bleibt.
  state.putFehler = { status: 500, body: { error: "Interner Fehler." } };
  await page.locator("#adm-tarif-save").click();
  await page.locator("#adm-tarif-confirm").click();
  await page.locator(`${KARTE} .adm-po-save .alert-error`, { hasText: "Die Aufschläge konnten nicht gespeichert werden. Es wurde nichts geändert." }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "40");
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  assert.equal(state.puts.length, 1);
  // Verlauf scheitert: Meldung im Verlauf.
  state.auditStatus = 500;
  await page.locator("#adm-po-history > summary").click();
  await page.locator("#adm-po-history .alert-error", { hasText: "Der Verlauf konnte nicht geladen werden." }).waitFor();
  assert.equal(state.refreshes.length, 4);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("H — Tastatur: Tarifkopf, Reiter mit Pfeiltasten/Pos1/Ende, „Empfehlung übernehmen“, Dialog mit Escape und Fokusrückgabe", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").focus();
  await page.keyboard.press("Enter");
  assert.equal(await kopf(page, "transglobal:23").getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Space");
  assert.equal(await kopf(page, "transglobal:23").getAttribute("aria-expanded"), "false");
  await page.keyboard.press("Enter");
  assert.equal(await kopf(page, "transglobal:23").getAttribute("aria-expanded"), "true");
  // Tab führt auf den aktiven Reiter; Pfeiltasten wechseln Klasse und Fokus (mit Umlauf), Pos1/Ende springen.
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(aktiv), "adm-po-tab-transglobal-23-1");
  const pruefeReiter = async (wc) => {
    assert.equal(await page.evaluate(aktiv), `adm-po-tab-transglobal-23-${wc}`);
    assert.equal(await reiter(page, "transglobal:23", wc).getAttribute("aria-selected"), "true");
    assert.equal(await flaeche(page, "transglobal:23").getAttribute("aria-labelledby"), `adm-po-tab-transglobal-23-${wc}`);
  };
  await page.keyboard.press("ArrowRight"); await pruefeReiter(2);
  await page.keyboard.press("End"); await pruefeReiter(4);
  await page.keyboard.press("ArrowRight"); await pruefeReiter(1);
  await page.keyboard.press("ArrowLeft"); await pruefeReiter(4);
  await page.keyboard.press("Home"); await pruefeReiter(1);
  assert.equal((await kennzahlen(page, "transglobal:23")).recommended, "Empfohlen: 35 %");
  // Nächstes Ziel nach den Reitern: „Empfehlung übernehmen“; danach steht der Fokus im Feld.
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains("adm-po-adopt")), true);
  await page.keyboard.press("Enter");
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "35,00");
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-23-1");
  assert.equal(state.puts.length, 0);
  await page.locator("#adm-tarif-save").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true, "Fokus im Dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(aktiv), "adm-tarif-save", "Fokus zurück auf „Speichern“");
  assert.equal(state.puts.length, 0);
  await page.keyboard.press("Enter");
  await page.locator("#adm-tarif-confirm").focus();
  await page.keyboard.press("Enter");
  await warte(() => state.puts.length === 1);
  assert.deepEqual(state.puts[0].body, { entries: [{ provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 }] });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("I — 390 px und 200 % Zoom: kein Querüberlauf, Reiter 2 × 2, Kennzahlen untereinander, Ziele groß genug", async () => {
  const { page, state, fehler } = await neueSeite({ width: 390, height: 844 });
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:22").click();
  await reiter(page, "transglobal:22", 1).click();
  const breite = () => page.evaluate(() => ({ seite: document.documentElement.scrollWidth, fenster: window.innerWidth }));
  let b = await breite();
  assert.ok(b.seite <= b.fenster, `kein Querüberlauf bei 390 px (${b.seite} > ${b.fenster})`);
  // Reiter als 2 × 2-Raster statt verdeckter Querscrollleiste.
  const box = async (wc) => reiter(page, "transglobal:22", wc).boundingBox();
  const [r1, r2, r3] = [await box(1), await box(2), await box(3)];
  assert.ok(Math.abs(r1.y - r2.y) < 2 && r3.y > r1.y + r1.height - 2 && Math.abs(r3.x - r1.x) < 2, "Reiter 2 × 2");
  assert.ok(r1.height >= 24 && r1.width >= 24, "Reiter mindestens 24 × 24 px");
  const tabs = await page.locator('#adm-po-panel-transglobal-22 [role="tablist"]').evaluate((el) => ({ scroll: el.scrollWidth, sichtbar: el.clientWidth }));
  assert.ok(tabs.scroll <= tabs.sichtbar, "kein verdeckter Reiter");
  const metrik = async (n) => flaeche(page, "transglobal:22").locator(`.adm-po-metric[data-metric="${n}"]`).boundingBox();
  assert.ok((await metrik("recommended")).y > (await metrik("current")).y, "Kennzahlen untereinander");
  const kopfBox = await kopf(page, "transglobal:22").boundingBox();
  assert.ok(kopfBox && kopfBox.height >= 44, "Tarifkopf als Touchziel");
  const adopt = await flaeche(page, "transglobal:22").locator(".adm-po-adopt").boundingBox();
  assert.ok(adopt && adopt.height >= 24 && adopt.width >= 24, "„Empfehlung übernehmen“ mindestens 24 × 24 px");
  const save = await page.locator("#adm-tarif-save").boundingBox();
  assert.ok(save && save.height >= 44, "„Speichern“ als Touchziel");
  // Details mit der Tabelle aller Beispielpakete: gestapelt, kein Querüberlauf.
  await details(page, "transglobal:22").locator("> summary").click();
  assert.equal(await details(page, "transglobal:22").locator("table.adm-po-samples thead").evaluate((el) => getComputedStyle(el).position), "absolute", "Spaltenköpfe nur für Screenreader, Werte gestapelt");
  b = await breite();
  assert.ok(b.seite <= b.fenster, `kein Querüberlauf mit offenen Details (${b.seite} > ${b.fenster})`);
  // 200 % Zoom auf einem 1280er Fenster = 640 CSS-Pixel.
  await page.setViewportSize({ width: 640, height: 500 });
  b = await breite();
  assert.ok(b.seite <= b.fenster, `kein Querüberlauf bei 200 % Zoom (${b.seite} > ${b.fenster})`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("J — Kundenwechsel in der App: Karte neu montiert, Entwürfe und Vergleichsbasis beginnen leer", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await reiter(page, "transglobal:23", 1).click();
  await flaeche(page, "transglobal:23").locator(".adm-po-adopt").click();
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  const getsVorher = state.gets;
  await page.evaluate(() => { window.history.pushState({}, "", "/admin/users/8"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await warte(() => state.gets > getsVorher, 15000);
  // Die Karte des neuen Kunden beginnt eingeklappt — ihr Inhalt ist da, aber nicht sichtbar.
  await page.locator(`${KARTE} .adm-tarif-badge`, { hasText: "0 individuell" }).waitFor({ state: "attached", timeout: 15000 });
  if (!(await page.locator(KARTE).evaluate((d) => d.open))) await page.locator(`${KARTE} > summary`).click();
  await kopf(page, "transglobal:22").waitFor();
  assert.equal(await page.locator("#adm-tarif-dirty").count(), 0, "der Entwurf von Kunde 7 wandert nicht mit");
  assert.equal(await stand(page), OHNE_BASIS, "keine fremde Vergleichsbasis");
  assert.equal(await page.locator(`${KARTE} .adm-po-tarif-head[aria-expanded="true"]`).count(), 0);
  await kopf(page, "transglobal:23").click();
  assert.equal(await feld(page, "transglobal:23", 1).count(), 0);
  assert.equal(await zaehler(page), "Keine Änderungen");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.puts.length], [1, 0]);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("K — Adminrechte: ein Kundenkonto sieht die Karte nicht und löst keinen Aufschlagsabruf aus", async () => {
  const { page, state, fehler } = await neueSeite();
  // Später registrierte Routen gehen vor: /kundenbereich meldet ein Kundenkonto statt des Admins.
  await page.route("**/kundenbereich", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: KONTEN[7] }) }));
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
  await page.waitForTimeout(400);
  assert.equal(await page.locator(KARTE).count(), 0);
  assert.deepEqual([state.gets, state.refreshes.length, state.previews.length, state.puts.length, state.audits.length], [0, 0, 0, 0, 0]);
  assert.deepEqual(fehler, []);
  await page.close();
});
