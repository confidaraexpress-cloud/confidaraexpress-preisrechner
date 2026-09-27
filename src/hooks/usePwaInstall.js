import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getPwaInstallSnapshot, subscribePwaInstall } from "../utils/pwaInstallPrompt";
import {
  detectInstallPlatform, installState, isStandaloneDisplay, showInstallNavItem, installNavLabel,
} from "../utils/pwaInstallView.mjs";

/* ── usePwaInstall() ─────────────────────────────────────────────────────────
   Führt drei Quellen zu EINEM Installationszustand zusammen:
     • das aufbewahrte Browserereignis (utils/pwaInstallPrompt.js),
     • die Plattformfamilie aus dem User-Agent (einmal je Mount),
     • den Anzeigemodus — läuft die Seite bereits als App?
   Die Entscheidung selbst fällt ausschließlich in pwaInstallView.mjs. */

const STANDALONE_QUERY = "(display-mode: standalone)";

function leseStandalone() {
  if (typeof window === "undefined") return false;
  const media = typeof window.matchMedia === "function" ? window.matchMedia(STANDALONE_QUERY).matches : false;
  return isStandaloneDisplay({ standaloneMedia: media, navigatorStandalone: window.navigator.standalone === true });
}

function useStandaloneDisplay() {
  const [standalone, setStandalone] = useState(leseStandalone);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(STANDALONE_QUERY);
    const onChange = () => setStandalone(leseStandalone());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return standalone;
}

export function usePwaInstall() {
  const stand = useSyncExternalStore(subscribePwaInstall, getPwaInstallSnapshot, getPwaInstallSnapshot);
  const standalone = useStandaloneDisplay();
  const platform = useMemo(() => {
    if (typeof navigator === "undefined") return detectInstallPlatform();
    return detectInstallPlatform({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
  }, []);

  const state = installState({
    platform,
    canPrompt: stand.canPrompt,
    standalone,
    installedNow: stand.installedNow,
  });

  return {
    state,
    showNavItem: showInstallNavItem({ state, hintDone: stand.hintDone }),
    navLabel: installNavLabel(state),
    // Offener Wunsch des Navigationseintrags, zur Karte zu springen
    // (Vertrag in utils/pwaInstallPrompt.js).
    cardFocusPending: stand.cardFocusPending,
  };
}
