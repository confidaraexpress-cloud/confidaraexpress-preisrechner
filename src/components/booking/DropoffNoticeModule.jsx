import React from "react";
import { Icon } from "../ui/Icon";
import { publicCarrierDisplay } from "../../utils/carrierMap";
import { ParcelShopFinderTrigger } from "../offers/ParcelShopFinderTrigger";

// Step 1 — Paketshop-Karte bei Shopabgabe (serviceType === "dropoff").
// EINE kompakte, konsolidierte Einleitung ersetzt die frühere dreistufige
// Erklärung (Titel + Absatz + Warn-Banner): der Titel steht in der Panel-
// Kopfzeile, darunter genau eine Beschreibung, plus — nur wenn tatsächlich
// vorbelegt — ein dezenter Absender-Hinweis. Den knappen Orientierungshinweis
// („reine Orientierung, keine verbindliche Auswahl") trägt jetzt das
// Paketshop-Fenster selbst. Aus dieser Karte führt nur noch derselbe kleine
// Einstieg wie von der Angebotskarte dorthin — ein zweites, andersartiges
// Suchformular an dieser Stelle wäre eine zweite Wahrheit gewesen. Es wird
// KEINE Shop-Auswahl gespeichert und nichts an /book weitergereicht — die
// Buchung bleibt generische Shopabgabe.
export function DropoffNoticeModule({ tariff, senderPrefill }) {
  const carrierName = publicCarrierDisplay(tariff).name;
  // Absender-Hinweis ausschließlich, wenn wirklich Vorbelegungsdaten vorliegen
  // (keine neuen Datenquellen — nur der bereits übergebene senderPrefill).
  const hasPrefill = Boolean(
    (senderPrefill?.postCode && String(senderPrefill.postCode).trim()) ||
    (senderPrefill?.city && String(senderPrefill.city).trim())
  );
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header">
        <Icon n="map" s={18} c="var(--ce-color-brand-ink)" />
        <h3>Paketshop für die Abgabe finden</h3>
      </div>
      <div className="calc-panel-body">
        <div className="dropoff-intro">
          <p className="dropoff-intro-text">
            Diese Sendung wird nicht abgeholt. Geben Sie sie nach der Buchung in
            einem passenden Paketshop von {carrierName} ab.
          </p>
          {hasPrefill && (
            <p className="dropoff-intro-note">
              Die Suche ist anhand Ihrer Absenderadresse vorbelegt.
            </p>
          )}
        </div>
        <ParcelShopFinderTrigger tariff={tariff} senderPrefill={senderPrefill} />
      </div>
    </div>
  );
}
