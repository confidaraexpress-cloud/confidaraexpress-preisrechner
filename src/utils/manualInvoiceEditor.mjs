// utils/manualInvoiceEditor.mjs — Rechnungseditor DIN A4 (Betreiberauftrag 2026-11-21, Variante A).
//
// Framework-frei. Das Blatt im Editor ist das echte PDF des Renderers (POST /admin/manual-invoices/preview für die
// ungespeicherten Felder, GET …/drafts/:id/review für die Prüfansicht); die Klickflächen kommen aus dessen
// Bereichskarte. Hier steht nur:
//   • die Abbildung Bereich des Blatts → Abschnitt und Feld des Editors,
//   • die Lage einer Klickfläche in Prozent der Seite (Punkt, Ursprung oben links, Seite ab 1),
//   • die Regel „nur die jüngste Vorschauantwort zählt",
//   • Texte für Vorschaustatus, Fehler, Bezug (Sendung/Lagerauftrag) und Prüfansicht.
// Gerechnet wird nichts: Summen, Sperren und Fingerabdruck liefert ausschließlich der Server.
import { formKeyOf, formatCents, RECIPIENT_FIELDS } from "./manualInvoiceView.mjs";

// A4 in Punkt — dieselbe Seitengröße, die der Renderer meldet (`page`).
export const PAGE_PT = Object.freeze({ width: 595.28, height: 841.89 });
// Eingabepause bis zur nächsten Vorschau.
export const PREVIEW_DELAY_MS = 600;

const str = (v) => (v == null ? "" : String(v));

export const EDITOR_TEXT = Object.freeze({
  sheetGroup: "Bereiche des Rechnungsblatts",
  sheetPage: (i, n) => `Rechnungsblatt, Seite ${i} von ${n}`,
  sheetLoading: "Das Rechnungsblatt wird gezeichnet …",
  sheetNone: "Noch keine Vorschau. Der Hinweis über dem Blatt nennt den Grund.",
  sheetEngineFailed: "Das Blatt kann in diesem Browser nicht gezeichnet werden. Die Felder rechts und die PDF-Ansicht funktionieren weiter.",
  sheetOpenPdf: "Als PDF öffnen",
  statusFresh: "Vorschau aktuell",
  statusPending: "Vorschau wird aktualisiert …",
  statusInvalid: "Vorschau zeigt den letzten gültigen Stand",
  statusFailed: "Vorschau nicht verfügbar",
  statusIdle: "Vorschau folgt nach der ersten Eingabe",
  addPosition: "Position hinzufügen",
  issuerTitle: "Aussteller",
  issuerNote: "Firmierung, Anschrift, Bankverbindung und Pflichtangaben des Ausstellers stammen aus den zentralen Firmendaten. Im Editor sind sie nicht änderbar.",
  livePreviewHint: "Die Vorschau zeigt Ihre Eingaben sofort, auch ungespeicherte. Netto, Umsatzsteuer und Brutto rechnet der Server.",
  unsavedLeave: "Ungespeicherte Änderungen verwerfen?",
  unsavedLeaveText: "Der Entwurf hat ungespeicherte Änderungen. Wenn Sie die Seite verlassen, gehen sie verloren.",
  unsavedLeaveConfirm: "Änderungen verwerfen",
  review: "Prüfen und ausstellen",
  reviewTitle: "Rechnung prüfen",
  reviewLoading: "Die Prüfansicht wird erstellt …",
  reviewIntro: "So wird die Rechnung ausgestellt — dieselben Inhalte, dieselbe Seitenaufteilung. Nur die Rechnungsnummer kommt beim Ausstellen hinzu, und das Wasserzeichen entfällt.",
  reviewChecked: "Ich habe Empfänger, Positionen, Beträge und Zahlungsangaben geprüft.",
  reviewIssue: "Rechnung ausstellen",
  reviewBlocked: "Ausstellen ist derzeit gesperrt:",
  reviewClose: "Zurück zum Editor",
  reviewNoEmail: "Beim Ausstellen wird keine E-Mail versendet. Download, Druck und Versand sind danach eigene Schritte auf der Rechnungsseite.",
  sourceTitle: "Bezug",
  sourceHint: "Optional: Diese Rechnung bezieht sich auf eine gebuchte Sendung oder einen Lagerauftrag des Kunden. Die Positionen legen Sie selbst fest.",
  sourceNeedsCustomer: "Ein Bezug ist nur für bestehende Kunden möglich. Wählen Sie oben zuerst den Kunden.",
  sourceSearchShipment: "Bestellnummer suchen",
  sourceSearchOrder: "Auftragsnummer suchen",
  sourceSearchHint: "Leer lassen zeigt die jüngsten Vorgänge des Kunden (höchstens 20).",
  sourceEmpty: "Kein passender Vorgang gefunden.",
  sourceFailed: "Die Vorgänge konnten nicht geladen werden.",
  sourceChange: "Anderen Vorgang wählen",
  sourceRemove: "Bezug entfernen",
  sourceKindLegend: "Art der Rechnung",
  // Fehlt zu einer bestehenden Rechnung nur das PDF, entsteht keine neue Rechnung: Das PDF erzeugt die Rechnungsseite
  // („PDF erzeugen", derselbe eingefrorene Belegmodus, dieselbe Nummer). Der Editor führt nur dorthin.
  restoreTitle: "Nur das PDF fehlt",
  restoreText: (nr) => `Zu diesem Vorgang besteht bereits die Rechnung ${nr}; es fehlt nur ihr PDF. Dafür entsteht keine neue Rechnung: Das PDF wird auf der Rechnungsseite mit derselben Nummer erzeugt.`,
  restoreLink: (nr) => `Zur Rechnung ${nr}`,
  entryText: "Direkt auf der A4-Vorlage bearbeiten. Die Vorschau zeigt die Rechnung, wie sie gedruckt wird.",
});

// ── Bereich → Abschnitt und Feld ────────────────────────────────────────────────────────────────────────────────
// Ein Klick auf einen Bereich führt zum Abschnitt und fokussiert dessen erstes Feld. „Summen" führt zu den
// Serversummen (kein Eingabefeld), „Aussteller" zum Hinweis auf die zentralen Firmendaten.
const ZIELE = Object.freeze({
  recipient: { section: "recipient", label: "Empfänger", focusId: "mi-recipient-company" },
  meta: { section: "service", label: "Rechnungsangaben", focusId: "mi-service-from" },
  reference: { section: "service", label: "Ihre Referenz", focusId: "mi-reference" },
  intro: { section: "texts", label: "Einleitungstext", focusId: "mi-intro" },
  totals: { section: "totals", label: "Summen", focusId: "mi-totals-box" },
  payment: { section: "payment", label: "Zahlung", focusId: "mi-term" },
  closing: { section: "texts", label: "Schlusstext", focusId: "mi-closing" },
  issuer: { section: "issuer", label: "Zentrale Firmendaten", focusId: "mi-issuer-note" },
});

export function regionTarget(key) {
  const k = str(key);
  const pos = /^position:(\d{1,3})$/.exec(k);
  if (pos) {
    const i = Number(pos[1]);
    return { key: k, section: `position:${i}`, label: `Position ${i + 1}`, focusId: `mi-pos-${i}-description`, position: i };
  }
  // Nur eigene Schlüssel — „__proto__" oder „constructor" aus einer fremden Karte führen nirgendwohin.
  return Object.hasOwn(ZIELE, k) ? { key: k, ...ZIELE[k] } : null;
}

// Abschnitt eines fokussierten Felds (für die Markierung auf dem Blatt). id → Bereichsschlüssel.
export function regionKeyForField(id) {
  const s = str(id);
  const pos = /^mi-pos-(\d{1,3})-/.exec(s);
  if (pos) return `position:${Number(pos[1])}`;
  if (s.startsWith("mi-recipient-") || s.startsWith("mi-customer-") || s.startsWith("mi-kind-")) return "recipient";
  if (s === "mi-reference") return "reference";
  if (s.startsWith("mi-service-")) return "meta";
  if (s === "mi-intro") return "intro";
  if (s === "mi-closing") return "closing";
  if (s === "mi-term" || s === "mi-payment-note") return "payment";
  return null;
}

const prozent = (v) => `${(Math.round(v * 1e6) / 1e4).toString()}%`;

// Lage einer Klickfläche in Prozent der Seite — bleibt bei jeder Blattbreite richtig, ohne Neuberechnung.
export function regionStyle(region, page = PAGE_PT) {
  const r = region || {};
  const w = Number(page && page.width) || PAGE_PT.width;
  const h = Number(page && page.height) || PAGE_PT.height;
  return { left: prozent(r.x / w), top: prozent(r.top / h), width: prozent(r.w / w), height: prozent(r.h / h) };
}

const endlich = (v) => typeof v === "number" && Number.isFinite(v);

// Bereichskarte des Servers → bedienbare Flächen je Seite. Verworfen werden: der Seitenrahmen („page"),
// unbekannte Schlüssel, ungültige Maße, Seiten außerhalb des Dokuments. „Aussteller" erscheint nur einmal
// (erste Fläche), „Position hinzufügen" ist ein Ansatzpunkt ohne Fläche.
export function sheetRegions(regions, pageCount) {
  const n = Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 0;
  const seiten = Array.from({ length: n }, () => []);
  let anker = null;
  let ausstellerGesehen = false;
  for (const r of Array.isArray(regions) ? regions : []) {
    if (!r || typeof r !== "object") continue;
    const key = str(r.key);
    if (!Number.isInteger(r.page) || r.page < 1 || r.page > n) continue;
    if (![r.x, r.top, r.w, r.h].every(endlich) || r.w < 0 || r.h < 0) continue;
    if (key === "addPosition") { anker = { page: r.page, style: regionStyle({ x: r.x, top: r.top, w: 0, h: 0 }) }; continue; }
    const ziel = regionTarget(key);
    if (!ziel) continue;
    if (key === "issuer") { if (ausstellerGesehen) continue; ausstellerGesehen = true; }
    if (r.w < 1 || r.h < 1) continue;
    seiten[r.page - 1].push({ id: `${key}@${r.page}:${seiten[r.page - 1].length}`, key, page: r.page, style: regionStyle(r), target: ziel });
  }
  return { pages: seiten, addAnchor: anker };
}

// Flache Reihenfolge aller Flächen (Seite für Seite) — für die Pfeiltasten im Blatt.
export function flatRegions(sheet) {
  return (sheet && Array.isArray(sheet.pages) ? sheet.pages : []).flat();
}

// ── Nur die jüngste Antwort zählt ───────────────────────────────────────────────────────────────────────────────
export function createLatestGate() {
  let zaehler = 0;
  return Object.freeze({ next: () => ++zaehler, isLatest: (n) => n === zaehler, current: () => zaehler });
}

export function base64ToBytes(b64) {
  const bin = atob(str(b64));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isPdfBytes(bytes) {
  return bytes instanceof Uint8Array && bytes.length > 8
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

// ── Feldnamen für Fehlerlisten ──────────────────────────────────────────────────────────────────────────────────
const POSITION_FIELD = Object.freeze({
  description: "Bezeichnung", details: "Zusatztext", unit: "Einheit", quantity: "Menge", unitPrice: "Einzelpreis", discount: "Rabatt",
});
const FIELD = Object.freeze({
  recipientUserId: "Kunde", serviceDateFrom: "Leistungsdatum", serviceDateTo: "Ende des Leistungszeitraums",
  customerReference: "Ihre Referenz", paymentTermDays: "Zahlungsziel", introText: "Einleitungstext", closingText: "Schlusstext",
  paymentNote: "Zahlungsinformation", taxCase: "Steuerfall", positions: "Positionen", source: "Bezug",
  sourceShipmentId: "Bezug", sourceOrderId: "Bezug", billingKind: "Art der Rechnung", fingerprint: "Prüfung",
});

export function fieldLabelOf(formKey) {
  const k = str(formKey);
  const pos = /^positions\.(\d+)\.(\w+)$/.exec(k);
  if (pos) return `Position ${Number(pos[1]) + 1} · ${POSITION_FIELD[pos[2]] || pos[2]}`;
  const emp = /^recipient\.(\w+)$/.exec(k);
  if (emp) {
    const fd = RECIPIENT_FIELDS.find((f) => f.key === emp[1]);
    return `Empfänger · ${fd ? fd.label : emp[1] === "country" ? "Land" : emp[1]}`;
  }
  return FIELD[k] || k;
}

// Feldfehler → Liste „Feld: Text" (gleiche Felder nur einmal).
export function problemItems(errors) {
  const out = [];
  const gesehen = new Set();
  const eintraege = Array.isArray(errors)
    ? errors.map((e) => [formKeyOf(e && e.field), str(e && e.message)])
    : Object.entries(errors && typeof errors === "object" ? errors : {});
  for (const [key, text] of eintraege) {
    if (!text || gesehen.has(key)) continue;
    gesehen.add(key);
    out.push({ key, text: key ? `${fieldLabelOf(key)}: ${text}` : text });
  }
  return out;
}

// Antwort der Vorschau → Zustand für die Statusanzeige. kind: invalid (Eingaben prüfen, letztes gültiges Blatt
// bleibt) · failed (Server oder Netz) · auth (Sitzung — die zentrale Behandlung übernimmt).
export function previewProblem(status, body) {
  const b = body && typeof body === "object" ? body : {};
  if (status === 401 || status === 403) return { kind: "auth", text: "", items: [] };
  if (status === 400 && Array.isArray(b.errors)) {
    return { kind: "invalid", text: "Bitte prüfen Sie diese Angaben:", items: problemItems(b.errors) };
  }
  if (status === 409 && b.code === "MANUAL_INVOICE_POSITIONS_MISSING") {
    return { kind: "invalid", text: str(b.error) || "Die Rechnung braucht mindestens eine Position.", items: [] };
  }
  if (status === 409 && b.code === "VAT_RATE_INVALID") return { kind: "failed", text: str(b.error), items: [] };
  if (status === 429) return { kind: "failed", text: "Zu viele Vorschauen in kurzer Zeit. Bitte einen Moment warten.", items: [] };
  return { kind: "failed", text: "Die Vorschau konnte nicht erstellt werden. Ihre Eingaben bleiben erhalten.", items: [] };
}

export function clientProblem(errors) {
  return { kind: "invalid", text: "Bitte prüfen Sie diese Angaben:", items: problemItems(errors) };
}

// Statuszeile der Vorschau: Ton (fresh · pending · invalid · failed · idle) und Text.
export function previewStatus({ pending = false, problem = null, hasSheet = false } = {}) {
  if (pending) return { tone: "pending", text: EDITOR_TEXT.statusPending };
  if (problem && problem.kind === "invalid") return { tone: "invalid", text: hasSheet ? EDITOR_TEXT.statusInvalid : EDITOR_TEXT.statusIdle };
  if (problem && problem.kind === "failed") return { tone: "failed", text: EDITOR_TEXT.statusFailed };
  if (hasSheet) return { tone: "fresh", text: EDITOR_TEXT.statusFresh };
  return { tone: "idle", text: EDITOR_TEXT.statusIdle };
}

// ── Bezug: Sendung (B) oder Lagerauftrag (C) ────────────────────────────────────────────────────────────────────
export const SOURCE_KIND_TEXT = Object.freeze({
  none: "Kein Bezug (freie Rechnung)", shipment: "Gebuchte Sendung", order: "Lagerauftrag",
});
export const BILLING_KIND_TEXT = Object.freeze({ primary: "Erstrechnung", supplementary: "Nachberechnung" });
export const BILLING_KIND_HINT = Object.freeze({
  primary: "Die erste Rechnung zu diesem Vorgang. Nur möglich, wenn noch keine Rechnung besteht.",
  supplementary: "Zusätzliche, belegte Leistung zu einem bereits berechneten Vorgang — mit Verweis auf die Erstrechnung.",
});
const RECHNUNGSART = Object.freeze({
  automatic: "Einzelrechnung", consolidated: "Sammelrechnung", manual_primary: "manuelle Erstrechnung",
  manual_supplementary: "Nachberechnung",
});

export function formatDateDe(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(d);
}

export function invoiceLine(inv) {
  const i = inv && typeof inv === "object" ? inv : {};
  const zusatz = [RECHNUNGSART[i.kind] || "Rechnung"];
  if (i.cancelled === true) zusatz.push("storniert");
  if (i.test === true) zusatz.push("Testbeleg");
  return `${str(i.number) || "ohne Nummer"} (${zusatz.join(", ")})`;
}

// Treffer der Vorgangsauswahl → Anzeige. Zulässigkeit und Gründe stammen unverändert vom Server.
export function sourceOptionView(item) {
  const i = item && typeof item === "object" ? item : {};
  const b = i.billing && typeof i.billing === "object" ? i.billing : {};
  const kind = i.kind === "order" ? "order" : "shipment";
  const kinds = ["primary", "supplementary"].map((art) => {
    const k = b[art] && typeof b[art] === "object" ? b[art] : {};
    const gruende = Array.isArray(k.blockers) ? k.blockers : [];
    return {
      kind: art, label: BILLING_KIND_TEXT[art], allowed: k.allowed === true,
      reasons: gruende.map((g) => str(g && typeof g === "object" ? g.message : "") || "Für diesen Vorgang nicht zulässig."),
    };
  });
  const restore = b.restoreDocument && typeof b.restoreDocument === "object" && b.restoreDocument.invoiceId != null
    ? { invoiceId: b.restoreDocument.invoiceId, invoiceNumber: str(b.restoreDocument.invoiceNumber) } : null;
  return {
    id: i.id ?? null,
    kind,
    number: str(i.number) || (kind === "shipment" ? `Sendung ${str(i.id)}` : `Lagerauftrag ${str(i.id)}`),
    date: formatDateDe(i.date),
    invoices: (Array.isArray(b.invoices) ? b.invoices : []).map(invoiceLine),
    kinds,
    restore,
    supplementaryTo: str(b.supplementaryTo),
  };
}

// Kurzzeile des gewählten Bezugs (Kopf des Abschnitts, Prüfansicht).
export function sourceSummary(source) {
  const s = source && typeof source === "object" ? source : null;
  if (!s || !s.kind) return "";
  const art = s.kind === "order" ? "Lagerauftrag" : "Sendung";
  const kind = BILLING_KIND_TEXT[s.billingKind] || "";
  return [`${art} ${str(s.number)}`.trim(), kind].filter(Boolean).join(" · ");
}

// ── Prüfansicht ─────────────────────────────────────────────────────────────────────────────────────────────────
// Kurzfakten aus der Antwort der Prüfansicht (Serverwerte) und dem Formular (Empfänger, wie eingegeben).
export function reviewFacts(review, recipient) {
  const r = review && typeof review === "object" ? review : {};
  const t = r.totals && typeof r.totals === "object" ? r.totals : null;
  const e = recipient && typeof recipient === "object" ? recipient : {};
  const fakten = [];
  const empfaenger = [str(e.company), [str(e.zip), str(e.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  // wide: Textangaben stehen in der Prüfansicht über die ganze Breite (Beträge rechtsbündig in ihrer Spalte).
  fakten.push({ label: "Empfänger", value: empfaenger || "—", wide: true });
  if (t) {
    fakten.push({ label: "Netto", value: formatCents(Number(t.netCents)) });
    fakten.push({ label: `Umsatzsteuer ${str(t.vatRatePercent).replace(".", ",")} %`, value: formatCents(Number(t.vatCents)) });
    fakten.push({ label: "Rechnungsbetrag", value: formatCents(Number(t.grossCents)), strong: true });
  }
  if (Number.isInteger(r.pageCount)) fakten.push({ label: "Seiten", value: String(r.pageCount) });
  const bezug = sourceSummary(r.source);
  if (bezug) fakten.push({ label: "Bezug", value: bezug, wide: true });
  return fakten;
}

// Darf „Rechnung ausstellen" in der Prüfansicht aktiv sein? Nur mit Fingerabdruck, ohne Serversperre und mit
// ausdrücklicher Bestätigung. Die letzte Entscheidung trifft der Server unter der Zeilensperre.
export function reviewIssueState(review, { checked = false } = {}) {
  const r = review && typeof review === "object" ? review : null;
  if (!r || !/^[0-9a-f]{64}$/.test(str(r.fingerprint))) return { allowed: false, blocked: false };
  const sperren = Array.isArray(r.issueBlockers) ? r.issueBlockers : [];
  if (sperren.length) return { allowed: false, blocked: true };
  return { allowed: checked === true, blocked: false };
}
