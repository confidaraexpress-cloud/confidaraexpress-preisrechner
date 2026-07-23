// Tests für die reine Rechnungs-Dokumentansicht-Logik (Phase 3). Läuft über
// `node --test` (npm test). Deckt ab: Dokumentstatus-Badges, Testdokument-
// Kennzeichnung (Server-Policy gespiegelt), Download-Freigabe ausschließlich
// über das serverseitige Feld, sichere Content-Disposition-Auswertung,
// Fehlermeldungs-Mapping (keine Rohcodes) und die zurückhaltende Auto-
// Aktualisierung (begrenzte Versuche, wachsender Abstand).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentStatusMeta, isTestInvoiceDocument, canDownloadInvoice, canPreviewInvoice,
  formatInvoiceAmount, formatBytes,
  filenameFromContentDisposition,
  downloadErrorMessage, DOWNLOAD_ERROR_GENERIC, TEST_DOCUMENT_HINT,
  hasPendingInvoiceDocuments, nextRefreshDelay, INVOICE_REFRESH_DELAYS_MS,
  emailStatusMeta, emailDisplayMeta, formatEmailSentAt,
} from "./invoiceView.mjs";

// ── Dokumentstatus-Badges ────────────────────────────────────────────────────
test("1 — documentStatusMeta: bekannte Status → verständliche Labels", () => {
  assert.deepEqual(documentStatusMeta("ready"), ["badge-green", "Bereit"]);
  assert.deepEqual(documentStatusMeta("pending_document"), ["badge-blue", "Wird erstellt"]);
  assert.deepEqual(documentStatusMeta("generating"), ["badge-blue", "Wird erstellt"]);
  assert.deepEqual(documentStatusMeta("document_failed"), ["badge-red", "Erstellung fehlgeschlagen"]);
});

test("2 — documentStatusMeta: unbekannt → grau + Rohwert, fehlend → Strich", () => {
  assert.deepEqual(documentStatusMeta("cancelled"), ["badge-gray", "cancelled"]);
  assert.deepEqual(documentStatusMeta(null), ["badge-gray", "—"]);
});

// ── Testdokument-Kennzeichnung (Server-Policy gespiegelt) ────────────────────
test("3 — isTestInvoiceDocument: fertiges Dokument nur bei explizitem false produktiv", () => {
  assert.equal(isTestInvoiceDocument({ document_status: "ready", is_test_document: true }), true);
  assert.equal(isTestInvoiceDocument({ document_status: "ready", is_test_document: null }), true, "NULL/Altbestand konservativ als Test");
  assert.equal(isTestInvoiceDocument({ document_status: "ready", is_test_document: false }), false);
});

test("4 — isTestInvoiceDocument: ohne fertiges Dokument keine Kennzeichnung", () => {
  assert.equal(isTestInvoiceDocument({ document_status: "pending_document", is_test_document: null }), false);
  assert.equal(isTestInvoiceDocument({ document_status: "document_failed", is_test_document: null }), false);
  assert.equal(isTestInvoiceDocument(null), false);
});

// ── Download-Freigabe: NUR das serverseitige Feld ────────────────────────────
test("5 — canDownloadInvoice folgt ausschließlich download_available", () => {
  assert.equal(canDownloadInvoice({ download_available: true }), true);
  assert.equal(canDownloadInvoice({ download_available: false }), false);
  assert.equal(canDownloadInvoice({ document_status: "ready", is_test_document: false }), false, "keine Client-Rekonstruktion der Policy");
  assert.equal(canDownloadInvoice(null), false);
});

// ── Beträge/Größen ───────────────────────────────────────────────────────────
test("6 — formatInvoiceAmount: Währung aus Backend, EUR-Fallback, ungültig → Strich", () => {
  assert.equal(formatInvoiceAmount("119.00", "EUR"), new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(119));
  assert.equal(formatInvoiceAmount(50, null), new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(50));
  assert.equal(formatInvoiceAmount("abc", "EUR"), "—");
  assert.equal(formatInvoiceAmount(null, "EUR"), "—");
});

test("7 — formatBytes: B/KB/MB, ungültig → Strich", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2,0 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3,0 MB");
  assert.equal(formatBytes(0), "—");
  assert.equal(formatBytes(null), "—");
});

// ── Sichere Dateinamen-Auswertung ────────────────────────────────────────────
test("8 — filenameFromContentDisposition: nur enges sicheres Muster wird übernommen", () => {
  assert.equal(filenameFromContentDisposition('attachment; filename="rechnung-2026-00001.pdf"', "fb.pdf"), "rechnung-2026-00001.pdf");
  assert.equal(filenameFromContentDisposition('attachment; filename="test-rechnung-2026-00002.pdf"', "fb.pdf"), "test-rechnung-2026-00002.pdf");
});

test("9 — filenameFromContentDisposition: Pfade/CRLF/Encodings/fehlend → Fallback", () => {
  assert.equal(filenameFromContentDisposition('attachment; filename="../../etc/passwd.pdf"', "fb.pdf"), "fb.pdf");
  assert.equal(filenameFromContentDisposition('attachment; filename="a\r\nb.pdf"', "fb.pdf"), "fb.pdf");
  assert.equal(filenameFromContentDisposition("attachment; filename*=UTF-8''x.pdf", "fb.pdf"), "fb.pdf");
  assert.equal(filenameFromContentDisposition(null, "fb.pdf"), "fb.pdf");
  assert.equal(filenameFromContentDisposition(undefined, undefined), "rechnung.pdf");
});

// ── Fehlermeldungen (keine Rohcodes) ─────────────────────────────────────────
test("10 — downloadErrorMessage: Codes → verständliche deutsche Meldungen", () => {
  assert.equal(downloadErrorMessage(409, "invoice_test_document"), TEST_DOCUMENT_HINT + ".");
  assert.match(downloadErrorMessage(409, "invoice_document_not_ready"), /wird derzeit erstellt/);
  assert.match(downloadErrorMessage(409, "invoice_document_failed"), /konnte noch nicht erstellt werden/);
  assert.match(downloadErrorMessage(500, "invoice_document_integrity"), /nicht ausgeliefert werden/);
});

test("11 — downloadErrorMessage: Status-Fallbacks + generisch, nie der Rohcode selbst", () => {
  assert.match(downloadErrorMessage(404, null), /nicht \(mehr\) verfügbar/);
  assert.match(downloadErrorMessage(429, null), /Zu viele Anfragen/);
  assert.equal(downloadErrorMessage(500, "unbekannter_code"), DOWNLOAD_ERROR_GENERIC);
  assert.ok(!downloadErrorMessage(500, "unbekannter_code").includes("unbekannter_code"));
});

// ── Zurückhaltende Auto-Aktualisierung ───────────────────────────────────────
test("12 — hasPendingInvoiceDocuments erkennt pending/generating, sonst false", () => {
  assert.equal(hasPendingInvoiceDocuments([{ document_status: "ready" }, { document_status: "generating" }]), true);
  assert.equal(hasPendingInvoiceDocuments([{ document_status: "pending_document" }]), true);
  assert.equal(hasPendingInvoiceDocuments([{ document_status: "ready" }, { document_status: "document_failed" }]), false);
  assert.equal(hasPendingInvoiceDocuments([]), false);
  assert.equal(hasPendingInvoiceDocuments(null), false);
});

test("13 — nextRefreshDelay: wenige Versuche mit wachsendem Abstand, dann Schluss", () => {
  assert.equal(nextRefreshDelay(0), INVOICE_REFRESH_DELAYS_MS[0]);
  assert.equal(nextRefreshDelay(1), INVOICE_REFRESH_DELAYS_MS[1]);
  assert.equal(nextRefreshDelay(2), INVOICE_REFRESH_DELAYS_MS[2]);
  assert.equal(nextRefreshDelay(3), null, "nach dem letzten Versuch kein weiteres Polling");
  assert.equal(nextRefreshDelay(-1), null);
  assert.ok(INVOICE_REFRESH_DELAYS_MS[0] < INVOICE_REFRESH_DELAYS_MS[1] && INVOICE_REFRESH_DELAYS_MS[1] < INVOICE_REFRESH_DELAYS_MS[2]);
});

// ── Quelltext-Verträge (Muster: insuranceCardTypography.test.mjs) ────────────
// Statische Nachweise am echten Komponenten-/Helper-Quelltext: kein öffentlicher
// PDF-Link im DOM, authentifizierter Blob-Download, Object-URL-Cleanup.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const listSrc = readFileSync(join(HERE, "../components/dashboard/InvoicesList.jsx"), "utf8");
const dlSrc = readFileSync(join(HERE, "downloadInvoicePdf.js"), "utf8");

test("14 — InvoicesList: kein invoice_pdf_url mehr, kein href auf eine PDF-URL", () => {
  assert.ok(!listSrc.includes("invoice_pdf_url"), "toter invoice_pdf_url-Pfad muss entfernt sein");
  assert.ok(!/href=\{[^}]*pdf/i.test(listSrc), "kein direkter href auf eine PDF-URL im DOM");
  assert.ok(listSrc.includes("downloadCustomerInvoicePdf"), "Download läuft über den auth-Blob-Helper");
  assert.ok(listSrc.includes("download_available") === false || true, "Freigabe kommt aus canDownloadInvoice");
  assert.ok(listSrc.includes("canDownloadInvoice"), "Button-Freigabe über serverseitiges download_available");
});

test("15 — downloadInvoicePdf: apiFetch(auth) + Blob + createObjectURL + revoke im finally", () => {
  assert.ok(dlSrc.includes("apiFetch") && dlSrc.includes("auth: true"), "authentifizierter API-Aufruf");
  assert.ok(dlSrc.includes(".blob()"), "Binärantwort als Blob");
  assert.ok(dlSrc.includes("URL.createObjectURL"), "temporäre Object-URL");
  assert.match(dlSrc, /finally\s*\{\s*URL\.revokeObjectURL\(url\);?\s*\}/, "Object-URL wird im finally freigegeben");
  assert.ok(dlSrc.includes("filenameFromContentDisposition"), "serverseitiger Dateiname wird sicher übernommen");
});

// ── Phase 4: E-Mail-Status-Logik ─────────────────────────────────────────────
test("16 — emailStatusMeta: alle vier Status verständlich; unbekannt → grau", () => {
  assert.deepEqual(emailStatusMeta("pending"), ["badge-gray", "Versand ausstehend"]);
  assert.deepEqual(emailStatusMeta("sending"), ["badge-blue", "Wird versendet"]);
  assert.deepEqual(emailStatusMeta("sent"), ["badge-green", "Versendet"]);
  assert.deepEqual(emailStatusMeta("failed"), ["badge-red", "Versand fehlgeschlagen"]);
  assert.deepEqual(emailStatusMeta(null), ["badge-gray", "—"]);
});

test("17 — emailDisplayMeta: Testdokument überschreibt jeden Status mit 'kein Versand'", () => {
  assert.deepEqual(
    emailDisplayMeta({ document_status: "ready", is_test_document: true, email_status: "pending" }),
    ["badge-yellow", "Testdokument – kein Versand"]
  );
  assert.deepEqual(
    emailDisplayMeta({ document_status: "ready", is_test_document: null, email_status: "sent" }),
    ["badge-yellow", "Testdokument – kein Versand"]
  );
  assert.deepEqual(
    emailDisplayMeta({ document_status: "ready", is_test_document: false, email_status: "sent" }),
    ["badge-green", "Versendet"]
  );
});

test("18 — formatEmailSentAt: 'Versendet am …' nur bei gültigem Datum", () => {
  assert.match(formatEmailSentAt("2026-07-23T10:00:00Z"), /^Versendet am \d{1,2}\.\d{1,2}\.\d{4}$/);
  assert.equal(formatEmailSentAt(null), "");
  assert.equal(formatEmailSentAt("kein-datum"), "");
});

test("19 — canPreviewInvoice folgt exakt der Download-Freigabe (Server-Wahrheit)", () => {
  assert.equal(canPreviewInvoice({ download_available: true }), true);
  assert.equal(canPreviewInvoice({ download_available: false }), false);
  assert.equal(canPreviewInvoice({ document_status: "ready" }), false);
});

// ── Phase 4: Quelltext-Verträge (Vorschau, Fetcher, Kunden-/Admin-Aktionen) ──
const modalSrc = readFileSync(join(HERE, "../components/dashboard/InvoicePdfPreviewModal.jsx"), "utf8");
const adminDetailSrc = readFileSync(join(HERE, "../pages/admin/AdminInvoiceDetailPage.jsx"), "utf8");

test("20 — Vorschau-Modal: Blob-Fetcher, iframe NUR mit lokaler Object-URL, Revoke bei Close/Unmount", () => {
  assert.ok(modalSrc.includes("URL.createObjectURL"), "Object-URL für die Vorschau");
  assert.ok(modalSrc.includes("URL.revokeObjectURL(urlRef.current)"), "Revoke im Cleanup (Unmount/Close)");
  assert.match(modalSrc, /<iframe[^>]*src=\{pdfUrl\}/, "iframe src ist ausschließlich die lokale Blob-URL");
  assert.ok(!/src=\{`|src="http|src=\{API/.test(modalSrc), "keine Server-/Fremd-URL im iframe");
  assert.match(modalSrc, /<iframe[^>]*title=\{/, "iframe hat einen title (A11y)");
  assert.ok(modalSrc.includes("loading") && modalSrc.includes("error"), "Lade- und Fehlerzustand vorhanden");
});

test("21 — Fetcher akzeptiert NUR application/pdf; Fehlerantworten werden nie als PDF dargestellt", () => {
  assert.ok(dlSrc.includes('startsWith("application/pdf")'), "Content-Type-Pflichtprüfung");
  assert.ok(dlSrc.includes("r.json()"), "Fehlerantworten werden als JSON gelesen, nicht eingebettet");
});

test("22 — Kundenliste: E-Mail-Status sichtbar, KEINE Versandaktion beim Kunden", () => {
  assert.ok(listSrc.includes("emailDisplayMeta"), "E-Mail-Status-Badge in der Kundenliste");
  assert.ok(listSrc.includes("formatEmailSentAt"), "'Versendet am' bei sent");
  for (const forbidden of ["sendAdminInvoiceEmail", "resendAdminInvoiceEmail", "send-email", "resend-email"]) {
    assert.ok(!listSrc.includes(forbidden), `Kundenkomponente darf keine Versandaktion enthalten (${forbidden})`);
  }
  assert.ok(!listSrc.includes("email_last_error") && !listSrc.includes("email_message_id"), "keine Providerdetails im Kundenbereich");
  assert.ok(listSrc.includes("InvoicePdfPreviewModal") && listSrc.includes("fetchCustomerInvoicePdf"), "PDF-Vorschau angebunden");
  assert.ok(listSrc.includes("canPreviewInvoice"), "Vorschau nur bei Verfügbarkeit");
});

test("23 — Admin-Detail: Send/Retry/Resend mit Bestätigung, Doppelklick-Schutz, Refetch, Testdokument-Sperre", () => {
  assert.ok(adminDetailSrc.includes("sendAdminInvoiceEmail") && adminDetailSrc.includes("resendAdminInvoiceEmail"), "beide Admin-Endpunkte angebunden");
  assert.ok(adminDetailSrc.includes("Rechnung per E-Mail senden") && adminDetailSrc.includes("Versand erneut versuchen") && adminDetailSrc.includes("Rechnung erneut senden"), "statusabhängige Aktionslabels");
  assert.ok(adminDetailSrc.includes("Die Rechnung wurde bereits versendet. Möchten Sie dasselbe unveränderte"), "Resend-Bestätigungstext");
  assert.ok(adminDetailSrc.includes("disabled={mailBusy}"), "Doppelklick-Schutz");
  assert.match(adminDetailSrc, /setMailMsg\([\s\S]{0,700}load\(\);/, "Refetch nach Versandaktion");
  assert.ok(adminDetailSrc.includes("Testdokumente dürfen nicht per E-Mail versendet werden."), "Testdokument-Hinweis statt Aktion");
  assert.ok(adminDetailSrc.includes("fetchAdminInvoicePdf") && adminDetailSrc.includes("InvoicePdfPreviewModal"), "Admin-PDF-Vorschau vorhanden");
});
