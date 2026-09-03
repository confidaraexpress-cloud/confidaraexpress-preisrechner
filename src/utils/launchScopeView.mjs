// ── Auswertung des Launch-Scopes (rein) ──────────────────────────────────────────────────────
//
// Der Server sagt, welche Länder ConfidaraExpress anbietet (`GET /api/shipping/launch-scope`).
// Dieses Modul übersetzt die Antwort in die Anzeigeliste der Auswahlfelder. Es kennt weder
// `fetch` noch React noch einen Zustand — es entscheidet nur, was aus einer gegebenen Antwort
// folgt.
//
// ─── Es gibt KEINE zweite Länderliste im Client ──────────────────────────────────────────────
// Gefiltert wird die vorhandene Anzeigeliste (`utils/countries.js`) gegen die SERVERliste. Eine
// eigene Aufzählung der 27 EU-Codes im Frontend wäre eine zweite gepflegte Wahrheit, die
// zwangsläufig irgendwann von der Serverliste abweicht — und die Abweichung wäre genau dort
// sichtbar, wo sie weh tut: entweder bietet die Oberfläche ein Land an, das der Server ablehnt
// (der Kunde füllt ein Formular für nichts), oder sie verbirgt eines, das buchbar wäre.

/**
 * Liest die Antwort des Scope-Endpunkts. Defensiv: alles Unbekannte ergibt `null` und wird
 * vom Aufrufer wie „noch nicht bekannt" behandelt — nie wie „keine Länder".
 * @returns {{codes: string[]} | null}
 */
function leseCodes(roh) {
  if (!Array.isArray(roh) || roh.length === 0) return null;
  const codes = roh
    .filter((c) => typeof c === "string")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return codes.length > 0 ? codes : null;
}

export function parseLaunchScope(body) {
  if (!body || typeof body !== "object") return null;
  // ZIELländer: bevorzugt das explizite Feld, sonst das ältere `countries` — der Server
  // liefert beide byteweise gleich. Der Rückfall ist keine Doppelpflege, sondern trägt den
  // umgekehrten Fall: ein neues Bundle gegen einen noch nicht ausgerollten Server.
  const codes = leseCodes(body.destinationCountries) ?? leseCodes(body.countries);
  if (codes === null) return null;
  // URSPRUNGSländer. Fehlt das Feld (älterer Server), bleibt es `null` — „nicht bekannt",
  // nie „keine Länder". `scopedOriginCountries` behandelt das wie jeden anderen unbekannten
  // Scope: fail-soft auf die Zielliste. Die Sperre liegt unverändert serverseitig.
  const originCodes = leseCodes(body.originCountries);
  return { codes, originCodes };
}

/**
 * Die Liste für ein Auswahlfeld.
 *
 * `scope === null` heißt „der Scope ist nicht bekannt" — beim ersten Rendern, weil die Antwort
 * noch unterwegs ist, oder dauerhaft, weil der Endpunkt ausgefallen ist. In beiden Fällen wird
 * die VOLLE Liste gezeigt.
 *
 * Das ist eine bewusste Entscheidung gegen die scheinbar sicherere Variante:
 *
 *   • Eine leere Auswahl wäre fail-closed und würde den Preisrechner bei einer kurzen Störung
 *     komplett unbenutzbar machen — auch für die Inlandsendung, die 95 % des Geschäfts ausmacht.
 *   • Die volle Liste ist degradiert, aber funktionsfähig: wer dann ein nicht angebotenes Land
 *     wählt, bekommt vom Server eine klare Ablehnung (422 ROUTE_NOT_SUPPORTED). Gebucht wird
 *     dadurch nichts — die Sperre liegt vollständig serverseitig.
 *
 * Der Fehlerfall darf hier großzügig sein, WEIL er nichts entscheidet.
 */
export function scopedCountries(alle, scope) {
  if (!Array.isArray(alle)) return [];
  if (!scope || !Array.isArray(scope.codes)) return alle;
  const erlaubt = new Set(scope.codes);
  return alle.filter((c) => c && erlaubt.has(c.code));
}

/**
 * Die Liste für ein ABSENDER-Auswahlfeld.
 *
 * ConfidaraExpress versendet ab Deutschland; wohin versendet wird, ist eine andere Frage
 * (`scopedCountries`). Bis zu dieser Trennung stand dieselbe Liste in beiden Feldern, und
 * Frankreich war als Absenderland wählbar, obwohl der Server jede Route von dort mit
 * `origin_not_supported` ablehnt.
 *
 * `originCodes === null` heißt „der Server hat dazu nichts gesagt" — bei einem älteren
 * Server oder einem Ausfall. Dann gilt dieselbe fail-soft-Regel wie überall in diesem Modul:
 * lieber die weitere Liste als ein leeres Feld. Buchbar wird dadurch nichts, die Sperre liegt
 * vollständig serverseitig.
 */
export function scopedOriginCountries(alle, scope) {
  if (!Array.isArray(alle)) return [];
  if (!scope || !Array.isArray(scope.originCodes)) return scopedCountries(alle, scope);
  const erlaubt = new Set(scope.originCodes);
  return alle.filter((c) => c && erlaubt.has(c.code));
}

/**
 * Ist ein gespeicherter Wert im aktuellen Angebot? Für Formulare, die einen Bestandswert
 * vorbelegen (Profil, Adressbuch): steht dort ein Land, das nicht mehr angeboten wird, soll das
 * Feld nicht stillschweigend leer aussehen.
 */
export function isCountryInScope(code, scope) {
  if (!scope || !Array.isArray(scope.codes)) return true;
  const v = typeof code === "string" ? code.trim().toUpperCase() : "";
  return v ? scope.codes.includes(v) : true;
}
