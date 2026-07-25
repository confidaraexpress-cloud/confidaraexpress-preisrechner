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

// Deutlicher Hinweis für eine interne Vorschau (Phase 5) — bewusst ausführlicher als
// TEST_DOCUMENT_HINT, weil die Vorschau ansehbar/herunterladbar IST und daher klarstellen muss,
// dass sie NICHT zahlungswirksam ist. Wird sowohl bei aktivem Download als auch als Sperrgrund gezeigt.
export const PREVIEW_DOCUMENT_HINT = "Diese Rechnung dient derzeit ausschließlich der internen Prüfung und ist nicht für den Zahlungsverkehr freigegeben.";

// Kurzes Badge-Label für ein Testdokument in der Kundensicht.
export const PREVIEW_DOCUMENT_BADGE = "Interne Vorschau";

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

// ── Rechnungs-E-Mail-Status (Phase 4) ───────────────────────────────────────
// [badge-Klasse, Label] für invoices.email_status. Kunde und Admin nutzen dieselbe
// Quelle; der Kunde sieht NIE Providerdetails oder Fehlertexte — nur den Status.
const EMAIL_STATUS_META = {
  pending: ["badge-gray", "Versand ausstehend"],
  sending: ["badge-blue", "Wird versendet"],
  sent: ["badge-green", "Versendet"],
  failed: ["badge-red", "Versand fehlgeschlagen"],
};
export const emailStatusMeta = (status) => EMAIL_STATUS_META[status] || ["badge-gray", status ?? "—"];

// Anzeige-Meta inkl. Testdokument-Sonderfall: Ein Testdokument wird NIE versendet —
// statt eines irreführenden "Versand ausstehend" zeigt die Oberfläche dauerhaft
// "Testdokument – kein Versand" (gelb). Bei 'sent' liefert formatEmailSentAt optional
// den "Versendet am …"-Zusatz.
export function emailDisplayMeta(inv) {
  if (isTestInvoiceDocument(inv)) return ["badge-yellow", "Testdokument – kein Versand"];
  return emailStatusMeta(inv ? inv.email_status : null);
}

export function formatEmailSentAt(emailSentAt) {
  if (!emailSentAt) return "";
  const d = new Date(emailSentAt);
  if (Number.isNaN(d.getTime())) return "";
  return `Versendet am ${d.toLocaleDateString("de-DE")}`;
}

// PDF-Vorschau-Freigabe: identische Server-Wahrheit wie der Download — was der Kunde
// nicht herunterladen darf, darf er auch nicht in der Vorschau sehen.
export function canPreviewInvoice(inv) {
  return canDownloadInvoice(inv);
}

// ── Zurückhaltende Auto-Aktualisierung ──────────────────────────────────────
// Nur solange sichtbare Rechnungen noch auf ihr Dokument warten (pending_document|generating),
// wenige Versuche mit zunehmendem Abstand (Backoff). Endet automatisch bei ready/document_failed
// (kein „wartendes" Dokument mehr), nach dem letzten Intervall (harte Obergrenze), beim
// Seitenwechsel oder Unmount (Timer-Cleanup im Aufrufer). Im Hintergrund-Tab wird nicht gepollt
// (der Aufrufer gated auf document.hidden). Summe der Intervalle ≈ 110 s → „maximal etwa zwei
// Minuten" aktive Aktualisierung; danach nur noch manuell über den „Aktualisieren"-Button.
export const INVOICE_REFRESH_DELAYS_MS = [5000, 10000, 20000, 30000, 45000];

// Dokument-Status, bei denen noch auf das PDF gewartet wird (Polling sinnvoll). document_failed
// und ready sind bewusst NICHT enthalten → dort stoppt das Polling sofort (kein Endlos-Poll).
const PENDING_DOCUMENT_STATES = new Set(["pending_document", "generating"]);

export function hasPendingInvoiceDocuments(invoices) {
  return Array.isArray(invoices) && invoices.some((i) => i && PENDING_DOCUMENT_STATES.has(i.document_status));
}

// Nächste Verzögerung für Versuch n (0-basiert); null = keine weiteren Versuche (Obergrenze erreicht).
export function nextRefreshDelay(attempt) {
  return Number.isInteger(attempt) && attempt >= 0 && attempt < INVOICE_REFRESH_DELAYS_MS.length
    ? INVOICE_REFRESH_DELAYS_MS[attempt]
    : null;
}

// Soll (JETZT) automatisch weiter aktualisiert werden? Reine Entscheidungsfunktion für den
// Aufrufer (Component gated zusätzlich auf Sichtbarkeit/loading). true nur, wenn noch ein Dokument
// wartet UND die Versuchsobergrenze nicht erreicht ist.
export function shouldContinuePolling(invoices, attempt) {
  return hasPendingInvoiceDocuments(invoices) && nextRefreshDelay(attempt) != null;
}
