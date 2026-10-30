// Admin: ConfidaraExpress-Betreuung im Kundendetail und in der Kundenliste (Canonical 1A, v2.90).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  AM_ADMIN_TEXT, AM_REASON_TEXT, listLine, reasonText, saveOutcome, savedText, selectAdminAccountManager,
} from "./adminAccountManagerView.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ANTWORT = {
  userId: 7,
  accountManager: {
    current: { key: "miguel", name: "Miguel Vance" }, assignedAt: "2026-10-30T09:00:00.000Z", applicable: true, reason: null,
    options: [{ key: "miguel", name: "Miguel Vance" }, { key: "patrick", name: "Patrick Werner" }],
    nextAutomatic: { key: "patrick", name: "Patrick Werner" },
  },
};

test("1 — GET: geprüfte Sicht; fehlende oder kaputte Antwort → null (Ladefehler statt erfundener Auswahl)", () => {
  const s = selectAdminAccountManager(200, ANTWORT);
  assert.deepEqual([s.current, s.assignedAt, s.applicable, s.reason, s.options.length, s.nextAutomatic],
    [{ key: "miguel", name: "Miguel Vance" }, "2026-10-30T09:00:00.000Z", true, null, 2, { key: "patrick", name: "Patrick Werner" }]);
  for (const [st, b] of [[500, ANTWORT], [200, null], [200, {}], [200, { accountManager: { options: [] } }], [200, { accountManager: { options: [{ key: "X", name: "" }] } }]]) {
    assert.equal(selectAdminAccountManager(st, b), null, JSON.stringify([st, b]));
  }
  const ohne = selectAdminAccountManager(200, { accountManager: { ...ANTWORT.accountManager, current: null, assignedAt: null } });
  assert.deepEqual([ohne.current, ohne.assignedAt], [null, null]);
});

test("2 — PUT-Ergebnis: Erfolg nennt Person und Wirkung, No-Op, Konflikt mit aktuellem Stand, Ausschlüsse, Rest generisch", () => {
  assert.deepEqual(saveOutcome(200, { noOp: false }, "Patrick Werner"),
    { type: "success", text: "Ansprechpartner geändert: Patrick Werner. Der Kunde sieht die Änderung beim nächsten Laden seines Kundenbereichs.", reload: true });
  assert.equal(saveOutcome(200, { noOp: true }, "Patrick Werner").type, "info");
  const konflikt = saveOutcome(409, { code: "ACCOUNT_MANAGER_CHANGED", current: { key: "patrick", name: "Patrick Werner" } }, "Miguel Vance");
  assert.deepEqual([konflikt.type, konflikt.reload], ["error", true]);
  assert.match(konflikt.text, /inzwischen geändert \(jetzt: Patrick Werner\)/);
  assert.equal(saveOutcome(409, { code: "ACCOUNT_ANONYMIZED" }, "x").text, AM_REASON_TEXT.anonymized);
  assert.equal(saveOutcome(409, { code: "SALES_PARTNER_MANAGED_SEPARATELY" }, "x").text, AM_REASON_TEXT.sales_partner);
  assert.equal(saveOutcome(409, { code: "PRELIVE_TEST_ACCOUNT" }, "x").text, AM_REASON_TEXT.prelive_test);
  assert.equal(saveOutcome(409, { code: "ACCOUNT_MANAGER_NOT_APPLICABLE" }, "x").text, AM_REASON_TEXT.not_customer);
  assert.match(saveOutcome(400, { code: "INVALID_ACCOUNT_MANAGER" }, "x").text, /aus der Liste/);
  assert.deepEqual(saveOutcome(500, null, "x"), { type: "error", text: AM_ADMIN_TEXT.saveError, reload: false });
  assert.equal(saveOutcome(429, {}, "x").reload, false);
  assert.equal(reasonText("unbekannt"), AM_REASON_TEXT.not_customer);
  assert.match(savedText("Miguel Vance"), /^Ansprechpartner geändert: Miguel Vance\./);
});

test("3 — Kundenliste: nur Kundenkonten, mit Name oder „nicht zugeordnet“", () => {
  assert.equal(listLine({ role: "customer", account_manager: { key: "patrick", name: "Patrick Werner" } }), "Betreuung: Patrick Werner");
  assert.equal(listLine({ role: "customer", account_manager: null }), "Betreuung: nicht zugeordnet");
  assert.equal(listLine({ role: "admin", account_manager: null }), null);
  assert.equal(listLine({ role: "sales_partner" }), null);
  assert.equal(listLine(null), null);
});

test("4 — Kundendetail: Betreuungskarte nur für Kundenkonten, lädt bei Statuswechsel neu; Kundenfeld klar benannt", () => {
  const seite = ohneKommentare(lies("pages/admin/AdminUserDetailPage.jsx"));
  assert.match(seite, /roleOf\(u\) !== "admin" && roleOf\(u\) !== "sales_partner" && \(\s*<AccountManagerSection userId=\{idOf\(u\)\} refreshKey=\{statusOf\(u\)\} \/>/);
  assert.match(seite, /\["Ansprechpartner \(Kunde\)", missingField\(u, "name"\)/);
  const karte = ohneKommentare(lies("components/admin/AccountManagerSection.jsx"));
  assert.match(karte, /setAdminUserAccountManager\(userId, \{ accountManagerKey: auswahl, previousKey: aktuell \|\| null \}\)/);
  assert.match(karte, /disabled=\{busy \|\| !geaendert\}/, "Speichern nur bei einer Änderung");
  assert.match(karte, /\{!aktuell && <option value="" disabled>\{T\.unassigned\}<\/option>\}/);
  assert.match(karte, /useEffect\(\(\) => \{ laden\(\); \}, \[laden, refreshKey\]\);/);
  assert.match(karte, /role=\{message\.type === "error" \? "alert" : "status"\}/);
  // Keine Personen im Code: Auswahl, Namen und nächste Zuteilung kommen vom Server.
  assert.doesNotMatch(karte, /Miguel|Patrick|miguel|patrick/);
  const api = lies("api/adminApi.js");
  assert.match(api, /body: JSON\.stringify\(\{ accountManagerKey, previousKey: previousKey \?\? null \}\)/);
  assert.match(api, /`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/account-manager`/);
});

test("5 — Kundenliste und Protokoll: Zeile in der gemeinsamen Kundenzelle, Beschriftung der Aktion", () => {
  const liste = ohneKommentare(lies("pages/admin/AdminUsersPage.jsx"));
  assert.match(liste, /\{betreuungsZeile\(user\) && <span className="adm-cust-since adm-cust-betreuung">\{betreuungsZeile\(user\)\}<\/span>\}/);
  assert.match(lies("pages/admin/AuditLogPage.jsx"), /"user\.account_manager_change": "ConfidaraExpress-Ansprechpartner geändert",/);
});
