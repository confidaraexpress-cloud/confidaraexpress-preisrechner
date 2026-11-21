// useOfferRefresh — die Gültigkeit EINER Angebotsliste (Masteranalyse Angebotskarten 2026-11-20, §5.3).
//
// Genau ein Zeitgeber je Liste: er wartet bis zur frühesten noch offenen Frist und prüft dann neu. Kein Abfragen im
// Takt. Ein Zeitgeber im Hintergrund-Tab kann gedrosselt werden oder nach dem Ruhezustand verspätet feuern — deshalb
// wird zusätzlich beim Sichtbarwerden, beim Fokus und bei `pageshow` (Zurück aus dem Seitencache) sofort neu geprüft.
// Die Regeln stehen in utils/offerRefresh.mjs; hier wird nur die Uhr geführt.
import { useCallback, useEffect, useMemo, useState } from "react";
import { nextOfferRefreshAtMs, offerListClock, offerRefreshExpired, serverTodayISO } from "../utils/offerRefresh.mjs";

const LAENGSTE_WARTEZEIT_MS = 2147483647;  // Obergrenze von setTimeout

export function useOfferRefresh(offers, { quotedAt = null, receivedAtMs = null } = {}) {
  const [jetzt, setJetzt] = useState(() => Date.now());
  const uhr = useMemo(() => offerListClock({ quotedAt, receivedAtMs }), [quotedAt, receivedAtMs]);
  const serverJetzt = jetzt + uhr.offsetMs;
  const liste = Array.isArray(offers) ? offers : [];

  // Eine neue Liste beginnt mit der aktuellen Uhr — nie mit einem Stand von vorhin.
  useEffect(() => { setJetzt(Date.now()); }, [offers, quotedAt, receivedAtMs]);

  const naechste = useMemo(() => nextOfferRefreshAtMs(liste, serverJetzt, uhr.fallbackMs), [liste, serverJetzt, uhr]);

  useEffect(() => {
    if (naechste === null) return undefined;
    const warte = Math.min(Math.max(naechste - (Date.now() + uhr.offsetMs), 0) + 25, LAENGSTE_WARTEZEIT_MS);
    const id = setTimeout(() => setJetzt(Date.now()), warte);
    return () => clearTimeout(id);
  }, [naechste, uhr]);

  useEffect(() => {
    const pruefe = () => setJetzt(Date.now());
    const sichtbar = () => { if (document.visibilityState === "visible") pruefe(); };
    document.addEventListener("visibilitychange", sichtbar);
    window.addEventListener("focus", pruefe);
    window.addEventListener("pageshow", pruefe);
    return () => {
      document.removeEventListener("visibilitychange", sichtbar);
      window.removeEventListener("focus", pruefe);
      window.removeEventListener("pageshow", pruefe);
    };
  }, []);

  const isExpired = useCallback((o) => offerRefreshExpired(o, serverJetzt, uhr.fallbackMs), [serverJetzt, uhr]);
  const abgelaufen = useMemo(() => liste.filter(isExpired).length, [liste, isExpired]);
  // Restprüfung 2026-11-21: der heutige Geschäftstag nach der Serverzeit — „heute" auf der Karte folgt nie der
  // Geräteuhr allein (utils/offerRefresh.mjs, `offerDayIsToday`). Neu berechnet mit derselben Uhr wie die Fristen.
  const todayISO = serverTodayISO(serverJetzt);
  return useMemo(() => ({
    isExpired,
    anyExpired: abgelaufen > 0,
    allExpired: liste.length > 0 && abgelaufen === liste.length,
    todayISO,
  }), [isExpired, abgelaufen, liste.length, todayISO]);
}
