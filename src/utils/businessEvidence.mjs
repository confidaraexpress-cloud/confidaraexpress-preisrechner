// utils/businessEvidence.mjs — Unternehmerprüfung eines Kundenkontos im Admin (Go-Live Paket C).
//
// REIN: kein React, kein Netz. Hier steht, wie die Serverantwort gelesen, angezeigt und eine neue
// Prüfung vorbereitet wird; die Komponente rendert es nur.
//
// Inhalt:
//   • Erklärungen der Registrierung — Unternehmererklärung (§ 14 BGB) und AGB-Bestätigung mit der
//     belegten Fassung. Fehlen sie, ist das ehrlich „nicht erfasst" (Bestandskonto oder Client
//     ohne die Felder), nie eine vermutete Erklärung.
//   • Prüfvermerke — WIE ein Admin die Unternehmereigenschaft geprüft hat. Auch ohne Handels-
//     register prüfbar (Gewerbeanmeldung, sonstiger Nachweis mit Notiz).
// Die Freischaltung hängt NICHT an der Prüfung — sie ist Dokumentation, keine neue Sperre.
import { formatTimestamp } from "./adminSalesPartnerView.mjs";

// Abschließende Liste — wortgleich zu lib/registrationEvidence.js im Backend (dort zusätzlich
// als CHECK in der Datenbank). Eine neue Nachweisart braucht beide Seiten.
export const VERIFICATION_METHOD_OPTIONS = Object.freeze([
  Object.freeze({ value: "vat_id", label: "USt-IdNr. geprüft" }),
  Object.freeze({ value: "commercial_register", label: "Handels-, Partnerschafts- oder Genossenschaftsregister geprüft" }),
  Object.freeze({ value: "trade_registration", label: "Gewerbeanmeldung geprüft" }),
  Object.freeze({ value: "other_document", label: "Sonstiger Nachweis (siehe Notiz)" }),
]);
export const VERIFICATION_NOTE_MAX = 300;

export const BUSINESS_EVIDENCE_TEXTS = Object.freeze({
  title: "Unternehmerprüfung",
  loadError: "Die Nachweise zur Unternehmereigenschaft konnten nicht geladen werden.",
  businessLabel: "Unternehmererklärung bei der Registrierung",
  termsLabel: "AGB bei der Registrierung",
  lastCheckLabel: "Letzte Prüfung",
  notRecorded: "Nicht erfasst — das Konto wurde ohne diese Erklärung registriert (z. B. vor Einführung des Nachweises).",
  versionNotProven: "Fassung nicht belegt",
  notChecked: "Noch nicht dokumentiert",
  methodLabel: "Art des Nachweises",
  methodPlaceholder: "Bitte wählen",
  noteLabel: "Notiz",
  noteHelp: `Höchstens ${VERIFICATION_NOTE_MAX} Zeichen. Nur Art und Datum des Nachweises — keine weiteren personenbezogenen Daten.`,
  noteRequired: "Bitte geben Sie an, welcher Nachweis geprüft wurde.",
  methodRequired: "Bitte wählen Sie die Art des Nachweises.",
  noteTooLong: `Die Notiz darf höchstens ${VERIFICATION_NOTE_MAX} Zeichen haben.`,
  submit: "Prüfung festhalten",
  submitBusy: "Wird gespeichert…",
  saved: "Die Prüfung wurde festgehalten.",
  saveError: "Die Prüfung konnte nicht gespeichert werden.",
  history: "Frühere Prüfungen",
  gateHint: "Die Freischaltung hängt nicht von diesem Vermerk ab. Er dokumentiert, wie die Unternehmereigenschaft geprüft wurde.",
});

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Serverantwort → `{ declarations, verifications }` oder null (dann Ladefehler zeigen). */
export function selectBusinessEvidence(status, body) {
  if (status !== 200 || !body || typeof body !== "object") return null;
  const d = body.declarations && typeof body.declarations === "object" ? body.declarations : {};
  const business = d.businessCustomer && text(d.businessCustomer.declaredAt) ? { declaredAt: d.businessCustomer.declaredAt } : null;
  const terms = d.terms && text(d.terms.acknowledgedAt)
    ? { acknowledgedAt: d.terms.acknowledgedAt, version: text(d.terms.version) } : null;
  const verifications = (Array.isArray(body.verifications) ? body.verifications : [])
    .filter((v) => v && text(v.method) && text(v.verifiedAt))
    .map((v) => ({
      id: v.id,
      method: v.method,
      methodLabel: text(v.methodLabel) || methodLabelOf(v.method),
      note: text(v.note),
      verifiedAt: v.verifiedAt,
      verifiedByName: v.verifiedBy && text(v.verifiedBy.name) ? v.verifiedBy.name.trim() : null,
    }));
  return { declarations: { business, terms }, verifications };
}

export function methodLabelOf(method) {
  const o = VERIFICATION_METHOD_OPTIONS.find((x) => x.value === method);
  return o ? o.label : "Unbekannte Nachweisart";
}

export function businessDeclarationLine(evidence) {
  const b = evidence && evidence.declarations && evidence.declarations.business;
  return b ? `Abgegeben am ${formatTimestamp(b.declaredAt, { withTime: true })}` : BUSINESS_EVIDENCE_TEXTS.notRecorded;
}

// Getrennt, damit die Ansicht die Fassung ohne Umbruch im Datum („2026-|08") setzen kann.
export function termsDeclarationParts(evidence) {
  const t = evidence && evidence.declarations && evidence.declarations.terms;
  if (!t) return null;
  return {
    confirmed: `Bestätigt am ${formatTimestamp(t.acknowledgedAt, { withTime: true })}`,
    version: t.version ? `Fassung ${t.version}` : BUSINESS_EVIDENCE_TEXTS.versionNotProven,
  };
}

export function termsDeclarationLine(evidence) {
  const p = termsDeclarationParts(evidence);
  return p ? `${p.confirmed} (${p.version})` : BUSINESS_EVIDENCE_TEXTS.notRecorded;
}

export function verificationLine(v) {
  if (!v) return BUSINESS_EVIDENCE_TEXTS.notChecked;
  const wer = v.verifiedByName ? ` durch ${v.verifiedByName}` : "";
  return `${v.methodLabel}, ${formatTimestamp(v.verifiedAt, { withTime: true })}${wer}`;
}

/**
 * Prüft den Entwurf einer neuen Prüfung — dieselben Regeln wie der Server (der entscheidet).
 * @returns {{ok:true, body:{method:string, note?:string}}|{ok:false, field:string, error:string}}
 */
export function parseVerificationDraft({ method, note } = {}) {
  if (!VERIFICATION_METHOD_OPTIONS.some((o) => o.value === method)) {
    return { ok: false, field: "method", error: BUSINESS_EVIDENCE_TEXTS.methodRequired };
  }
  const n = typeof note === "string" ? note.replace(/\s+/g, " ").trim() : "";
  if (n.length > VERIFICATION_NOTE_MAX) return { ok: false, field: "note", error: BUSINESS_EVIDENCE_TEXTS.noteTooLong };
  if (method === "other_document" && !n) return { ok: false, field: "note", error: BUSINESS_EVIDENCE_TEXTS.noteRequired };
  return { ok: true, body: n ? { method, note: n } : { method } };
}
