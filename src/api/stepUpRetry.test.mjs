// ───────────────────────────────────────────────────────
// Step-up im zentralen Client (Admin-App, Betreiberauftrag 2026-11-22; Sicherheitsprüfung FE-1, T1 und B2).
//
// Antwortet der Server auf eine kritische Admin-Aktion mit 428 STEP_UP_REQUIRED, fragt apiFetch die Bestätigung an
// (stepUpHandler) und wiederholt die Anfrage GENAU EINMAL — nur nach einer Bestätigung und nur mit demselben Token.
// Diese Datei führt apiFetch ECHT aus (gegen ein abgefangenes fetch); die E2E-Suite adminSucheSicherheit prüft den
// Abbruch im Browser.
//
// client.js liest import.meta.env beim Modulstart und ist unter node --test nicht direkt ladbar. Geladen wird deshalb
// eine Kopie, in der ausschließlich die Basis-URL und der eine relative Import ersetzt sind (wie
// emailChangeContract.test.mjs) — die Funktionen selbst bleiben byteidentisch.
// Run: node --test src/api/stepUpRetry.test.mjs
// ───────────────────────────────────────────────────────
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const BASIS = "https://api.example.test";

async function ladeClient() {
  let src = fs.readFileSync(path.join(HIER, "client.js"), "utf8");
  const ersetze = (alt, neu) => {
    assert.equal(src.split(alt).length - 1, 1, `Ladeanker fehlt oder ist mehrdeutig: ${alt}`);
    src = src.replace(alt, neu);
  };
  ersetze("import.meta.env.VITE_API_URL", JSON.stringify(BASIS));
  ersetze('"../utils/draftsView.mjs"', JSON.stringify(pathToFileURL(path.join(HIER, "../utils/draftsView.mjs")).href));
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ce-client-stepup-")), "client.mjs");
  fs.writeFileSync(datei, src);
  return import(pathToFileURL(datei).href);
}

const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
let aufrufe = [];
let antworten = [];
globalThis.fetch = async (url, init = {}) => {
  aufrufe.push({ url, method: init.method || "GET", auth: (init.headers || {}).Authorization });
  const a = antworten.length > 1 ? antworten.shift() : antworten[0];
  return new Response(JSON.stringify(a.body), { status: a.status, headers: { "Content-Type": "application/json" } });
};

const client = await ladeClient();
let abmeldungen = 0;
client.setAuthErrorHandler(() => { abmeldungen += 1; });

const STEP_UP = { status: 428, body: { error: "Bestätigung erforderlich", code: "STEP_UP_REQUIRED" } };
const ERFOLG = { status: 200, body: { recoveryCodes: ["AAAA-BBBB-CCCC"] } };

function vorbereiten(...folge) {
  aufrufe = []; abmeldungen = 0; antworten = folge;
  speicher.set("ce_token", "t-admin-a");
}
const kritisch = () => client.apiFetch("/auth/recovery-codes/regenerate", { method: "POST", auth: true });

test("1 — bestätigt: genau ein zweiter Aufruf mit demselben Token, dessen Antwort zurückkommt", async () => {
  vorbereiten(STEP_UP, ERFOLG);
  let gefragt = 0;
  client.setStepUpHandler(async () => { gefragt += 1; return true; });
  const res = await kritisch();
  assert.equal(res.status, 200);
  assert.equal(gefragt, 1);
  assert.equal(aufrufe.length, 2);
  assert.deepEqual(aufrufe.map((a) => a.auth), ["Bearer t-admin-a", "Bearer t-admin-a"]);
  assert.equal(abmeldungen, 0);
});

test("2 — zweimal 428: keine Endlosschleife — kein dritter Aufruf, keine zweite Frage, die 428 kommt zurück", async () => {
  vorbereiten(STEP_UP, STEP_UP, ERFOLG);
  let gefragt = 0;
  client.setStepUpHandler(async () => { gefragt += 1; return true; });
  const res = await kritisch();
  assert.equal(res.status, 428);
  assert.equal(gefragt, 1);
  assert.equal(aufrufe.length, 2);
});

test("3 — abgebrochen (false), wirft oder kein boolesches true: die Aktion läuft kein zweites Mal", async () => {
  for (const handler of [async () => false, async () => { throw new Error("abgebrochen"); }, async () => "ja", async () => 1]) {
    vorbereiten(STEP_UP, ERFOLG);
    client.setStepUpHandler(handler);
    const res = await kritisch();
    assert.equal(res.status, 428);
    assert.equal(aufrufe.length, 1);
  }
  assert.equal(abmeldungen, 0, "eine nicht bestätigte Aktion meldet niemanden ab");
});

test("4 — Token während der Bestätigung gewechselt (anderer Tab, anderes Konto): keine Wiederholung unter der fremden Sitzung", async () => {
  vorbereiten(STEP_UP, ERFOLG);
  client.setStepUpHandler(async () => { speicher.set("ce_token", "t-admin-b"); return true; });
  const res = await kritisch();
  assert.equal(res.status, 428);
  assert.equal(aufrufe.length, 1, "die Aktion von A lief nicht mit dem Token von B");
});

test("5 — Passkey fehlt (428 PASSKEY_SETUP_REQUIRED): Hinweis über den eigenen Handler, keine Bestätigung, keine Wiederholung", async () => {
  vorbereiten({ status: 428, body: { error: "Passkey erforderlich", code: "PASSKEY_SETUP_REQUIRED" } }, ERFOLG);
  let gefragt = 0, einrichten = 0;
  client.setStepUpHandler(async () => { gefragt += 1; return true; });
  client.setPasskeySetupHandler(() => { einrichten += 1; });
  const res = await kritisch();
  assert.equal(res.status, 428);
  assert.equal(gefragt, 0);
  assert.equal(einrichten, 1);
  assert.equal(aufrufe.length, 1);
  client.setPasskeySetupHandler(null);
});

test("6 — 428 ohne bekannten Code, öffentliche Anfrage oder kein Handler: nichts wird angefragt oder wiederholt", async () => {
  let gefragt = 0;
  client.setStepUpHandler(async () => { gefragt += 1; return true; });
  vorbereiten({ status: 428, body: { error: "Vorbedingung" } }, ERFOLG);
  assert.equal((await kritisch()).status, 428);
  vorbereiten(STEP_UP, ERFOLG);
  assert.equal((await client.apiFetch("/public/x", { method: "POST" })).status, 428);
  assert.equal(gefragt, 0);
  client.setStepUpHandler(null);
  vorbereiten(STEP_UP, ERFOLG);
  assert.equal((await kritisch()).status, 428);
  assert.equal(aufrufe.length, 1);
});
