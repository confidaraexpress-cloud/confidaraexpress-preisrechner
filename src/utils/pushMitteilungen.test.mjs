// Mitteilungen (Web Push) der Admin- und der Partner-App (FE-2, 2026-11-22): Zustände, Schlüssel, Abonnement für den
// Server, Auswahl der Arten, Geräteliste, Fehlertexte — und die Quelltextregeln der Karte (Erlaubnis nur nach Tippen,
// keine Aufrufe für gesperrte Partner, nichts auf der Hauptdomain).
//
// Run: node --test src/utils/pushMitteilungen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PUSH_TEXT, PUSH_ZUSTAND as Z, aboFuerServer, geraeteListe, gleicherSchluessel, kategorienNach, pushFehlertext,
  pushUnterstuetzung, pushZustand, schluesselBytes,
} from "./pushMitteilungen.mjs";
import { APP_KARTEN_TEXT, appInstallText } from "./appKarten.mjs";
import { INSTALL_STATE } from "./pwaInstallView.mjs";

const lies = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ALLES = { sichererKontext: true, serviceWorker: true, pushManager: true, notification: true };

test("1 — Unterstützung: iPhone/iPad nur installiert, sonst sicherer Kontext + Worker + Push + Mitteilungen", () => {
  assert.equal(pushUnterstuetzung(ALLES), "ok");
  assert.equal(pushUnterstuetzung({ ...ALLES, ios: true, standalone: false }), "ios_installieren");
  assert.equal(pushUnterstuetzung({ ios: true, standalone: false }), "ios_installieren", "Safari-Tab ohne PushManager: installieren");
  assert.equal(pushUnterstuetzung({ ...ALLES, ios: true, standalone: true }), "ok");
  assert.equal(pushUnterstuetzung({ ...ALLES, pushManager: false, ios: true, standalone: true }), "nicht_unterstuetzt", "iOS < 16.4");
  for (const fehlt of ["sichererKontext", "serviceWorker", "pushManager", "notification"]) {
    assert.equal(pushUnterstuetzung({ ...ALLES, [fehlt]: false }), "nicht_unterstuetzt", fehlt);
    assert.equal(pushUnterstuetzung({ ...ALLES, [fehlt]: "true" }), "nicht_unterstuetzt", `${fehlt}: nur echtes true`);
  }
  assert.equal(pushUnterstuetzung(), "nicht_unterstuetzt");
});

test("2 — Zustand: gesperrt vor allem, nicht freigeschaltet vor Erlaubnis, an nur mit aktueller Sitzung", () => {
  const k = { available: true, publicKey: "x", categories: [] };
  const basis = { unterstuetzung: "ok", konfiguration: k, erlaubnis: "default", stand: { subscribed: false } };
  assert.equal(pushZustand({ ...basis, gesperrt: true, unterstuetzung: "nicht_unterstuetzt" }), Z.GESPERRT);
  assert.equal(pushZustand({ ...basis, unterstuetzung: "ios_installieren" }), Z.IOS_INSTALLIEREN);
  assert.equal(pushZustand({ ...basis, unterstuetzung: "nicht_unterstuetzt" }), Z.NICHT_UNTERSTUETZT);
  assert.equal(pushZustand({ ...basis, ladefehler: true }), Z.FEHLER);
  assert.equal(pushZustand({ ...basis, konfiguration: null }), Z.LAEDT);
  assert.equal(pushZustand({ ...basis, konfiguration: { available: false, publicKey: null, categories: [] }, erlaubnis: "granted" }), Z.NICHT_VERFUEGBAR);
  assert.equal(pushZustand({ ...basis, konfiguration: { available: "true" } }), Z.NICHT_VERFUEGBAR, "nur echtes true");
  assert.equal(pushZustand({ ...basis, erlaubnis: "denied" }), Z.BLOCKIERT);
  assert.equal(pushZustand({ ...basis, stand: null }), Z.LAEDT);
  assert.equal(pushZustand(basis), Z.AUS);
  const abo = { subscribed: true, currentSession: true, subscription: { id: 3, categories: ["support"] } };
  assert.equal(pushZustand({ ...basis, erlaubnis: "granted", stand: abo }), Z.AN);
  assert.equal(pushZustand({ ...basis, erlaubnis: "granted", stand: { ...abo, currentSession: false } }), Z.FRUEHERE_ANMELDUNG);
  assert.equal(pushZustand({ ...basis, erlaubnis: "default", stand: abo }), Z.AUS, "ohne Erlaubnis nie „an“");
  assert.equal(pushZustand({ ...basis, erlaubnis: "granted", stand: { ...abo, subscribed: "true" } }), Z.AUS);
  assert.equal(pushZustand(), Z.NICHT_UNTERSTUETZT);
});

// Ein gültiger öffentlicher P-256-Schlüssel (unkomprimiert, 65 Byte) — ein Testwert, kein Schlüssel einer Umgebung.
const PUNKT = new Uint8Array(65).map((_, i) => (i === 0 ? 4 : (i * 37) % 256));
const B64URL = Buffer.from(PUNKT).toString("base64url");

test("3 — VAPID-Schlüssel: base64url → 65 Byte mit 0x04, alles andere wirft", () => {
  assert.deepEqual([...schluesselBytes(B64URL)], [...PUNKT]);
  assert.equal(B64URL.length, 87);
  for (const boese of [undefined, null, "", "abc", B64URL + "=", B64URL.replace(/^./, "+"), B64URL.slice(0, 80),
    Buffer.from(new Uint8Array(65).fill(4).map((v, i) => (i === 0 ? 2 : v))).toString("base64url"),
    Buffer.from(new Uint8Array(66).fill(4)).toString("base64url")]) {
    assert.throws(() => schluesselBytes(boese), /ungültig/, String(boese));
  }
  assert.equal(gleicherSchluessel(undefined, PUNKT), true, "nicht prüfbar: behalten");
  assert.equal(gleicherSchluessel(PUNKT.buffer.slice(0), PUNKT), true);
  assert.equal(gleicherSchluessel(new Uint8Array(65), PUNKT), false);
  assert.equal(gleicherSchluessel(new Uint8Array(64), PUNKT), false);
});

test("4 — Abonnement für den Server: nur endpoint und die zwei Schlüssel", () => {
  const json = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys: { p256dh: "P", auth: "A", extra: "x" }, more: 1 };
  assert.deepEqual(aboFuerServer(json), { endpoint: json.endpoint, keys: { p256dh: "P", auth: "A" } });
  for (const boese of [null, {}, { ...json, endpoint: "http://fcm.googleapis.com/x" }, { ...json, keys: { p256dh: "P" } },
    { ...json, keys: { p256dh: "", auth: "A" } }, { ...json, keys: null }, { ...json, endpoint: 5 }]) {
    assert.equal(aboFuerServer(boese), null, JSON.stringify(boese));
  }
});

test("5 — Auswahl der Arten: mindestens eine, feste Reihenfolge, Unbekanntes ändert nichts", () => {
  const alle = [{ id: "support" }, { id: "storno" }, { id: "klaerung" }];
  const auswahl = ["support", "klaerung"];
  assert.deepEqual(kategorienNach(auswahl, "storno", true, alle), ["support", "storno", "klaerung"]);
  assert.deepEqual(kategorienNach(auswahl, "support", false, alle), ["klaerung"]);
  const einzig = ["klaerung"];
  assert.equal(kategorienNach(einzig, "klaerung", false, alle), einzig, "die letzte bleibt — dasselbe Array");
  assert.equal(kategorienNach(auswahl, "support", true, alle), auswahl, "unverändert — dasselbe Array");
  assert.equal(kategorienNach(auswahl, "boese", true, alle), auswahl);
  assert.equal(kategorienNach(auswahl, "__proto__", true, alle), auswahl);
  assert.deepEqual(kategorienNach(undefined, "support", true, alle), ["support"]);
});

test("6 — Geräteliste: nur erfasste Angaben, keine erfundene Bezeichnung, eigenes Gerät markiert", () => {
  const kategorien = [{ id: "support", label: "Neue Supportanfragen" }, { id: "storno", label: "Neue Stornierungsanfragen" }];
  const zeilen = geraeteListe({
    devices: [
      { id: 4, app: "admin", deviceLabel: " Chrome unter Windows ", categories: ["support", "storno", "boese"], createdAt: "2026-11-22T09:15:00.000Z", lastSuccessAt: null },
      { id: 9, app: "admin", deviceLabel: null, categories: ["storno"], createdAt: "kaputt", lastSuccessAt: "2026-11-22T10:00:00.000Z" },
      { id: "7", deviceLabel: "x" }, { id: 0 }, null,
    ],
  }, kategorien, 9);
  assert.equal(zeilen.length, 2);
  assert.deepEqual(zeilen[0], {
    id: 4, name: "Chrome unter Windows", aktuell: false, arten: ["Neue Supportanfragen", "Neue Stornierungsanfragen"],
    seit: "Eingeschaltet am 22.11.2026, 10:15 Uhr", zuletzt: PUSH_TEXT.nochNichtZugestellt,
  });
  assert.equal(zeilen[1].name, PUSH_TEXT.geraetOhneName);
  assert.equal(zeilen[1].aktuell, true);
  assert.equal(zeilen[1].seit, null);
  assert.equal(zeilen[1].zuletzt, "Zuletzt zugestellt am 22.11.2026, 11:00 Uhr");
  assert.deepEqual(geraeteListe(null, kategorien), []);
  assert.equal(geraeteListe({ devices: [{ id: 4 }] }, kategorien, null)[0].aktuell, false);
});

test("7 — Fehlertexte: eigene Texte je Code, nie die Rohantwort", () => {
  const roh = "PUSH_DEVICE_LIMIT pg:23505 https://fcm.googleapis.com/x";
  for (const code of ["PUSH_UNAVAILABLE", "PUSH_INVALID_ENDPOINT", "PUSH_INVALID_KEYS", "PUSH_INVALID_CATEGORIES",
    "PUSH_DEVICE_LIMIT", "PUSH_NOT_FOUND", "PUSH_PARTNER_INACTIVE", "PUSH_TOO_MANY"]) {
    const t = pushFehlertext(400, { code, error: roh });
    assert.ok(t && !t.includes("PUSH_") && !t.includes("pg:") && !t.includes("http"), `${code}: ${t}`);
  }
  assert.equal(pushFehlertext(429, null), pushFehlertext(400, { code: "PUSH_TOO_MANY" }));
  assert.equal(pushFehlertext(500, { error: roh }), "Das hat gerade nicht geklappt. Bitte versuchen Sie es erneut.");
  assert.equal(pushFehlertext(400, { code: "toString" }), "Das hat gerade nicht geklappt. Bitte versuchen Sie es erneut.");
});

test("8 — Texte: kein Anbieter, keine Versprechen über Inhalte, keine Kunden- oder Geldangaben", () => {
  const alle = JSON.stringify(PUSH_TEXT) + PUSH_TEXT.einleitung("admin") + PUSH_TEXT.einleitung("partner")
    + JSON.stringify(APP_KARTEN_TEXT)
    + Object.values(INSTALL_STATE).map((s) => appInstallText("admin", s) + appInstallText("partner", s)).join("");
  assert.doesNotMatch(alle, /jumingo|transglobal|datenschutzkonform|garantiert|sicher verschlüsselt|DSGVO/i);
  assert.match(PUSH_TEXT.inhalt, /keine Namen, Sendungen oder Beträge/);
  assert.equal(appInstallText("admin", INSTALL_STATE.INSTALLED), "Sie nutzen die Admin-App als installierte App.");
  assert.equal(appInstallText("partner", INSTALL_STATE.JUST_INSTALLED).startsWith("Die Partner-App wurde installiert."), true);
});

const KARTE = ohneKommentare(lies("src/components/sicherheit/PushMitteilungenKarte.jsx"));
const KARTEN = ohneKommentare(lies("src/components/sicherheit/AppKarten.jsx"));

test("9 — Karte: Erlaubnis nur im Tippen auf „Einschalten“, Registrierung nie durch die Karte", () => {
  assert.equal((KARTE.match(/requestPermission\(/g) || []).length, 1, "genau eine Stelle fragt die Erlaubnis");
  const einschalten = KARTE.slice(KARTE.indexOf("const einschalten = () => {"), KARTE.indexOf("const ausschalten ="));
  assert.ok(einschalten.includes("requestPermission("), "die Erlaubnis gehört in den Klickpfad von „Einschalten“");
  assert.ok(einschalten.indexOf("requestPermission(") < einschalten.indexOf("aktion(\"an\""),
    "die Erlaubnis wird noch vor dem ersten await erfragt (Nutzergeste)");
  assert.doesNotMatch(KARTE, /useEffect\([^)]*requestPermission/s);
  assert.doesNotMatch(KARTE, /serviceWorker\.register\(/, "die Karte registriert keinen Worker");
  assert.match(KARTE, /userVisibleOnly: true/);
  assert.doesNotMatch(KARTE, /console\.|localStorage|sessionStorage/, "weder Endpunkt noch Schlüssel werden protokolliert oder abgelegt");
});

test("10 — Karte: ein abgelehnter Servereintrag nimmt ein neu entstandenes Abonnement zurück; Ausschalten entfernt beides", () => {
  const einschalten = KARTE.slice(KARTE.indexOf("const einschalten = () => {"), KARTE.indexOf("const ausschalten ="));
  assert.match(einschalten, /finally \{\s+if \(neu\) \{ try \{ await neu\.unsubscribe\(\); \}/);
  assert.match(einschalten, /neu = null;\s+setStand\(d\);/, "erst nach angenommenem Servereintrag bleibt das Abonnement");
  const ausschalten = KARTE.slice(KARTE.indexOf("const ausschalten ="), KARTE.indexOf("const artUmschalten ="));
  assert.ok(ausschalten.indexOf("pushAusschalten(") < ausschalten.indexOf("unsubscribe()"), "erst der Server, dann der Browser");
  assert.match(ausschalten, /if \(!r\.ok\) \{ setFehler/, "scheitert der Server, bleibt das Abonnement für einen neuen Versuch");
});

test("11 — gesperrte Partner: keine Konfiguration, kein Stand, kein Einschalten (403 hieße Abmeldung)", () => {
  const laden = KARTE.slice(KARTE.indexOf("const laden = useCallback("), KARTE.indexOf("useEffect(() => {"));
  const sperre = laden.indexOf("if (gesperrt) { await ladeGeraete(signal); return; }");
  assert.ok(sperre > 0, "Sperre fehlt");
  assert.ok(sperre < laden.indexOf("pushKonfiguration("), "die Sperre steht vor jedem Aufruf mit Partnerprüfung");
  assert.equal(pushZustand({ gesperrt: true, unterstuetzung: "ok", konfiguration: { available: true } }), Z.GESPERRT);
  const panel = ohneKommentare(lies("src/components/partner/PartnerAccountPanel.jsx"));
  assert.match(panel, /<AppKarten app=\{APP_PARTNER\} gesperrt=\{partnerStatus !== "active"\}/);
  assert.match(ohneKommentare(lies("src/pages/PartnerPortalPage.jsx")), /<PartnerAccountPanel user=\{user\} partnerStatus=\{status\} \/>/);
});

test("12 — Hauptdomain: nichts (kein Push, kein Verweis vor der Live-Prüfung); Admin nicht bei fehlendem Pflicht-Passkey", () => {
  assert.match(KARTEN, /if \(aktuelleApp\(\) !== app\) return null;/);
  assert.doesNotMatch(KARTEN, /confidaraexpress\.de|<a\b|href=/, "kein Verweis auf einen (noch) nicht erreichbaren App-Host");
  const seite = ohneKommentare(lies("src/pages/admin/AdminSicherheitPage.jsx"));
  assert.match(seite, /\{!pflichtHinweis && <AppKarten app=\{APP_ADMIN\} \/>\}/);
});
