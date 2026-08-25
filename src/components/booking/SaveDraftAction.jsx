import React, { useState } from "react";
import { Icon } from "../ui/Icon";
import { saveDraft } from "../../api/client";
import { hasSavableShipmentId, mapDraftErrorToMessage } from "../../utils/draftsView.mjs";

// „Als Entwurf speichern" — sekundäre, vollständig eigenständige Aktion.
// Ruft POST /api/kunde/drafts/:id/save mit der internen numerischen Shipment-ID
// (`bookingData.ceShipmentId` — der ConfidaraExpress-Sendungshandle aus der
// /calculate-price-Antwort). NIEMALS `bookingData.shipmentId`: das ist die
// JUMiNGO-Referenz ("s_"+32 Hex), die dieser Endpunkt nicht auflöst.
// REIN additiv: berührt KEINEN Buchungs-/Preis-/Tarif-/Carrier-
// State, löst kein Reprice/Recalculate aus, verändert /book nicht. Kein
// AutoSave — nur auf expliziten Klick.
//
// `onSaved` wird ERST nach bestätigtem Serverfolg aufgerufen (nie beim
// Requeststart, nie bei 401/403/Fehler) — der Aufrufer (BookingPage) beendet
// darüber den aktiven temporären ShippingFlow: derselbe Entwurf ist jetzt
// sicher serverseitig gespeichert, ein späteres „Neue Sendung" darf ihn nicht
// erneut zeigen.
//
// `bookingOptions` ist der Entwurfszustand der „Zusätzlichen Optionen" (Schalter
// UND Werte). Er wird mitgespeichert, damit ein fortgesetzter Entwurf den Bereich
// exakt so wieder öffnet, wie der Kunde ihn verlassen hat — vorher gingen genau
// diese vier Angaben beim Speichern verloren. Serverseitig landen sie in einem
// EIGENEN Entwurfsfeld und beeinflussen KEINE Buchung; was gebucht wird,
// entscheidet allein der /book-Request.
//
// Seit dem Abschlusspaket ist ein Sendungsentwurf fortsetzbar (DraftsPage) — das
// Löschen des Flows nach dem Speichern bleibt trotzdem richtig: fortgesetzt wird
// über den gespeicherten Entwurf, nicht über den beendeten Vorgang.
export function SaveDraftAction({ shipmentId, bookingOptions, onNavigateDrafts, onSaved }) {
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState("");

  if (!hasSavableShipmentId(shipmentId)) return null;

  const onClick = async () => {
    if (status === "saving" || status === "saved") return; // idempotent: kein Doppel-Request
    setStatus("saving"); setErrorMsg("");
    try {
      const r = await saveDraft(shipmentId, bookingOptions);
      if (r.status === 401 || r.status === 403) { setStatus("idle"); return; } // zentraler Auth-Redirect übernimmt
      if (r.ok) { setStatus("saved"); onSaved?.(); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      setStatus("error");
      setErrorMsg(mapDraftErrorToMessage(d?.code));
    } catch {
      setStatus("error");
      setErrorMsg("Der Entwurf konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    }
  };

  return (
    <div className="bk-savedraft" role="note">
      {status === "saved" ? (
        <div className="bk-savedraft-done">
          <Icon n="check" s={15} c="var(--success)" />
          <span>Entwurf gespeichert.</span>
          {onNavigateDrafts && (
            <button type="button" className="bk-savedraft-link" onClick={onNavigateDrafts}>Zu Entwürfen</button>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClick}
            disabled={status === "saving"}
          >
            {status === "saving"
              ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Wird gespeichert …</>
              : <><Icon n="form" s={14} /> Als Entwurf speichern</>}
          </button>
          {status === "error" && (
            <span className="bk-savedraft-error" role="alert"><Icon n="info" s={13} c="currentColor" />{errorMsg}</span>
          )}
        </>
      )}
    </div>
  );
}
