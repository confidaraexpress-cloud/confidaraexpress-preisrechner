/* ── Kundenstand einer Sendung (Betreiberentscheidung E4, 2026-11-06) ─────────
   „Meine Sendungen", „Letzte Sendungen" der Übersicht und jede gefilterte Liste zeigen
   denselben kundenverständlichen Stand — nicht mehr nur den technischen Buchungsstatus.

   Abgeleitet wird er ausschließlich im Backend (lib/shipmentKpis.js), aus denselben Regeln wie
   die vier Kennzahlen: Jede Zeile trägt `customer_status`, `is_delayed` und `tracking_stale`.
   Diese Datei rechnet nichts nach; sie übersetzt nur Serverwerte in Text und Ton. Prioritätsregel
   des Servers (oben gewinnt): Buchungsstatus wird geprüft → Storniert → Zugestellt → Zustellproblem
   → Unterwegs → Label bereit → Gebucht. Zwei Kennzeichen verdecken den Stand nie, sie stehen
   daneben: „Verzögert" und „Trackingstand nicht mehr aktuell". Unabhängig davon trägt jede
   Testbuchung (`is_test_booking`) die Marke TEST — eine simulierte Zustellung bleibt so als
   Testzustellung erkennbar, nie als echter Versand.

   Fehlt `customer_status` (älteres Backend) oder meldet der Server `other` (ein Altstatus ohne
   gebuchten Stand), zeigt die Oberfläche wie bisher den Buchungsstatus — es gibt keine zweite,
   clientseitige Ableitung. */

import { BOOKING_IN_REVIEW_TEXT } from "./customerBookingStatus.mjs";

export const CUSTOMER_STATUS_VIEW = Object.freeze({
  booking:     Object.freeze({ cls: "badge-yellow", label: BOOKING_IN_REVIEW_TEXT.badge }),
  cancelled:   Object.freeze({ cls: "badge--cancelled", label: "Storniert" }),
  delivered:   Object.freeze({ cls: "badge-green", label: "Zugestellt" }),
  exception:   Object.freeze({ cls: "badge-red", label: "Zustellproblem" }),
  in_transit:  Object.freeze({ cls: "badge-blue", label: "Unterwegs" }),
  label_ready: Object.freeze({ cls: "badge-blue", label: "Label bereit" }),
  booked:      Object.freeze({ cls: "badge-blue", label: "Gebucht" }),
});

export const CUSTOMER_STATUS_TEXT = Object.freeze({
  test: "TEST",
  testSr: "Testsendung",
  testTitle: "Testsendung – kein echter Versand",
  testDeliveredTitle: "Testsendung – die Zustellung wurde im Testbetrieb gemeldet",
  delayed: "Verzögert",
  delayedTitle: "Voraussichtlicher Liefertermin überschritten",
  stale: "Trackingstand nicht mehr aktuell",
  staleTitle: "Letzter bekannter Stand — er wird nicht mehr automatisch aktualisiert.",
});

/** Läuft die Sendung im Sinn der Karte „Aktive Sendungen"? Allein das Serverkennzeichen `is_active`
    (dieselbe Regel wie die Kennzahl) — ohne Kennzeichen (älteres Backend) gilt eine Zeile nicht als laufend. */
export function isActiveShipment(shipment) {
  return Boolean(shipment) && shipment.is_active === true;
}

/** Der Kundenstand einer Listenzeile: Stand (oder Altstatus), TEST, Verzögert, veraltet. */
export function customerShipmentStatus(shipment) {
  const s = shipment && typeof shipment === "object" ? shipment : {};
  const key = typeof s.customer_status === "string"
    && Object.prototype.hasOwnProperty.call(CUSTOMER_STATUS_VIEW, s.customer_status)
    ? s.customer_status : null;
  return {
    key,
    view: key ? CUSTOMER_STATUS_VIEW[key] : null,
    // Ohne Kundenstand: der Buchungsstatus wie vor E4 (StatusBadge).
    legacyStatus: key ? null : (typeof s.status === "string" ? s.status : null),
    test: s.is_test_booking === true,
    delayed: s.is_delayed === true,
    stale: s.tracking_stale === true,
  };
}
