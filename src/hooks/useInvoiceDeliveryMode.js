import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import {
  INVOICE_DELIVERY_MODE, resolveInvoiceDeliveryMode, isTerminalDeliveryMode, findInvoiceByNumber,
} from "../utils/bookingSuccessView.mjs";
import { nextRefreshDelay } from "../utils/invoiceView.mjs";

/* ── useInvoiceDeliveryMode({ step, booking }) ─────────────────────────────
   Wortgleich aus pages/BookingPage.jsx herausgelöst (Modularisierung Phase 2):
   der Rechnungs-Zustellmodus-Poll des Erfolgsscreens. Verhalten, Takt und
   Abbruchregeln unverändert — der Hook besitzt nur den Zustand und den Effekt;
   die Anzeige (invoiceDeliveryHint) bleibt in der Buchungsseite. */
export function useInvoiceDeliveryMode({ step, booking }) {
  // Rechnungs-Zustellungsmodus für den Erfolgsscreen — aus der Serverwahrheit der SOEBEN erzeugten
  // Rechnung abgeleitet (is_test_document + document_status), NICHT clientseitig geraten. Startet
  // neutral (PENDING) und wird kurz nachgeladen, bis das Dokument einen Endzustand erreicht.
  const [invoiceDeliveryMode, setInvoiceDeliveryMode] = useState(INVOICE_DELIVERY_MODE.PENDING);
  const invoiceModeTimerRef = useRef(null);

  // Auf dem Erfolgsscreen den Rechnungs-Zustellungsmodus auflösen: kurzes, gedeckeltes Nachladen der
  // BESTEHENDEN Kundenrechnungsliste (GET /kunde/invoices — keine neue/serverseitige Änderung),
  // Rechnung per Nummer finden und den Modus aus is_test_document/document_status ableiten. Stoppt,
  // sobald ein Endzustand (produktiv/Vorschau/fehlgeschlagen) erreicht ist oder die Backoff-Obergrenze
  // (≈ 2 Min) greift. Kein Einfluss auf Buchung/Rechnung/PDF/E-Mail. Timer wird bei Unmount/
  // Schrittwechsel vollständig bereinigt.
  useEffect(() => {
    if (step !== 3 || !booking || !booking.invoiceNumber) return undefined;
    let cancelled = false;
    let attempt = 0;
    const poll = async () => {
      try {
        // limit=20 (Phase 1): die soeben gebuchte Rechnung ist die NEUSTE und steht damit
        // sicher in der ersten Seite (Sortierung created_at DESC) — der Poll braucht nie
        // die Vollliste. Ein altes Backend ignoriert den Parameter unschädlich.
        const r = await apiFetch(`/kunde/invoices?limit=20`, { auth: true });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          const mode = resolveInvoiceDeliveryMode(findInvoiceByNumber(d.invoices, booking.invoiceNumber));
          if (cancelled) return;
          setInvoiceDeliveryMode(mode);
          if (isTerminalDeliveryMode(mode)) return; // fertig aufgelöst → nicht weiter nachladen
        }
      } catch { /* still bleiben — neutraler PENDING-Hinweis ist nie irreführend */ }
      if (cancelled) return;
      const delay = nextRefreshDelay(attempt);
      if (delay == null) return; // Obergrenze erreicht
      attempt += 1;
      invoiceModeTimerRef.current = setTimeout(poll, delay);
    };
    // Erster Versuch nach dem ersten Backoff-Intervall (das PDF wird nach dem Commit asynchron erzeugt).
    const first = nextRefreshDelay(attempt);
    attempt += 1;
    invoiceModeTimerRef.current = setTimeout(poll, first);
    return () => {
      cancelled = true;
      if (invoiceModeTimerRef.current) { clearTimeout(invoiceModeTimerRef.current); invoiceModeTimerRef.current = null; }
    };
  }, [step, booking]);

  return { invoiceDeliveryMode };
}
