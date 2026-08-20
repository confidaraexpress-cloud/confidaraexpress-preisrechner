// Testkundenberechtigung — Frontendvertrag.
//
// Geprüft werden: die fail-closed Auswertung, die Antwortauswahl, die
// Fehlerzuordnung, die No-Op-Erkennung, die Texte (Rollenklarstellung,
// keine Interna) sowie die Quelltextinvarianten von API-Aufruf, Karte und
// Seite — insbesondere, dass das Frontend NICHTS selbst entscheidet und die
// Adminrolle nirgends als Ersatzberechtigung durchschlägt.
//
// Ausführen: node --test src/utils/adminTestBooking.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TEST_BOOKING_TEXTS,
  isTestBookingEnabled,
  selectTestBookingResponse,
  testBookingError,
  testBookingHasChange,
} from "./adminTestBooking.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const apiSrc     = read("../api/adminApi.js");
const cardSrc    = read("../components/admin/TestBookingSection.jsx");
const pageSrc    = read("../pages/admin/AdminUserDetailPage.jsx");
const moduleSrc  = read("./adminTestBooking.mjs");

// Kommentarfreier Quelltext — ein erklärender Kommentar darf keine Zusicherung
// belegen, die der ausgeführte Code nicht trägt.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

// ─── 1. Auswertung ist fail-closed ───────────────────────────────────────────

test("1 nur ein echtes true ist eine Berechtigung", () => {
  assert.equal(isTestBookingEnabled({ test_booking_enabled: true }), true);
  assert.equal(isTestBookingEnabled({ testBookingEnabled: true }), true);
  assert.equal(isTestBookingEnabled({ test_booking_enabled: false }), false);
});

test("2 truthy-Werte sind KEINE Berechtigung", () => {
  // Ein String aus einer alten Antwort oder einer fehlkonfigurierten Spalte darf
  // nie zur Erlaubnis werden — dieselbe strikte Regel wie serverseitig.
  for (const bad of ["true", "True", 1, "1", "yes", {}, [], "false", 0, "", NaN]) {
    assert.equal(isTestBookingEnabled({ test_booking_enabled: bad }), false, `${JSON.stringify(bad)}`);
  }
});

test("3 fehlendes Feld und fehlendes Konto ergeben false, nie undefined", () => {
  // Ein Backend VOR der Migration liefert das Feld schlicht nicht. Die Karte
  // zeigt dann „Nicht freigeschaltet" — nie einen leeren oder unklaren Zustand.
  assert.equal(isTestBookingEnabled({}), false);
  assert.equal(isTestBookingEnabled(null), false);
  assert.equal(isTestBookingEnabled(undefined), false);
  assert.equal(isTestBookingEnabled("admin"), false);
  assert.equal(isTestBookingEnabled([]), false);
});

test("4 die Rolle spielt für die Anzeige keine Rolle", () => {
  // Adminrolle ≠ Testberechtigung — der Kern dieses Pakets.
  assert.equal(isTestBookingEnabled({ role: "admin" }), false);
  assert.equal(isTestBookingEnabled({ role: "admin", test_booking_enabled: false }), false);
  assert.equal(isTestBookingEnabled({ role: "customer", test_booking_enabled: true }), true);
});

// ─── 2. Antwortauswahl ───────────────────────────────────────────────────────

test("5 eine verwertbare Antwort wird übernommen", () => {
  assert.deepEqual(selectTestBookingResponse({ userId: 7, testBookingEnabled: true }), { testBookingEnabled: true });
  assert.deepEqual(selectTestBookingResponse({ userId: 7, testBookingEnabled: false }), { testBookingEnabled: false });
});

test("6 eine unverwertbare Antwort ergibt null (der Aufrufer lädt dann neu)", () => {
  // Kein geratener Zwischenzustand: eine Berechtigung falsch anzuzeigen ist
  // schlimmer, als kurz zu laden.
  for (const bad of [null, undefined, "ok", [], {}, { testBookingEnabled: "true" }, { testBookingEnabled: 1 }]) {
    assert.equal(selectTestBookingResponse(bad), null, `${JSON.stringify(bad)}`);
  }
});

// ─── 3. Fehler und No-Op ─────────────────────────────────────────────────────

test("7 401/403 erzeugen KEINE eigene Meldung (zentrale Behandlung)", () => {
  assert.equal(testBookingError(401), null);
  assert.equal(testBookingError(403), null);
});

test("8 die übrigen Status haben je einen eigenen, handlungsleitenden Text", () => {
  const s404 = testBookingError(404);
  const s429 = testBookingError(429);
  const s400 = testBookingError(400);
  const s500 = testBookingError(500);
  for (const t of [s404, s429, s400, s500]) assert.ok(t && t.length > 10);
  assert.equal(new Set([s404, s429, s400, s500]).size, 4, "vier unterscheidbare Texte");
  assert.equal(testBookingError(0), s500, "Netzwerkfehler nutzt den generischen Text");
});

test("9 kein Fehlertext nennt Interna", () => {
  for (const status of [400, 404, 429, 500, 0]) {
    const t = testBookingError(status) || "";
    for (const leak of ["jumingo", "JUMiNGO", "sandbox", "voucher", "tariff", "Tarif", "SQL", "role", "Rolle"]) {
      assert.ok(!t.includes(leak), `${status} nennt ${leak}`);
    }
  }
});

test("10 ein Umschalten auf denselben Wert ist keine Änderung", () => {
  assert.equal(testBookingHasChange(false, true), true);
  assert.equal(testBookingHasChange(true, false), true);
  assert.equal(testBookingHasChange(true, true), false);
  assert.equal(testBookingHasChange(false, false), false);
  // Ein unbekannter Ausgangszustand gilt als false — das Freischalten ist dann
  // eine echte Änderung, das Entziehen nicht.
  assert.equal(testBookingHasChange(undefined, true), true);
  assert.equal(testBookingHasChange(undefined, false), false);
});

// ─── 4. Texte ────────────────────────────────────────────────────────────────

test("11 die Rollenklarstellung steht sichtbar in der Oberfläche", () => {
  // Die eigentliche Aussage dieses Pakets darf nicht nur im Quelltext stehen.
  assert.match(TEST_BOOKING_TEXTS.roleNote, /Adminrolle/);
  assert.match(TEST_BOOKING_TEXTS.roleNote, /reicht|nicht aus/);
  assert.ok(stripComments(cardSrc).includes("roleNote"), "die Karte muss den Hinweis rendern");
});

test("12 die Karte sagt, was eine Testbuchung erzeugt", () => {
  // Testlabel und Testrechnung: ein Admin, der freischaltet, muss wissen, was
  // dabei entsteht — sonst liest sich die Berechtigung wie ein Gratisversand.
  assert.match(TEST_BOOKING_TEXTS.explanation, /Testlabel/);
  assert.match(TEST_BOOKING_TEXTS.explanation, /Testrechnung/);
  assert.match(TEST_BOOKING_TEXTS.explanation, /nicht für echte Pakete/);
});

test("13 der Zustand wird als TEXT benannt, nicht nur farblich", () => {
  assert.ok(TEST_BOOKING_TEXTS.statusOn.length > 0 && TEST_BOOKING_TEXTS.statusOff.length > 0);
  assert.notEqual(TEST_BOOKING_TEXTS.statusOn, TEST_BOOKING_TEXTS.statusOff);
  const card = stripComments(cardSrc);
  assert.ok(/statusOn\s*:\s*T\.statusOff/.test(card.replace(/\s+/g, " ")) || card.includes("T.statusOn"),
    "das Badge muss den Text tragen");
});

test("14 der Hinweis sagt, dass die übrigen Prüfungen bestehen bleiben", () => {
  // Sonst liest sich die Freischaltung als „ab jetzt geht alles".
  assert.match(TEST_BOOKING_TEXTS.hintOn, /weiterhin|übrigen/);
  assert.match(TEST_BOOKING_TEXTS.hintOff, /regulär|kostenpflichtig/);
});

test("15 kein Kundentext nennt den Upstream-Anbieter", () => {
  // White Label: der Testgutschein heißt „offizieller Testgutschein", nicht
  // nach dem Anbieter. Auch der Sandboxcode selbst steht nirgends.
  for (const [key, value] of Object.entries(TEST_BOOKING_TEXTS)) {
    for (const leak of ["jumingo", "sandbox"]) {
      assert.ok(!String(value).toLowerCase().includes(leak), `${key} nennt ${leak}`);
    }
  }
  for (const [name, src] of [["Karte", cardSrc], ["Modul", moduleSrc]]) {
    assert.ok(!/jumingo-sandbox/i.test(src), `${name} enthält den Gutscheincode`);
  }
});

// ─── 5. Quelltextinvarianten ─────────────────────────────────────────────────

test("16 der API-Aufruf sendet AUSSCHLIESSLICH den booleschen Wert", () => {
  const api = stripComments(apiSrc);
  const fn = api.slice(api.indexOf("export function setAdminUserTestBooking"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(/JSON\.stringify\(\{\s*testBookingEnabled:\s*enabled\s*\}\)/.test(body),
    "genau ein Feld im Body");
  // Keine userId, keine Rolle, kein Status, keine Auditfelder im Body.
  for (const forbidden of ["userId:", "role", "status", "confirmedBy", "priceMarkup"]) {
    assert.ok(!body.includes(forbidden), `${forbidden} darf nicht im Body stehen`);
  }
  assert.ok(/method:\s*"PUT"/.test(body) && /auth:\s*true/.test(body), "PUT mit Bearer");
  assert.ok(/encodeURIComponent\(userId\)/.test(body), "die ID wird kodiert");
  // Pfadkonvention: /admin/… ohne führendes /api.
  assert.ok(/`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/test-booking`/.test(body));
});

test("17 ein nicht-boolescher Wert wird gar nicht erst gesendet", () => {
  const api = stripComments(apiSrc);
  const fn = api.slice(api.indexOf("export function setAdminUserTestBooking"));
  assert.ok(/enabled !== true && enabled !== false/.test(fn.slice(0, 400)),
    "strikter Guard vor dem Request");
});

test("18 beide Richtungen laufen über einen Bestätigungsdialog", () => {
  const page = stripComments(pageSrc);
  // Der Schalter öffnet nur den Dialog; gesendet wird erst im Bestätigen-Handler.
  assert.ok(/onRequestChange=\{\(next\)/.test(page), "die Karte meldet nur den Wunsch");
  assert.ok(/setTbDialog\(next\)/.test(page), "der Wunsch öffnet den Dialog");
  const confirm = page.slice(page.indexOf("const confirmTestBooking"));
  assert.ok(confirm.indexOf("setAdminUserTestBooking") < confirm.indexOf("\n  };"),
    "der Request steht im Bestätigen-Handler");
  // Der Dialog wird für beide Richtungen gerendert (tbDialog !== null).
  assert.ok(/tbDialog !== null &&/.test(page), "ein Dialog für Freischalten UND Entziehen");
});

test("19 Doppelübermittlung ist ausgeschlossen", () => {
  const page = stripComments(pageSrc);
  const confirm = page.slice(page.indexOf("const confirmTestBooking"), page.indexOf("const confirmApprove"));
  assert.ok(/if \(tbInFlight\.current\) return;/.test(confirm), "synchroner Guard");
  assert.ok(/tbInFlight\.current = true/.test(confirm) && /tbInFlight\.current = false/.test(confirm));
  assert.ok(/finally/.test(confirm), "der Guard wird immer freigegeben");
});

test("20 ein No-Op erzeugt keinen Request", () => {
  const page = stripComments(pageSrc);
  assert.ok(/if \(!testBookingHasChange\(isTestBookingEnabled\(u\), next\)\) return;/.test(page),
    "gleicher Wert → kein Dialog, kein Request");
});

test("21 eine unverwertbare Antwort führt zum Neuladen, nicht zum Raten", () => {
  const page = stripComments(pageSrc);
  const confirm = page.slice(page.indexOf("const confirmTestBooking"), page.indexOf("const confirmApprove"));
  assert.ok(/selectTestBookingResponse\(d\)/.test(confirm));
  assert.ok(/else await load\(\)/.test(confirm), "sonst frisch laden");
});

test("22 das Frontend entscheidet die Berechtigung nirgends selbst", () => {
  // Es gibt keine Kontoliste, keine Rollenprüfung und keinen Pfad, auf dem das
  // Frontend eine Testbuchung ohne serverbestätigten Zustand annimmt.
  const mod = stripComments(moduleSrc);
  assert.ok(!/role\s*===/.test(mod), "keine Rollenprüfung im Modul");
  assert.ok(!/@|\bid\s*===\s*\d/.test(mod), "keine E-Mail- oder ID-Hardcodierung");
  // Gemeint ist ein GELESENES Rollenfeld, nicht das Wort. Der sichtbare
  // Hinweistext (`roleNote`) darf und soll die Adminrolle erwähnen, und
  // `role="alert"`/`role="status"` sind ARIA-Attribute — beide bleiben erlaubt.
  const card = stripComments(cardSrc);
  for (const [name, src] of [["Karte", card], ["Modul", mod]]) {
    assert.ok(!/\.role\b/.test(src), `${name} liest ein Rollenfeld`);
    assert.ok(!/\brole\s*===/.test(src), `${name} vergleicht eine Rolle`);
    assert.ok(!/"admin"|'admin'|"customer"|'customer'/.test(src), `${name} verzweigt auf einen Rollenwert`);
  }
});
