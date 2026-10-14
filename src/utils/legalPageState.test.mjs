import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LEGACY_PAGE_VERSIONS, legalVersionLine, readLegalContent, readLegalCurrent, safeContentPath,
} from "./legalPageState.mjs";
import { normalizeAgreement } from "./salesPartnerAgreement.mjs";

const SRC = path.resolve(import.meta.dirname, "..");
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");
const set = (docs) => ({ setId: 1, setKey: "S", documents: docs });

test("1 — Webfassung der aktiven Fassung → content (nur Pfad auf diese API und diesen Typ)", () => {
  const s = readLegalCurrent(200, set([
    { type: "terms", version: "2026-12", url: "/api/legal/terms/2026-12", contentPath: "/api/legal/terms/2026-12/inhalt" },
    { type: "privacy", version: "2026-07", url: "/api/legal/privacy/2026-07" },
  ]), "terms");
  assert.deepEqual(s, { mode: "content", version: "2026-12", documentPath: "/api/legal/terms/2026-12", contentPath: "/api/legal/terms/2026-12/inhalt" });
  for (const fremd of ["https://evil.example/x/inhalt", "//evil/api/legal/terms/x/inhalt", "/api/legal/privacy/2026-12/inhalt", "/api/legal/terms/2026-12"]) {
    assert.equal(safeContentPath(fremd, "terms"), null, fremd);
  }
});

test("2 — heutige Fassung ohne Webfassung → bisherige Seite (AGB 2026-08, Datenschutz 2026-07)", () => {
  assert.deepEqual(LEGACY_PAGE_VERSIONS, { terms: "2026-08", privacy: "2026-07" });
  const body = set([{ type: "terms", version: "2026-08", url: "/api/legal/terms/2026-08" }, { type: "privacy", version: "2026-07", url: "/api/legal/privacy/2026-07" }]);
  assert.equal(readLegalCurrent(200, body, "terms").mode, "legacy");
  assert.equal(readLegalCurrent(200, body, "privacy").mode, "legacy");
});

test("3 — ANDERE Fassung aktiv, aber ohne Webfassung → nur PDF, NIE der alte Seitentext", () => {
  const s = readLegalCurrent(200, set([{ type: "terms", version: "2026-12", url: "/api/legal/terms/2026-12" }]), "terms");
  assert.deepEqual(s, { mode: "pdf", version: "2026-12", documentPath: "/api/legal/terms/2026-12", contentPath: null });
});

test("4 — Registry nicht eingerichtet (503 NOT_CONFIGURED) → bisherige Seite; alles andere → Fehler", () => {
  assert.equal(readLegalCurrent(503, { code: "LEGAL_DOCUMENTS_NOT_CONFIGURED" }, "terms").mode, "legacy");
  for (const [st, b] of [[500, {}], [503, { code: "ANDERS" }], [200, {}], [200, set([])], [429, null], [200, set([{ type: "terms" }])]]) {
    assert.equal(readLegalCurrent(st, b, "terms").mode, "error", JSON.stringify([st, b]));
  }
});

test("5 — Webfassung: muss zur aktiven Fassung gehören und mit einem Titel beginnen", () => {
  const ok = readLegalContent(200, { version: "2026-12", effectiveFrom: "2026-12-01", markdown: "# AGB\n\nText", documentPath: "/api/legal/terms/2026-12" }, "2026-12");
  assert.equal(ok.ok, true);
  assert.equal(ok.markdown, "# AGB\n\nText");
  assert.equal(readLegalContent(200, { version: "2026-11", markdown: "# AGB" }, "2026-12").ok, false, "andere Fassung");
  assert.equal(readLegalContent(200, { version: "2026-12", markdown: "<h1>x</h1>" }, "2026-12").ok, false);
  assert.equal(readLegalContent(404, { markdown: "# AGB" }, null).ok, false);
});

test("6 — Fassungszeile", () => {
  assert.equal(legalVersionLine({ version: "2026-12", effectiveFrom: "2026-12-01" }), "Fassung 2026-12 · gültig ab 01.12.2026");
  assert.equal(legalVersionLine({ version: "1.0", effectiveFrom: null }), "Fassung 1.0");
  assert.equal(legalVersionLine({}), null);
});

test("7 — Partnervereinbarung: contentPath nur, wenn der Server ihn nennt und er passt", () => {
  const ohne = normalizeAgreement({ version: "1.0", effectiveFrom: "2026-10-01", documentPath: "/api/legal/sales_partner_agreement/1.0" });
  assert.ok(!("contentPath" in ohne), "bisherige Form unverändert");
  const mit = normalizeAgreement({ version: "1.0", documentPath: "/api/legal/sales_partner_agreement/1.0", contentPath: "/api/legal/sales_partner_agreement/1.0/inhalt" });
  assert.equal(mit.contentPath, "/api/legal/sales_partner_agreement/1.0/inhalt");
  assert.ok(!("contentPath" in normalizeAgreement({ version: "1.0", contentPath: "https://x.example/inhalt" })));
});

test("8 — Verdrahtung: /agb und /datenschutz folgen der Registry, die bisherigen Fassungen bleiben wortgleich erhalten", () => {
  const agb = read("pages/AGBPage.jsx");
  assert.match(agb, /<RegistryLegalPage documentType="terms"[^>]*legacy=\{AgbFassung202608\}/);
  assert.match(agb, /function AgbFassung202608\(\)/);
  assert.match(agb, /Stand: August 2026/);
  const ds = read("pages/DatenschutzPage.jsx");
  assert.match(ds, /<RegistryLegalPage documentType="privacy"[^>]*legacy=\{DatenschutzFassung202607\}/);
  assert.match(ds, /Stand: Juli 2026/);
  for (const f of ["components/legal/LegalMarkdown.jsx", "components/legal/LegalDocumentView.jsx", "components/legal/RegistryLegalPage.jsx", "pages/LegalPreviewPage.jsx"]) {
    assert.doesNotMatch(read(f), /dangerouslySetInnerHTML|\.innerHTML\s*=/, f);
  }
});

test("9 — Seitenvorschau: nur hinter AdminRoute, nur aus den Admin-Endpunkten, dieselbe Komponente wie /agb", () => {
  const app = read("App.jsx");
  assert.match(app, /<Route path="\/vorschau\/rechtstexte\/:seite" element=\{<AdminRoute><LegalPreviewPage \/><\/AdminRoute>\} \/>/);
  const api = read("api/adminApi.js");
  for (const re of [/apiFetch\("\/admin\/legal-publications", \{ auth: true \}\)/, /"\/admin\/legal-publications\/" \+ encodeURIComponent\(id\), \{ auth: true \}/]) assert.match(api, re);
  const seite = read("pages/LegalPreviewPage.jsx");
  assert.match(seite, /<LegalDocumentView/);
  assert.match(seite, /ENTWURF/);
  assert.match(read("pages/admin/AdminBackfillPage.jsx"), /to="\/vorschau\/rechtstexte\/agb"/);
  assert.doesNotMatch(read("components/layout/AdminSidebar.jsx"), /rechtstexte|legal-drafts/, "kein Sidebar-Eintrag");
});
