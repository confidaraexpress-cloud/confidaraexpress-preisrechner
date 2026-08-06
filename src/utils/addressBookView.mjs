// ─────────────────────────────────────────────────────────────────────────────
// Adressbuch — reine, framework-freie Hilfslogik (.mjs, wie bookingGate/postalCode).
// Bündelt: Tab-/Rollen-Mapping, Requestparameter-Aufbau, Formularvalidierung/
// -normalisierung, Fehlertext-Mapping, Duplikat-/Sendungsformular-Mapping und
// Listen-Mutationshelfer. Kein React, kein Netzwerk — nur mit node --test
// geprüfte, deterministische Funktionen.
//
// Backend-Kontrakt (kanonisches Adressobjekt, siehe Aufgabenstellung):
//   { id, label, company, contactName, streetAndNumber, addressAdd, postalCode,
//     city, state, country, email, phone, notes, role, isDefaultSender,
//     isDefaultRecipient, favorite, createdAt, updatedAt }
// ─────────────────────────────────────────────────────────────────────────────
import { validatePostalCode } from "./postalCode.mjs";

// ── Kanonische Backend-Rollenwerte ───────────────────────────────────────────
export const ROLE_SENDER = "sender";
export const ROLE_RECIPIENT = "recipient";
export const ROLE_BOTH = "both";

// ── Sichtbare Tabs („logische Trennung", technisch eine Tabelle) ────────────
export const TAB_SENDER = "sender";       // „Meine Adressen"
export const TAB_RECIPIENT = "recipient"; // „Empfänger"

// Benutzerfreundliche Rollen-Bezeichnung im Formular; API-Shape bleibt exakt
// role: "sender"|"recipient"|"both" (nur die Anzeige-Labels sind kundenfreundlich).
export const UI_ROLE_OPTIONS = [
  { value: ROLE_SENDER, label: "Eigene Adresse" },
  { value: ROLE_RECIPIENT, label: "Empfänger" },
  { value: ROLE_BOTH, label: "Beides" },
];

// ── Tab-/Rollen-Zuordnung (Produktentscheidung #3/#4) ───────────────────────
// „both" gehört zu BEIDEN Ansichten. Sender-Tab: sender+both. Empfänger-Tab:
// recipient+both.
export function belongsToTab(address, tab) {
  const role = address?.role;
  if (tab === TAB_SENDER) return role === ROLE_SENDER || role === ROLE_BOTH;
  if (tab === TAB_RECIPIENT) return role === ROLE_RECIPIENT || role === ROLE_BOTH;
  return false;
}

// „Standard-Absender" nur bei sender/both (Regel #1).
export function canSetDefaultSender(address) {
  return address?.role === ROLE_SENDER || address?.role === ROLE_BOTH;
}

// „Standard-Empfänger" nur bei recipient/both (Regel #2).
export function canSetDefaultRecipient(address) {
  return address?.role === ROLE_RECIPIENT || address?.role === ROLE_BOTH;
}

// ── Rollen-/Default-Konsistenz (clientseitige Frühwarnung) ──────────────────
// Erkennt widersprüchliche Kombinationen, OHNE die Rolle automatisch/still zu
// verändern — der Aufrufer deaktiviert die betroffene Checkbox und zeigt den
// Hinweis. Rückgabe: {} (konsistent) oder { isDefaultSender: msg } / { isDefaultRecipient: msg }.
export function validateRoleDefaultConsistency({ role, isDefaultSender, isDefaultRecipient }) {
  const errors = {};
  if (isDefaultSender && !(role === ROLE_SENDER || role === ROLE_BOTH)) {
    errors.isDefaultSender = "Nur eine eigene Adresse oder eine Adresse vom Typ Beides kann Standard-Absender sein.";
  }
  if (isDefaultRecipient && !(role === ROLE_RECIPIENT || role === ROLE_BOTH)) {
    errors.isDefaultRecipient = "Nur ein Empfänger oder eine Adresse vom Typ Beides kann Standard-Empfänger sein.";
  }
  return errors;
}

// ── Requestparameter (Suche/Filter/Pagination) ──────────────────────────────
// Nur explizit erlaubte Query-Parameter, leere Werte werden NICHT gesendet.
const ADDRESS_LIST_QUERY_KEYS = ["q", "role", "favorite", "cursor", "limit"];

// WICHTIG — bewusste, dokumentierte Annahme (API-Gap, siehe Abschlussbericht):
// Das Backend ist extern und in diesem Repo nicht einsehbar; ob `role=sender`
// serverseitig bereits sender+both liefert (wie die Produktentscheidung #3/#4
// es für die ANZEIGE verlangt) konnte nicht verifiziert werden. Diese Zuordnung
// ist bewusst zentral UND isoliert gehalten: sollte sich die Annahme als falsch
// erweisen, genügt eine Anpassung dieser einen Konstante/Funktion.
const TAB_TO_ROLE_PARAM = { [TAB_SENDER]: ROLE_SENDER, [TAB_RECIPIENT]: ROLE_RECIPIENT };
export function roleParamForTab(tab) {
  return TAB_TO_ROLE_PARAM[tab] || null;
}

// Baut die Query-String-Params für GET /api/kunde/addresses. `cursor` wird 1:1
// aus dem vorherigen nextCursor übernommen (kein Erfinden/Verändern). Der
// Favoritenfilter wird nur bei true gesendet — kein „false" im Query-String,
// das der Server evtl. anders interpretiert.
export function buildAddressListParams({ tab, q, favoritesOnly, cursor, limit } = {}) {
  const params = {};
  const role = roleParamForTab(tab);
  if (role) params.role = role;
  const trimmedQ = typeof q === "string" ? q.trim() : "";
  if (trimmedQ) params.q = trimmedQ;
  if (favoritesOnly === true) params.favorite = "true";
  if (cursor != null && cursor !== "") params.cursor = String(cursor);
  if (limit != null) params.limit = String(limit);
  return params;
}

// Reiner Query-String-Builder (allowlisted Keys, leere Werte weggelassen) —
// getrennt von buildAddressListParams, damit die API-Schicht ihn direkt nutzen
// kann, ohne die Filter-Zuordnung zu duplizieren.
export function toQueryString(params) {
  const q = new URLSearchParams();
  for (const key of ADDRESS_LIST_QUERY_KEYS) {
    const raw = params?.[key];
    if (raw === undefined || raw === null) continue;
    const val = String(raw).trim();
    if (val !== "") q.set(key, val);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Stabiler Cache-Schlüssel für den aktuellen Such-/Filterzustand. Ändert er
// sich, muss der Aufrufer Cursor + geladene Items zurücksetzen (neue Suche);
// bleibt er gleich, ist ein „Mehr laden" (nur Cursor ändert sich) korrekt.
export function addressListStateKey({ tab, q, favoritesOnly }) {
  const trimmedQ = typeof q === "string" ? q.trim() : "";
  return JSON.stringify([tab, trimmedQ, !!favoritesOnly]);
}

// ── Pagination: Ergebnisse ohne Duplikate anfügen ───────────────────────────
export function appendPageResults(existingItems, newItems) {
  const seen = new Set((existingItems || []).map((a) => a.id));
  const deduped = (newItems || []).filter((a) => !seen.has(a.id));
  return [...(existingItems || []), ...deduped];
}

// ── Empty-State-Unterscheidung ──────────────────────────────────────────────
// „noch keine Adressen" vs. „keine Suchtreffer" vs. „keine Favoriten" — je nach
// aktivem Filter, NUR wenn resultCount===0.
export function resolveEmptyStateKind({ resultCount, hasQuery, favoritesOnly }) {
  if (resultCount > 0) return null;
  if (hasQuery) return "no-results";
  if (favoritesOnly) return "no-favorites";
  return "none";
}

// ── Formularmodell ────────────────────────────────────────────────────────────
// Leeres Formular für „Neue Adresse". uiRole ist bewusst der Backend-Rollenwert
// selbst (sender/recipient/both) — die Oberfläche zeigt nur andere Labels
// (UI_ROLE_OPTIONS), das Shape bleibt identisch.
export function emptyAddressForm(initialRole = ROLE_SENDER) {
  return {
    label: "", company: "", contactName: "", email: "", phone: "",
    streetAndNumber: "", addressAdd: "", postalCode: "", city: "", state: "", country: "DE",
    notes: "", role: initialRole, favorite: false, isDefaultSender: false, isDefaultRecipient: false,
  };
}

// Kanonisches Adressobjekt → Formularmodell. Liest AUSSCHLIESSLICH bekannte
// Felder (unbekannte Response-Felder beeinflussen das Formular nicht).
export function addressToFormValues(address) {
  const a = address || {};
  return {
    label: a.label || "",
    company: a.company || "",
    contactName: a.contactName || "",
    email: a.email || "",
    phone: a.phone || "",
    streetAndNumber: a.streetAndNumber || "",
    addressAdd: a.addressAdd || "",
    postalCode: a.postalCode || "",
    city: a.city || "",
    state: a.state || "",
    country: (a.country || "DE").toUpperCase(),
    notes: a.notes || "",
    role: a.role || ROLE_SENDER,
    favorite: a.favorite === true,
    isDefaultSender: a.isDefaultSender === true,
    isDefaultRecipient: a.isDefaultRecipient === true,
  };
}

// Formularmodell → Duplikat-Formularmodell: KEINE id/Defaultflags übernehmen;
// Label sinnvoll als „Kopie von …" kennzeichnen, ohne bestehende
// Labels zu zerstören (nur eine NEUE, unabhängige Kopie wird erzeugt).
export function prepareDuplicateFormValues(address) {
  const base = addressToFormValues(address);
  const sourceLabel = (address?.label || "").trim();
  const sourceCompany = (address?.company || "").trim();
  const newLabel = sourceLabel ? `Kopie von ${sourceLabel}` : (sourceCompany ? `Kopie von ${sourceCompany}` : "");
  return {
    ...base,
    label: newLabel,
    favorite: false,
    isDefaultSender: false,
    isDefaultRecipient: false,
  };
}

// ── Validierung ──────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO2_RE = /^[A-Z]{2}$/;

function postalErrorMessage(country, value) {
  const pc = validatePostalCode(country, value);
  if (pc.valid) return null;
  if (pc.code === "POSTAL_CODE_REQUIRED") return "PLZ ist ein Pflichtfeld.";
  return pc.example ? `PLZ passt nicht zum Landesformat (Beispiel: ${pc.example}).` : "PLZ ist ungültig.";
}

// Liefert ein Fehlerobjekt (leer = gültig). Rein clientseitig — schnelles
// Feedback; das Backend bleibt autoritativ (validiert erneut vor Persistenz).
export function validateAddressForm(form) {
  const f = form || {};
  const errors = {};

  if (!f.streetAndNumber?.trim()) errors.streetAndNumber = "Straße und Hausnummer ist ein Pflichtfeld.";
  if (!f.city?.trim()) errors.city = "Ort ist ein Pflichtfeld.";

  const country = (f.country || "").trim().toUpperCase();
  if (!country) errors.country = "Land ist ein Pflichtfeld.";
  else if (!ISO2_RE.test(country)) errors.country = "Land muss ein gültiger ISO-2-Code sein.";

  { const m = postalErrorMessage(country, f.postalCode); if (m) errors.postalCode = m; }

  if (f.contactName && f.contactName.length > 35) {
    errors.contactName = "Ansprechpartner darf maximal 35 Zeichen enthalten.";
  }
  if (f.email && !EMAIL_RE.test(f.email.trim())) {
    errors.email = "E-Mail-Adresse ist ungültig.";
  }

  const roleErrors = validateRoleDefaultConsistency(f);
  Object.assign(errors, roleErrors);

  return errors;
}

// Formularmodell → API-Payload (kanonisches Shape). Leere optionale Felder
// werden als null normalisiert (nicht als ""), Pflichtfelder getrimmt, Land
// großgeschrieben. Keine Felder ergänzen, die das Backend-MVP nicht speichert.
export function normalizeAddressForm(form) {
  const f = form || {};
  const optional = (v) => {
    const t = typeof v === "string" ? v.trim() : v;
    return t ? t : null;
  };
  return {
    label: optional(f.label),
    company: optional(f.company),
    contactName: optional(f.contactName),
    email: optional(f.email),
    phone: optional(f.phone),
    streetAndNumber: (f.streetAndNumber || "").trim(),
    addressAdd: optional(f.addressAdd),
    postalCode: (f.postalCode || "").trim(),
    city: (f.city || "").trim(),
    state: optional(f.state),
    country: (f.country || "").trim().toUpperCase(),
    notes: optional(f.notes),
    role: f.role,
    favorite: f.favorite === true,
    isDefaultSender: f.isDefaultSender === true,
    isDefaultRecipient: f.isDefaultRecipient === true,
  };
}

// ── Fehlercode-Mapping (Backend → verständliche deutsche Meldung) ───────────
// Keine internen Backend-/SQL-Details. Unbekannte Codes → generische Meldung.
const ERROR_MESSAGES = {
  ADDRESS_NOT_FOUND: "Die Adresse wurde nicht gefunden oder ist nicht mehr verfügbar.",
  ADDRESS_INVALID: "Die Adressangaben sind unvollständig oder ungültig. Bitte prüfen Sie Ihre Eingaben.",
  ADDRESS_ROLE_INVALID: "Die gewählte Rolle ist für diese Adresse nicht gültig.",
  ADDRESS_DEFAULT_ROLE_CONFLICT: "Diese Adresse kann mit der gewählten Rolle nicht als Standard verwendet werden.",
  ADDRESS_DELETE_FAILED: "Die Adresse konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  ADDRESS_LIMIT_INVALID: "Die angeforderte Seitengröße ist ungültig.",
  ADDRESS_CURSOR_INVALID: "Die Liste konnte nicht fortgesetzt werden. Bitte laden Sie die Seite neu.",
  INVALID_POSTAL_CODE_FORMAT: "Bitte prüfen Sie die Postleitzahl für das ausgewählte Land.",
  POSTAL_CODE_REQUIRED: "Für das ausgewählte Land ist eine Postleitzahl erforderlich.",
};
const GENERIC_ERROR_MESSAGE = "Die Adresse konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.";

export function mapAddressErrorToMessage(code) {
  return ERROR_MESSAGES[code] || GENERIC_ERROR_MESSAGE;
}

// ── „Neue Sendung" aus einer Adresse ─────────────────────────────────────────
// sender/recipient → direkt zuordenbar. both → der Aufrufer muss vorher fragen
// (Auswahl-Dialog), da die Rolle nicht eindeutig ist. Unbekannte Rolle → blockiert.
export function resolveNewShipmentRole(address) {
  if (address?.role === ROLE_BOTH) return { type: "choose" };
  if (address?.role === ROLE_SENDER) return { type: "direct", role: "sender" };
  if (address?.role === ROLE_RECIPIENT) return { type: "direct", role: "recipient" };
  return { type: "blocked" };
}

// Adressobjekt → Patch für das bestehende NewShipmentPage-Formular (Präfix
// "s_" oder "r_"). Reiner Wertekopie — KEINE dauerhafte addressId-Referenz.
// JUMiNGO-Mapping: contactName→fullName, streetAndNumber→street,
// addressAdd→addition, postalCode→zip, company→company, city/country/email/
// phone direkt. `state` hat im bestehenden Formular kein Zielfeld → bewusst
// NICHT gesetzt (keine Felder ergänzen, die es nicht gibt).
export function mapAddressToShipmentFormPatch(address, prefix) {
  const a = address || {};
  const p = prefix === "r" ? "r" : "s";
  return {
    [`${p}_company`]: a.company || "",
    [`${p}_fullName`]: a.contactName || "",
    [`${p}_street`]: a.streetAndNumber || "",
    [`${p}_addition`]: a.addressAdd || "",
    [`${p}_zip`]: a.postalCode || "",
    [`${p}_city`]: a.city || "",
    [`${p}_country`]: (a.country || "DE").toUpperCase(),
    [`${p}_phone`]: a.phone || "",
    [`${p}_email`]: a.email || "",
  };
}

// ── Sichtbare Zeilen-/Karten-Hauptaktion „Sendung erstellen" ────────────────
// Exakter, verbindlicher Button-Text (Fachvorgabe — NICHT „Neue Sendung",
// „Versand erstellen", „Sendung anlegen", „Jetzt versenden" oder „Buchen").
// Die Aktion startet über den bestehenden onNewShipment-Flow (resolveNewShipment
// Role + mapAddressToShipmentFormPatch) das vorausgefüllte Versandformular —
// sie bucht nichts. Als Konstante hier gehalten, damit Desktop-Zeile und
// Mobil-Karte denselben Text/dasselbe Icon verwenden (kein Drift) und der Text
// isoliert testbar bleibt.
export const CREATE_SHIPMENT_LABEL = "Sendung erstellen";
export const CREATE_SHIPMENT_ICON = "package";

// ── Verwaltungs-Aktionsmenü (Zahnrad) — reines, geordnetes Anzeigemodell ─────
// Liefert die geordneten Menüeinträge des Kebab-/Zahnrad-Menüs. Enthält
// AUSSCHLIESSLICH Verwaltungsaktionen; „Sendung erstellen"/„Neue Sendung" ist
// bewusst KEIN Menüpunkt mehr (jetzt sichtbarer Zeilen-/Karten-Button). Die
// Sichtbarkeit von „Standard-Absender/-Empfänger" folgt exakt der bestehenden
// Rollenregel (canSetDefaultSender/-Recipient) und dem bereits gesetzten
// Standard. Reihenfolge: Verwaltung (Bearbeiten → Duplizieren → Favorit →
// ggf. Standard) — Trenner — Destruktiv (Löschen). Jeder Eintrag: { key, label,
// icon, danger?, separatorBefore? }. `key` mappt der Aufrufer auf den jeweiligen
// Handler-Prop (kein Handler in der reinen Logik).
export function buildAddressMenuModel(address) {
  const a = address || {};
  const items = [
    { key: "edit", label: "Bearbeiten", icon: "form" },
    { key: "duplicate", label: "Duplizieren", icon: "copy" },
    { key: "toggleFavorite", label: a.favorite ? "Favorit entfernen" : "Als Favorit markieren", icon: "star" },
  ];
  if (canSetDefaultSender(a) && !a.isDefaultSender) {
    items.push({ key: "setDefaultSender", label: "Als Standard-Absender setzen", icon: "shieldCheck" });
  }
  if (canSetDefaultRecipient(a) && !a.isDefaultRecipient) {
    items.push({ key: "setDefaultRecipient", label: "Als Standard-Empfänger setzen", icon: "shieldCheck" });
  }
  // Destruktive Aktion zuletzt, durch einen Trenner abgesetzt.
  items.push({ key: "delete", label: "Löschen", icon: "trash", danger: true, separatorBefore: true });
  return items;
}

// ── Zeilen-/Karten-Badges: höchstens drei gleichzeitig ──────────────────────
// Priorität: Standard (blau, wichtigste Information) → Favorit (gelb) → Rolle
// (grau, ruhigster Marker, immer vorhanden). Sind BEIDE Standard-Flags gesetzt
// (nur bei role "both" möglich), werden sie zu EINEM Badge zusammengefasst
// statt zwei separaten — sonst wären bei einem zusätzlich favorisierten
// Eintrag vier Badges gleichzeitig sichtbar. Die zugrunde liegenden Flags
// bleiben dabei unangetastet; nur die Darstellung fasst sie zusammen.
const ROLE_BADGE_LABEL = { [ROLE_SENDER]: "Absender", [ROLE_RECIPIENT]: "Empfänger", [ROLE_BOTH]: "Beides" };
export function addressBadgeList(address) {
  const a = address || {};
  const badges = [];
  if (a.isDefaultSender && a.isDefaultRecipient) {
    badges.push({ key: "default", text: "Standard-Absender & -Empfänger", tone: "blue" });
  } else if (a.isDefaultSender) {
    badges.push({ key: "default", text: "Standard-Absender", tone: "blue" });
  } else if (a.isDefaultRecipient) {
    badges.push({ key: "default", text: "Standard-Empfänger", tone: "blue" });
  }
  if (a.favorite) badges.push({ key: "favorite", text: "Favorit", tone: "yellow" });
  badges.push({ key: "role", text: ROLE_BADGE_LABEL[a.role] || a.role, tone: "gray" });
  return badges;
}

// ── Listen-Mutationshelfer (sichere Mutation → Refresh-Ersatz ohne Reload) ──
// Löschen entfernt die Adresse aus der aktuell sichtbaren Liste. Andere
// Mutationen (Bearbeiten/Favorit/Standard) ersetzen den Eintrag 1:1 durch die
// vom Server bestätigte Version.
export function applyAddressMutation(items, address, type) {
  const list = items || [];
  if (type === "delete") {
    return list.filter((a) => a.id !== address.id);
  }
  if (type === "update" || type === "favorite" || type === "defaultSender" || type === "defaultRecipient") {
    return list.map((a) => (a.id === address.id ? address : a));
  }
  return list;
}
