// Protokoll (Audit-Logs) — Zuordnung von Ausführenden und Betroffenen (UX-Paket 1):
// der Name aus `target_user` kommt an, Sendung und Rechnung erscheinen, keine
// Aktion des Vertriebspartnerprogramms bleibt als Rohwert stehen.
//
// Run: node --test src/utils/auditLogView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { auditParty, auditTargets } from "./auditLogView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");

// Genau die Form von GET /admin/audit-logs (routes/admin/auditLogs.js).
const ZEILE = {
  id: 9, created_at: "2026-10-07T10:00:00Z", action: "sales_partner.commission_adjustment", result: "success",
  actor_user_id: 1, actor: { id: 1, name: "Anna Admin" },
  target_user_id: 42, target_user: { id: 42, name: "Petra Partner" },
  target_shipment_id: 77, target_invoice_id: null, metadata: {},
};

test("1 — Betroffene: Konto mit Namen aus target_user, dazu Sendung bzw. Rechnung", () => {
  assert.deepEqual(auditTargets(ZEILE), [
    { id: 42, name: "Petra Partner", type: null },
    { id: 77, name: "Sendung", type: null },
  ]);
  assert.deepEqual(auditTargets({ target_invoice_id: 5 }), [{ id: 5, name: "Rechnung", type: null }]);
  assert.deepEqual(auditTargets({ target_user_id: 7, target_user: null }), [{ id: 7, name: null, type: null }],
    "ohne Namen (z. B. gelöschtes Konto) bleibt die Kennung");
  assert.deepEqual(auditTargets({}), []);
  assert.deepEqual(auditTargets(null), []);
});

test("2 — Ausführende: actor-Objekt, sonst actor_user_id; ältere Formen bleiben lesbar", () => {
  assert.deepEqual(auditParty(ZEILE, "actor"), { id: 1, name: "Anna Admin", type: null });
  assert.deepEqual(auditParty({ actor_user_id: 3 }, "actor"), { id: 3, name: null, type: null });
  assert.deepEqual(auditParty({ target: { id: 8, name: "Alt" } }, "target"), { id: 8, name: "Alt", type: null });
  assert.deepEqual(auditParty({ target_name: "Nur Name" }, "target"), { id: null, name: "Nur Name", type: null });
  // Nie ein ganzes Objekt: E-Mail oder IP eines Objekts gelangen nicht in die Anzeige.
  const party = auditParty({ target_user: { id: 4, name: "X", email: "x@example.com", ip: "203.0.113.5" } }, "target");
  assert.deepEqual(Object.keys(party).sort(), ["id", "name", "type"]);
});

test("3 — jede Aktion des Partnerprogramms hat ein deutsches Label; die Seite nutzt die Zuordnung", () => {
  const seite = read("pages/admin/AuditLogPage.jsx");
  for (const aktion of [
    "sales_partner.billing_details_submitted", "sales_partner.billing_details_confirmed", "sales_partner.billing_details_rejected",
    "sales_partner.credit_note_issued", "sales_partner.credit_note_paid", "sales_partner.credit_note_cancelled",
    "sales_partner.credit_note_pdf_downloaded", "sales_partner.prelive_partner_created", "sales_partner.prelive_customer_created",
    "sales_partner.prelive_shipment_created", "sales_partner.prelive_shipment_paid", "sales_partner.prelive_scenario",
    "sales_partner.prelive_commission_run", "sales_partner.prelive_password_link", "sales_partner.prelive_cleanup",
  ]) {
    assert.match(seite, new RegExp(`"${aktion.replace(/\./g, "\\.")}": "[^"]+"`), `${aktion}: kein Label`);
  }
  assert.match(seite, /import \{ auditParty, auditTargets \} from "\.\.\/\.\.\/utils\/auditLogView\.mjs";/);
  assert.match(seite, /<td><Targets row=\{row\} \/><\/td>/);
  assert.doesNotMatch(seite, /partyOf\(row, "target"\)/, "die alte Zuordnung ohne target_user ist zurück");
});
