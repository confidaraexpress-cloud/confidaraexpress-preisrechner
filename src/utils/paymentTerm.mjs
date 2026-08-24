// Zahlungsziel — EINE Quelle für den gesamten Wortlaut der Oberfläche.
//
// Die verbindliche Geschäftsregel lautet:
//
//     „Zahlbar innerhalb von 7 Tagen rein netto nach Rechnungserhalt"
//
// Der Bezugspunkt ist der RECHNUNGSERHALT, nicht das Rechnungsdatum. Serverseitig ist das
// keine Formulierung, sondern eine Rechenregel: die Frist beginnt mit der tatsächlichen
// BEREITSTELLUNG der Rechnung (invoices.delivery_effective_at) und nicht mit ihrer
// Ausstellung. Dieses Modul beschreibt diese Regel — es RECHNET NICHTS. Das Fälligkeitsdatum
// kommt ausnahmslos vom Server (invoices.due_date); das Frontend leitet es nie selbst ab.
//
// Warum zentral: derselbe Satz stand zuvor in fünf Dateien in fünf Fassungen („7 Tage",
// „7 Kalendertage", „zahlbar innerhalb von 7 Tagen", „7 Kalendertage" im Admin, …). Beim
// Wechsel des Bezugspunkts hätte jede einzelne davon gefunden werden müssen, und eine
// übersehene Stelle behauptet gegenüber dem Kunden eine andere Frist als die Rechnung.
//
// NICHT hier: die AGB. Deren Klausel 5.5 nennt weiterhin ein abweichendes Zahlungsziel und
// wird ausdrücklich NICHT von diesem Modul gespeist — Rechtstexte werden nicht nebenbei
// umgeschrieben. Der Widerspruch ist bekannt und als Live-Gate vermerkt.

// Die Tageszahl ist eine ANZEIGEVORGABE für Fälle ohne gespeicherten Wert. Autoritativ ist
// immer der am Beleg eingefrorene Wert, den das Backend mitliefert.
export const PAYMENT_TERM_DAYS = 7;

// Der Bezugspunkt — als eigene Konstante, damit ein Test ihn prüfen kann, ohne den
// vollständigen Satz zu kennen.
export const PAYMENT_TERM_RECEIPT_REFERENCE = "nach Rechnungserhalt";

// Sammelrechnungen tragen Zahlungsziel 0: sie sind sofort fällig, weil der Aufschub bereits
// im Sammelzeitraum steckt. Ein Bezugspunkt ohne Frist wäre dort sinnlos.
export const IMMEDIATE_PAYMENT_TERM_TEXT = "Sofort fällig";

// Erst Anwesenheit, dann Zahl — 0 ist ein GÜLTIGER gespeicherter Wert (Sammelrechnung) und
// darf nie als „fehlt" gelten. `Number(null)` und `Number("")` sind ebenfalls 0; ohne die
// Anwesenheitsprüfung würde eine Rechnung ohne gespeichertes Zahlungsziel fälschlich als
// sofort fällig angezeigt.
export function resolvePaymentTermDays(value) {
  if (value === null || value === undefined) return PAYMENT_TERM_DAYS;
  if (typeof value === "string" && value.trim() === "") return PAYMENT_TERM_DAYS;
  // Boolean, Array und Objekt sind keine Zahlen — `Number(true)` ist 1 und `Number([])` ist 0.
  // Ohne diese Abweisung machte ein leeres Array aus einem fehlenden Wert ein „sofort fällig".
  if (typeof value === "boolean" || typeof value === "object") return PAYMENT_TERM_DAYS;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return PAYMENT_TERM_DAYS;
  return n;
}

// Kurzform für Beschriftungen und Tabellenzellen: „7 Tage nach Rechnungserhalt".
export function paymentTermLabel(value) {
  const d = resolvePaymentTermDays(value);
  if (d === 0) return IMMEDIATE_PAYMENT_TERM_TEXT;
  return `${d} ${d === 1 ? "Tag" : "Tage"} ${PAYMENT_TERM_RECEIPT_REFERENCE}`;
}

// Satzform für Fließtext: „Zahlbar innerhalb von 7 Tagen rein netto nach Rechnungserhalt".
export function paymentTermSentence(value) {
  const d = resolvePaymentTermDays(value);
  if (d === 0) return IMMEDIATE_PAYMENT_TERM_TEXT;
  return `Zahlbar innerhalb von ${d} ${d === 1 ? "Tag" : "Tagen"} rein netto ${PAYMENT_TERM_RECEIPT_REFERENCE}`;
}
