// ── Öffentliche Konfiguration des Vertriebspartnerprogramms ──────────────────
//
// GET /api/sales-partner/public-config (ohne Anmeldung) sagt, ob die
// Partnerregistrierung geöffnet ist, ob Empfehlungslinks gelten, wie lange ein
// Empfehlungscode im Browser gehalten werden darf und welche Fassung der
// Partnervereinbarung gilt — als Version (`agreementVersion`) und als
// registrierte Fassung (`agreement`: Version, Gültigkeit, Dokumentpfad). Eine
// Adresse der Vereinbarung nennt die Konfiguration nicht mehr: gelesen wird sie
// auf der eigenen Seite /partnervereinbarung, die ausschließlich das
// registrierte Dokument verlinkt (utils/salesPartnerAgreement.mjs).
//
// Seit dem Pre-Live-Registrierungsweg nennt der Server zusätzlich den offenen
// Weg: `registrationMode` = "production" | "prelive_test" | "closed".
// `registrationEnabled` bleibt der unveränderte produktive Vertrag. Im
// Pre-Live-Testweg erscheint dasselbe Formular ohne Vertragsannahme; ob ein
// Antrag ein Testantrag ist, entscheidet ausschließlich der Server.
//
// Fail-closed in jede Richtung: ein fehlendes Feld, ein falscher Typ oder ein
// gescheiterter Aufruf ergibt „geschlossen" bzw. „keine Speicherung". Es wird
// nichts geraten und kein Ersatzwert erfunden — insbesondere entscheidet die
// Oberfläche nie selbst, dass Empfehlungslinks gelten (Datenschutzerklärung:
// ohne Freigabe keine browserseitige Speicherung).
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { normalizeAgreement } from "./salesPartnerAgreement.mjs";

// Obergrenze der Aufbewahrung, die der Browser überhaupt akzeptiert. Der
// Vertrag nennt 30 Tage; ein Wert jenseits eines Jahres wäre kein Versehen
// mehr, sondern eine Datenschutzfrage — dann lieber gar nicht speichern.
export const MAX_RETENTION_DAYS = 365;

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// Die vom Server genannten offenen Wege; alles andere ist „closed".
const REGISTRATION_MODES = Object.freeze(["production", "prelive_test"]);

/** Aufbewahrungsdauer in ganzen Tagen (1 … 365) oder null. */
export function retentionDaysOf(raw) {
  return Number.isInteger(raw) && raw >= 1 && raw <= MAX_RETENTION_DAYS ? raw : null;
}

/** Normalisierte Konfiguration; jede Unklarheit ergibt den geschlossenen Zustand. */
export function parseSalesPartnerPublicConfig(raw) {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.freeze({
    registrationEnabled: d.registrationEnabled === true,
    registrationMode: REGISTRATION_MODES.includes(d.registrationMode) ? d.registrationMode : "closed",
    referralsEnabled: d.referralsEnabled === true,
    referralRetentionDays: retentionDaysOf(d.referralRetentionDays),
    agreementVersion: text(d.agreementVersion),
    agreement: normalizeAgreement(d.agreement),
  });
}

/** Der Zustand ohne (lesbare) Serverantwort: alles geschlossen. */
export const FAIL_CLOSED_PUBLIC_CONFIG = parseSalesPartnerPublicConfig(null);

/** Darf ein Empfehlungscode im Browser aufbewahrt werden? Nur mit beidem:
 *  ausdrücklicher Freigabe UND gültiger Aufbewahrungsdauer. */
export function referralPersistenceAllowed(config) {
  return !!config && config.referralsEnabled === true && retentionDaysOf(config.referralRetentionDays) !== null;
}

/** Ist die Partnerregistrierung tatsächlich nutzbar? Der Server öffnet sie nur
 *  mit einer veröffentlichten, gültigen Vereinbarung. Die Oberfläche verlangt
 *  zusätzlich, dass die zuzustimmende Fassung genau die registrierte ist und
 *  ihr Dokument verlinkt werden kann — niemand stimmt einer Fassung zu, die er
 *  nicht öffnen kann. Jede Abweichung lässt das Formular geschlossen. */
export function partnerRegistrationOpen(config) {
  if (!config || config.registrationEnabled !== true) return false;
  const fassung = text(config.agreementVersion);
  const vereinbarung = config.agreement;
  return fassung !== null && !!vereinbarung && vereinbarung.version === fassung && vereinbarung.documentPath !== null;
}

/** Welcher Weg der Partnerregistrierung ist offen?
 *  "production"   — nur mit der strengen Vertragsprüfung oben (partnerRegistrationOpen);
 *  "prelive_test" — nur, wenn der Server ihn ausdrücklich nennt und die
 *                   produktive Registrierung NICHT offen ist (der Server
 *                   schließt beides gegenseitig aus; die Oberfläche auch);
 *  "closed"       — in jedem anderen Fall. */
export function partnerRegistrationMode(config) {
  if (partnerRegistrationOpen(config)) return "production";
  if (config && config.registrationEnabled !== true && config.registrationMode === "prelive_test") return "prelive_test";
  return "closed";
}
