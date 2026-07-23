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
async function downloadPdfFromResponse(r, fallbackFilename) {
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

  const blob = await r.blob();
  if (!blob || blob.size === 0) {
    throw new Error(downloadErrorMessage(0, null));
  }

  const filename = filenameFromContentDisposition(r.headers.get("content-disposition"), fallbackFilename);
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
  let r;
  try {
    r = await apiFetch(`/kunde/invoices/${encodeURIComponent(String(invoiceId))}/pdf`, { auth: true });
  } catch {
    throw new Error(downloadErrorMessage(0, null)); // Netzwerkfehler
  }
  const safeNumber = String(invoiceNumber == null ? "" : invoiceNumber).replace(/[^A-Za-z0-9._-]/g, "") || "dokument";
  await downloadPdfFromResponse(r, `rechnung-${safeNumber}.pdf`);
}

// Admin: GET /admin/invoices/:id/pdf (auditiert; Testdokumente erlaubt — der
// serverseitige Dateiname kennzeichnet sie als test-rechnung-…).
export async function downloadAdminInvoicePdf(invoiceId, invoiceNumber) {
  let r;
  try {
    r = await apiFetch(`/admin/invoices/${encodeURIComponent(String(invoiceId))}/pdf`, { auth: true });
  } catch {
    throw new Error(downloadErrorMessage(0, null));
  }
  const safeNumber = String(invoiceNumber == null ? "" : invoiceNumber).replace(/[^A-Za-z0-9._-]/g, "") || "dokument";
  await downloadPdfFromResponse(r, `rechnung-${safeNumber}.pdf`);
}
