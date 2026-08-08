import { handoverMode, HANDOVER_DROPOFF } from "./handoverMode.mjs";
import dhlLogo       from "../assets/carriers/dhl.svg";
import upsLogo       from "../assets/carriers/ups.svg";
import fedexLogo     from "../assets/carriers/fedex.svg";
import tntLogo       from "../assets/carriers/tnt.svg";
import dpdLogo       from "../assets/carriers/dpd.svg";
import glsLogo       from "../assets/carriers/gls.svg";
import emonsLogo     from "../assets/carriers/emons.svg";
import derKurierLogo from "../assets/carriers/der-kurier.svg";
import transOFlexLogo from "../assets/carriers/trans-o-flex.svg";

const RULES = [
  { test: /DHL Express/i, name: "DHL Express", logo: dhlLogo       },
  { test: /DHL/i,         name: "DHL",         logo: dhlLogo       },
  { test: /UPS/i,         name: "UPS",         logo: upsLogo       },
  { test: /FedEx/i,       name: "FedEx",       logo: fedexLogo     },
  { test: /TNT/i,         name: "TNT",         logo: tntLogo       },
  { test: /DPD/i,         name: "DPD",         logo: dpdLogo       },
  { test: /GLS/i,         name: "GLS",         logo: glsLogo       },
  { test: /Emons/i,                  name: "Emons",         logo: emonsLogo     },
  { test: /Kurier/i,                 name: "Der Kurier",    logo: derKurierLogo },
  { test: /trans[\s-]?o[\s-]?flex/i, name: "Trans-o-flex",  logo: null          },
];

export function resolveCarrier(raw) {
  const rule = RULES.find(r => r.test.test(raw || ""));
  return { name: rule?.name || raw || "—", logo: rule?.logo || null };
}

export const resolveCarrierName = (raw) => resolveCarrier(raw).name;

// ─── Öffentlicher Carrier-Vertrag (publicCarrierId) ─────────────────────────
// EINZIGE Quelle für Carrier-Anzeige/-Logo/-Metadaten der calculate-price-Tarife
// im Kundenbereich. Ausschließlich die kontrollierte publicCarrierId
// (ups|dhl|fedex|tnt|dpd|gls|der-kurier|trans-o-flex|other) — KEINE Rohstring-/
// Regex-/includes-Erkennung, KEIN Fallback auf tariff.carrier / tariff.tariffName,
// KEINE Auswertung von Preis, shipper_tariff_id oder Laufzeit. Bestehende Logos
// werden weiterverwendet.
//
// Die IDs sind 1:1 die des Backend-Vertrags (lib/publicCarrier.js →
// PUBLIC_CARRIER_IDS). Kommt eine ID hinzu, muss sie hier ergänzt werden — sonst
// fällt der Tarif still auf den generischen Eintrag zurück.
//
// Object.create(null) statt {} — analog zum Backend: eine ID wie "constructor"
// oder "__proto__" würde sonst über die Prototype-Chain einen Treffer liefern
// (PUBLIC_CARRIERS["constructor"].name ist "Object") und diesen Wert als
// Carriernamen rendern, statt auf den generischen Eintrag zurückzufallen.
const PUBLIC_CARRIERS = Object.assign(Object.create(null), {
  ups:            { name: "UPS",            logo: upsLogo        },
  dhl:            { name: "DHL Express",    logo: dhlLogo        },
  fedex:          { name: "FedEx",          logo: fedexLogo      },
  tnt:            { name: "TNT",            logo: tntLogo        },
  dpd:            { name: "DPD",            logo: dpdLogo        },
  gls:            { name: "GLS",            logo: glsLogo        },
  "der-kurier":   { name: "DER KURIER",     logo: derKurierLogo  },
  "trans-o-flex": { name: "trans-o-flex",   logo: transOFlexLogo },
  // Generischer Eintrag für echte unbekannte Carrier: bewusst OHNE Logo. Die
  // Darstellung dieses Falls übernimmt das neutrale Paket-Icon in der Logokachel
  // (OfferCard/BookingLiveSummary/OfferSummaryModule) — nie Text in der Kachel.
  other:          { name: "Versandpartner", logo: null           },
});

// Logo + kanonischer Name allein aus der ID (Teil C). Unbekannte/fehlende ID →
// generischer „Versandpartner" (kein Logo, kein Layoutbruch).
export function resolvePublicCarrier(publicCarrierId) {
  return PUBLIC_CARRIERS[publicCarrierId] || PUBLIC_CARRIERS.other;
}

// Kundenanzeige eines Tarifs (Teil B): bevorzugt den Backend-publicCarrierName,
// sonst der kanonische Name der publicCarrierId; NIEMALS carrier/tariffName. Das
// Logo kommt strikt aus der publicCarrierId.
export function publicCarrierDisplay(tariff) {
  const meta = resolvePublicCarrier(tariff?.publicCarrierId);
  const name = (typeof tariff?.publicCarrierName === "string" && tariff.publicCarrierName.trim())
    ? tariff.publicCarrierName.trim()
    : meta.name;
  return { name, logo: meta.logo };
}

// Öffentlicher Servicename (Teil B): bevorzugt publicServiceName, sonst ein
// neutraler, vom shippingMode abgeleiteter Text — NIEMALS der Rohwert tariffName.
const PUBLIC_SERVICE_BY_MODE = {
  express:  "Expressversand",
  standard: "Standardversand",
  economy:  "Economyversand",
};
export function publicServiceName(tariff) {
  const s = tariff?.publicServiceName;
  if (typeof s === "string" && s.trim()) return s.trim();
  return PUBLIC_SERVICE_BY_MODE[tariff?.shippingMode] || "Versandservice";
}

// Filter-Chip-Label eines publicCarriers-Eintrags (Teil A): „other" stets neutral
// als „Versandpartner", sonst der Backend-Name (Fallback: kanonischer ID-Name).
// Kein Rohwert, keine Rückübersetzung. Liefert das Backend trans-o-flex in
// publicCarriers, erscheint der Carrier dadurch automatisch im Versanddienst-Filter.
export function publicCarrierChipLabel(pc) {
  if (!pc || pc.id === "other") return "Versandpartner";
  return (typeof pc.name === "string" && pc.name.trim()) ? pc.name.trim() : resolvePublicCarrier(pc.id).name;
}

// Neutraler, providerneutraler Abgabestellen-Text für Dropoff-Tarife. Quelle ist
// AUSSCHLIESSLICH die kontrollierte publicCarrierId/-Name — NIE tariff.shopName/
// carrier/tariffName und NICHT der Access-Point-Provider. Kein Text bei Pickup;
// für generische/unbekannte/fehlende Carrier neutral „Paketshop".
//   dropoff + ups         → „UPS Paketshop"
//   dropoff + dhl         → „DHL Express Paketshop"
//   dropoff + other/leer  → „Paketshop"
//   pickup/kein dropoff   → null (kein Abgabetext)
export function publicDropoffLabel(tariff) {
  if (tariff?.serviceType !== "dropoff") return null;
  const id = tariff?.publicCarrierId;
  const meta = (id && id !== "other") ? PUBLIC_CARRIERS[id] : null;
  if (!meta) return "Paketshop";
  const name = (typeof tariff?.publicCarrierName === "string" && tariff.publicCarrierName.trim())
    ? tariff.publicCarrierName.trim()
    : meta.name;
  return `${name} Paketshop`;
}

// ─── Access-Point / Paketshop-Provider-Adapter (Capability-Vertrag) ─────────
// Übersetzt den providerneutralen Capability-Provider (tariff.accessPoint.provider:
// "ups" | "dpd" | "dhl-express" | "gls" | null) in den technischen Code, den die
// bestehende Backend-Suchroute erwartet. EXAKTE 1:1-Zuordnung, KEINE unscharfe
// Normalisierung, KEIN Regex/includes/Teilstring, KEIN Rohfeld (carrier/
// tariffName/shopName) und KEINE Ableitung aus publicCarrierId. Alles Unbekannte
// oder null → null (fail-closed → keine Suche, neutraler Hinweis).
//   ups         → ups
//   dpd         → dpd
//   dhl-express → dhlexpress   (NICHT aus publicCarrierId "dhl" ableiten)
//   gls         → gls
export function toAccessPointSearchCode(provider) {
  switch (provider) {
    case "ups":         return "ups";
    case "dpd":         return "dpd";
    case "dhl-express": return "dhlexpress";
    case "gls":         return "gls";
    default:            return null;
  }
}

// Kontrollierter FALLBACK für die Access-Point-Suche, wenn KEIN Capability-Provider
// (accessPoint.provider) vorliegt: Ableitung aus der kontrollierten, öffentlichen
// publicCarrierId. Bewusst getrennt von toAccessPointSearchCode gehalten (das strikt
// providerbasiert bleibt). Nur die vier vom bestehenden Backend-Suchendpunkt
// akzeptierten Carrier; alles andere (fedex/tnt/der-kurier/other/unbekannt) → null.
// KEIN Rohfeld/Regex/includes — reine 1:1-Zuordnung der klassifizierten ID.
// Achtung DHL-Kennung: publicCarrierId "dhl" ↔ Access-Point-Code "dhlexpress"
// (der Capability-Provider hieße "dhl-express").
//   ups → ups · dpd → dpd · dhl → dhlexpress · gls → gls · sonst → null
export function publicCarrierIdToAccessPointSearchCode(publicCarrierId) {
  switch (publicCarrierId) {
    case "ups": return "ups";
    case "dpd": return "dpd";
    case "dhl": return "dhlexpress";
    case "gls": return "gls";
    default:    return null;
  }
}

/**
 * Der Access-Point-Suchcode zu einem Tarif — oder null, wenn die Suche für
 * diesen Versanddienstleister (noch) nicht unterstützt wird.
 *
 * Fasst die beiden Wege oben in der belegten Priorität zusammen:
 *   1) Capability-Provider (accessPoint.provider)
 *   2) kontrollierte, öffentliche publicCarrierId
 * KEIN Rohfeld, KEIN Regex, KEINE Ableitung aus Namen oder Servicebezeichnung.
 *
 * Dies ist unverändert dieselbe Auflösung, die bisher IM Paketshop-Finder stand
 * und darüber entschied, ob überhaupt gesucht werden darf.
 */
export function resolveAccessPointCarrierCode(tariff) {
  return (
    toAccessPointSearchCode(tariff?.accessPoint?.provider) ||
    publicCarrierIdToAccessPointSearchCode(tariff?.publicCarrierId) ||
    null
  );
}

/**
 * Bietet dieses Angebot eine Paketshop-Suche an?
 *
 * ZWEI Bedingungen, beide aus bereits vorhandenen, strukturierten Feldern —
 * keine Namensheuristik:
 *   • serviceType === "dropoff" — dieselbe Regel, die bisher darüber
 *     entschied, ob der Finder auf der Angebotskarte überhaupt erschien.
 *   • ein auflösbarer Carrier-Suchcode — sonst gäbe es nichts zu suchen.
 *
 * Fällt eine der beiden weg, erscheint KEIN Einstieg: kein deaktivierter Knopf
 * und kein „nicht verfügbar“-Text, der nichts anbietet.
 */
export function offerSupportsAccessPointSearch(tariff) {
  // „Ist das eine Shopabgabe?" beantwortet ausschließlich handoverMode — dieselbe
  // Auslegung, die auch die Kennzeichnung auf der Angebotskarte und den
  // Knotentitel der Prozesslinie speist. Eine zweite Prüfung von serviceType
  // an dieser Stelle wäre eine zweite Auslegung derselben Businessregel.
  return handoverMode(tariff) === HANDOVER_DROPOFF && Boolean(resolveAccessPointCarrierCode(tariff));
}

// ─── Versanddienst-Filter: Gruppierung, Sortierung, Auswahl ─────────────────
// Referenz-Reihenfolge für die Anzeige im Carrier-Filter. Unbekannte Carrier
// (kein Treffer in dieser Liste) werden danach alphabetisch nach Anzeigename
// sortiert — stabil und unabhängig von der (potenziell wechselnden) API-Reihenfolge.
export const CARRIER_DISPLAY_ORDER = [
  "UPS", "DHL Express", "TNT", "DPD", "GLS", "FedEx", "Der Kurier", "Trans-o-flex",
];

export function groupCarriers(rawCarriers) {
  const groups = new Map();
  for (const raw of rawCarriers || []) {
    const label = resolveCarrierName(raw);
    if (label === "DHL") continue; // DHL ist im Versanddienst-Filter nicht wählbar — nur "DHL Express" bleibt
    if (!groups.has(label)) groups.set(label, { label, rawValues: [] });
    groups.get(label).rawValues.push(raw);
  }
  return Array.from(groups.values())
    .map(g => {
      const idx = CARRIER_DISPLAY_ORDER.indexOf(g.label);
      return { ...g, sortIndex: idx === -1 ? CARRIER_DISPLAY_ORDER.length : idx };
    })
    .sort((a, b) => a.sortIndex - b.sortIndex || a.label.localeCompare(b.label));
}

export function isCarrierGroupSelected(group, carrierFilters) {
  return group.rawValues.every(v => carrierFilters.includes(v));
}

export function toggleCarrierGroup(group, carrierFilters) {
  if (isCarrierGroupSelected(group, carrierFilters)) {
    return carrierFilters.filter(c => !group.rawValues.includes(c));
  }
  const merged = [...carrierFilters];
  for (const v of group.rawValues) {
    if (!merged.includes(v)) merged.push(v);
  }
  return merged;
}

export function getSelectedCarrierGroups(groups, carrierFilters) {
  return groups.filter(g => isCarrierGroupSelected(g, carrierFilters));
}
