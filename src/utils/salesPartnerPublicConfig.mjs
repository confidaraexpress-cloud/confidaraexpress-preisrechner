// ── Öffentliche Konfiguration des Vertriebspartnerprogramms ──────────────────
//
// GET /api/sales-partner/public-config (ohne Anmeldung) sagt, ob die
// Partnerregistrierung geöffnet ist, ob Empfehlungslinks gelten, wie lange ein
// Empfehlungscode im Browser gehalten werden darf und welche Fassung der
// Partnervereinbarung gilt.
//
// Fail-closed in jede Richtung: ein fehlendes Feld, ein falscher Typ oder ein
// gescheiterter Aufruf ergibt „geschlossen" bzw. „keine Speicherung". Es wird
// nichts geraten und kein Ersatzwert erfunden — insbesondere entscheidet die
// Oberfläche nie selbst, dass Empfehlungslinks gelten (Datenschutzerklärung:
// ohne Freigabe keine browserseitige Speicherung).
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

// Obergrenze der Aufbewahrung, die der Browser überhaupt akzeptiert. Der
// Vertrag nennt 30 Tage; ein Wert jenseits eines Jahres wäre kein Versehen
// mehr, sondern eine Datenschutzfrage — dann lieber gar nicht speichern.
export const MAX_RETENTION_DAYS = 365;

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Aufbewahrungsdauer in ganzen Tagen (1 … 365) oder null. */
export function retentionDaysOf(raw) {
  return Number.isInteger(raw) && raw >= 1 && raw <= MAX_RETENTION_DAYS ? raw : null;
}

/** Normalisierte Konfiguration; jede Unklarheit ergibt den geschlossenen Zustand. */
export function parseSalesPartnerPublicConfig(raw) {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.freeze({
    registrationEnabled: d.registrationEnabled === true,
    referralsEnabled: d.referralsEnabled === true,
    referralRetentionDays: retentionDaysOf(d.referralRetentionDays),
    agreementVersion: text(d.agreementVersion),
    agreementUrl: text(d.agreementUrl),
  });
}

/** Der Zustand ohne (lesbare) Serverantwort: alles geschlossen. */
export const FAIL_CLOSED_PUBLIC_CONFIG = parseSalesPartnerPublicConfig(null);

/** Darf ein Empfehlungscode im Browser aufbewahrt werden? Nur mit beidem:
 *  ausdrücklicher Freigabe UND gültiger Aufbewahrungsdauer. */
export function referralPersistenceAllowed(config) {
  return !!config && config.referralsEnabled === true && retentionDaysOf(config.referralRetentionDays) !== null;
}

/** Ist die Partnerregistrierung tatsächlich nutzbar? Ohne Vereinbarungsfassung
 *  kann niemand zustimmen — dann bleibt das Formular geschlossen. */
export function partnerRegistrationOpen(config) {
  return !!config && config.registrationEnabled === true && text(config.agreementVersion) !== null;
}
