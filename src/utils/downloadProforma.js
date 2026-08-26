import { apiFetch } from "../api/client";
import { filenameFromContentDisposition } from "./invoiceView.mjs";
import { isSafeApiPath, proformaDownloadMessage, PROFORMA_DOWNLOAD_TEXT } from "./proformaDocumentView.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Download der eigenen Proforma-Rechnung (Zollbegleitdokument).
//
// Dasselbe Muster wie Label, Lieferschein und Auftragsbestätigung:
// authentifizierter Abruf, strikte Content-Type-Prüfung, Blob → Object-URL →
// programmatischer Klick → revoke. Und wie dort bewusst KEINE gemeinsame
// Abstraktion: die vier Dokumente haben unterschiedliche Fehlercodes,
// unterschiedliche Texte und unterschiedliche Dateinamenregeln.
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
// fremden Host würde das Kundentoken dorthin senden.
//
// ─── Der Dateiname kommt ebenfalls vom Server ────────────────────────────────
// Serverseitig steht er in `Content-Disposition`, gebildet aus der Proformanummer.
// Hier wird KEIN eigener Belegdateiname erfunden und die serverseitige Namensregel
// nicht nachgebaut — sonst gäbe es zwei Namensschemata für dasselbe Dokument.
//
// GEMESSEN, und deshalb hier notiert: `Content-Disposition` ist KEIN
// CORS-safelisted Response-Header, und `middleware/cors.js` setzt kein
// `exposedHeaders`. Im Produktivbetrieb (Frontend confidaraexpress.de, API
// api.confidaraexpress.de) liest der Browser den Header deshalb NICHT — der
// Aufruf unten liefert dort `null`. Das ist die bestehende Lage (der
// Rechnungsdownload steht seit jeher genauso da) und wird in diesem Paket nicht
// verändert: P5B ist ein reines Frontendpaket. Der Rückfall ist deshalb ein
// NEUTRALER, konstanter Name ohne Nummer — lieber ein schlichter Dateiname als
// eine im Client erfundene Belegbezeichnung. Sobald das Backend den Header
// freigibt (`exposedHeaders: ["Content-Disposition"]`), greift ohne weitere
// Frontendänderung automatisch der serverseitige Name.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_DATEINAME = "proforma-rechnung.pdf";

// Alle sichtbaren Texte und ihre Zuordnung stehen im reinen Modul
// (proformaDocumentView.mjs) — dieselbe Aufteilung wie labelErrors.mjs neben
// downloadLabel.js: so ist die Zuordnung ohne DOM prüfbar, und es gibt genau
// EINE Stelle, an der Kundentext für die Proforma entsteht.

export async function downloadProforma(downloadPath) {
  // Fail-safe: ohne benutzbaren Serverpfad wird gar nicht erst gefragt. Dieser
  // Fall ist über die Oberfläche nicht erreichbar (der Knopf erscheint nur bei
  // `ready` MIT Pfad) — er steht hier, damit ein künftiger Aufrufer nicht
  // versehentlich einen selbst gebauten Pfad hineinreicht.
  if (!isSafeApiPath(downloadPath)) throw new Error(PROFORMA_DOWNLOAD_TEXT.allgemein);

  let r;
  try {
    r = await apiFetch(downloadPath.trim(), { auth: true });
  } catch {
    throw new Error(PROFORMA_DOWNLOAD_TEXT.netz);
  }

  if (!r.ok) {
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    const code = body && typeof body.code === "string" ? body.code : null;
    const err = new Error(proformaDownloadMessage(r.status, code));
    err.status = r.status;
    err.code = code;
    throw err;
  }

  // Erfolgsstatus, aber kein PDF (z. B. eine JSON-/HTML-Antwort eines Proxys):
  // niemals als Datei speichern — der Kunde bekäme sonst eine kaputte PDF, und
  // bei einem Zolldokument fiele das erst am Schalter auf.
  const contentType = String(r.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/pdf")) throw new Error(PROFORMA_DOWNLOAD_TEXT.allgemein);

  const roh = await r.blob();
  if (!roh || roh.size === 0) throw new Error(PROFORMA_DOWNLOAD_TEXT.allgemein);
  const blob = roh.type === "application/pdf" ? roh : new Blob([roh], { type: "application/pdf" });

  const dateiname = filenameFromContentDisposition(r.headers.get("content-disposition"), FALLBACK_DATEINAME);
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
