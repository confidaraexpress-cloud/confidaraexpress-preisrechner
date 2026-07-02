// ── Sichtbarkeits-/Modul-Konfiguration der BookingPage (Phase 1) ─────────────
// Dünne, rein datengetriebene Schicht: entscheidet anhand BELEGTER Tarif-/
// Backend-Felder, welche Buchungsmodule sichtbar sind. Bewusst minimal — sie
// bildet exakt das bestehende Verhalten ab (keine geratenen Zoll-/Carrier-/
// EU-Regeln, keine Customs-/Referenz-/Labelformat-Logik, keine neuen Backend-
// Annahmen). Später erweiterbar, sobald das Backend die nötigen Flags liefert.
export function getBookingModules(tariff) {
  const t = tariff || {};
  const insuranceAvailable = t.insuranceAvailable === true || t.insuranceDetails?.isInsurable === true;
  return {
    // Zusatzversicherungs-Modul: nur wenn der Tarif Versicherung unterstützt
    // (entspricht 1:1 dem bisherigen `insurable`-Gate).
    insurance: insuranceAvailable,
    // Drucker-Hinweis: nur wenn der Tarif einen Ausdruck verlangt
    // (entspricht 1:1 dem bisherigen `tariff.printerRequired === true`).
    printerNote: t.printerRequired === true,
    // Bereits belegte Felder für spätere Module weitergereicht (aktuell nur
    // informativ — treiben noch keine zusätzliche Sichtbarkeit).
    serviceType: t.serviceType ?? null,
    trackingAvailable: t.trackingAvailable === true,
  };
}
