import React from "react";
import { CREATE_SHIPMENT_LABEL, addressActionTarget } from "../../utils/addressBookView.mjs";

// Sichtbare Zeilen-/Karten-Hauptaktion „Sendung erstellen" — geteilt zwischen
// Desktop-Zeile und Mobil-Karte, damit Text und Handler-Verdrahtung an EINER
// Stelle definiert sind (kein Drift). Seit dem Redesign (2026-10) reiner Text,
// ohne Symbol.
//
// Sie ruft ausschließlich den bereits bestehenden onNewShipment-Handler auf
// (in AddressBookPage: resolveNewShipmentRole → mapAddressToShipmentFormPatch →
// onUseForNewShipment → Navigation „Neue Sendung" mit Prefill). KEINE zweite
// Prefill-/Navigationslogik, KEIN API-Request, KEINE Buchung. Echtes <button>
// (Enter/Leertaste). Sekundärer Outline-Stil, bewusst ruhiger als die
// Primäraktion „Neue Adresse" im Seitenkopf.
//
// Zugänglicher Name (Audit P7): sichtbar „Sendung erstellen“, vorgelesen „Sendung erstellen für
// <Adresse>“ — vorher trug jede Zeile denselben Namen. Der sichtbare Text steht vorn (WCAG 2.5.3).
export function AddressCreateShipmentButton({ address, onNewShipment, className = "" }) {
  return (
    <button
      type="button"
      className={`btn btn-outline btn-sm abk-create-shipment${className ? ` ${className}` : ""}`}
      onClick={() => onNewShipment?.(address)}
    >
      {CREATE_SHIPMENT_LABEL}
      <span className="sr-only"> für {addressActionTarget(address)}</span>
    </button>
  );
}
