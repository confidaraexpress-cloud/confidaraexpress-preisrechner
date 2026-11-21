import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { zeichnePdf } from "./pdfBlatt";
import { EDITOR_TEXT as E, flatRegions, sheetRegions } from "../../utils/manualInvoiceEditor.mjs";

// Rechnungseditor (2026-11-21): das A4-Blatt. Gezeigt wird das echte PDF des Servers (pdf.js, Canvas); darüber
// liegen die Klickflächen aus der Bereichskarte desselben PDFs. Blatt und Flächen wechseln gemeinsam, erst wenn alle
// Seiten der neuen Fassung gezeichnet sind — Flächen gehören immer zu dem Blatt, das man sieht.
//
// Tastatur: das Blatt ist EIN Tabstopp (rollierender Fokus); Pfeiltasten wandern durch die Bereiche, Pos1/Ende
// springen an Anfang und Ende, Eingabe bzw. Leertaste öffnen den Abschnitt. „Position hinzufügen" ist ein eigener
// Tabstopp. Der gleichwertige Weg ohne Blatt sind die Abschnitte daneben.

// Zeichenbreite in Stufen, damit eine kleine Breitenänderung nicht jedes Mal neu zeichnet.
const STUFE = 80;

function Raster({ canvas, label }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && canvas) el.replaceChildren(canvas);
  }, [canvas]);
  return <div className="adm-mi-raster" role="img" aria-label={label} ref={ref} />;
}

export function InvoiceSheet({
  sheet,               // { bytes: Uint8Array, regions, pageCount, page } | null
  interactive = false,
  activeKey = null,
  onRegion,
  onAddPosition,
  onOpenPdf,
  idPrefix = "mi-sheet",
  waitText = "",       // Platzhalter ohne Blatt, wenn gerade keines kommt (Vorschaufehler, ungültige Eingabe)
}) {
  const huelleRef = useRef(null);
  const [breite, setBreite] = useState(0);
  const [gezeigt, setGezeigt] = useState(null);   // { canvases, karte }
  const [fehler, setFehler] = useState(false);
  const [fokus, setFokus] = useState(0);
  const knoepfe = useRef([]);

  // Breite der Blattspalte beobachten (CSS-Pixel), in Stufen gerundet.
  useLayoutEffect(() => {
    const el = huelleRef.current;
    if (!el) return undefined;
    const messen = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setBreite(Math.ceil(w / STUFE) * STUFE);
    };
    messen();
    if (typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!sheet || !sheet.bytes || !breite) return undefined;
    const abbruch = new AbortController();
    const dichte = Math.min(typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1, 2);
    // pdf.js übernimmt den Puffer in den Worker — deshalb eine Kopie.
    zeichnePdf(sheet.bytes.slice(), { breite, pixelRatio: dichte, abbruch: abbruch.signal })
      .then((canvases) => {
        if (!canvases || abbruch.signal.aborted) return;
        setGezeigt({ canvases, karte: sheetRegions(sheet.regions, canvases.length), page: sheet.page });
        setFehler(false);
      })
      .catch(() => { if (!abbruch.signal.aborted) setFehler(true); });
    return () => abbruch.abort();
  }, [sheet, breite]);

  const flach = useMemo(() => (gezeigt ? flatRegions(gezeigt.karte) : []), [gezeigt]);

  // Rollierender Fokus folgt dem aktiven Abschnitt (wer per Tab ins Blatt kommt, landet dort).
  useEffect(() => {
    if (!flach.length) return;
    const i = activeKey ? flach.findIndex((r) => r.key === activeKey) : -1;
    if (i >= 0) setFokus(i);
    else setFokus((f) => Math.min(f, flach.length - 1));
  }, [activeKey, flach]);

  const taste = useCallback((e, i) => {
    let ziel = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") ziel = Math.min(i + 1, flach.length - 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") ziel = Math.max(i - 1, 0);
    else if (e.key === "Home") ziel = 0;
    else if (e.key === "End") ziel = flach.length - 1;
    if (ziel === null) return;
    e.preventDefault();
    setFokus(ziel);
    const knopf = knoepfe.current[ziel];
    if (knopf) knopf.focus();
  }, [flach]);

  const seitenzahl = gezeigt ? gezeigt.canvases.length : 0;
  let laufend = -1;

  return (
    <div className="adm-mi-sheet" ref={huelleRef} id={idPrefix} data-state={fehler ? "fehler" : gezeigt ? "bereit" : "laedt"}>
      {fehler && (
        <div className="adm-mi-sheet-error" role="alert" id={`${idPrefix}-error`}>
          <p>{E.sheetEngineFailed}</p>
          {onOpenPdf && sheet && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onOpenPdf}>{E.sheetOpenPdf}</button>
          )}
        </div>
      )}
      {!gezeigt && !fehler && (
        <div className="adm-mi-page adm-mi-page--wartet">
          <p className="adm-mi-sheet-wait" role="status">{waitText || E.sheetLoading}</p>
        </div>
      )}
      {gezeigt && (
        <div className="adm-mi-pages" role={interactive ? "group" : undefined} aria-label={interactive ? E.sheetGroup : undefined}>
          {gezeigt.canvases.map((canvas, s) => (
            <div className="adm-mi-page" key={s} data-page={s + 1}>
              <Raster canvas={canvas} label={E.sheetPage(s + 1, seitenzahl)} />
              {interactive && gezeigt.karte.pages[s].map((r) => {
                laufend += 1;
                const i = laufend;
                const aktiv = activeKey === r.key;
                return (
                  <button
                    key={r.id}
                    type="button"
                    ref={(el) => { knoepfe.current[i] = el; }}
                    className={`adm-mi-reg adm-mi-reg--${r.key.startsWith("position:") ? "position" : r.key}`}
                    style={r.style}
                    data-region={r.key}
                    data-label={r.target.label}
                    aria-label={r.key === "issuer" ? `${r.target.label} — nicht im Editor änderbar` : `${r.target.label} bearbeiten`}
                    aria-current={aktiv ? "true" : undefined}
                    tabIndex={i === fokus ? 0 : -1}
                    onClick={() => onRegion && onRegion(r.target)}
                    onKeyDown={(e) => taste(e, i)}
                    onFocus={() => setFokus(i)}
                  />
                );
              })}
              {interactive && onAddPosition && gezeigt.karte.addAnchor && gezeigt.karte.addAnchor.page === s + 1 && (
                <button
                  type="button"
                  id={`${idPrefix}-add`}
                  className="adm-mi-add"
                  style={{ left: gezeigt.karte.addAnchor.style.left, top: gezeigt.karte.addAnchor.style.top }}
                  aria-label={E.addPosition}
                  data-label={E.addPosition}
                  onClick={onAddPosition}
                >
                  <span aria-hidden="true">+</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default InvoiceSheet;
