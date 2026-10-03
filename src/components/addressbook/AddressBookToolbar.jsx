import React from "react";

// Werkzeugleiste — reine Darstellung. Debounce/Abbruch laufender Requests
// passiert im Orchestrator (AddressBookPage); dieses Modul meldet nur rohe
// Eingaben. `searching` zeigt einen dezenten Status im Suchfeld (kein
// separates, störendes Ladeelement).
//
// Redesign 2026-10: die Suche trägt ein SICHTBARES Label statt eines
// Lupensymbols, der Favoritenfilter ist ein Textschalter (aria-pressed) statt
// eines Sterns; die Werkzeugleiste steht ohne eigene Außenkarte über der Liste.
export function AddressBookToolbar({
  q, onQChange, searching,
  favoritesOnly, onToggleFavorites,
}) {
  return (
    <div className="abk-toolbar">
      <div className="abk-search">
        <label className="field-label abk-search-label" htmlFor="abk-search-input">Adressen durchsuchen</label>
        <div className="abk-search-field">
          <input
            id="abk-search-input"
            type="text"
            className="abk-search-input"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Label, Firma, Ort oder PLZ"
          />
          {searching && (
            <span className="abk-search-status" aria-hidden="true">
              <span className="spinner spinner-dark spinner-sm" />
            </span>
          )}
        </div>
      </div>
      <div className="abk-toolbar-filters">
        <button
          type="button"
          className={`abk-filter-pill${favoritesOnly ? " abk-filter-pill--active" : ""}`}
          onClick={() => onToggleFavorites(!favoritesOnly)}
          aria-pressed={favoritesOnly}
        >
          Nur Favoriten
        </button>
      </div>
    </div>
  );
}
