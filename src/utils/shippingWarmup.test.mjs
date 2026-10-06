// „Versandbereich aktiv" (TG-Cold-Start, 2026-10-06) — die Meldelogik der Versandseiten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createShippingWarmupSignal, SHIPPING_WARMUP_MIN_INTERVAL_MS, SHIPPING_WARMUP_IDLE_ACTIVITY_MS,
} from "./shippingWarmup.mjs";

const MIN = 60 * 1000;
const aufbau = () => {
  const uhr = { t: 1_000_000 }; const gesendet = [];
  const s = createShippingWarmupSignal({ send: (t) => { gesendet.push(t); return Promise.resolve(); }, now: () => uhr.t });
  return { uhr, gesendet, s };
};

test("Betreten der Seite meldet immer genau einmal — der Server entscheidet über den Anbieterruf", () => {
  const { gesendet, s } = aufbau();
  s.onPageEnter();
  assert.deepEqual(gesendet, ["page"]);
});

test("Wieder-Sichtbarwerden ist auf eine Meldung je 2 Minuten gedrosselt", () => {
  const { uhr, gesendet, s } = aufbau();
  s.onPageEnter();
  uhr.t += SHIPPING_WARMUP_MIN_INTERVAL_MS - 1; s.onVisible();
  assert.deepEqual(gesendet, ["page"]);
  uhr.t += 1; s.onVisible();
  assert.deepEqual(gesendet, ["page", "visible"]);
  s.onVisible(); s.onVisible();
  assert.deepEqual(gesendet, ["page", "visible"]);
});

test("Eingaben melden nur nach mindestens 5 Minuten Ruhe — normales Tippen erzeugt keine Meldung", () => {
  const { uhr, gesendet, s } = aufbau();
  s.onPageEnter();
  for (let i = 0; i < 50; i++) { uhr.t += 10 * 1000; s.onActivity(); }   // ~8 Minuten durchgehend aktiv
  assert.deepEqual(gesendet, ["page"]);
  uhr.t += SHIPPING_WARMUP_IDLE_ACTIVITY_MS; s.onActivity();               // Rückkehr nach Ruhe
  assert.deepEqual(gesendet, ["page", "activity"]);
  uhr.t += 30 * 1000; s.onActivity();
  assert.deepEqual(gesendet, ["page", "activity"]);
});

test("lange geöffnete Seite: ohne Kundenhandlung entsteht keine einzige Meldung (kein Timer)", () => {
  const { uhr, gesendet, s } = aufbau();
  s.onPageEnter();
  uhr.t += 40 * MIN;
  assert.deepEqual(gesendet, ["page"]);
  s.onActivity();
  assert.deepEqual(gesendet, ["page", "activity"]);
});

test("ein werfender oder ablehnender Sender stört nichts", async () => {
  const s1 = createShippingWarmupSignal({ send: () => { throw new Error("x"); }, now: () => 0 });
  assert.doesNotThrow(() => s1.onPageEnter());
  let unbehandelt = 0; const h = () => { unbehandelt++; }; process.on("unhandledRejection", h);
  const s2 = createShippingWarmupSignal({ send: () => Promise.reject(new Error("401")), now: () => 0 });
  s2.onPageEnter();
  await new Promise((r) => setTimeout(r, 10));
  process.removeListener("unhandledRejection", h);
  assert.equal(unbehandelt, 0);
});

test("Verdrahtung: beide Versandseiten nutzen den Hook; der Hook kennt keinen Timer und keinen Anbieter", () => {
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const seite of ["pages/NewShipmentPage.jsx", "pages/CalculatorPage.jsx"]) {
    const c = readFileSync(path.join(src, seite), "utf8");
    assert.equal((c.match(/^\s*useShippingWarmup\(\);/gm) || []).length, 1, seite);
  }
  const hook = readFileSync(path.join(src, "hooks/useShippingWarmup.js"), "utf8");
  for (const v of ["setInterval", "setTimeout", "transglobal", "Transglobal", "useState"]) assert.ok(!hook.includes(v), v);
  const api = readFileSync(path.join(src, "api/client.js"), "utf8");
  assert.ok(/apiFetch\(`\/api\/offers\/prepare\?trigger=\$\{t\}`, \{ method: "POST", auth: true, timeoutMs: 10000 \}\)/.test(api));
});
