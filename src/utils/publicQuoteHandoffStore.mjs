// ── Übergabe aus dem öffentlichen Preisrechner ───────────────────────────────
//
// Der Preisrechner (preisrechner.confidaraexpress.de) schickt einen Besucher mit
// seiner Tarifwahl auf
//   https://confidaraexpress.de/preisrechner-uebernahme#t=<Übergabetoken>
// Das Token ist verschlüsselt und trägt Eingaben und Tarifwahl; was darin steht,
// weiß ausschließlich der Server (POST /api/price-quote/handoff/verify). Diese
// Datei prüft nur die Form.
//
// Verbindliche Regeln:
//   • Gelesen wird ausschließlich auf /preisrechner-uebernahme, VOR dem ersten
//     Rendern (main.jsx, Muster startReferralCapture) — damit weder der Router
//     noch eine Weiterleitung das Fragment verliert.
//   • Das Fragment verschwindet sofort aus der Adresszeile (history.replaceState),
//     auch wenn es ungültig ist.
//   • Das Token liegt NUR in diesem Modulspeicher: kein localStorage, kein
//     sessionStorage, kein Cookie, keine Adresse. Ein Neuladen oder ein neuer Tab
//     verliert es bewusst — die Übernahme ist eine Vorbelegung, keine Zusage.
//   • Nach dem Login liest die Übernahmeseite es einmal (takePendingHandoff) und
//     prüft es beim Server; danach ist der Speicher leer.

export const HANDOFF_PATH = "/preisrechner-uebernahme";
export const HANDOFF_FRAGMENT_PARAM = "t";
// "h1." + base64url(IV | Ciphertext | Tag) — höchstens 4096 Zeichen insgesamt (Serververtrag).
export const HANDOFF_TOKEN_PATTERN = /^h1\.[A-Za-z0-9_-]{16,4093}$/;

export const HANDOFF_CAPTURE = Object.freeze({
  NONE: "none",
  CAPTURED: "captured",
  INVALID: "invalid",
});

let wartend = null;
let letzteErfassung = HANDOFF_CAPTURE.NONE;

/** Das Token aus einem Fragment („#t=…") — `null`, wenn keins da oder die Form nicht stimmt. */
export function handoffTokenFromHash(hash) {
  if (typeof hash !== "string" || !hash.startsWith("#")) return null;
  let wert;
  try {
    wert = new URLSearchParams(hash.slice(1)).get(HANDOFF_FRAGMENT_PARAM);
  } catch {
    return null;
  }
  return typeof wert === "string" && HANDOFF_TOKEN_PATTERN.test(wert) ? wert : null;
}

/** Steht im Fragment überhaupt ein Übergabeparameter (gültig oder nicht)? */
function fragmentTraegtUebergabe(hash) {
  if (typeof hash !== "string" || !hash.startsWith("#")) return false;
  try {
    return new URLSearchParams(hash.slice(1)).has(HANDOFF_FRAGMENT_PARAM);
  } catch {
    return false;
  }
}

/**
 * Beim Start der Anwendung aufrufen. Liest das Token auf /preisrechner-uebernahme und entfernt das
 * Fragment aus der Adresszeile. Jede andere Adresse bleibt unangetastet.
 *
 * @returns {"none"|"captured"|"invalid"}
 */
export function captureHandoffFromLocation({ win = typeof window === "undefined" ? null : window } = {}) {
  if (!win || !win.location) return HANDOFF_CAPTURE.NONE;
  const { pathname, hash } = win.location;
  if (pathname !== HANDOFF_PATH || !fragmentTraegtUebergabe(hash)) return HANDOFF_CAPTURE.NONE;
  try {
    win.history.replaceState(win.history.state, "", HANDOFF_PATH);
  } catch { /* ohne History-API bleibt nur die Adresszeile stehen */ }
  const token = handoffTokenFromHash(hash);
  wartend = token;
  letzteErfassung = token ? HANDOFF_CAPTURE.CAPTURED : HANDOFF_CAPTURE.INVALID;
  return letzteErfassung;
}

/** Ergebnis der letzten Erfassung (für die Übernahmeseite: ungültiges Token sofort melden). */
export function handoffCaptureState() {
  return letzteErfassung;
}

/** Wartet eine Übergabe? (Hinweisband auf der Anmeldeseite.) */
export function hasPendingHandoff() {
  return wartend !== null;
}

/** Das wartende Token, ohne es zu verbrauchen. */
export function peekPendingHandoff() {
  return wartend;
}

/** Das wartende Token — danach ist der Speicher leer. */
export function takePendingHandoff() {
  const t = wartend;
  wartend = null;
  letzteErfassung = HANDOFF_CAPTURE.NONE;
  return t;
}

/** Verwerfen (etwa nach einer Registrierung: bis zur Freischaltung bleibt nichts erhalten). */
export function clearPendingHandoff() {
  wartend = null;
  letzteErfassung = HANDOFF_CAPTURE.NONE;
}

/** Nur für Tests. */
export function __resetHandoffStoreForTests() {
  wartend = null;
  letzteErfassung = HANDOFF_CAPTURE.NONE;
}
