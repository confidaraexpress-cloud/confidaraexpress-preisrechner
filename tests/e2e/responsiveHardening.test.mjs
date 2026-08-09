// E2E: Responsive-Härtung — echte Browserprüfung der vier Root Causes des
// systemweiten Audits, mit synthetischen Worst-Case-Daten (lange Firma, lange
// E-Mail, kombinierte Badges). Kernzusicherungen:
//
//   • Kein Badge zerfällt zeichenweise: Einwort-Badges bleiben EINzeilig,
//     Mehrwort-Badges brechen höchstens an Wortgrenzen (≤ 2 Zeilen) und nie
//     unter Konfetti-Breite. Gemessen an Bounding-Box und Zeilenhöhe — kein
//     Pixelvergleich.
//   • Kein horizontaler Seiten-Overflow (scrollWidth ≤ clientWidth) — das
//     globale `overflow-x: hidden` zählt NICHT als Beleg, gemessen wird die
//     Layoutbreite selbst.
//   • Der Seitenkopf bleibt bei langem Firmennamen vollständig im Viewport
//     (Primärbutton, Glocke), der Chip ellipsiert mit title-Volltext.
//   • Adressbuch-Reflow: Zeile → Zwischenmodus → Karten an der REALEN
//     Contentbreite; E-Mail überlagert die Badges nicht mehr; Toolbar hält 360.
//   • Listen zeigen ihre Aktionen im Band 861–1100 (Karten statt verstecktem
//     Querscroll); Entwurfs-Kebab wird nicht mehr geclippt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5341, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

/* ── Synthetische Worst-Case-Daten (keine echten Personen/Kunden) ─────────── */
const FIRMA = "Bergmann & Hilgendorf Präzisionsmaschinenbau Verwaltungsgesellschaft mbH & Co. KG";
const PERSON = "Dr. Friedrich-Wilhelm Freiherr von Oberhausen-Rheinbach";
const STRASSE = "Industriestraße am Obernauer Mainbogen 147a-149c";
const EMAIL = "warenannahme.zentrallager.aschaffenburg@bergmann-hilgendorf-praezision.example.de";

const USER = {
  id: 1, email: EMAIL, company_name: FIRMA, name: PERSON,
  role: "customer", status: "approved", country: "DE", zip: "63743",
  city: "Aschaffenburg-Obernau am Main", street: STRASSE, customer_number: "CE-K-10030",
};

const ADRESSEN = { items: [
  { id: 101, label: "Zentrallager Aschaffenburg", company: FIRMA, contactName: PERSON,
    streetAndNumber: STRASSE, addressAdd: "Gebäude 7", postalCode: "63743",
    city: "Aschaffenburg-Obernau am Main", state: "Bayern", country: "DE",
    email: EMAIL, phone: "+49 6021 4500-2377", notes: null, role: "both",
    isDefaultSender: true, isDefaultRecipient: true, favorite: true,
    createdAt: "2026-05-02T09:12:00.000Z", updatedAt: "2026-08-01T14:30:00.000Z" },
  { id: 102, label: null, company: "Comptoir International de Distribution Alimentaire et Logistique S.A.R.L.",
    contactName: "Marie-Claire Beaumont-Descharrières", streetAndNumber: "128 Boulevard de la Villette",
    addressAdd: null, postalCode: "75019", city: "Paris", state: null, country: "FR",
    email: "reception@comptoir-international-distribution.example.fr", phone: "+33 1 42 00 00 00",
    notes: null, role: "recipient", isDefaultSender: false, isDefaultRecipient: false, favorite: false,
    createdAt: "2026-06-11T08:00:00.000Z", updatedAt: "2026-06-11T08:00:00.000Z" },
], nextCursor: null };

const SHIPMENTS = { shipments: [
  { id: 5001, business_order_number: "CE-BS26-00841", tracking_number: "1Z999AA10123456784",
    reference_number: "PO-2026-88431-EXPORT-FRANKREICH-NIEDERLASSUNG-SUED",
    selected_carrier: "UPS Standard", weight: 12.5, price_final: 47.61, status: "booked",
    created_at: "2026-08-05T10:22:00.000Z", jumingo_shipment_id: "s_fb1bc92aba1c4d70a3eaa44d687ae179",
    requested_shipping_date: "2026-08-11", tracking_status: null, delivered_this_month: false,
    delivery_date_max: "2026-08-14", cancellation_status: null, cancellation_requested_at: null },
  { id: 5002, business_order_number: "CE-BS26-00842", tracking_number: "00340434161094015902",
    reference_number: null, selected_carrier: "DHL Express", weight: 3, price_final: 21.9,
    status: "label_ready", created_at: "2026-08-03T08:00:00.000Z",
    jumingo_shipment_id: "s_0a1b2c3d4e5f60718293a4b5c6d7e8f9", requested_shipping_date: "2026-08-08",
    tracking_status: "in_transit", delivered_this_month: false, delivery_date_max: "2026-08-06",
    cancellation_status: "pending", cancellation_requested_at: "2026-08-04T09:00:00.000Z" },
] };

const INVOICES = {
  invoices: [
    { id: 9001, invoice_number: "CE-RE26-00318", business_order_number: "CE-BS26-00841",
      gross_amount: 47.61, currency: "EUR", status: "unpaid", is_overdue: true,
      issued_at: "2026-07-01T10:00:00.000Z", service_date: "2026-06-28", due_date: "2026-07-15",
      document_status: "ready", download_available: true, sent_by_email: true, email_sent_at: "2026-07-01T10:05:00.000Z" },
  ],
  summary: { open_amount: 47.61, open_count: 1, overdue_count: 1, next_due_date: "2026-07-15", currency: "EUR", mixed_currency: false },
};

const DRAFTS = { items: [
  { id: 301, jumingoShipmentId: "s_77a1b2c3d4e5f60718293a4b5c6d7e8f", status: "draft",
    weight: 8.5, length: 40, width: 30, height: 25, packageCount: 2,
    fromCountry: "DE", toCountry: "FR", fromPostalCode: "63743", toPostalCode: "75019",
    senderAddress: { fullName: PERSON, company: FIRMA, streetAndNumber: STRASSE,
      addressAddition: "", postalCode: "63743", city: "Aschaffenburg", country: "DE", phone: "", email: EMAIL },
    recipientAddress: { fullName: "Marie-Claire Beaumont-Descharrières",
      company: "Comptoir International de Distribution Alimentaire et Logistique S.A.R.L.",
      streetAndNumber: "128 Boulevard de la Villette", addressAddition: "",
      postalCode: "75019", city: "Paris", country: "FR", phone: "", email: "reception@cidal.example.fr" },
    requestedShippingDate: "2026-08-15", createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-06T16:45:00.000Z" },
  { id: 302, jumingoShipmentId: "s_88b2c3d4e5f60718293a4b5c6d7e8f90", status: "draft",
    weight: 2, length: 20, width: 15, height: 10, packageCount: 1,
    fromCountry: "DE", toCountry: "CH", fromPostalCode: "63743", toPostalCode: "8001",
    senderAddress: { fullName: PERSON, company: FIRMA, streetAndNumber: STRASSE,
      addressAddition: "", postalCode: "63743", city: "Aschaffenburg", country: "DE", phone: "", email: EMAIL },
    recipientAddress: { fullName: "Hans Muster", company: "Muster Handels AG",
      streetAndNumber: "Bahnhofstrasse 1", addressAddition: "", postalCode: "8001",
      city: "Zürich", country: "CH", phone: "", email: "info@muster.example.ch" },
    requestedShippingDate: "2026-08-18", createdAt: "2026-08-02T10:00:00.000Z", updatedAt: "2026-08-07T10:00:00.000Z" },
], nextCursor: null };

let server, browser;

async function setupRoutes(ziel) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.includes("/api/kunde/addresses") && method === "GET") return json(ADRESSEN);
    if (p.endsWith("/kunde/shipments")) return json(SHIPMENTS);
    if (p.endsWith("/kunde/invoices")) return json(INVOICES);
    if (/\/api\/kunde\/drafts$/.test(p) && method === "GET") return json(DRAFTS);
    if (/\/api\/kunde\/form-drafts$/.test(p) && method === "GET") return json({ drafts: [], nextCursor: null });
    if (p.endsWith("/kunde/support-requests")) return json({ supportRequests: [
      { id: 44, ticketNumber: "CE-SUP-2026-000044",
        subject: "Abholung nicht erfolgt trotz bestätigtem Zeitfenster — Zentrallager Aschaffenburg-Obernau",
        category: "booking", status: "in_progress", statusLabel: null,
        createdAt: "2026-08-08T07:55:00.000Z", updatedAt: "2026-08-09T06:40:00.000Z" },
    ] });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 2, snapshotAt: "" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "" });
    if (p.includes("/api/tracking/public/")) return json({ trackingStatus: "transit", trackingNumber: "1Z999AA10123456784",
      tracking: { status: "success", trackingNumber: "1Z999AA10123456784", carrier: { code: "ups", name: "UPS" },
        data: { status: "transit", steps: [{ date: "2026-08-07", time: "09:12", type: "Sendung abgeholt", location: "Aschaffenburg, DE" }] } } });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], notifications: [], summary: null, pagination: { total: 0 } });
  });
  await ziel.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Dev-Server nicht erreichbar");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

async function seite(width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await setupRoutes(ctx);
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { ctx, page, fehler };
}

/* Badge-Vermessung im Browser: sichtbare Badges als {text, breite, zeilen}.
   Zeilenzahl aus (Höhe − vertikales Padding) / line-height — robust gegen
   Renderrundung (gerundet), unabhängig von Pixeln/Screenshots. */
const BADGE_MESSUNG = `
(() => {
  const out = [];
  for (const el of document.querySelectorAll(".badge, .inv-status, .stn-status")) {
    const r = el.getClientRects();
    if (!r.length) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    out.push({
      text: (el.textContent || "").trim().replace(/\\s+/g, " "),
      breite: Math.round(b.width),
      zeilen: Math.max(1, Math.round((b.height - pad) / lh)),
    });
  }
  return out;
})()`;

function pruefeBadges(badges, kontext) {
  for (const b of badges) {
    const hatTrennstelle = /[\s-]/.test(b.text);
    const maxZeilen = hatTrennstelle ? 2 : 1;
    assert.ok(b.zeilen <= maxZeilen,
      `${kontext}: Badge „${b.text}" hat ${b.zeilen} Zeilen (erlaubt ${maxZeilen}) bei ${b.breite}px`);
    assert.ok(b.breite >= 40,
      `${kontext}: Badge „${b.text}" ist auf ${b.breite}px kollabiert`);
  }
}

const OVERFLOW = `Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)`;

/* ══════════ 1 — Badge-Matrix Adressbuch (Kern des Leitsymptoms) ══════════ */

const MATRIX = [1440, 1280, 1100, 1024, 960, 900, 860, 820, 768, 700, 600, 430, 390, 360];

test("1 — Adressbuch: keine Badge-Zerlegung und kein Seiten-Overflow über die volle Breitenmatrix", async () => {
  const { ctx, page } = await seite(1440);
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  for (const w of MATRIX) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(w === 860 ? 300 : 150);
    const badges = await page.evaluate(BADGE_MESSUNG);
    assert.ok(badges.length >= 3, `${w}px: Badges nicht gefunden`);
    pruefeBadges(badges, `Adressbuch @${w}px`);
    const overflow = await page.evaluate(OVERFLOW);
    assert.ok(overflow <= 1, `Adressbuch @${w}px: Seiten-Overflow ${overflow}px`);
  }
  await ctx.close();
});

test("2 — Adressbuch: die E-Mail überlagert die Badges nicht mehr (Zwischenmodus)", async () => {
  // 1024 px Viewport ⇒ 716 px Contentbreite ⇒ Zwischenmodus (640–879). Bei
  // 900 px (Content 592) stehen bereits Karten — dort gibt es keine
  // .abk-row-badges mehr, die Messung liefe ins Leere.
  const { ctx, page } = await seite(1024);
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const lage = await page.evaluate(() => {
    const sichtbar = (el) => el && el.getClientRects().length > 0;
    const email = [...document.querySelectorAll(".abk-contact-email")].find(sichtbar);
    const badges = [...document.querySelectorAll(".abk-row-badges")].find(sichtbar);
    if (!email || !badges) return null;
    const a = email.getBoundingClientRect(), b = badges.getBoundingClientRect();
    const schnittX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const schnittY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { ueberlappung: Math.round(schnittX * schnittY), emailBreite: Math.round(a.width) };
  });
  assert.ok(lage, "E-Mail oder Badges nicht gefunden");
  assert.equal(lage.ueberlappung, 0, `E-Mail und Badge-Bereich überlappen (${lage.ueberlappung}px²)`);
  await ctx.close();
});

test("3 — Adressbuch-Reflow: Zeile ≥1250, Zwischenmodus im Shell-Band, Karten darunter", async () => {
  const { ctx, page } = await seite(1440);
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const modus = async () => page.evaluate(() => {
    const sichtbar = (el) => el && el.getClientRects().length > 0;
    const row = [...document.querySelectorAll(".abk-row")].find(sichtbar);
    const card = [...document.querySelectorAll(".abk-card")].find(sichtbar);
    if (card) return "karten";
    if (!row) return "keins";
    // Zwischenmodus: Badges stehen UNTER der Identität (zweite Rasterzeile).
    const id = row.querySelector(".abk-row-identity").getBoundingClientRect();
    const badges = row.querySelector(".abk-row-badges").getBoundingClientRect();
    return badges.top >= id.bottom - 2 ? "zwischenmodus" : "zeile";
  });
  assert.equal(await modus(), "zeile", "bei 1440px muss die volle Zeile stehen");
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(350);
  assert.equal(await modus(), "zwischenmodus", "bei 1100px (Content 848) muss der Zwischenmodus greifen");
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(350);
  assert.equal(await modus(), "karten", "bei 900px (Content 648 < 640er-Stufe) müssen Karten stehen");
  await page.setViewportSize({ width: 500, height: 900 });
  await page.waitForTimeout(350);
  assert.equal(await modus(), "karten", "bei 500px müssen Karten stehen");
  await ctx.close();
});

test("4 — Adressbuch-Toolbar @360: Suchfeld kompakt, Lupe im Feld, kein Overflow", async () => {
  const { ctx, page } = await seite(360, 800);
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const t = await page.evaluate(() => {
    const such = document.querySelector(".abk-search");
    const input = document.querySelector(".abk-search-input");
    const lupe = document.querySelector(".abk-search svg");
    const s = such.getBoundingClientRect(), i = input.getBoundingClientRect(), l = lupe.getBoundingClientRect();
    return {
      suchHoehe: Math.round(s.height),
      lupeImFeld: l.top >= i.top && l.bottom <= i.bottom,
      inputBreite: Math.round(i.width),
    };
  });
  // Vorher: 260px-Zeilen-Basis wurde in der Spaltenrichtung zur HÖHE — eine
  // Leerfläche mit mittig schwebender Lupe.
  assert.ok(t.suchHoehe <= 60, `Suchfeld-Container ist ${t.suchHoehe}px hoch (Basis-Falle zurück?)`);
  assert.ok(t.lupeImFeld, "die Lupe schwebt außerhalb des Eingabefelds");
  assert.ok(t.inputBreite >= 240, `Suchfeld nur ${t.inputBreite}px breit`);
  assert.ok((await page.evaluate(OVERFLOW)) <= 1, "Seiten-Overflow bei 360px");
  await ctx.close();
});

/* ══════════ 2 — Seitenkopf (R4) ══════════════════════════════════════════ */

for (const w of [1024, 960, 900]) {
  test(`5 — Seitenkopf @${w}px: Primärbutton und Glocke vollständig im Viewport, Chip ellipsiert`, async () => {
    const { ctx, page } = await seite(w);
    await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const kopf = await page.evaluate(() => {
      const vp = document.documentElement.clientWidth;
      const btn = [...document.querySelectorAll(".ce-page-header-actions .btn, .ce-page-header .btn")]
        .find((b) => b.getClientRects().length);
      const chipName = document.querySelector(".ce-page-header .pp-uname");
      const chip = document.querySelector(".ce-page-header .pp-uchip");
      return {
        btnRechts: btn ? Math.round(btn.getBoundingClientRect().right) : null,
        vp,
        ellipsiert: chipName ? chipName.scrollWidth > chipName.clientWidth + 1 : null,
        chipTitle: chip ? chip.getAttribute("title") || "" : "",
      };
    });
    assert.ok(kopf.btnRechts !== null, "Seitenkopf-Aktion nicht gefunden");
    assert.ok(kopf.btnRechts <= kopf.vp, `Primärbutton ragt aus dem Viewport (${kopf.btnRechts} > ${kopf.vp})`);
    assert.equal(kopf.ellipsiert, true, "der lange Firmenname wird im Chip nicht ellipsiert");
    assert.ok(kopf.chipTitle.includes("Bergmann"), "der Chip-title trägt die vollständige Identität nicht");
    assert.ok((await page.evaluate(OVERFLOW)) <= 1, "Seiten-Overflow trotz Kopf-Fix");
    await ctx.close();
  });
}

/* ══════════ 3 — Listen im Shell-Band ═════════════════════════════════════ */

test("6 — Sendungen @900: Karten statt Querscroll, Status einzeilig, Aktionen sichtbar", async () => {
  const { ctx, page } = await seite(900);
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const z = await page.evaluate(() => {
    const sichtbar = (el) => el.getClientRects().length > 0;
    const karten = [...document.querySelectorAll(".ce-list-cards .ce-list-card")].filter(sichtbar);
    const vp = document.documentElement.clientWidth;
    const aktionen = [...document.querySelectorAll(".ce-list-card-actions .btn")].filter(sichtbar)
      .map((b) => Math.round(b.getBoundingClientRect().right));
    return { karten: karten.length, aktionenMaxRechts: Math.max(0, ...aktionen), vp, aktionenAnzahl: aktionen.length };
  });
  assert.ok(z.karten >= 2, "die Kartenansicht greift nicht im Shell-Band");
  assert.ok(z.aktionenAnzahl >= 2, "Zeilenaktionen fehlen in den Karten");
  assert.ok(z.aktionenMaxRechts <= z.vp, "eine Aktion liegt außerhalb des Viewports");
  pruefeBadges(await page.evaluate(BADGE_MESSUNG), "Sendungen @900px");
  await ctx.close();
});

test("7 — Sendungen @1200 (Tabelle): Statusbadges ohne Zeichenzerlegung", async () => {
  const { ctx, page } = await seite(1200);
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const tabelleSichtbar = await page.evaluate(() =>
    [...document.querySelectorAll(".ce-list-table")].some((el) => el.getClientRects().length > 0));
  assert.equal(tabelleSichtbar, true, "oberhalb des Umschalters muss die Tabelle stehen");
  const badges = await page.evaluate(BADGE_MESSUNG);
  const status = badges.filter((b) => /Gebucht|Label bereit|Zugestellt/.test(b.text));
  assert.ok(status.length >= 2, "Statusbadges nicht gefunden");
  pruefeBadges(badges, "Sendungen @1200px");
  await ctx.close();
});

test("8 — Entwürfe: Karten @900 · Tabelle @1200 mit einzeiliger Route und ungeclipptem Kebab", async () => {
  const { ctx, page } = await seite(900);
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const kartenSichtbar = await page.evaluate(() =>
    [...document.querySelectorAll(".dft-card")].some((el) => el.getClientRects().length > 0));
  assert.equal(kartenSichtbar, true, "Entwürfe zeigen im Shell-Band keine Karten");
  await ctx.close();

  const zwei = await seite(1200);
  await zwei.page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "networkidle" });
  await zwei.page.waitForTimeout(900);
  // Das Band 1101–1276 ist die engste Tabellenlage (Content 791–966): mit
  // Auto-Layout lief die Tabelle hier 76 px über die Seite (gemessen im
  // Nachher-Sweep) — die Fixspalten des Rechnungs-Vorbilds verhindern das.
  for (const w of [1140, 1200, 1276]) {
    await zwei.page.setViewportSize({ width: w, height: 900 });
    await zwei.page.waitForTimeout(250);
    const overflow = await zwei.page.evaluate(OVERFLOW);
    assert.ok(overflow <= 1, `Entwürfe @${w}px: Seiten-Overflow ${overflow}px (Tabellen-Mindestbreite?)`);
  }
  await zwei.page.setViewportSize({ width: 1200, height: 900 });
  await zwei.page.waitForTimeout(250);
  const route = await zwei.page.evaluate(() => {
    const el = [...document.querySelectorAll(".dft-cell-route")].find((e) => e.getClientRects().length);
    if (!el) return null;
    // Zeilen des TEXTES zählen, nicht die Zellhöhe: die Zelle streckt sich
    // auf die Höhe der ganzen Tabellenzeile (Nachbarspalten dürfen brechen).
    // Range-Rects liefern je Textzeile mindestens ein Fragment; Fragmente
    // derselben Zeile teilen sich (bis auf Rundung) die Oberkante.
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = [...range.getClientRects()]
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => r.top)
      .sort((a, b) => a - b);
    let zeilen = tops.length ? 1 : 0;
    for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 4) zeilen++;
    return zeilen;
  });
  assert.equal(route, 1, `die Route ist ${route}-zeilig statt einzeilig`);
  // Kebab der LETZTEN Zeile öffnen: das Menü muss vollständig treffbar sein.
  // Auf die Tabelle gescopet: die Kartenansicht steht mit ihren eigenen
  // Triggern unsichtbar im DOM — .last() ohne Scope griffe dort hinein.
  const trigger = zwei.page.locator(".dft-table-card .dft-actions-trigger").last();
  await trigger.click();
  await zwei.page.waitForTimeout(300);
  const menue = await zwei.page.evaluate(() => {
    const m = [...document.querySelectorAll(".dft-actions-menu")].find((e) => e.getClientRects().length);
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const item = m.querySelector(".dft-actions-item");
    const ir = item.getBoundingClientRect();
    const treffer = document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2);
    return { sichtbar: r.height > 40, getroffen: m.contains(treffer) };
  });
  assert.ok(menue, "das Kebab-Menü hat sich nicht geöffnet");
  assert.ok(menue.sichtbar && menue.getroffen, "das Kebab-Menü wird weiterhin geclippt/verdeckt");
  await zwei.ctx.close();
});

/* ══════════ 4 — Smoke der sauberen Bereiche + Overflow-Matrix ════════════ */

const SMOKE = [
  ["uebersicht", "/dashboard?page=overview"],
  ["rechnungen", "/dashboard?page=invoices"],
  ["support", "/dashboard?page=support"],
  ["profil", "/dashboard?page=profile"],
  ["tracking-oeffentlich", "/tracking?nummer=1Z999AA10123456784"],
];

test("9 — Smoke: zuvor saubere Bereiche bleiben ohne Overflow, Fehler und Badge-Zerfall (900/390)", async () => {
  for (const [name, pfad] of SMOKE) {
    for (const w of [900, 390]) {
      const { ctx, page, fehler } = await seite(w);
      await page.goto(`${BASE}${pfad}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      assert.ok((await page.evaluate(OVERFLOW)) <= 1, `${name} @${w}px: Seiten-Overflow`);
      pruefeBadges(await page.evaluate(BADGE_MESSUNG), `${name} @${w}px`);
      assert.deepEqual(fehler, [], `${name} @${w}px: Seitenfehler ${fehler[0] || ""}`);
      await ctx.close();
    }
  }
});

test("10 — Rechnungen @1440: die Dokument-Pill „Per E-Mail versendet\" ist einzeilig", async () => {
  const { ctx, page } = await seite(1440);
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const pill = (await page.evaluate(BADGE_MESSUNG)).find((b) => b.text === "Per E-Mail versendet");
  assert.ok(pill, "die Dokument-Pill wurde nicht gefunden");
  assert.equal(pill.zeilen, 1, `„Per E-Mail versendet" ist ${pill.zeilen}-zeilig (Spalte zu schmal)`);
  await ctx.close();
});
