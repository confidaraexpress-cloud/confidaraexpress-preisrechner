// E2E: Rechtsseiten aus der Legal-Registry und die geschützte Seitenvorschau.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (Routing am Browserkontext).
// Kein Request verlässt den Browser. Geprüft wird:
//   1. /agb mit der heutigen Fassung 2026-08 (ohne Webfassung) → die bisherige Seite.
//   2. /agb mit einer Fassung MIT Webfassung → deren Text: Titel, Fassungszeile,
//      PDF-Knopf auf genau diese Fassung, Inhaltsverzeichnis mit Sprungmarken,
//      öffentlicher Abruf ohne Token, kein Überlauf bei 1440 und 390 px, Tabellen
//      auf dem Smartphone als Karten.
//   3. /agb mit einer ANDEREN Fassung ohne Webfassung → nur PDF, nie der alte Text.
//   4. Ladefehler → Hinweis, „Erneut versuchen" lädt nach.
//   5. /datenschutz und /partnervereinbarung folgen derselben Regel.
//   6. Seitenvorschau: Kunde → /dashboard (keine Admin-Daten); Admin → Hinweisleiste,
//      ausgezeichnete Entwurfsmarken, offene Punkte, § 449-Hinweis, Seitenwechsel,
//      PDF-Vorschau mit Token.
//   7. Einstieg über „Interne Vorschau-PDFs“: Seitenvorschau und Arbeitsfassungen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5537, BASE = `http://127.0.0.1:${PORT}`;
const API_HOST = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const AGB_MD = [
  "# Allgemeine Geschäftsbedingungen der Muster UG (haftungsbeschränkt)",
  "",
  "**Stand: 2026-12 · gültig für Buchungen ab 01.12.2026**",
  "",
  "> **Wichtiger Hinweis:** Diese AGB sehen über die ADSp in einzelnen Fällen andere als die gesetzlich vorgesehenen Haftungshöchstbeträge vor.",
  "",
  "## Teil A — Allgemeines",
  "",
  "### § 1 Vertragspartner, Geltungsbereich",
  "",
  "(1) Vertragspartner des Kunden ist die Muster UG (haftungsbeschränkt).",
  "(2) Diese AGB gelten für",
  "1. den Rahmenvertrag über die Nutzung der Plattform und",
  "2. jeden über die Plattform geschlossenen Versandauftrag.",
  "",
  "### § 5 Einbeziehung der ADSp 2017; Abweichungen",
  "",
  "| Ziffer ADSp | Abweichung bzw. Maßgabe | geregelt in |",
  "|---|---|---|",
  "| 3.3 Satz 2 | keine besonderen Sicherungsmaßnahmen für wertvolle und diebstahlgefährdete Güter; Beförderung im Standardnetz des Paketdienstes | § 8 Abs. 4 |",
  "| 30.3 | Gerichtsstand nach § 26 Abs. 3 | § 26 Abs. 3 |",
  "",
  "### § 8 Warenwert, Wertgrenze je Packstück",
  "",
  "(1) Der Kunde gibt den Warenwert zutreffend an. **[Abweichung von Ziff. 21.2.2 ADSp]**",
  "",
  "## Anlage 1 zu den Allgemeinen Geschäftsbedingungen: ADSp 2017",
  "",
  "### ADSp 2017",
  "",
  "#### 1. Begriffsbestimmungen",
  "",
  "1.1 Ablieferung — der Zeitpunkt, zu dem der Empfänger das Gut übernimmt.",
  "",
].join("\n");

const DS_MD = "# Datenschutzerklärung\n\n## 1. Verantwortlicher\n\nMuster UG (haftungsbeschränkt)\nMusterstraße 1, 12345 Musterstadt\n\n## 2. Ihre Rechte\n\n- Auskunft\n- Berichtigung\n";
const PARTNER_MD = "# Vertriebspartnervereinbarung\n\n## Präambel\n\nConfidaraExpress arbeitet mit selbständigen Vertriebspartnern zusammen.\n\n## § 1 Begriffe\n\n(1) Kunde ist …\n";
const PREVIEW_MD = "# Allgemeine Geschäftsbedingungen der [[UG_FIRMA]]\n\n## Teil A — Allgemeines\n\n### § 1 Vertragspartner\n\n(1) Vertragspartner ist die [[UG_FIRMA]], Sitz [[UG_SITZ]].\n\n### § 9 Nachweis\n\n(3) Wir verlangen insbesondere *[Nachweisart nach Entscheidung H14]*.\n";
const DRAFT_MD = "> **ENTWURF — nicht freigegeben.**\n\n# Allgemeine Geschäftsbedingungen der [[UG_FIRMA]]\n\n### § 1 Vertragspartner\n\n(1) Text. *[Befund: P0-1]*\n⟦ENTSCHEIDUNG H1: Beginnt der Kundenbetrieb vor oder nach der Eintragung?⟧\n";

const termsDoc = (version, extra = {}) => ({ type: "terms", version, label: "Allgemeine Geschäftsbedingungen", url: `/api/legal/terms/${version}`, ...extra });
const privacyDoc = (version, extra = {}) => ({ type: "privacy", version, label: "Datenschutzerklärung", url: `/api/legal/privacy/${version}`, ...extra });

let server, browser;

// Backend-Mock am Kontext. `current` ist eine Liste von [status, body] je Aufruf von
// GET /api/legal/current (der letzte Eintrag bleibt stehen).
async function setup({ current = [[200, { setKey: "S", documents: [termsDoc("2026-08"), privacyDoc("2026-07")] }]],
  user = null, agreement = null, viewport = { width: 1440, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport });
  const calls = { current: 0, content: [], admin: [], pdfAuth: null, other: [] };
  const liste = [...current];
  await context.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/legal/current")) {
      calls.current += 1;
      const [status, body] = liste.length > 1 ? liste.shift() : liste[0];
      return json(body, status);
    }
    if (/\/api\/legal\/[a-z_]+\/[0-9.-]+\/inhalt$/.test(p)) {
      calls.content.push({ path: p, authorization: req.headers().authorization || null });
      if (p.includes("/terms/2026-12/")) return json({ documentType: "terms", version: "2026-12", effectiveFrom: "2026-12-01", effectiveTo: null, documentPath: "/api/legal/terms/2026-12", markdown: AGB_MD });
      if (p.includes("/privacy/2026-12/")) return json({ documentType: "privacy", version: "2026-12", effectiveFrom: "2026-12-01", effectiveTo: null, documentPath: "/api/legal/privacy/2026-12", markdown: DS_MD });
      if (p.includes("/sales_partner_agreement/1.0/")) return json({ documentType: "sales_partner_agreement", version: "1.0", effectiveFrom: "2026-12-01", effectiveTo: null, documentPath: "/api/legal/sales_partner_agreement/1.0", markdown: PARTNER_MD });
      return json({ error: "nicht gefunden" }, 404);
    }
    if (p.endsWith("/api/sales-partner/agreement")) return json({ agreement });
    if (p.endsWith("/kundenbereich")) return user ? json({ user }) : json({ error: "nicht angemeldet" }, 401);
    if (p.includes("/admin/")) {
      calls.admin.push(p);
      if (p.endsWith("/admin/legal-publications")) {
        return json({ status: "ENTWURF", publications: [
          { id: "agb", title: "Allgemeine Geschäftsbedingungen", route: "/agb", registryType: "terms", counts: { placeholders: 3 } },
          { id: "datenschutz", title: "Datenschutzerklärung", route: "/datenschutz", registryType: "privacy", counts: { placeholders: 1 } },
        ] });
      }
      if (p.endsWith("/admin/legal-publications/agb/pdf") || p.endsWith("/admin/legal-publications/datenschutz/pdf")) {
        calls.pdfAuth = req.headers().authorization || null;
        return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n% Vorschau\n%%EOF\n" });
      }
      if (/\/admin\/legal-publications\/(agb|datenschutz)$/.test(p)) {
        const ds = p.endsWith("datenschutz");
        return json({
          id: ds ? "datenschutz" : "agb", title: ds ? "Datenschutzerklärung" : "Allgemeine Geschäftsbedingungen",
          route: ds ? "/datenschutz" : "/agb", registryType: ds ? "privacy" : "terms", status: "ENTWURF",
          markdown: ds ? "# Datenschutzerklärung\n\n## 1. Verantwortlicher\n\n[[UG_FIRMA]]\n" : PREVIEW_MD,
          counts: { placeholders: 3 },
          placeholders: [{ key: "UG_FIRMA", count: 2 }, { key: "UG_SITZ", count: 1 }],
          openPoints: [{ kind: "ENTSCHEIDUNG", text: "H1: Beginnt der Kundenbetrieb vor oder nach der Eintragung?", section: "§ 1 Vertragspartner" },
            { kind: "JURISTISCHE PRÜFUNG", text: "Rangfolge der ADSp", section: "§ 5" }],
          sources: ["G1-agb-entwurf.md"],
          bookingNotices: ds ? null : { labelSuffix: "einschließlich der ADSp 2017 (Anlage 1)", notices: [{ title: "Hinweis nach § 449 Abs. 2 HGB", text: "Unsere AGB weichen ab." }] },
        });
      }
      if (p.endsWith("/admin/legal-drafts")) return json({ status: "ENTWURF", documents: [{ id: "agb", title: "AGB (G1)", group: "Kunden" }] });
      if (p.endsWith("/admin/legal-drafts/agb")) return json({ id: "agb", title: "AGB (G1)", group: "Kunden", status: "ENTWURF", markdown: DRAFT_MD });
      if (p.endsWith("/admin/invoices/production-readiness")) return json({ ready: false, testMode: true });
      if (p.endsWith("/admin/invoices/backfill-preview")) return json({ candidates: [], summary: {}, pagination: { total: 0 } });
      return json({});
    }
    calls.other.push(p);
    return json({});
  });
  if (user) await context.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  const page = await context.newPage();
  return { context, page, calls };
}

async function keinUeberlauf(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
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
  try { await browser?.close(); } catch { /* egal */ }
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — heutige Fassung 2026-08 ohne Webfassung: die bisherige Seite", async () => {
  const { context, page } = await setup();
  await page.goto(`${BASE}/agb`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "§ 1 Geltungsbereich und Vertragspartner" }).waitFor();
  assert.match(await page.locator(".legal-stand").first().innerText(), /Stand: August 2026/);
  assert.equal(await page.locator('[data-legal-mode="content"]').count(), 0);
  await context.close();
});

test("2 — Fassung mit Webfassung: Text, Fassung, PDF, Sprungmarken; ohne Token; kein Überlauf", async () => {
  const { context, page, calls } = await setup({ current: [[200, { setKey: "S2", documents: [
    termsDoc("2026-12", { contentPath: "/api/legal/terms/2026-12/inhalt" }), privacyDoc("2026-07")] }]] });
  await page.goto(`${BASE}/agb`, { waitUntil: "networkidle" });
  await page.locator('[data-legal-mode="content"]').waitFor();
  assert.equal(await page.locator("h1.legal-title").innerText(), "Allgemeine Geschäftsbedingungen der Muster UG (haftungsbeschränkt)");
  assert.equal(await page.locator("#legal-version").innerText(), "Fassung 2026-12 · gültig ab 01.12.2026");
  const pdf = page.locator("#legal-pdf");
  assert.equal(await pdf.getAttribute("href"), `${API_HOST}/api/legal/terms/2026-12`);
  assert.equal(await pdf.getAttribute("target"), "_blank");
  assert.equal(await page.getByText("§ 1 Geltungsbereich und Vertragspartner").count(), 0, "kein Text der alten Fassung");
  // Inhaltsverzeichnis: Teile und §§; Sprung zu § 8.
  const toc = page.locator(".legal-toc a");
  assert.ok(await toc.count() >= 5);
  await page.locator('.legal-toc a[href="#paragraf-8"]').click();
  await page.waitForFunction(() => location.hash === "#paragraf-8");
  // Der Sprung ist eine Browsernavigation; die Seite scrollt danach (nicht synchron).
  await page.waitForFunction(() => {
    const r = document.getElementById("paragraf-8").getBoundingClientRect();
    return scrollY > 0 && r.top >= 64 && r.top < innerHeight;
  }, null, { timeout: 5000 });
  assert.equal(await page.locator("#anlage-1").count(), 1);
  assert.match(await page.locator(".legal-callout").innerText(), /Wichtiger Hinweis/);
  assert.equal(await page.locator(".legal-table").count(), 1);
  assert.ok(await page.getByText("[Abweichung von Ziff. 21.2.2 ADSp]").count() >= 1, "Kennzeichnung der Abweichung sichtbar");
  assert.equal(await page.locator(".legal-mark").count(), 0, "eine veröffentlichte Fassung trägt keine Entwurfsmarken");
  assert.ok(await keinUeberlauf(page), "Überlauf bei 1440 px");
  assert.deepEqual(calls.content.map((c) => c.authorization), [null], "öffentlicher Abruf ohne Token");
  // Smartphone: Tabelle als Karten, kein Überlauf.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.ok(await keinUeberlauf(page), "Überlauf bei 390 px");
  const kopf = await page.locator(".legal-table thead").evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(kopf <= 1, "Tabellenkopf ist auf dem Smartphone ausgeblendet (Zellen tragen ihre Bezeichnung)");
  const zelle = await page.locator(".legal-table td").first().evaluate((el) => getComputedStyle(el, "::before").content);
  assert.match(zelle, /Ziffer ADSp/);
  const tabelleBreite = await page.locator(".legal-table").evaluate((el) => el.getBoundingClientRect().right <= innerWidth);
  assert.ok(tabelleBreite, "Tabelle ragt nicht über den Rand");
  await context.close();
});

test("3 — andere Fassung aktiv, aber ohne Webfassung: nur PDF, nie der alte Text", async () => {
  const { context, page } = await setup({ current: [[200, { setKey: "S3", documents: [termsDoc("2026-12"), privacyDoc("2026-07")] }]] });
  await page.goto(`${BASE}/agb`, { waitUntil: "networkidle" });
  await page.locator("#legal-pdf-only").waitFor();
  assert.match(await page.locator("#legal-pdf-only").innerText(), /Gültig ist die Fassung 2026-12/);
  assert.equal(await page.locator("#legal-pdf").getAttribute("href"), `${API_HOST}/api/legal/terms/2026-12`);
  assert.equal(await page.getByText("§ 1 Geltungsbereich und Vertragspartner").count(), 0);
  await context.close();
});

test("4 — Ladefehler: Hinweis, „Erneut versuchen“ lädt die gültige Fassung", async () => {
  const { context, page, calls } = await setup({ current: [[500, { error: "Fehler" }],
    [200, { setKey: "S2", documents: [termsDoc("2026-12", { contentPath: "/api/legal/terms/2026-12/inhalt" }), privacyDoc("2026-07")] }]] });
  await page.goto(`${BASE}/agb`, { waitUntil: "networkidle" });
  await page.locator("#legal-retry").click();
  await page.locator('[data-legal-mode="content"]').waitFor();
  assert.equal(calls.current, 2);
  await context.close();
});

test("5 — /datenschutz und /partnervereinbarung folgen derselben Regel", async () => {
  const { context, page } = await setup({
    current: [[200, { setKey: "S4", documents: [termsDoc("2026-08"), privacyDoc("2026-12", { contentPath: "/api/legal/privacy/2026-12/inhalt" })] }]],
    agreement: { title: "Vertriebspartnervereinbarung", version: "1.0", effectiveFrom: "2026-12-01", effectiveTo: null,
      documentPath: "/api/legal/sales_partner_agreement/1.0", contentPath: "/api/legal/sales_partner_agreement/1.0/inhalt" },
  });
  await page.goto(`${BASE}/datenschutz`, { waitUntil: "networkidle" });
  await page.locator('[data-legal-mode="content"]').waitFor();
  assert.equal(await page.locator("h1.legal-title").innerText(), "Datenschutzerklärung");
  assert.match(await page.locator(".legal-sheet").innerText(), /Musterstraße 1, 12345 Musterstadt/);
  await page.goto(`${BASE}/partnervereinbarung`, { waitUntil: "networkidle" });
  await page.locator('[data-legal-mode="content"]').waitFor();
  assert.equal(await page.locator("#legal-version").innerText(), "Fassung 1.0 · gültig ab 01.12.2026");
  assert.equal(await page.locator("#legal-pdf").getAttribute("href"), `${API_HOST}/api/legal/sales_partner_agreement/1.0`);
  assert.match(await page.locator(".legal-sheet").innerText(), /selbständigen Vertriebspartnern/);
  await context.close();
});

test("6a — Seitenvorschau: ein Kunde wird umgeleitet, Admin-Daten werden nicht abgerufen", async () => {
  const { context, page, calls } = await setup({ user: { id: 5, email: "k@example.org", role: "customer", status: "approved" } });
  await page.goto(`${BASE}/vorschau/rechtstexte/agb`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/dashboard/);
  assert.ok(!calls.admin.some((p) => p.includes("legal-publications")), "keine Admin-Daten für Kunden");
  await context.close();
});

test("6b — Seitenvorschau für Admins: Hinweisleiste, Entwurfsmarken, offene Punkte, Wechsel, PDF mit Token", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page, calls } = await setup({ user: { id: 1, email: "a@example.org", role: "admin", status: "approved", name: "Anna Admin" }, viewport });
    await page.goto(`${BASE}/vorschau/rechtstexte/agb`, { waitUntil: "networkidle" });
    await page.locator('[data-legal-mode="preview"]').waitFor();
    assert.match(await page.locator(".legal-preview-flag").innerText(), /Geschützte Vorschau · ENTWURF/);
    assert.match(await page.locator(".legal-preview-flag").innerText(), /So sähe \/agb nach der Freigabe aus/);
    assert.equal(await page.locator("h1.legal-title").innerText(), "Allgemeine Geschäftsbedingungen der [[UG_FIRMA]]");
    assert.ok(await page.locator(".legal-mark--placeholder").count() >= 2, "Platzhalter ausgezeichnet");
    assert.equal(await page.locator(".legal-mark--gap").count(), 1, "Lücke ausgezeichnet");
    assert.match(await page.locator(".legal-preview-open").first().innerText(), /3 Platzhalter|Platzhalter/);
    assert.match(await page.locator(".legal-preview-open").nth(1).innerText(), /einschließlich der ADSp 2017/);
    assert.ok(await keinUeberlauf(page), `Überlauf bei ${viewport.width} px`);
    await page.locator("#legal-preview-pdf").click();
    await page.locator("#legal-preview-pdf-open").waitFor();
    assert.equal(calls.pdfAuth, "Bearer e2e-token", "PDF-Vorschau nur mit Token");
    await page.selectOption("#legal-preview-page", "datenschutz");
    await page.waitForURL(/\/vorschau\/rechtstexte\/datenschutz$/);
    await page.getByRole("heading", { level: 1, name: "Datenschutzerklärung" }).waitFor();
    assert.equal(await page.locator("#legal-preview-pdf").count(), 1, "PDF der vorigen Seite verworfen");
    await context.close();
  }
});

test("7 — Einstieg über „Interne Vorschau-PDFs“: Seitenvorschau und Arbeitsfassungen", async () => {
  const { context, page } = await setup({ user: { id: 1, email: "a@example.org", role: "admin", status: "approved", name: "Anna Admin" } });
  await page.goto(`${BASE}/admin/invoices/backfill`, { waitUntil: "networkidle" });
  const karte = page.locator("#adm-legal-texts");
  await karte.waitFor();
  await karte.getByRole("link", { name: "Arbeitsfassungen G1–G9" }).click();
  await page.waitForURL(/\/admin\/legal-drafts$/);
  await page.locator(".adm-ld-sheet").waitFor();
  assert.equal(await page.locator(".adm-ld-sheet .legal-mark--open").count(), 1, "offener Punkt ⟦…⟧ ausgezeichnet");
  assert.equal(await page.locator(".adm-ld-sheet h2.legal-h2").count() >= 1, true);
  await page.goto(`${BASE}/admin/invoices/backfill`, { waitUntil: "networkidle" });
  await page.locator("#adm-legal-texts").getByRole("link", { name: /Seitenvorschau/ }).click();
  await page.waitForURL(/\/vorschau\/rechtstexte\/agb$/);
  await page.locator('[data-legal-mode="preview"]').waitFor();
  await context.close();
});
