import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useHref } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { useDialog } from "../../hooks/useDialog";
import { Icon } from "../ui/Icon";
import { ShipmentStatus } from "../ui/ShipmentStatus";
import { Werte } from "../ui/Werte";
import { resolveCarrierName } from "../../utils/carrierMap";
import { shipmentKpi } from "../../utils/kpis.mjs";
import { NO_ORDER_CONFIRMATION_TEXT } from "../../utils/businessNumbers.mjs";
import {
  KPI_FENSTER, KPI_FENSTER_LIMIT, KPI_FENSTER_SHEET, KPI_FENSTER_TEXT, kpiDetailAngaben, kpiFensterAntwort, kpiFensterFrisch,
  kpiFensterLage, kpiFensterScrollBedarf, kpiFensterStats, kpiFensterUmfang, kpiFensterUrl, kpiZeile, sendungWort,
} from "../../utils/kpiDetailView.mjs";

/* ── Kennzahl-Detailfenster (Betreiberentscheidung 2026-11-07) ──────────────────────────────────────────────────
   Ein Klick auf eine Kennzahlkarte öffnet dieses Fenster an der Karte, statt nach „Sendungen“ zu wechseln; die
   Übersicht bleibt stehen. Inhalt: Kopf (Symbol, Titel, Erklärung, Schließen), die Trefferzahl des Servers, die fünf
   neuesten Sendungen des Filters (aufklappbar, höchstens eine offen) und „Alle anzeigen“ — derselbe Deep-Link wie bisher.

   Daten: genau eine Anfrage beim Öffnen (GET /kunde/shipments?kpi=…&limit=5, utils/kpiDetailView.mjs), abgebrochen beim
   Schließen und beim Wechsel der Karte; eine verspätete Antwort erreicht kein Fenster mehr. Ein Stand derselben geöffneten
   Übersicht wird kurz wiederverwendet (`cache` aus Overview). Kein Trackingabruf, kein Providerkontakt, kein Storage.

   Form: ab 40em Breite und 30em Höhe ein schwebendes Fenster im Material der Kennzahlkarten (Portal an <body>, absolut im
   Dokument — es wandert beim Scrollen mit der Karte), darunter ein Bottom-Sheet über einem Schleier. Beide sind Dialoge
   nach dem Muster des Projekts (useDialog: Fokus hinein, Tab-Falle, Escape, Fokus zurück auf die Karte); ein Klick
   daneben schließt, ein Klick auf eine andere Karte wechselt (das entscheidet Overview). */

function medienAbo(query) {
  return (melden) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const mql = window.matchMedia(query);
    if (typeof mql.addEventListener !== "function") return () => {};
    mql.addEventListener("change", melden);
    return () => mql.removeEventListener("change", melden);
  };
}
const abonniereSheet = medienAbo(KPI_FENSTER_SHEET);
const sheetStand = () => typeof window !== "undefined" && typeof window.matchMedia === "function"
  && window.matchMedia(KPI_FENSTER_SHEET).matches;

// Sichtbare Fläche: Breite ohne Bildlaufleiste; oben die feste Kopfleiste des Telefons/Tablets, unten die Demo-Leiste.
function sichtbareFlaeche() {
  const hoehe = window.innerHeight;
  const leiste = document.querySelector(".mobile-topbar");
  const kopf = leiste && leiste.getClientRects().length ? leiste.getBoundingClientRect() : null;
  const demo = document.querySelector(".demo-leiste");
  const fuss = demo && demo.getClientRects().length ? demo.getBoundingClientRect() : null;
  return {
    breite: document.documentElement.clientWidth || window.innerWidth,
    hoehe,
    oben: kopf && kopf.top <= 0 ? Math.max(0, kopf.bottom) : 0,
    unten: fuss ? Math.max(0, hoehe - fuss.top) : 0,
  };
}

// Natürliche Höhe des Fensters: begrenzt ist nur der Inhaltsbereich — er trägt die übrige Höhe als scrollHeight.
function natuerlicheHoehe(box, inhalt) {
  return inhalt ? box.offsetHeight - inhalt.clientHeight + inhalt.scrollHeight : box.offsetHeight;
}

function gleicheLage(a, b) {
  return Boolean(a) && Boolean(b) && a.top === b.top && a.left === b.left && a.breite === b.breite
    && a.maxHoehe === b.maxHoehe && a.pfeil === b.pfeil && a.seite === b.seite;
}

// Ein Wert der aufgeklappten Angaben in seiner Form.
function AngabeWert({ angabe }) {
  if (angabe.art === "liste") {
    return (
      <ol className="kpf-nummern">
        {angabe.wert.map((nr) => <li key={nr} className="kpf-mono ce-wert">{nr}</li>)}
      </ol>
    );
  }
  if (angabe.art === "nummer") return <span className="kpf-mono ce-wert">{angabe.wert}</span>;
  if (angabe.art === "referenz") return <Werte>{angabe.wert}</Werte>;
  return angabe.wert;
}

function SendungsZeile({ kpi, sendung, index, offen, onUmschalten, idBasis }) {
  const zeile = kpiZeile(kpi, sendung, {
    carrierName: sendung.selected_carrier ? resolveCarrierName(sendung.selected_carrier) : null,
  });
  const angaben = offen ? kpiDetailAngaben(kpi, sendung) : [];
  const detailId = `${idBasis}-details`;
  return (
    <li className={`kpf-zeile${offen ? " is-offen" : ""}`} data-zeile={index}>
      <button type="button" className="kpf-zeile-knopf" aria-expanded={offen} aria-controls={detailId} onClick={onUmschalten}>
        <span className="kpf-zeile-kopf">
          {zeile.nummer
            ? <span className="kpf-nummer kpf-mono ce-wert">{zeile.nummer}</span>
            : <span className="kpf-nummer kpf-nummer--ohne">{NO_ORDER_CONFIRMATION_TEXT}</span>}
          <ShipmentStatus shipment={sendung} />
        </span>
        {zeile.versand.length > 0 && (
          <span className="kpf-zeile-sub">
            {zeile.versand.map((teil) => <span key={teil} className="kpf-teil">{teil}</span>)}
          </span>
        )}
        {zeile.zeit && <span className={`kpf-zeit${zeile.zeit.ton ? ` kpf-zeit--${zeile.zeit.ton}` : ""}`}>{zeile.zeit.text}</span>}
        <span className="kpf-zeile-pfeil" aria-hidden="true"><Icon n="chevron" s={16} /></span>
      </button>
      <div id={detailId} className="kpf-details" hidden={!offen}>
        {offen && (
          <dl className="kpf-angaben">
            {angaben.map((a) => (
              <div key={a.key} className={`kpf-angabe kpf-angabe--${a.art}`} data-angabe={a.key}>
                <dt>{a.label}</dt>
                <dd><AngabeWert angabe={a} /></dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

export function KpiDetailFenster({ kpi, anker, id, cache = null, onClose, onAlleAnzeigen, onStand = null }) {
  const def = shipmentKpi(kpi);
  const kopf = KPI_FENSTER[kpi];
  const sheet = useSyncExternalStore(abonniereSheet, sheetStand, () => false);
  const titelId = useId();
  const textId = useId();
  const zeilenId = useId();
  const ankerRef = useRef(anker);
  ankerRef.current = anker;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onStandRef = useRef(onStand);
  onStandRef.current = onStand;
  const inhaltRef = useRef(null);
  const [versuch, setVersuch] = useState(0);
  const [stand, setStand] = useState(() => {
    const eintrag = cache ? cache.get(kpi) : null;
    return kpiFensterFrisch(eintrag) ? eintrag.antwort : { status: "laden" };
  });
  const [offen, setOffen] = useState(null);
  const [lage, setLage] = useState(null);
  // Fokus hinein, Tab-Falle, Escape, Fokus zurück auf die Karte (auch in Safari, wo ein Klick nicht fokussiert). Das
  // schwebende Fenster ist erst nach der ersten Messung sichtbar — vorher nähme es keinen Fokus an.
  const boxRef = useDialog({ open: sheet || lage !== null, onClose, returnFocusTo: ankerRef });
  const gescrollt = useRef(false);
  const href = useHref(`/dashboard?page=shipments&kpi=${kpi}`);

  // ── Abruf: beim Öffnen genau einmal; abgebrochen beim Schließen und beim Wechsel der Karte ──
  useEffect(() => {
    const url = kpiFensterUrl(kpi);
    if (!url) { setStand({ status: "unavailable" }); return undefined; }
    if (versuch === 0 && kpiFensterFrisch(cache ? cache.get(kpi) : null)) return undefined;
    const ac = new AbortController();
    setStand({ status: "laden" });
    setOffen(null);
    (async () => {
      try {
        const r = await apiFetch(url, { auth: true, signal: ac.signal });
        if (ac.signal.aborted) return;
        if (!r.ok) {
          // 401/403 meldet apiFetch zentral ab — hier kein zweiter Fehlerweg.
          if (r.status !== 401 && r.status !== 403) setStand({ status: "fehler" });
          return;
        }
        const body = await r.json().catch(() => null);
        if (ac.signal.aborted) return;
        const antwort = kpiFensterAntwort(kpi, body);
        setStand(antwort);
        if (antwort.status !== "ready") return;
        if (cache) cache.set(kpi, { zeit: Date.now(), antwort });
        const stats = kpiFensterStats(kpi, antwort);
        if (stats && onStandRef.current) onStandRef.current(stats);
      } catch {
        if (!ac.signal.aborted) setStand({ status: "fehler" });
      }
    })();
    return () => ac.abort();
  }, [kpi, versuch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Klick daneben schließt; Escape auch, wenn der Fokus (noch) nicht im Fenster liegt ──
  useEffect(() => {
    const daneben = (e) => {
      const box = boxRef.current;
      const ziel = e.target;
      if (!box || !(ziel instanceof Node) || box.contains(ziel)) return;
      // Die Karten schalten selbst um (Overview): dieselbe Karte schließt, eine andere wechselt.
      if (ziel instanceof Element && ziel.closest(".ov-kpi")) return;
      onCloseRef.current?.();
    };
    const taste = (e) => { if (e.key === "Escape") onCloseRef.current?.(); };
    document.addEventListener("pointerdown", daneben);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("pointerdown", daneben);
      document.removeEventListener("keydown", taste);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lage an der Karte (nur das schwebende Fenster; das Sheet steht per CSS unten) ──
  const messen = useCallback(() => {
    const box = boxRef.current;
    const karte = ankerRef.current;
    if (sheet || !box || !karte || !karte.isConnected) return;
    const flaeche = sichtbareFlaeche();
    const neu = kpiFensterLage({
      anker: karte.getBoundingClientRect(), hoehe: natuerlicheHoehe(box, inhaltRef.current), viewport: flaeche,
    });
    // In Dokumentkoordinaten: das Fenster hängt absolut an <body> und scrollt mit der Karte.
    const basis = (box.offsetParent || document.body).getBoundingClientRect();
    const imDokument = { ...neu, top: Math.round(neu.top - basis.top), left: Math.round(neu.left - basis.left) };
    setLage((alt) => (gleicheLage(alt, imDokument) ? alt : imDokument));
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (sheet) return;
    const box = boxRef.current;
    const karte = ankerRef.current;
    // Flaches Fenster: die Karte einmalig so weit nach oben holen, dass unter ihr genug Platz ist — ohne Animation
    // (html scrollt sonst weich, und die Messung sähe noch die alte Lage).
    if (!gescrollt.current && box && karte) {
      gescrollt.current = true;
      const bedarf = kpiFensterScrollBedarf({ anker: karte.getBoundingClientRect(), viewport: sichtbareFlaeche() });
      if (bedarf > 0) {
        const wurzel = document.documentElement;
        const vorher = wurzel.style.scrollBehavior;
        wurzel.style.scrollBehavior = "auto";
        window.scrollBy(0, bedarf);
        wurzel.style.scrollBehavior = vorher;
      }
    }
    messen();
  }, [sheet, messen, stand, offen]);

  useEffect(() => {
    if (sheet) return undefined;
    const nach = () => messen();
    window.addEventListener("resize", nach);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(nach) : null;
    if (ro) {
      for (const el of [ankerRef.current, inhaltRef.current?.firstElementChild, document.body]) if (el) ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", nach);
      if (ro) ro.disconnect();
    };
  }, [sheet, messen, stand.status]);

  // Eine aufgeklappte Sendung rückt in den sichtbaren Teil der Liste — nur die Liste scrollt, nie die Seite
  // (scrollIntoView bewegte auch das Dokument). Der Kopf der Zeile bleibt dabei immer sichtbar.
  useEffect(() => {
    const liste = inhaltRef.current;
    if (offen === null || !liste) return;
    const zeile = liste.querySelector(`[data-zeile="${offen}"]`);
    if (!zeile) return;
    const z = zeile.getBoundingClientRect();
    const l = liste.getBoundingClientRect();
    if (z.top < l.top) liste.scrollTop -= l.top - z.top;
    else if (z.bottom > l.bottom) liste.scrollTop += Math.min(z.bottom - l.bottom, z.top - l.top);
  }, [offen]);

  const alleAnzeigen = (e) => {
    if (!onAlleAnzeigen || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onAlleAnzeigen(kpi);
  };

  if (!def || !kopf || typeof document === "undefined") return null;
  const bereit = stand.status === "ready";
  const umfang = bereit ? kpiFensterUmfang(stand.total, stand.shipments.length) : null;
  const stil = sheet ? undefined : lage
    ? { top: lage.top, left: lage.left, width: lage.breite, maxHeight: lage.maxHoehe, "--kpf-pfeil": `${lage.pfeil}px` }
    : { visibility: "hidden" };

  return createPortal(
    <>
      {sheet && <div className="kpf-schleier" aria-hidden="true" />}
      <div
        ref={boxRef}
        id={id}
        className={`kpf kpf--${sheet ? "sheet" : "fenster"}`}
        data-kpi={kpi}
        data-stand={stand.status}
        data-seite={sheet ? undefined : lage?.seite}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        aria-describedby={textId}
        tabIndex={-1}
        style={stil}
      >
        {sheet && <span className="kpf-griff" aria-hidden="true" />}
        <div className="kpf-kopf">
          <span className="kpf-symbol" aria-hidden="true"><Icon n={kopf.icon} s={18} /></span>
          <div className="kpf-kopf-text">
            <h2 className="kpf-titel" id={titelId}>{kopf.titel}</h2>
            <p className="kpf-erklaerung" id={textId}>{def.context}</p>
          </div>
          <button type="button" className="kpf-schliessen" onClick={onClose} aria-label={KPI_FENSTER_TEXT.schliessen} title={KPI_FENSTER_TEXT.schliessen}>
            <Icon n="close" s={18} />
          </button>
        </div>

        <div className="kpf-kennzahl" role="status">
          {bereit ? (
            <p className="kpf-zahlzeile">
              <span className="kpf-zahl">{stand.total}</span>
              <span className="kpf-einheit">{sendungWort(stand.total)}</span>
            </p>
          ) : (
            <p className="kpf-zahlzeile kpf-zahlzeile--offen">
              <span className="kpf-zahl" aria-hidden="true">—</span>
              {stand.status === "laden" && <span className="sr-only">{KPI_FENSTER_TEXT.laden}</span>}
            </p>
          )}
          {umfang && <p className="kpf-umfang">{umfang}</p>}
        </div>

        <div className="kpf-inhalt" ref={inhaltRef}>
          {stand.status === "laden" && (
            <ul className="kpf-skelett" aria-hidden="true">
              {Array.from({ length: Math.min(3, KPI_FENSTER_LIMIT) }, (_, i) => (
                <li key={i} className="kpf-skelett-zeile">
                  <span className="ce-skeleton kpf-skelett-a" />
                  <span className="ce-skeleton kpf-skelett-b" />
                </li>
              ))}
            </ul>
          )}
          {stand.status === "fehler" && (
            <div className="kpf-zustand kpf-zustand--fehler" role="alert">
              <p className="kpf-zustand-titel">{KPI_FENSTER_TEXT.fehler}</p>
              <p className="kpf-zustand-text">{KPI_FENSTER_TEXT.fehlerHinweis}</p>
              <button type="button" className="btn btn-primary btn-sm kpf-erneut" onClick={() => setVersuch((v) => v + 1)}>{KPI_FENSTER_TEXT.erneut}</button>
            </div>
          )}
          {stand.status === "unavailable" && (
            <div className="kpf-zustand">
              <p className="kpf-zustand-titel">{KPI_FENSTER_TEXT.nichtVerfuegbar}</p>
            </div>
          )}
          {bereit && stand.total === 0 && (
            <div className="kpf-zustand kpf-zustand--leer">
              <p className="kpf-zustand-titel">{def.empty}</p>
            </div>
          )}
          {bereit && stand.shipments.length > 0 && (
            <ul className="kpf-liste" aria-label={kopf.titel}>
              {stand.shipments.map((s, i) => (
                <SendungsZeile
                  key={s.id ?? i}
                  kpi={kpi}
                  sendung={s}
                  index={i}
                  idBasis={`${zeilenId}-${i}`}
                  offen={offen === i}
                  onUmschalten={() => setOffen((o) => (o === i ? null : i))}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="kpf-fuss">
          <a className="kpf-alle" href={href} onClick={alleAnzeigen}>
            {KPI_FENSTER_TEXT.alleAnzeigen}
            <Icon n="arrowRight" s={16} />
          </a>
        </div>
      </div>
    </>,
    document.body,
  );
}
