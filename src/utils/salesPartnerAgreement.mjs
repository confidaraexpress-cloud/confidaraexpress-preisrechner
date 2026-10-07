// ── Vertriebspartnervereinbarung: Fassung, Gültigkeit, registriertes Dokument ──
//
// Die Vereinbarung SELBST ist ausschließlich die beim Server registrierte PDF.
// Die Oberfläche sagt nur, welche Fassung gilt (Version, Gültigkeit) und wo das
// Dokument liegt — sie formuliert keinen Vertragstext und rät keinen Ort.
//
// Drei Antworten tragen eine Fassung:
//   • GET /api/sales-partner/agreement      → { agreement: { title, version, effectiveFrom,
//                                               effectiveTo|null, documentPath } | null }
//   • GET /api/sales-partner/public-config  → … agreement: { version, effectiveFrom,
//                                               effectiveTo|null, documentPath } | null
//   • GET /api/sales-partner/me/agreement   → { acceptedVersion, acceptedAt,
//                                               document: { version, effectiveFrom, documentPath } | null }
//
// `documentPath` ist ein API-Pfad („/api/legal/…"); das Dokument liefert der
// API-Host öffentlich aus, mit `X-Frame-Options: DENY` — es wird deshalb nie
// eingebettet, sondern als Link in einem neuen Tab geöffnet. Ein Pfad, der nicht
// auf diese API zeigt (absolute URL, „//host", Leerraum, Anführungszeichen),
// ergibt KEINEN Link — dieselbe Regel wie für jedes Sendungsdokument.
//
// Tage kommen als „YYYY-MM-DD" und werden ohne Datumsobjekt umgestellt
// (salesPartnerView.formatIsoDate); ein anderes Format ergibt „—". Zeitpunkte
// (ISO) erscheinen in der Systemregion des Browsers.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { isSafeApiPath } from "./shipmentDocumentsView.mjs";
import { formatIsoDate } from "./salesPartnerView.mjs";

export const AGREEMENT_TEXTS = Object.freeze({
  title: "Vertriebspartnervereinbarung",
  open: "Dokument öffnen",
  opensInNewTab: "(öffnet in einem neuen Tab)",
  none: "Derzeit ist keine Fassung der Vertriebspartnervereinbarung veröffentlicht.",
  noDocument: "Für diese Fassung ist kein registriertes Dokument hinterlegt.",
  loadError: "Die Vertriebspartnervereinbarung konnte nicht geladen werden.",
  retryHint: "Bitte versuchen Sie es erneut.",
  accountLoadError: "Ihre Vertragsangaben konnten nicht geladen werden.",
  notRecorded: "Nicht hinterlegt",
});

const objOrNull = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Ein Dokumentpfad auf DIESE API — oder null (kein Link). */
export function agreementDocumentPath(raw) {
  return isSafeApiPath(raw) ? raw.trim() : null;
}

/** Eine Fassung: { version, effectiveFrom, effectiveTo, documentPath } oder null.
 *  Ohne Version ist es keine Fassung, auf die sich jemand beziehen könnte. */
export function normalizeAgreement(raw) {
  const a = objOrNull(raw);
  const version = a ? str(a.version) : null;
  if (!version) return null;
  return {
    version,
    effectiveFrom: str(a.effectiveFrom),
    effectiveTo: str(a.effectiveTo),
    documentPath: agreementDocumentPath(a.documentPath),
  };
}

/** GET /api/sales-partner/agreement → { ok, agreement }.
 *  `agreement: null` ist eine vollwertige Antwort (derzeit keine veröffentlichte
 *  Fassung). Eine Antwort ohne lesbare Fassung ist dagegen ein Ladefehler — sie
 *  wird nicht als „keine Fassung" ausgegeben, denn das wäre eine Behauptung. */
export function readAgreementResponse(raw) {
  const d = objOrNull(raw);
  if (!d) return { ok: false, agreement: null };
  if (d.agreement === null) return { ok: true, agreement: null };
  const agreement = normalizeAgreement(d.agreement);
  return agreement ? { ok: true, agreement } : { ok: false, agreement: null };
}

/** „Fassung 1.0"; ohne Version „—". */
export function agreementVersionLabel(version) {
  const v = str(version);
  return v ? `Fassung ${v}` : "—";
}

/** „Gültig ab 01.10.2026" bzw. „Gültig ab 01.10.2026 bis 31.12.2026"; ohne
 *  lesbaren Tag null (dann entfällt die Zeile — es wird nichts geschätzt). */
export function agreementValidityLabel(agreement) {
  const ab = formatIsoDate(agreement?.effectiveFrom);
  const bis = formatIsoDate(agreement?.effectiveTo);
  if (ab !== "—" && bis !== "—") return `Gültig ab ${ab} bis ${bis}`;
  if (ab !== "—") return `Gültig ab ${ab}`;
  if (bis !== "—") return `Gültig bis ${bis}`;
  return null;
}

/** Zeitpunkt (ISO) → „07.10.2026, 14:30" in der Systemregion; ein reiner Tag
 *  bleibt ein Tag; Unlesbares „—", nie „Invalid Date". */
export function formatDateTime(value) {
  const v = str(value);
  if (!v) return "—";
  if (TAG.test(v)) return formatIsoDate(v);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Partnerportal · Konto · Vertrag ─────────────────────────────────────────

/** GET /api/sales-partner/me/agreement → { acceptedVersion, acceptedAt, document }. */
export function normalizePartnerAgreement(raw) {
  const d = objOrNull(raw) || {};
  const doc = objOrNull(d.document);
  return {
    acceptedVersion: str(d.acceptedVersion),
    acceptedAt: str(d.acceptedAt),
    document: doc ? {
      version: str(doc.version),
      effectiveFrom: str(doc.effectiveFrom),
      documentPath: agreementDocumentPath(doc.documentPath),
    } : null,
  };
}

/** Datenzeilen der Kontofläche „Vertrag" — fehlende Werte heißen „Nicht hinterlegt". */
export function partnerAgreementRows(agreement) {
  const a = agreement || normalizePartnerAgreement(null);
  const fassung = a.acceptedVersion ? agreementVersionLabel(a.acceptedVersion) : null;
  const am = formatDateTime(a.acceptedAt);
  return [
    { key: "agreement", k: "Vereinbarung", v: AGREEMENT_TEXTS.title, empty: false },
    { key: "version", k: "Akzeptierte Fassung", v: fassung || AGREEMENT_TEXTS.notRecorded, empty: !fassung },
    { key: "acceptedAt", k: "Akzeptiert am", v: am !== "—" ? am : AGREEMENT_TEXTS.notRecorded, empty: am === "—" },
  ];
}

/** Der Dokumentpfad der akzeptierten Fassung — oder null („kein registriertes Dokument"). */
export function partnerAgreementDocumentPath(agreement) {
  return agreement && agreement.document ? agreement.document.documentPath : null;
}
