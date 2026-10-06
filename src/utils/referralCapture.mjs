// ── Empfehlungscode aus dem Link erfassen (Vertriebspartnerprogramm) ─────────
//
// Ein Vertriebspartner teilt zwei Links: einen für Kunden (/register?ref=…)
// und einen für neue Partner (/partner-registrieren?ref=…). Diese Datei liest
// den Code beim Start der Anwendung — VOR dem ersten Rendern, nach dem Muster
// von startPwaInstallCapture —, entfernt ihn sofort aus der Adresszeile und
// hält ihn bis zur Registrierung bereit.
//
// Verbindliche Regeln:
//   • Gelesen wird ausschließlich auf /register und /registrieren (Art
//     „customer") sowie /partner-registrieren (Art „partner"). Jede andere
//     Adresse bleibt unangetastet.
//   • Format: genau 8 Zeichen aus [2-9A-HJ-NP-Z] (ohne 0/1/I/O). Die Eingabe
//     ist case-insensitiv, gehalten wird der Code in Großbuchstaben. Ein
//     ungültiger Wert belegt nichts — der Parameter verschwindet trotzdem aus
//     der Adresszeile.
//   • Zunächst NUR im Arbeitsspeicher. In localStorage landet ein Code erst,
//     wenn die öffentliche Konfiguration geladen ist und Empfehlungslinks
//     ausdrücklich freigibt (referralsEnabled === true mit gültiger
//     Aufbewahrungsdauer). Ohne Freigabe wird nichts gespeichert; es gilt nur
//     der Wert der laufenden Sitzung. Sagt der Server ausdrücklich „keine
//     Freigabe", werden gespeicherte Codes entfernt. Ein gescheiterter Abruf
//     ändert nichts (weder speichern noch löschen).
//   • Getrennte Schlüssel je Art, Wert { code, capturedAt }; Ablauf nach der
//     Aufbewahrungsdauer der Konfiguration (ohne geladene Konfiguration die
//     Vertragsdauer von 30 Tagen).
//   • Der erste gültige Klick gewinnt: ein vorhandener, nicht abgelaufener
//     Code wird nicht überschrieben.
//   • Keine Vermischung: die Kundenregistrierung liest nur „customer", die
//     Partnerregistrierung nur „partner"; nach Erfolg wird genau der passende
//     Code gelöscht.
//
// Die Gültigkeit eines Codes kennt ausschließlich der Server — und keine
// Antwort verrät sie. Diese Datei prüft nur die Form.
//
// Framework-frei (.mjs) und ohne Netzzugriff: die Konfiguration lädt der
// Aufrufer (main.jsx übergibt den öffentlichen Abruf aus api/partnerApi.js).

import { referralPersistenceAllowed, retentionDaysOf } from "./salesPartnerPublicConfig.mjs";

export const REFERRAL_PARAM = "ref";
export const REFERRAL_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;
export const REFERRAL_KINDS = Object.freeze(["customer", "partner"]);
export const REFERRAL_STORAGE_KEYS = Object.freeze({
  customer: "ce_ref_customer_v1",
  partner: "ce_ref_partner_v1",
});
// Vertragswert der Aufbewahrung — gilt nur für die Ablaufprüfung, solange in
// dieser Sitzung keine Konfiguration geladen wurde. Er erlaubt NIE ein
// Speichern; das tut ausschließlich die Freigabe des Servers.
export const CONTRACT_RETENTION_DAYS = 30;

const REGISTRIERUNGSPFADE = Object.freeze({
  "/register": "customer",
  "/registrieren": "customer",
  "/partner-registrieren": "partner",
});
// Der Weg, auf dem ein Code einer Art geteilt wird (Admin: „Codes und Links").
const LINKPFADE = Object.freeze({ customer: "/register", partner: "/partner-registrieren" });

const TAG_MS = 24 * 60 * 60 * 1000;
const istArt = (kind) => REFERRAL_KINDS.includes(kind);

/** Bereinigter Code in Großbuchstaben oder null. */
export function normalizeReferralCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/** Art der Registrierung zu einem Pfad oder null (dann wird nichts gelesen). */
export function referralKindForPath(pathname) {
  if (typeof pathname !== "string" || pathname === "") return null;
  const pfad = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return Object.prototype.hasOwnProperty.call(REGISTRIERUNGSPFADE, pfad) ? REGISTRIERUNGSPFADE[pfad] : null;
}

/** Liest `ref` aus einem Suchteil und liefert den Rest ohne `ref`.
 *  Rückgabe: { present, code, search } — `search` beginnt mit „?" oder ist leer. */
export function stripReferralParam(search) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  if (!params.has(REFERRAL_PARAM)) {
    const rest = params.toString();
    return { present: false, code: null, search: rest ? `?${rest}` : "" };
  }
  const code = normalizeReferralCode(params.get(REFERRAL_PARAM));
  params.delete(REFERRAL_PARAM);
  const rest = params.toString();
  return { present: true, code, search: rest ? `?${rest}` : "" };
}

/** Relativer Link, unter dem ein Code seiner Art geteilt wird — oder null. */
export function referralLinkPath(kind, code) {
  const sauber = normalizeReferralCode(code);
  if (!istArt(kind) || !sauber) return null;
  return `${LINKPFADE[kind]}?${REFERRAL_PARAM}=${sauber}`;
}

// ── Speicherzugriff — jede Ausnahme (gesperrter Speicher) bleibt folgenlos ──
function lesen(storage, kind) {
  if (!storage) return null;
  let roh = null;
  try { roh = storage.getItem(REFERRAL_STORAGE_KEYS[kind]); } catch { return null; }
  if (roh === null || roh === undefined) return null;
  let wert = null;
  try { wert = JSON.parse(roh); } catch { wert = null; }
  const code = normalizeReferralCode(wert && typeof wert === "object" ? wert.code : null);
  const capturedAt = wert && typeof wert === "object" ? wert.capturedAt : null;
  if (!code || !Number.isFinite(capturedAt) || capturedAt <= 0 || wert.code !== code) {
    entfernen(storage, kind);           // Unlesbares belegt nichts
    return null;
  }
  return { code, capturedAt };
}

function schreiben(storage, kind, eintrag) {
  if (!storage) return;
  try { storage.setItem(REFERRAL_STORAGE_KEYS[kind], JSON.stringify(eintrag)); } catch { /* gesperrt: dann eben nicht */ }
}

function entfernen(storage, kind) {
  if (!storage) return;
  try { storage.removeItem(REFERRAL_STORAGE_KEYS[kind]); } catch { /* gesperrt: nichts zu tun */ }
}

function abgelaufen(eintrag, jetzt, tage) {
  // Ein Zeitstempel aus der Zukunft ist kein „frischer" Klick, sondern ein
  // manipulierter oder verrutschter Wert — er verlängerte die Aufbewahrung.
  if (eintrag.capturedAt > jetzt) return true;
  return jetzt - eintrag.capturedAt >= tage * TAG_MS;
}

/**
 * Zustand der Erfassung. `storage` ist ein localStorage-artiges Objekt (oder
 * null), `now` liefert Millisekunden. Beides injizierbar, damit die Regeln ohne
 * Browser prüfbar sind.
 */
export function createReferralStore({ storage = null, now = () => Date.now() } = {}) {
  const speicher = { customer: null, partner: null };
  // null = in dieser Sitzung keine Serveraussage; true/false = geladene Aussage.
  let freigabe = null;
  let tage = null;

  const gueltigGespeichert = (kind) => {
    const eintrag = lesen(storage, kind);
    if (!eintrag) return null;
    if (abgelaufen(eintrag, now(), tage ?? CONTRACT_RETENTION_DAYS)) {
      entfernen(storage, kind);
      return null;
    }
    return eintrag;
  };

  return {
    /** Nimmt einen Code der Art in den Arbeitsspeicher. Ungültig → nichts. */
    capture(kind, raw) {
      if (!istArt(kind)) return false;
      const code = normalizeReferralCode(raw);
      if (!code) return false;
      if (!speicher[kind]) speicher[kind] = code;
      return true;
    },

    /** Liegt für irgendeine Art ein Speichereintrag vor (gleich welcher Güte)? */
    hasStoredEntries() {
      if (!storage) return false;
      return REFERRAL_KINDS.some((kind) => {
        try { return storage.getItem(REFERRAL_STORAGE_KEYS[kind]) !== null; } catch { return false; }
      });
    },

    /** Entfernt abgelaufene und unlesbare Einträge (ohne Netz). */
    sweep() {
      for (const kind of REFERRAL_KINDS) gueltigGespeichert(kind);
    },

    /** Ergebnis des Konfigurationsabrufs anwenden: { ok, config }. */
    applyConfigResult(result) {
      if (!result || result.ok !== true) return;          // Ausfall: nichts ändern
      if (!referralPersistenceAllowed(result.config)) {
        freigabe = false;
        tage = null;
        for (const kind of REFERRAL_KINDS) entfernen(storage, kind);
        return;
      }
      freigabe = true;
      tage = retentionDaysOf(result.config.referralRetentionDays);
      for (const kind of REFERRAL_KINDS) {
        const vorhanden = gueltigGespeichert(kind);
        if (!vorhanden && speicher[kind]) {
          schreiben(storage, kind, { code: speicher[kind], capturedAt: now() });
        }
      }
    },

    /** Der Code, den eine Registrierung dieser Art mitsendet — oder null. */
    codeFor(kind) {
      if (!istArt(kind)) return null;
      if (freigabe !== false) {
        const eintrag = gueltigGespeichert(kind);
        if (eintrag) return eintrag.code;
      }
      return speicher[kind];
    },

    /** Nach erfolgreicher Registrierung: genau diese Art vergessen. */
    clear(kind) {
      if (!istArt(kind)) return;
      speicher[kind] = null;
      entfernen(storage, kind);
    },
  };
}

// ── Anbindung an den Browser ─────────────────────────────────────────────────
function browserSpeicher(win) {
  try {
    const s = win.localStorage;
    return s && typeof s.getItem === "function" ? s : null;
  } catch {
    return null;
  }
}

let aktiv = null;

/**
 * Einmal beim Start (main.jsx) aufrufen. Liest den Code der aktuellen Adresse,
 * entfernt `ref` sofort per history.replaceState und lädt — nur wenn es etwas
 * zu entscheiden gibt — die öffentliche Konfiguration über `loadConfig`
 * (liefert { ok, config }).
 */
export function startReferralCapture({ win = typeof window === "undefined" ? null : window, loadConfig, now } = {}) {
  if (aktiv || !win) return aktiv;
  aktiv = createReferralStore({ storage: browserSpeicher(win), now: now || (() => Date.now()) });

  const loc = win.location || {};
  const kind = referralKindForPath(loc.pathname);
  let erfasst = false;
  if (kind) {
    const { present, code, search } = stripReferralParam(loc.search);
    if (present) {
      try {
        win.history.replaceState(win.history.state, "", `${loc.pathname}${search}${loc.hash || ""}`);
      } catch { /* ohne History-API bleibt nur die Adresszeile stehen */ }
      erfasst = code ? aktiv.capture(kind, code) : false;
    }
  }
  aktiv.sweep();

  const store = aktiv;
  if (typeof loadConfig === "function" && (erfasst || (kind && store.hasStoredEntries()))) {
    Promise.resolve()
      .then(() => loadConfig())
      .then((ergebnis) => store.applyConfigResult(ergebnis), () => { /* Ausfall: nichts ändern */ });
  }
  return aktiv;
}

/** Code der Art für die Registrierung — null ohne Erfassung. */
export function referralCodeFor(kind) {
  return aktiv ? aktiv.codeFor(kind) : null;
}

/** Nach erfolgreicher Registrierung der Art aufrufen. */
export function clearReferral(kind) {
  if (aktiv) aktiv.clear(kind);
}

/** Nur für Tests: die Modulinstanz zurücksetzen. */
export function __resetReferralCaptureForTests() {
  aktiv = null;
}
