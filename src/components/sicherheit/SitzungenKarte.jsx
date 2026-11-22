import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { sitzungenLaden, sitzungBeenden, ueberallAbmelden } from "../../api/sicherheitApi";
import { SICHERHEIT_TEXT as T, sitzungsListe, sicherheitsFehlertext } from "../../utils/adminSicherheit.mjs";
import { Icon } from "../ui/Icon";

/* ── Angemeldete Geräte und „Auf allen Geräten abmelden“ (Admin und Partner, Betreiberauftrag 2026-11-22, D7) ───────
   Zeigt die eingetragenen Sitzungen des eigenen Kontos (GET /auth/sessions) mit genau den erfassten Angaben. Einzelne
   Sitzungen lassen sich beenden; „Auf allen Geräten abmelden“ beendet jede Sitzung des Kontos, auch diese — danach geht
   es auf die Anmeldeseite des Bereichs. Bestätigt wird in der Karte selbst (kein Dialog): eine Rückfrage, zwei Knöpfe.

   Doppelklickschutz: während eines Aufrufs sind die Knöpfe gesperrt (inFlight-Ref plus disabled). */

async function jsonOderNull(r) {
  try { return await r.json(); } catch { return null; }
}

export function SitzungenKarte({ anmeldePfad, klasse = "", verlorenText = T.verlorenText }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const uid = useId();
  const [zeilen, setZeilen] = useState(null);   // null = lädt
  const [ladefehler, setLadefehler] = useState("");
  const [fehler, setFehler] = useState("");
  const [frage, setFrage] = useState(false);     // Rückfrage „überall abmelden“ offen
  const [laeuft, setLaeuft] = useState(null);    // id der laufenden Aktion oder "alle"
  const inFlight = useRef(false);

  const laden = useCallback(async (signal) => {
    setLadefehler("");
    try {
      const r = await sitzungenLaden({ signal });
      const d = await jsonOderNull(r);
      if (!r.ok || !d) { setLadefehler(T.geladenFehler); setZeilen([]); return; }
      setZeilen(sitzungsListe(d));
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setLadefehler(T.geladenFehler);
      setZeilen([]);
    }
  }, []);

  useEffect(() => {
    const c = new AbortController();
    laden(c.signal);
    return () => c.abort();
  }, [laden]);

  const abmeldenUndWeiter = () => {
    logout();
    navigate(anmeldePfad, { replace: true });
  };

  const beenden = async (zeile) => {
    if (inFlight.current) return;
    inFlight.current = true; setLaeuft(zeile.id); setFehler("");
    try {
      const r = await sitzungBeenden(zeile.id);
      const d = await jsonOderNull(r);
      if (r.ok && d && d.current === true) { abmeldenUndWeiter(); return; }
      if (!r.ok) setFehler(sicherheitsFehlertext(r.status, d));
      await laden();
    } catch {
      setFehler(sicherheitsFehlertext(0, null));
    } finally {
      inFlight.current = false; setLaeuft(null);
    }
  };

  const ueberall = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setLaeuft("alle"); setFehler("");
    try {
      const r = await ueberallAbmelden();
      const d = await jsonOderNull(r);
      if (r.ok) { abmeldenUndWeiter(); return; }
      setFehler(sicherheitsFehlertext(r.status, d));
    } catch {
      setFehler(sicherheitsFehlertext(0, null));
    } finally {
      inFlight.current = false; setLaeuft(null);
    }
  };

  const titelId = `${uid}-geraete`;
  return (
    <section className={`ce-card ce-geraete ${klasse}`.trim()} aria-labelledby={titelId} id="ce-geraete">
      <div className="ce-geraete-kopf">
        <h2 className="ce-geraete-titel" id={titelId}>{T.geraeteTitel}</h2>
        <p className="ce-geraete-text">{T.geraeteText}</p>
      </div>
      {fehler && <p className="ce-geraete-fehler" role="alert">{fehler}</p>}
      {zeilen === null ? (
        <p className="ce-geraete-text" role="status">Geräte werden geladen …</p>
      ) : ladefehler ? (
        <div className="ce-geraete-fehlerblock">
          <p className="ce-geraete-fehler" role="alert">{ladefehler}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => laden()}>{T.erneut}</button>
        </div>
      ) : zeilen.length === 0 ? (
        <p className="ce-geraete-text">{T.geraeteLeer}</p>
      ) : (
        <ul className="ce-geraete-liste">
          {zeilen.map((z) => (
            <li key={z.id} className={`ce-geraet${z.aktuell ? " ce-geraet--aktuell" : ""}`} data-sitzung={z.id}>
              <span className="ce-geraet-symbol" aria-hidden="true"><Icon n="devices" s={20} /></span>
              <div className="ce-geraet-text">
                <span className="ce-geraet-name">
                  {z.geraet}
                  {z.aktuell && <span className="ce-geraet-marke">{T.diesesGeraet}</span>}
                </span>
                {(z.zusatz || z.herkunft) && <span className="ce-geraet-meta">{[z.zusatz, z.herkunft].filter(Boolean).join(" · ")}</span>}
                <span className="ce-geraet-meta">{z.seit}, {z.bis}</span>
              </div>
              <button type="button" className="btn btn-outline btn-sm ce-geraet-aktion" onClick={() => beenden(z)}
                disabled={laeuft !== null} aria-busy={laeuft === z.id ? "true" : undefined}
                aria-label={`${T.abmelden}: ${z.geraet}${z.aktuell ? ` (${T.diesesGeraet})` : ""}`}>
                {T.abmelden}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ce-geraete-fuss">
        {frage ? (
          <div className="ce-geraete-frage" role="group" aria-labelledby={`${uid}-frage`}>
            <p className="ce-geraete-text" id={`${uid}-frage`}>{T.ueberallFrage}</p>
            <div className="ce-geraete-knoepfe">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setFrage(false)} disabled={laeuft !== null}>
                {T.abbrechen}
              </button>
              <button type="button" className="btn btn-sm ce-geraete-gefahr" id="ce-ueberall-bestaetigen" onClick={ueberall}
                disabled={laeuft !== null} aria-busy={laeuft === "alle" ? "true" : undefined}>
                {T.ueberallKnopf}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-outline btn-sm ce-geraete-ueberall" id="ce-ueberall" onClick={() => setFrage(true)}
            disabled={laeuft !== null}>
            {T.ueberallKnopf}
          </button>
        )}
        <p className="ce-geraete-hinweis"><strong>{T.verlorenTitel}</strong> {verlorenText}</p>
      </div>
    </section>
  );
}

export default SitzungenKarte;
