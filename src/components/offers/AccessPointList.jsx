import React from "react";
import { formatDistance, weekOpeningHours, normalizeOpeningHours, HOURS_UNAVAILABLE } from "../../utils/accessPointView";

/* ── Ergebnisliste des Paketshop-Finders ─────────────────────────────────────
   Die autoritative Darstellung: hier stehen ALLE Treffer, auch die ohne
   Kartenposition. Mit Karte ist ein Eintrag anklickbar, weil er den
   Kartenfokus setzt — NICHT weil er einen Shop verbindlich auswählt. Der
   Zustand heißt deshalb focusedKey / „hervorgehoben“.

   Verbindliche Auswahl (TG124, 2026-10-24): je Zeile „Diesen Paketshop wählen“;
   der zugängliche Name nennt Shop und Anschrift (zehn gleich lautende Knöpfe
   wären für einen Screenreader nicht zu unterscheiden). Die gewählte Zeile ist
   sichtbar „Ausgewählt“ und trägt eine eigene Kennzeichnung — sie ist etwas
   anderes als die Kartenhervorhebung. Ohne Karte gibt es keinen Fokusknopf.

   Scanbarkeit: sichtbar sind Name, Adresse, Entfernung, Status und HEUTE. Die
   ganze Woche steht hinter „Öffnungszeiten“ — sieben Zeilen je Shop mal 20
   Shops wären keine Liste mehr, sondern ein Fahrplan. Liefert die Quelle weder
   Status noch Zeiten (`showStatusAndHours = false`), entfallen beide statt
   zehnmal „nicht verfügbar“ zu zeigen. */

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

function Zeileninhalt({ s, showStatusAndHours, showCc }) {
  return (
    <>
      <span className="ap-list-num" aria-hidden="true">{s.number}</span>
      <span className="ap-list-body">
        <span className="ap-list-head">
          <span className="ap-list-name">{s.name || s.address}</span>
          {s.distance != null && (
            <span className="ap-list-dist">{formatDistance(s.distance, s.distanceCode)}</span>
          )}
        </span>
        {s.name && s.address && <span className="ap-list-addr">{s.address}</span>}
        {(showStatusAndHours && s.status) || showCc ? (
          <span className="ap-list-meta">
            {showStatusAndHours && s.status && (
              <span
                className={`ap-list-status ${s.status.badgeClass}`}
                title={!s.status.known && s.status.raw ? `Serverwert: ${s.status.raw}` : undefined}
              >
                {s.status.label}
              </span>
            )}
            {showStatusAndHours && s.hours && (
              <span className="ap-list-hours">{s.hours}</span>
            )}
            {showCc && <span className="ap-list-cc">{s.countryCode}</span>}
          </span>
        ) : null}
      </span>
    </>
  );
}

export function AccessPointList({
  shops, focusedKey, onFocus, expandedKey, onToggleExpand, listRef, countryCode,
  // TG124: verbindliche Auswahl (nur bei der Portalsuche gesetzt). onSelect(dropoffShop) | null;
  // selectedShopKey = pickupLocationCode des aktuell gebundenen Shops.
  onSelect, selectedShopKey,
  // Liefert die Quelle Status bzw. Öffnungszeiten? Gibt es eine Karte, auf die der Zeilenklick zielt?
  showStatusAndHours = true, mapFocusable = true,
}) {
  return (
    <ul className="ap-list" ref={listRef}>
      {shops.map((s) => {
        const hervorgehoben = mapFocusable && s.key === focusedKey;
        const offen = s.key === expandedKey;
        // Ländercode nur zeigen, wenn er vom gesuchten Land abweicht.
        const showCc = Boolean(s.countryCode && s.countryCode !== countryCode);
        const waehlbar = typeof onSelect === "function" && Boolean(s.dropoffShop);
        const gewaehlt = waehlbar && Boolean(selectedShopKey) && s.dropoffShop.pickupLocationCode === selectedShopKey;
        const beschreibung = [s.name, s.address].filter(Boolean).join(", ");
        return (
          <li
            className={`ap-list-item${hervorgehoben ? " ap-list-item--focused" : ""}${gewaehlt ? " ap-list-item--chosen" : ""}`}
            key={s.key}
            data-ap-key={s.key}
          >
            {/* Mit Karte ist der Klickbereich ein echter Button: Tastatur, Fokusring
                und Screenreader bekommen dieselbe Bedienung wie die Maus. Er setzt
                ausschließlich den Kartenfokus. Ohne Karte gibt es nichts zu
                fokussieren — dann ist die Zeile reiner Inhalt. */}
            {mapFocusable ? (
              <button
                type="button"
                className="ap-list-hit"
                aria-pressed={hervorgehoben}
                onClick={() => onFocus(s.key)}
              >
                <Zeileninhalt s={s} showStatusAndHours={showStatusAndHours} showCc={showCc} />
              </button>
            ) : (
              <div className="ap-list-hit ap-list-hit--static">
                <Zeileninhalt s={s} showStatusAndHours={showStatusAndHours} showCc={showCc} />
              </div>
            )}

            {showStatusAndHours && (
              <button
                type="button"
                className={`ap-list-toggle${offen ? " ap-list-toggle--open" : ""}`}
                aria-expanded={offen}
                aria-controls={`ap-week-${s.key}`}
                onClick={() => onToggleExpand(s.key)}
              >
                Öffnungszeiten
                {/* Klappmarke rein per CSS — kein Icon (Redesign 2026-10). */}
                <span className="ap-list-toggle-caret" aria-hidden="true" />
              </button>
            )}

            {showStatusAndHours && offen && (
              <div className="ap-list-details" id={`ap-week-${s.key}`}>
                <WeekHours hoursOfOperation={s.hoursOfOperation} />
              </div>
            )}

            {/* TG124: verbindliche Shopauswahl (nur bei der Portalsuche). Anders als der Kartenfokus
                oben fließt DIESE Wahl in die Buchung. Sichtbar kurz, zugänglich mit Shop und Anschrift. */}
            {waehlbar && (
              <button
                type="button"
                className={`ap-list-select${gewaehlt ? " ap-list-select--chosen" : ""}`}
                aria-pressed={gewaehlt}
                onClick={() => onSelect(s.dropoffShop)}
              >
                {gewaehlt ? "Ausgewählt" : "Diesen Paketshop wählen"}
                {beschreibung && <span className="sr-only"> – {beschreibung}</span>}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
