// Passwortregeln für NEU vergebene Passwörter (Registrierung, Zurücksetzen,
// Passwortänderung im Profil).
//
// SPIEGEL des Backends: lib/passwordPolicy.js in confidaraexpress-api.
// Grenzwerte, Zählweise und Prüfreihenfolge sind bewusst identisch gehalten.
// Das Frontend ersetzt die serverseitige Prüfung NICHT — die verbindliche
// Validierung liegt im Backend (POST /register, POST /auth/reset-password,
// PATCH /kunde/password). Die Regeln hier sorgen nur dafür, dass Nutzende den
// Fehler sofort sehen, statt erst nach dem Absenden.
//
// ── Warum diese Datei existiert (UAT T-003) ─────────────────────────────────
// Die Mindestlänge 8 stand als Zahlenliteral an drei Stellen im Frontend
// (registrationValidation.mjs, AuthPage.handleReset, Profile.validatePwForm)
// und an vier Stellen im Backend. AuthPage.handleReset prüfte dabei NUR die
// Untergrenze, die Obergrenze fehlte dort ganz. Sieben Kopien einer Regel sind
// sieben Stellen, an denen sie auseinanderlaufen kann.
//
// Gezählt wird in Unicode-CODE-POINTS, nicht über String.prototype.length:
// `.length` zählt UTF-16-Code-Units, sodass ein Passwort aus sieben getippten
// Zeichen mit einem Emoji darin 8 misst und die Prüfung bestand — die
// Oberfläche verspricht „min. 8 Zeichen", die Prüfung hielt das nicht.
//
// Bewusste Grenze: Code-Points, keine Graphem-Cluster (Basiszeichen +
// kombinierender Akzent zählt als zwei). Identisch zum Backend, ohne
// Intl.Segmenter — beide Seiten müssen dieselbe Zahl messen.

export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 128;

// Zeichenanzahl in Code-Points. Nicht-Strings haben KEINE Länge → null, damit
// ein Aufrufer sie nie versehentlich mit 0 verrechnet.
export function passwordLength(value) {
  if (typeof value !== "string") return null;
  return Array.from(value).length;
}

// Längenfehler eines NEU zu setzenden Passworts → Fehlertext oder null.
//
// `texts` hält die Wortlaute je Formular, damit die bestehenden, an mehreren
// Stellen getesteten Meldungen wortgleich bleiben. Die REGEL steht nur hier;
// variabel ist ausschließlich die Formulierung.
export function passwordLengthError(value, texts) {
  const len = passwordLength(value);
  if (len === null) return texts.tooShort;   // Nicht-String kann kein gültiges Passwort sein
  if (len < PASSWORD_MIN_LEN) return texts.tooShort;
  if (len > PASSWORD_MAX_LEN) return texts.tooLong;
  return null;
}
