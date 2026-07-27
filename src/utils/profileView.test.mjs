// Tests für die reine Profil-Logik (bereichsweise Bearbeitung). Läuft über
// `node --test` (npm test). Deckt PATCH-Body-Bau + Mass-Assignment-Schutz,
// Dirty-State, Ein-Karten-Editregel, Validierung und die funktionalen Texte ab.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_FIELDS, CONTACT_FIELDS, FIELD_MAXLEN,
  companyBaseline, contactBaseline,
  buildCompanyPatch, buildContactPatch,
  isCompanyDirty, isContactDirty,
  validateCompanyForm, validateContactForm, isFormValid,
  canSaveCompany, canSaveContact,
  isEditActionDisabled,
  companyAddressLine, paymentTermValue,
  PROFILE_TEXT,
} from "./profileView.mjs";

const USER = {
  id: 7, name: "Miguel Vance", email: "login@firma.de", status: "approved", role: "customer",
  company_name: "ConfidaraExpress UG", vat_id: "DE123456789",
  street: "Musterstraße 1", zip: "73207", city: "Plochingen", country: "DE",
  payment_term: 7, credit_limit: 2000, credit_used: 0,
};

// Verbotene Felder, die niemals in einem Profil-PATCH landen dürfen (§14/§19).
const FORBIDDEN = ["email", "password", "role", "status", "payment_term", "paymentTerm",
  "credit_limit", "credit_used", "creditLimit", "creditUsed", "id", "user_id", "userId",
  "passwordChangedAt", "pendingEmailChange"];

// ── Baselines ────────────────────────────────────────────────────────────────
test("1 — companyBaseline übernimmt genau die Unternehmensfelder", () => {
  const b = companyBaseline(USER);
  assert.deepEqual(Object.keys(b).sort(), [...COMPANY_FIELDS].sort());
  assert.equal(b.company_name, "ConfidaraExpress UG");
  assert.equal(b.country, "DE");
});

test("2 — companyBaseline setzt Deutschland-Default bei fehlendem Land", () => {
  assert.equal(companyBaseline({}).country, "DE");
  assert.equal(companyBaseline({ country: "AT" }).country, "AT");
});

test("3 — contactBaseline enthält nur den Namen", () => {
  assert.deepEqual(contactBaseline(USER), { name: "Miguel Vance" });
  assert.deepEqual(Object.keys(contactBaseline(USER)), CONTACT_FIELDS);
});

// ── PATCH-Body + Mass-Assignment-Schutz ──────────────────────────────────────
test("4 — buildCompanyPatch enthält exakt die 6 Unternehmensfelder", () => {
  const p = buildCompanyPatch(companyBaseline(USER));
  assert.deepEqual(Object.keys(p).sort(), [...COMPANY_FIELDS].sort());
});

test("5 — buildCompanyPatch enthält KEIN verbotenes Feld, auch wenn im Form-State", () => {
  // Selbst wenn der Formular-State manipuliert würde, dürfen fremde Keys nicht durchsickern.
  const dirty = { ...companyBaseline(USER), email: "hack@x.de", role: "admin", status: "approved", payment_term: 999, name: "X" };
  const p = buildCompanyPatch(dirty);
  for (const f of FORBIDDEN) assert.equal(Object.prototype.hasOwnProperty.call(p, f), false, `Feld ${f} darf nicht im Body sein`);
  assert.equal(Object.prototype.hasOwnProperty.call(p, "name"), false, "Ansprechpartnername gehört nicht in den Unternehmens-Patch");
});

test("6 — buildContactPatch enthält ausschließlich name", () => {
  const dirty = { name: "Neu", email: "hack@x.de", company_name: "X", role: "admin", phone: "+49 1" };
  const p = buildContactPatch(dirty);
  assert.deepEqual(Object.keys(p), ["name"]);
  for (const f of [...FORBIDDEN, "company_name", "phone"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(p, f), false, `Feld ${f} darf nicht im Ansprechpartner-Body sein`);
  }
});

test("7 — buildCompanyPatch trimmt und normalisiert das Land auf Großbuchstaben", () => {
  const p = buildCompanyPatch({ company_name: "  ACME  ", vat_id: " DE1 ", street: " S 1 ", zip: " 10115 ", city: " Berlin ", country: "de" });
  assert.equal(p.company_name, "ACME");
  assert.equal(p.vat_id, "DE1");
  assert.equal(p.street, "S 1");
  assert.equal(p.zip, "10115");
  assert.equal(p.city, "Berlin");
  assert.equal(p.country, "DE");
});

test("8 — buildContactPatch trimmt den Namen", () => {
  assert.equal(buildContactPatch({ name: "  Miguel Vance  " }).name, "Miguel Vance");
});

// ── Dirty-State ──────────────────────────────────────────────────────────────
test("9 — isCompanyDirty: identische Werte sind nicht dirty", () => {
  const base = companyBaseline(USER);
  assert.equal(isCompanyDirty({ ...base }, base), false);
});

test("10 — isCompanyDirty: reine Whitespace-/Fokusänderung zählt nicht", () => {
  const base = companyBaseline(USER);
  assert.equal(isCompanyDirty({ ...base, company_name: "  ConfidaraExpress UG  " }, base), false);
});

test("11 — isCompanyDirty: echte Wertänderung ist dirty", () => {
  const base = companyBaseline(USER);
  assert.equal(isCompanyDirty({ ...base, city: "Stuttgart" }, base), true);
});

test("12 — isContactDirty erkennt Namensänderung, ignoriert Whitespace", () => {
  const base = contactBaseline(USER);
  assert.equal(isContactDirty({ name: "Miguel Vance" }, base), false);
  assert.equal(isContactDirty({ name: "  Miguel Vance  " }, base), false);
  assert.equal(isContactDirty({ name: "Andere Person" }, base), true);
});

// ── Validierung ──────────────────────────────────────────────────────────────
test("13 — Unternehmensfelder: Überlänge wird abgewiesen", () => {
  const long = "x".repeat(FIELD_MAXLEN.company_name + 1);
  const e = validateCompanyForm({ ...companyBaseline(USER), company_name: long });
  assert.ok(e.company_name);
  assert.equal(isFormValid(e), false);
});

test("14 — Unternehmensfelder: PLZ-Überlänge (>10) wird abgewiesen", () => {
  const e = validateCompanyForm({ ...companyBaseline(USER), zip: "1".repeat(11) });
  assert.ok(e.zip);
});

// Seit der B2B-Profilintegrität ist der Firmenname ein Pflichtfeld und nicht mehr
// leerbar (Backend: PATCH /kunde/profil, code B2B_PROFILE_FIELD_REQUIRED). Die
// übrigen Unternehmensfelder bleiben ausdrücklich optional und leerbar.
// Vollständige Abdeckung: src/utils/profileB2bIntegrity.test.mjs
test("15 — optionale Unternehmensfelder bleiben leerbar, der Firmenname nicht", () => {
  const e = validateCompanyForm({ company_name: "Vance Logistik GmbH", vat_id: "", street: "", zip: "", city: "", country: "" });
  assert.deepEqual(e, {}, "USt-ID, Straße, PLZ, Stadt und Land dürfen leer sein");

  const cleared = validateCompanyForm({ company_name: "", vat_id: "", street: "", zip: "", city: "", country: "" });
  assert.equal(cleared.company_name, "Firmenname ist ein Pflichtfeld.");
  assert.equal(isFormValid(cleared), false);
});

test("16 — ungültiger Ländercode wird abgewiesen, gültiger akzeptiert", () => {
  assert.ok(validateCompanyForm({ ...companyBaseline(USER), country: "XYZ" }).country);
  assert.deepEqual(validateCompanyForm({ ...companyBaseline(USER), country: "FR" }), {});
});

test("17 — Ansprechpartnername: Überlänge (>100) wird abgewiesen, normal ist gültig", () => {
  assert.ok(validateContactForm({ name: "n".repeat(101) }).name);
  assert.deepEqual(validateContactForm({ name: "Miguel Vance" }), {});
});

// ── Speichern-Freigabe ───────────────────────────────────────────────────────
test("18 — canSaveCompany nur bei Änderung, Gültigkeit und nicht speichernd", () => {
  const base = companyBaseline(USER);
  assert.equal(canSaveCompany({ ...base }, base, false), false, "keine Änderung → deaktiviert");
  assert.equal(canSaveCompany({ ...base, city: "Stuttgart" }, base, false), true, "Änderung → aktiv");
  assert.equal(canSaveCompany({ ...base, city: "Stuttgart" }, base, true), false, "während Save → deaktiviert");
  assert.equal(canSaveCompany({ ...base, zip: "1".repeat(11) }, base, false), false, "ungültig → deaktiviert");
});

test("19 — canSaveContact nur bei Änderung und Gültigkeit", () => {
  const base = contactBaseline(USER);
  assert.equal(canSaveContact({ name: "Miguel Vance" }, base, false), false);
  assert.equal(canSaveContact({ name: "Neuer Name" }, base, false), true);
  assert.equal(canSaveContact({ name: "Neuer Name" }, base, true), false);
});

// ── Ein-Karten-Editregel ─────────────────────────────────────────────────────
test("20 — nur eine Karte gleichzeitig editierbar", () => {
  // keine aktive Karte → beide Buttons frei
  assert.equal(isEditActionDisabled(null, "company"), false);
  assert.equal(isEditActionDisabled(null, "contact"), false);
  // Unternehmen aktiv → Ansprechpartner-Button deaktiviert
  assert.equal(isEditActionDisabled("company", "contact"), true);
  assert.equal(isEditActionDisabled("company", "company"), false);
  // Ansprechpartner aktiv → Unternehmen-Button deaktiviert
  assert.equal(isEditActionDisabled("contact", "company"), true);
});

// ── Anzeige-Ableitungen ──────────────────────────────────────────────────────
test("21 — companyAddressLine baut kompakte Adresse nur aus echten Werten", () => {
  assert.equal(companyAddressLine(USER), "Musterstraße 1, 73207 Plochingen");
  assert.equal(companyAddressLine({}), "");
});

test("22 — paymentTermValue nutzt den realen Backendwert", () => {
  assert.equal(paymentTermValue(USER), "7 Tage");
  assert.equal(paymentTermValue({ payment_term: 0 }), "Nicht hinterlegt");
});

// ── Funktionale Texte (§10/§28) ──────────────────────────────────────────────
test("23 — Ansprechpartner-Titel und Untertitel", () => {
  assert.equal(PROFILE_TEXT.contactTitle, "Ansprechpartner");
  assert.equal(PROFILE_TEXT.contactSubtitle, "Kontaktperson für Rückfragen");
});

test("24 — Zahlungsweise-Label und -Wert", () => {
  assert.equal(PROFILE_TEXT.paymentMethodLabel, "Zahlungsweise");
  assert.equal(PROFILE_TEXT.paymentMethodValue, "Rechnung");
});

test("25 — neuer Zahlungsbedingungen-Hinweis (Rücksprache)", () => {
  assert.match(PROFILE_TEXT.paymentHint, /nach Rücksprache mit ConfidaraExpress/);
});

test("26 — Sicherheitshinweis ist sachlich korrekt (geschützt verarbeitet, nicht 'bestätigt')", () => {
  assert.match(PROFILE_TEXT.securityHint, /Login-E-Mail und Passwort/);
  assert.match(PROFILE_TEXT.securityHint, /geschützt verarbeitet/);
  assert.doesNotMatch(PROFILE_TEXT.securityHint, /bestätigt/);
});
