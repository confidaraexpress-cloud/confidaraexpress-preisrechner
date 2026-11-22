import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import {
  pushAusschalten, pushEinschalten, pushGeraete, pushGeraetEntfernen, pushKonfiguration, pushStand,
} from "../../api/pushApi";
import { serviceWorkerFuer } from "../../utils/appHost.mjs";
import { detectInstallPlatform, INSTALL_PLATFORM, isStandaloneDisplay } from "../../utils/pwaInstallView.mjs";
import {
  PUSH_TEXT as T, PUSH_ZUSTAND as Z, aboFuerServer, geraeteListe, gleicherSchluessel, kategorienNach, pushFehlertext,
  pushUnterstuetzung, pushZustand, schluesselBytes,
} from "../../utils/pushMitteilungen.mjs";

/* ── Mitteilungen auf diesem Gerät (Admin- und Partner-App, Betreiberauftrag 2026-11-22, D6) ────────────────────────
   Nur auf dem App-Host (AppKarten.jsx). Freiwillig und standardmäßig aus; die Erlaubnis des Browsers wird erst nach
   einem Tippen auf „Mitteilungen einschalten“ erfragt. Ist Push serverseitig nicht freigeschaltet (`available:false`),
   steht hier nur „derzeit nicht verfügbar“. Ausschalten entfernt den Servereintrag UND das Abonnement im Browser.
   Die Entscheidungen fallen in utils/pushMitteilungen.mjs; hier nur Browser- und Serveraufrufe.

   `gesperrt` (Partnerkonto nicht aktiv): keine Aufrufe von Konfiguration, Stand und Einschalten — der Server antwortet
   dort mit 403, und apiFetch wertet 403 als Sitzungsende. Die Geräteliste (nur Rollenprüfung) bleibt. */

async function jsonOderNull(r) {
  try { return await r.json(); } catch { return null; }
}

function browserLage() {
  if (typeof window === "undefined") return { unterstuetzung: "nicht_unterstuetzt", erlaubnis: "default" };
  const nav = window.navigator || {};
  const standalone = isStandaloneDisplay({
    standaloneMedia: typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: nav.standalone === true,
  });
  const ios = detectInstallPlatform({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints })
    === INSTALL_PLATFORM.IOS;
  return {
    unterstuetzung: pushUnterstuetzung({
      sichererKontext: window.isSecureContext === true,
      serviceWorker: "serviceWorker" in nav,
      pushManager: "PushManager" in window,
      notification: "Notification" in window,
      ios,
      standalone,
    }),
    erlaubnis: "Notification" in window ? window.Notification.permission : "default",
  };
}

/* Die Registrierung des App-Workers (public/app-sw.js), die serviceWorkerRegistration.js beim Laden angelegt hat. Die
   Karte registriert selbst nichts. `warten`: einen gerade installierten Worker höchstens 10 s bis „aktiv“ abwarten
   (PushManager.subscribe verlangt einen aktiven Worker). */
async function registrierung(app, { warten = false } = {}) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const worker = reg && (reg.active || reg.waiting || reg.installing);
  if (!worker || new URL(worker.scriptURL).pathname !== serviceWorkerFuer(app)) return null;
  if (reg.active || !warten) return reg.active ? reg : null;
  const bereit = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => { setTimeout(() => resolve(null), 10000); }),
  ]);
  return bereit && bereit.active ? bereit : null;
}

async function browserAbo(app) {
  const reg = await registrierung(app);
  return reg ? reg.pushManager.getSubscription() : null;
}

export function PushMitteilungenKarte({ app, gesperrt = false, gesperrtText = T.partnerInaktiv }) {
  const uid = useId();
  const [lage, setLage] = useState(browserLage);
  const [konfig, setKonfig] = useState(null);
  const [stand, setStand] = useState(null);
  const [ladefehler, setLadefehler] = useState(false);
  const [geraete, setGeraete] = useState(null);
  const [laeuft, setLaeuft] = useState(null);   // "an" | "aus" | "arten" | Geräte-id
  const [fehler, setFehler] = useState("");
  const [meldung, setMeldung] = useState("");
  const [entwurf, setEntwurf] = useState(null);  // gewählte Arten, solange der Server noch antwortet
  const inFlight = useRef(false);

  const ladeGeraete = useCallback(async (signal) => {
    try {
      const r = await pushGeraete({ signal });
      const d = await jsonOderNull(r);
      setGeraete(r.ok && d ? d : { devices: [] });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setGeraete({ devices: [] });
    }
  }, []);

  const ladeStand = useCallback(async (signal) => {
    const sub = await browserAbo(app);
    if (!sub) return { subscribed: false };
    const r = await pushStand(sub.endpoint, { signal });
    const d = await jsonOderNull(r);
    if (!r.ok || !d || typeof d.subscribed !== "boolean") throw new Error("stand");
    return d;
  }, [app]);

  const laden = useCallback(async (signal) => {
    setLadefehler(false);
    const neueLage = browserLage();
    setLage(neueLage);
    if (gesperrt) { await ladeGeraete(signal); return; }
    try {
      const rk = await pushKonfiguration({ signal });
      const k = await jsonOderNull(rk);
      if (!rk.ok || !k || !Array.isArray(k.categories)) throw new Error("konfiguration");
      setKonfig(k);
      const geraeteLaden = ladeGeraete(signal);
      if (k.available === true && neueLage.unterstuetzung === "ok" && neueLage.erlaubnis !== "denied") setStand(await ladeStand(signal));
      else setStand({ subscribed: false });
      await geraeteLaden;
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setLadefehler(true);
    }
  }, [gesperrt, ladeGeraete, ladeStand]);

  useEffect(() => {
    const c = new AbortController();
    laden(c.signal);
    return () => c.abort();
  }, [laden]);

  const zustand = pushZustand({
    gesperrt, unterstuetzung: lage.unterstuetzung, konfiguration: konfig, erlaubnis: lage.erlaubnis, stand, ladefehler,
  });

  const aktion = async (art, ablauf) => {
    if (inFlight.current) return;
    inFlight.current = true; setLaeuft(art); setFehler(""); setMeldung("");
    try {
      await ablauf();
    } catch {
      setFehler(art === "an" ? T.einrichtungFehler : pushFehlertext(0, null));
    } finally {
      inFlight.current = false; setLaeuft(null);
    }
  };

  // Einschalten: zuerst — noch im Tippen — die Erlaubnis (Safari verlangt die Nutzergeste), dann das Abonnement im
  // Browser, dann der Servereintrag. Lehnt der Server ab, nimmt die Karte ein dabei NEU entstandenes Abonnement zurück.
  const einschalten = () => {
    if (!konfig || inFlight.current) return;
    const erlaubnisFrage = window.Notification.permission === "granted"
      ? Promise.resolve("granted")
      : window.Notification.requestPermission();
    aktion("an", async () => {
      const erlaubnis = await erlaubnisFrage;
      setLage((l) => ({ ...l, erlaubnis }));
      if (erlaubnis !== "granted") { setFehler(erlaubnis === "denied" ? T.blockiert : T.abgelehnt); return; }
      const reg = await registrierung(app, { warten: true });
      if (!reg) { setFehler(T.einrichtungFehler); return; }
      const schluessel = schluesselBytes(konfig.publicKey);
      let neu = null;
      try {
        let sub = await reg.pushManager.getSubscription();
        if (sub && !gleicherSchluessel(sub.options && sub.options.applicationServerKey, schluessel)) {
          await sub.unsubscribe();
          sub = null;
        }
        if (!sub) {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluessel });
          neu = sub;
        }
        const abo = aboFuerServer(sub.toJSON());
        if (!abo) { setFehler(T.einrichtungFehler); return; }
        const bisher = stand && stand.subscription && Array.isArray(stand.subscription.categories) && stand.subscription.categories.length
          ? stand.subscription.categories : undefined;
        const r = await pushEinschalten(abo, bisher);
        const d = await jsonOderNull(r);
        if (!r.ok || !d || d.subscribed !== true) { setFehler(pushFehlertext(r.status, d)); return; }
        neu = null;
        setStand(d);
        setMeldung(T.angeschaltet);
        await ladeGeraete();
      } finally {
        if (neu) { try { await neu.unsubscribe(); } catch { /* bewusst still: der Server kennt es nicht */ } }
      }
    });
  };

  const ausschalten = () => aktion("aus", async () => {
    const sub = await browserAbo(app);
    if (sub) {
      const r = await pushAusschalten(sub.endpoint);
      if (!r.ok) { setFehler(pushFehlertext(r.status, await jsonOderNull(r))); return; }
      try { await sub.unsubscribe(); } catch { /* der Server sendet ohnehin nicht mehr */ }
    }
    setStand({ subscribed: false });
    setMeldung(T.ausgeschaltet);
    await ladeGeraete();
  });

  // Die gewählte Art steht sofort im Kästchen (Entwurf); lehnt der Server ab, gilt wieder sein Stand.
  const artUmschalten = (id, an) => {
    if (!stand || !stand.subscription || !konfig || inFlight.current) return;
    const vorher = stand.subscription.categories;
    const neu = kategorienNach(vorher, id, an, konfig.categories);
    if (neu === vorher) return;
    setEntwurf(neu);
    aktion("arten", async () => {
      try {
        const sub = await browserAbo(app);
        const abo = sub ? aboFuerServer(sub.toJSON()) : null;
        if (!abo) { setFehler(T.einrichtungFehler); await laden(); return; }
        const r = await pushEinschalten(abo, neu);
        const d = await jsonOderNull(r);
        if (!r.ok || !d || d.subscribed !== true) { setFehler(pushFehlertext(r.status, d)); return; }
        setStand(d);
        setMeldung(T.gespeichert);
        await ladeGeraete();
      } finally {
        setEntwurf(null);
      }
    });
  };

  const geraetEntfernen = (zeile) => aktion(zeile.id, async () => {
    const r = await pushGeraetEntfernen(zeile.id);
    if (!r.ok && r.status !== 404) { setFehler(pushFehlertext(r.status, await jsonOderNull(r))); return; }
    if (zeile.aktuell) {
      const sub = await browserAbo(app);
      if (sub) { try { await sub.unsubscribe(); } catch { /* der Server sendet ohnehin nicht mehr */ } }
      setStand({ subscribed: false });
    }
    if (r.status === 404) setFehler(pushFehlertext(404, { code: "PUSH_NOT_FOUND" }));
    else setMeldung(T.entfernt);
    await ladeGeraete();
  });

  const titelId = `${uid}-push`;
  const kategorien = konfig && Array.isArray(konfig.categories) ? konfig.categories : [];
  const gespeichert = stand && stand.subscription && Array.isArray(stand.subscription.categories) ? stand.subscription.categories : [];
  const auswahl = entwurf || gespeichert;
  const aktuelleId = stand && stand.subscribed === true && stand.subscription ? stand.subscription.id : null;
  const zeilen = geraeteListe(geraete, kategorien, aktuelleId);
  const beschaeftigt = laeuft !== null;

  return (
    <section className="ce-card ce-geraete ce-push" aria-labelledby={titelId} id="ce-push" data-zustand={zustand}>
      <div className="ce-geraete-kopf">
        <h2 className="ce-geraete-titel" id={titelId}>{T.titel}</h2>
        {zustand !== Z.GESPERRT && <p className="ce-geraete-text">{T.einleitung(app)}</p>}
      </div>

      <div className={`ce-push-inhalt${zeilen.length > 0 ? " ce-push-inhalt--geraete" : ""}`}>
        <div className="ce-push-einstellung">
          {zustand === Z.GESPERRT && <p className="ce-geraete-text">{gesperrtText}</p>}
          {zustand === Z.NICHT_UNTERSTUETZT && <p className="ce-geraete-text">{T.nichtUnterstuetzt}</p>}
          {zustand === Z.IOS_INSTALLIEREN && <p className="ce-geraete-text">{T.iosInstallieren}</p>}
          {zustand === Z.LAEDT && <p className="ce-geraete-text" role="status">{T.laedt}</p>}
          {zustand === Z.NICHT_VERFUEGBAR && <p className="ce-push-lage" id="ce-push-nicht-verfuegbar">{T.nichtVerfuegbar}</p>}
          {zustand === Z.FEHLER && (
            <div className="ce-geraete-fehlerblock">
              <p className="ce-geraete-fehler" role="alert">{T.ladefehler}</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => laden()}>{T.erneut}</button>
            </div>
          )}
          {zustand === Z.BLOCKIERT && <p className="ce-push-lage">{T.blockiert}</p>}

          {(zustand === Z.AUS || zustand === Z.FRUEHERE_ANMELDUNG) && (
            <div className="ce-push-block">
              {zustand === Z.FRUEHERE_ANMELDUNG && <p className="ce-push-lage">{T.frueher}</p>}
              {kategorien.length > 0 && (
                <div className="ce-push-vorschau">
                  <p className="ce-geraete-text">{T.artenVorschau}</p>
                  <ul className="ce-push-vorschau-liste">
                    {kategorien.map((k) => <li key={k.id}>{k.label}</li>)}
                  </ul>
                </div>
              )}
              <p className="ce-geraete-hinweis">{T.inhalt}</p>
              <div className="ce-geraete-knoepfe">
                <button type="button" className="btn btn-primary btn-sm" id="ce-push-einschalten" onClick={einschalten}
                  disabled={beschaeftigt} aria-busy={laeuft === "an" ? "true" : undefined}>
                  {laeuft === "an" ? T.einschaltenLaeuft : zustand === Z.FRUEHERE_ANMELDUNG ? T.wiederEinschalten : T.einschalten}
                </button>
              </div>
            </div>
          )}

          {zustand === Z.AN && (
            <div className="ce-push-block">
              <p className="ce-push-lage ce-push-lage--an"><Icon n="bell" s={18} /><span>{T.an}</span></p>
              <fieldset className="ce-push-arten" disabled={beschaeftigt} aria-describedby={`${uid}-arten-hinweis`}>
                <legend className="ce-push-arten-titel">{T.artenTitel}</legend>
                {kategorien.map((k) => {
                  const an = auswahl.includes(k.id);
                  const letzte = an && auswahl.length === 1;
                  return (
                    <label key={k.id} className="ce-push-art">
                      <input type="checkbox" checked={an} disabled={letzte} data-art={k.id}
                        onChange={(e) => artUmschalten(k.id, e.target.checked)} />
                      <span>{k.label}</span>
                    </label>
                  );
                })}
                <p className="ce-geraete-hinweis" id={`${uid}-arten-hinweis`}>{T.artenHinweis}</p>
              </fieldset>
              <p className="ce-geraete-hinweis">{T.inhalt}</p>
              <div className="ce-geraete-knoepfe">
                <button type="button" className="btn btn-outline btn-sm" id="ce-push-ausschalten" onClick={ausschalten}
                  disabled={beschaeftigt} aria-busy={laeuft === "aus" ? "true" : undefined}>
                  {laeuft === "aus" ? T.ausschaltenLaeuft : T.ausschalten}
                </button>
              </div>
            </div>
          )}

          {fehler && <p className="ce-geraete-fehler" role="alert" id="ce-push-fehler">{fehler}</p>}
          <p className="ce-push-meldung" role="status" aria-live="polite" id="ce-push-meldung">{meldung}</p>
        </div>
        {zeilen.length > 0 && (
          <div className="ce-geraete-fuss ce-push-geraete">
            <div className="ce-geraete-kopf">
              <h3 className="ce-push-geraete-titel">{T.geraeteTitel}</h3>
              <p className="ce-geraete-text">{T.geraeteText}</p>
            </div>
            <ul className="ce-geraete-liste">
              {zeilen.map((z) => (
                <li key={z.id} className={`ce-geraet${z.aktuell ? " ce-geraet--aktuell" : ""}`} data-push-geraet={z.id}>
                  <span className="ce-geraet-symbol" aria-hidden="true"><Icon n="bell" s={20} /></span>
                  <div className="ce-geraet-text">
                    <span className="ce-geraet-name">
                      {z.name}
                      {z.aktuell && <span className="ce-geraet-marke">{T.diesesGeraet}</span>}
                    </span>
                    {z.arten.length > 0 && <span className="ce-geraet-meta">{z.arten.join(", ")}</span>}
                    <span className="ce-geraet-meta">{[z.seit, z.zuletzt].filter(Boolean).join(". ")}</span>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm ce-geraet-aktion" onClick={() => geraetEntfernen(z)}
                    disabled={beschaeftigt} aria-busy={laeuft === z.id ? "true" : undefined}
                    aria-label={`${T.entfernen}: ${z.name}${z.aktuell ? ` (${T.diesesGeraet})` : ""}`}>
                    {T.entfernen}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default PushMitteilungenKarte;
