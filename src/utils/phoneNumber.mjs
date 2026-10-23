/* utils/phoneNumber.mjs — DER TELEFONVERTRAG (Paket A, Betreiberentscheidung D8, 2026-10-23).

   Reine Funktionen, gespiegelt aus Backend `lib/phoneNumber.js`; beide prüfen gegen dieselbe Falltabelle
   (src/testing/phoneNumberCases.json ↔ Backend tests/fixtures/phoneNumberCases.json, bytegleich, Prüfsumme in
   beiden Tests). Das Backend bleibt autoritativ — hier wird vorgeprüft, damit der Fehler direkt am Feld steht,
   und die Übertragungsform berechnet, damit der Kunde sieht, was ein Versanddienst bekommt.

   ─── WAS DAS MODUL TUT — UND WAS NICHT ───────────────────────────────────────
   • erkennt übliche Schreibweisen: Landesvorwahl mit + oder 00, „(0)“ nach der Vorwahl, Leerzeichen, Punkte,
     Schrägstriche, Klammern, eine Durchwahl nach Bindestrich oder Schrägstrich oder einem Wort wie „Durchwahl“,
     „DW“, „ext.“, „App.“;
   • bildet daraus einen KOMPAKTEN Kern (nur Ziffern, bei internationaler Schreibweise mit führendem +) und die
     Durchwahl getrennt;
   • liefert je Zielfeld die Übertragungsform und sagt ausdrücklich, wenn die Durchwahl dort nicht mitgeht.

   Es ERFINDET nichts: keine Landesvorwahl wird ergänzt, nichts wird gekürzt, nichts geraten. Die Schreibweise des
   Kunden geht unverändert weiter, wenn sie ins Zielfeld passt und keine Umschrift braucht.

   ─── KEIN ANBIETERNAME ───────────────────────────────────────────────────────
   Die Zielfelder heißen hier nach ihrer Größe, nicht nach dem Einkaufsweg: das ALLGEMEINE Feld (35 Zeichen, die
   übliche Grenze der Versandschnittstellen), das UNBEGRENZTE (keine belegte Grenze) und das KOMPAKTE Feld
   (15 Zeichen — es gilt für die Tarife mit Abgabe im Paketshop und für GLS). Welche Produkte das sind, sagt der
   Server am Angebot; die Oberfläche verzweigt nirgends an einem Anbieter. */

export const PHONE_CORE_MIN_DIGITS = 6;
export const PHONE_CORE_MAX_DIGITS = 15;
export const PHONE_EXTENSION_MAX_DIGITS = 6;
export const PHONE_INPUT_MAX = 40;

export const PHONE_ERROR = Object.freeze({
  MISSING: Object.freeze({ code: "PHONE_MISSING", error: "Telefonnummer ist ein Pflichtfeld." }),
  INPUT_TOO_LONG: Object.freeze({ code: "PHONE_INPUT_TOO_LONG", error: `Telefonnummer darf maximal ${PHONE_INPUT_MAX} Zeichen enthalten.` }),
  INVALID: Object.freeze({
    code: "PHONE_INVALID",
    error: "Telefonnummer nicht erkannt. Erlaubt sind Ziffern, ein führendes + oder 00, Leerzeichen, Klammern, Punkt und Schrägstrich; eine Durchwahl folgt nach einem Bindestrich (Beispiel: +49 9751 564454-456).",
  }),
  TOO_SHORT: Object.freeze({ code: "PHONE_TOO_SHORT", error: `Telefonnummer zu kurz: mindestens ${PHONE_CORE_MIN_DIGITS} Ziffern (ohne Durchwahl).` }),
  TOO_LONG: Object.freeze({ code: "PHONE_TOO_LONG", error: `Telefonnummer zu lang: höchstens ${PHONE_CORE_MAX_DIGITS} Ziffern (ohne Durchwahl).` }),
  EXTENSION_TOO_LONG: Object.freeze({ code: "PHONE_EXTENSION_TOO_LONG", error: `Durchwahl zu lang: höchstens ${PHONE_EXTENSION_MAX_DIGITS} Ziffern.` }),
});

// Die Zielfelder und ihre belegten Grenzen (Zeichen der Übertragungsform). `null` = keine belegte Grenze.
export const PHONE_TARGET = Object.freeze({
  GENERAL:   Object.freeze({ key: "general",   maxLength: 35 }),
  UNBOUNDED: Object.freeze({ key: "unbounded", maxLength: null }),
  COMPACT:   Object.freeze({ key: "compact",   maxLength: 15 }),
});

const EXTENSION_WORD_RE = /^(.*?)[\s,;:]*(?:durchwahl|dw|extension|ext\.?|apparat|app\.?|x)\s*[:.\-]?\s*(\d{1,12})$/i;
const EXTENSION_SEP_RE = /^(.*\d)\s*[-/]\s*(\d{1,12})$/;
const CORE_CHARS_RE = /^\+?[0-9 ().\/-]+$/;
const TRUNK_IN_PARENS_RE = /^(\+\s*\d{1,3}|00\s*\d{1,3})\s*\(\s*0\s*\)\s*/;

const istText = (w) => typeof w === "string";

function bereinigen(raw) {
  return raw
    .replace(/[‐-―−﹘﹣－]/g, "-")
    .replace(/／/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** → { ok:true, original, core, extension, international, digits, needsRewrite } | { ok:false, code, error } */
export function parsePhoneNumber(raw) {
  if (!istText(raw)) return { ok: false, ...PHONE_ERROR.MISSING };
  const original = bereinigen(raw);
  if (original === "") return { ok: false, ...PHONE_ERROR.MISSING };
  if (original.length > PHONE_INPUT_MAX) return { ok: false, ...PHONE_ERROR.INPUT_TOO_LONG };

  let kernText = original;
  let extension = null;
  let needsRewrite = false;
  const wort = original.match(EXTENSION_WORD_RE);
  if (wort && wort[1].trim() !== "") {
    kernText = wort[1];
    extension = wort[2];
    needsRewrite = true;
  } else {
    const trenner = original.match(EXTENSION_SEP_RE);
    if (trenner && (trenner[1].match(/\d/g) || []).length >= PHONE_CORE_MIN_DIGITS) {
      kernText = trenner[1];
      extension = trenner[2];
      if (!/\d-\d{1,6}$/.test(original)) needsRewrite = true;
    }
  }

  let k = kernText.trim();
  if (TRUNK_IN_PARENS_RE.test(k)) needsRewrite = true;
  k = k.replace(TRUNK_IN_PARENS_RE, "$1 ");
  if (!CORE_CHARS_RE.test(k)) return { ok: false, ...PHONE_ERROR.INVALID };
  if (k.indexOf("+") > 0 || (k.match(/\+/g) || []).length > 1) return { ok: false, ...PHONE_ERROR.INVALID };
  let tiefe = 0;
  for (const z of k) {
    if (z === "(") tiefe += 1;
    else if (z === ")") { tiefe -= 1; if (tiefe < 0) return { ok: false, ...PHONE_ERROR.INVALID }; }
  }
  if (tiefe !== 0) return { ok: false, ...PHONE_ERROR.INVALID };

  let international = k.startsWith("+");
  let ziffern = k.replace(/\D/g, "");
  if (!international && ziffern.startsWith("00")) {
    international = true;
    ziffern = ziffern.slice(2);
    needsRewrite = true;
  }
  if (ziffern.length === 0) return { ok: false, ...PHONE_ERROR.INVALID };
  if (ziffern.length < PHONE_CORE_MIN_DIGITS) return { ok: false, ...PHONE_ERROR.TOO_SHORT };
  if (ziffern.length > PHONE_CORE_MAX_DIGITS) return { ok: false, ...PHONE_ERROR.TOO_LONG };
  if (extension !== null && extension.length > PHONE_EXTENSION_MAX_DIGITS) {
    return { ok: false, ...PHONE_ERROR.EXTENSION_TOO_LONG };
  }

  return {
    ok: true,
    original,
    core: international ? `+${ziffern}` : ziffern,
    extension,
    international,
    digits: ziffern.length,
    needsRewrite,
  };
}

/** Die Übertragungsform für EIN Zielfeld — Regel wie im Backend (Original, wenn es passt und keine Umschrift
    nötig ist; sonst Kern plus „-Durchwahl“; sonst nur der Kern; passt nicht einmal der, `null`). */
export function phoneTransmission(parsed, target) {
  const p = parsed && typeof parsed === "object" && parsed.ok === true ? parsed : null;
  if (!p) return { value: null, extensionOmitted: false, tooLong: false, rewritten: false };
  const max = target && Number.isInteger(target.maxLength) && target.maxLength > 0 ? target.maxLength : null;
  if (!p.needsRewrite && (max === null || p.original.length <= max)) {
    return { value: p.original, extensionOmitted: false, tooLong: false, rewritten: false };
  }
  if (max !== null && p.core.length > max) return { value: null, extensionOmitted: false, tooLong: true, rewritten: true };
  if (p.extension === null) {
    return { value: p.core, extensionOmitted: false, tooLong: false, rewritten: p.core !== p.original };
  }
  const mit = `${p.core}-${p.extension}`;
  if (max !== null && mit.length > max) return { value: p.core, extensionOmitted: true, tooLong: false, rewritten: true };
  return { value: mit, extensionOmitted: false, tooLong: false, rewritten: mit !== p.original };
}

/** Rohwert → Übertragungsform; ein nicht erkannter Wert geht unverändert (getrimmt) mit (`fallback`). */
export function phoneForTarget(raw, target) {
  const parsed = parsePhoneNumber(raw);
  if (!parsed.ok) {
    const roh = istText(raw) ? raw.trim() : "";
    return { value: roh === "" ? null : roh, extensionOmitted: false, tooLong: false, rewritten: false, fallback: true, parsed: null };
  }
  const t = phoneTransmission(parsed, target);
  return { ...t, fallback: false, parsed };
}

/* ─── Der Hinweis unter dem Telefonfeld ───────────────────────────────────────
   Nur, wenn die Übertragung von der Schreibweise des Kunden abweicht oder das kompakte Zielfeld die Durchwahl
   nicht mitnimmt — damit nichts still geschieht (D8). Nennt die Übertragungsform wörtlich; „Paketshop- und
   GLS-Tarife“ beschreibt die Produkte mit dem kompakten Feld. Bei einer fehlerhaften Eingabe steht die
   Fehlermeldung am Feld, hier dann nichts. */
export const PHONE_HINT_TEXT = Object.freeze({
  transmitted: (wert) => `Übermittelt wird ${wert}.`,
  portalWithoutExtension: (wert, durchwahl) => `Bei Paketshop- und GLS-Tarifen ohne Durchwahl ${durchwahl}: ${wert}.`,
  portalTooLong: "Für Paketshop- und GLS-Tarife ist die Nummer zu lang (höchstens 15 Zeichen ohne Leerzeichen); diese Angebote bleiben gesperrt.",
});

export function phoneTransmissionHint(raw) {
  const p = parsePhoneNumber(raw);
  if (!p.ok) return null;
  const allgemein = phoneTransmission(p, PHONE_TARGET.GENERAL);
  const kompakt = phoneTransmission(p, PHONE_TARGET.COMPACT);
  const teile = [];
  if (allgemein.rewritten && allgemein.value) teile.push(PHONE_HINT_TEXT.transmitted(allgemein.value));
  if (kompakt.tooLong) teile.push(PHONE_HINT_TEXT.portalTooLong);
  else if (kompakt.extensionOmitted) teile.push(PHONE_HINT_TEXT.portalWithoutExtension(kompakt.value, p.extension));
  else if (kompakt.rewritten && kompakt.value !== allgemein.value) teile.push(PHONE_HINT_TEXT.transmitted(kompakt.value).replace("Übermittelt wird", "Bei Paketshop- und GLS-Tarifen übermittelt wird"));
  return teile.length ? teile.join(" ") : null;
}
