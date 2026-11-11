import React, { useRef, useState } from "react";
import { setAdminUserStatus } from "../../api/adminApi";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  ADMIN_ZUGANG_TEXT as T, adminZugangStatusText, adminZugangAktion, adminZugangFehler,
} from "../../utils/adminZugang.mjs";

/* ── Adminzugang (Kontodetail eines Adminkontos, Canonical v2.130) ──────────────────────────────────────────
   Ersetzt für Adminkonten die Kundenfreischaltung: eine Aktion je Zustand (freischalten, sperren, entsperren),
   immer mit Bestätigung, ohne Kundenaufschlag, Kundennummer oder Mail. Der Server bleibt verbindlich: er lehnt die
   Änderung des eigenen Zugangs, das Sperren des letzten Admins und „wartend“ ab — die Karte zeigt dann seinen Grund.
   Löschen und Anonymisieren gibt es für Adminkonten nicht (Hinweis am Kartenende). */
export function AdminZugangKarte({ kontoId, status, eigenesKonto, onGeaendert }) {
  const aktion = adminZugangAktion(status, { eigenesKonto });
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const inFlight = useRef(false);

  const bestaetigen = async () => {
    if (inFlight.current || !aktion.ziel || aktion.gesperrt) return;
    inFlight.current = true; setLaeuft(true); setMeldung(null);
    try {
      const r = await setAdminUserStatus(kontoId, aktion.ziel);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        const text = adminZugangFehler(r.status, d);
        if (text) setMeldung({ art: "error", text });
        return;
      }
      const unveraendert = !!d && d.noOp === true;
      setMeldung({ art: "success", text: unveraendert ? T.unveraendert : aktion.ziel === "blocked" ? T.erfolgGesperrt : T.erfolgFreigeschaltet });
      onGeaendert?.();
    } catch {
      setMeldung({ art: "error", text: adminZugangFehler(500, null) });
    } finally {
      inFlight.current = false; setLaeuft(false); setOffen(false);
    }
  };

  const sperren = aktion.ziel === "blocked";
  return (
    <div className="adm-card" id="adm-admin-zugang">
      <div className="adm-card-head">{T.titel}</div>
      <div className="adm-card-body">
        <p className="adm-admin-zugang-status">{adminZugangStatusText(status)}</p>
        {meldung && (
          <div className={`alert ${meldung.art === "success" ? "alert-success" : "alert-error"}`} role={meldung.art === "success" ? "status" : "alert"}>
            {meldung.text}
          </div>
        )}
        {aktion.ziel && (
          <div className="adm-actionbar">
            <button
              type="button"
              id="adm-admin-zugang-aktion"
              className={`btn btn-sm ${sperren ? "btn-outline" : "btn-primary"}`}
              disabled={laeuft || aktion.gesperrt}
              aria-describedby={aktion.gesperrt ? "adm-admin-zugang-grund" : undefined}
              onClick={() => { setMeldung(null); setOffen(true); }}
            >
              {aktion.label}
            </button>
          </div>
        )}
        {aktion.gesperrt && aktion.grund && <p className="adm-admin-zugang-hinweis" id="adm-admin-zugang-grund">{aktion.grund}</p>}
        <p className="adm-admin-zugang-hinweis">{T.schutz}</p>
      </div>
      {offen && (
        <ConfirmDialog
          title={sperren ? T.sperrenDialogTitel : T.freischaltenDialogTitel}
          text={sperren ? T.sperrenDialogText : T.freischaltenDialogText}
          confirmLabel={aktion.label}
          cancelLabel={T.abbrechen}
          danger={sperren}
          busy={laeuft}
          onCancel={() => { if (!laeuft) setOffen(false); }}
          onConfirm={bestaetigen}
          confirmId="adm-admin-zugang-bestaetigen"
        />
      )}
    </div>
  );
}
