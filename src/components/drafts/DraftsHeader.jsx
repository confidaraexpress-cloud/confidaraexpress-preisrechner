import React from "react";
import { Icon } from "../ui/Icon";

// Seitenkopf „Entwürfe": Titel + Untertitel + primäre Aktion „Neue Sendung".
// KEINE Gesamtzahl-Kennzahl: GET /drafts liefert kein total, nur eine
// paginierte Teilmenge — eine Zahl aus items.length wäre irreführend.
export function DraftsHeader({ onNewShipment }) {
  return (
    <div className="dft-header-top">
      <div className="dft-header-text">
        <h1 className="dft-header-title">Entwürfe</h1>
        <p className="dft-header-sub">
          Gespeicherte Sendungen später weiterbearbeiten oder löschen.
        </p>
      </div>
      <div className="dft-header-cta">
        <button type="button" className="btn btn-primary" onClick={onNewShipment}>
          <Icon n="plus" s={16} /> Neue Sendung
        </button>
      </div>
    </div>
  );
}
