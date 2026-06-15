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
  { test: /Emons/i,       name: "Emons",       logo: emonsLogo     },
  { test: /Kurier/i,      name: "Der Kurier",  logo: derKurierLogo },
];

export function resolveCarrier(raw) {
  const rule = RULES.find(r => r.test.test(raw || ""));
  return { name: rule?.name || raw || "—", logo: rule?.logo || null };
}

export const resolveCarrierName = (raw) => resolveCarrier(raw).name;
