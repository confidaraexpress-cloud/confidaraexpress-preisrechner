// Tests für die reine E-Mail-Änderungs-Logik. Läuft über node --test (`npm test`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_RE, EMAIL_MAX_LENGTH, SESSION_EXPIRED_ERROR, isSessionExpiredBody,
  validateEmailChangeForm, isEmailChangeFormValid,
  mapEmailChangeStartError, EMAIL_CHANGE_START_GENERIC, EMAIL_CHANGE_RATE_LIMIT,
  mapEmailChangeResendError, EMAIL_CHANGE_RESEND_GENERIC, isResendRequestGone,
  classifyEmailChangeConfirm, isRetryableConfirmState, hasUsableToken,
} from "./emailChangeView.mjs";

const CURRENT = "alt@firma.de";

// ── Validierung ──────────────────────────────────────────────────────────────
test("1 — leere neue E-Mail wird als Pflichtfeld erkannt", () => {
  const e = validateEmailChangeForm({ newEmail: "   ", currentPassword: "pw" }, CURRENT);
  assert.ok(e.newEmail);
});

test("2 — ungültiges Format wird abgewiesen (Projektregex)", () => {
  const e = validateEmailChangeForm({ newEmail: "keine-email", currentPassword: "pw" }, CURRENT);
  assert.ok(e.newEmail);
  // Regex-Selbsttest (identisch zum Rest des Projekts)
  assert.equal(EMAIL_RE.test("neu@firma.de"), true);
  assert.equal(EMAIL_RE.test("neu@firma"), false);
});

test("3 — zu lange Adresse (>255) wird abgewiesen", () => {
  const long = "a".repeat(EMAIL_MAX_LENGTH) + "@x.de";
  const e = validateEmailChangeForm({ newEmail: long, currentPassword: "pw" }, CURRENT);
  assert.ok(e.newEmail);
});

test("4 — neue E-Mail identisch zur aktuellen (case-sensitive) wird abgewiesen", () => {
  const same = validateEmailChangeForm({ newEmail: "alt@firma.de", currentPassword: "pw" }, CURRENT);
  assert.ok(same.newEmail);
  // Groß-/Kleinschreibung zählt als UNTERSCHIEDLICH (keine Normalisierung):
  const differentCase = validateEmailChangeForm({ newEmail: "Alt@firma.de", currentPassword: "pw" }, CURRENT);
  assert.equal(differentCase.newEmail, undefined, "andere Schreibweise ist nicht identisch");
});

test("5 — nur getrimmt, niemals kleingeschrieben", () => {
  // Führende/anhängende Spaces werden entfernt; Groß-/Kleinschreibung bleibt.
  const e = validateEmailChangeForm({ newEmail: "  Neu@Firma.DE  ", currentPassword: "pw" }, CURRENT);
  assert.deepEqual(e, {}, "getrimmt + gültig + nicht identisch → keine Fehler");
});

test("6 — fehlendes aktuelles Passwort wird erkannt", () => {
  const e = validateEmailChangeForm({ newEmail: "neu@firma.de", currentPassword: "" }, CURRENT);
  assert.ok(e.currentPassword);
});

test("7 — isEmailChangeFormValid spiegelt die Validierung", () => {
  assert.equal(isEmailChangeFormValid({ newEmail: "neu@firma.de", currentPassword: "pw" }, CURRENT), true);
  assert.equal(isEmailChangeFormValid({ newEmail: "neu@firma.de", currentPassword: "" }, CURRENT), false);
  assert.equal(isEmailChangeFormValid({ newEmail: "alt@firma.de", currentPassword: "pw" }, CURRENT), false);
});

// ── Session-Sentinel (fachlicher 401 vs. echte Session) ─────────────────────
test("8 — nur der Session-Sentinel-Body ist eine abgelaufene Sitzung", () => {
  assert.equal(isSessionExpiredBody({ error: SESSION_EXPIRED_ERROR }), true);
  assert.equal(isSessionExpiredBody({ code: "CURRENT_PASSWORD_INVALID" }), false);
  assert.equal(isSessionExpiredBody({}), false);
  assert.equal(isSessionExpiredBody(null), false);
});

// ── Start-Fehlermapping ──────────────────────────────────────────────────────
test("9 — Start-Fehlercodes werden auf verständliche Texte gemappt", () => {
  assert.match(mapEmailChangeStartError("CURRENT_PASSWORD_INVALID"), /aktuelle Passwort ist nicht korrekt/);
  assert.match(mapEmailChangeStartError("EMAIL_CHANGE_EMAIL_INVALID"), /gültige E-Mail-Adresse/);
  assert.match(mapEmailChangeStartError("EMAIL_CHANGE_SAME_EMAIL"), /entspricht bereits/);
  assert.match(mapEmailChangeStartError("EMAIL_CHANGE_EMAIL_UNAVAILABLE"), /kann nicht verwendet werden/);
  assert.match(mapEmailChangeStartError("EMAIL_CHANGE_CONFIGURATION_ERROR"), /derzeit nicht verfügbar/);
});

test("10 — unbekannter Start-Code → generisch, keine Rohcodes", () => {
  const msg = mapEmailChangeStartError("SOME_INTERNAL_DB_CONSTRAINT");
  assert.equal(msg, EMAIL_CHANGE_START_GENERIC);
  assert.doesNotMatch(msg, /SOME_INTERNAL|CONSTRAINT/i);
});

test("11 — Rate-Limit-Text ist gesondert vorhanden", () => {
  assert.match(EMAIL_CHANGE_RATE_LIMIT, /Zu viele Versuche/);
});

// ── Resend-Fehlermapping ─────────────────────────────────────────────────────
test("12 — Resend-Fehlercodes werden gemappt", () => {
  assert.match(mapEmailChangeResendError("EMAIL_CHANGE_REQUEST_NOT_FOUND"), /keine ausstehende/);
  assert.match(mapEmailChangeResendError("EMAIL_CHANGE_RESEND_TOO_SOON"), /warte kurz/);
  assert.match(mapEmailChangeResendError("EMAIL_CHANGE_EMAIL_UNAVAILABLE"), /inzwischen nicht mehr/);
  assert.equal(mapEmailChangeResendError("???"), EMAIL_CHANGE_RESEND_GENERIC);
});

test("13 — nur REQUEST_NOT_FOUND erzwingt Reconcile", () => {
  assert.equal(isResendRequestGone("EMAIL_CHANGE_REQUEST_NOT_FOUND"), true);
  assert.equal(isResendRequestGone("EMAIL_CHANGE_RESEND_TOO_SOON"), false);
});

// ── Confirm-Klassifikation ───────────────────────────────────────────────────
test("14 — ok → success", () => {
  assert.equal(classifyEmailChangeConfirm({ ok: true, status: 200 }), "success");
});

test("15 — belegte Ziel-E-Mail → unavailable (unabhängig vom Status)", () => {
  assert.equal(classifyEmailChangeConfirm({ ok: false, status: 409, code: "EMAIL_CHANGE_EMAIL_UNAVAILABLE" }), "unavailable");
});

test("16 — 4xx ohne unavailable-Code → invalid (ungültig/abgelaufen)", () => {
  for (const status of [400, 401, 403, 404, 409, 410, 422]) {
    assert.equal(classifyEmailChangeConfirm({ ok: false, status }), "invalid", `status ${status}`);
  }
});

test("17 — Netzwerk/429/5xx → error (transient, retrybar)", () => {
  assert.equal(classifyEmailChangeConfirm({ ok: false, status: 0 }), "error");
  assert.equal(classifyEmailChangeConfirm({ ok: false }), "error");
  assert.equal(classifyEmailChangeConfirm({ ok: false, status: 429 }), "error");
  assert.equal(classifyEmailChangeConfirm({ ok: false, status: 500 }), "error");
  assert.equal(classifyEmailChangeConfirm({ ok: false, status: 503 }), "error");
});

test("18 — nur der transiente Zustand erlaubt Retry", () => {
  assert.equal(isRetryableConfirmState("error"), true);
  assert.equal(isRetryableConfirmState("invalid"), false);
  assert.equal(isRetryableConfirmState("unavailable"), false);
  assert.equal(isRetryableConfirmState("success"), false);
});

// ── Token-Vorprüfung ─────────────────────────────────────────────────────────
test("19 — hasUsableToken nur bei nicht-leerem String", () => {
  assert.equal(hasUsableToken("abc"), true);
  assert.equal(hasUsableToken("   "), false);
  assert.equal(hasUsableToken(""), false);
  assert.equal(hasUsableToken(null), false);
  assert.equal(hasUsableToken(undefined), false);
});
