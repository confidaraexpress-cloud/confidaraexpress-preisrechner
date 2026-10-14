import React from "react";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";

// AddressAttribution — die Quellenangabe der Adressvorschläge.
//
// Die Vorschläge und Ortslisten stammen aus dem Adressdienst Geoapify, dessen Daten auf
// OpenStreetMap beruhen. Beide Angaben sind Pflicht: die OpenStreetMap-Namensnennung immer
// (ODbL), „Powered by Geoapify“ nach den Bedingungen des Dienstes. Sie steht deshalb an jeder
// Vorschlagsliste — unaufdringlich, aber sichtbar und mit Link.
//
// Bewusst eine eigene Komponente: das Vorschlagsfeld selbst kennt keinen Anbieter und keine
// fremde URL (addressValidationUx Test 18); die Quellenangabe ist Anzeige, kein Aufruf.
export function AddressAttribution() {
  return (
    <p className="addr-suggest-attr">
      <a href="https://www.openstreetmap.org/copyright" target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
        © OpenStreetMap-Mitwirkende
      </a>
      {" · "}
      <a href="https://www.geoapify.com/" target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
        Powered by Geoapify
      </a>
    </p>
  );
}
