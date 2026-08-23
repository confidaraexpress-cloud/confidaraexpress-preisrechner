// UAT T-003 — Passwort-Mindestlänge im Frontend.
//
// Geprüft wird zweigleisig, wie im Repo üblich (keine React-Render-Infrastruktur):
//   • die reine Regel aus passwordPolicy.mjs und getRegErrors() direkt, und
//   • der Quelltext der beteiligten Formulare als Contract-Test, damit keine
//     zweite Passwortregel neben der zentralen entsteht.
//
// Run: node --test src/utils/passwordPolicy.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import {
  PASSWORD_MIN_LEN, PASSWORD_MAX_LEN, passwordLength, passwordLengthError,
} from "./passwordPolicy.mjs";
import { getRegErrors, REG_PASSWORD_TEXTS } from "./registrationValidation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..");
const readSrc = (rel) => readFileSync(join(SRC, rel), "utf8");

const registerFormSrc = readSrc("components/auth/RegisterForm.jsx");
const authPageSrc     = readSrc("pages/AuthPage.jsx");
const profileSrc      = readSrc("components/dashboard/Profile.jsx");

// Gültiges Formular; nur das Passwort variiert je Test.
const VALID = {
  name: "Max Mustermann",
  email: "einkauf@muster-logistik.de",
  password: "SicheresPasswort1",
  company_name: "Muster Logistik GmbH",
  vat_id: "", street: "", zip: "", city: "", country: "DE",
};
// Baut Formular + passende Wiederholung — die Wiederholung wird separat geprüft.
const mitPasswort = (pw) => [{ ...VALID, password: pw }, pw];

/* ══════════ 1 — Die Regel ═══════════════════════════════════════════════ */

test("1 — Mindestlänge ist 8, Höchstlänge 128", () => {
  assert.equal(PASSWORD_MIN_LEN, 8);
  assert.equal(PASSWORD_MAX_LEN, 128);
});

test("2 — passwordLength zählt Code-Points, nicht UTF-16-Code-Units", () => {
  assert.equal(passwordLength("abcdefgh"), 8);
  // Vorbedingung: genau hier lag der Fehler.
  assert.equal("Ab1!xy\u{1F600}".length, 8);
  assert.equal(passwordLength("Ab1!xy\u{1F600}"), 7);
});

test("3 — passwordLength liefert null für Nicht-Strings (nie 0, nie undefined)", () => {
  for (const v of [1234567, true, null, undefined, ["a"], { length: 20 }]) {
    assert.equal(passwordLength(v), null);
  }
});

test("4 — passwordLengthError meldet zu kurz, zu lang, sonst null", () => {
  const t = { tooShort: "kurz", tooLong: "lang" };
  assert.equal(passwordLengthError("1234567", t), "kurz");
  assert.equal(passwordLengthError("", t), "kurz");
  assert.equal(passwordLengthError("12345678", t), null);
  assert.equal(passwordLengthError("a".repeat(128), t), null);
  assert.equal(passwordLengthError("a".repeat(129), t), "lang");
  // Ein Nicht-String kann nie ein gültiges Passwort sein.
  assert.equal(passwordLengthError(12345678, t), "kurz");
});

/* ══════════ 2 — Das Registrierungsformular ══════════════════════════════ */

test("5 — T-003: 7 Zeichen ergeben einen Feldfehler, das Formular ist nicht absendbar", () => {
  const errs = getRegErrors(...mitPasswort("Abc123!"));
  assert.ok(errs.password, "Kein Passwortfehler bei 7 Zeichen");
  assert.match(errs.password, /mindestens 8 Zeichen/);
  assert.ok(Object.keys(errs).length > 0, "regValid wäre true");
});

test("6 — jede Länge von 1 bis 7 wird abgelehnt", () => {
  for (let n = 1; n < PASSWORD_MIN_LEN; n++) {
    const errs = getRegErrors(...mitPasswort("a".repeat(n)));
    assert.ok(errs.password, `Länge ${n} wurde akzeptiert`);
  }
});

test("7 — leeres Passwort ist ein Pflichtfeldfehler, kein Längenfehler", () => {
  const errs = getRegErrors(...mitPasswort(""));
  assert.equal(errs.password, "Passwort ist ein Pflichtfeld.");
});

test("8 — sieben getippte Zeichen mit Emoji (.length === 8) werden abgelehnt", () => {
  const errs = getRegErrors(...mitPasswort("Ab1!xy\u{1F600}"));
  assert.ok(errs.password, "Ein 7-Zeichen-Passwort wurde akzeptiert");
  assert.match(errs.password, /mindestens 8 Zeichen/);
});

test("9 — exakt 8 Zeichen besteht die Längenprüfung", () => {
  const errs = getRegErrors(...mitPasswort("Abcd1234"));
  assert.equal(errs.password, undefined);
});

test("10 — mehr als 8 Zeichen besteht die Längenprüfung, 129 nicht", () => {
  assert.equal(getRegErrors(...mitPasswort("EinSicheresPasswort2026")).password, undefined);
  assert.equal(getRegErrors(...mitPasswort("a".repeat(PASSWORD_MAX_LEN))).password, undefined);
  assert.match(getRegErrors(...mitPasswort("a".repeat(PASSWORD_MAX_LEN + 1))).password, /maximal 128/);
});

test("11 — ein vollständiges, gültiges Formular ist absendbar (regValid === true)", () => {
  assert.deepEqual(getRegErrors(VALID, VALID.password), {});
});

/* ══════════ 3 — Passwort-Wiederholung ═══════════════════════════════════ */

test("12 — abweichende Wiederholung ist ungültig", () => {
  const errs = getRegErrors(VALID, "EinAnderesPasswort9");
  assert.equal(errs.passwordRepeat, "Die Passwörter stimmen nicht überein.");
});

test("13 — leere Wiederholung bei gesetztem Passwort ist ungültig", () => {
  assert.ok(getRegErrors(VALID, "").passwordRepeat);
});

test("14 — identische Wiederholung erzeugt keinen Fehler", () => {
  assert.equal(getRegErrors(VALID, VALID.password).passwordRepeat, undefined);
});

test("15 — ein zu kurzes Passwort meldet BEIDE Fehler, wenn die Wiederholung abweicht", () => {
  const errs = getRegErrors({ ...VALID, password: "Abc123!" }, "anders");
  assert.ok(errs.password, "Längenfehler fehlt");
  assert.ok(errs.passwordRepeat, "Wiederholungsfehler fehlt");
});

/* ══════════ 4 — Keine zweite Regel im Frontend ══════════════════════════ */

test("16 — die Fehlertexte kommen aus der zentralen Konstante", () => {
  assert.equal(REG_PASSWORD_TEXTS.tooShort, "Passwort muss mindestens 8 Zeichen enthalten.");
  assert.equal(REG_PASSWORD_TEXTS.tooLong,  "Passwort darf maximal 128 Zeichen enthalten.");
});

test("17 — kein Modul prüft die Passwortlänge noch selbst", () => {
  const treffer = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(jsx?|mjs)$/.test(name)) continue;
      if (name.endsWith(".test.mjs")) continue;          // Tests dürfen die Zahl nennen
      if (full.endsWith(join("utils", "passwordPolicy.mjs"))) continue;
      const src = readFileSync(full, "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const line of code.split("\n")) {
        if (/(password|passwort)/i.test(line) && /\.length\s*[<>]=?\s*(8|128)\b/.test(line)) {
          treffer.push(`${relative(SRC, full)}: ${line.trim()}`);
        }
      }
    }
  };
  walk(SRC);
  assert.deepEqual(treffer, [], `Duplizierte Passwortregel:\n${treffer.join("\n")}`);
});

test("18 — alle drei Passwortformulare beziehen die zentrale Regel", () => {
  for (const [name, src] of [
    ["RegisterForm.jsx", registerFormSrc],
    ["AuthPage.jsx",     authPageSrc],
    ["Profile.jsx",      profileSrc],
  ]) {
    assert.match(src, /from ["'][^"']*passwordPolicy\.mjs["']/, `${name}: kein Import der zentralen Regel`);
  }
});

test("19 — die sichtbare Zusage im Formular kommt aus derselben Konstante", () => {
  // Vorher stand „min. 8 Zeichen" als Text im JSX, während die Prüfung eine
  // eigene 8 trug. Beide Zahlen konnten unabhängig voneinander wandern.
  assert.match(registerFormSrc, /min\. \{PASSWORD_MIN_LEN\} Zeichen/);
  assert.match(registerFormSrc, /Mind\. \$\{PASSWORD_MIN_LEN\} Zeichen/);
  assert.equal(`min. ${PASSWORD_MIN_LEN} Zeichen`, "min. 8 Zeichen", "Wortlaut geändert");
});

test("20 — das Zurücksetzen-Formular prüft jetzt AUCH die Obergrenze", () => {
  // Vorher: nur `newPassword.length < 8`, kein Maximum — >128 fiel erst
  // serverseitig auf.
  assert.match(authPageSrc, /passwordLengthError\(newPassword, RESET_PASSWORD_TEXTS\)/);
  assert.match(authPageSrc, /tooLong:\s*`Passwort darf maximal \$\{PASSWORD_MAX_LEN\} Zeichen haben`/);
});

/* ══════════ 5 — Der gesperrte CTA erklärt sich ══════════════════════════ */

test("24 — das Passwortfeld meldet die Länge beim Verlassen zurück", () => {
  // Gemessen im Browser-Smoke: bei zu kurzem Passwort ist der CTA deaktiviert,
  // und Chromium unterdrückt dann AUCH die implizite Absendung per Enter —
  // handleRegister lief also nie, und der Kunde sah einen gesperrten Knopf ganz
  // ohne Begründung. Die Rückmeldung hängt deshalb am Verlassen des Feldes.
  assert.match(registerFormSrc, /onBlur=\{\(\) => onPasswordBlur\?\.\(\)\}/);
  assert.match(authPageSrc, /const handleRegPasswordBlur = \(\) => \{/);
  assert.match(authPageSrc, /onPasswordBlur=\{handleRegPasswordBlur\}/);
  // PasswordField muss die Prop überhaupt durchreichen — sonst verschwindet sie
  // still (dieselbe Falle wie früher bei autoComplete im Standardmodus).
  const pwField = readSrc("components/ui/PasswordField.jsx");
  assert.equal((pwField.match(/onBlur=\{onBlur\}/g) || []).length, 2,
    "onBlur wird nicht in beiden Modi durchgereicht");
});

test("25 — ein LEERES Passwortfeld erzeugt beim Verlassen keinen Fehler", () => {
  // Keine Fehlerwand auf leerem Formular (Designsystem-Regel).
  const block = authPageSrc.slice(
    authPageSrc.indexOf("const handleRegPasswordBlur"),
    authPageSrc.indexOf("const handleRegPasswordRepeat"),
  );
  assert.match(block, /regForm\.password \? passwordLengthError\(/);
  assert.match(block, /: null/);
});

/* ══════════ 6 — Das Frontend ersetzt die Serverprüfung nicht ════════════ */

test("21 — der Registrierungsrequest wertet Feldfehler des Backends aus", () => {
  // Das Backend liefert bei einem zu kurzen Passwort { error, code, field:"password" };
  // ohne dieses Mapping stünde der Fehler nur als Banner statt am Feld.
  assert.match(authPageSrc, /mapApiRegistrationError\(d\)/);
  assert.match(readSrc("utils/registrationValidation.mjs"), /"password"/);
});

test("22 — handleRegister validiert vor dem Senden erneut (nicht nur der Button)", () => {
  const block = authPageSrc.slice(
    authPageSrc.indexOf("const handleRegister"),
    authPageSrc.indexOf("const handleForgot"),
  );
  const validateIdx = block.indexOf("getRegErrors(");
  const fetchIdx    = block.indexOf("fetch(");
  assert.ok(validateIdx > -1 && fetchIdx > -1, "Validierung oder Request nicht gefunden");
  assert.ok(validateIdx < fetchIdx, "Der Request läuft vor der Validierung");
  assert.match(block, /if \(Object\.keys\(errs\)\.length > 0\)[\s\S]{0,80}return;/);
});

test("23 — kein Passwortwert wird geloggt", () => {
  for (const [name, src] of [["AuthPage.jsx", authPageSrc], ["Profile.jsx", profileSrc]]) {
    for (const line of src.split("\n")) {
      if (/console\.(log|info|warn|error)/.test(line)) {
        assert.ok(!/password|passwort/i.test(line), `${name}: Passwort im Log — ${line.trim()}`);
      }
    }
  }
});
