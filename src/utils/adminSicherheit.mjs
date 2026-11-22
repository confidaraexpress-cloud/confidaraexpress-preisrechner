/* ── Sicherheit: Passkeys, Wiederherstellungscodes, angemeldete Geräte (Betreiberauftrag 2026-11-22, D7) ──────────
   Reine Funktionen und Texte für die Seite „Sicherheit“ im Adminbereich und die Geräteliste im Partnerkonto. Gezeigt
   wird nur, was der Server tatsächlich erfasst: Zeitpunkte, Bereich, Anmeldeweg, grobe Browserkennung, Herkunftshost.
   Keine erfundene Gerätebezeichnung — fehlt die Kennung, steht das ehrlich da. */

export const ADMIN_SICHERHEIT_PATH = "/admin/sicherheit";

export const SICHERHEIT_TEXT = Object.freeze({
  titel: "Sicherheit",
  untertitel: "Passkeys, Wiederherstellungscodes und angemeldete Geräte Ihres Adminkontos.",
  pflicht: "Für den Adminbereich ist ein Passkey erforderlich. Richten Sie ihn jetzt ein — danach stehen alle Bereiche wieder offen.",
  einrichtenTitel: "Passkey einrichten",
  einrichtenText: "Mit einem Passkey bestätigen Sie die Anmeldung zusätzlich zum Passwort – per Fingerabdruck, Gesichtserkennung oder Geräte-PIN. Fingerabdruck und Gesicht verlassen Ihr Gerät nie; ConfidaraExpress erhält nur einen öffentlichen Schlüssel.",
  einrichtenPasswort: "Aktuelles Passwort",
  einrichtenPasswortHilfe: "Zur Sicherheit bestätigen Sie die Einrichtung mit Ihrem aktuellen Passwort.",
  einrichtenKnopf: "Passkey einrichten",
  einrichtenLaeuft: "Warte auf Ihr Gerät …",
  passkeysTitel: "Passkeys",
  passkeysLeer: "Noch kein Passkey eingerichtet.",
  weitererKnopf: "Weiteren Passkey hinzufügen",
  weitererText: "Richten Sie einen zweiten Passkey auf einem weiteren Gerät ein. So bleibt der Zugang erhalten, wenn ein Gerät verloren geht.",
  synchronisiert: "Synchronisiert über Ihr Gerätekonto",
  geraetegebunden: "Nur auf einem Gerät gespeichert",
  umbenennen: "Umbenennen",
  speichern: "Speichern",
  abbrechen: "Abbrechen",
  entfernen: "Entfernen",
  entfernenFrage: (name) => `Passkey „${name}“ entfernen? Mit diesem Passkey ist danach keine Anmeldung mehr möglich.`,
  letzter: "Der letzte Passkey bleibt. Fügen Sie zuerst einen weiteren hinzu, wenn Sie diesen ersetzen möchten.",
  nameLabel: "Name des Passkeys",
  codesTitel: "Wiederherstellungscodes",
  codesText: "Fehlt Ihr Gerät, melden Sie sich mit Passwort und einem dieser Codes an. Jeder Code gilt einmal.",
  codesRest: (n) => (n === 1 ? "Noch 1 Code übrig." : `Noch ${n} Codes übrig.`),
  codesKnapp: "Nur noch wenige Codes übrig. Erzeugen Sie rechtzeitig neue.",
  codesNeuKnopf: "Neue Codes erzeugen",
  codesNeuFrage: "Neue Codes erzeugen? Alle bisherigen Codes werden sofort ungültig.",
  codesZeigenTitel: "Ihre Wiederherstellungscodes",
  codesZeigenText: "Diese Codes werden nur jetzt angezeigt. Speichern Sie sie sicher, zum Beispiel in einem Passwortmanager oder ausgedruckt an einem sicheren Ort.",
  codesKopieren: "Codes kopieren",
  codesKopiert: "Codes kopiert.",
  codesSpeichern: "Als Textdatei speichern",
  codesFertig: "Ich habe die Codes sicher gespeichert",
  geraeteTitel: "Angemeldete Geräte",
  geraeteText: "Alle Sitzungen Ihres Kontos seit dem 22.11.2026. Ältere Anmeldungen erscheinen hier nicht, enden mit „Auf allen Geräten abmelden“ aber ebenfalls.",
  geraeteLeer: "Keine weiteren angemeldeten Geräte.",
  diesesGeraet: "Dieses Gerät",
  abmelden: "Abmelden",
  ueberallKnopf: "Auf allen Geräten abmelden",
  ueberallFrage: "Auf allen Geräten abmelden? Jede Sitzung dieses Kontos endet – auch diese. Sie melden sich danach neu an.",
  verlorenTitel: "Gerät verloren?",
  verlorenText: "Melden Sie sich auf allen Geräten ab und entfernen Sie danach den Passkey des verlorenen Geräts.",
  geladenFehler: "Die Angaben konnten nicht geladen werden.",
  erneut: "Erneut versuchen",
});

const KANAL = Object.freeze({ admin: "Adminbereich", partner: "Partnerbereich", kunde: "Kundenbereich" });
const WEG = Object.freeze({ password: "Passwort", passkey: "Passwort und Passkey", recovery_code: "Passwort und Wiederherstellungscode" });

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
});

function zeit(iso) {
  if (typeof iso !== "string" || iso === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const datumText = (iso) => { const d = zeit(iso); return d ? DATUM.format(d) : "—"; };
export const datumZeitText = (iso) => { const d = zeit(iso); return d ? `${DATUM_ZEIT.format(d)} Uhr` : "—"; };

/** Eine Sitzung des Servers → Anzeigezeile. Unbekanntes bleibt sichtbar unbekannt, nie geraten. */
export function sitzungsZeile(s) {
  if (!s || (typeof s.id !== "string" && typeof s.id !== "number")) return null;
  const geraet = typeof s.device === "string" && s.device.trim() ? s.device.trim() : "Browser nicht erkannt";
  const teile = [KANAL[s.channel] || null, WEG[s.method] || null].filter(Boolean);
  return {
    id: String(s.id),
    geraet,
    aktuell: s.current === true,
    zusatz: teile.join(" · "),
    herkunft: typeof s.originHost === "string" && s.originHost ? `über ${s.originHost}` : "",
    seit: `Angemeldet am ${datumZeitText(s.issuedAt)}`,
    bis: `gültig bis ${datumText(s.expiresAt)}`,
  };
}

/** Sitzungsliste: aktuelle zuerst, danach die neuesten. Ungültige Einträge fallen weg. */
export function sitzungsListe(daten) {
  const liste = Array.isArray(daten && daten.sessions) ? daten.sessions : [];
  const zeilen = liste.map((s) => ({ s, z: sitzungsZeile(s) })).filter((x) => x.z);
  zeilen.sort((a, b) => (Number(b.z.aktuell) - Number(a.z.aktuell))
    || ((zeit(b.s.issuedAt)?.getTime() || 0) - (zeit(a.s.issuedAt)?.getTime() || 0)));
  return zeilen.map((x) => x.z);
}

/** Ein Passkey des Servers → Anzeigezeile. */
export function passkeyZeile(p) {
  if (!p || (typeof p.id !== "string" && typeof p.id !== "number")) return null;
  return {
    id: String(p.id),
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Passkey",
    art: p.synced === true ? SICHERHEIT_TEXT.synchronisiert : SICHERHEIT_TEXT.geraetegebunden,
    erstellt: `Eingerichtet am ${datumText(p.createdAt)}`,
    benutzt: p.lastUsedAt ? `Zuletzt verwendet am ${datumZeitText(p.lastUsedAt)}` : "Noch nicht zur Anmeldung verwendet",
  };
}

export const PASSKEY_NAME_MAX = 60;

/** Name für einen Passkey: getrimmt, 1–60 Zeichen, sonst null (dann vergibt der Server einen). */
export function passkeyNameEingabe(text) {
  if (typeof text !== "string") return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length >= 1 && t.length <= PASSKEY_NAME_MAX ? t : null;
}

/** Fachfehler des Servers → Satz für die Seite. */
export function sicherheitsFehlertext(status, d) {
  const code = d && typeof d.code === "string" ? d.code : "";
  const texte = {
    CURRENT_PASSWORD_REQUIRED: "Bitte geben Sie Ihr aktuelles Passwort ein.",
    CURRENT_PASSWORD_INVALID: "Das Passwort ist nicht korrekt.",
    LAST_PASSKEY: SICHERHEIT_TEXT.letzter,
    PASSKEY_LIMIT_REACHED: "Es sind bereits 10 Passkeys eingerichtet. Entfernen Sie zuerst einen.",
    PASSKEY_ALREADY_REGISTERED: "Dieser Passkey ist bereits eingerichtet.",
    PASSKEY_CHALLENGE_EXPIRED: "Die Einrichtung hat zu lange gedauert. Bitte starten Sie sie erneut.",
    PASSKEY_VERIFICATION_FAILED: "Der Passkey konnte nicht geprüft werden. Bitte versuchen Sie es erneut.",
    PASSKEY_RESPONSE_INVALID: "Der Passkey konnte nicht geprüft werden. Bitte versuchen Sie es erneut.",
    PASSKEY_NAME_INVALID: `Der Name braucht 1 bis ${PASSKEY_NAME_MAX} Zeichen.`,
    PASSKEY_NOT_FOUND: "Dieser Passkey existiert nicht mehr. Die Liste wurde aktualisiert.",
    SESSION_NOT_FOUND: "Diese Sitzung ist bereits beendet. Die Liste wurde aktualisiert.",
    NO_PASSKEY: "Richten Sie zuerst einen Passkey ein.",
    STEP_UP_REQUIRED: "Die Aktion wurde nicht bestätigt und deshalb nicht ausgeführt.",
  };
  if (texte[code]) return texte[code];
  if (status === 429) return "Zu viele Versuche. Bitte warten Sie 15 Minuten.";
  return "Das hat gerade nicht geklappt. Bitte versuchen Sie es erneut.";
}

/** Wiederherstellungscodes als Text zum Kopieren und Speichern — ohne Konto- oder Personenangaben. */
export function codesAlsText(codes, { erstellt = new Date() } = {}) {
  const liste = Array.isArray(codes) ? codes.filter((c) => typeof c === "string" && c) : [];
  return [
    "ConfidaraExpress – Wiederherstellungscodes für den Adminbereich",
    `Erstellt am ${DATUM_ZEIT.format(erstellt)} Uhr. Jeder Code gilt einmal.`,
    "",
    ...liste,
    "",
  ].join("\n");
}
