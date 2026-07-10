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
