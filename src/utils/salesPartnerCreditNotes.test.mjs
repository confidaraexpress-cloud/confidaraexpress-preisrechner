// Gutschriften der Vertriebspartner — offener Saldo, Auszahlung, Korrekturen,
// Normalisierung (Partner ohne Adminfelder), PDF-Abruf und Verdrahtung des
// Bereichs „Abrechnungen".
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

test("1 — Hinweis zum abrechnungsreifen Saldo: Vortrag, nächste Gutschrift oder nichts", () => {
  assert.equal(openSettlementHint({ readyNetCents: -500, readyEntryCount: 2, carriedForward: true }),
    "Ihr aktueller abrechnungsreifer Saldo ist nicht positiv und wird in die nächste Abrechnung übertragen.");
  assert.equal(openSettlementHint({ readyNetCents: 12345, readyEntryCount: 3, carriedForward: false }),
    `Abrechnungsreife Provisionen von ${euro(123.45)} werden mit der nächsten Gutschrift abgerechnet.`);
  assert.equal(openSettlementHint({ readyNetCents: 0, readyEntryCount: 0, carriedForward: false }), null);
  // Ohne lesbaren Betrag kein Satz mit erfundener Zahl.
  assert.equal(openSettlementHint({ readyNetCents: null, readyEntryCount: 3, carriedForward: false }), null);
  assert.equal(openSettlementHint(null), null);
  assert.equal(CREDIT_NOTE_TEXTS.settlementNote, "Provision wird nach Zahlungseingang des Kunden abrechnungsreif.");
  assert.equal(CREDIT_NOTE_TEXTS.empty, "Noch keine Gutschriften.");
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

test("7 — „Abrechnungen“ steht zwischen Provisionen und Team; das Portal rendert den Bereich", () => {
  const ids = PARTNER_TABS.map((t) => t.id);
  assert.deepEqual(ids, ["overview", "customers", "commissions", "credit-notes", "team", "account"]);
  assert.equal(PARTNER_TABS.find((t) => t.id === "credit-notes").label, "Abrechnungen");
  const seite = ohneKommentare(read("pages/PartnerPortalPage.jsx"));
  assert.match(seite, /\{aktiv === "credit-notes" && <PartnerCreditNotesPanel \/>\}/);
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
