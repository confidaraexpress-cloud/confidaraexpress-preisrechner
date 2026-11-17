// E2E: „Versandpreise optimieren“ im Admin-Kundendetail (finale Vereinfachung 2026-11-17: eine Tarifübersicht,
// Transglobal und JUMiNGO nebeneinander). Echter Dev-Server, echtes Chromium, GEMOCKTES Backend
// (helpers/tariffMarkupsMock.mjs) mit demselben Vertrag wie routes/admin/tariffMarkups.js und
// lib/admin/tariffRecommendation.js; die Datenbankseite misst Backend customer-tariff-markups-pg, die Rechenseite
// pricing-optimization und admin-tariff-comparison.
//
//   A  Öffnen: eine Übersicht mit sieben Transglobal-Bereichen und ihren JUMiNGO-Registergruppen; die zwei
//      Preisgruppen unter „Weitere JUMiNGO-Tarife“ (alle neun erreichbar) — kein Providerkontakt, kein Speichern
//   B  Bereich ohne Vergleich: vier Gewichtsreiter, Transglobal links | JUMiNGO rechts, je vier Zahlen, zwei Aktionen,
//      „Alle Gewichte“ je Anbieter; Reiter- und Bereichswechsel speichern nichts
//   C  Preise vergleichen: genau EIN Abruf; „Möglich bis“; Kernaussage, vier Zahlen je Anbieter am selben
//      Beispielpaket, „Möglich: +X € pro Sendung“, Details (Beispielpaket, Bedingungen, Vergleich, Einkaufsvorteil)
//   D  Zuordnung und Zustände: mehrere Kandidaten (ähnlicher Tarif), JUMiNGO günstiger, gleich teuer, kein
//      Vergleich, nicht verfügbar, Abruffehler, „Passt bereits“, Weitere JUMiNGO-Tarife mit Vergleichsbezug
//   E  UPS Standard mit/ohne Abholzuschlag: Kernaussage, Zahlen, „Möglich“ und Übersicht folgen der Variante
//   F  „Empfehlung übernehmen“ und „Selbst festlegen“ je Anbieter getrennt; entprellte Vorschau; Verwerfen
//   G  Prüfen → Bestätigungsdialog mit mehreren Anbietern und Klassen → genau EIN PUT; Verlauf; Zurücksetzen
//   H  Untergrenze: neuer Wert unter 25 % gesperrt, Bestandswert erlaubt; Server-400 am betroffenen Feld
//   I  Fehlerpfade: Abruf 500/429, Vorschau 410 ohne automatischen Abruf, Speichern 500, Verlauf 500
//   J  Tastatur: Bereichskopf, Reiter mit Pfeiltasten/Pos1/Ende, „Empfehlung übernehmen“, Dialog mit Escape
//   K  390 px und 200 % Zoom: kein Querüberlauf, Reiter 2 × 2, Spalten untereinander, Ziele groß genug
//   L  Kundenwechsel in der App: Karte neu montiert, Entwürfe und Vergleichsbasis beginnen leer
//   M  Adminrechte: ein Kundenkonto sieht die Karte nicht und löst keinen Aufschlagsabruf aus
//   N  Sicherheitsinvariante: 0 Schreibaufrufe und 0 neue Providerkontakte beim Ansehen, Öffnen, Filtern,
//      Gewichts- und Kandidatenwechsel und Simulieren
//   O  Entwurf auf einem nicht gewählten JUMiNGO-Kandidaten bleibt sichtbar (Kandidat, Zeile, Reiter, „Weitere“) und im Dialog
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
const UNTER_ZIEL = "Der Aufschlag liegt unter der Untergrenze. Er bleibt, bis Sie ihn ändern; neue Werte brauchen mindestens die Untergrenze.";
const GEFAEHRDET = "Der Kunde zahlt fast so viel wie beim vergleichbaren Angebot oder mehr.";
const OHNE_BASIS = "Empfehlungen erscheinen nach „Preise vergleichen“.";
const NACH_VERGLEICH = "Einkauf, Kundenpreis und Verdienst erscheinen nach „Preise vergleichen“.";
const KEIN_VERGLEICH = "Kein vergleichbares Angebot (Carrier, Abholtag, Leistung oder Uhrzeit passen nicht)";
const REITER = ["Bis 5 kg", "5–10 kg", "10–20 kg", "Über 20 kg"];
const BEREICHE = [22, 23, 29, 84, 85, 86, 87].map((k) => `transglobal:${k}`);
const ALLE = "Gilt für jedes Gewicht ohne eigenen Satz.";

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
const panel = (page, id) => page.locator(`#adm-po-panel-${slug(id)}`);
const reiter = (page, id, wc) => page.locator(`#adm-po-tab-${slug(id)}-${wc}`);
const flaeche = (page, id) => page.locator(`#adm-po-tabpanel-${slug(id)}`);
const spalte = (page, id, provider) => flaeche(page, id).locator(`section.adm-po-col[data-provider="${provider}"]`);
const feld = (page, id, wc) => page.locator(`#adm-tarif-input-${slug(`${id}:${wc}`)}`);
const aktiv = () => (document.activeElement ? document.activeElement.id : "");
// Vier Zahlen einer Spalte als „Name: Wert (→ neu) | Hinweis“; der Screenreader-Vorsatz der neuen Zahl zählt nicht.
const zahlen = (page, id, provider) => spalte(page, id, provider).locator(".adm-po-figure").evaluateAll((els) => Object.fromEntries(els.map((el) => {
  const t = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
  const neuEl = el.querySelector(".adm-po-figure-new");
  const neu = neuEl ? [...neuEl.childNodes].filter((n) => !(n.classList && n.classList.contains("sr-only"))).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim() : "";
  const notiz = t(el.querySelector(".adm-po-figure-note"));
  return [el.dataset.figure, `${t(el.querySelector("dt"))}: ${t(el.querySelector(".adm-po-figure-value"))}${neu ? ` ${neu}` : ""}${notiz ? ` | ${notiz}` : ""}`];
})));
const urteil = async (page, id) => {
  const v = flaeche(page, id).locator(".adm-po-verdict");
  return { art: await v.getAttribute("data-verdict"), text: norm(await v.locator(".adm-po-verdict-text").innerText()), meta: norm(await v.locator(".adm-po-verdict-meta").innerText()) };
};
const chancen = (page, id) => flaeche(page, id).locator(".adm-po-chance-line").evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()));
const empfehlung = async (page, id, provider) => norm(await spalte(page, id, provider).locator(".adm-po-reco").innerText());
const hinweise = (page, id, provider) => spalte(page, id, provider).locator("li.adm-po-warning").evaluateAll((els) => els.map((el) => [el.dataset.status, el.querySelector(".adm-po-warning-text").innerText.replace(/\s+/g, " ").trim()]));
const zellen = (page, id) => kopf(page, id).locator(".adm-po-cell:not(.adm-po-cell--empty)").evaluateAll((els) => els.map((el) => [el.dataset.tariff, el.innerText.replace(/\s+/g, " ").trim()]));
const beziehung = async (page, id) => norm(await kopf(page, id).locator(".adm-po-rel").innerText());
const plus = (page, id) => kopf(page, id).locator(".adm-po-plus");
const details = (page, id) => page.locator(`#adm-po-details-${slug(id)}`);
const detailListe = (page, id, provider = null) => details(page, id)
  .locator(provider ? `section.adm-po-detail-block[data-provider="${provider}"]` : "section.adm-po-detail-block:not([data-provider])")
  .locator("dl.adm-po-detail-list > div")
  .evaluateAll((els) => els.map((el) => [el.querySelector("dt").innerText.trim(), el.querySelector("dd").innerText.replace(/\s+/g, " ").trim()]));
const alleZeile = async (page, id, provider) => norm(await spalte(page, id, provider).locator(".adm-po-all-line").innerText());
const bereiche = (page) => page.locator(`${KARTE} .adm-po-tariffs--main li.adm-po-tarif`).evaluateAll((els) => els.map((e) => e.dataset.tariff));
const weitere = (page) => page.locator("#adm-po-more li.adm-po-tarif").evaluateAll((els) => els.map((e) => e.dataset.tariff));
const zaehler = async (page) => norm(await page.locator("#adm-tarif-dirty").innerText());
const stand = async (page) => norm(await page.locator(`${KARTE} .adm-tarif-stand`).innerText());
const zaehlerstand = (state) => [state.refreshes.length, state.previews.length, state.puts.length];
async function weitereOeffnen(page) {
  if (!(await page.locator("#adm-po-more").evaluate((d) => d.open))) await page.locator("#adm-po-more > summary").click();
  await page.locator("#adm-po-head-jumingo-8").waitFor();
}

test("A — Öffnen: eine Übersicht, sieben Bereiche mit Registerpaar, Preisgruppen unter „Weitere JUMiNGO-Tarife“; kein Providerkontakt, kein Speichern", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  assert.equal(norm(await page.locator(`${KARTE} .adm-disclosure-title`).innerText()), "Versandpreise optimieren");
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-badge`).innerText()), "3 individuell");
  assert.equal(await page.locator(`${KARTE} .adm-po-group, ${KARTE} .adm-po-metric`).count(), 0, "keine zwei Anbieterlisten, keine Kennzahlen alter Art");
  assert.equal(await stand(page), OHNE_BASIS);
  assert.deepEqual((await page.locator(`${KARTE} .adm-po-ledger-head > span`).allInnerTexts()).map(norm), ["Tarif", "Transglobal", "JUMiNGO", ""]);
  assert.deepEqual(await bereiche(page), BEREICHE, "je Transglobal-Produkt ein Bereich, Reihenfolge des Servers");
  // Jeder Bereich: Transglobal und das Registerpaar mit derselben Bezeichnung nebeneinander.
  for (const [tg, ju] of [[22, 1], [23, 2], [29, 3], [84, 4], [85, 5], [86, 6], [87, 7]]) {
    assert.deepEqual((await zellen(page, `transglobal:${tg}`)).map(([id]) => id), [`transglobal:${tg}`, `jumingo:${ju}`]);
    assert.equal(await beziehung(page, `transglobal:${tg}`), "Gleichwertig");
  }
  assert.equal(norm(await kopf(page, "transglobal:85").locator(".adm-po-tarif-name").innerText()), "DHL Express 9:00");
  // Ohne Vergleich: Ihr Aufschlag je Anbieter; markiert nur unter der Untergrenze (Bestandswert 0 %, geerbte 20 %).
  assert.deepEqual(await zellen(page, "transglobal:22"), [["transglobal:22", "Transglobal 0 % Unter 25 %"], ["jumingo:1", "JUMiNGO 20–30 % Unter 25 %"]]);
  assert.deepEqual(await zellen(page, "transglobal:23"), [["transglobal:23", "Transglobal 30 %"], ["jumingo:2", "JUMiNGO 30 %"]]);
  assert.deepEqual(await zellen(page, "transglobal:85"), [["transglobal:85", "Transglobal 35 %"], ["jumingo:5", "JUMiNGO 30 %"]]);
  assert.equal(await page.locator(`${KARTE} .adm-po-plus`).count(), 0, "ohne Vergleich kein „Möglich bis“");
  // Weitere JUMiNGO-Tarife: eingeklappt, nichts gelöscht oder zusammengelegt; mit ihnen sind alle neun Gruppen erreichbar.
  assert.equal(norm(await page.locator("#adm-po-more > summary").innerText()), "Weitere JUMiNGO-Tarife (2)");
  assert.equal(await page.locator("#adm-po-more").evaluate((d) => d.open), false);
  await weitereOeffnen(page);
  assert.equal(norm(await page.locator("#adm-po-more .adm-po-more-hint").innerText()), "JUMiNGO-Preisgruppen ohne festes Transglobal-Gegenstück. Ihr Aufschlag lässt sich hier genauso einstellen.");
  assert.deepEqual(await weitere(page), ["jumingo:8", "jumingo:9"]);
  assert.deepEqual(await zellen(page, "jumingo:8"), [["jumingo:8", "JUMiNGO 30 %"]]);
  assert.equal(await beziehung(page, "jumingo:8"), "Kein direkter Vergleich möglich", "ohne Vergleich keine erfundene Zuordnung");
  const erreichbar = await page.locator(`${KARTE} .adm-po-cell[data-provider="jumingo"]`).evaluateAll((els) => els.map((e) => e.dataset.tariff).sort());
  assert.deepEqual(erreichbar, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `jumingo:${k}`).sort(), "alle neun JUMiNGO-Gruppen erreichbar");
  assert.equal(await page.locator(`${KARTE} .adm-po-tarif-head[aria-expanded="true"]`).count(), 0);
  assert.equal(await page.locator("#adm-tarif-save").count(), 0, "ohne offenen Bereich und ohne Entwurf keine Speicherleiste");
  await page.waitForTimeout(400);
  assert.deepEqual([...zaehlerstand(state), state.audits.length], [0, 0, 0, 0], "Öffnen fragt nur die gespeicherten Sätze ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — Bereich ohne Vergleich: vier Reiter, Transglobal links | JUMiNGO rechts, je vier Zahlen, zwei Aktionen, „Alle Gewichte“ je Anbieter", async () => {
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
  assert.deepEqual(await urteil(page, "transglobal:22"), { art: "not_compared", text: "Noch nicht verglichen", meta: NACH_VERGLEICH });
  assert.equal(await flaeche(page, "transglobal:22").locator(".adm-po-chance").count(), 0, "ohne Vergleich keine Beispielrechnung");
  // Transglobal links, JUMiNGO rechts — nebeneinander auf derselben Höhe.
  const tg = await spalte(page, "transglobal:22", "transglobal").boundingBox();
  const ju = await spalte(page, "transglobal:22", "jumingo").boundingBox();
  assert.ok(tg.x + tg.width <= ju.x + 1 && Math.abs(tg.y - ju.y) < 2, "Transglobal links, JUMiNGO rechts");
  assert.equal(norm(await spalte(page, "transglobal:22", "transglobal").locator(".adm-po-col-head").innerText()), "Transglobal UPS Standard");
  assert.equal(norm(await spalte(page, "transglobal:22", "jumingo").locator(".adm-po-col-head").innerText()), "JUMiNGO UPS Standard");
  assert.equal(await spalte(page, "transglobal:22", "jumingo").getAttribute("data-tariff"), "jumingo:1");
  assert.deepEqual(await zahlen(page, "transglobal:22", "transglobal"), {
    purchase: "Unser Einkauf: —", customer: "Kunde zahlt: —", earnings: "Unser Verdienst: —", markup: "Ihr Aufschlag: 0 % | Satz für alle Gewichte",
  });
  assert.equal((await zahlen(page, "transglobal:22", "jumingo")).markup, "Ihr Aufschlag: 30 % | eigener Satz für dieses Gewicht");
  assert.equal(await empfehlung(page, "transglobal:22", "transglobal"), "Empfohlen Keine Empfehlung verfügbar Erst Preise vergleichen");
  assert.deepEqual(await hinweise(page, "transglobal:22", "transglobal"), [["below_target", UNTER_ZIEL]], "entscheidungsrelevant: bleibt vorne sichtbar");
  assert.deepEqual(await hinweise(page, "transglobal:22", "jumingo"), []);
  assert.equal(await flaeche(page, "transglobal:22").locator(".adm-po-adopt").count(), 0, "ohne Vergleich nichts zu übernehmen");
  assert.deepEqual((await flaeche(page, "transglobal:22").locator(".adm-po-custom").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).map(norm),
    ["Selbst festlegen: UPS Standard, Transglobal, Bis 5 kg", "Selbst festlegen: UPS Standard, JUMiNGO, Bis 5 kg"]);
  assert.equal(await feld(page, "transglobal:22", 1).count(), 0, "das Feld erscheint erst nach „Selbst festlegen“");
  assert.equal(await details(page, "transglobal:22").count(), 0, "Details erst mit Vergleich");
  assert.equal(await alleZeile(page, "transglobal:22", "transglobal"), `Alle Gewichte 0 % eigener Satz. ${ALLE}`);
  assert.equal(await alleZeile(page, "transglobal:22", "jumingo"), `Alle Gewichte 20 % Standardaufschlag des Kontos. ${ALLE}`);
  assert.equal(norm(await spalte(page, "transglobal:22", "transglobal").locator(".adm-po-all-change").getAttribute("aria-label")), "Alle Gewichte: Ändern, UPS Standard, Transglobal");
  assert.equal(await zaehler(page), "Keine Änderungen");
  assert.equal(norm(await page.locator("#adm-tarif-save").innerText()), "Änderungen prüfen");
  assert.equal(await page.locator("#adm-tarif-save").isDisabled(), true);
  // Reiter wechseln: Transglobal erbt weiter „Alle Gewichte“, JUMiNGO fällt auf den Kontosatz — beides sichtbar, nichts übernommen.
  await reiter(page, "transglobal:22", 2).click();
  assert.equal(await flaeche(page, "transglobal:22").getAttribute("data-class"), "2");
  assert.equal((await zahlen(page, "transglobal:22", "transglobal")).markup, "Ihr Aufschlag: 0 % | Satz für alle Gewichte");
  assert.equal((await zahlen(page, "transglobal:22", "jumingo")).markup, "Ihr Aufschlag: 20 % | Standardaufschlag des Kontos");
  assert.deepEqual((await hinweise(page, "transglobal:22", "jumingo")).map(([s]) => s), ["below_target"]);
  // Ein anderer Bereich schließt den ersten.
  await kopf(page, "transglobal:23").click();
  assert.equal(await kopf(page, "transglobal:22").getAttribute("aria-expanded"), "false");
  assert.equal(await panel(page, "transglobal:22").isHidden(), true);
  assert.equal(await reiter(page, "transglobal:23", 2).getAttribute("aria-selected"), "true", "die gewählte Gewichtsklasse bleibt");
  await page.waitForTimeout(400);
  assert.deepEqual(zaehlerstand(state), [0, 0, 0], "Bereichs- und Reiterwechsel speichern und rufen nichts ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Preise vergleichen: genau ein Abruf; „Möglich bis“; Kernaussage und vier Zahlen am selben Paket; „Möglich“; Details", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  assert.deepEqual(state.refreshes[0], { uid: 7, body: { destinationCountry: "DE" } });
  assert.equal(await stand(page), "Stand: 17.11.2026, 10:12 Uhr");
  assert.deepEqual(await bereiche(page), BEREICHE, "die Reihenfolge bleibt — nichts springt");
  // „Möglich bis“ je Bereich: größter Mehrverdienst aus belastbaren Empfehlungen (dieselben Pakete wie in der Fläche).
  for (const [id, text] of [["transglobal:22", "Möglich bis +6,96 € pro Sendung"], ["transglobal:23", "Möglich bis +3,48 € pro Sendung"],
    ["transglobal:84", "Möglich bis +2,61 € pro Sendung"], ["transglobal:85", "Möglich bis +28,00 € pro Sendung"]]) {
    assert.equal(norm(await plus(page, id).innerText()), text, id);
  }
  for (const id of ["transglobal:29", "transglobal:86", "transglobal:87"]) assert.equal(await plus(page, id).count(), 0, `${id}: kein Plus ohne Empfehlung nach oben`);
  assert.deepEqual(await zellen(page, "transglobal:23"), [["transglobal:23", "Transglobal 30 %"], ["jumingo:2", "JUMiNGO 30 % Preisvorteil gefährdet"]]);

  // UPS Express Saver, bis 5 kg: beide am Beispielpaket 5 kg — Transglobal kauft günstiger ein.
  await kopf(page, "transglobal:23").click();
  assert.deepEqual(await urteil(page, "transglobal:23"), { art: "transglobal", text: "Transglobal kauft günstiger ein.", meta: "Gleichwertig Beispielpaket 5 kg" });
  assert.deepEqual(await zahlen(page, "transglobal:23", "transglobal"), {
    purchase: "Unser Einkauf: 14,40 €", customer: "Kunde zahlt: 18,72 €", earnings: "Unser Verdienst: 4,32 €", markup: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
  });
  assert.deepEqual(await zahlen(page, "transglobal:23", "jumingo"), {
    purchase: "Unser Einkauf: 17,60 €", customer: "Kunde zahlt: 22,88 €", earnings: "Unser Verdienst: 5,28 €", markup: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
  });
  assert.deepEqual(await chancen(page, "transglobal:23"), ["Möglich: +0,72 € pro Sendung wenn der Transglobal-Aufschlag von 30 % auf 35 % steigt (Beispielpaket 5 kg)."]);
  assert.equal(norm(await flaeche(page, "transglobal:23").locator(".adm-po-chance-tag").innerText()), "Beispielrechnung");
  assert.equal(await empfehlung(page, "transglobal:23", "transglobal"), "Empfohlen 35 %");
  assert.equal(await empfehlung(page, "transglobal:23", "jumingo"), "Empfohlen 25 %");
  assert.deepEqual(await hinweise(page, "transglobal:23", "transglobal"), []);
  assert.deepEqual(await hinweise(page, "transglobal:23", "jumingo"), [["at_risk", `${GEFAEHRDET} Transglobal kauft dieses Gewicht günstiger ein.`]]);
  assert.deepEqual((await flaeche(page, "transglobal:23").locator(".adm-po-adopt").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).map(norm),
    ["Empfehlung übernehmen: UPS Express Saver, Transglobal, Bis 5 kg, 35 %", "Empfehlung übernehmen: UPS Express Saver, JUMiNGO, Bis 5 kg, 25 %"]);
  // Details: Beispielpaket und Bedingungen, je Anbieter Preise, Vergleichsangebot und Einkaufsvorteil, Datenbasis.
  await details(page, "transglobal:23").locator("> summary").click();
  assert.equal(norm(await details(page, "transglobal:23").locator("> summary").innerText()), "Details anzeigen");
  assert.deepEqual(await detailListe(page, "transglobal:23"), [
    ["Gewicht und Maße", "5 kg · 40 × 30 × 20 cm"], ["Zielland", "Deutschland"], ["Abholung", "18.11.2026"],
    ["Absender", "Musterstraße 1, 10115 Berlin"], ["Empfänger", "Beispielweg 8, 80331 München"],
    ["Bedingungen", "Fahrerabholung, Geschäftsadressen, ein Packstück, keine Zusatzleistungen. Transglobal: Vorabpreis der Preisauskunft. Alle Beträge netto."],
  ]);
  assert.deepEqual(await detailListe(page, "transglobal:23", "transglobal"), [
    ["Einkaufspreis", "14,40 €"], ["Kundenpreis", "18,72 € → 19,44 € (mit Empfehlung)"], ["Deckungsbeitrag", "4,32 € → 5,04 € (mit Empfehlung)"], ["Abholtag", "18.11.2026"],
    ["Vergleichsangebot", "UPS Express Saver (JUMiNGO), gleichwertig, Tarif-ID 3702: Kunde zahlt 22,88 € · bei uns 18,2 % günstiger"],
    ["Einkaufsvorteil", "Transglobal kauft 18,2 % günstiger ein als JUMiNGO"],
  ]);
  assert.deepEqual((await detailListe(page, "transglobal:23", "jumingo")).filter(([k]) => ["Vergleichsangebot", "Einkaufsvorteil"].includes(k)), [
    ["Vergleichsangebot", "UPS Express Saver (Transglobal), gleichwertig, Tarif-ID 23: Kunde zahlt 18,72 € · bei uns 22,2 % teurer"],
    ["Einkaufsvorteil", "JUMiNGO kauft 22,2 % teurer ein als Transglobal"],
  ]);
  assert.deepEqual((await details(page, "transglobal:23").locator('section[data-provider="transglobal"] tr[data-scenario="w5"] td').allInnerTexts()).map(norm),
    ["5 kg", "14,40 €", "UPS Express Saver · JUMiNGO · Tarif-ID 3702 · gleichwertig", "17,60 €", "30 %", "22,88 €", "bei uns 18,2 % günstiger", "50 %"]);
  const texte = (await details(page, "transglobal:23").locator(".adm-po-details > p.adm-po-detail-text").allInnerTexts()).map(norm);
  assert.match(texte.at(-2), /^Datenbasis: Stand 17\.11\.2026, 10:12 Uhr, gültig bis /);
  assert.match(texte.at(-1), /^„Unser Verdienst“ ist der Deckungsbeitrag: Kundenpreis minus Einkaufspreis, netto, je Beispielsendung\. Er ist kein Nettogewinn/);
  // Über 20 kg: eigene Empfehlung und eigenes Beispielpaket der Klasse.
  await reiter(page, "transglobal:23", 4).click();
  assert.equal(await empfehlung(page, "transglobal:23", "transglobal"), "Empfohlen 40 %");
  assert.deepEqual(await chancen(page, "transglobal:23"), ["Möglich: +3,48 € pro Sendung wenn der Transglobal-Aufschlag von 30 % auf 40 % steigt (Beispielpaket 30 kg)."]);
  await page.waitForTimeout(400);
  assert.deepEqual(zaehlerstand(state), [1, 0, 0], "Ansehen, Reiter und Details rufen nichts ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Zuordnung und Zustände: Kandidaten, JUMiNGO günstiger, gleich teuer, kein Vergleich, nicht verfügbar, Abruffehler, Weitere JUMiNGO-Tarife", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  // DHL Express Domestic: Registerpaar (gleichwertig) und die Preisgruppe, die der Server mit diesem Produkt vergleicht (ähnlich).
  await kopf(page, "transglobal:84").click();
  const wahl = spalte(page, "transglobal:84", "jumingo").locator("fieldset.adm-po-cands");
  assert.equal(norm(await wahl.locator("legend").innerText()), "JUMiNGO-Tarif zum Vergleich");
  assert.deepEqual((await wahl.locator("label.adm-po-cand").allInnerTexts()).map(norm), ["DHL Express Domestic Gleichwertig", "DHL Express Sondertarif Ähnlicher Tarif"]);
  assert.equal(await wahl.locator('input[value="jumingo:4"]').isChecked(), true, "zuerst das Registerpaar");
  assert.deepEqual(await urteil(page, "transglobal:84"), { art: "transglobal", text: "Transglobal kauft günstiger ein.", meta: "Gleichwertig Beispielpaket 5 kg" });
  await wahl.locator('input[value="jumingo:8"]').check();
  assert.equal(await spalte(page, "transglobal:84", "jumingo").getAttribute("data-tariff"), "jumingo:8");
  assert.deepEqual(await urteil(page, "transglobal:84"), { art: "transglobal", text: "Transglobal kauft günstiger ein.", meta: "Ähnlicher Tarif Beispielpaket 5 kg" });
  assert.deepEqual(await zahlen(page, "transglobal:84", "jumingo"), {
    purchase: "Unser Einkauf: 28,60 €", customer: "Kunde zahlt: 37,18 €", earnings: "Unser Verdienst: 8,58 €", markup: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
  });
  assert.equal(await beziehung(page, "transglobal:84"), "Ähnlicher Tarif");
  assert.deepEqual((await zellen(page, "transglobal:84"))[1][0], "jumingo:8", "die Übersicht zeigt den gewählten Vergleich");
  assert.deepEqual(await chancen(page, "transglobal:84"), ["Ein höherer Aufschlag wird nicht empfohlen."]);

  // DHL Express 9:00: JUMiNGO kauft günstiger ein; „Möglich“ für JUMiNGO, Transglobal gefährdet.
  await kopf(page, "transglobal:85").click();
  assert.deepEqual(await urteil(page, "transglobal:85"), { art: "jumingo", text: "JUMiNGO kauft günstiger ein.", meta: "Gleichwertig Beispielpaket 5 kg" });
  assert.deepEqual(await chancen(page, "transglobal:85"), ["Möglich: +11,00 € pro Sendung wenn der JUMiNGO-Aufschlag von 30 % auf 55 % steigt (Beispielpaket 5 kg)."]);
  assert.deepEqual(await hinweise(page, "transglobal:85", "transglobal"), [["at_risk", `${GEFAEHRDET} JUMiNGO kauft dieses Gewicht günstiger ein.`]]);
  assert.equal((await zahlen(page, "transglobal:85", "transglobal")).markup, "Ihr Aufschlag: 35 % | Satz für alle Gewichte", "bestehende Sonderkondition");
  // 10–20 kg: kein Vergleichsangebot — keine Aussage, keine Empfehlung.
  await reiter(page, "transglobal:85", 3).click();
  assert.deepEqual(await urteil(page, "transglobal:85"), { art: "none", text: "Diese Angebote sind nicht direkt vergleichbar.", meta: `Beispielpaket 12 kg ${KEIN_VERGLEICH}` });
  assert.deepEqual(await chancen(page, "transglobal:85"), ["Keine Empfehlung verfügbar"]);
  assert.equal(await empfehlung(page, "transglobal:85", "jumingo"), `Empfohlen Keine Empfehlung verfügbar Kein vergleichbares Angebot`);

  // DHL Express 10:30, 10–20 kg: JUMiNGO-Abruf fehlgeschlagen; über 20 kg kein Vergleich.
  await kopf(page, "transglobal:86").click();
  await reiter(page, "transglobal:86", 3).click();
  assert.deepEqual(await urteil(page, "transglobal:86"), { art: "none", text: "Diese Angebote sind nicht direkt vergleichbar.", meta: "Beispielpaket 12 kg JUMiNGO: Preise konnten nicht abgerufen werden" });
  assert.deepEqual(await zahlen(page, "transglobal:86", "jumingo"), {
    purchase: "Unser Einkauf: —", customer: "Kunde zahlt: —", earnings: "Unser Verdienst: —", markup: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
  });
  assert.equal(norm(await spalte(page, "transglobal:86", "jumingo").locator(".adm-po-col-gap").innerText()), "Preise konnten nicht abgerufen werden");
  assert.equal((await zahlen(page, "transglobal:86", "transglobal")).purchase, "Unser Einkauf: 68,00 €", "die eigene Seite bleibt sichtbar");
  assert.equal(await empfehlung(page, "transglobal:86", "transglobal"), "Empfohlen Keine Empfehlung verfügbar Vergleichspreise nicht abrufbar");
  assert.equal(await empfehlung(page, "transglobal:86", "jumingo"), "Empfohlen Keine Empfehlung verfügbar Preise nicht abrufbar");
  await reiter(page, "transglobal:86", 1).click();
  assert.equal((await urteil(page, "transglobal:86")).art, "jumingo", "bis 5 kg kauft JUMiNGO günstiger ein");

  // DHL Express 12:00: 5–10 kg gleich teuer; über 20 kg bei Transglobal nicht verfügbar.
  await kopf(page, "transglobal:87").click();
  await reiter(page, "transglobal:87", 2).click();
  assert.deepEqual(await urteil(page, "transglobal:87"), { art: "same", text: "Beide kaufen gleich günstig ein.", meta: "Gleichwertig Beispielpaket 10 kg" });
  await reiter(page, "transglobal:87", 4).click();
  assert.deepEqual(await urteil(page, "transglobal:87"), { art: "none", text: "Diese Angebote sind nicht direkt vergleichbar.", meta: "Beispielpaket 25 kg Transglobal: Tarif für dieses Paket nicht verfügbar" });
  assert.equal((await zahlen(page, "transglobal:87", "jumingo")).purchase, "Unser Einkauf: 83,20 €");

  // UPS Express, bis 5 kg: gut eingestellt — „Passt bereits“, nichts zu übernehmen; die Preisgruppe UPS Express 12:00 ist wählbar.
  await kopf(page, "transglobal:29").click();
  await reiter(page, "transglobal:29", 1).click();
  assert.equal(await empfehlung(page, "transglobal:29", "transglobal"), "Empfohlen 30 % Passt bereits");
  assert.equal(await spalte(page, "transglobal:29", "transglobal").locator(".adm-po-adopt").count(), 0);
  assert.deepEqual(await chancen(page, "transglobal:29"), ["Ein höherer Aufschlag wird nicht empfohlen."]);
  assert.deepEqual((await spalte(page, "transglobal:29", "jumingo").locator("label.adm-po-cand").allInnerTexts()).map(norm), ["UPS Express Gleichwertig", "UPS Express 12:00 Ähnlicher Tarif"]);

  // Weitere JUMiNGO-Tarife: mit Vergleichsbezug, voll bedienbar.
  await weitereOeffnen(page);
  assert.equal(await beziehung(page, "jumingo:8"), "Ähnlicher Tarif");
  assert.equal(await beziehung(page, "jumingo:9"), "Ähnlicher Tarif");
  await kopf(page, "jumingo:9").click();
  assert.equal(await kopf(page, "transglobal:29").getAttribute("aria-expanded"), "false");
  assert.equal(norm(await panel(page, "jumingo:9").locator(".adm-po-note").innerText()), "UPS Express mit Zustellung bis 12:00.");
  assert.deepEqual(await urteil(page, "jumingo:9"), { art: "similar", text: "Im Preisvergleich ähnlich zu UPS Express (Transglobal).", meta: "Ähnlicher Tarif Beispielpaket 2 kg" });
  assert.deepEqual(await zahlen(page, "jumingo:9", "jumingo"), {
    purchase: "Unser Einkauf: 28,00 €", customer: "Kunde zahlt: 36,40 €", earnings: "Unser Verdienst: 8,40 €", markup: "Ihr Aufschlag: 30 % | Expressaufschlag des Kontos",
  });
  assert.equal(await flaeche(page, "jumingo:9").locator(".adm-po-custom").count(), 1);
  assert.equal(await flaeche(page, "jumingo:9").locator('.adm-po-all[data-provider="jumingo"]').count(), 1);
  await page.waitForTimeout(400);
  assert.deepEqual(zaehlerstand(state), [1, 0, 0], "Kandidaten-, Bereichs- und Reiterwechsel rufen nichts ab");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — UPS Standard mit Abholzuschlag: Kernaussage, Zahlen, „Möglich“ und Übersicht folgen der Variante des Servers", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:22").click();
  assert.deepEqual(await urteil(page, "transglobal:22"), { art: "transglobal", text: "Transglobal kauft günstiger ein.", meta: "Gleichwertig Beispielpaket 5 kg" });
  assert.equal((await zahlen(page, "transglobal:22", "transglobal")).purchase, "Unser Einkauf: 9,60 €");
  assert.deepEqual(await chancen(page, "transglobal:22"), ["Möglich: +2,88 € pro Sendung wenn der Transglobal-Aufschlag von 0 % auf 30 % steigt (Beispielpaket 5 kg)."]);
  await details(page, "transglobal:22").locator("> summary").click();
  const sd = details(page, "transglobal:22").locator(".adm-po-sameday");
  assert.equal(norm(await sd.locator("legend").innerText()), "Vergleich für UPS Standard");
  assert.deepEqual((await sd.locator("label").allInnerTexts()).map(norm), ["Ohne Abholzuschlag", "Mit Abholzuschlag (3,90 €)"]);
  await sd.locator("label", { hasText: "Mit Abholzuschlag" }).click();
  assert.deepEqual(await urteil(page, "transglobal:22"), { art: "jumingo", text: "JUMiNGO kauft günstiger ein.", meta: "Gleichwertig Beispielpaket 5 kg" });
  assert.deepEqual(await zahlen(page, "transglobal:22", "transglobal"), {
    purchase: "Unser Einkauf: 13,50 €", customer: "Kunde zahlt: 13,50 €", earnings: "Unser Verdienst: 0,00 €", markup: "Ihr Aufschlag: 0 % | Satz für alle Gewichte",
  });
  assert.equal(norm(await spalte(page, "transglobal:22", "transglobal").locator(".adm-po-col-head").innerText()), "Transglobal UPS Standard mit Abholzuschlag");
  assert.deepEqual(await chancen(page, "transglobal:22"), ["Möglich: +3,38 € pro Sendung wenn der Transglobal-Aufschlag von 0 % auf 25 % steigt (Beispielpaket 5 kg)."]);
  assert.equal(await empfehlung(page, "transglobal:22", "transglobal"), "Empfohlen 25 % mit Abholzuschlag");
  assert.deepEqual(await hinweise(page, "transglobal:22", "transglobal"), [["below_target", UNTER_ZIEL], ["at_risk", `${GEFAEHRDET} JUMiNGO kauft dieses Gewicht günstiger ein.`]]);
  assert.deepEqual((await detailListe(page, "transglobal:22")).find(([k]) => k === "Zuschläge"), ["Zuschläge", "Mit Abholzuschlag 3,90 € (Transglobal, UPS Standard)"]);
  assert.equal(norm(await plus(page, "transglobal:22").innerText()), "Möglich bis +6,78 € pro Sendung", "die Übersicht folgt der Variante");
  await sd.locator("label", { hasText: "Ohne Abholzuschlag" }).click();
  assert.equal((await urteil(page, "transglobal:22")).art, "transglobal");
  assert.equal(norm(await plus(page, "transglobal:22").innerText()), "Möglich bis +6,96 € pro Sendung");
  await page.waitForTimeout(400);
  assert.deepEqual(zaehlerstand(state), [1, 0, 0], "Umschalten rechnet nur die Anzeige um");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — „Empfehlung übernehmen“ und „Selbst festlegen“ je Anbieter getrennt; entprellte Vorschau; „Alle Gewichte“ unangetastet; Verwerfen", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-adopt").click();
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "35,00");
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-23-1");
  assert.equal(await feld(page, "jumingo:2", 1).count(), 0, "JUMiNGO bleibt unberührt");
  assert.equal(norm(await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-adopted").innerText()), "Empfehlung eingetragen");
  assert.equal(await spalte(page, "transglobal:23", "jumingo").locator(".adm-po-adopt").count(), 1, "die JUMiNGO-Empfehlung bleibt ein eigenes Angebot");
  assert.equal(norm(await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-edit-label").innerText()), "Neuer Aufschlag · Bis 5 kg");
  assert.equal(norm(await page.locator("#adm-tarif-input-transglobal-23-1-hint").innerText()), "Mindestens 25 %. Leer = kein eigener Satz.");
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  assert.equal(norm(await kopf(page, "transglobal:23").locator(".adm-po-tarif-dirty").innerText()), "● 1 ungespeicherte Änderung");
  assert.equal(norm(await reiter(page, "transglobal:23", 1).innerText()), "Bis 5 kg (noch nicht gespeichert)");
  assert.equal(state.puts.length, 0, "Übernehmen speichert nicht");
  await warte(() => state.previews.length === 1);
  assert.deepEqual(state.previews[0], { uid: 7, runId: "41", body: { entries: [{ provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 }] } });
  await warte(async () => (await zahlen(page, "transglobal:23", "transglobal")).customer.includes("→"));
  assert.deepEqual(await zahlen(page, "transglobal:23", "transglobal"), {
    purchase: "Unser Einkauf: 14,40 €", customer: "Kunde zahlt: 18,72 € → 19,44 €", earnings: "Unser Verdienst: 4,32 € → 5,04 €", markup: "Ihr Aufschlag: 30 % → 35 %",
  });
  assert.equal((await zahlen(page, "transglobal:23", "jumingo")).customer, "Kunde zahlt: 22,88 €");
  assert.deepEqual(await chancen(page, "transglobal:23"), ["Mit Ihrer Eingabe: +0,72 € pro Sendung Transglobal-Aufschlag 30 % → 35 % (Beispielpaket 5 kg)."]);
  // JUMiNGO getrennt: Feld leer und fokussiert; „35“ → genau EINE weitere Vorschau mit beiden Einträgen.
  await spalte(page, "transglobal:23", "jumingo").locator(".adm-po-custom").click();
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-jumingo-2-1");
  assert.equal(await feld(page, "jumingo:2", 1).inputValue(), "");
  await feld(page, "jumingo:2", 1).pressSequentially("35", { delay: 40 });
  await warte(() => state.previews.length === 2);
  await page.waitForTimeout(450);
  assert.equal(state.previews.length, 2, "entprellt: kein Zwischenstand „3“");
  assert.deepEqual(state.previews[1].body.entries.map((e) => [e.provider, e.productKey, e.weightClass, e.markupPercent]),
    [["transglobal", 23, 1, 35], ["jumingo", 2, 1, 35]]);
  await warte(async () => (await zahlen(page, "transglobal:23", "jumingo")).customer.includes("→"));
  assert.deepEqual(await zahlen(page, "transglobal:23", "jumingo"), {
    purchase: "Unser Einkauf: 17,60 €", customer: "Kunde zahlt: 22,88 € → 23,76 €", earnings: "Unser Verdienst: 5,28 € → 6,16 €", markup: "Ihr Aufschlag: 30 % → 35 %",
  });
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "35,00", "der Transglobal-Entwurf bleibt");
  assert.deepEqual(await chancen(page, "transglobal:23"), [
    "Mit Ihrer Eingabe: +0,88 € pro Sendung JUMiNGO-Aufschlag 30 % → 35 % (Beispielpaket 5 kg).",
    "Mit Ihrer Eingabe: +0,72 € pro Sendung Transglobal-Aufschlag 30 % → 35 % (Beispielpaket 5 kg).",
  ]);
  // „Alle Gewichte“ wird weder übernommen noch überschrieben.
  assert.equal(await alleZeile(page, "transglobal:23", "transglobal"), `Alle Gewichte 30 % Expressaufschlag des Kontos. ${ALLE}`);
  assert.equal(await feld(page, "transglobal:23", 0).count(), 0);
  // Selbst festlegen (5–10 kg, Transglobal).
  await reiter(page, "transglobal:23", 2).click();
  assert.equal(await feld(page, "transglobal:23", 2).count(), 0);
  await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-custom").click();
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-23-2");
  await feld(page, "transglobal:23", 2).pressSequentially("42", { delay: 40 });
  await warte(() => state.previews.length === 3);
  await page.waitForTimeout(450);
  assert.equal(state.previews.length, 3, "entprellt: kein Zwischenstand „4“");
  await warte(async () => (await zahlen(page, "transglobal:23", "transglobal")).customer.includes("→"));
  assert.deepEqual(await zahlen(page, "transglobal:23", "transglobal"), {
    purchase: "Unser Einkauf: 19,20 €", customer: "Kunde zahlt: 24,96 € → 27,26 €", earnings: "Unser Verdienst: 5,76 € → 8,06 €", markup: "Ihr Aufschlag: 30 % → 42 %",
  });
  assert.deepEqual(await chancen(page, "transglobal:23"), ["Mit Ihrer Eingabe: +2,30 € pro Sendung Transglobal-Aufschlag 30 % → 42 % (Beispielpaket 10 kg)."]);
  assert.equal(norm(await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-pending").innerText()), "noch nicht gespeichert");
  assert.equal(await zaehler(page), "● 3 ungespeicherte Änderungen");
  // Verwerfen: Felder weg, keine Vorschau mehr, nichts gespeichert, kein Abruf.
  await page.locator("#adm-tarif-discard").click();
  assert.equal(await feld(page, "transglobal:23", 2).count(), 0);
  assert.equal(await zaehler(page), "Keine Änderungen");
  await page.waitForTimeout(450);
  assert.deepEqual(zaehlerstand(state), [1, 3, 0]);
  assert.deepEqual(await chancen(page, "transglobal:23"), ["Möglich: +1,92 € pro Sendung wenn der Transglobal-Aufschlag von 30 % auf 40 % steigt (Beispielpaket 10 kg)."]);
  await reiter(page, "transglobal:23", 1).click();
  assert.equal(await feld(page, "transglobal:23", 1).count(), 0);
  assert.equal(await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-adopt").count(), 1, "nach dem Verwerfen wieder übernehmbar");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("G — Prüfen → Bestätigungsdialog mit mehreren Anbietern und Klassen → genau ein PUT; Verlauf; Zurücksetzen über denselben Dialog", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-adopt").click();
  await spalte(page, "transglobal:23", "jumingo").locator(".adm-po-adopt").click();
  assert.equal(await feld(page, "jumingo:2", 1).inputValue(), "25,00");
  // DHL Express 9:00: „Alle Gewichte“ nur über die eigene Zeile ändern.
  await kopf(page, "transglobal:85").click();
  assert.equal(await alleZeile(page, "transglobal:85", "transglobal"), `Alle Gewichte 35 % eigener Satz. ${ALLE}`);
  await spalte(page, "transglobal:85", "transglobal").locator(".adm-po-all-change").click();
  await warte(async () => (await page.evaluate(aktiv)) === "adm-tarif-input-transglobal-85-0");
  assert.equal(await feld(page, "transglobal:85", 0).inputValue(), "35,00");
  await feld(page, "transglobal:85", 0).fill("40");
  await warte(() => state.previews.length >= 1 && (state.previews.at(-1).body.entries || []).length === 3);
  await warte(async () => (await zahlen(page, "transglobal:85", "transglobal")).markup.includes("→"));
  assert.equal((await zahlen(page, "transglobal:85", "transglobal")).markup, "Ihr Aufschlag: 35 % → 40 %", "die Klasse erbt den Entwurf für alle Gewichte");
  assert.deepEqual((await hinweise(page, "transglobal:85", "transglobal")).map(([s, t]) => [s, t.startsWith("Mit Ihrer Eingabe: ")]), [["at_risk", true]]);
  assert.equal(await zaehler(page), "● 3 ungespeicherte Änderungen");
  await page.locator("#adm-tarif-save").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const text = norm(await dialog.innerText());
  assert.match(text, /Neue Aufschläge speichern\?/);
  assert.match(text, /Muster Logistik GmbH/);
  assert.match(text, /Grundlage: Preisvergleich vom 17\.11\.2026, 10:12 Uhr\./);
  assert.match(text, /Bereits angezeigte Angebote melden beim Buchen eine Preisänderung/);
  assert.equal(norm(await page.locator("#adm-tarif-confirm").innerText()), "Ja, speichern");
  assert.deepEqual(await dialog.locator("li.adm-po-change").evaluateAll((els) => els.map((e) => e.dataset.key)), ["transglobal:23:1", "transglobal:85:0", "jumingo:2:1"]);
  const eintrag = (key) => dialog.locator(`li.adm-po-change[data-key="${key}"]`);
  assert.equal(norm(await eintrag("transglobal:23:1").locator(".adm-po-change-name").innerText()), "UPS Express Saver · Transglobal · Bis 5 kg");
  assert.equal(norm(await eintrag("transglobal:23:1").locator(".adm-po-change-values").innerText()), "Bisher: kein eigener Satz (30 %) → Neu: 35 %");
  assert.deepEqual((await eintrag("transglobal:23:1").locator(".adm-po-change-impact").allInnerTexts()).map(norm), ["Bis 5 kg, Beispielpaket 5 kg: Kunde zahlt 19,44 € statt 18,72 € · bei uns 11,6 % günstiger"]);
  assert.equal(norm(await eintrag("jumingo:2:1").locator(".adm-po-change-name").innerText()), "UPS Express Saver · JUMiNGO · Bis 5 kg");
  assert.equal(norm(await eintrag("jumingo:2:1").locator(".adm-po-change-values").innerText()), "Bisher: kein eigener Satz (30 %) → Neu: 25 %");
  assert.deepEqual((await eintrag("jumingo:2:1").locator(".adm-po-change-impact").allInnerTexts()).map(norm), ["Bis 5 kg, Beispielpaket 5 kg: Kunde zahlt 22,00 € statt 22,88 € · bei uns 13,2 % teurer"], "dasselbe Beispielpaket wie in der Spalte");
  assert.equal(norm(await eintrag("transglobal:85:0").locator(".adm-po-change-name").innerText()), "DHL Express 9:00 · Transglobal · Alle Gewichte");
  assert.equal(norm(await eintrag("transglobal:85:0").locator(".adm-po-change-values").innerText()), "Bisher: 35 % → Neu: 40 %");
  const wirkung = (await eintrag("transglobal:85:0").locator(".adm-po-change-impact").allInnerTexts()).map(norm);
  assert.equal(wirkung.length, 4, "eine Zeile je Gewichtsklasse");
  assert.equal(wirkung[0], "Bis 5 kg, Beispielpaket 5 kg: Kunde zahlt 100,80 € statt 97,20 € · bei uns 76,2 % teurer");
  assert.equal(wirkung[2], "10–20 kg, Beispielpaket 12 kg: Kunde zahlt 142,80 € statt 137,70 €");
  assert.deepEqual((await eintrag("transglobal:85:0").locator(".adm-po-change-warn .adm-po-badge").allInnerTexts()).map(norm), ["Preisvorteil gefährdet", "Kein verlässlicher Vergleich"]);
  // Abbrechen speichert nichts.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(state.puts.length, 0);
  // Bestätigen: genau EIN PUT mit genau den drei Einträgen — der Bestandswert 0 % von UPS Standard ist nicht dabei.
  await page.locator("#adm-tarif-save").click();
  await page.locator("#adm-tarif-confirm").click();
  await page.locator(`${KARTE} .alert-success`).waitFor();
  assert.equal(state.puts.length, 1);
  assert.deepEqual(state.puts[0], { uid: 7, body: { entries: [
    { provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 },
    { provider: "transglobal", productKey: 85, weightClass: 0, markupPercent: 40 },
    { provider: "jumingo", productKey: 2, weightClass: 1, markupPercent: 25 },
  ] } });
  assert.equal(norm(await page.locator(`${KARTE} .alert-success`).innerText()), "Gespeichert. Die Aufschläge gelten ab jetzt für neue Preisanfragen dieses Kunden.");
  await warte(() => page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("alert-success")));
  assert.equal(await zaehler(page), "Keine Änderungen");
  assert.equal(norm(await page.locator(`${KARTE} .adm-tarif-badge`).innerText()), "5 individuell", "zwei neue Sätze, einer geändert");
  assert.equal((await zahlen(page, "transglobal:85", "transglobal")).markup, "Ihr Aufschlag: 40 % | Satz für alle Gewichte");
  assert.equal(await feld(page, "transglobal:85", 0).count(), 0, "nach dem Speichern wieder die ruhige Zeile");
  await warte(() => state.previews.length >= 1 && Object.keys(state.previews.at(-1).body).length === 0);
  assert.equal(state.refreshes.length, 1, "Speichern ruft keinen Provider; die Basis wird ohne Abruf neu gerechnet");

  // Verlauf: erst beim Aufklappen geladen, neueste Änderung zuerst.
  assert.equal(state.audits.length, 0);
  await page.locator("#adm-po-history > summary").click();
  await page.locator("#adm-po-history li.adm-po-history-item").first().waitFor();
  assert.deepEqual(state.audits[0], { action: "user.tariff_markup_change", target_user_id: "7", limit: "20", offset: "0" });
  const eintraege = page.locator("#adm-po-history li.adm-po-history-item");
  assert.deepEqual(await eintraege.evaluateAll((els) => els.map((e) => e.dataset.entry)), ["102", "101", "100", "3", "2", "1"]);
  const was = async (id) => norm(await page.locator(`#adm-po-history li[data-entry="${id}"] .adm-po-history-what`).innerText());
  assert.equal(await was("102"), "UPS Express Saver · JUMiNGO · Bis 5 kg: kein eigener Satz → 25 %");
  assert.equal(await was("101"), "DHL Express 9:00 · Transglobal · Alle Gewichte: 35 % → 40 %");
  assert.equal(norm(await page.locator('#adm-po-history li[data-entry="101"] .adm-po-history-when').innerText()), "17.11.2026, 11:15 Uhr · Anna Admin");
  assert.equal(await was("100"), "UPS Express Saver · Transglobal · Bis 5 kg: kein eigener Satz → 35 %");
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
  assert.equal(norm(await page.getByRole("dialog").locator('li[data-key="transglobal:85:0"] .adm-po-change-values').innerText()), "Bisher: 40 % → Neu: 35 %");
  await page.locator("#adm-tarif-confirm").click();
  await warte(() => state.puts.length === 2);
  assert.deepEqual(state.puts[1].body, { entries: [{ provider: "transglobal", productKey: 85, weightClass: 0, markupPercent: 35 }] });
  await warte(() => state.audits.length === 2);
  await warte(async () => (await eintraege.first().getAttribute("data-entry")) === "103");
  assert.equal(await was("103"), "DHL Express 9:00 · Transglobal · Alle Gewichte: 40 % → 35 %");
  assert.equal(state.refreshes.length, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("H — Untergrenze: neuer Wert unter 25 % gesperrt, unveränderter Bestandswert erlaubt, Server-400 am betroffenen Feld", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await kopf(page, "transglobal:22").click();
  await spalte(page, "transglobal:22", "transglobal").locator(".adm-po-all-change").click();
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
  // Der Server lehnt trotzdem ab (z. B. andere Untergrenze): Meldung am Feld, das er nennt — Bereich und Reiter öffnen sich.
  await reiter(page, "transglobal:22", 2).click();
  await spalte(page, "transglobal:22", "jumingo").locator(".adm-po-custom").click();
  await feld(page, "jumingo:1", 2).fill("25");
  state.putFehler = { status: 400, body: { error: "Neue Aufschläge müssen mindestens 25 % betragen. Bestehende niedrigere Werte bleiben unverändert, solange sie nicht geändert werden.",
    code: "MARKUP_BELOW_MINIMUM", provider: "jumingo", productKey: 1, weightClass: 2 } };
  await kopf(page, "transglobal:23").click();
  await reiter(page, "transglobal:23", 1).click();
  await page.locator("#adm-tarif-save").click();
  await page.locator("#adm-tarif-confirm").click();
  await page.locator(`${KARTE} .adm-po-save .alert-error`).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(state.puts.length, 1);
  assert.equal(await kopf(page, "transglobal:22").getAttribute("aria-expanded"), "true", "der Bereich des betroffenen JUMiNGO-Tarifs öffnet sich");
  assert.equal(await reiter(page, "transglobal:22", 2).getAttribute("aria-selected"), "true", "auf dem betroffenen Gewicht");
  assert.equal(await feld(page, "jumingo:1", 2).getAttribute("aria-invalid"), "true");
  assert.match(norm(await page.locator("#adm-tarif-input-jumingo-1-2-error").innerText()), /mindestens 25 %/);
  assert.equal(await zaehler(page), "● 2 ungespeicherte Änderungen", "Entwürfe bleiben erhalten");
  assert.equal(state.refreshes.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("I — Fehlerpfade: Abruf 500/429, Vorschau 410 ohne automatischen Abruf, Speichern 500, Verlauf 500", async () => {
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
  await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-custom").click();
  await feld(page, "transglobal:23", 1).fill("40");
  await page.locator(`${KARTE} .adm-tarif-note--warn`).waitFor();
  assert.match(norm(await page.locator(`${KARTE} .adm-tarif-note--warn`).innerText()), /^Preisvergleich erneut ausführen\. Der letzte Preisvergleich ist älter als 24 Stunden/);
  assert.equal((await urteil(page, "transglobal:23")).art, "not_compared", "ohne Basis keine Kernaussage");
  assert.equal(await empfehlung(page, "transglobal:23", "transglobal"), "Empfohlen Keine Empfehlung verfügbar Erst Preise vergleichen");
  assert.equal((await zahlen(page, "transglobal:23", "transglobal")).purchase, "Unser Einkauf: —", "keine veralteten Zahlen");
  assert.equal(await details(page, "transglobal:23").count(), 0);
  assert.equal(await feld(page, "transglobal:23", 1).inputValue(), "40");
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung", "die Änderung bleibt offen");
  await page.waitForTimeout(400);
  assert.equal(state.refreshes.length, 3, "nichts wird automatisch abgerufen");
  state.previewStatus = null;
  await vergleiche(page, state);
  await warte(async () => (await zahlen(page, "transglobal:23", "transglobal")).markup.includes("→"));
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

test("J — Tastatur: Bereichskopf, Reiter mit Pfeiltasten/Pos1/Ende, „Empfehlung übernehmen“, Dialog mit Escape und Fokusrückgabe", async () => {
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
  assert.equal(await empfehlung(page, "transglobal:23", "transglobal"), "Empfohlen 35 %");
  // Nächstes Ziel nach den Reitern: „Empfehlung übernehmen“ (Transglobal); danach steht der Fokus im Feld.
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains("adm-po-adopt") && !!document.activeElement.closest('section[data-provider="transglobal"]')), true);
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
  assert.equal(await page.evaluate(aktiv), "adm-tarif-save", "Fokus zurück auf „Änderungen prüfen“");
  assert.equal(state.puts.length, 0);
  await page.keyboard.press("Enter");
  await page.locator("#adm-tarif-confirm").focus();
  await page.keyboard.press("Enter");
  await warte(() => state.puts.length === 1);
  assert.deepEqual(state.puts[0].body, { entries: [{ provider: "transglobal", productKey: 23, weightClass: 1, markupPercent: 35 }] });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("K — 390 px und 200 % Zoom: kein Querüberlauf, Reiter 2 × 2, Spalten untereinander, Ziele groß genug", async () => {
  const { page, state, fehler } = await neueSeite({ width: 390, height: 844 });
  await oeffne(page);
  await vergleiche(page, state);
  assert.equal(await page.locator(`${KARTE} .adm-po-ledger-head`).evaluate((el) => getComputedStyle(el).display), "none", "schmal ohne Kopfzeile");
  assert.equal(await kopf(page, "transglobal:22").locator(".adm-po-cell-label").first().evaluate((el) => getComputedStyle(el).position), "static", "Anbieternamen sichtbar an den Zahlen");
  await kopf(page, "transglobal:22").click();
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
  // Transglobal oben, JUMiNGO darunter; Zahlen rechts neben ihrer Bezeichnung, nicht abgeschnitten.
  const tg = await spalte(page, "transglobal:22", "transglobal").boundingBox();
  const ju = await spalte(page, "transglobal:22", "jumingo").boundingBox();
  assert.ok(ju.y >= tg.y + tg.height - 1 && Math.abs(ju.x - tg.x) < 2, "Spalten untereinander");
  const fig = spalte(page, "transglobal:22", "transglobal").locator('.adm-po-figure[data-figure="customer"]');
  const [dt, dd] = [await fig.locator("dt").boundingBox(), await fig.locator(".adm-po-figure-value").boundingBox()];
  assert.ok(dd.x > dt.x + dt.width - 1, "Zahl rechts neben der Bezeichnung");
  assert.equal(await fig.locator(".adm-po-figure-value").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "Zahl nicht abgeschnitten");
  const kopfBox = await kopf(page, "transglobal:22").boundingBox();
  assert.ok(kopfBox && kopfBox.height >= 44, "Bereichskopf als Touchziel");
  const adopt = await spalte(page, "transglobal:22", "transglobal").locator(".adm-po-adopt").boundingBox();
  assert.ok(adopt && adopt.height >= 24 && adopt.width >= 24, "„Empfehlung übernehmen“ mindestens 24 × 24 px");
  const save = await page.locator("#adm-tarif-save").boundingBox();
  assert.ok(save && save.height >= 44, "„Änderungen prüfen“ als Touchziel");
  // Details mit der Tabelle aller Beispielpakete: gestapelt, kein Querüberlauf.
  await details(page, "transglobal:22").locator("> summary").click();
  assert.equal(await details(page, "transglobal:22").locator("table.adm-po-samples thead").first().evaluate((el) => getComputedStyle(el).position), "absolute", "Spaltenköpfe nur für Screenreader, Werte gestapelt");
  b = await breite();
  assert.ok(b.seite <= b.fenster, `kein Querüberlauf mit offenen Details (${b.seite} > ${b.fenster})`);
  // Mehrere Kandidaten schmal: Auswahl als große Ziele.
  await kopf(page, "transglobal:84").click();
  const kandidat = await spalte(page, "transglobal:84", "jumingo").locator("label.adm-po-cand").first().boundingBox();
  assert.ok(kandidat && kandidat.height >= 44, "Kandidatenwahl als Touchziel");
  // 200 % Zoom auf einem 1280er Fenster = 640 CSS-Pixel.
  await page.setViewportSize({ width: 640, height: 500 });
  b = await breite();
  assert.ok(b.seite <= b.fenster, `kein Querüberlauf bei 200 % Zoom (${b.seite} > ${b.fenster})`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("L — Kundenwechsel in der App: Karte neu montiert, Entwürfe und Vergleichsbasis beginnen leer", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:23").click();
  await spalte(page, "transglobal:23", "transglobal").locator(".adm-po-adopt").click();
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
  assert.equal((await urteil(page, "transglobal:23")).art, "not_compared");
  assert.equal(await zaehler(page), "Keine Änderungen");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.puts.length], [1, 0]);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("M — Adminrechte: ein Kundenkonto sieht die Karte nicht und löst keinen Aufschlagsabruf aus", async () => {
  const { page, state, fehler } = await neueSeite();
  // Später registrierte Routen gehen vor: /kundenbereich meldet ein Kundenkonto statt des Admins.
  await page.route("**/kundenbereich", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: KONTEN[7] }) }));
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
  await page.waitForTimeout(400);
  assert.equal(await page.locator(KARTE).count(), 0);
  assert.deepEqual([state.gets, ...zaehlerstand(state), state.audits.length], [0, 0, 0, 0, 0]);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N — Sicherheitsinvariante: 0 Schreibaufrufe und 0 neue Providerkontakte beim Ansehen, Öffnen, Filtern, Gewichts- und Kandidatenwechsel, Simulieren", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  const durchgehen = async () => {
    for (const id of BEREICHE) {
      await kopf(page, id).click();
      for (const wc of [1, 2, 3, 4]) await reiter(page, id, wc).click();
    }
    await weitereOeffnen(page);
    for (const id of ["jumingo:8", "jumingo:9"]) {
      await kopf(page, id).click();
      for (const wc of [1, 2, 3, 4]) await reiter(page, id, wc).click();
    }
  };
  // Ansehen, Öffnen und Gewichtswechsel ohne Vergleich.
  await durchgehen();
  // Filtern: anderes Zielland verwirft nur die Anzeige — kein Abruf.
  await page.locator("#adm-tarif-destination").selectOption("AT");
  await page.locator("#adm-tarif-destination").selectOption("DE");
  await page.waitForTimeout(400);
  assert.deepEqual([...zaehlerstand(state), state.audits.length], [0, 0, 0, 0], "ohne bewusste Aktion kein Providerkontakt, keine Vorschau, kein Schreiben");
  // Die bewusste Betreiberaktion: genau ein Abruf.
  await vergleiche(page, state);
  await durchgehen();
  await kopf(page, "transglobal:84").click();
  await reiter(page, "transglobal:84", 1).click(); // die zuletzt gewählte Klasse (Über 20 kg) bleibt sonst stehen
  await spalte(page, "transglobal:84", "jumingo").locator('input[value="jumingo:8"]').check();
  await spalte(page, "transglobal:84", "jumingo").locator('input[value="jumingo:4"]').check();
  await details(page, "transglobal:84").locator("> summary").click();
  await page.waitForTimeout(400);
  assert.deepEqual(zaehlerstand(state), [1, 0, 0], "Ansehen nach dem Vergleich: kein weiterer Abruf, keine Vorschau, kein Schreiben");
  // Simulieren: Entwurf → serverseitige Vorschau (0 Providercalls), nie ein PUT, nie ein neuer Abruf.
  await spalte(page, "transglobal:84", "transglobal").locator(".adm-po-custom").click();
  await feld(page, "transglobal:84", 1).fill("45");
  await warte(() => state.previews.length === 1);
  await reiter(page, "transglobal:84", 3).click();
  await spalte(page, "transglobal:84", "transglobal").locator(".adm-po-adopt").click();
  await warte(() => state.previews.length === 2);
  await page.waitForTimeout(450);
  assert.deepEqual([state.refreshes.length, state.puts.length], [1, 0], "Simulieren schreibt nichts und fragt keinen Provider");
  assert.ok(state.previews.every((p) => p.runId === "41"), "Vorschau nur auf der vorhandenen Vergleichsbasis");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("O — Entwurf auf einem gerade nicht gewählten JUMiNGO-Kandidaten bleibt sichtbar und steht im Dialog", async () => {
  const { page, state, fehler } = await neueSeite();
  await oeffne(page);
  await vergleiche(page, state);
  await kopf(page, "transglobal:84").click();
  const wahl = spalte(page, "transglobal:84", "jumingo").locator("fieldset.adm-po-cands");
  await wahl.locator('input[value="jumingo:8"]').check();
  await spalte(page, "transglobal:84", "jumingo").locator(".adm-po-custom").click();
  await feld(page, "jumingo:8", 1).fill("40");
  await warte(() => state.previews.length === 1);
  // Zurück auf das Registerpaar: die Spalte zeigt JUMiNGO 4, der Entwurf von JUMiNGO 8 bleibt — und bleibt sichtbar.
  await wahl.locator('input[value="jumingo:4"]').check();
  assert.equal(await spalte(page, "transglobal:84", "jumingo").getAttribute("data-tariff"), "jumingo:4");
  assert.equal(await feld(page, "jumingo:8", 1).count(), 0, "das Feld des anderen Kandidaten ist nicht zu sehen");
  assert.deepEqual((await wahl.locator("label.adm-po-cand").allInnerTexts()).map(norm), ["DHL Express Domestic Gleichwertig", "DHL Express Sondertarif Ähnlicher Tarif ● noch nicht gespeichert"]);
  assert.equal(norm(await kopf(page, "transglobal:84").locator(".adm-po-tarif-dirty").innerText()), "● 1 ungespeicherte Änderung", "die Bereichszeile zählt jeden Kandidaten");
  assert.equal(norm(await reiter(page, "transglobal:84", 1).innerText()), "Bis 5 kg (noch nicht gespeichert)");
  assert.equal(norm(await page.locator("#adm-po-more > summary").innerText()), "Weitere JUMiNGO-Tarife (2) ● 1 ungespeicherte Änderung", "auch eingeklappt sichtbar");
  assert.equal(await zaehler(page), "● 1 ungespeicherte Änderung");
  // Der Dialog nennt den Entwurf ausdrücklich; Abbrechen speichert nichts, Verwerfen räumt alle Marken weg.
  await page.locator("#adm-tarif-save").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.deepEqual(await dialog.locator("li.adm-po-change").evaluateAll((els) => els.map((e) => e.dataset.key)), ["jumingo:8:1"]);
  assert.equal(norm(await dialog.locator(".adm-po-change-name").innerText()), "DHL Express Sondertarif · JUMiNGO · Bis 5 kg");
  assert.equal(norm(await dialog.locator(".adm-po-change-values").innerText()), "Bisher: kein eigener Satz (30 %) → Neu: 40 %");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await page.locator("#adm-tarif-discard").click();
  assert.equal(await kopf(page, "transglobal:84").locator(".adm-po-tarif-dirty").count(), 0);
  assert.equal(await wahl.locator(".adm-po-cand-dirty").count(), 0);
  assert.equal(norm(await page.locator("#adm-po-more > summary").innerText()), "Weitere JUMiNGO-Tarife (2)");
  await page.waitForTimeout(400);
  assert.deepEqual([state.refreshes.length, state.puts.length], [1, 0]);
  assert.deepEqual(fehler, []);
  await page.close();
});
