// E2E: „Versandpreise optimieren“ im Admin-Kundendetail (Preisoptimierung 2026-11-17). Echter Dev-Server, echtes
// Chromium, GEMOCKTES Backend (helpers/tariffMarkupsMock.mjs) mit demselben Vertrag wie routes/admin/tariffMarkups.js
// und lib/admin/tariffRecommendation.js; die Datenbankseite misst Backend customer-tariff-markups-pg, die Rechenseite
// pricing-optimization und admin-tariff-comparison.
//
//   A  Öffnen: Kopfzeile (Untergrenze, Ziel), sechs Schritte, alle Tarife — kein Providerkontakt, keine Vorschau
//   B  Tarif auswählen: „Alle Gewichte“ + vier Gewichtsklassen, Bestandswert 0 % sichtbar, ohne Vergleich keine Empfehlung
//   C  Preise vergleichen: genau EIN Abruf; Empfehlung, Zustand, Begründung, Beispielpaket; Sortierung nach Mehrgewinn;
//      UPS 22 mit/ohne Abholzuschlag; Expertendetails
//   D  Empfehlung übernehmen: Wert im Feld, Fokus folgt; entprellte Vorschau mit entries; Gewinn und Kundenpreis;
//      Verwerfen — nichts gespeichert, kein weiterer Abruf
//   E  Prüfen → Dialog (bisher → neu, Wirkung, Datum, Warnungen) → genau EIN PUT; Verlauf; Zurücksetzen über denselben Weg
//   F  Untergrenze: neuer Wert unter 25 % gesperrt, unveränderter Bestandswert erlaubt; Server-400 am betroffenen Feld
//   G  Fehlerpfade: Abruf 500/429, Vorschau 410 (erneut vergleichen, nichts automatisch), Speichern 500, Verlauf 500
//   H  Tastatur: Tarifkopf, Feld, „Empfehlung übernehmen“, Dialog mit Escape und Fokusrückgabe
//   I  390 px und 200 % Zoom: kein Querüberlauf, Spaltenbeschriftungen sichtbar, Ziele groß genug
//   J  Kundenwechsel in der App: Karte neu, Entwürfe und Vergleichsbasis beginnen leer
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { createTariffMock } from "./helpers/tariffMarkupsMock.mjs";

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
const zeile = (page, id, wc) => page.locator(`#adm-po-panel-${slug(id)} .adm-po-row[data-class="${wc}"]`);
const feld = (page, id, wc) => page.locator(`#adm-tarif-input-${slug(`${id}:${wc}`)}`);
const aktuell = async (page, id, wc) => {
  const zelle = zeile(page, id, wc).locator(".adm-po-cell").nth(0);
  return `${norm(await zelle.locator(".adm-po-num").innerText())} | ${norm(await zelle.locator(".adm-po-src").innerText())}`;
};
const empfehlung = async (page, id, wc) => norm(await zeile(page, id, wc).locator(".adm-po-reco .adm-po-num").innerText());
const zustand = (page, id, wc) => zeile(page, id, wc).locator(".adm-po-badge").getAttribute("data-status");
const warum = async (page, id, wc) => norm(await zeile(page, id, wc).locator(".adm-po-why").innerText());
const gewinn = (page, id, wc) => page.locator(`#adm-po-panel-${slug(id)} table.adm-po-profit tr[data-class="${wc}"]`);
const gewinnZellen = async (page, id, wc) => (await gewinn(page, id, wc).locator("td").allInnerTexts()).map(norm);
const reihenfolge = (page, provider) => page.locator(`${KARTE} .adm-po-group[data-provider="${provider}"] li.adm-po-tarif`).evaluateAll((els) => els.map((e) => e.dataset.tariff));
const schritt = async (page) => norm(await page.locator(`${KARTE} li.adm-po-step[aria-current="step"] .adm-po-step-label`).innerText());
const zaehler = async (page) => norm(await page.locator("#adm-tarif-dirty").innerText());

test("A — Öffnen: Kopfzeile, sechs Schritte, alle Tarife; kein Providerkontakt, keine Vorschau, kein Speichern", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  assert.equal(norm(await page.locator(`${KARTE} .adm-disclosure-title`).innerText()), "Versandpreise optimieren");
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-badge`).innerText()), "3 individuell");
  assert.equal(norm(await page.locator(`${KARTE} .adm-po-fact--floor`).innerText()), "Untergrenze 25 %");
  assert.match(norm(await page.locator(`${KARTE} .adm-po-facts`).innerText()), /Ziel: Transglobal mindestens 1 % günstiger als ein vergleichbares Angebot/);
  const schritte = await page.locator(`${KARTE} li.adm-po-step`).evaluateAll((els) => els.map((e) => ({ cls: e.className, aktuell: e.getAttribute("aria-current"), text: e.innerText.replace(/\s+/g, " ").trim() })));
  assert.equal(schritte.length, 6);
  assert.match(schritte[0].cls, /adm-po-step--done/);
  assert.match(schritte[0].text, /Kunde auswählen Muster Logistik GmbH/, "Schritt 1 nennt den Kunden");
  assert.equal(schritte[1].aktuell, "step");
  assert.equal(await schritt(page), "Tarif auswählen");
  assert.deepEqual(await reihenfolge(page, "transglobal"), [22, 23, 29, 84, 85, 86, 87].map((k) => `transglobal:${k}`), "ohne Vergleich: Reihenfolge des Servers");
  assert.deepEqual(await reihenfolge(page, "jumingo"), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `jumingo:${k}`));
  // Ohne Vergleich rot nur unter der Untergrenze (Bestandswert 0 %, geerbte 20 %), sonst „Noch nicht verglichen“.
  assert.equal(await badge(page, "transglobal:22").getAttribute("data-status"), "below_target");
  assert.equal(norm(await badge(page, "transglobal:22").innerText()), "Unter dem Zielaufschlag");
  assert.equal(await badge(page, "transglobal:23").getAttribute("data-status"), "not_compared");
  assert.equal(await badge(page, "jumingo:1").getAttribute("data-status"), "below_target");
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-tarif-meta").innerText()), "Heute 0 %");
  assert.equal(norm(await kopf(page, "jumingo:1").locator(".adm-po-tarif-meta").innerText()), "Heute 20–30 %");
  assert.equal(await page.locator(`${KARTE} .adm-po-tarif-head[aria-expanded="true"]`).count(), 0);
  assert.equal(await zaehler(page), "Keine Änderungen");
  assert.equal(await page.locator("#adm-tarif-save").isDisabled(), true);
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length, state.audits.length], [0, 0, 0, 0], "Öffnen fragt nur die gespeicherten Sätze ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — Tarif auswählen: „Alle Gewichte“ und vier Gewichtsklassen, Bestandswert sichtbar, ohne Vergleich keine Empfehlung", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await kopf(page, "transglobal:22").click();
  assert.equal(await kopf(page, "transglobal:22").getAttribute("aria-expanded"), "true");
  assert.equal(await schritt(page), "Empfohlene Gewichtsklassen ansehen");
  const labels = (await page.locator("#adm-po-panel-transglobal-22 .adm-po-row .adm-po-weight label").allInnerTexts()).map(norm);
  assert.deepEqual(labels, ["Alle Gewichte", "bis 5 kg", "über 5 bis 10 kg", "über 10 bis 20 kg", "über 20 kg"]);
  assert.equal(await feld(page, "transglobal:22", 0).inputValue(), "0,00", "der Bestandswert 0 % steht im Feld");
  for (const wc of [1, 2, 3, 4]) {
    assert.equal(await feld(page, "transglobal:22", wc).inputValue(), "", `Klasse ${wc}: kein eigener Satz`);
    assert.equal(await aktuell(page, "transglobal:22", wc), "0 % | Satz für alle Gewichte");
    assert.equal(await zustand(page, "transglobal:22", wc), "below_target");
    assert.equal(await zeile(page, "transglobal:22", wc).locator(".adm-po-reco .adm-po-num").count(), 0, "ohne Vergleich keine Empfehlung");
  }
  assert.equal(await warum(page, "transglobal:22", 0), "Gilt für jedes Gewicht ohne eigenen Satz.");
  assert.equal(await page.locator("#adm-po-panel-transglobal-22 .adm-po-sameday").count(), 0, "Abholzuschlag erst mit Vergleich");
  assert.match(norm(await page.locator("#adm-po-panel-transglobal-22").innerText()), /Noch kein Preisvergleich\. Empfehlungen und Gewinnvorschau erscheinen nach „Preise vergleichen“\./);
  // Ein anderer Tarif schließt den ersten; JUMiNGO-Gruppe 1 zeigt ihren eigenen Klassensatz.
  await kopf(page, "jumingo:1").click();
  assert.equal(await kopf(page, "transglobal:22").getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator("#adm-po-panel-transglobal-22").isHidden(), true);
  assert.equal(await feld(page, "jumingo:1", 1).inputValue(), "30,00");
  assert.equal(await aktuell(page, "jumingo:1", 1), "30 % | eigener Satz für dieses Gewicht");
  assert.equal(await aktuell(page, "jumingo:1", 2), "20 % | Standardaufschlag des Kontos");
  assert.equal(await aktuell(page, "jumingo:1", 0), "20 % | Standardaufschlag des Kontos");
  assert.equal(await zustand(page, "jumingo:1", 1), "not_compared");
  assert.equal(await zustand(page, "jumingo:1", 2), "below_target");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length], [0, 0, 0], "Tarifwechsel speichert und ruft nichts ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Preise vergleichen: genau ein Abruf; Empfehlung, Zustand und Beispielpaket je Klasse; Sortierung nach Mehrgewinn; UPS 22 mit/ohne Abholzuschlag", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  assert.deepEqual(state.refreshes[0], { uid: 7, body: { destinationCountry: "DE" } });
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-stand`).innerText()), "Stand: 17.11.2026, 10:12 Uhr");
  assert.deepEqual(await reihenfolge(page, "transglobal"), [22, 23, 84, 29, 85, 86, 87].map((k) => `transglobal:${k}`), "größter Mehrgewinn zuerst");
  assert.deepEqual(await reihenfolge(page, "jumingo"), [5, 1, 2, 3, 4, 6, 7, 8, 9].map((k) => `jumingo:${k}`));
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-plus").innerText()), "bis +6,96 € je Sendung möglich");
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-tarif-meta").innerText()), "Heute 0 % · Empfohlen 30 %");
  assert.equal(await badge(page, "transglobal:22").getAttribute("data-status"), "below_target");
  assert.equal(norm(await badge(page, "transglobal:29").innerText()), "Gut eingestellt");
  assert.equal(await kopf(page, "transglobal:29").locator(".adm-po-plus").count(), 0, "kein Plus ohne Empfehlung nach oben");
  assert.equal(norm(await badge(page, "transglobal:85").innerText()), "Preisvorteil gefährdet");
  assert.equal(norm(await badge(page, "transglobal:23").innerText()), "Hier ist mehr Gewinn möglich");

  await kopf(page, "transglobal:23").click();
  assert.equal(await schritt(page), "Aufschlag eingeben oder Empfehlung übernehmen");
  assert.equal(await empfehlung(page, "transglobal:23", 1), "35 %");
  assert.equal(await empfehlung(page, "transglobal:23", 4), "40 %");
  assert.equal(await zustand(page, "transglobal:23", 1), "more_profit");
  assert.equal(await warum(page, "transglobal:23", 1), MEHR_GEWINN);
  assert.equal(norm(await zeile(page, "transglobal:23", 1).locator(".adm-po-adopt").getAttribute("aria-label")), "Empfehlung übernehmen: UPS Express Saver, bis 5 kg, 35 %");
  assert.equal(await page.locator("#adm-po-panel-transglobal-23 .adm-po-sameday").count(), 0, "Abholzuschlag nur bei UPS Standard");
  // Gewinn und Kundenpreis mit der Empfehlung — am begrenzenden Beispielpaket (5 kg), Werte aus der Serverprojektion.
  assert.equal(await gewinn(page, "transglobal:23", 1).getAttribute("data-art"), "recommendation");
  assert.deepEqual(await gewinnZellen(page, "transglobal:23", 1),
    ["bis 5 kg", "5 kg", "30 % → 35 % mit Empfehlung", "4,32 € → 5,04 € +0,72 €", "18,72 € → 19,44 €", "22,88 € · bei uns 15 % günstiger"]);
  // Expertendetails: Einkauf, Vergleichsangebot, Obergrenze je Paket.
  await page.locator("#adm-po-expert-transglobal-23 > summary").click();
  const klasse1 = page.locator('#adm-po-expert-transglobal-23 .adm-po-expert-class[data-class="1"]');
  assert.equal(norm(await klasse1.locator("p.adm-markup-help").innerText()), "Sichere Obergrenze: 50 % (begrenzt durch 5 kg) · Verglichene Pakete: 2 von 2");
  assert.deepEqual((await klasse1.locator('tr[data-scenario="w5"] td').allInnerTexts()).map(norm),
    ["5 kg", "14,40 €", "UPS Express Saver · JUMiNGO · Tarif-ID 3702 · gleichwertig", "17,60 €", "30 %", "22,88 €", "bei uns 18,2 % günstiger", "50 %"]);

  // UPS 22: Vergleich mit und ohne Abholzuschlag.
  await kopf(page, "transglobal:22").click();
  const sd = page.locator("#adm-po-panel-transglobal-22 .adm-po-sameday");
  assert.equal(norm(await sd.locator("legend").innerText()), "Vergleich für UPS Standard");
  assert.deepEqual((await sd.locator("label").allInnerTexts()).map(norm), ["Ohne Abholzuschlag", "Mit Abholzuschlag (3,90 €)"]);
  assert.equal(await empfehlung(page, "transglobal:22", 1), "30 %");
  assert.equal(await warum(page, "transglobal:22", 1), UNTER_ZIEL);
  await sd.locator("label", { hasText: "Mit Abholzuschlag" }).click();
  assert.equal(await empfehlung(page, "transglobal:22", 1), "25 %");
  assert.equal(await warum(page, "transglobal:22", 1), `${UNTER_ZIEL} JUMiNGO kauft dieses Gewicht günstiger ein.`);
  assert.equal(norm(await kopf(page, "transglobal:22").locator(".adm-po-plus").innerText()), "bis +6,78 € je Sendung möglich");
  assert.deepEqual((await gewinnZellen(page, "transglobal:22", 1)).slice(4), ["13,50 € → 16,88 €", "14,30 € · bei uns 18 % teurer"]);
  await sd.locator("label", { hasText: "Ohne Abholzuschlag" }).click();
  assert.equal(await empfehlung(page, "transglobal:22", 1), "30 %");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length], [1, 0, 0], "Ansehen und Umschalten rufen nichts ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Empfehlung übernehmen: Wert und Fokus im Feld, entprellte Vorschau mit entries, Gewinn und Kundenpreis; Verwerfen", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await zeile(page, "transglobal:23", 1).locator(".adm-po-adopt").click();
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "35,00");
  await warte(async () => (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "adm-tarif-input-transglobal-23-1");
  assert.equal(norm(await zeile(page, "transglobal:23", 1).locator(".adm-po-reco .adm-po-src").innerText()), "übernommen");
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  assert.equal(norm(await kopf(page, "transglobal:23").locator(".adm-po-tarif-dirty").innerText()), "● 1 ungespeicherte Änderung");
  assert.equal(await schritt(page), "Gewinn und Kundenpreis prüfen");
  await warte(() => state.previews.length === 1);
  assert.deepEqual(state.previews[0], { uid: 7, runId: "41", body: { entries: [{ provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 }] } });
  await warte(async () => (await gewinn(page, "transglobal:23", 1).getAttribute("data-art")) === "draft");
  assert.deepEqual(await gewinnZellen(page, "transglobal:23", 1),
    ["bis 5 kg", "5 kg", "30 % → 35 % mit Ihrer Eingabe", "4,32 € → 5,04 € +0,72 €", "18,72 € → 19,44 €", "22,88 € · bei uns 15 % günstiger"]);
  assert.equal(await gewinn(page, "transglobal:23", 2).getAttribute("data-art"), "recommendation", "andere Klassen zeigen weiter die Empfehlung");
  // Tippen: mehrere Zeichen innerhalb der Entprellzeit → genau EINE weitere Vorschau mit dem Endwert.
  await feld(page, "transglobal:23", 2).pressSequentially("42", { delay: 40 });
  await warte(() => state.previews.length === 2);
  await page.waitForTimeout(450);
  assert.equal(state.previews.length, 2, "entprellt: kein Zwischenstand „4“");
  assert.deepEqual(state.previews[1].body.entries.map((e) => [e.productKey, e.weightClass, e.markupPercent]), [[23, 1, 35], [23, 2, 42]]);
  await warte(async () => (await gewinn(page, "transglobal:23", 2).getAttribute("data-art")) === "draft");
  assert.deepEqual((await gewinnZellen(page, "transglobal:23", 2)).slice(1, 5), ["10 kg", "30 % → 42 % mit Ihrer Eingabe", "5,76 € → 8,06 € +2,30 €", "24,96 € → 27,26 €"]);
  assert.equal(await aktuell(page, "transglobal:23", 2), "30 % | Expressaufschlag des Kontos", "„Aktuell“ bleibt der gespeicherte Satz");
  assert.match(norm(await zeile(page, "transglobal:23", 2).innerText()), /noch nicht gespeichert/);
  // Verwerfen: Felder zurück, keine Vorschau mehr, nichts gespeichert, kein Abruf.
  await page.locator("#adm-tarif-discard").click();
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "");
  assert.equal(await feld(page, "transglobal:23", 2).inputValue(), "");
  assert.equal(await zaehler(page), "Keine Änderungen");
  await page.waitForTimeout(450);
  assert.deepEqual([state.refreshes.length, state.previews.length, state.puts.length], [1, 2, 0]);
  assert.equal(await gewinn(page, "transglobal:23", 1).getAttribute("data-art"), "recommendation");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Prüfen, Dialog, Speichern: genau ein PUT; Verlauf; Zurücksetzen über denselben Dialog", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await zeile(page, "transglobal:23", 1).locator(".adm-po-adopt").click();
  await kopf(page, "transglobal:85").click();
  await feld(page, "transglobal:85", 0).fill("40");
  await warte(() => state.previews.length >= 1 && state.previews.at(-1).body.entries && state.previews.at(-1).body.entries.length === 2);
  await warte(async () => (await gewinn(page, "transglobal:85", 1).getAttribute("data-art")) === "draft");
  assert.equal(await zaehler(page), "● 2 ungespeicherte Änderungen");
  await page.locator("#adm-tarif-save").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await schritt(page), "Bestätigen und speichern");
  const text = norm(await dialog.innerText());
  assert.match(text, /Neue Aufschläge speichern\?/);
  assert.match(text, /Muster Logistik GmbH/);
  assert.match(text, /Grundlage: Preisvergleich vom 17\.11\.2026, 10:12 Uhr\./);
  assert.match(text, /Bereits angezeigte Angebote melden beim Buchen eine Preisänderung/);
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
  assert.equal(await zaehler(page), "Keine Änderungen");
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-badge`).innerText()), "4 individuell", "ein neuer Satz (23, bis 5 kg), einer geändert (85)");
  assert.equal(await aktuell(page, "transglobal:85", 1), "40 % | Satz für alle Gewichte");
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
  // Der Server lehnt trotzdem ab (z. B. andere Untergrenze): Meldung am Feld, das er nennt.
  await kopf(page, "jumingo:1").click();
  await feld(page, "jumingo:1", 2).fill("25");
  state.putFehler = { status: 400, body: { error: "Neue Aufschläge müssen mindestens 25 % betragen. Bestehende niedrigere Werte bleiben unverändert, solange sie nicht geändert werden.",
    code: "MARKUP_BELOW_MINIMUM", provider: "jumingo", productKey: 1, weightClass: 2 } };
  await kopf(page, "transglobal:22").click();
  await page.locator("#adm-tarif-save").click();
  await page.locator("#adm-tarif-confirm").click();
  await page.locator(`${KARTE} .adm-po-save .alert-error`).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(state.puts.length, 1);
  assert.equal(await kopf(page, "jumingo:1").getAttribute("aria-expanded"), "true", "der betroffene Tarif öffnet sich");
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
  assert.equal(await page.locator(`${KARTE} .adm-tarif-stand`, { hasText: "Stand:" }).count(), 0, "kein Stand ohne Basis");
  state.refreshStatus = null;
  await vergleiche(page, state);
  assert.equal(await page.locator(`${KARTE} .adm-po-compare .alert-error`).count(), 0, "alte Meldung verschwindet");
  // Vorschau meldet „abgelaufen“: Basis verworfen, Hinweis, KEIN automatischer neuer Abruf; der Entwurf bleibt.
  state.previewStatus = 410;
  await kopf(page, "transglobal:23").click();
  await feld(page, "transglobal:23", 1).fill("40");
  await page.locator(`${KARTE} .adm-tarif-note--warn`).waitFor();
  assert.match(norm(await page.locator(`${KARTE} .adm-tarif-note--warn`).innerText()), /^Preisvergleich erneut ausführen\. Der letzte Preisvergleich ist älter als 24 Stunden/);
  assert.equal(await schritt(page), "Gewinn und Kundenpreis prüfen", "die Änderung bleibt offen");
  assert.match(norm(await page.locator("#adm-po-panel-transglobal-23").innerText()), /Noch kein Preisvergleich./, "ohne Basis keine Gewinnvorschau");
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "40");
  await page.waitForTimeout(400);
  assert.equal(state.refreshes.length, 3, "nichts wird automatisch abgerufen");
  state.previewStatus = null;
  await vergleiche(page, state);
  await warte(async () => (await gewinn(page, "transglobal:23", 1).getAttribute("data-art")) === "draft");
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

test("H — Tastatur: Tarifkopf, Feld, „Empfehlung übernehmen“, Dialog mit Escape und Fokusrückgabe", async () => {
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
  await feld(page, "transglobal:23", 1).focus();
  await page.keyboard.type("40");
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "40");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains("adm-po-adopt")), true, "nächstes Ziel: „Empfehlung übernehmen“ derselben Zeile");
  await page.keyboard.press("Enter");
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "35,00");
  await warte(async () => (await page.evaluate(() => document.activeElement.id)) === "adm-tarif-input-transglobal-23-1");
  await page.locator("#adm-tarif-save").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true, "Fokus im Dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement.id), "adm-tarif-save", "Fokus zurück auf „Änderungen prüfen“");
  assert.equal(state.puts.length, 0);
  await page.keyboard.press("Enter");
  await page.locator("#adm-tarif-confirm").focus();
  await page.keyboard.press("Enter");
  await warte(() => state.puts.length === 1);
  assert.deepEqual(state.puts[0].body, { entries: [{ provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 }] });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("I — 390 px und 200 % Zoom: kein Querüberlauf, Spaltenbeschriftungen sichtbar, Ziele groß genug", async () => {
  const { page, state, fehler } = await neueSeite({ width: 390, height: 844 });
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:22").click();
  await zeile(page, "transglobal:22", 1).waitFor();
  const breite = () => page.evaluate(() => ({ seite: document.documentElement.scrollWidth, fenster: window.innerWidth }));
  let b = await breite();
  assert.ok(b.seite <= b.fenster, `kein Querüberlauf bei 390 px (${b.seite} > ${b.fenster})`);
  assert.equal(await zeile(page, "transglobal:22", 1).locator(".adm-po-cell-label").first().isVisible(), true, "mobil stehen die Spaltennamen in der Zeile");
  const kopfBox = await kopf(page, "transglobal:22").boundingBox();
  assert.ok(kopfBox && kopfBox.height >= 44, "Tarifkopf als Touchziel");
  const adopt = await zeile(page, "transglobal:22", 1).locator(".adm-po-adopt").boundingBox();
  assert.ok(adopt && adopt.height >= 24 && adopt.width >= 24, "„Empfehlung übernehmen“ mindestens 24 × 24 px");
  const save = await page.locator("#adm-tarif-save").boundingBox();
  assert.ok(save && save.height >= 44, "„Änderungen prüfen“ als Touchziel");
  const wrap = await page.locator("#adm-po-panel-transglobal-22 .adm-po-tablewrap").first().evaluate((el) => getComputedStyle(el).overflowX);
  assert.equal(wrap, "auto", "breite Tabellen scrollen in ihrem Rahmen");
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
  await zeile(page, "transglobal:23", 1).locator(".adm-po-adopt").click();
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  const getsVorher = state.gets;
  await page.evaluate(() => { window.history.pushState({}, "", "/admin/users/8"); window.dispatchEvent(new PopStateEvent("popstate")); });
  // Die Karte des neuen Kunden beginnt eingeklappt — ihr Inhalt ist da, aber nicht sichtbar.
  await page.locator(`${KARTE} li.adm-po-step .adm-po-step-meta`, { hasText: "Beispiel AG" }).waitFor({ state: "attached", timeout: 15000 });
  if (!(await page.locator(KARTE).evaluate((d) => d.open))) await page.locator(`${KARTE} > summary`).click();
  await kopf(page, "transglobal:22").waitFor();
  assert.ok(state.gets > getsVorher, "Sätze des neuen Kunden geladen");
  assert.equal(await zaehler(page), "Keine Änderungen", "der Entwurf von Kunde 7 wandert nicht mit");
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-badge`).innerText()), "0 individuell");
  assert.equal(await page.locator(`${KARTE} .adm-tarif-stand`, { hasText: "Stand:" }).count(), 0, "keine fremde Vergleichsbasis");
  assert.equal(await page.locator(`${KARTE} .adm-po-tarif-head[aria-expanded="true"]`).count(), 0);
  await kopf(page, "transglobal:23").click();
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.puts.length], [1, 0]);
  assert.deepEqual(fehler, []);
  await page.close();
});
