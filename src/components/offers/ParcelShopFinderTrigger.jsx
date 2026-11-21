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

  // Sprechender Name für Screenreader: „Paketshops suchen für UPS Standardversand“
  // statt viermal identisch „Paketshops suchen“ auf einer Seite.
  // Restprüfung 2026-11-21 (axe `label-content-name-mismatch`, WCAG 2.5.3 „Label in Name“): bis hierher ersetzte ein
  // `aria-label` („Paketshops für UPS … suchen“) den sichtbaren Text, ohne ihn zusammenhängend zu enthalten — wer per
  // Sprachsteuerung „Paketshops suchen“ sagt, traf den Knopf nicht. Jetzt gibt es kein `aria-label` mehr: der Name
  // entsteht aus dem Inhalt, beginnt mit dem sichtbaren Text und trägt Angebot und Shopadresse als nur vorgelesenen
  // Zusatz (`.sr-only`) dahinter.
  const carrier = publicCarrierDisplay(tariff).name;
  const service = publicServiceName(tariff);
  const gewaehlt = typeof finder.selectedShopFor === "function" ? finder.selectedShopFor(tariff) : null;
  const angebot = [carrier, service].filter(Boolean).join(" ");
  const adresse = gewaehlt
    ? [[gewaehlt.street, gewaehlt.houseNumber].filter(Boolean).join(" "),
       [gewaehlt.postcode, gewaehlt.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  const shopText = gewaehlt ? [gewaehlt.name, adresse].filter(Boolean).join(", ") : "";
  const nurVorgelesen = (text) => (text ? <span className="sr-only">{text}</span> : null);

  return (
    <button
      type="button"
      ref={knopfRef}
      className={`ps-trigger${gewaehlt ? " ps-trigger--chosen" : ""}${className ? ` ${className}` : ""}`}
      onClick={(e) => {
        // Die Angebotskarte selbst ist klickbar (Angebot auswählen) — dieser
        // Klick darf nicht zusätzlich das Angebot auswählen.
        e.stopPropagation();
        finder.openFinder({ tariff, senderPrefill, triggerEl: knopfRef.current });
      }}
    >
      {/* Der vorgelesene Zusatz ist absolut positioniert und zählt damit als Block: die Namensberechnung setzt davor
          und danach ein Leerzeichen. Er beginnt deshalb nie mit einem Satzzeichen, das am Wort davor hängen müsste
          (sonst „GmbH , Am …“) — Klammer, „für“ und Gedankenstrich lesen sich mit Leerzeichen richtig. */}
      {!gewaehlt && <span>Paketshops suchen</span>}
      {!gewaehlt && nurVorgelesen(angebot ? `für ${angebot}` : "")}
      {gewaehlt && !showChosen && <span>Paketshop ändern</span>}
      {gewaehlt && !showChosen && nurVorgelesen(`– gewählt: ${shopText}${angebot ? ` (${angebot})` : ""}`)}
      {gewaehlt && showChosen && (
        <>
          <span className="ps-trigger-chosen" title={shopText}>
            <span className="ps-trigger-chosen-label">Gewählt:</span> {gewaehlt.name}
          </span>
          {nurVorgelesen(`${adresse ? `(${adresse})` : ""}${angebot ? ` für ${angebot}` : ""} –`)}
          <span className="ps-trigger-change">ändern</span>
        </>
      )}
    </button>
  );
}
