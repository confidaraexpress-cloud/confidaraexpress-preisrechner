import { useEffect, useRef, useState } from "react";
import { getShipmentDocuments } from "../api/client";
import {
  findProformaEntry, proformaViewState, proformaKeepPolling, nextProformaPollDelay,
} from "../utils/proformaDocumentView.mjs";

/* ── useProformaDocument({ step, booking }) ────────────────────────────────
   Wortgleich aus pages/BookingPage.jsx herausgelöst (Modularisierung Phase 2):
   der Metadaten-Poll des Erfolgsscreens für den eigenen Zollbeleg. Verhalten,
   Takt und Abbruchregeln unverändert — der Hook besitzt nur `proformaEntry`
   und den Effekt; Anzeige, Downloadzustand und Download-Handler bleiben in
   der Buchungsseite. */
export function useProformaDocument({ step, booking }) {
  // Proforma-Rechnung des Erfolgsscreens. `proformaEntry` ist die Zeile aus der
  // Dokument-Metadaten-Antwort — die EINZIGE Quelle dafür, ob es zu dieser Sendung
  // eine eigene Proforma gibt (siehe utils/proformaDocumentView.mjs). Startwert
  // `null` heißt „keine": solange nichts geladen ist, sieht der Bildschirm exakt
  // so aus wie vor diesem Paket. Fehler beim LADEN erzeugen bewusst keinen
  // eigenen Zustand — nur der Downloadversuch des Kunden hat einen.
  const [proformaEntry, setProformaEntry] = useState(null);
  const proformaTimerRef = useRef(null);

  // ── Proforma-Rechnung des Erfolgsscreens auflösen ───────────────────────────
  // Fragt die BESTEHENDE Dokument-Metadaten-API (GET /api/shipments/:id/documents,
  // reine Metadaten, keine Bytes). Sie ist die Wahrheit darüber, ob es zu dieser
  // Sendung eine eigene Proforma gibt — hier wird NICHTS aus Zielland, Zollpflicht,
  // Rechnungsmodus, Tarif oder Provider abgeleitet.
  //
  // Erster Abruf sofort (das PDF entsteht serverseitig unmittelbar nach dem Commit
  // der Buchung), danach ein kurzer fester Takt mit harter Obergrenze — kein
  // Endlospolling, kein Hintergrundworker. Gestoppt wird bei jedem Endzustand
  // (keine Proforma · fertig · fehlgeschlagen), beim Unmount und beim Schrittwechsel.
  //
  // KRITISCH: Eine erfolgreiche Buchung bleibt erfolgreich. Dieser Effekt kann den
  // Erfolgsscreen nicht umfärben und nichts entfernen — jeder Fehler wird
  // geschluckt. Ein nicht auswertbarer Abruf überschreibt einen bereits gefundenen
  // Beleg NICHT mit „nicht vorhanden": er wird innerhalb des Budgets erneut
  // versucht. Es wird niemals eine zweite Bestellung ausgelöst.
  useEffect(() => {
    if (step !== 3 || !booking || !booking.ceShipmentId) return undefined;
    let cancelled = false;
    let attempt = 0;
    const lauf = async () => {
      let antwort = null; // null = Abruf nicht auswertbar (Netz, Status, kaputter Body)
      try {
        const r = await getShipmentDocuments(booking.ceShipmentId);
        if (r.ok) {
          const d = await r.json().catch(() => null);
          antwort = { entry: findProformaEntry(d) };
        }
      } catch { /* still bleiben — der Erfolgsscreen bleibt unberührt */ }
      if (cancelled) return;
      let weiter = true;
      if (antwort) {
        setProformaEntry(antwort.entry);
        weiter = proformaKeepPolling(proformaViewState(antwort.entry));
      }
      if (!weiter) return;
      const delay = nextProformaPollDelay(attempt);
      if (delay == null) return; // Budget erschöpft — der ruhige Hinweis bleibt stehen
      attempt += 1;
      proformaTimerRef.current = setTimeout(lauf, delay);
    };
    lauf();
    return () => {
      cancelled = true;
      if (proformaTimerRef.current) { clearTimeout(proformaTimerRef.current); proformaTimerRef.current = null; }
    };
  }, [step, booking]);

  return { proformaEntry };
}
