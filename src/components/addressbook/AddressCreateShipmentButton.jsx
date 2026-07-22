import React from "react";
import { Icon } from "../ui/Icon";
import { CREATE_SHIPMENT_LABEL, CREATE_SHIPMENT_ICON } from "../../utils/addressBookView.mjs";

// Sichtbare Zeilen-/Karten-Hauptaktion „Sendung erstellen" — geteilt zwischen
// Desktop-Zeile und Mobil-Karte, damit Text, Icon und Handler-Verdrahtung an
// EINER Stelle definiert sind (kein Drift, gleicher Accessible Name überall).
//
// Sie ruft ausschließlich den bereits bestehenden onNewShipment-Handler auf
// (in AddressBookPage: resolveNewShipmentRole → mapAddressToShipmentFormPatch →
// onUseForNewShipment → Navigation „Neue Sendung" mit Prefill). KEINE zweite
// Prefill-/Navigationslogik, KEIN API-Request, KEINE Buchung. Der sichtbare Text
// ist der Accessible Name (das Icon ist nur schmückend) → per Tastatur erreichbar
// und mit Enter/Leertaste auslösbar (echtes <button>). Sekundärer Outline-Stil,
// bewusst ruhiger als der globale Primär-Button „+ Neue Adresse".
export function AddressCreateShipmentButton({ address, onNewShipment, className = "" }) {
  return (
    <button
      type="button"
      className={`btn btn-outline btn-sm abk-create-shipment${className ? ` ${className}` : ""}`}
      onClick={() => onNewShipment?.(address)}
    >
      <Icon n={CREATE_SHIPMENT_ICON} s={15} /> {CREATE_SHIPMENT_LABEL}
    </button>
  );
}
