// Partnerportal — View-Modelle: Cent-Formatierung, Prozent, Monate, Labels,
// keine Rohstatus, Teamsichtbarkeit.
//
// Run: node --test src/utils/salesPartnerView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CUSTOMER_TEXTS,
  PARTNER_PAGE_PARAM,
  PARTNER_TABS,
  PARTNER_TEXTS,
  TEAM_TEXTS,
  commissionBasisText,
  commissionCounterpart,
  commissionLevelLabel,
  commissionSummary,
  commissionTypeMeta,
  customerAccountStatusMeta,
  customerLevelText,
  customerMonthLabels,
  customerTerms,
  formatBonusPercent,
  formatCents,
  formatIsoDate,
  formatMonth,
  formatPercent,
  isCorrectionEntry,
  MONEY_TERMS,
  commissionComposition,
  isFirstVisit,
  levelText,
  monthName,
  monthOptions,
  monthsBack,
  normalizeCommissions,
  normalizeCustomers,
  normalizeOverview,
  normalizeTeam,
  overviewKpis,
  partnerAccountRows,
  partnerLoginEmailRow,
  partnerMonths,
  partnerStatusMeta,
  partnerTabFromSearch,
  partnerTabPath,
  partnerTabSearch,
  payableLabel,
  relevanceLabel,
  shipmentsPackagesText,
  teamExplanation,
  teamLevelSummary,
  teamLevelTitle,
  teamMonthLabel,
  visiblePartnerTabs,
} from "./salesPartnerView.mjs";
import { LINK_TEXTS, partnerLinkStates } from "./salesPartnerLinks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const euro = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

const OVERVIEW = {
  partner: { name: "Petra Partner", status: "active", activeSince: "2026-03-01" },
  links: { code: "ABCD2345", customer: "https://confidaraexpress.de/register?ref=ABCD2345", partner: "https://confidaraexpress.de/partner-registrieren?ref=ABCD2345" },
  rates: { basePercent: "20.00", level1Percent: "5.00", level2Percent: "2.50" },
  levels: { month: "2026-10", measuredMonth: "2026-09", activeCustomers: 12, shippedPackages: 1530,
    customerLevel: 2, customerBonusPercent: "5.00", packageLevel: 3, packageBonusPercent: "7.50",
    ownRatePercent: "27.50", capApplied: true },
  currentMonth: { month: "2026-10", commissionCents: 123456, payableCents: 45600, shipments: 80, packages: 95 },
  customers: { assigned: 14 },
};

/* ══════════ Formatierung ════════════════════════════════════════════════ */

test("1 — Cent werden zu Euro; nur ganze Zahlen, sonst „—“", () => {
  assert.equal(formatCents(123456), euro(1234.56));
  assert.equal(formatCents(0), euro(0));
  assert.equal(formatCents(-1250), euro(-12.5), "Rücknahmen bleiben negativ");
  for (const kaputt of [null, undefined, "1234", 12.5, NaN, {}]) {
    assert.equal(formatCents(kaputt), "—", `${JSON.stringify(kaputt)} als Betrag angezeigt`);
  }
});

test("2 — Prozentwerte: Komma, zwei Stellen, Bonus mit Vorzeichen", () => {
  assert.equal(formatPercent("27.50"), "27,50 %");
  assert.equal(formatPercent("5"), "5,00 %");
  assert.equal(formatPercent("2.5"), "2,50 %");
  assert.equal(formatBonusPercent("5.00"), "+5,00 %");
  for (const kaputt of [null, 27.5, "27,50", "abc", "-1.00", ""]) {
    assert.equal(formatPercent(kaputt), "—", `${JSON.stringify(kaputt)} durchgelassen`);
  }
  assert.equal(formatBonusPercent(null), "—");
});

test("3 — Tage und Monate ohne Datumsobjekt und ohne Uhr", () => {
  assert.equal(formatIsoDate("2026-09-15"), "15.09.2026");
  assert.equal(formatIsoDate("2026-09-15T10:00:00Z"), "—", "nur reine Tagesangaben");
  assert.equal(formatIsoDate(null), "—");
  assert.equal(formatMonth("2026-10"), "Oktober 2026");
  assert.equal(formatMonth("2026-13"), "—");
  assert.deepEqual(monthsBack("2026-02", 4), ["2026-02", "2026-01", "2025-12", "2025-11"]);
  assert.deepEqual(monthsBack("kaputt", 3), []);
  assert.deepEqual(monthOptions("2026-01", 2), [
    { value: "2026-01", label: "Januar 2026" }, { value: "2025-12", label: "Dezember 2025" },
  ]);
  // Der Monat kommt vom Server — das Modul liest keine Uhr.
  assert.doesNotMatch(ohneKommentare(read("utils/salesPartnerView.mjs")), /new Date|Date\.now|toLocale/);
});

/* ══════════ Labels: nie ein Rohwert ═════════════════════════════════════ */

test("4 — Status, Buchungsart und Ebene tragen deutsche Labels; Unbekanntes nie roh", () => {
  assert.deepEqual(partnerStatusMeta("active"), ["badge-green", "Aktiv"]);
  assert.deepEqual(partnerStatusMeta("inactive"), ["badge-gray", "Inaktiv"]);
  assert.equal(customerAccountStatusMeta("pending")[1], "In Prüfung");
  assert.equal(commissionTypeMeta("reversal")[1], "Rücknahme");
  assert.equal(commissionTypeMeta("adjustment")[1], "Korrektur");
  assert.equal(commissionTypeMeta("accrual")[1], "Provision");
  for (const meta of [partnerStatusMeta, customerAccountStatusMeta, commissionTypeMeta]) {
    const [, label] = meta("weird_backend_value");
    assert.equal(label, "Unbekannter Status");
    assert.notEqual(label, "weird_backend_value");
    // Ein Wert wie „constructor" trifft nie den Objektprototyp.
    for (const tueckisch of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      assert.equal(meta(tueckisch)[1], "Unbekannter Status", `${tueckisch} wurde zugeordnet`);
    }
  }
  assert.equal(commissionLevelLabel(0), "Eigene Kunden");
  assert.equal(commissionLevelLabel(2), "Team Ebene 2");
  assert.equal(commissionLevelLabel(7), "—");
  assert.equal(levelText(0), "Level 0");
  assert.equal(levelText(6), "—");
});

test("5 — die Bemessungsgrundlage heißt „Provisionsfähige Basis“, nie Gewinn", () => {
  assert.equal(PARTNER_TEXTS.basisLabel, "Provisionsfähige Basis");
  assert.equal(PARTNER_TEXTS.payableNote, "Provision wird nach Zahlungseingang des Kunden auszahlbar.");
  const partnerDateien = ["utils/salesPartnerView.mjs", "pages/PartnerPortalPage.jsx"]
    .concat(readdirSync(path.join(SRC, "components/partner")).map((f) => `components/partner/${f}`));
  for (const datei of partnerDateien) {
    assert.doesNotMatch(ohneKommentare(read(datei)), /Gewinn/i, `${datei}: „Gewinn" im Partnerportal`);
  }
});

/* ══════════ Übersicht ═══════════════════════════════════════════════════ */

// UX-Paket 3 (bewusste Ankeränderung): statt sechs gleichrangiger Kacheln mit
// gemischten Zeiträumen genau vier Kennzahlen, jede mit ihrem Monat. Grundprovision
// und Level stehen in „So setzt sich Ihre Provision zusammen" (Test 6b).
test("6 — vier Kennzahlen, jede mit ihrem Zeitraum, nur aus der Antwort", () => {
  const o = normalizeOverview(OVERVIEW);
  const kpis = overviewKpis(o);
  assert.deepEqual(kpis.map((k) => k.key), ["customers", "packages", "ownRate", "earned"]);
  const k = Object.fromEntries(kpis.map((x) => [x.key, x]));
  // Kunden: heute zugeordnet; aktive Kunden ausdrücklich im Messmonat.
  assert.deepEqual([k.customers.label, k.customers.value, k.customers.hint, k.customers.detail],
    ["Meine Kunden", "14", "aktuell zugeordnet", "Aktiv im September: 12"]);
  // Pakete: der Messmonat, und wofür sie zählen.
  assert.deepEqual([k.packages.label, k.packages.value, k.packages.hint],
    ["Pakete im September", "1.530", "zählen für Ihr Paket-Level im Oktober"]);
  // Satz: laufender Monat; die Obergrenze als Wort.
  assert.deepEqual([k.ownRate.label, k.ownRate.value, k.ownRate.hint, k.ownRate.detail],
    ["Meine Provision", "27,50 %", "Ihr Satz im Oktober", "Obergrenze angewendet"]);
  // Verdienst: laufender Monat, mit auszahlbarem Anteil.
  assert.deepEqual([k.earned.label, k.earned.value, k.earned.hint],
    ["Im Oktober verdient", euro(1234.56), `davon auszahlbar: ${euro(456)}`]);
  // Kein Vormonat im Verdienst, kein laufender Monat in den Paketen.
  assert.doesNotMatch(`${k.earned.label} ${k.earned.hint}`, /September/);
  assert.doesNotMatch(`${k.packages.label}`, /Oktober/);
  assert.equal(monthName("2026-10"), "Oktober");
  assert.equal(monthName("kaputt"), null);
});

test("7 — ohne Monatsbewertung: Striche und ein ruhiger Hinweis, keine Nullen", () => {
  const o = normalizeOverview({ ...OVERVIEW, levels: null });
  const k = Object.fromEntries(overviewKpis(o).map((x) => [x.key, x]));
  for (const key of ["packages", "ownRate"]) assert.equal(k[key].value, "—", `${key} erfindet einen Wert`);
  assert.equal(k.packages.hint, PARTNER_TEXTS.noAssessment);
  assert.equal(k.ownRate.hint, PARTNER_TEXTS.noAssessment);
  // Der Messmonat bleibt benennbar (Vormonat des laufenden Monats, reine Kalenderarithmetik).
  assert.equal(k.packages.label, "Pakete im September");
  assert.equal(k.customers.detail, null, "ohne Bewertung keine Zahl aktiver Kunden");
  assert.equal(k.customers.value, "14");
  // Ein Jahreswechsel: Januar → Dezember.
  const januar = normalizeOverview({ ...OVERVIEW, levels: null, currentMonth: { ...OVERVIEW.currentMonth, month: "2027-01" } });
  assert.equal(overviewKpis(januar)[1].label, "Pakete im Dezember");
  // Eine leere Antwort: Striche, nie 0.
  const leer = normalizeOverview(null);
  assert.equal(leer.links.customer, null);
  assert.equal(leer.currentMonth.commissionCents, null);
  const kLeer = Object.fromEntries(overviewKpis(leer).map((x) => [x.key, x]));
  assert.deepEqual([kLeer.customers.value, kLeer.packages.value, kLeer.ownRate.value, kLeer.earned.value], ["—", "—", "—", "—"]);
  assert.equal(kLeer.earned.label, "Diesen Monat verdient");
  assert.equal(kLeer.packages.label, "Pakete im Vormonat");
});

test("6b — „So setzt sich Ihre Provision zusammen“: drei Bestandteile und der Satz des Servers, keine Rechnung", () => {
  const c = commissionComposition(normalizeOverview(OVERVIEW));
  assert.deepEqual(c.rows.map((r) => [r.label, r.value]), [
    ["Grundprovision", "20,00 %"], ["Kundenbonus · Level 2", "+5,00 %"], ["Paketbonus · Level 3", "+7,50 %"],
  ]);
  // Der Satz kommt vom Server — hier begrenzt (20 + 5 + 7,5 wäre mehr).
  assert.deepEqual(c.total, { label: "Ihr Satz im Oktober", value: "27,50 %" });
  assert.match(c.capNote, /Obergrenze/);
  assert.equal(c.basis, "Die Level ergeben sich aus Ihren aktiven Kunden und versendeten Paketen im September und gelten im Oktober.");
  assert.equal(c.team, "Teamprovision: Ebene 1 5,00 % · Ebene 2 2,50 %");
  assert.equal(c.activeSince, "Aktiv seit 01.03.2026");
  // Ein inaktives Konto ist nicht „aktiv seit“ — auch wenn ein Datum mitkäme.
  assert.equal(commissionComposition(normalizeOverview({ ...OVERVIEW, partner: { ...OVERVIEW.partner, status: "inactive" } })).activeSince, null);
  const ohneGrenze =commissionComposition(normalizeOverview({ ...OVERVIEW, levels: { ...OVERVIEW.levels, capApplied: false } }));
  assert.equal(ohneGrenze.capNote, null);
  const ohneBewertung = commissionComposition(normalizeOverview({ ...OVERVIEW, levels: null }));
  assert.deepEqual(ohneBewertung.rows.map((r) => r.value), ["20,00 %", "—", "—"]);
  assert.equal(ohneBewertung.total.value, "—");
  assert.match(ohneBewertung.basis, /^Noch keine Monatsbewertung/);
  // Keine Prozent-Arithmetik im Modul: der Satz wird gelesen, nicht addiert.
  const src = ohneKommentare(read("utils/salesPartnerView.mjs"));
  const zusammen = src.slice(src.indexOf("export function commissionComposition"), src.indexOf("export function isFirstVisit"));
  assert.ok(zusammen.length > 200, "Funktionsrumpf nicht gefunden");
  assert.doesNotMatch(zusammen, /parseFloat|Number\(|reduce\(|percentToBp/, "die Zusammensetzung rechnet selbst");
});

test("6c — Empfehlungslinks: nur einsatzbereit, wenn Server und Programm sie tragen", () => {
  const offen = { ok: true, config: { referralsEnabled: true, registrationEnabled: true, registrationMode: "production",
    agreementVersion: "1.0", agreement: { version: "1.0", documentPath: "/api/legal/documents/7/download" } } };
  const o = normalizeOverview(OVERVIEW);
  const bereit = partnerLinkStates(o, offen);
  assert.equal(bereit.notice, null);
  assert.deepEqual(bereit.customer, { ready: true, url: OVERVIEW.links.customer, hint: LINK_TEXTS.customerHint });
  assert.deepEqual(bereit.partner, { ready: true, url: OVERVIEW.links.partner, hint: LINK_TEXTS.partnerHint });

  // Konfiguration unbekannt (lädt oder Fehler): nutzbar, aber ohne Zusage.
  for (const unbekannt of [null, { ok: false, config: null }]) {
    const s = partnerLinkStates(o, unbekannt);
    assert.equal(s.customer.ready, true);
    assert.equal(s.customer.hint, null);
    assert.equal(s.partner.hint, null);
  }
  // Kundenzuordnung aus: kein einsatzbereiter Kundenlink.
  const ohneZuordnung = partnerLinkStates(o, { ok: true, config: { ...offen.config, referralsEnabled: false } });
  assert.deepEqual(ohneZuordnung.customer, { ready: false, notice: LINK_TEXTS.referralsOff });
  assert.equal(ohneZuordnung.partner.ready, true);
  // Registrierung geschlossen: kein einsatzbereiter Partnerlink.
  const zu = partnerLinkStates(o, { ok: true, config: { ...offen.config, registrationEnabled: false, registrationMode: "closed" } });
  assert.deepEqual(zu.partner, { ready: false, notice: LINK_TEXTS.registrationClosed });
  // Ein echter Partner wirbt nicht im Pre-Live-Testweg (der Server übergeht den Code).
  const testweg = { ok: true, config: { ...offen.config, registrationEnabled: false, registrationMode: "prelive_test" } };
  assert.equal(partnerLinkStates(o, testweg).partner.ready, false);
  // Testkonto: der Kundenlink ordnet nie zu; der Partnerlink nur im Testweg.
  const test = normalizeOverview({ ...OVERVIEW, preliveTest: true });
  assert.deepEqual(partnerLinkStates(test, offen).customer, { ready: false, notice: LINK_TEXTS.preliveCustomer });
  // Bei offener produktiver Registrierung wäre „nicht geöffnet“ falsch — der Testweg ist zu.
  assert.deepEqual(partnerLinkStates(test, offen).partner, { ready: false, notice: LINK_TEXTS.prelivePartner });
  assert.equal(partnerLinkStates(test, testweg).partner.ready, true);
  // Inaktiv: ein Hinweis für beide, keine Links.
  const inaktiv = partnerLinkStates(normalizeOverview({ ...OVERVIEW, partner: { ...OVERVIEW.partner, status: "inactive" }, links: {} }), offen);
  assert.deepEqual(inaktiv, { notice: LINK_TEXTS.inactive, customer: null, partner: null });
  // Ohne Adresse vom Server: nicht verfügbar statt eines leeren Knopfs.
  assert.deepEqual(partnerLinkStates(normalizeOverview({ ...OVERVIEW, links: {} }), offen).customer,
    { ready: false, notice: LINK_TEXTS.unavailable });
  // Der technische Code steht nicht in den Linkzuständen der Startseite.
  assert.doesNotMatch(JSON.stringify(bereit), /"ABCD2345"/);
});

test("6d — erster Besuch nur mit echten Nullen; Geldbegriffe getrennt und ohne Zahlungsversprechen", () => {
  const neu = normalizeOverview({ ...OVERVIEW, customers: { assigned: 0 }, currentMonth: { ...OVERVIEW.currentMonth, commissionCents: 0, payableCents: 0 } });
  assert.equal(isFirstVisit(neu), true);
  assert.equal(isFirstVisit(normalizeOverview(OVERVIEW)), false);
  assert.equal(isFirstVisit(normalizeOverview({ ...OVERVIEW, customers: {}, currentMonth: {} })), false, "unbekannt ist kein erster Besuch");
  assert.equal(isFirstVisit(normalizeOverview({ ...OVERVIEW, partner: { status: "inactive" }, customers: { assigned: 0 },
    currentMonth: { commissionCents: 0 } })), false);
  // Vier getrennte Stufen; „ausgezahlt" ist ein Vermerk, keine automatische Überweisung.
  assert.deepEqual(MONEY_TERMS.map(([b]) => b), ["Verdient", "Auszahlbar", "Abgerechnet", "Ausgezahlt"]);
  const texte = MONEY_TERMS.map(([, t]) => t).join(" ");
  assert.match(texte, /Gutschrift/);
  assert.match(texte, /Abrechnungsdaten/);
  assert.doesNotMatch(texte, /automatisch|garantiert|sofort überwiesen|Gewinn/i);
});

/* ══════════ Kunden, Provisionen, Team ═══════════════════════════════════ */

test("8 — Kundenzeilen: nur Vertragsfelder, keine Adressen oder Preise", () => {
  const rows = normalizeCustomers({ customers: [
    { ref: "K-1", companyName: "Acme GmbH", assignedSince: "2026-05-02", accountStatus: "active",
      currentMonth: { shipments: 3, packages: 4 }, previousMonth: { shipments: 5, packages: 6, active: true },
      street: "Geheim 1", priceNet: 999 },
    null, {},
  ] });
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["accountStatus", "assignedSince", "companyName", "current", "previous", "ref"]);
  assert.equal(rows[0].previous.active, true);
});

test("8b — Kunden (UX-Paket 6): Kundenkonto und Kunden-Level getrennt, Monate aus der Übersicht", () => {
  const monate = partnerMonths(normalizeOverview(OVERVIEW));
  assert.deepEqual(monate, { laufend: "Oktober", vormonat: "September" });
  assert.deepEqual(partnerMonths(null), { laufend: null, vormonat: null }, "ohne Übersicht kein Monat aus der Uhr");
  // Ohne `levels` trägt der laufende Monat der Übersicht; der Vormonat ist reine Kalenderarithmetik.
  assert.deepEqual(partnerMonths(normalizeOverview({ currentMonth: { month: "2026-01" } })), { laufend: "Januar", vormonat: "Dezember" });

  assert.deepEqual(customerMonthLabels(monate), { current: "Oktober (bisher)", previous: "September" });
  assert.deepEqual(customerMonthLabels(partnerMonths(null)), { current: "Laufender Monat", previous: "Vormonat" });

  const begriffe = customerTerms(monate);
  assert.deepEqual(begriffe.map(([b]) => b), [CUSTOMER_TEXTS.accountLabel, CUSTOMER_TEXTS.levelLabel]);
  assert.deepEqual(begriffe.map(([b]) => b), ["Kundenkonto", "Zählt für Ihr Kunden-Level"]);
  assert.match(begriffe[0][1], /freigeschaltet/);
  assert.equal(begriffe[1][1],
    "Der Kunde hat im September genug Pakete versendet und zählt deshalb als aktiver Kunde für Ihr Kunden-Level im Oktober.");
  assert.match(customerTerms(partnerMonths(null))[1][1], /im Vormonat .* im laufenden Monat\.$/);

  // Zwei unabhängige Aussagen: ein freigeschaltetes Konto zählt nicht automatisch fürs Level.
  const [kunde] = normalizeCustomers({ customers: [{ ref: "K-2", companyName: "Neu GmbH", accountStatus: "active",
    currentMonth: { shipments: 1, packages: 1 }, previousMonth: { shipments: 0, packages: 0, active: false } }] });
  assert.equal(customerAccountStatusMeta(kunde.accountStatus)[1], "Aktiv");
  assert.equal(customerLevelText(kunde), "Nein");
  assert.equal(customerLevelText(normalizeCustomers({ customers: [{ ref: "K-3", previousMonth: { active: "true" } }] })[0]), "Nein",
    "nur exakt true zählt");
  assert.equal(customerLevelText({ previous: { active: true } }), "Ja");
  assert.equal(customerLevelText(null), "Nein");

  assert.equal(shipmentsPackagesText(kunde.current), "1 Sendung · 1 Paket");
  assert.equal(shipmentsPackagesText({ shipments: 1234, packages: 2 }), "1.234 Sendungen · 2 Pakete");
  assert.equal(shipmentsPackagesText({ shipments: 0, packages: 0 }), "0 Sendungen · 0 Pakete");
  assert.equal(shipmentsPackagesText({ shipments: null, packages: 3 }), "— Sendungen · 3 Pakete");
  assert.equal(shipmentsPackagesText({}), "—");
  assert.equal(shipmentsPackagesText(null), "—");
  assert.equal(CUSTOMER_TEXTS.emptyText, "Sobald Ihnen Kunden zugeordnet sind, erscheinen sie hier.");
});

test("9 — Provisionen: Rücknahmen und Korrekturen erkennbar, Gegenüber je Ebene", () => {
  const c = normalizeCommissions({ month: "2026-10", totals: { accruedCents: 5000, payableCents: 2000, byLevel: { 0: 4000, 1: 800, 2: 200 } },
    entries: [
      { id: 1, reference: "CE-AB-1", entryDate: "2026-10-02", level: 0, type: "accrual", basisCents: 10000, ratePercent: "27.50", amountCents: 2750, payable: true, customerName: "Acme GmbH", teamMemberName: null, note: null },
      { id: 2, reference: "CE-AB-1", entryDate: "2026-10-03", level: 0, type: "reversal", basisCents: 10000, ratePercent: "27.50", amountCents: -2750, payable: false, customerName: "Acme GmbH" },
      { id: 3, entryDate: "2026-10-04", level: 1, type: "accrual", amountCents: 500, payable: false, customerName: "Beta AG", teamMemberName: "Tom Team" },
      { id: 4, entryDate: "2026-10-05", level: null, type: "adjustment", amountCents: -100, payable: true, note: "Korrektur Vormonat" },
    ] });
  assert.equal(c.totals.byLevel[1], 800);
  assert.equal(isCorrectionEntry(c.entries[0]), false);
  assert.equal(isCorrectionEntry(c.entries[1]), true);
  assert.equal(isCorrectionEntry(c.entries[3]), true);
  assert.equal(commissionCounterpart(c.entries[0]), "Acme GmbH");
  assert.equal(commissionCounterpart(c.entries[2]), "Tom Team", "Teambuchung nennt das Teammitglied");
  // UX-Paket 6 (bewusste Ankeränderung, Datenschutz): eine Teambuchung nennt nie
  // einen Kundennamen — früher fiel sie ohne Teammitglied auf `customerName` zurück.
  assert.equal(commissionCounterpart({ ...c.entries[2], teamMemberName: null }), "—");
  assert.equal(commissionCounterpart({ level: 2, customerName: "Kunde eines Teammitglieds" }), "—");
  assert.equal(commissionCounterpart(c.entries[3]), "—", "unbekannte Ebene: kein Name");
  assert.equal(commissionCounterpart(null), "—");
  assert.equal(formatCents(c.entries[1].amountCents), euro(-27.5));
  // UX-Paket 6 (bewusste Ankeränderung): derselbe Geldbegriff wie MONEY_TERMS statt „Ja/Nein".
  assert.equal(payableLabel(c.entries[0]), "Auszahlbar");
  assert.equal(payableLabel(c.entries[2]), "Noch nicht auszahlbar");
  assert.equal(payableLabel({ payable: "true" }), "Noch nicht auszahlbar", "nur exakt true");
  assert.equal(payableLabel(null), "Noch nicht auszahlbar");
});

test("9b — Provisionen (UX-Paket 6): Monat, verdient und auszahlbar zuerst — Summen des Servers", () => {
  const c = normalizeCommissions({ month: "2026-10", totals: { accruedCents: 5000, payableCents: 2000, byLevel: { 0: 4000, 1: 800, 2: 200 } }, entries: [] });
  const s = commissionSummary(c);
  assert.equal(s.title, "Verdient im Oktober 2026");
  assert.equal(s.earned, euro(50));
  assert.equal(s.payable, `davon auszahlbar: ${euro(20)}`);
  assert.deepEqual(s.breakdown.map((b) => [b.label, b.value]),
    [["Eigene Kunden", euro(40)], ["Team Ebene 1", euro(8)], ["Team Ebene 2", euro(2)]]);
  // Die Aufteilung nutzt dieselben Ebenennamen wie die Buchungen.
  assert.deepEqual(s.breakdown.map((b) => b.label), [0, 1, 2].map(commissionLevelLabel));
  // Unbekanntes bleibt „—", nichts wird addiert oder geschätzt.
  const leer = commissionSummary(normalizeCommissions({ totals: { accruedCents: "5000" } }));
  assert.equal(leer.title, "Verdient");
  assert.equal(leer.earned, "—");
  assert.equal(leer.payable, "davon auszahlbar: —");
  assert.deepEqual(leer.breakdown.map((b) => b.value), ["—", "—", "—"]);
  assert.equal(commissionSummary(null).earned, "—");
  // Basis und Satz einer Buchung: ein unbekannter Teil entfällt, nichts wird geschätzt.
  assert.equal(commissionBasisText({ basisCents: 10000, ratePercent: "27.50" }), `${euro(100)} · Satz 27,50 %`);
  assert.equal(commissionBasisText({ basisCents: 10000, ratePercent: null }), euro(100));
  assert.equal(commissionBasisText({ basisCents: null, ratePercent: "5.00" }), "Satz 5,00 %");
  assert.equal(commissionBasisText({ basisCents: null, ratePercent: null }), "—");
  assert.equal(commissionBasisText({ basisCents: "10000", ratePercent: "abc" }), "—");
  assert.equal(commissionBasisText(null), "—");
});

test("10 — „Mein Team“ ist immer da (auch ohne Einträge); Plätze aus Rang und Kennzeichen des Servers", () => {
  // Bewusste Ankeränderung (UX-Paket 1, Betreiberentscheidung 2026-10-08): früher
  // erschien der Bereich nur mit Einträgen und verschwand bei einem Ladefehler
  // unbemerkt. Jetzt stehen alle sechs Bereiche immer da; „Gutschriften“
  // zwischen Provisionen und Team (salesPartnerCreditNotes.test.mjs, Test 7).
  assert.deepEqual(visiblePartnerTabs().map((t) => t.id), ["overview", "customers", "commissions", "credit-notes", "team", "account"]);
  assert.deepEqual(visiblePartnerTabs().map((t) => t.id), PARTNER_TABS.map((t) => t.id));
  const team = normalizeTeam({ limits: { level1: 10, level2: 10 },
    level1: [{ name: "Tom Team", status: "active", relevant: true, rank: 2, commissionCurrentMonthCents: 500, commissionTotalCents: 9000 }],
    level2: [] });
  // UX-Paket 6 (bewusste Ankeränderung): „Ja (Rang 2)" klang nach Leistungswertung —
  // der Rang ist die Reihenfolge der Aktivierung (Server: teamRankingAt), also ein Platz.
  assert.equal(relevanceLabel(team.level1[0], 10), "Ja – Platz 2 von 10");
  assert.equal(relevanceLabel(team.level1[0]), "Ja", "ohne Grenze kein „von …“");
  assert.equal(relevanceLabel({ status: "inactive", relevant: false, rank: null }, 10), "Nein – nur aktive Partner zählen");
  assert.equal(relevanceLabel({ status: "active", relevant: false, rank: 11 }, 10), "Nein – Platz 11; es zählen die ersten 10");
  // Widersprüchliche Angaben werden nicht „repariert": ohne Kennzeichen kein Ja.
  assert.equal(relevanceLabel({ status: "active", relevant: false, rank: 1 }, 10), "Nein");
  assert.equal(relevanceLabel({ status: "active", relevant: "true", rank: 1 }, 10), "Nein", "nur exakt true");
  assert.equal(relevanceLabel(null, 10), "Nein");
});

test("10a — Team (UX-Paket 6): zwei Ebenen mit Namen, Belegung ohne „12 von 10“, Regel und Sätze", () => {
  assert.equal(teamLevelTitle(1), "Direkt geworben (Ebene 1)");
  assert.equal(teamLevelTitle(2), "Weitere Partner (Ebene 2)");
  assert.equal(TEAM_TEXTS.level2Note, "Partner, die Ihre direkt geworbenen Partner geworben haben.");
  const mitglied = (i, relevant, status = "active") => ({ name: `P${i}`, status, relevant, rank: relevant ? i : null });
  const team = normalizeTeam({ limits: { level1: 10, level2: 10 },
    level1: [mitglied(1, true)],
    // Früher „Ebene 2 · 12 von 10": inaktive Mitglieder zählten gegen die zehn Plätze.
    level2: [...Array.from({ length: 10 }, (_, i) => mitglied(i + 1, true)), mitglied(11, false, "inactive"), mitglied(12, false, "inactive")] });
  assert.equal(teamLevelSummary(1, team), "1 Partner · 1 zählt für Ihre Teamprovision (höchstens 10)");
  assert.equal(teamLevelSummary(2, team), "12 Partner · 10 zählen für Ihre Teamprovision (höchstens 10)");
  assert.equal(teamLevelSummary(2, normalizeTeam({ level2: [] })), TEAM_TEXTS.emptyLevel);
  assert.equal(teamLevelSummary(1, normalizeTeam({ level1: [mitglied(1, true)] })), "1 Partner · 1 zählt für Ihre Teamprovision",
    "ohne Grenze des Servers keine erfundene Zahl");

  const uebersicht = normalizeOverview(OVERVIEW);
  assert.equal(teamExplanation(team, uebersicht),
    "Für Ihre Teamprovision zählen je Ebene die ersten 10 aktiven Partner, in der Reihenfolge ihrer Aktivierung. Ihre Sätze: Ebene 1 5,00 % · Ebene 2 2,50 %.");
  assert.equal(teamExplanation(normalizeTeam({ limits: { level1: 10, level2: 5 } }), null),
    "Für Ihre Teamprovision zählen auf Ebene 1 die ersten 10 und auf Ebene 2 die ersten 5 aktiven Partner, in der Reihenfolge ihrer Aktivierung.");
  assert.equal(teamExplanation(normalizeTeam(null), null),
    "Für Ihre Teamprovision zählen aktive Partner, in der Reihenfolge ihrer Aktivierung.");
  assert.equal(teamMonthLabel(partnerMonths(uebersicht)), "Teamprovision im Oktober");
  assert.equal(teamMonthLabel(partnerMonths(null)), "Teamprovision im laufenden Monat");
});

test("10c — Direktlinks (UX-Paket 6): nur Kennungen aus PARTNER_TABS, sonst nichts", () => {
  assert.equal(PARTNER_PAGE_PARAM, "page");
  for (const t of PARTNER_TABS) assert.equal(partnerTabFromSearch(`?page=${t.id}`), t.id);
  assert.equal(partnerTabFromSearch("?page=team&x=1"), "team");
  for (const boese of ["?page=Team", "?page=admin", "?page=constructor", "?page=__proto__", "?page=", "?page=team%2F..",
    "?tab=team", "", "?", "?page=https://evil.example"]) {
    assert.equal(partnerTabFromSearch(boese), null, `durchgelassen: ${boese}`);
  }
  for (const nichtString of [null, undefined, 42, {}]) assert.equal(partnerTabFromSearch(nichtString), null);
  assert.equal(partnerTabSearch("team"), "?page=team");
  assert.equal(partnerTabSearch("credit-notes"), "?page=credit-notes");
  assert.equal(partnerTabSearch("overview"), "", "die Übersicht braucht keinen Parameter");
  for (const x of ["evil", "", null, undefined]) assert.equal(partnerTabSearch(x), "");
  assert.equal(partnerTabPath("account"), "/partner?page=account");
  assert.equal(partnerTabPath("overview"), "/partner");
  assert.equal(partnerTabPath("evil"), "/partner");
});

test("10b — Konto: Name, Firma und Login-E-Mail nur lesend, fehlende Werte benannt", () => {
  const user = { id: 42, name: " Petra Partner ", email: "petra@partner-vertrieb.de", company_name: "Vertrieb Süd GmbH",
    role: "sales_partner", password_hash: "x" };
  assert.deepEqual(partnerAccountRows(user), [
    { key: "name", k: "Name", v: "Petra Partner", empty: false },
    { key: "company", k: "Firma", v: "Vertrieb Süd GmbH", empty: false },
  ]);
  assert.deepEqual(partnerLoginEmailRow(user), { key: "email", k: "Login-E-Mail", v: "petra@partner-vertrieb.de", empty: false });
  const leer = partnerAccountRows({ name: "", company_name: null });
  assert.deepEqual(leer.map((r) => [r.v, r.empty]), [["Nicht angegeben", true], ["Nicht angegeben", true]]);
  assert.equal(partnerLoginEmailRow(null).v, "Nicht angegeben");
  assert.equal(PARTNER_TABS[PARTNER_TABS.length - 1].label, "Konto");
});

/* ══════════ Verdrahtung des Portals ═════════════════════════════════════ */

test("11 — das Portal ruft nur Partnerendpunkte auf und nutzt kein Kundenlayout", () => {
  const api = ohneKommentare(read("api/partnerApi.js"));
  assert.doesNotMatch(api, /\/kunde\/|\/kundenbereich|\/booking|\/api\/offers/, "Kundenendpunkt im Partner-API");
  const quellen = ["pages/PartnerPortalPage.jsx", "components/layout/PartnerLayout.jsx"]
    .concat(readdirSync(path.join(SRC, "components/partner")).map((f) => `components/partner/${f}`));
  for (const datei of quellen) {
    const src = ohneKommentare(read(datei));
    assert.doesNotMatch(src, /DashboardLayout|DashboardSidebar|NotificationBell|NotificationsProvider|UserChip|\/kunde\//,
      `${datei}: Kundenbaustein im Partnerportal`);
    assert.doesNotMatch(src, /\bfetch\(/, `${datei}: direkter fetch`);
    assert.doesNotMatch(src, /console\.(log|info|debug|warn)\(/, `${datei}: Logging`);
  }
  const seite = ohneKommentare(read("pages/PartnerPortalPage.jsx"));
  assert.match(seite, /<PartnerLayout\b/);
  assert.match(seite, /const tabs = visiblePartnerTabs\(\);/, "alle Bereiche — auch „Mein Team“ — stehen immer da");
  assert.doesNotMatch(seite, /visiblePartnerTabs\(team/, "der Teambereich hängt nicht mehr an den Einträgen");
  assert.match(seite, /role="tablist"/);
  assert.match(seite, /\{aktiv === "account" && <PartnerAccountPanel user=\{user\} \/>\}/);
  // UX-Paket 6: der Bereich steht in der Adresse (?page=…), gelesen nur über die
  // Allowlist, gewechselt ersetzend — kein Bereich im eigenen Seitenzustand mehr.
  assert.match(seite, /const gewuenscht = partnerTabFromSearch\(location\.search\) \|\| "overview";/);
  assert.match(seite, /navigate\(\{ pathname: location\.pathname, search: partnerTabSearch\(id\) \}, \{ replace: true \}\);/);
  assert.match(seite, /if \(location\.search !== sauber\) navigate\(\{ pathname: location\.pathname, search: sauber \}, \{ replace: true \}\);/);
  assert.doesNotMatch(seite, /useState\("overview"\)/, "der Bereich lebt in der Adresse, nicht im Seitenzustand");
  assert.doesNotMatch(seite, /searchParams\.get\("page"\)|location\.state\?\.page/, "kein zweiter, ungeprüfter Leseweg");
  // Kunden und Team lesen ihre Monatsnamen aus der Übersicht, nie aus der Uhr.
  assert.match(seite, /<PartnerCustomersPanel overview=\{overview\.data\} \/>/);
  assert.match(seite, /<PartnerTeamPanel state=\{team\} onRetry=\{team\.reload\} overview=\{overview\.data\} \/>/);
  for (const datei of ["components/partner/PartnerCustomersPanel.jsx", "components/partner/PartnerTeamPanel.jsx",
    "components/partner/PartnerCommissionsPanel.jsx", "components/partner/PartnerCreditNotesPanel.jsx"]) {
    assert.doesNotMatch(ohneKommentare(read(datei)), /new Date\(|Date\.now\(/, `${datei}: Monat aus der Browseruhr`);
  }
});

test("12 — „Konto“ nutzt nur die für Partner freigegebenen Kontobausteine", () => {
  // Aus dem Kundenbereich darf das Partnerportal genau drei Bausteine holen:
  // den Abschnittsrahmen, die E-Mail-Änderung und die Passwortänderung.
  const quellen = ["pages/PartnerPortalPage.jsx", "components/layout/PartnerLayout.jsx"]
    .concat(readdirSync(path.join(SRC, "components/partner")).map((f) => `components/partner/${f}`));
  const kundenImporte = new Set();
  for (const datei of quellen) {
    for (const m of read(datei).matchAll(/from "(\.\.\/)+(?:components\/)?dashboard\/([\w]+)"/g)) kundenImporte.add(m[2]);
  }
  assert.deepEqual([...kundenImporte].sort(), ["EmailChangeSection", "PasswordChangeSection", "ProfileCardHead"],
    "das Partnerportal bezieht einen weiteren Baustein aus dem Kundenbereich");
  // Und diese Bausteine sprechen ausschließlich die freigegebenen Endpunkte an:
  // die Passwortänderung genau PATCH /kunde/password …
  const pw = ohneKommentare(read("components/dashboard/PasswordChangeSection.jsx"));
  assert.deepEqual([...pw.matchAll(/apiFetch\(`([^`]+)`/g)].map((m) => m[1]), ["/kunde/password"]);
  // … die E-Mail-Änderung nur die drei E-Mail-Funktionen des zentralen Clients
  // (und refreshUser → GET /kundenbereich) — keinen eigenen Request.
  // Auch Zeilenend-Kommentare entfernen (die Datei erklärt „globaler Logout via apiFetch“).
  const mail = ohneKommentare(read("components/dashboard/EmailChangeSection.jsx")).replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(mail,/import \{ startEmailChange, resendEmailChange, cancelEmailChange, triggerAuthError \} from "\.\.\/\.\.\/api\/client";/);
  assert.doesNotMatch(mail, /apiFetch|\bfetch\(/);
  const client = ohneKommentare(read("api/client.js"));
  for (const fn of ["startEmailChange", "resendEmailChange", "cancelEmailChange"]) {
    const block = client.slice(client.indexOf(`export function ${fn}`));
    const pfad = block.match(/apiFetch\(`([^`]+)`/);
    assert.ok(pfad && /^\/kunde\/email-change(\/resend)?$/.test(pfad[1]), `${fn}: unerwarteter Pfad ${pfad && pfad[1]}`);
  }
  // Der Abschnittsrahmen ist reine Darstellung.
  assert.doesNotMatch(read("components/dashboard/ProfileCardHead.jsx"), /apiFetch|\bfetch\(|\/kunde\//);
  // Keine Profilbearbeitung im Partnerportal.
  const konto = ohneKommentare(read("components/partner/PartnerAccountPanel.jsx"));
  assert.doesNotMatch(konto, /kunde\/profil|Bearbeiten|<input/);
});

test("Pre-Live — Übersicht: Testkonto nur bei exakt true; Hinweistext", () => {
  assert.equal(normalizeOverview({ preliveTest: true }).preliveTest, true);
  assert.equal(normalizeOverview({ preliveTest: "true" }).preliveTest, false, "kein truthy-String");
  assert.equal(normalizeOverview({}).preliveTest, false);
  assert.equal(normalizeOverview(null).preliveTest, false);
  assert.equal(PARTNER_TEXTS.preliveBanner, "Pre-Live-Testkonto – keine echten Provisionen, Gutschriften oder Auszahlungen.");
  // Der Hinweis steht dauerhaft über den Bereichen der Portalseite, nicht in einem Bereich.
  const seite = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pages", "PartnerPortalPage.jsx"), "utf8");
  const hinweis = seite.indexOf('id="spp-prelive-banner"');
  assert.ok(hinweis > 0 && hinweis < seite.indexOf('role="tablist"'), "Hinweis vor den Bereichen");
  assert.match(seite, /overview\.data\?\.preliveTest === true/);
});
