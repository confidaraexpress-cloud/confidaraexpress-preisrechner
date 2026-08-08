import React, { useRef } from "react";
import { Icon } from "../ui/Icon";
import { useParcelShopFinder } from "../../context/ParcelShopFinderContext";
import { offerSupportsAccessPointSearch, publicCarrierDisplay, publicServiceName } from "../../utils/carrierMap";

/* ── Einstieg in den Paketshop-Finder, direkt am Angebot ─────────────────────
   Ersetzt die frühere große Suchsektion („PAKETSHOP FINDEN“ samt PLZ, Ort,
   Straße, Umkreis, Öffnungszeiten und Suchknopf), die auf der Angebotsseite
   stand. Der Kunde hat seine Adresse längst erfasst — sie hier ein zweites Mal
   abzufragen war Arbeit ohne Gegenwert. Alle Suchfelder leben jetzt im Fenster,
   wo sie auch hingehören: dort stehen die Ergebnisse daneben.

   Bewusst sekundär: ein kleiner Textknopf, keine zweite Handlungsaufforderung.
   Preis und „Angebot auswählen“ bleiben die dominanten Elemente der Karte.

   Sichtbar NUR, wenn das Angebot die Suche tatsächlich anbieten kann
   (offerSupportsAccessPointSearch: serviceType „dropoff“ + auflösbarer
   Carrier-Suchcode). Kein deaktivierter Knopf, kein „nicht verfügbar“ — ein
   Einstieg, der nichts öffnet, ist schlechter als gar keiner.

   Das Icon kommt aus dem projekteigenen Iconsystem (components/ui/Icon.jsx).
   Eine externe Iconbibliothek wird hier NICHT eingeführt; das Projekt hat
   lucide-react bewusst entfernt und verbietet es über mehrere Tests. */

export function ParcelShopFinderTrigger({ tariff, senderPrefill, className = "" }) {
  const finder = useParcelShopFinder();
  const knopfRef = useRef(null);

  // Ohne Provider oder ohne Paketshopfähigkeit: gar nichts rendern.
  if (!finder || !offerSupportsAccessPointSearch(tariff)) return null;

  // Sprechender Name für Screenreader: „Paketshops für UPS Standardversand
  // suchen“ statt viermal identisch „Paketshops suchen“ auf einer Seite.
  const carrier = publicCarrierDisplay(tariff).name;
  const service = publicServiceName(tariff);
  const beschriftung = ["Paketshops für", carrier, service, "suchen"].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      ref={knopfRef}
      className={`ps-trigger${className ? ` ${className}` : ""}`}
      aria-label={beschriftung}
      onClick={(e) => {
        // Die Angebotskarte selbst ist klickbar (Angebot auswählen) — dieser
        // Klick darf nicht zusätzlich das Angebot auswählen.
        e.stopPropagation();
        finder.openFinder({ tariff, senderPrefill, triggerEl: knopfRef.current });
      }}
    >
      <Icon n="mapPin" s={14} c="currentColor" />
      <span>Paketshops suchen</span>
    </button>
  );
}
