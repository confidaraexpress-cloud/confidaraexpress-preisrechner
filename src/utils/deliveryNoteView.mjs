// utils/deliveryNoteView.mjs — Anzeigemodell der Lieferscheinverwaltung (rein, ohne DOM).
//
// Der Server entscheidet, welcher Lieferschein einer Sendung gilt (Backend
// docs/BACKEND_ARCHITECTURE.md §21): die neueste eigene Fassung, sonst der
// ConfidaraExpress-Lieferschein, sonst keiner. Diese Datei übersetzt seine Antworten nur in
// Kundensprache — sie wählt nie selbst aus, sie rechnet keine Version und sie kennt keine
// Provider. Grenzen kommen aus der Serverantwort (`limits`); die Werte hier sind nur das
// Netz für eine Antwort ohne sie.

const MB = 1024 * 1024;

export const UPLOAD_LIMITS = Object.freeze({ maxBytes: 5 * MB, maxPages: 20, maxVersions: 20, numberMaxLength: 64 });
export const TEMPLATE_LIMITS = Object.freeze({
  maxBytes: 3 * MB,
  maxPages: 2,
  areas: Object.freeze({
    topFirstMm: Object.freeze({ min: 15, max: 140 }),
    topNextMm: Object.freeze({ min: 15, max: 140 }),
    bottomMm: Object.freeze({ min: 10, max: 80 }),
  }),
  defaults: Object.freeze({ topFirstMm: 45, topNextMm: 30, bottomMm: 25 }),
});

export const DELIVERY_NOTE_TEXT = Object.freeze({
  title: "Lieferscheine",
  subtitle: "Lieferscheine Ihrer gebuchten Sendungen ansehen, eigene hochladen und auf Ihrem Briefpapier erstellen.",
  tabOverview: "Übersicht",
  tabTemplate: "Briefpapier-Vorlage",
  searchLabel: "Lieferscheine durchsuchen",
  searchPlaceholder: "Nummer oder Empfänger",
  filterLabel: "Lieferschein",
  loadError: "Die Lieferscheine konnten nicht geladen werden.",
  loadMore: "Weitere Sendungen laden",
  emptyTitle: "Noch keine gebuchten Sendungen",
  emptyText: "Sobald Sie eine Sendung gebucht haben, finden Sie hier ihren Lieferschein — und können einen eigenen hochladen.",
  noResultsTitle: "Keine Sendungen gefunden",
  noResultsText: "Für diese Suche oder diesen Filter gibt es keine Treffer.",
  uploadHint: "Gilt ab sofort für diese Sendung. Der bisherige Lieferschein bleibt im Verlauf.",
  // Der Server speichert nie die Datei selbst, sondern ihren Neuaufbau (Backend §21, Security-Review 2026-10-29).
  uploadCleanHint: "Gespeichert wird eine bereinigte Fassung: Text, Bilder und Stempel bleiben, Links und Formularfunktionen entfallen.",
});

export const SOURCE_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: "", label: "Alle Sendungen" }),
  Object.freeze({ value: "own", label: "Eigene Lieferscheine" }),
  Object.freeze({ value: "confidara", label: "ConfidaraExpress-Lieferscheine" }),
  Object.freeze({ value: "none", label: "Ohne Lieferschein" }),
]);

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * Der geltende Lieferschein einer Zeile in Kundensprache.
 * @returns {{kind: "confidara"|"upload"|"template"|"none", label: string, origin: string|null, number: string|null}}
 */
export function effectiveView(effective) {
  if (!effective || typeof effective !== "object") return { kind: "none", label: "Kein Lieferschein", origin: null, number: null };
  if (effective.source === "confidara") return { kind: "confidara", label: "ConfidaraExpress", origin: null, number: text(effective.number) };
  if (effective.source === "own") {
    const vorlage = effective.origin === "template";
    return {
      kind: vorlage ? "template" : "upload",
      label: "Eigener Lieferschein",
      origin: vorlage ? "Aus eigener Vorlage" : "PDF hochgeladen",
      number: text(effective.number),
    };
  }
  return { kind: "none", label: "Kein Lieferschein", origin: null, number: null };
}

/** Empfänger als eine Zeile: Firma oder Name, dann Ort. */
export function recipientText(recipient) {
  if (!recipient || typeof recipient !== "object") return { name: "—", place: null };
  return { name: text(recipient.company) || text(recipient.fullName) || "—", place: text(recipient.city) };
}

/** Datum TT.MM.JJJJ (de-DE). */
export function dateDe(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Datum und Uhrzeit ohne Sekunden (de-DE). */
export function dateTimeDe(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${dateDe(d)}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

/** Dateigröße für Menschen: „850 KB“, „1,2 MB“. */
export function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v < 1024 * 1024) return `${Math.max(1, Math.round(v / 1024)).toLocaleString("de-DE")} KB`;
  const mb = v / (1024 * 1024);
  return `${mb.toLocaleString("de-DE", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

// ── Aktionen einer Zeile ────────────────────────────────────────────────────
/**
 * Was eine Zeile der Übersicht anbietet — allein aus den Serverfeldern (`actions`, `effective`).
 * Reihenfolge: zuerst, was mit dem geltenden Lieferschein geht, dann Erstellen, zuletzt Verlauf.
 */
export function rowActions(row) {
  const eff = effectiveView(row && row.effective);
  const a = (row && row.actions) || {};
  const out = [];
  if (eff.kind !== "none") {
    out.push({ id: "view", label: "Anzeigen" });
    out.push({ id: "download", label: "Herunterladen" });
  }
  if (a.canUpload) out.push({ id: "upload", label: eff.kind === "upload" || eff.kind === "template" ? "Eigenen Lieferschein ersetzen" : "Eigenen Lieferschein hochladen" });
  if (a.canCreateFromTemplate) out.push({ id: "fromTemplate", label: "Aus Vorlage erstellen" });
  if (a.canCreateConfidara) out.push({ id: "confidara", label: "ConfidaraExpress-Lieferschein erstellen" });
  out.push({ id: "history", label: "Verlauf anzeigen" });
  return out;
}

// ── Verlauf ─────────────────────────────────────────────────────────────────
const STATUS_TEXT = Object.freeze({
  effective: "Gilt",
  replaced: "Ersetzt",
  withdrawn: "Zurückgezogen",
  unavailable: "Nicht mehr verfügbar",
});

/**
 * Alle Fassungen einer Sendung, neueste zuerst: eigene Versionen und der ConfidaraExpress-
 * Lieferschein. Der Status kommt aus dem Server (`effective`, `withdrawnAt`, `available`).
 */
export function historyEntries(history) {
  const h = history && typeof history === "object" ? history : {};
  const out = [];
  for (const v of Array.isArray(h.versions) ? h.versions : []) {
    const vorlage = v.origin === "template";
    const status = v.available === false ? "unavailable" : v.effective ? "effective" : v.withdrawnAt ? "withdrawn" : "replaced";
    out.push({
      key: `v${v.version}`,
      version: Number(v.version),
      kind: vorlage ? "template" : "upload",
      title: `Eigener Lieferschein, Fassung ${v.version}`,
      origin: vorlage ? "Aus eigener Vorlage" : "PDF hochgeladen",
      number: text(v.number),
      date: v.createdAt,
      how: v.createdVia === "booking" ? "Bei der Buchung erstellt" : vorlage ? "Von Ihnen erstellt" : "Von Ihnen hochgeladen",
      status,
      statusText: status === "withdrawn" ? `${STATUS_TEXT.withdrawn} am ${dateDe(v.withdrawnAt)}` : STATUS_TEXT[status],
      canDownload: v.available !== false,
      canWithdraw: v.available !== false && !v.withdrawnAt,
    });
  }
  if (h.confidara && h.confidara.number) {
    const status = h.confidara.effective ? "effective" : "replaced";
    out.push({
      key: "confidara",
      version: null,
      kind: "confidara",
      title: "ConfidaraExpress-Lieferschein",
      origin: "Gestaltung von ConfidaraExpress",
      number: text(h.confidara.number),
      date: h.confidara.issuedAt,
      how: h.confidara.createdVia === "customer" ? "Nachträglich erstellt" : "Bei der Buchung erstellt",
      status,
      statusText: STATUS_TEXT[status],
      canDownload: true,
      canWithdraw: false,
    });
  }
  const t = (x) => { const d = new Date(x.date); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); };
  return out.sort((a, b) => (t(b) - t(a)) || ((b.version || 0) - (a.version || 0)));
}

// ── Fehler ──────────────────────────────────────────────────────────────────
// Bekannte Codes in Kundensprache. Ein Code erscheint nie im sichtbaren Text.
const ERROR_TEXTS = Object.freeze({
  PDF_FILE_REQUIRED: "Bitte wählen Sie genau eine PDF-Datei aus.",
  PDF_FILE_EMPTY: "Die Datei ist leer.",
  PDF_NOT_PDF: "Bitte wählen Sie eine PDF-Datei aus.",
  PDF_INVALID: "Die PDF-Datei ist beschädigt oder kann nicht gelesen werden.",
  PDF_ENCRYPTED: "Die PDF-Datei ist mit einem Passwort geschützt. Bitte speichern Sie sie ohne Schutz und laden Sie sie erneut hoch.",
  PDF_ACTIVE_CONTENT: "Die PDF-Datei enthält aktive Inhalte wie Skripte, automatische Aktionen oder eingebettete Dateien. Speichern Sie sie zum Beispiel über „Drucken als PDF“ neu und laden Sie sie erneut hoch.",
  PDF_UNSUPPORTED: "Die PDF-Datei nutzt ein Format, das wir nicht sicher prüfen können. Speichern Sie sie zum Beispiel über „Drucken als PDF“ neu.",
  PDF_TOO_COMPLEX: "Die PDF-Datei ist zu umfangreich, um sie sicher zu prüfen.",
  PDF_TOO_MANY_PAGES: "Die PDF-Datei hat zu viele Seiten.",
  PDF_TEMPLATE_NOT_A4: "Das Briefpapier muss DIN A4 im Hochformat sein, ohne Beschnittzugabe und ohne Drehung.",
  PDF_TEMPLATE_FORM_FIELDS: "Das Briefpapier enthält Formularfelder. Bitte laden Sie ein Briefpapier ohne Formularfelder hoch.",
  PDF_TEMPLATE_UNSUPPORTED: "Dieses Briefpapier können wir nicht übernehmen. Speichern Sie es zum Beispiel über „Drucken als PDF“ neu.",
  DELIVERY_NOTE_SHIPMENT_NOT_BOOKED: "Lieferscheine gibt es erst für gebuchte Sendungen.",
  DELIVERY_NOTE_VERSION_LIMIT: "Für diese Sendung sind bereits 20 eigene Lieferscheine gespeichert.",
  DELIVERY_NOTE_NO_ITEMS: "Für diese Sendung liegen keine Warenpositionen vor. Laden Sie stattdessen Ihren eigenen Lieferschein als PDF hoch.",
  DELIVERY_NOTE_MISSING_ADDRESSES: "Für diese Sendung fehlen Absender- oder Empfängerangaben.",
  DELIVERY_NOTE_TEMPLATE_MISSING: "Richten Sie zuerst Ihr Briefpapier als Vorlage ein.",
  DELIVERY_NOTE_NUMBER_INVALID: "Die Lieferscheinnummer darf höchstens 64 Zeichen lang sein.",
  DELIVERY_NOTE_NOT_FOUND: "Für diese Sendung liegt kein Lieferschein vor.",
  DELIVERY_NOTE_VERSION_NOT_FOUND: "Diese Fassung des Lieferscheins gibt es nicht.",
  DELIVERY_NOTE_NOT_AVAILABLE: "Dieser Lieferschein ist nicht mehr verfügbar.",
  DELIVERY_NOTE_RENDER_FAILED: "Der Lieferschein konnte nicht erzeugt werden. Bitte wenden Sie sich an den Support.",
  DELIVERY_NOTE_RATE_LIMITED: "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.",
  DELIVERY_NOTE_CONFLICT: "Der Lieferschein wurde gerade geändert. Bitte laden Sie die Ansicht neu.",
  DELIVERY_NOTE_LIST_INVALID: "Die Liste konnte mit diesem Filter nicht geladen werden.",
  DELIVERY_NOTE_TEMPLATE_AREA_INVALID: "Bitte geben Sie die Abstände in ganzen Millimetern innerhalb der angegebenen Grenzen an.",
  DELIVERY_NOTE_TEMPLATE_NOT_FOUND: "Diese Vorlage gibt es nicht mehr. Bitte laden Sie die Ansicht neu.",
  DELIVERY_NOTE_TEMPLATE_NOT_AVAILABLE: "Diese Vorlage ist nicht mehr verfügbar.",
  DELIVERY_NOTE_TEMPLATE_CONFLICT: "Die Vorlage wurde gerade geändert. Bitte laden Sie die Ansicht neu.",
});
// Codes, deren Servertext eine Zahl trägt, die hier nicht feststeht (Größengrenze).
const SERVER_TEXT_CODES = new Set(["PDF_FILE_TOO_LARGE", "DEMO_NOT_AVAILABLE"]);

/** Fehlertext zu einer Fehlerantwort: bekannter Code → Kundentext, sonst Servertext, sonst Rückfall. */
export function deliveryNoteErrorText(body, fallback = "Der Vorgang konnte nicht ausgeführt werden.") {
  const code = body && typeof body.code === "string" ? body.code : null;
  if (code && ERROR_TEXTS[code]) return ERROR_TEXTS[code];
  if (code && SERVER_TEXT_CODES.has(code) && text(body.error)) return text(body.error);
  if (code === "PDF_FILE_TOO_LARGE") return "Die Datei ist zu groß.";
  if (body && text(body.error) && text(body.error).split(/\s+/).length > 1) return text(body.error);
  return fallback;
}

/**
 * Vorprüfung im Browser — nur, damit eine offensichtlich falsche Datei sofort auffällt.
 * Die Prüfung, die zählt, macht der Server (Struktur, aktive Inhalte, Verschlüsselung).
 * @returns {string|null} Fehlertext oder null
 */
export function checkPdfFile(file, { maxBytes = UPLOAD_LIMITS.maxBytes } = {}) {
  if (!file || typeof file !== "object") return ERROR_TEXTS.PDF_FILE_REQUIRED;
  const name = typeof file.name === "string" ? file.name : "";
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (!/\.pdf$/i.test(name) || (type !== "" && type !== "application/pdf")) return ERROR_TEXTS.PDF_NOT_PDF;
  if (!(file.size > 0)) return ERROR_TEXTS.PDF_FILE_EMPTY;
  if (file.size > maxBytes) return `Die Datei ist zu groß (höchstens ${formatBytes(maxBytes)}).`;
  return null;
}

// ── Briefpapier-Vorlage ─────────────────────────────────────────────────────
export const AREA_FIELDS = Object.freeze([
  Object.freeze({ key: "topFirstMm", label: "Abstand oben auf der ersten Seite", hint: "Unter Ihrem Briefkopf beginnt der Lieferschein." }),
  Object.freeze({ key: "topNextMm", label: "Abstand oben auf Folgeseiten", hint: "Gilt ab Seite 2, zum Beispiel unter einem schmaleren Kopf." }),
  Object.freeze({ key: "bottomMm", label: "Abstand unten", hint: "Ihre Fußzeile bleibt frei." }),
]);

/** Prüft die drei Abstände wie der Server (ganze Millimeter in den Grenzen). */
export function areaFieldErrors(values, limits = TEMPLATE_LIMITS.areas) {
  const errors = {};
  for (const f of AREA_FIELDS) {
    const raw = values ? values[f.key] : undefined;
    const s = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
    const l = limits[f.key];
    if (!/^[0-9]{1,3}$/.test(s) || Number(s) < l.min || Number(s) > l.max) {
      errors[f.key] = `Bitte ${l.min} bis ${l.max} mm angeben.`;
    }
  }
  return errors;
}

/** Was die Vorlage im aktuellen Kontomodus bewirkt — ein Satz, ohne Technik. */
export function templateModeText(mode) {
  if (mode === "confidara") {
    return "Neue Sendungen mit Artikeln erhalten ihren Lieferschein automatisch auf diesem Briefpapier. Für bereits gebuchte Sendungen erstellen Sie ihn in der Übersicht mit „Aus Vorlage erstellen“.";
  }
  const name = mode === "external" ? "„Eigenes Lieferscheinsystem“" : "„Keine Lieferscheine“";
  return `Ihr Konto ist auf ${name} eingestellt: ConfidaraExpress erstellt bei der Buchung keinen Lieferschein. Mit „Aus Vorlage erstellen“ in der Übersicht entsteht er je Sendung auf Ihrem Briefpapier.`;
}

/** Zustand der Vorlage für den Kopf des Bereichs. */
export function templateStateText(state) {
  const s = state && typeof state === "object" ? state : {};
  if (s.active && s.draft) return "Aktiv, dazu ein Entwurf in Bearbeitung";
  if (s.active) return "Aktiv";
  if (s.draft) return "Entwurf, noch nicht verwendet";
  return "Keine Vorlage eingerichtet";
}

export function pagesText(n) {
  return Number(n) === 2 ? "Erstseite und Folgeseite" : "Eine Seite für alle Seiten";
}
