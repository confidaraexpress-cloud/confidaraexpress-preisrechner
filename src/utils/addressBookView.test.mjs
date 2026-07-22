// Tests für die reine Adressbuch-Logik. Läuft über node --test (bzw. `npm test`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_SENDER, ROLE_RECIPIENT, ROLE_BOTH, TAB_SENDER, TAB_RECIPIENT,
  belongsToTab, canSetDefaultSender, canSetDefaultRecipient,
  validateRoleDefaultConsistency, buildAddressListParams, toQueryString, addressListStateKey,
  appendPageResults, resolveEmptyStateKind, addressToFormValues, prepareDuplicateFormValues,
  validateAddressForm, normalizeAddressForm, mapAddressErrorToMessage, resolveNewShipmentRole,
  mapAddressToShipmentFormPatch, applyAddressMutation, roleParamForTab,
  buildAddressMenuModel, CREATE_SHIPMENT_LABEL, CREATE_SHIPMENT_ICON,
} from "./addressBookView.mjs";

const addr = (over) => ({
  id: 1, label: "Lager Berlin", company: "Beispiel GmbH", contactName: "Max Mustermann",
  streetAndNumber: "Musterstraße 1", addressAdd: "Tor 3", postalCode: "10115", city: "Berlin",
  state: null, country: "DE", email: "logistik@beispiel.de", phone: "+49 30 1234",
  notes: null, role: ROLE_RECIPIENT, isDefaultSender: false, isDefaultRecipient: false,
  favorite: true, archivedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

// 1. API-Queryparameter werden korrekt aufgebaut.
test("1 — Queryparameter: Tab + Suche + Favoriten korrekt aufgebaut", () => {
  const params = buildAddressListParams({ tab: TAB_SENDER, q: "Berlin", favoritesOnly: true, cursor: null, limit: 20 });
  assert.equal(params.role, "sender");
  assert.equal(params.q, "Berlin");
  assert.equal(params.favorite, "true");
  assert.equal(params.limit, "20");
});

// 2. leere Queryparameter werden nicht gesendet.
test("2 — leere/undefinierte Parameter werden nicht in den Query-String übernommen", () => {
  const qs = toQueryString({ q: "  ", role: undefined, favorite: undefined, cursor: null, limit: undefined });
  assert.equal(qs, "");
});

// 3. Cursor wird korrekt übernommen.
test("3 — Cursor wird 1:1 aus nextCursor übernommen", () => {
  const params = buildAddressListParams({ tab: TAB_RECIPIENT, cursor: "eyJpZCI6NDJ9" });
  assert.equal(params.cursor, "eyJpZCI6NDJ9");
  const qs = toQueryString(params);
  assert.match(qs, /cursor=eyJpZCI6NDJ9/);
});

// 4. Cursor wird bei Such-/Filterwechsel zurückgesetzt (Cache-Key ändert sich).
test("4 — addressListStateKey ändert sich bei Such-/Filterwechsel, bleibt sonst stabil", () => {
  const k1 = addressListStateKey({ tab: TAB_SENDER, q: "berlin", favoritesOnly: false });
  const k2 = addressListStateKey({ tab: TAB_SENDER, q: "berlin", favoritesOnly: false });
  const k3 = addressListStateKey({ tab: TAB_SENDER, q: "münchen", favoritesOnly: false });
  const k4 = addressListStateKey({ tab: TAB_RECIPIENT, q: "berlin", favoritesOnly: false });
  assert.equal(k1, k2, "gleicher Zustand → gleicher Key");
  assert.notEqual(k1, k3, "Suchänderung → neuer Key");
  assert.notEqual(k1, k4, "Tab-Wechsel → neuer Key");
});

// 5. sender wird „Meine Adresse" zugeordnet.
test("5 — role=sender gehört zum Sender-Tab, nicht zum Empfänger-Tab", () => {
  const a = addr({ role: ROLE_SENDER });
  assert.equal(belongsToTab(a, TAB_SENDER), true);
  assert.equal(belongsToTab(a, TAB_RECIPIENT), false);
});

// 6. recipient wird „Empfänger" zugeordnet.
test("6 — role=recipient gehört zum Empfänger-Tab, nicht zum Sender-Tab", () => {
  const a = addr({ role: ROLE_RECIPIENT });
  assert.equal(belongsToTab(a, TAB_RECIPIENT), true);
  assert.equal(belongsToTab(a, TAB_SENDER), false);
});

// 7. both wird beiden Bereichen zugeordnet.
test("7 — role=both gehört zu BEIDEN Tabs", () => {
  const a = addr({ role: ROLE_BOTH });
  assert.equal(belongsToTab(a, TAB_SENDER), true);
  assert.equal(belongsToTab(a, TAB_RECIPIENT), true);
});

// 8./9. „Neue Sendung": unbekannte/fehlende Rolle wird blockiert (kein Archivkonzept mehr).
test("8/9 — resolveNewShipmentRole blockiert bei unbekannter/fehlender Rolle", () => {
  assert.deepEqual(resolveNewShipmentRole(addr({ role: "unknown" })), { type: "blocked" });
  assert.deepEqual(resolveNewShipmentRole({}), { type: "blocked" });
});

// 10. Default-Absender nur bei sender/both.
test("10 — canSetDefaultSender nur bei sender/both (nicht recipient)", () => {
  assert.equal(canSetDefaultSender(addr({ role: ROLE_SENDER })), true);
  assert.equal(canSetDefaultSender(addr({ role: ROLE_BOTH })), true);
  assert.equal(canSetDefaultSender(addr({ role: ROLE_RECIPIENT })), false);
});

// 11. Default-Empfänger nur bei recipient/both.
test("11 — canSetDefaultRecipient nur bei recipient/both (nicht sender)", () => {
  assert.equal(canSetDefaultRecipient(addr({ role: ROLE_RECIPIENT })), true);
  assert.equal(canSetDefaultRecipient(addr({ role: ROLE_BOTH })), true);
  assert.equal(canSetDefaultRecipient(addr({ role: ROLE_SENDER })), false);
});

// 12. Rollen-/Default-Konflikt wird clientseitig erkannt.
test("12 — Rollen-/Default-Konflikt: Empfänger darf nicht Standard-Absender sein (und umgekehrt)", () => {
  const e1 = validateRoleDefaultConsistency({ role: ROLE_RECIPIENT, isDefaultSender: true, isDefaultRecipient: false });
  assert.ok(e1.isDefaultSender);
  const e2 = validateRoleDefaultConsistency({ role: ROLE_SENDER, isDefaultSender: false, isDefaultRecipient: true });
  assert.ok(e2.isDefaultRecipient);
  const e3 = validateRoleDefaultConsistency({ role: ROLE_BOTH, isDefaultSender: true, isDefaultRecipient: true });
  assert.deepEqual(e3, {}, "both darf beide Standards sein");
  const e4 = validateRoleDefaultConsistency({ role: ROLE_SENDER, isDefaultSender: true, isDefaultRecipient: false });
  assert.deepEqual(e4, {}, "sender darf Standard-Absender sein");
});

// 13. contactName über 35 Zeichen wird abgewiesen.
test("13 — contactName > 35 Zeichen wird von validateAddressForm abgewiesen", () => {
  const longName = "A".repeat(36);
  const form = { streetAndNumber: "Musterstraße 1", city: "Berlin", country: "DE", postalCode: "10115", contactName: longName };
  const errors = validateAddressForm(form);
  assert.ok(errors.contactName);
  const okForm = { ...form, contactName: "A".repeat(35) };
  assert.equal(validateAddressForm(okForm).contactName, undefined, "genau 35 Zeichen bleibt gültig");
});

// 14. Country wird uppercase normalisiert.
test("14 — normalizeAddressForm schreibt das Land groß", () => {
  const form = { streetAndNumber: "Rue 1", city: "Zürich", country: "ch", postalCode: "8001", role: ROLE_SENDER };
  const n = normalizeAddressForm(form);
  assert.equal(n.country, "CH");
});

// 15. leere optionale Felder werden korrekt normalisiert.
test("15 — leere optionale Felder werden zu null normalisiert (Pflichtfelder bleiben Strings)", () => {
  const form = { streetAndNumber: "  Musterstraße 1  ", city: "Berlin", country: "DE", postalCode: "10115", company: "  ", addressAdd: "", phone: undefined, email: null, notes: "   ", state: "", role: ROLE_SENDER };
  const n = normalizeAddressForm(form);
  assert.equal(n.company, null);
  assert.equal(n.addressAdd, null);
  assert.equal(n.phone, null);
  assert.equal(n.email, null);
  assert.equal(n.notes, null);
  assert.equal(n.state, null);
  assert.equal(n.streetAndNumber, "Musterstraße 1", "Pflichtfeld bleibt getrimmter String, kein null");
});

// 16. Duplizieren übernimmt keine ID.
test("16 — prepareDuplicateFormValues enthält keine id/Zeitstempel-Felder", () => {
  const dup = prepareDuplicateFormValues(addr());
  assert.equal(Object.prototype.hasOwnProperty.call(dup, "id"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dup, "createdAt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dup, "updatedAt"), false);
});

// 17. Duplizieren übernimmt keine Defaultflags.
test("17 — prepareDuplicateFormValues setzt Default-/Favoriten-Flags zurück", () => {
  const source = addr({ isDefaultSender: true, isDefaultRecipient: true, favorite: true });
  const dup = prepareDuplicateFormValues(source);
  assert.equal(dup.isDefaultSender, false);
  assert.equal(dup.isDefaultRecipient, false);
  assert.equal(dup.favorite, false);
});

// 18. Duplizieren übernimmt keinen Archivstatus.
test("18 — prepareDuplicateFormValues enthält kein archivedAt-Feld", () => {
  const dup = prepareDuplicateFormValues(addr({ archivedAt: "2026-01-01T00:00:00Z" }));
  assert.equal(Object.prototype.hasOwnProperty.call(dup, "archivedAt"), false);
});

test("18b — Duplikat-Label wird sinnvoll gekennzeichnet, ohne das Original zu verändern", () => {
  const source = addr({ label: "Lager Berlin" });
  const dup = prepareDuplicateFormValues(source);
  assert.equal(dup.label, "Kopie von Lager Berlin");
  assert.equal(source.label, "Lager Berlin", "Original-Objekt bleibt unverändert");
  const noLabel = prepareDuplicateFormValues(addr({ label: "", company: "Foo GmbH" }));
  assert.equal(noLabel.label, "Kopie von Foo GmbH");
  const noLabelNoCompany = prepareDuplicateFormValues(addr({ label: "", company: "" }));
  assert.equal(noLabelNoCompany.label, "");
});

// 19. Adressobjekt wird korrekt in bestehendes Shipment-Formshape gemappt.
test("19 — mapAddressToShipmentFormPatch mappt auf das bestehende NewShipmentPage-Formshape", () => {
  const a = addr({ role: ROLE_SENDER, company: "Beispiel GmbH", contactName: "Max Mustermann", streetAndNumber: "Musterstraße 1", addressAdd: "Tor 3", postalCode: "10115", city: "Berlin", country: "de", email: "a@b.de", phone: "+49 1" });
  const patch = mapAddressToShipmentFormPatch(a, "s");
  assert.deepEqual(patch, {
    s_company: "Beispiel GmbH", s_fullName: "Max Mustermann", s_street: "Musterstraße 1",
    s_addition: "Tor 3", s_zip: "10115", s_city: "Berlin", s_country: "DE",
    s_phone: "+49 1", s_email: "a@b.de",
  });
  const rPatch = mapAddressToShipmentFormPatch(a, "r");
  assert.equal(Object.keys(rPatch).every(k => k.startsWith("r_")), true);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "s_state"), false, "kein state-Feld, da NewShipmentPage keins hat");
});

// 20. „both" erfordert Auswahl sender/recipient für „Neue Sendung".
test("20 — resolveNewShipmentRole: both → choose; sender/recipient → direct", () => {
  assert.deepEqual(resolveNewShipmentRole(addr({ role: ROLE_BOTH })), { type: "choose" });
  assert.deepEqual(resolveNewShipmentRole(addr({ role: ROLE_SENDER })), { type: "direct", role: "sender" });
  assert.deepEqual(resolveNewShipmentRole(addr({ role: ROLE_RECIPIENT })), { type: "direct", role: "recipient" });
});

// 21. Backend-Fehlercodes werden verständlich gemappt.
test("21 — Fehlercodes werden auf verständliche, deutsche Meldungen gemappt (keine Backend-Rohtexte)", () => {
  assert.match(mapAddressErrorToMessage("ADDRESS_DEFAULT_ROLE_CONFLICT"), /nicht als Standard verwendet werden/);
  assert.match(mapAddressErrorToMessage("INVALID_POSTAL_CODE_FORMAT"), /Postleitzahl/);
  assert.match(mapAddressErrorToMessage("ADDRESS_DELETE_FAILED"), /gelöscht/);
  assert.match(mapAddressErrorToMessage("ADDRESS_NOT_FOUND"), /nicht gefunden/);
  assert.match(mapAddressErrorToMessage("POSTAL_CODE_REQUIRED"), /Postleitzahl erforderlich/);
  assert.match(mapAddressErrorToMessage("ADDRESS_ROLE_INVALID"), /Rolle/);
  assert.match(mapAddressErrorToMessage("ADDRESS_LIMIT_INVALID"), /Seitengröße/);
  assert.match(mapAddressErrorToMessage("ADDRESS_CURSOR_INVALID"), /Liste/);
  assert.match(mapAddressErrorToMessage("ADDRESS_INVALID"), /Eingaben/);
  const generic = mapAddressErrorToMessage("SOME_UNKNOWN_SQL_CONSTRAINT_VIOLATION");
  assert.doesNotMatch(generic, /SQL|constraint|SOME_UNKNOWN/i, "keine internen Backend-Details");
});

// 22. Pagination fügt Ergebnisse ohne Duplikate an.
test("22 — appendPageResults dedupliziert nach id", () => {
  const existing = [addr({ id: 1 }), addr({ id: 2 })];
  const next = [addr({ id: 2 }), addr({ id: 3 })];
  const merged = appendPageResults(existing, next);
  assert.deepEqual(merged.map(a => a.id), [1, 2, 3]);
});

// 23. „Keine Ergebnisse" wird von „noch keine Adressen" unterschieden.
test("23 — resolveEmptyStateKind unterscheidet none/no-results/no-favorites", () => {
  assert.equal(resolveEmptyStateKind({ resultCount: 0, hasQuery: false, favoritesOnly: false }), "none");
  assert.equal(resolveEmptyStateKind({ resultCount: 0, hasQuery: true, favoritesOnly: false }), "no-results");
  assert.equal(resolveEmptyStateKind({ resultCount: 0, hasQuery: false, favoritesOnly: true }), "no-favorites");
  assert.equal(resolveEmptyStateKind({ resultCount: 3, hasQuery: false, favoritesOnly: false }), null);
});

// 24. Lösch-Mutation entfernt die Adresse aus der aktuellen Liste.
test("24 — applyAddressMutation: delete entfernt die Zeile, andere Typen ersetzen sie", () => {
  const items = [addr({ id: 1 }), addr({ id: 2 }), addr({ id: 3 })];
  const afterDelete = applyAddressMutation(items, addr({ id: 2 }), "delete");
  assert.deepEqual(afterDelete.map(a => a.id), [1, 3]);
  // andere Mutationstypen ersetzen den Eintrag statt ihn zu entfernen
  const updated = addr({ id: 2, favorite: false });
  const afterFavorite = applyAddressMutation(items, updated, "favorite");
  assert.equal(afterFavorite.length, 3);
  assert.equal(afterFavorite.find(a => a.id === 2).favorite, false);
});

// 25. unbekannte Responsefelder beeinflussen das Formular nicht.
test("25 — addressToFormValues ignoriert unbekannte Response-Felder", () => {
  const dirty = { ...addr(), unexpectedField: "x", __proto__hack: 1, internalDebugFlag: true };
  const form = addressToFormValues(dirty);
  const knownKeys = [
    "label", "company", "contactName", "email", "phone", "streetAndNumber", "addressAdd",
    "postalCode", "city", "state", "country", "notes", "role", "favorite",
    "isDefaultSender", "isDefaultRecipient",
  ];
  assert.deepEqual(Object.keys(form).sort(), knownKeys.sort());
});

// ── Zusätzliche Absicherung: roleParamForTab + toQueryString-Isolation ───────
test("roleParamForTab: sender-Tab → role=sender, recipient-Tab → role=recipient", () => {
  assert.equal(roleParamForTab(TAB_SENDER), "sender");
  assert.equal(roleParamForTab(TAB_RECIPIENT), "recipient");
});

test("toQueryString sendet nur allowlistete Keys (keine erfundenen Parameter)", () => {
  const qs = toQueryString({ q: "berlin", role: "sender", evilParam: "x", limit: 20 });
  assert.doesNotMatch(qs, /evilParam/);
  assert.match(qs, /q=berlin/);
  assert.match(qs, /role=sender/);
  assert.match(qs, /limit=20/);
});

test("validateAddressForm: vollständiges gültiges Formular hat keine Fehler", () => {
  const form = { streetAndNumber: "Musterstraße 1", city: "Berlin", country: "DE", postalCode: "10115", contactName: "Max Mustermann", email: "a@b.de", role: ROLE_SENDER, isDefaultSender: true, isDefaultRecipient: false };
  assert.deepEqual(validateAddressForm(form), {});
});

test("validateAddressForm: fehlendes Land/Straße/Ort werden als Pflichtfeld-Fehler erkannt", () => {
  const errors = validateAddressForm({ streetAndNumber: "", city: "", country: "", postalCode: "", role: ROLE_SENDER });
  assert.ok(errors.streetAndNumber);
  assert.ok(errors.city);
  assert.ok(errors.country);
});

test("validateAddressForm: ungültiger Ländercode (nicht ISO-2) wird abgewiesen", () => {
  const errors = validateAddressForm({ streetAndNumber: "S1", city: "C", country: "DEU", postalCode: "10115", role: ROLE_SENDER });
  assert.ok(errors.country);
});

// ─────────────────────────────────────────────────────────────────────────────
// „Sendung erstellen" — sichtbare Zeilen-/Karten-Aktion + bereinigtes Zahnrad-Menü
// (Aktion aus dem Menü entfernt, als direkt sichtbarer Button platziert).
// ─────────────────────────────────────────────────────────────────────────────
const MENU_HANDLER_KEYS = ["edit", "duplicate", "toggleFavorite", "setDefaultSender", "setDefaultRecipient", "delete"];
const menuKeys = (a) => buildAddressMenuModel(a).map((it) => it.key);

// 26. Button-Text ist exakt „Sendung erstellen" (Fachvorgabe) — keine Variante.
test("26 — CREATE_SHIPMENT_LABEL ist exakt „Sendung erstellen“ (keine abweichende Variante)", () => {
  assert.equal(CREATE_SHIPMENT_LABEL, "Sendung erstellen");
  for (const forbidden of ["Neue Sendung", "Versand erstellen", "Sendung anlegen", "Jetzt versenden", "Buchen"]) {
    assert.notEqual(CREATE_SHIPMENT_LABEL, forbidden);
  }
  assert.equal(CREATE_SHIPMENT_ICON, "package", "sichtbares Paket-Icon aus der bestehenden Icon-Komponente");
});

// 27. Zahnrad-Menü enthält KEINE „Neue Sendung"/„Sendung erstellen"-Aktion mehr.
test("27 — buildAddressMenuModel enthält keine Sendungs-Aktion (aus dem Menü entfernt)", () => {
  for (const role of [ROLE_SENDER, ROLE_RECIPIENT, ROLE_BOTH]) {
    const items = buildAddressMenuModel(addr({ role }));
    assert.equal(items.some((it) => /sendung|shipment|versand|newShipment|createShipment/i.test(it.key)), false, "kein Sendungs-Key");
    assert.equal(items.some((it) => /Sendung|Versand|versenden|Buchen/i.test(it.label)), false, "kein Sendungs-Label");
  }
});

// 28. Verwaltungsaktionen bleiben erhalten und sind korrekt geordnet.
test("28 — Menü behält Bearbeiten/Duplizieren/Favorit/Löschen in korrekter Reihenfolge", () => {
  const keys = menuKeys(addr({ role: ROLE_SENDER, isDefaultSender: false }));
  assert.equal(keys[0], "edit", "Bearbeiten zuerst (Fokusstart)");
  assert.deepEqual(keys.slice(0, 3), ["edit", "duplicate", "toggleFavorite"]);
  assert.equal(keys[keys.length - 1], "delete", "Löschen zuletzt");
  // jeder Key ist einem echten Handler-Prop zuordenbar (kein toter Menüpunkt).
  for (const k of keys) assert.ok(MENU_HANDLER_KEYS.includes(k), `unbekannter Menü-Key: ${k}`);
});

// 29. „Löschen" ist destruktiv abgesetzt: genau EIN Trenner, danger-Markierung.
test("29 — genau ein Trenner vor „Löschen“, Löschen ist danger", () => {
  const items = buildAddressMenuModel(addr({ role: ROLE_BOTH }));
  const separators = items.filter((it) => it.separatorBefore);
  assert.equal(separators.length, 1, "nur ein Trenner (vor Löschen) — keine verwaisten Trenner");
  const del = items.find((it) => it.key === "delete");
  assert.equal(del.separatorBefore, true);
  assert.equal(del.danger, true);
  // Kein anderer Eintrag als „Löschen“ trägt eine danger-Markierung.
  assert.equal(items.filter((it) => it.danger).length, 1);
});

// 30. Favorit-Label spiegelt den aktuellen Favoritenstatus.
test("30 — Favorit-Menüpunkt wechselt Label je nach favorite-Status", () => {
  const on = buildAddressMenuModel(addr({ favorite: true })).find((it) => it.key === "toggleFavorite");
  const off = buildAddressMenuModel(addr({ favorite: false })).find((it) => it.key === "toggleFavorite");
  assert.equal(on.label, "Favorit entfernen");
  assert.equal(off.label, "Als Favorit markieren");
});

// 31. Standard-Absender/-Empfänger folgen exakt der bestehenden Rollenregel.
test("31 — Standard-Aktionen erscheinen rollen- und statusabhängig (unveränderte Regel)", () => {
  // sender (noch nicht Standard) → nur Standard-Absender anbietbar
  const s = menuKeys(addr({ role: ROLE_SENDER, isDefaultSender: false, isDefaultRecipient: false }));
  assert.ok(s.includes("setDefaultSender"));
  assert.ok(!s.includes("setDefaultRecipient"));
  // recipient → nur Standard-Empfänger
  const r = menuKeys(addr({ role: ROLE_RECIPIENT, isDefaultSender: false, isDefaultRecipient: false }));
  assert.ok(r.includes("setDefaultRecipient"));
  assert.ok(!r.includes("setDefaultSender"));
  // both → beide anbietbar
  const b = menuKeys(addr({ role: ROLE_BOTH, isDefaultSender: false, isDefaultRecipient: false }));
  assert.ok(b.includes("setDefaultSender") && b.includes("setDefaultRecipient"));
  // bereits Standard → Aktion verschwindet (kein redundanter Eintrag)
  const already = menuKeys(addr({ role: ROLE_SENDER, isDefaultSender: true }));
  assert.ok(!already.includes("setDefaultSender"));
});
