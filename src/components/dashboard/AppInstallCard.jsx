import React, { useEffect, useRef, useState } from "react";
import { BrandLogo } from "../ui/BrandLogo";
import { FormAlert } from "../ui/FormAlert";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import {
  consumeInstallCardFocus, markInstallHintDone, promptPwaInstall,
} from "../../utils/pwaInstallPrompt";
import {
  INSTALL_STATE, INSTALL_TEXT, installCardAction, installCardText,
} from "../../utils/pwaInstallView.mjs";

/* ── Kontoeinstellungen: „ConfidaraExpress als App" ──────────────────────────
   Der verlässliche, dauerhafte Ort für die Installation — letzter Abschnitt
   der Kontoeinstellungen, direkt nach „Sicherheit". Dieselbe Abschnittsform
   wie jeder Einstellungsabschnitt (Titel links, Inhalt rechts; Redesign
   2026-10), dieselbe Zeilenmechanik wie „Passwort ändern": Erklärung links,
   Aktion rechts, auf schmalen Breiten darunter. Das kleine CE-Signet ist das
   App-Symbol, das auf dem Gerät erscheint — es bleibt die bestehende
   PWA-Marke, bis eine finale Markenfreigabe die App-Icons wechselt.

   Was angeboten wird, entscheidet pwaInstallView.mjs aus dem, was der Browser
   tatsächlich kann:
     • Chromium mit bereitem Dialog → „App installieren" (Browserdialog, nur
       auf Klick),
     • iPhone/iPad und Safari am Mac → kurze Anleitung, KEIN nachgebauter
       Installationsdialog,
     • bereits als App geöffnet → Status statt Aktion,
     • sonst ein ruhiger Satz ohne Schaltfläche.
   Keine automatische Nachfrage, kein Modal. */
export function AppInstallCard() {
  const { state, cardFocusPending } = usePwaInstall();
  const aktion = installCardAction(state);
  const [anleitungOffen, setAnleitungOffen] = useState(false);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [sprung, setSprung] = useState(false);
  const karteRef = useRef(null);
  const titelRef = useRef(null);

  // Vom Navigationseintrag hierher geschickt: Karte zeigen, Anleitung öffnen,
  // Fokus auf den Titel (Tastatur und Screenreader landen am richtigen Ort).
  //
  // Der Wunsch ist gemeldeter Zustand, kein Mount-Signal: er greift beim Mount
  // (aus einem anderen Bereich hierher) UND bei schon sichtbarer Karte — waren
  // die Kontoeinstellungen bereits offen, gibt es keinen Remount, der ihn sonst
  // auslöste. Verbraucht wird er genau einmal. Erst wird die Anleitung
  // aufgeklappt, positioniert wird im nächsten Effekt, wenn die Karte ihre
  // endgültige Höhe hat.
  useEffect(() => {
    if (!cardFocusPending || !consumeInstallCardFocus()) return;
    if (aktion && aktion.kind === "guide") setAnleitungOffen(true);
    setSprung(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardFocusPending]);

  // Der Sprung kann mit dem Abbau des Verlassen-Dialogs, der bisherigen
  // Scrollposition und spaeten Layout-Aenderungen der Profilabschnitte
  // konkurrieren. Ein oder zwei rAF reichen nicht (CI C11: Titel fokussiert,
  // Karte weiterhin ausserhalb des Fensters). Die Ausrichtung ist deshalb
  // am TATSAECHLICHEN Rechteck verankert, nicht am Zeitpunkt des Mounts.
  //
  // Kurzzeitig auf Resize und fremde programmatische Scrolls reagieren,
  // danach aufhoeren. Sobald der Nutzer selbst scrollt oder interagiert,
  // hat sein Wunsch Vorrang; beim Unmount wird alles aufgeraeumt.
  useEffect(() => {
    if (!sprung) return undefined;

    const karteEl = karteRef.current;
    const titelEl = titelRef.current;
    if (!karteEl || !titelEl) {
      setSprung(false);
      return undefined;
    }

    let aktiv = true;
    let frame = 0;
    let fertigTimer = 0;
    let fokusGesetzt = false;
    const imBild = () => {
      const r = karteEl.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight;
    };
    const ausrichten = () => {
      frame = 0;
      if (!aktiv || !karteEl.isConnected) return;
      if (!imBild()) {
        const r = karteEl.getBoundingClientRect();
        const abstand = parseFloat(getComputedStyle(karteEl).scrollMarginTop) || 0;
        const root = document.scrollingElement;
        const max = root ? Math.max(0, root.scrollHeight - window.innerHeight) : Infinity;
        const ziel = Math.max(0, Math.min(max, window.scrollY + r.top - abstand));
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
      if (!aktiv || frame) return;
      frame = requestAnimationFrame(ausrichten);
    };
    const beenden = () => {
      if (aktiv) setSprung(false);
    };

    const beobachter = typeof ResizeObserver === "function"
      ? new ResizeObserver(planen) : null;
    if (beobachter) {
      beobachter.observe(karteEl);
      const abschnitte = karteEl.closest(".profile-sections");
      if (abschnitte) beobachter.observe(abschnitte);
    }
    window.addEventListener("scroll", planen, { passive: true });
    // Nutzeraktionen beenden die kurze Nachfuehrung: kein Scroll-Hijacking.
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
      window.addEventListener(event, beenden, { passive: true });
    }
    planen();
    fertigTimer = window.setTimeout(beenden, 2000);

    return () => {
      aktiv = false;
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(fertigTimer);
      beobachter?.disconnect();
      window.removeEventListener("scroll", planen);
      for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
        window.removeEventListener(event, beenden);
      }
    };
  }, [sprung]);

  const installieren = async () => {
    if (laeuft) return;
    setLaeuft(true);
    setFehler("");
    markInstallHintDone();
    const ergebnis = await promptPwaInstall();
    // Abbruch durch den Kunden ist eine Entscheidung, kein Fehler: keine Meldung.
    if (ergebnis === "failed") setFehler(INSTALL_TEXT.promptFailed);
    setLaeuft(false);
  };

  const anleitungUmschalten = () => {
    markInstallHintDone();
    setAnleitungOffen((offen) => !offen);
  };

  const istApp = state === INSTALL_STATE.INSTALLED || state === INSTALL_STATE.JUST_INSTALLED;

  return (
    <section className="table-card profile-card pwa-card" ref={karteRef} id="pwa-install-card">
      <div className="table-card-header profile-card-head">
        <h2 className="table-card-title" ref={titelRef} tabIndex={-1}>{INSTALL_TEXT.cardTitle}</h2>
        <p className="profile-card-sub">{INSTALL_TEXT.cardSubtitle}</p>
      </div>

      <div className="profile-card-body">
      <div className="profile-form-body">
        <div className="pwa-card-row">
          <span className="pwa-card-mark" aria-hidden="true">
            <BrandLogo variant="signet" tone="standard" alt="" />
          </span>
          <p className={`pwa-card-text${istApp ? " pwa-card-text--status" : ""}`} aria-live="polite">
            <span>{installCardText(state)}</span>
          </p>
          {aktion && aktion.kind === "prompt" && (
            <button type="button" className="btn btn-outline" onClick={installieren} disabled={laeuft}>
              {aktion.label}
            </button>
          )}
          {aktion && aktion.kind === "guide" && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={anleitungUmschalten}
              aria-expanded={anleitungOffen}
              aria-controls="pwa-install-guide"
            >
              {aktion.label}
            </button>
          )}
        </div>

        {aktion && aktion.kind === "guide" && (
          <div id="pwa-install-guide" className="pwa-card-guide" hidden={!anleitungOffen}>
            <ol className="pwa-card-steps">
              {aktion.steps.map((schritt) => <li key={schritt}>{schritt}</li>)}
            </ol>
            <p className="pwa-card-note">{INSTALL_TEXT.guideNote}</p>
          </div>
        )}

        {fehler && <FormAlert tone="error" message={fehler} className="pwa-card-alert" />}
      </div>
      </div>
    </section>
  );
}
