import React from "react";
import { StatusBadge } from "./StatusBadge";
import { CUSTOMER_STATUS_TEXT, customerShipmentStatus } from "../../utils/customerShipmentStatus.mjs";

/* Kundenstand einer Sendung (E4, 2026-11-06) — dieselbe Anzeige in „Meine Sendungen", den gefilterten
   Listen und „Letzte Sendungen". Reihenfolge: TEST (falls Testbuchung), der Stand, „Verzögert"; darunter
   bei Bedarf „Trackingstand nicht mehr aktuell". Die TEST-Marke ist gestrichelt umrandet — sie kennzeichnet
   etwas Simuliertes, keinen Zustand der Sendung — und nennt Screenreadern „Testsendung". */
export function ShipmentStatus({ shipment }) {
  const st = customerShipmentStatus(shipment);
  const testTitel = st.key === "delivered" ? CUSTOMER_STATUS_TEXT.testDeliveredTitle : CUSTOMER_STATUS_TEXT.testTitle;
  return (
    <span className="ce-sendungsstand">
      <span className="ce-sendungsstand-marken">
        {st.test && (
          <span className="ce-test-marke" title={testTitel}>
            <span aria-hidden="true">{CUSTOMER_STATUS_TEXT.test}</span>
            <span className="sr-only">{CUSTOMER_STATUS_TEXT.testSr}:</span>
          </span>
        )}
        {st.view
          ? <span className={`badge ${st.view.cls}`}>{st.view.label}</span>
          : <StatusBadge status={st.legacyStatus} />}
        {st.delayed && (
          <span className="badge badge-yellow ce-stand-verzoegert" title={CUSTOMER_STATUS_TEXT.delayedTitle}>
            {CUSTOMER_STATUS_TEXT.delayed}
          </span>
        )}
      </span>
      {st.stale && (
        <span className="ce-stand-hinweis" title={CUSTOMER_STATUS_TEXT.staleTitle}>{CUSTOMER_STATUS_TEXT.stale}</span>
      )}
    </span>
  );
}
