// E2E: Partnerportal — „Gutschriften“ (bis UX-Paket 6 „Abrechnungen“), Konto
// „Abrechnungsdaten“ und „Vereinbarung“ (bis UX-Paket 6 „Vertrag“).
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route). Kein
// Request verlässt den Browser, kein Dokument wird echt erzeugt. Kernverträge:
//   • ein Partner ruft keinen Kundenendpunkt (/kunde/*) auf — jeder solche
//     Aufruf wird mitgezählt und muss 0 bleiben;
//   • das PDF einer Gutschrift kommt per authentifiziertem Blob-Abruf (Token
//     als Kopfzeile, nie in der Adresse);
//   • die vollständige IBAN erscheint nie: weder im Text noch in einem Feld.
//   1. Abrechnungen: Liste, Auszahlung, Korrekturhinweise, „Wird erstellt“,
//      Hinweis zum abrechnungsreifen Saldo, keine Adminangaben.
//   2. PDF-Download: Request mit Bearer-Kopfzeile auf den Partnerpfad; ein 404
//      erscheint als verständlicher Satz.
//   3. Vortrag (carriedForward) und Leerzustand.
//   4. Abrechnungsdaten: Pflichtprüfung ohne Request, 400-Feldfehler am Feld,
//      Einreichen, danach „In Prüfung“ mit maskierter IBAN.
//   5. Bearbeiten mit hinterlegter IBAN: Feld leer, ohne Eingabe kein `iban`.
//   6. Abgelehnt: Begründung sichtbar.
//   7. Vertrag: Fassung, Zeitpunkt, Dokumentlink; ohne Dokument der Hinweis.
//   8. Pre-Live: Testgutschriften als TESTDOKUMENT mit Testauszahlung.
//   9. Pre-Live: Vertrag eines Testkontos — keine rechtsverbindliche Vereinbarung.
//  10. Gutschriften (UX-Paket 6): der Weg zu den Abrechnungsdaten führt ins
//      Konto, wo sie zuerst stehen; 390 px als Karten ohne seitliches Scrollen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5485, BASE = `http://127.0.0.1:${PORT}`;
const API_HOST = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const PARTNER = { id: 42, name: "Petra Partner", email: "petra@partner-vertrieb.de", status: "approved",
  role: "sales_partner", company_name: "Vertrieb Süd GmbH" };
const IBAN = "DE89370400440532013000";
const IBAN_MASKE = "DE89 **** **** **** **30 00";

const OVERVIEW = {
  partner: { name: "Petra Partner", status: "active", activeSince: "2026-03-01" },
  links: { code: null, customer: null, partner: null },
  rates: { basePercent: "20.00", level1Percent: "5.00", level2Percent: "2.50" },
  levels: null,
  currentMonth: { month: "2026-10", commissionCents: 0, payableCents: 0, shipments: 0, packages: 0 },
  customers: { assigned: 0 },
};
const TEAM_LEER = { limits: { level1: 10, level2: 10 }, level1: [], level2: [] };

// Drei Belege: eine ausgezahlte, stornierte Gutschrift, ihr Storno und eine
// neue, noch nicht ausgezahlte Gutschrift, deren Dokument noch entsteht. Die
// Adminfelder stehen absichtlich in der Antwort — gezeigt werden dürfen sie nicht.
const GUTSCHRIFTEN = {
  creditNotes: [
    { id: 13, number: "GS-2026-0003", kind: "regular", title: "Gutschrift", periodMonth: "2026-09",
      issuedAt: "2026-10-06T08:00:00.000Z", issuedOn: "2026-10-06", netCents: 10000, taxCents: 1900, grossCents: 11900,
      taxRatePercent: "19.00", currency: "EUR", documentReady: false, payoutStatus: "open", paidOn: null,
      cancelled: false, cancelledByNumber: null, correctsNumber: null, replacesNumber: "GS-2026-0001",
      issuedByName: "Anna Admin", paidReference: "INTERN-REF-77" },
    { id: 12, number: "GS-2026-0002", kind: "cancellation", title: "Stornobeleg", periodMonth: "2026-09",
      issuedAt: "2026-10-05T08:00:00.000Z", issuedOn: "2026-10-05", netCents: -10000, taxCents: -1900, grossCents: -11900,
      taxRatePercent: "19.00", currency: "EUR", documentReady: true, payoutStatus: null, paidOn: null,
      cancelled: false, cancelledByNumber: null, correctsNumber: "GS-2026-0001", replacesNumber: null },
    { id: 11, number: "GS-2026-0001", kind: "regular", title: "Gutschrift", periodMonth: "2026-09",
      issuedAt: "2026-10-02T08:00:00.000Z", issuedOn: "2026-10-02", netCents: 10000, taxCents: 1900, grossCents: 11900,
      taxRatePercent: "19.00", currency: "EUR", documentReady: true, payoutStatus: "paid", paidOn: "2026-10-04",
      cancelled: true, cancelledByNumber: "GS-2026-0002", correctsNumber: null, replacesNumber: null },
  ],
  openSettlement: { readyNetCents: 4550, readyEntryCount: 3, carriedForward: false },
};

const DETAILS = {
  billingName: "Vertrieb Süd GmbH", street: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "DE",
  taxStatus: "with_vat", taxNumber: "12/345/67890", vatId: "DE123456789", accountHolder: "Vertrieb Süd GmbH",
  ibanMasked: IBAN_MASKE, bic: "COBADEFFXXX", submittedAt: "2026-10-07T09:00:00.000Z", reviewedAt: null, reviewNote: null,
};

let server, browser;

/** Backend-Mock. `billing` ist der Zustand von GET …/billing-details; `put`
 *  liefert je PUT [status, body] (der letzte Eintrag bleibt stehen). */
async function setup(page, {
  creditNotes = GUTSCHRIFTEN, billing = { status: "incomplete", billingDetails: null, accountEmail: PARTNER.email },
  put = [], agreement = null, pdf = {},
} = {}) {
  const state = { kunde: [], pdf: [], put: [], other: [], billingGets: 0 };
  const antworten = [...put];
  let stand = billing;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.includes("/kunde/") || p.endsWith("/kunde")) {
      state.kunde.push(p);
      return json({ error: "Nicht erlaubt", code: "ROLE_NOT_PERMITTED" }, 403);
    }
    if (p.endsWith("/kundenbereich")) {
      return json({ message: "OK", user: PARTNER, pendingEmailChange: null, companyLogo: null, billingCapabilities: null,
        salesPartner: { status: "active" } });
    }
    if (p.endsWith("/api/sales-partner/me/overview")) return json(OVERVIEW);
    if (p.endsWith("/api/sales-partner/me/team")) return json(TEAM_LEER);
    if (p.endsWith("/api/sales-partner/me/credit-notes")) return json(creditNotes);
    const pdfTreffer = p.match(/\/api\/sales-partner\/me\/credit-notes\/(\d+)\/pdf$/);
    if (pdfTreffer) {
      state.pdf.push({ id: pdfTreffer[1], authorization: req.headers().authorization || null, search: url.search });
      const fehler = pdf[pdfTreffer[1]];
      if (fehler) return json(fehler[1], fehler[0]);
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n% e2e\n" });
    }
    if (p.endsWith("/api/sales-partner/me/billing-details")) {
      if (req.method() === "PUT") {
        const body = req.postDataJSON();
        state.put.push(body);
        const [status, antwort] = antworten.length > 1 ? antworten.shift() : (antworten[0] || [200, null]);
        if (status === 200 && antwort) stand = { status: antwort.status, billingDetails: antwort.billingDetails, accountEmail: PARTNER.email };
        return json(antwort || {}, status);
      }
      state.billingGets += 1;
      return json(stand);
    }
    if (p.endsWith("/api/sales-partner/me/agreement")) {
      return json(agreement || { acceptedVersion: "1.0", acceptedAt: "2026-10-01T09:30:00.000Z",
        document: { version: "1.0", effectiveFrom: "2026-10-01", documentPath: "/api/legal/sales_partner_agreement/1.0" } });
    }
    state.other.push(p);
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-partner-token"));
  return state;
}

async function zumBereich(page, id) {
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator(`#spp-tab-${id}`).click();
  await page.locator(`#spp-tab-${id}[aria-selected="true"]`).waitFor();
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

test("1 — Gutschriften: Liste mit Auszahlung, Korrekturen, „Wird erstellt“ und offenem Saldo", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zumBereich(page, "credit-notes");
  // UX-Paket 6 (bewusste Ankeränderung): der Bereich heißt wie im Adminbereich.
  assert.equal(await page.locator("#spp-tab-credit-notes").innerText(), "Gutschriften");
  await page.locator("#spp-cn-table").waitFor({ state: "visible" });

  const zeilen = page.locator("#spp-cn-table tbody tr");
  assert.equal(await zeilen.count(), 3);
  const neu = await zeilen.nth(0).innerText();
  assert.match(neu, /September 2026/);
  assert.match(neu, /GS-2026-0003/);
  assert.match(neu, /06\.10\.2026/);
  assert.match(neu, /100,00\s€/);
  assert.match(neu, /19,00\s€/);
  assert.match(neu, /119,00\s€/);
  assert.match(neu, /19,00 %/);
  assert.match(neu, /Noch nicht ausgezahlt/);
  assert.match(neu, /Ersetzt GS-2026-0001/);
  assert.match(neu, /Wird erstellt/);
  assert.equal(await page.locator("#spp-cn-pdf-13").count(), 0, "kein Download, solange das Dokument entsteht");

  assert.match(neu, /Ausgestellt/, "Status der neuen Gutschrift");
  const storno = await zeilen.nth(1).innerText();
  assert.match(storno, /Storno zu GS-2026-0001/);
  assert.match(storno, /Storno/);
  const alt = await zeilen.nth(2).innerText();
  assert.match(alt, /Ausgezahlt am 04\.10\.2026/);
  assert.match(alt, /Storniert durch GS-2026-0002/);
  assert.match(alt, /Storniert/);
  // UX-Paket 6: sechs Spalten — Monat, Gutschrift, Betrag, Status, Auszahlung, PDF.
  assert.deepEqual((await page.locator("#spp-cn-table th").allInnerTexts()).map((t) => t.trim()),
    ["Monat", "Gutschrift", "Betrag", "Status", "Auszahlung", "PDF"]);

  // UX-Paket 6 (bewusste Ankeränderung): dieselben Geldbegriffe wie die Übersicht.
  assert.match(await page.locator("#spp-cn-settlement").innerText(),
    /^Noch nicht abgerechnet: auszahlbare Provisionen von 45,50\s€\. Sie werden mit der nächsten Gutschrift abgerechnet\.$/);
  assert.equal(await page.locator("#spp-cn-note").innerText(),
    "Auszahlbare Provisionen werden einmal im Monat mit einer Gutschrift abgerechnet. Voraussetzung sind bestätigte Abrechnungsdaten.");
  assert.doesNotMatch(await page.locator("#spp-tabpanel").innerText(), /abrechnungsreif/i);
  const alles = await page.locator("#spp-tabpanel").innerText();
  assert.doesNotMatch(alles, /Anna Admin|INTERN-REF-77/, "Adminangaben gehören nicht ins Partnerportal");
  assert.doesNotMatch(alles, /\bregular\b|\bcancellation\b|\bpaid\b|\bopen\b/, "kein Rohwert im sichtbaren Text");
  assert.deepEqual(state.kunde, [], `Kundenendpunkte aufgerufen: ${state.kunde.join(", ")}`);
  await page.close();
});

test("2 — PDF: authentifizierter Blob-Abruf auf den Partnerpfad; ein 404 als verständlicher Satz", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const state = await setup(page, { pdf: { 12: [404, { error: "Nicht gefunden", code: "CREDIT_NOTE_NOT_FOUND" }] } });
  await zumBereich(page, "credit-notes");
  await page.locator("#spp-cn-pdf-11").waitFor({ state: "visible" });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator("#spp-cn-pdf-11").click(),
  ]);
  assert.equal(download.suggestedFilename(), "gutschrift-GS-2026-0001.pdf");
  assert.equal(state.pdf.length, 1);
  assert.equal(state.pdf[0].id, "11");
  assert.equal(state.pdf[0].authorization, "Bearer e2e-partner-token", "das Token reist als Kopfzeile");
  assert.equal(state.pdf[0].search, "", "kein Token und kein Parameter in der Adresse");

  await page.locator("#spp-cn-pdf-12").click();
  await page.locator("#spp-cn-download-error").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-cn-download-error").innerText(), "Diese Gutschrift ist nicht verfügbar.");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-partner-token", "ein 404 meldet nicht ab");
  assert.deepEqual(state.kunde, []);
  await page.close();
});

test("3 — Vortrag des nicht positiven Saldos und Leerzustand", async () => {
  const page = await browser.newPage();
  await setup(page, { creditNotes: { creditNotes: [], openSettlement: { readyNetCents: -1200, readyEntryCount: 2, carriedForward: true } } });
  await zumBereich(page, "credit-notes");
  await page.locator("#spp-cn-empty").waitFor({ state: "visible" });
  assert.match(await page.locator("#spp-cn-empty").innerText(), /Noch keine Gutschriften\./);
  assert.equal(await page.locator("#spp-cn-settlement").innerText(),
    "Ihre noch nicht abgerechneten Provisionen ergeben derzeit keinen positiven Betrag. Er wird mit der nächsten Gutschrift verrechnet.");
  await page.close();
});

test("4 — Abrechnungsdaten: Pflichtprüfung, 400-Feldfehler am Feld, Einreichen, IBAN nur maskiert", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const state = await setup(page, {
    put: [
      [400, { error: "Die Postleitzahl ist ungültig.", code: "BILLING_DETAILS_INVALID", field: "postalCode" }],
      [200, { status: "submitted", billingDetails: { ...DETAILS, postalCode: "10117" }, changedFields: ["billingName", "iban"], unchanged: false }],
    ],
  });
  await zumBereich(page, "account");
  await page.locator("#spp-billing-start").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-billing-status-badge").innerText(), "Unvollständig");
  assert.match(await page.locator("#spp-billing-status").innerText(),
    /Bitte hinterlegen Sie Ihre Abrechnungsdaten\. Sie werden vor der ersten Gutschrift geprüft\./);

  await page.locator("#spp-billing-start").click();
  await page.locator("#spp-billing-form").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.activeElement?.id), "spp-billing-name", "der Fokus steht im ersten Feld");
  assert.match(await page.locator("#spp-billing-form").innerText(), /Änderungen gelten nur für künftige Gutschriften und werden vorher geprüft\./);

  await page.fill("#spp-billing-name", "Vertrieb Süd GmbH");
  await page.fill("#spp-billing-street", "Musterweg 1");
  await page.fill("#spp-billing-postal-code", "1O115");
  await page.fill("#spp-billing-city", "Berlin");
  await page.selectOption("#spp-billing-country", "DE");
  await page.locator("#spp-billing-tax-with_vat").check();
  await page.fill("#spp-billing-account-holder", "Vertrieb Süd GmbH");
  await page.fill("#spp-billing-iban", "DE89 3704 0044 0532 0130 00");

  // Ohne Steuernummer und USt-IdNr. geht nichts hinaus.
  await page.locator("#spp-billing-submit").click();
  await page.locator("#spp-billing-taxids-error").waitFor({ state: "visible" });
  assert.equal(state.put.length, 0, "die eigene Prüfung schickt keinen Request");
  assert.equal(await page.getAttribute("#spp-billing-tax-number", "aria-invalid"), "true");
  // Der Fokus springt nach dem nächsten Rendern auf das erste markierte Feld.
  await page.waitForFunction(() => document.activeElement?.id === "spp-billing-tax-number", null, { timeout: 5000 });

  await page.fill("#spp-billing-tax-number", "12/345/67890");
  await page.locator("#spp-billing-submit").click();
  // Der Server weist die Postleitzahl zurück — die Meldung steht am Feld, die Eingaben bleiben.
  await page.locator("#spp-billing-postal-code-err").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-billing-postal-code-err").innerText(), "Die Postleitzahl ist ungültig.");
  assert.equal(await page.getAttribute("#spp-billing-postal-code", "aria-invalid"), "true");
  assert.equal(await page.inputValue("#spp-billing-name"), "Vertrieb Süd GmbH");
  assert.equal(await page.inputValue("#spp-billing-iban"), "DE89 3704 0044 0532 0130 00");
  assert.deepEqual(state.put[0], {
    billingName: "Vertrieb Süd GmbH", street: "Musterweg 1", postalCode: "1O115", city: "Berlin", country: "DE",
    taxStatus: "with_vat", accountHolder: "Vertrieb Süd GmbH", taxNumber: "12/345/67890", iban: IBAN,
  });

  await page.fill("#spp-billing-postal-code", "10117");
  await page.locator("#spp-billing-submit").click();
  await page.locator("#spp-billing-message").waitFor({ state: "visible" });
  assert.equal(state.put.length, 2);
  assert.equal(state.put[1].postalCode, "10117");
  assert.match(await page.locator("#spp-billing-message").innerText(),
    /Ihre Abrechnungsdaten wurden zur Prüfung eingereicht\. Geändert: Name bzw\. Firma, IBAN\./);
  assert.equal(await page.locator("#spp-billing-status-badge").innerText(), "In Prüfung");
  assert.equal(await page.locator("#spp-billing-row-iban .profile-row-val").innerText(), IBAN_MASKE);
  assert.equal(await page.locator("#spp-billing-form").count(), 0);

  // Die vollständige IBAN steht nirgends — weder im Text noch in einem Feld.
  const text = await page.locator("body").innerText();
  assert.ok(!text.replace(/\s/g, "").includes(IBAN), "vollständige IBAN sichtbar");
  const felder = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value.replace(/\s/g, "")));
  assert.ok(!felder.includes(IBAN), "vollständige IBAN in einem Feld");
  assert.deepEqual(state.kunde, [], `Kundenendpunkte aufgerufen: ${state.kunde.join(", ")}`);
  await page.close();
});

test("5 — Bearbeiten mit hinterlegter IBAN: Feld leer, ohne Eingabe bleibt sie hinterlegt", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const state = await setup(page, {
    billing: { status: "confirmed", billingDetails: DETAILS, accountEmail: PARTNER.email },
    put: [[200, { status: "confirmed", billingDetails: DETAILS, changedFields: [], unchanged: true }]],
  });
  await zumBereich(page, "account");
  await page.locator("#spp-billing-edit").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-billing-status-badge").innerText(), "Bestätigt");
  assert.equal(await page.locator("#spp-billing-row-taxStatus .profile-row-val").innerText(), "Mit Umsatzsteuerausweis");

  await page.locator("#spp-billing-edit").click();
  await page.locator("#spp-billing-form").waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#spp-billing-iban"), "", "die IBAN wird nie vorbefüllt");
  assert.match(await page.locator("#spp-billing-iban-hint").innerText(),
    /Hinterlegt: DE89 \*{4} \*{4} \*{4} \*{2}30 00\. Leer lassen, um die hinterlegte IBAN zu behalten\./);
  assert.equal(await page.getAttribute("#spp-billing-iban", "aria-required"), null, "mit hinterlegter IBAN ist das Feld kein Pflichtfeld");
  assert.equal(await page.inputValue("#spp-billing-name"), "Vertrieb Süd GmbH");

  await page.locator("#spp-billing-submit").click();
  await page.locator("#spp-billing-message").waitFor({ state: "visible" });
  assert.equal(state.put.length, 1);
  assert.equal("iban" in state.put[0], false, "leer gelassen heißt: hinterlegte IBAN behalten");
  assert.equal(await page.locator("#spp-billing-message").innerText(), "Ihre Angaben sind unverändert. Es wurde nichts eingereicht.");
  // Der Fokus kehrt zum Auslöser zurück.
  await page.waitForFunction(() => document.activeElement?.id === "spp-billing-edit", null, { timeout: 5000 });
  await page.close();
});

test("6 — abgelehnt: Begründung bis zur erneuten Einreichung, unverändert erneut einreichbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const abgelehnt = { ...DETAILS, reviewedAt: "2026-10-07T10:00:00.000Z", reviewNote: "Die Steuernummer passt nicht zum Namen." };
  // Vertragsstand: nach einer Ablehnung ist unverändertes Absenden eine
  // ausdrückliche erneute Einreichung — der Server antwortet „submitted“, ohne
  // geänderte Felder, und die Begründung entfällt.
  const state = await setup(page, {
    billing: { status: "rejected", accountEmail: PARTNER.email, billingDetails: abgelehnt },
    put: [[200, { status: "submitted", unchanged: false, changedFields: [],
      billingDetails: { ...DETAILS, submittedAt: "2026-10-07T11:00:00.000Z", reviewedAt: null, reviewNote: null } }]],
  });
  await zumBereich(page, "account");
  await page.locator("#spp-billing-review-note").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-billing-status-badge").innerText(), "Abgelehnt");
  assert.equal(await page.locator("#spp-billing-review-note").innerText(), "Begründung: Die Steuernummer passt nicht zum Namen.");
  assert.match(await page.locator("#spp-billing-status").innerText(),
    /Bitte prüfen Sie Ihre Angaben und reichen Sie sie über „Bearbeiten“ erneut zur Prüfung ein\./);

  // Im Formular bleibt die Begründung sichtbar; das Absenden heißt „Erneut zur Prüfung einreichen“.
  await page.locator("#spp-billing-edit").click();
  await page.locator("#spp-billing-form").waitFor({ state: "visible" });
  assert.match(await page.locator("#spp-billing-form-review").innerText(), /Begründung: Die Steuernummer passt nicht zum Namen\./);
  assert.equal(await page.locator("#spp-billing-submit").innerText(), "Erneut zur Prüfung einreichen");
  assert.equal(await page.locator("#spp-billing-submit").isDisabled(), false, "ohne Änderung absendbar");

  // Unverändert absenden: genau die hinterlegten Angaben, die IBAN bleibt hinterlegt.
  await page.locator("#spp-billing-submit").click();
  await page.locator("#spp-billing-message").waitFor({ state: "visible" });
  assert.equal(state.put.length, 1);
  assert.deepEqual(state.put[0], {
    billingName: "Vertrieb Süd GmbH", street: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "DE",
    taxStatus: "with_vat", accountHolder: "Vertrieb Süd GmbH", taxNumber: "12/345/67890", vatId: "DE123456789",
    bic: "COBADEFFXXX",
  });
  assert.equal(await page.locator("#spp-billing-message").innerText(), "Ihre Abrechnungsdaten wurden zur Prüfung eingereicht.");
  assert.equal(await page.locator("#spp-billing-status-badge").innerText(), "In Prüfung");
  assert.equal(await page.locator("#spp-billing-review-note").count(), 0, "die Begründung entfällt mit der erneuten Einreichung");
  await page.close();
});

test("7 — Vertrag: akzeptierte Fassung, Zeitpunkt und Dokument; ohne Dokument der Hinweis", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const state = await setup(page);
  await zumBereich(page, "account");
  await page.locator("#spp-agreement-document").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-agreement-agreement .profile-row-val").innerText(), "Vertriebspartnervereinbarung");
  assert.equal(await page.locator("#spp-agreement-version .profile-row-val").innerText(), "Fassung 1.0");
  assert.match(await page.locator("#spp-agreement-acceptedAt .profile-row-val").innerText(), /^01\.10\.2026, \d{2}:\d{2}$/);
  const link = page.locator("#spp-agreement-document");
  assert.equal(await link.getAttribute("href"), `${API_HOST}/api/legal/sales_partner_agreement/1.0`);
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
  assert.deepEqual(state.kunde, []);
  await page.close();

  const ohne = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await setup(ohne, { agreement: { acceptedVersion: "1.0", acceptedAt: "2026-10-01T09:30:00.000Z", document: null } });
  await zumBereich(ohne, "account");
  await ohne.locator("#spp-agreement-no-document").waitFor({ state: "visible" });
  assert.equal(await ohne.locator("#spp-agreement-no-document").innerText(),
    "Für diese Fassung ist kein registriertes Dokument hinterlegt.");
  assert.equal(await ohne.locator("#spp-agreement-document").count(), 0);
  await ohne.close();
});

test("8 — Pre-Live: Testgutschriften im Portal als TESTDOKUMENT mit Testauszahlung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { creditNotes: { creditNotes: [
    { id: 31, number: "CE-TEST-PG26-0002", kind: "regular", title: "Gutschrift", periodMonth: "2026-09",
      issuedAt: "2026-10-06T08:00:00.000Z", issuedOn: "2026-10-06", netCents: 1000, taxCents: 0, grossCents: 1000,
      currency: "EUR", documentReady: true, payoutStatus: "open", paidOn: null, cancelled: false, isTest: true },
    { id: 30, number: "CE-TEST-PG26-0001", kind: "regular", title: "Gutschrift", periodMonth: "2026-08",
      issuedAt: "2026-09-02T08:00:00.000Z", issuedOn: "2026-09-02", netCents: 500, taxCents: 0, grossCents: 500,
      currency: "EUR", documentReady: true, payoutStatus: "paid", paidOn: "2026-09-10", cancelled: false, isTest: true },
  ], openSettlement: null } });
  await zumBereich(page, "credit-notes");
  await page.locator("#spp-cn-table").waitFor({ state: "visible" });
  const neu = await page.locator('#spp-cn-table tr[data-credit-note="31"]').innerText();
  assert.match(neu, /TESTDOKUMENT – nicht steuerlich gültig/);
  assert.match(neu, /Test – nicht ausgezahlt/);
  const alt = await page.locator('#spp-cn-table tr[data-credit-note="30"]').innerText();
  assert.match(alt, /Test – ausgezahlt/);
  assert.doesNotMatch(alt, /Ausgezahlt am/);
  // Auch die Kartenansicht (schmale Breite) trägt die Kennzeichnung.
  await page.setViewportSize({ width: 390, height: 900 });
  assert.match(await page.locator(".ce-list-cards").innerText(), /TESTDOKUMENT – nicht steuerlich gültig[\s\S]*Test – nicht ausgezahlt/);
  assert.deepEqual(state.kunde, []);
  await page.close();
});

test("9 — Pre-Live: Vertrag eines Testkontos ohne rechtsverbindliche Vereinbarung", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const state = await setup(page, { agreement: { acceptedVersion: null, acceptedAt: null, document: null, preliveTest: true } });
  await zumBereich(page, "account");
  await page.locator("#spp-agreement-prelive").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-agreement-prelive").innerText(),
    "Pre-Live-Testkonto – keine rechtsverbindliche Partnervereinbarung hinterlegt.");
  assert.equal(await page.locator("#spp-agreement-no-document").count(), 0, "statt des Hinweises „kein Dokument“");
  assert.equal(await page.locator("#spp-agreement-document").count(), 0);
  assert.equal(await page.locator("#spp-agreement-version .profile-row-val").innerText(), "Nicht hinterlegt");
  assert.deepEqual(state.kunde, []);
  await page.close();
});

test("10 — Gutschriften → Abrechnungsdaten im Konto; 390 px als Karten mit allen Steuerangaben (UX-Paket 6)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zumBereich(page, "credit-notes");
  await page.locator("#spp-cn-billing-link").waitFor({ state: "visible" });
  await page.locator("#spp-cn-billing-link").click();
  await page.waitForURL(`${BASE}/partner?page=account`);
  await page.locator('#spp-tab-account[aria-selected="true"]').waitFor();
  await page.locator("#spp-billing-status").waitFor({ state: "visible" });
  // Die Abrechnungsdaten stehen im Konto zuerst.
  const erste = await page.locator("#spp-account > section").first().locator(".table-card-title").first().innerText();
  assert.equal(erste.trim(), "Abrechnungsdaten");
  assert.ok(state.billingGets >= 1, "die Abrechnungsdaten wurden nicht geladen");

  // 390 px: Karten statt Tabelle, kein seitliches Scrollen, alle Steuerangaben je Beleg.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator("#spp-tab-credit-notes").click();
  await page.locator(".ce-list-cards li").first().waitFor({ state: "visible" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, "die Seite scrollt seitlich");
  const karte = await page.locator(".ce-list-cards li").first().innerText();
  for (const t of ["GS-2026-0003", "ausgestellt am 06.10.2026", "September 2026", "100,00", "19,00", "19,00 %", "119,00",
    "Ausgestellt", "Ersetzt GS-2026-0001", "Noch nicht ausgezahlt", "Wird erstellt"]) {
    assert.ok(karte.includes(t), `Karte ohne „${t}“: ${karte}`);
  }
  assert.deepEqual(state.kunde, []);
  await page.close();
});
