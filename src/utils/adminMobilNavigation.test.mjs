// Run: node --test src/utils/adminMobilNavigation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_TABS, aktiverAdminTab, adminLeistenTitel } from "./adminMobilNavigation.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("1 — D4: vier Hauptbereiche plus „Mehr“, Ziele aus der bestehenden Navigation", () => {
  assert.deepEqual(ADMIN_TABS.map((t) => t.label), ["Übersicht", "Sendungen", "Kunden", "Rechnungen"]);
  const sidebar = read("../components/layout/AdminSidebar.jsx");
  for (const t of ADMIN_TABS) assert.ok(sidebar.includes(`to: "${t.to}"`), `${t.to} fehlt in der Seitenleiste`);
});

test("2 — aktiver Eintrag folgt dem Pfad (Details zählen zum Bereich, Vorschau-PDFs zu „Mehr“)", () => {
  assert.equal(aktiverAdminTab("/admin"), "uebersicht");
  assert.equal(aktiverAdminTab("/admin/"), "uebersicht");
  assert.equal(aktiverAdminTab("/admin/shipments/42"), "sendungen");
  assert.equal(aktiverAdminTab("/admin/users/7"), "kunden");
  assert.equal(aktiverAdminTab("/admin/invoices/9"), "rechnungen");
  assert.equal(aktiverAdminTab("/admin/invoices/backfill"), "mehr");
  assert.equal(aktiverAdminTab("/admin/partners/3"), "mehr");
  assert.equal(aktiverAdminTab("/admin/sicherheit"), "mehr");
  assert.equal(aktiverAdminTab("/admin/suche"), null, "die Suche hat ihren Platz oben");
  assert.equal(aktiverAdminTab("/admin/usersx"), "mehr", "kein Präfixtreffer über Wortgrenzen");
});

test("3 — Titel der oberen Leiste", () => {
  assert.equal(adminLeistenTitel("/admin"), "Übersicht");
  assert.equal(adminLeistenTitel("/admin/invoices/backfill"), "Vorschau-PDFs");
  assert.equal(adminLeistenTitel("/admin/invoices/12"), "Rechnungen");
  assert.equal(adminLeistenTitel("/admin/suche"), "Suche");
  assert.equal(adminLeistenTitel("/admin/unbekannt"), "Adminbereich");
});

test("4 — Layout: Leiste mit „Mehr“ als Drawer-Auslöser, Suche oben, Step-up und Passkey-Pflicht eingehängt", () => {
  const layout = read("../components/layout/AdminLayout.jsx");
  assert.match(layout, /className="adm-tabs"/);
  assert.match(layout, /aria-controls=\{ADMIN_NAV_ID\}/);
  assert.match(layout, /aria-expanded=\{sidebarOpen\}/);
  assert.match(layout, /to=\{ADMIN_SUCHE_PFAD\}/);
  assert.match(layout, /<StepUpBestaetigung \/>/);
  assert.match(layout, /setPasskeySetupHandler\(/);
  assert.match(layout, /setPasskeySetupHandler\(null\)/, "der Handler wird beim Verlassen abgemeldet");
  assert.match(layout, /offlineText=\{APP_NOTICE_TEXT\.offlineAdmin\}/);
});
