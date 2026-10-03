import React from "react";
import { PageHeader } from "../ui/PageHeader";

// Seitenkopf „Adressbuch" — seit Paket A, Phase 3 über das eine gemeinsame
// PageHeader-Muster. Der frühere eigene Aufbau (.abk-header/-top/-text/-cta)
// war strukturgleich, aber mit eigenen Klassennamen und eigener Titelstufe.
//
// BEWUSST OHNE Kennzahlen-Kacheln (Meine Adressen/Empfänger/Favoriten): die
// Listenresponse liefert nur { items, nextCursor } — KEIN total. Eine Zahl aus
// einer paginierten Teilmenge anzuzeigen würde als (falsche) Gesamtzahl
// missverstanden werden können.
//
// `showCreate` (Redesign 2026-10): ist der Bereich nachweislich leer, trägt der
// Leerzustand die eine Hauptaktion — der Kopf wiederholt sie dann nicht. Es
// bleibt derselbe Handler; nur die doppelte gleichwertige Schaltfläche entfällt.
export function AddressBookHeader({ onCreate, utility, showCreate = true }) {
  return (
    <PageHeader
      title="Adressbuch"
      subtitle="Verwalten Sie wiederkehrende Absender- und Empfängeradressen zentral."
      utility={utility}
      actions={showCreate ? (
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          Neue Adresse
        </button>
      ) : null}
    />
  );
}
