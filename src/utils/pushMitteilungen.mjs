/* ── Mitteilungen (Web Push) der Admin- und der Partner-App (Betreiberauftrag 2026-11-22, D6; FE-2) ─────────────────
   Freiwillig, je Gerät und Rolle, standardmäßig aus. Der Server (BE-2, routes/push.js) bietet sie nur an, wenn der
   Betreiber sie freigeschaltet hat (`available`); bis dahin zeigt die Karte „derzeit nicht verfügbar“ und fragt nichts.
   Die Erlaubnis des Browsers wird ausschließlich nach einem Tippen auf „Mitteilungen einschalten“ erfragt.

   Eine Mitteilung enthält nie Kunden-, Sendungs- oder Geldangaben: ihren Text wählt der Service Worker
   (public/app-sw.js) aus einer festen Tabelle, die Nutzlast trägt nur Art, Zielpfad und Kennung.

   Ausschalten entfernt beides — den Eintrag auf dem Server und das Abonnement im Browser. Ein Abonnement, das beim
   Einschalten neu entstand und vom Server nicht angenommen wurde, nimmt die Karte im Browser wieder zurück.

   Reine Funktionen und Texte, kein React (pushMitteilungen.test.mjs). */

import { APP_ADMIN } from "./appHost.mjs";

export const PUSH_ZUSTAND = Object.freeze({
  LAEDT: "laedt",
  GESPERRT: "gesperrt",                     // Partnerkonto nicht aktiv — kein Aufruf, der Server lehnte ab
  NICHT_UNTERSTUETZT: "nicht_unterstuetzt", // Browser ohne Service Worker, Push oder Mitteilungen
  IOS_INSTALLIEREN: "ios_installieren",     // iPhone/iPad: Mitteilungen nur in der installierten App
  NICHT_VERFUEGBAR: "nicht_verfuegbar",     // Server: available:false (Betreiber hat Push nicht freigeschaltet)
  FEHLER: "fehler",                         // Stand konnte nicht geladen werden
  BLOCKIERT: "blockiert",                   // Erlaubnis im Browser verweigert
  AUS: "aus",
  FRUEHERE_ANMELDUNG: "fruehere_anmeldung", // dieses Gerät war bei einer früheren Anmeldung dieses Kontos eingeschaltet
  AN: "an",
});

const Z = PUSH_ZUSTAND;

/** Kann dieser Browser Mitteilungen der App empfangen? "ok", "ios_installieren" oder "nicht_unterstuetzt".
 *  Auf iPhone und iPad gibt es Web Push nur für Apps auf dem Home-Bildschirm (iOS 16.4+); im Safari-Tab fehlt der
 *  PushManager ganz — dort ist der ehrliche Weg die Installation, nicht „nicht unterstützt“. */
export function pushUnterstuetzung({
  sichererKontext = false, serviceWorker = false, pushManager = false, notification = false, ios = false, standalone = false,
} = {}) {
  if (ios === true && standalone !== true) return "ios_installieren";
  if (sichererKontext !== true || serviceWorker !== true || pushManager !== true || notification !== true) return "nicht_unterstuetzt";
  return "ok";
}

/** Der eine geltende Zustand der Karte. */
export function pushZustand({ gesperrt = false, unterstuetzung, konfiguration = null, erlaubnis = "default", stand = null, ladefehler = false } = {}) {
  if (gesperrt === true) return Z.GESPERRT;
  if (unterstuetzung === "ios_installieren") return Z.IOS_INSTALLIEREN;
  if (unterstuetzung !== "ok") return Z.NICHT_UNTERSTUETZT;
  if (ladefehler === true) return Z.FEHLER;
  if (!konfiguration) return Z.LAEDT;
  if (konfiguration.available !== true) return Z.NICHT_VERFUEGBAR;
  if (erlaubnis === "denied") return Z.BLOCKIERT;
  if (!stand) return Z.LAEDT;
  if (stand.subscribed === true && erlaubnis === "granted") return stand.currentSession === true ? Z.AN : Z.FRUEHERE_ANMELDUNG;
  return Z.AUS;
}

/** Öffentlicher VAPID-Schlüssel (base64url) → Bytes für `applicationServerKey`. Nur ein unkomprimierter P-256-Punkt
 *  (65 Byte, beginnt mit 0x04) — alles andere ist ein Konfigurationsfehler und wirft. */
export function schluesselBytes(base64url) {
  if (typeof base64url !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(base64url)) throw new Error("schluesselBytes: ungültig");
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("schluesselBytes: ungültig");
  return bytes;
}

/** Gehört ein bestehendes Abonnement zu diesem Schlüssel? Ohne Angabe des Browsers: ja (nicht prüfbar). */
export function gleicherSchluessel(vorhanden, erwartet) {
  if (vorhanden == null) return true;
  const a = vorhanden instanceof Uint8Array ? vorhanden : new Uint8Array(vorhanden);
  if (a.length !== erwartet.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== erwartet[i]) return false;
  return true;
}

/** Aus PushSubscription.toJSON() genau das, was der Server braucht — sonst nichts (kein expirationTime o. Ä.). */
export function aboFuerServer(json) {
  const endpoint = json && typeof json.endpoint === "string" ? json.endpoint : "";
  const keys = (json && json.keys) || {};
  if (!endpoint.startsWith("https://") || typeof keys.p256dh !== "string" || !keys.p256dh
    || typeof keys.auth !== "string" || !keys.auth) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** Neue Auswahl der Mitteilungsarten; mindestens eine bleibt (der Server lehnt eine leere Auswahl ab), feste
 *  Reihenfolge wie vom Server vorgegeben. Unverändert → dasselbe Array. */
export function kategorienNach(auswahl, id, an, alle) {
  const ids = (Array.isArray(alle) ? alle : []).map((k) => k && k.id).filter((x) => typeof x === "string");
  const vorher = Array.isArray(auswahl) ? auswahl : [];
  if (!ids.includes(id)) return vorher;
  const neu = an ? [...vorher.filter((x) => x !== id), id] : vorher.filter((x) => x !== id);
  const geordnet = ids.filter((x) => neu.includes(x));
  if (geordnet.length === 0) return vorher;
  if (geordnet.length === vorher.length && geordnet.every((x, i) => x === vorher[i])) return vorher;
  return geordnet;
}

const DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
});

function datumZeit(iso) {
  if (typeof iso !== "string" || !iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${DATUM_ZEIT.format(d)} Uhr`;
}

/** Geräteliste aus GET /push/devices — nur, was der Server erfasst (Bezeichnung aus dem User-Agent, Zeiten). Keine
 *  erfundene Gerätebezeichnung: fehlt sie, steht das da. */
export function geraeteListe(d, kategorien, aktuelleId = null) {
  const liste = d && Array.isArray(d.devices) ? d.devices : [];
  const namen = new Map((Array.isArray(kategorien) ? kategorien : []).map((k) => [k && k.id, k && k.label]));
  return liste
    .filter((x) => x && Number.isInteger(x.id) && x.id > 0)
    .map((x) => {
      const seit = datumZeit(x.createdAt);
      const zuletzt = datumZeit(x.lastSuccessAt);
      return {
        id: x.id,
        name: typeof x.deviceLabel === "string" && x.deviceLabel.trim() ? x.deviceLabel.trim() : PUSH_TEXT.geraetOhneName,
        aktuell: aktuelleId !== null && x.id === aktuelleId,
        arten: (Array.isArray(x.categories) ? x.categories : []).map((c) => namen.get(c)).filter((l) => typeof l === "string" && l),
        seit: seit ? `Eingeschaltet am ${seit}` : null,
        zuletzt: zuletzt ? `Zuletzt zugestellt am ${zuletzt}` : PUSH_TEXT.nochNichtZugestellt,
      };
    });
}

/** Fehlertext zu einer Antwort der Push-Routen — eigene Texte, nie die Rohantwort. */
export function pushFehlertext(status, d) {
  const code = d && typeof d.code === "string" ? d.code : "";
  const texte = {
    PUSH_UNAVAILABLE: PUSH_TEXT.nichtVerfuegbar,
    PUSH_INVALID_ENDPOINT: "Dieser Browser stellt Mitteilungen über einen Dienst zu, den ConfidaraExpress nicht unterstützt.",
    PUSH_INVALID_KEYS: "Die Anmeldung dieses Geräts für Mitteilungen war unvollständig. Bitte versuchen Sie es erneut.",
    PUSH_INVALID_CATEGORIES: "Bitte wählen Sie mindestens eine Mitteilungsart.",
    PUSH_DEVICE_LIMIT: "Mitteilungen sind bereits auf der höchstmöglichen Zahl von Geräten eingeschaltet. Entfernen Sie unten zuerst ein Gerät.",
    PUSH_NOT_FOUND: "Dieses Gerät ist nicht mehr für Mitteilungen eingetragen. Die Liste wurde aktualisiert.",
    PUSH_PARTNER_INACTIVE: PUSH_TEXT.partnerInaktiv,
    PUSH_TOO_MANY: "Zu viele Anfragen. Bitte versuchen Sie es in 15 Minuten erneut.",
  };
  if (Object.prototype.hasOwnProperty.call(texte, code)) return texte[code];
  if (status === 429) return texte.PUSH_TOO_MANY;
  return "Das hat gerade nicht geklappt. Bitte versuchen Sie es erneut.";
}

const APP_WORT = Object.freeze({ admin: "Admin-App", partner: "Partner-App" });

/** Name der App im Fließtext. */
export const appWort = (app) => (Object.prototype.hasOwnProperty.call(APP_WORT, app) ? APP_WORT[app] : "App");

export const PUSH_TEXT = Object.freeze({
  titel: "Mitteilungen auf diesem Gerät",
  einleitung: (app) => (app === APP_ADMIN
    ? "Auf Wunsch meldet die Admin-App neue Aufgaben auf diesem Gerät, auch wenn sie gerade geschlossen ist."
    : "Auf Wunsch meldet die Partner-App neue Kunden und Verdienste auf diesem Gerät, auch wenn sie gerade geschlossen ist."),
  inhalt: "Eine Mitteilung nennt nur die Art des Ereignisses – keine Namen, Sendungen oder Beträge. Zugestellt wird sie über den Push-Dienst Ihres Browserherstellers.",
  artenVorschau: "Sie erhalten Mitteilungen zu:",
  einschalten: "Mitteilungen einschalten",
  einschaltenLaeuft: "Wird eingeschaltet …",
  ausschalten: "Mitteilungen ausschalten",
  ausschaltenLaeuft: "Wird ausgeschaltet …",
  an: "Mitteilungen sind auf diesem Gerät eingeschaltet.",
  angeschaltet: "Mitteilungen sind eingeschaltet.",
  ausgeschaltet: "Mitteilungen sind ausgeschaltet.",
  artenTitel: "Mitteilungen zu",
  artenHinweis: "Eine Art bleibt mindestens eingeschaltet. Für keine Mitteilungen mehr: „Mitteilungen ausschalten“.",
  gespeichert: "Auswahl gespeichert.",
  frueher: "Bei einer früheren Anmeldung waren Mitteilungen auf diesem Gerät eingeschaltet. Seit Ihrer neuen Anmeldung ruhen sie.",
  wiederEinschalten: "Für diese Anmeldung einschalten",
  blockiert: "Ihr Browser blockiert Mitteilungen dieser App. Erlauben Sie sie in den Website-Einstellungen des Browsers und laden Sie die Seite danach neu.",
  abgelehnt: "Ohne Ihre Erlaubnis im Browser bleiben Mitteilungen ausgeschaltet.",
  nichtUnterstuetzt: "Dieser Browser bietet keine Mitteilungen an. Alle Funktionen der App stehen Ihnen unverändert zur Verfügung.",
  iosInstallieren: "Auf iPhone und iPad gibt es Mitteilungen nur in der installierten App. Fügen Sie die App zuerst zum Home-Bildschirm hinzu (Karte „Als App nutzen“) und öffnen Sie sie von dort.",
  nichtVerfuegbar: "Mitteilungen sind derzeit nicht verfügbar.",
  laedt: "Mitteilungen werden geladen …",
  ladefehler: "Der Stand der Mitteilungen konnte nicht geladen werden.",
  erneut: "Erneut versuchen",
  einrichtungFehler: "Mitteilungen konnten auf diesem Gerät nicht eingerichtet werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
  partnerInaktiv: "Mitteilungen gibt es nur für aktive Vertriebspartner.",
  geraeteTitel: "Geräte mit Mitteilungen",
  geraeteText: "Hier entfernen Sie Mitteilungen auch für ein Gerät, das Sie nicht mehr nutzen.",
  geraetOhneName: "Gerät ohne Bezeichnung",
  diesesGeraet: "Dieses Gerät",
  entfernen: "Entfernen",
  entfernt: "Das Gerät erhält keine Mitteilungen mehr.",
  nochNichtZugestellt: "Noch keine Mitteilung zugestellt",
});
