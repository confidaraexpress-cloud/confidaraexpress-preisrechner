// Tests des Idempotenzschlüssels der öffentlichen Supportantworten.
//
// Geprüft wird der Vertrag, auf den sich das Backend verlässt:
//   • Format und Zeichenvorrat passen zur serverseitigen Prüfung
//   • ohne Schlüssel bleibt der Request unverändert (Altverhalten)
//   • der Schlüssel identifiziert die ABSENDEAKTION, nicht den Text
//   • beide Aufrufer erzeugen ihn einmal pro Aktion und behalten ihn bei
//     Fehlversuchen bei — genau das schützt vor der Wiederholung nach einem
//     verlorenen Response.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newIdempotencyKey, idempotencyHeader } from "./idempotencyKey.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const thread = src("../components/support/SupportThread.jsx");
const adminDetail = src("../pages/admin/AdminSupportRequestDetailPage.jsx");
const supportApi = src("../api/supportApi.js");
const adminApi = src("../api/adminApi.js");

// Spiegel der serverseitigen Regel (lib/support.js · normalizeIdempotencyKey).
const SERVER_RE = /^[A-Za-z0-9._:-]+$/;
const SERVER_MIN = 8;
const SERVER_MAX = 200;

test("1 — erzeugte Schlüssel erfüllen die serverseitige Prüfung", () => {
  const gesehen = new Set();
  for (let i = 0; i < 200; i++) {
    const k = newIdempotencyKey();
    assert.strictEqual(typeof k, "string", "in dieser Umgebung muss Web Crypto verfügbar sein");
    assert.ok(k.length >= SERVER_MIN && k.length <= SERVER_MAX, `Länge außerhalb 8…200: ${k}`);
    assert.match(k, SERVER_RE, `unzulässige Zeichen: ${k}`);
    gesehen.add(k);
  }
  assert.strictEqual(gesehen.size, 200, "Schlüssel müssen eindeutig sein — Kollisionen würden Nachrichten verschlucken");
});

test("2 — ohne Schlüssel entsteht KEIN Header (Altverhalten bleibt erhalten)", () => {
  for (const leer of [null, undefined, "", 0, false]) {
    assert.strictEqual(idempotencyHeader(leer), undefined,
      `${JSON.stringify(leer)} darf keinen Header erzeugen`);
  }
  assert.deepStrictEqual(idempotencyHeader("abcdefgh"), { "Idempotency-Key": "abcdefgh" });
});

test("3 — der Schlüssel wird NICHT aus dem Nachrichtentext abgeleitet", () => {
  // Zweimal „Danke“ sind zwei legitime Nachrichten. Würde der Schlüssel aus dem
  // Text entstehen, verschluckte der Server die zweite.
  const code = stripComments(src("./idempotencyKey.mjs"));
  for (const verboten of ["message", "hash", "digest", "text", "body"]) {
    assert.ok(!new RegExp(`\\b${verboten}\\b`, "i").test(code),
      `der Schlüssel darf nicht vom ${verboten} abhängen`);
  }
  assert.ok(!/Math\.random/.test(code), "Math.random ist als Schlüsselquelle nicht zulässig");
  assert.match(code, /randomUUID|getRandomValues/, "der Schlüssel muss aus echtem Zufall stammen");
});

test("4 — der Body bleibt in BEIDEN Aufrufern exakt { message }", () => {
  for (const [name, code] of [["supportApi", supportApi], ["adminApi", adminApi]]) {
    assert.match(code, /body: JSON\.stringify\(\{ message \}\)/,
      `${name}: der Body muss ausschließlich den Text tragen`);
    assert.match(code, /headers: idempotencyHeader\(idempotencyKey\)/,
      `${name}: der Schlüssel muss im Header reisen`);
  }
});

test("5 — beide Oberflächen erzeugen EINEN Schlüssel je Absendeaktion", () => {
  for (const [name, code] of [["SupportThread", thread], ["AdminDetail", adminDetail]]) {
    const c = stripComments(code);
    // Genau eine Erzeugungsstelle, und zwar bedingt („nur wenn noch keiner da ist“).
    const erzeugt = c.match(/newIdempotencyKey\(\)/g) || [];
    assert.strictEqual(erzeugt.length, 1, `${name}: es darf genau eine Erzeugungsstelle geben`);
    assert.match(c, /if \(!\w*[iI]dem\w*\.current\) \w*[iI]dem\w*\.current = newIdempotencyKey\(\);/,
      `${name}: der Schlüssel darf nur erzeugt werden, wenn noch keiner existiert`);
    // Als Ref gehalten — ein State würde bei jedem Rendern neu greifen.
    assert.match(c, /useRef\(null\)/, `${name}: der Schlüssel gehört in eine Ref`);
  }
});

test("6 — der Schlüssel überlebt einen Fehlversuch und wird erst nach ERFOLG verworfen", () => {
  // Das ist der Kern: bei einem Netzwerkfehler ist unklar, ob der Server die
  // Antwort bereits gespeichert hat. Nur ein beibehaltener Schlüssel verhindert
  // dann die zweite Nachricht.
  for (const [name, code] of [["SupportThread", thread], ["AdminDetail", adminDetail]]) {
    const c = stripComments(code);
    // Nur die Absendefunktion betrachten: die Datei enthält weitere try/catch
    // (z. B. das Laden des Verlaufs), deren Reihenfolge hier nichts aussagt.
    const start = c.indexOf("= newIdempotencyKey()");
    assert.ok(start > 0, `${name}: keine Erzeugungsstelle gefunden`);
    const nachCatch = c.indexOf("} catch", start);
    const verworfen = c.indexOf(".current = null", start);
    assert.ok(verworfen > start, `${name}: der Schlüssel wird nach der Erzeugung nie zurückgesetzt`);
    assert.ok(nachCatch > start, `${name}: die Absendefunktion hat keinen Fehlerpfad`);
    assert.ok(verworfen < nachCatch,
      `${name}: der Schlüssel darf nicht im Fehlerpfad verworfen werden — sonst erzeugt der nächste Versuch eine zweite Nachricht`);
    // Zusätzlich: das Zurücksetzen steht NACH der Erfolgsprüfung (!r.ok → return).
    const erfolgsGate = c.indexOf("if (!r.ok)", start);
    assert.ok(erfolgsGate > start && verworfen > erfolgsGate,
      `${name}: der Schlüssel darf erst nach bestätigtem Erfolg verworfen werden`);
  }
});

test("7 — eine Textänderung verwirft den Schlüssel (neue Absendeaktion)", () => {
  // Anderer Text = andere Aktion. Ohne dieses Zurücksetzen würde die geänderte
  // Antwort unter dem alten Schlüssel als Wiederholung gelten und verschwinden.
  assert.match(stripComments(thread), /onReplyChange[\s\S]{0,200}\.current = null/,
    "SupportThread: eine Textänderung muss den Schlüssel verwerfen");
  assert.match(stripComments(adminDetail), /onChange=\{\(e\) => \{[\s\S]{0,220}\.current = null/,
    "AdminDetail: eine Textänderung muss den Schlüssel verwerfen");
});
