import React from "react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { useAppUpdateAvailable } from "../../hooks/useAppUpdateAvailable";
import { APP_NOTICE_TEXT } from "../../utils/appVersionCheck.mjs";

/* ── Ruhige Statuszeile der App-Shell: offline / neue Version ────────────────
   Dasselbe Muster wie die übrigen Seitenhinweise der Shell (.alert-wrapper +
   .alert, vgl. Buchungstoast in DashboardPage) — kein Modal, keine Sperre.

   Offline hat Vorrang: ohne Verbindung wäre „Neu laden" ohnehin sinnlos.
   `suppressUpdate` blendet den Versionshinweis im laufenden Versandvorgang
   aus (Buchungsseite, „Neue Sendung"); der Offlinehinweis bleibt dort, weil er
   gerade dort gebraucht wird.

   Neu geladen wird AUSSCHLIESSLICH auf Klick. Seit dem Redesign (2026-10)
   ohne Symbol: der Satz trägt die Aussage, die Fläche den Ton. */
export function AppStatusNotice({ suppressUpdate = false }) {
  const online = useOnlineStatus();
  const neueVersion = useAppUpdateAvailable();

  if (!online) {
    return (
      <div className="alert-wrapper">
        <div className="alert pwa-notice pwa-notice--offline" role="status">
          <span className="pwa-notice-text">{APP_NOTICE_TEXT.offline}</span>
        </div>
      </div>
    );
  }

  if (neueVersion && !suppressUpdate) {
    return (
      <div className="alert-wrapper">
        <div className="alert alert-info pwa-notice" role="status">
          <span className="pwa-notice-text">{APP_NOTICE_TEXT.update}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.location.reload()}>
            {APP_NOTICE_TEXT.reload}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
