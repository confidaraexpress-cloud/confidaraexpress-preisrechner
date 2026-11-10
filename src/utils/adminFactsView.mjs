// „Auf einen Blick“ der Admin-Detailseiten (Admin-Vereinfachung, Betreiberauftrag 2026-11-10).
//
// Reine Ableitungen für die Kennzahlenzeile (`AdminFacts`): jeder Eintrag ist
// `{ label, value, hint?, tone? }` oder `null` (dann entfällt er). Werte kommen
// ausschließlich aus Antworten, die die Seite ohnehin geladen hat — kein Betrag
// wird im Browser gerechnet, ein unbekannter Wert erscheint nicht als 0.
//
// Run: node --test src/utils/adminFactsView.test.mjs
import { money } from "./formatters.js";
import { formatMarkupPercent, isMarkupConfirmed } from "./customerMarkup.mjs";
import { selectCredit } from "./creditLimitView.mjs";

const zahl = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Kundenaufschlag: Standardsatz groß, darunter der wirksame Expresssatz bzw. „Noch nicht bestätigt“. */
export function markupFact(pricing) {
  if (!pricing || typeof pricing !== "object") return null;
  const standard = formatMarkupPercent(pricing.priceMarkupPercent);
  if (standard === "—") return null;
  if (!isMarkupConfirmed(pricing)) {
    return { label: "Aufschlag", value: standard, hint: "Noch nicht bestätigt", tone: "warning" };
  }
  const express = formatMarkupPercent(pricing.effectiveExpressPriceMarkupPercent);
  return { label: "Aufschlag", value: standard, hint: express === "—" ? "Bestätigt" : `Express ${express}` };
}

/** Buchungsrahmen: verfügbarer Betrag, darunter der Rahmen; ausgeschöpft als Warnung im Text. */
export function creditFact(payload) {
  const c = selectCredit(payload);
  if (!c) return null;
  return {
    label: "Buchungsrahmen frei",
    value: money(c.available),
    hint: c.exhausted ? `ausgeschöpft · Rahmen ${money(c.limit)}` : `Rahmen ${money(c.limit)}`,
    tone: c.exhausted ? "warning" : undefined,
  };
}

/** Offene Forderungen aus den Aktivitätswerten (activityMetrics) — nur mit Serverwert. */
export function openAmountFact(metrics) {
  const m = metrics && typeof metrics === "object" ? metrics : {};
  const offen = zahl(m.openAmount);
  if (offen === null) return null;
  const ueberfaellig = zahl(m.invoicesOverdue);
  const unbezahlt = zahl(m.invoicesUnpaid);
  const hint = ueberfaellig !== null && ueberfaellig > 0
    ? `${ueberfaellig} überfällig`
    : unbezahlt !== null ? `${unbezahlt} ${unbezahlt === 1 ? "offene Rechnung" : "offene Rechnungen"}` : undefined;
  return { label: "Offener Betrag", value: money(offen), hint, tone: ueberfaellig !== null && ueberfaellig > 0 ? "danger" : undefined };
}

/** Abrechnungsart des Kontos in Alltagssprache. */
export function billingModeFact(mode) {
  if (mode === "consolidated_7d") return { label: "Abrechnung", value: "Sammelrechnung", hint: "alle 7 Tage" };
  if (mode === "single") return { label: "Abrechnung", value: "Einzelrechnung", hint: "je Sendung" };
  return null;
}
