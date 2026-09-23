/* ── Angebote, die die Oberfläche NICHT zeigt ────────────────────────────────
   Die EINE Stelle, an der eine Karte aus der Kundenansicht verschwindet.

   ── Was hier steht und warum das eine Ausnahme ist ──────────────────────────
   Normalerweise entscheidet das Backend, welche Angebote es gibt: die
   Servicematrix ist die einzige Quelle, die Oberfläche rendert, was ankommt.
   Diese Datei ist die ausdrückliche, eng begrenzte Abweichung davon — eine
   BETREIBERANWEISUNG, die sofort wirken soll, ohne auf ein Backend-Deployment
   zu warten.

   Sie ist damit bewusst eine zweite Stelle, an der ein Produkt verschwindet.
   Das ist der Preis der Sofortwirkung, und er ist hier benannt statt versteckt:

     • Solange die Serverseite dieselbe Karte weiter ausliefert, ist sie im
       Netzwerk weiterhin sichtbar — verborgen wird sie nur in der Darstellung.
     • Entfällt die Karte eines Tages serverseitig, wird diese Datei wirkungslos
       und gehört gelöscht. Sie ist NICHT die dauerhafte Heimat einer
       Produktentscheidung.

   ── Wie eng die Regel gefasst ist ───────────────────────────────────────────
   Alle DREI Merkmale müssen zugleich zutreffen. Jedes einzelne für sich lässt
   die Karte stehen:

     publicCarrierId     === "ups"
     publicServiceName   === "Expressversand"
     unavailableReason   === "quote_only"

   Damit bleibt insbesondere unberührt:
     • jedes BUCHBARE Angebot (es trägt `unavailableReason: null`),
     • jedes Angebot, das nur auf eine Preisangabe wartet
       (`price_inputs_required`) oder an einem Abholtag scheitert
       (`date_unavailable`, `same_day_*`),
     • jeder andere Carrier und jeder andere Produktname.

   Vergleiche sind strikt (`===`) und auf den exakten Wert. Kein `includes`,
   kein Kleinschreibungsvergleich, kein regulärer Ausdruck: eine unscharfe
   Regel würde hier Karten verschlucken, die niemand gemeint hat — und
   ausgerechnet dieser Fehler fiele nicht auf, weil das Ergebnis eine FEHLENDE
   Karte ist.

   Keine ServiceID steht in dieser Datei. Die Oberfläche kennt keine.  */

export const HIDDEN_PUBLIC_CARRIER_ID = "ups";
export const HIDDEN_PUBLIC_SERVICE_NAME = "Expressversand";
export const HIDDEN_UNAVAILABLE_REASON = "quote_only";

/**
 * Wird dieses Angebot in der Kundenansicht ausgeblendet?
 *
 * Rein und ohne Seiteneffekt. Ein fehlendes oder unbrauchbares Angebot ist
 * ausdrücklich NICHT ausgeblendet — Ausblenden ist die Ausnahme und braucht
 * drei erfüllte Bedingungen, nicht das Fehlen von Daten.
 *
 * @param {object|null|undefined} tariff
 * @returns {boolean}
 */
export function offerHidden(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : null;
  if (!t) return false;
  return t.publicCarrierId === HIDDEN_PUBLIC_CARRIER_ID
    && t.publicServiceName === HIDDEN_PUBLIC_SERVICE_NAME
    && t.unavailableReason === HIDDEN_UNAVAILABLE_REASON;
}

/**
 * Die Angebotsliste ohne die ausgeblendeten Karten.
 *
 * Wird direkt auf die Antwort angewandt — VOR Sortierung, Filtern, Zählern und
 * Auswahl. Sonst entstünde eine Liste, in der die Karte zwar nicht zu sehen
 * ist, aber weiterhin mitgezählt, mitsortiert oder gar ausgewählt werden kann.
 *
 * Gibt IMMER ein Array zurück; eine unbrauchbare Eingabe ergibt `[]`, wie der
 * bisherige `d.tariffs || []`-Rückfall an den Aufrufstellen.
 *
 * @param {unknown} tariffs
 * @returns {Array<object>}
 */
export function visibleOffers(tariffs) {
  if (!Array.isArray(tariffs)) return [];
  return tariffs.filter((t) => !offerHidden(t));
}
