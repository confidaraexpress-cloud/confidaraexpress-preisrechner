import { apiFetch } from "../api/client";
import { downloadErrorMessage, filenameFromContentDisposition } from "./invoiceView.mjs";

// Authentifizierter Blob-Download für Rechnungs-PDFs — exakt das Muster des
// bestehenden Label-Downloads (utils/downloadLabel.js): apiFetch mit Bearer,
// Binärantwort als Blob, temporäre Object-URL, programmatischer Klick, URL im
// finally wieder freigeben. KEINE öffentliche URL, kein <a href> auf eine
// Server-URL, keine dauerhafte Object-URL, kein Base64.
//
// Der Dateiname kommt serverseitig über Content-Disposition und wird NUR
// übernommen, wenn er dem engen sicheren Muster entspricht (invoiceView.mjs);
// sonst greift der lokal gebildete Fallback. Fehlerantworten ({ error: code,
// message }) werden in verständliche Meldungen übersetzt — niemals Rohcodes.
// Ein 401/403 auf auth:true behandelt apiFetch zentral (Session-Redirect);
// die fachlichen Sperren des Endpunkts (Testdokument/nicht bereit/fehlgeschlagen)
// kommen bewusst als 409 und bleiben hier behandelbar.
// ── Blob-Fetcher (Phase 4, gemeinsame Basis für Download UND Vorschau) ───────
// Liefert { blob, filename } NUR wenn die Antwort ok ist UND der Content-Type
// application/pdf ist — Fehlerantworten (JSON/HTML) werden NIEMALS als PDF
// weitergereicht oder eingebettet. Der Blob wird explizit mit dem PDF-MIME-Typ
// erzeugt (deterministische iframe-Darstellung, kein Sniffing).
async function fetchInvoicePdf(path, fallbackFilename) {
  let r;
  try {
    r = await apiFetch(path, { auth: true });
  } catch {
    throw new Error(downloadErrorMessage(0, null)); // Netzwerkfehler
  }
  if (!r.ok) {
    let code = null;
    let serverMessage = null;
    try {
      const d = await r.json();
      if (d && typeof d.error === "string") code = d.error;
      if (d && typeof d.message === "string" && d.message) serverMessage = d.message;
    } catch { /* kein JSON-Body */ }
    const err = new Error(serverMessage || downloadErrorMessage(r.status, code));
    err.status = r.status;
    err.code = code;
    throw err;
  }
  const contentType = String(r.headers.get("content-type") || "");
  if (!contentType.toLowerCase().startsWith("application/pdf")) {
    throw new Error(downloadErrorMessage(0, null)); // nur application/pdf akzeptieren
  }
  const raw = await r.blob();
  if (!raw || raw.size === 0) throw new Error(downloadErrorMessage(0, null));
  const blob = raw.type === "application/pdf" ? raw : new Blob([raw], { type: "application/pdf" });
  const filename = filenameFromContentDisposition(r.headers.get("content-disposition"), fallbackFilename);
  return { blob, filename };
}

const safeFallbackName = (invoiceNumber) =>
  `rechnung-${String(invoiceNumber == null ? "" : invoiceNumber).replace(/[^A-Za-z0-9._-]/g, "") || "dokument"}.pdf`;

export function fetchCustomerInvoicePdf(invoiceId, invoiceNumber) {
  return fetchInvoicePdf(`/kunde/invoices/${encodeURIComponent(String(invoiceId))}/pdf`, safeFallbackName(invoiceNumber));
}

export function fetchAdminInvoicePdf(invoiceId, invoiceNumber) {
  return fetchInvoicePdf(`/admin/invoices/${encodeURIComponent(String(invoiceId))}/pdf`, safeFallbackName(invoiceNumber));
}

// Gemeinsamer Download-Abschluss: temporäre Object-URL, programmatischer Klick,
// Freigabe im finally (kein permanenter Object-URL-Zustand).
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Kunde: GET /kunde/invoices/:id/pdf (eigene Rechnung; Ownership serverseitig).
export async function downloadCustomerInvoicePdf(invoiceId, invoiceNumber) {
  const { blob, filename } = await fetchCustomerInvoicePdf(invoiceId, invoiceNumber);
  saveBlob(blob, filename);
}

// Admin: GET /admin/invoices/:id/pdf (auditiert; Testdokumente erlaubt — der
// serverseitige Dateiname kennzeichnet sie als test-rechnung-…).
export async function downloadAdminInvoicePdf(invoiceId, invoiceNumber) {
  const { blob, filename } = await fetchAdminInvoicePdf(invoiceId, invoiceNumber);
  saveBlob(blob, filename);
}

// ── Gutschriften ────────────────────────────────────────────────────────────
// Dasselbe Muster wie beim Rechnungs-PDF: authentifizierter Blob-Download,
// temporäre Object-URL, Freigabe im finally. KEINE öffentliche URL, kein
// <a href> auf eine Server-URL, kein Base64.
const safeCreditNoteName = (nummer) =>
  `gutschrift-${String(nummer == null ? "" : nummer).replace(/[^A-Za-z0-9._-]/g, "") || "dokument"}.pdf`;

export function fetchCustomerCreditNotePdf(id, creditNoteNumber) {
  return fetchInvoicePdf(`/kunde/credit-notes/${encodeURIComponent(String(id))}/pdf`, safeCreditNoteName(creditNoteNumber));
}

export async function downloadCustomerCreditNotePdf(id, creditNoteNumber) {
  const { blob, filename } = await fetchCustomerCreditNotePdf(id, creditNoteNumber);
  saveBlob(blob, filename);
}

// Admin: derselbe Beleg. Der Endpunkt stößt einen zuvor fehlgeschlagenen
// Renderlauf erneut an — der Beleg selbst ändert sich dabei nie.
export async function downloadAdminCreditNotePdf(id, creditNoteNumber) {
  const { blob, filename } = await fetchInvoicePdf(
    `/admin/credit-notes/${encodeURIComponent(String(id))}/pdf`, safeCreditNoteName(creditNoteNumber));
  saveBlob(blob, filename);
}
