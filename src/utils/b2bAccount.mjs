// Fehlende B2B-Stammdaten eines Kontos — für die Adminsicht.
//
// ConfidaraExpress ist eine reine Geschäftskundenplattform. Seit der Pflicht-
// validierung in POST /register kann kein Konto mehr ohne Firmenname und
// Ansprechpartner entstehen. Alt-Konten aus der Zeit davor können diese Daten
// aber weiterhin vermissen lassen: eine Freischaltung wäre dort eine stille
// Falschzusage, weil jede Buchung serverseitig am fehlenden company_name
// scheitert. Der Admin muss das deshalb vor dem Klick sehen.
//
// Die Bewertung erfolgt ausschließlich auf den Daten, die die Adminrouten ohnehin
// liefern (`company_name`, `name`) — es wird kein zusätzliches API-Feld benötigt.
// Verbindlich bleibt der serverseitige Guard in PATCH /admin/users/:id/status.
//
// Ohne React/DOM, damit direkt mit `node --test` prüfbar.

// Reihenfolge und Beschriftung identisch zu B2B_ACCOUNT_FIELDS im Backend.
export const B2B_ACCOUNT_FIELDS = Object.freeze([
  Object.freeze({ field: "company_name", label: "Firmenname",      missingText: "Firmenname fehlt" }),
  Object.freeze({ field: "name",         label: "Ansprechpartner", missingText: "Ansprechpartner fehlt" }),
]);

// Toleriert die abweichenden Feldnamen, die die Adminseiten defensiv mitlesen
// (companyOf/nameOf), ohne eine zweite API-Variante einzuführen.
const ALIASES = {
  company_name: ["company_name", "company", "firma"],
  name: ["name", "contact_name", "fullName"],
};

function readValue(user, field) {
  for (const key of ALIASES[field] || [field]) {
    const v = user?.[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

// → [{ field, label, missingText }, ...]; leer = vollständig.
export function missingB2BAccountFields(user) {
  const row = user && typeof user === "object" ? user : {};
  return B2B_ACCOUNT_FIELDS.filter((rule) => readValue(row, rule.field) === "");
}

// Anonymisierte Konten werden bewusst ausgenommen: dort sind die Stammdaten
// absichtlich entfernt (Tombstone), das ist kein Datenpflegefall.
export function isAnonymizedAccount(user) {
  const status = user?.status ?? user?.state;
  return status === "anonymized" || !!(user?.anonymized_at || user?.anonymizedAt);
}

// Steuert den Hinweis im Kundendetail / vor dem Freischalten.
// → { show, fields, headline, text }
export function b2bCompletenessHint(user) {
  if (isAnonymizedAccount(user)) return { show: false, fields: [], headline: "", text: "" };

  const fields = missingB2BAccountFields(user);
  if (fields.length === 0) return { show: false, fields: [], headline: "", text: "" };

  const missing = fields.map((f) => f.missingText).join(" · ");
  return {
    show: true,
    fields,
    headline: missing,
    text:
      "ConfidaraExpress ist eine reine Geschäftskundenplattform. Solange diese Angaben fehlen, "
      + "ist eine Freischaltung nicht möglich und eine Buchung würde serverseitig abgelehnt. "
      + "Bitte die Daten beim Kunden erfragen und ergänzen — keine Angaben schätzen oder ersetzen.",
  };
}

// Ist die Freischaltung für dieses Konto blockiert? Nur relevant für das Ziel
// „approved"; Sperren und Zurücksetzen bleiben jederzeit möglich.
export function isApprovalBlocked(user) {
  return missingB2BAccountFields(user).length > 0 && !isAnonymizedAccount(user);
}
