import { useCallback, useEffect, useRef, useState } from "react";
import { getLegalContent, getLegalCurrent } from "../api/legalApi";
import { readLegalContent, readLegalCurrent } from "../utils/legalPageState.mjs";

// Lädt für /agb bzw. /datenschutz die AKTIVE Fassung der Legal-Registry und — wenn sie
// eine trägt — ihre Webfassung. Zustände und Regeln: utils/legalPageState.mjs.
// Ein späterer Ladevorgang überholt einen früheren nie (Laufnummer), ein Fehler wird
// nie als „keine Fassung" ausgegeben.
export function useRegistryLegalPage(documentType) {
  const [state, setState] = useState({ loading: true, mode: null });
  const laufRef = useRef(0);

  const load = useCallback(async () => {
    const lauf = ++laufRef.current;
    const aktuell = () => lauf === laufRef.current;
    setState({ loading: true, mode: null });
    try {
      const r = await getLegalCurrent();
      let body = null;
      try { body = await r.json(); } catch { body = null; }
      if (!aktuell()) return;
      const s = readLegalCurrent(r.status, body, documentType);
      if (s.mode !== "content") { setState({ loading: false, ...s }); return; }
      const c = await getLegalContent(s.contentPath);
      let cb = null;
      try { cb = await c.json(); } catch { cb = null; }
      if (!aktuell()) return;
      const inhalt = readLegalContent(c.status, cb, s.version);
      setState(inhalt.ok
        ? { loading: false, ...s, markdown: inhalt.markdown, effectiveFrom: inhalt.effectiveFrom, documentPath: inhalt.documentPath || s.documentPath }
        : { loading: false, mode: "error" });
    } catch {
      if (aktuell()) setState({ loading: false, mode: "error" });
    }
  }, [documentType]);

  useEffect(() => {
    load();
    return () => { laufRef.current += 1; };
  }, [load]);

  return { ...state, retry: load };
}
