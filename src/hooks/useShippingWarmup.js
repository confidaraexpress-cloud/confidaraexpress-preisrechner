// src/hooks/useShippingWarmup.js — meldet „Versandbereich aktiv" für „Neue Sendung" und den Versandkostenrechner.
//
// Eine gemeinsame Meldelogik für beide Seiten (utils/shippingWarmup.mjs): Eintritt in die Seite, Wieder-Sichtbar-
// werden des Tabs und die erste Eingabe nach längerer Ruhe. Kein Timer, kein Ladezustand, kein Rückgabewert —
// die Seite rendert und lädt exakt wie zuvor. Ob ein Anbieter vorgewärmt wird, entscheidet allein der Server.
import { useEffect } from "react";
import { notifyShippingActive } from "../api/client";
import { createShippingWarmupSignal } from "../utils/shippingWarmup.mjs";

// Prozessweit EINE Drossel: ein Wechsel zwischen Rechner und „Neue Sendung" teilt denselben Stand.
const signal = createShippingWarmupSignal({ send: notifyShippingActive });

export function useShippingWarmup() {
  useEffect(() => {
    signal.onPageEnter();
    const sichtbar = () => { if (document.visibilityState === "visible") signal.onVisible(); };
    const aktiv = () => signal.onActivity();
    document.addEventListener("visibilitychange", sichtbar);
    document.addEventListener("pointerdown", aktiv, { capture: true, passive: true });
    document.addEventListener("keydown", aktiv, { capture: true, passive: true });
    return () => {
      document.removeEventListener("visibilitychange", sichtbar);
      document.removeEventListener("pointerdown", aktiv, { capture: true });
      document.removeEventListener("keydown", aktiv, { capture: true });
    };
  }, []);
}
