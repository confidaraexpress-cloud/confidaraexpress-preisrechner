// ─────────────────────────────────────────────────────────────────────────────
// Gemeinsame Ableitung der Anzeigewerte BEIDER Buchungs-Zusammenfassungen:
// der großen Live-Leiste (BookingLiveSummary, scrollt mit) und der kompakten
// Sticky-Leiste (BookingStickySummary, erscheint erst darunter).
//
// Zweck: Übergabeart, Zustellzeitraum und der geltende Preis werden an GENAU
// EINER Stelle bestimmt. Vorher lag diese Ableitung nur in BookingLiveSummary;
// eine zweite Leiste hätte sie zwangsläufig dupliziert — und wäre bei jeder
// Änderung auseinandergelaufen.
//
// WICHTIG — hier wird NICHTS gerechnet:
//   • Keine Preisberechnung, keine Netto-/Brutto-Ableitung, keine Addition von
//     Versicherung. Die Beträge stammen unverändert aus dem zentralen
//     Price-View-Model; diese Datei wählt ausschließlich AUS, welcher der
//     bereits vorhandenen Beträge gilt (Gesamt vs. Versand).
//   • Keine JUMiNGO-Rohfelder, keine Providerlogik.
//
// Framework-frei (.mjs, wie kpis.mjs / draftsView.mjs), damit die Regeln mit
// `node --test` direkt prüfbar sind. Einzige Abhängigkeit ist formatters.js —
// selbst importfrei. Die Carrier-/Logoauflösung bleibt bewusst draußen:
// carrierMap.js importiert SVG-Assets und ist deshalb nicht node-testbar.

import { isoDayDE } from "./formatters.js";

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
// Vorrang: echter Zeitraum → einzelnes Datum → Freitext → „Auf Anfrage".
// Ein Zeitraum entsteht nur, wenn beide Daten vorliegen UND verschieden sind —
// sonst stünde dort „11.08.2026 – 11.08.2026".
export function deliveryInfo(tariff) {
  const min = tariff?.deliveryDateMin;
  const max = tariff?.deliveryDateMax;

  const range = (min && max && min !== max) ? `${isoDayDE(min)} – ${isoDayDE(max)}` : null;
  const single = !range && (min || tariff?.deliveryDate)
    ? isoDayDE(min || tariff.deliveryDate)
    : null;
  const text = (typeof tariff?.deliveryTime === "string" && tariff.deliveryTime.trim())
    ? tariff.deliveryTime.trim()
    : null;

  const until = tariff?.deliveryTimeUntil
    ? (/^bis\b/i.test(tariff.deliveryTimeUntil) ? tariff.deliveryTimeUntil : `bis ${tariff.deliveryTimeUntil}`)
    : null;

  return { value: range || single || text || "Auf Anfrage", until, isRange: !!range };
}

// ── Preis ───────────────────────────────────────────────────────────────────
// Genau die Regel der bestehenden Live-Leiste: Sobald ein Gesamtpreis bestätigt
// ist, gilt dieser („Gesamt"); vorher der reine Versandpreis („Versand"). Es
// wird NIE ein „ab"-Betrag addiert und nie ein Zwischenwert gebildet — die
// Felder kommen unverändert aus dem Price-View-Model.
export function priceInfo(priceView) {
  const v = priceView || {};
  const confirmed = v.hasConfirmedPrice === true;
  return confirmed
    ? { confirmed: true,  label: "Gesamt",  gross: v.totalGross ?? null,        net: v.totalNet ?? null }
    : { confirmed: false, label: "Versand", gross: v.baseShippingGross ?? null, net: v.baseShippingNet ?? null };
}
