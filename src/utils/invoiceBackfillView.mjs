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
  "issuer.managingDirectors": "Geschäftsführung",
  "bank.accountHolder": "Kontoinhaber", "bank.name": "Bankname", "bank.iban": "IBAN", "bank.bic": "BIC",
  "invoice.currency": "Rechnungswährung",
  "customer_snapshot": "Kundendaten (Firma)", "invoice_number": "Rechnungsnummer",
  "currency": "Rechnungswährung", "issuer_snapshot": "Ausstellerdaten", "payment_snapshot": "Zahlungsdaten",
  "service_snapshot": "Leistungsdaten", "amounts": "Beträge",
};
export const fieldLabel = (key) => FIELD_LABELS[key] || String(key ?? "—");

// Anzeige-Status je Kandidat: „Bereit" (schon ein PDF) · „Fehlt" (erzeugbar) · „Unvollständig"
// (historische Daten fehlen — nicht ohne Weiteres erzeugbar).
export function candidateStatusMeta(candidate) {
  const c = candidate || {};
  if (c.alreadyReady) return ["badge-green", "PDF vorhanden"];
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
    default: return { type: "error", text: "Die Vorschau-Erzeugung ist fehlgeschlagen." };
  }
}
