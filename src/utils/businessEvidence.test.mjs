// Unternehmerprüfung im Admin-Kundendetail (Go-Live Paket C) — reine Auswertung und Regeln.
// Ausführen: node --test src/utils/businessEvidence.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_EVIDENCE_TEXTS as T,
  VERIFICATION_METHOD_OPTIONS,
  VERIFICATION_NOTE_MAX,
  businessDeclarationLine,
  methodLabelOf,
  parseVerificationDraft,
  selectBusinessEvidence,
  termsDeclarationLine,
  termsDeclarationParts,
  verificationLine,
} from "./businessEvidence.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

const ANTWORT = {
  userId: 7,
  declarations: {
    businessCustomer: { declaredAt: "2026-10-14T08:15:00Z" },
    terms: { acknowledgedAt: "2026-10-14T08:15:00Z", version: "2026-08" },
  },
  verifications: [
    { id: 2, method: "vat_id", methodLabel: "USt-IdNr. geprüft", note: null, verifiedAt: "2026-10-14T09:00:00Z", verifiedBy: { id: 1, name: "Anna Admin" } },
    { id: 1, method: "trade_registration", methodLabel: "Gewerbeanmeldung geprüft", note: "Gewerbeanmeldung vom 01.03.2026", verifiedAt: "2026-10-14T08:30:00Z", verifiedBy: null },
  ],
};

test("1 — Nachweisarten: abschließend, wortgleich zum Backend", () => {
  assert.deepEqual(VERIFICATION_METHOD_OPTIONS.map((o) => o.value),
    ["vat_id", "commercial_register", "trade_registration", "other_document"]);
  assert.equal(methodLabelOf("vat_id"), "USt-IdNr. geprüft");
  assert.equal(methodLabelOf("ausweis"), "Unbekannte Nachweisart");
});

test("2 — Serverantwort: Erklärungen und Vermerke, neueste zuerst bleibt erhalten", () => {
  const e = selectBusinessEvidence(200, ANTWORT);
  assert.deepEqual(e.declarations.terms, { acknowledgedAt: "2026-10-14T08:15:00Z", version: "2026-08" });
  assert.deepEqual(e.verifications.map((v) => v.method), ["vat_id", "trade_registration"]);
  assert.equal(e.verifications[0].verifiedByName, "Anna Admin");
  assert.equal(e.verifications[1].verifiedByName, null);
  assert.equal(selectBusinessEvidence(404, ANTWORT), null);
  assert.equal(selectBusinessEvidence(200, null), null);
});

test("3 — fehlende Erklärung ist „nicht erfasst\", nie eine vermutete", () => {
  const leer = selectBusinessEvidence(200, { declarations: { businessCustomer: null, terms: null }, verifications: [] });
  assert.equal(businessDeclarationLine(leer), T.notRecorded);
  assert.equal(termsDeclarationLine(leer), T.notRecorded);
  assert.equal(verificationLine(null), T.notChecked);
  const ohneFassung = selectBusinessEvidence(200, { declarations: { terms: { acknowledgedAt: "2026-10-14T08:15:00Z", version: null } } });
  assert.match(termsDeclarationLine(ohneFassung), /Fassung nicht belegt/);
  const voll = selectBusinessEvidence(200, ANTWORT);
  assert.match(businessDeclarationLine(voll), /^Abgegeben am 14\.10\.2026/);
  assert.match(termsDeclarationLine(voll), /\(Fassung 2026-08\)$/);
  assert.match(verificationLine(voll.verifications[0]), /^USt-IdNr\. geprüft, 14\.10\.2026.* durch Anna Admin$/);
  // Die Ansicht setzt die Fassung als eigenen, nicht umbrechenden Teil — derselbe Text.
  const teile = termsDeclarationParts(voll);
  assert.equal(teile.version, "Fassung 2026-08");
  assert.equal(`${teile.confirmed} (${teile.version})`, termsDeclarationLine(voll));
  assert.equal(termsDeclarationParts(leer), null);
  assert.match(read("../components/admin/CustomerBusinessEvidenceSection.jsx"), /<span className="adm-nowrap">\(\{agb\.version\}\)<\/span>/);
});

test("4 — Entwurf einer Prüfung: dieselben Regeln wie der Server", () => {
  assert.deepEqual(parseVerificationDraft({ method: "" }), { ok: false, field: "method", error: T.methodRequired });
  assert.deepEqual(parseVerificationDraft({ method: "other_document", note: "  " }), { ok: false, field: "note", error: T.noteRequired });
  assert.equal(parseVerificationDraft({ method: "vat_id", note: "x".repeat(VERIFICATION_NOTE_MAX + 1) }).field, "note");
  assert.deepEqual(parseVerificationDraft({ method: "vat_id", note: "" }), { ok: true, body: { method: "vat_id" } });
  assert.deepEqual(parseVerificationDraft({ method: "trade_registration", note: " Gewerbeanmeldung \n vom 01.03.2026 " }),
    { ok: true, body: { method: "trade_registration", note: "Gewerbeanmeldung vom 01.03.2026" } });
});

test("5 — die Sektion ist selbstladend, ohne Gate und nur für Kundenkonten eingebunden", () => {
  const sektion = read("../components/admin/CustomerBusinessEvidenceSection.jsx");
  const seite = read("../pages/admin/AdminUserDetailPage.jsx");
  assert.match(sektion, /getAdminUserBusinessEvidence\(userId\)/);
  assert.match(sektion, /addAdminUserBusinessVerification\(userId, p\.body\)/);
  assert.match(seite, /roleOf\(u\) !== "admin" && roleOf\(u\) !== "sales_partner" && \(\s*<CustomerBusinessEvidenceSection userId=\{idOf\(u\)\} \/>/);
  // Kein Gate: die Freischaltung kennt die Prüfung nicht.
  const freischaltung = read("../components/admin/CustomerApprovalCard.jsx");
  assert.ok(!/businessEvidence|BusinessEvidence|verification/i.test(freischaltung),
    "die Freischaltung hängt an der Unternehmerprüfung — das wäre eine neue Produktregel");
});

test("Paket D — Konto ohne USt-IdNr.: Kennzeichen, Rechtsform und ob ein Nachweis vor der Freischaltung fehlt", async () => {
  const { evidenceGateHint } = await import("./businessEvidence.mjs");
  const fehlt = selectBusinessEvidence(200, { ...ANTWORT, vatIdAbsent: true, legalFormLabel: "Einzelunternehmen", verificationRequired: true });
  assert.deepEqual([fehlt.vatIdAbsent, fehlt.legalFormLabel, fehlt.verificationRequired], [true, "Einzelunternehmen", true]);
  assert.match(evidenceGateHint(fehlt), /^Dieses Konto wurde ohne USt-IdNr\. registriert \(Rechtsform: Einzelunternehmen\)\. Vor der Freischaltung/);
  const belegt = selectBusinessEvidence(200, { ...ANTWORT, vatIdAbsent: true, legalFormLabel: "GbR", verificationRequired: false });
  assert.equal(belegt.verificationRequired, false);
  assert.match(evidenceGateHint(belegt), /Ein Unternehmernachweis ist festgehalten/);
  // Nur das JSON-Boolean zählt; ohne Kennzeichen gilt der bisherige Hinweis.
  const alt = selectBusinessEvidence(200, { ...ANTWORT, vatIdAbsent: "true", verificationRequired: "true" });
  assert.deepEqual([alt.vatIdAbsent, alt.verificationRequired, alt.legalFormLabel], [false, false, null]);
  assert.equal(evidenceGateHint(alt), T.gateHint);
  assert.equal(evidenceGateHint(null), T.gateHint);
});
