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
//   • Vorbelegt wird ausschließlich mit Werten des SERVERS: den Startwerten
//     (`startDefaults` — Sätze, Mindestpakete, Schwellen und Boni) bzw. der
//     aktuellen Regelversion. Die Oberfläche kennt keine eigenen
//     Standardwerte; fehlen die Serverwerte oder sind sie unvollständig,
//     bleiben die Felder leer und Pflicht.
//   • Ohne Ebenen-Sätze in der Freigabe gelten die Server-Defaults.
//   • „Heute" kommt aus der Browseruhr des Admins nur als Vorabprüfung
//     (min-Attribut, „nicht vor heute"); entscheidend ist der Server.
//   • Zurückliegende Daten nur, wenn der Server es ausdrücklich erlaubt
//     (Pre-Live-Testmodus: `datesBeforeTodayAllowed` eines Testpartners bzw.
//     `backdatingAllowed` der globalen Regeln und Obergrenzen). Die Builder
//     lesen dafür `allowPast === true` — nie eine truthy-Angabe.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { customerText } from "./apiError.mjs";
import { formatPercent, partnerStatusMeta, statusMetaFrom } from "./salesPartnerView.mjs";
import { agreementDocumentPath } from "./salesPartnerAgreement.mjs";

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

/** Ein optionales Datum (leer = Serverstandard „heute"); zurückliegend erlaubt. */
function optionalesDatum(value) {
  const v = trimmed(value);
  if (v === "") return { error: null, value: null };
  return isIsoDate(v) ? { error: null, value: v } : { error: INPUT_TEXTS.dateInvalid, value: null };
}

/** Darf ein Wirksamkeitsdatum mitgesendet werden? Nur bei ausdrücklichem true. */
const mitDatum = (opts) => !!opts && opts.allowEffectiveDate === true;
/** Prüfung „nicht vor heute" — außer der Server erlaubt zurückliegende Daten. */
const nichtVorHeute = (opts) => !(opts && opts.allowPast === true);

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

/** POST …/approve — Grundprovision Pflicht; Ebenen nur, wenn angegeben.
 *  `effectiveDate` nur mit `allowEffectiveDate: true` (Testpartner im
 *  Pre-Live-Testmodus) und nur mit Wert — sonst gilt der Serverstandard „heute". */
export function buildApproveBody(form = {}, opts = {}) {
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
  if (mitDatum(opts)) {
    const d = optionalesDatum(form.effectiveDate);
    if (d.error) errors.effectiveDate = d.error;
    else if (d.value) body.effectiveDate = d.value;
  }
  return ergebnis(errors, body);
}

/** POST …/reject — Begründung optional. */
export function buildRejectBody(form = {}) {
  const r = grund(form.reason, false);
  return ergebnis(r.error ? { reason: r.error } : {}, r.value ? { reason: r.value } : {});
}

/** POST …/deactivate — Grund aus der festen Liste, Notiz optional;
 *  `effectiveDate` wie bei der Freigabe nur mit `allowEffectiveDate: true`. */
export function buildDeactivateBody(form = {}, opts = {}) {
  const errors = {};
  const reason = DEACTIVATION_REASON_OPTIONS.some((o) => o.value === form.reason) ? form.reason : null;
  if (!reason) errors.reason = INPUT_TEXTS.reasonRequired;
  const note = pruefeText(form.note, { required: false, max: MAX_NOTE_LENGTH, requiredText: "", tooLongText: INPUT_TEXTS.noteTooLong });
  if (note.error) errors.note = note.error;
  const body = { reason };
  if (note.value) body.note = note.value;
  if (mitDatum(opts)) {
    const d = optionalesDatum(form.effectiveDate);
    if (d.error) errors.effectiveDate = d.error;
    else if (d.value) body.effectiveDate = d.value;
  }
  return ergebnis(errors, body);
}

/** POST …/reactivate — ohne Angaben; `effectiveDate` nur mit `allowEffectiveDate: true`. */
export function buildReactivateBody(form = {}, opts = {}) {
  if (!mitDatum(opts)) return ergebnis({}, {});
  const d = optionalesDatum(form.effectiveDate);
  return ergebnis(d.error ? { effectiveDate: d.error } : {}, d.value ? { effectiveDate: d.value } : {});
}

/** PUT …/login — ausschließlich { enabled: boolean }. */
export function buildLoginBody(enabled) {
  return typeof enabled === "boolean" ? { ok: true, body: { enabled }, errors: {} } : { ok: false, errors: { enabled: "invalid" } };
}

/** POST …/rates — neue Satzversion, gültig ab heute oder später (mit
 *  `allowPast: true` auch zurückliegend). */
export function buildRatesBody(form = {}, opts = {}) {
  const { today } = opts || {};
  const errors = {};
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: nichtVorHeute(opts) });
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

// ── Startwerte des Servers (startDefaults) ──────────────────────────────────
// GET /admin/sales-partner-level-rules und GET /admin/sales-partners/:id
// liefern die Startwerte des Programms: Grundprovision, Team Ebene 1 und 2,
// Mindestpakete und je fünf Kunden- und Paketlevel. Sie sind die EINZIGE
// Quelle jeder Vorbelegung; ein ungültiger Teil wird verworfen (null) und
// nie aus eigenen Annahmen ergänzt.

/** Prozentwert des Servers („10.00", auch „2.5") → „10.00"; sonst null. */
const satzOderNull = (v) => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const p = parsePercentInput(String(v));
  return p.ok ? p.value : null;
};

/** Fünf Level mit Level 1 … 5, streng steigenden Schwellen ab 1 und gültigem
 *  Bonus — sonst null (der ganze Satz, kein Teilergebnis). */
function vollstaendigeStufen(raw) {
  const liste = arr(raw);
  if (liste.length !== LEVEL_COUNT) return null;
  const out = [];
  let vorher = 0;
  for (let i = 0; i < LEVEL_COUNT; i += 1) {
    const x = obj(liste[i]);
    const threshold = Number.isInteger(x.threshold) && x.threshold >= 1 ? x.threshold : null;
    const bonusPercent = satzOderNull(x.bonusPercent);
    if (x.level !== i + 1 || threshold === null || threshold <= vorher || bonusPercent === null) return null;
    vorher = threshold;
    out.push({ level: i + 1, threshold, bonusPercent });
  }
  return out;
}

/** Vollständiger Regelteil { minPackagesForActiveCustomer, customerLevels,
 *  packageLevels } — oder null. */
function vollstaendigeRegeln(raw) {
  const r = obj(raw);
  const min = Number.isInteger(r.minPackagesForActiveCustomer) && r.minPackagesForActiveCustomer >= 1
    ? r.minPackagesForActiveCustomer : null;
  const customerLevels = vollstaendigeStufen(r.customerLevels);
  const packageLevels = vollstaendigeStufen(r.packageLevels);
  return min !== null && customerLevels && packageLevels
    ? { minPackagesForActiveCustomer: min, customerLevels, packageLevels }
    : null;
}

/** startDefaults → { basePercent, level1Percent, level2Percent, rules } mit
 *  null für jeden unbrauchbaren Teil; ganz ohne brauchbaren Teil null. */
export function normalizeStartDefaults(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {
    basePercent: satzOderNull(raw.basePercent),
    level1Percent: satzOderNull(raw.level1Percent),
    level2Percent: satzOderNull(raw.level2Percent),
    rules: vollstaendigeRegeln(raw),
  };
  return out.basePercent || out.level1Percent || out.level2Percent || out.rules ? out : null;
}

/** Prozentwert für ein Eingabefeld im deutschen Zahlformat: „10.00" → „10,00";
 *  ohne gültigen Wert "". Gesendet wird über parsePercentInput wieder „10.00". */
export function percentInputValue(value) {
  const p = satzOderNull(value);
  return p ? p.replace(".", ",") : "";
}

/** Freigabeformular, vorbelegt mit den Startsätzen des Servers (sonst leer). */
export function approveFormFromDefaults(startDefaults) {
  const sd = startDefaults && typeof startDefaults === "object" ? startDefaults : {};
  return {
    basePercent: percentInputValue(sd.basePercent),
    level1Percent: percentInputValue(sd.level1Percent),
    level2Percent: percentInputValue(sd.level2Percent),
  };
}

const leereStufen = () => Array.from({ length: LEVEL_COUNT }, (_, i) => ({ level: i + 1, threshold: "", bonusPercent: "" }));

/** Leeres Formular: nichts vorbelegt — weder Schwellen noch Boni noch Mindestpakete. */
export function emptyLevelRulesForm() {
  return {
    validFrom: "",
    minPackagesForActiveCustomer: "",
    customerLevels: leereStufen(),
    packageLevels: leereStufen(),
    reason: "",
  };
}

/** Formular aus einer vollständigen Regelquelle (aktuelle Version des Servers
 *  oder `startDefaults.rules`); eine unvollständige Quelle ergibt das leere
 *  Formular. Boni stehen im deutschen Zahlformat im Feld. */
export function levelRulesFormFrom(rules) {
  const r = vollstaendigeRegeln(rules);
  if (!r) return emptyLevelRulesForm();
  const stufen = (liste) => liste.map((s) => ({ level: s.level, threshold: String(s.threshold), bonusPercent: percentInputValue(s.bonusPercent) }));
  return {
    ...emptyLevelRulesForm(),
    minPackagesForActiveCustomer: String(r.minPackagesForActiveCustomer),
    customerLevels: stufen(r.customerLevels),
    packageLevels: stufen(r.packageLevels),
  };
}

/** Ist diese Regelquelle vollständig genug für eine Vorbelegung? */
export const levelRulesComplete = (rules) => vollstaendigeRegeln(rules) !== null;

/** Vorbelegung der globalen Regeln: die aktuelle Version, ohne sie die
 *  Startwerte — dann mit „gültig ab heute", damit nur noch gespeichert werden
 *  muss. Ohne beides das leere Formular. */
export function prefillGlobalLevelRulesForm({ current = null, startDefaults = null, today = "" } = {}) {
  if (levelRulesComplete(current)) return { form: levelRulesFormFrom(current), source: "current" };
  if (levelRulesComplete(startDefaults?.rules)) {
    return { form: { ...levelRulesFormFrom(startDefaults.rules), validFrom: isIsoDate(today) ? today : "" }, source: "startDefaults" };
  }
  return { form: emptyLevelRulesForm(), source: null };
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
export function buildGlobalLevelRulesBody(form = {}, opts = {}) {
  const { today } = opts || {};
  const errors = {};
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: nichtVorHeute(opts) });
  if (dateError) errors.validFrom = dateError;
  const teil = regelTeil(form, errors);
  const r = grund(form.reason, false);
  if (r.error) errors.reason = r.error;
  const body = { validFrom: trimmed(form.validFrom), ...teil };
  if (r.value) body.reason = r.value;
  return ergebnis(errors, body);
}

/** POST …/:id/level-rules — „inherit" (globale Regeln) oder eigene Regeln. */
export function buildPartnerLevelRulesBody(form = {}, opts = {}) {
  const { today } = opts || {};
  const errors = {};
  const mode = form.mode === "inherit" || form.mode === "custom" ? form.mode : null;
  if (!mode) errors.mode = INPUT_TEXTS.modeRequired;
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: nichtVorHeute(opts) });
  if (dateError) errors.validFrom = dateError;
  const r = grund(form.reason, false);
  if (r.error) errors.reason = r.error;
  let body = { mode, validFrom: trimmed(form.validFrom) };
  if (mode === "custom") body = { ...body, ...regelTeil(form, errors) };
  if (r.value) body.reason = r.value;
  return ergebnis(errors, body);
}

// ── Obergrenzen ─────────────────────────────────────────────────────────────
// Eine Obergrenze ist optional: ohne Version gilt keine Grenze. Global gilt
// eine Version für alle Partner; mit `partnerUserId` ist sie die individuelle
// Obergrenze genau dieses Partners.
export const CAP_TEXTS = Object.freeze({
  globalNote: "Obergrenzen sind optional. Ohne konfigurierte Version gilt keine Obergrenze – Provisionen werden normal berechnet. Ein leeres Feld bedeutet „keine Grenze“.",
  globalNone: "Keine Obergrenze konfiguriert – es gilt keine Grenze.",
  partnerNone: "Keine individuelle Obergrenze – es gilt die globale Einstellung (standardmäßig keine Obergrenze).",
  partnerHint: "Ein leeres Feld bedeutet „keine Grenze“. Die individuelle Obergrenze gilt nur für diesen Vertriebspartner.",
  noLimit: "Keine Grenze",
  partnerInvalid: "Der Vertriebspartner ist ungültig.",
});

/** POST /admin/sales-partner-caps — leer heißt „keine Grenze" (null); mit
 *  `partnerUserId` die individuelle Obergrenze dieses Partners. */
export function buildCapBody(form = {}, opts = {}) {
  const { today, partnerUserId } = opts || {};
  const errors = {};
  const dateError = pruefeDatum(form.validFrom, today, { notBefore: nichtVorHeute(opts) });
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
  if (partnerUserId !== undefined && partnerUserId !== null) {
    const pid = positiveInt(partnerUserId);
    if (pid === null) errors.partnerUserId = CAP_TEXTS.partnerInvalid;
    else body.partnerUserId = pid;
  }
  return ergebnis(errors, body);
}

/** Anzeige eines Höchstsatzes: „35,00 %" oder „Keine Grenze". */
export const capLimitText = (value) => (satzOderNull(value) ? formatPercent(satzOderNull(value)) : CAP_TEXTS.noLimit);

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
export function buildAttributionBody(form = {}, opts = {}) {
  const { today } = opts || {};
  const errors = {};
  let partnerUserId = null;
  if (form.remove !== true) {
    partnerUserId = positiveInt(form.partnerUserId);
    if (partnerUserId === null) errors.partnerUserId = INPUT_TEXTS.partnerRequired;
  }
  const dateError = pruefeDatum(form.effectiveDate, today, { notBefore: nichtVorHeute(opts) });
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
    // Unveränderliche Testkennzeichnung des Servers (Pre-Live-Testmodus).
    preliveTest: p.preliveTest === true,
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

/** GET /admin/sales-partner-level-rules → { current, history, startDefaults, backdatingAllowed }. */
export function normalizeLevelRulesResponse(raw) {
  return {
    ...normalizeVersioned(raw, normalizeRuleSet),
    startDefaults: normalizeStartDefaults(obj(raw).startDefaults),
    backdatingAllowed: obj(raw).backdatingAllowed === true,
  };
}

/** GET /admin/sales-partner-caps (global oder ?partnerUserId=) → { current,
 *  history, backdatingAllowed } — die Freigabe trägt nur die globale Antwort. */
export function normalizeCapsResponse(raw) {
  return { ...normalizeVersioned(raw, normalizeCap), backdatingAllowed: obj(raw).backdatingAllowed === true };
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
      // Genau die registrierte Fassung, der zugestimmt wurde — nur ein Pfad auf DIESE API, sonst null.
      agreementDocumentPath: agreementDocumentPath(p.agreementDocumentPath),
      createdAt: str(p.createdAt),
      approvedAt: str(p.approvedAt),
      contractEndedOn: str(p.contractEndedOn),
      deactivationReason: str(p.deactivationReason),
      preliveTest: p.preliveTest === true,
    },
    // Nur für Testpartner im Pre-Live-Testmodus true: dann dürfen Freigabe,
    // Status, Sätze, Regeln und Obergrenze zurückliegende Daten tragen.
    datesBeforeTodayAllowed: d.datesBeforeTodayAllowed === true,
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
    // Startwerte des Servers — einzige Quelle der Vorbelegung (Freigabe, Regeln).
    startDefaults: normalizeStartDefaults(d.startDefaults),
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

/** PUT …/sales-partner-attribution: 409 PRELIVE_TEST_MISMATCH bekommt einen
 *  festen Satz (Testkunde ↔ echter Partner oder umgekehrt), sonst wie üblich. */
export const ATTRIBUTION_TEXTS = Object.freeze({
  testMismatch: "Testkunden lassen sich nur Testpartnern zuordnen und echte Kunden nur echten Vertriebspartnern. Es wurde nichts geändert.",
  pastAllowed: "Testkunde und Testpartner: Im Pre-Live-Testmodus darf das Datum zurückliegen.",
});
export function attributionErrorText(status, body) {
  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code.trim() : "";
  if (status === 409 && code === "PRELIVE_TEST_MISMATCH") return ATTRIBUTION_TEXTS.testMismatch;
  return adminActionErrorText(status, body);
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
