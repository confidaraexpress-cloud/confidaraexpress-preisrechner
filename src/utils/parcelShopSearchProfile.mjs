// Ein Paketshop-Finder, zwei Suchprofile (2026-10-24, Canonical 15, v2.74).
//
// Das Profil folgt ausschließlich den Serverfeldern des Angebots — über `offerRequiresDropoffParcelShop`
// (auswählbar ∧ suchbare Shopabgabe ∧ `parcelShopSearch === "server"`), nie über eine ServiceID. Es sagt,
// welche Eingaben wirken, welche Filter es gibt, welcher Hinweis gilt und ob die Auswahl Teil der Buchung ist.
//
//   „Orientierung" (JUMiNGO-Abgaben UPS, DPD, DHL Express, GLS): PLZ, Ort, Straße, Umkreis, Öffnungszeiten-
//     filter — unverändert. Die Suche ist Orientierung; gebucht wird eine Shoprate ohne Shop.
//   „Verbindliche Auswahl" (heute TG124): nur die Postleitzahl, Land DE. Die Portalsuche kennt weder Ort noch
//     Straße, Umkreis oder Öffnungszeiten (belegt 2026-10-24) — Felder dafür wären Scheinfilter. Der Kunde muss
//     vor der Buchung einen konkreten Shop wählen; die Suche dauert gemessen bis zu ~35 s.
//
// Reine Funktionen, framework-frei, im Node-Test-Runner ladbar.
import { offerRequiresDropoffParcelShop } from "./dropoffParcelShop.mjs";

export const PROFILE_ORIENTATION = "orientation";
export const PROFILE_BINDING = "binding";

export const ORIENTATION_NOTE = "Die Paketshop-Suche dient der Orientierung – eine verbindliche Auswahl eines Shops ist nicht erforderlich.";
export const BINDING_NOTE = "Für diesen Versand müssen Sie vor der Buchung einen Paketshop auswählen.";
export const BINDING_LOADING_NOTE = "Die Suche kann bis zu einer Minute dauern.";

const ORIENTIERUNG = Object.freeze({
  mode: PROFILE_ORIENTATION,
  binding: false,
  fields: Object.freeze({ postCode: true, city: true, street: true, radius: true, opening: true }),
  note: ORIENTATION_NOTE,
  loadingNote: null,
});

const VERBINDLICH = Object.freeze({
  mode: PROFILE_BINDING,
  binding: true,
  fields: Object.freeze({ postCode: true, city: false, street: false, radius: false, opening: false }),
  note: BINDING_NOTE,
  loadingNote: BINDING_LOADING_NOTE,
});

/** Das Suchprofil eines Angebots. `supportsAccessPointSearch` = `offerSupportsAccessPointSearch(tariff)`. */
export function parcelShopSearchProfile(tariff, supportsAccessPointSearch) {
  return offerRequiresDropoffParcelShop(tariff, supportsAccessPointSearch) ? VERBINDLICH : ORIENTIERUNG;
}

/** Eine Postleitzahl, mit der die verbindliche Suche (Land DE) sucht: genau fünf Ziffern. */
export function bindingPostcodeValid(postCode) {
  return /^\d{5}$/.test(String(postCode ?? "").trim());
}
