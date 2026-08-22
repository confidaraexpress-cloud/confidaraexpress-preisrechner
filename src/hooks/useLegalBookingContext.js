import { useEffect, useRef, useState, useCallback } from "react";
import { getLegalBookingContext } from "../api/legalApi";
import {
  parseBookingContext, legalLoadingContext, LEGAL_ERROR,
} from "../utils/legalBookingView.mjs";

// useLegalBookingContext — lädt den Legal-Kontext des Checkouts (Go-Live Paket 4-B).
//
// ─── Nur Komponentenstate, bewusst keine Persistenz ─────────────────────────────────────────
// Der Kontext landet NICHT in `shippingFlowState`, nicht im `sessionStorage` und nicht im
// `localStorage`. Grund: das gültige Legal-Set kann sich jederzeit ändern, und ein
// wiederhergestellter Kontext würde eine Fassung anzeigen, die längst abgelöst ist — der Kunde
// bestätigte dann sichtbar A, während der Server B verlangt. Nach einem Reload wird deshalb neu
// geladen. Das kostet einen Request und ist der Preis dafür, nie eine veraltete Fassung zu
// behaupten.
//
// Dieselbe Linie gilt schon für die beiden Checkboxen: sie werden ausdrücklich nicht
// wiederhergestellt (siehe „Laufender Versandvorgang" — eine Einwilligung wird nicht
// unterstellt). Der Kontext folgt derselben Regel.
export function useLegalBookingContext() {
  const [context, setContext] = useState(legalLoadingContext);
  const laufNr = useRef(0);
  const lebt = useRef(true);

  const laden = useCallback(async () => {
    const meine = ++laufNr.current;
    setContext(legalLoadingContext());
    try {
      const r = await getLegalBookingContext();
      let body = null;
      try { body = await r.json(); } catch { /* kein JSON — parse entscheidet */ }
      // Ein überholtes Ergebnis darf ein neueres nie überschreiben (dasselbe Muster wie bei
      // Adressvalidierung und Adressauswahl): nach einem 409 läuft ein zweiter Abruf, während
      // der erste womöglich noch unterwegs ist.
      if (!lebt.current || meine !== laufNr.current) return null;
      const naechster = parseBookingContext(r.status, body);
      setContext(naechster);
      return naechster;
    } catch {
      if (!lebt.current || meine !== laufNr.current) return null;
      // Netzwerkfehler bei AKTIVER Schranke ist nicht unterscheidbar von „Tresor kaputt" —
      // beides ergibt `error` und damit einen blockierten Checkout. Niemals `disabled`: das
      // wäre Fail-Open und ließe ohne jeden Nachweis bestellen.
      const fehler = { state: LEGAL_ERROR, setKey: null, documents: [] };
      setContext(fehler);
      return fehler;
    }
  }, []);

  useEffect(() => {
    lebt.current = true;
    laden();
    return () => { lebt.current = false; };
  }, [laden]);

  return { legalContext: context, reloadLegalContext: laden };
}
