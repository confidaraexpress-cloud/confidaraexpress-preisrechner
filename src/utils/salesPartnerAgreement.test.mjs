// Vertriebspartnervereinbarung — Fassung, Gültigkeit, Dokumentpfad, Zustimmung
// nur zur registrierten Fassung, Verdrahtung der Seite /partnervereinbarung.
//
// Run: node --test src/utils/salesPartnerAgreement.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  AGREEMENT_TEXTS,
  agreementDocumentPath,
  agreementValidityLabel,
  agreementVersionLabel,
  formatDateTime,
  normalizeAgreement,
  normalizePartnerAgreement,
  partnerAgreementDocumentPath,
  partnerAgreementRows,
  readAgreementResponse,
} from "./salesPartnerAgreement.mjs";
import { parseSalesPartnerPublicConfig, partnerRegistrationOpen } from "./salesPartnerPublicConfig.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const FASSUNG = {
  title: "Vertriebspartnervereinbarung", version: "1.0", effectiveFrom: "2026-10-01", effectiveTo: null,
  documentPath: "/api/legal/sales_partner_agreement/1.0",
};

/* ══════════ Fassung und Dokumentpfad ════════════════════════════════════ */

test("1 — eine Fassung braucht eine Version; der Pfad muss auf diese API zeigen", () => {
  assert.deepEqual(normalizeAgreement(FASSUNG), {
    version: "1.0", effectiveFrom: "2026-10-01", effectiveTo: null, documentPath: "/api/legal/sales_partner_agreement/1.0",
  });
  for (const kaputt of [null, undefined, "1.0", [], {}, { version: "" }, { version: 1 }]) {
    assert.equal(normalizeAgreement(kaputt), null, `${JSON.stringify(kaputt)} als Fassung gelesen`);
  }
  // Kein Link auf einen fremden Host, kein Skript, kein gebastelter Pfad.
  for (const fremd of ["https://evil.example/v.pdf", "//evil.example/v.pdf", "javascript:alert(1)",
                       "api/legal/x", "/api/legal/a b.pdf", "/api/\"x", "", null, 7]) {
    assert.equal(agreementDocumentPath(fremd), null, `${JSON.stringify(fremd)} durchgelassen`);
    assert.equal(normalizeAgreement({ ...FASSUNG, documentPath: fremd }).documentPath, null);
  }
  assert.equal(agreementDocumentPath(" /api/legal/sales_partner_agreement/1.0 "), "/api/legal/sales_partner_agreement/1.0");
});

test("2 — `agreement: null` heißt „keine Fassung“, eine unlesbare Antwort ist ein Ladefehler", () => {
  assert.deepEqual(readAgreementResponse({ agreement: null }), { ok: true, agreement: null });
  assert.equal(readAgreementResponse({ agreement: FASSUNG }).agreement.version, "1.0");
  for (const kaputt of [null, "x", [], {}, { agreement: {} }, { agreement: { version: "" } }, { agreement: "1.0" }]) {
    assert.deepEqual(readAgreementResponse(kaputt), { ok: false, agreement: null },
      `${JSON.stringify(kaputt)} darf nicht als „keine Fassung“ erscheinen`);
  }
});

/* ══════════ Beschriftungen ══════════════════════════════════════════════ */

test("3 — Fassung und Gültigkeit: TT.MM.JJJJ ohne Datumsobjekt, Unlesbares entfällt", () => {
  assert.equal(agreementVersionLabel("1.0"), "Fassung 1.0");
  assert.equal(agreementVersionLabel(" 2026-10 "), "Fassung 2026-10");
  assert.equal(agreementVersionLabel(null), "—");
  assert.equal(agreementValidityLabel(normalizeAgreement(FASSUNG)), "Gültig ab 01.10.2026");
  assert.equal(agreementValidityLabel({ effectiveFrom: "2026-10-01", effectiveTo: "2026-12-31" }), "Gültig ab 01.10.2026 bis 31.12.2026");
  assert.equal(agreementValidityLabel({ effectiveFrom: null, effectiveTo: "2026-12-31" }), "Gültig bis 31.12.2026");
  // Ein Zeitstempel ist kein Tag — es wird nichts aus ihm geschätzt.
  assert.equal(agreementValidityLabel({ effectiveFrom: "2026-09-30T22:00:00.000Z" }), null);
  assert.equal(agreementValidityLabel(null), null);
  assert.equal(AGREEMENT_TEXTS.none, "Derzeit ist keine Fassung der Vertriebspartnervereinbarung veröffentlicht.");
  assert.equal(AGREEMENT_TEXTS.noDocument, "Für diese Fassung ist kein registriertes Dokument hinterlegt.");
  assert.equal(AGREEMENT_TEXTS.open, "Dokument öffnen");
});

test("4 — Zeitpunkte: Systemregion, nie „Invalid Date“", () => {
  const iso = "2026-10-01T09:30:00.000Z";
  const erwartet = new Date(iso).toLocaleString("de-DE",
    { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  assert.equal(formatDateTime(iso), erwartet);
  assert.match(formatDateTime(iso), /^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  assert.equal(formatDateTime("2026-10-01"), "01.10.2026", "ein Tag bleibt ein Tag");
  for (const kaputt of [null, "", "kein datum", 12, {}]) assert.equal(formatDateTime(kaputt), "—");
});

/* ══════════ Partnerportal · Konto · Vertrag ═════════════════════════════ */

test("5 — Vertrag im Konto: akzeptierte Fassung, Zeitpunkt, genau der Dokumentpfad des Servers", () => {
  const a = normalizePartnerAgreement({
    acceptedVersion: "1.0", acceptedAt: "2026-10-01T09:30:00.000Z",
    document: { version: "1.0", effectiveFrom: "2026-10-01", documentPath: "/api/legal/sales_partner_agreement/1.0" },
  });
  const zeilen = Object.fromEntries(partnerAgreementRows(a).map((z) => [z.key, z]));
  assert.equal(zeilen.agreement.v, "Vertriebspartnervereinbarung");
  assert.equal(zeilen.version.v, "Fassung 1.0");
  assert.equal(zeilen.acceptedAt.v, formatDateTime("2026-10-01T09:30:00.000Z"));
  assert.equal(partnerAgreementDocumentPath(a), "/api/legal/sales_partner_agreement/1.0");

  // Ohne Dokument (oder mit fremdem Pfad) gibt es keinen Link.
  assert.equal(partnerAgreementDocumentPath(normalizePartnerAgreement({ acceptedVersion: "1.0", document: null })), null);
  assert.equal(partnerAgreementDocumentPath(normalizePartnerAgreement({
    acceptedVersion: "1.0", document: { version: "1.0", documentPath: "https://evil.example/x.pdf" } })), null);

  const leer = Object.fromEntries(partnerAgreementRows(normalizePartnerAgreement({})).map((z) => [z.key, z]));
  assert.deepEqual([leer.version.v, leer.version.empty], ["Nicht hinterlegt", true]);
  assert.deepEqual([leer.acceptedAt.v, leer.acceptedAt.empty], ["Nicht hinterlegt", true]);
});

/* ══════════ Zustimmung nur zur registrierten Fassung ════════════════════ */

test("6 — die Registrierung öffnet nur mit genau der registrierten Fassung und ihrem Dokument", () => {
  const offen = (extra) => partnerRegistrationOpen(parseSalesPartnerPublicConfig({
    registrationEnabled: true, agreementVersion: "1.0", agreement: FASSUNG, ...extra,
  }));
  assert.equal(offen({}), true);
  assert.equal(offen({ registrationEnabled: "true" }), false, "String \"true\" ist keine Freigabe");
  assert.equal(offen({ registrationEnabled: false }), false);
  assert.equal(offen({ agreement: null }), false, "keine veröffentlichte Fassung");
  assert.equal(offen({ agreementVersion: "0.9" }), false, "zugestimmt würde einer anderen Fassung");
  assert.equal(offen({ agreementVersion: null }), false);
  assert.equal(offen({ agreement: { ...FASSUNG, documentPath: null } }), false, "Dokument nicht verlinkbar");
  assert.equal(offen({ agreement: { ...FASSUNG, documentPath: "https://evil.example/v.pdf" } }), false);
});

/* ══════════ Verdrahtung ═════════════════════════════════════════════════ */

test("7 — /partnervereinbarung: öffentliche Route im Rechtslayout, Dokument nur als Link im neuen Tab", () => {
  const app = ohneKommentare(read("App.jsx"));
  const oeffentlich = app.slice(app.indexOf("<Route element={<NavbarLayout />}>"));
  const block = oeffentlich.slice(0, oeffentlich.indexOf("</Route>"));
  assert.match(block, /<Route path="\/partnervereinbarung" element=\{<PartnerAgreementPage \/>\} \/>/,
    "die Seite gehört in das öffentliche Rechtslayout");
  assert.match(app, /const PartnerAgreementPage = React\.lazy\(\(\) => import\("\.\/pages\/PartnerAgreementPage"\)\);/);

  const seite = ohneKommentare(read("pages/PartnerAgreementPage.jsx"));
  assert.match(seite, /className="legal-wrap"/);
  assert.match(seite, /className="legal-sheet"/);
  assert.match(seite, /readAgreementResponse\(d\)/);
  assert.match(seite, /agreementDocumentUrl\(agreement\.documentPath\)/);
  assert.match(seite, /target=\{EXTERNAL_LINK_TARGET\} rel=\{EXTERNAL_LINK_REL\}/);
  // Kein Vertragstext, keine Einbettung, kein HTML aus einer Antwort.
  assert.doesNotMatch(seite, /<iframe|<embed|<object|dangerouslySetInnerHTML|§/);
  assert.doesNotMatch(seite, /fetch\(|apiFetch/, "der Abruf läuft über api/partnerApi.js");

  const api = ohneKommentare(read("api/partnerApi.js"));
  const abruf = api.slice(api.indexOf("export function getSalesPartnerAgreement"));
  assert.match(abruf.slice(0, abruf.indexOf("\n}")), /apiFetch\("\/api\/sales-partner\/agreement", \{ timeoutMs: 15000, signal \}\)/,
    "öffentlich: ohne auth, damit ein 401 nie abmeldet");
  assert.match(api, /const pfad = agreementDocumentPath\(documentPath\);\s*return pfad \? `\$\{API\}\$\{pfad\}` : null;/);
});
