import { useEffect, useState } from "react";
import {
  hasNewerVersion, isComparableEntry, UPDATE_CHECK_MIN_INTERVAL_MS, UPDATE_CHECK_PERIOD_MS,
} from "../utils/appVersionCheck.mjs";

/* ── useAppUpdateAvailable() ─────────────────────────────────────────────────
   true, sobald eine neuere Version ausgeliefert ist als die laufende.

   Geprüft wird die eigene, statische index.html dieser Origin — kein
   Backendaufruf, keine Kundendaten. Anlass: Fokus/Sichtbarkeit (frühestens
   alle 15 Minuten) und ein ruhiger Takt, solange die Seite sichtbar ist.
   Ohne gehashten Einstiegspunkt (Entwicklungsserver) bleibt die Prüfung aus.

   Das Ergebnis ist nur ein Hinweis. Neu geladen wird ausschließlich auf
   ausdrücklichen Klick des Kunden. */
export function useAppUpdateAvailable() {
  const [verfuegbar, setVerfuegbar] = useState(false);

  useEffect(() => {
    const skript = document.querySelector('script[type="module"][src^="/assets/index-"]');
    const aktuell = skript ? skript.getAttribute("src") : null;
    if (!isComparableEntry(aktuell)) return undefined;

    let aktiv = true;
    let zuletzt = Date.now();
    const pruefen = async (erzwungen = false) => {
      if (document.hidden) return;
      const jetzt = Date.now();
      if (!erzwungen && jetzt - zuletzt < UPDATE_CHECK_MIN_INTERVAL_MS) return;
      zuletzt = jetzt;
      try {
        const r = await fetch("/index.html", { cache: "no-store", credentials: "same-origin" });
        if (!r.ok) return;
        const html = await r.text();
        if (aktiv && hasNewerVersion(aktuell, html)) setVerfuegbar(true);
      } catch {
        /* offline oder Netzfehler: nächster Anlass prüft erneut */
      }
    };
    const beiAnlass = () => { pruefen(); };
    const takt = setInterval(() => { pruefen(true); }, UPDATE_CHECK_PERIOD_MS);
    document.addEventListener("visibilitychange", beiAnlass);
    window.addEventListener("focus", beiAnlass);
    return () => {
      aktiv = false;
      clearInterval(takt);
      document.removeEventListener("visibilitychange", beiAnlass);
      window.removeEventListener("focus", beiAnlass);
    };
  }, []);

  return verfuegbar;
}
