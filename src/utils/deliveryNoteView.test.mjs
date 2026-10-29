// Anzeigemodell der Lieferscheinverwaltung — Kundensprache, Aktionen, Verlauf, Fehler, Vorprüfung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  effectiveView, rowActions, historyEntries, deliveryNoteErrorText, checkPdfFile, areaFieldErrors,
  templateModeText, templateStateText, formatBytes, recipientText, SOURCE_FILTER_OPTIONS, UPLOAD_LIMITS, TEMPLATE_LIMITS,
} from "./deliveryNoteView.mjs";

test("1 — Herkunft in Kundensprache: ConfidaraExpress, eigener (hochgeladen / aus Vorlage), keiner", () => {
  assert.deepEqual(effectiveView({ source: "confidara", origin: "confidara", number: "CE-LS26-00042" }),
    { kind: "confidara", label: "ConfidaraExpress", origin: null, number: "CE-LS26-00042" });
  assert.deepEqual(effectiveView({ source: "own", origin: "upload", number: "LS-4711", version: 2 }),
    { kind: "upload", label: "Eigener Lieferschein", origin: "PDF hochgeladen", number: "LS-4711" });
  assert.deepEqual(effectiveView({ source: "own", origin: "template", number: null }),
    { kind: "template", label: "Eigener Lieferschein", origin: "Aus eigener Vorlage", number: null });
  assert.equal(effectiveView(null).label, "Kein Lieferschein");
  assert.equal(effectiveView({ source: "unbekannt" }).kind, "none", "ein unbekannter Wert wird nie als Dokument gezeigt");
});

test("2 — Zeilenaktionen folgen allein den Serverfeldern", () => {
  const ohne = rowActions({ effective: null, actions: { canUpload: true, canCreateConfidara: true, canCreateFromTemplate: false } });
  assert.deepEqual(ohne.map((a) => a.id), ["upload", "confidara", "history"]);
  assert.equal(ohne[0].label, "Eigenen Lieferschein hochladen");
  const eigen = rowActions({ effective: { source: "own", origin: "upload" }, actions: { canUpload: true, canCreateFromTemplate: true } });
  assert.deepEqual(eigen.map((a) => a.id), ["view", "download", "upload", "fromTemplate", "history"]);
  assert.equal(eigen[2].label, "Eigenen Lieferschein ersetzen");
  const voll = rowActions({ effective: { source: "confidara" }, actions: { canUpload: false } });
  assert.deepEqual(voll.map((a) => a.id), ["view", "download", "history"], "ohne Erlaubnis kein Upload");
});

test("3 — Verlauf: neueste zuerst, Status aus dem Server, Zurückziehen nur für aktive eigene Fassungen", () => {
  const e = historyEntries({
    confidara: { number: "CE-LS26-00042", issuedAt: "2026-10-29T08:00:00Z", createdVia: "booking", effective: false },
    versions: [
      { version: 2, origin: "template", number: "CE-LS26-00042", createdAt: "2026-10-29T10:00:00Z", createdVia: "customer", withdrawnAt: null, available: true, effective: true },
      { version: 1, origin: "upload", number: "LS-1", createdAt: "2026-10-29T09:00:00Z", createdVia: "customer", withdrawnAt: "2026-10-29T09:30:00Z", available: true, effective: false },
    ],
  });
  assert.deepEqual(e.map((x) => [x.key, x.statusText.split(" am ")[0], x.canWithdraw]),
    [["v2", "Gilt", true], ["v1", "Zurückgezogen", false], ["confidara", "Ersetzt", false]]);
  assert.equal(e[0].origin, "Aus eigener Vorlage");
  assert.equal(e[2].how, "Bei der Buchung erstellt");
  const nachtraeglich = historyEntries({ confidara: { number: "CE-LS26-1", issuedAt: "2026-10-29T08:00:00Z", createdVia: "customer", effective: true }, versions: [] });
  assert.deepEqual([nachtraeglich[0].how, nachtraeglich[0].statusText], ["Nachträglich erstellt", "Gilt"]);
  const geloescht = historyEntries({ versions: [{ version: 1, origin: "upload", createdAt: "2026-10-29T09:00:00Z", available: false }] });
  assert.deepEqual([geloescht[0].statusText, geloescht[0].canDownload, geloescht[0].canWithdraw], ["Nicht mehr verfügbar", false, false]);
});

test("4 — Fehlercodes werden Kundentexte, kein Code und keine Technik im Text", () => {
  for (const code of ["PDF_ACTIVE_CONTENT", "PDF_ENCRYPTED", "PDF_TEMPLATE_NOT_A4", "DELIVERY_NOTE_NO_ITEMS", "DELIVERY_NOTE_VERSION_LIMIT"]) {
    const t = deliveryNoteErrorText({ code, error: "irrelevant" });
    assert.ok(!/[A-Z]{3,}_[A-Z]/.test(t), `${code}: Code im Text`);
    assert.ok(!/pdf-lib|zlib|stream|500|SQL/i.test(t), `${code}: Technik im Text`);
  }
  assert.match(deliveryNoteErrorText({ code: "DELIVERY_NOTE_NO_ITEMS" }), /eigenen Lieferschein als PDF hoch/);
  assert.equal(deliveryNoteErrorText({ code: "PDF_FILE_TOO_LARGE", error: "Die Datei ist zu groß (höchstens 5 MB)." }), "Die Datei ist zu groß (höchstens 5 MB).");
  assert.equal(deliveryNoteErrorText({ code: "DEMO_NOT_AVAILABLE", error: "In der Demo nicht verfügbar." }), "In der Demo nicht verfügbar.");
  assert.equal(deliveryNoteErrorText({ error: "Fehler" }, "Rückfall"), "Rückfall", "ein Wort ist keine Meldung");
  assert.equal(deliveryNoteErrorText(null, "Rückfall"), "Rückfall");
});

test("5 — Vorprüfung im Browser: Typ, Endung, leer, Größe", () => {
  const datei = (name, type, size) => ({ name, type, size });
  assert.equal(checkPdfFile(datei("ls.pdf", "application/pdf", 1000)), null);
  assert.equal(checkPdfFile(datei("ls.PDF", "", 1000)), null, "manche Systeme melden keinen Typ");
  assert.match(checkPdfFile(datei("ls.html", "text/html", 10)), /PDF-Datei/);
  assert.match(checkPdfFile(datei("ls.pdf", "text/html", 10)), /PDF-Datei/);
  assert.match(checkPdfFile(datei("ls.pdf", "application/pdf", 0)), /leer/);
  assert.equal(checkPdfFile(datei("ls.pdf", "application/pdf", UPLOAD_LIMITS.maxBytes + 1)), "Die Datei ist zu groß (höchstens 5 MB).");
  assert.equal(checkPdfFile(datei("b.pdf", "application/pdf", TEMPLATE_LIMITS.maxBytes + 1), { maxBytes: TEMPLATE_LIMITS.maxBytes }), "Die Datei ist zu groß (höchstens 3 MB).");
  assert.match(checkPdfFile(null), /genau eine PDF-Datei/);
});

test("6 — Abstände wie der Server: ganze Millimeter innerhalb der Grenzen", () => {
  assert.deepEqual(areaFieldErrors({ topFirstMm: 45, topNextMm: "30", bottomMm: 25 }), {});
  const e = areaFieldErrors({ topFirstMm: 14, topNextMm: "141", bottomMm: "2,5" });
  assert.deepEqual(Object.keys(e).sort(), ["bottomMm", "topFirstMm", "topNextMm"]);
  assert.equal(e.bottomMm, "Bitte 10 bis 80 mm angeben.");
});

test("7 — Vorlage: Moduserklärung ohne Technik, Zustandstext", () => {
  assert.match(templateModeText("confidara"), /automatisch auf diesem Briefpapier/);
  assert.match(templateModeText("external"), /„Eigenes Lieferscheinsystem“/);
  assert.match(templateModeText("none"), /„Keine Lieferscheine“/);
  for (const m of ["confidara", "external", "none"]) assert.ok(!/delivery_note|confidara\b|external\b/.test(templateModeText(m)));
  assert.equal(templateStateText({ draft: {}, active: null }), "Entwurf, noch nicht verwendet");
  assert.equal(templateStateText({ draft: null, active: {} }), "Aktiv");
  assert.equal(templateStateText({}), "Keine Vorlage eingerichtet");
});

test("8 — Hilfen: Dateigröße, Empfänger, Filteroptionen", () => {
  assert.equal(formatBytes(850 * 1024), "850 KB");
  assert.equal(formatBytes(1.25 * 1024 * 1024), "1,3 MB");
  assert.deepEqual(recipientText({ company: "Beispiel AG", fullName: "Erika", city: "Köln" }), { name: "Beispiel AG", place: "Köln" });
  assert.deepEqual(recipientText(null), { name: "—", place: null });
  assert.deepEqual(SOURCE_FILTER_OPTIONS.map((o) => o.value), ["", "own", "confidara", "none"]);
});

test("9 — API-Schicht: alle Lieferscheinpfade nur in src/api/deliveryNotesApi.js, mit Token", () => {
  const api = readFileSync(new URL("../api/deliveryNotesApi.js", import.meta.url), "utf8");
  for (const pfad of ["/api/kunde/delivery-notes", "/delivery-notes/uploads", "/delivery-notes/from-template", "/delivery-notes/confidara",
    "/withdraw", "/api/kunde/delivery-note-template"]) assert.ok(api.includes(pfad), `${pfad} fehlt`);
  const aufrufe = [...api.matchAll(/apiFetch\(([^;]+);/g)];
  assert.ok(aufrufe.length >= 12);
  for (const a of aufrufe) assert.ok(/auth: true/.test(a[1]), `ohne Token: ${a[1].slice(0, 60)}`);
});

test("10 — der maßgebliche Lieferschein an den bestehenden Stellen: Dokumentliste, Download-Name, Hinweis zur bereinigten Fassung", async () => {
  const { documentLabel } = await import("./shipmentDocumentsView.mjs");
  assert.equal(documentLabel({ type: "DELIVERY_NOTE", label: "Lieferschein", source: "own", origin: "upload" }), "Eigener Lieferschein");
  assert.equal(documentLabel({ type: "DELIVERY_NOTE", label: "Lieferschein", source: "confidara", origin: "confidara" }), "Lieferschein");
  assert.equal(documentLabel({ type: "LABEL", label: "Versandlabel", source: "own" }), "Versandlabel", "nur der Lieferschein kennt source");
  const download = readFileSync(new URL("./downloadDeliveryNote.js", import.meta.url), "utf8");
  assert.match(download, /filenameFromContentDisposition\(r\.headers\.get\("content-disposition"\), rueckfall\)/,
    "der Dateiname kommt bevorzugt vom Server — eine eigene Fassung kann ohne Nummer sein");
  const { DELIVERY_NOTE_TEXT } = await import("./deliveryNoteView.mjs");
  assert.match(DELIVERY_NOTE_TEXT.uploadCleanHint, /bereinigte Fassung/);
  const dialog = readFileSync(new URL("../components/inventory/DeliveryNoteUploadDialog.jsx", import.meta.url), "utf8");
  assert.match(dialog, /DELIVERY_NOTE_TEXT\.uploadCleanHint/, "der Upload-Dialog sagt es vor dem Hochladen");
});
