// ─────────────────────────────────────────────────────────────────────────────
// Rechnungs-Dokumentansicht (Phase 3) — reine, framework-freie Hilfslogik (.mjs,
// wie adminInvoices/addressBookView). Bündelt die testbare Logik rund um den
// Rechnungs-PDF-Download: Dokumentstatus-Anzeige, Download-Freigabe, sichere
// Auswertung des serverseitigen Dateinamens (Content-Disposition), verständliche
// Fehlermeldungen und die zurückhaltende Auto-Aktualisierung. Kein React, kein
// Netzwerk. Das Backend bleibt in allem autoritativ: download_available und der
// Dateiname kommen vom Server; hier wird nichts davon „erraten" oder erzwungen.
// ─────────────────────────────────────────────────────────────────────────────

// [badge-Klasse, Label] für den Dokumentstatus (Kunde UND Admin nutzen dieselbe
// Quelle). Unbekannt → grau + Rohwert (harmlos, kein Raten).
const DOCUMENT_STATUS_META = {
  ready: ["badge-green", "Bereit"],
  pending_document: ["badge-blue", "Wird erstellt"],
  generating: ["badge-blue", "Wird erstellt"],
  document_failed: ["badge-red", "Erstellung fehlgeschlagen"],
};
export const documentStatusMeta = (status) => DOCUMENT_STATUS_META[status] || ["badge-gray", status ?? "—"];

// Sichtbarer Kundenhinweis für Testdokumente (kein aktiver Download).
export const TEST_DOCUMENT_HINT = "Testdokument – nicht für den Zahlungsverkehr freigegeben";

// Testdokument-Kennzeichnung — exakt die Server-Policy gespiegelt: ein FERTIGES
// Dokument ist nur dann produktiv, wenn is_test_document EXPLIZIT false ist;
// true wie NULL (Altbestand, Modus unbekannt) gelten konservativ als Test.
// Ohne fertiges Dokument (pending/generating/failed) gibt es nichts zu kennzeichnen.
export function isTestInvoiceDocument(inv) {
  return !!inv && inv.document_status === "ready" && inv.is_test_document !== false;
}

// Download-Freigabe: AUSSCHLIESSLICH das serverseitig abgeleitete Feld — das
// Frontend rekonstruiert die Policy nicht (keine parallele Wahrheit).
export function canDownloadInvoice(inv) {
  return !!inv && inv.download_available === true;
}

// Betrag mit Währung (Backend liefert z. B. gross_amount + currency; Altzeilen nur
// amount ohne currency → EUR-Fallback). Ungültige Werte → "—" statt "NaN €".
export function formatInvoiceAmount(amount, currency) {
  const n = Number(amount);
  if (amount == null || amount === "" || !Number.isFinite(n)) return "—";
  const cur = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency.trim()) ? currency.trim().toUpperCase() : "EUR";
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: cur }).format(n);
  } catch {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  }
}

// Dateigröße menschenlesbar (Admin-Dokumentkarte). Nur ganze Zahlen > 0.
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// Sichere Auswertung des serverseitigen Dateinamens aus Content-Disposition.
// Akzeptiert NUR das enge Muster attachment; filename="<sicherer Name>.pdf" mit
// ausschließlich [A-Za-z0-9._-] — alles andere (Pfade, %-Encodings, filename*,
// CR/LF) fällt auf den übergebenen Fallback zurück. Kein Vertrauen in Header.
export function filenameFromContentDisposition(headerValue, fallback) {
  const fb = typeof fallback === "string" && fallback ? fallback : "rechnung.pdf";
  if (typeof headerValue !== "string") return fb;
  const m = headerValue.match(/filename="([A-Za-z0-9._-]+\.pdf)"/);
  return m ? m[1] : fb;
}

// Verständliche Fehlermeldungen für den Kunden-Download. Primär nach dem
// Backend-Fehlercode (error-Feld), sekundär nach HTTP-Status. Serverseitige
// deutsche message-Texte dürfen direkt angezeigt werden (kein Rohcode).
const DOWNLOAD_ERROR_BY_CODE = {
  invoice_test_document: TEST_DOCUMENT_HINT + ".",
  invoice_document_not_ready: "Das Rechnungsdokument wird derzeit erstellt. Bitte versuchen Sie es in Kürze erneut.",
  invoice_document_failed: "Das Rechnungsdokument konnte noch nicht erstellt werden. Bitte kontaktieren Sie den Support.",
  invoice_document_integrity: "Das Rechnungsdokument konnte nicht ausgeliefert werden. Bitte kontaktieren Sie den Support.",
};
export const DOWNLOAD_ERROR_GENERIC = "Die Rechnung konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.";

export function downloadErrorMessage(status, code) {
  if (code && DOWNLOAD_ERROR_BY_CODE[code]) return DOWNLOAD_ERROR_BY_CODE[code];
  if (status === 404) return "Diese Rechnung ist nicht (mehr) verfügbar.";
  if (status === 429) return "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.";
  return DOWNLOAD_ERROR_GENERIC;
}

// ── Zurückhaltende Auto-Aktualisierung ──────────────────────────────────────
// Nur solange sichtbare Rechnungen noch auf ihr Dokument warten, wenige Versuche
// mit zunehmendem Abstand; endet bei ready/document_failed, Seitenwechsel oder
// Unmount (Timer-Cleanup im Aufrufer).
export const INVOICE_REFRESH_DELAYS_MS = [5000, 10000, 20000];

export function hasPendingInvoiceDocuments(invoices) {
  return Array.isArray(invoices) && invoices.some(
    (i) => i && (i.document_status === "pending_document" || i.document_status === "generating")
  );
}

// Nächste Verzögerung für Versuch n (0-basiert); null = keine weiteren Versuche.
export function nextRefreshDelay(attempt) {
  return Number.isInteger(attempt) && attempt >= 0 && attempt < INVOICE_REFRESH_DELAYS_MS.length
    ? INVOICE_REFRESH_DELAYS_MS[attempt]
    : null;
}
