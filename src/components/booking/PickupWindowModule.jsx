import React, { useState, useRef, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { isoDayDE } from "../../utils/formatters";
import { saveDraftPickupWindow } from "../../api/client";

// "HH:mm[:ss]" → Minuten seit 00:00; sonst null.
const toMin = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ""));
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  return h > 23 || mm > 59 ? null : h * 60 + mm;
};
// "HH:mm" (5 Zeichen) für <input type="time"> / Anzeige.
const toHHMM = (v) => { const n = toMin(v); return n == null ? "" : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`; };
const fmtDur = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} Std.` : null, m ? `${m} Min.` : null].filter(Boolean).join(" ") || "0 Min.";
};

// Step 1 — „Gewünschter Abholtermin" (NUR Pickup). Datum read-only aus dem Tarif;
// zusätzlich ein frei anpassbares Von/Bis-Abholzeitfenster INNERHALB der belegten
// Tarifgrenzen (pickupTimeFrom/Until) mit tarifabhängiger Mindestdauer
// (pickupWindowMinMinutes). Die Auswahl wird auf dem Draft persistiert
// (saveDraftPickupWindow) und erst serverseitig im /book buchungswirksam
// (pickup_min_time/pickup_max_time). KEINE Uhrzeit an /shipment-rates.
//
// Der resolvte Wert (value/onChange) liegt im BookingPage-State, damit die Auswahl
// den Schrittwechsel (Step 1 ↔ Customs …) übersteht; die Debounce-Persistenz liegt hier.
export function PickupWindowModule({ tariff, shipmentId, value, onChange }) {
  const boundFrom = toHHMM(tariff?.pickupTimeFrom);
  const boundUntil = toHHMM(tariff?.pickupTimeUntil);
  const bMin = toMin(boundFrom), bMax = toMin(boundUntil);
  const minDur = Number.isFinite(tariff?.pickupWindowMinMinutes) ? tariff.pickupWindowMinMinutes : 0;
  const adjustable = tariff?.pickupWindowAdjustable === true && bMin != null && bMax != null && bMin < bMax;

  const [from, setFrom] = useState(toHHMM(value?.from) || boundFrom);
  const [until, setUntil] = useState(toHHMM(value?.until) || boundUntil);
  const [touched, setTouched] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle|saving|saved|error
  const timerRef = useRef(null);
  const lastSentRef = useRef("");

  const selMin = toMin(from), selMax = toMin(until);
  const withinBounds = selMin != null && selMax != null && bMin != null && bMax != null
    && selMin >= bMin && selMax <= bMax && selMin < selMax;
  const meetsMin = withinBounds && (selMax - selMin) >= minDur;
  const valid = withinBounds && meetsMin;
  const isFull = withinBounds && selMin === bMin && selMax === bMax;

  useEffect(() => {
    if (!adjustable || !shipmentId || !touched || !valid) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const resolved = isFull ? null : { from, until };
      const minTime = resolved ? resolved.from : null;
      const maxTime = resolved ? resolved.until : null;
      const key = `${minTime}|${maxTime}`;
      if (key === lastSentRef.current) return;
      lastSentRef.current = key;
      onChange && onChange(resolved);
      setSaveState("saving");
      saveDraftPickupWindow({ shipmentId, pickupMinTime: minTime, pickupMaxTime: maxTime })
        .then((r) => setSaveState(r && r.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [from, until, touched, valid, isFull, adjustable, shipmentId, onChange]);

  if (bMin == null || bMax == null) return null; // ohne belegtes Carrier-Fenster nichts anzeigen

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

        {adjustable ? (
          <>
            <div className="mt-12" style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
                <label className="field-label" htmlFor="pw-from">Frühestens</label>
                <input id="pw-from" type="time" className="field-input" value={from}
                  min={boundFrom} max={boundUntil} step={900}
                  onChange={(e) => { setTouched(true); setFrom(e.target.value); }} />
              </div>
              <span aria-hidden="true" style={{ paddingBottom: "10px", color: "var(--gray-500, #6b7280)" }}>–</span>
              <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
                <label className="field-label" htmlFor="pw-until">Spätestens</label>
                <input id="pw-until" type="time" className="field-input" value={until}
                  min={boundFrom} max={boundUntil} step={900}
                  onChange={(e) => { setTouched(true); setUntil(e.target.value); }} />
              </div>
            </div>

            <p className="text-sm text-muted mt-12">
              Innerhalb {boundFrom}–{boundUntil} Uhr{minDur > 0 ? ` · Mindestdauer ${fmtDur(minDur)}` : ""}. Die Abholung
              erfolgt innerhalb des gewählten Fensters.
            </p>

            {!valid && (
              <div className="alert alert-error mt-12" role="alert">
                {!withinBounds
                  ? `Bitte eine Zeit zwischen ${boundFrom} und ${boundUntil} Uhr wählen (Beginn muss vor Ende liegen).`
                  : `Das Abholfenster muss mindestens ${fmtDur(minDur)} umfassen.`}
              </div>
            )}
            {valid && touched && saveState === "error" && (
              <div className="alert alert-error mt-12" role="alert">Speichern des Abholfensters fehlgeschlagen. Bitte erneut versuchen.</div>
            )}
            {valid && touched && !isFull && saveState === "saved" && (
              <p className="text-sm text-muted mt-12">Abholfenster gespeichert.</p>
            )}
          </>
        ) : (
          <div className="summary-detail-row">
            <span className="text-sm text-muted summary-detail-key">Abholzeitfenster</span>
            <span className="text-sm font-bold summary-detail-val">{boundFrom}–{boundUntil} Uhr</span>
          </div>
        )}
      </div>
    </div>
  );
}
