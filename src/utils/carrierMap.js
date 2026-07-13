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
// "dhl_express"/"dhl-express", die backendseitig unsupported sind). GLS ist
// backendseitig freigegeben und wird auf "gls" gemappt (eigene /GLS/i-Regel,
// keine Kollision mit DHL national/DHL Paket, die zu "DHL" → null normalisieren).
// GLS verlangt backendseitig zusätzlich eine Straße — das erzwingt der Aufrufer
// (AccessPointFinder), nicht diese reine Code-Zuordnung. Für jeden anderen
// Carrier bewusst null (kein Raten): die UI zeigt dann „Paketshop-Suche … wird
// noch vorbereitet". DHL/DHL Paket bleiben gesperrt. Keine weiteren Codes
// ergänzen, bevor das Backend sie freigegeben hat.
export function accessPointCarrierCode(input) {
  const raw = typeof input === "string"
    ? input
    : [input?.carrier, input?.shopName, input?.shopsName, input?.tariffName]
        .filter(Boolean).join(" ");
  const carrier = resolveCarrierName(raw);
  if (carrier === "UPS") return "ups";
  if (carrier === "DPD") return "dpd";
  if (carrier === "DHL Express") return "dhlexpress";
  if (carrier === "GLS") return "gls";
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
