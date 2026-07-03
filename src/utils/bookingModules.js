// ── Sichtbarkeits-/Modul-Konfiguration der BookingPage ───────────────────────
// Dünne, rein datengetriebene Schicht: entscheidet anhand BELEGTER Backend-
// Felder, welche Buchungsmodule sichtbar sind. `tariff` = pro-Tarif-Felder,
// `route` = routenbezogene Top-Level-Felder aus calculate-price (z. B.
// customsRequired). Keine geratenen EU-/Carrier-Regeln — customsRequired
// entscheidet ausschließlich das Backend.
export function getBookingModules(tariff, route) {
  const t = tariff || {};
  const r = route || {};
  const insuranceAvailable = t.insuranceAvailable === true || t.insuranceDetails?.isInsurable === true;
  return {
    // Zusatzversicherungs-Modul: nur wenn der Tarif Versicherung unterstützt
    // (entspricht 1:1 dem bisherigen `insurable`-Gate).
    insurance: insuranceAvailable,
    // Zollangaben-Modul: nur wenn das Backend die Route als zollpflichtig
    // markiert (customsRequired === true) — sonst nie (EU/DE unverändert).
    customs: r.customsRequired === true,
    // Drucker-Hinweis: nur wenn der Tarif einen Ausdruck verlangt
    // (entspricht 1:1 dem bisherigen `tariff.printerRequired === true`).
    printerNote: t.printerRequired === true,
    // Bereits belegte Felder für spätere Module weitergereicht (aktuell nur
    // informativ — treiben noch keine zusätzliche Sichtbarkeit).
    serviceType: t.serviceType ?? null,
    trackingAvailable: t.trackingAvailable === true,
  };
}
