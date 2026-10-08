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
  // Die Folgen eines inaktiven Kontos (UX-Paket 3): keine neuen Provisionen, die
  // Empfehlungslinks wirken nicht (der Server ordnet nur über aktive Partner zu).
  inactive: "Ihr Partnerkonto ist derzeit inaktiv. Es entstehen keine neuen Provisionen, und Ihre Empfehlungslinks sind ausgeschaltet. Bisherige Provisionen und Abrechnungen bleiben sichtbar.",
  capApplied: "Obergrenze angewendet",
  // Pre-Live-Testkonto (unveränderliche Testkennzeichnung des Servers).
  preliveBanner: "Pre-Live-Testkonto – keine echten Provisionen, Gutschriften oder Auszahlungen.",
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

/** „2026-10" → „Oktober" (nur der Monatsname); alles andere null. */
export function monthName(value) {
  const m = typeof value === "string" ? value.trim().match(MONAT) : null;
  return m ? MONATSNAMEN[Number(m[2]) - 1] : null;
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
/** [Badge-Klasse, Label] aus einer Zuordnung — ausschließlich über EIGENE
 *  Schlüssel (ein Wert wie „constructor" trifft so nie den Objektprototyp),
 *  sonst statusFallback: „Unbekannter Status", der Rohwert nur im title. */
export function statusMetaFrom(map, value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(map, value)
    ? map[value]
    : statusFallback(value);
}

const PARTNER_STATUS_META = Object.freeze({
  active: ["badge-green", "Aktiv"],
  inactive: ["badge-gray", "Inaktiv"],
  pending: ["badge-yellow", "In Prüfung"],
  rejected: ["badge-red", "Abgelehnt"],
});
export const partnerStatusMeta = (status) => statusMetaFrom(PARTNER_STATUS_META, status);

const CUSTOMER_STATUS_META = Object.freeze({
  active: ["badge-green", "Aktiv"],
  pending: ["badge-yellow", "In Prüfung"],
  inactive: ["badge-gray", "Inaktiv"],
});
export const customerAccountStatusMeta = (status) => statusMetaFrom(CUSTOMER_STATUS_META, status);

const COMMISSION_TYPE_META = Object.freeze({
  accrual: ["badge-blue", "Provision"],
  reversal: ["badge-red", "Rücknahme"],
  adjustment: ["badge-yellow", "Korrektur"],
});
export const commissionTypeMeta = (type) => statusMetaFrom(COMMISSION_TYPE_META, type);

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
    // Nur exakt true: ein Testkonto des Pre-Live-Testmodus.
    preliveTest: d.preliveTest === true,
  };
}

// Die Monate der Startseite — ausschließlich aus der Antwort, nie aus der
// Browseruhr: der laufende Monat (`levels.month` bzw. `currentMonth.month`) und
// der Messmonat (`levels.measuredMonth`; per Definition der Vormonat, deshalb
// ohne Bewertung aus dem laufenden Monat abgeleitet — reine Kalenderarithmetik).
function startMonate(o) {
  const lv = o.levels;
  const laufend = (lv && lv.month) || o.currentMonth.month;
  const gemessen = (lv && lv.measuredMonth) || (laufend ? monthsBack(laufend, 2)[1] || null : null);
  return { laufend: monthName(laufend), gemessen: monthName(gemessen) };
}

/** Die vier Kennzahlen der Startseite (UX-Paket 3). Jede nennt ihren Zeitraum:
 *  Kunden heute, Pakete und aktive Kunden im Messmonat, der Satz und der
 *  Verdienst im laufenden Monat. Werte ausschließlich aus der Antwort; ein
 *  unbekannter Wert ist „—", nie 0. */
export function overviewKpis(overview) {
  const o = overview || normalizeOverview(null);
  const lv = o.levels;
  const { laufend, gemessen } = startMonate(o);
  return [
    { key: "customers", label: "Meine Kunden", value: formatCount(o.customersAssigned), hint: "aktuell zugeordnet",
      detail: lv && gemessen ? `Aktiv im ${gemessen}: ${formatCount(lv.activeCustomers)}` : null },
    { key: "packages", label: gemessen ? `Pakete im ${gemessen}` : "Pakete im Vormonat",
      value: lv ? formatCount(lv.shippedPackages) : "—",
      hint: lv ? (laufend ? `zählen für Ihr Paket-Level im ${laufend}` : null) : PARTNER_TEXTS.noAssessment },
    { key: "ownRate", label: "Meine Provision", value: lv ? formatPercent(lv.ownRatePercent) : "—",
      hint: lv ? (laufend ? `Ihr Satz im ${laufend}` : "Ihr aktueller Satz") : PARTNER_TEXTS.noAssessment,
      detail: lv && lv.capApplied ? PARTNER_TEXTS.capApplied : null },
    { key: "earned", label: laufend ? `Im ${laufend} verdient` : "Diesen Monat verdient",
      value: formatCents(o.currentMonth.commissionCents),
      hint: `davon auszahlbar: ${formatCents(o.currentMonth.payableCents)}` },
  ];
}

/** „So setzt sich Ihre Provision zusammen" — drei Bestandteile und der Satz,
 *  alle vom Server. Die Oberfläche addiert nichts: der Satz ist `ownRatePercent`;
 *  greift eine Obergrenze, sagt das ein eigener Satz. */
export function commissionComposition(overview) {
  const o = overview || normalizeOverview(null);
  const lv = o.levels;
  const { laufend, gemessen } = startMonate(o);
  return {
    rows: [
      { key: "base", label: "Grundprovision", value: formatPercent(o.rates.basePercent) },
      { key: "customerBonus", label: lv ? `Kundenbonus · ${levelText(lv.customerLevel)}` : "Kundenbonus",
        value: lv ? formatBonusPercent(lv.customerBonusPercent) : "—" },
      { key: "packageBonus", label: lv ? `Paketbonus · ${levelText(lv.packageLevel)}` : "Paketbonus",
        value: lv ? formatBonusPercent(lv.packageBonusPercent) : "—" },
    ],
    total: { label: laufend ? `Ihr Satz im ${laufend}` : "Ihr Satz", value: lv ? formatPercent(lv.ownRatePercent) : "—" },
    capNote: lv && lv.capApplied ? "Ihr Satz ist durch eine Obergrenze begrenzt; die Summe der Bestandteile liegt darüber." : null,
    basis: !lv ? `${PARTNER_TEXTS.noAssessment} – die Boni stehen fest, sobald der Vormonat bewertet ist.`
      : gemessen && laufend
        ? `Die Level ergeben sich aus Ihren aktiven Kunden und versendeten Paketen im ${gemessen} und gelten im ${laufend}.`
        : null,
    team: `Teamprovision: Ebene 1 ${formatPercent(o.rates.level1Percent)} · Ebene 2 ${formatPercent(o.rates.level2Percent)}`,
    // Nur bei aktivem Konto (der Server liefert das Datum ohnehin nur dann).
    activeSince: o.partner.status === "active" && formatIsoDate(o.partner.activeSince) !== "—"
      ? `Aktiv seit ${formatIsoDate(o.partner.activeSince)}` : null,
  };
}

// Empfehlungslinks der Startseite: utils/salesPartnerLinks.mjs (eigenes Modul,
// weil es die öffentliche Konfiguration liest — die wiederum dieses Modul nutzt).

/** Erster Besuch: aktives Konto, noch keine Kunden und kein Verdienst im
 *  laufenden Monat — beides als echter Serverwert 0 (unbekannt zählt nicht). */
export function isFirstVisit(overview) {
  const o = overview || normalizeOverview(null);
  return o.partner.status === "active" && o.customersAssigned === 0 && o.currentMonth.commissionCents === 0;
}

// ── Geldbegriffe (UX-Paket 3) ───────────────────────────────────────────────
// Vier Stufen, nie zusammengelegt: verdient → auszahlbar → abgerechnet
// (Gutschrift) → ausgezahlt. „Ausgezahlt" ist ein Vermerk zur Gutschrift, keine
// Bankautomatik; ohne bestätigte Abrechnungsdaten entsteht keine Gutschrift.
export const MONEY_TERMS_TITLE = "So kommt die Provision zu Ihnen";
export const MONEY_TERMS = Object.freeze([
  Object.freeze(["Verdient", "Alle Provisionsbuchungen eines Monats – aus Sendungen Ihrer Kunden und Ihres Teams, einschließlich Korrekturen."]),
  Object.freeze(["Auszahlbar", "Sobald der Kunde seine Rechnung bezahlt hat."]),
  Object.freeze(["Abgerechnet", "Mit Ihrer monatlichen Gutschrift unter „Gutschriften“ – Voraussetzung sind bestätigte Abrechnungsdaten unter „Konto“."]),
  Object.freeze(["Ausgezahlt", "Sobald die Auszahlung zu einer Gutschrift vermerkt ist; zu sehen unter „Gutschriften“."]),
]);

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

// ── Meine Kunden: Anzeige (UX-Paket 6) ──────────────────────────────────────
// Zwei Dinge, die nicht verwechselt werden dürfen: das KUNDENKONTO (ob
// ConfidaraExpress den Kunden freigeschaltet hat — Aktiv, In Prüfung, Inaktiv)
// und die LEVEL-AKTIVITÄT (ob der Kunde im Vormonat genug Pakete versendet hat;
// das zählt für Ihr Kunden-Level im laufenden Monat, die Schwelle prüft allein
// der Server). Die Monatsnamen stammen aus der Übersicht, nie aus der Uhr.

/** Laufender Monat und Vormonat (Messmonat) als Namen — oder null. */
export function partnerMonths(overview) {
  const { laufend, gemessen } = startMonate(overview || normalizeOverview(null));
  return { laufend, vormonat: gemessen };
}

export const CUSTOMER_TEXTS = Object.freeze({
  accountLabel: "Kundenkonto",
  levelLabel: "Zählt für Ihr Kunden-Level",
  assignedSince: "Zugeordnet seit",
  emptyTitle: "Noch keine zugeordneten Kunden",
  emptyText: "Sobald Ihnen Kunden zugeordnet sind, erscheinen sie hier.",
  emptyTextTest: "Testkonto: Testkunden werden Ihnen über den Adminbereich zugeordnet und erscheinen dann hier.",
  emptyAction: "Zum Kundenlink",
});

/** Die zwei Begriffe über der Kundenliste, mit den Monaten der Übersicht. */
export function customerTerms(months) {
  const vormonat = months && months.vormonat ? `im ${months.vormonat}` : "im Vormonat";
  const laufend = months && months.laufend ? `im ${months.laufend}` : "im laufenden Monat";
  return [
    [CUSTOMER_TEXTS.accountLabel, "Ob ConfidaraExpress das Konto des Kunden freigeschaltet hat."],
    [CUSTOMER_TEXTS.levelLabel,
      `Der Kunde hat ${vormonat} genug Pakete versendet und zählt deshalb als aktiver Kunde für Ihr Kunden-Level ${laufend}.`],
  ];
}

/** Spaltenköpfe der Mengen: „Oktober (bisher)" und „September" — ohne Übersicht neutral. */
export function customerMonthLabels(months) {
  return {
    current: months && months.laufend ? `${months.laufend} (bisher)` : "Laufender Monat",
    previous: months && months.vormonat ? months.vormonat : "Vormonat",
  };
}

/** „3 Sendungen · 4 Pakete" (Einzahl richtig); ein unbekannter Wert als „—",
 *  sind beide unbekannt, nur „—". */
export function shipmentsPackagesText(m) {
  const s = m && Number.isInteger(m.shipments) ? m.shipments : null;
  const p = m && Number.isInteger(m.packages) ? m.packages : null;
  if (s === null && p === null) return "—";
  return `${formatCount(s)} ${s === 1 ? "Sendung" : "Sendungen"} · ${formatCount(p)} ${p === 1 ? "Paket" : "Pakete"}`;
}

/** Zählt der Kunde für das Kunden-Level? Nur der Serverwert. */
export const customerLevelText = (c) => (c && c.previous && c.previous.active === true ? "Ja" : "Nein");

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

/** Gegenüber einer Buchung: der Kunde (Ebene 0) bzw. das Teammitglied (Ebene 1/2).
 *  Eine Teambuchung nennt nie einen Kundennamen — auch dann nicht, wenn eine
 *  Antwort ihn enthielte (Kunden des Teams sind nicht Ihre Kunden; UX-Paket 6).
 *  Eine unbekannte Ebene ergibt „—". */
export function commissionCounterpart(entry) {
  if (!entry) return "—";
  if (entry.level === 0) return entry.customerName || "—";
  if (entry.level === 1 || entry.level === 2) return entry.teamMemberName || "—";
  return "—";
}

/** Rücknahmen und Korrekturen sind sichtbar markiert. */
export const isCorrectionEntry = (entry) => !!entry && (entry.type === "reversal" || entry.type === "adjustment");

// UX-Paket 6: ein Satz statt „Ja/Nein" — dieselben Geldbegriffe wie MONEY_TERMS.
export const payableLabel = (entry) => (entry && entry.payable === true ? "Auszahlbar" : "Noch nicht auszahlbar");

/** „100,00 € · Satz 27,50 %" — ein unbekannter Teil entfällt (eine Korrektur hat
 *  oft weder Basis noch Satz), fehlt beides: „—". Nichts wird nachgerechnet. */
export function commissionBasisText(entry) {
  const basis = entry && Number.isInteger(entry.basisCents) ? formatCents(entry.basisCents) : null;
  const satz = entry && pct(entry.ratePercent) ? `Satz ${formatPercent(entry.ratePercent)}` : null;
  return [basis, satz].filter(Boolean).join(" · ") || "—";
}

/** Kopf der Provisionen (UX-Paket 6): Monat, verdient, davon auszahlbar — zuerst;
 *  die Aufteilung nach Ebenen darunter. Alles Summen des Servers. */
export function commissionSummary(data) {
  const d = data || normalizeCommissions(null);
  return {
    title: d.month ? `Verdient im ${formatMonth(d.month)}` : "Verdient",
    earned: formatCents(d.totals.accruedCents),
    payable: `davon auszahlbar: ${formatCents(d.totals.payableCents)}`,
    breakdown: [0, 1, 2].map((level) => ({
      key: `level${level}`, label: commissionLevelLabel(level), value: formatCents(d.totals.byLevel[level]),
    })),
  };
}

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

// UX-Paket 6: die zwei Ebenen mit verständlichen Namen. Für die Teamprovision
// zählen je Ebene die ersten `limits` AKTIVEN Partner in der Reihenfolge ihrer
// Aktivierung (Server: lib/salesPartner/store.js teamRankingAt) — der Platz ist
// keine Leistungswertung. Inaktive Partner haben keinen Platz.
export const TEAM_TEXTS = Object.freeze({
  level1Title: "Direkt geworben (Ebene 1)",
  level2Title: "Weitere Partner (Ebene 2)",
  level2Note: "Partner, die Ihre direkt geworbenen Partner geworben haben.",
  emptyLevel: "Auf dieser Ebene gibt es noch keine Vertriebspartner.",
  countsLabel: "Zählt für Ihre Teamprovision",
});

const teamLimit = (level, team) => (level === 1 ? team?.limits?.level1 : team?.limits?.level2);

/** „Ja – Platz 2 von 10" / „Nein – nur aktive Partner zählen" / „Nein – Platz 11; es zählen die ersten 10". */
export function relevanceLabel(member, limit = null) {
  if (!member) return "Nein";
  const mitGrenze = Number.isInteger(limit);
  if (member.relevant === true) {
    return Number.isInteger(member.rank) && mitGrenze ? `Ja – Platz ${member.rank} von ${limit}` : "Ja";
  }
  if (member.status === "inactive") return "Nein – nur aktive Partner zählen";
  if (Number.isInteger(member.rank) && mitGrenze && member.rank > limit) return `Nein – Platz ${member.rank}; es zählen die ersten ${limit}`;
  return "Nein";
}

/** Name einer Ebene: „Direkt geworben (Ebene 1)" / „Weitere Partner (Ebene 2)". */
export const teamLevelTitle = (level) => (level === 1 ? TEAM_TEXTS.level1Title : TEAM_TEXTS.level2Title);

/** Belegung einer Ebene: „3 Partner · 2 zählen für Ihre Teamprovision (höchstens 10)" — gezählt
 *  werden nur die Kennzeichen des Servers. Früher „Ebene 1 · 12 von 10": dort zählten
 *  auch inaktive Mitglieder gegen die zehn Plätze. */
export function teamLevelSummary(level, team) {
  const liste = level === 1 ? arr(team?.level1) : arr(team?.level2);
  if (liste.length === 0) return TEAM_TEXTS.emptyLevel;
  const zaehlen = liste.filter((m) => m && m.relevant === true).length;
  const limit = teamLimit(level, team);
  const grenze = Number.isInteger(limit) ? ` (höchstens ${limit})` : "";
  return `${liste.length} Partner · ${zaehlen} ${zaehlen === 1 ? "zählt" : "zählen"} für Ihre Teamprovision${grenze}`;
}

/** Erklärung über dem Team: die Regel der Plätze (Grenzen des Servers) und die Sätze der Übersicht.
 *  Die Rangfolge selbst bestimmt allein der Server (`rank`, `relevant`). */
export function teamExplanation(team, overview) {
  const l1 = teamLimit(1, team);
  const l2 = teamLimit(2, team);
  let regel = "Für Ihre Teamprovision zählen aktive Partner, in der Reihenfolge ihrer Aktivierung.";
  if (Number.isInteger(l1) && l1 === l2) {
    regel = `Für Ihre Teamprovision zählen je Ebene die ersten ${l1} aktiven Partner, in der Reihenfolge ihrer Aktivierung.`;
  } else if (Number.isInteger(l1) && Number.isInteger(l2)) {
    regel = `Für Ihre Teamprovision zählen auf Ebene 1 die ersten ${l1} und auf Ebene 2 die ersten ${l2} aktiven Partner, in der Reihenfolge ihrer Aktivierung.`;
  }
  const r = overview && overview.rates ? overview.rates : null;
  const saetze = r && r.level1Percent && r.level2Percent
    ? ` Ihre Sätze: Ebene 1 ${formatPercent(r.level1Percent)} · Ebene 2 ${formatPercent(r.level2Percent)}.` : "";
  return `${regel}${saetze}`;
}

/** Beschriftung der Teamprovision des laufenden Monats: „Teamprovision im Oktober". */
export const teamMonthLabel = (months) => (months && months.laufend ? `Teamprovision im ${months.laufend}` : "Teamprovision im laufenden Monat");

// ── Bereiche des Portals (page-State, keine eigenen Routen) ──────────────────
export const PARTNER_TABS = Object.freeze([
  Object.freeze({ id: "overview", label: "Übersicht" }),
  Object.freeze({ id: "customers", label: "Meine Kunden" }),
  Object.freeze({ id: "commissions", label: "Provisionen" }),
  // Gutschriften (Selbstabrechnung) direkt nach den Provisionen, aus denen sie
  // entstehen; Steuer- und Bankdaten stehen nur im Konto, nicht hier. Seit
  // UX-Paket 6 heißt der Bereich wie im Adminbereich „Gutschriften" — „Abrechnung…"
  // war mit den Abrechnungsdaten im Konto verwechselbar.
  Object.freeze({ id: "credit-notes", label: "Gutschriften" }),
  Object.freeze({ id: "team", label: "Mein Team" }),
  // Login-E-Mail und Passwort: dieselben Bausteine wie in den
  // Kontoeinstellungen der Kunden (Backendvertrag: für Partner freigegeben);
  // dazu Abrechnungsdaten und Vertrag über eigene Partnerendpunkte.
  Object.freeze({ id: "account", label: "Konto" }),
]);

// Betreiberentscheidung (UX-Paket 1, 2026-10-08): „Mein Team" ist IMMER da —
// auch ohne Teammitglieder, beim Laden und bei einem Ladefehler. Früher hing der
// Bereich an den Einträgen und verschwand bei einem Fehler unbemerkt; Lade-,
// Fehler- und Leerzustand zeigt jetzt PartnerTeamPanel.
export const visiblePartnerTabs = () => PARTNER_TABS;

// ── Direktlinks (UX-Paket 6) ────────────────────────────────────────────────
// Der Bereich steht als `?page=<Kennung>` in der Adresse — nach dem Muster des
// Kunden-Dashboards, ohne neue Route. Nur eine Kennung aus PARTNER_TABS gilt;
// alles andere ergibt die Übersicht. Die Rücksprungprüfung nach dem Login nutzt
// dieselbe Liste (utils/loginReturnTarget.mjs, Paritätstest).
export const PARTNER_PAGE_PARAM = "page";

/** Bereich aus dem Suchteil der Adresse — nur eine bekannte Kennung, sonst null. */
export function partnerTabFromSearch(search) {
  const wert = new URLSearchParams(typeof search === "string" ? search : "").get(PARTNER_PAGE_PARAM);
  return PARTNER_TABS.some((t) => t.id === wert) ? wert : null;
}

/** Suchteil für einen Bereich: „?page=team"; die Übersicht ohne Parameter. */
export const partnerTabSearch = (id) => (id && id !== "overview" && PARTNER_TABS.some((t) => t.id === id) ? `?${PARTNER_PAGE_PARAM}=${id}` : "");

/** Link in einen Bereich des Portals (für Verweise zwischen den Bereichen). */
export const partnerTabPath = (id) => `/partner${partnerTabSearch(id)}`;

// ── Konto ───────────────────────────────────────────────────────────────────
// Nur lesend: Stammdaten ändert ein Partner hier nicht (PATCH /kunde/profil ist
// eine Kundenfunktion). Fehlende Werte stehen als „Nicht angegeben".
const anzeige = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function partnerAccountRows(user) {
  const u = obj(user);
  const zeile = (key, k, roh) => {
    const v = anzeige(roh);
    return { key, k, v: v || "Nicht angegeben", empty: !v };
  };
  return [
    zeile("name", "Name", u.name),
    zeile("company", "Firma", u.company_name),
  ];
}

export function partnerLoginEmailRow(user) {
  const v = anzeige(obj(user).email);
  return { key: "email", k: "Login-E-Mail", v: v || "Nicht angegeben", empty: !v };
}
