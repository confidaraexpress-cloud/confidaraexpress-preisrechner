// ─────────────────────────────────────────────────────────────────────────────
// PDF-Backfill bestehender, tatsächlich gebuchter Rechnungen (Phase 5, korrigierter
// Standardprozess) — reine, framework-freie Anzeigelogik (.mjs, wie invoiceView/adminInvoices).
// Bündelt die testbare Logik der Admin-Backfill-Oberfläche: Status-Anzeige, verständliche
// Feld-Labels und die Ableitung, ob die Erzeugungs-Aktion für einen Kandidaten freigeschaltet
// ist. Kein React, kein Netzwerk. Das Backend bleibt in allem autoritativ (generatable/
// alreadyReady kommen vom Server) — hier wird nichts „erraten" oder clientseitig erzwungen.
//
// WICHTIG: Dieses Modul kennt KEINE Produktiv-Konvertierung, KEINE Testkonto-Allowlist und
// KEINEN rückwirkenden E-Mail-Versand — diese Sonderpfade wurden auf ausdrücklichen
// Betreiberwunsch entfernt. Der einzige Kandidaten-Zustand ist: „hat schon ein PDF" oder
// „braucht noch eines" (ggf. weil historische Daten fehlen).
// ─────────────────────────────────────────────────────────────────────────────

// Gesamt-Readiness (Produktionsbereitschaft-Anzeige) → [badge-Klasse, Label]. Rein informativ —
// blockiert seit Phase 5 (korrigiert) NICHTS mehr (weder den PDF-Backfill noch die Anzeige).
export function readinessMeta(readiness) {
  if (!readiness || typeof readiness !== "object") return ["badge-gray", "Unbekannt"];
  if (readiness.testMode === true) return ["badge-yellow", "Testmodus aktiv"];
  if (readiness.ready === true) return ["badge-green", "Produktivbereit"];
  return ["badge-red", "Nicht bereit"];
}

// Verständliche deutsche Labels für die serverseitigen Feld-Schlüssel (missingFields/
// placeholderFields der Readiness-Anzeige). Unbekannt → Rohschlüssel (harmlos, kein Raten).
const FIELD_LABELS = {
  "issuer.name": "Firmierung", "issuer.legalForm": "Rechtsform", "issuer.street": "Straße",
  "issuer.postalCode": "PLZ", "issuer.city": "Ort", "issuer.country": "Land",
  "issuer.email": "Rechnungs-E-Mail", "issuer.phone": "Telefon",
  "issuer.taxNumber": "Steuernummer", "issuer.vatId": "USt-IdNr.",
  "issuer.taxNumberOrVatId": "Steuernummer oder USt-IdNr.",
  "issuer.registerCourt": "Registergericht", "issuer.registerNumber": "Handelsregisternummer",
  "issuer.managingDirectors": "Geschäftsführung", "issuer.seat": "Sitz der Gesellschaft",
  "bank.accountHolder": "Kontoinhaber", "bank.name": "Bankname", "bank.iban": "IBAN", "bank.bic": "BIC",
  "invoice.currency": "Rechnungswährung",
  "customer_snapshot": "Kundendaten (Firma)", "invoice_number": "Rechnungsnummer",
  "currency": "Rechnungswährung", "issuer_snapshot": "Ausstellerdaten", "payment_snapshot": "Zahlungsdaten",
  "service_snapshot": "Leistungsdaten", "amounts": "Beträge",
};
export const fieldLabel = (key) => FIELD_LABELS[key] || String(key ?? "—");

// Geschäftsbriefangaben (§ 35a GmbHG) — eigener, additiver Block der Readiness-Antwort. Er meldet
// nur, was in Mail-Fußzeilen, Auftragsbestätigungen und Rechnungen noch fehlt oder noch ein
// Platzhalter ist (`placeholderFields`; die Fußzeile lässt solche Werte weg), und berührt weder
// `ready` noch irgendeine Sperre. Ein älteres Backend liefert ihn nicht → null (kein Block, kein Raten).
export function businessLetterView(readiness) {
  const b = readiness && typeof readiness === "object" ? readiness.businessLetter : null;
  if (!b || typeof b !== "object" || typeof b.ready !== "boolean") return null;
  const liste = (v) => (Array.isArray(v) ? v.filter((f) => typeof f === "string" && f) : []);
  const missing = liste(b.missingFields);
  const placeholders = liste(b.placeholderFields);
  return {
    ready: b.ready === true && missing.length === 0 && placeholders.length === 0,
    registerRequired: b.registerRequired === true,
    missing,
    placeholders,
  };
}

// ── Paritätsaudit B8: zwei Prüfungen der Readiness-Antwort, die die Seite bis hierher nicht zeigte ──
// `checks.invoice_document_generation`: Probelauf des ECHTEN Erzeugungspfads (H2) — würde eine
// produktive Rechnung mit der aktuellen Konfiguration ein PDF bekommen? `legalDocuments`: Stand des
// aktiven Rechtsdokument-Sets (Paket 4-D). Beide liefern nur Status, Codes und Feldnamen, nie Werte.
// Ein älteres Backend ohne den Block → null (keine Zeile, kein Raten). Ein unbekannter Code bleibt
// als Code sichtbar (`code`), statt eine Ursache zu erfinden.
const GENERATION_CODE_LABELS = Object.freeze({
  vat_rate_invalid: "Steuersatz-Konfiguration ungültig",
  invoice_claim_projection_incomplete: "Datenbankprojektion der Rechnung unvollständig",
  invoice_snapshot_not_production_ready: "Aussteller- oder Bankdaten nicht produktionsreif",
  production_invoice_blocked_in_test_mode: "Testmodus aktiv — es entstehen keine Produktivdokumente",
  ambiguous_invoice_document_mode: "Dokumentmodus nicht eindeutig",
  classified_test_document: "Als Testdokument eingestuft",
  reconstructed_preview_requires_test_mode: "Nur als interne Vorschau erzeugbar",
});
const listeVon = (v) => (Array.isArray(v) ? v.filter((f) => typeof f === "string" && f) : []);

export function documentGenerationView(readiness) {
  const c = readiness && typeof readiness === "object" && readiness.checks && typeof readiness.checks === "object"
    ? readiness.checks.invoice_document_generation : null;
  if (!c || typeof c !== "object" || typeof c.ready !== "boolean") return null;
  if (c.ready === true) return { ready: true, label: "Bereit", code: null, missing: [], placeholders: [] };
  const code = typeof c.code === "string" ? c.code : "";
  const bekannt = Object.prototype.hasOwnProperty.call(GENERATION_CODE_LABELS, code);
  return {
    ready: false,
    label: bekannt ? GENERATION_CODE_LABELS[code] : "Blockiert",
    code: bekannt ? null : (code || null),
    missing: listeVon(c.missingFields),
    placeholders: listeVon(c.placeholderFields),
  };
}

const LEGAL_REASON_LABELS = Object.freeze({
  lookup_failed: "Prüfung fehlgeschlagen",
  no_active_set: "Kein aktives Rechtsdokument-Set",
  no_active_legal_set: "Kein aktives Rechtsdokument-Set",
  ambiguous_active_legal_set: "Mehrere aktive Sets — nicht eindeutig",
  incomplete_legal_set: "Aktives Set unvollständig",
  set_incomplete: "Aktives Set unvollständig",
});
const LEGAL_TYPE_LABELS = Object.freeze({ terms: "AGB", privacy: "Datenschutzhinweise" });
const LEGAL_ASSET_LABELS = Object.freeze({
  invalid_asset_path: "Dateipfad ungültig",
  asset_missing: "Datei fehlt",
  invalid_pdf: "keine gültige PDF-Datei",
  size_mismatch: "Dateigröße weicht ab",
  sha256_mismatch: "Prüfsumme weicht ab",
  unknown: "nicht prüfbar",
});

function legalReasonLabel(reason) {
  if (Object.prototype.hasOwnProperty.call(LEGAL_REASON_LABELS, reason)) return LEGAL_REASON_LABELS[reason];
  const fehlt = /^([a-z]+)_missing_in_set$/.exec(reason);
  if (fehlt && LEGAL_TYPE_LABELS[fehlt[1]]) return `${LEGAL_TYPE_LABELS[fehlt[1]]} fehlen im aktiven Set`;
  const datei = /^([a-z]+)_asset_([a-z0-9_]+)$/.exec(reason);
  if (datei && LEGAL_TYPE_LABELS[datei[1]] && LEGAL_ASSET_LABELS[datei[2]]) {
    return `PDF der ${LEGAL_TYPE_LABELS[datei[1]]}: ${LEGAL_ASSET_LABELS[datei[2]]}`;
  }
  return null;
}

export function legalDocumentsView(readiness) {
  const l = readiness && typeof readiness === "object" ? readiness.legalDocuments : null;
  if (!l || typeof l !== "object" || typeof l.ready !== "boolean") return null;
  const setKey = l.activeSet && typeof l.activeSet === "object" && typeof l.activeSet.setKey === "string"
    ? l.activeSet.setKey : null;
  const gateEnabled = l.gateEnabled === true;
  if (l.ready === true) return { ready: true, label: "Bereit", setKey, gateEnabled, code: null };
  const reason = typeof l.reason === "string" ? l.reason : "";
  const label = legalReasonLabel(reason);
  return { ready: false, label: label || "Nicht bereit", setKey, gateEnabled, code: label ? null : (reason || null) };
}

// Anzeige-Status je Kandidat: „Bereit" (schon ein PDF) · „Vorschau erzeugbar (Snapshot wird
// rekonstruiert)" (Alt-Rechnung ohne Snapshots — im Testbetrieb aus gespeicherten Daten
// rekonstruierbar) · „Fehlt" (erzeugbar, Snapshots vorhanden) · „Unvollständig" (historische Daten
// fehlen und lassen sich nicht zuverlässig rekonstruieren — nicht erzeugbar).
export function candidateStatusMeta(candidate) {
  const c = candidate || {};
  if (c.alreadyReady) return ["badge-green", "PDF vorhanden"];
  if (c.generatable && c.reconstructionNeeded) return ["badge-blue", "Snapshot wird für interne Vorschau rekonstruiert"];
  if (c.generatable) return ["badge-blue", "PDF fehlt"];
  return ["badge-yellow", "Daten unvollständig"];
}

// Ist die Erzeugungs-Aktion für diesen Kandidaten freigeschaltet? Rein aus der serverseitigen
// Bewertung abgeleitet — NIE clientseitig „freigeschaltet" (das Backend prüft es beim Aufruf
// zusätzlich autoritativ erneut).
export function canBackfillCandidate(candidate) {
  return !!candidate && candidate.generatable === true;
}

// Verständliche Rückmeldung für das Ergebnis eines Backfill-Aufrufs (outcome aus dem Backend).
// type ∈ success|info|error für die Alert-Darstellung.
export function backfillOutcomeMessage(outcome) {
  switch (outcome) {
    case "generated": return { type: "success", text: "Die interne Vorschau wurde erzeugt (Testdokument mit Wasserzeichen)." };
    case "already_ready": return { type: "info", text: "Diese Rechnung hat bereits ein fertiges PDF — keine Änderung." };
    case "in_progress": return { type: "info", text: "Die Erzeugung läuft bereits." };
    case "not_booked": return { type: "error", text: "Die zugehörige Sendung ist nicht (mehr) gebucht — keine Vorschau möglich." };
    // Alt-Rechnung, deren historische Daten sich nicht zuverlässig rekonstruieren lassen (z. B. Netto/
    // USt fehlen) — es werden bewusst KEINE Zahlen erfunden.
    case "incomplete": return { type: "error", text: "Für diese Rechnung fehlen historische Daten, die sich nicht zuverlässig rekonstruieren lassen — keine Vorschau möglich." };
    default: return { type: "error", text: "Die Vorschau-Erzeugung ist fehlgeschlagen." };
  }
}
