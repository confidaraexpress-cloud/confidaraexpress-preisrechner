import { downloadDocument } from "./downloadDocument";
import { proformaDownloadMessage, PROFORMA_DOWNLOAD_TEXT } from "./proformaDocumentView.mjs";

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
  // Die Mechanik (Abruf, Content-Type-Prüfung, Blob, Object-URL, revoke) und der
  // Pfad-Guard stehen im gemeinsamen Dokumenthelfer; hier bleiben die beiden
  // Dinge, die AN DIESEM Beleg hängen: sein neutraler Rückfalldateiname und
  // seine kuratierten Texte.
  return downloadDocument(downloadPath, {
    fallbackFilename: FALLBACK_DATEINAME,
    message: proformaDownloadMessage,
    errorText: { netz: PROFORMA_DOWNLOAD_TEXT.netz, allgemein: PROFORMA_DOWNLOAD_TEXT.allgemein },
  });
}
