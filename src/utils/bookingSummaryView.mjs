// ─────────────────────────────────────────────────────────────────────────────
// Gemeinsame Ableitung der Anzeigewerte ALLER Buchungs-Zusammenfassungen:
// der großen Live-Leiste (BookingLiveSummary, scrollt mit), der kompakten
// Sticky-Leiste (BookingStickySummary, erscheint erst darunter) und des
// ausgewählten Angebots in Schritt 1 (OfferSummaryModule).
//
// Zweck: Übergabeart, Zustellung und der geltende Preis werden an GENAU EINER
// Stelle bestimmt. Vorher lag diese Ableitung in jeder Fläche einzeln — und lief
// auseinander: das ausgewählte Angebot zeigte nach einer bestätigten Absicherung
// weiter den Versandpreis des Tarifs, die Leiste darüber den Gesamtbetrag.
//
// WICHTIG — hier wird NICHTS gerechnet:
//   • Keine Preisberechnung, keine Netto-/Brutto-Ableitung, keine Addition von
//     Versicherung. Die Beträge stammen unverändert aus dem zentralen
//     Price-View-Model; diese Datei wählt ausschließlich AUS, welcher der
//     bereits vorhandenen Beträge gilt (Gesamt vs. Versand).
//   • Keine JUMiNGO-Rohfelder, keine Providerlogik.
//
// Framework-frei (.mjs, wie kpis.mjs / draftsView.mjs), damit die Regeln mit
// `node --test` direkt prüfbar sind. Abhängigkeiten sind formatters.js und die
// Zustellregel — beide importfrei bzw. selbst framework-frei. Die Carrier-/
// Logoauflösung bleibt bewusst draußen: carrierMap.js importiert SVG-Assets und
// ist deshalb nicht node-testbar.

import { isoDayDE } from "./formatters.js";
import { deliveryContractOf, DELIVERY_ON_REQUEST } from "./deliveryContractView.mjs";

// ── Übergabe ────────────────────────────────────────────────────────────────
// serviceType ist der belegte, providerneutrale Vertrag ("pickup" | "dropoff").
// Alles andere bleibt bewusst neutral „Übergabe" statt geraten zu werden.
export function handoverInfo(tariff) {
  const isPickup = tariff?.serviceType === "pickup";
  const isDropoff = tariff?.serviceType === "dropoff";
  return {
    isPickup,
    isDropoff,
    label: isPickup ? "Abholung" : isDropoff ? "Shopabgabe" : "Übergabe",
  };
}

// ── Zustellung ──────────────────────────────────────────────────────────────
// Welche Aussage gilt und wie sie heißt, steht in deliveryContractView.mjs —
// dieselbe Regel wie auf der Angebotskarte: „Zustellung" mit den Daten des
// Angebots, „Voraussichtliche Laufzeit" bei reiner Laufzeit, sonst „Auf Anfrage".
// Hier entsteht nur die Schreibweise der Buchungsflächen (TT.MM.JJJJ).
export function deliveryInfo(tariff) {
  const z = deliveryContractOf(tariff);
  const value =
    z.kind === "range"   ? `${isoDayDE(z.dayFrom)} – ${isoDayDE(z.dayUntil)}` :
    z.kind === "date"    ? isoDayDE(z.day) :
    z.kind === "transit" ? z.transit :
    DELIVERY_ON_REQUEST;
  return { label: z.label, value, until: z.until, isRange: z.kind === "range" };
}

// ── Preis ───────────────────────────────────────────────────────────────────
// Sobald ein Gesamtpreis bestätigt ist, gilt dieser („Gesamt"); vorher der reine
// Versandpreis („Versand"). Es wird NIE ein „ab"-Betrag addiert und nie ein
// Zwischenwert gebildet — die Felder kommen unverändert aus dem Price-View-Model.
//
// TG22 Golden Offer Contract: hat der Server eine Preisänderung gemeldet, gilt
// KEIN bisher gezeigter Betrag mehr — auch nicht der Versandpreis des Angebots,
// denn genau der ist nicht mehr aktuell. Bis der Kunde den neuen Preis bestätigt
// oder neu berechnet, steht dort kein Betrag.
export const PRICE_CHANGED_LABEL = "Preis geändert";
export const PRICE_CHANGED_HINT = "Nicht mehr aktuell";
export const PRICE_CHANGED_SUMMARY =
  "Der Preis hat sich geändert. Bis Sie den neuen Preis bestätigen oder die Angebote neu berechnen, "
  + "wird kein Betrag angezeigt und nichts gebucht.";

export function priceInfo(priceView) {
  const v = priceView || {};
  if (v.isPriceChanged === true) {
    return { confirmed: false, changed: true, label: PRICE_CHANGED_LABEL, gross: null, net: null };
  }
  const confirmed = v.hasConfirmedPrice === true;
  return confirmed
    ? { confirmed: true,  changed: false, label: "Gesamt",  gross: v.totalGross ?? null,        net: v.totalNet ?? null }
    : { confirmed: false, changed: false, label: "Versand", gross: v.baseShippingGross ?? null, net: v.baseShippingNet ?? null };
}
