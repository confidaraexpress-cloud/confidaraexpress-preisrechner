// ── Pre-Live-Testmodus des Vertriebspartnerprogramms (Admin) ────────────────
//
// Die Produktion soll intern vollständig testbar sein, bevor es echte Partner
// oder Kunden gibt — ohne rechtliche, steuerliche, finanzielle oder
// Anbieterwirkung. Über ALLES entscheidet der Server: der Schalter
// SALES_PARTNER_PRELIVE_TEST_MODE (Standard aus) und eine unveränderliche
// Testkennzeichnung an Konten, Sendungen und Gutschriften. Diese Datei
// prüft nur vor, baut Bodies (Allowlist der Vertragsfelder) und übersetzt
// Antworten in deutsche Texte; sie ersetzt keine Serverprüfung.
//
// Backendvertrag (Adminbereich, /admin/sales-partner-prelive):
//   GET  /status          → { enabled, mailAllowlistConfigured, backdatingGlobalAllowed,
//                             counts: { partners, customers, shipments, ledgerEntries, creditNotes } | null }
//   GET  /accounts        → { partners: [ { id, name, email, companyName, status, loginStatus,
//                             sponsorUserId, referralCode } ], customers: [ { id, name, companyName,
//                             email, partnerUserId } ] }
//   POST /partners        { name, email, companyName?, sponsorUserId? } → 201 { partner }
//   POST /accounts/:id/password-link → { resetUrl, expiresAt }
//   POST /customers       { companyName, email, name?, partnerUserId?, referralCode?, assignedSince? }
//                         → 201 { customer, attribution | null }
//   GET  /shipments?customerUserId=&partnerUserId=&limit=&offset= → { items, total }
//   POST /shipments       { customerUserId, shipDate, packageCount, customerNetCents,
//                           purchaseNetCents, dispatched?: true, paidOn? } → 201 { shipment }
//   POST /shipments/:id/paid { paidOn } → { shipment }
//   POST /scenarios       { kind: "levels" | "abc" | "team", … }
//   POST /commission-run  → { stats: { skippedTick, assessments, decided, accrued, skipped, failed } }
//   GET  /mail-preview?kind=…&partnerUserId=|creditNoteId= → { kind, subject, html, recipient }
//   GET  /cleanup         → { counts, blockers, confirmToken, nothingToDelete }
//   POST /cleanup         { confirmToken } → { deleted } | { nothingToDelete: true }
// Versandnachweis einer Testsendung: bestehende Route POST
// /admin/shipments/:id/dispatch-evidence. Ist der Modus aus, antwortet jeder
// Endpunkt außer /status mit 404 PRELIVE_TEST_MODE_DISABLED.
//
// Kein Code, kein Tabellen- oder Statuswert erscheint roh, wo eine Aussage
// daran hängt; ein unbekannter Code bekommt einen neutralen deutschen Text.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { EMAIL_RE } from "./registrationValidation.mjs";
import { normalizeReferralCode } from "./referralCapture.mjs";
import { adminActionErrorText, formatTimestamp, isIsoDate } from "./adminSalesPartnerView.mjs";
import { formatCents, formatCount, statusMetaFrom } from "./salesPartnerView.mjs";

const objOrNull = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const trimmed = (v) => (typeof v === "string" ? v.trim() : (typeof v === "number" ? String(v) : ""));
const own = (map, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);
const codeOf = (body) => (objOrNull(body) && typeof body.code === "string" ? body.code.trim() : "");
const ergebnis = (errors, body) => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, body, errors: {} });

/** Kennung: positive ganze Zahl (auch als Ziffernfolge) → Zahl; sonst null. */
export function prelivePositiveId(v) {
  if (Number.isInteger(v) && v > 0) return v;
  if (typeof v === "string" && /^[1-9][0-9]{0,15}$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}
export const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

export const MAX_TEXT_LENGTH = 200;
export const MAX_EMAIL_LENGTH = 255;
export const MAX_PACKAGES = 9999;

export const PRELIVE_TEXTS = Object.freeze({
  title: "Pre-Live-Testmodus",
  pageWarning: "Pre-Live-Testmodus aktiv – nur für interne Tests. Testdaten sind gekennzeichnet und werden vor dem Livegang bereinigt.",
  disabled: "Der Pre-Live-Testmodus ist nicht aktiv. Testkonten, Testsendungen und Testläufe stehen nur bei aktivem Modus zur Verfügung.",
  disabledAction: "Der Pre-Live-Testmodus ist nicht aktiv. Es wurde nichts angelegt oder geändert.",
  statusError: "Der Stand des Pre-Live-Testmodus konnte nicht geladen werden.",
  accountsError: "Die Testkonten konnten nicht geladen werden.",
  shipmentsError: "Die Testsendungen konnten nicht geladen werden.",
  shipmentNote: "Testsendung: keine Buchung beim Versanddienstleister, kein Label.",
  mailPreviewNote: "Vorschau – es wird keine E-Mail versendet.",
  passwordLinkHint: "Link gilt 15 Minuten, einmalig. Öffnen Sie ihn in einem privaten Fenster, um das Passwort des Testkontos zu setzen.",
  passwordLinkError: "Der Passwort-Link konnte nicht erzeugt werden.",
  commissionRunLabel: "Provisionslauf jetzt (nur Testdaten)",
  commissionRunBusy: "Ein Lauf ist gerade aktiv – bitte erneut versuchen",
  commissionRunConnection: "Die Verbindung wurde unterbrochen. Ob der Lauf ausgeführt wurde, zeigt der neu geladene Stand.",
  cleanupConfirmTitle: "Alle Pre-Live-Testdaten endgültig löschen?",
  cleanupConfirmText: "Gelöscht werden alle als Test gekennzeichneten Daten aus dem Probelauf. Das lässt sich nicht rückgängig machen.",
  cleanupBlocked: "Die Bereinigung ist blockiert – zuerst müssen diese Verweise aufgelöst werden:",
  cleanupStale: "Der Stand der Testdaten hat sich seit dem Probelauf geändert. Der Probelauf wurde neu geladen – bitte prüfen Sie ihn erneut.",
  cleanupNothing: "Es gibt keine Pre-Live-Testdaten zu löschen.",
  cleanupConnection: "Die Verbindung wurde unterbrochen. Ob gelöscht wurde, zeigt der neu geladene Probelauf.",
  testBadge: "TEST / PRE-LIVE",
});

// ── Stand des Modus ─────────────────────────────────────────────────────────
export const PRELIVE_COUNT_KEYS = Object.freeze(["partners", "customers", "shipments", "ledgerEntries", "creditNotes"]);
export const PRELIVE_COUNT_LABELS = Object.freeze({
  partners: "Testpartner",
  customers: "Testkunden",
  shipments: "Testsendungen",
  ledgerEntries: "Provisionsbuchungen",
  creditNotes: "Testgutschriften",
});

/** GET …/status → Stand; alles außer einem ausdrücklichen `enabled: true` ist „aus". */
export function normalizePreliveStatus(raw) {
  const d = objOrNull(raw) || {};
  const c = objOrNull(d.counts);
  return {
    enabled: d.enabled === true,
    mailAllowlistConfigured: d.mailAllowlistConfigured === true,
    backdatingGlobalAllowed: d.backdatingGlobalAllowed === true,
    counts: c ? Object.fromEntries(PRELIVE_COUNT_KEYS.map((k) => [k, int(c[k])])) : null,
  };
}
export const PRELIVE_DISABLED_STATUS = Object.freeze(normalizePreliveStatus(null));
export const preliveEnabled = (status) => !!status && status.enabled === true;

/** Zeilen der Zählung: [{ key, label, value }] — fehlende Werte „—". */
export function preliveCountRows(status) {
  const counts = status && status.counts ? status.counts : null;
  return PRELIVE_COUNT_KEYS.map((key) => ({ key, label: PRELIVE_COUNT_LABELS[key], value: counts ? formatCount(counts[key]) : "—" }));
}

// ── Testkonten ──────────────────────────────────────────────────────────────
function normalizeTestPartner(raw) {
  const p = objOrNull(raw);
  const id = p ? prelivePositiveId(p.id) : null;
  if (id === null) return null;
  return {
    id,
    name: str(p.name),
    email: str(p.email),
    companyName: str(p.companyName),
    status: str(p.status),
    loginStatus: str(p.loginStatus),
    sponsorUserId: prelivePositiveId(p.sponsorUserId),
    referralCode: str(p.referralCode),
  };
}

function normalizeTestCustomer(raw) {
  const c = objOrNull(raw);
  const id = c ? prelivePositiveId(c.id) : null;
  if (id === null) return null;
  return {
    id,
    name: str(c.name),
    companyName: str(c.companyName),
    email: str(c.email),
    partnerUserId: prelivePositiveId(c.partnerUserId),
  };
}

/** GET …/accounts → { partners, customers } (nur Testkonten; ohne Kennung keine Zeile). */
export function normalizePreliveAccounts(raw) {
  const d = objOrNull(raw) || {};
  return {
    partners: arr(d.partners).map(normalizeTestPartner).filter(Boolean),
    customers: arr(d.customers).map(normalizeTestCustomer).filter(Boolean),
  };
}

/** Anzeigename eines Testkontos: Firma vor Name vor E-Mail vor Kennung. */
export function testAccountName(account, fallback = "Testkonto") {
  if (!account) return fallback;
  return account.companyName || account.name || account.email || (account.id !== null && account.id !== undefined ? `${fallback} #${account.id}` : fallback);
}

/** Name eines Testpartners zu einer Kennung aus der Kontenliste — oder null. */
export function testPartnerNameById(partners, id) {
  const treffer = arr(partners).find((p) => sameId(p.id, id));
  return treffer ? testAccountName(treffer, "Testpartner") : null;
}

/** Ist dieses Kundenkonto ein Testkunde (laut Kontenliste des Servers)? */
export const isTestCustomer = (accounts, userId) => !!accounts && arr(accounts.customers).some((c) => sameId(c.id, userId));
/** Ist dieses Partnerkonto ein Testpartner (laut Kontenliste des Servers)? */
export const isTestPartner = (accounts, userId) => !!accounts && arr(accounts.partners).some((p) => sameId(p.id, userId));

export const INPUT = Object.freeze({
  nameRequired: "Bitte einen Namen angeben.",
  companyRequired: "Bitte einen Firmennamen angeben.",
  textTooLong: `Bitte höchstens ${MAX_TEXT_LENGTH} Zeichen angeben.`,
  emailInvalid: "Bitte eine gültige E-Mail-Adresse angeben.",
  partnerRequired: "Bitte einen Testpartner auswählen.",
  sponsorInvalid: "Bitte einen gültigen Sponsor auswählen.",
  customerRequired: "Bitte einen Testkunden auswählen.",
  codeInvalid: "Bitte einen gültigen Empfehlungscode angeben (8 Zeichen).",
  dateRequired: "Bitte ein Datum angeben.",
  dateInvalid: "Bitte ein gültiges Datum angeben.",
  dateInFuture: "Das Datum darf nicht in der Zukunft liegen.",
  monthInvalid: "Bitte einen Monat wählen.",
  countInvalid: "Bitte eine ganze Zahl ab 0 angeben.",
  countPositive: "Bitte eine ganze Zahl ab 1 angeben.",
  packagesInvalid: `Bitte eine ganze Zahl von 1 bis ${MAX_PACKAGES} angeben.`,
  amountRequired: "Bitte einen Betrag angeben.",
  amountInvalid: "Bitte einen Betrag in Euro ab 0 mit höchstens zwei Nachkommastellen angeben (z. B. 12,50).",
});

function pruefeName(value, { required, requiredText }) {
  const v = trimmed(value);
  if (!v) return required ? { error: requiredText, value: null } : { error: null, value: null };
  if (v.length > MAX_TEXT_LENGTH) return { error: INPUT.textTooLong, value: null };
  return { error: null, value: v };
}

function pruefeEmail(value) {
  const v = trimmed(value);
  if (!v || v.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(v)) return { error: INPUT.emailInvalid, value: null };
  return { error: null, value: v };
}

/** Datum „YYYY-MM-DD"; `required`, optional nicht nach `today` (Browseruhr, nur Vorabprüfung). */
function pruefeTag(value, { required = true, notAfter = false, today = "" } = {}) {
  const v = trimmed(value);
  if (!v) return required ? { error: INPUT.dateRequired, value: null } : { error: null, value: null };
  if (!isIsoDate(v)) return { error: INPUT.dateInvalid, value: null };
  if (notAfter && isIsoDate(today) && v > today) return { error: INPUT.dateInFuture, value: null };
  return { error: null, value: v };
}

/** Ganze Zahl aus einem Eingabefeld (Ziffern, höchstens sechs Stellen) ≥ min. */
function ganzzahl(value, { min = 0, max = 999999 } = {}) {
  const v = trimmed(value);
  if (!/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/** POST …/partners — Name und E-Mail Pflicht, Firma und Sponsor (Testpartner) optional. */
export function buildTestPartnerBody(form = {}) {
  const errors = {};
  const name = pruefeName(form.name, { required: true, requiredText: INPUT.nameRequired });
  if (name.error) errors.name = name.error;
  const email = pruefeEmail(form.email);
  if (email.error) errors.email = email.error;
  const firma = pruefeName(form.companyName, { required: false });
  if (firma.error) errors.companyName = firma.error;
  let sponsorUserId = null;
  if (trimmed(form.sponsorUserId) !== "") {
    sponsorUserId = prelivePositiveId(trimmed(form.sponsorUserId));
    if (sponsorUserId === null) errors.sponsorUserId = INPUT.sponsorInvalid;
  }
  const body = { name: name.value, email: email.value };
  if (firma.value) body.companyName = firma.value;
  if (sponsorUserId !== null) body.sponsorUserId = sponsorUserId;
  return ergebnis(errors, body);
}

export const CUSTOMER_ASSIGNMENT_OPTIONS = Object.freeze([
  Object.freeze({ value: "none", label: "Ohne Zuordnung" }),
  Object.freeze({ value: "partner", label: "Testpartner auswählen" }),
  Object.freeze({ value: "code", label: "Empfehlungscode eines Testpartners" }),
]);

/** POST …/customers — Firma und E-Mail Pflicht; Zuordnung über Testpartner ODER
 *  Empfehlungscode, „zugeordnet seit" darf in der Vergangenheit liegen. */
export function buildTestCustomerBody(form = {}) {
  const errors = {};
  const firma = pruefeName(form.companyName, { required: true, requiredText: INPUT.companyRequired });
  if (firma.error) errors.companyName = firma.error;
  const email = pruefeEmail(form.email);
  if (email.error) errors.email = email.error;
  const name = pruefeName(form.name, { required: false });
  if (name.error) errors.name = name.error;
  const art = CUSTOMER_ASSIGNMENT_OPTIONS.some((o) => o.value === form.assignment) ? form.assignment : "none";
  const body = { companyName: firma.value, email: email.value };
  if (name.value) body.name = name.value;
  if (art === "partner") {
    const pid = prelivePositiveId(trimmed(form.partnerUserId));
    if (pid === null) errors.partnerUserId = INPUT.partnerRequired;
    else body.partnerUserId = pid;
  } else if (art === "code") {
    const code = normalizeReferralCode(trimmed(form.referralCode));
    if (!code) errors.referralCode = INPUT.codeInvalid;
    else body.referralCode = code;
  }
  if (art !== "none") {
    const seit = pruefeTag(form.assignedSince, { required: false });
    if (seit.error) errors.assignedSince = seit.error;
    else if (seit.value) body.assignedSince = seit.value;
  }
  return ergebnis(errors, body);
}

// ── Testsendungen ───────────────────────────────────────────────────────────

/** Euro-Eingabe ≥ 0 → ganze Cent (0 ist ein gültiger Betrag). Rein über Zeichenketten. */
export function parseNonNegativeEuroToCents(raw) {
  const t = trimmed(raw).replace(/\s+/g, "");
  if (t === "") return { ok: false, error: INPUT.amountRequired };
  const m = t.match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (!m) return { ok: false, error: INPUT.amountInvalid };
  return { ok: true, value: Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0")) };
}

/** Provisionsfähige Basis = Kundenversandnetto − Einkaufsversandnetto (Cent) — oder null. */
export function shipmentBasisCents(customerNetCents, purchaseNetCents) {
  return Number.isInteger(customerNetCents) && Number.isInteger(purchaseNetCents) ? customerNetCents - purchaseNetCents : null;
}

/** Vorschau der Basis aus den Formularwerten: „12,50 €" oder null (unvollständig). */
export function shipmentBasisPreview(form = {}) {
  const k = parseNonNegativeEuroToCents(form.customerNet);
  const e = parseNonNegativeEuroToCents(form.purchaseNet);
  const basis = k.ok && e.ok ? shipmentBasisCents(k.value, e.value) : null;
  return basis === null ? null : formatCents(basis);
}

/** POST …/shipments — Beträge als Euro eingegeben, in Cent gesendet; `dispatched`
 *  nur als ausdrückliches true, `paidOn` nur mit Datum. */
export function buildTestShipmentBody(form = {}) {
  const errors = {};
  const customerUserId = prelivePositiveId(trimmed(form.customerUserId));
  if (customerUserId === null) errors.customerUserId = INPUT.customerRequired;
  const tag = pruefeTag(form.shipDate);
  if (tag.error) errors.shipDate = tag.error;
  const pakete = ganzzahl(form.packageCount, { min: 1, max: MAX_PACKAGES });
  if (pakete === null) errors.packageCount = INPUT.packagesInvalid;
  const kunde = parseNonNegativeEuroToCents(form.customerNet);
  if (!kunde.ok) errors.customerNet = kunde.error;
  const einkauf = parseNonNegativeEuroToCents(form.purchaseNet);
  if (!einkauf.ok) errors.purchaseNet = einkauf.error;
  const bezahlt = pruefeTag(form.paidOn, { required: false });
  if (bezahlt.error) errors.paidOn = bezahlt.error;
  const body = {
    customerUserId,
    shipDate: tag.value,
    packageCount: pakete,
    customerNetCents: kunde.ok ? kunde.value : null,
    purchaseNetCents: einkauf.ok ? einkauf.value : null,
  };
  if (form.dispatched === true) body.dispatched = true;
  if (bezahlt.value) body.paidOn = bezahlt.value;
  return ergebnis(errors, body);
}

/** POST …/shipments/:id/paid — Zahlungsdatum Pflicht, nicht in der Zukunft. */
export function buildMarkPaidBody(form = {}, { today } = {}) {
  const tag = pruefeTag(form.paidOn, { notAfter: true, today });
  return ergebnis(tag.error ? { paidOn: tag.error } : {}, { paidOn: tag.value });
}

/** POST /admin/shipments/:id/dispatch-evidence für eine Testsendung: „Versendet"
 *  mit Datum (nicht in der Zukunft), Nachweisart „other", Notiz „Pre-Live-Test". */
export function buildTestDispatchBody(form = {}, { today } = {}) {
  const tag = pruefeTag(form.dispatchDate, { notAfter: true, today });
  return ergebnis(tag.error ? { dispatchDate: tag.error } : {},
    { status: "dispatched", dispatchDate: tag.value, evidenceType: "other", note: "Pre-Live-Test" });
}

function normalizeShipment(raw) {
  const s = objOrNull(raw);
  const id = s ? prelivePositiveId(s.id) : null;
  if (id === null) return null;
  const ev = objOrNull(s.evidence);
  const dec = objOrNull(s.decision);
  const customerNetCents = int(s.customerNetCents);
  const purchaseNetCents = int(s.purchaseNetCents);
  return {
    id,
    reference: str(s.reference),
    customerUserId: prelivePositiveId(s.customerUserId),
    customerCompanyName: str(s.customerCompanyName),
    partnerUserId: prelivePositiveId(s.partnerUserId),
    shipDate: str(s.shipDate),
    packageCount: int(s.packageCount),
    customerNetCents,
    purchaseNetCents,
    // Die Basis des Servers; fehlt sie, bleibt sie leer — die Oberfläche
    // rechnet sie nur in der Eingabevorschau.
    basisCents: int(s.basisCents),
    evidence: ev ? { status: str(ev.status), dispatchDate: str(ev.dispatchDate) } : null,
    paidAt: str(s.paidAt),
    decision: dec ? { outcome: str(dec.outcome) } : null,
  };
}
export const normalizePreliveShipment = normalizeShipment;

/** GET …/shipments → { items, total }. */
export function normalizePreliveShipments(raw) {
  const d = objOrNull(raw) || {};
  return { items: arr(d.items).map(normalizeShipment).filter(Boolean), total: int(d.total) };
}

/** Filter der Sendungsliste: nur gültige Kennungen, Seite → limit/offset. */
export function shipmentListQuery({ customerUserId, partnerUserId, page = 1, pageSize = 25 } = {}) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 25;
  const p = Number.isInteger(page) && page >= 1 ? page : 1;
  const q = { limit: size, offset: (p - 1) * size };
  const kunde = prelivePositiveId(trimmed(customerUserId));
  const partner = prelivePositiveId(trimmed(partnerUserId));
  if (kunde !== null) q.customerUserId = kunde;
  if (partner !== null) q.partnerUserId = partner;
  return q;
}

/** Darf eine Testsendung noch einen Versandnachweis bekommen? Nur ohne „Versendet". */
export const canRecordDispatch = (s) => !!s && (s.evidence === null || s.evidence.status !== "dispatched");
/** Darf eine Testsendung als bezahlt markiert werden? Nur ohne Zahlungsdatum. */
export const canMarkShipmentPaid = (s) => !!s && !s.paidAt;

const OUTCOME_META = Object.freeze({
  accrued: Object.freeze(["badge-green", "Provision gutgeschrieben"]),
  non_positive_basis: Object.freeze(["badge-gray", "Keine Provision (Basis ≤ 0)"]),
  cap_exceeded: Object.freeze(["badge-yellow", "Obergrenze überschritten"]),
  no_eligible_beneficiary: Object.freeze(["badge-gray", "Kein provisionsberechtigter Partner"]),
});
/** Ergebnis der Provisionsentscheidung; ohne Entscheidung „Noch keine Entscheidung". */
export function decisionOutcomeMeta(decision) {
  if (!decision || !decision.outcome) return ["badge-gray", "Noch keine Entscheidung"];
  return statusMetaFrom(OUTCOME_META, decision.outcome);
}

/** „Bezahlt am 05.10.2026" bzw. „Offen". */
export function paidText(shipment) {
  const am = formatTimestamp(shipment?.paidAt);
  return am !== "—" ? `Bezahlt am ${am}` : "Offen";
}

// ── Schnellszenarien ────────────────────────────────────────────────────────
export const SCENARIO_KINDS = Object.freeze(["levels", "abc", "team"]);
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

/** { kind: "levels", partnerUserId, month, activeCustomers, packages, packagesPerShipment?, inactiveCustomers? } */
export function buildLevelsScenarioBody(form = {}) {
  const errors = {};
  const partnerUserId = prelivePositiveId(trimmed(form.partnerUserId));
  if (partnerUserId === null) errors.partnerUserId = INPUT.partnerRequired;
  const month = trimmed(form.month);
  if (!MONAT.test(month)) errors.month = INPUT.monthInvalid;
  const activeCustomers = ganzzahl(form.activeCustomers);
  if (activeCustomers === null) errors.activeCustomers = INPUT.countInvalid;
  const packages = ganzzahl(form.packages);
  if (packages === null) errors.packages = INPUT.countInvalid;
  const body = { kind: "levels", partnerUserId, month, activeCustomers, packages };
  if (trimmed(form.packagesPerShipment) !== "") {
    const pps = ganzzahl(form.packagesPerShipment, { min: 1 });
    if (pps === null) errors.packagesPerShipment = INPUT.countPositive;
    else body.packagesPerShipment = pps;
  }
  if (trimmed(form.inactiveCustomers) !== "") {
    const inaktiv = ganzzahl(form.inactiveCustomers);
    if (inaktiv === null) errors.inactiveCustomers = INPUT.countInvalid;
    else body.inactiveCustomers = inaktiv;
  }
  return ergebnis(errors, body);
}

/** { kind: "abc", activeSince, packagesPerCustomer? } */
export function buildAbcScenarioBody(form = {}) {
  const errors = {};
  const seit = pruefeTag(form.activeSince);
  if (seit.error) errors.activeSince = seit.error;
  const body = { kind: "abc", activeSince: seit.value };
  if (trimmed(form.packagesPerCustomer) !== "") {
    const ppc = ganzzahl(form.packagesPerCustomer, { min: 1 });
    if (ppc === null) errors.packagesPerCustomer = INPUT.countPositive;
    else body.packagesPerCustomer = ppc;
  }
  return ergebnis(errors, body);
}

/** { kind: "team", sponsorUserId, count, activeSince } */
export function buildTeamScenarioBody(form = {}) {
  const errors = {};
  const sponsorUserId = prelivePositiveId(trimmed(form.sponsorUserId));
  if (sponsorUserId === null) errors.sponsorUserId = INPUT.partnerRequired;
  const count = ganzzahl(form.count, { min: 1 });
  if (count === null) errors.count = INPUT.countPositive;
  const seit = pruefeTag(form.activeSince);
  if (seit.error) errors.activeSince = seit.error;
  return ergebnis(errors, { kind: "team", sponsorUserId, count, activeSince: seit.value });
}

// Vorgaben für Grenzfälle: Level 1, 3 und 5 jeder Dimension, wahlweise knapp
// darunter, genau auf oder knapp über der Schwelle. Die Schwellen kommen aus
// der aktuellen globalen Regelversion, ohne sie aus den Startwerten des
// Servers — nie aus dem Frontend.
export const PRESET_LEVELS = Object.freeze([1, 3, 5]);
export const THRESHOLD_OFFSETS = Object.freeze([
  Object.freeze({ value: -1, label: "knapp darunter (−1)" }),
  Object.freeze({ value: 0, label: "genau auf der Schwelle" }),
  Object.freeze({ value: 1, label: "knapp darüber (+1)" }),
]);

function stufenVorgaben(liste) {
  const stufen = arr(liste);
  const out = [];
  for (const level of PRESET_LEVELS) {
    const s = stufen.find((x) => x && x.level === level);
    if (!s || !Number.isInteger(s.threshold) || s.threshold < 1) return null;
    out.push({ level, threshold: s.threshold });
  }
  return out;
}

/** { customer: [{ level, threshold }], package: [...] } aus einer Regelquelle — oder null. */
export function scenarioPresets(rules) {
  const r = objOrNull(rules);
  if (!r) return null;
  const customer = stufenVorgaben(r.customerLevels);
  const pkg = stufenVorgaben(r.packageLevels);
  return customer && pkg ? { customer, package: pkg } : null;
}

/** Wert einer Vorgabe mit Lage zur Schwelle (nie unter 0). */
export function presetValue(threshold, offset = 0) {
  if (!Number.isInteger(threshold)) return "";
  const o = THRESHOLD_OFFSETS.some((x) => x.value === offset) ? offset : 0;
  return String(Math.max(0, threshold + o));
}

/** Ergebnis eines Szenarios → { text, links: [{ id, label }] }. */
export function scenarioResult(kind, raw) {
  const d = objOrNull(raw) || {};
  if (kind === "levels") {
    const c = objOrNull(d.created) || {};
    return {
      text: `Angelegt: ${formatCount(int(c.customers))} Kunden, ${formatCount(int(c.shipments))} Sendungen, ${formatCount(int(c.packages))} Pakete.`,
      links: [],
    };
  }
  if (kind === "abc") {
    const p = objOrNull(d.partners) || {};
    const links = [["a", "Partner A"], ["b", "Partner B"], ["c", "Partner C"]]
      .map(([k, label]) => ({ id: prelivePositiveId(p[k]), label }))
      .filter((l) => l.id !== null);
    return { text: "Die Testpartner A, B und C wurden angelegt.", links };
  }
  if (kind === "team") {
    const ids = arr(d.partnerIds).map(prelivePositiveId).filter((x) => x !== null);
    return { text: `Angelegt: ${formatCount(ids.length)} Teampartner.`, links: ids.map((id) => ({ id, label: `Testpartner #${id}` })) };
  }
  return { text: "Das Szenario wurde angelegt.", links: [] };
}

// ── Provisionslauf (nur Testdaten) ──────────────────────────────────────────
// Eine fehlende Obergrenze stellt nichts mehr zurück (optional, Canonical Context 12A) — nur eine
// unbrauchbare Version (individuell oder global) ist ein Zurückstellungsgrund des Servers.
const SKIP_LABELS = Object.freeze({
  partner_cap_invalid: "Individuelle Obergrenze unbrauchbar",
  global_cap_invalid: "Globale Obergrenze unbrauchbar",
  assessment_not_due: "Monatsbewertung noch nicht fällig",
  global_rules_missing: "Keine globalen Level-Regeln",
  global_rules_invalid: "Globale Level-Regeln ungültig",
  partner_rules_invalid: "Level-Regeln des Partners ungültig",
  decision_exists: "Entscheidung bereits vorhanden",
});
export const SKIP_UNKNOWN = "Sonstiger Grund";
/** Zurückstellungsgrund als deutsches Label; ein unbekannter Code nie roh. */
export const skipReasonLabel = (code) => (own(SKIP_LABELS, code) ? SKIP_LABELS[code] : SKIP_UNKNOWN);

/** POST …/commission-run → { busy, rows, skipped }. */
export function normalizeCommissionRun(raw) {
  const s = objOrNull(objOrNull(raw)?.stats) || {};
  const sk = objOrNull(s.skipped) || {};
  const skipped = Object.keys(sk)
    .filter((code) => Number.isInteger(sk[code]) && sk[code] > 0)
    .map((code) => ({ code, label: skipReasonLabel(code), count: sk[code] }));
  return {
    busy: s.skippedTick === true,
    rows: [
      { key: "assessments", label: "Monatsbewertungen angelegt", value: formatCount(int(s.assessments)) },
      { key: "decided", label: "Provisionsentscheidungen", value: formatCount(int(s.decided)) },
      { key: "accrued", label: "davon gutgeschrieben", value: formatCount(int(s.accrued)) },
      { key: "failed", label: "Fehlgeschlagen", value: formatCount(int(s.failed)) },
    ],
    skipped,
  };
}

// ── E-Mail-Vorschau ─────────────────────────────────────────────────────────
export const MAIL_PREVIEW_KINDS = Object.freeze([
  Object.freeze({ value: "partner_registration_pending", label: "Registrierung eingegangen", needs: "partner" }),
  Object.freeze({ value: "partner_approved", label: "Freigabe als Vertriebspartner", needs: "partner" }),
  Object.freeze({ value: "billing_details_changed", label: "Abrechnungsdaten geändert", needs: "partner" }),
  Object.freeze({ value: "credit_note_available", label: "Neue Gutschrift verfügbar", needs: "creditNote" }),
]);
export const mailPreviewKind = (value) => MAIL_PREVIEW_KINDS.find((k) => k.value === value) || null;

/** Abfrage der Vorschau: { kind, partnerUserId } bzw. { kind, creditNoteId }. */
export function buildMailPreviewQuery(form = {}) {
  const art = mailPreviewKind(form.kind);
  if (!art) return { ok: false, errors: { kind: "Bitte eine E-Mail auswählen." } };
  if (art.needs === "creditNote") {
    const creditNoteId = prelivePositiveId(trimmed(form.creditNoteId));
    return creditNoteId === null
      ? { ok: false, errors: { creditNoteId: "Bitte eine Testgutschrift auswählen." } }
      : { ok: true, query: { kind: art.value, creditNoteId }, errors: {} };
  }
  const partnerUserId = prelivePositiveId(trimmed(form.partnerUserId));
  return partnerUserId === null
    ? { ok: false, errors: { partnerUserId: INPUT.partnerRequired } }
    : { ok: true, query: { kind: art.value, partnerUserId }, errors: {} };
}

/** GET …/mail-preview → { kind, subject, html, recipient } — ohne HTML keine Vorschau (null).
 *  Das HTML wird ausschließlich in einem iframe mit sandbox="" (srcdoc) gezeigt. */
export function normalizeMailPreview(raw) {
  const d = objOrNull(raw);
  if (!d || typeof d.html !== "string" || d.html.trim() === "") return null;
  return { kind: str(d.kind), subject: str(d.subject), html: d.html, recipient: str(d.recipient) };
}

// ── Bereinigung ─────────────────────────────────────────────────────────────
function zaehlungen(raw) {
  const c = objOrNull(raw) || {};
  return Object.keys(c).filter((k) => Number.isInteger(c[k])).map((key) => ({ key, count: c[key] }));
}
function blockaden(raw) {
  return arr(raw).map((b) => {
    const x = objOrNull(b);
    return x && str(x.table) ? { table: str(x.table), column: str(x.column), count: int(x.count) } : null;
  }).filter(Boolean);
}

/** GET …/cleanup → { counts, blockers, confirmToken, nothingToDelete }. */
export function normalizeCleanupDryRun(raw) {
  const d = objOrNull(raw) || {};
  return {
    counts: zaehlungen(d.counts),
    blockers: blockaden(d.blockers),
    confirmToken: str(d.confirmToken),
    nothingToDelete: d.nothingToDelete === true,
  };
}

/** Löschen nur mit Probelauf, Token, ohne Blockade und mit etwas zu löschen. */
export const cleanupDeletable = (dry) => !!dry && dry.blockers.length === 0 && dry.nothingToDelete !== true && !!dry.confirmToken;

/** POST …/cleanup — ausschließlich das Token des Probelaufs. */
export function buildCleanupBody(dry) {
  return cleanupDeletable(dry) ? { ok: true, body: { confirmToken: dry.confirmToken }, errors: {} } : { ok: false, errors: { cleanup: "nicht löschbar" } };
}

/** Blockade als Satz: „Tabelle shipments, Spalte user_id: 3 Verweise". */
export function blockerText(b) {
  if (!b) return "";
  const spalte = b.column ? `, Spalte ${b.column}` : "";
  const anzahl = Number.isInteger(b.count) ? `: ${formatCount(b.count)} ${b.count === 1 ? "Verweis" : "Verweise"}` : "";
  return `Tabelle ${b.table}${spalte}${anzahl}`;
}

/** Antwort der Bereinigung → { kind, text, deleted, blockers, reload }. */
export function cleanupOutcome(status, body) {
  const d = objOrNull(body) || {};
  const code = codeOf(body);
  if (status === 200 || status === 201) {
    if (d.nothingToDelete === true) return { kind: "nothing", text: PRELIVE_TEXTS.cleanupNothing, deleted: [], blockers: [], reload: true };
    return { kind: "deleted", text: "Die Pre-Live-Testdaten wurden gelöscht.", deleted: zaehlungen(d.deleted), blockers: [], reload: true };
  }
  if (status === 409 && code === "CLEANUP_BLOCKED") {
    return { kind: "blocked", text: PRELIVE_TEXTS.cleanupBlocked, deleted: [], blockers: blockaden(d.blockers), reload: true };
  }
  if (status === 409 && code === "CLEANUP_STALE") return { kind: "stale", text: PRELIVE_TEXTS.cleanupStale, deleted: [], blockers: [], reload: true };
  if (code === "PRELIVE_TEST_MODE_DISABLED") return { kind: "disabled", text: PRELIVE_TEXTS.disabledAction, deleted: [], blockers: [], reload: false };
  if (!Number.isInteger(status) || status >= 500) {
    return { kind: "error", text: PRELIVE_TEXTS.cleanupConnection, deleted: [], blockers: [], reload: true };
  }
  return { kind: "error", text: adminActionErrorText(status, body, "Es wurde nichts gelöscht."), deleted: [], blockers: [], reload: false };
}

// ── Passwort-Link ───────────────────────────────────────────────────────────
/** POST …/accounts/:id/password-link → { resetUrl, expiresAt } — oder null.
 *  Der Link lebt nur im Komponentenzustand (nie localStorage, nie ein Log). */
export function normalizePasswordLink(raw) {
  const d = objOrNull(raw);
  const url = d ? str(d.resetUrl) : null;
  if (!url || /\s/.test(url)) return null;
  return { resetUrl: url, expiresAt: str(d.expiresAt) };
}

// ── Fehler der Pre-Live-Aktionen ────────────────────────────────────────────
// Feste deutsche Texte für jeden Vertragscode; das Feld, an dem der Fehler
// steht, folgt dem Vertrag (bei SCENARIO_INVALID/AMOUNT_INVALID dem `field`
// der Antwort).
const CODE_TEXTE = Object.freeze({
  NAME_INVALID: ["name", "Bitte einen gültigen Namen angeben."],
  EMAIL_INVALID: ["email", "Bitte eine gültige E-Mail-Adresse angeben."],
  COMPANY_INVALID: ["companyName", "Bitte einen gültigen Firmennamen angeben."],
  EMAIL_EXISTS: ["email", "Zu dieser E-Mail-Adresse gibt es bereits ein Konto."],
  SPONSOR_NOT_TEST: ["sponsorUserId", "Als Sponsor ist nur ein Testpartner zulässig."],
  SPONSOR_NOT_FOUND: ["sponsorUserId", "Der gewählte Sponsor wurde nicht gefunden."],
  DATE_INVALID: ["assignedSince", "Bitte ein gültiges Datum angeben."],
  PARTNER_NOT_TEST: ["partnerUserId", "Hier ist nur ein Testpartner zulässig."],
  PARTNER_NOT_ACTIVE: ["partnerUserId", "Der Testpartner ist nicht aktiv. Bitte geben Sie ihn zuerst über seine Partnerseite frei."],
  REFERRAL_CODE_UNKNOWN: ["referralCode", "Zu diesem Empfehlungscode gibt es keinen Testpartner."],
  SHIP_DATE_INVALID: ["shipDate", "Bitte ein gültiges Versanddatum angeben."],
  PACKAGE_COUNT_INVALID: ["packageCount", "Bitte eine gültige Paketanzahl angeben."],
  AMOUNT_INVALID: ["customerNetCents", "Bitte gültige Beträge in Euro angeben."],
  PAID_ON_INVALID: ["paidOn", "Bitte ein gültiges Zahlungsdatum angeben."],
  CUSTOMER_NOT_TEST: ["customerUserId", "Testsendungen gibt es nur für Testkunden."],
  CUSTOMER_NOT_FOUND: ["customerUserId", "Der Testkunde wurde nicht gefunden."],
  ALREADY_PAID: ["", "Die Testsendung ist bereits als bezahlt markiert. Es wurde nichts geändert."],
  SCENARIO_INVALID: ["", "Bitte prüfen Sie die Angaben des Szenarios."],
  DISPATCH_DATE_IN_FUTURE: ["dispatchDate", "Das Versanddatum darf nicht in der Zukunft liegen."],
  DISPATCH_DATE_BEFORE_BOOKING: ["dispatchDate", "Das Versanddatum darf nicht vor dem Buchungsdatum der Sendung liegen."],
  COMMISSION_DECISION_EXISTS: ["", "Für diese Sendung besteht bereits eine Provisionsentscheidung. Es wurde nichts geändert."],
});

/** Fehlerantwort einer Pre-Live-Aktion → { text, field, disabled, reload }.
 *  `fieldMap` übersetzt Vertragsfelder auf Formularfelder (z. B. customerNetCents
 *  → customerNet); `disabled`: der Modus ist aus — die Seite lädt ihren Stand neu. */
export function preliveErrorOutcome(status, body, { fieldMap = {} } = {}) {
  const d = objOrNull(body) || {};
  const code = codeOf(body);
  const feldAus = (f) => (f && own(fieldMap, f) ? fieldMap[f] : f) || null;
  if (code === "PRELIVE_TEST_MODE_DISABLED") return { text: PRELIVE_TEXTS.disabledAction, field: null, disabled: true, reload: false };
  if (own(CODE_TEXTE, code) && (status === 400 || status === 404 || status === 409 || status === 422)) {
    const [feld, text] = CODE_TEXTE[code];
    // SCENARIO_INVALID und AMOUNT_INVALID nennen das betroffene Feld selbst.
    const serverFeld = str(d.field);
    const ziel = (code === "SCENARIO_INVALID" || code === "AMOUNT_INVALID") && serverFeld ? serverFeld : feld;
    const satz = code === "SCENARIO_INVALID" && str(d.error) ? str(d.error) : text;
    return { text: satz, field: feldAus(ziel), disabled: false, reload: code === "ALREADY_PAID" || code === "COMMISSION_DECISION_EXISTS" };
  }
  return { text: adminActionErrorText(status, body), field: null, disabled: false, reload: false };
}
