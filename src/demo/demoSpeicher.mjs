// Speicher der Demo-Welt: ein Storage-Ersatz im Arbeitsspeicher. Die Demo liest und schreibt nie den echten
// localStorage oder sessionStorage dieses Browsers — weder das Anmeldetoken noch einen laufenden Versandvorgang.

/** Ein Objekt mit der Storage-Schnittstelle, das nur im Arbeitsspeicher lebt. */
export function arbeitsspeicher() {
  const werte = new Map();
  return {
    get length() { return werte.size; },
    key(i) { return [...werte.keys()][i] ?? null; },
    getItem(k) { const s = String(k); return werte.has(s) ? werte.get(s) : null; },
    setItem(k, v) { werte.set(String(k), String(v)); },
    removeItem(k) { werte.delete(String(k)); },
    clear() { werte.clear(); },
  };
}

/**
 * Ersetzt window.localStorage und window.sessionStorage durch Arbeitsspeicher. Liefert true nur, wenn beide
 * Ersatzspeicher danach wirklich gelten — sonst darf die Demo nicht starten (sie schriebe sonst in die echte Sitzung).
 */
export function speicherAbschirmen(fenster) {
  const lokal = arbeitsspeicher();
  const sitzung = arbeitsspeicher();
  try {
    Object.defineProperty(fenster, "localStorage", { configurable: true, enumerable: true, get: () => lokal });
    Object.defineProperty(fenster, "sessionStorage", { configurable: true, enumerable: true, get: () => sitzung });
  } catch {
    return false;
  }
  return fenster.localStorage === lokal && fenster.sessionStorage === sitzung;
}
