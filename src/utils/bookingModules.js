// ── Sichtbarkeits-/Modul-Konfiguration der BookingPage ───────────────────────
// Dünne, rein datengetriebene Schicht: entscheidet anhand BELEGTER Backend-
// Felder, welche Buchungsmodule sichtbar sind. `tariff` = pro-Tarif-Felder,
// `route` = routenbezogene Top-Level-Felder aus calculate-price (z. B.
// customsRequired). Keine geratenen EU-/Carrier-Regeln — customsRequired
// entscheidet ausschließlich das Backend.
import { CUSTOMS_UI_ENABLED } from "../config/launchMode.mjs";
export function getBookingModules(tariff, route) {
  const t = tariff || {};
  const r = route || {};
  const insuranceAvailable = t.insuranceAvailable === true || t.insuranceDetails?.isInsurable === true;
  return {
    // Zusatzversicherungs-Modul: nur wenn der Tarif Versicherung unterstützt
    // (entspricht 1:1 dem bisherigen `insurable`-Gate).
    insurance: insuranceAvailable,
    // Zollangaben-Modul: im Launch-Modus AUS.
    //
    // ConfidaraExpress bietet vorerst keinen Drittlandversand an; eine zollpflichtige Route
    // ist gar nicht mehr berechenbar (der Server lehnt sie mit 422 ROUTE_NOT_SUPPORTED ab,
    // bevor ein Draft entsteht). `customsRequired` kann aus einer laufenden Sitzung oder
    // einem zum Deploymentzeitpunkt offenen Tab trotzdem noch `true` mitbringen — deshalb
    // steht die Abschaltung hier ausdrücklich und nicht als Nebenwirkung des Serverwerts.
    //
    // Das ist eine Sichtbarkeitsentscheidung, keine Sicherheitsmaßnahme: die Durchsetzung
    // liegt serverseitig (lib/launchRoutePolicy.js + lib/customsMode.js). Wer
    // CUSTOMS_UI_ENABLED auf true dreht, bekommt die Formularfelder zurück — aber keine
    // buchbare Drittlandsendung.
    //
    // Der Backendbefund bleibt bewusst in der Bedingung stehen: er ist unverändert die
    // einzige fachliche Zollentscheidung, und für Customs V2 fällt hier nur die Konstante
    // weg. Nichts wurde gelöscht — CustomsModule, CustomsEoriSection,
    // CustomsInvoiceModeSection und CommercialInvoiceUpload sind vollständig erhalten.
    customs: CUSTOMS_UI_ENABLED && r.customsRequired === true,
    // Drucker-Hinweis: nur wenn der Tarif einen Ausdruck verlangt
    // (entspricht 1:1 dem bisherigen `tariff.printerRequired === true`).
    printerNote: t.printerRequired === true,
    // Bereits belegte Felder für spätere Module weitergereicht (aktuell nur
    // informativ — treiben noch keine zusätzliche Sichtbarkeit).
    serviceType: t.serviceType ?? null,
    trackingAvailable: t.trackingAvailable === true,
  };
}
