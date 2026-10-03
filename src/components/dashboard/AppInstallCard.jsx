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

  // Sofort statt der globalen weichen Scrollbewegung: die Karte steht am
  // Seitenende, eine Animation über die ganze Profilseite dauerte Sekunden.
  // Ausgerichtet wird am Kartenanfang; den Abstand zur klebenden mobilen
  // Topbar hält `scroll-margin-top` (pwa.css). Ältere Browser kennen
  // `behavior: "instant"` nicht — dann der Standard.
  useEffect(() => {
    if (!sprung) return;
    setSprung(false);
    const karteEl = karteRef.current;
    if (karteEl && typeof karteEl.scrollIntoView === "function") {
      try {
        karteEl.scrollIntoView({ block: "start", behavior: "instant" });
      } catch {
        karteEl.scrollIntoView();
      }
    }
    if (titelRef.current) titelRef.current.focus({ preventScroll: true });
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
