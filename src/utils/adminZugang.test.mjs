// Adminzugang im Kontodetail (Canonical v2.130): Aktion, Fehlerzuordnung und Einbindung.
// Run: node --test src/utils/adminZugang.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ADMIN_ZUGANG_TEXT, ADMIN_ZUGANG_FEHLER, istAdminkonto, adminZugangAktion, adminZugangFehler, adminZugangStatusText,
} from "./adminZugang.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("1 — Adminkonto nur bei exakt role admin", () => {
  assert.equal(istAdminkonto({ role: "admin" }), true);
  for (const k of [{ role: "Admin" }, { role: "customer" }, { role: "sales_partner" }, {}, null, undefined]) assert.equal(istAdminkonto(k), false);
});

test("2 — eine Aktion je Zustand; das eigene Konto ist gesperrt und nennt den Grund", () => {
  assert.deepEqual(adminZugangAktion("pending"), { ziel: "approved", label: "Adminzugang freischalten", gesperrt: false, grund: "" });
  assert.deepEqual(adminZugangAktion("approved"), { ziel: "blocked", label: "Adminzugang sperren", gesperrt: false, grund: "" });
  assert.deepEqual(adminZugangAktion("blocked"), { ziel: "approved", label: "Adminzugang entsperren", gesperrt: false, grund: "" });
  assert.equal(adminZugangAktion("anonymized").ziel, null);
  const eigen = adminZugangAktion("approved", { eigenesKonto: true });
  assert.equal(eigen.gesperrt, true);
  assert.equal(eigen.grund, ADMIN_ZUGANG_TEXT.eigenesKonto);
  assert.match(adminZugangStatusText("approved"), /volle Adminrechte/);
  assert.match(adminZugangStatusText("blocked"), /Historie bleibt erhalten/);
});

test("3 — Serverantworten → Text; nie ein Rohtext; 401/403 bleibt dem zentralen Handler", () => {
  for (const code of ["ADMIN_SELF_STATUS_CHANGE", "LAST_ADMIN_ACCOUNT", "ADMIN_STATUS_INVALID", "ADMIN_ACCOUNT_PROTECTED"]) {
    assert.equal(adminZugangFehler(409, { code, error: "roh" }), ADMIN_ZUGANG_FEHLER[code]);
  }
  assert.equal(adminZugangFehler(400, { code: "ADMIN_STATUS_INVALID" }), ADMIN_ZUGANG_FEHLER.ADMIN_STATUS_INVALID);
  assert.equal(adminZugangFehler(409, { error: "Serverrohtext" }), ADMIN_ZUGANG_FEHLER.standard);
  assert.equal(adminZugangFehler(429, null), ADMIN_ZUGANG_FEHLER[429]);
  assert.equal(adminZugangFehler(401, null), null);
  assert.equal(adminZugangFehler(403, null), null);
});

test("4 — Kontodetail: Adminkonto mit Karte „Adminzugang“, ohne Kundenfreischaltung und ohne Gefahrenzone", () => {
  const detail = ohneKommentare(lies("pages/admin/AdminUserDetailPage.jsx"));
  assert.match(detail, /const adminKonto = roleOf\(u\) === "admin";/);
  assert.match(detail, /\{adminKonto \? \(\s*<AdminZugangKarte kontoId=\{id\} status=\{statusOf\(u\)\} eigenesKonto=\{selfAccount\} onGeaendert=\{load\} \/>\s*\) : \(\s*<CustomerApprovalCard/);
  assert.match(detail, /\{!adminKonto && \(\s*<div className="adm-card adm-danger-zone">/);
  const karte = ohneKommentare(lies("components/admin/AdminZugangKarte.jsx"));
  assert.match(karte, /setAdminUserStatus\(kontoId, aktion\.ziel\)/);
  assert.match(karte, /<ConfirmDialog/, "jede Änderung mit Bestätigung");
  assert.match(karte, /disabled=\{laeuft \|\| aktion\.gesperrt\}/);
  assert.match(karte, /\{T\.schutz\}/);
  assert.doesNotMatch(karte, /deleteAdminUser|anonymizeAdminUser|price-markup|Aufschlag/);
});

test("5 — Auditprotokoll: deutsche Bezeichnungen der neuen Aktionen", () => {
  const seite = lies("pages/admin/AuditLogPage.jsx");
  for (const [aktion, label] of [
    ["auth.admin_login", "Admin-Anmeldung"], ["auth.admin_password_reset", "Admin-Passwort gesetzt"],
    ["admin.access_change", "Adminzugang geändert"], ["admin.account_created", "Adminkonto angelegt"],
    ["admin.password_link", "Einrichtungslink erzeugt"],
  ]) {
    assert.ok(seite.includes(`"${aktion}": "${label}"`), aktion);
  }
});
