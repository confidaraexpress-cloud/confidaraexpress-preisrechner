import React from "react";
import { Icon } from "../ui/Icon";
import { formatDistance, weekOpeningHours, normalizeOpeningHours, HOURS_UNAVAILABLE } from "../../utils/accessPointView";

/* ── Ergebnisliste des Paketshop-Finders ─────────────────────────────────────
   Die autoritative Darstellung: hier stehen ALLE Treffer, auch die ohne
   Kartenposition. Ein Eintrag ist anklickbar, weil er den Kartenfokus setzt —
   NICHT weil er einen Shop verbindlich auswählt. Der Zustand heißt deshalb
   überall focusedKey / „hervorgehoben“, nirgends „ausgewählt“.

   Scanbarkeit: sichtbar sind Name, Adresse, Entfernung, Status und HEUTE. Die
   ganze Woche steht hinter „Öffnungszeiten“ — sieben Zeilen je Shop mal 20
   Shops wären keine Liste mehr, sondern ein Fahrplan. */

function WeekHours({ hoursOfOperation }) {
  const woche = weekOpeningHours(hoursOfOperation);
  if (woche.length) {
    return (
      <dl className="ap-week">
        {woche.map((tag) => (
          <div className="ap-week-row" key={tag.dayIndex}>
            <dt className="ap-week-day">{tag.label}</dt>
            <dd className={`ap-week-time${tag.closed ? " ap-week-time--closed" : ""}`}>
              {tag.closed ? "Geschlossen" : tag.hours}
              {tag.lunchBreak && <span className="ap-week-break"> (Pause {tag.lunchBreak})</span>}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  // Kein Wochenraster: Alt-Format als Text zeigen, sonst ehrlich sagen, dass
  // nichts vorliegt — statt sieben Zeilen „Geschlossen“ zu erfinden.
  const { text } = normalizeOpeningHours(hoursOfOperation);
  return <p className="ap-week-plain">{text || HOURS_UNAVAILABLE}</p>;
}

export function AccessPointList({
  shops, focusedKey, onFocus, expandedKey, onToggleExpand, listRef, countryCode,
}) {
  return (
    <ul className="ap-list" ref={listRef}>
      {shops.map((s) => {
        const hervorgehoben = s.key === focusedKey;
        const offen = s.key === expandedKey;
        // Ländercode nur zeigen, wenn er vom gesuchten Land abweicht.
        const showCc = s.countryCode && s.countryCode !== countryCode;
        return (
          <li
            className={`ap-list-item${hervorgehoben ? " ap-list-item--focused" : ""}`}
            key={s.key}
            data-ap-key={s.key}
          >
            {/* Der Klickbereich ist ein echter Button: Tastatur, Fokusring und
                Screenreader bekommen dieselbe Bedienung wie die Maus. Er setzt
                ausschließlich den Kartenfokus. */}
            <button
              type="button"
              className="ap-list-hit"
              aria-pressed={hervorgehoben}
              onClick={() => onFocus(s.key)}
            >
              <span className="ap-list-num" aria-hidden="true">{s.number}</span>
              <span className="ap-list-body">
                <span className="ap-list-head">
                  <span className="ap-list-name">{s.name || s.address}</span>
                  {s.distance != null && (
                    <span className="ap-list-dist">{formatDistance(s.distance, s.distanceCode)}</span>
                  )}
                </span>
                {s.name && s.address && <span className="ap-list-addr">{s.address}</span>}
                <span className="ap-list-meta">
                  <span
                    className={`ap-list-status ${s.status.badgeClass}`}
                    title={!s.status.known && s.status.raw ? `Serverwert: ${s.status.raw}` : undefined}
                  >
                    {s.status.label}
                  </span>
                  {s.hours && (
                    <span className="ap-list-hours">
                      <Icon n="clock" s={13} c="currentColor" />
                      {s.hours}
                    </span>
                  )}
                  {showCc && <span className="ap-list-cc">{s.countryCode}</span>}
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`ap-list-toggle${offen ? " ap-list-toggle--open" : ""}`}
              aria-expanded={offen}
              aria-controls={`ap-week-${s.key}`}
              onClick={() => onToggleExpand(s.key)}
            >
              Öffnungszeiten
              <Icon n="chevron" s={14} c="currentColor" />
            </button>

            {offen && (
              <div className="ap-list-details" id={`ap-week-${s.key}`}>
                <WeekHours hoursOfOperation={s.hoursOfOperation} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
