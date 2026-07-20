import React from "react";
import { Icon } from "../ui/Icon";

// Seitenkopf „Adressbuch": Titel + Untertitel + primäre Aktion. BEWUSST OHNE
// Kennzahlen-Kacheln (Meine Adressen/Empfänger/Favoriten): die Listenresponse
// liefert nur { items, nextCursor } — KEIN total. Eine Zahl aus einer
// paginierten Teilmenge anzuzeigen würde als (falsche) Gesamtzahl missverstanden
// werden können ("Keine falschen Gesamtkapazitäten aus einer paginierten
// Teilmenge anzeigen" — bewusst nicht implementiert, siehe Abschlussbericht).
export function AddressBookHeader({ onCreate }) {
  return (
    <div className="abk-header">
      <div className="abk-header-top">
        <div className="abk-header-text">
          <h1 className="abk-header-title">Adressbuch</h1>
          <p className="abk-header-sub">
            Verwalten Sie wiederkehrende Absender- und Empfängeradressen zentral.
          </p>
        </div>
        <div className="abk-header-cta">
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            <Icon n="plus" s={16} /> Neue Adresse
          </button>
        </div>
      </div>
    </div>
  );
}
