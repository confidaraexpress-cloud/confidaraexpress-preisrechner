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
// BEL-4: Fehlercode der Buchung (422), wenn das Konto die Sammelrechnung führt und sie nicht läuft —
// derselbe Code wie bei der gesperrten Umstellung im Profil (Backend: lib/billingMode.js).
export const BILLING_MODE_UNAVAILABLE_CODE = "BILLING_MODE_UNAVAILABLE";

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

// ─── Verfügbarkeit der Sammelabrechnung ───────────────────────────────────────────────
// Ob Sammelrechnungen derzeit überhaupt angeboten werden (Sammelrechnungslauf UND reguläre
// Rechnungsstellung), sagt ausschließlich der Server (/kundenbereich →
// billingCapabilities.consolidated7dAvailable). FAIL-CLOSED: fehlt das Feld (ältere
// Backendversion) oder ist es nicht exakt `true`, gilt sie als nicht verfügbar.
export function consolidatedBillingAvailable(user) {
  return user?.billingCapabilities?.consolidated7dAvailable === true;
}

// Ist diese Option direkt wählbar? P5 (Canonical v2.111): Die Sammelrechnung stellt der Kunde nie
// selbst ein — er BEANTRAGT sie, ConfidaraExpress entscheidet. Wählbar bleiben die gespeicherte Wahl
// (ein Bestandskonto wird nie umgedeutet) und die Einzelrechnung (der Rückweg ist immer frei). Die
// Serverprüfung bleibt die Wahrheit (409 BILLING_MODE_APPROVAL_REQUIRED) — dies verhindert nur einen
// Auswahlversuch, der ohnehin abgelehnt würde.
export function billingModeOptionSelectable(user, mode) {
  if (!BILLING_MODES.includes(mode)) return false;
  if (mode === billingMode(user)) return true;
  return mode === "single";
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
  // P5: Steht unter der Sammelrechnung, solange das Konto sie nicht führt — sie wird beantragt,
  // nicht gewählt (Antrag darunter).
  consolidatedByRequest: "Nur auf Antrag.",
  // P5: Steht unter der Auswahl eines Sammelkontos — der Rückweg ist frei, aber nicht ohne neuen Antrag umkehrbar.
  switchBackNote: "Ein Wechsel zur Einzelrechnung gilt sofort für künftige Buchungen. Für eine Rückkehr zur Sammelrechnung ist danach ein neuer Antrag nötig.",
  // Ein Konto, das die Sammelrechnung bereits nutzt, behält sie. Es erfährt aber (BEL-4), dass es
  // nicht buchen kann, solange sie nicht verfügbar ist: ohne laufende Sammelrechnung entstünde eine
  // Buchung ohne Rechnung, deshalb lehnt der Server sie ab.
  consolidatedKeptNote: "Ihr Konto nutzt weiterhin die Sammelrechnung. Solange sie nicht verfügbar ist, können Sie erst nach einem Wechsel zur Einzelrechnung buchen.",
  // BEL-4: Ersatztext der Buchungsseite, falls die 422-Antwort keinen lesbaren Text trägt.
  bookingUnavailable: "Die Sammelrechnung ist derzeit nicht verfügbar. Bitte wählen Sie in Ihrem Profil unter „Abrechnung & Rechnungen“ die Einzelrechnung je Sendung, um zu buchen.",
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

// ─── Antrag auf Sammelrechnung (P5, Betreiberentscheidung 2026-11-04, Canonical v2.111) ─────────
// Kunde beantragt → ConfidaraExpress prüft → genehmigt oder lehnt ab → aktiv erst nach der Genehmigung.
// Die Karte sagt wahrheitsgemäß, was gilt: ein Antrag ist keine Umstellung, eine Genehmigung erst mit
// tatsächlicher Verfügbarkeit möglich, die aktive Nutzung steht an der Abrechnungsart des Kontos.
export const BILLING_MODE_REQUEST_NOTE_MAX = 500;
export const BILLING_MODE_REJECTION_REASON_MAX = 300;
export const BILLING_MODE_REQUEST_STATUSES = ["pending", "approved", "rejected", "withdrawn"];

export const BILLING_MODE_REQUEST_TEXT = {
  title: "Sammelrechnung beantragen",
  intro: "Ein Antrag ist noch keine Umstellung. ConfidaraExpress prüft ihn; erst nach der Genehmigung gilt die Sammelrechnung für Ihre künftigen Buchungen.",
  notAvailable: "Sammelrechnungen werden derzeit noch nicht freigeschaltet. Sie können sie trotzdem beantragen – Ihr Antrag bleibt bis dahin in Prüfung.",
  notAvailablePending: "Sammelrechnungen werden derzeit noch nicht freigeschaltet. Ihr Antrag bleibt bis dahin in Prüfung.",
  noteLabel: "Begründung (optional)",
  noteHint: "Zum Beispiel, wie viele Sendungen Sie ungefähr pro Woche versenden.",
  submit: "Sammelrechnung beantragen",
  submitting: "Wird gesendet…",
  submitted: "Antrag gestellt",
  withdraw: "Antrag zurückziehen",
  withdrawing: "Wird zurückgezogen…",
  withdrawn: "Antrag zurückgezogen",
  pendingTitle: (datum) => (datum ? `Beantragt am ${datum} – wird geprüft` : "Beantragt – wird geprüft"),
  pendingText: "Bis zur Genehmigung erhalten Sie für jede Sendung weiterhin eine Einzelrechnung.",
  yourNote: "Ihre Begründung:",
  rejectedTitle: (datum) => (datum ? `Abgelehnt am ${datum}` : "Abgelehnt"),
  rejectedReason: "Begründung:",
  rejectedAgain: "Sie können die Sammelrechnung erneut beantragen.",
  withdrawnTitle: (datum) => (datum ? `Zurückgezogen am ${datum}` : "Zurückgezogen"),
  withdrawnText: "Sie können die Sammelrechnung jederzeit erneut beantragen.",
  activeTitle: "Sammelrechnung aktiv",
  activeSince: (datum) => `Genehmigt am ${datum}. Sie gilt für Ihre Buchungen seit der Genehmigung.`,
  loadError: "Der Stand Ihres Antrags konnte nicht geladen werden. Bitte versuchen Sie es später erneut.",
  submitError: "Der Antrag konnte nicht gestellt werden. Bitte versuchen Sie es erneut.",
  withdrawError: "Der Antrag konnte nicht zurückgezogen werden. Bitte versuchen Sie es erneut.",
};

// Kalendertag eines Zeitstempels in Europe/Berlin (TT.MM.JJJJ) — dieselbe Geschäftszeitzone wie die
// Abrechnung; ohne gültigen Zeitstempel `null` (nie ein geratenes Datum).
const BERLIN_TAG = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
export function formatTimestampDayDe(value) {
  if (typeof value !== "string" || value === "") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? BERLIN_TAG.format(new Date(t)) : null;
}

// Liest einen Antrag der Serverantwort. Unbekannter Zustand oder kaputte Antwort: `null` — die Karte
// behauptet dann keinen Antrag, den es nicht gibt.
export function normalizeBillingModeRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!BILLING_MODE_REQUEST_STATUSES.includes(raw.status)) return null;
  const text = (v) => (typeof v === "string" && v.trim() !== "" ? v : null);
  return {
    id: raw.id ?? null,
    status: raw.status,
    customerNote: text(raw.customerNote),
    requestedAt: text(raw.requestedAt),
    decidedAt: text(raw.decidedAt),
    withdrawnAt: text(raw.withdrawnAt),
    rejectionReason: raw.status === "rejected" ? text(raw.rejectionReason) : null,
  };
}

// Zeichen wie der Server (Codepunkte), nicht UTF-16-Einheiten.
export function noteLength(value) {
  return typeof value === "string" ? Array.from(value).length : 0;
}

/**
 * Anzeigemodell des Antragsteils der Karte.
 *
 * @param mode      gespeicherte Abrechnungsart des Kontos (Serverwahrheit)
 * @param request   neuester Antrag aus GET /kunde/billing-mode-requests/current (roh) oder null
 * @param available consolidatedBillingAvailable(user)
 * @param loaded    true, sobald der Antragsstand gelesen wurde; false bei Ladefehler oder während des Ladens
 * @returns {{ kind: "loading"|"error"|"active"|"request", status: string|null, box: object|null,
 *             showForm: boolean, canWithdraw: boolean, showNotAvailable: boolean }}
 */
export function billingModeRequestView({ mode, request, available = false, loaded = false, failed = false } = {}) {
  const r = normalizeBillingModeRequest(request);
  const T = BILLING_MODE_REQUEST_TEXT;
  if (mode === "consolidated_7d") {
    // Aktiv ist, was das Konto führt — der Antrag erklärt nur, seit wann.
    const seit = r && r.status === "approved" ? formatTimestampDayDe(r.decidedAt) : null;
    return { kind: "active", status: r ? r.status : null, showForm: false, canWithdraw: false, showNotAvailable: false,
      box: { tone: "success", title: T.activeTitle, lines: seit ? [T.activeSince(seit)] : [] } };
  }
  // Fail-closed: ohne gelesenen Stand kein Antragsformular — sonst entstünde ein Doppelantrag aus einer
  // Ansicht, die den offenen Antrag nicht kennt.
  if (failed) return { kind: "error", status: null, box: null, showForm: false, canWithdraw: false, showNotAvailable: false };
  if (!loaded) return { kind: "loading", status: null, box: null, showForm: false, canWithdraw: false, showNotAvailable: false };
  const status = r ? r.status : null;
  let box = null;
  if (status === "pending") {
    const lines = [T.pendingText];
    if (r.customerNote) lines.push(`${T.yourNote} ${r.customerNote}`);
    box = { tone: "info", title: T.pendingTitle(formatTimestampDayDe(r.requestedAt)), lines };
  } else if (status === "rejected") {
    const lines = [];
    if (r.rejectionReason) lines.push(`${T.rejectedReason} ${r.rejectionReason}`);
    lines.push(T.rejectedAgain);
    box = { tone: "info", title: T.rejectedTitle(formatTimestampDayDe(r.decidedAt)), lines };
  } else if (status === "withdrawn") {
    box = { tone: "info", title: T.withdrawnTitle(formatTimestampDayDe(r.withdrawnAt)), lines: [T.withdrawnText] };
  }
  // Ein genehmigter Antrag eines Kontos, das zur Einzelrechnung zurückgewechselt ist, ist erledigt: neu beantragen.
  return {
    kind: "request", status, box,
    showForm: status !== "pending",
    canWithdraw: status === "pending",
    showNotAvailable: !available,
  };
}

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
