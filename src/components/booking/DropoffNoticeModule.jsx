import React from "react";
import { Icon } from "../ui/Icon";
import { publicCarrierDisplay } from "../../utils/carrierMap";
import { ParcelShopFinderTrigger } from "../offers/ParcelShopFinderTrigger";

// Step 1 — Paketshop-Karte bei Shopabgabe (serviceType === "dropoff").
//
// ZWEI Fälle, EIN Baustein:
//   • Reine Orientierung (Angebot NICHT buchbar / kein Abgabe-Zwang): wie bisher — Einleitung + Einstieg
//     in das Paketshop-Fenster, KEINE gespeicherte Auswahl.
//   • Verbindliche Auswahl (`required`, z. B. TG124 DPD PaketShop): der Kunde MUSS einen konkreten Shop
//     wählen; die Auswahl (`selectedShop`) wird gebunden und fließt in /book. Ohne Auswahl ist die Buchung
//     gesperrt (Gate + doBook-Guard in BookingPage). Die Bindung selbst hält der Finder-Kontext.
export function DropoffNoticeModule({ tariff, senderPrefill, required = false, selectedShop = null }) {
  const carrierName = publicCarrierDisplay(tariff).name;
  const hasPrefill = Boolean(
    (senderPrefill?.postCode && String(senderPrefill.postCode).trim()) ||
    (senderPrefill?.city && String(senderPrefill.city).trim())
  );
  const shopAdresse = selectedShop
    ? [[selectedShop.street, selectedShop.houseNumber].filter(Boolean).join(" "),
       [selectedShop.postcode, selectedShop.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : null;
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header">
        <Icon n="map" s={18} c="var(--ce-color-brand-ink)" />
        <h3>{required ? "Paketshop für die Abgabe wählen" : "Paketshop für die Abgabe finden"}</h3>
      </div>
      <div className="calc-panel-body">
        <div className="dropoff-intro">
          <p className="dropoff-intro-text">
            {required
              ? `Diese Sendung wird nicht abgeholt. Bitte wählen Sie den ${carrierName}-Paketshop, in dem Sie die Sendung abgeben — er wird für die Buchung benötigt.`
              : `Diese Sendung wird nicht abgeholt. Geben Sie sie nach der Buchung in einem passenden Paketshop von ${carrierName} ab.`}
          </p>
          {hasPrefill && (
            <p className="dropoff-intro-note">Die Suche ist anhand Ihrer Absenderadresse vorbelegt.</p>
          )}
        </div>
        {required && selectedShop && (
          <div className="dropoff-selected" role="status">
            <span className="dropoff-selected-label">Gewählter Paketshop:</span>{" "}
            <span className="dropoff-selected-name">{selectedShop.name}</span>
            {shopAdresse && <span className="dropoff-selected-addr"> — {shopAdresse}</span>}
          </div>
        )}
        {required && !selectedShop && (
          <p className="dropoff-required-hint" role="status">Noch kein Paketshop gewählt.</p>
        )}
        <ParcelShopFinderTrigger tariff={tariff} senderPrefill={senderPrefill} />
      </div>
    </div>
  );
}
