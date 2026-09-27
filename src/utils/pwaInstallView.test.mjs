// ConfidaraExpress als App — reine Installationslogik + Strukturverträge der
// Bauteile (Karte, Navigationseintrag, Ereignisfang).
//
// Dieselbe Bauart wie die übrigen *View-Tests: Logik direkt, Komponenten über
// ihren Quelltext (kein jsdom, keine Testing-Library).
//
// Run: node --test src/utils/pwaInstallView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  INSTALL_PLATFORM, INSTALL_STATE, INSTALL_TEXT,
  detectInstallPlatform, isStandaloneDisplay, installState, showInstallNavItem,
  installNavLabel, installCardAction, installCardText, shouldRegisterServiceWorker,
} from "./pwaInstallView.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

// Reale User-Agent-Zeichenketten (gekürzt auf die tragenden Teile).
const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 16; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/140.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.0.0 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15",
  safariMacAlt: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
  firefoxAndroid: "Mozilla/5.0 (Android 16; Mobile; rv:156.0) Gecko/156.0 Firefox/156.0",
};

/* ══════════ 1 — Plattformfamilie ════════════════════════════════════════ */

test("1 — Chromium-Browser haben den Installationsdialog des Browsers", () => {
  for (const ua of [UA.chromeWin, UA.edgeWin, UA.chromeAndroid, UA.samsung, UA.chromeMac]) {
    assert.equal(detectInstallPlatform({ userAgent: ua, platform: "Win32", maxTouchPoints: 0 }), INSTALL_PLATFORM.CHROMIUM, ua);
  }
});

test("2 — iPhone und iPad (auch mit Desktop-User-Agent) nutzen den Home-Bildschirm", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.iphone, platform: "iPhone", maxTouchPoints: 5 }), INSTALL_PLATFORM.IOS);
  // Jeder iOS-Browser kann seit iOS 16.4 zum Home-Bildschirm hinzufügen.
  assert.equal(detectInstallPlatform({ userAgent: UA.iphoneChrome, platform: "iPhone", maxTouchPoints: 5 }), INSTALL_PLATFORM.IOS);
  // iPadOS meldet sich als Macintosh — erkennbar an der Touch-Fähigkeit.
  assert.equal(detectInstallPlatform({ userAgent: UA.ipadDesktop, platform: "MacIntel", maxTouchPoints: 5 }), INSTALL_PLATFORM.IOS);
});

test("3 — Safari am Mac ab Version 17 (Zum Dock), ältere und Firefox ohne Angebot", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.safariMac, platform: "MacIntel", maxTouchPoints: 0 }), INSTALL_PLATFORM.SAFARI_MAC);
  assert.equal(detectInstallPlatform({ userAgent: UA.safariMacAlt, platform: "MacIntel", maxTouchPoints: 0 }), INSTALL_PLATFORM.OTHER);
  assert.equal(detectInstallPlatform({ userAgent: UA.firefoxWin, platform: "Win32", maxTouchPoints: 0 }), INSTALL_PLATFORM.OTHER);
  assert.equal(detectInstallPlatform({ userAgent: UA.firefoxAndroid, platform: "Linux", maxTouchPoints: 5 }), INSTALL_PLATFORM.OTHER);
  assert.equal(detectInstallPlatform({}), INSTALL_PLATFORM.OTHER);
  assert.equal(detectInstallPlatform(), INSTALL_PLATFORM.OTHER);
});

/* ══════════ 2 — Zustand ═════════════════════════════════════════════════ */

test("4 — als App geöffnet schlägt jeden anderen Zustand", () => {
  for (const platform of Object.values(INSTALL_PLATFORM)) {
    assert.equal(installState({ platform, canPrompt: true, standalone: true }), INSTALL_STATE.INSTALLED);
  }
  assert.equal(isStandaloneDisplay({ standaloneMedia: true }), true);
  assert.equal(isStandaloneDisplay({ navigatorStandalone: true }), true);
  assert.equal(isStandaloneDisplay({}), false);
  // Nur echte Wahrheitswerte zählen — kein Raten aus „truthy" Werten.
  assert.equal(isStandaloneDisplay({ standaloneMedia: "true", navigatorStandalone: 1 }), false);
});

test("5 — Zustandsmatrix", () => {
  const C = INSTALL_PLATFORM.CHROMIUM;
  assert.equal(installState({ platform: C, canPrompt: true }), INSTALL_STATE.PROMPT);
  assert.equal(installState({ platform: C, canPrompt: false }), INSTALL_STATE.BROWSER_MENU);
  assert.equal(installState({ platform: C, installedNow: true }), INSTALL_STATE.JUST_INSTALLED);
  assert.equal(installState({ platform: INSTALL_PLATFORM.IOS }), INSTALL_STATE.IOS);
  assert.equal(installState({ platform: INSTALL_PLATFORM.SAFARI_MAC }), INSTALL_STATE.SAFARI_MAC);
  assert.equal(installState({ platform: INSTALL_PLATFORM.OTHER }), INSTALL_STATE.UNSUPPORTED);
  assert.equal(installState({}), INSTALL_STATE.UNSUPPORTED);
});

test("6 — Karte: Handlung nur mit echtem Installationsweg, sonst ein ruhiger Satz", () => {
  assert.deepEqual(installCardAction(INSTALL_STATE.PROMPT), { kind: "prompt", label: "App installieren" });
  // Ohne Browserdialog zeigt die Schaltfläche den Weg — sie behauptet keine Installation.
  const ios = installCardAction(INSTALL_STATE.IOS);
  assert.equal(ios.kind, "guide");
  assert.equal(ios.label, "Anleitung anzeigen");
  assert.equal(ios.steps.length, 3);
  assert.match(ios.steps.join(" "), /Zum Home-Bildschirm/);
  const mac = installCardAction(INSTALL_STATE.SAFARI_MAC);
  assert.equal(mac.label, "Anleitung anzeigen");
  assert.match(mac.steps.join(" "), /Zum Dock hinzufügen/);
  for (const s of [INSTALL_STATE.INSTALLED, INSTALL_STATE.JUST_INSTALLED, INSTALL_STATE.BROWSER_MENU, INSTALL_STATE.UNSUPPORTED]) {
    assert.equal(installCardAction(s), null, `${s} darf keine Schaltfläche tragen`);
  }
  assert.equal(installCardText(INSTALL_STATE.INSTALLED), INSTALL_TEXT.installed);
  assert.equal(installCardText(INSTALL_STATE.UNSUPPORTED), INSTALL_TEXT.unsupported);
  assert.equal(installCardText(INSTALL_STATE.PROMPT), INSTALL_TEXT.introPrompt);
  assert.equal(installCardText(INSTALL_STATE.IOS), INSTALL_TEXT.introIos);
  assert.equal(installCardText(INSTALL_STATE.SAFARI_MAC), INSTALL_TEXT.introMac);
});

test("6b — Schaltflächen passen auch bei 320 px: keine Beschriftung über 20 Zeichen", () => {
  // Buttons brechen im Designsystem bewusst nicht um (buttons.css: white-space: nowrap).
  for (const label of [INSTALL_TEXT.promptAction, INSTALL_TEXT.guideAction, INSTALL_TEXT.navInstall, INSTALL_TEXT.navGuide]) {
    assert.ok(label.length <= 20, `zu lange Beschriftung für schmale Karten: ${label}`);
  }
});

test("7 — Navigationseintrag: nur mit Installationsweg und nur bis zur ersten Benutzung", () => {
  for (const s of [INSTALL_STATE.PROMPT, INSTALL_STATE.IOS, INSTALL_STATE.SAFARI_MAC]) {
    assert.equal(showInstallNavItem({ state: s, hintDone: false }), true, s);
    assert.equal(showInstallNavItem({ state: s, hintDone: true }), false, s);
  }
  for (const s of [INSTALL_STATE.INSTALLED, INSTALL_STATE.JUST_INSTALLED, INSTALL_STATE.BROWSER_MENU, INSTALL_STATE.UNSUPPORTED]) {
    assert.equal(showInstallNavItem({ state: s, hintDone: false }), false, s);
  }
  // „installieren" nur, wo wirklich ein Browserdialog folgt.
  assert.equal(installNavLabel(INSTALL_STATE.PROMPT), "App installieren");
  assert.equal(installNavLabel(INSTALL_STATE.IOS), "Als App nutzen");
  assert.equal(installNavLabel(INSTALL_STATE.SAFARI_MAC), "Als App nutzen");
});

test("8 — Service Worker nur im Produktionsbuild und nur mit Browserunterstützung", () => {
  assert.equal(shouldRegisterServiceWorker({ prod: true, hasServiceWorker: true }), true);
  assert.equal(shouldRegisterServiceWorker({ prod: false, hasServiceWorker: true }), false);
  assert.equal(shouldRegisterServiceWorker({ prod: true, hasServiceWorker: false }), false);
  assert.equal(shouldRegisterServiceWorker({ prod: "true", hasServiceWorker: true }), false);
  assert.equal(shouldRegisterServiceWorker(), false);
});

/* ══════════ 3 — Texte ═══════════════════════════════════════════════════ */

function alleTexte() {
  const out = [];
  for (const v of Object.values(INSTALL_TEXT)) {
    if (Array.isArray(v)) out.push(...v); else out.push(v);
  }
  return out;
}

test("9 — keine Anbieter-, Einkaufs- oder Download-Begriffe in den Kundentexten", () => {
  for (const t of alleTexte()) {
    assert.doesNotMatch(t, /jumingo|transglobal|\bTG\b/i, `Anbietername im Kundentext: ${t}`);
    assert.doesNotMatch(t, /download|herunterlad/i, `„Download"-Begriff im Installationstext: ${t}`);
    assert.doesNotMatch(t, /store/i, `Store-Begriff, obwohl nichts aus einem Store kommt: ${t}`);
  }
  assert.equal(INSTALL_TEXT.cardTitle, "ConfidaraExpress als App");
});

/* ══════════ 4 — Strukturverträge der Bauteile ═══════════════════════════ */

const capture = ohneKommentare(read("utils/pwaInstallPrompt.js"));
const karte = ohneKommentare(read("components/dashboard/AppInstallCard.jsx"));
const sidebar = ohneKommentare(read("components/layout/DashboardSidebar.jsx"));
const profile = ohneKommentare(read("components/dashboard/Profile.jsx"));
const main = ohneKommentare(read("main.jsx"));

test("10 — das Browserereignis wird früh abgefangen, zurückgehalten und NIE selbst ausgelöst", () => {
  assert.match(capture, /addEventListener\("beforeinstallprompt", \(e\) => \{\s*e\.preventDefault\(\);/,
    "beforeinstallprompt muss sofort preventDefault() erhalten");
  // prompt() nur in der einen Funktion, die an Klicks hängt.
  assert.equal((capture.match(/\.prompt\(\)/g) || []).length, 1, "prompt() darf genau einmal vorkommen");
  const promptFn = capture.slice(capture.indexOf("export async function promptPwaInstall"));
  assert.ok(promptFn.indexOf(".prompt()") > 0, "prompt() gehört ausschließlich in promptPwaInstall");
  // Früh: vor dem ersten Rendern registriert.
  assert.ok(main.indexOf("startPwaInstallCapture();") > -1, "main.jsx startet den Ereignisfang nicht");
  assert.ok(main.indexOf("startPwaInstallCapture();") < main.indexOf("createRoot("),
    "der Ereignisfang muss VOR dem ersten Rendern laufen");
});

test("11 — kein automatischer Installationsdialog: promptPwaInstall hängt nur an Klickhandlern", () => {
  for (const [name, code] of [["Karte", karte], ["Sidebar", sidebar]]) {
    const aufrufe = [...code.matchAll(/promptPwaInstall\(\)/g)].length;
    assert.ok(aufrufe >= 1, `${name} ruft den Dialog nicht auf`);
    assert.doesNotMatch(code, /useEffect\([^)]*promptPwaInstall/s, `${name}: Dialog in einem Effekt`);
  }
  // Im Effekt der Karte steht KEIN Dialogaufruf.
  const effekt = karte.slice(karte.indexOf("useEffect("), karte.indexOf("const installieren"));
  assert.doesNotMatch(effekt, /promptPwaInstall/, "die Karte öffnet den Dialog beim Mount");
});

test("12 — die Karte sitzt in der rechten Spalte direkt nach „Sicherheit“", () => {
  const rechts = profile.slice(profile.indexOf("{renderAccountCard()}"));
  const sicherheit = rechts.indexOf("{renderSecurityCard()}");
  const app = rechts.indexOf("<AppInstallCard />");
  assert.ok(sicherheit > -1 && app > sicherheit, "AppInstallCard fehlt nach der Sicherheitskarte");
  assert.equal((profile.match(/<AppInstallCard \/>/g) || []).length, 1, "genau eine Installationskarte");
  // Dasselbe Kartenmaterial wie jede Profilkarte, CE-Signet aus dem zentralen Markenbauteil.
  assert.match(karte, /className="table-card profile-card pwa-card"/);
  assert.match(karte, /className="table-card-header profile-card-head"/);
  assert.match(karte, /<BrandLogo variant="signet" tone="standard" alt="" \/>/);
});

test("13 — der Navigationseintrag steht vor „Abmelden“ und nur unter seiner Bedingung", () => {
  const nav = sidebar.slice(sidebar.indexOf('<nav className="pp-nav">'), sidebar.indexOf("</nav>"));
  const trenner = nav.indexOf("pp-nav-utility-divider");
  const eintrag = nav.indexOf("{pwa.showNavItem && (");
  const abmelden = nav.indexOf("onClick={handleLogout}");
  assert.ok(trenner > -1 && eintrag > trenner && abmelden > eintrag,
    "Reihenfolge: Trennlinie → App-Eintrag → Abmelden");
  assert.match(nav, /className="nitem nitem--utility" onClick=\{handleInstallEntry\}/,
    "der Eintrag nutzt dieselbe Utility-Form wie „Abmelden“");
  assert.match(sidebar, /markInstallHintDone\(\);/, "nach Benutzung muss der Hinweis verschwinden");
});
