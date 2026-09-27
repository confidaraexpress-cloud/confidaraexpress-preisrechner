// ── Installationsereignisse des Browsers — früh abfangen, erst auf Klick nutzen ──
//
// Chromium-Browser melden über `beforeinstallprompt`, dass sie ConfidaraExpress
// installieren könnten. Das Ereignis kommt irgendwann nach dem Laden — auch vor
// dem Login und auch, bevor React die Kontoeinstellungen je gezeigt hat. Es wird
// deshalb beim Start (main.jsx) abgefangen und aufbewahrt:
//
//   • preventDefault(): der Browser zeigt keinen eigenen Installationshinweis
//     (MDN: „on some platforms"). Eine Garantie, dass ein Browser nie selbst
//     eine Installation anbietet, gibt es nicht — und wird hier nicht behauptet.
//   • prompt() erst, wenn der Kunde ausdrücklich „App installieren" wählt.
//     Nie automatisch, nie beim Login.
//   • Ein Ereignis ist nur EINMAL nutzbar; danach wird es verworfen.
//
// Gehalten wird nur Zustand des Browsers, keine Kundendaten. Einziger
// Speicherwert: ob der dezente Navigationshinweis auf diesem Gerät schon
// benutzt wurde (Komfortwert, kein Sitzungsbezug).

const HINWEIS_KEY = "ce_pwa_hint_done";

let gestartet = false;
let aufgeschoben = null;      // das aufbewahrte beforeinstallprompt-Ereignis
let installiertJetzt = false; // appinstalled in dieser Sitzung
let kartenFokus = false;      // Navigationseintrag → Karte öffnen und zeigen
const abonnenten = new Set();

function hinweisErledigt() {
  try {
    return window.localStorage.getItem(HINWEIS_KEY) === "1";
  } catch {
    return false;
  }
}

let stand = { canPrompt: false, installedNow: false, hintDone: false, cardFocusPending: false };

function melden() {
  stand = {
    canPrompt: aufgeschoben !== null,
    installedNow: installiertJetzt,
    hintDone: hinweisErledigt(),
    cardFocusPending: kartenFokus,
  };
  abonnenten.forEach((fn) => fn());
}

export function startPwaInstallCapture() {
  if (gestartet || typeof window === "undefined") return;
  gestartet = true;
  stand = { ...stand, hintDone: hinweisErledigt() };
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    aufgeschoben = e;
    melden();
  });
  window.addEventListener("appinstalled", () => {
    aufgeschoben = null;
    installiertJetzt = true;
    melden();
  });
}

export function subscribePwaInstall(fn) {
  abonnenten.add(fn);
  return () => abonnenten.delete(fn);
}

export function getPwaInstallSnapshot() {
  return stand;
}

/** Zeigt den Installationsdialog des Browsers — nur als Folge eines Klicks.
 *  Ergebnis: "accepted" | "dismissed" | "unavailable" | "failed". */
export async function promptPwaInstall() {
  const e = aufgeschoben;
  if (!e) return "unavailable";
  aufgeschoben = null;
  melden();
  try {
    await e.prompt();
    const wahl = await e.userChoice;
    return wahl && wahl.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "failed";
  }
}

export function markInstallHintDone() {
  try {
    window.localStorage.setItem(HINWEIS_KEY, "1");
  } catch {
    /* gesperrter Speicher: der Hinweis bleibt dann eben sichtbar */
  }
  melden();
}

// Navigationseintrag → Karte zeigen, Anleitung öffnen, Fokus setzen.
//
// Der offene Wunsch ist Teil des gemeldeten Zustands, kein Mount-Signal: eine
// schon sichtbare Karte (Kontoeinstellungen bereits offen — kein Remount)
// reagiert sofort, eine erst entstehende beim Mount. Die Karte verbraucht ihn
// genau einmal. Angefordert wird er erst, wenn die Navigation dorthin
// tatsächlich ausgeführt wird (DashboardSidebar, Folgeaktion von navigateTo) —
// ein vom Verlassen-Guard verworfenes Ziel hinterlässt deshalb keinen Wunsch.
export function requestInstallCardFocus() {
  kartenFokus = true;
  melden();
}

export function consumeInstallCardFocus() {
  if (!kartenFokus) return false;
  kartenFokus = false;
  melden();
  return true;
}
