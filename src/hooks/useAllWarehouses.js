import { useCallback, useEffect, useRef, useState } from "react";
import { getWarehouses } from "../api/inventoryApi";
import { loadAllWarehouses } from "../utils/warehouseView.mjs";
import { inventoryErrorText } from "../utils/inventoryErrors.mjs";

// useAllWarehouses — ALLE Lager des Kontos für Auswahlfelder (Buchen, Filtern).
//
// Paritätsaudit 2026-10-15 (BI3, BI7, Umfang C): bis hierher lud jede Seite selbst eine erste
// Seite (`limit: 5` bzw. `limit: 50`) — ab dem 51. Lager fehlten Lager in der Auswahl, und ein
// Ladefehler sah aus wie „keine Lager". Der Hook geht über den Cursor des Servers durch alle
// Seiten (warehouseView.loadAllWarehouses) und unterscheidet Laden, Fehler und Ergebnis.
// Nach dem Verlassen der Seite gesetzte Ergebnisse werden verworfen.
export function useAllWarehouses() {
  const [state, setState] = useState({ loading: true, error: "", warehouses: [], truncated: false });
  const lauf = useRef(0);

  const reload = useCallback(async () => {
    const meins = ++lauf.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await loadAllWarehouses((params) => getWarehouses(params));
      if (meins !== lauf.current) return;
      if (!r.ok) {
        setState({ loading: false, warehouses: [], truncated: false,
          error: inventoryErrorText(r.body, "Die Lager konnten nicht geladen werden.") });
        return;
      }
      setState({ loading: false, error: "", warehouses: r.warehouses, truncated: r.truncated });
    } catch {
      if (meins === lauf.current) {
        setState({ loading: false, warehouses: [], truncated: false, error: "Die Lager konnten nicht geladen werden." });
      }
    }
  }, []);

  useEffect(() => {
    reload();
    return () => { lauf.current++; };
  }, [reload]);

  return { ...state, reload };
}
