import dhlLogo       from "../assets/carriers/dhl.svg";
import upsLogo       from "../assets/carriers/ups.svg";
import fedexLogo     from "../assets/carriers/fedex.svg";
import tntLogo       from "../assets/carriers/tnt.svg";
import dpdLogo       from "../assets/carriers/dpd.svg";
import glsLogo       from "../assets/carriers/gls.svg";
import emonsLogo     from "../assets/carriers/emons.svg";
import derKurierLogo from "../assets/carriers/der-kurier.svg";

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
// (ups|dhl|fedex|tnt|der-kurier|other) — KEINE Rohstring-/Regex-/includes-
// Erkennung, KEIN Fallback auf tariff.carrier / tariff.tariffName. Bestehende
// Logos werden weiterverwendet.
const PUBLIC_CARRIERS = {
  ups:          { name: "UPS",                  logo: upsLogo       },
  dhl:          { name: "DHL Express",          logo: dhlLogo       },
  fedex:        { name: "FedEx",                logo: fedexLogo     },
  tnt:          { name: "TNT",                  logo: tntLogo       },
  "der-kurier": { name: "DER KURIER",           logo: derKurierLogo },
  other:        { name: "Versanddienstleister", logo: null          },
};

// Logo + kanonischer Name allein aus der ID (Teil C). Unbekannte/fehlende ID →
// generisches „Versanddienstleister" (kein Logo, kein Layoutbruch).
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
// als „Versanddienstleister", sonst der Backend-Name (Fallback: kanonischer
// ID-Name). Kein Rohwert, keine Rückübersetzung.
export function publicCarrierChipLabel(pc) {
  if (!pc || pc.id === "other") return "Versanddienstleister";
  return (typeof pc.name === "string" && pc.name.trim()) ? pc.name.trim() : resolvePublicCarrier(pc.id).name;
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
