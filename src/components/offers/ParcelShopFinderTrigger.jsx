import React, { useRef } from "react";
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

   Reine Textaktion (Redesign 2026-10): kein Standortsymbol. Eine externe
   Iconbibliothek wird hier NICHT eingeführt; das Projekt hat lucide-react
   bewusst entfernt und verbietet es über mehrere Tests.

   Verbindliche Auswahl (TG124, 2026-10-24): Ist für das Angebot ein Shop gewählt,
   sagt der Einstieg das. Auf der Angebotskarte (`showChosen`) steht der Name mit
   „ändern“ — sonst bliebe nach dem Schließen des Fensters offen, ob die Wahl
   gilt. Auf der Buchungsseite steht der Shop schon darüber; dort heißt der
   Einstieg „Paketshop ändern“. Bei der Orientierung gibt es keine Wahl. */

export function ParcelShopFinderTrigger({ tariff, senderPrefill, className = "", showChosen = false }) {
  const finder = useParcelShopFinder();
  const knopfRef = useRef(null);

  // Ohne Provider oder ohne Paketshopfähigkeit: gar nichts rendern.
  if (!finder || !offerSupportsAccessPointSearch(tariff)) return null;

  // Sprechender Name für Screenreader: „Paketshops für UPS Standardversand
  // suchen“ statt viermal identisch „Paketshops suchen“ auf einer Seite.
  const carrier = publicCarrierDisplay(tariff).name;
  const service = publicServiceName(tariff);
  const gewaehlt = typeof finder.selectedShopFor === "function" ? finder.selectedShopFor(tariff) : null;
  const angebot = [carrier, service].filter(Boolean).join(" ");
  const shopText = gewaehlt
    ? [gewaehlt.name, [gewaehlt.street, gewaehlt.houseNumber].filter(Boolean).join(" "),
       [gewaehlt.postcode, gewaehlt.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  const beschriftung = gewaehlt
    ? `Gewählter Paketshop${angebot ? ` für ${angebot}` : ""}: ${shopText} – ändern`
    : ["Paketshops für", carrier, service, "suchen"].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      ref={knopfRef}
      className={`ps-trigger${gewaehlt ? " ps-trigger--chosen" : ""}${className ? ` ${className}` : ""}`}
      aria-label={beschriftung}
      onClick={(e) => {
        // Die Angebotskarte selbst ist klickbar (Angebot auswählen) — dieser
        // Klick darf nicht zusätzlich das Angebot auswählen.
        e.stopPropagation();
        finder.openFinder({ tariff, senderPrefill, triggerEl: knopfRef.current });
      }}
    >
      {!gewaehlt && <span>Paketshops suchen</span>}
      {gewaehlt && !showChosen && <span>Paketshop ändern</span>}
      {gewaehlt && showChosen && (
        <>
          <span className="ps-trigger-chosen" title={shopText}>
            <span className="ps-trigger-chosen-label">Gewählt:</span> {gewaehlt.name}
          </span>
          <span className="ps-trigger-change">ändern</span>
        </>
      )}
    </button>
  );
}
