import React from "react";
import { TAB_SENDER, TAB_RECIPIENT } from "../../utils/addressBookView.mjs";

const TABS = [
  { id: TAB_SENDER, label: "Meine Adressen" },
  { id: TAB_RECIPIENT, label: "Empfänger" },
];

// Segmentierte Navigation — reine Darstellung, Tab-Wechsel triggert im
// Orchestrator einen Cursor-/Listen-Reset (siehe addressListStateKey).
export function AddressBookTabs({ tab, onChange }) {
  return (
    <div className="abk-tabs" role="tablist" aria-label="Adressbereich wählen">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={`abk-tab${tab === t.id ? " abk-tab--active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
