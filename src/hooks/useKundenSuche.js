import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import { getAddresses } from "../api/addressBookApi";
import {
  adressTreffer, suchbegriff, sucheRechnungen, sucheSendungen, suchTreffer, SUCHE_SEITEN_HOECHSTENS,
} from "../utils/kundenSuche.mjs";

// Laden für die Kopfsuche des Kundenbereichs (utils/kundenSuche.mjs). Sendungen und Rechnungen kommen seitenweise
// über die bestehenden Listen-Endpunkte (je höchstens SUCHE_SEITEN_HOECHSTENS Seiten zu 100), Adressen über die
// Suche des Adressbuchs. Geladen wird erst, wenn jemand sucht; der Stand gilt eine Minute und nur für dieses Konto —
// er liegt ausschließlich im Arbeitsspeicher des Tabs, nie im Storage.
const HALTBARKEIT_MS = 60000;
let ablage = null; // { nutzer, zeit, sendungen, rechnungen, vollstaendig }

async function alleSeiten(pfad, feld) {
  const liste = [];
  let cursor = null;
  for (let seite = 0; seite < SUCHE_SEITEN_HOECHSTENS; seite++) {
    const r = await apiFetch(`${pfad}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { auth: true });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (Array.isArray(d?.[feld])) liste.push(...d[feld]);
    cursor = typeof d?.nextCursor === "string" && d.nextCursor ? d.nextCursor : null;
    if (!cursor) return { liste, vollstaendig: true };
  }
  return { liste, vollstaendig: false };
}

export function useKundenSuche(nutzerId) {
  const [eingabe, setEingabe] = useState("");
  const [stand, setStand] = useState({ phase: "leer", treffer: [], vollstaendig: true });
  const lauf = useRef(0);

  const listen = useCallback(async () => {
    if (ablage && ablage.nutzer === nutzerId && Date.now() - ablage.zeit < HALTBARKEIT_MS) return ablage;
    const [s, r] = await Promise.all([alleSeiten("/kunde/shipments", "shipments"), alleSeiten("/kunde/invoices", "invoices")]);
    ablage = { nutzer: nutzerId, zeit: Date.now(), sendungen: s.liste, rechnungen: r.liste, vollstaendig: s.vollstaendig && r.vollstaendig };
    return ablage;
  }, [nutzerId]);

  useEffect(() => {
    const begriff = suchbegriff(eingabe);
    if (!begriff) {
      lauf.current++;
      setStand({ phase: "leer", treffer: [], vollstaendig: true });
      return undefined;
    }
    const nr = ++lauf.current;
    const abbruch = new AbortController();
    setStand((s) => (s.phase === "bereit" ? s : { phase: "laedt", treffer: [], vollstaendig: true }));
    const timer = setTimeout(async () => {
      try {
        const [daten, adressen] = await Promise.all([
          listen(),
          getAddresses({ q: eingabe, limit: 5 }, { signal: abbruch.signal }).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            return Array.isArray(d?.items) ? d.items : [];
          }),
        ]);
        if (nr !== lauf.current) return;
        setStand({
          phase: "bereit",
          vollstaendig: daten.vollstaendig,
          treffer: suchTreffer({
            sendungen: sucheSendungen(daten.sendungen, begriff),
            rechnungen: sucheRechnungen(daten.rechnungen, begriff),
            adressen: adressTreffer(adressen),
          }),
        });
      } catch {
        if (nr !== lauf.current) return;
        setStand({ phase: "fehler", treffer: [], vollstaendig: true });
      }
    }, 200);
    return () => { clearTimeout(timer); abbruch.abort(); };
  }, [eingabe, listen]);

  return { eingabe, setEingabe, ...stand };
}
