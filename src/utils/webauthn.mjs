/* ── Passkeys im Browser (Admin, Betreiberauftrag 2026-11-22, D7) ───────────────────────────────────────────────────
   Der Server (@simplewebauthn/server) liefert Optionen als JSON mit base64url-Werten und erwartet die Antwort des
   Browsers in derselben Form. Diese Datei übersetzt in beide Richtungen — ohne Bibliothek, ohne eigene Kryptografie:
   Schlüssel erzeugt und signiert allein der Authenticator des Geräts; Fingerabdruck oder Gesicht verlassen das Gerät
   nie, hier kommt nur die Signatur an.

   Bewusst eigene Umrechnung statt PublicKeyCredential.parse…FromJSON/toJSON: die gibt es erst in jüngeren Browsern, und
   die Umrechnung ist hier in Node prüfbar (webauthn.test.mjs). */

const B64URL = /^[A-Za-z0-9_-]*$/;

/** base64url (ohne Füllzeichen) → ArrayBuffer. Wirft bei ungültiger Eingabe. */
export function base64urlZuPuffer(text) {
  if (typeof text !== "string" || !B64URL.test(text)) throw new TypeError("Ungültiger base64url-Wert");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const roh = atob(b64);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes.buffer;
}

/** ArrayBuffer oder TypedArray → base64url ohne Füllzeichen. */
export function pufferZuBase64url(puffer) {
  const bytes = puffer instanceof ArrayBuffer ? new Uint8Array(puffer) : new Uint8Array(puffer.buffer, puffer.byteOffset, puffer.byteLength);
  let roh = "";
  for (let i = 0; i < bytes.length; i++) roh += String.fromCharCode(bytes[i]);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const zugangsdaten = (liste) => (Array.isArray(liste) ? liste : []).map((c) => ({
  type: c.type || "public-key",
  id: base64urlZuPuffer(c.id),
  ...(Array.isArray(c.transports) && c.transports.length ? { transports: c.transports } : {}),
}));

/** Server-JSON → PublicKeyCredentialCreationOptions (Einrichtung). */
export function erstellOptionen(json) {
  if (!json || typeof json !== "object" || !json.user || !json.rp) throw new TypeError("Unvollständige Einrichtungsoptionen");
  const { challenge, user, excludeCredentials, hints, ...rest } = json;
  return {
    ...rest,
    challenge: base64urlZuPuffer(challenge),
    user: { ...user, id: base64urlZuPuffer(user.id) },
    excludeCredentials: zugangsdaten(excludeCredentials),
  };
}

/** Server-JSON → PublicKeyCredentialRequestOptions (Anmeldung und Bestätigung). */
export function anfrageOptionen(json) {
  if (!json || typeof json !== "object" || typeof json.challenge !== "string") throw new TypeError("Unvollständige Anfrageoptionen");
  const { challenge, allowCredentials, hints, ...rest } = json;
  return { ...rest, challenge: base64urlZuPuffer(challenge), allowCredentials: zugangsdaten(allowCredentials) };
}

const erweiterungen = (cred) => {
  try { return typeof cred.getClientExtensionResults === "function" ? cred.getClientExtensionResults() : {}; } catch { return {}; }
};

/** Ergebnis von navigator.credentials.create → RegistrationResponseJSON. */
export function registrierungAlsJson(cred) {
  const r = cred.response;
  const antwort = {
    clientDataJSON: pufferZuBase64url(r.clientDataJSON),
    attestationObject: pufferZuBase64url(r.attestationObject),
  };
  if (typeof r.getTransports === "function") {
    try { antwort.transports = r.getTransports(); } catch { /* optional */ }
  }
  return {
    id: cred.id,
    rawId: pufferZuBase64url(cred.rawId),
    type: cred.type,
    response: antwort,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: erweiterungen(cred),
  };
}

/** Ergebnis von navigator.credentials.get → AuthenticationResponseJSON. */
export function bestaetigungAlsJson(cred) {
  const r = cred.response;
  return {
    id: cred.id,
    rawId: pufferZuBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: pufferZuBase64url(r.clientDataJSON),
      authenticatorData: pufferZuBase64url(r.authenticatorData),
      signature: pufferZuBase64url(r.signature),
      ...(r.userHandle ? { userHandle: pufferZuBase64url(r.userHandle) } : {}),
    },
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: erweiterungen(cred),
  };
}

/** Kann dieser Browser überhaupt Passkeys? (Die Plattform kann trotzdem keinen Authenticator haben.) */
export function passkeysVerfuegbar(umgebung = globalThis) {
  return Boolean(umgebung && umgebung.PublicKeyCredential && umgebung.navigator && umgebung.navigator.credentials
    && typeof umgebung.navigator.credentials.get === "function");
}

export const PASSKEY_TEXTE = Object.freeze({
  abgebrochen: "Die Bestätigung wurde abgebrochen oder ist abgelaufen. Bitte versuchen Sie es erneut.",
  schonVorhanden: "Auf diesem Gerät ist bereits ein Passkey für Ihr Konto gespeichert.",
  falscheAdresse: "Passkeys sind auf dieser Adresse nicht verfügbar. Bitte öffnen Sie den Adminbereich über confidaraexpress.de.",
  nichtUnterstuetzt: "Dieser Browser unterstützt keine Passkeys. Bitte verwenden Sie einen aktuellen Browser oder einen Wiederherstellungscode.",
  allgemein: "Der Passkey konnte nicht verwendet werden. Bitte versuchen Sie es erneut.",
});

/** Fehler des Browsers (DOMException) → verständlicher Satz. Nie die Rohmeldung. */
export function passkeyFehlertext(fehler, { einrichtung = false } = {}) {
  const name = fehler && fehler.name;
  if (name === "NotAllowedError" || name === "AbortError") return PASSKEY_TEXTE.abgebrochen;
  if (name === "InvalidStateError") return einrichtung ? PASSKEY_TEXTE.schonVorhanden : PASSKEY_TEXTE.allgemein;
  if (name === "SecurityError") return PASSKEY_TEXTE.falscheAdresse;
  if (name === "NotSupportedError") return PASSKEY_TEXTE.nichtUnterstuetzt;
  return PASSKEY_TEXTE.allgemein;
}

/** Fragt den Authenticator nach einer Bestätigung (Anmeldung, Step-up) und liefert die JSON-Antwort. */
export async function passkeyBestaetigen(optionenJson, { signal } = {}) {
  if (!passkeysVerfuegbar()) { const e = new Error("nicht unterstützt"); e.name = "NotSupportedError"; throw e; }
  const cred = await navigator.credentials.get({ publicKey: anfrageOptionen(optionenJson), signal });
  if (!cred) { const e = new Error("keine Antwort"); e.name = "NotAllowedError"; throw e; }
  return bestaetigungAlsJson(cred);
}

/** Legt mit dem Authenticator einen neuen Passkey an und liefert die JSON-Antwort. */
export async function passkeyErstellen(optionenJson, { signal } = {}) {
  if (!passkeysVerfuegbar()) { const e = new Error("nicht unterstützt"); e.name = "NotSupportedError"; throw e; }
  const cred = await navigator.credentials.create({ publicKey: erstellOptionen(optionenJson), signal });
  if (!cred) { const e = new Error("keine Antwort"); e.name = "NotAllowedError"; throw e; }
  return registrierungAlsJson(cred);
}
