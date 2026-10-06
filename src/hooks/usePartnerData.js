import { useCallback, useEffect, useRef, useState } from "react";

/* ── Ladezustand eines Partnerportal-Endpunkts ───────────────────────────────
   Ein Muster für Übersicht, Kunden, Provisionen und Team:

     const { loading, error, data, reload } =
       usePartnerData((opts) => getPartnerTeam(opts), normalizeTeam, [], FEHLERTEXT);

   • `request` bekommt { signal } und liefert die rohe Response (api/partnerApi.js).
   • `normalize` macht aus dem Body das View-Modell (utils/salesPartnerView.mjs).
   • 401/403 behandelt apiFetch zentral (Abmeldung) — die Fläche bleibt dann
     im Ladezustand stehen, bis die Weiterleitung greift; kein eigener Text.
   • Ein neuer Ladevorgang bricht den vorherigen ab; eine verspätete Antwort
     überschreibt nie einen neueren Stand. Kein automatischer Retry. */
export function usePartnerData(request, normalize, deps, errorText) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const laufRef = useRef(0);
  const abbruchRef = useRef(null);

  const load = useCallback(async () => {
    const lauf = ++laufRef.current;
    abbruchRef.current?.abort();
    const ac = new AbortController();
    abbruchRef.current = ac;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await request({ signal: ac.signal });
      if (lauf !== laufRef.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setState({ loading: false, error: errorText, data: null });
        return;
      }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (lauf !== laufRef.current) return;
      if (!d || typeof d !== "object") {
        setState({ loading: false, error: errorText, data: null });
        return;
      }
      setState({ loading: false, error: "", data: normalize(d) });
    } catch {
      if (lauf !== laufRef.current) return;
      setState({ loading: false, error: errorText, data: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
    return () => {
      laufRef.current += 1;
      abbruchRef.current?.abort();
    };
  }, [load]);

  return { ...state, reload: load };
}

export default usePartnerData;
