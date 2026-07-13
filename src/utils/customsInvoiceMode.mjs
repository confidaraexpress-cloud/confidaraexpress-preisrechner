// Reine, framework-freie Logik (.mjs, wie kpis.mjs/bookingGate.mjs/customsInvoiceMeta.mjs)
// für den INTERNEN Confidara-UI-Rechnungstyp der Zollrechnung. KEIN JUMiNGO-Feld,
// KEIN /book-Key — ausschließlich UI-/Validierungslogik. Betrifft nie Kundenpreis,
// Confidara-Rechnung, MwSt, Zahlungsziel oder Versicherung.

export const PROFORMA = "proforma";
export const COMMERCIAL = "commercial";

// Exportgrund-Enum „Commercial" (intern; Anzeige „Verkauf") = gewerblich →
// eigene Handelsrechnung zwingend, Proforma nicht erlaubt. Autoritative
// Exportgrund-Liste bleibt im CustomsModule (EXPORT_REASONS) — hier nur das Gate.
export function isCommercialOnly(exportReason) {
  return exportReason === "Commercial";
}

// Bewusste Confidara-Produktregel für Init und Exportgrund-Wechsel:
//   - Gewerblich (Commercial)         → immer commercial (erzwungen)
//   - anderer Grund, gültige Auswahl  → bestehende Auswahl erhalten (auch commercial)
//   - anderer Grund, keine Auswahl    → proforma als Confidara-Standard
// (Nicht als vollständiger Beweis jedes internen JUMiNGO-Defaults zu verstehen.)
export function resolveInvoiceMode(exportReason, currentMode) {
  if (isCommercialOnly(exportReason)) return COMMERCIAL;
  if (currentMode === PROFORMA || currentMode === COMMERCIAL) return currentMode;
  return PROFORMA;
}

// Darf im UI aktiv Proforma gewählt werden? Nein bei gewerblichem Exportgrund
// ODER wenn ein Handelsrechnungs-Dokument vorhanden/in Arbeit ist (H-Regel:
// kein stiller Wechsel, während ein Dokument hinterlegt/hochgeladen/gelöscht wird).
export function canSelectProforma(exportReason, docStatus) {
  if (isCommercialOnly(exportReason)) return false;
  return docStatus !== "present" && docStatus !== "uploading" && docStatus !== "deleting";
}

// Sind die ZUSÄTZLICHEN commercial-Pflichten erfüllt? Nur im commercial-Modus:
// getrimmte Rechnungsnummer vorhanden, gültiges Rechnungsdatum, Dokument backend-
// bestätigt (docStatus === "present"). Proforma stellt keine Zusatzpflicht.
export function commercialRequirementsMet({ mode, invoiceNumber, invoiceDateValid, docStatus } = {}) {
  if (mode !== COMMERCIAL) return true;
  const numOk = typeof invoiceNumber === "string" && invoiceNumber.trim().length > 0;
  return numOk && invoiceDateValid === true && docStatus === "present";
}

// Zentrale Regel: Ist der Dokumentstatus ABSCHLIESSEND geklärt? Nur absent/present
// gelten als geklärt; idle/checking/uploading/deleting/error sind NICHT geklärt
// und blockieren (Weiter-Gate + doBook-Guard nutzen dieselbe Regel).
export function isCommercialInvoiceStatusResolved(status) {
  return status === "absent" || status === "present";
}

// ── Fachliche Zollrechnungs-Gültigkeit (NUR Metadaten, dokument-UNABHÄNGIG) ──
// Die Handelsrechnungs-PDF ist OPTIONAL (der JUMiNGO-Order-Vertrag verlangt kein
// Dokument; der Upload läuft über einen separaten optionalen Endpunkt). Diese
// fachliche Prüfung betrifft daher AUSSCHLIESSLICH Rechnungsart + Pflichtmetadaten
// und kennt den Dokumentstatus bewusst NICHT: Proforma stellt keine Zusatzpflicht;
// eine eigene Handelsrechnung verlangt getrimmte Rechnungsnummer + gültiges Datum.
// Warenpositionen/Exportgrund/HS-Code prüft der Orchestrator (BookingPage) separat.
export function customsInvoiceFieldsValid({ mode, invoiceNumber, invoiceDateValid } = {}) {
  if (mode !== COMMERCIAL) return true;
  const numOk = typeof invoiceNumber === "string" && invoiceNumber.trim().length > 0;
  return numOk && invoiceDateValid === true;
}

// ── Läuft aktuell eine optionale Dokument-MUTATION? ─────────────────────────
// NUR ein tatsächlich laufender Upload-/Löschvorgang (uploading/deleting) darf
// Navigation/Buchung kurzfristig gegen einen Race-Condition-Zustand schützen.
// Ein initiales Status-Loading (idle/checking), ein geklärter Status
// (absent/present) und ein Statusfehler (error) sind KEINE Mutation und
// blockieren die fachliche Buchbarkeit niemals.
export function commercialInvoiceMutationBusy(status) {
  return status === "uploading" || status === "deleting";
}
