import React from "react";
import { Icon } from "../ui/Icon";

// Werkzeugleiste — reine Darstellung. Debounce/Abbruch laufender Requests
// passiert im Orchestrator (AddressBookPage); dieses Modul meldet nur rohe
// Eingaben. `searching` zeigt einen dezenten Status im Suchfeld (kein
// separates, störendes Ladeelement).
export function AddressBookToolbar({
  q, onQChange, searching,
  favoritesOnly, onToggleFavorites,
}) {
  return (
    <div className="abk-toolbar">
      <div className="abk-search">
        <Icon n="search" s={16} c="currentColor" />
        <input
          type="text"
          className="abk-search-input"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="Suche nach Label, Firma, Ort, PLZ …"
          aria-label="Adressen durchsuchen"
        />
        {searching && (
          <span className="abk-search-status" aria-hidden="true">
            <span className="spinner spinner-dark spinner-sm" />
          </span>
        )}
      </div>
      <div className="abk-toolbar-filters">
        <button
          type="button"
          className={`abk-filter-pill${favoritesOnly ? " abk-filter-pill--active" : ""}`}
          onClick={() => onToggleFavorites(!favoritesOnly)}
          aria-pressed={favoritesOnly}
        >
          <Icon n="star" s={14} c="currentColor" /> Favoriten
        </button>
      </div>
    </div>
  );
}
