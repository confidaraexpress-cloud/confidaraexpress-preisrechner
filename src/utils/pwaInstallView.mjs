// ── ConfidaraExpress als App: reine Ansichtslogik (kein React, kein DOM, kein Netz) ──
//
// Welche Installationsmöglichkeit ein Browser bietet, entscheidet ausschließlich
// der Browser selbst. Diese Datei beantwortet nur zwei Fragen, und zwar aus
// Eingaben, die der Aufrufer übergibt (User-Agent, Anzeigemodus, ob ein
// Installationsereignis vorliegt):
//
//   1. Welcher Installationsweg ist hier ehrlich anzubieten?
//   2. Welche Worte sieht der Kunde dafür?
//
// Es wird bewusst NICHT versucht, im normalen Browserfenster zu erraten, ob die
// App irgendwo bereits installiert ist. Das ist plattformübergreifend nicht
// verlässlich möglich — eine falsche Behauptung wäre schlechter als keine.
//
// Kein Text dieser Datei nennt einen Versandanbieter oder Einkaufsweg.

// Plattformfamilien, soweit sie für die Installation einen UNTERSCHIEDLICHEN
// Weg bedeuten. Mehr Unterscheidung braucht die Oberfläche nicht.
export const INSTALL_PLATFORM = Object.freeze({
  CHROMIUM: "chromium",     // Chrome, Edge, Samsung Internet, Opera — Installationsdialog des Browsers
  IOS: "ios",               // iPhone/iPad (jeder Browser) — Teilen-Menü, „Zum Home-Bildschirm"
  SAFARI_MAC: "safari_mac", // Safari ab 17 auf dem Mac — „Zum Dock hinzufügen"
  OTHER: "other",           // alles Übrige — keine Installation anbieten
});

// Zustände der Installationskarte. Genau einer gilt.
export const INSTALL_STATE = Object.freeze({
  INSTALLED: "installed",           // läuft bereits als App (eigenes Fenster)
  JUST_INSTALLED: "just_installed", // in dieser Sitzung installiert (appinstalled)
  PROMPT: "prompt",                 // Browserdialog steht bereit (beforeinstallprompt)
  IOS: "ios",                       // Anleitung Home-Bildschirm
  SAFARI_MAC: "safari_mac",         // Anleitung Dock
  BROWSER_MENU: "browser_menu",     // Chromium ohne Dialog: bereits installiert oder noch nicht angeboten
  UNSUPPORTED: "unsupported",       // keine Installation — die Website funktioniert unverändert
});

/** Plattformfamilie aus den Browserangaben. iPadOS meldet sich mit einem
 *  Desktop-User-Agent („Macintosh"); erkennbar ist es dann an der Touch-Fähigkeit. */
export function detectInstallPlatform({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent || "");
  const touchMac = String(platform || "") === "MacIntel" && Number(maxTouchPoints) > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return INSTALL_PLATFORM.IOS;
  if (/Firefox\//.test(ua)) return INSTALL_PLATFORM.OTHER;
  // Reihenfolge tragend: Chromium-Browser tragen „Safari/" ebenfalls im User-Agent.
  if (/Edg\/|Chrome\/|Chromium\/|SamsungBrowser\//.test(ua)) return INSTALL_PLATFORM.CHROMIUM;
  const safari = /Macintosh/.test(ua) && /Safari\//.test(ua) ? ua.match(/Version\/(\d+)/) : null;
  if (safari && Number(safari[1]) >= 17) return INSTALL_PLATFORM.SAFARI_MAC;
  return INSTALL_PLATFORM.OTHER;
}

/** Läuft die Seite als installierte App? Nur zwei belastbare Signale:
 *  der Anzeigemodus „standalone" und Apples `navigator.standalone`. */
export function isStandaloneDisplay({ standaloneMedia = false, navigatorStandalone = false } = {}) {
  return standaloneMedia === true || navigatorStandalone === true;
}

/** Der eine geltende Kartenzustand. */
export function installState({ platform, canPrompt = false, standalone = false, installedNow = false } = {}) {
  if (standalone) return INSTALL_STATE.INSTALLED;
  if (installedNow) return INSTALL_STATE.JUST_INSTALLED;
  if (canPrompt) return INSTALL_STATE.PROMPT;
  if (platform === INSTALL_PLATFORM.IOS) return INSTALL_STATE.IOS;
  if (platform === INSTALL_PLATFORM.SAFARI_MAC) return INSTALL_STATE.SAFARI_MAC;
  if (platform === INSTALL_PLATFORM.CHROMIUM) return INSTALL_STATE.BROWSER_MENU;
  return INSTALL_STATE.UNSUPPORTED;
}

// Zustände, in denen die Karte eine eigene Handlung anbietet.
const MIT_HANDLUNG = new Set([INSTALL_STATE.PROMPT, INSTALL_STATE.IOS, INSTALL_STATE.SAFARI_MAC]);

/** Der dezente Navigationseintrag dient nur der Entdeckung: sichtbar, solange
 *  es einen echten Installationsweg gibt und der Eintrag auf diesem Gerät noch
 *  nicht benutzt wurde. Die Karte in den Kontoeinstellungen bleibt immer. */
export function showInstallNavItem({ state, hintDone = false } = {}) {
  return !hintDone && MIT_HANDLUNG.has(state);
}

/** Beschriftung des Navigationseintrags — „installieren" nur dort, wo wirklich
 *  ein Installationsdialog des Browsers folgt. */
export function installNavLabel(state) {
  return state === INSTALL_STATE.PROMPT ? INSTALL_TEXT.navInstall : INSTALL_TEXT.navGuide;
}

/** Aktion der Karte je Zustand (null = keine Schaltfläche). Ohne
 *  Installationsdialog des Browsers heißt die Schaltfläche ehrlich
 *  „Anleitung anzeigen" — sie fügt nichts hinzu, sie zeigt den Weg. */
export function installCardAction(state) {
  if (state === INSTALL_STATE.PROMPT) return { kind: "prompt", label: INSTALL_TEXT.promptAction };
  if (state === INSTALL_STATE.IOS) return { kind: "guide", label: INSTALL_TEXT.guideAction, steps: INSTALL_TEXT.iosSteps };
  if (state === INSTALL_STATE.SAFARI_MAC) return { kind: "guide", label: INSTALL_TEXT.guideAction, steps: INSTALL_TEXT.macSteps };
  return null;
}

/** Erklärender Text der Karte je Zustand. */
export function installCardText(state) {
  switch (state) {
    case INSTALL_STATE.INSTALLED: return INSTALL_TEXT.installed;
    case INSTALL_STATE.JUST_INSTALLED: return INSTALL_TEXT.justInstalled;
    case INSTALL_STATE.BROWSER_MENU: return INSTALL_TEXT.browserMenu;
    case INSTALL_STATE.UNSUPPORTED: return INSTALL_TEXT.unsupported;
    case INSTALL_STATE.IOS: return INSTALL_TEXT.introIos;
    case INSTALL_STATE.SAFARI_MAC: return INSTALL_TEXT.introMac;
    default: return INSTALL_TEXT.introPrompt;
  }
}

/** Service Worker nur im Produktionsbuild und nur, wo der Browser ihn kennt. */
export function shouldRegisterServiceWorker({ prod = false, hasServiceWorker = false } = {}) {
  return prod === true && hasServiceWorker === true;
}

// ── Texte ────────────────────────────────────────────────────────────────────
// Bewusst ohne „Download"/„herunterladen": es wird nichts aus einem Store
// geladen, die App ist dieselbe Anwendung in einem eigenen Fenster.
export const INSTALL_TEXT = Object.freeze({
  cardTitle: "ConfidaraExpress als App",
  cardSubtitle: "Direkt vom Startbildschirm, Dock oder der Taskleiste starten",
  introPrompt: "Als App öffnet ConfidaraExpress in einem eigenen Fenster – mit denselben Funktionen und Daten wie im Browser.",
  introIos: "Vom Home-Bildschirm öffnet ConfidaraExpress wie eine App – mit denselben Funktionen und Daten wie im Browser.",
  introMac: "Aus dem Dock öffnet ConfidaraExpress wie eine App – mit denselben Funktionen und Daten wie im Browser.",
  promptAction: "App installieren",
  guideAction: "Anleitung anzeigen",
  navInstall: "App installieren",
  navGuide: "Als App nutzen",
  iosSteps: Object.freeze([
    "Tippen Sie auf „Teilen“ – in Safari je nach Ansicht zuerst auf „•••“.",
    "Wählen Sie „Zum Home-Bildschirm“.",
    "Lassen Sie „Als Web-App öffnen“ eingeschaltet und tippen Sie auf „Hinzufügen“.",
  ]),
  macSteps: Object.freeze([
    "Wählen Sie in Safari im Menü „Ablage“ den Eintrag „Zum Dock hinzufügen …“.",
    "Bestätigen Sie mit „Hinzufügen“.",
  ]),
  guideNote: "In der App melden Sie sich einmalig neu an.",
  installed: "Sie nutzen ConfidaraExpress als App.",
  justInstalled: "ConfidaraExpress wurde installiert. Sie finden die App auf Ihrem Startbildschirm bzw. in Ihrem Startmenü.",
  browserMenu: "Ist ConfidaraExpress bereits installiert, öffnen Sie die App über ihr Symbol. Andernfalls finden Sie die Installation im Menü Ihres Browsers.",
  unsupported: "Ihr Browser bietet keine App-Installation an. Alle Funktionen stehen Ihnen im Browser vollständig zur Verfügung.",
  promptFailed: "Die Installation konnte nicht gestartet werden. Bitte versuchen Sie es später erneut.",
});
