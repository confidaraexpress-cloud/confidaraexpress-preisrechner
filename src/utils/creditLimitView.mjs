// ───────────────────────────────────────────────────────�
// Buchungsrahmen je Kunde (Master-Implementierungsauftrag 2026-10-23, Paket F; Backend Paket E).
//
// Reine, framework-freie Anzeige- und Eingabelogik rund um den Buchungsrahmen:
//   • Lesen der Serverantworten (`GET /kunde/credit`, `credit` im Admin-Detail/-Liste,
//     `creditLimit` im 409 CREDIT_LIMIT_EXCEEDED)
//   • Texte für Übersicht, Buchungsseite und Admin — neutral, ohne Anbieter, Beträge brutto
//   • Vorab-Hinweis der Buchungsseite (reine Anzeige: der Server entscheidet beim Buchen erneut
//     unter Sperre, lib/booking/creditLimit.js)
//   • Admineingabe des Rahmens (0 … 1.000.000 €, höchstens zwei Nachkommastellen — dieselbe
//     Regel wie `parseCreditLimitInput` im Backend; die Oberfläche prüft nur vorab)
//
// AUTORITÄT: Das Backend bleibt in allem verbindlich. Nichts hier ist ein Sicherheitsersatz.
// ───────────────────────────────────────────────────────�
import { money } from "./formatters.js";

export const CREDIT_LIMIT_EXCEEDED_CODE = "CREDIT_LIMIT_EXCEEDED";
export const CREDIT_LIMIT_INVALID_CODE = "CREDIT_LIMIT_INVALID";
export const CREDIT_LIMIT_MAX_GROSS = 1000000;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const cents = (v) => { const n = num(v); return n === null ? null : Math.round(n * 100); };

// ── Lesen ───────────────────────────────────────────────────────�
// Nimmt `{ credit: {...} }` (Kundensicht, Admin-Detail, PUT-Antwort) oder das Objekt selbst
// (Zeile der Adminliste, `creditLimit` der 409-Antwort). Ohne vollständige Beträge → null —
// ein altes Backend ohne den Rahmen zeigt damit einfach nichts.
export function selectCredit(payload) {
  if (!payload || typeof payload !== "object") return null;
  const c = payload.credit && typeof payload.credit === "object" ? payload.credit
    : payload.creditLimit && typeof payload.creditLimit === "object" ? payload.creditLimit
    : payload;
  const limit = num(c.limit), open = num(c.open), reserved = num(c.reserved), available = num(c.available);
  if (limit === null || open === null || reserved === null || available === null) return null;
  const amount = num(c.amount);
  return {
    limit, open, reserved, available,
    exhausted: typeof c.exhausted === "boolean" ? c.exhausted : available <= 0,
    currency: typeof c.currency === "string" && c.currency ? c.currency : "EUR",
    ...(amount === null ? {} : { amount }),
  };
}

// ── Anzeige ─────────────────────────────────────────────────────�
// Belegt = offen + reserviert. Der Balken zeigt den belegten Anteil des Rahmens (0 … 100 %);
// ein Rahmen von 0 ist zu 100 % belegt. Alle Zahlen stehen daneben als Text — der Balken ist Zierde.
export function creditFacts(credit) {
  const c = selectCredit(credit);
  if (!c) return { show: false };
  const used = Math.max(0, Math.round((c.open + c.reserved) * 100) / 100);
  const usedPercent = c.limit > 0 ? Math.min(100, Math.max(0, Math.round((used / c.limit) * 100))) : 100;
  return {
    show: true,
    exhausted: c.exhausted,
    availableText: money(c.available),
    limitText: money(c.limit),
    usedText: money(used),
    openText: money(c.open),
    reservedText: money(c.reserved),
    usedPercent,
    // Ein Satz für Screenreader und als Zusatzangabe: „1.450,00 € von 2.000,00 € verfügbar · 550,00 € belegt".
    summary: `${money(c.available)} von ${money(c.limit)} verfügbar · ${money(used)} belegt`,
  };
}

export const CREDIT_TEXT = Object.freeze({
  title: "Buchungsrahmen",
  availableLabel: "Verfügbarer Buchungsrahmen",
  exhaustedBadge: "ausgeschöpft",
  // Übersicht: warum der Rahmen ausgeschöpft ist und was hilft — ohne Zahlen im Satz.
  exhaustedNote: "Ihr Buchungsrahmen ist derzeit ausgeschöpft. Neue Buchungen sind erst wieder möglich, wenn offene Rechnungen beglichen sind oder wir den Rahmen anpassen.",
  // Buchungsseite, VOR dem Buchen (reine Anzeige).
  hintExhausted: "Ihr Buchungsrahmen ist derzeit ausgeschöpft. Diese Buchung wird voraussichtlich abgelehnt, bis offene Rechnungen beglichen sind oder wir den Rahmen anpassen.",
  hintExceeds: (betrag, verfuegbar) =>
    `Hinweis: Diese Buchung (${money(betrag)}) übersteigt Ihren verfügbaren Buchungsrahmen (${money(verfuegbar)}). Der Rahmen wird beim Buchen erneut geprüft.`,
  // Buchungsseite, NACH 409: nichts beauftragt, nichts berechnet.
  exceeded: (betrag, verfuegbar, rahmen) =>
    `Diese Buchung (${money(betrag)}) überschreitet Ihren verfügbaren Buchungsrahmen (${money(verfuegbar)} von ${money(rahmen)}). `
    + "Es wurde nichts beauftragt. Bitte begleichen Sie offene Rechnungen oder wenden Sie sich an uns, wenn Sie einen höheren Rahmen benötigen.",
  exceededFallback:
    "Diese Buchung überschreitet Ihren verfügbaren Buchungsrahmen. Es wurde nichts beauftragt. "
    + "Bitte begleichen Sie offene Rechnungen oder wenden Sie sich an uns, wenn Sie einen höheren Rahmen benötigen.",
  exceededTitle: "Buchungsrahmen ausgeschöpft",
  toInvoices: "Zu meinen Rechnungen",
});

/* Der Vorab-Hinweis der Buchungsseite. Null, solange nichts dagegen spricht oder der Rahmen
   (altes Backend) bzw. der Gesamtbetrag unbekannt ist. Die Buchung bleibt möglich — der Server
   entscheidet unter Sperre; dieser Hinweis erspart nur die Überraschung. */
export function bookingCreditHint(credit, totalGross) {
  const c = selectCredit(credit);
  if (!c) return null;
  if (c.exhausted) return CREDIT_TEXT.hintExhausted;
  const betrag = num(totalGross);
  if (betrag === null || betrag <= 0) return null;
  if (cents(betrag) > cents(c.available)) return CREDIT_TEXT.hintExceeds(betrag, c.available);
  return null;
}

/* Der Text der 409-Antwort — Beträge aus `creditLimit` der Antwort, nie gerechnet. Ohne Beträge
   (anderer Server) der neutrale Rückfall; der Servertext selbst wird NICHT durchgereicht. */
export function creditLimitExceededText(body) {
  const c = selectCredit(body && typeof body === "object" ? body.creditLimit : null);
  if (!c || c.amount === undefined) return CREDIT_TEXT.exceededFallback;
  return CREDIT_TEXT.exceeded(c.amount, c.available, c.limit);
}

export function isCreditLimitExceeded(body) {
  return !!(body && typeof body === "object" && body.code === CREDIT_LIMIT_EXCEEDED_CODE);
}

// ── Admin ───────────────────────────────────────────────────────�
export const CREDIT_ADMIN_TEXT = Object.freeze({
  title: "Buchungsrahmen",
  fieldLabel: "Rahmen in Euro (brutto)",
  hint: "0 bis 1.000.000 Euro, höchstens zwei Nachkommastellen. Gilt sofort für alle neuen Buchungen; laufende Vorgänge bleiben unberührt.",
  save: "Rahmen speichern",
  confirmTitle: "Buchungsrahmen ändern?",
  confirmText: (von, nach) => `Der Buchungsrahmen wird von ${money(von)} auf ${money(nach)} gesetzt. Die Änderung wird protokolliert und gilt sofort für neue Buchungen.`,
  confirmLabel: "Rahmen setzen",
  invalid: "Bitte einen Betrag zwischen 0 und 1.000.000 Euro mit höchstens zwei Nachkommastellen eingeben.",
  unchanged: "Der Buchungsrahmen ist bereits auf diesen Wert gesetzt.",
  saved: (nach) => `Buchungsrahmen auf ${money(nach)} gesetzt.`,
  failed: "Der Buchungsrahmen konnte nicht geändert werden. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.",
  stats: Object.freeze({ limit: "Rahmen", open: "Offene Belege", reserved: "Reserviert", available: "Verfügbar" }),
  note: "Belastet wird mit offenen Belegen (auch Testdokumenten echter Buchungen), laufenden Buchungen und gebuchten, noch nicht abgerechneten Sendungen. "
    + "Der Rahmen blockiert Buchungen, nie das Konto.",
  exhaustedBadge: "ausgeschöpft",
  availableBadge: (verfuegbar) => `${money(verfuegbar)} verfügbar`,
  history: "Änderungsverlauf im Audit-Log",
  // Freischaltung: der Rahmen, der ab dann gilt — im Bestätigungsdialog sichtbar.
  approvalLine: (rahmen) => `Buchungsrahmen ab Freischaltung: ${money(rahmen)} brutto`,
});

/* Admineingabe: deutsche („2.500,50") und technische („2500.50") Schreibweise, 0 … 1.000.000,
   höchstens zwei Nachkommastellen. Liefert den Zahlenwert für den Request und den Anzeigetext. */
export function parseCreditLimitInput(raw) {
  const fehler = { ok: false, error: CREDIT_ADMIN_TEXT.invalid };
  if (raw === null || raw === undefined) return fehler;
  let s = String(raw).trim().replace(/\s|€/g, "");
  if (s === "") return fehler;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(s)) s = s.replace(",", ".");
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) return fehler;
  const value = Number(s);
  if (!Number.isFinite(value) || value < 0 || value > CREDIT_LIMIT_MAX_GROSS) return fehler;
  const c = Math.round(value * 100);
  return { ok: true, value: c / 100, text: (c / 100).toFixed(2).replace(".", ",") };
}

/* Formatiert den Rahmen für das Eingabefeld („2000,00"). */
export function creditLimitInputValue(credit) {
  const c = selectCredit(credit);
  return c ? c.limit.toFixed(2).replace(".", ",") : "";
}

// ── Adminliste ──────────────────────────────────────────────────�
export const CREDIT_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: "all", label: "Alle" }),
  Object.freeze({ value: "exhausted", label: "Ausgeschöpft" }),
  Object.freeze({ value: "available", label: "Verfügbar" }),
]);

export function matchesCreditFilter(user, filter) {
  const want = String(filter ?? "all").trim() || "all";
  if (want === "all") return true;
  const c = selectCredit(user);
  if (!c) return false;
  return want === "exhausted" ? c.exhausted : !c.exhausted;
}

/* Kurzform für Zeile und Karte der Adminliste: „1.450,00 € frei" / „ausgeschöpft". */
export function creditRowText(user) {
  const c = selectCredit(user);
  if (!c) return null;
  return c.exhausted
    ? { text: CREDIT_ADMIN_TEXT.exhaustedBadge, exhausted: true, title: `Rahmen ${money(c.limit)}, belegt ${money(c.open + c.reserved)}` }
    : { text: `${money(c.available)} frei`, exhausted: false, title: `Rahmen ${money(c.limit)}, belegt ${money(c.open + c.reserved)}` };
}
