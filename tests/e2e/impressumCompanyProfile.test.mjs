// E2E: Schritt 3 (Betreiberentscheidung 2026-10-19) — das Impressum nennt die zentralen Anbieterangaben des Servers,
// sobald dieser einen gültigen Aussteller freigibt; sonst die Vorbereitungsdarstellung.
// Echter Dev-Server, echter Browser, gemocktes Backend.
//
//   A  freigegebener Aussteller: Firma, Anschrift, Geschäftsführung, Register, USt-IdNr. aus der Serverantwort
//   B  „pre_formation", Serverfehler und fremde Antwort: die Vorbereitungsdarstellung — nie eine Gesellschaft
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5571, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const AUSSTELLER = {
  status: "issuer",
  profile: {
    name: "ConfidaraExpress UG (haftungsbeschränkt)", legalForm: "UG (haftungsbeschränkt)", street: "Weiherstraße 25",
    postalCode: "73207", city: "Plochingen", country: "DE", email: "kontakt@example.com", phone: "+49 7153 000000",
    managingDirectors: "Erika Echt", registerCourt: "Amtsgericht Stuttgart", registerNumber: "HRB 999999", vatId: "DE999999999",
  },
};

let server, browser;

async function impressum(antwort, status = 200) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    if (pfad.endsWith("/api/legal/company-profile")) {
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(antwort) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto(`${BASE}/impressum`, { waitUntil: "networkidle" });
  await page.waitForSelector("#impressum-anbieter");
  const text = (await page.locator(".legal-sheet").innerText()).replace(/\s+/g, " ");
  const quelle = await page.locator("#impressum-anbieter").getAttribute("data-company-source");
  return { page, fehler, text, quelle };
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — freigegebener Aussteller: das Impressum nennt genau die Angaben des Servers", async () => {
  const { page, fehler, text, quelle } = await impressum(AUSSTELLER);
  assert.equal(quelle, "issuer");
  for (const teil of [
    "ConfidaraExpress UG (haftungsbeschränkt) Weiherstraße 25 73207 Plochingen Deutschland",
    "Vertreten durch die Geschäftsführung: Erika Echt",
    "Telefon: +49 7153 000000", "E-Mail: kontakt@example.com",
    "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: DE999999999",
    "Registergericht: Amtsgericht Stuttgart · Registernummer: HRB 999999",
  ]) assert.ok(text.includes(teil), `fehlt: „${teil}"\n${text}`);
  // Die Vorbereitungsdarstellung verschwindet vollständig.
  assert.ok(!/in Vorbereitung|keine Eintragung/.test(text), text);
  assert.equal(await page.locator("#impressum-gruendung").count(), 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — ohne freigegebenen Aussteller: die Vorbereitungsdarstellung, nie eine Gesellschaft", async () => {
  for (const [antwort, status] of [[{ status: "pre_formation" }, 200], [{ error: "x" }, 500], [{ status: "issuer", profile: { name: "Halb" } }, 200], [{}, 200]]) {
    const { page, fehler, text, quelle } = await impressum(antwort, status);
    const wo = JSON.stringify(antwort);
    assert.equal(quelle, "pre_formation", wo);
    assert.ok(text.includes("Gründung einer UG (haftungsbeschränkt) in Vorbereitung."), `${wo}\n${text}`);
    assert.ok(!/Registergericht:|Geschäftsführung:|GbR|Halb/.test(text), `${wo}: ${text}`);
    assert.deepEqual(fehler, [], wo);
    await page.close();
  }
});
