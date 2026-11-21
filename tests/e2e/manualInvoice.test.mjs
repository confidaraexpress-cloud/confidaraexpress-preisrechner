// E2E: Auftrag 2 / P1 (2026-10-17) — manuell erstellte Rechnungen im Adminbereich; seit 2026-11-21 der visuelle
// DIN-A4-Rechnungseditor (Vorschau aus dem echten PDF, Bereichskarte, Prüfansicht mit Fingerabdruck).
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — es entsteht keine echte Rechnung, keine Nummer, keine E-Mail.
// Die Summen des Mocks sind bewusst „unrund" gewählt: die Seite muss die Serverzahlen zeigen, nicht eigene.
//
//   A  Rechnungsliste: A4-Kachel öffnet den Editor mit leerer Vorlage (echtes PDF), offene Entwürfe, „Manuell", „Storniert"
//   B  Neuer Entwurf (extern): Live-Vorschau mit Serversummen schon vor dem Speichern, Maschinenform im Request
//   C  Unzulässige Eingabe: Fehler an der Position, kein Request, Vorschau behält den letzten gültigen Stand
//   D  Gesperrt: Gründe vom Server am Entwurf und in der Prüfansicht, kein Häkchen; Verlassen mit Änderungen fragt nach
//   E  Prüfen und ausstellen: Fingerabdruck der Prüfansicht im Request, Häkchen nötig, Doppelklick = EIN Request, keine E-Mail
//   E2 Seit der Prüfung geändert (409): Prüfansicht lädt neu, Häkchen fällt, der neue Fingerabdruck geht hinaus
//   F  Bestehender Kunde: Suche, Auswahl belegt die Rechnungsanschrift vor, Request mit recipientUserId
//   G  „Als PDF öffnen": das Vorschau-PDF mit Drucken, ohne zusätzlichen Abruf
//   H  Rechnungsdetail: Stornovermerk mit Pflichtangaben, genau ein Request; Versanddialog nennt den Empfänger
//   H2 Rechnungsdetail: Stornorechnung im System (Schritt 3) — Pflichtangaben, genau ein Request, Download, keine E-Mail
//   I  390 px und 360 px: Vorschau über den Feldern, Bereichsklick führt zum Feld, kein horizontaler Überlauf
//   J  Blatt: Bereich → Feld, Markierung des bearbeiteten Bereichs, Pfeiltasten/Pos1/Ende, „Position hinzufügen"
//   K  Entprellen (eine Anfrage je Tippfolge, frühestens nach der Pause) und „nur die jüngste Antwort zählt"
//   M  50 Positionen auf drei Seiten: alle Seiten gezeichnet (Pixelprobe), Bereich auf Seite 3 → Position 50
//   N  Vorschaufehler: verständliche Meldung statt Rohtext, Speichern bleibt möglich
//   Z  200 % Zoom (720 CSS-px bei Gerätefaktor 2): kein Überlauf, Aktionen erreichbar
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5286, BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin",
  role: "admin", status: "approved", country: "DE" };
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
const A4 = { width: 595.28, height: 841.89 };

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

// Schritt 3: kein Freigabeschalter mehr — gesperrt wird nur durch tatsächliche Bedingungen, hier die Rechtsform.
const SPERRE_RECHTSFORM = { code: "ISSUER_LEGAL_FORM_UNCONFIRMED", fields: ["issuer.name"],
  message: "Die Rechtsform des Ausstellers trifft nicht zu (keine GbR; eine geplante Gesellschaft stellt noch keine Rechnungen aus) — es wird keine Rechnung ausgestellt." };

function summen(positionen = 1, ueber = {}) {
  return { netCents: 12345, vatCents: 2346, grossCents: 14691, vatRatePercent: 19,
    lines: Array.from({ length: positionen }, () => ({ netCents: 12345, vatCents: 2346, netBeforeDiscountCents: 12345, discountCents: 0 })),
    ...ueber };
}

function positionenListe(n) {
  if (n === 1) return [{ description: "Beratung", details: null, unit: "Std.", quantity: "1.5", unitPriceNetCents: 8000, discountPercent: "0" }];
  return Array.from({ length: n }, (_, i) => ({ description: `Lagerlogistik Stellplatz ${i + 1}`, details: null, unit: "Stk.",
    quantity: "1", unitPriceNetCents: 1000 + i, discountPercent: "0" }));
}

function entwurf(id, ueber = {}, positionen = 1) {
  return {
    id, status: "draft", revision: 1, recipientUserId: null, recipientKind: "external", recipientAccount: null,
    recipient: { company: "Elbufer Handel OHG", name: "Tom Krüger", email: "rechnung@elbufer-handel.example", vatId: null,
      street: "Elbchaussee 7", zip: "22763", city: "Hamburg", country: "DE" },
    positions: positionenListe(positionen),
    serviceDateFrom: "2026-10-15", serviceDateTo: null, customerReference: null, paymentTermDays: 7,
    introText: null, closingText: null, paymentNote: null, taxCase: "domestic_standard",
    totals: summen(positionen),
    issueBlockers: [SPERRE_RECHTSFORM],
    ...ueber,
  };
}

// Kleines, gültiges A4-PDF (nur Flächen, keine Schrift) mit echten xref-Offsets — pdf.js zeichnet es wie das Server-PDF.
// Oben ein Markenbalken (Pixelprobe in M), darunter Tabellenlinien.
function a4Pdf(seiten = 1) {
  const strom = "0.004 0.29 0.988 rg 56.7 785 481.9 6 re f 0.87 0.89 0.94 rg 70.9 600 453.5 1 re f 70.9 560 453.5 1 re f 70.9 520 453.5 1 re f";
  const objekte = [[1, "<</Type/Catalog/Pages 2 0 R>>"]];
  const kids = [];
  for (let i = 0; i < seiten; i++) {
    const seite = 3 + i * 2, inhalt = seite + 1;
    kids.push(`${seite} 0 R`);
    objekte.push([seite, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${A4.width} ${A4.height}]/Contents ${inhalt} 0 R/Resources<<>>>>`]);
    objekte.push([inhalt, `<</Length ${strom.length}>>\nstream\n${strom}\nendstream`]);
  }
  objekte.splice(1, 0, [2, `<</Type/Pages/Kids[${kids.join(" ")}]/Count ${seiten}>>`]);
  let out = "%PDF-1.4\n";
  const offsets = [];
  for (const [nr, inhalt] of objekte) { offsets[nr] = out.length; out += `${nr} 0 obj\n${inhalt}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (let nr = 1; nr <= objekte.length; nr++) out += `${String(offsets[nr]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<</Size ${objekte.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1").toString("base64");
}

// Bereichskarte wie vom Renderer (Punkte, Ursprung oben links). Zwei Ausstellerflächen: die zweite überspringt die Seite.
function karte(seiten = 1, positionen = 1) {
  const r = [];
  for (let s = 1; s <= seiten; s++) {
    r.push({ key: "page", page: s, x: 0, top: 0, w: A4.width, h: A4.height });
    r.push({ key: "issuer", page: s, x: 70.9, top: 785, w: 453.5, h: 34 });
  }
  r.push({ key: "issuer", page: 1, x: 340, top: 40, w: 184.3, h: 60 });
  r.push({ key: "recipient", page: 1, x: 70.9, top: 127.6, w: 240.9, h: 90 });
  r.push({ key: "meta", page: 1, x: 340, top: 127.6, w: 184.3, h: 90 });
  r.push({ key: "intro", page: 1, x: 70.9, top: 250, w: 453.5, h: 30 });
  const jeSeite = Math.ceil(positionen / seiten);
  let ende = { page: 1, top: 300 };
  for (let i = 0; i < positionen; i++) {
    const s = Math.floor(i / jeSeite) + 1, k = i % jeSeite;
    const top = (s === 1 ? 300 : 60) + k * 22;
    r.push({ key: `position:${i}`, page: s, x: 70.9, top, w: 453.5, h: 20 });
    ende = { page: s, top: top + 22 };
  }
  r.push({ key: "addPosition", page: ende.page, x: 70.9, top: ende.top, w: 453.5, h: 0 });
  r.push({ key: "totals", page: ende.page, x: 300, top: ende.top + 16, w: 224.4, h: 60 });
  r.push({ key: "payment", page: ende.page, x: 70.9, top: ende.top + 90, w: 453.5, h: 30 });
  return r;
}

function vorschauAntwort({ seiten = 1, positionen = 1, totals, blockers = [], fingerprint = "f".repeat(64) } = {}) {
  return { pdf: a4Pdf(seiten), pageCount: seiten, page: A4, regions: karte(seiten, positionen), recipientOverflow: false,
    totals: totals || summen(positionen), issueBlockers: blockers, fingerprint, layoutVersion: "din5008-v1-2026-11-21", source: null };
}

// Fingerabdruck wie vom Server: SHA-256 als 64 Hex-Zeichen (die Prüfansicht lehnt alles andere ab).
const fp = (n) => n.toString(16).padStart(64, "0");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function bis(pruefe, frist = 10000, was = "Bedingung") {
  const ende = Date.now() + frist;
  while (!pruefe()) {
    if (Date.now() > ende) throw new Error(`${was} nicht erreicht`);
    await pause(25);
  }
}

async function seite({ blockers = [SPERRE_RECHTSFORM], legalFormFields = ["issuer.name"], viewport = { width: 1440, height: 1100 },
  deviceScaleFactor = 1, positionen = 1, seiten = 1, vorschau = () => null, issue = () => null } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  const z = { creates: [], updates: [], issues: [], reversals: [], emails: 0, previews: 0, searches: [], reversalDone: false,
    stornos: [], stornoDone: false, stornoDownloads: 0, vorschau: [], reviews: 0, revision: 1 };
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    // Eine abgebrochene Anfrage (überholte Vorschau) lässt sich nicht mehr beantworten — das ist hier gewollt.
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) }).catch(() => {});
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/manual-invoices/status")) {
      return json({ issuer: { ready: legalFormFields.length === 0, missingFields: [], placeholderFields: [], legalFormFields }, vatRate: { ok: true, ratePercent: 19 },
        taxCases: ["domestic_standard"], domesticCountry: "DE", limits: { paymentTermDefaultDays: 7, paymentTermMaxDays: 60 } });
    }
    if (p.endsWith("/admin/manual-invoices/customers")) {
      z.searches.push(url.searchParams.get("q"));
      return json({ customers: [{ id: 42, customerNumber: "CE-K-10042", status: "approved",
        recipient: { company: "Hafenkontor Weber KG", name: "Jana Weber", email: "login@hafenkontor.example", vatId: "DE123456789",
          street: "Kaistraße 4", zip: "20457", city: "Hamburg", country: "DE" } }] });
    }
    if (p.endsWith("/admin/manual-invoices/sources")) return json({ sources: [] });
    if (p.endsWith("/admin/manual-invoices/preview") && m === "POST") {
      const nr = z.vorschau.push({ body: req.postDataJSON(), at: Date.now() });
      const v = vorschau(nr) || {};
      if (v.delay) await pause(v.delay);
      if (v.status) return json(v.body, v.status);
      return json(vorschauAntwort({ seiten, positionen, totals: v.totals, blockers }));
    }
    if (p.endsWith("/admin/manual-invoices/drafts") && m === "GET") {
      return json({ drafts: [{ id: 5, revision: 2, recipientUserId: null, recipientKind: "external", recipientCompany: "Alster Werkstatt GmbH",
        customerNumber: null, positionCount: 2, grossCents: 47600, createdAt: "2026-10-16T09:00:00Z", updatedAt: "2026-10-16T10:00:00Z" }],
        pagination: { total: 1 } });
    }
    if (p.endsWith("/admin/manual-invoices/drafts") && m === "POST") {
      z.creates.push(req.postDataJSON());
      return json({ draft: entwurf(11, { issueBlockers: blockers }, positionen) }, 201);
    }
    const d = /\/admin\/manual-invoices\/drafts\/(\d+)(\/(preview|issue|review))?$/.exec(p);
    if (d && d[3] === "preview") { z.previews++; return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF }); }
    if (d && d[3] === "review" && m === "GET") {
      z.reviews++;
      return json({ ...vorschauAntwort({ seiten, positionen, blockers, fingerprint: fp(z.reviews) }), revision: z.revision });
    }
    if (d && d[3] === "issue") {
      const nr = z.issues.push(req.postDataJSON());
      await pause(300);
      const a = issue(nr);
      if (a) return json(a.body, a.status);
      return json({ alreadyIssued: false, invoice: { id: 77, invoiceNumber: "CE-RE26-00042", grossCents: 14691, documentStatus: "ready" } }, 201);
    }
    if (d && m === "GET") return json({ draft: entwurf(Number(d[1]), { issueBlockers: blockers, revision: z.revision }, positionen) });
    if (d && m === "PUT") {
      z.updates.push(req.postDataJSON());
      z.revision += 1;
      return json({ draft: entwurf(Number(d[1]), { revision: z.revision, issueBlockers: blockers }, positionen) });
    }
    if (p.endsWith("/admin/invoices") && m === "GET") {
      return json({ invoices: [
        { id: 77, invoice_number: "CE-RE26-00042", user_id: null, invoice_source: "manual", recipient_company: "Elbufer Handel OHG",
          is_cancelled: false, amount: 146.91, gross_amount: 146.91, status: "unpaid", document_status: "ready", email_status: "pending",
          is_productive: true, is_overdue: false, is_payable: true, document_mode: "production", is_test_document: false,
          due_date: "2026-10-24T10:00:00", created_at: "2026-10-17T10:00:00Z" },
        { id: 78, invoice_number: "CE-RE26-00043", user_id: null, invoice_source: "manual", recipient_company: "Alster Werkstatt GmbH",
          is_cancelled: true, amount: 476, gross_amount: 476, status: "unpaid", document_status: "ready", email_status: "pending",
          is_productive: true, is_overdue: false, is_payable: false, document_mode: "production", is_test_document: false,
          due_date: "2026-10-24T10:00:00", created_at: "2026-10-17T09:00:00Z" },
      ], pagination: { total: 2, limit: 25, offset: 0, count: 2 } });
    }
    if (p.endsWith("/admin/invoices/77/reversal-record") && m === "POST") {
      z.reversals.push(req.postDataJSON());
      z.reversalDone = true;
      return json({ recorded: true, invoiceNumber: "CE-RE26-00042" }, 201);
    }
    if (p.endsWith("/admin/invoices/77/reversal-invoice") && m === "POST") {
      z.stornos.push(req.postDataJSON());
      await pause(300);
      z.stornoDone = true;
      return json({ issued: true, invoiceNumber: "CE-RE26-00042", cancellationNumber: "CE-ST26-00001", grossCents: -14691 }, 201);
    }
    if (p.endsWith("/admin/invoices/77/reversal-invoice") && m === "GET") {
      z.stornoDownloads++;
      return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF,
        // Wie die echte API (middleware/cors.js EXPOSED_HEADERS): ohne Freigabe sähe der Browser den Namen nicht.
        headers: { "content-disposition": 'attachment; filename="Stornorechnung_CE-ST26-00001.pdf"',
          "access-control-expose-headers": "Content-Disposition" } });
    }
    if (p.endsWith("/admin/invoices/77/send-email") || p.endsWith("/admin/invoices/77/resend-email")) { z.emails++; return json({ outcome: "sent" }); }
    if (p.endsWith("/admin/invoices/77") && m === "GET") {
      return json({ invoice: {
        id: 77, invoice_number: "CE-RE26-00042", user_id: null, shipment_id: null, invoice_source: "manual",
        amount: 146.91, gross_amount: 146.91, net_amount: 123.45, vat_amount: 23.46, vat_rate: 0.19, currency: "EUR", payment_term: 7,
        status: "unpaid", document_status: "ready", email_status: "pending", is_productive: true, is_payable: !(z.reversalDone || z.stornoDone),
        is_overdue: false, document_mode: "production", is_test_document: false, document_mode_label: "production",
        snapshot_company: "Elbufer Handel OHG", snapshot_name: "Tom Krüger", snapshot_email: "rechnung@elbufer-handel.example",
        due_date: "2026-10-24T10:00:00", issued_at: "2026-10-17T10:00:00Z", created_at: "2026-10-17T10:00:00Z",
        service_date: "2026-10-15", pdf_generated_at: "2026-10-17T10:00:01Z",
        is_cancelled: z.reversalDone || z.stornoDone, cancelled_at: z.reversalDone || z.stornoDone ? "2026-10-17T11:00:00Z" : null,
        cancellation_document_number: z.stornoDone ? "CE-ST26-00001" : z.reversalDone ? "ST-2026-0001" : null,
        cancellation_date: z.reversalDone || z.stornoDone ? "2026-10-17" : null,
        cancellation_reason: z.reversalDone || z.stornoDone ? "Leistung entfallen" : null,
        cancellation_approved_by: z.reversalDone || z.stornoDone ? "Erika Nordmann" : null,
        cancellation_recorded_at: z.reversalDone || z.stornoDone ? "2026-10-17T11:00:00Z" : null,
        cancellation_document_source: z.stornoDone ? "internal" : z.reversalDone ? "external" : null,
        cancellation_document_available: z.stornoDone,
      } });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return { page, z, fehler };
}

async function fuelleExtern(page) {
  await page.fill("#mi-recipient-company", "Elbufer Handel OHG");
  await page.fill("#mi-recipient-email", "rechnung@elbufer-handel.example");
  await page.fill("#mi-recipient-street", "Elbchaussee 7");
  await page.fill("#mi-recipient-zip", "22763");
  await page.fill("#mi-recipient-city", "Hamburg");
  await page.fill("#mi-service-from", "2026-10-15");
  await page.fill("#mi-pos-0-description", "Beratung");
  await page.fill("#mi-pos-0-unit", "Std.");
  await page.fill("#mi-pos-0-quantity", "1,5");
  await page.fill("#mi-pos-0-price", "80,00");
}
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const aktivesFeld = (page) => page.evaluate(() => (document.activeElement ? document.activeElement.id : ""));
const ueberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const bereich = (page, key) => page.locator(`.adm-mi-stage .adm-mi-reg[data-region="${key}"]`);
const aktuell = (page, frist = 15000) => page.locator("#mi-preview-state", { hasText: "Vorschau aktuell" }).waitFor({ timeout: frist });

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await pause(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — Rechnungsliste: A4-Kachel öffnet den Editor mit leerer Vorlage, offene Entwürfe, „Manuell“, „Storniert“", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices`, { waitUntil: "networkidle" });
  const kachel = page.locator("#adm-new-invoice");
  await kachel.waitFor({ timeout: 15000 });
  assert.equal(await kachel.getAttribute("href"), "/admin/invoices/manual/new");
  // Der Link ist der sichtbare Titel (Name = Beschriftung, WCAG 2.5.3), die Zeile darunter beschreibt ihn, die
  // Miniatur ist Schmuck. Die Klickfläche des Links deckt die ganze Kachel ab.
  assert.equal(await page.getByRole("link", { name: "Neue Rechnung erstellen", exact: true }).count(), 1);
  assert.equal(norm(await kachel.innerText()), "Neue Rechnung erstellen");
  assert.equal(await kachel.getAttribute("aria-describedby"), "mi-entry-sub");
  const karte = page.locator(".adm-mi-entry");
  assert.match(norm(await karte.innerText()), /^Neue Rechnung erstellen Direkt auf der A4-Vorlage bearbeiten/);
  assert.equal(await karte.locator(".adm-mi-mini").getAttribute("aria-hidden"), "true");
  const kb = await karte.boundingBox();
  const ziel = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el && el.closest("a") ? el.closest("a").id : null; }, [kb.x + 30, kb.y + kb.height - 12]);
  assert.equal(ziel, "adm-new-invoice", "die Miniatur-Ecke der Kachel gehört zur Klickfläche des Links");
  // Tastatur: genau ein Ring, um die ganze Kachel — keiner um den Titeltext.
  await kachel.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const ring = await kachel.evaluate((a) => ({ fokus: a.matches(":focus-visible"), text: getComputedStyle(a).outlineStyle, flaeche: getComputedStyle(a, "::after").outlineStyle }));
  assert.deepEqual(ring, { fokus: true, text: "none", flaeche: "solid" }, "ein Fokusring um die ganze Kachel, keiner um den Titeltext");
  const draftRow = page.locator('#mi-drafts [data-draft="5"]');
  await draftRow.waitFor({ timeout: 10000 });
  assert.match(norm(await draftRow.innerText()), /Alster Werkstatt GmbH.*Externer Empfänger.*2 Positionen.*476,00/);
  const tabelle = page.locator(".adm-inv-table");
  assert.match(norm(await tabelle.innerText()), /CE-RE26-00042.*Manuell.*Elbufer Handel OHG.*Externer Empfänger/);
  assert.match(norm(await tabelle.locator("tr", { hasText: "CE-RE26-00043" }).innerText()), /Storniert/);
  await kachel.click();
  await page.waitForURL(/\/admin\/invoices\/manual\/new$/, { timeout: 10000 });
  await page.locator(".adm-mi-stage .adm-mi-page canvas").first().waitFor({ timeout: 20000 });
  assert.ok(z.vorschau.length >= 1, "die leere Vorlage kam nicht als echtes PDF");
  assert.equal(z.creates.length, 0, "Öffnen des Editors legte einen Entwurf an");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — neuer Entwurf (extern): Live-Vorschau mit Serversummen, Maschinenform, Adresse des Entwurfs", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/new`, { waitUntil: "networkidle" });
  await page.locator("#mi-recipient-company").waitFor({ timeout: 15000 });
  await fuelleExtern(page);
  await page.fill("#mi-pos-0-discount", "10");
  // Schon vor dem Speichern zeigt die Vorschau die Serverzahlen — nicht eine eigene Rechnung (1,5 × 80 € − 10 % wären 108,00 €).
  await bis(() => z.vorschau.some((v) => v.body.positions && v.body.positions[0] && v.body.positions[0].discountPercent === "10"),
    10000, "Vorschau mit Rabatt");
  await aktuell(page);
  assert.match(norm(await page.locator("#mi-totals").innerText()), /Netto 123,45 €.*Umsatzsteuer 19 % 23,46 €.*Brutto 146,91 €/);
  for (const v of z.vorschau) assert.ok(!("totals" in v.body) && !("grossCents" in v.body), "die Vorschau schickt eine Summe");
  assert.equal(z.creates.length, 0, "die Vorschau legte einen Entwurf an");
  await page.click("#mi-save");
  await page.waitForURL(/\/admin\/invoices\/manual\/11$/, { timeout: 10000 });
  assert.equal(z.creates.length, 1);
  const b = z.creates[0];
  assert.deepEqual(b.positions, [{ description: "Beratung", details: "", unit: "Std.", quantity: "1.5", unitPriceNetCents: 8000, discountPercent: "10" }]);
  assert.deepEqual([b.recipientUserId, b.recipient.country, b.serviceDateFrom, b.taxCase], [null, "DE", "2026-10-15", "domestic_standard"]);
  assert.ok(!("totals" in b) && !("grossCents" in b), "der Browser schickt keine Summe");
  await page.locator("#mi-totals").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#mi-totals").innerText()), /Brutto 146,91 €/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — unzulässige Eingabe: Fehler an der Position, kein Request, Vorschau behält den letzten gültigen Stand", async () => {
  const { page, z } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/new`, { waitUntil: "networkidle" });
  await page.locator("#mi-recipient-company").waitFor({ timeout: 15000 });
  await fuelleExtern(page);
  await aktuell(page);
  const vorher = z.vorschau.length;
  await page.fill("#mi-pos-0-price", "achtzig");
  await page.locator("#mi-preview-problems").waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator("#mi-preview-state").innerText()), /letzten gültigen Stand/);
  await page.click("#mi-save");
  await page.locator("#mi-pos-0-price-err").waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator("#mi-pos-0-price-err").innerText()), /Einzelpreis in Euro/);
  assert.equal(await page.locator("#mi-pos-0-price").getAttribute("aria-invalid"), "true");
  assert.equal(z.creates.length, 0);
  await pause(800);
  assert.equal(z.vorschau.length, vorher, "eine ungültige Eingabe ging als Vorschau hinaus");
  await page.close();
});

test("D — gesperrt: Gründe vom Server am Entwurf und in der Prüfansicht; Verlassen mit Änderungen fragt nach", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-issue-blocked").waitFor({ timeout: 15000 });
  assert.match(norm(await page.locator("#mi-issue-blocked").innerText()), /Rechtsform des Ausstellers trifft nicht zu/);
  assert.match(norm(await page.locator("#mi-issue-status").innerText()), /Rechtsform des Ausstellers trifft nicht zu/);
  assert.doesNotMatch(norm(await page.locator("body").innerText()), /freigeschaltet/, "ein Schalterhinweis erscheint noch");
  await page.click("#mi-issue");
  await page.locator("#mi-review-blocked").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#mi-review-blocked").innerText()), /Rechtsform des Ausstellers trifft nicht zu/);
  assert.equal(await page.locator("#mi-issue-confirm").isDisabled(), true);
  assert.equal(await page.locator("#mi-review-checked").count(), 0, "bei einer Sperre gibt es kein Prüfhäkchen");
  await page.click("#mi-review-close");
  await page.locator("#mi-review").waitFor({ state: "detached", timeout: 5000 });
  await page.fill("#mi-pos-0-description", "Beratung geändert");
  await page.locator("#mi-unsaved").waitFor({ timeout: 5000 });
  await page.click(".adm-mi-back a");
  await page.locator("#mi-leave-confirm").waitFor({ timeout: 5000 });
  assert.match(page.url(), /\/admin\/invoices\/manual\/11$/, "die Seite wurde ohne Rückfrage verlassen");
  await page.locator(".adm-modal").getByRole("button", { name: "Abbrechen" }).click();
  assert.equal(await page.inputValue("#mi-pos-0-description"), "Beratung geändert");
  assert.equal(z.issues.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — prüfen und ausstellen: Fingerabdruck im Request, Häkchen nötig, Doppelklick = ein Request, keine E-Mail", async () => {
  const { page, z, fehler } = await seite({ blockers: [], legalFormFields: [] });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-issue").waitFor({ timeout: 15000 });
  await page.click("#mi-issue");
  const ja = page.locator("#mi-issue-confirm");
  await ja.waitFor({ timeout: 10000 });
  await page.locator("#mi-review .adm-mi-page canvas").first().waitFor({ timeout: 15000 });
  assert.match(norm(await page.locator("#mi-review").innerText()), /Nur die Rechnungsnummer kommt beim Ausstellen hinzu.*keine E-Mail versendet/);
  assert.equal(z.creates.length + z.updates.length, 0, "ein unveränderter Entwurf wurde vor der Prüfung erneut gespeichert");
  assert.equal(await ja.isDisabled(), true, "ohne Häkchen ließ sich ausstellen");
  await page.check("#mi-review-checked");
  assert.equal(await ja.isDisabled(), false);
  // Doppelklick: der zweite Klick trifft den Knopf, bevor React ihn sperrt — die Seite sorgt selbst für EINEN Request.
  await ja.dblclick();
  await page.waitForURL(/\/admin\/invoices\/77$/, { timeout: 10000 });
  assert.equal(z.issues.length, 1, "der Doppelklick hat zwei Ausstellungen ausgelöst");
  assert.deepEqual(z.issues[0], { revision: 1, fingerprint: fp(1), confirm: true });
  await page.getByText("Rechnung CE-RE26-00042 ausgestellt. Es wurde keine E-Mail versendet.").waitFor({ timeout: 10000 });
  assert.equal(z.emails, 0, "beim Ausstellen ging ein Versandaufruf hinaus");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E2 — seit der Prüfung geändert: Prüfansicht lädt neu, Häkchen fällt, neuer Fingerabdruck geht hinaus", async () => {
  const { page, z, fehler } = await seite({ blockers: [], legalFormFields: [],
    issue: (nr) => (nr === 1 ? { status: 409, body: { error: "Seit der Prüfung hat sich am Beleg etwas geändert. Bitte erneut prüfen.",
      code: "MANUAL_INVOICE_PREVIEW_STALE" } } : null) });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-issue").waitFor({ timeout: 15000 });
  // Ungespeicherte Änderung: „Prüfen und ausstellen" speichert zuerst (PUT), die Prüfansicht zeigt die gespeicherte Fassung.
  await page.fill("#mi-pos-0-description", "Beratung vor Ort");
  await page.click("#mi-issue");
  await page.locator("#mi-issue-confirm").waitFor({ timeout: 10000 });
  assert.equal(z.updates.length, 1, "vor der Prüfung wurde nicht gespeichert");
  await page.check("#mi-review-checked");
  await page.click("#mi-issue-confirm");
  await page.locator("#mi-review-notice").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#mi-review-notice").innerText()), /erneut prüfen/);
  await bis(() => z.reviews === 2, 5000, "erneute Prüfansicht");
  await page.waitForFunction(() => { const c = document.getElementById("mi-review-checked"); return c && !c.checked; }, null, { timeout: 5000 });
  assert.equal(await page.locator("#mi-issue-confirm").isDisabled(), true, "nach der Ablehnung blieb das Häkchen stehen");
  await page.check("#mi-review-checked");
  await page.click("#mi-issue-confirm");
  await page.waitForURL(/\/admin\/invoices\/77$/, { timeout: 10000 });
  assert.equal(z.issues.length, 2);
  assert.deepEqual(z.issues[0], { revision: 2, fingerprint: fp(1), confirm: true });
  assert.deepEqual(z.issues[1], { revision: 2, fingerprint: fp(2), confirm: true });
  assert.equal(z.emails, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — bestehender Kunde: Suche, Auswahl belegt die Rechnungsanschrift vor, Request mit recipientUserId", async () => {
  const { page, z } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/new`, { waitUntil: "networkidle" });
  await page.locator("#mi-kind-customer").waitFor({ timeout: 15000 });
  await page.check("#mi-kind-customer");
  await page.fill("#mi-customer-search", "Hafen");
  const treffer = page.locator('[data-customer="42"]');
  await treffer.waitFor({ timeout: 5000 });
  await treffer.click();
  await page.locator("#mi-customer-chosen").waitFor();
  assert.match(norm(await page.locator("#mi-customer-chosen").innerText()), /Hafenkontor Weber KG · CE-K-10042/);
  assert.equal(await page.inputValue("#mi-recipient-street"), "Kaistraße 4");
  assert.equal(await page.inputValue("#mi-recipient-email"), "login@hafenkontor.example");
  await page.fill("#mi-service-from", "2026-10-15");
  await page.fill("#mi-pos-0-description", "Lagerlogistik");
  await page.fill("#mi-pos-0-price", "1.234,56");
  await page.click("#mi-save");
  await page.waitForURL(/\/admin\/invoices\/manual\/11$/, { timeout: 10000 });
  assert.equal(z.creates[0].recipientUserId, 42);
  assert.equal(z.creates[0].positions[0].unitPriceNetCents, 123456);
  assert.ok(z.searches.includes("Hafen"));
  await page.close();
});

test("G — „Als PDF öffnen“: das Vorschau-PDF mit Drucken, ohne zusätzlichen Abruf", async () => {
  const { page, z } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await aktuell(page);
  const vorher = z.vorschau.length;
  await page.click("#mi-preview");
  await page.locator(".pdfview-modal").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator(".pdfview-title").innerText()), /Entwurf, keine Rechnung/);
  await page.getByRole("button", { name: "Drucken" }).waitFor({ timeout: 10000 });
  assert.equal(z.previews, 0, "das PDF wurde zusätzlich vom Server geladen");
  assert.equal(z.vorschau.length, vorher, "Öffnen löste eine neue Vorschau aus");
  await page.close();
});

test("H — Rechnungsdetail: Stornovermerk mit Pflichtangaben, genau ein Request; Versanddialog nennt den Empfänger", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices/77`, { waitUntil: "networkidle" });
  await page.locator("#adm-inv-reversal-open").waitFor({ timeout: 15000 });
  assert.match(norm(await page.locator("body").innerText()), /Manuell erstellt/);
  assert.match(norm(await page.locator("body").innerText()), /Keine Sendung — manuell erstellte Rechnung\./);
  // Versanddialog: nennt die Empfänger-E-Mail des Snapshots; Abbrechen sendet nichts.
  await page.locator(".adm-card", { hasText: "E-Mail-Versand" }).locator("button.btn-primary").click();
  await page.locator(".adm-modal").waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator(".adm-modal").innerText()), /an rechnung@elbufer-handel\.example\./);
  await page.locator(".adm-modal").getByRole("button", { name: "Abbrechen" }).click();
  await page.locator(".adm-modal").waitFor({ state: "detached", timeout: 5000 });
  assert.equal(z.emails, 0, "der Versanddialog hat ohne Bestätigung gesendet");
  await page.click("#adm-inv-reversal-open");
  await page.locator("#adm-inv-reversal-confirm").waitFor();
  await page.fill("#adm-rev-number", "");
  await page.click("#adm-inv-reversal-confirm");
  await page.locator("#adm-rev-number-err").waitFor({ timeout: 5000 });
  assert.equal(z.reversals.length, 0, "ohne Pflichtangaben ging ein Request hinaus");
  await page.fill("#adm-rev-number", "ST-2026-0001");
  await page.fill("#adm-rev-reason", "Leistung entfallen");
  await page.fill("#adm-rev-approved", "Erika Nordmann");
  await page.click("#adm-inv-reversal-confirm");
  await page.getByText("Storno vermerkt.", { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(z.reversals.length, 1);
  assert.deepEqual(Object.keys(z.reversals[0]).sort(), ["acknowledgePaid", "approvedBy", "cancellationDate", "confirm", "externalDocumentNumber", "reason"]);
  assert.equal(z.reversals[0].externalDocumentNumber, "ST-2026-0001");
  await page.locator("#adm-inv-cancelled-note").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#adm-inv-reversal").innerText()), /ST-2026-0001.*Leistung entfallen.*Erika Nordmann/);
  assert.equal(z.emails, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("H2 — Rechnungsdetail: Stornorechnung im System — Pflichtangaben, ein Request, Download, keine E-Mail", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices/77`, { waitUntil: "networkidle" });
  await page.locator("#adm-inv-storno-open").waitFor({ timeout: 15000 });
  assert.match(norm(await page.locator("#adm-inv-reversal").innerText()), /Stornorechnung entsteht hier im System/);
  await page.click("#adm-inv-storno-open");
  await page.locator("#adm-inv-storno-confirm").waitFor();
  assert.match(norm(await page.locator(".adm-modal").innerText()), /eigener Nummer \(CE-ST\).*keine E-Mail versendet und keine Zahlung ausgelöst/);
  await page.click("#adm-inv-storno-confirm");
  await page.locator("#adm-storno-reason-err").waitFor({ timeout: 5000 });
  assert.equal(z.stornos.length, 0, "ohne Pflichtangaben ging ein Request hinaus");
  await page.fill("#adm-storno-reason", "Leistung entfallen");
  await page.fill("#adm-storno-approved", "Erika Nordmann");
  // Doppelklick: genau EIN Request.
  await page.locator("#adm-inv-storno-confirm").dblclick();
  await page.getByText("Stornorechnung CE-ST26-00001 erstellt. Es wurde keine E-Mail versendet.", { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(z.stornos.length, 1, "der Doppelklick erzeugte mehr als einen Request");
  assert.deepEqual(z.stornos[0], { reason: "Leistung entfallen", approvedBy: "Erika Nordmann", acknowledgePaid: false, confirm: true });
  await page.locator("#adm-inv-storno-download").waitFor({ timeout: 10000 });
  const karteText = norm(await page.locator("#adm-inv-reversal").innerText());
  assert.match(karteText, /Stornorechnung \(im System erstellt\).*CE-ST26-00001.*Leistung entfallen.*Erika Nordmann/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#adm-inv-storno-download")]);
  assert.equal(download.suggestedFilename(), "Stornorechnung_CE-ST26-00001.pdf");
  assert.equal(z.stornoDownloads, 1);
  assert.equal(z.reversals.length, 0, "der externe Vermerk wurde mit ausgelöst");
  assert.equal(z.emails, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

for (const breite of [390, 360]) {
  test(`I — ${breite} px: Vorschau über den Feldern, Bereichsklick führt zum Feld, kein horizontaler Überlauf`, async () => {
    const { page, fehler } = await seite({ viewport: { width: breite, height: 860 } });
    await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
    await page.locator(".adm-mi-stage .adm-mi-page canvas").first().waitFor({ timeout: 20000 });
    assert.equal(await ueberlauf(page), 0);
    const buehne = await page.locator(".adm-mi-stage").boundingBox();
    const feld = await page.locator("#mi-recipient-company").boundingBox();
    assert.ok(buehne && feld && buehne.y < feld.y, "die Vorschau steht nicht über den Feldern");
    for (const sel of [".adm-mi-stage .adm-mi-page", "#mi-recipient-company", "#mi-pos-0-description", "#mi-pos-0-price", "#mi-save", "#mi-issue"]) {
      const b = await page.locator(sel).first().boundingBox();
      assert.ok(b && b.x >= 0 && b.x + b.width <= breite, `${sel} ragt aus dem Bild`);
    }
    await bereich(page, "position:0").click();
    assert.equal(await aktivesFeld(page), "mi-pos-0-description");
    const ziel = await page.locator("#mi-pos-0-description").boundingBox();
    assert.ok(ziel && ziel.y >= 0 && ziel.y + ziel.height <= 860, "das angesprungene Feld liegt außerhalb des Bildes");
    assert.equal(await ueberlauf(page), 0);
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("J — Blatt: Bereich → Feld, Markierung, Pfeiltasten/Pos1/Ende, „Position hinzufügen“ fokussiert die neue Zeile", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await bereich(page, "position:0").waitFor({ timeout: 20000 });
  assert.equal(await page.getByRole("group", { name: "Bereiche des Rechnungsblatts" }).count(), 1);
  assert.equal(await bereich(page, "issuer").count(), 1, "die zweite Ausstellerfläche wurde nicht übersprungen");
  assert.equal(await bereich(page, "position:0").getAttribute("aria-label"), "Position 1 bearbeiten");
  await bereich(page, "position:0").click();
  assert.equal(await aktivesFeld(page), "mi-pos-0-description");
  assert.equal(await bereich(page, "position:0").getAttribute("aria-current"), "true");
  await bereich(page, "recipient").click();
  assert.equal(await aktivesFeld(page), "mi-recipient-company");
  assert.equal(await bereich(page, "recipient").getAttribute("aria-current"), "true");
  assert.equal(await bereich(page, "position:0").getAttribute("aria-current"), null);
  // Der bearbeitete Bereich behält Kontur und Tönung, aber kein Etikett: es stünde dauerhaft auf der Zeile darüber.
  await page.mouse.move(2, 2);
  await bis(async () => (await bereich(page, "recipient").evaluate((el) => getComputedStyle(el, "::after").opacity)) === "0", 2000, "Etikett des bearbeiteten Bereichs ausgeblendet");
  await bereich(page, "totals").click();
  assert.equal(await aktivesFeld(page), "mi-totals-box");
  await bereich(page, "issuer").click();
  assert.equal(await aktivesFeld(page), "mi-issuer-note", "die Firmendaten sind zentral — der Klick erklärt das");
  // Tastatur: Reihenfolge Seite für Seite wie in der Karte (Aussteller, Empfänger, Angaben, Einleitung, Position 1, Summen, Zahlung).
  await bereich(page, "recipient").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-region")), "meta");
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-region")), "payment");
  await page.keyboard.press("Home");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-region")), "issuer");
  assert.equal(await page.locator(".adm-mi-stage .adm-mi-reg[tabindex='0']").count(), 1, "mehr als ein Tabstopp im Blatt");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  assert.equal(await aktivesFeld(page), "mi-recipient-company");
  // „Position hinzufügen" am Anker: neue Zeile, Fokus in ihrer Beschreibung, danach eine Vorschau mit zwei Positionen.
  const vorher = z.vorschau.length;
  await page.click("#mi-sheet-add");
  assert.equal(await aktivesFeld(page), "mi-pos-1-description");
  await page.fill("#mi-pos-1-description", "Fahrtkosten");
  await bis(() => z.vorschau.slice(vorher).some((v) => Array.isArray(v.body.positions) && v.body.positions.length === 2), 10000,
    "Vorschau mit zwei Positionen");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("K — Entprellen: eine Anfrage je Tippfolge; nur die jüngste Antwort zählt", async () => {
  const { page, z } = await seite({ vorschau: (nr) => (nr === 3 ? { delay: 1500, totals: summen(1, { grossCents: 99999 }) } : null) });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await aktuell(page);
  assert.equal(z.vorschau.length, 1);
  const feld = page.locator("#mi-pos-0-description");
  await feld.click();
  await feld.press("End");
  await feld.pressSequentially(" Plus", { delay: 120 });
  const letzteTaste = Date.now();
  await bis(() => z.vorschau.length === 2, 5000, "Vorschau nach der Tippfolge");
  assert.ok(z.vorschau[1].at - letzteTaste >= 450, `Anfrage schon ${z.vorschau[1].at - letzteTaste} ms nach der letzten Taste`);
  assert.equal(z.vorschau[1].body.positions[0].description, "Beratung Plus");
  await aktuell(page);
  await pause(700);
  assert.equal(z.vorschau.length, 2, "eine Tippfolge löste mehrere Anfragen aus");
  // Anfrage 3 antwortet langsam (99 999 ct), Anfrage 4 sofort: angezeigt wird Anfrage 4 — auch nachdem 3 hätte eintreffen können.
  await feld.press("A");
  await bis(() => z.vorschau.length === 3, 5000, "Anfrage 3");
  await feld.press("B");
  await bis(() => z.vorschau.length === 4, 5000, "Anfrage 4");
  await aktuell(page);
  await pause(1800);
  const summenText = norm(await page.locator("#mi-totals").innerText());
  assert.match(summenText, /Brutto 146,91 €/);
  assert.doesNotMatch(summenText, /999,99/, "eine überholte Antwort überschrieb die neueste");
  assert.match(norm(await page.locator("#mi-preview-state").innerText()), /Vorschau aktuell/);
  await page.close();
});

test("M — 50 Positionen auf drei Seiten: alle Seiten gezeichnet, Bereich auf Seite 3 führt zu Position 50", async () => {
  const { page, fehler } = await seite({ positionen: 50, seiten: 3 });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator(".adm-mi-stage .adm-mi-page canvas").nth(2).waitFor({ timeout: 20000 });
  assert.equal(await page.locator(".adm-mi-stage .adm-mi-page").count(), 3);
  // Pixelprobe: der Markenbalken des PDFs ist auf jeder Seite gezeichnet (nicht nur ein leeres Blatt).
  const balken = await page.evaluate(() => [...document.querySelectorAll(".adm-mi-stage .adm-mi-page canvas")].map((c) => {
    const ctx = c.getContext("2d");
    const [r, g, b] = ctx.getImageData(Math.round(c.width / 2), Math.round(c.height * ((841.89 - 788) / 841.89)), 1, 1).data;
    return b > 200 && r < 60 && g < 120;
  }));
  assert.deepEqual(balken, [true, true, true], "eine Seite blieb leer");
  const r49 = bereich(page, "position:49");
  assert.equal(await r49.count(), 1);
  await r49.scrollIntoViewIfNeeded();
  await r49.click();
  assert.equal(await aktivesFeld(page), "mi-pos-49-description");
  assert.equal(await page.inputValue("#mi-pos-49-description"), "Lagerlogistik Stellplatz 50");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N — Vorschaufehler: verständliche Meldung statt Rohtext, Speichern bleibt möglich", async () => {
  const { page, fehler } = await seite({ vorschau: () => ({ status: 500, body: { error: "TypeError: x is undefined at renderInvoicePdf" } }) });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-preview-failed").waitFor({ timeout: 15000 });
  const text = norm(await page.locator("#mi-preview-failed").innerText());
  assert.ok(text.length > 0);
  assert.doesNotMatch(text, /TypeError|renderInvoicePdf|undefined/);
  assert.match(norm(await page.locator("#mi-preview-state").innerText()), /Vorschau nicht verfügbar/);
  assert.equal(await page.locator("#mi-preview").isDisabled(), true);
  // Ohne bisheriges Blatt steht auf dem Papier kein „wird gezeichnet“, sondern der Verweis auf den Hinweis.
  assert.equal(norm(await page.locator("#mi-sheet .adm-mi-sheet-wait").innerText()), "Noch keine Vorschau. Der Hinweis über dem Blatt nennt den Grund.");
  assert.equal(await page.locator("#mi-save").isDisabled(), false);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("Z — 200 % Zoom (720 CSS-px, Gerätefaktor 2): kein Überlauf, Aktionen erreichbar", async () => {
  const { page, fehler } = await seite({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator(".adm-mi-stage .adm-mi-page canvas").first().waitFor({ timeout: 20000 });
  assert.equal(await ueberlauf(page), 0);
  for (const sel of ["#mi-save", "#mi-issue", "#mi-discard"]) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b && b.x >= 0 && b.x + b.width <= 720, `${sel} ragt aus dem Bild`);
  }
  await bereich(page, "payment").click();
  assert.equal(await aktivesFeld(page), "mi-term");
  // Die angehaftete Aktionsleiste verdeckt das angesprungene Feld nicht.
  const feld = await page.locator("#mi-term").boundingBox();
  const leiste = await page.locator(".adm-mi-bar").boundingBox();
  assert.ok(feld && leiste && (feld.y + feld.height <= leiste.y || feld.y >= leiste.y + leiste.height), "die Aktionsleiste verdeckt das Feld");
  assert.deepEqual(fehler, []);
  await page.close();
});
