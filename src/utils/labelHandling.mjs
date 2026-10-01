// Providerneutraler Kundenvertrag dafuer, wie das Versandlabel an das Paket gelangt.
// Kein Carrier-/Providerwissen im Frontend: die Bedeutung kommt ausschliesslich aus dem Serverfeld.
export const LABEL_HANDLING = Object.freeze({
  CARRIER_AT_PICKUP: "carrier_at_pickup",
});

export const LABEL_HANDLING_TEXT = Object.freeze({
  offer: "Wird bei der Abholung angebracht",
  booking: "Das Versandlabel wird bei der Abholung am Paket angebracht. Sie müssen kein Versandlabel ausdrucken.",
});

export function carrierAppliesLabel(tariff) {
  return tariff?.labelHandling === LABEL_HANDLING.CARRIER_AT_PICKUP;
}
