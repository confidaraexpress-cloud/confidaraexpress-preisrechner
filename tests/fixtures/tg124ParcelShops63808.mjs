// TG124: die Antwort von GET /api/dropoff/parcelshops?postcode=63808&countryCode=DE — erzeugt durch den
// echten Backend-Parser aus der bereinigten Staging-Rohantwort vom 2026-10-24 (genau ein freigegebener Suchlauf;
// Backend-Fixture tests/fixtures/transglobal-portal-evidence/parcelshops/find-dpd-parcelshops-63808-staging-20261024.html).
// Öffentliche Geschäftsdaten der DPD-Paketshops; Texte vom Server dekodiert; Entfernung aus dem Zeilentext der
// Portalseite — die Zahl ist Kilometer, obwohl das Portal „mi“ schreibt (Befund 2026-10-24, Backend §7.59). Keine Koordinaten, keine Öffnungszeiten, kein Status — die Portalseite liefert sie nicht.
const shop = (pickupLocationCode, parcelShopId, name, street, houseNumber, postcode, city, town, distanceKm) =>
  Object.freeze({ parcelShopId, pickupLocationCode, name, street, houseNumber, postcode, city, town, countryCode: "DE", distanceKm });

export const TG124_SHOPS_63808 = Object.freeze([
  shop("DE19321", "262668", "Lotto Shop Lange", "Würzburger Str.", "116", "63808", "Haibach", "Haibach", 0.14),
  shop("DE49809", "587748", "Myflexbox - DPD Pickup Paketstation", "Bayreuther Str.", "5", "63743", "Aschaffenburg", "Innenstadt", 1.91),
  shop("DE43619", "519166", "Landhotel Klingerhof GmbH", "Am Hügel", "7", "63768", "Hösbach", "Winzenhohl", 2.06),
  shop("DE49106", "577910", "Rosis-toys", "Würzburger Str.", "25", "63856", "Bessenbach", "Straßbessenbach", 3.26),
  shop("DE35010", "382002", "NKD Deutschland GmbH", "Bayernstr.", "9", "63773", "Goldbach", "Goldbach", 3.62),
  shop("DE45903", "542519", "DPD-Paketstation", "Auhofstr.", "25", "63741", "Aschaffenburg", "Damm", 3.88),
  shop("DE43984", "520889", "Media Markt City Galerie", "Goldbacher Str.", "2", "63739", "Aschaffenburg", "Innenstadt", 3.9),
  shop("DE25204", "304274", "City Markt", "Sandgasse", "26", "63739", "Aschaffenburg", "Innenstadt", 3.96),
  shop("DE42212", "494191", "Kiox", "Landingstr.", "32", "63739", "Aschaffenburg", "Innenstadt", 4.27),
  shop("DE38111", "429339", "i-Mobile", "Frohsinnstr.", "30", "63739", "Aschaffenburg", "Innenstadt", 4.36),
]);
