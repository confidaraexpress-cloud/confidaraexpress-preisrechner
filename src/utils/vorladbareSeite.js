import React from "react";

/* Eine Seite, die wie React.lazy als eigener Codeabschnitt lädt — aber vorgeladen werden kann. Ist das Modul schon
   da, rendert sie es SOFORT, ohne Suspense-Fläche (React.lazy legte beim ersten Rendern immer eine Ladefläche
   dazwischen, auch bei bereits geladenem Modul). So ersetzt die Anmeldeseite das statische Seitengerüst ohne
   Zwischenbild (main.jsx lädt sie vor dem ersten Rendern, AuthContext vor jedem Wechsel zur Anmeldung).
   Lädt das Modul nicht, verhält sich die Seite wie React.lazy: die Fehlergrenze des Bereichs übernimmt. */
export function vorladbareSeite(laden) {
  let modul = null;
  let laufend = null;
  const vorladen = () => {
    if (!laufend) {
      laufend = laden().then(
        (m) => { modul = m; return m; },
        (fehler) => { laufend = null; throw fehler; },
      );
    }
    return laufend;
  };
  const Faul = React.lazy(vorladen);
  function Seite(props) {
    const Komponente = modul && modul.default;
    return Komponente ? React.createElement(Komponente, props) : React.createElement(Faul, props);
  }
  Seite.vorladen = vorladen;
  return Seite;
}
