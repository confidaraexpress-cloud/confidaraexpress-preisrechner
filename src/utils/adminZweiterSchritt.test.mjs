import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ZWEITER_SCHRITT_TEXT as T, ZWEITER_SCHRITT_FEHLER as F, zweiterSchrittAus, zweiterSchrittFehler, codeEingabe,
} from "./adminZweiterSchritt.mjs";

const TICKET = "t".repeat(43);

test("Z1 — nur eine vollständige Antwort mit Ticket und Passkey-Optionen startet den zweiten Schritt", () => {
  assert.deepEqual(zweiterSchrittAus({ secondFactorRequired: true, loginTicket: TICKET, passkeyOptions: { challenge: "AQID" }, recoveryAvailable: true }),
    { loginTicket: TICKET, passkeyOptions: { challenge: "AQID" }, recoveryAvailable: true });
  assert.equal(zweiterSchrittAus({ secondFactorRequired: true, loginTicket: TICKET, passkeyOptions: { challenge: "AQID" } }).recoveryAvailable, false);
  for (const d of [null, {}, { token: "x" }, { secondFactorRequired: "true", loginTicket: TICKET, passkeyOptions: { challenge: "a" } },
    { secondFactorRequired: true, loginTicket: "kurz", passkeyOptions: { challenge: "a" } },
    { secondFactorRequired: true, loginTicket: TICKET }, { secondFactorRequired: true, loginTicket: TICKET, passkeyOptions: {} }]) {
    assert.equal(zweiterSchrittAus(d), null, JSON.stringify(d));
  }
});

test("Z2 — Ablehnungen werden verständlich; ein verbrauchtes Ticket führt zurück zum Passwort", () => {
  assert.deepEqual(zweiterSchrittFehler(401, { code: "LOGIN_TICKET_INVALID" }), { text: F.LOGIN_TICKET_INVALID, neuAnmelden: true });
  assert.deepEqual(zweiterSchrittFehler(401, { code: "PASSKEY_VERIFICATION_FAILED" }), { text: F.PASSKEY_VERIFICATION_FAILED, neuAnmelden: false });
  assert.deepEqual(zweiterSchrittFehler(401, { code: "RECOVERY_CODE_INVALID" }), { text: F.RECOVERY_CODE_INVALID, neuAnmelden: false });
  assert.deepEqual(zweiterSchrittFehler(429, { code: "LOGIN_TICKET_INVALID" }), { text: F.ZU_VIELE, neuAnmelden: false });
  assert.deepEqual(zweiterSchrittFehler(401, null), { text: F.LOGIN_TICKET_INVALID, neuAnmelden: true });
  assert.deepEqual(zweiterSchrittFehler(500, { error: "intern", code: "UNAVAILABLE" }), { text: F.SERVER, neuAnmelden: false });
  for (const t of Object.values(F)) assert.doesNotMatch(t, /[A-Z]{2,}_[A-Z]+|WebAuthn|Ticket/);
});

test("Z3 — Codeeingabe: nur Rand-Leerraum weg, Länge begrenzt; Texte ohne Fachjargon", () => {
  assert.equal(codeEingabe("  abcd-efgh-jkmn-pqrs \n"), "abcd-efgh-jkmn-pqrs");
  assert.equal(codeEingabe(null), "");
  assert.equal(codeEingabe("x".repeat(100)).length, 40);
  assert.match(T.codeVerbraucht(0), /letzten Wiederherstellungscode/);
  assert.match(T.codeVerbraucht(1), /Noch 1 Wiederherstellungscode übrig/);
  assert.match(T.codeVerbraucht(4), /Noch 4 Wiederherstellungscodes übrig/);
  for (const t of Object.values(T).filter((v) => typeof v === "string")) assert.doesNotMatch(t, /WebAuthn|FIDO|Credential/i);
});

test("Z4 — die Admin-Anmeldeseite nutzt den zweiten Schritt und speichert nie ein Ticket dauerhaft", () => {
  const seite = readFileSync(new URL("../pages/AdminAnmeldungPage.jsx", import.meta.url), "utf8");
  assert.match(seite, /zweiterSchrittAus\(d\)/);
  assert.match(seite, /adminPasskeyAnmelden\(/);
  assert.match(seite, /adminCodeAnmelden\(/);
  assert.match(seite, /passkeyBestaetigen\(/);
  assert.doesNotMatch(seite, /(local|session)Storage\.setItem\([^)]*[Tt]icket/, "das Ticket bleibt im Arbeitsspeicher der Seite");
  // Der Passkey wird per Klick angefordert (Safari verlangt eine Nutzergeste), nicht automatisch nach dem Passwort.
  assert.match(seite, /onClick=\{passkeyAnmelden\}/);
});
