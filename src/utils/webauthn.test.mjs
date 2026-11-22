import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  base64urlZuPuffer, pufferZuBase64url, erstellOptionen, anfrageOptionen, registrierungAlsJson, bestaetigungAlsJson,
  passkeysVerfuegbar, passkeyFehlertext, PASSKEY_TEXTE,
} from "./webauthn.mjs";

const bytes = (...b) => new Uint8Array(b).buffer;
const gleich = (a, b) => assert.deepEqual([...new Uint8Array(a)], [...new Uint8Array(b)]);

test("W1 — base64url hin und zurück, ohne Füllzeichen, auch mit - und _", () => {
  for (const laenge of [0, 1, 2, 3, 4, 31, 32, 33]) {
    const roh = new Uint8Array(laenge).map((_, i) => (i * 37 + 250) % 256);
    const text = pufferZuBase64url(roh.buffer);
    assert.doesNotMatch(text, /[=+/]/);
    gleich(base64urlZuPuffer(text), roh.buffer);
  }
  assert.equal(pufferZuBase64url(bytes(0xfb, 0xff)), "-_8");
  gleich(base64urlZuPuffer("-_8"), bytes(0xfb, 0xff));
  // TypedArray mit Versatz: nur der Ausschnitt zählt.
  const gross = new Uint8Array([9, 1, 2, 3, 9]);
  assert.equal(pufferZuBase64url(gross.subarray(1, 4)), pufferZuBase64url(bytes(1, 2, 3)));
  assert.throws(() => base64urlZuPuffer("ab+c"), TypeError);
  assert.throws(() => base64urlZuPuffer(null), TypeError);
});

test("W2 — Einrichtungsoptionen: Challenge, Nutzerkennung und ausgeschlossene Passkeys werden Puffer; Rest bleibt", () => {
  const o = erstellOptionen({
    challenge: "AQID", rp: { name: "ConfidaraExpress", id: "confidaraexpress.de" },
    user: { id: "BAUG", name: "admin@example.test", displayName: "Admin" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }], timeout: 120000, attestation: "none",
    authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
    excludeCredentials: [{ id: "BwgJ", type: "public-key", transports: ["internal"] }, { id: "Cgs" }],
    hints: ["client-device"],
  });
  gleich(o.challenge, bytes(1, 2, 3));
  gleich(o.user.id, bytes(4, 5, 6));
  assert.equal(o.user.name, "admin@example.test");
  assert.equal(o.rp.id, "confidaraexpress.de");
  assert.equal(o.authenticatorSelection.userVerification, "required");
  assert.equal(o.excludeCredentials.length, 2);
  gleich(o.excludeCredentials[0].id, bytes(7, 8, 9));
  assert.deepEqual(o.excludeCredentials[0].transports, ["internal"]);
  assert.equal(o.excludeCredentials[1].type, "public-key");
  assert.equal("transports" in o.excludeCredentials[1], false);
  assert.equal("hints" in o, false, "hints kennt nicht jeder Browser");
  assert.throws(() => erstellOptionen({ challenge: "AQID" }), TypeError);
});

test("W3 — Anfrageoptionen: Challenge und erlaubte Passkeys als Puffer, rpId und Nutzerverifikation bleiben", () => {
  const o = anfrageOptionen({ challenge: "AQID", rpId: "confidaraexpress.de", userVerification: "required", timeout: 120000,
    allowCredentials: [{ id: "BwgJ", type: "public-key" }] });
  gleich(o.challenge, bytes(1, 2, 3));
  gleich(o.allowCredentials[0].id, bytes(7, 8, 9));
  assert.equal(o.rpId, "confidaraexpress.de");
  assert.equal(o.userVerification, "required");
  assert.deepEqual(anfrageOptionen({ challenge: "AQID" }).allowCredentials, []);
  assert.throws(() => anfrageOptionen({}), TypeError);
});

test("W4 — Antworten des Browsers werden zu JSON in genau der Form, die der Server prüft", () => {
  const reg = registrierungAlsJson({
    id: "Cgs", rawId: bytes(10, 11), type: "public-key", authenticatorAttachment: "platform",
    response: { clientDataJSON: bytes(1), attestationObject: bytes(2, 3), getTransports: () => ["internal", "hybrid"] },
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  });
  assert.deepEqual(reg, { id: "Cgs", rawId: "Cgs", type: "public-key",
    response: { clientDataJSON: "AQ", attestationObject: "AgM", transports: ["internal", "hybrid"] },
    authenticatorAttachment: "platform", clientExtensionResults: { credProps: { rk: true } } });

  const best = bestaetigungAlsJson({
    id: "Cgs", rawId: bytes(10, 11), type: "public-key", authenticatorAttachment: null,
    response: { clientDataJSON: bytes(1), authenticatorData: bytes(4), signature: bytes(5, 6), userHandle: bytes(7) },
  });
  assert.deepEqual(best.response, { clientDataJSON: "AQ", authenticatorData: "BA", signature: "BQY", userHandle: "Bw" });
  assert.deepEqual(best.clientExtensionResults, {});
  assert.equal(best.authenticatorAttachment, undefined);
  const ohneHandle = bestaetigungAlsJson({ id: "a", rawId: bytes(1), type: "public-key",
    response: { clientDataJSON: bytes(1), authenticatorData: bytes(1), signature: bytes(1), userHandle: null } });
  assert.equal("userHandle" in ohneHandle.response, false);
});

test("W5 — Verfügbarkeit und Fehlertexte: nie die Rohmeldung des Browsers", () => {
  assert.equal(passkeysVerfuegbar({}), false);
  assert.equal(passkeysVerfuegbar({ PublicKeyCredential: function () {}, navigator: { credentials: { get() {} } } }), true);
  assert.equal(passkeyFehlertext({ name: "NotAllowedError", message: "The operation either timed out or was not allowed." }), PASSKEY_TEXTE.abgebrochen);
  assert.equal(passkeyFehlertext({ name: "InvalidStateError" }, { einrichtung: true }), PASSKEY_TEXTE.schonVorhanden);
  assert.equal(passkeyFehlertext({ name: "InvalidStateError" }), PASSKEY_TEXTE.allgemein);
  assert.equal(passkeyFehlertext({ name: "SecurityError" }), PASSKEY_TEXTE.falscheAdresse);
  assert.equal(passkeyFehlertext({ name: "NotSupportedError" }), PASSKEY_TEXTE.nichtUnterstuetzt);
  assert.equal(passkeyFehlertext(new Error("roh")), PASSKEY_TEXTE.allgemein);
  for (const t of Object.values(PASSKEY_TEXTE)) assert.doesNotMatch(t, /WebAuthn|DOMException|credential/i);
});

test("W6 — keine Biometrie, keine Bibliothek, keine eigene Kryptografie in der Browserseite", () => {
  const quelle = readFileSync(new URL("./webauthn.mjs", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(quelle, /^import /m, "die Umrechnung braucht keine Abhängigkeit");
  assert.doesNotMatch(quelle, /crypto\.subtle|fingerprint|biometr|faceid/i);
});
