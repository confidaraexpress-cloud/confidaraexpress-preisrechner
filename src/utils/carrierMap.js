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
