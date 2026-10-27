// Bezeichnung „Carrier · Service“ ohne doppelten Carriernamen (F4, Premium-Redesign Etappe 1).
//
// Buchung, Buchungsbestätigung und die Übergabe aus den Rechnern setzen den öffentlichen Carriernamen und den
// öffentlichen Servicenamen zusammen. Beginnt der Servicename schon mit dem Carriernamen („DHL Paket“), stünde
// der Carrier doppelt da („DHL — DHL Paket“). Dann trägt der Servicename die Bezeichnung allein.
//
// Der Helfer ändert keinen Namen und erfindet keinen: er lässt nur die Wiederholung weg. Heute liefert das
// Backend keine Servicenamen mit Carrierpräfix; der Schutz gilt künftigen Namen.

function beginntMitCarrier(service, carrier) {
  const s = service.toLocaleLowerCase("de-DE");
  const c = carrier.toLocaleLowerCase("de-DE");
  if (!s.startsWith(c)) return false;
  // Nur ein ganzes Wort zählt: „DHL Paket“ ja, „DHLX“ nein.
  const danach = s.charAt(c.length);
  return danach === "" || /[\s\-–—·/]/.test(danach);
}

export function carrierServiceLabel(carrierName, serviceName, trenner = " · ") {
  const carrier = typeof carrierName === "string" ? carrierName.trim() : "";
  const service = typeof serviceName === "string" ? serviceName.trim() : "";
  if (!carrier) return service;
  if (!service) return carrier;
  if (beginntMitCarrier(service, carrier)) return service;
  return `${carrier}${trenner}${service}`;
}
