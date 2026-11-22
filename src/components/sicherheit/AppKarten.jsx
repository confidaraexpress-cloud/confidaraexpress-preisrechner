import React, { useId, useState } from "react";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import { promptPwaInstall } from "../../utils/pwaInstallPrompt";
import { INSTALL_STATE, INSTALL_TEXT, installCardAction } from "../../utils/pwaInstallView.mjs";
import { aktuelleApp } from "../../utils/appHost.mjs";
import { APP_KARTEN_TEXT as T, appInstallText } from "../../utils/appKarten.mjs";
import { PushMitteilungenKarte } from "./PushMitteilungenKarte";

/* ── Admin- und Partner-App: Installation und Mitteilungen (Betreiberauftrag 2026-11-22, D5/D6; FE-2) ───────────────
   Eine Einbindung für die Sicherheitsseite des Adminbereichs und das Konto des Partnerportals. Nur auf dem App-Host
   (admin./partner.confidaraexpress.de): „Als App nutzen“ und „Mitteilungen auf diesem Gerät“. Auf der Hauptdomain
   erscheint nichts — kein Push (der Worker des Kundenbereichs kennt keine Mitteilungen) und bewusst auch kein Verweis
   auf die App: bestehende Einstiege werden erst nach der Prüfung der Live-Apps kontrolliert überführt (Auftrag §
   Rollout), und ein Verweis auf einen noch nicht erreichbaren Host wäre ein toter Link. */

function AppInstallKarte({ app }) {
  const uid = useId();
  const { state } = usePwaInstall();
  const aktion = installCardAction(state);
  const [anleitungOffen, setAnleitungOffen] = useState(false);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const istApp = state === INSTALL_STATE.INSTALLED || state === INSTALL_STATE.JUST_INSTALLED;

  const installieren = async () => {
    if (laeuft) return;
    setLaeuft(true); setFehler("");
    const ergebnis = await promptPwaInstall();
    if (ergebnis === "failed") setFehler(INSTALL_TEXT.promptFailed);
    setLaeuft(false);
  };

  return (
    <section className="ce-card ce-geraete ce-app-install" aria-labelledby={`${uid}-titel`} id="ce-app-install" data-zustand={state}>
      <div className="ce-geraete-kopf">
        <h2 className="ce-geraete-titel" id={`${uid}-titel`}>{T.installTitel}</h2>
        <p className={istApp ? "ce-push-lage ce-push-lage--an" : "ce-geraete-text"} aria-live="polite">{appInstallText(app, state)}</p>
      </div>
      {aktion && aktion.kind === "prompt" && (
        <div className="ce-geraete-knoepfe">
          <button type="button" className="btn btn-primary btn-sm" id="ce-app-installieren" onClick={installieren}
            disabled={laeuft} aria-busy={laeuft ? "true" : undefined}>
            {aktion.label}
          </button>
        </div>
      )}
      {aktion && aktion.kind === "guide" && (
        <>
          <div className="ce-geraete-knoepfe">
            <button type="button" className="btn btn-outline btn-sm" id="ce-app-anleitung" aria-expanded={anleitungOffen}
              aria-controls={`${uid}-schritte`} onClick={() => setAnleitungOffen((offen) => !offen)}>
              {aktion.label}
            </button>
          </div>
          {anleitungOffen && (
            <div id={`${uid}-schritte`}>
              <ol className="ce-app-schritte">
                {aktion.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
              <p className="ce-geraete-hinweis">{INSTALL_TEXT.guideNote}</p>
            </div>
          )}
        </>
      )}
      {fehler && <p className="ce-geraete-fehler" role="alert">{fehler}</p>}
    </section>
  );
}

/** `gesperrt`/`gesperrtText`: Mitteilungen ohne Serveraufruf ausblenden (Partnerkonto nicht aktiv). */
export function AppKarten({ app, gesperrt = false, gesperrtText }) {
  if (aktuelleApp() !== app) return null;
  return (
    <>
      <AppInstallKarte app={app} />
      <PushMitteilungenKarte app={app} gesperrt={gesperrt} gesperrtText={gesperrtText} />
    </>
  );
}

export default AppKarten;
