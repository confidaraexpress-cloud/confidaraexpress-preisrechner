// ─────────────────────────────────────────────────────────────────────────────
// Produktions-Cutover & Backfill (Phase 5) — reine, framework-freie Anzeigelogik
// (.mjs, wie invoiceView/adminInvoices). Bündelt die testbare Logik der Admin-
// Backfill-Oberfläche: Klassifikations-/Readiness-Anzeige, verständliche Feld-/
// Warnungs-Labels und die Ableitung, WELCHE Aktion je Kandidat freigeschaltet ist.
// Kein React, kein Netzwerk. Das Backend bleibt in allem autoritativ: eligibility,
// Klassifikation und readiness kommen vom Server; hier wird nichts „erraten" oder
// clientseitig erzwungen — die Buttons spiegeln nur die serverseitige Realität.
// ─────────────────────────────────────────────────────────────────────────────

// [badge-Klasse, Kurzlabel, Beschreibung] je Klassifikation A–F. Unbekannt → grau.
const CLASSIFICATION_META = {
  A: ["badge-blue", "A · Backfill-fähig", "Echte Buchung, vollständig, noch kein PDF."],
  B: ["badge-blue", "B · Backfill-fähig", "Echte Buchung, vollständig, Test-PDF vorhanden."],
  C: ["badge-yellow", "C · Unvollständig", "Echte Buchung, aber historische Daten unvollständig."],
  D: ["badge-gray", "D · Test/Entwicklung", "Keine echte gebuchte Sendung bzw. Testdaten."],
  E: ["badge-green", "E · Produktiv", "Bereits produktiv und vollständig."],
  F: ["badge-red", "F · Inkonsistent", "Inkonsistent oder doppelt — manuelle Prüfung nötig."],
};
export const classificationMeta = (c) => CLASSIFICATION_META[c] || ["badge-gray", c ?? "—", ""];

// Gesamt-Readiness → [badge-Klasse, Label]. Testmodus hat Vorrang vor „nicht bereit"
// (er ist der häufigste, bewusst gesetzte Grund, warum noch keine echte Rechnung entsteht).
export function readinessMeta(readiness) {
  if (!readiness || typeof readiness !== "object") return ["badge-gray", "Unbekannt"];
  if (readiness.testMode === true) return ["badge-yellow", "Testmodus aktiv"];
  if (readiness.ready === true) return ["badge-green", "Produktivbereit"];
  return ["badge-red", "Nicht bereit"];
}

// Verständliche deutsche Labels für die serverseitigen Feld-Schlüssel (missingFields/
// placeholderFields). Unbekannt → Rohschlüssel (harmlos, kein Raten). Es werden NUR
// Feldnamen angezeigt — die Antwort trägt bewusst keine Ausstellerwerte/Secrets.
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
  "customer.company": "Kundenfirma", "customer.email": "Kunden-E-Mail", "customer.billingAddress": "Rechnungsadresse",
  "price.net": "Nettobetrag", "price.vat": "USt-Betrag", "price.gross": "Bruttobetrag",
  "service.date": "Leistungsdatum", "invoice.number": "Rechnungsnummer",
};
export const fieldLabel = (key) => FIELD_LABELS[key] || String(key ?? "—");

// Verständliche Labels für die Klassifikations-Warnungen (codes aus dem Backend).
const WARNING_LABELS = {
  missing_order_number: "Keine JUMiNGO-Auftragsnummer hinterlegt",
  document_mode_unknown: "Dokumentmodus unbekannt (Altbestand)",
  test_markers_in_snapshot: "Testmarker in den Kundendaten",
  duplicate_original_invoice: "Weitere Originalrechnung für dieselbe Sendung",
  amount_gross_mismatch: "Betrag weicht von der Bruttosumme ab",
  owner_missing: "Zugehöriger Kunde fehlt",
  shipment_missing: "Referenzierte Sendung existiert nicht",
};
export const warningLabel = (code) => WARNING_LABELS[code] || String(code ?? "—");

// Ist die Rechnung aktuell ein PRODUKTIV-Dokument? Spiegelt die Server-Policy exakt:
// fertiges Dokument UND is_test_document EXPLIZIT false. (true/NULL = Test/unbekannt.)
export function isProductionCandidate(candidate) {
  return !!candidate && candidate.documentStatus === "ready" && candidate.isTestDocument === false;
}

// Wurde die Rechnung rückwirkend produktiv erzeugt? (documentBackfilledAt gesetzt.)
export function isBackfilled(candidate) {
  const v = candidate && candidate.documentBackfilledAt;
  return v != null && String(v).trim() !== "";
}

// Welche Aktionen sind für einen Kandidaten freigeschaltet? Alles rein aus den
// serverseitigen eligibility-Flags + Dokumentstatus abgeleitet — NIE clientseitig
// „freigeschaltet". Ein Button ist genau dann aktiv, wenn das Backend die Aktion
// objektiv zulässt (das Backend prüft es zusätzlich autoritativ erneut).
export function backfillRowActions(candidate) {
  const c = candidate || {};
  const production = isProductionCandidate(c);
  return {
    // „Produktives PDF rückwirkend erzeugen" — nur Klasse A/B.
    canBackfill: c.eligibleForProductionBackfill === true,
    // „Produktives PDF ansehen" — nur wenn ein PRODUKTIV-Dokument vorliegt.
    canViewProduction: production,
    // „Rückwirkende Rechnung senden" — nur für rückwirkend erzeugte, noch nicht
    //   versendete Produktivrechnungen (documentBackfilledAt gesetzt + eligibleForEmail).
    canSendBackfilledEmail: production && isBackfilled(c) && c.eligibleForEmail === true,
  };
}

// Verständliche Rückmeldung für das Ergebnis eines Backfill-Aufrufs (outcome aus dem
// Backend). type ∈ success|info|error für die Alert-Darstellung.
export function backfillOutcomeMessage(outcome) {
  switch (outcome) {
    case "backfilled": return { type: "success", text: "Das produktive Rechnungsdokument wurde rückwirkend erzeugt." };
    case "already_production": return { type: "info", text: "Diese Rechnung ist bereits produktiv — keine Änderung." };
    case "not_eligible": return { type: "error", text: "Diese Rechnung ist nicht für einen Produktiv-Backfill geeignet." };
    case "blocked": return { type: "error", text: "Produktivbetrieb nicht bereit — bitte zuerst die Produktionsbereitschaft herstellen." };
    default: return { type: "error", text: "Die rückwirkende Erzeugung ist fehlgeschlagen." };
  }
}

// Verständliche Rückmeldung für den rückwirkenden E-Mail-Versand.
export function backfillEmailOutcomeMessage(outcome) {
  switch (outcome) {
    case "sent": return { type: "success", text: "Die rückwirkende Rechnung wurde per E-Mail versendet." };
    case "already_sent": return { type: "info", text: "Diese Rechnung wurde bereits versendet — kein erneuter Versand." };
    case "in_progress": return { type: "info", text: "Ein Versand läuft bereits." };
    case "blocked": return { type: "error", text: "Versand gesperrt (Testdokument/Konfiguration). Bitte Produktionsbereitschaft prüfen." };
    default: return { type: "error", text: "Der Versand ist fehlgeschlagen." };
  }
}
