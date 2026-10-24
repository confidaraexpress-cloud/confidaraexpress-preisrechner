import React, { useState, useRef, useEffect } from "react";
import { isoDayDE } from "../../utils/formatters";
import { getDraftPickupWindow, saveDraftPickupWindow } from "../../api/client";
import {
  pickupTimeToMinutes as toMin,
  minutesToHHMM,
  toHHMM,
  formatDuration as fmtDur,
  validatePickupSelection,
  isFullCarrierWindow,
  rangePercent,
  pickupSliderGap,
  clampPickupFrom,
  clampPickupUntil,
} from "../../utils/pickupWindowClient";
import {
  pickupTimeProfileOf, pickupDayLabel, PICKUP_PROFILE, PICKUP_SECTION_TEXT as T,
} from "../../utils/pickupContractView.mjs";
import { sameDayBookByText } from "../../utils/sameDayCollectionView.mjs";

// Step 1 — der Abschnitt „Abholtermin" für JEDE Fahrerabholung (Einheitlicher Abholtermin, 2026-10-24).
// Welche Variante erscheint, entscheidet allein `pickupTimeProfileOf` an den Feldern des Angebots — kein
// Provider, keine ServiceID:
//   • window_adjustable — „Gewünschter Abholtermin": Datum read-only plus ein frei anpassbares Von/Bis-Fenster
//     INNERHALB der belegten Tarifgrenzen (pickupTimeFrom/Until) mit der Mindestdauer des Servers
//     (pickupWindowMinMinutes, mindestens 120 Minuten). Beim Einstieg wird das gespeicherte Draftfenster HYDRIERT
//     (GET, für GENAU dieses Angebot) — solange blockiert onHydrationChange die Buchung; ein Ladefehler ebenfalls.
//     Auswahl wird auf dem Draft persistiert (POST, an dieses Angebot gebunden, fail-closed) und erst serverseitig
//     im /book buchungswirksam. KEINE Uhrzeit an /shipment-rates.
//   • window_fixed — fester Zeitraum ohne Wahl (ein nicht verstellbarer JUMiNGO-Tarif, der Portalzeitraum).
//   • ready_from — nur „Sendung bereit ab …": der Anbietervertrag kennt kein Ende, es entsteht keines.
//   • date_only — nur der Abholtag; keine erfundene Uhrzeit.
//   • none — Paketshopabgabe oder kein Abholtag: kein Abschnitt.
// Ohne Wahl wird der Entwurf weder gelesen noch beschrieben, und eine noch im Seitenzustand liegende Auswahl
// eines anderen Tarifs wird verworfen — sie darf weder die Buchung sperren noch eine Zusammenfassung verfälschen.
export function PickupWindowModule({ tariff, ceShipmentId, value, onChange, onHydrationChange }) {
  const profil = pickupTimeProfileOf(tariff);
  const adjustable = profil.kind === PICKUP_PROFILE.ADJUSTABLE;
  const offerId = typeof tariff?.offerId === "string" && tariff.offerId !== "" ? tariff.offerId : undefined;
  const boundFrom = adjustable ? toHHMM(profil.from) : "";
  const boundUntil = adjustable ? toHHMM(profil.until) : "";
  const bMin = toMin(boundFrom), bMax = toMin(boundUntil);
  const minDur = adjustable && Number.isFinite(profil.minMinutes) ? profil.minMinutes : 0;

  const [from, setFrom] = useState(toHHMM(value?.from) || boundFrom);
  const [until, setUntil] = useState(toHHMM(value?.until) || boundUntil);
  const [touched, setTouched] = useState(false);
  const [hydrating, setHydrating] = useState(adjustable);
  const [hydrateError, setHydrateError] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle|saving|saved|error
  const timerRef = useRef(null);
  const lastSentRef = useRef("");
  const report = useRef(onHydrationChange);
  report.current = onHydrationChange;
  const change = useRef(onChange);
  change.current = onChange;

  // ── Hydrierung beim Einstieg: gespeichertes Draftfenster laden (nur adjustable) ──
  // Blockiert die Buchung, bis geladen; Ladefehler blockiert ebenfalls (kein unbemerktes
  // Buchen mit einem anderen als dem angezeigten Fenster). value (Eltern-State) hat Vorrang,
  // wenn bereits gesetzt (Rückkehr auf Step 1 nach Schrittwechsel). Geladen wird der Wunsch
  // FÜR DIESES ANGEBOT: einen Wunsch, der zu einem anderen Tarif gehört, meldet der Server als leer.
  useEffect(() => {
    if (!adjustable) {
      // Keine Wahl an diesem Angebot: nichts laden, nichts sperren — und keine fremde Auswahl stehen lassen.
      report.current && report.current({ loading: false, error: false });
      change.current && change.current(null);
      return;
    }
    if (value && (value.from || value.until)) { setHydrating(false); report.current && report.current({ loading: false, error: false }); return; }
    let alive = true;
    setHydrating(true); setHydrateError(false);
    report.current && report.current({ loading: true, error: false });
    getDraftPickupWindow(ceShipmentId, offerId)
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401 || r.status === 403) return; // zentraler Auth-Redirect
        let d = null; try { d = await r.json(); } catch { d = null; }
        if (r.ok && d && d.pickupTimeFrom && d.pickupTimeUntil) {
          setFrom(toHHMM(d.pickupTimeFrom)); setUntil(toHHMM(d.pickupTimeUntil));
          change.current && change.current({ from: toHHMM(d.pickupTimeFrom), until: toHHMM(d.pickupTimeUntil) });
        } else if (r.ok) {
          change.current && change.current(null); // NULL/NULL → volles Carrier-Fenster
        } else {
          setHydrateError(true); report.current && report.current({ loading: false, error: true }); setHydrating(false); return;
        }
        setHydrating(false); report.current && report.current({ loading: false, error: false });
      })
      .catch(() => { if (!alive) return; setHydrateError(true); setHydrating(false); report.current && report.current({ loading: false, error: true }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustable, ceShipmentId, offerId]);

  // Validierung + „volles Fenster"-Erkennung aus der geteilten Quelle der Wahrheit
  // (pickupWindowClient.mjs) — identisch zu den Tests, kein Mirror-Drift.
  const sel = validatePickupSelection({ from, until, boundFrom, boundUntil, minMinutes: minDur });
  const valid = sel.valid;
  const belowMin = sel.reason === "BELOW_MINIMUM_DURATION";
  const isFull = isFullCarrierWindow({ from, until, boundFrom, boundUntil });

  // ── Dual-Range-Slider: Minutenachse, 15-Min-Raster, hervorgehobener Bereich ──
  // Beide Griffe halten jederzeit Carriergrenzen UND Mindestdauer ein — die
  // zentralen Clamp-Helfer sind die einzige Interaktions-Wahrheit (keine
  // Duplikat-Logik). from/until bleiben HH:mm-Strings; der Slider rechnet nur in
  // Minuten und schreibt via minutesToHHMM zurück (verträgt Off-Raster-Draftwerte).
  const SLIDER_STEP = 15;
  const selMin = toMin(from), selMax = toMin(until);
  const gap = pickupSliderGap(minDur, SLIDER_STEP);
  const fromPct = rangePercent(selMin, bMin, bMax);
  const untilPct = rangePercent(selMax, bMin, bMax);
  const onFromRange = (e) => {
    const v = clampPickupFrom(Number(e.target.value), selMax, bMin, gap);
    if (v == null) return;
    setTouched(true); setFrom(minutesToHHMM(v));
  };
  const onUntilRange = (e) => {
    const v = clampPickupUntil(Number(e.target.value), selMin, bMax, gap);
    if (v == null) return;
    setTouched(true); setUntil(minutesToHHMM(v));
  };

  // ── Debounced-Persistenz NUR nach echter Nutzeränderung (nicht bei Hydrierung) ──
  useEffect(() => {
    if (!adjustable || !ceShipmentId || !touched || !valid || hydrating) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const resolved = isFull ? null : { from, until };
      const pickupTimeFrom = resolved ? resolved.from : null;
      const pickupTimeUntil = resolved ? resolved.until : null;
      const key = `${pickupTimeFrom}|${pickupTimeUntil}`;
      if (key === lastSentRef.current) return;
      lastSentRef.current = key;
      change.current && change.current(resolved);
      setSaveState("saving");
      saveDraftPickupWindow({ ceShipmentId, offerId, pickupTimeFrom, pickupTimeUntil })
        .then((r) => setSaveState(r && r.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, until, touched, valid, isFull, adjustable, ceShipmentId, offerId, hydrating]);

  if (profil.kind === PICKUP_PROFILE.NONE) return null;
  if (adjustable && (bMin == null || bMax == null)) return null;

  // Heute abholbar: der wirksame Buchungsschluss des Servers — kein Abholende (utils/sameDayCollectionView.mjs).
  // Er steht direkt unter der Zeitangabe, vor dem erklärenden Satz.
  const heute = profil.sameDayBookBy ? sameDayBookByText(profil.sameDayBookBy) : null;
  const heuteZeile = heute ? <p className="text-sm mt-12 pw-sameday">{heute}</p> : null;
  // Die Zeitangabe JEDER Variante steht in derselben Zeile und Typografie wie die Zeit des Reglers (pw-time-*).
  const zeitZeile = (label, wert, klasse) => (
    <div className="summary-detail-row summary-detail-row-border pw-time-row">
      <span className="text-sm text-muted summary-detail-key">{label}</span>
      <span className={`font-bold summary-detail-val pw-time-val ${klasse}`}>{wert}</span>
    </div>
  );

  return (
    <div className="calc-panel mb-16" data-pickup-profile={profil.kind}>
      <div className="calc-panel-header"><h3>{adjustable ? T.titleChoice : T.title}</h3></div>
      <div className="calc-panel-body">
        {profil.day && (
          // Ohne folgende Zeitzeile (nur Datum) keine Trennlinie unter dem Datum.
          <div className={`summary-detail-row${profil.kind === PICKUP_PROFILE.DATE_ONLY ? "" : " summary-detail-row-border"}`}>
            <span className="text-sm text-muted summary-detail-key">{pickupDayLabel(profil, T.dayLabel)}</span>
            <span className="text-sm font-bold summary-detail-val">{isoDayDE(profil.day)}</span>
          </div>
        )}

        {profil.kind === PICKUP_PROFILE.FIXED && (
          <>
            {zeitZeile(T.windowLabel, `${profil.from}–${profil.until} Uhr`, "pw-fixed-val")}
            {heuteZeile}
            <p className="text-sm text-muted mt-12 pw-caption pw-note">{T.fixedNote}</p>
          </>
        )}

        {profil.kind === PICKUP_PROFILE.READY_FROM && (
          <>
            {zeitZeile(T.readyFromLabel, `${profil.readyFrom} Uhr`, "pw-ready-val")}
            {heuteZeile}
            <p className="text-sm text-muted mt-12 pw-caption pw-note">{T.readyFromNote}</p>
          </>
        )}

        {profil.kind === PICKUP_PROFILE.DATE_ONLY && (
          <>
            {heuteZeile}
            <p className="text-sm text-muted mt-12 pw-caption pw-note">{T.dateOnlyNote}</p>
          </>
        )}

        {adjustable && (hydrateError ? (
          <div className="alert alert-error mt-12" role="alert">
            Das gespeicherte Abholzeitfenster konnte nicht geladen werden. Bitte laden Sie die Seite neu — eine Buchung ist bis dahin blockiert.
          </div>
        ) : hydrating ? (
          <div className="text-sm text-muted mt-12"><span className="spinner spinner-dark" /> Abholzeitfenster wird geladen…</div>
        ) : (
          <>
            {/* Zeit — live, ändert sich unmittelbar beim Ziehen der Griffe. */}
            <div className="summary-detail-row summary-detail-row-border pw-time-row">
              <span className="text-sm text-muted summary-detail-key">Zeit</span>
              <span className="font-bold summary-detail-val pw-time-val">{from}–{until} Uhr</span>
            </div>

            {/* Dual-Range-Slider — zwei verschiebbare Griffe, hervorgehobener Bereich.
                Native <input type=range> übereinander (nur Griffe interaktiv) → volle
                Tastatur-/Touch-Bedienung; Start/Ende bleiben im Tariffenster, die
                Mindestdauer bleibt jederzeit erhalten. */}
            <div className="pw-slider">
              <div className="pw-slider-rail" aria-hidden="true">
                <div className="pw-slider-fill" style={{ left: `${fromPct}%`, width: `${Math.max(0, untilPct - fromPct)}%` }} />
              </div>
              <input
                type="range" className="pw-range pw-range--from"
                min={bMin} max={bMax} step={SLIDER_STEP} value={selMin != null ? selMin : bMin}
                aria-label="Frühester Abholzeitpunkt" aria-valuetext={`${from} Uhr`}
                onChange={onFromRange}
              />
              <input
                type="range" className="pw-range pw-range--until"
                min={bMin} max={bMax} step={SLIDER_STEP} value={selMax != null ? selMax : bMax}
                aria-label="Spätester Abholzeitpunkt" aria-valuetext={`${until} Uhr`}
                onChange={onUntilRange}
              />
            </div>

            <p className="text-sm text-muted mt-12 pw-caption">
              Verfügbar: {boundFrom}–{boundUntil} Uhr{minDur > 0 ? ` · Mindestdauer: ${fmtDur(minDur)}` : ""}
            </p>

            {!valid && (
              <div className="alert alert-error mt-12" role="alert">
                {belowMin
                  ? `Das Abholfenster muss mindestens ${fmtDur(minDur)} umfassen.`
                  : `Bitte eine Zeit zwischen ${boundFrom} und ${boundUntil} Uhr wählen (Beginn muss vor Ende liegen).`}
              </div>
            )}
            {valid && touched && saveState === "error" && (
              <div className="alert alert-error mt-12" role="alert">Speichern des Abholfensters fehlgeschlagen. Bitte erneut versuchen.</div>
            )}
            {valid && touched && !isFull && saveState === "saved" && (
              <p className="text-sm mt-8 pw-saved">Abholfenster gespeichert</p>
            )}
          </>
        ))}

        {adjustable && heuteZeile}
      </div>
    </div>
  );
}
