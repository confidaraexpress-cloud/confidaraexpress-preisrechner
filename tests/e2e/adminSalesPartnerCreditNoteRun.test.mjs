// E2E: Admin · Vertriebspartner · Abrechnungslauf (/admin/partners/credit-notes).
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route); die Uhr
// steht auf dem 07.10.2026 (Standardmonat: September 2026). Es wird keine
// echte Gutschrift ausgestellt. Geprüft wird:
//   1. Erreichbar aus der Partnerliste; nur abgeschlossene Monate, Standard
//      Vormonat; Vorschau mit Status, Beträgen und deutschen Blockiergründen.
//   2. Ausstellen je Partner: genau der Vertragsbody mit dem Fingerabdruck,
//      Ergebnis in der Zeile, Vorschau neu geladen.
//   3. „Alle zulässigen ausstellen“: nacheinander je Partner; 409
//      CREDIT_NOTE_PREVIEW_STALE lädt die Vorschau neu und bricht ab.
//   4. Ein Fehler eines Partners hält den Lauf nicht an (Ergebnis je Partner).
//   5. Ausstellung abgeschaltet: Erklärung, Ausstellen gesperrt, kein Request.
//   6. Globaler Blockiergrund sperrt; nicht abgeschlossener Monat: Hinweis.
//   7. Pre-Live-Testlauf: Schalter nur bei aktivem Testmodus; scope=test an
//      Vorschau und Ausstellen, deutlicher Hinweis, Wechsel verwirft die
//      Vorschau; PARTNER_NOT_TEST bleibt in der Zeile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5487, BASE = `http://127.0.0.1:${PORT}`;
const HEUTE = "2026-10-07T10:00:00";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE" };

const zeile = (id, extra = {}) => ({
  partnerUserId: id, name: `Partner ${id}`, companyName: `Vertrieb ${id} GmbH`, entryCount: 3, netCents: 10000,
  taxCents: 1900, grossCents: 11900, taxStatus: "with_vat", taxRatePercent: "19.00", status: "issuable",
  blockers: [], fingerprint: `fp-${id}`, existingCreditNote: null, ...extra,
});
const vorschau = (partners, extra = {}) => ({
  month: "2026-09", cutoffAt: "2026-10-03T22:00:00.000Z", issuanceEnabled: true, globalBlockers: [], partners, ...extra,
});
const STANDARD = vorschau([
  zeile(5),
  zeile(6, { status: "blocked", blockers: ["billing_details_unconfirmed", "agreement_missing"], fingerprint: null,
    taxCents: null, grossCents: null, taxStatus: null, taxRatePercent: null }),
  zeile(7, { status: "carried_forward", netCents: -1200, taxCents: null, grossCents: null, fingerprint: null }),
  zeile(8, { status: "already_issued", fingerprint: null, existingCreditNote: { id: 41, number: "GS-2026-0041" } }),
]);

let server, browser;

/** Backend-Mock. `previews`: Antworten der Vorschau in Aufrufreihenfolge (der
 *  letzte Eintrag bleibt stehen); `issue`: [status, body] je partnerUserId;
 *  `delayMs`: Verzögerung jeder Ausstellung (prüft „nacheinander“). */
async function setup(page, { previews = [[200, STANDARD]], issue = {}, delayMs = 0, list = [], prelive = false } = {}) {
  const state = { previewQueries: [], posts: [], log: [], other: [], statusCalls: 0 };
  const liste = [...previews];
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/sales-partner-prelive/status")) {
      state.statusCalls += 1;
      return json(prelive ? { enabled: true, mailAllowlistConfigured: false, backdatingGlobalAllowed: false,
        counts: { partners: 1, customers: 1, shipments: 3, ledgerEntries: 2, creditNotes: 0 } } : { enabled: false, counts: null });
    }
    if (p.endsWith("/admin/sales-partners") && req.method() === "GET") return json({ partners: list, total: list.length, limit: 25, offset: 0 });
    if (p.endsWith("/admin/sales-partner-credit-notes/preview")) {
      state.previewQueries.push(url.search);
      const [status, body] = liste.length > 1 ? liste.shift() : liste[0];
      return json(body, status);
    }
    if (p.endsWith("/admin/sales-partner-credit-notes") && req.method() === "POST") {
      const body = req.postDataJSON();
      state.posts.push(body);
      state.log.push(`start ${body.partnerUserId}`);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      state.log.push(`ende ${body.partnerUserId}`);
      const [status, antwort] = issue[body.partnerUserId]
        || [201, { creditNote: { id: 100 + body.partnerUserId, number: `GS-2026-01${body.partnerUserId}` }, documentReady: true, notified: true }];
      return json(antwort, status);
    }
    state.other.push(`${req.method()} ${p}`);
    return json({});
  });
  await page.clock.setFixedTime(new Date(HEUTE));
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

async function vorschauLaden(page) {
  await page.goto(`${BASE}/admin/partners/credit-notes`, { waitUntil: "networkidle" });
  await page.locator("#adm-cn-preview").click();
  await page.locator("#adm-cn-summary").waitFor({ state: "visible" });
}
const zeileVon = (page, id) => page.locator(`#adm-cn-table tr[data-partner-id="${id}"]`);

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { detached: true, stdio: "ignore" });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — aus der Partnerliste erreichbar; nur abgeschlossene Monate; Vorschau mit deutschen Blockiergründen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await page.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-credit-notes-link").click();
  await page.waitForURL(`${BASE}/admin/partners/credit-notes`);
  await page.locator("#adm-cn-month").waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#adm-cn-month"), "2026-09", "Standard ist der Vormonat");
  const monate = await page.locator("#adm-cn-month option").evaluateAll((os) => os.map((o) => o.value));
  assert.equal(monate[0], "2026-09");
  assert.ok(!monate.includes("2026-10"), "der laufende Monat ist nicht wählbar");
  assert.equal(state.previewQueries.length, 0, "die Vorschau lädt erst auf Anforderung");
  assert.equal(await page.locator("#adm-cn-scope-test").count(), 0, "ohne Testmodus kein Testlauf");
  assert.equal(await page.locator("#adm-cn-test-note").count(), 0);

  await page.locator("#adm-cn-preview").click();
  await page.locator("#adm-cn-summary").waitFor({ state: "visible" });
  assert.deepEqual(state.previewQueries, ["?month=2026-09"]);
  assert.match(await page.locator("#adm-cn-summary").innerText(), /September 2026/);
  assert.equal(await page.locator("#adm-cn-issuance").innerText(), "Aktiviert");
  assert.equal(await page.locator("#adm-cn-table tbody tr").count(), 4);

  const ausstellbar = await zeileVon(page, 5).innerText();
  assert.match(ausstellbar, /Vertrieb 5 GmbH/);
  assert.match(ausstellbar, /Ausstellbar/);
  assert.match(ausstellbar, /119,00\s€/);
  assert.match(ausstellbar, /Mit Umsatzsteuerausweis · 19,00 %/);
  const blockiert = await zeileVon(page, 6).innerText();
  assert.match(blockiert, /Blockiert/);
  assert.match(blockiert, /Abrechnungsdaten nicht bestätigt/);
  assert.match(blockiert, /Keine akzeptierte Vertriebspartnervereinbarung/);
  assert.match(await zeileVon(page, 7).innerText(), /Wird vorgetragen/);
  assert.match(await zeileVon(page, 8).innerText(), /Bereits ausgestellt[\s\S]*GS-2026-0041/);
  const tabelle = await page.locator("#adm-cn-table").innerText();
  assert.doesNotMatch(tabelle, /billing_details_unconfirmed|agreement_missing|carried_forward|already_issued|\bissuable\b/,
    "kein Rohwert im sichtbaren Text");
  assert.equal(await page.locator("#adm-cn-issue-6").count(), 0, "keine Ausstellung für eine blockierte Zeile");
  assert.equal(await page.locator("#adm-cn-issue-all").innerText(), "Alle zulässigen ausstellen (1)");
  await page.close();
});

test("2 — Ausstellen je Partner: Vertragsbody mit Fingerabdruck, Ergebnis in der Zeile, neue Vorschau", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const nachher = vorschau([zeile(5, { status: "already_issued", fingerprint: null, existingCreditNote: { id: 105, number: "GS-2026-0105" } })]);
  const state = await setup(page, {
    previews: [[200, vorschau([zeile(5)])], [200, nachher]],
    issue: { 5: [201, { creditNote: { id: 105, number: "GS-2026-0105" }, documentReady: false, notified: true }] },
  });
  await vorschauLaden(page);
  await page.locator("#adm-cn-issue-5").click();
  await page.locator("#adm-cn-result-5").waitFor({ state: "visible" });
  assert.deepEqual(state.posts, [{ partnerUserId: 5, month: "2026-09", fingerprint: "fp-5" }]);
  assert.equal(await page.locator("#adm-cn-result-5").innerText(),
    "Gutschrift GS-2026-0105 ausgestellt. Das Dokument wird erstellt. Der Vertriebspartner wurde benachrichtigt.");
  await page.waitForFunction(() => document.querySelector('#adm-cn-table tr[data-partner-id="5"]')?.innerText.includes("Bereits ausgestellt"));
  assert.equal(state.previewQueries.length, 2, "nach dem Ausstellen lädt die Vorschau neu");
  assert.equal(await page.locator("#adm-cn-issue-5").count(), 0);
  assert.match(await zeileVon(page, 5).innerText(), /GS-2026-0105/);
  await page.close();
});

test("3 — alle zulässigen: nacheinander; 409 CREDIT_NOTE_PREVIEW_STALE lädt neu und bricht ab", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, {
    previews: [[200, vorschau([zeile(5), zeile(9), zeile(10)])], [200, vorschau([zeile(9, { fingerprint: "fp-9-neu" }), zeile(10)])]],
    issue: { 9: [409, { error: "Vorschau veraltet", code: "CREDIT_NOTE_PREVIEW_STALE" }] },
    delayMs: 250,
  });
  await vorschauLaden(page);
  assert.equal(await page.locator("#adm-cn-issue-all").innerText(), "Alle zulässigen ausstellen (3)");
  await page.locator("#adm-cn-issue-all").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.match(await page.locator('[role="dialog"]').innerText(), /September 2026 · 3 Vertriebspartner/);
  await page.locator("#adm-cn-issue-all-confirm").click();

  await page.locator("#adm-cn-message").waitFor({ state: "visible", timeout: 15000 });
  assert.deepEqual(state.posts.map((b) => [b.partnerUserId, b.fingerprint]), [[5, "fp-5"], [9, "fp-9"]],
    "nach der veralteten Vorschau wird nichts weiter ausgestellt");
  assert.deepEqual(state.log, ["start 5", "ende 5", "start 9", "ende 9"], "nacheinander, nie parallel");
  const meldung = await page.locator("#adm-cn-message").innerText();
  assert.match(meldung, /Die Vorschau war nicht mehr aktuell und wurde neu geladen\./);
  assert.match(meldung, /1 von 3 Gutschriften ausgestellt\./);
  assert.equal(state.previewQueries.length, 2, "die Vorschau wurde neu geladen");
  await page.waitForFunction(() => document.querySelectorAll("#adm-cn-table tbody tr").length === 2);
  assert.match(await page.locator("#adm-cn-result-9").innerText(), /nicht mehr aktuell/);
  assert.equal(await page.locator("#adm-cn-result-10").innerText(), "Nicht ausgestellt – der Lauf wurde abgebrochen.");
  await page.close();
});

test("4 — ein Fehler eines Partners hält den Lauf nicht an; Ergebnis je Partner", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, {
    previews: [[200, vorschau([zeile(5), zeile(9), zeile(10)])]],
    issue: {
      9: [409, { error: "Bereits ausgestellt", code: "CREDIT_NOTE_ALREADY_ISSUED", existing: { id: 77, number: "GS-2026-0077" } }],
      10: [422, { error: "Blockiert", code: "CREDIT_NOTE_BLOCKED", blockers: ["tax_note_missing"] }],
    },
  });
  await vorschauLaden(page);
  await page.locator("#adm-cn-issue-all").click();
  await page.locator("#adm-cn-issue-all-confirm").click();
  await page.locator("#adm-cn-message").waitFor({ state: "visible", timeout: 15000 });
  assert.deepEqual(state.posts.map((b) => b.partnerUserId), [5, 9, 10]);
  assert.equal(await page.locator("#adm-cn-message").innerText(), "1 von 3 Gutschriften ausgestellt.");
  assert.match(await page.locator("#adm-cn-result-5").innerText(), /Gutschrift GS-2026-015 ausgestellt\./);
  assert.equal(await page.locator("#adm-cn-result-9").innerText(), "Für diesen Monat besteht bereits die Gutschrift GS-2026-0077.");
  assert.equal(await page.locator("#adm-cn-result-10").innerText(), "Blockiert: Steuerhinweis für den Beleg fehlt.");
  assert.doesNotMatch(await page.locator("#adm-cn-table").innerText(), /CREDIT_NOTE|tax_note_missing/);
  await page.close();
});

test("5 — Ausstellung abgeschaltet: Erklärung, Ausstellen gesperrt, kein Request", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { previews: [[200, vorschau([zeile(5)], { issuanceEnabled: false, globalBlockers: ["issuance_disabled"] })]] });
  await vorschauLaden(page);
  assert.match(await page.locator("#adm-cn-disabled").innerText(), /Ausstellung ist deaktiviert \(SALES_PARTNER_CREDIT_NOTES_ENABLED\)\./);
  assert.equal(await page.locator("#adm-cn-issuance").innerText(), "Deaktiviert");
  assert.equal(await page.locator("#adm-cn-global-blockers").count(), 0, "derselbe Grund steht nicht doppelt");
  assert.equal(await page.locator("#adm-cn-issue-5").isDisabled(), true);
  assert.equal(await page.locator("#adm-cn-issue-all").isDisabled(), true);
  assert.equal(await page.getAttribute("#adm-cn-issue-5", "aria-describedby"), "adm-cn-closed");
  assert.deepEqual(state.posts, []);
  await page.close();
});

test("6 — globaler Blockiergrund sperrt; ein nicht abgeschlossener Monat erklärt sich", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { previews: [
    [200, vorschau([zeile(5)], { globalBlockers: ["issuer_config_incomplete", "credit_note_title_missing"] })],
    [400, { error: "Monat nicht abgeschlossen", code: "PERIOD_NOT_CLOSED" }],
  ] });
  await vorschauLaden(page);
  const global = await page.locator("#adm-cn-global-blockers").innerText();
  assert.match(global, /Die Ausstellung ist derzeit blockiert:/);
  assert.match(global, /Ausstellerangaben unvollständig/);
  assert.match(global, /Belegtitel der Gutschrift nicht hinterlegt/);
  assert.equal(await page.locator("#adm-cn-issue-all").isDisabled(), true);
  assert.equal(await page.locator("#adm-cn-issue-5").isDisabled(), true);

  await page.selectOption("#adm-cn-month", "2026-08");
  assert.equal(await page.locator("#adm-cn-summary").count(), 0, "ein Monatswechsel verwirft die alte Vorschau");
  await page.locator("#adm-cn-preview").click();
  await page.locator("#adm-cn-error").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-cn-error").innerText(),
    /Dieser Monat ist noch nicht abgeschlossen\. Abgerechnet werden nur abgeschlossene Monate\./);
  assert.equal(state.previewQueries[1], "?month=2026-08");
  assert.deepEqual(state.posts, []);
  await page.close();
});

test("7 — Pre-Live-Testlauf: Schalter nur bei aktivem Testmodus; scope=test an Vorschau und Ausstellen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const testVorschau = vorschau([zeile(41, { name: "Pia Test", companyName: "Test Vertrieb A", taxStatus: null, taxRatePercent: null,
    taxCents: 0, grossCents: 10000 }), zeile(6)]);
  const state = await setup(page, {
    prelive: true,
    previews: [[200, testVorschau]],
    issue: { 6: [409, { error: "Kein Testpartner.", code: "PARTNER_NOT_TEST" }],
      41: [201, { creditNote: { id: 141, number: "CE-TEST-PG26-0001" }, documentReady: true, notified: false }] },
  });
  await page.goto(`${BASE}/admin/partners/credit-notes`, { waitUntil: "networkidle" });
  await page.locator("#adm-cn-scope-test").waitFor({ state: "attached" });
  assert.equal(await page.locator("#adm-cn-scope-test").getAttribute("role"), "switch");
  assert.equal(await page.locator("#adm-cn-scope-test").isChecked(), false, "regulär ist der Standard");
  assert.equal(await page.locator("#adm-cn-test-note").count(), 0);

  // Regulär geladen, dann umgeschaltet: die Vorschau gilt nicht mehr.
  await page.locator("#adm-cn-preview").click();
  await page.locator("#adm-cn-summary").waitFor({ state: "visible" });
  assert.equal(state.previewQueries[0], "?month=2026-09");
  await page.locator("label.ce-switch", { hasText: "Pre-Live-Testlauf" }).click();
  assert.equal(await page.locator("#adm-cn-scope-test").isChecked(), true);
  assert.equal(await page.locator("#adm-cn-summary").count(), 0, "ein Wechsel verwirft die Vorschau");
  assert.equal(await page.locator("#adm-cn-test-note").innerText(),
    "Testgutschriften (CE-TEST-PG …) – nicht steuerlich gültig, keine E-Mail, keine Auszahlung");

  await page.locator("#adm-cn-preview").click();
  await page.locator("#adm-cn-summary").waitFor({ state: "visible" });
  assert.equal(state.previewQueries[1], "?month=2026-09&scope=test");
  assert.equal(await page.locator("#adm-cn-scope").innerText(), "Pre-Live-Testlauf");

  await page.locator("#adm-cn-issue-41").click();
  await page.locator("#adm-cn-result-41").waitFor({ state: "visible" });
  assert.deepEqual(state.posts[0], { partnerUserId: 41, month: "2026-09", fingerprint: "fp-41", scope: "test" });
  assert.match(await page.locator("#adm-cn-result-41").innerText(), /Gutschrift CE-TEST-PG26-0001 ausgestellt./);
  assert.equal(state.previewQueries.at(-1), "?month=2026-09&scope=test", "neu geladen im selben Bereich");

  await page.locator("#adm-cn-issue-6").click();
  await page.locator("#adm-cn-result-6").waitFor({ state: "visible" });
  assert.deepEqual(state.posts[1], { partnerUserId: 6, month: "2026-09", fingerprint: "fp-6", scope: "test" });
  assert.equal(await page.locator("#adm-cn-result-6").innerText(),
    "Dieser Vertriebspartner ist kein Testpartner – im Pre-Live-Testlauf werden nur Testpartner abgerechnet.");
  assert.doesNotMatch(await page.locator("#adm-cn-table").innerText(), /PARTNER_NOT_TEST/);
  await page.close();
});
