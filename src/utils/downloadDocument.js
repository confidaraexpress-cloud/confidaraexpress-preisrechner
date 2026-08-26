import { apiFetch } from "../api/client";
import { filenameFromContentDisposition } from "./invoiceView.mjs";
import { isSafeApiPath, documentDownloadMessage, DOCUMENT_DOWNLOAD_TEXT, DEFAULT_DOCUMENT_FILENAME } from "./shipmentDocumentsView.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Download EINES Sendungsdokuments über den SERVERGELIEFERTEN Pfad.
//
// Diese Datei trägt ausschließlich die MECHANIK: authentifizierter Abruf,
// strikte Content-Type-Prüfung, Blob → Object-URL → programmatischer Klick →
// revoke. Was der Kunde dabei liest und wie die Datei im Rückfall heißt, gibt
// der Aufrufer mit — genau die zwei Achsen, auf denen sich die Dokumente
// unterscheiden. (Die drei älteren Helfer — Label, Lieferschein,
// Auftragsbestätigung — bleiben unangetastet: sie adressieren über die
// Sendungs-ID statt über einen Serverpfad und tragen eigene Fehlercodes.)
//
// ─── Der Pfad kommt vom SERVER, nicht von hier ───────────────────────────────
// Aufgerufen wird ausschließlich der `downloadPath` aus der Dokument-Metadaten-
// Antwort. Er wird NICHT im Frontend zusammengebaut: der Server sagt, welche
// Dokumente es gibt und wo sie liegen — genau dafür existiert die Liste. Ein
// zweiter, hier gebauter Pfad wäre eine zweite Wahrheit, die bei jeder
// Routenänderung stillschweigend veraltet.
//
// Geprüft wird er trotzdem (`isSafeApiPath`): `apiFetch` reicht eine absolute
// URL unverändert durch und hängt den Bearer-Token an — ein Pfad auf einen
// fremden Host würde das Kundentoken dorthin senden. Diese Schutzregel ist beim
// Verallgemeinern die wichtigste Zeile der Datei.
//
// ─── Der Dateiname kommt ebenfalls vom Server ────────────────────────────────
// Serverseitig steht er in `Content-Disposition`, gebildet aus der jeweiligen
// Belegnummer. Hier wird KEIN Dateiname aus Nummer oder Typ zusammengebaut und
// die serverseitige Namensregel nicht nachgebaut — der Rückfall ist ein
// neutraler, konstanter Name. Seit dem Backend-Härtungspaket gibt
// `middleware/cors.js` die Kopfzeile über `exposedHeaders` frei; vorher war sie
// cross-origin unlesbar und der Rückfall griff immer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} downloadPath  relativer API-Pfad aus der Dokumentliste
 * @param {{fallbackFilename?: string, message?: (status:number, code:string|null)=>string, errorText?: {netz:string, allgemein:string}}} opts
 */
export async function downloadDocument(downloadPath, opts = {}) {
  const rückfallname = typeof opts.fallbackFilename === "string" && opts.fallbackFilename
    ? opts.fallbackFilename : DEFAULT_DOCUMENT_FILENAME;
  const meldung = typeof opts.message === "function" ? opts.message : documentDownloadMessage;
  const texte = opts.errorText || DOCUMENT_DOWNLOAD_TEXT;

  // Fail-safe: ohne benutzbaren Serverpfad wird gar nicht erst gefragt. Über die
  // Oberfläche ist dieser Fall nicht erreichbar (eine Aktion entsteht nur bei
  // `ready` MIT geprüftem Pfad) — er steht hier, damit ein künftiger Aufrufer
  // nicht versehentlich einen selbst gebauten oder fremden Pfad hineinreicht.
  if (!isSafeApiPath(downloadPath)) throw new Error(texte.allgemein);

  let r;
  try {
    r = await apiFetch(downloadPath.trim(), { auth: true });
  } catch {
    throw new Error(texte.netz);
  }

  if (!r.ok) {
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    const code = body && typeof body.code === "string" ? body.code : null;
    const err = new Error(meldung(r.status, code));
    err.status = r.status;
    err.code = code;
    throw err;
  }

  // Erfolgsstatus, aber kein PDF (z. B. eine JSON-/HTML-Antwort eines Proxys):
  // niemals als Datei speichern — der Kunde bekäme sonst eine kaputte PDF, und
  // bei einem Zolldokument fiele das erst am Schalter auf.
  const contentType = String(r.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/pdf")) throw new Error(texte.allgemein);

  const roh = await r.blob();
  if (!roh || roh.size === 0) throw new Error(texte.allgemein);
  const blob = roh.type === "application/pdf" ? roh : new Blob([roh], { type: "application/pdf" });

  const dateiname = filenameFromContentDisposition(r.headers.get("content-disposition"), rückfallname);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = dateiname;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
