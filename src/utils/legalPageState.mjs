// ── Öffentliche Rechtsseiten: welche Fassung zeigt die Seite? ─────────────────
//
// Die Seite /agb (bzw. /datenschutz) muss denselben Vertrag zeigen, dem der Kunde
// im Checkout zustimmt — die AKTIVE Fassung der Legal-Registry. Der Server sagt in
// GET /api/legal/current, welche das ist, und — nur wenn sie eine trägt — wo ihre
// Webfassung liegt (`contentPath`, aus derselben Datei erzeugt wie die PDF).
//
// Daraus folgen genau vier Zustände:
//   content  aktive Fassung mit Webfassung → deren Text (vom Server)
//   legacy   aktive Fassung ist die, deren Text heute im Frontend steht
//            (AGB 2026-08, Datenschutz 2026-07; legal/README.md: die PDFs wurden
//            aus genau diesen Seiten erzeugt) — oder die Registry ist nicht
//            eingerichtet (503 LEGAL_DOCUMENTS_NOT_CONFIGURED, etwa lokal)
//   pdf      eine ANDERE Fassung ist aktiv, aber ohne Webfassung → kein Text aus
//            dem Frontend (das wäre eine andere Fassung), nur ihre PDF
//   error    keine verwertbare Antwort → Fehlerhinweis mit „Erneut versuchen"
//
// Niemals wird ein Text gezeigt, der zu einer anderen Fassung gehört als der aktiven.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { isSafeApiPath } from "./shipmentDocumentsView.mjs";
import { formatIsoDate } from "./salesPartnerView.mjs";

export const LEGACY_PAGE_VERSIONS = Object.freeze({ terms: "2026-08", privacy: "2026-07" });

const objOrNull = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Abrufpfad einer Webfassung — nur auf genau diese API und genau diesen Typ. */
export function safeContentPath(raw, documentType) {
  const p = isSafeApiPath(raw) ? raw.trim() : null;
  if (!p) return null;
  return p.startsWith(`/api/legal/${documentType}/`) && p.endsWith("/inhalt") ? p : null;
}

/** GET /api/legal/current → Zustand der Seite für `documentType`. */
export function readLegalCurrent(status, body, documentType) {
  const b = objOrNull(body);
  if (status === 503 && b && b.code === "LEGAL_DOCUMENTS_NOT_CONFIGURED") {
    return { mode: "legacy", version: null, documentPath: null, contentPath: null };
  }
  if (status !== 200 || !b || !Array.isArray(b.documents)) return { mode: "error" };
  const doc = b.documents.map(objOrNull).find((d) => d && d.type === documentType);
  if (!doc || !str(doc.version)) return { mode: "error" };
  const version = str(doc.version);
  const documentPath = isSafeApiPath(doc.url) ? doc.url.trim() : null;
  const contentPath = safeContentPath(doc.contentPath, documentType);
  if (contentPath) return { mode: "content", version, documentPath, contentPath };
  if (version === LEGACY_PAGE_VERSIONS[documentType]) return { mode: "legacy", version, documentPath, contentPath: null };
  return { mode: "pdf", version, documentPath, contentPath: null };
}

/** GET …/inhalt → { ok, markdown, version, effectiveFrom, effectiveTo, documentPath }. */
export function readLegalContent(status, body, expectedVersion) {
  const b = objOrNull(body);
  if (status !== 200 || !b) return { ok: false };
  const markdown = typeof b.markdown === "string" ? b.markdown : "";
  if (!/^# \S/.test(markdown)) return { ok: false };
  // Die Webfassung muss zur aktiven Fassung gehören — sonst wäre es ein anderer Vertrag.
  if (expectedVersion && str(b.version) !== expectedVersion) return { ok: false };
  return {
    ok: true,
    markdown,
    version: str(b.version),
    effectiveFrom: str(b.effectiveFrom),
    effectiveTo: str(b.effectiveTo),
    documentPath: isSafeApiPath(b.documentPath) ? b.documentPath.trim() : null,
  };
}

/** „Fassung 2026-12 · gültig ab 01.12.2026“ — ohne lesbaren Tag nur die Fassung. */
export function legalVersionLine({ version, effectiveFrom } = {}) {
  const v = str(version);
  if (!v) return null;
  const ab = formatIsoDate(effectiveFrom);
  return ab !== "—" ? `Fassung ${v} · gültig ab ${ab}` : `Fassung ${v}`;
}

export const LEGAL_PAGE_TEXTS = Object.freeze({
  loading: "Die gültige Fassung wird geladen …",
  loadError: "Die gültige Fassung konnte nicht geladen werden.",
  retryHint: "Bitte versuchen Sie es erneut.",
  pdfOnly: (version) => `Gültig ist die Fassung ${version}. Ihr Wortlaut steht als PDF bereit.`,
  openPdf: "Fassung als PDF öffnen",
  opensInNewTab: "(öffnet in einem neuen Tab)",
});
