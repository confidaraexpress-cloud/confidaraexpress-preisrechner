// Empfehlungscode-Erfassung: Format, Ablauf, erster Klick, getrennte Arten,
// keine Speicherung ohne Freigabe, URL-Bereinigung.
//
// Run: node --test src/utils/referralCapture.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CONTRACT_RETENTION_DAYS,
  REFERRAL_STORAGE_KEYS,
  __resetReferralCaptureForTests,
  clearReferral,
  createReferralStore,
  normalizeReferralCode,
  referralCodeFor,
  referralKindForPath,
  referralLinkPath,
  startReferralCapture,
  stripReferralParam,
} from "./referralCapture.mjs";
import {
  FAIL_CLOSED_PUBLIC_CONFIG,
  parseSalesPartnerPublicConfig,
  partnerRegistrationOpen,
  referralPersistenceAllowed,
} from "./salesPartnerPublicConfig.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const TAG = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const ENABLED = { ok: true, config: parseSalesPartnerPublicConfig({ referralsEnabled: true, referralRetentionDays: 30 }) };
const DISABLED = { ok: true, config: parseSalesPartnerPublicConfig({ referralsEnabled: false, referralRetentionDays: 30 }) };

function fakeWindow(href, storage = fakeStorage()) {
  const url = new URL(href, "https://ce.example");
  const calls = [];
  const win = {
    location: { pathname: url.pathname, search: url.search, hash: url.hash },
    history: {
      state: { usr: null },
      replaceState(state, _title, next) { calls.push({ state, next }); },
    },
    localStorage: storage,
  };
  return { win, calls, storage };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/* ══════════ Format ══════════════════════════════════════════════════════ */

test("1 — gültig sind genau 8 Zeichen aus [2-9A-HJ-NP-Z], case-insensitiv, gespeichert in Großbuchstaben", () => {
  assert.equal(normalizeReferralCode("ABCDEFGH"), "ABCDEFGH");
  assert.equal(normalizeReferralCode("abcd2345"), "ABCD2345");
  assert.equal(normalizeReferralCode("  zxyw9876 "), "ZXYW9876");
  for (const falsch of ["ABCDEFG", "ABCDEFGHJ", "ABCDEFG0", "ABCDEFG1", "ABCDEFGI", "ABCDEFGO",
    "ABCD-EFG", "ABCD EFG", "", null, undefined, 12345678, {}, "ÄBCDEFGH"]) {
    assert.equal(normalizeReferralCode(falsch), null, `durchgelassen: ${JSON.stringify(falsch)}`);
  }
});

test("2 — gelesen wird nur auf den drei Registrierungspfaden, mit der richtigen Art", () => {
  assert.equal(referralKindForPath("/register"), "customer");
  assert.equal(referralKindForPath("/registrieren"), "customer");
  assert.equal(referralKindForPath("/partner-registrieren"), "partner");
  assert.equal(referralKindForPath("/register/"), "customer", "abschließender Schrägstrich");
  for (const anders of ["/", "/login", "/dashboard", "/partner", "/registerx", "/admin/register", "", null]) {
    assert.equal(referralKindForPath(anders), null, `gelesen auf ${anders}`);
  }
});

test("3 — stripReferralParam entfernt jedes ref und lässt den Rest stehen", () => {
  assert.deepEqual(stripReferralParam("?ref=abcd2345"), { present: true, code: "ABCD2345", search: "" });
  assert.deepEqual(stripReferralParam("?utm=x&ref=ABCD2345&b=2"), { present: true, code: "ABCD2345", search: "?utm=x&b=2" });
  assert.deepEqual(stripReferralParam("?ref=kaputt"), { present: true, code: null, search: "" }, "ungültig: trotzdem entfernt");
  assert.deepEqual(stripReferralParam("?a=1"), { present: false, code: null, search: "?a=1" });
  assert.deepEqual(stripReferralParam(""), { present: false, code: null, search: "" });
});

test("4 — Teilen-Links je Art", () => {
  assert.equal(referralLinkPath("customer", "abcd2345"), "/register?ref=ABCD2345");
  assert.equal(referralLinkPath("partner", "ABCD2345"), "/partner-registrieren?ref=ABCD2345");
  assert.equal(referralLinkPath("partner", "kaputt"), null);
  assert.equal(referralLinkPath("admin", "ABCD2345"), null);
});

/* ══════════ Öffentliche Konfiguration: fail-closed ══════════════════════ */

test("5 — fehlende oder falsche Felder ergeben den geschlossenen Zustand", () => {
  // Vertragsänderung (Vertriebspartnervereinbarung): `agreementUrl` entfällt,
  // die registrierte Fassung kommt als `agreement` (Version, Gültigkeit,
  // Dokumentpfad). Geschlossen heißt weiterhin: keine Fassung.
  assert.deepEqual({ ...FAIL_CLOSED_PUBLIC_CONFIG }, {
    registrationEnabled: false, referralsEnabled: false, referralRetentionDays: null,
    agreementVersion: null, agreement: null,
  });
  assert.equal("agreementUrl" in parseSalesPartnerPublicConfig({ agreementUrl: "https://example.org/v.pdf" }), false,
    "eine Adresse aus einer älteren Antwort wird nicht mehr übernommen");
  const c = parseSalesPartnerPublicConfig({ registrationEnabled: "true", referralsEnabled: 1, referralRetentionDays: "30" });
  assert.equal(c.registrationEnabled, false, "String \"true\" ist keine Freigabe");
  assert.equal(c.referralsEnabled, false);
  assert.equal(c.referralRetentionDays, null);
  assert.equal(referralPersistenceAllowed(parseSalesPartnerPublicConfig({ referralsEnabled: true })), false,
    "ohne Aufbewahrungsdauer keine Speicherung");
  assert.equal(referralPersistenceAllowed(parseSalesPartnerPublicConfig({ referralsEnabled: true, referralRetentionDays: 30 })), true);
  assert.equal(referralPersistenceAllowed(parseSalesPartnerPublicConfig({ referralsEnabled: true, referralRetentionDays: 9999 })), false);
  assert.equal(partnerRegistrationOpen(parseSalesPartnerPublicConfig({ registrationEnabled: true })), false,
    "ohne Vereinbarungsfassung bleibt die Registrierung zu");
  // Die Fassung allein genügt nicht mehr: zugestimmt wird nur der registrierten
  // Fassung mit verlinkbarem Dokument (Einzelfälle: salesPartnerAgreement.test.mjs).
  const fassung = { version: "2026-10", effectiveFrom: "2026-10-01", effectiveTo: null,
    documentPath: "/api/legal/sales_partner_agreement/2026-10" };
  assert.equal(partnerRegistrationOpen(parseSalesPartnerPublicConfig({ registrationEnabled: true, agreementVersion: "2026-10" })), false,
    "ohne registrierte Fassung bleibt die Registrierung zu");
  assert.equal(partnerRegistrationOpen(parseSalesPartnerPublicConfig({
    registrationEnabled: true, agreementVersion: "2026-10", agreement: fassung,
  })), true);
});

/* ══════════ Speicherung nur mit Freigabe ════════════════════════════════ */

test("6 — ohne Konfiguration und ohne Freigabe wird nichts gespeichert; der Sitzungswert gilt", () => {
  const storage = fakeStorage();
  const store = createReferralStore({ storage, now: () => T0 });
  assert.equal(store.capture("customer", "abcd2345"), true);
  assert.equal(storage.map.size, 0, "vor der Konfiguration liegt nichts im Speicher");
  assert.equal(store.codeFor("customer"), "ABCD2345", "der Sitzungswert gilt");

  store.applyConfigResult(DISABLED);
  assert.equal(storage.map.size, 0, "ohne Freigabe nichts speichern");
  assert.equal(store.codeFor("customer"), "ABCD2345", "der Sitzungswert bleibt");

  store.applyConfigResult({ ok: false, config: FAIL_CLOSED_PUBLIC_CONFIG });
  assert.equal(storage.map.size, 0, "ein gescheiterter Abruf speichert nichts");
});

test("7 — mit Freigabe: getrennte Schlüssel, Wert { code, capturedAt }", () => {
  const storage = fakeStorage();
  const store = createReferralStore({ storage, now: () => T0 });
  store.capture("customer", "ABCD2345");
  store.capture("partner", "WXYZ6789");
  store.applyConfigResult(ENABLED);
  assert.deepEqual(JSON.parse(storage.getItem(REFERRAL_STORAGE_KEYS.customer)), { code: "ABCD2345", capturedAt: T0 });
  assert.deepEqual(JSON.parse(storage.getItem(REFERRAL_STORAGE_KEYS.partner)), { code: "WXYZ6789", capturedAt: T0 });
  assert.equal(REFERRAL_STORAGE_KEYS.customer, "ce_ref_customer_v1");
  assert.equal(REFERRAL_STORAGE_KEYS.partner, "ce_ref_partner_v1");
});

test("8 — eine ausdrückliche Absage entfernt bereits gespeicherte Codes; ein Ausfall nicht", () => {
  const storage = fakeStorage({
    [REFERRAL_STORAGE_KEYS.customer]: JSON.stringify({ code: "ABCD2345", capturedAt: T0 - TAG }),
  });
  const store = createReferralStore({ storage, now: () => T0 });
  store.applyConfigResult({ ok: false, config: FAIL_CLOSED_PUBLIC_CONFIG });
  assert.equal(storage.map.size, 1, "Ausfall: nichts löschen");
  assert.equal(store.codeFor("customer"), "ABCD2345");
  store.applyConfigResult(DISABLED);
  assert.equal(storage.map.size, 0, "Absage: gespeicherte Codes entfernt");
  assert.equal(store.codeFor("customer"), null);
});

/* ══════════ Erster gültiger Klick gewinnt, Ablauf ═══════════════════════ */

test("9 — ein vorhandener, nicht abgelaufener Code wird nicht überschrieben", () => {
  const storage = fakeStorage({
    [REFERRAL_STORAGE_KEYS.customer]: JSON.stringify({ code: "AAAA2222", capturedAt: T0 - 10 * TAG }),
  });
  const store = createReferralStore({ storage, now: () => T0 });
  store.capture("customer", "BBBB3333");
  store.applyConfigResult(ENABLED);
  assert.deepEqual(JSON.parse(storage.getItem(REFERRAL_STORAGE_KEYS.customer)), { code: "AAAA2222", capturedAt: T0 - 10 * TAG });
  assert.equal(store.codeFor("customer"), "AAAA2222", "der erste Klick gewinnt");
});

test("10 — ein abgelaufener Code wird ersetzt bzw. verworfen", () => {
  const storage = fakeStorage({
    [REFERRAL_STORAGE_KEYS.customer]: JSON.stringify({ code: "AAAA2222", capturedAt: T0 - 30 * TAG }),
    [REFERRAL_STORAGE_KEYS.partner]: JSON.stringify({ code: "CCCC4444", capturedAt: T0 - 31 * TAG }),
  });
  const store = createReferralStore({ storage, now: () => T0 });
  store.capture("customer", "BBBB3333");
  store.applyConfigResult(ENABLED);
  assert.deepEqual(JSON.parse(storage.getItem(REFERRAL_STORAGE_KEYS.customer)), { code: "BBBB3333", capturedAt: T0 });
  assert.equal(storage.getItem(REFERRAL_STORAGE_KEYS.partner), null, "abgelaufen und ohne neuen Klick: weg");
  assert.equal(store.codeFor("partner"), null);
});

test("11 — Ablauf richtet sich nach der Aufbewahrungsdauer der Konfiguration", () => {
  let jetzt = T0;
  const storage = fakeStorage();
  const store = createReferralStore({ storage, now: () => jetzt });
  store.capture("partner", "WXYZ6789");
  store.applyConfigResult({ ok: true, config: parseSalesPartnerPublicConfig({ referralsEnabled: true, referralRetentionDays: 7 }) });
  jetzt = T0 + 7 * TAG - 1;
  store.sweep();
  assert.notEqual(storage.getItem(REFERRAL_STORAGE_KEYS.partner), null, "vor Ablauf bleibt der Eintrag");
  jetzt = T0 + 7 * TAG;
  store.sweep();
  assert.equal(storage.getItem(REFERRAL_STORAGE_KEYS.partner), null, "nach 7 Tagen entfernt");
  assert.equal(store.codeFor("partner"), "WXYZ6789", "in der laufenden Sitzung gilt der Arbeitsspeicher weiter");

  // Neue Sitzung ohne geladene Konfiguration: es gilt die Vertragsdauer.
  const alt = fakeStorage({ [REFERRAL_STORAGE_KEYS.partner]: JSON.stringify({ code: "WXYZ6789", capturedAt: T0 }) });
  const grenze = T0 + CONTRACT_RETENTION_DAYS * TAG;
  assert.equal(createReferralStore({ storage: alt, now: () => grenze - 1 }).codeFor("partner"), "WXYZ6789");
  assert.equal(createReferralStore({ storage: alt, now: () => grenze }).codeFor("partner"), null);
  assert.equal(alt.getItem(REFERRAL_STORAGE_KEYS.partner), null, "abgelaufen: Schlüssel entfernt");
});

test("12 — ungültiges Format und unlesbare Einträge belegen nichts", () => {
  const storage = fakeStorage({
    [REFERRAL_STORAGE_KEYS.customer]: "{kaputt",
    [REFERRAL_STORAGE_KEYS.partner]: JSON.stringify({ code: "OOOO0000", capturedAt: T0 }),
  });
  const store = createReferralStore({ storage, now: () => T0 });
  assert.equal(store.capture("customer", "nope"), false);
  assert.equal(store.codeFor("customer"), null);
  assert.equal(store.codeFor("partner"), null);
  assert.equal(storage.map.size, 0, "unlesbare Einträge entfernt");
  store.capture("customer", "ABCD2345");
  store.applyConfigResult(ENABLED);
  assert.equal(store.codeFor("customer"), "ABCD2345", "nach einem ungültigen Wert gewinnt der erste gültige");
  // Zukunftszeitstempel verlängerten die Aufbewahrung — sie zählen nicht.
  const zukunft = fakeStorage({ [REFERRAL_STORAGE_KEYS.customer]: JSON.stringify({ code: "ABCD2345", capturedAt: T0 + TAG }) });
  assert.equal(createReferralStore({ storage: zukunft, now: () => T0 }).codeFor("customer"), null);
});

/* ══════════ Arten getrennt ══════════════════════════════════════════════ */

test("13 — Kunden- und Partnercode bleiben getrennt; clear löscht nur die eigene Art", () => {
  const storage = fakeStorage();
  const store = createReferralStore({ storage, now: () => T0 });
  store.capture("customer", "ABCD2345");
  assert.equal(store.codeFor("partner"), null, "ein Kundencode ist kein Sponsorcode");
  store.capture("partner", "WXYZ6789");
  store.applyConfigResult(ENABLED);
  store.clear("customer");
  assert.equal(store.codeFor("customer"), null);
  assert.equal(store.codeFor("partner"), "WXYZ6789");
  assert.equal(storage.getItem(REFERRAL_STORAGE_KEYS.customer), null);
  assert.notEqual(storage.getItem(REFERRAL_STORAGE_KEYS.partner), null);
  assert.equal(store.capture("admin", "ABCD2345"), false, "keine dritte Art");
});

/* ══════════ Browseranbindung: URL-Bereinigung, Start, Freigabe ══════════ */

test("14 — beim Start verschwindet ref sofort aus der Adresse; andere Parameter bleiben", async () => {
  __resetReferralCaptureForTests();
  const { win, calls, storage } = fakeWindow("/register?utm=a&ref=abcd2345#x");
  let configCalls = 0;
  startReferralCapture({ win, now: () => T0, loadConfig: async () => { configCalls += 1; return ENABLED; } });
  assert.deepEqual(calls.map((c) => c.next), ["/register?utm=a#x"]);
  assert.deepEqual(calls[0].state, { usr: null }, "der History-Zustand bleibt erhalten");
  assert.equal(storage.map.size, 0, "vor der Konfiguration nur im Arbeitsspeicher");
  await flush(); await flush();
  assert.equal(configCalls, 1);
  assert.equal(referralCodeFor("customer"), "ABCD2345");
  assert.equal(referralCodeFor("partner"), null);
  assert.deepEqual(JSON.parse(storage.getItem(REFERRAL_STORAGE_KEYS.customer)), { code: "ABCD2345", capturedAt: T0 });
  clearReferral("customer");
  assert.equal(referralCodeFor("customer"), null);
  assert.equal(storage.getItem(REFERRAL_STORAGE_KEYS.customer), null);
  __resetReferralCaptureForTests();
});

test("15 — ohne Freigabe: Adresse bereinigt, nichts im Speicher, Sitzungswert vorhanden", async () => {
  __resetReferralCaptureForTests();
  const { win, calls, storage } = fakeWindow("/partner-registrieren?ref=WXYZ6789");
  startReferralCapture({ win, now: () => T0, loadConfig: async () => DISABLED });
  await flush(); await flush();
  assert.deepEqual(calls.map((c) => c.next), ["/partner-registrieren"]);
  assert.equal(storage.map.size, 0);
  assert.equal(referralCodeFor("partner"), "WXYZ6789");
  assert.equal(referralCodeFor("customer"), null);
  __resetReferralCaptureForTests();
});

test("16 — ein ungültiger Code wird entfernt, aber nicht erfasst; kein Konfigurationsabruf", async () => {
  __resetReferralCaptureForTests();
  const { win, calls } = fakeWindow("/registrieren?ref=0000&a=1");
  let configCalls = 0;
  startReferralCapture({ win, now: () => T0, loadConfig: async () => { configCalls += 1; return ENABLED; } });
  await flush();
  assert.deepEqual(calls.map((c) => c.next), ["/registrieren?a=1"]);
  assert.equal(referralCodeFor("customer"), null);
  assert.equal(configCalls, 0, "ohne Code gibt es nichts zu entscheiden");
  __resetReferralCaptureForTests();
});

test("17 — auf fremden Pfaden wird weder gelesen noch die Adresse angefasst", async () => {
  __resetReferralCaptureForTests();
  const { win, calls } = fakeWindow("/login?ref=ABCD2345");
  let configCalls = 0;
  startReferralCapture({ win, now: () => T0, loadConfig: async () => { configCalls += 1; return ENABLED; } });
  await flush();
  assert.deepEqual(calls, []);
  assert.equal(referralCodeFor("customer"), null);
  assert.equal(configCalls, 0);
  __resetReferralCaptureForTests();
});

test("18 — ein gescheiterter Konfigurationsabruf speichert nichts und wirft nicht", async () => {
  __resetReferralCaptureForTests();
  const { win, storage } = fakeWindow("/register?ref=ABCD2345");
  startReferralCapture({ win, now: () => T0, loadConfig: async () => { throw new Error("offline"); } });
  await flush(); await flush();
  assert.equal(storage.map.size, 0);
  assert.equal(referralCodeFor("customer"), "ABCD2345");
  __resetReferralCaptureForTests();
});

test("19 — gesperrter Speicher bricht nichts", async () => {
  __resetReferralCaptureForTests();
  const gesperrt = {
    getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); },
  };
  const { win } = fakeWindow("/register?ref=ABCD2345", gesperrt);
  startReferralCapture({ win, now: () => T0, loadConfig: async () => ENABLED });
  await flush(); await flush();
  assert.equal(referralCodeFor("customer"), "ABCD2345");
  __resetReferralCaptureForTests();
});

/* ══════════ Verdrahtung (Quelltextanker auf kommentarfreiem Code) ═══════ */

test("20 — main.jsx startet die Erfassung VOR dem ersten Rendern mit dem öffentlichen Abruf", () => {
  const main = ohneKommentare(read("main.jsx"));
  const start = main.indexOf("startReferralCapture(");
  const render = main.indexOf("createRoot(");
  assert.ok(start > 0 && render > start, "die Erfassung muss vor createRoot laufen");
  assert.match(main, /startReferralCapture\(\{ loadConfig: loadSalesPartnerPublicConfig \}\)/);
});

test("21 — Kundenregistrierung sendet nur den Kundencode, Partnerregistrierung nur den Partnercode", () => {
  const auth = ohneKommentare(read("pages/AuthPage.jsx"));
  assert.match(auth, /withReferralCode\(buildRegistrationPayload\(regForm\), referralCodeFor\("customer"\)\)/);
  assert.match(auth, /clearReferral\("customer"\)/);
  assert.doesNotMatch(auth, /referralCodeFor\("partner"\)/);
  const partner = ohneKommentare(read("pages/PartnerRegisterPage.jsx"));
  assert.match(partner, /sponsorCode: referralCodeFor\("partner"\)/);
  assert.match(partner, /clearReferral\("partner"\)/);
  assert.doesNotMatch(partner, /referralCodeFor\("customer"\)/);
});

test("22 — localStorage wird für Empfehlungen ausschließlich in diesem Modul berührt", () => {
  for (const datei of ["pages/AuthPage.jsx", "pages/PartnerRegisterPage.jsx", "main.jsx", "api/partnerApi.js"]) {
    assert.doesNotMatch(ohneKommentare(read(datei)), /ce_ref_/, `${datei}: eigener Zugriff auf die Empfehlungsschlüssel`);
  }
});
