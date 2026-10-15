import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "App.jsx"), "utf8");
const nav = fs.readFileSync(path.join(ROOT, "components/layout/AdminSidebar.jsx"), "utf8");
const backfill = fs.readFileSync(path.join(ROOT, "pages/admin/AdminBackfillPage.jsx"), "utf8");
const api = fs.readFileSync(path.join(ROOT, "api/adminApi.js"), "utf8");
const page = fs.readFileSync(path.join(ROOT, "pages/admin/AdminLegalDraftsPage.jsx"), "utf8");

test("Rechtstextvorschau ist nur im AdminRoute-Routenblock", () => {
  const protectedStart = src.indexOf('<Route element={<AdminRoute><AdminLayout /></AdminRoute>}>');
  const protectedEnd = src.indexOf("</Route>", src.indexOf('path="/admin/audit-logs"', protectedStart));
  const pos = src.indexOf('path="/admin/legal-drafts"');
  assert.ok(protectedStart !== -1 && pos > protectedStart && pos < protectedEnd);
});
test("Entwuerfe werden nur vom authentifizierten Admin-API-Endpunkt gelesen", () => {
  assert.match(api, /apiFetch\("\/admin\/legal-drafts", \{ auth: true \}\)/);
  assert.match(api, /apiFetch\("\/admin\/legal-drafts\/" \+ encodeURIComponent\(id\), \{ auth: true \}\)/);
});
test("Einstieg über die Seite „Interne Vorschau-PDFs“, KEIN weiterer Sidebar-Eintrag (Höhenbudget 1440 × 900)", () => {
  assert.match(backfill, /to="\/admin\/legal-drafts"/);
  assert.doesNotMatch(nav, /legal-drafts/);
});
test("Entwurf ist sichtbar gekennzeichnet; keine HTML-Rohinjektion", () => {
  assert.match(page, /ENTWURF – nicht veröffentlicht/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  // Gesetzt mit dem gemeinsamen Renderer der Rechtsseiten — kein zweiter Markdown-Parser.
  assert.match(page, /from "\.\.\/\.\.\/components\/legal\/LegalMarkdown"/);
  assert.doesNotMatch(page, /function MarkdownPreview/);
  assert.match(page, /getAdminLegalDraft/);
});
