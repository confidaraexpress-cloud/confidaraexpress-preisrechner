// ── Admin · Partnerdetail (UX-Paket 4): Kurzfassungen, Vorbelegung, nächster Schritt
//
// Reine Anzeige- und Vorbelegungslogik der Seite /admin/partners/:id. Jeder Wert
// stammt aus einer Antwort des Servers: die Kurzfassungen geben vorhandene Werte
// wieder, die Vorbelegungen übernehmen die aktuell gültige Version, der nächste
// Schritt folgt einem gemeldeten Zustand (eingereichte Abrechnungsdaten, ein
// fehlgeschlagenes Dokument). Hier wird nichts gerechnet, was der Server nicht
// selbst festgelegt hat; Bodies entstehen weiter ausschließlich über die
// build…Body-Funktionen in adminSalesPartnerView.mjs.
//
// Ein Bereich, dessen Daten fehlen, sagt das („Wird geladen …“, „Nicht
// verfügbar“) — nie eine geratene 0 und nie „nichts zu erledigen“.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { formatCents, formatCount, formatMonth, formatPercent } from "./salesPartnerView.mjs";
import {
  CAP_TEXTS,
  capLimitText,
  formatTimestamp,
  isIsoDate,
  levelRulesComplete,
  levelRulesFormFrom,
  percentInputValue,
} from "./adminSalesPartnerView.mjs";
import { billingReviewable, canMarkPaid } from "./adminSalesPartnerSettlementView.mjs";
import { billingStatusMeta } from "./salesPartnerBilling.mjs";
import { PRELIVE_TEXTS } from "./salesPartnerPrelive.mjs";

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// Sichtbare Texte der Seite — kein Rohwert, kein Technikbegriff.
export const DETAIL_TEXTS = Object.freeze({
  applicationTitle: "Antrag prüfen",
  statusTitle: "Status und Zugang",
  overviewTitle: "Überblick",
  nextStepLabel: "Nächster Schritt",
  nothingToDo: "Derzeit ist nichts zu erledigen.",
  stepLoading: "Der Abrechnungsstand wird geladen.",
  stepUnknown: "Offene Schritte lassen sich gerade nicht vollständig prüfen – der Abrechnungsstand ist nicht verfügbar.",
  billingReview: "Der Partner hat seine Abrechnungsdaten zur Prüfung eingereicht.",
  billingReviewAction: "Abrechnungsdaten prüfen",
  documentFailed: "Ein Gutschriftdokument konnte nicht erzeugt werden.",
  documentFailedAction: "Gutschriften öffnen",
  loading: "Wird geladen …",
  unavailable: "Nicht verfügbar",
  linksInactive: "Die Empfehlungslinks wirken nur bei aktivem Partnerkonto.",
  agreementTest: `Testkonto (${PRELIVE_TEXTS.testBadge}) – ohne Partnervereinbarung`,
  agreementMissing: "Keine Zustimmung hinterlegt",
  newVersion: "Neue Version anlegen",
  ratesEffect: "Die neue Version gilt ab dem gewählten Tag. Bestehende Versionen bleiben unverändert.",
  ratesPrefill: "Vorbelegt mit den aktuell gültigen Sätzen.",
  capPrefill: "Vorbelegt mit der aktuell gültigen Obergrenze.",
  levelsEffect: "„Eigene Regeln“ gelten ab dem gewählten Tag nur für diesen Partner. „Globale Regeln übernehmen“ beendet eigene Regeln ab diesem Tag.",
  levelsAllRequired: "Bei eigenen Regeln sind alle Felder Pflicht.",
  levelsPrefillCurrent: "Vorbelegt mit den aktuell geltenden eigenen Regeln des Partners.",
  levelsPrefillStart: "Vorbelegt mit den Startwerten des Programms. Passen Sie die Werte für diesen Partner an.",
  adjustmentTitle: "Korrekturbuchung anlegen",
  adjustmentEffect: "Die Korrektur wird als eigene Buchung mit dem heutigen Datum erfasst; bestehende Buchungen bleiben unverändert. Ein negativer Betrag wird abgezogen.",
  groupBilling: "Abrechnung",
  groupConditions: "Konditionen",
  groupNetwork: "Kunden und Team",
  groupData: "Partnerdaten",
});

/** „Alle Versionen (3)“ — Verlauf einer versionierten Angabe (inklusive der aktuellen). */
export const allVersionsLabel = (count) => `Alle Versionen (${formatCount(count)})`;
/** „Statusverlauf (2)“. */
export const statusHistoryLabel = (count) => `Statusverlauf (${formatCount(count)})`;

// ── Zustand eines selbst ladenden Bereichs ({ loading, error, data }) ─────────
const bekannt = (s) => !!s && !s.error && !!s.data;
const laedtNoch = (s) => !s || (s.loading === true && !s.data);

/** Kurzfassung eines selbst ladenden Bereichs: „Wird geladen …“, „Nicht
 *  verfügbar“ oder die Kurzfassung seiner Daten. */
export function sectionSummary(state, summarize) {
  if (laedtNoch(state)) return DETAIL_TEXTS.loading;
  if (!bekannt(state)) return DETAIL_TEXTS.unavailable;
  return summarize(state.data);
}

// ── Kurzfassungen ────────────────────────────────────────────────────────────

/** Aktuell zugeordnete Kunden — dieselbe Regel wie die Partnerliste
 *  (routes/admin/salesPartners.js: Zuordnung ab `valid_from`, ohne oder mit
 *  späterem Ende). `today` ist ein ISO-Tag; ohne gültigen Tag null (nie geraten). */
export function currentCustomerCount(customers, today) {
  if (!isIsoDate(today)) return null;
  return arr(customers).filter((c) => c && typeof c.assignedSince === "string" && c.assignedSince <= today
    && (c.assignedUntil === null || c.assignedUntil === undefined || c.assignedUntil > today)).length;
}

export function customersSummary(customers, today) {
  const liste = arr(customers);
  if (liste.length === 0) return "Keine Kunden zugeordnet";
  const aktuell = currentCustomerCount(liste, today);
  if (aktuell === null) return `${formatCount(liste.length)} Zuordnungen`;
  const basis = `${formatCount(aktuell)} aktuell zugeordnet`;
  return liste.length > aktuell ? `${basis} · ${formatCount(liste.length)} Zuordnungen insgesamt` : basis;
}

export function teamSummary(team) {
  const t = obj(team);
  return `Ebene 1: ${formatCount(arr(t.level1).length)} · Ebene 2: ${formatCount(arr(t.level2).length)}`;
}

// Ein Satz im Fließtext: geschütztes Leerzeichen vor „%“ — Zahl und Einheit
// brechen in einer schmalen Zeile nie getrennt um.
const satz = (text) => text.replace(/ %$/, "\u00a0%");

/** Aktuelle Provisionssätze in einer Zeile; ohne Version der Grund dafür. */
export function ratesSummary(rates, partnerStatus) {
  const c = obj(rates).current;
  if (!c) return partnerStatus === "rejected" ? "Keine Sätze (Antrag abgelehnt)" : "Noch keine Sätze";
  return `Grundprovision ${satz(formatPercent(c.basePercent))} · Ebene 1: ${satz(formatPercent(c.level1Percent))} · Ebene 2: ${satz(formatPercent(c.level2Percent))}`;
}

export function levelRulesSummary(levelRules) {
  const lr = obj(levelRules);
  if (lr.mode === "custom") {
    const ab = formatTimestamp(obj(lr.current).validFrom);
    return ab !== "—" ? `Eigene Regeln seit ${ab}` : "Eigene Regeln";
  }
  if (lr.mode === "global") return "Globale Regeln";
  return "—";
}

const grenze = (v) => (capLimitText(v) === CAP_TEXTS.noLimit ? "ohne Grenze" : `höchstens ${satz(capLimitText(v))}`);
/** Individuelle Obergrenze (normalizeCapsResponse) in einer Zeile. */
export function capSummary(caps) {
  const c = obj(caps).current;
  if (!c) return "Keine individuelle Obergrenze";
  return `Eigenprovision ${grenze(c.maxOwnRatePercent)} · alle Ebenen ${grenze(c.maxTotalRatePercent)}`;
}

const stufe = (n) => (Number.isInteger(n) ? String(n) : "—");
/** Jüngste Monatsbewertung (der Server liefert die neueste zuerst). */
export function assessmentSummary(assessments) {
  const a = arr(assessments)[0];
  if (!a) return "Noch keine Monatsbewertung";
  return `${formatMonth(a.month)}: Kunden-Level ${stufe(a.customerLevel)} · Paket-Level ${stufe(a.packageLevel)}`;
}

/** Provisionen des gewählten Monats (normalizeAdminCommissions) — Summen des Servers. */
export function commissionsSummary(data) {
  const t = obj(obj(data).totals);
  return `${formatMonth(obj(data).month)}: ${formatCents(t.accruedCents)} · davon auszahlbar ${formatCents(t.payableCents)}`;
}

/** Gutschriften (normalizeAdminCreditNotes): Anzahl und offene Auszahlungsvermerke. */
export function creditNotesSummary(data) {
  const regulaer = arr(obj(data).creditNotes).filter((cn) => cn && cn.kind === "regular");
  if (regulaer.length === 0) return "Noch keine Gutschriften";
  const anzahl = regulaer.length === 1 ? "1 Gutschrift" : `${formatCount(regulaer.length)} Gutschriften`;
  const offen = regulaer.filter(canMarkPaid).length;
  return offen > 0 ? `${anzahl} · ${formatCount(offen)} noch nicht als ausgezahlt vermerkt` : anzahl;
}

/** Status der Abrechnungsdaten (normalizeAdminBilling) als Wort. */
export const billingSummary = (data) => billingStatusMeta(obj(data).status)[1];

/** Vertragsstand eines Partners: die zugestimmte Fassung, sonst die
 *  Testkennzeichnung des Servers (`preliveTest`), sonst „keine Zustimmung“. */
export function agreementSummary(partner) {
  const p = obj(partner);
  if (typeof p.agreementVersion === "string" && p.agreementVersion.trim() !== "") return `Partnervereinbarung Fassung ${p.agreementVersion.trim()}`;
  if (p.preliveTest === true) return DETAIL_TEXTS.agreementTest;
  return DETAIL_TEXTS.agreementMissing;
}

/** Codes und Links in einer Zeile: der eigene Empfehlungscode des Partners. */
export const codesSummary = (partner) => (obj(partner).referralCode ? `Empfehlungscode ${obj(partner).referralCode}` : "Kein Empfehlungscode");

// ── Status ───────────────────────────────────────────────────────────────────

/** Wirksamkeitstag des aktuellen Status: der jüngste Eintrag mit genau diesem
 *  Status im Verlauf des Servers (neueste zuerst); sonst null. */
export function statusSince(status, statusHistory) {
  const e = arr(statusHistory).find((s) => s && s.status === status && typeof s.effectiveDate === "string");
  return e ? e.effectiveDate : null;
}

// ── Nächster Schritt ─────────────────────────────────────────────────────────

/** Die wichtigste offene Verwaltungsaktion eines freigegebenen Partners — nur
 *  aus gemeldeten Zuständen: eingereichte Abrechnungsdaten (prüfen) vor einem
 *  fehlgeschlagenen Gutschriftdokument (neu erzeugen). Solange ein Stand fehlt,
 *  steht dort, dass er fehlt — nie „nichts zu erledigen“. `billing` und
 *  `creditNotes` sind die Zustände ({ loading, error, data }) der Bereiche. */
export function partnerNextStep({ billing = null, creditNotes = null } = {}) {
  if (bekannt(billing) && billingReviewable(billing.data)) {
    return { key: "billing", text: DETAIL_TEXTS.billingReview, action: DETAIL_TEXTS.billingReviewAction, target: "adm-sp-billing-card" };
  }
  if (bekannt(creditNotes) && arr(creditNotes.data.creditNotes).some((cn) => cn && cn.documentStatus === "failed")) {
    return { key: "document", text: DETAIL_TEXTS.documentFailed, action: DETAIL_TEXTS.documentFailedAction, target: "adm-sp-credit-notes-card" };
  }
  if (laedtNoch(billing) || laedtNoch(creditNotes)) return { key: "loading", text: DETAIL_TEXTS.stepLoading, action: null, target: null };
  if (!bekannt(billing) || !bekannt(creditNotes)) return { key: "unknown", text: DETAIL_TEXTS.stepUnknown, action: null, target: null };
  return { key: "none", text: DETAIL_TEXTS.nothingToDo, action: null, target: null };
}

// ── Vorbelegung neuer Versionen ──────────────────────────────────────────────
// Übernommen werden nur die Werte der aktuell gültigen Version des Servers.
// „Gültig ab“ und die Begründung bleiben leer: beides wählt der Admin bewusst.

export function ratesFormFromCurrent(current) {
  const c = obj(current);
  return {
    validFrom: "",
    basePercent: percentInputValue(c.basePercent),
    level1Percent: percentInputValue(c.level1Percent),
    level2Percent: percentInputValue(c.level2Percent),
    reason: "",
  };
}

/** Eine leere Grenze bleibt leer („keine Grenze“) — so verschwindet beim Ändern
 *  der einen Grenze die andere nicht unbemerkt. */
export function capFormFromCurrent(current) {
  const c = obj(current);
  return {
    validFrom: "",
    maxOwnRatePercent: percentInputValue(c.maxOwnRatePercent),
    maxTotalRatePercent: percentInputValue(c.maxTotalRatePercent),
    reason: "",
  };
}

/** Eigene Level-Regeln: vorbelegt mit der aktuell geltenden eigenen Version des
 *  Partners; gelten globale Regeln, mit den Startwerten des Programms; sonst
 *  leer. Die Wahl „global/eigene“ bleibt offen (Pflicht). */
export function partnerLevelRulesPrefill({ levelRules = null, startDefaults = null } = {}) {
  const lr = obj(levelRules);
  if (lr.mode === "custom" && levelRulesComplete(lr.current)) {
    return { form: { ...levelRulesFormFrom(lr.current), mode: "" }, source: "current" };
  }
  const start = obj(startDefaults).rules;
  if (levelRulesComplete(start)) return { form: { ...levelRulesFormFrom(start), mode: "" }, source: "startDefaults" };
  return { form: { ...levelRulesFormFrom(null), mode: "" }, source: null };
}

/** Hinweis zur Herkunft einer Regel-Vorbelegung; ohne Vorbelegung null. */
export function levelRulesPrefillNote(source) {
  if (source === "current") return DETAIL_TEXTS.levelsPrefillCurrent;
  if (source === "startDefaults") return DETAIL_TEXTS.levelsPrefillStart;
  return null;
}
