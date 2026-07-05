import React from "react";
import { Icon } from "../ui/Icon";
import { resolveCarrierName } from "../../utils/carrierMap";
import { AccessPointFinder } from "../offers/AccessPointFinder";

// Step 1 — Hinweis bei Shopabgabe (serviceType === "dropoff"): macht unmissver-
// ständlich klar, dass das Paket nicht abgeholt wird, sondern in einem Paketshop
// des Versanddienstleisters abgegeben werden muss. Bindet den bereits
// vorhandenen, unveränderten AccessPointFinder zur Orientierungssuche ein.
// KEINE Buchung eines konkreten Shops — AccessPointFinder trägt seinen eigenen
// "nur Orientierung"-Hinweis bereits selbst und speichert keine Auswahl.
export function DropoffNoticeModule({ tariff, senderPrefill }) {
  const carrierName = resolveCarrierName(tariff?.carrier);
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="map" s={18} c="#1D4ED8" /><h3>Abgabe im Paketshop erforderlich</h3></div>
      <div className="calc-panel-body">
        <p className="text-sm text-muted mb-16">
          Dieser Tarif wird nicht bei Ihnen abgeholt. Sie geben das Paket eigenständig
          in einem Paketshop von {carrierName} ab.
        </p>
        <AccessPointFinder tariff={tariff} senderPrefill={senderPrefill} />
      </div>
    </div>
  );
}
