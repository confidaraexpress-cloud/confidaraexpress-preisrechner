import { useSyncExternalStore } from "react";

/* ── useOnlineStatus() ───────────────────────────────────────────────────────
   Meldet, ob der Browser eine Netzverbindung sieht — ausschließlich als
   HINWEIS für die Oberfläche. `navigator.onLine === false` ist verlässlich
   „offline"; `true` beweist dagegen keine funktionierende Verbindung. Keine
   Sicherheits- oder Buchungsentscheidung hängt daran: maßgeblich bleiben die
   bestehenden Fehlerpfade der API-Aufrufe. */

function abonnieren(fn) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

const istOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export function useOnlineStatus() {
  return useSyncExternalStore(abonnieren, istOnline, () => true);
}
