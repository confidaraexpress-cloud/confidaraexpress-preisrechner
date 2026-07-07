import React, { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { todayISO, toISODateLocal, parseISODateLocal } from "../../utils/date";

// Leichte, eigenständige Kalender-Komponente (keine externe Library). REINE
// Darstellung + lokale Monatsnavigation; die Auswahl wird über onSelect(iso)
// nach außen gereicht (iso = "YYYY-MM-DD", lokal). Vergangene Tage (< minDate)
// sind deaktiviert.
//
// Props:
//   value       "YYYY-MM-DD" | null   — aktuell gewähltes Datum (blau markiert)
//   onSelect(iso)                      — Klick auf einen (aktivierbaren) Tag
//   minDate     "YYYY-MM-DD"           — Tage davor sind deaktiviert (Default: heute)
//   onClose()                          — optional; Escape schließt den Popover
//   markedDays  { [iso]: {type} }      — VORBEREITUNG für echte Marker (Feiertage/
//                                        kein Service). Aktuell übergibt niemand
//                                        Daten → es werden KEINE Punkte gerendert.
//                                        Keine erfundenen/roten Marker ohne Datenbasis.

const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
  "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export function DateCalendar({ value, onSelect, minDate, onClose, markedDays }) {
  const minISO = minDate || todayISO();
  const initial = parseISODateLocal(value) || parseISODateLocal(minISO) || new Date();
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  // Escape schließt den Popover (nur solange der Kalender gemountet ist).
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const minObj = parseISODateLocal(minISO) || new Date();
  const minY = minObj.getFullYear(), minM = minObj.getMonth();
  // Nicht vor den Monat des Mindestdatums navigieren (dort wäre ohnehin alles inaktiv).
  const canPrev = view.y > minY || (view.y === minY && view.m > minM);

  const goPrev = () => { if (!canPrev) return; setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 })); };
  const goNext = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Mo-erst: führende Leerzellen
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const t = todayISO();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="dc" role="group" aria-label="Versanddatum wählen">
      <div className="dc-head">
        <button type="button" className="dc-nav" onClick={goPrev} disabled={!canPrev} aria-label="Vorheriger Monat">
          <Icon n="chevronLeft" s={16} c="currentColor" />
        </button>
        <div className="dc-title" aria-live="polite">{MONTHS_DE[view.m]} {view.y}</div>
        <button type="button" className="dc-nav" onClick={goNext} aria-label="Nächster Monat">
          <Icon n="chevronRight" s={16} c="currentColor" />
        </button>
      </div>

      <div className="dc-weekdays" aria-hidden="true">
        {WEEKDAYS_SHORT.map(w => <span key={w} className="dc-weekday">{w}</span>)}
      </div>

      <div className="dc-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} className="dc-blank" aria-hidden="true" />;
          const iso = toISODateLocal(new Date(view.y, view.m, d));
          const isPast = iso < minISO;
          const isToday = iso === t;
          const isSelected = iso === value;
          const wd = (new Date(view.y, view.m, d).getDay() + 6) % 7;
          const marker = markedDays && markedDays[iso];
          return (
            <button
              key={iso}
              type="button"
              className={`dc-day${isSelected ? " dc-day--selected" : ""}${isToday ? " dc-day--today" : ""}`}
              disabled={isPast}
              aria-label={`${WEEKDAYS_LONG[wd]}, ${d}. ${MONTHS_DE[view.m]} ${view.y} auswählen`}
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onSelect(iso)}
            >
              <span className="dc-day-num">{d}</span>
              {marker && <span className="dc-day-dot" data-marker={marker.type || "mark"} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
