import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SICHERHEIT_PATH, SICHERHEIT_TEXT as T, sitzungsZeile, sitzungsListe, passkeyZeile, passkeyNameEingabe,
  sicherheitsFehlertext, codesAlsText, datumText, datumZeitText,
} from "./adminSicherheit.mjs";

test("S1 — Sitzungen: nur erfasste Angaben, nichts erfunden; aktuelle zuerst, dann die neuesten", () => {
  const z = sitzungsZeile({ id: "7", channel: "admin", method: "passkey", device: "Safari · iPhone", originHost: "admin.confidaraexpress.de",
    issuedAt: "2026-11-22T13:05:00.000Z", expiresAt: "2026-11-29T13:05:00.000Z", current: true });
  assert.deepEqual(z, { id: "7", geraet: "Safari · iPhone", aktuell: true, zusatz: "Adminbereich · Passwort und Passkey",
    herkunft: "über admin.confidaraexpress.de", seit: "Angemeldet am 22.11.2026, 14:05 Uhr", bis: "gültig bis 29.11.2026" });
  const leer = sitzungsZeile({ id: 8, channel: "unbekannt", method: "unknown", device: null, originHost: null, issuedAt: null, expiresAt: "kaputt" });
  assert.equal(leer.geraet, "Browser nicht erkannt");
  assert.equal(leer.zusatz, "");
  assert.equal(leer.herkunft, "");
  assert.equal(leer.seit, "Angemeldet am —");
  assert.equal(leer.bis, "gültig bis —");
  assert.equal(sitzungsZeile({}), null);
  const liste = sitzungsListe({ sessions: [
    { id: "1", issuedAt: "2026-11-20T10:00:00Z" }, { id: "2", issuedAt: "2026-11-22T10:00:00Z" },
    { id: "3", issuedAt: "2026-11-01T10:00:00Z", current: true }, { kaputt: true },
  ] });
  assert.deepEqual(liste.map((x) => x.id), ["3", "2", "1"]);
  assert.deepEqual(sitzungsListe(null), []);
});

test("S2 — Passkeys: Art ehrlich benannt, Name 1–60 Zeichen, sonst vergibt der Server einen", () => {
  const p = passkeyZeile({ id: 5, name: " MacBook ", synced: true, createdAt: "2026-11-22T08:00:00Z", lastUsedAt: null });
  assert.deepEqual(p, { id: "5", name: "MacBook", art: T.synchronisiert, erstellt: "Eingerichtet am 22.11.2026",
    benutzt: "Noch nicht zur Anmeldung verwendet" });
  assert.equal(passkeyZeile({ id: "6", synced: false, lastUsedAt: "2026-11-22T09:30:00Z" }).art, T.geraetegebunden);
  assert.equal(passkeyZeile({ id: "6", synced: false, lastUsedAt: "2026-11-22T09:30:00Z" }).benutzt, "Zuletzt verwendet am 22.11.2026, 10:30 Uhr");
  assert.equal(passkeyNameEingabe("  Büro   Laptop "), "Büro Laptop");
  assert.equal(passkeyNameEingabe("   "), null);
  assert.equal(passkeyNameEingabe("x".repeat(61)), null);
  assert.equal(passkeyNameEingabe(42), null);
});

test("S3 — Fachfehler werden Sätze; Codes nie im Klartext eines Fehlers; Step-up-Abbruch erklärt", () => {
  assert.equal(sicherheitsFehlertext(400, { code: "CURRENT_PASSWORD_INVALID" }), "Das Passwort ist nicht korrekt.");
  assert.equal(sicherheitsFehlertext(409, { code: "LAST_PASSKEY" }), T.letzter);
  assert.equal(sicherheitsFehlertext(428, { code: "STEP_UP_REQUIRED" }), "Die Aktion wurde nicht bestätigt und deshalb nicht ausgeführt.");
  assert.equal(sicherheitsFehlertext(429, {}), "Zu viele Versuche. Bitte warten Sie 15 Minuten.");
  assert.equal(sicherheitsFehlertext(500, { error: "intern" }), "Das hat gerade nicht geklappt. Bitte versuchen Sie es erneut.");
});

test("S4 — Codes als Datei: nur Codes und Erstellzeit, keine Konto- oder Personenangaben", () => {
  const text = codesAlsText(["AAAA-BBBB-CCCC-DDDD", "", null, "EEEE-FFFF-GGGG-HHHH"], { erstellt: new Date("2026-11-22T13:05:00Z") });
  assert.match(text, /^ConfidaraExpress – Wiederherstellungscodes für den Adminbereich\nErstellt am 22\.11\.2026, 14:05 Uhr\./);
  assert.match(text, /\nAAAA-BBBB-CCCC-DDDD\nEEEE-FFFF-GGGG-HHHH\n/);
  assert.doesNotMatch(text, /@|null/);
});

test("S5 — Pfad, Datumsformat in Berliner Zeit, Texte ohne Fachjargon", () => {
  assert.equal(ADMIN_SICHERHEIT_PATH, "/admin/sicherheit");
  assert.equal(datumText("2026-11-22T23:30:00Z"), "23.11.2026", "Berliner Zeit, nicht UTC");
  assert.equal(datumZeitText(undefined), "—");
  for (const t of Object.values(T).filter((v) => typeof v === "string")) assert.doesNotMatch(t, /WebAuthn|FIDO|Credential|Token|jti/i);
});
