// ──────────────────────────────────────────────────────────────────────────────
// Paritätsaudit (Session 2) — Vertrag ausgewählter Adminaufrufe gegen das Backend.
//
// Die Funktionen werden ECHT ausgeführt: geladen wird eine Kopie von adminApi.js, in der
// ausschließlich die Importe umgeschrieben sind — `./client` zeigt auf einen Stub, der jeden
// apiFetch-Aufruf mitschreibt, die Hilfsmodule auf ihre echten Dateien. Die Funktionen selbst
// bleiben byteidentisch. Geprüft wird, was beim Server ankommt: Methode, Pfad, Query, Body.
//
// Run: node --test src/api/adminApiContract.test.mjs
// ──────────────────────────────────────────────────────────────────────────────
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));

async function ladeAdminApi() {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "ce-adminapi-"));
  fs.writeFileSync(path.join(ordner, "client.mjs"), [
    "export const aufrufe = [];",
    "export async function apiFetch(pfad, opts = {}) {",
    "  aufrufe.push({ pfad, opts });",
    "  return { ok: true, status: 200, json: async () => ({}) };",
    "}",
  ].join("\n"));
  let src = fs.readFileSync(path.join(HIER, "adminApi.js"), "utf8");
  assert.equal(src.split('from "./client";').length - 1, 1, "Ladeanker ./client fehlt oder ist mehrdeutig");
  src = src.replace('from "./client";', 'from "./client.mjs";');
  src = src.replace(/from "\.\.\/utils\/([^"]+)"/g, (_, rel) =>
    `from ${JSON.stringify(pathToFileURL(path.join(HIER, "..", "utils", rel)).href)}`);
  fs.writeFileSync(path.join(ordner, "adminApi.mjs"), src);
  const api = await import(pathToFileURL(path.join(ordner, "adminApi.mjs")).href);
  const client = await import(pathToFileURL(path.join(ordner, "client.mjs")).href);
  return { api, aufrufe: client.aufrufe };
}

const { api, aufrufe } = await ladeAdminApi();
const letzter = () => aufrufe[aufrufe.length - 1];
const query = (pfad) => Object.fromEntries(new URL(pfad, "https://api.example.test").searchParams);

test("B2 — Auditprotokoll: Seiten werden als limit/offset gesendet, nie als page/page_size", async () => {
  await api.listAuditLogs({ page: 3, pageSize: 25, action: "user.delete", result: "" });
  const { pfad, opts } = letzter();
  assert.equal(new URL(pfad, "https://api.example.test").pathname, "/admin/audit-logs");
  assert.deepEqual(query(pfad), { action: "user.delete", limit: "25", offset: "50" });
  assert.equal(opts.auth, true);
  await api.listAuditLogs({});
  assert.deepEqual(query(letzter().pfad), { limit: "25", offset: "0" });
  // Ungültige Seitenangaben fallen auf die erste Seite zurück, statt einen negativen Offset zu senden.
  await api.listAuditLogs({ page: 0, pageSize: -5 });
  assert.deepEqual(query(letzter().pfad), { limit: "25", offset: "0" });
  // Unbekannte Parameter gehen nicht mit.
  await api.listAuditLogs({ page: 2, pageSize: 10, page_size: 99, foo: "x" });
  assert.deepEqual(query(letzter().pfad), { limit: "10", offset: "10" });
});

test("B1 — Auftragsbestätigung: send/resend über die Sendung, POST ohne Body", async () => {
  await api.sendAdminOrderConfirmationEmail(77);
  assert.equal(letzter().pfad, "/admin/shipments/77/order-confirmation-email/send");
  assert.deepEqual(letzter().opts, { method: "POST", auth: true });
  await api.resendAdminOrderConfirmationEmail("77");
  assert.equal(letzter().pfad, "/admin/shipments/77/order-confirmation-email/resend");
  assert.deepEqual(letzter().opts, { method: "POST", auth: true });
});
