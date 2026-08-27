// ─────────────────────────────────────────────────────────────────────────────
// Adressbuch — Fassade des Anzeigemodells (Modularisierungs-Audit).
//
// Der frühere 460-Zeilen-Sammelbau ist in sechs Fachmodule zerlegt; diese Datei
// ist die unveränderte ÖFFENTLICHE API. Alle elf Konsumenten (Adressbuchseite,
// AddressPicker, Versandformular, Auftragsdialog) und alle Testsuiten
// importieren weiter von hier — kein Importpfad, kein Name und kein Verhalten
// hat sich geändert.
//
// Wer eine Funktion ÄNDERT, arbeitet im Fachmodul daneben:
//   addressRoles.mjs           Rollen, Reiter, Rollenregeln, Übernahme-Entscheidung
//   addressListQuery.mjs       Listenparameter, Query-String, Pagination, Mutation
//   addressForm.mjs            Formularmodell, Validierung, Normalisierung, Fehlertexte
//   addressShipmentMapping.mjs Feldauslegung in Versand (s_/r_) und Auftrag
//   addressPickerView.mjs      die drei Anzeigezeilen der Adressauswahl
//   addressMenuView.mjs        Hauptaktion, Kebab-Menümodell, Badges
//
// Backend-Kontrakt (kanonisches Adressobjekt) unverändert:
//   { id, label, company, contactName, streetAndNumber, addressAdd, postalCode,
//     city, state, country, email, phone, notes, role, isDefaultSender,
//     isDefaultRecipient, favorite, createdAt, updatedAt }
//
// Neue Konsumenten dürfen direkt aus dem Fachmodul importieren; die Fassade
// bleibt für die Bestandskonsumenten stehen.
// ─────────────────────────────────────────────────────────────────────────────

export {
  ROLE_SENDER,
  ROLE_RECIPIENT,
  ROLE_BOTH,
  TAB_SENDER,
  TAB_RECIPIENT,
  UI_ROLE_OPTIONS,
  belongsToTab,
  canSetDefaultSender,
  canSetDefaultRecipient,
  validateRoleDefaultConsistency,
  resolveNewShipmentRole,
} from "./addressRoles.mjs";

export {
  roleParamForTab,
  buildAddressListParams,
  toQueryString,
  addressListStateKey,
  appendPageResults,
  resolveEmptyStateKind,
  applyAddressMutation,
} from "./addressListQuery.mjs";

export {
  emptyAddressForm,
  addressToFormValues,
  prepareDuplicateFormValues,
  validateAddressForm,
  normalizeAddressForm,
  mapAddressErrorToMessage,
} from "./addressForm.mjs";

export {
  mapAddressToShipmentFormPatch,
  mapAddressToOrderRecipient,
} from "./addressShipmentMapping.mjs";

export {
  addressPickerLabel,
  addressPickerPerson,
  addressPickerMeta,
} from "./addressPickerView.mjs";

export {
  CREATE_SHIPMENT_LABEL,
  CREATE_SHIPMENT_ICON,
  buildAddressMenuModel,
  addressBadgeList,
} from "./addressMenuView.mjs";
