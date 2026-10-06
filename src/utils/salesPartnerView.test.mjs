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
  PARTNER_TABS,
  PARTNER_TEXTS,
  commissionCounterpart,
  commissionLevelLabel,
  commissionTypeMeta,
  customerAccountStatusMeta,
  formatBonusPercent,
  formatCents,
  formatIsoDate,
  formatMonth,
  formatPercent,
  isCorrectionEntry,
  levelText,
  monthOptions,
  monthsBack,
  normalizeCommissions,
  normalizeCustomers,
  normalizeOverview,
  normalizeTeam,
  overviewKpis,
  partnerAccountRows,
  partnerLoginEmailRow,
  partnerStatusMeta,
  payableLabel,
  relevanceLabel,
  teamLevelHeading,
  teamVisible,
  visiblePartnerTabs,
} from "./salesPartnerView.mjs";

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

test("6 — Kennzahlen kommen ausschließlich aus der Antwort", () => {
  const o = normalizeOverview(OVERVIEW);
  const kpis = Object.fromEntries(overviewKpis(o).map((k) => [k.key, k]));
  assert.equal(kpis.activeCustomers.value, "12");
  assert.equal(kpis.shippedPackages.value, "1.530");
  assert.equal(kpis.activeCustomers.hint, "Bemessungsmonat September 2026");
  assert.equal(kpis.basePercent.value, "20,00 %");
  assert.equal(kpis.customerLevel.value, "Level 2");
  assert.equal(kpis.customerLevel.hint, "Bonus +5,00 %");
  assert.equal(kpis.packageLevel.value, "Level 3");
  assert.equal(kpis.ownRate.value, "27,50 %");
  assert.equal(kpis.ownRate.hint, "Obergrenze angewendet");
  assert.equal(o.currentMonth.commissionCents, 123456);
  assert.equal(o.customersAssigned, 14);
});

test("7 — ohne Monatsbewertung: Striche und ein ruhiger Hinweis, keine Nullen", () => {
  const o = normalizeOverview({ ...OVERVIEW, levels: null });
  const kpis = Object.fromEntries(overviewKpis(o).map((k) => [k.key, k]));
  for (const k of ["activeCustomers", "shippedPackages", "customerLevel", "packageLevel", "ownRate"]) {
    assert.equal(kpis[k].value, "—", `${k} erfindet einen Wert`);
  }
  assert.equal(kpis.activeCustomers.hint, PARTNER_TEXTS.noAssessment);
  assert.equal(kpis.basePercent.value, "20,00 %");
  const leer = normalizeOverview(null);
  assert.equal(leer.links.customer, null);
  assert.equal(leer.currentMonth.commissionCents, null);
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
  assert.equal(formatCents(c.entries[1].amountCents), euro(-27.5));
  assert.equal(payableLabel(c.entries[0]), "Ja");
  assert.equal(payableLabel(c.entries[2]), "Nein");
});

test("10 — „Mein Team“ erscheint nur mit Einträgen; Relevanz mit Rang", () => {
  const leer = normalizeTeam({ limits: { level1: 10, level2: 10 }, level1: [], level2: [] });
  assert.equal(teamVisible(leer), false);
  assert.deepEqual(visiblePartnerTabs(leer).map((t) => t.id), ["overview", "customers", "commissions", "account"],
    "ohne Teameinträge kein Teambereich; „Konto“ steht immer da");
  const team = normalizeTeam({ limits: { level1: 10, level2: 10 },
    level1: [{ name: "Tom Team", status: "active", relevant: true, rank: 2, commissionCurrentMonthCents: 500, commissionTotalCents: 9000 }],
    level2: [] });
  assert.equal(teamVisible(team), true);
  assert.deepEqual(visiblePartnerTabs(team).map((t) => t.id), PARTNER_TABS.map((t) => t.id));
  assert.equal(relevanceLabel(team.level1[0]), "Ja (Rang 2)");
  assert.equal(relevanceLabel({ relevant: false, rank: 1 }), "Nein");
  assert.equal(teamLevelHeading(1, team), "Ebene 1 · 1 von 10");
  assert.equal(teamLevelHeading(2, normalizeTeam({ level2: [] })), "Ebene 2");
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
  assert.match(seite, /visiblePartnerTabs\(/, "der Teambereich muss an den Einträgen hängen");
  assert.match(seite, /role="tablist"/);
  assert.match(seite, /\{aktiv === "account" && <PartnerAccountPanel user=\{user\} \/>\}/);
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
