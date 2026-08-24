// utils/billingModeView.mjs — Abrechnungsart des Kontos: Auswertung und Texte.
//
// REIN: kein Netz, kein Storage, kein React. Dieselbe Rolle wie der Lieferschein-Block in
// profileView.mjs — die Karte und der Erfolgsbildschirm holen ihre Aussagen von hier,
// nicht aus JSX.
//
// ─── Was die Abrechnungsart NICHT ist ────────────────────────────────────────────────
// Sie ist keine Preis- und keine Berechtigungseinstellung. Eine Sendung kostet dasselbe,
// egal wie sie fakturiert wird; die Abrechnungsart entscheidet ausschließlich, WANN und
// in WELCHEM Beleg der Betrag erscheint. Das Frontend berechnet dabei nichts und
// entscheidet nichts — jede Zahl und jeder Zeitraum kommt vom Server.

import { PAYMENT_TERM_DAYS, paymentTermSentence } from "./paymentTerm.mjs";

export const BILLING_MODES = ["single", "consolidated_7d"];
export const DEFAULT_BILLING_MODE = "single";

// Fail-safe: ein unbekannter oder fehlender Wert gilt als Einzelrechnung. Ein Konto,
// dessen Antwort das Feld noch nicht trägt (Backend vor diesem Paket), verhält sich
// damit exakt wie bisher — und es wird nie eine Sammelabrechnung behauptet, die es
// serverseitig nicht gibt.
export function billingMode(user) {
  const v = user?.billing_mode;
  return BILLING_MODES.includes(v) ? v : DEFAULT_BILLING_MODE;
}

export function isConsolidatedBilling(user) {
  return billingMode(user) === "consolidated_7d";
}

// Nur der eine Schlüssel — dieselbe strukturelle Mass-Assignment-Sicherheit wie bei den
// übrigen Profilkarten. Ein ungültiger Wert wird gar nicht erst gesendet.
export function buildBillingModePatch(mode) {
  const value = BILLING_MODES.includes(mode) ? mode : DEFAULT_BILLING_MODE;
  return { billing_mode: value };
}

// ─── Kundensprache ───────────────────────────────────────────────────────────────────
// Bewusst OHNE technische Begriffe: kein „billing_mode", kein „consolidated_7d", kein
// „Scheduler", kein „invoice_shipments".
export const BILLING_MODE_TEXT = {
  title: "Abrechnung & Rechnungen",
  subtitle: "Wann Sie Ihre Rechnungen bekommen",
  fieldLabel: "Rechnungsstellung",
  options: {
    single: {
      label: "Einzelrechnung je Sendung",
      // Der Zahlungszielsatz kommt aus der EINEN zentralen Quelle — er nennt seit dem Wechsel
      // des Bezugspunkts auch, ab wann die Frist läuft (Rechnungserhalt, nicht Rechnungsdatum).
      hint: `Für jede gebuchte Sendung erhalten Sie sofort eine eigene Rechnung. ${paymentTermSentence(PAYMENT_TERM_DAYS)}.`,
    },
    consolidated_7d: {
      label: "Sammelrechnung alle 7 Tage",
      hint: "Ihre Sendungen werden über einen Zeitraum von 7 Tagen gesammelt und am Folgetag in einer Rechnung zusammengefasst. Diese Rechnung ist mit Rechnungserhalt sofort fällig — den Zahlungsaufschub haben Sie bereits durch den Sammelzeitraum.",
    },
  },
  // Steht als ruhiger Hinweis unter der Auswahl, nicht als Warnung: die Umstellung ist
  // ein normaler Vorgang, sie soll nur nicht mehr versprechen, als sie tut.
  changeNote: "Die Umstellung gilt für künftige Buchungen. Bereits gebuchte Sendungen behalten die Abrechnung, die zum Zeitpunkt ihrer Buchung galt.",
  periodTitle: "Laufender Sammelzeitraum",
  periodEmpty: "In Ihrem laufenden Zeitraum ist noch keine Sendung gebucht.",
  // „Voraussichtlich": der Zeitraum läuft noch, es können Sendungen hinzukommen. Ein
  // Betrag ohne diesen Vorbehalt sähe aus wie eine feststehende Rechnungssumme.
  periodAmountLabel: "Voraussichtlicher Rechnungsbetrag",
  periodCountLabel: "Gebuchte Sendungen",
  periodInvoiceDateLabel: "Rechnung voraussichtlich am",
  periodPreviewNote: "Vorschau auf den laufenden Zeitraum — es können noch Sendungen hinzukommen.",
  periodLoadError: "Der laufende Sammelzeitraum konnte nicht geladen werden.",
};

// ─── Erfolgsbildschirm der Buchung ───────────────────────────────────────────────────
// Bei Sammelabrechnung gibt es zu DIESER Sendung noch keine Rechnung und keine
// Rechnungsnummer. Der Bildschirm darf deshalb keine Nummer und kein Fälligkeitsdatum
// anzeigen — er sagt stattdessen, wo der Betrag erscheinen wird.
export function bookingBillingNotice(booking) {
  if (booking?.billingMode === "consolidated_7d") {
    return {
      consolidated: true,
      showsInvoiceNumber: false,
      text: "Diese Sendung wird über Ihre nächste Sammelrechnung abgerechnet. Sie erhalten die Rechnung nach Ablauf Ihres laufenden 7-Tage-Zeitraums.",
    };
  }
  return {
    consolidated: false,
    // Auch bei Einzelabrechnung nur zeigen, was tatsächlich da ist — eine fehlende
    // Nummer wird nicht durch einen Platzhalter ersetzt.
    showsInvoiceNumber: Boolean(booking?.invoiceNumber),
    text: null,
  };
}

// ─── Darstellung des Zeitraums ───────────────────────────────────────────────────────
// Formatiert AUSSCHLIESSLICH bereits vom Server gelieferte Kalendertage (YYYY-MM-DD).
// Es wird kein Zeitraum berechnet, verlängert oder geraten.
export function formatCalendarDayDe(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function periodRangeLabel(period) {
  const from = formatCalendarDayDe(period?.start);
  const to = formatCalendarDayDe(period?.end);
  // Beide Grenzen oder gar nichts — ein halber Zeitraum ist keine Aussage.
  return from && to ? `${from} – ${to}` : null;
}

// Fasst die Serverantwort von GET /kunde/consolidated-invoice/current so zusammen, wie
// die Karte sie braucht. Eine fehlende oder kaputte Antwort ergibt einen leeren, aber
// gültigen Zustand — nie eine erfundene Zahl.
export function consolidatedPeriodView(data) {
  const period = data && typeof data === "object" ? data.period : null;
  const count = Number(data?.shipmentCount);
  const gross = Number(data?.grossAmount);
  return {
    hasPeriod: Boolean(periodRangeLabel(period)),
    rangeLabel: periodRangeLabel(period),
    invoiceDateLabel: formatCalendarDayDe(period?.invoiceDate),
    // 0 ist ein gültiger Wert und darf nie zu „fehlt" werden — deshalb Number.isFinite
    // statt einer Falsy-Prüfung.
    shipmentCount: Number.isFinite(count) ? count : 0,
    grossAmount: Number.isFinite(gross) ? gross : 0,
    // Sendungen aus älteren, noch nicht abgerechneten Zeiträumen. Ohne diese Angabe
    // behauptete die Karte, es gebe nur diesen einen Zeitraum.
    earlierCount: Number.isFinite(Number(data?.shipmentsInEarlierPeriods))
      ? Number(data.shipmentsInEarlierPeriods) : 0,
    shipments: Array.isArray(data?.shipments) ? data.shipments : [],
  };
}
