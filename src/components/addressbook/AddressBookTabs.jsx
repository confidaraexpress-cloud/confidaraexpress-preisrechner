import React from "react";
import { TAB_SENDER, TAB_RECIPIENT } from "../../utils/addressBookView.mjs";

const TABS = [
  { id: TAB_SENDER, label: "Meine Adressen" },
  { id: TAB_RECIPIENT, label: "Empfänger" },
];

// Texttabs (Redesign 2026-10: gemeinsames .ce-tabs-Muster statt Pillfläche) —
// reine Darstellung, Rollen und Bedienung unverändert. Ein Tab-Wechsel triggert
// im Orchestrator einen Cursor-/Listen-Reset (siehe addressListStateKey).
export function AddressBookTabs({ tab, onChange }) {
  return (
    <div className="ce-tabs abk-tabs" role="tablist" aria-label="Adressbereich wählen">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={`ce-tab abk-tab${tab === t.id ? " abk-tab--active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
