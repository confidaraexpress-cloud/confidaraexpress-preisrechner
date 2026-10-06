// ── Admin: Vertriebspartner, Level-Regeln, Obergrenzen, Provisionen,
//    Kundenzuordnung und Versandnachweise ───────────────────────────────────
//
// Reine Lese-, Format- und Body-Logik für die Adminseiten unter
// /admin/partners. Jeder Request-Body entsteht AUSSCHLIESSLICH über die
// build…Body-Funktionen dieser Datei (Allowlist der Felder, Prüfung vor dem
// Senden) — die Seiten setzen keinen Body selbst zusammen. Verbindlich bleibt
// die serverseitige Prüfung; diese Datei verhindert nur offensichtlich
// unvollständige Requests.
//
// Ausdrücklich keine Erfindungen:
//   • Level-Schwellen werden NIE vorbelegt (keine Betreiberentscheidung) —
//     leer und Pflicht. Vorbelegt sind nur die vorgegebenen Boni
//     2,50/5,00/7,50/10,00/12,50 % und die Mindestpakete 3.
//   • Ohne Ebenen-Sätze in der Freigabe gelten die Server-Defaults.
//   • „Heute" kommt aus der Browseruhr des Admins nur als Vorabprüfung
//     (min-Attribut, „nicht vor heute"); entscheidend ist der Server.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { customerText } from "./apiError.mjs";
import { partnerStatusMeta, statusMetaFrom } from "./salesPartnerView.mjs";

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const id = (v) => (Number.isInteger(v) && v > 0 ? v : (typeof v === "string" && /^[1-9][0-9]{0,15}$/.test(v) ? v : null));
const trimmed = (v) => (typeof v === "string" ? v.trim() : "");
const positiveInt = (v) => {
  if (Number.isInteger(v) && v > 0) return v;
  if (typeof v === "string" && /^[1-9][0-9]{0,15}$/.test(v.trim())) return Number(v.trim());
  return null;
};

export const MAX_REASON_LENGTH = 500;
export const MAX_NOTE_LENGTH = 1000;

// ── Status, Login, Gründe ───────────────────────────────────────────────────
export const adminPartnerStatusMeta = partnerStatusMeta;

export const SALES_PARTNER_STATUS_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: "", label: "Alle" }),
  Object.freeze({ value: "pending", label: "In Prüfung" }),
  Object.freeze({ value: "active", label: "Aktiv" }),
  Object.freeze({ value: "inactive", label: "Inaktiv" }),
  Object.freeze({ value: "rejected", label: "Abgelehnt" }),
]);
export const SALES_PARTNER_STATUS_VALUES = Object.freeze(["pending", "active", "inactive", "rejected"]);

/** Nur ein bekannter Statusfilter geht an den Server, sonst keiner. */
export function toSalesPartnerApiFilters({ status, q } = {}) {
  const out = {};
  if (SALES_PARTNER_STATUS_VALUES.includes(status)) out.status = status;
  const suche = trimmed(q);
  if (suche) out.q = suche.slice(0, 100);
  return out;
}

// Der Loginzustand (`loginStatus`) ist `users.status` des Partnerkontos —
// laut Backend genau 'pending', 'approved', 'blocked' oder 'anonymized'.
// Zugeordnet werden ausschließlich die drei Zustände, an denen eine Aussage
// hängt; 'anonymized' und jeder andere Wert laufen über statusFallback, und
// dann bietet die Seite bewusst keine Login-Aktion an (fail-closed).
const LOGIN_STATUS_META = Object.freeze({
  approved: Object.freeze(["badge-green", "Login aktiv"]),
  blocked: Object.freeze(["badge-red", "Login gesperrt"]),
  pending: Object.freeze(["badge-yellow", "Noch kein Login"]),
});
export const loginStatusMeta = (status) => statusMetaFrom(LOGIN_STATUS_META, status);

/** true = Login aktiv (Aktion: sperren), false = gesperrt (Aktion: entsperren),
 *  null = keine Login-Aktion (pending, anonymized, unbekannt). */
export function loginEnabledState(status) {
  if (status === "approved") return true;
  if (status === "blocked") return false;
  return null;
}

/** Ist der Loginzustand einer der drei zugeordneten Werte? */
export const loginStatusKnown = (status) => Object.prototype.hasOwnProperty.call(LOGIN_STATUS_META, status);

// PUT …/login antwortet bei einem Konflikt mit einem dieser Codes. Der Text
// sagt, warum nichts geändert wurde; ein unbekannter Code fällt auf den
// allgemeinen Admintext zurück.
const LOGIN_ACTION_ERRORS = Object.freeze({
  SALES_PARTNER_NOT_APPROVED: "Der Login lässt sich erst nach der Freigabe des Vertriebspartners sperren oder entsperren. Es wurde nichts geändert.",
  ACCOUNT_ANONYMIZED: "Das Konto ist anonymisiert; der Login lässt sich nicht mehr ändern. Es wurde nichts geändert.",
});
export function loginActionErrorText(status, body) {
  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code.trim() : "";
  if (status === 409 && Object.prototype.hasOwnProperty.call(LOGIN_ACTION_ERRORS, code)) return LOGIN_ACTION_ERRORS[code];
  return adminActionErrorText(status, body);
}

export const DEACTIVATION_REASON_OPTIONS = Object.freeze([
  Object.freeze({ value: "contract_ended", label: "Vertrag beendet" }),
  Object.freeze({ value: "suspended", label: "Vorübergehend gesperrt" }),
  Object.freeze({ value: "other", label: "Sonstiger Grund" }),
]);
const labelAus = (optionen, wert, fallback = "—") => {
  if (wert === null || wert === undefined || wert === "") return "—";
  const treffer = optionen.find((o) => o.value === wert);
  return treffer ? treffer.label : fallback;
};
export const deactivationReasonLabel = (v) => labelAus(DEACTIVATION_REASON_OPTIONS, v, "Unbekannter Grund");

const ATTRIBUTION_SOURCES = Object.freeze([
  Object.freeze({ value: "referral_link", label: "Empfehlungslink" }),
  Object.freeze({ value: "admin_assignment", label: "Zuordnung durch Admin" }),
]);
export const attributionSourceLabel = (v) => labelAus(ATTRIBUTION_SOURCES, v, "Unbekannte Herkunft");

// ── Versandnachweise ────────────────────────────────────────────────────────
export const EVIDENCE_DECISION_OPTIONS = Object.freeze([
  Object.freeze({ value: "dispatched", label: "Versendet" }),
  Object.freeze({ value: "not_dispatched", label: "Nicht versendet" }),
  Object.freeze({ value: "unclear", label: "Ungeklärt" }),
]);
const EVIDENCE_STATUS_META = Object.freeze({
  dispatched: ["badge-green", "Versendet"],
  not_dispatched: ["badge-red", "Nicht versendet"],
  unclear: ["badge-yellow", "Ungeklärt"],
});
/** Ohne Entscheidung (null) heißt der Zustand „Nachweis fehlt". */
export function evidenceStatusMeta(status) {
  if (status === null || status === undefined || status === "") return ["badge-yellow", "Nachweis fehlt"];
  return statusMetaFrom(EVIDENCE_STATUS_META, status);
}
export const EVIDENCE_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ value: "carrier_portal", label: "Carrier-Portal" }),
  Object.freeze({ value: "handover_receipt", label: "Übergabebeleg" }),
  Object.freeze({ value: "customer_confirmation", label: "Bestätigung des Kunden" }),
  Object.freeze({ value: "other", label: "Sonstiger Nachweis" }),
]);
export const evidenceTypeLabel = (v) => labelAus(EVIDENCE_TYPE_OPTIONS, v, "Unbekannte Nachweisart");
const EVIDENCE_SOURCES = Object.freeze([
  Object.freeze({ value: "carrier_tracking", label: "Sendungsverfolgung" }),
  Object.freeze({ value: "admin", label: "Admin-Entscheidung" }),
]);
export const evidenceSourceLabel = (v) => labelAus(EVIDENCE_SOURCES, v, "Unbekannte Quelle");

// ── Eingaben: Datum, Prozent, Betrag ─────────────────────────────────────────

/** Lokales Kalenderdatum „YYYY-MM-DD" (Admin-Vorabprüfung, nicht maßgeblich). */
export function localIsoDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lokaler Kalendermonat „YYYY-MM" — Startwert des Admin-Monatsfilters. */
export function currentLocalMonth(date = new Date()) {
  return localIsoDate(date).slice(0, 7);
}

/** Ist das ein echtes Kalenderdatum im Format YYYY-MM-DD? */
export function isIsoDate(value) {
  const m = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (!m) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

export const INPUT_TEXTS = Object.freeze({
  percentRequired: "Bitte einen Prozentwert angeben.",
  percentInvalid: "Bitte einen Wert zwischen 0 und 100 mit höchstens zwei Nachkommastellen angeben.",
  dateRequired: "Bitte ein Datum angeben.",
  dateInvalid: "Bitte ein gültiges Datum angeben.",
  dateNotBeforeToday: "Das Datum darf nicht vor heute liegen.",
  dateInFuture: "Das Datum darf nicht in der Zukunft liegen.",
  reasonRequired: "Bitte eine Begründung angeben.",
  reasonTooLong: `Die Begründung darf höchstens ${MAX_REASON_LENGTH} Zeichen lang sein.`,
  noteRequired: "Bitte eine Begründung angeben.",
  noteTooLong: `Die Begründung darf höchstens ${MAX_NOTE_LENGTH} Zeichen lang sein.`,
  amountRequired: "Bitte einen Betrag angeben.",
  amountInvalid: "Bitte einen Betrag in Euro mit höchstens zwei Nachkommastellen angeben (z. B. 25,00 oder -12,50).",
  amountZero: "Der Betrag darf nicht 0 sein.",
  shipmentInvalid: "Bitte eine gültige Sendungsnummer (Zahl) angeben oder das Feld leer lassen.",
  partnerRequired: "Bitte einen Vertriebspartner auswählen.",
  minPackagesInvalid: "Bitte eine ganze Zahl ab 1 angeben.",
  thresholdRequired: "Bitte eine Schwelle angeben.",
  thresholdInvalid: "Bitte eine ganze Zahl ab 0 angeben.",
  thresholdOrder: "Die Schwellen müssen von Level zu Level streng steigen.",
  decisionRequired: "Bitte eine Entscheidung wählen.",
  evidenceTypeRequired: "Bitte die Nachweisart wählen.",
  modeRequired: "Bitte wählen, welche Regeln gelten sollen.",
});

/** Prozent-Eingabe → { ok, value: "27.50" | null, error }. Komma und Punkt erlaubt. */
export function parsePercentInput(raw, { allowEmpty = false } = {}) {
  const t = trimmed(typeof raw === "number" ? String(raw) : raw);
  if (t === "") return allowEmpty ? { ok: true, value: null } : { ok: false, error: INPUT_TEXTS.percentRequired };
  const m = t.match(/^(\d{1,3})(?:[.,](\d{1,2}))?$/);
  if (!m) return { ok: false, error: INPUT_TEXTS.percentInvalid };
  const ganz = Number(m[1]);
  const nach = (m[2] || "").padEnd(2, "0");
  if (ganz > 100 || (ganz === 100 && Number(nach) > 0)) return { ok: false, error: INPUT_TEXTS.percentInvalid };
  return { ok: true, value: `${ganz}.${nach}` };
}

/** Euro-Eingabe → ganze Cent (darf negativ sein, nie 0). Rein über Zeichenketten. */
export function parseEuroToCents(raw) {
  const t = trimmed(raw).replace(/\s+/g, "");
  if (t === "") return { ok: false, error: INPUT_TEXTS.amountRequired };
  const m = t.match(/^([+-]?)(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (!m) return { ok: false, error: INPUT_TEXTS.amountInvalid };
  const cents = Number(m[2]) * 100 + Number((m[3] || "").padEnd(2, "0"));
  if (cents === 0) return { ok: false, error: INPUT_TEXTS.amountZero };
  return { ok: true, value: m[1] === "-" ? -cents : cents };
}

function pruefeDatum(value, today, { notBefore = false, notAfter = false } = {}) {
  const v = trimmed(value);
  if (v === "") return INPUT_TEXTS.dateRequired;
  if (!isIsoDate(v)) return INPUT_TEXTS.dateInvalid;
  if (notBefore && isIsoDate(today) && v < today) return INPUT_TEXTS.dateNotBeforeToday;
  if (notAfter && isIsoDate(today) && v > today) return INPUT_TEXTS.dateInFuture;
  return null;
}

function pruefeText(value, { required, max, requiredText, tooLongText }) {
  const v = trimmed(value);
  if (required && v === "") return { error: requiredText, value: null };
  if (v.length > max) return { error: tooLongText, value: null };
  return { error: null, value: v || null };
}
const grund = (value, required) => pruefeText(value, {
  required, max: MAX_REASON_LENGTH, requiredText: INPUT_TEXTS.reasonRequired, tooLongText: INPUT_TEXTS.reasonTooLong,
});

const ergebnis = (errors, body) => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, body, errors: {} });

// ── Bodies der Partneraktionen ──────────────────────────────────────────────

/** POST …/approve — Grundprovision Pflicht; Ebenen nur, wenn angegeben. */
export function buildApproveBody(form = {}) {
  const errors = {};
  const base = parsePercentInput(form.basePercent);
  const l1 = parsePercentInput(form.level1Percent, { allowEmpty: true });
  const l2 = parsePercentInput(form.level2Percent, { allowEmpty: true });
  if (!base.ok) errors.basePercent = base.error;
  if (!l1.ok) errors.level1Percent = l1.error;
  if (!l2.ok) errors.level2Percent = l2.error;
  const body = { basePercent: base.value };
  if (l1.ok && l1.value !== null) body.level1Percent = l1.value;
  if (l2.ok && l2.value !== null) body.level2Percent = l2.value;
  return ergebnis(errors, body);
}

/** POST …/reject — Begründung optional. */
export function buildRejectBody(form = {}) {
  const r = grund(form.reason, false);
  return ergebnis(r.error ? { reason: r.error } : {}, r.value ? { reason: r.value } : {});
}

/** POST …/deactivate — Grund aus der festen Liste, Notiz optional. */
export function buildDeactivateBody(form = {}) {
  const errors = {};
  const reason = DEACTIVATION_REASON_OPTIONS.some((o) => o.value === form.reason) ? form.reason : null;
  if (!reason) errors.reason = INPUT_TEXTS.reasonRequired;
  const note = pruefeText(form.note, { required: false, max: MAX_NOTE_LENGTH, requiredText: "", tooLongText: INPUT_TEXTS.noteTooLong });
  if (note.error) errors.note = note.error;
  const body = { reason };
  if (note.value) body.note = note.value;
  return ergebnis(errors, body);
}

/** PUT …/login — ausschließlich { enabled: boolean }. */
export function buildLoginBody(enabled) {
  return typeof enabled === "boolean" ? { ok: true, body: { enabled }, errors: {} } : { ok: false, errors: { enabled: "invalid" } };
}

/** POST …/rates — neue Satzversion, gültig ab heute oder später. */
export function buildRatesBody(form = {}, { today } = {}) {
  const errors = {};
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: true });
  if (dateError) errors.validFrom = dateError;
  const werte = {};
  for (const k of ["basePercent", "level1Percent", "level2Percent"]) {
    const p = parsePercentInput(form[k]);
    if (!p.ok) errors[k] = p.error; else werte[k] = p.value;
  }
  const r = grund(form.reason, false);
  if (r.error) errors.reason = r.error;
  const body = { validFrom: trimmed(form.validFrom), ...werte };
  if (r.value) body.reason = r.value;
  return ergebnis(errors, body);
}

// ── Level-Regeln ────────────────────────────────────────────────────────────
export const LEVEL_COUNT = 5;
export const DEFAULT_LEVEL_BONUSES = Object.freeze(["2.50", "5.00", "7.50", "10.00", "12.50"]);
export const DEFAULT_MIN_PACKAGES = 3;

/** Leeres Formular: Schwellen NICHT vorbelegt, Boni und Mindestpakete schon. */
export function emptyLevelRulesForm() {
  // Die Boni stehen im deutschen Zahlformat im Feld; gesendet wird über
  // parsePercentInput wieder „2.50".
  const stufen = () => DEFAULT_LEVEL_BONUSES.map((bonus, i) => ({ level: i + 1, threshold: "", bonusPercent: bonus.replace(".", ",") }));
  return {
    validFrom: "",
    minPackagesForActiveCustomer: String(DEFAULT_MIN_PACKAGES),
    customerLevels: stufen(),
    packageLevels: stufen(),
    reason: "",
  };
}

function pruefeStufen(stufen, prefix, errors) {
  const liste = arr(stufen);
  const out = [];
  if (liste.length !== LEVEL_COUNT) {
    errors[prefix] = `Es werden genau ${LEVEL_COUNT} Level benötigt.`;
    return out;
  }
  let vorher = null;
  liste.forEach((s, i) => {
    const t = trimmed(s?.threshold);
    let schwelle = null;
    if (t === "") errors[`${prefix}.${i}.threshold`] = INPUT_TEXTS.thresholdRequired;
    else if (!/^\d{1,9}$/.test(t)) errors[`${prefix}.${i}.threshold`] = INPUT_TEXTS.thresholdInvalid;
    else schwelle = Number(t);
    if (schwelle !== null && vorher !== null && schwelle <= vorher) errors[`${prefix}.${i}.threshold`] = INPUT_TEXTS.thresholdOrder;
    if (schwelle !== null) vorher = schwelle;
    const bonus = parsePercentInput(s?.bonusPercent);
    if (!bonus.ok) errors[`${prefix}.${i}.bonusPercent`] = bonus.error;
    out.push({ level: i + 1, threshold: schwelle, bonusPercent: bonus.ok ? bonus.value : null });
  });
  return out;
}

function regelTeil(form, errors) {
  const mp = trimmed(form.minPackagesForActiveCustomer);
  const min = /^\d{1,6}$/.test(mp) && Number(mp) >= 1 ? Number(mp) : null;
  if (min === null) errors.minPackagesForActiveCustomer = INPUT_TEXTS.minPackagesInvalid;
  return {
    minPackagesForActiveCustomer: min,
    customerLevels: pruefeStufen(form.customerLevels, "customerLevels", errors),
    packageLevels: pruefeStufen(form.packageLevels, "packageLevels", errors),
  };
}

/** POST /admin/sales-partner-level-rules — globale Version. */
export function buildGlobalLevelRulesBody(form = {}, { today } = {}) {
  const errors = {};
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: true });
  if (dateError) errors.validFrom = dateError;
  const teil = regelTeil(form, errors);
  const r = grund(form.reason, false);
  if (r.error) errors.reason = r.error;
  const body = { validFrom: trimmed(form.validFrom), ...teil };
  if (r.value) body.reason = r.value;
  return ergebnis(errors, body);
}

/** POST …/:id/level-rules — „inherit" (globale Regeln) oder eigene Regeln. */
export function buildPartnerLevelRulesBody(form = {}, { today } = {}) {
  const errors = {};
  const mode = form.mode === "inherit" || form.mode === "custom" ? form.mode : null;
  if (!mode) errors.mode = INPUT_TEXTS.modeRequired;
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: true });
  if (dateError) errors.validFrom = dateError;
  const r = grund(form.reason, false);
  if (r.error) errors.reason = r.error;
  let body = { mode, validFrom: trimmed(form.validFrom) };
  if (mode === "custom") body = { ...body, ...regelTeil(form, errors) };
  if (r.value) body.reason = r.value;
  return ergebnis(errors, body);
}

// ── Obergrenzen ─────────────────────────────────────────────────────────────
/** POST /admin/sales-partner-caps — leer heißt „keine Grenze" (null). */
export function buildCapBody(form = {}, { today } = {}) {
  const errors = {};
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: true });
  if (dateError) errors.validFrom = dateError;
  const own = parsePercentInput(form.maxOwnRatePercent, { allowEmpty: true });
  const total = parsePercentInput(form.maxTotalRatePercent, { allowEmpty: true });
  if (!own.ok) errors.maxOwnRatePercent = own.error;
  if (!total.ok) errors.maxTotalRatePercent = total.error;
  const r = grund(form.reason, false);
  if (r.error) errors.reason = r.error;
  const body = {
    validFrom: trimmed(form.validFrom),
    maxOwnRatePercent: own.ok ? own.value : null,
    maxTotalRatePercent: total.ok ? total.value : null,
  };
  if (r.value) body.reason = r.value;
  return ergebnis(errors, body);
}

// ── Provisionen: Rücknahme und Korrektur ────────────────────────────────────
/** POST /admin/sales-partner-commissions/decisions/:decisionId/reverse */
export function buildReverseBody(form = {}) {
  const r = grund(form.reason, true);
  return ergebnis(r.error ? { reason: r.error } : {}, { reason: r.value, reprocess: form.reprocess === true });
}

/** POST /admin/sales-partner-commissions/adjustments */
export function buildAdjustmentBody(form = {}) {
  const errors = {};
  const partnerUserId = positiveInt(form.partnerUserId);
  if (partnerUserId === null) errors.partnerUserId = INPUT_TEXTS.partnerRequired;
  const amount = parseEuroToCents(form.amount);
  if (!amount.ok) errors.amount = amount.error;
  const r = grund(form.reason, true);
  if (r.error) errors.reason = r.error;
  const s = trimmed(form.shipmentId);
  let shipmentId = null;
  if (s !== "") {
    if (/^[1-9][0-9]{0,15}$/.test(s)) shipmentId = Number(s);
    else errors.shipmentId = INPUT_TEXTS.shipmentInvalid;
  }
  const body = { partnerUserId, amountCents: amount.ok ? amount.value : null, reason: r.value };
  if (shipmentId !== null) body.shipmentId = shipmentId;
  return ergebnis(errors, body);
}

// ── Kundenzuordnung ─────────────────────────────────────────────────────────
/** PUT /admin/users/:id/sales-partner-attribution — partnerUserId null entfernt. */
export function buildAttributionBody(form = {}, { today } = {}) {
  const errors = {};
  let partnerUserId = null;
  if (form.remove !== true) {
    partnerUserId = positiveInt(form.partnerUserId);
    if (partnerUserId === null) errors.partnerUserId = INPUT_TEXTS.partnerRequired;
  }
  const dateError = pruefeDatum(form.effectiveDate, today, { notBefore: true });
  if (dateError) errors.effectiveDate = dateError;
  const r = grund(form.reason, true);
  if (r.error) errors.reason = r.error;
  return ergebnis(errors, { partnerUserId, effectiveDate: trimmed(form.effectiveDate), reason: r.value });
}

// ── Versandnachweis ─────────────────────────────────────────────────────────
/** POST /admin/shipments/:id/dispatch-evidence */
export function buildDispatchEvidenceBody(form = {}, { today } = {}) {
  const errors = {};
  const status = EVIDENCE_DECISION_OPTIONS.some((o) => o.value === form.status) ? form.status : null;
  if (!status) errors.status = INPUT_TEXTS.decisionRequired;
  const note = pruefeText(form.note, {
    required: true, max: MAX_NOTE_LENGTH, requiredText: INPUT_TEXTS.noteRequired, tooLongText: INPUT_TEXTS.noteTooLong,
  });
  if (note.error) errors.note = note.error;
  const body = { status, note: note.value };
  if (status === "dispatched") {
    const dateError = pruefeDatum(form.dispatchDate, today, { notAfter: true });
    if (dateError) errors.dispatchDate = dateError;
    const type = EVIDENCE_TYPE_OPTIONS.some((o) => o.value === form.evidenceType) ? form.evidenceType : null;
    if (!type) errors.evidenceType = INPUT_TEXTS.evidenceTypeRequired;
    body.dispatchDate = trimmed(form.dispatchDate);
    body.evidenceType = type;
  }
  return ergebnis(errors, body);
}

// ── Normalisierung der Antworten ────────────────────────────────────────────
export function normalizeAdminPartnerRow(raw) {
  const p = obj(raw);
  if (Object.keys(p).length === 0) return null;
  return {
    id: id(p.id),
    name: str(p.name),
    email: str(p.email),
    companyName: str(p.companyName),
    status: str(p.status),
    loginStatus: str(p.loginStatus),
    activeSince: str(p.activeSince),
    customersCount: int(p.customersCount),
    packagesLastMonth: int(p.packagesLastMonth),
    teamLevel1Count: int(p.teamLevel1Count),
    teamLevel2Count: int(p.teamLevel2Count),
    ownRatePercent: str(p.ownRatePercent),
    createdAt: str(p.createdAt),
  };
}

export const selectPartnerRows = (d) => arr(obj(d).partners).map(normalizeAdminPartnerRow).filter(Boolean);

/** Anzeigename eines Partners: Firma vor Name vor E-Mail. */
export const partnerDisplayName = (p) => (p && (p.companyName || p.name || p.email)) || "Vertriebspartner";

function normalizeLevelList(raw) {
  return arr(raw).map((s) => {
    const x = obj(s);
    return { level: int(x.level), threshold: int(x.threshold), bonusPercent: str(x.bonusPercent) };
  });
}

export function normalizeRuleSet(raw) {
  const r = obj(raw);
  if (Object.keys(r).length === 0) return null;
  return {
    id: r.id ?? null,
    scope: str(r.scope),
    mode: str(r.mode),
    validFrom: str(r.validFrom),
    minPackagesForActiveCustomer: int(r.minPackagesForActiveCustomer),
    customerLevels: normalizeLevelList(r.customerLevels),
    packageLevels: normalizeLevelList(r.packageLevels),
    reason: str(r.reason),
    createdAt: str(r.createdAt),
  };
}

export function normalizeCap(raw) {
  const c = obj(raw);
  if (Object.keys(c).length === 0) return null;
  return {
    id: c.id ?? null,
    validFrom: str(c.validFrom),
    maxOwnRatePercent: str(c.maxOwnRatePercent),
    maxTotalRatePercent: str(c.maxTotalRatePercent),
    reason: str(c.reason),
    createdAt: str(c.createdAt),
  };
}

export function normalizeVersioned(raw, normalize) {
  const d = obj(raw);
  return { current: d.current ? normalize(d.current) : null, history: arr(d.history).map(normalize).filter(Boolean) };
}

function normalizeRateVersion(raw) {
  const r = obj(raw);
  if (Object.keys(r).length === 0) return null;
  return {
    id: r.id ?? null,
    validFrom: str(r.validFrom),
    basePercent: str(r.basePercent),
    level1Percent: str(r.level1Percent),
    level2Percent: str(r.level2Percent),
    reason: str(r.reason),
    createdAt: str(r.createdAt),
  };
}

function normalizeTeamMember(raw) {
  const m = obj(raw);
  return {
    id: id(m.id),
    name: str(m.name),
    status: str(m.status),
    activeSince: str(m.activeSince),
    relevant: m.relevant === true,
    rank: int(m.rank),
    commissionCurrentMonthCents: int(m.commissionCurrentMonthCents),
    commissionTotalCents: int(m.commissionTotalCents),
  };
}

export function normalizeAdminPartnerDetail(raw) {
  const d = obj(raw);
  const p = obj(d.partner);
  const sponsor = p.sponsor && typeof p.sponsor === "object" ? { id: id(p.sponsor.id), name: str(p.sponsor.name) } : null;
  const rates = obj(d.rates);
  const lr = obj(d.levelRules);
  const team = obj(d.team);
  return {
    partner: {
      id: id(p.id),
      name: str(p.name),
      email: str(p.email),
      companyName: str(p.companyName),
      phone: str(p.phone),
      status: str(p.status),
      loginStatus: str(p.loginStatus),
      referralCode: str(p.referralCode),
      sponsor,
      sponsorCodeUsed: str(p.sponsorCodeUsed),
      agreementVersion: str(p.agreementVersion),
      agreementAcceptedAt: str(p.agreementAcceptedAt),
      createdAt: str(p.createdAt),
      approvedAt: str(p.approvedAt),
      contractEndedOn: str(p.contractEndedOn),
      deactivationReason: str(p.deactivationReason),
    },
    rates: {
      current: rates.current ? normalizeRateVersion(rates.current) : null,
      history: arr(rates.history).map(normalizeRateVersion).filter(Boolean),
    },
    statusHistory: arr(d.statusHistory).map((s) => {
      const x = obj(s);
      return { status: str(x.status), effectiveDate: str(x.effectiveDate), reason: str(x.reason), createdAt: str(x.createdAt) };
    }),
    levelRules: {
      mode: lr.mode === "custom" ? "custom" : (lr.mode === "global" ? "global" : null),
      current: lr.current ? normalizeRuleSet(lr.current) : null,
      history: arr(lr.history).map(normalizeRuleSet).filter(Boolean),
    },
    team: { level1: arr(team.level1).map(normalizeTeamMember), level2: arr(team.level2).map(normalizeTeamMember) },
    customers: arr(d.customers).map((c) => {
      const x = obj(c);
      return {
        customerId: id(x.customerId),
        companyName: str(x.companyName),
        assignedSince: str(x.assignedSince),
        assignedUntil: str(x.assignedUntil),
        source: str(x.source),
        referralCodeUsed: str(x.referralCodeUsed),
      };
    }),
    assessments: arr(d.assessments).map((a) => {
      const x = obj(a);
      return {
        month: str(x.month),
        measuredMonth: str(x.measuredMonth),
        activeCustomers: int(x.activeCustomers),
        shippedPackages: int(x.shippedPackages),
        customerLevel: int(x.customerLevel),
        customerBonusPercent: str(x.customerBonusPercent),
        packageLevel: int(x.packageLevel),
        packageBonusPercent: str(x.packageBonusPercent),
        minPackages: int(x.minPackages),
        ruleSetId: x.ruleSetId ?? null,
        createdAt: str(x.createdAt),
        version: int(x.version),
      };
    }),
  };
}

/** Admin-Provisionen eines Monats, inklusive Berechnungsgrundlage. */
export function normalizeAdminCommissions(raw) {
  const d = obj(raw);
  const t = obj(d.totals);
  return {
    month: str(d.month),
    totals: { accruedCents: int(t.accruedCents), payableCents: int(t.payableCents) },
    entries: arr(d.entries).map((e) => {
      const x = obj(e);
      const dec = x.decision && typeof x.decision === "object" ? obj(x.decision) : null;
      return {
        id: x.id ?? null,
        decisionId: id(x.decisionId),
        shipmentId: id(x.shipmentId),
        entryDate: str(x.entryDate),
        level: [0, 1, 2].includes(x.level) ? x.level : null,
        type: str(x.type),
        basisCents: int(x.basisCents),
        ratePercent: str(x.ratePercent),
        amountCents: int(x.amountCents),
        payable: x.payable === true,
        customerName: str(x.customerName),
        teamMemberName: str(x.teamMemberName),
        reasonCode: str(x.reasonCode),
        note: str(x.note),
        decision: dec ? {
          dispatchDate: str(dec.dispatchDate),
          baseRatePercent: str(dec.baseRatePercent),
          customerLevel: int(dec.customerLevel),
          customerBonusPercent: str(dec.customerBonusPercent),
          packageLevel: int(dec.packageLevel),
          packageBonusPercent: str(dec.packageBonusPercent),
          ownRatePercent: str(dec.ownRatePercent),
          capApplied: dec.capApplied === true,
          purchaseNetCents: int(dec.purchaseNetCents),
          customerNetCents: int(dec.customerNetCents),
        } : null,
      };
    }),
  };
}

/** Entscheidungen, die in dieser Liste bereits zurückgenommen wurden. */
export function reversedDecisionIds(entries) {
  return new Set(arr(entries).filter((e) => e && e.type === "reversal" && e.decisionId !== null).map((e) => String(e.decisionId)));
}

/** Darf eine Buchung eine Rücknahme anbieten? Nur Provisionsbuchungen mit
 *  Entscheidung, die noch nicht zurückgenommen ist. */
export function canReverseEntry(entry, reversed) {
  return !!entry && entry.type === "accrual" && entry.decisionId !== null && !(reversed && reversed.has(String(entry.decisionId)));
}

export function normalizeEvidence(raw) {
  const e = obj(raw);
  if (Object.keys(e).length === 0) return null;
  return {
    id: e.id ?? null,
    status: str(e.status),
    dispatchDate: str(e.dispatchDate),
    source: str(e.source),
    provider: str(e.provider),
    carrier: str(e.carrier),
    rawCode: str(e.rawCode),
    rawText: str(e.rawText),
    evidenceType: str(e.evidenceType),
    note: str(e.note),
    decidedBy: e.decidedBy ?? null,
    observedAt: str(e.observedAt),
    createdAt: str(e.createdAt),
  };
}

export function normalizeQueueItem(raw) {
  const q = obj(raw);
  const shipmentId = id(q.shipmentId);
  if (shipmentId === null) return null;
  return {
    shipmentId,
    provider: str(q.provider),
    carrier: str(q.carrier),
    bookedAt: str(q.bookedAt),
    packageCount: int(q.packageCount),
    trackingReferences: arr(q.trackingReferences).filter((t) => typeof t === "string" && t.trim() !== "").map((t) => t.trim()),
    lastTrackingStatus: str(q.lastTrackingStatus),
    lastTrackingText: str(q.lastTrackingText),
    lastTrackedAt: str(q.lastTrackedAt),
    cancellationStatus: str(q.cancellationStatus),
    evidenceStatus: str(q.evidenceStatus),
  };
}

export function normalizeAttribution(raw) {
  const d = obj(raw);
  const cur = d.current && typeof d.current === "object" ? obj(d.current) : null;
  return {
    current: cur ? {
      partnerId: id(cur.partnerId),
      partnerName: str(cur.partnerName),
      validFrom: str(cur.validFrom),
      source: str(cur.source),
      referralCodeUsed: str(cur.referralCodeUsed),
    } : null,
    history: arr(d.history).map((h) => {
      const x = obj(h);
      return {
        partnerId: id(x.partnerId),
        partnerName: str(x.partnerName),
        validFrom: str(x.validFrom),
        validTo: str(x.validTo),
        source: str(x.source),
        referralCodeUsed: str(x.referralCodeUsed),
        createdAt: str(x.createdAt),
      };
    }),
  };
}

// ── Fehlertexte der Adminaktionen ───────────────────────────────────────────
const STATUS_TEXTE = Object.freeze({
  404: "Der Datensatz wurde nicht gefunden. Es wurden keine Änderungen gespeichert.",
  429: "Zu viele Adminaktionen. Bitte versuchen Sie es in Kürze erneut.",
});

/** Ein verständlicher Satz zu einer fehlgeschlagenen Aktion. Bei 400/409/422
 *  der Text des Servers (Adminbereich), sonst ein sicherer Auffangtext. */
export function adminActionErrorText(status, body, fallback = "Die Aktion wurde nicht ausgeführt. Es wurden keine Änderungen gespeichert.") {
  if (status === 400 || status === 409 || status === 422) return customerText(body) || fallback;
  return STATUS_TEXTE[status] || fallback;
}

// ── Zeitpunkte (Adminanzeige) ───────────────────────────────────────────────
// Reine Kalendertage („YYYY-MM-DD") werden ohne Datumsobjekt umgestellt (keine
// Zeitzonenverschiebung); Zeitstempel über die Systemregion des Admins wie in
// den übrigen Adminansichten. Unlesbares ergibt „—", nie „Invalid Date".
export function formatTimestamp(value, { withTime = false } = {}) {
  if (typeof value !== "string" || value.trim() === "") return "—";
  const v = value.trim();
  const tag = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (tag) return `${tag[3]}.${tag[2]}.${tag[1]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return withTime
    ? d.toLocaleString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}
