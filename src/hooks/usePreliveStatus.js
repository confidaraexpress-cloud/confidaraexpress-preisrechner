import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminPreliveStatus } from "../api/adminApi";
import { PRELIVE_DISABLED_STATUS, normalizePreliveStatus } from "../utils/salesPartnerPrelive.mjs";

/* ── Stand des Pre-Live-Testmodus (nur Adminbereich) ─────────────────────────
   GET /admin/sales-partner-prelive/status — der einzige Endpunkt, der auch bei
   abgeschaltetem Modus antwortet. Ob Testfunktionen sichtbar sind (Eintrag in
   der Partnerverwaltung, Testlauf der Gutschriften, Rückdatierung bei
   Testkonten), hängt ausschließlich an `enabled: true` des Servers.

   Fail-closed: Laden, Fehler und jede andere Antwort ergeben „aus" — eine
   Testfunktion erscheint nie auf Verdacht. 401/403 behandelt apiFetch zentral.
   Jeder neue Ladevorgang bricht den vorherigen ab; eine verspätete Antwort
   überschreibt nie einen neueren Stand. */
export function usePreliveStatus() {
  const [state, setState] = useState({ loading: true, error: false, status: PRELIVE_DISABLED_STATUS });
  const laufRef = useRef(0);
  const abbruchRef = useRef(null);

  const load = useCallback(async () => {
    const lauf = ++laufRef.current;
    abbruchRef.current?.abort();
    const ac = new AbortController();
    abbruchRef.current = ac;
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await getAdminPreliveStatus({ signal: ac.signal });
      if (lauf !== laufRef.current) return;
      if (!r.ok) {
        setState({ loading: false, error: r.status !== 401 && r.status !== 403, status: PRELIVE_DISABLED_STATUS });
        return;
      }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (lauf !== laufRef.current) return;
      setState({ loading: false, error: false, status: normalizePreliveStatus(d) });
    } catch {
      if (lauf !== laufRef.current) return;
      setState({ loading: false, error: true, status: PRELIVE_DISABLED_STATUS });
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      laufRef.current += 1;
      abbruchRef.current?.abort();
    };
  }, [load]);

  return { ...state, reload: load };
}

export default usePreliveStatus;
