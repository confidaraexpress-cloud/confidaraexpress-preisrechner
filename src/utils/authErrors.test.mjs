// Auth-Fehlerzuordnung + Quelltext-Invarianten der Auth-Flows.
//
// Deckt die Audit-FAILs #4–#10 ab: rohe Browsertexte, leere Banner aus
// `new Error(d.error)`, stiller Rückwurf nach erfolgreichem Login, stiller
// Logout bei Netzfehler während der Sitzungsprüfung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mapLoginError, mapForgotError, mapResetError, mapAuthThrownError,
  classifyResetTokenCheck, AUTH_CODE_TEXTE, AUTH_NETZFEHLER,
  LOGIN_SERVERFEHLER, FORGOT_NEUTRAL_ERFOLG, RESET_ABGELAUFEN, RESET_UNGUELTIG,
} from "./authErrors.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ══ Login ══

test("1 — gesperrtes Konto zeigt den Sperrtext, pending den Freigabetext (Codes getrennt)", () => {
  const blocked = mapLoginError(403, { code: "ACCOUNT_BLOCKED", error: "Ihr Konto wurde gesperrt. Bitte wenden Sie sich an den Support." });
  assert.match(blocked, /gesperrt/);
  assert.match(blocked, /Support/);
  const pending = mapLoginError(403, { code: "ACCOUNT_PENDING_APPROVAL", error: "Konto wartet auf Freigabe durch Admin" });
  assert.match(pending, /noch nicht freigeschaltet/);
  assert.notEqual(blocked, pending, "Sperre und fehlende Freischaltung müssen unterscheidbar sein");
});

test("2 — falsche Zugangsdaten: kuratierter Text, unabhängig vom Servertext", () => {
  assert.equal(mapLoginError(401, { code: "INVALID_CREDENTIALS", error: "E-Mail oder Passwort falsch" }), AUTH_CODE_TEXTE.INVALID_CREDENTIALS);
  assert.equal(mapLoginError(401, null), AUTH_CODE_TEXTE.INVALID_CREDENTIALS, "auch ohne Body kein leerer Text");
});

test("3 — altes Backend ohne Code: 403-Servertext bleibt nutzbar, 5xx nie roh", () => {
  assert.equal(mapLoginError(403, { error: "Konto wartet auf Freigabe durch Admin" }), "Konto wartet auf Freigabe durch Admin");
  const s500 = mapLoginError(500, { error: "ER_CONNECTION_LOST at pool.query" });
  assert.equal(s500, LOGIN_SERVERFEHLER, "interner Servertext darf bei 5xx nicht durchschlagen");
});

test("4 — 429 und leere Bodies liefern immer einen nichtleeren, verständlichen Text", () => {
  for (const [status, body] of [[429, {}], [429, null], [400, {}], [418, null], [503, null]]) {
    const t = mapLoginError(status, body);
    assert.ok(typeof t === "string" && t.trim().length > 10, `${status}: leerer/zu kurzer Text: "${t}"`);
  }
});

// ══ Passwort vergessen / zurücksetzen ══

test("5 — Passwort vergessen: leerer Fehlerbody erzeugt NIE einen leeren Banner", () => {
  for (const body of [{}, null, { message: "x" }]) {
    const t = mapForgotError(400, body);
    assert.ok(t && t.trim().length > 10, `leerer Text für Body ${JSON.stringify(body)}`);
  }
  assert.ok(FORGOT_NEUTRAL_ERFOLG.includes("Falls zu dieser E-Mail-Adresse"), "neutraler Erfolgstext (keine Konto-Enumeration)");
});

test("6 — Reset: abgelaufen und ungültig sind unterscheidbar und handlungsleitend", () => {
  assert.equal(mapResetError(400, { code: "RESET_TOKEN_EXPIRED" }), RESET_ABGELAUFEN);
  assert.equal(mapResetError(400, { code: "INVALID_RESET_TOKEN" }), RESET_UNGUELTIG);
  assert.match(RESET_ABGELAUFEN, /neuen Link/);
  // Altes Backend ohne Code: dessen Text bleibt nutzbar; leer → generisch.
  assert.equal(mapResetError(400, { error: "Link ungültig oder abgelaufen" }), "Link ungültig oder abgelaufen");
  assert.ok(mapResetError(400, {}).trim().length > 10);
});

test("7 — Token-Prüfung: valid/expired/invalid/unlesbar korrekt klassifiziert", () => {
  assert.equal(classifyResetTokenCheck({ valid: true }).state, "valid");
  assert.equal(classifyResetTokenCheck({ valid: false, code: "RESET_TOKEN_EXPIRED" }).message, RESET_ABGELAUFEN);
  assert.equal(classifyResetTokenCheck({ valid: false }).message, RESET_UNGUELTIG);
  assert.equal(classifyResetTokenCheck(null).state, "unusable", "unlesbarer Body wird NICHT als gültig behandelt");
});

// ══ Geworfene Fehler ══

test("8 — Netzwerkfehler: nie „Failed to fetch“ beim Kunden", () => {
  const t = mapAuthThrownError(new TypeError("Failed to fetch"));
  assert.equal(t, AUTH_NETZFEHLER);
  assert.ok(!/Failed to fetch|TypeError/.test(t));
  const timeout = mapAuthThrownError(Object.assign(new Error("x"), { name: "TimeoutError" }));
  assert.match(timeout, /länger als erwartet/);
});

// ══ Quelltext-Invarianten der Seiten ══

test("9 — AuthPage: keine rohen e.message-Anzeigen, kein new Error(d.error), Body defensiv", () => {
  const page = strip(src("../pages/AuthPage.jsx"));
  assert.ok(!/setError\(e\.message\)/.test(page), "rohes e.message darf nicht mehr angezeigt werden");
  assert.ok(!/new Error\(d\.error\)/.test(page), "new Error(d.error) ohne Fallback erzeugte leere Banner");
  assert.ok(!/throw new Error\(d\.error \|\|/.test(page), "auch die Wurf-Variante ist ersetzt");
  assert.match(page, /readJson\(/, "der Body muss defensiv gelesen werden");
  for (const fn of ["mapLoginError", "mapForgotError", "mapResetError", "mapAuthThrownError"]) {
    assert.match(page, new RegExp(`${fn}\\(`), `${fn} wird nicht verwendet`);
  }
  // Login-ok-aber-Kundenbereich-Fehler wird sichtbar behandelt.
  assert.match(page, /const ok = await login\(/, "die login()-Rückgabe muss ausgewertet werden");
  assert.match(page, /KUNDENBEREICH_NACH_LOGIN_FEHLER/);
  // Token-Prüfung: kein stiller Rückfall mehr; Retry vorhanden.
  assert.match(page, /resetCheckFailed/);
  assert.match(page, /Link erneut prüfen/);
});

test("10 — AuthContext: Netz-/Serverfehler löschen das Token NICHT mehr", () => {
  const ctx = strip(src("../context/AuthContext.jsx"));
  assert.ok(!/\.catch\(\(\) => localStorage\.removeItem\("ce_token"\)\)/.test(ctx),
    "der alte Catch-Löscher der Mount-Prüfung darf nicht zurückkehren");
  assert.match(ctx, /sessionCheckFailed/, "der erklärte Fehlzustand fehlt");
  assert.match(ctx, /retrySessionCheck/, "der manuelle Retry fehlt");
  // 401/403 bleiben zentraler Logout (apiFetch) — der Mount behandelt sie separat.
  assert.match(ctx, /r\.status === 401 \|\| r\.status === 403/);
});

test("11 — ProtectedRoute: erklärter Zustand mit Retry statt stillem Redirect", () => {
  const route = strip(src("../routes/ProtectedRoute.jsx"));
  assert.match(route, /sessionCheckFailed/);
  assert.match(route, /role="alert"/);
  assert.match(route, /Erneut versuchen/);
  assert.match(route, /Zur Anmeldung/);
});
