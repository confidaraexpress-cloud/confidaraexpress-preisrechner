// UX-Paket 4 — Admin · Partnerdetail: Kurzfassungen, Vorbelegung, nächster
// Schritt (utils/adminPartnerDetailView.mjs) und die Struktur der Seite.
//
// Run: node --test src/utils/adminPartnerDetailView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DETAIL_TEXTS,
  agreementSummary,
  allVersionsLabel,
  assessmentSummary,
  billingSummary,
  capFormFromCurrent,
  capSummary,
  codesSummary,
  commissionsSummary,
  creditNotesSummary,
  currentCustomerCount,
  customersSummary,
  levelRulesPrefillNote,
  levelRulesSummary,
  partnerLevelRulesPrefill,
  partnerNextStep,
  ratesFormFromCurrent,
  ratesSummary,
  sectionSummary,
  statusSince,
  teamSummary,
} from "./adminPartnerDetailView.mjs";
import { normalizeRuleSet, normalizeStartDefaults } from "./adminSalesPartnerView.mjs";
import { formatCents } from "./salesPartnerView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const BONI = ["2.50", "5.00", "7.50", "10.00", "12.50"];
const STUFEN = (schwellen) => schwellen.map((threshold, i) => ({ level: i + 1, threshold, bonusPercent: BONI[i] }));
const START = normalizeStartDefaults({
  basePercent: "10.00", level1Percent: "5.00", level2Percent: "2.50", minPackagesForActiveCustomer: 3,
  customerLevels: STUFEN([3, 6, 10, 15, 25]), packageLevels: STUFEN([100, 250, 500, 1000, 2000]),
});

test("1 — aktuell zugeordnete Kunden: dieselbe Regel wie die Partnerliste, nie geraten", () => {
  const heute = "2026-10-08";
  const kunden = [
    { assignedSince: "2026-05-01", assignedUntil: null },        // offen → zählt
    { assignedSince: "2026-10-08", assignedUntil: null },        // ab heute → zählt
    { assignedSince: "2026-01-01", assignedUntil: "2026-10-08" }, // endet heute → zählt nicht
    { assignedSince: "2026-01-01", assignedUntil: "2026-10-09" }, // endet morgen → zählt
    { assignedSince: "2026-10-09", assignedUntil: null },        // beginnt morgen → zählt nicht
  ];
  assert.equal(currentCustomerCount(kunden, heute), 3);
  for (const tag of ["", null, "08.10.2026", "2026-13-01"]) assert.equal(currentCustomerCount(kunden, tag), null, String(tag));
  assert.equal(customersSummary(kunden, heute), "3 aktuell zugeordnet · 5 Zuordnungen insgesamt");
  assert.equal(customersSummary(kunden.slice(0, 2), heute), "2 aktuell zugeordnet");
  assert.equal(customersSummary(kunden, null), "5 Zuordnungen");
  assert.equal(customersSummary([], heute), "Keine Kunden zugeordnet");
});

test("2 — Kurzfassungen geben Serverwerte wieder, Unbekanntes bleibt erkennbar", () => {
  const rates = { current: { basePercent: "20.00", level1Percent: "5.00", level2Percent: "2.50", validFrom: "2026-10-06" } };
  assert.equal(ratesSummary(rates, "active"), "Grundprovision 20,00\u00a0% · Ebene 1: 5,00\u00a0% · Ebene 2: 2,50\u00a0%");
  assert.doesNotMatch(ratesSummary(rates, "active"), /\d %/, "Zahl und „%“ brechen nie getrennt um");
  assert.equal(ratesSummary({ current: null }, "pending"), "Noch keine Sätze");
  assert.equal(ratesSummary({ current: null }, "rejected"), "Keine Sätze (Antrag abgelehnt)");

  assert.equal(levelRulesSummary({ mode: "global", current: null }), "Globale Regeln");
  assert.equal(levelRulesSummary({ mode: "custom", current: { validFrom: "2026-09-01" } }), "Eigene Regeln seit 01.09.2026");
  assert.equal(levelRulesSummary({ mode: null }), "—");

  assert.equal(capSummary({ current: null, history: [] }), "Keine individuelle Obergrenze");
  assert.equal(capSummary({ current: { maxOwnRatePercent: null, maxTotalRatePercent: "30.00" } }),
    "Eigenprovision ohne Grenze · alle Ebenen höchstens 30,00\u00a0%");

  assert.equal(teamSummary({ level1: [{}, {}], level2: [{}] }), "Ebene 1: 2 · Ebene 2: 1");
  assert.equal(teamSummary(null), "Ebene 1: 0 · Ebene 2: 0");

  assert.equal(assessmentSummary([{ month: "2026-10", customerLevel: 2, packageLevel: 1 }, { month: "2026-09", customerLevel: 1 }]),
    "Oktober 2026: Kunden-Level 2 · Paket-Level 1");
  assert.equal(assessmentSummary([]), "Noch keine Monatsbewertung");

  assert.equal(commissionsSummary({ month: "2026-10", totals: { accruedCents: 12345, payableCents: 10000 } }),
    `Oktober 2026: ${formatCents(12345)} · davon auszahlbar ${formatCents(10000)}`, "die Beträge des Servers, unverändert formatiert");
  assert.equal(commissionsSummary({ month: "2026-10", totals: { accruedCents: null, payableCents: null } }), "Oktober 2026: — · davon auszahlbar —");

  const gs = (x) => ({ id: 1, kind: "regular", cancelled: false, payoutStatus: "paid", ...x });
  assert.equal(creditNotesSummary({ creditNotes: [] }), "Noch keine Gutschriften");
  assert.equal(creditNotesSummary({ creditNotes: [gs()] }), "1 Gutschrift");
  assert.equal(creditNotesSummary({ creditNotes: [gs(), gs({ id: 2, payoutStatus: "open" }), gs({ id: 3, payoutStatus: "open", cancelled: true }),
    { id: 4, kind: "cancellation" }] }), "3 Gutschriften · 1 noch nicht als ausgezahlt vermerkt");

  assert.equal(billingSummary({ status: "submitted" }), "In Prüfung");
  assert.equal(billingSummary({ status: "confirmed" }), "Bestätigt");
  assert.equal(billingSummary({ status: "SUBMITTED" }), "Unbekannter Status", "kein Rohwert");

  assert.equal(agreementSummary({ agreementVersion: "2026-10" }), "Partnervereinbarung Fassung 2026-10");
  assert.equal(agreementSummary({ agreementVersion: null, preliveTest: true }), "Testkonto (TEST / PRE-LIVE) – ohne Partnervereinbarung");
  assert.equal(agreementSummary({ agreementVersion: null, preliveTest: "true" }), "Keine Zustimmung hinterlegt", "nur die strikte Kennzeichnung");
  assert.equal(codesSummary({ referralCode: "ABCD2345" }), "Empfehlungscode ABCD2345");
  assert.equal(codesSummary({ referralCode: null }), "Kein Empfehlungscode");

  assert.equal(sectionSummary(null, capSummary), DETAIL_TEXTS.loading);
  assert.equal(sectionSummary({ loading: true, error: "", data: null }, capSummary), "Wird geladen …");
  assert.equal(sectionSummary({ loading: false, error: "x", data: null }, capSummary), "Nicht verfügbar");
  assert.equal(sectionSummary({ loading: true, error: "", data: { current: null } }, capSummary), "Keine individuelle Obergrenze",
    "beim Neuladen bleibt der bekannte Stand stehen");
  assert.equal(allVersionsLabel(3), "Alle Versionen (3)");
});

test("3 — nächster Schritt: nur aus gemeldeten Zuständen, nie „nichts zu erledigen“ ohne Stand", () => {
  const ok = (data) => ({ loading: false, error: "", data });
  const eingereicht = ok({ status: "submitted", billingDetails: { submittedAt: "2026-10-07T09:00:00.000Z" } });
  const bestaetigt = ok({ status: "confirmed", billingDetails: { submittedAt: "2026-10-07T09:00:00.000Z" } });
  const keine = ok({ creditNotes: [] });
  const fehlgeschlagen = ok({ creditNotes: [{ id: 3, kind: "regular", documentStatus: "failed" }] });

  const s1 = partnerNextStep({ billing: eingereicht, creditNotes: fehlgeschlagen });
  assert.deepEqual([s1.key, s1.action, s1.target], ["billing", "Abrechnungsdaten prüfen", "adm-sp-billing-card"], "Prüfung vor Dokument");
  const s2 = partnerNextStep({ billing: bestaetigt, creditNotes: fehlgeschlagen });
  assert.deepEqual([s2.key, s2.target], ["document", "adm-sp-credit-notes-card"]);
  assert.equal(partnerNextStep({ billing: bestaetigt, creditNotes: keine }).text, "Derzeit ist nichts zu erledigen.");

  for (const [billing, creditNotes] of [[null, keine], [bestaetigt, null], [{ loading: true, error: "", data: null }, keine]]) {
    assert.equal(partnerNextStep({ billing, creditNotes }).key, "loading");
  }
  const fehler = { loading: false, error: "Fehler", data: null };
  assert.equal(partnerNextStep({ billing: fehler, creditNotes: keine }).key, "unknown");
  assert.equal(partnerNextStep({ billing: bestaetigt, creditNotes: fehler }).key, "unknown");
  assert.equal(partnerNextStep().key, "loading");
});

test("4 — Vorbelegung: aktuelle Version des Servers, „Gültig ab“ bleibt bewusst leer", () => {
  assert.deepEqual(ratesFormFromCurrent({ basePercent: "20.00", level1Percent: "5.00", level2Percent: "2.5", validFrom: "2026-10-06", reason: "x" }),
    { validFrom: "", basePercent: "20,00", level1Percent: "5,00", level2Percent: "2,50", reason: "" });
  assert.deepEqual(ratesFormFromCurrent(null), { validFrom: "", basePercent: "", level1Percent: "", level2Percent: "", reason: "" });
  assert.deepEqual(capFormFromCurrent({ maxOwnRatePercent: "25.00", maxTotalRatePercent: null, validFrom: "2026-10-01" }),
    { validFrom: "", maxOwnRatePercent: "25,00", maxTotalRatePercent: "", reason: "" }, "eine leere Grenze bleibt leer");

  const eigene = normalizeRuleSet({ id: 7, scope: "partner", mode: "custom", validFrom: "2026-09-01", minPackagesForActiveCustomer: 4,
    customerLevels: STUFEN([2, 4, 8, 12, 20]), packageLevels: STUFEN([50, 100, 200, 400, 800]) });
  const ausAktuell = partnerLevelRulesPrefill({ levelRules: { mode: "custom", current: eigene }, startDefaults: START });
  assert.equal(ausAktuell.source, "current");
  assert.equal(ausAktuell.form.minPackagesForActiveCustomer, "4");
  assert.equal(ausAktuell.form.customerLevels[0].threshold, "2");
  assert.equal(ausAktuell.form.packageLevels[4].bonusPercent, "12,50");
  assert.equal(ausAktuell.form.mode, "", "die Wahl global/eigene bleibt Pflicht");
  assert.equal(ausAktuell.form.validFrom, "");

  const ausStart = partnerLevelRulesPrefill({ levelRules: { mode: "global", current: null }, startDefaults: START });
  assert.equal(ausStart.source, "startDefaults");
  assert.equal(ausStart.form.packageLevels[4].threshold, "2000");
  const leer = partnerLevelRulesPrefill({ levelRules: { mode: "global", current: null }, startDefaults: null });
  assert.equal(leer.source, null);
  assert.equal(leer.form.minPackagesForActiveCustomer, "");
  assert.equal(levelRulesPrefillNote("current"), "Vorbelegt mit den aktuell geltenden eigenen Regeln des Partners.");
  assert.match(levelRulesPrefillNote("startDefaults"), /^Vorbelegt mit den Startwerten des Programms\./);
  assert.equal(levelRulesPrefillNote(null), null);
});

test("5 — „seit“ des Status kommt aus dem Verlauf des Servers", () => {
  const verlauf = [
    { status: "active", effectiveDate: "2026-09-01" },
    { status: "inactive", effectiveDate: "2026-06-01" },
    { status: "active", effectiveDate: "2026-03-01" },
  ];
  assert.equal(statusSince("active", verlauf), "2026-09-01");
  assert.equal(statusSince("inactive", verlauf), "2026-06-01");
  assert.equal(statusSince("rejected", verlauf), null);
  assert.equal(statusSince("active", null), null);
});

test("6 — Seite: Antrag oben, Überblick für freigegebene Partner, Gruppen statt Kartenwand", () => {
  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerDetailPage.jsx"));
  assert.match(seite, /const antrag = p\.status === "pending";/);
  assert.match(seite, /const freigegeben = p\.status === "active" \|\| p\.status === "inactive";/);
  assert.match(seite, /\{freigegeben && \(\s*<SalesPartnerOverviewCard /, "Überblick nur für freigegebene Partner");
  assert.match(seite, /title=\{DETAIL_TEXTS\.applicationTitle\}\s*intro=\{<PartnerFacts p=\{p\} from=\{from\} id="adm-sp-application-facts" \/>\}/);
  // Die Statuskarte bleibt an einer Stelle (key), damit ihre Meldung nach der Freigabe stehen bleibt.
  assert.equal((seite.match(/<SalesPartnerStatusCard key="status" \{\.\.\.statusKarte\}/g) || []).length, 2);
  for (const gruppe of ["groupBilling", "groupConditions", "groupNetwork", "groupData"]) {
    assert.match(seite, new RegExp(`title=\\{DETAIL_TEXTS\\.${gruppe}\\}`), gruppe);
  }
  assert.equal(DETAIL_TEXTS.applicationTitle, "Antrag prüfen");
  // Ein Partnerwechsel beginnt mit frischen Bereichen.
  assert.match(seite, /<PartnerDetailBody key=\{partnerId\} /);
});

test("7 — „Aktualisieren“ lädt das Detail und jeden selbst ladenden Bereich neu", () => {
  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerDetailPage.jsx"));
  assert.match(seite, /const aktualisieren = \(\) => \{\s*load\(\);\s*setRefreshKey\(\(k\) => k \+ 1\);\s*\};/);
  assert.match(seite, /id="adm-sp-refresh" onClick=\{aktualisieren\}/);
  for (const [datei, karte] of [
    ["components/admin/SalesPartnerCapCard.jsx", "SalesPartnerCapCard"],
    ["components/admin/SalesPartnerBillingDetailsCard.jsx", "SalesPartnerBillingDetailsCard"],
    ["components/admin/SalesPartnerCommissionsCard.jsx", "SalesPartnerCommissionsCard"],
    ["components/admin/SalesPartnerCreditNotesCard.jsx", "SalesPartnerCreditNotesCard"],
  ]) {
    assert.match(ohneKommentare(read(datei)), /useEffect\(\(\) => \{ load\(\); return \(\) => \{ lauf\.current \+= 1; \}; \}, \[load, refreshKey\]\);/, `${datei}: lädt nicht neu`);
    assert.match(seite, new RegExp(`<${karte} [^>]*refreshKey=\\{refreshKey\\}`), `${karte}: ohne refreshKey`);
  }
});

test("8 — eingeklappt statt dauerhaft sichtbar; keine Funktion entfällt", () => {
  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerDetailPage.jsx"));
  for (const id of ["adm-sp-customers-card", "adm-sp-team-card", "adm-sp-assessments-card", "adm-sp-master-card", "adm-sp-codes-card"]) {
    assert.match(seite, new RegExp(`<AdminDisclosureCard id="${id}"`), id);
  }
  const KARTEN = [
    ["components/admin/SalesPartnerRatesCard.jsx", "adm-sp-rates-card", "adm-sp-rates-new", "formOffen"],
    ["components/admin/SalesPartnerLevelRulesCard.jsx", "adm-sp-levels-card", "adm-sp-levels-new", "formOffen"],
    ["components/admin/SalesPartnerCapCard.jsx", "adm-sp-partner-cap-card", "adm-sp-pcap-new", "formOffen"],
    ["components/admin/SalesPartnerCommissionsCard.jsx", "adm-sp-commissions-card", "adm-sp-adjust-section", "korrekturOffen"],
    ["components/admin/SalesPartnerBillingDetailsCard.jsx", "adm-sp-billing-card", null, null],
    ["components/admin/SalesPartnerCreditNotesCard.jsx", "adm-sp-credit-notes-card", null, null],
  ];
  for (const [datei, karte, formular, zustand] of KARTEN) {
    const src = ohneKommentare(read(datei));
    assert.match(src, new RegExp(`<AdminDisclosureCard id="${karte}"`), `${datei}: nicht einklappbar`);
    if (formular) {
      // Der Klappzustand ist der Formularzustand — und der beginnt geschlossen.
      assert.match(src, new RegExp(`<AdminSubDisclosure id="${formular}"[^>]*open=\\{${zustand}\\}`), `${datei}: Formular dauerhaft sichtbar`);
      assert.match(src, new RegExp(`const \\[${zustand}, set\\w+\\] = useState\\(false\\);`), `${datei}: Formular beginnt geöffnet`);
      // Das Formular steht im eingeklappten Teil, nicht davor.
      assert.ok(src.indexOf(`id="${formular}"`) < src.indexOf("<form"), `${datei}: Formular außerhalb des eingeklappten Teils`);
    }
  }
  // Level-Regeln, Obergrenze und Korrekturbuchung erlaubt der Server in jedem Status
  // — die Oberfläche schränkt sie nicht ein. Nur neue Sätze gibt es erst nach der Freigabe.
  for (const datei of ["components/admin/SalesPartnerLevelRulesCard.jsx", "components/admin/SalesPartnerCapCard.jsx",
    "components/admin/SalesPartnerCommissionsCard.jsx"]) {
    assert.doesNotMatch(ohneKommentare(read(datei)), /ratesEditable|partnerStatus|=== "(pending|active|inactive|rejected)"/, `${datei}: neue Statussperre`);
  }
  assert.match(ohneKommentare(read("components/admin/SalesPartnerRatesCard.jsx")), /\{ratesEditable\(partnerStatus\) && \(\s*<AdminSubDisclosure id="adm-sp-rates-new"/);
  // Eine offene Prüfung bzw. ein fehlgeschlagenes Dokument öffnet den Bereich von selbst.
  assert.match(ohneKommentare(read("components/admin/SalesPartnerBillingDetailsCard.jsx")), /attention=\{billingReviewable\(data\)\}/);
  assert.match(ohneKommentare(read("components/admin/SalesPartnerCreditNotesCard.jsx")), /attention=\{liste\.some\(\(cn\) => cn\.documentStatus === "failed"\)\}/);
});

test("9 — Formulare: Pflichtfelder markiert, Wirkung erklärt, Bestätigung bleibt", () => {
  const regeln = ohneKommentare(read("components/admin/SalesPartnerLevelRulesCard.jsx"));
  assert.match(regeln, />Welche Regeln sollen gelten\? \(Pflicht\)</);
  assert.match(regeln, /label="Gültig ab \(Pflicht\)"/);
  assert.match(regeln, /\{DETAIL_TEXTS\.levelsEffect\}/);
  assert.match(regeln, /\{DETAIL_TEXTS\.levelsAllRequired\}/);
  assert.match(regeln, /confirmId="adm-sp-levels-confirm"/);
  const grenze = ohneKommentare(read("components/admin/SalesPartnerCapCard.jsx"));
  assert.match(grenze, /label="Gültig ab \(Pflicht\)"/);
  assert.match(grenze, /setForm\(capFormFromCurrent\(state\.data\?\.current \|\| null\)\)/, "Vorbelegung beim Öffnen");
  assert.match(grenze, /confirmId="adm-sp-pcap-confirm"/);
  const saetze = ohneKommentare(read("components/admin/SalesPartnerRatesCard.jsx"));
  assert.match(saetze, /setForm\(ratesFormFromCurrent\(aktuell\)\)/, "Vorbelegung beim Öffnen");
  assert.match(saetze, /\{DETAIL_TEXTS\.ratesEffect\}|DETAIL_TEXTS\.ratesEffect/);
  assert.match(saetze, /confirmId="adm-sp-rates-confirm"/);
  const provisionen = ohneKommentare(read("components/admin/SalesPartnerCommissionsCard.jsx"));
  assert.match(provisionen, />Betrag in € \(Pflicht, negativ für Abzug\)</);
  assert.match(provisionen, /\{DETAIL_TEXTS\.adjustmentEffect\}/);
  assert.match(provisionen, /confirmId="adm-sp-adjust-confirm"/);
  assert.match(DETAIL_TEXTS.adjustmentEffect, /mit dem heutigen Datum erfasst; bestehende Buchungen bleiben unverändert/);
  const datum = ohneKommentare(read("components/admin/DateField.jsx"));
  assert.match(datum, /aria-required=\{required === true \? "true" : undefined\}/);
});

test("10 — keine Rechnung und kein Technikbegriff im Browser", () => {
  const view = ohneKommentare(read("utils/adminPartnerDetailView.mjs"));
  assert.doesNotMatch(view, /\.reduce\(|Cents\s*[+\-*/]|[+\-*/]\s*\w*Cents\b/, "keine Summen- oder Betragsrechnung");
  assert.doesNotMatch(view, /new Date|Date\.now/, "keine Browseruhr im Modul (der Tag kommt vom Aufrufer)");
  for (const datei of ["components/admin/SalesPartnerOverviewCard.jsx", "components/admin/AdminDisclosureCard.jsx",
    "pages/admin/AdminSalesPartnerDetailPage.jsx", "components/admin/SalesPartnerLevelRulesCard.jsx",
    "components/admin/SalesPartnerCapCard.jsx", "components/admin/SalesPartnerCreditNotesCard.jsx",
    "components/admin/SalesPartnerBillingDetailsCard.jsx"]) {
    const sichtbar = ohneKommentare(read(datei)).match(/"[^"\n]*"|>[^<>{}\n]+</g) || [];
    for (const t of sichtbar) assert.doesNotMatch(t, /\bServer(s)?\b|\bProvider\b/, `${datei}: Technikbegriff im Text ${t}`);
  }
  for (const t of Object.values(DETAIL_TEXTS)) assert.doesNotMatch(String(t), /\bServer(s)?\b|\bProvider\b/);
});

test("11 — mobil: lange Tabellen werden zu Karten, Zellen tragen ihre Spaltenbeschriftung", () => {
  const DATEIEN = ["pages/admin/AdminSalesPartnerDetailPage.jsx", "components/admin/SalesPartnerRatesCard.jsx",
    "components/admin/SalesPartnerCapCard.jsx", "components/admin/SalesPartnerCommissionsCard.jsx",
    "components/admin/SalesPartnerCreditNotesCard.jsx"];
  for (const datei of DATEIEN) {
    const src = ohneKommentare(read(datei));
    const tabellen = (src.match(/<table>/g) || []).length;
    assert.equal((src.match(/adm-sp-cardtable/g) || []).length, tabellen, `${datei}: Tabelle ohne Kartenansicht`);
    const ohneLabel = (src.match(/<td(?![^>]*data-label)[^>]*>/g) || []);
    const erwartet = datei.endsWith("CommissionsCard.jsx") ? ["<td colSpan={9}>"] : [];
    assert.deepEqual(ohneLabel, erwartet, `${datei}: Zelle ohne Spaltenbeschriftung`);
  }
  const css = read("styles/admin.css");
  const mobil = css.slice(css.indexOf("@media (max-width: 640px) {\n  .adm-sp-cardtable"));
  assert.match(mobil, /\.adm-sp-cardtable td::before \{\s*content: attr\(data-label\);/);
  assert.match(css, /@media \(max-width: 900px\) \{\s*\.adm-sp-fold > summary \{ min-height: var\(--ce-size-touch-target\);/);
  // Die Klappmarke ist die gemeinsame CSS-Marke, kein Rohzeichen.
  assert.match(ohneKommentare(read("components/admin/AdminDisclosureCard.jsx")), /<span className="adm-tech-caret" aria-hidden="true" \/>/);
});
