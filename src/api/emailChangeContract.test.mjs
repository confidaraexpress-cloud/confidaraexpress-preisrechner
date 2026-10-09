// ──────────────────────────────────────────────────────────────────────────────
// R3 — Vertrag der E-Mail-Änderung zwischen Frontend-Client und Backend.
//
// Bis R3 riefen alle vier Funktionen Pfade OHNE das Präfix /api auf; das Backend
// (routes/emailChange.js) bedient sie nur MIT /api — jeder Aufruf endete in 404,
// und der E-Mail-Wechsel war vollständig defekt. Ein Quelltextanker hielt damals
// sogar den falschen Pfad fest. Dieser Test führt die Funktionen deshalb ECHT aus
// (gegen ein abgefangenes fetch) und hält je Funktion fest:
//   • Methode und Pfad — wortgleich die Backendroute,
//   • das Auth-Verhalten — und damit die Trennung „falsches Passwort“ (fachlicher
//     401, KEIN Logout) gegen „Sitzung abgelaufen“ (Logout).
//
// client.js liest import.meta.env beim Modulstart und ist unter node --test nicht
// direkt ladbar. Geladen wird deshalb eine Kopie, in der ausschließlich die
// Basis-URL und der eine relative Import ersetzt sind — die Funktionen selbst
// bleiben byteidentisch.
// Run: node --test src/api/emailChangeContract.test.mjs
// ──────────────────────────────────────────────────────────────────────────────
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isSessionExpiredBody } from "../utils/emailChangeView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const BASIS = "https://api.example.test";

// Die Backendrouten (confidaraexpress-api, routes/emailChange.js) — die einzige
// Quelle, gegen die der Client stimmen muss. Ändert sich eine Route, ändert sich
// dieser Vertrag bewusst mit.
const BACKEND = {
  start:   ["POST",   "/api/kunde/email-change"],
  resend:  ["POST",   "/api/kunde/email-change/resend"],
  cancel:  ["DELETE", "/api/kunde/email-change"],
  confirm: ["POST",   "/api/auth/confirm-email-change"],
};

async function ladeClient() {
  let src = fs.readFileSync(path.join(HIER, "client.js"), "utf8");
  const ersetze = (alt, neu) => {
    assert.equal(src.split(alt).length - 1, 1, `Ladeanker fehlt oder ist mehrdeutig: ${alt}`);
    src = src.replace(alt, neu);
  };
  ersetze("import.meta.env.VITE_API_URL", JSON.stringify(BASIS));
  ersetze('"../utils/draftsView.mjs"', JSON.stringify(pathToFileURL(path.join(HIER, "../utils/draftsView.mjs")).href));
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ce-client-")), "client.mjs");
  fs.writeFileSync(datei, src);
  return import(pathToFileURL(datei).href);
}

// Browser-Umgebung, soweit der Client sie braucht: localStorage und fetch.
const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
let aufrufe = [];
let antwort = { status: 200, body: {} };
globalThis.fetch = async (url, init = {}) => {
  aufrufe.push({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body });
  return new Response(JSON.stringify(antwort.body), { status: antwort.status, headers: { "Content-Type": "application/json" } });
};

const client = await ladeClient();
let abmeldungen = 0;
client.setAuthErrorHandler(() => { abmeldungen += 1; });

function vorbereiten(status = 200, body = {}) {
  aufrufe = []; abmeldungen = 0; antwort = { status, body };
  speicher.set("ce_token", "t-123");
}
const pfadVon = (url) => new URL(url).pathname;

test("Start: POST /api/kunde/email-change mit Bearer und Body", async () => {
  vorbereiten();
  await client.startEmailChange("neu@example.test", "geheim-123");
  assert.equal(aufrufe.length, 1);
  assert.deepEqual([aufrufe[0].method, pfadVon(aufrufe[0].url)], BACKEND.start);
  assert.equal(aufrufe[0].headers.Authorization, "Bearer t-123");
  assert.deepEqual(JSON.parse(aufrufe[0].body), { newEmail: "neu@example.test", currentPassword: "geheim-123" });
});

test("Resend: POST /api/kunde/email-change/resend mit Bearer", async () => {
  vorbereiten();
  await client.resendEmailChange();
  assert.deepEqual([aufrufe[0].method, pfadVon(aufrufe[0].url)], BACKEND.resend);
  assert.equal(aufrufe[0].headers.Authorization, "Bearer t-123");
});

test("Cancel: DELETE /api/kunde/email-change mit Bearer", async () => {
  vorbereiten();
  await client.cancelEmailChange();
  assert.deepEqual([aufrufe[0].method, pfadVon(aufrufe[0].url)], BACKEND.cancel);
  assert.equal(aufrufe[0].headers.Authorization, "Bearer t-123");
});

test("Confirm: POST /api/auth/confirm-email-change — öffentlich, OHNE Bearer", async () => {
  vorbereiten();
  await client.confirmEmailChange("mail-token");
  assert.deepEqual([aufrufe[0].method, pfadVon(aufrufe[0].url)], BACKEND.confirm);
  assert.equal(aufrufe[0].headers.Authorization, undefined, "das Mail-Token darf keinen Bearer mitschicken");
  assert.deepEqual(JSON.parse(aufrufe[0].body), { token: "mail-token" });
});

test("Start, 401 falsches Passwort: KEIN Logout, Token bleibt — der Aufrufer zeigt den Fehler", async () => {
  const body = { error: "Aktuelles Passwort ist falsch.", code: "CURRENT_PASSWORD_INVALID" };
  vorbereiten(401, body);
  const r = await client.startEmailChange("neu@example.test", "falsch");
  assert.equal(r.status, 401);
  assert.equal(abmeldungen, 0, "ein falsches Passwort darf nicht abmelden");
  assert.equal(localStorage.getItem("ce_token"), "t-123");
  assert.equal(isSessionExpiredBody(await r.json()), false, "der fachliche 401 gilt nicht als abgelaufene Sitzung");
});

test("Start, 401 Sitzung abgelaufen: erkennbar am Body — der Aufrufer meldet ab (triggerAuthError)", async () => {
  const body = { error: "Sitzung abgelaufen. Bitte melden Sie sich erneut an.", code: "SESSION_EXPIRED" };
  vorbereiten(401, body);
  const r = await client.startEmailChange("neu@example.test", "egal");
  assert.equal(abmeldungen, 0, "der Client selbst meldet beim Start nie ab");
  assert.equal(isSessionExpiredBody(await r.json()), true, "die abgelaufene Sitzung muss erkennbar bleiben");
});

test("Resend und Cancel, 401: echte ungültige Sitzung → zentraler Logout", async () => {
  for (const fn of ["resendEmailChange", "cancelEmailChange"]) {
    vorbereiten(401, { error: "Sitzung abgelaufen.", code: "SESSION_EXPIRED" });
    await client[fn]();
    assert.equal(abmeldungen, 1, `${fn}: kein Logout bei 401`);
    assert.equal(localStorage.getItem("ce_token"), null, `${fn}: Token nicht entfernt`);
  }
});

test("Confirm, 401/400: nie ein Logout (kein Sitzungsaufruf)", async () => {
  for (const status of [400, 401, 403]) {
    vorbereiten(status, { error: "x", code: "EMAIL_CHANGE_TOKEN_INVALID" });
    await client.confirmEmailChange("mail-token");
    assert.equal(abmeldungen, 0, `Confirm ${status}: Logout ausgelöst`);
  }
});

test("Kein E-Mail-Wechsel-Aufruf im Client ohne /api-Präfix", () => {
  const src = fs.readFileSync(path.join(HIER, "client.js"), "utf8");
  const pfade = [...src.matchAll(/apiFetch\(`([^`]*email-change[^`]*)`/g)].map((m) => m[1]);
  assert.equal(pfade.length, 4, `erwartet vier E-Mail-Wechsel-Aufrufe, gefunden: ${pfade.join(", ")}`);
  for (const p of pfade) assert.match(p, /^\/api\/(kunde|auth)\//, `Pfad ohne /api: ${p}`);
});
