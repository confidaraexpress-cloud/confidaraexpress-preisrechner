// ── Adminzugang im Kontodetail (Canonical v2.130) — Texte, Aktion und Fehlerzuordnung ──────────────────────
//
// Adminkonten stehen wie bisher in der Kontenliste (Kennzeichen „Admin“), laufen aber nicht durch die
// Kundenfreischaltung: kein Kundenaufschlag, keine Kundennummer, keine Aktivierungsmail. Ihr Zugang kennt nur
// „freigeschaltet“ und „gesperrt“. Der Server erzwingt dazu drei Regeln (Backend lib/adminAccounts.js): kein Admin
// ändert den eigenen Zugang, der letzte freigeschaltete Admin bleibt freigeschaltet, Adminkonten werden weder
// gelöscht noch anonymisiert. Diese Datei spiegelt das nur für die Bedienbarkeit — verbindlich bleibt der Server.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

export const ADMIN_ROLLE = "admin";

/** Ist die Kontozeile (Detail oder Liste) ein Adminkonto? Strikter Vergleich, nie truthy. */
export function istAdminkonto(konto) {
  return !!konto && typeof konto === "object" && konto.role === ADMIN_ROLLE;
}

export const ADMIN_ZUGANG_TEXT = Object.freeze({
  titel: "Adminzugang",
  freigeschaltet: "Freigeschaltet — dieses Konto hat volle Adminrechte.",
  wartet: "Wartet auf die Freischaltung — anmelden ist noch nicht möglich.",
  gesperrt: "Gesperrt — dieses Konto kann sich nicht anmelden. Seine Historie bleibt erhalten.",
  freischalten: "Adminzugang freischalten",
  entsperren: "Adminzugang entsperren",
  sperren: "Adminzugang sperren",
  eigenesKonto: "Den Zugang Ihres eigenen Adminkontos ändert ein anderer Administrator.",
  schutz: "Adminkonten werden nicht gelöscht oder anonymisiert. Sperren Sie stattdessen den Zugang.",
  freischaltenDialogTitel: "Adminzugang freischalten?",
  freischaltenDialogText: "Dieses Konto erhält volle Adminrechte. Die Person setzt ihr Passwort selbst über „Passwort vergessen?“ auf der Admin-Anmeldung. Die Aktion wird protokolliert.",
  sperrenDialogTitel: "Adminzugang sperren?",
  sperrenDialogText: "Die Person kann sich danach nicht mehr anmelden, offene Sitzungen enden sofort. Das Konto und seine Historie bleiben erhalten; ein anderer Administrator kann den Zugang wieder freischalten. Die Aktion wird protokolliert.",
  abbrechen: "Abbrechen",
  erfolgFreigeschaltet: "Der Adminzugang ist freigeschaltet.",
  erfolgGesperrt: "Der Adminzugang ist gesperrt.",
  unveraendert: "Der Adminzugang war bereits in diesem Zustand.",
});

/** Statustext des Zugangs. */
export function adminZugangStatusText(status) {
  if (status === "approved") return ADMIN_ZUGANG_TEXT.freigeschaltet;
  if (status === "blocked") return ADMIN_ZUGANG_TEXT.gesperrt;
  if (status === "pending") return ADMIN_ZUGANG_TEXT.wartet;
  return "";
}

/** Die eine Aktion der Karte → { ziel: "approved"|"blocked"|null, label, gesperrt, grund }.
 *  Eigenes Konto: Aktion sichtbar, aber gesperrt (der Server lehnt sie ohnehin ab). */
export function adminZugangAktion(status, { eigenesKonto = false } = {}) {
  let ziel = null;
  let label = "";
  if (status === "approved") { ziel = "blocked"; label = ADMIN_ZUGANG_TEXT.sperren; }
  else if (status === "pending") { ziel = "approved"; label = ADMIN_ZUGANG_TEXT.freischalten; }
  else if (status === "blocked") { ziel = "approved"; label = ADMIN_ZUGANG_TEXT.entsperren; }
  if (ziel === null) return { ziel: null, label: "", gesperrt: true, grund: "" };
  return { ziel, label, gesperrt: !!eigenesKonto, grund: eigenesKonto ? ADMIN_ZUGANG_TEXT.eigenesKonto : "" };
}

// Antworten des Statuswegs → Text. Codes steuern, Servertexte nie roh.
export const ADMIN_ZUGANG_FEHLER = Object.freeze({
  ADMIN_SELF_STATUS_CHANGE: "Den Zugang Ihres eigenen Adminkontos können Sie nicht ändern. Das übernimmt ein anderer Administrator.",
  LAST_ADMIN_ACCOUNT: "Der letzte aktive Adminzugang kann nicht gesperrt werden. Schalten Sie zuerst einen weiteren Administrator frei.",
  ADMIN_STATUS_INVALID: "Ein Adminzugang kann nur freigeschaltet oder gesperrt werden.",
  ADMIN_ACCOUNT_PROTECTED: "Adminkonten werden nicht gelöscht oder anonymisiert. Sperren Sie stattdessen den Zugang.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  404: "Das Konto wurde nicht gefunden.",
  standard: "Der Adminzugang wurde nicht geändert. Bitte versuchen Sie es erneut.",
});

/** → null bei 401/403 (zentrales Sitzungsende), sonst der Text. */
export function adminZugangFehler(status, body) {
  if (status === 401 || status === 403) return null;
  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code : null;
  if (code && Object.prototype.hasOwnProperty.call(ADMIN_ZUGANG_FEHLER, code)) return ADMIN_ZUGANG_FEHLER[code];
  if (status === 429 || status === 404) return ADMIN_ZUGANG_FEHLER[status];
  return ADMIN_ZUGANG_FEHLER.standard;
}
