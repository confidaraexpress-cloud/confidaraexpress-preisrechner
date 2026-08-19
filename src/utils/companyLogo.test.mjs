// Firmenlogo — reine Anzeigelogik + Quelltextprüfung der Einbindung.
//
// Zwei Teile:
//   A) companyLogoView.mjs (rein) — Metadatenlesen, Formatierung, Sofortprüfung,
//      Fehlertext. Das ist die Logik, die in jeder Oberfläche gilt.
//   B) Die Einbindung: dass der Chip wirklich auf die Initiale zurückfällt, dass
//      der Zugriff über die Serviceschicht läuft, dass kein Personenbildbegriff
//      entsteht und dass nichts persistiert wird, was nicht persistiert werden darf.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPANY_LOGO_TEXT, LOGO_ACCEPT, LOGO_MAX_BYTES, LOGO_MIME_TYPES,
  companyLogoMeta, hasCompanyLogo, formatLogoSize, formatLogoDimensions,
  preCheckLogoFile, logoErrorMessage,
} from "./companyLogoView.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const view     = lies("./companyLogoView.mjs");
const api      = lies("../api/companyLogoApi.js");
const hook     = lies("../hooks/useCompanyLogo.js");
const chip     = lies("../components/ui/UserChip.jsx");
const profil   = lies("../components/dashboard/Profile.jsx");
const auth     = lies("../context/AuthContext.jsx");
const overview = lies("../styles/overview.css");
const premium  = lies("../styles/dashboard-premium.css");

const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const meta = (over = {}) => ({
  version: "abcdef0123456789", mimeType: "image/png",
  sizeBytes: 24576, width: 320, height: 120, updatedAt: "2026-01-02T03:04:05Z", ...over,
});

/* ══════════ A — reine Logik ═══════════════════════════════════════════════ */

test("1 — ein Konto OHNE das Feld ist ein gültiger Zustand, kein Fehler", () => {
  // Das ist der Zustand gegen ein Backend, das die Logofunktion noch nicht
  // ausgeliefert hat: das Feld fehlt schlicht. Es darf nichts brechen.
  for (const user of [undefined, null, {}, { name: "Kunde" }, { companyLogo: null }]) {
    assert.equal(companyLogoMeta(user), null);
    assert.equal(hasCompanyLogo(user), false);
  }
});

test("2 — unbrauchbare Metadaten gelten als „kein Logo“, nicht als halber Zustand", () => {
  // Ohne Version kann das Bild gar nicht abgerufen werden (die Version ist der
  // Cacheschlüssel) — dann ist „kein Logo“ die einzige ehrliche Aussage.
  for (const bad of ["", 42, null, undefined]) {
    assert.equal(companyLogoMeta({ companyLogo: meta({ version: bad }) }), null, `version=${bad}`);
  }
  for (const bad of ["string", 42, [], true]) {
    assert.equal(companyLogoMeta({ companyLogo: bad }), null);
  }
  assert.deepEqual(companyLogoMeta({ companyLogo: meta() }), meta());
  assert.equal(hasCompanyLogo({ companyLogo: meta() }), true);
});

test("3 — Größe und Maße werden nur angezeigt, wenn sie belastbar sind", () => {
  assert.equal(formatLogoSize(512), "512 B");
  assert.equal(formatLogoSize(24576), "24 KB");
  assert.equal(formatLogoSize(2 * 1024 * 1024), "2.0 MB");
  for (const bad of [0, -1, null, undefined, NaN, "24576"]) assert.equal(formatLogoSize(bad), null);

  assert.equal(formatLogoDimensions(meta()), "320 × 120 px");
  // Der Server kann die Maße eines JPEG nicht immer lesen — dann steht dort
  // nichts, statt eine erfundene Zahl.
  assert.equal(formatLogoDimensions(meta({ width: null, height: null })), null);
  assert.equal(formatLogoDimensions(meta({ width: 0, height: 10 })), null);
  assert.equal(formatLogoDimensions(null), null);
});

test("4 — die Sofortprüfung fängt die drei offensichtlichen Fälle ab", () => {
  assert.equal(preCheckLogoFile(null), null, "ohne Datei gibt es nichts zu prüfen");
  assert.equal(preCheckLogoFile({ type: "image/png", size: 1000 }), null);
  assert.equal(preCheckLogoFile({ type: "image/jpeg", size: LOGO_MAX_BYTES }), null, "exakt am Limit ist gültig");

  assert.match(preCheckLogoFile({ type: "image/svg+xml", size: 100 }), /SVG/);
  assert.match(preCheckLogoFile({ type: "image/gif", size: 100 }), /PNG- oder JPEG-Datei/);
  assert.match(preCheckLogoFile({ type: "application/pdf", size: 100 }), /PNG- oder JPEG-Datei/);
  assert.match(preCheckLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 }), /zu groß/);
  assert.match(preCheckLogoFile({ type: "image/png", size: 0 }), /leer/);
});

test("5 — ein leerer Dateityp wird NICHT abgelehnt: darüber entscheidet der Server", () => {
  // Manche Systeme liefern für eine gewählte Datei gar keinen Typ. Die
  // Clientprüfung ist Komfort — sie darf keine gültige Datei blockieren, deren
  // Typ sie nur nicht kennt. Der Server prüft ohnehin die Dateisignatur.
  assert.equal(preCheckLogoFile({ type: "", size: 1000 }), null);
  assert.equal(preCheckLogoFile({ type: undefined, size: 1000 }), null);
  // ... die Größe greift aber trotzdem.
  assert.match(preCheckLogoFile({ type: "", size: LOGO_MAX_BYTES + 1 }), /zu groß/);
});

test("6 — die Fehlermeldung des Servers gewinnt; nur ohne Text greift der Ersatz", () => {
  assert.equal(logoErrorMessage({ error: "Die Datei ist kein gültiges PNG- oder JPEG-Bild." }),
    "Die Datei ist kein gültiges PNG- oder JPEG-Bild.");
  assert.equal(logoErrorMessage({}), COMPANY_LOGO_TEXT.genericError);
  assert.equal(logoErrorMessage(null), COMPANY_LOGO_TEXT.genericError);
  assert.equal(logoErrorMessage({ error: "   " }), COMPANY_LOGO_TEXT.genericError);
  assert.equal(logoErrorMessage({ error: 42 }), COMPANY_LOGO_TEXT.genericError);
  assert.equal(logoErrorMessage({}, COMPANY_LOGO_TEXT.removeError), COMPANY_LOGO_TEXT.removeError);
});

test("7 — die Grenzwerte spiegeln den Backendvertrag, ohne ihn zu ersetzen", () => {
  assert.equal(LOGO_MAX_BYTES, 512 * 1024, "512 KiB — wie COMPANY_LOGO_MAX_BYTES");
  assert.deepEqual(LOGO_MIME_TYPES, ["image/png", "image/jpeg"]);
  assert.equal(LOGO_ACCEPT, "image/png,image/jpeg");
  assert.ok(!/svg/i.test(LOGO_ACCEPT), "SVG darf nicht einmal im Dateidialog vorgeschlagen werden");
  // Die Datei sagt selbst, dass sie keine Sicherheitsprüfung ist — das ist der
  // Punkt, an dem ein späterer Leser sonst falsch abbiegt.
  assert.match(view, /KEINE Sicherheitsprüfung/, "der Vorbehalt fehlt im Modulkopf");
});

/* ══════════ B — Einbindung ════════════════════════════════════════════════ */

test("8 — das Bild ist das Logo des UNTERNEHMENS, nirgends ein Personenbild", () => {
  // Kein avatar/profile_picture/userImage — weder als Feldname noch als Klasse.
  // ConfidaraExpress hat kein Personenbildmodell, und dieses Feature führt keines ein.
  for (const datei of [view, api, hook, ohneKommentare(chip)]) {
    assert.ok(!/profile_picture|profilePicture|userAvatar|user_avatar|avatarUrl/.test(datei),
      "ein Personenbildbegriff ist in den Logodateien aufgetaucht");
  }
  assert.match(view, /companyLogo/, "das Feld heißt nicht companyLogo");
  assert.match(api, /company-logo/, "der Endpunkt heißt nicht company-logo");
});

test("9 — der Zugriff läuft über die Serviceschicht, nicht über fetch in der Oberfläche", () => {
  assert.match(api, /import \{ apiFetch \} from "\.\/client"/, "der Service nutzt nicht das zentrale apiFetch");
  assert.ok(!/\bfetch\(/.test(ohneKommentare(chip)), "im Chip steht ein eigenes fetch");
  assert.ok(!/\bfetch\(/.test(ohneKommentare(hook)), "im Hook steht ein eigenes fetch");
  // Auch das Profil ruft ausschließlich die Servicefunktionen auf.
  assert.match(profil, /import \{ uploadCompanyLogo, deleteCompanyLogo \} from "\.\.\/\.\.\/api\/companyLogoApi"/,
    "das Profil greift nicht über die Serviceschicht zu");
  const profilCode = ohneKommentare(profil);
  assert.ok(!/fetch\(`?\$?\{?[^)]*company-logo/.test(profilCode), "im Profil steht ein direkter Aufruf des Logopfads");
});

test("10 — der Endpunkt trägt keine Konto-ID: Mandantentrennung steht serverseitig", () => {
  // Eine ID im Pfad wäre eine ID, die sich manipulieren ließe. Es gibt keine.
  assert.match(api, /const LOGO_PATH = "\/api\/kunde\/company-logo"/, "der Pfad hat sich geändert");
  assert.ok(!/LOGO_PATH.*\$\{/.test(api), "an den Pfad wird etwas angehängt");
  assert.ok(!/userId|user_id|\/\$\{id\}/.test(ohneKommentare(api)), "eine Konto-ID fließt in den Aufruf ein");
});

test("11 — DREI Wege führen zur Initiale zurück; keiner endet in einer leeren Fläche", () => {
  const c = ohneKommentare(chip);
  // (a) kein Logo / Backend ohne Feld → logoUrl ist null
  assert.match(c, /export function CompanyMark\(\{ initial, logoUrl = null \}\)/,
    "CompanyMark nimmt kein logoUrl mit sicherem Vorgabewert entgegen");
  assert.match(c, /if \(logoUrl && !failed\)/, "die Weiche zwischen Bild und Initiale fehlt");
  // (b) Abruf scheitert → der Service liefert null statt zu werfen
  assert.match(api, /catch \{\s*return null;/, "der Service wirft statt auf null zurückzufallen");
  assert.match(api, /if \(!r\.ok\) return null;/, "ein Fehlerstatus führt nicht auf null");
  // (c) Bild lädt, ist aber unbrauchbar → onError
  assert.match(c, /onError=\{\(\) => setFailed\(true\)\}/, "der Bildfehler wird nicht abgefangen");
  // Und der Fehlerzustand wird beim Quellenwechsel zurückgesetzt: ein einmal
  // kaputtes Bild darf ein danach hochgeladenes gültiges nicht blockieren.
  assert.match(c, /useEffect\(\(\) => \{ setFailed\(false\); \}, \[logoUrl\]\)/,
    "der Fehlerzustand wird beim Wechsel der Quelle nicht zurückgesetzt");
  // Der SVG-Squircle mit Initiale ist in jedem Fall die Rückfallebene.
  assert.match(c, /accountInitials/, "die Initiale kommt nicht aus der gemeinsamen Quelle");
});

test("12 — das Logo wird NICHT persistiert: keine Storage-Kopie, kein Base64", () => {
  // Es gibt genau eine Kopie im Arbeitsspeicher (Object-URL) und sie wird beim
  // Abmelden freigegeben. Weder localStorage noch sessionStorage noch ein
  // Base64-Feld im Profil sind beteiligt.
  for (const [name, datei] of [["api", api], ["hook", hook], ["chip", chip], ["view", view]]) {
    assert.ok(!/localStorage|sessionStorage/.test(ohneKommentare(datei)), `${name} greift auf Storage zu`);
    assert.ok(!/base64|toDataURL|FileReader/i.test(ohneKommentare(datei)), `${name} baut eine Base64-Kopie`);
  }
  assert.match(api, /URL\.revokeObjectURL/, "die Object-URL wird nie freigegeben");
  assert.match(auth, /clearCompanyLogoCache\(\)/, "der Abmeldepfad gibt das Bild nicht frei");
  // Zwei Stellen: der sichtbare Logout UND der zentrale 401/403-Handler.
  assert.equal((auth.match(/clearCompanyLogoCache\(\)/g) || []).length, 2,
    "der Zwischenspeicher wird nicht an beiden Abmeldewegen geleert");
});

test("13 — ein Abruf je Fassung; die Version ist der Cache-Schlüssel", () => {
  // Der Chip hängt an vier Stellen im Baum und wird bei jedem Bereichswechsel
  // neu montiert — ohne Zwischenspeicher liefe bei jeder Navigation ein Abruf.
  assert.match(api, /cachedVersion === version && cachedUrl/, "der Zwischenspeicher greift nicht");
  assert.match(api, /inFlight/, "gleichzeitige Abrufe werden nicht zusammengeführt");
  assert.match(hook, /companyLogoMeta\(user\)\?\.version/, "der Hook hängt nicht an der Version");
  assert.match(hook, /\}, \[version\]\)/, "der Effekt hängt nicht ausschließlich an der Version");
  // Nach dem Speichern wird die neue Version ins Konto gespiegelt — genau das
  // ist der Cache-Busting-Mechanismus.
  assert.match(profil, /updateUser\(\{ companyLogo: d\.companyLogo \?\? null \}\)/,
    "die neue Fassung wird nicht ins Konto gespiegelt");
  assert.match(profil, /updateUser\(\{ companyLogo: null \}\)/, "das Entfernen wird nicht gespiegelt");
});

test("14 — das Bild wird eingepasst, nie verzerrt und nie angeschnitten", () => {
  // Ein Kundenlogo hat ein beliebiges Seitenverhältnis. `cover` würde
  // beschneiden, ein gesetztes width+height ohne object-fit stauchen.
  for (const [name, css, sel] of [
    ["Chip", overview, ".ce-comark-img"],
    ["Profilvorschau", premium, ".profile-logo-preview"],
  ]) {
    const block = css.replace(/\/\*[\s\S]*?\*\//g, "").match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1];
    assert.ok(block, `${sel} fehlt`);
    assert.match(block, /object-fit:\s*contain/, `${name}: das Bild wird nicht eingepasst`);
    assert.ok(!/object-fit:\s*(cover|fill)/.test(block), `${name}: das Bild würde beschnitten oder gestaucht`);
    assert.match(block, /border-radius:\s*var\(--ce-radius-/, `${name}: der Radius kommt nicht aus den Tokens`);
    assert.ok(!/#[0-9a-fA-F]{3,8}/.test(block), `${name}: ein Farbliteral steht in der Regel`);
  }
});

test("15 — die Sektion nennt Zweck, Grenzen und den SVG-Grund", () => {
  // Ein Kunde, der ein Logo hinterlegt, erwartet es sonst auf Rechnungen oder
  // Labels. Die Karte sagt ausdrücklich, wo es NICHT erscheint.
  assert.match(COMPANY_LOGO_TEXT.description, /Kundenportal/);
  assert.match(COMPANY_LOGO_TEXT.description, /nicht.*Versandlabel|Versandlabel.*nicht/s);
  assert.match(COMPANY_LOGO_TEXT.requirements, /PNG oder JPEG/);
  assert.match(COMPANY_LOGO_TEXT.requirements, /512 KB/);
  assert.match(COMPANY_LOGO_TEXT.svgHint, /Sicherheitsgründen/);
  // Ohne Logo sagt die Karte, was stattdessen zu sehen ist.
  assert.match(COMPANY_LOGO_TEXT.empty, /Anfangsbuchstaben/);
  // Und die Texte stehen im Modul, nicht im JSX.
  for (const schluessel of ["title", "description", "requirements", "empty", "remove"]) {
    assert.ok(COMPANY_LOGO_TEXT[schluessel], `COMPANY_LOGO_TEXT.${schluessel} fehlt`);
  }
  assert.ok(!profil.includes(COMPANY_LOGO_TEXT.description), "der Erklärtext steht als Literal im JSX");
});

test("16 — die Bedienung nutzt die Foundation-Primitives, kein Eigenbau", () => {
  const abschnitt = profil.slice(profil.indexOf("renderCompanyLogoCard"), profil.indexOf("renderSecurityCard"));
  assert.match(abschnitt, /className="btn btn-outline btn-sm"/, "der Uploadknopf ist kein .btn");
  assert.match(abschnitt, /className="btn btn-ghost btn-sm"/, "das Entfernen ist kein .btn");
  assert.match(abschnitt, /<FormAlert tone="error"/, "Fehler laufen nicht über das gemeinsame Bauteil");
  assert.match(abschnitt, /className="profile-saved" role="status"/, "die Quittung folgt nicht dem Kartenmuster");
  // Das native Dateifeld bleibt ein echtes Formularelement, nur unsichtbar —
  // es wird nicht durch ein Klickziel ohne Semantik ersetzt.
  assert.match(abschnitt, /type="file"/, "es gibt kein echtes Dateifeld");
  assert.match(abschnitt, /className="sr-only"/, "das Dateifeld nutzt nicht die vorhandene Verbergeklasse");
  assert.match(abschnitt, /accept=\{LOGO_ACCEPT\}/, "der Dateidialog schlägt nicht die erlaubten Typen vor");
  // Kein Zuschneide-Editor, keine Bildbearbeitung, keine Ablagefläche — das war
  // ausdrücklich nicht Teil der Aufgabe.
  assert.ok(!/crop|canvas|onDrop|dragOver/i.test(abschnitt), "es ist ein Bildeditor entstanden");
});

test("17 — der Dateidialog wird nach jeder Auswahl zurückgesetzt", () => {
  // Ohne das Zurücksetzen löst dieselbe Datei beim zweiten Wählen kein
  // change-Ereignis aus — der Kunde klickt, und nichts passiert.
  const abschnitt = profil.slice(profil.indexOf("const onLogoSelected"), profil.indexOf("const onLogoRemove"));
  assert.match(abschnitt, /e\.target\.value = "";/, "das Dateifeld wird nicht zurückgesetzt");
  const posReset = abschnitt.indexOf('e.target.value = ""');
  const posUpload = abschnitt.indexOf("await uploadCompanyLogo");
  assert.ok(posReset < posUpload, "das Zurücksetzen läuft nicht vor dem Hochladen");
});
