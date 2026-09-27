import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
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
   Der verlässliche, dauerhafte Ort für die Installation — rechte Spalte der
   Kontoeinstellungen, direkt nach „Sicherheit". Dasselbe Kartenmaterial wie
   jede Profilkarte (table-card + Kartenkopf), dieselbe Zeilenmechanik wie
   „Passwort ändern": Erklärung links, Aktion rechts, auf schmalen Breiten
   darunter.

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
  const { state } = usePwaInstall();
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
  // Genau einmal beim Mount — die Anfrage wird dabei verbraucht. Erst wird die
  // Anleitung aufgeklappt, positioniert wird im nächsten Effekt, wenn die Karte
  // ihre endgültige Höhe hat.
  useEffect(() => {
    if (!consumeInstallCardFocus()) return;
    if (aktion && aktion.kind === "guide") setAnleitungOffen(true);
    setSprung(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="table-card profile-card pwa-card" ref={karteRef} id="pwa-install-card">
      <div className="table-card-header profile-card-head">
        <div className="profile-card-icon pwa-card-mark" aria-hidden="true">
          <BrandLogo variant="signet" tone="standard" alt="" />
        </div>
        <div className="profile-card-heading">
          <span className="table-card-title" ref={titelRef} tabIndex={-1}>{INSTALL_TEXT.cardTitle}</span>
          <span className="profile-card-sub">{INSTALL_TEXT.cardSubtitle}</span>
        </div>
      </div>

      <div className="profile-form-body">
        <div className="pwa-card-row">
          <p className={`pwa-card-text${istApp ? " pwa-card-text--status" : ""}`} aria-live="polite">
            {istApp && <Icon n="check" s={16} />}
            <span>{installCardText(state)}</span>
          </p>
          {aktion && aktion.kind === "prompt" && (
            <button type="button" className="btn btn-outline" onClick={installieren} disabled={laeuft}>
              <Icon n="devices" s={16} /> {aktion.label}
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
              <Icon n="devices" s={16} /> {aktion.label}
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
  );
}
