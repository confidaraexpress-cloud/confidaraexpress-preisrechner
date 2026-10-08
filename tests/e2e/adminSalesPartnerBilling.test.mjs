// E2E: Admin · Partnerdetail — Karten „Abrechnungsdaten“ und „Gutschriften“.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route). Es wird
// nichts echt bestätigt, ausgezahlt, storniert oder erzeugt. Geprüft wird:
//   1. Abrechnungsdaten: Status, vollständige IBAN (nur hier), Bestätigen mit
//      dem Einreichungszeitpunkt als Token.
//   2. Fehlende Angaben markiert; Ablehnen verlangt eine Begründung.
//   3. 409 BILLING_DETAILS_CHANGED: Hinweis, neuer Stand geladen.
//   4. Gutschriften: Liste mit Dokument-, Benachrichtigungs- und
//      Auszahlungsstand; PDF als authentifizierter Blob-Abruf.
//   5. Als ausgezahlt markieren: Datum Pflicht, Referenz optional.
//   6. Storno einer ausgezahlten Gutschrift nur mit ausdrücklicher Bestätigung.
//   7. 409 CREDIT_NOTE_PAID_ACK_REQUIRED: die Bestätigung erscheint nachträglich.
//   8. 422 CREDIT_NOTE_BLOCKED: Blockiergründe als deutsche Labels.
//   9. Dokument erneut erzeugen — nur solange nicht bereit oder nicht benachrichtigt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5486, BASE = `http://127.0.0.1:${PORT}`;
const HEUTE = "2026-10-07T10:00:00";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE" };
const IBAN = "DE89370400440532013000";

const DETAIL = {
  partner: { id: 5, name: "Petra Partner", email: "petra@partner-vertrieb.de", companyName: "Vertrieb Süd GmbH",
    phone: null, status: "active", loginStatus: "approved", referralCode: "ABCD2345", sponsor: null, sponsorCodeUsed: null,
    agreementVersion: "1.0", agreementAcceptedAt: "2026-10-01T09:30:00Z", createdAt: "2026-10-01T09:30:00Z",
    approvedAt: "2026-10-02T10:00:00Z", contractEndedOn: null, deactivationReason: null },
  rates: { current: null, history: [] }, statusHistory: [], levelRules: { mode: "global", current: null, history: [] },
  team: { level1: [], level2: [] }, customers: [], assessments: [],
};

const billingDetails = (extra = {}) => ({
  billingName: "Vertrieb Süd GmbH", street: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "DE",
  taxStatus: "with_vat", taxNumber: "12/345/67890", vatId: "DE123456789", accountHolder: "Vertrieb Süd GmbH",
  ibanMasked: "DE89 **** **** **** **30 00", iban: IBAN, bic: "COBADEFFXXX",
  submittedAt: "2026-10-07T09:00:00.000Z", reviewedAt: null, reviewNote: null, ...extra,
});

const gutschrift = (extra = {}) => ({
  id: 11, number: "GS-2026-0001", kind: "regular", title: "Gutschrift", periodMonth: "2026-09",
  issuedAt: "2026-10-02T08:00:00.000Z", issuedOn: "2026-10-02", netCents: 10000, taxCents: 1900, grossCents: 11900,
  taxRatePercent: "19.00", currency: "EUR", documentReady: true, payoutStatus: "open", paidOn: null,
  cancelled: false, cancelledByNumber: null, correctsNumber: null, replacesNumber: null,
  documentStatus: "ready", notifiedAt: "2026-10-02T08:01:00.000Z", paidReference: null, issuedByName: "Anna Admin",
  cancellationReason: null, ...extra,
});

let server, browser;

/** Backend-Mock mit veränderlichem Zustand. Antwortlisten je Aktion liefern
 *  [status, body]; ohne Eintrag gilt der Erfolg des Vertrags. */
async function setup(page, {
  billing = { status: "submitted", billingDetails: billingDetails(), missingFields: [], accountEmail: "petra@partner-vertrieb.de" },
  creditNotes = [gutschrift()], antworten = {},
} = {}) {
  const state = { billing: structuredClone(billing), creditNotes: structuredClone(creditNotes), billingGets: 0,
    confirm: [], reject: [], payout: [], cancel: [], generate: [], pdf: [], other: [] };
  const queue = { confirm: [...(antworten.confirm || [])], reject: [...(antworten.reject || [])],
    payout: [...(antworten.payout || [])], cancel: [...(antworten.cancel || [])], generate: [...(antworten.generate || [])] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const post = req.method() === "POST";
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/sales-partners/5") && !post) return json(DETAIL);
    if (p.endsWith("/admin/sales-partners/5/commissions")) return json({ month: "2026-10", totals: { accruedCents: 0, payableCents: 0 }, entries: [] });
    // Karte „Individuelle Obergrenze“ des Partnerdetails (eigener Abruf je Partner).
    if (p.endsWith("/admin/sales-partner-caps") && !post && new URL(req.url()).searchParams.get("partnerUserId") === "5") {
      return json({ current: null, history: [] });
    }
    if (p.endsWith("/admin/sales-partners/5/billing-details") && !post) { state.billingGets += 1; return json(state.billing); }
    if (p.endsWith("/billing-details/confirm") && post) {
      state.confirm.push(req.postDataJSON());
      const [status, body] = queue.confirm.shift() || [200, { status: "confirmed" }];
      if (status === 200) state.billing = { ...state.billing, status: "confirmed", billingDetails: { ...state.billing.billingDetails, reviewedAt: "2026-10-07T09:30:00.000Z" } };
      if (body && body.__danach) { state.billing = body.__danach; delete body.__danach; }
      return json(body, status);
    }
    if (p.endsWith("/billing-details/reject") && post) {
      const b = req.postDataJSON();
      state.reject.push(b);
      const [status, body] = queue.reject.shift() || [200, { status: "rejected" }];
      if (status === 200) state.billing = { ...state.billing, status: "rejected", billingDetails: { ...state.billing.billingDetails, reviewedAt: "2026-10-07T09:30:00.000Z", reviewNote: b.note } };
      return json(body, status);
    }
    if (p.endsWith("/admin/sales-partners/5/credit-notes")) return json({ creditNotes: state.creditNotes });
    const m = p.match(/\/admin\/sales-partner-credit-notes\/(\d+)\/(pdf|payout|cancel|generate-document)$/);
    if (m) {
      const id = Number(m[1]);
      const eintrag = state.creditNotes.find((c) => c.id === id);
      if (m[2] === "pdf") {
        state.pdf.push({ id, authorization: req.headers().authorization || null });
        return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n% e2e\n" });
      }
      if (m[2] === "payout") {
        const b = req.postDataJSON();
        state.payout.push(b);
        const [status, body] = queue.payout.shift() || [200, null];
        if (status === 200) Object.assign(eintrag, { payoutStatus: "paid", paidOn: b.paidOn, paidReference: b.reference || null });
        return json(body || { creditNote: eintrag }, status);
      }
      if (m[2] === "cancel") {
        state.cancel.push(req.postDataJSON());
        const [status, body] = queue.cancel.shift() || [201, { cancellation: { id: 99, number: "GS-2026-0099" }, documentReady: true, notified: true }];
        if (status === 201) {
          Object.assign(eintrag, { cancelled: true, cancelledByNumber: "GS-2026-0099" });
          state.creditNotes.unshift(gutschrift({ id: 99, number: "GS-2026-0099", kind: "cancellation", title: "Stornobeleg",
            netCents: -eintrag.netCents, taxCents: -eintrag.taxCents, grossCents: -eintrag.grossCents, payoutStatus: null,
            correctsNumber: eintrag.number, cancellationReason: "Betrag falsch berechnet" }));
        }
        return json(body, status);
      }
      state.generate.push(id);
      const [status, body] = queue.generate.shift() || [200, { documentStatus: "ready", notified: true }];
      if (status === 200) Object.assign(eintrag, { documentStatus: "ready", documentReady: true, notifiedAt: "2026-10-07T10:00:00.000Z" });
      return json(body, status);
    }
    state.other.push(`${req.method()} ${p}`);
    return json({});
  });
  await page.clock.setFixedTime(new Date(HEUTE));
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

// UX-Paket 4: Die Bereiche des Partnerdetails sind eingeklappt. Eingereichte
// Abrechnungsdaten öffnen sich von selbst (alle Fälle hier reichen ein); die
// Gutschriften öffnet der Admin per Klick auf den Kopf — wie von Hand.
async function bereich(page, id) {
  await page.locator(`#${id}`).waitFor({ state: "attached" });
  if (!(await page.locator(`#${id}`).evaluate((d) => d.open))) await page.locator(`#${id} > summary`).click();
  await page.waitForFunction((x) => document.getElementById(x)?.open === true, id);
}

async function zumDetail(page) {
  await page.goto(`${BASE}/admin/partners/5`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-billing-card .adm-kv").first().waitFor({ state: "visible" });
  await bereich(page, "adm-sp-credit-notes-card");
}

const feld = (page, key) => page.locator(`#adm-sp-billing-fields [data-field="${key}"] dd`);

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

test("1 — Abrechnungsdaten: vollständige IBAN nur hier; Bestätigen mit dem Einreichungszeitpunkt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zumDetail(page);
  // UX-Paket 4: eine eingereichte Fassung öffnet den Bereich von selbst — ohne Klick.
  assert.match(await page.locator("#adm-sp-billing-card > summary").innerText(), /Abrechnungsdaten\s+In Prüfung/);
  assert.equal(await page.locator("#adm-sp-next-step").getAttribute("data-step"), "billing");
  assert.equal(await page.locator("#adm-sp-billing-status").innerText(), "In Prüfung");
  assert.equal(await feld(page, "iban").innerText(), "DE89 3704 0044 0532 0130 00");
  assert.equal(await feld(page, "taxStatus").innerText(), "Mit Umsatzsteuerausweis");
  assert.equal(await feld(page, "country").innerText(), "Deutschland");
  assert.match(await page.locator("#adm-sp-billing-card").innerText(), /petra@partner-vertrieb\.de/);
  // Die IBAN steht ausschließlich in dieser Karte.
  const rest = await page.evaluate(() => [...document.querySelectorAll(".adm-card")]
    .filter((k) => k.id !== "adm-sp-billing-card").map((k) => k.innerText).join("\n"));
  assert.ok(!rest.replace(/\s/g, "").includes(IBAN), "IBAN außerhalb der Karte „Abrechnungsdaten“");

  await page.locator("#adm-sp-billing-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.locator("#adm-sp-billing-dialog-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.confirm, [{ submittedAt: "2026-10-07T09:00:00.000Z" }]);
  await page.waitForFunction(() => document.querySelector("#adm-sp-billing-status")?.textContent === "Bestätigt");
  assert.equal(await page.locator("#adm-sp-billing-message").innerText(), "Die Abrechnungsdaten wurden bestätigt.");
  assert.equal(await page.locator("#adm-sp-billing-confirm").count(), 0, "keine Prüfaktion mehr für bestätigte Daten");
  assert.deepEqual(state.other, [], `unerwartete Aufrufe: ${state.other.join(", ")}`);
  await page.close();
});

test("2 — fehlende Angaben markiert; Ablehnen nur mit Begründung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { billing: { status: "submitted", accountEmail: "petra@partner-vertrieb.de",
    missingFields: ["vatId", "bic"], billingDetails: billingDetails({ vatId: null, bic: null }) } });
  await zumDetail(page);
  assert.equal(await page.locator("#adm-sp-billing-missing").innerText(), "Es fehlen: USt-IdNr., BIC.");
  assert.equal(await feld(page, "vatId").innerText(), "Fehlt");
  assert.equal(await page.locator('#adm-sp-billing-fields [data-field="bic"]').getAttribute("data-missing"), "true");

  await page.locator("#adm-sp-billing-reject").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.locator("#adm-sp-billing-dialog-confirm").click();
  await page.locator('[role="dialog"] .field-error').waitFor({ state: "visible" });
  assert.equal(state.reject.length, 0, "ohne Begründung kein Request");
  await page.fill("#adm-sp-billing-note", "Die USt-IdNr. fehlt.");
  await page.locator("#adm-sp-billing-dialog-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.reject, [{ submittedAt: "2026-10-07T09:00:00.000Z", note: "Die USt-IdNr. fehlt." }]);
  await page.waitForFunction(() => document.querySelector("#adm-sp-billing-status")?.textContent === "Abgelehnt");
  assert.equal(await page.locator("#adm-sp-billing-review-note").innerText(), "Die USt-IdNr. fehlt.");
  await page.close();
});

test("3 — 409 BILLING_DETAILS_CHANGED: Hinweis, neu geladen, kein stilles Bestätigen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const neu = { status: "submitted", accountEmail: "petra@partner-vertrieb.de", missingFields: [],
    billingDetails: billingDetails({ submittedAt: "2026-10-07T09:45:00.000Z", postalCode: "10117" }) };
  const state = await setup(page, { antworten: { confirm: [[409, { error: "Neu eingereicht", code: "BILLING_DETAILS_CHANGED", __danach: neu }]] } });
  await zumDetail(page);
  const vorher = state.billingGets;
  await page.locator("#adm-sp-billing-confirm").click();
  await page.locator("#adm-sp-billing-dialog-confirm").click();
  await page.locator("#adm-sp-billing-message").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-sp-billing-message").innerText(), /inzwischen neu eingereicht/);
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await page.waitForFunction(() => document.querySelector('#adm-sp-billing-fields [data-field="postalCode"] dd')?.textContent === "10117");
  assert.ok(state.billingGets > vorher, "der neue Stand wurde geladen");
  assert.equal(await page.locator("#adm-sp-billing-status").innerText(), "In Prüfung");
  await page.close();
});

test("4 — Gutschriften: Stand je Beleg, PDF als authentifizierter Blob-Abruf", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const state = await setup(page, { creditNotes: [
    gutschrift(),
    gutschrift({ id: 12, number: "GS-2026-0002", payoutStatus: "paid", paidOn: "2026-10-04", paidReference: "SEPA-0815" }),
    gutschrift({ id: 13, number: "GS-2026-0003", documentStatus: "failed", documentReady: false, notifiedAt: null }),
  ] });
  await zumDetail(page);
  await page.locator("#adm-sp-cn-table").waitFor({ state: "visible" });
  const zeile = (id) => page.locator(`#adm-sp-cn-table tr[data-credit-note="${id}"]`);
  const erste = await zeile(11).innerText();
  assert.match(erste, /GS-2026-0001/);
  assert.match(erste, /September 2026/);
  assert.match(erste, /119,00\s€/);
  assert.match(erste, /Dokument bereit/);
  assert.match(erste, /Benachrichtigt am 02\.10\.2026/);
  assert.match(erste, /Noch nicht ausgezahlt/);
  assert.match(erste, /Ausgestellt von Anna Admin/);
  const zweite = await zeile(12).innerText();
  assert.match(zweite, /Ausgezahlt am 04\.10\.2026/);
  assert.match(zweite, /Referenz: SEPA-0815/);
  assert.equal(await page.locator("#adm-sp-cn-payout-12").count(), 0, "eine ausgezahlte Gutschrift wird nicht erneut ausgezahlt");
  const dritte = await zeile(13).innerText();
  assert.match(dritte, /Dokument fehlgeschlagen/);
  assert.match(dritte, /Noch nicht benachrichtigt/);
  assert.equal(await page.locator("#adm-sp-cn-pdf-13").count(), 0, "kein PDF ohne bereites Dokument");
  assert.doesNotMatch(await page.locator("#adm-sp-cn-table").innerText(), /\bpending_document\b|\bfailed\b|\bregular\b/);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator("#adm-sp-cn-pdf-11").click(),
  ]);
  assert.equal(download.suggestedFilename(), "gutschrift-GS-2026-0001.pdf");
  assert.deepEqual(state.pdf, [{ id: 11, authorization: "Bearer e2e-admin-token" }]);
  await page.close();
});

test("5 — Als ausgezahlt markieren: Datum Pflicht, Referenz optional, neuer Stand", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zumDetail(page);
  await page.locator("#adm-sp-cn-payout-11").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.locator("#adm-sp-cn-payout-confirm").click();
  await page.locator('[role="dialog"] .field-error').waitFor({ state: "visible" });
  assert.equal(state.payout.length, 0, "ohne Datum kein Request");
  assert.equal(await page.getAttribute("#adm-sp-cn-paid-on", "max"), "2026-10-07", "nicht in der Zukunft");

  await page.fill("#adm-sp-cn-paid-on", "2026-10-06");
  await page.fill("#adm-sp-cn-reference", "SEPA-4711");
  await page.locator("#adm-sp-cn-payout-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.payout, [{ paidOn: "2026-10-06", reference: "SEPA-4711" }]);
  await page.locator("#adm-sp-cn-message").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('#adm-sp-cn-table tr[data-credit-note="11"]')?.innerText.includes("Ausgezahlt am 06.10.2026"));
  assert.match(await page.locator('#adm-sp-cn-table tr[data-credit-note="11"]').innerText(), /Referenz: SEPA-4711/);
  await page.close();
});

test("6 — Storno einer ausgezahlten Gutschrift nur mit ausdrücklicher Bestätigung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { creditNotes: [gutschrift({ payoutStatus: "paid", paidOn: "2026-10-04" })] });
  await zumDetail(page);
  await page.locator("#adm-sp-cn-cancel-11").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  const dialog = await page.locator('[role="dialog"]').innerText();
  assert.match(dialog, /bereits ausgezahlt \(Ausgezahlt am 04\.10\.2026\)/);
  assert.match(dialog, /Die Positionen dieser Gutschrift können nach dem Storno erneut abgerechnet werden\./);
  assert.match(await page.locator('label:has(#adm-sp-cn-ack-paid)').innerText(), /Bereits ausgezahlt – Storno trotzdem anlegen/);

  await page.fill("#adm-sp-cn-cancel-reason", "Betrag falsch berechnet");
  await page.locator("#adm-sp-cn-cancel-confirm").click();
  await page.locator('[role="dialog"] .field-error').waitFor({ state: "visible" });
  assert.equal(state.cancel.length, 0, "ohne Bestätigung kein Request");

  await page.locator("#adm-sp-cn-ack-paid").check();
  await page.locator("#adm-sp-cn-cancel-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.cancel, [{ reason: "Betrag falsch berechnet", acknowledgePaid: true }]);
  assert.match(await page.locator("#adm-sp-cn-message").innerText(),
    /Das Storno GS-2026-0099 wurde angelegt\. Die Positionen dieser Gutschrift können nach dem Storno erneut abgerechnet werden\./);
  await page.waitForFunction(() => document.querySelector('#adm-sp-cn-table tr[data-credit-note="11"]')?.innerText.includes("Storniert durch GS-2026-0099"));
  assert.equal(await page.locator("#adm-sp-cn-cancel-11").count(), 0);
  assert.equal(await page.locator("#adm-sp-cn-cancel-99").count(), 0, "kein Storno eines Stornos");
  await page.close();
});

test("7 — 409 CREDIT_NOTE_PAID_ACK_REQUIRED: die Bestätigung erscheint nachträglich", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { antworten: { cancel: [[409, { error: "Bereits ausgezahlt", code: "CREDIT_NOTE_PAID_ACK_REQUIRED" }]] } });
  await zumDetail(page);
  await page.locator("#adm-sp-cn-cancel-11").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-cn-ack-paid").count(), 0, "eine offene Gutschrift braucht keine Bestätigung");
  await page.fill("#adm-sp-cn-cancel-reason", "Doppelt ausgestellt");
  await page.locator("#adm-sp-cn-cancel-confirm").click();
  await page.locator("#adm-sp-cn-ack-paid").waitFor({ state: "visible" });
  assert.match(await page.locator('[role="dialog"] .alert-error').innerText(), /bereits ausgezahlt/);
  assert.deepEqual(state.cancel, [{ reason: "Doppelt ausgestellt", acknowledgePaid: false }]);
  await page.locator("#adm-sp-cn-ack-paid").check();
  await page.locator("#adm-sp-cn-cancel-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.cancel[1], { reason: "Doppelt ausgestellt", acknowledgePaid: true });
  await page.close();
});

test("8 — 422 CREDIT_NOTE_BLOCKED: deutsche Blockiergründe, kein Rohcode", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(page, { antworten: { cancel: [[422, { error: "Blockiert", code: "CREDIT_NOTE_BLOCKED",
    blockers: ["cancellation_title_missing", "issuer_config_incomplete"] }]] } });
  await zumDetail(page);
  await page.locator("#adm-sp-cn-cancel-11").click();
  await page.fill("#adm-sp-cn-cancel-reason", "Betrag falsch");
  await page.locator("#adm-sp-cn-cancel-confirm").click();
  await page.locator('[role="dialog"] .alert-error').waitFor({ state: "visible" });
  const text = await page.locator('[role="dialog"] .alert-error').innerText();
  assert.match(text, /Belegtitel des Stornos nicht hinterlegt, Ausstellerangaben unvollständig/);
  assert.doesNotMatch(text, /cancellation_title_missing|issuer_config_incomplete|CREDIT_NOTE_BLOCKED/);
  await page.close();
});

test("9 — Dokument erneut erzeugen: nur solange nicht bereit oder nicht benachrichtigt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { creditNotes: [
    gutschrift(),
    gutschrift({ id: 12, number: "GS-2026-0002", notifiedAt: null }),
    gutschrift({ id: 13, number: "GS-2026-0003", documentStatus: "failed", documentReady: false, notifiedAt: null }),
  ] });
  await zumDetail(page);
  await page.locator("#adm-sp-cn-table").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-cn-regenerate-11").count(), 0, "bereit und benachrichtigt");
  assert.equal(await page.locator("#adm-sp-cn-regenerate-12").count(), 1, "bereit, aber nicht benachrichtigt");
  await page.locator("#adm-sp-cn-regenerate-13").click();
  await page.locator("#adm-sp-cn-message").waitFor({ state: "visible" });
  assert.deepEqual(state.generate, [13]);
  assert.equal(await page.locator("#adm-sp-cn-message").innerText(),
    "GS-2026-0003: Ergebnis: Dokument bereit. Der Vertriebspartner wurde benachrichtigt.");
  await page.waitForFunction(() => !document.querySelector("#adm-sp-cn-regenerate-13"));
  assert.match(await page.locator('#adm-sp-cn-table tr[data-credit-note="13"]').innerText(), /Dokument bereit/);
  await page.close();
});

test("10 — Pre-Live: Testgutschrift gekennzeichnet; Auszahlung „Test – …“; Modus aus → fester Satz", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, {
    creditNotes: [gutschrift({ id: 21, number: "CE-TEST-PG26-0001", isTest: true }),
      gutschrift({ id: 22, number: "CE-TEST-PG26-0002", isTest: true, payoutStatus: "paid", paidOn: "2026-10-04" })],
    antworten: { payout: [[409, { error: "Pre-Live-Testmodus ist nicht aktiv.", code: "PRELIVE_TEST_MODE_DISABLED" }]] },
  });
  await zumDetail(page);
  await page.locator("#adm-sp-cn-table").waitFor({ state: "visible" });
  const offen = await page.locator('#adm-sp-cn-table tr[data-credit-note="21"]').innerText();
  assert.match(offen, /TESTDOKUMENT – nicht steuerlich gültig/);
  assert.match(offen, /Test – nicht ausgezahlt/);
  assert.doesNotMatch(offen, /Noch nicht ausgezahlt/);
  assert.match(await page.locator('#adm-sp-cn-table tr[data-credit-note="22"]').innerText(), /Test – ausgezahlt/);
  assert.equal(await page.locator("#adm-sp-cn-cancel-21").innerText(), "Stornieren", "Stornoknopf unverändert");

  await page.locator("#adm-sp-cn-payout-21").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.match(await page.locator('[role="dialog"]').innerText(), /es fließt kein Geld/);
  await page.fill("#adm-sp-cn-paid-on", "2026-10-06");
  await page.locator("#adm-sp-cn-payout-confirm").click();
  await page.locator('[role="dialog"] .alert-error').waitFor({ state: "visible" });
  assert.deepEqual(state.payout, [{ paidOn: "2026-10-06" }]);
  assert.equal(await page.locator('[role="dialog"] .alert-error').innerText(),
    "Der Pre-Live-Testmodus ist nicht aktiv – Testgutschriften lassen sich derzeit nicht bearbeiten. Es wurde nichts geändert.");
  await page.close();
});
