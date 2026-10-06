// ── Anzeige-Modelle des Vertriebspartnerportals (/partner) ───────────────────
//
// Reine Lese- und Formatierungslogik für Übersicht, Kunden, Provisionen und
// Team. Die Oberfläche rechnet hier NICHTS aus, was der Server entscheidet:
// keine Provision, kein Level, keine Auszahlbarkeit, kein Monat aus der
// Browseruhr. Beträge kommen in Cent als ganze Zahl, Prozentwerte als
// Zeichenkette mit zwei Nachkommastellen („27.50"), Tage als „YYYY-MM-DD",
// Monate als „YYYY-MM".
//
// Verbindlich:
//   • Kein Rohwert im sichtbaren Text — Status, Typen und Ebenen laufen über
//     deutsche Labels; Unbekanntes über statusFallback („Unbekannter Status").
//   • Ein fehlendes oder falsch typisiertes Feld ergibt „—", nie 0 und nie
//     einen geschätzten Wert.
//   • Die Bemessungsgrundlage heißt „Provisionsfähige Basis" — nie „Gewinn"
//     oder „Reingewinn".
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { money, isoDayDE } from "./formatters.js";
import { statusFallback } from "./statusFallback.mjs";

export const PARTNER_TEXTS = Object.freeze({
  payableNote: "Provision wird nach Zahlungseingang des Kunden auszahlbar.",
  basisLabel: "Provisionsfähige Basis",
  noAssessment: "Noch keine Monatsbewertung",
  noLink: "Noch kein Link verfügbar",
  inactive: "Ihr Partnerkonto ist derzeit inaktiv.",
  capApplied: "Obergrenze angewendet",
});

// ── Grundformen ─────────────────────────────────────────────────────────────
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const PROZENT = /^\d{1,3}(\.\d{1,4})?$/;
const pct = (v) => (typeof v === "string" && PROZENT.test(v.trim()) ? v.trim() : null);
const TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONAT = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
  "September", "Oktober", "November", "Dezember"];

// ── Formatierung ────────────────────────────────────────────────────────────

/** Cent (ganze Zahl) → „1.234,56 €"; alles andere „—". */
export function formatCents(cents) {
  return Number.isInteger(cents) ? money(cents / 100) : "—";
}

/** „27.50" → „27,50 %"; mindestens zwei Nachkommastellen, sonst „—". */
export function formatPercent(value) {
  const p = pct(value);
  if (!p) return "—";
  const [ganz, nach = ""] = p.split(".");
  const stellen = nach.length >= 2 ? nach : `${nach}00`.slice(0, 2);
  return `${ganz},${stellen} %`;
}

/** Bonus mit Vorzeichen: „+2,50 %". */
export function formatBonusPercent(value) {
  const f = formatPercent(value);
  return f === "—" ? f : `+${f}`;
}

/** „2026-09-15" → „15.09.2026"; alles andere „—" (kein Date-Parsing). */
export function formatIsoDate(value) {
  return typeof value === "string" && TAG.test(value.trim()) ? isoDayDE(value.trim()) : "—";
}

/** „2026-10" → „Oktober 2026"; alles andere „—". */
export function formatMonth(value) {
  const m = typeof value === "string" ? value.trim().match(MONAT) : null;
  return m ? `${MONATSNAMEN[Number(m[2]) - 1]} ${m[1]}` : "—";
}

/** Ganze Zahl mit Tausenderpunkt; alles andere „—". */
export function formatCount(value) {
  return Number.isInteger(value) ? new Intl.NumberFormat("de-DE").format(value) : "—";
}

/** Die Monate ab `month` rückwärts (reine Kalenderarithmetik, keine Uhr). */
export function monthsBack(month, count = 12) {
  const m = typeof month === "string" ? month.trim().match(MONAT) : null;
  if (!m || !Number.isInteger(count) || count < 1) return [];
  let jahr = Number(m[1]);
  let monat = Number(m[2]);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${jahr}-${String(monat).padStart(2, "0")}`);
    monat -= 1;
    if (monat === 0) { monat = 12; jahr -= 1; }
  }
  return out;
}

/** Auswahlliste für Monatsfilter: [{ value: "2026-10", label: "Oktober 2026" }, …]. */
export function monthOptions(month, count = 12) {
  return monthsBack(month, count).map((value) => ({ value, label: formatMonth(value) }));
}

// ── Statuslabels ────────────────────────────────────────────────────────────
const PARTNER_STATUS_META = Object.freeze({
  active: ["badge-green", "Aktiv"],
  inactive: ["badge-gray", "Inaktiv"],
  pending: ["badge-yellow", "In Prüfung"],
  rejected: ["badge-red", "Abgelehnt"],
});
export const partnerStatusMeta = (status) => PARTNER_STATUS_META[status] || statusFallback(status);

const CUSTOMER_STATUS_META = Object.freeze({
  active: ["badge-green", "Aktiv"],
  pending: ["badge-yellow", "In Prüfung"],
  inactive: ["badge-gray", "Inaktiv"],
});
export const customerAccountStatusMeta = (status) => CUSTOMER_STATUS_META[status] || statusFallback(status);

const COMMISSION_TYPE_META = Object.freeze({
  accrual: ["badge-blue", "Provision"],
  reversal: ["badge-red", "Rücknahme"],
  adjustment: ["badge-yellow", "Korrektur"],
});
export const commissionTypeMeta = (type) => COMMISSION_TYPE_META[type] || statusFallback(type);

const LEVEL_LABELS = Object.freeze({ 0: "Eigene Kunden", 1: "Team Ebene 1", 2: "Team Ebene 2" });
export const commissionLevelLabel = (level) =>
  (Number.isInteger(level) && Object.prototype.hasOwnProperty.call(LEVEL_LABELS, level) ? LEVEL_LABELS[level] : "—");

/** „Level 3" für 0 … 5, sonst „—". */
export const levelText = (level) => (Number.isInteger(level) && level >= 0 && level <= 5 ? `Level ${level}` : "—");

// ── Übersicht ───────────────────────────────────────────────────────────────
export function normalizeOverview(raw) {
  const d = obj(raw);
  const partner = obj(d.partner);
  const links = obj(d.links);
  const rates = obj(d.rates);
  const lv = d.levels && typeof d.levels === "object" && !Array.isArray(d.levels) ? d.levels : null;
  const cm = obj(d.currentMonth);
  return {
    partner: { name: str(partner.name), status: str(partner.status), activeSince: str(partner.activeSince) },
    links: { code: str(links.code), customer: str(links.customer), partner: str(links.partner) },
    rates: { basePercent: pct(rates.basePercent), level1Percent: pct(rates.level1Percent), level2Percent: pct(rates.level2Percent) },
    levels: lv ? {
      month: str(lv.month),
      measuredMonth: str(lv.measuredMonth),
      activeCustomers: int(lv.activeCustomers),
      shippedPackages: int(lv.shippedPackages),
      customerLevel: int(lv.customerLevel),
      customerBonusPercent: pct(lv.customerBonusPercent),
      packageLevel: int(lv.packageLevel),
      packageBonusPercent: pct(lv.packageBonusPercent),
      ownRatePercent: pct(lv.ownRatePercent),
      capApplied: lv.capApplied === true,
    } : null,
    currentMonth: {
      month: str(cm.month),
      commissionCents: int(cm.commissionCents),
      payableCents: int(cm.payableCents),
      shipments: int(cm.shipments),
      packages: int(cm.packages),
    },
    customersAssigned: int(obj(d.customers).assigned),
  };
}

/** Die sechs Kennzahlen der Übersicht — Werte ausschließlich aus der Antwort. */
export function overviewKpis(overview) {
  const o = overview || normalizeOverview(null);
  const lv = o.levels;
  const bemessen = lv && formatMonth(lv.measuredMonth) !== "—" ? `Bemessungsmonat ${formatMonth(lv.measuredMonth)}` : null;
  return [
    { key: "activeCustomers", label: "Aktive Kunden", value: lv ? formatCount(lv.activeCustomers) : "—",
      hint: lv ? bemessen : PARTNER_TEXTS.noAssessment },
    { key: "shippedPackages", label: "Versendete Pakete", value: lv ? formatCount(lv.shippedPackages) : "—",
      hint: lv ? bemessen : PARTNER_TEXTS.noAssessment },
    { key: "basePercent", label: "Grundprovision", value: formatPercent(o.rates.basePercent), hint: null },
    { key: "customerLevel", label: "Kunden-Level", value: lv ? levelText(lv.customerLevel) : "—",
      hint: lv && pct(lv.customerBonusPercent) ? `Bonus ${formatBonusPercent(lv.customerBonusPercent)}` : null },
    { key: "packageLevel", label: "Paket-Level", value: lv ? levelText(lv.packageLevel) : "—",
      hint: lv && pct(lv.packageBonusPercent) ? `Bonus ${formatBonusPercent(lv.packageBonusPercent)}` : null },
    { key: "ownRate", label: "Eigenprovision gesamt", value: lv ? formatPercent(lv.ownRatePercent) : "—",
      hint: lv && lv.capApplied ? PARTNER_TEXTS.capApplied : null },
  ];
}

// ── Meine Kunden ────────────────────────────────────────────────────────────
// Bewusst nur, was der Vertrag liefert: Firma, Zuordnung, Status, Mengen. Keine
// Adresse, keine Rechnung, kein Preis.
export function normalizeCustomers(raw) {
  return arr(obj(raw).customers).map((c) => {
    const row = obj(c);
    const cur = obj(row.currentMonth);
    const prev = obj(row.previousMonth);
    return {
      ref: str(row.ref),
      companyName: str(row.companyName),
      assignedSince: str(row.assignedSince),
      accountStatus: str(row.accountStatus),
      current: { shipments: int(cur.shipments), packages: int(cur.packages) },
      previous: { shipments: int(prev.shipments), packages: int(prev.packages), active: prev.active === true },
    };
  }).filter((row) => row.ref || row.companyName);
}

// ── Provisionen ─────────────────────────────────────────────────────────────
function normalizeCommissionEntry(raw) {
  const e = obj(raw);
  if (Object.keys(e).length === 0) return null;
  return {
    id: e.id ?? null,
    reference: str(e.reference),
    entryDate: str(e.entryDate),
    level: [0, 1, 2].includes(e.level) ? e.level : null,
    type: str(e.type),
    basisCents: int(e.basisCents),
    ratePercent: pct(e.ratePercent),
    amountCents: int(e.amountCents),
    payable: e.payable === true,
    customerName: str(e.customerName),
    teamMemberName: str(e.teamMemberName),
    note: str(e.note),
  };
}

export function normalizeCommissions(raw) {
  const d = obj(raw);
  const t = obj(d.totals);
  const by = obj(t.byLevel);
  return {
    month: str(d.month),
    totals: {
      accruedCents: int(t.accruedCents),
      payableCents: int(t.payableCents),
      byLevel: { 0: int(by["0"]), 1: int(by["1"]), 2: int(by["2"]) },
    },
    entries: arr(d.entries).map(normalizeCommissionEntry).filter(Boolean),
  };
}

/** Gegenüber einer Buchung: der Kunde (Ebene 0) bzw. das Teammitglied. */
export function commissionCounterpart(entry) {
  if (!entry) return "—";
  if (entry.level === 0) return entry.customerName || "—";
  return entry.teamMemberName || entry.customerName || "—";
}

/** Rücknahmen und Korrekturen sind sichtbar markiert. */
export const isCorrectionEntry = (entry) => !!entry && (entry.type === "reversal" || entry.type === "adjustment");

export const payableLabel = (entry) => (entry && entry.payable === true ? "Ja" : "Nein");

// ── Mein Team ───────────────────────────────────────────────────────────────
function normalizeMember(raw) {
  const m = obj(raw);
  return {
    id: m.id ?? null,
    name: str(m.name),
    status: str(m.status),
    activeSince: str(m.activeSince),
    relevant: m.relevant === true,
    rank: int(m.rank),
    commissionCurrentMonthCents: int(m.commissionCurrentMonthCents),
    commissionTotalCents: int(m.commissionTotalCents),
  };
}

export function normalizeTeam(raw) {
  const d = obj(raw);
  const lim = obj(d.limits);
  return {
    limits: { level1: int(lim.level1), level2: int(lim.level2) },
    level1: arr(d.level1).map(normalizeMember),
    level2: arr(d.level2).map(normalizeMember),
  };
}

/** „Mein Team" erscheint nur, wenn Ebene 1 oder 2 Einträge hat. */
export const teamVisible = (team) => !!team && (arr(team.level1).length > 0 || arr(team.level2).length > 0);

/** „Ja (Rang 2)" / „Ja" / „Nein". */
export function relevanceLabel(member) {
  if (!member || member.relevant !== true) return "Nein";
  return Number.isInteger(member.rank) ? `Ja (Rang ${member.rank})` : "Ja";
}

/** Überschrift einer Teamebene samt Belegung: „Ebene 1 · 3 von 10". */
export function teamLevelHeading(level, team) {
  const liste = level === 1 ? arr(team?.level1) : arr(team?.level2);
  const limit = level === 1 ? team?.limits?.level1 : team?.limits?.level2;
  return Number.isInteger(limit) ? `Ebene ${level} · ${liste.length} von ${limit}` : `Ebene ${level}`;
}

// ── Bereiche des Portals (page-State, keine eigenen Routen) ──────────────────
export const PARTNER_TABS = Object.freeze([
  Object.freeze({ id: "overview", label: "Übersicht" }),
  Object.freeze({ id: "customers", label: "Meine Kunden" }),
  Object.freeze({ id: "commissions", label: "Provisionen" }),
  Object.freeze({ id: "team", label: "Mein Team" }),
]);

export const visiblePartnerTabs = (team) => PARTNER_TABS.filter((t) => t.id !== "team" || teamVisible(team));
