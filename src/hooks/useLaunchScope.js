// hooks/useLaunchScope.js — die Länderliste eines Auswahlfelds.
//
// Ein Aufruf je Tab (der Cache liegt in `api/launchScopeApi.js`), ein Ergebnis für alle
// Formulare. Der Hook entscheidet nichts: er reicht die Serverliste an `scopedCountries`
// weiter, und die volle Liste bleibt die Grundlage — es gibt keine zweite Aufzählung im Client.
//
// Solange der Scope nicht bekannt ist (erster Abruf unterwegs ODER Endpunkt ausgefallen),
// liefert er die volle Liste. Die Begründung steht bei `scopedCountries`: eine leere Auswahl
// wäre fail-closed und machte den Preisrechner bei einer kurzen Störung unbenutzbar, während
// die volle Liste nur degradiert ist — der Server lehnt ein nicht angebotenes Ziel ohnehin ab.
import { useEffect, useState } from "react";
import { countries } from "../utils/countries";
import { fetchLaunchScope } from "../api/launchScopeApi";
import { scopedCountries, scopedOriginCountries } from "../utils/launchScopeView.mjs";

export function useLaunchScope() {
  const [scope, setScope] = useState(null);

  useEffect(() => {
    let aktiv = true;
    // Kein AbortController: der Abruf ist geteilt (ein Promise für alle Verbraucher), ein
    // Abbruch durch das zuerst unmountende Formular würde die anderen mit abräumen. Stattdessen
    // wird nur das Setzen des Zustands unterbunden.
    fetchLaunchScope().then((s) => { if (aktiv) setScope(s); });
    return () => { aktiv = false; };
  }, []);

  return {
    // ZIELländer. Bleibt unter dem alten Namen erhalten: er speist die Länderfelder, die
    // keine Versandherkunft sind (Adressbuch, Profil, Registrierung, Auftragsempfänger) und
    // sich durch diese Trennung nicht ändern.
    countries: scopedCountries(countries, scope),
    // Derselbe Wert unter dem sprechenden Namen — für neue Aufrufstellen.
    destinationCountries: scopedCountries(countries, scope),
    // URSPRUNGSländer: ausschließlich für das ABSENDERfeld eines Versandvorgangs.
    originCountries: scopedOriginCountries(countries, scope),
    // `true`, sobald der Server geantwortet hat und die Liste tatsächlich eingeschränkt ist.
    // Nur für Hinweistexte gedacht — nie als Bedingung für die Bedienbarkeit eines Feldes.
    scopeKnown: scope !== null,
  };
}
