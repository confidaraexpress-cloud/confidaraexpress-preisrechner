import React from "react";
import { Icon } from "../ui/Icon";
import { PageHeader } from "../ui/PageHeader";

// Seitenkopf „Adressbuch" — seit Paket A, Phase 3 über das eine gemeinsame
// PageHeader-Muster. Der frühere eigene Aufbau (.abk-header/-top/-text/-cta)
// war strukturgleich, aber mit eigenen Klassennamen und eigener Titelstufe.
//
// BEWUSST OHNE Kennzahlen-Kacheln (Meine Adressen/Empfänger/Favoriten): die
// Listenresponse liefert nur { items, nextCursor } — KEIN total. Eine Zahl aus
// einer paginierten Teilmenge anzuzeigen würde als (falsche) Gesamtzahl
// missverstanden werden können.
export function AddressBookHeader({ onCreate, utility }) {
  return (
    <PageHeader
      title="Adressbuch"
      subtitle="Verwalten Sie wiederkehrende Absender- und Empfängeradressen zentral."
      utility={utility}
      actions={(
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          <Icon n="plus" s={16} /> Neue Adresse
        </button>
      )}
    />
  );
}
