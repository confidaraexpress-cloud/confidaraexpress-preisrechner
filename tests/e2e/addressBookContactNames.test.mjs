// E2E: Paritätsaudit 2026-10-15, Session 2 — Adressbuch (echter Dev-Server, echter Browser).
//
// Prüft, was Quelltextanker nicht erreichen:
//   • A2: jede Adresse trägt ihre Kontaktperson — neue Adressen aus Vor- und Nachname, Altbestand aus
//     `contactName`; ohne Bezeichnung und Firma ist sie der Titel (nie „Ohne Bezeichnung“), in Liste
//     (1440 px) und Karte (390 px), auch im zugänglichen Namen des Aktionsmenüs,
//   • A3: ein Favorit auf einer Altbestandsadresse ohne vollständigen Versandkontakt nennt das
//     fehlende Feld und den Weg („Bearbeiten“), statt einer allgemeinen Fehlermeldung.
//
// Alle Backendantworten sind gemockt: kein echter Server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5563, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const ADRESSE = (over) => ({
  label: null, company: null, contactName: null, firstName: null, lastName: null, email: null, phone: null,
  streetAndNumber: "Hauptstraße 1", addressAdd: null, postalCode: "10115", city: "Berlin", state: null, country: "DE",
  notes: null, role: "recipient", favorite: false, isDefaultSender: false, isDefaultRecipient: false,
  createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z", ...over,
});
const ADRESSEN = [
  // Altbestand: nur `contactName`, keine Bezeichnung, keine Firma.
  ADRESSE({ id: 1, contactName: "Erika Altbestand" }),
  // Neue Adresse: Vor- und Nachname, ebenfalls ohne Bezeichnung und Firma.
  ADRESSE({ id: 2, firstName: "Max", lastName: "Neumann", email: "max@neu.example", phone: "+49301234567" }),
  // Mit Firma: die Kontaktperson steht unter dem Titel.
  ADRESSE({ id: 3, company: "Lager Süd GmbH", firstName: "Lea", lastName: "Lager", email: "lea@sued.example", phone: "+49301111111" }),
];

let server, browser;

async function setupRoutes(page) {
  const state = { puts: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/api/kunde/addresses") && req.method() === "GET") return json({ items: ADRESSEN, nextCursor: null });
    const m = p.match(/\/api\/kunde\/addresses\/(\d+)$/);
    if (m && req.method() === "PUT") {
      state.puts.push({ id: m[1], body: req.postDataJSON() });
      // Der Server speichert keine Adresse ohne vollständigen Versandkontakt (Backend #432: `field`).
      return json({ error: "Versandkontakt unvollständig", code: "ADDRESS_CONTACT_INCOMPLETE", field: "firstName" }, 400);
    }
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

async function keinUeberlauf(page, kontext) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw + 1, `${kontext}: horizontaler Überlauf (${sw}px > ${iw}px)`);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

for (const [breite, hoehe, titelKlasse] of [[1440, 900, ".abk-row-name"], [390, 844, ".abk-card-name"]]) {
  test(`${breite}px A2/A3: Kontaktperson als Titel und im Menü; Favorit auf Altbestand nennt das fehlende Feld`, async () => {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const state = await setupRoutes(page);
    await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "networkidle" });
    const titel = page.locator(titelKlasse).filter({ visible: true });
    await titel.first().waitFor({ state: "visible" });
    const texte = (await titel.allTextContents()).map((t) => t.trim());
    assert.ok(texte.includes("Erika Altbestand"), `Altbestand ohne Kontaktperson: ${texte.join(" | ")}`);
    assert.ok(texte.includes("Max Neumann"), `neue Adresse ohne Kontaktperson: ${texte.join(" | ")}`);
    assert.ok(texte.includes("Lager Süd GmbH"));
    assert.ok(!texte.includes("Ohne Bezeichnung"), "eine Adresse mit Kontaktperson heißt „Ohne Bezeichnung“");
    // Bei der Firmenadresse steht die Kontaktperson als eigene Angabe dabei.
    assert.ok((await page.getByText("Lea Lager").filter({ visible: true }).count()) >= 1, "Kontaktperson der Firmenadresse fehlt");
    await keinUeberlauf(page, `Adressbuch ${breite}px`);

    // Der zugängliche Name des Menüs nennt dieselbe Person.
    const menue = page.getByRole("button", { name: "Weitere Aktionen für Erika Altbestand" }).filter({ visible: true });
    assert.equal(await menue.count(), 1);
    await menue.click();
    await page.getByRole("menuitem", { name: "Als Favorit markieren" }).click();
    const fehler = page.locator(".alert.alert-error", { hasText: "Versandkontakts" });
    await fehler.waitFor({ state: "visible" });
    assert.match(await fehler.textContent(), /Für diese Adresse fehlt noch der Vorname des Versandkontakts\./);
    assert.match(await fehler.textContent(), /„Bearbeiten“/);
    assert.ok(!(await fehler.textContent()).includes("ADDRESS_CONTACT_INCOMPLETE"), "Rohcode sichtbar");
    assert.equal(state.puts.length, 1);
    assert.equal(state.puts[0].id, "1");
    await page.close();
  });
}
