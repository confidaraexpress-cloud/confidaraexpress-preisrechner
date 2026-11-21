// Rechnungseditor DIN A4 (Betreiberauftrag 2026-11-21, Variante A): Bereichskarte → Klickflächen, Abbildung auf die
// Abschnitte, „nur die jüngste Vorschau zählt", Vorschau- und Fehlerzustände, Bezug (Sendung/Lagerauftrag), Prüfansicht
// sowie die Verträge des Blatts (pdf.js nur dynamisch, Worker als Datei vom eigenen Ursprung, ohne eval).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PAGE_PT, PREVIEW_DELAY_MS, EDITOR_TEXT, regionTarget, regionKeyForField, regionStyle, sheetRegions, flatRegions,
  createLatestGate, base64ToBytes, isPdfBytes, fieldLabelOf, problemItems, previewProblem, clientProblem, previewStatus,
  sourceOptionView, sourceSummary, reviewFacts, reviewIssueState, invoiceLine, formatDateDe,
} from "./manualInvoiceEditor.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("1 — Bereich des Blatts → Abschnitt und Feld; Feld → Bereich", () => {
  assert.deepEqual(regionTarget("position:0"), { key: "position:0", section: "position:0", label: "Position 1", focusId: "mi-pos-0-description", position: 0 });
  assert.equal(regionTarget("position:49").label, "Position 50");
  for (const [key, focusId] of [["recipient", "mi-recipient-company"], ["meta", "mi-service-from"], ["reference", "mi-reference"],
    ["intro", "mi-intro"], ["totals", "mi-totals-box"], ["payment", "mi-term"], ["closing", "mi-closing"], ["issuer", "mi-issuer-note"]]) {
    assert.equal(regionTarget(key).focusId, focusId, key);
  }
  for (const fremd of ["page", "addPosition", "position:x", "position:1234", "", null, "__proto__", "constructor"]) {
    assert.equal(regionTarget(fremd), null, String(fremd));
  }
  for (const [id, key] of [["mi-pos-3-price", "position:3"], ["mi-recipient-zip", "recipient"], ["mi-customer-search", "recipient"],
    ["mi-kind-external", "recipient"], ["mi-reference", "reference"], ["mi-service-to", "meta"], ["mi-intro", "intro"],
    ["mi-closing", "closing"], ["mi-term", "payment"], ["mi-payment-note", "payment"], ["mi-source-search", null], ["", null]]) {
    assert.equal(regionKeyForField(id), key, id);
  }
});

test("2 — Klickflächen in Prozent der Seite; Karte des Servers geprüft übernommen", () => {
  assert.deepEqual(PAGE_PT, { width: 595.28, height: 841.89 });
  assert.deepEqual(regionStyle({ x: 297.64, top: 420.945, w: 297.64, h: 84.189 }), { left: "50%", top: "50%", width: "50%", height: "10%" });
  const karte = sheetRegions([
    { key: "page", page: 1, x: 0, top: 0, w: 595.28, h: 841.89 },
    { key: "issuer", page: 1, x: 70, top: 30, w: 200, h: 40 },
    { key: "issuer", page: 1, x: 70, top: 780, w: 455, h: 40 },     // zweite Ausstellerfläche: entfällt
    { key: "recipient", page: 1, x: 70, top: 130, w: 240, h: 120, lines: 4 },
    { key: "position:0", page: 1, x: 70, top: 400, w: 455, h: 18 },
    { key: "position:1", page: 2, x: 70, top: 60, w: 455, h: 18 },
    { key: "addPosition", page: 2, x: 70, top: 80, w: 455, h: 0 },
    { key: "totals", page: 2, x: 330, top: 100, w: 195, h: 60 },
    { key: "unbekannt", page: 1, x: 1, top: 1, w: 10, h: 10 },
    { key: "meta", page: 3, x: 1, top: 1, w: 10, h: 10 },            // Seite außerhalb des Dokuments
    { key: "intro", page: 1, x: 70, top: 300, w: Number.NaN, h: 10 },
    { key: "closing", page: 1, x: 70, top: 300, w: 0.5, h: 10 },     // ohne Fläche
    null, "kaputt",
  ], 2);
  assert.deepEqual(karte.pages.map((s) => s.map((r) => r.key)), [["issuer", "recipient", "position:0"], ["position:1", "totals"]]);
  assert.deepEqual(karte.addAnchor.page, 2);
  assert.deepEqual([karte.addAnchor.style.left, karte.addAnchor.style.width, karte.addAnchor.style.height], [regionStyle({ x: 70, top: 0, w: 0, h: 0 }).left, "0%", "0%"]);
  const ids = flatRegions(karte).map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "jede Fläche hat eine eigene Kennung");
  assert.deepEqual(flatRegions(karte).map((r) => r.target.label), ["Zentrale Firmendaten", "Empfänger", "Position 1", "Position 2", "Summen"]);
  assert.deepEqual(sheetRegions(undefined, 1), { pages: [[]], addAnchor: null });
  assert.deepEqual(sheetRegions([{ key: "recipient", page: 1, x: 1, top: 1, w: 9, h: 9 }], 0), { pages: [], addAnchor: null });
});

test("3 — nur die jüngste Vorschauantwort zählt; PDF-Bytes werden geprüft", () => {
  const gate = createLatestGate();
  const a = gate.next();
  const b = gate.next();
  assert.equal(gate.isLatest(a), false, "eine ältere Antwort wird verworfen");
  assert.equal(gate.isLatest(b), true);
  assert.equal(gate.current(), b);
  const pdf = base64ToBytes(Buffer.from("%PDF-1.7\n%âãÏÓ\n").toString("base64"));
  assert.equal(isPdfBytes(pdf), true);
  assert.equal(isPdfBytes(base64ToBytes(Buffer.from("<html>kein pdf</html>").toString("base64"))), false);
  assert.equal(isPdfBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46])), false, "zu kurz");
  assert.equal(isPdfBytes("%PDF-1.7 als Text"), false);
  assert.ok(PREVIEW_DELAY_MS >= 300 && PREVIEW_DELAY_MS <= 1000, "Eingabepause zwischen 0,3 und 1 s");
});

test("4 — Fehler der Vorschau: Feldnamen in Klartext, nie ein Serverrohtext; Status mit Wort", () => {
  assert.equal(fieldLabelOf("positions.2.unitPrice"), "Position 3 · Einzelpreis");
  assert.equal(fieldLabelOf("recipient.zip"), "Empfänger · PLZ");
  assert.equal(fieldLabelOf("recipient.country"), "Empfänger · Land");
  assert.equal(fieldLabelOf("billingKind"), "Art der Rechnung");
  const items = problemItems([
    { field: "positions[0].unitPriceNetCents", message: "Einzelpreis ungültig." },
    { field: "positions[0].unitPriceNetCents", message: "doppelt" },
    { field: "recipient.zip", message: "PLZ ungültig." },
  ]);
  assert.deepEqual(items.map((i) => i.text), ["Position 1 · Einzelpreis: Einzelpreis ungültig.", "Empfänger · PLZ: PLZ ungültig."]);
  assert.deepEqual(clientProblem({ "positions.0.quantity": "Bitte eine Menge angeben." }).items.map((i) => i.text),
    ["Position 1 · Menge: Bitte eine Menge angeben."]);

  assert.equal(previewProblem(401, {}).kind, "auth");
  assert.equal(previewProblem(403, {}).kind, "auth");
  const ungueltig = previewProblem(400, { error: "x", errors: [{ field: "recipient.zip", message: "PLZ ungültig." }] });
  assert.deepEqual([ungueltig.kind, ungueltig.items.length], ["invalid", 1]);
  assert.equal(previewProblem(409, { code: "MANUAL_INVOICE_POSITIONS_MISSING", error: "Mindestens eine Position." }).kind, "invalid");
  assert.equal(previewProblem(409, { code: "VAT_RATE_INVALID", error: "Steuersatz falsch konfiguriert." }).kind, "failed");
  assert.match(previewProblem(429, {}).text, /Zu viele Vorschauen/);
  const intern = previewProblem(500, { error: "TypeError: cannot read properties of undefined (stack …)" });
  assert.equal(intern.kind, "failed");
  assert.doesNotMatch(intern.text, /TypeError|stack/, "ein Serverrohtext erscheint nie");

  assert.deepEqual(previewStatus({ pending: true }), { tone: "pending", text: EDITOR_TEXT.statusPending });
  assert.equal(previewStatus({ problem: { kind: "invalid" }, hasSheet: true }).text, EDITOR_TEXT.statusInvalid);
  assert.equal(previewStatus({ problem: { kind: "invalid" }, hasSheet: false }).text, EDITOR_TEXT.statusIdle);
  assert.equal(previewStatus({ problem: { kind: "failed" }, hasSheet: true }).tone, "failed");
  assert.equal(previewStatus({ hasSheet: true }).tone, "fresh");
  assert.equal(previewStatus().tone, "idle");
});

test("5 — Bezug: Zulässigkeit und Gründe unverändert vom Server, Wiederherstellung nur als Weg zur Rechnung", () => {
  const view = sourceOptionView({
    kind: "shipment", id: 77, number: "CE-2026-000077", status: "delivered", date: "2026-11-02T10:00:00Z",
    billing: {
      invoices: [{ number: "CE-RE26-00012", kind: "automatic" }, { number: "CE-RE26-00013", kind: "manual_supplementary", cancelled: true }],
      primary: { allowed: false, blockers: [{ code: "SOURCE_ALREADY_BILLED", message: "Zu diesem Vorgang besteht bereits eine Rechnung." }] },
      supplementary: { allowed: true, blockers: [] },
      restoreDocument: { invoiceId: 12, invoiceNumber: "CE-RE26-00012" },
      supplementaryTo: "CE-RE26-00012",
    },
  });
  assert.deepEqual([view.id, view.kind, view.number, view.date], [77, "shipment", "CE-2026-000077", "02.11.2026"]);
  assert.deepEqual(view.invoices, ["CE-RE26-00012 (Einzelrechnung)", "CE-RE26-00013 (Nachberechnung, storniert)"]);
  assert.deepEqual(view.kinds.map((k) => [k.kind, k.allowed, k.reasons]), [
    ["primary", false, ["Zu diesem Vorgang besteht bereits eine Rechnung."]],
    ["supplementary", true, []],
  ]);
  assert.deepEqual(view.restore, { invoiceId: 12, invoiceNumber: "CE-RE26-00012" });
  // Unbekanntes bleibt gesperrt (fail closed): ohne ausdrückliches allowed:true keine Rechnungsart.
  const leer = sourceOptionView({ kind: "order", id: 5 });
  assert.deepEqual([leer.kind, leer.number, leer.kinds.every((k) => k.allowed === false), leer.restore], ["order", "Lagerauftrag 5", true, null]);
  assert.equal(sourceOptionView({ id: 1, billing: { primary: { allowed: "true" } } }).kinds[0].allowed, false);
  assert.equal(sourceOptionView({ id: 1, billing: { primary: { allowed: false, blockers: [{}] } } }).kinds[0].reasons[0], "Für diesen Vorgang nicht zulässig.");
  assert.equal(invoiceLine({ number: "CE-T-1", kind: "manual_primary", test: true }), "CE-T-1 (manuelle Erstrechnung, Testbeleg)");
  assert.equal(formatDateDe("kein Datum"), "");
  assert.equal(sourceSummary({ kind: "order", number: "LA-9", billingKind: "primary" }), "Lagerauftrag LA-9 · Erstrechnung");
  assert.equal(sourceSummary(null), "");
});

test("6 — Prüfansicht: Kurzfakten aus Serverwerten, Ausstellen nur mit Fingerabdruck, ohne Sperre und bestätigt", () => {
  const fp = "a".repeat(64);
  const review = { fingerprint: fp, revision: 4, pageCount: 2, issueBlockers: [],
    totals: { netCents: 10000, vatCents: 1900, grossCents: 11900, vatRatePercent: "19" },
    source: { kind: "shipment", number: "CE-77", billingKind: "supplementary" } };
  const fakten = reviewFacts(review, { company: "Elbufer Handel OHG", zip: "22763", city: "Hamburg" });
  assert.deepEqual(fakten.map((f) => f.label), ["Empfänger", "Netto", "Umsatzsteuer 19 %", "Rechnungsbetrag", "Seiten", "Bezug"]);
  assert.equal(fakten[0].value, "Elbufer Handel OHG, 22763 Hamburg");
  assert.equal(fakten.find((f) => f.label === "Rechnungsbetrag").strong, true);
  assert.deepEqual(fakten.filter((f) => f.wide).map((f) => f.label), ["Empfänger", "Bezug"], "Textangaben über die ganze Breite");
  assert.equal(fakten.find((f) => f.label === "Bezug").value, "Sendung CE-77 · Nachberechnung");

  assert.deepEqual(reviewIssueState(review, { checked: false }), { allowed: false, blocked: false });
  assert.deepEqual(reviewIssueState(review, { checked: true }), { allowed: true, blocked: false });
  assert.deepEqual(reviewIssueState({ ...review, issueBlockers: [{ code: "ISSUER_LEGAL_FORM_UNCONFIRMED" }] }, { checked: true }), { allowed: false, blocked: true });
  for (const kaputt of [null, {}, { ...review, fingerprint: "" }, { ...review, fingerprint: "A".repeat(64) }, { ...review, fingerprint: fp.slice(1) }]) {
    assert.equal(reviewIssueState(kaputt, { checked: true }).allowed, false);
  }
});

test("7 — Blatt: pdf.js nur dynamisch, Worker vom eigenen Ursprung, ohne eval; im Build als .js", () => {
  const blatt = ohneKommentare(lies("../components/admin/pdfBlatt.js"));
  assert.match(blatt, /import workerUrl from "pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url";/);
  assert.match(blatt, /import\("pdfjs-dist"\)/);
  assert.doesNotMatch(blatt, /^import [^\n]* from "pdfjs-dist";/m, "pdf.js gehört nicht ins Hauptbündel");
  assert.match(blatt, /getDocument\(\{ data: bytes, worker: gemeinsamerWerker\(pdfjs\), stopAtErrors: true, enableXfa: false \}\)/);
  assert.match(blatt, /finally \{\s*aufgabe\.destroy\(\);\s*\}/, "jede Ladeaufgabe wird wieder freigegeben");
  // CSP script-src 'self' ohne 'unsafe-eval': die ausgelieferten Dateien von pdf.js kommen ohne eval und new Function aus.
  for (const datei of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
    const code = lies(`../../node_modules/pdfjs-dist/build/${datei}`);
    assert.doesNotMatch(code, /\bnew Function\s*\(/, `${datei}: new Function`);
    assert.doesNotMatch(code, /(^|[^\w$.])eval\s*\(/, `${datei}: eval`);
  }
  // nginx (alpine) kennt .mjs nicht — der Worker wird im Build als .js ausgeliefert, sonst verweigert der Browser ihn.
  const vite = lies("../../vite.config.js");
  assert.match(vite, /name\.endsWith\("\.mjs"\) \? "assets\/\[name\]-\[hash\]\.js" : "assets\/\[name\]-\[hash\]\[extname\]"/);
  assert.match(lies("../../nginx.conf"), /worker-src 'self' blob:/);
});

test("8 — Blatt bedienbar: Bereiche als Knöpfe mit Namen, ein Tabstopp, Pfeiltasten; Prüfansicht als Dialog", () => {
  const blatt = ohneKommentare(lies("../components/admin/InvoiceSheet.jsx"));
  assert.match(blatt, /<button\s+key=\{r\.id\}\s+type="button"/);
  assert.match(blatt, /aria-label=\{r\.key === "issuer" \? `\$\{r\.target\.label\} — nicht im Editor änderbar` : `\$\{r\.target\.label\} bearbeiten`\}/);
  assert.match(blatt, /tabIndex=\{i === fokus \? 0 : -1\}/);
  for (const taste of ["ArrowDown", "ArrowUp", "Home", "End"]) assert.ok(blatt.includes(`"${taste}"`), taste);
  assert.match(blatt, /role=\{interactive \? "group" : undefined\}/);
  assert.match(blatt, /className="adm-mi-raster" role="img" aria-label=\{label\}/);
  // Blatt und Flächen wechseln gemeinsam, erst wenn alle Seiten gezeichnet sind.
  assert.match(blatt, /setGezeigt\(\{ canvases, karte: sheetRegions\(sheet\.regions, canvases\.length\), page: sheet\.page \}\)/);
  const pruef = ohneKommentare(lies("../components/admin/ManualInvoiceReview.jsx"));
  assert.match(pruef, /className="adm-modal ce-dialog--xl adm-mi-review" role="dialog" aria-modal="true"/);
  assert.match(pruef, /id="mi-issue-confirm"/);
  assert.match(pruef, /<InvoiceSheet sheet=\{daten\.sheet\} idPrefix="mi-review-sheet"/);
  assert.doesNotMatch(pruef, /interactive/, "die Prüfansicht zeigt das Blatt ohne Klickflächen");
});
