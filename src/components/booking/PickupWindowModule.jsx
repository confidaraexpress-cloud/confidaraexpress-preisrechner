import React, { useState, useRef, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { isoDayDE } from "../../utils/formatters";
import { getDraftPickupWindow, saveDraftPickupWindow } from "../../api/client";
import {
  pickupTimeToMinutes as toMin,
  toHHMM,
  formatDuration as fmtDur,
  isPickupWindowAdjustable,
  validatePickupSelection,
  isFullCarrierWindow,
} from "../../utils/pickupWindowClient";

// Step 1 — „Gewünschter Abholtermin" (NUR Pickup). Datum read-only; zusätzlich ein frei
// anpassbares Von/Bis-Fenster INNERHALB der belegten Tarifgrenzen (pickupTimeFrom/Until) mit
// tarifabhängiger Mindestdauer (pickupWindowMinMinutes). Beim Einstieg wird das gespeicherte
// Draftfenster HYDRIERT (GET) — solange blockiert onHydrationChange die Buchung; ein Ladefehler
// ebenfalls. Auswahl wird auf dem Draft persistiert (POST, fail-closed) und erst serverseitig
// im /book buchungswirksam. KEINE Uhrzeit an /shipment-rates.
export function PickupWindowModule({ tariff, shipmentId, value, onChange, onHydrationChange }) {
  const boundFrom = toHHMM(tariff?.pickupTimeFrom);
  const boundUntil = toHHMM(tariff?.pickupTimeUntil);
  const bMin = toMin(boundFrom), bMax = toMin(boundUntil);
  const minDur = Number.isFinite(tariff?.pickupWindowMinMinutes) ? tariff.pickupWindowMinMinutes : 0;
  const adjustable = isPickupWindowAdjustable(tariff);

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

  // ── Hydrierung beim Einstieg: gespeichertes Draftfenster laden (nur adjustable) ──
  // Blockiert die Buchung, bis geladen; Ladefehler blockiert ebenfalls (kein unbemerktes
  // Buchen mit einem anderen als dem angezeigten Fenster). value (Eltern-State) hat Vorrang,
  // wenn bereits gesetzt (Rückkehr auf Step 1 nach Schrittwechsel).
  useEffect(() => {
    if (!adjustable) { report.current && report.current({ loading: false, error: false }); return; }
    if (value && (value.from || value.until)) { setHydrating(false); report.current && report.current({ loading: false, error: false }); return; }
    let alive = true;
    setHydrating(true); setHydrateError(false);
    report.current && report.current({ loading: true, error: false });
    getDraftPickupWindow(shipmentId)
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401 || r.status === 403) return; // zentraler Auth-Redirect
        let d = null; try { d = await r.json(); } catch { d = null; }
        if (r.ok && d && d.pickupTimeFrom && d.pickupTimeUntil) {
          setFrom(toHHMM(d.pickupTimeFrom)); setUntil(toHHMM(d.pickupTimeUntil));
          onChange && onChange({ from: toHHMM(d.pickupTimeFrom), until: toHHMM(d.pickupTimeUntil) });
        } else if (r.ok) {
          onChange && onChange(null); // NULL/NULL → volles Carrier-Fenster
        } else {
          setHydrateError(true); report.current && report.current({ loading: false, error: true }); setHydrating(false); return;
        }
        setHydrating(false); report.current && report.current({ loading: false, error: false });
      })
      .catch(() => { if (!alive) return; setHydrateError(true); setHydrating(false); report.current && report.current({ loading: false, error: true }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustable, shipmentId]);

  // Validierung + „volles Fenster"-Erkennung aus der geteilten Quelle der Wahrheit
  // (pickupWindowClient.mjs) — identisch zu den Tests, kein Mirror-Drift.
  const sel = validatePickupSelection({ from, until, boundFrom, boundUntil, minMinutes: minDur });
  const valid = sel.valid;
  const belowMin = sel.reason === "BELOW_MINIMUM_DURATION";
  const isFull = isFullCarrierWindow({ from, until, boundFrom, boundUntil });

  // ── Debounced-Persistenz NUR nach echter Nutzeränderung (nicht bei Hydrierung) ──
  useEffect(() => {
    if (!adjustable || !shipmentId || !touched || !valid || hydrating) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const resolved = isFull ? null : { from, until };
      const pickupTimeFrom = resolved ? resolved.from : null;
      const pickupTimeUntil = resolved ? resolved.until : null;
      const key = `${pickupTimeFrom}|${pickupTimeUntil}`;
      if (key === lastSentRef.current) return;
      lastSentRef.current = key;
      onChange && onChange(resolved);
      setSaveState("saving");
      saveDraftPickupWindow({ shipmentId, pickupTimeFrom, pickupTimeUntil })
        .then((r) => setSaveState(r && r.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, until, touched, valid, isFull, adjustable, shipmentId, hydrating]);

  if (bMin == null || bMax == null) return null;

  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="clock" s={18} c="#1D4ED8" /><h3>Gewünschter Abholtermin</h3></div>
      <div className="calc-panel-body">
        {tariff?.pickupDate && (
          <div className="summary-detail-row summary-detail-row-border">
            <span className="text-sm text-muted summary-detail-key">Datum</span>
            <span className="text-sm font-bold summary-detail-val">{isoDayDE(tariff.pickupDate)}</span>
          </div>
        )}

        {!adjustable ? (
          <div className="summary-detail-row">
            <span className="text-sm text-muted summary-detail-key">Abholzeitfenster</span>
            <span className="text-sm font-bold summary-detail-val">{boundFrom}–{boundUntil} Uhr</span>
          </div>
        ) : hydrateError ? (
          <div className="alert alert-error mt-12" role="alert">
            Das gespeicherte Abholzeitfenster konnte nicht geladen werden. Bitte laden Sie die Seite neu — eine Buchung ist bis dahin blockiert.
          </div>
        ) : hydrating ? (
          <div className="text-sm text-muted mt-12"><span className="spinner spinner-dark" /> Abholzeitfenster wird geladen…</div>
        ) : (
          <>
            <div className="mt-12" style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
                <label className="field-label" htmlFor="pw-from">Frühestens</label>
                <input id="pw-from" type="time" className="field-input" value={from} min={boundFrom} max={boundUntil} step={900}
                  onChange={(e) => { setTouched(true); setFrom(e.target.value); }} />
              </div>
              <span aria-hidden="true" style={{ paddingBottom: "10px", color: "var(--gray-500, #6b7280)" }}>–</span>
              <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
                <label className="field-label" htmlFor="pw-until">Spätestens</label>
                <input id="pw-until" type="time" className="field-input" value={until} min={boundFrom} max={boundUntil} step={900}
                  onChange={(e) => { setTouched(true); setUntil(e.target.value); }} />
              </div>
            </div>
            <p className="text-sm text-muted mt-12">
              Innerhalb {boundFrom}–{boundUntil} Uhr{minDur > 0 ? ` · Mindestdauer ${fmtDur(minDur)}` : ""}. Die Abholung erfolgt innerhalb des gewählten Fensters.
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
              <p className="text-sm text-muted mt-12">Abholfenster gespeichert.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
