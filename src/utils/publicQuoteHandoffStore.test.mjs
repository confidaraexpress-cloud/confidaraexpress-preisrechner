// Übergabe aus dem öffentlichen Preisrechner: Fragment lesen, sofort aus der Adresse
// entfernen, Token nur im Modulspeicher, nie im Storage.
//
// Run: node --test src/utils/publicQuoteHandoffStore.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  HANDOFF_CAPTURE,
  HANDOFF_PATH,
  __resetHandoffStoreForTests,
  captureHandoffFromLocation,
  clearPendingHandoff,
  handoffCaptureState,
  handoffTokenFromHash,
  hasPendingHandoff,
  peekPendingHandoff,
  takePendingHandoff,
} from "./publicQuoteHandoffStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const TOKEN = "h1." + "A".repeat(40) + "_-9z";

function fakeWin(pathname, hash = "", search = "") {
  const aufrufe = [];
  return {
    aufrufe,
    location: { pathname, hash, search },
    history: {
      state: { idx: 3 },
      replaceState(state, _titel, url) { aufrufe.push({ state, url }); },
    },
  };
}

test("(1) Form: nur h1. plus base64url, höchstens 4096 Zeichen", () => {
  assert.equal(handoffTokenFromHash(`#t=${TOKEN}`), TOKEN);
  assert.equal(handoffTokenFromHash(`#t=h1.${"x".repeat(4093)}`), `h1.${"x".repeat(4093)}`);
  assert.equal(handoffTokenFromHash(`#t=h1.${"x".repeat(4094)}`), null, "länger als 4096 Zeichen");
  assert.equal(handoffTokenFromHash("#t=h2.AAAAAAAAAAAAAAAAAAAA"), null, "falsche Version");
  assert.equal(handoffTokenFromHash("#t=h1.AAAA"), null, "zu kurz");
  assert.equal(handoffTokenFromHash("#t=h1.AAAAAAAAAAAAAAAAAAA%3D"), null, "Zeichen außerhalb base64url");
  assert.equal(handoffTokenFromHash(`?t=${TOKEN}`), null, "nur aus dem Fragment");
  assert.equal(handoffTokenFromHash(""), null);
  assert.equal(handoffTokenFromHash(null), null);
});

test("(2) Erfassung nur auf /preisrechner-uebernahme — Fragment sofort entfernt, Router-Zustand bleibt", () => {
  __resetHandoffStoreForTests();
  const win = fakeWin(HANDOFF_PATH, `#t=${TOKEN}`);
  assert.equal(captureHandoffFromLocation({ win }), HANDOFF_CAPTURE.CAPTURED);
  assert.deepEqual(win.aufrufe, [{ state: { idx: 3 }, url: HANDOFF_PATH }]);
  assert.equal(hasPendingHandoff(), true);
  assert.equal(peekPendingHandoff(), TOKEN);
  assert.equal(handoffCaptureState(), HANDOFF_CAPTURE.CAPTURED);

  __resetHandoffStoreForTests();
  const fremd = fakeWin("/login", `#t=${TOKEN}`);
  assert.equal(captureHandoffFromLocation({ win: fremd }), HANDOFF_CAPTURE.NONE);
  assert.deepEqual(fremd.aufrufe, [], "jede andere Adresse bleibt unangetastet");
  assert.equal(hasPendingHandoff(), false);
});

test("(3) ungültiges Token: Fragment trotzdem entfernt, nichts gespeichert, Zustand „invalid“", () => {
  __resetHandoffStoreForTests();
  const win = fakeWin(HANDOFF_PATH, "#t=kaputt");
  assert.equal(captureHandoffFromLocation({ win }), HANDOFF_CAPTURE.INVALID);
  assert.equal(win.aufrufe.length, 1);
  assert.equal(win.aufrufe[0].url, HANDOFF_PATH);
  assert.equal(hasPendingHandoff(), false);
  assert.equal(handoffCaptureState(), HANDOFF_CAPTURE.INVALID);
});

test("(4) take verbraucht genau einmal; clear verwirft", () => {
  __resetHandoffStoreForTests();
  captureHandoffFromLocation({ win: fakeWin(HANDOFF_PATH, `#t=${TOKEN}`) });
  assert.equal(takePendingHandoff(), TOKEN);
  assert.equal(takePendingHandoff(), null);
  assert.equal(hasPendingHandoff(), false);
  captureHandoffFromLocation({ win: fakeWin(HANDOFF_PATH, `#t=${TOKEN}`) });
  clearPendingHandoff();
  assert.equal(hasPendingHandoff(), false);
  assert.equal(handoffCaptureState(), HANDOFF_CAPTURE.NONE);
});

test("(5) kein Storage, kein Cookie: das Token lebt ausschließlich im Modulspeicher", () => {
  const src = ohneKommentare(read("utils/publicQuoteHandoffStore.mjs"));
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test("(6) main.jsx erfasst die Übergabe vor dem ersten Rendern", () => {
  const src = ohneKommentare(read("main.jsx"));
  const erfassung = src.indexOf("captureHandoffFromLocation()");
  const rendern = src.indexOf("createRoot(");
  assert.ok(erfassung > 0, "Erfassung in main.jsx fehlt");
  assert.ok(erfassung < rendern, "die Erfassung muss vor dem ersten Rendern stehen");
});
