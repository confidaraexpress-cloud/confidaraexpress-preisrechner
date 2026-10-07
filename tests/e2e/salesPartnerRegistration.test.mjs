// E2E: Empfehlungslinks und öffentliche Partnerregistrierung.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) — es
// entsteht zu keinem Zeitpunkt eine echte Registrierung, kein echter Request
// verlässt den Browser. Geprüft wird:
//   1. /register?ref=… mit Freigabe → Code im Register-POST, Adresse ohne ref,
//      Code im Speicher der Art „customer".
//   2. Ohne Freigabe → nichts in localStorage, der Sitzungswert gilt trotzdem.
//   3. /registrieren ist ein Alias mit Suchteil (ohne ref).
//   4. /partner-registrieren geschlossen → neutraler Hinweis, kein Formular.
//   5. /partner-registrieren geöffnet → Absenden mit sponsorCode und
//      Vereinbarungsfassung, Erfolgshinweis, keine Anmeldung, Code gelöscht.
//   6. Keine Vermischung: ein Kundencode wird nie zum Sponsorcode.
//   7. Ein Serverabschluss während des Absendens schließt das Formular.
//   8. Pre-Live-Testweg: dasselbe Formular, Testhinweis statt Vertragsannahme,
//      Antrag ohne Fassung, Sponsorcode des Partnerlinks geht mit.
//   9. Testweg nur auf ausdrückliche Nennung: ein produktiver Modus ohne
//      prüfbare Fassung bleibt geschlossen (nie stattdessen der Testweg).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5482, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Vertragsstand der öffentlichen Konfiguration: `agreementUrl` ist entfallen,
// die registrierte Fassung kommt als `agreement`. Geöffnet ist die
// Registrierung nur, wenn genau diese Fassung zugestimmt wird (die Seite
// /partnervereinbarung prüft salesPartnerAgreement.test.mjs).
const CONFIG_OFFEN = {
  registrationEnabled: true, registrationMode: "production", referralsEnabled: true, referralRetentionDays: 30,
  agreementVersion: "2026-10",
  agreement: { version: "2026-10", effectiveFrom: "2026-10-01", effectiveTo: null,
    documentPath: "/api/legal/sales_partner_agreement/2026-10" },
};

// Pre-Live-Testweg laut Backendvertrag: produktive Registrierung aus, Testweg offen, keine Fassung.
const CONFIG_PRELIVE = {
  registrationEnabled: false, registrationMode: "prelive_test", referralsEnabled: false, referralRetentionDays: 30,
  agreementVersion: null, agreement: null,
};
const PRELIVE_HINWEIS = "Pre-Live-Testbetrieb – diese Registrierung dient ausschließlich dem internen Funktionstest und begründet noch keine rechtsverbindliche Vertriebspartnervereinbarung.";

let server, browser;

// Backend-Mock. Jeder Request wird beantwortet; Bodies werden mitgeschnitten,
// aber nie protokolliert (sie enthalten Passwörter).
async function setup(page, { config = CONFIG_OFFEN, onPartnerRegister } = {}) {
  const calls = { register: [], partnerRegister: [], config: 0, other: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/sales-partner/public-config")) { calls.config += 1; return json(config); }
    if (p.endsWith("/api/sales-partner/register") && req.method() === "POST") {
      calls.partnerRegister.push(req.postDataJSON());
      if (onPartnerRegister) return onPartnerRegister(route, json);
      return json({ message: "Antrag eingegangen" });
    }
    if (p.endsWith("/register") && req.method() === "POST") {
      calls.register.push(req.postDataJSON());
      return json({ message: "Registrierung erfolgreich" });
    }
    calls.other.push(p);
    return json({});
  });
  return calls;
}

const speicher = (page) => page.evaluate(() => ({
  customer: localStorage.getItem("ce_ref_customer_v1"),
  partner: localStorage.getItem("ce_ref_partner_v1"),
  token: localStorage.getItem("ce_token"),
}));

async function kundenformularAbsenden(page) {
  await page.waitForSelector("#reg-name");
  await page.fill("#reg-name", "Max Mustermann");
  await page.fill("#reg-email", "einkauf@muster-logistik.de");
  await page.fill("#reg-company", "Muster Logistik GmbH");
  const pw = page.locator('.auth-input[type="password"]');
  await pw.nth(0).fill("EinSicheresPasswort2026");
  await pw.nth(1).fill("EinSicheresPasswort2026");
  await page.locator("button.auth-cta").click();
}

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

test("1 — /register?ref=… mit Freigabe: Code im Register-POST, Adresse ohne ref, Kundenspeicher belegt", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await page.goto(`${BASE}/register?ref=ABCDEFGH`, { waitUntil: "networkidle" });
  assert.equal(new URL(page.url()).search, "", `ref steht noch in der Adresse: ${page.url()}`);
  assert.equal(new URL(page.url()).pathname, "/register");
  await page.waitForFunction(() => localStorage.getItem("ce_ref_customer_v1") !== null);
  const vorher = await speicher(page);
  assert.equal(JSON.parse(vorher.customer).code, "ABCDEFGH");
  assert.equal(vorher.partner, null, "ein Kundencode belegt nie den Partnerschlüssel");

  await kundenformularAbsenden(page);
  await page.waitForFunction(() => document.querySelector(".auth-alert-success") !== null);
  assert.equal(calls.register.length, 1);
  assert.equal(calls.register[0].referralCode, "ABCDEFGH");
  assert.equal(calls.register[0].company_name, "Muster Logistik GmbH", "der bisherige Payload bleibt");
  assert.equal("sponsorCode" in calls.register[0], false);
  const nachher = await speicher(page);
  assert.equal(nachher.customer, null, "nach Erfolg ist der Kundencode gelöscht");
  await page.close();
});

test("2 — ohne Freigabe landet nichts in localStorage; der Sitzungswert wird trotzdem gesendet", async () => {
  const page = await browser.newPage();
  const calls = await setup(page, { config: { ...CONFIG_OFFEN, referralsEnabled: false } });
  await page.goto(`${BASE}/register?ref=abcdefgh`, { waitUntil: "networkidle" });
  assert.equal(new URL(page.url()).search, "");
  await page.waitForTimeout(300);
  assert.ok(calls.config >= 1, "die Konfiguration wurde nicht abgefragt");
  const s = await speicher(page);
  assert.equal(s.customer, null, "ohne Freigabe darf nichts gespeichert werden");
  assert.equal(s.partner, null);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(keys.filter((k) => k.startsWith("ce_ref_")), []);

  await kundenformularAbsenden(page);
  await page.waitForFunction(() => document.querySelector(".auth-alert-success") !== null);
  assert.equal(calls.register[0].referralCode, "ABCDEFGH", "Großbuchstaben, nur aus dem Arbeitsspeicher");
  await page.close();
});

test("3 — /registrieren leitet auf /register und behält den übrigen Suchteil", async () => {
  const page = await browser.newPage();
  await setup(page);
  await page.goto(`${BASE}/registrieren?utm_source=flyer&ref=ABCDEFGH`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-name");
  const url = new URL(page.url());
  assert.equal(url.pathname, "/register");
  assert.equal(url.search, "?utm_source=flyer");
  await page.waitForFunction(() => localStorage.getItem("ce_ref_customer_v1") !== null);
  await page.close();
});

test("4 — /partner-registrieren geschlossen: neutraler Hinweis, kein Formular", async () => {
  const page = await browser.newPage();
  await setup(page, { config: { ...CONFIG_OFFEN, registrationEnabled: false } });
  await page.goto(`${BASE}/partner-registrieren`, { waitUntil: "networkidle" });
  await page.waitForSelector("#sp-state");
  const text = await page.locator("#sp-state").innerText();
  assert.match(text, /Die Registrierung für Vertriebspartner ist derzeit nicht geöffnet\./);
  assert.equal(await page.locator("#sp-form").count(), 0, "kein Formular ohne Freigabe");
  await page.close();
});

test("5 — /partner-registrieren geöffnet: Absenden mit Sponsorcode, Erfolg ohne Anmeldung", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await page.goto(`${BASE}/partner-registrieren?ref=wxyz6789`, { waitUntil: "networkidle" });
  assert.equal(new URL(page.url()).search, "");
  await page.waitForSelector("#sp-form");
  await page.waitForFunction(() => localStorage.getItem("ce_ref_partner_v1") !== null);

  await page.fill("#sp-name", "Petra Partner");
  await page.fill("#sp-email", "petra@partner-vertrieb.de");
  await page.fill("#sp-password", "EinSicheresPasswort2026");
  await page.fill("#sp-password-repeat", "EinSicheresPasswort2026");
  await page.fill("#sp-company", "Vertrieb Süd GmbH");
  assert.equal(await page.locator("#sp-submit").isDisabled(), true, "ohne Zustimmung nicht absendbar");
  await page.locator("#sp-agreement").click();
  assert.equal(await page.locator("#sp-agreement").getAttribute("aria-checked"), "true");
  await page.locator("#sp-submit").click();

  await page.waitForSelector("#sp-state");
  assert.match(await page.locator("#sp-state").innerText(), /wird geprüft/);
  assert.equal(calls.partnerRegister.length, 1);
  const body = calls.partnerRegister[0];
  assert.equal(body.sponsorCode, "WXYZ6789");
  assert.equal(body.acceptedAgreementVersion, "2026-10");
  assert.equal(body.companyName, "Vertrieb Süd GmbH");
  assert.equal("phone" in body, false, "leere optionale Felder werden nicht gesendet");
  assert.equal("referralCode" in body, false);
  const s = await speicher(page);
  assert.equal(s.token, null, "nach der Partnerregistrierung wird nicht angemeldet");
  assert.equal(s.partner, null, "nach Erfolg ist der Partnercode gelöscht");
  await page.close();
});

test("6 — keine Vermischung: ein Kundencode wird nie zum Sponsorcode", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await page.goto(`${BASE}/register?ref=AAAA2222`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => localStorage.getItem("ce_ref_customer_v1") !== null);
  await page.goto(`${BASE}/partner-registrieren`, { waitUntil: "networkidle" });
  await page.waitForSelector("#sp-form");
  await page.fill("#sp-name", "Paul Partner");
  await page.fill("#sp-email", "paul@partner-vertrieb.de");
  await page.fill("#sp-password", "EinSicheresPasswort2026");
  await page.fill("#sp-password-repeat", "EinSicheresPasswort2026");
  await page.locator("#sp-agreement").press("Space");
  await page.locator("#sp-submit").click();
  await page.waitForSelector("#sp-state");
  assert.equal(calls.partnerRegister.length, 1);
  assert.equal("sponsorCode" in calls.partnerRegister[0], false, "der Kundencode darf nicht als Sponsorcode mitgehen");
  const s = await speicher(page);
  assert.notEqual(s.customer, null, "der Kundencode bleibt für die Kundenregistrierung erhalten");
  await page.close();
});

test("7 — ein Serverabschluss während des Absendens schließt das Formular (fail-closed)", async () => {
  const page = await browser.newPage();
  await setup(page, {
    onPartnerRegister: (route, json) => json({ code: "SALES_PARTNER_REGISTRATION_DISABLED", error: "x" }, 404),
  });
  await page.goto(`${BASE}/partner-registrieren`, { waitUntil: "networkidle" });
  await page.waitForSelector("#sp-form");
  await page.fill("#sp-name", "Paul Partner");
  await page.fill("#sp-email", "paul@partner-vertrieb.de");
  await page.fill("#sp-password", "EinSicheresPasswort2026");
  await page.fill("#sp-password-repeat", "EinSicheresPasswort2026");
  await page.locator("#sp-agreement").click();
  await page.locator("#sp-submit").click();
  await page.waitForSelector("#sp-state");
  assert.match(await page.locator("#sp-state").innerText(), /nicht geöffnet/);
  assert.equal(await page.locator("#sp-form").count(), 0);
  await page.close();
});

test("8 — Pre-Live-Testweg: dasselbe Formular, Testhinweis statt Vertragsannahme, Antrag ohne Fassung", async () => {
  const page = await browser.newPage();
  const calls = await setup(page, { config: CONFIG_PRELIVE });
  await page.goto(`${BASE}/partner-registrieren?ref=testab23`, { waitUntil: "networkidle" });
  await page.waitForSelector("#sp-form");
  for (const id of ["#sp-name", "#sp-email", "#sp-password", "#sp-password-repeat", "#sp-company", "#sp-phone", "#sp-submit"]) {
    assert.equal(await page.locator(id).count(), 1, `Feld ${id} wie im produktiven Formular`);
  }
  assert.equal(await page.locator("#sp-prelive-notice").innerText(), PRELIVE_HINWEIS);
  assert.equal(await page.locator("#sp-agreement").count(), 0, "keine (vorgetäuschte) Vertrags-Checkbox");
  assert.equal(await page.locator("#sp-agreement-link").count(), 0, "kein Link auf eine nicht existierende Vereinbarung");

  await page.fill("#sp-name", "Tina Test");
  await page.fill("#sp-email", "tina@intern.example");
  await page.fill("#sp-password", "EinSicheresPasswort2026");
  await page.fill("#sp-password-repeat", "EinSicheresPasswort2026");
  await page.fill("#sp-phone", "+49 30 123456");
  assert.equal(await page.locator("#sp-submit").isDisabled(), false, "ohne Vertragsannahme absendbar");
  await page.locator("#sp-submit").click();

  await page.waitForSelector("#sp-state");
  const erfolg = await page.locator("#sp-state").innerText();
  assert.match(erfolg, /Antrag eingegangen/);
  assert.match(erfolg, /wird geprüft/);
  assert.equal(calls.partnerRegister.length, 1);
  const body = calls.partnerRegister[0];
  assert.equal("acceptedAgreementVersion" in body, false, "keine Zustimmung zu einer Fassung");
  assert.equal(body.sponsorCode, "TESTAB23", "der Code des Partnerlinks geht mit");
  assert.equal(body.phone, "+49 30 123456");
  for (const k of ["isTest", "preliveTest", "prelive_test", "registrationMode"]) assert.equal(k in body, false, `${k} bestimmt nie der Client`);
  const st = await speicher(page);
  assert.equal(st.token, null, "kein Login nach dem Antrag");
  assert.equal(st.partner, null, "ohne Freigabe der Empfehlungslinks nichts im localStorage");
  await page.close();
});

test("9 — Testweg nur auf ausdrückliche Nennung: produktiver Modus ohne prüfbare Fassung bleibt geschlossen", async () => {
  const page = await browser.newPage();
  await setup(page, { config: { ...CONFIG_OFFEN, agreementVersion: null, agreement: null } });
  await page.goto(`${BASE}/partner-registrieren`, { waitUntil: "networkidle" });
  await page.waitForSelector("#sp-state");
  assert.match(await page.locator("#sp-state").innerText(), /Die Registrierung für Vertriebspartner ist derzeit nicht geöffnet./);
  assert.equal(await page.locator("#sp-form").count(), 0);
  assert.equal(await page.locator("#sp-prelive-notice").count(), 0);
  await page.close();
});
