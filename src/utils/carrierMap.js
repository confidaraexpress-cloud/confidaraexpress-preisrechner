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

// ─── Access-Point / Paketshop-Carrier-Code (Jumingo) ────────────────────────
// Liefert NUR einen Carrier-Code, der vom Backend für die Access-Point-Suche
// allowlisted ist. Backendseitig freigegeben sind aktuell UPS ("ups"), DPD
// ("dpd") und DHL Express ("dhlexpress") — alle sicher erkannt über die
// bestehenden /UPS/i-, /DPD/i- bzw. /DHL Express/i-Regeln in resolveCarrier
// (kein Regex-Duplikat).
//
// Akzeptiert entweder einen rohen Carrier-String ODER ein ganzes Tarifobjekt.
// Hintergrund: Ein DHL-Express-Shopabgabe-Tarif trägt den Express-Beleg NICHT
// im carrier-Feld (live: carrier:"DHL national Paket VK" → normalisiert zu
// "DHL"), sondern im shopName ("DHL Express Paketshop"). Beim Tarifobjekt werden
// daher die belegten Hinweisfelder (carrier + shopName + shopsName + tariffName)
// zu einem Suchstring zusammengeführt, sodass resolveCarrierName das echte DHL
// Express erkennt. Die /DHL Express/i-Regel verlangt die exakte Sequenz
// "DHL Express" — normales DHL/DHL Paket/DHL Paketshop/Deutsche Post DHL
// enthalten diese nicht und normalisieren zu "DHL" → bleiben null. Kein
// pauschales DHL→dhlexpress.
//
// Wichtig: Das emittierte Literal ist exakt "dhlexpress" (NICHT "dhl"/
// "dhl_express"/"dhl-express", die backendseitig unsupported sind). Für jeden
// anderen Carrier bewusst null (kein Raten): die UI zeigt dann „Paketshop-Suche
// … wird noch vorbereitet". GLS und DHL/DHL Paket bleiben damit gesperrt. Keine
// weiteren Codes ergänzen, bevor das Backend sie freigegeben hat.
export function accessPointCarrierCode(input) {
  const raw = typeof input === "string"
    ? input
    : [input?.carrier, input?.shopName, input?.shopsName, input?.tariffName]
        .filter(Boolean).join(" ");
  const carrier = resolveCarrierName(raw);
  if (carrier === "UPS") return "ups";
  if (carrier === "DPD") return "dpd";
  if (carrier === "DHL Express") return "dhlexpress";
  return null;
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
