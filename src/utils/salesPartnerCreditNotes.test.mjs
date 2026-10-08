// Gutschriften der Vertriebspartner — offener Saldo, Auszahlung, Korrekturen,
// Normalisierung (Partner ohne Adminfelder), PDF-Abruf und Verdrahtung des
// Bereichs „Gutschriften" (bis UX-Paket 6 „Abrechnungen").
//
// Run: node --test src/utils/salesPartnerCreditNotes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CREDIT_NOTE_DOWNLOAD_TEXT,
  CREDIT_NOTE_TEXTS,
  correctionHints,
  creditNoteDownloadMessage,
  creditNoteFallbackFilename,
  creditNoteIdOf,
  creditNoteIssuedOn,
  creditNoteKindMeta,
  creditNotePeriod,
  creditNoteStatusMeta,
  creditNoteTaxRate,
  creditNoteTitle,
  normalizeCreditNote,
  normalizeCreditNotes,
  openSettlementHint,
  payoutText,
} from "./salesPartnerCreditNotes.mjs";
import { PARTNER_TABS } from "./salesPartnerView.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const euro = (v) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

const GS = {
  id: 11, number: "GS-2026-0001", kind: "regular", title: "Gutschrift", periodMonth: "2026-09",
  issuedAt: "2026-10-02T08:00:00.000Z", issuedOn: "2026-10-02", netCents: 10000, taxCents: 1900, grossCents: 11900,
  taxRatePercent: "19.00", currency: "EUR", documentReady: true, payoutStatus: "open", paidOn: null,
  cancelled: false, cancelledByNumber: null, correctsNumber: null, replacesNumber: null,
  documentStatus: "ready", notifiedAt: "2026-10-02T08:01:00.000Z", paidReference: null, issuedByName: "Anna Admin",
  cancellationReason: null,
};

/* ══════════ Offener Saldo ═══════════════════════════════════════════════ */

test("1 — Hinweis zum offenen Saldo: Vortrag, nächste Gutschrift oder nichts", () => {
  // UX-Paket 6 (bewusste Ankeränderung): dieselben Geldbegriffe wie die Übersicht
  // (MONEY_TERMS: auszahlbar → abgerechnet) statt des Sonderworts „abrechnungsreif";
  // die Voraussetzung der Gutschrift (bestätigte Abrechnungsdaten) steht dabei.
  assert.equal(openSettlementHint({ readyNetCents: -500, readyEntryCount: 2, carriedForward: true }),
    "Ihre noch nicht abgerechneten Provisionen ergeben derzeit keinen positiven Betrag. Er wird mit der nächsten Gutschrift verrechnet.");
  assert.equal(openSettlementHint({ readyNetCents: 12345, readyEntryCount: 3, carriedForward: false }),
    `Noch nicht abgerechnet: auszahlbare Provisionen von ${euro(123.45)}. Sie werden mit der nächsten Gutschrift abgerechnet.`);
  assert.equal(openSettlementHint({ readyNetCents: 0, readyEntryCount: 0, carriedForward: false }), null);
  // Ohne lesbaren Betrag kein Satz mit erfundener Zahl.
  assert.equal(openSettlementHint({ readyNetCents: null, readyEntryCount: 3, carriedForward: false }), null);
  assert.equal(openSettlementHint(null), null);
  assert.equal(CREDIT_NOTE_TEXTS.settlementNote,
    "Auszahlbare Provisionen werden einmal im Monat mit einer Gutschrift abgerechnet. Voraussetzung sind bestätigte Abrechnungsdaten.");
  assert.equal(CREDIT_NOTE_TEXTS.billingLink, "Abrechnungsdaten ansehen");
  assert.equal(CREDIT_NOTE_TEXTS.empty, "Noch keine Gutschriften.");
  // Kein Text des Bereichs nutzt mehr das Sonderwort oder setzt Gutschrift und Auszahlung gleich.
  const texte = Object.values(CREDIT_NOTE_TEXTS).join(" ");
  assert.doesNotMatch(texte, /abrechnungsreif/i);
  assert.doesNotMatch(texte, /ausgezahlt wird|wird überwiesen|automatisch/i);
});

/* ══════════ Auszahlung, Art, Korrekturen ════════════════════════════════ */

test("2 — Auszahlung: „Noch nicht ausgezahlt“ / „Ausgezahlt am …“; Storno ohne Auszahlung", () => {
  const offen = normalizeCreditNote(GS);
  assert.equal(payoutText(offen), "Noch nicht ausgezahlt");
  assert.equal(payoutText(normalizeCreditNote({ ...GS, payoutStatus: "paid", paidOn: "2026-10-15" })), "Ausgezahlt am 15.10.2026");
  assert.equal(payoutText(normalizeCreditNote({ ...GS, payoutStatus: "paid", paidOn: null })), "Ausgezahlt");
  assert.equal(payoutText(normalizeCreditNote({ ...GS, kind: "cancellation", payoutStatus: null })), "—");
  assert.equal(payoutText(normalizeCreditNote({ ...GS, cancelled: true, cancelledByNumber: "GS-2026-0002" })), "—",
    "eine stornierte, nie ausgezahlte Gutschrift wird nicht mehr ausgezahlt");
  assert.equal(payoutText(normalizeCreditNote({ ...GS, payoutStatus: "scheduled" })), "Unbekannter Status");
});

test("3 — Korrekturhinweise und Art: nie ein Rohwert", () => {
  assert.deepEqual(correctionHints(normalizeCreditNote({ ...GS, cancelled: true, cancelledByNumber: "GS-2026-0002" })),
    ["Storniert durch GS-2026-0002"]);
  assert.deepEqual(correctionHints(normalizeCreditNote({ ...GS, id: 12, number: "GS-2026-0002", kind: "cancellation",
    correctsNumber: "GS-2026-0001" })), ["Storno zu GS-2026-0001"]);
  assert.deepEqual(correctionHints(normalizeCreditNote({ ...GS, replacesNumber: "GS-2026-0001" })), ["Ersetzt GS-2026-0001"]);
  assert.deepEqual(correctionHints(normalizeCreditNote({ ...GS, cancelled: true })), ["Storniert"]);
  assert.deepEqual(creditNoteKindMeta("cancellation"), ["badge-red", "Storno"]);
  assert.equal(creditNoteKindMeta("credit_memo")[1], "Unbekannter Status");
  assert.equal(creditNoteTitle(normalizeCreditNote({ ...GS, title: null })), "Gutschrift");
  assert.equal(creditNoteTitle(normalizeCreditNote({ ...GS, title: "Gutschrift (Selbstabrechnung)" })), "Gutschrift (Selbstabrechnung)");
  assert.equal(creditNotePeriod(normalizeCreditNote(GS)), "September 2026");
  assert.equal(creditNoteIssuedOn(normalizeCreditNote(GS)), "02.10.2026");
  assert.equal(creditNoteTaxRate(normalizeCreditNote(GS)), "19,00 %");
});

test("3b — Status (UX-Paket 6): nur aus Art und Stornomerkmal, nie aus der Auszahlung", () => {
  assert.deepEqual(creditNoteStatusMeta(normalizeCreditNote(GS)), ["badge-blue", "Ausgestellt"]);
  assert.deepEqual(creditNoteStatusMeta(normalizeCreditNote({ ...GS, payoutStatus: "paid", paidOn: "2026-10-15" })),
    ["badge-blue", "Ausgestellt"], "„ausgezahlt“ ist ein eigener Vermerk, kein Status der Gutschrift");
  assert.deepEqual(creditNoteStatusMeta(normalizeCreditNote({ ...GS, cancelled: true, cancelledByNumber: "GS-2026-0002" })),
    ["badge-gray", "Storniert"]);
  assert.deepEqual(creditNoteStatusMeta(normalizeCreditNote({ ...GS, cancelled: "true" })), ["badge-blue", "Ausgestellt"],
    "nur exakt true ist storniert");
  assert.deepEqual(creditNoteStatusMeta(normalizeCreditNote({ ...GS, kind: "cancellation", correctsNumber: "GS-2026-0001" })),
    ["badge-red", "Storno"]);
  assert.equal(creditNoteStatusMeta(normalizeCreditNote({ ...GS, kind: "credit_memo" }))[1], "Unbekannter Status");
  assert.equal(creditNoteStatusMeta(normalizeCreditNote({ ...GS, kind: null }))[1], "—");
  assert.equal(creditNoteStatusMeta(null)[1], "—");
});

/* ══════════ Normalisierung ══════════════════════════════════════════════ */

test("4 — die Partneransicht übernimmt keine Adminfelder", () => {
  const partner = normalizeCreditNote(GS);
  for (const k of ["documentStatus", "notifiedAt", "paidReference", "issuedByName", "cancellationReason"]) {
    assert.equal(k in partner, false, `${k} gehört nicht in die Partneransicht`);
  }
  const admin = normalizeCreditNote(GS, { admin: true });
  assert.equal(admin.issuedByName, "Anna Admin");
  assert.equal(admin.documentStatus, "ready");
  assert.equal(partner.netCents, 10000);
  assert.equal(partner.documentReady, true);
});

test("5 — Beträge nur in EUR; ohne Kennung keine Aktion, ohne Kennung und Nummer keine Zeile", () => {
  const fremd = normalizeCreditNote({ ...GS, currency: "USD" });
  assert.deepEqual([fremd.netCents, fremd.taxCents, fremd.grossCents], [null, null, null]);
  assert.equal(normalizeCreditNote({ ...GS, netCents: "100" }).netCents, null, "kein Betrag aus einer Zeichenkette");
  assert.equal(normalizeCreditNote({ ...GS, id: "abc" }).id, null);
  assert.equal(normalizeCreditNote({ ...GS, id: null, number: null }), null);
  assert.equal(creditNoteIdOf("15"), "15");
  assert.equal(creditNoteIdOf(0), null);
  const liste = normalizeCreditNotes({ creditNotes: [GS, null, {}, "x"], openSettlement: { readyNetCents: 5, readyEntryCount: 1, carriedForward: "true" } });
  assert.equal(liste.creditNotes.length, 1);
  assert.equal(liste.openSettlement.carriedForward, false, "nur true ist ein Vortrag");
  assert.deepEqual(normalizeCreditNotes(null), { creditNotes: [], openSettlement: null });
});

/* ══════════ PDF ═════════════════════════════════════════════════════════ */

test("6 — PDF-Abruf: verständliche Sätze, sicherer Rückfallname", () => {
  assert.equal(creditNoteDownloadMessage(404), "Diese Gutschrift ist nicht verfügbar.");
  assert.equal(creditNoteDownloadMessage(500), CREDIT_NOTE_DOWNLOAD_TEXT.allgemein);
  assert.equal(creditNoteFallbackFilename("GS-2026-0001"), "gutschrift-GS-2026-0001.pdf");
  assert.equal(creditNoteFallbackFilename("../../etc/passwd"), "gutschrift-....etcpasswd.pdf");
  assert.equal(creditNoteFallbackFilename(null), "gutschrift.pdf");
});

/* ══════════ Verdrahtung ═════════════════════════════════════════════════ */

test("7 — „Gutschriften“ steht zwischen Provisionen und Team; das Portal rendert den Bereich", () => {
  const ids = PARTNER_TABS.map((t) => t.id);
  assert.deepEqual(ids, ["overview", "customers", "commissions", "credit-notes", "team", "account"]);
  // UX-Paket 6 (bewusste Ankeränderung): der Bereich heißt wie im Adminbereich
  // „Gutschriften" — „Abrechnungen" war mit den Abrechnungsdaten im Konto verwechselbar.
  assert.equal(PARTNER_TABS.find((t) => t.id === "credit-notes").label, "Gutschriften");
  assert.doesNotMatch(PARTNER_TABS.map((t) => t.label).join(" "), /Abrechnung/);
  const seite = ohneKommentare(read("pages/PartnerPortalPage.jsx"));
  assert.match(seite, /\{aktiv === "credit-notes" && <PartnerCreditNotesPanel \/>\}/);
  // Der Bereich zeigt Monat, Betrag, Status, Auszahlung und PDF — die steuerlichen
  // Angaben (Netto, Steuer mit Satz, Gesamt, Nummer, Ausstellungstag) bleiben.
  const bereich = ohneKommentare(read("components/partner/PartnerCreditNotesPanel.jsx"));
  for (const kopf of ["Monat", "Gutschrift", "Betrag", "Status", "Auszahlung", "PDF"]) {
    assert.match(bereich, new RegExp(`<th scope="col"(?: className="ce-num")?>${kopf}</th>`), `Spalte ${kopf} fehlt`);
  }
  for (const wert of ["formatCents(cn.grossCents)", "formatCents(cn.netCents)", "formatCents(cn.taxCents)",
    "creditNoteTaxRate(cn)", "creditNoteIssuedOn(cn)", "cn.number", "creditNotePeriod(cn)", "payoutText(cn)", "correctionHints(cn)"]) {
    assert.ok(bereich.includes(wert), `${wert} fehlt im Bereich`);
  }
  // Der Weg zu den Abrechnungsdaten führt über die Allowlist der Bereiche ins Konto.
  assert.match(bereich, /to=\{partnerTabPath\("account"\)\}/);
});

test("8 — PDF nur als authentifizierter Blob-Abruf über den Partnerpfad, nie als Link mit Token", () => {
  const bereich = ohneKommentare(read("components/partner/PartnerCreditNotesPanel.jsx"));
  assert.match(bereich, /downloadDocument\(partnerCreditNotePdfPath\(cn\.id\), \{/);
  assert.match(bereich, /message: creditNoteDownloadMessage,/);
  assert.doesNotMatch(bereich, /href=|token|ce_token|window\.open|apiFetch|\bfetch\(/,
    "kein Link, kein Token in einer Adresse, kein eigener Abruf");
  // Gezeigt werden nur Partnerfelder — keine Adminangaben, keine Steuer- oder Bankdaten.
  assert.doesNotMatch(bereich, /issuedByName|paidReference|cancellationReason|notifiedAt|iban/i);

  const api = ohneKommentare(read("api/partnerApi.js"));
  assert.match(api, /return `\/api\/sales-partner\/me\/credit-notes\/\$\{encodeURIComponent\(String\(creditNoteId\)\)\}\/pdf`;/);
  assert.match(api, /apiFetch\("\/api\/sales-partner\/me\/credit-notes", \{ auth: true, signal \}\)/);
  // Der gemeinsame Abruf prüft den Pfad und hängt das Token nur als Kopfzeile an.
  const abruf = read("utils/downloadDocument.js");
  assert.match(abruf, /if \(!isSafeApiPath\(downloadPath\)\) throw new Error\(texte\.allgemein\);/);
  assert.match(abruf, /apiFetch\(downloadPath\.trim\(\), \{ auth: true \}\)/);
});

/* ══════════ Pre-Live: Testgutschriften ═══════════════════════════════════ */

test("Pre-Live — Testgutschrift: Kennzeichnung nur bei exakt true, eigene Auszahlungstexte", () => {
  const basis = { id: 21, number: "CE-TEST-PG26-0001", kind: "regular", periodMonth: "2026-09", currency: "EUR",
    netCents: 1000, taxCents: 0, grossCents: 1000, documentReady: true, payoutStatus: "open", cancelled: false };
  const test = normalizeCreditNote({ ...basis, isTest: true });
  assert.equal(test.isTest, true);
  assert.equal(normalizeCreditNote({ ...basis, isTest: "true" }).isTest, false, "kein truthy-String");
  assert.equal(normalizeCreditNote(basis).isTest, false);
  assert.equal(CREDIT_NOTE_TEXTS.testDocument, "TESTDOKUMENT – nicht steuerlich gültig");
  assert.equal(payoutText(test), "Test – nicht ausgezahlt");
  assert.equal(payoutText({ ...test, payoutStatus: "paid", paidOn: "2026-10-04" }), "Test – ausgezahlt");
  assert.equal(payoutText({ ...test, cancelled: true }), "—", "stornierte, nie ausgezahlte Testgutschrift");
  assert.equal(payoutText({ ...test, kind: "cancellation", payoutStatus: null }), "—");
  // Echte Gutschriften bleiben unverändert.
  assert.equal(payoutText(normalizeCreditNote(basis)), "Noch nicht ausgezahlt");
  assert.equal(payoutText(normalizeCreditNote({ ...basis, payoutStatus: "paid", paidOn: "2026-10-04" })), "Ausgezahlt am 04.10.2026");
  // Auch die Adminform trägt die Kennzeichnung.
  assert.equal(normalizeCreditNotes({ creditNotes: [{ ...basis, isTest: true }] }, { admin: true }).creditNotes[0].isTest, true);
});
