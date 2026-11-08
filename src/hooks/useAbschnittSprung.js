import { useEffect, useRef } from "react";

/* ── Sprung zu einem Abschnitt der Kontoeinstellungen ────────────────────────────────────────────────────────────
   EINE Fassung für die App-Karte (Navigationseintrag „Als App nutzen“) und den Abschnitt „Sicherheit“ (Profilmenü,
   „Sicherheit & Passwort“). Ausgelagert aus AppInstallCard, Verhalten unverändert.

   Der Sprung kann mit dem Abbau des Verlassen-Dialogs, der bisherigen Scrollposition und späten Layout-Änderungen der
   Profilabschnitte konkurrieren (Logo, Lieferschein und Abrechnungsart laden nach). Ein oder zwei rAF reichen nicht
   (CI C11: Titel fokussiert, Karte weiterhin außerhalb des Fensters). Die Ausrichtung ist deshalb am TATSÄCHLICHEN
   Rechteck verankert, nicht am Zeitpunkt des Mounts.

   Kurzzeitig auf Resize und fremde programmatische Scrolls reagieren, danach aufhören. Sobald der Nutzer selbst scrollt
   oder interagiert, hat sein Wunsch Vorrang; beim Unmount wird alles aufgeräumt.

   aktiv    — der Sprung läuft (vom Aufrufer gesetzt, sobald er einen Wunsch eingelöst hat)
   zielRef  — der Abschnitt, der ins Bild soll (scroll-margin-top wird beachtet)
   fokusRef — das Element, das den Fokus bekommt, sobald der Abschnitt im Bild ist (Titel mit tabIndex -1)
   onEnde   — nach Abschluss, nach einer Nutzeraktion oder spätestens nach 2 s
   oben     — false (App-Karte, unverändert): ausgerichtet wird nur, solange die Oberkante nicht im Fenster liegt.
              true (Abschnitt „Sicherheit“): die Oberkante steht an scroll-margin-top, soweit das Dokument reicht —
              auch wenn Abschnitte darüber nachladen und ihn verschieben (sonst rutschte die Passwortzeile unter die
              Ansprechpartnerkarte). */
export function useAbschnittSprung(aktiv, zielRef, fokusRef, onEnde, { oben = false } = {}) {
  const endeRef = useRef(onEnde);
  endeRef.current = onEnde;

  useEffect(() => {
    if (!aktiv) return undefined;

    const karteEl = zielRef.current;
    const titelEl = fokusRef.current;
    if (!karteEl || !titelEl) {
      endeRef.current();
      return undefined;
    }

    let laeuft = true;
    let frame = 0;
    let fertigTimer = 0;
    let fokusGesetzt = false;
    const imBild = () => {
      const r = karteEl.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight;
    };
    const zielPosition = () => {
      const r = karteEl.getBoundingClientRect();
      const abstand = parseFloat(getComputedStyle(karteEl).scrollMarginTop) || 0;
      const root = document.scrollingElement;
      const max = root ? Math.max(0, root.scrollHeight - window.innerHeight) : Infinity;
      return Math.max(0, Math.min(max, window.scrollY + r.top - abstand));
    };
    const ausrichten = () => {
      frame = 0;
      if (!laeuft || !karteEl.isConnected) return;
      const ziel = zielPosition();
      if (oben ? Math.abs(ziel - window.scrollY) >= 2 : !imBild()) {
        // Explizites Fensterziel statt nur scrollIntoView: bei einem erst
        // entstehenden Profil wurde das Dokument vorher nicht verschoben.
        window.scrollTo({ top: ziel, behavior: "instant" });
      }
      if (imBild() && !fokusGesetzt && titelEl.isConnected) {
        titelEl.focus({ preventScroll: true });
        fokusGesetzt = true;
      }
    };
    const planen = () => {
      if (!laeuft || frame) return;
      frame = requestAnimationFrame(ausrichten);
    };
    const beenden = () => {
      if (laeuft) endeRef.current();
    };

    const beobachter = typeof ResizeObserver === "function"
      ? new ResizeObserver(planen) : null;
    if (beobachter) {
      beobachter.observe(karteEl);
      const abschnitte = karteEl.closest(".profile-sections");
      if (abschnitte) beobachter.observe(abschnitte);
    }
    window.addEventListener("scroll", planen, { passive: true });
    // Nutzeraktionen beenden die kurze Nachführung: kein Scroll-Hijacking.
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
      window.addEventListener(event, beenden, { passive: true });
    }
    planen();
    fertigTimer = window.setTimeout(beenden, 2000);

    return () => {
      laeuft = false;
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(fertigTimer);
      beobachter?.disconnect();
      window.removeEventListener("scroll", planen);
      for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
        window.removeEventListener(event, beenden);
      }
    };
  }, [aktiv]); // eslint-disable-line react-hooks/exhaustive-deps
}
