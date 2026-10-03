import React from "react";
import { CREATE_SHIPMENT_LABEL } from "../../utils/addressBookView.mjs";

// Sichtbare Zeilen-/Karten-Hauptaktion „Sendung erstellen" — geteilt zwischen
// Desktop-Zeile und Mobil-Karte, damit Text und Handler-Verdrahtung an EINER
// Stelle definiert sind (kein Drift, gleicher Accessible Name überall). Seit
// dem Redesign (2026-10) reiner Text, ohne Symbol.
//
// Sie ruft ausschließlich den bereits bestehenden onNewShipment-Handler auf
// (in AddressBookPage: resolveNewShipmentRole → mapAddressToShipmentFormPatch →
// onUseForNewShipment → Navigation „Neue Sendung" mit Prefill). KEINE zweite
// Prefill-/Navigationslogik, KEIN API-Request, KEINE Buchung. Der sichtbare Text
// ist der Accessible Name → per Tastatur erreichbar und mit Enter/Leertaste
// auslösbar (echtes <button>). Sekundärer Outline-Stil, bewusst ruhiger als die
// Primäraktion „Neue Adresse" im Seitenkopf.
export function AddressCreateShipmentButton({ address, onNewShipment, className = "" }) {
  return (
    <button
      type="button"
      className={`btn btn-outline btn-sm abk-create-shipment${className ? ` ${className}` : ""}`}
      onClick={() => onNewShipment?.(address)}
    >
      {CREATE_SHIPMENT_LABEL}
    </button>
  );
}
