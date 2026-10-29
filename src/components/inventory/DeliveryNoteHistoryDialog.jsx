import React, { useCallback, useEffect, useRef, useState } from "react";
import { InventoryDialog } from "./InventoryShared";
import { Werte } from "../ui/Werte";
import { getDeliveryNoteHistory, withdrawDeliveryNoteVersion, deliveryNotePaths } from "../../api/deliveryNotesApi";
import { historyEntries, deliveryNoteErrorText, dateTimeDe, effectiveView, recipientText } from "../../utils/deliveryNoteView.mjs";

/* ── Verlauf eines Lieferscheins ─────────────────────────────────────────────
   Alle Fassungen einer Sendung, neueste zuerst: eigene Lieferscheine (hochgeladen oder
   aus der Vorlage) und der ConfidaraExpress-Lieferschein. Welche gilt, sagt der Server;
   die Marke „Gilt“ steht genau an dieser Fassung. Nichts wird überschrieben: Zurückziehen
   setzt nur einen Zeitpunkt, die Fassung bleibt ladbar, und es gilt wieder die vorige.

   „Anzeigen“ schließt diesen Dialog und öffnet die PDF-Ansicht der Seite — zwei
   übereinanderliegende Dialoge mit je eigener Fokusfalle würden sich die Tastatur streiten.

   Fokus: Der Knopf „Zurückziehen“ verschwindet beim Bestätigen, die Rückfrage öffnet mit dem
   Fokus auf „Abbrechen“; Abbrechen bringt ihn zurück, nach dem Zurückziehen steht er auf der
   Meldung. Fiele er auf die Seite, hörte der Dialog weder Escape noch die Tab-Falle (useDialog). */
export function DeliveryNoteHistoryDialog({ open, shipmentId, onClose, onChanged, onPreview, onDownload }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const listeRef = useRef(null);
  const meldungRef = useRef(null);
  const nachDemZeichnen = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

  const load = useCallback(async () => {
    if (!shipmentId) return;
    setLoading(true); setError("");
    try {
      const res = await getDeliveryNoteHistory(shipmentId);
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(deliveryNoteErrorText(body, "Der Verlauf konnte nicht geladen werden.")); return; }
      setData(body);
    } catch {
      setError("Der Verlauf konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.");
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    if (!open) return;
    setData(null); setConfirm(null); setNotice("");
    load();
  }, [open, load]);

  const zurueckziehen = async (entry) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await withdrawDeliveryNoteVersion(shipmentId, entry.version);
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(deliveryNoteErrorText(body, "Die Fassung konnte nicht zurückgezogen werden.")); return; }
      const jetzt = effectiveView(body && body.effective);
      setNotice(`Fassung ${entry.version} zurückgezogen. Es gilt jetzt: ${jetzt.label}${jetzt.number ? ` ${jetzt.number}` : ""}.`);
      setConfirm(null);
      await load();
      nachDemZeichnen(() => meldungRef.current && meldungRef.current.focus());
      onChanged && onChanged();
    } catch {
      setError("Die Fassung konnte nicht zurückgezogen werden. Bitte prüfen Sie Ihre Verbindung.");
    } finally {
      setBusy(false);
    }
  };

  const pfad = (e) => (e.kind === "confidara" ? deliveryNotePaths.confidara(shipmentId) : deliveryNotePaths.version(shipmentId, e.version));
  const titel = (e) => `${e.title}${e.number ? ` ${e.number}` : ""}`;
  const eintraege = data ? historyEntries(data) : [];
  const s = data && data.shipment;
  const empf = s ? recipientText(s.recipient) : null;

  return (
    <InventoryDialog open={open} onClose={onClose} title="Verlauf des Lieferscheins" size="lg" busy={busy}>
      <div className="dn-verlauf">
        {s && (
          <dl className="dn-ziel">
            <div><dt>Sendung</dt><dd><Werte>{s.orderConfirmationNumber || "—"}</Werte></dd></div>
            {s.orderNumber && <div><dt>Auftrag</dt><dd><Werte>{s.orderNumber}</Werte></dd></div>}
            <div><dt>Empfänger</dt><dd>{empf.name}{empf.place ? `, ${empf.place}` : ""}</dd></div>
          </dl>
        )}
        {loading && !data && <p className="dn-laden" role="status">Verlauf wird geladen …</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <p className="inv-inline-success dn-meldung" role="status" tabIndex={-1} ref={meldungRef}>{notice}</p>}
        {data && eintraege.length === 0 && (
          <p className="dn-leer">Für diese Sendung gibt es noch keinen Lieferschein.</p>
        )}
        {eintraege.length > 0 && (
          <ol className="dn-verlauf-liste" ref={listeRef}>
            {eintraege.map((e) => (
              <li key={e.key} className={`dn-verlauf-eintrag${e.status === "effective" ? " dn-verlauf-eintrag--gilt" : ""}`}>
                <div className="dn-verlauf-kopf">
                  <span className="dn-verlauf-titel">{e.title}</span>
                  <span className={`badge ${e.status === "effective" ? "badge--success" : "badge--neutral"}`}>{e.statusText}</span>
                </div>
                <div className="dn-verlauf-meta">
                  {e.number && <span><Werte>{e.number}</Werte></span>}
                  <span>{e.origin}</span>
                  <span>{e.how}, {dateTimeDe(e.date)}</span>
                </div>
                {confirm === e.key ? (
                  <div className="dn-verlauf-bestaetigen" role="group" aria-label={`Fassung ${e.version} zurückziehen`}>
                    <p>Diese Fassung gilt danach nicht mehr. Sie bleibt im Verlauf und kann weiter heruntergeladen werden.</p>
                    <div className="dn-verlauf-aktionen">
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => zurueckziehen(e)} disabled={busy}>
                        {busy ? "Wird zurückgezogen …" : "Ja, zurückziehen"}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" autoFocus disabled={busy}
                              onClick={() => {
                                const key = e.key;
                                setConfirm(null);
                                nachDemZeichnen(() => {
                                  const knopf = listeRef.current && listeRef.current.querySelector(`[data-dn-zurueck="${key}"]`);
                                  if (knopf) knopf.focus();
                                });
                              }}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="dn-verlauf-aktionen">
                    {e.canDownload && (
                      <>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => onPreview && onPreview(pfad(e), titel(e))}>Anzeigen</button>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => onDownload && onDownload(pfad(e))}>Herunterladen</button>
                      </>
                    )}
                    {e.canWithdraw && (
                      <button type="button" className="btn btn-sm btn-ghost" data-dn-zurueck={e.key} onClick={() => setConfirm(e.key)} disabled={busy}>
                        Zurückziehen
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </InventoryDialog>
  );
}
