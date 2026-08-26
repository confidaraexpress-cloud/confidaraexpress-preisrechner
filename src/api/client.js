import { buildDraftListParams, toQueryString } from "../utils/draftsView.mjs";

export const API = import.meta.env.VITE_API_URL;

export const token = () => localStorage.getItem("ce_token");

export const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

export const jsonH = { "Content-Type": "application/json" };

// ── Central auth-error handler ───────────────────────────────────────────────
// AuthContext registers a handler here; apiFetch invokes it on a 401/403 from
// an authenticated request (auth: true). Public requests never trigger it.
let authErrorHandler = null;
export const setAuthErrorHandler = (fn) => { authErrorHandler = fn; };

// Macht den registrierten Handler für Sonderfälle aufrufbar, die bewusst kein
// `auth: true` nutzen (z.B. Passwortänderung, wo ein 401 meist "falsches
// Passwort" statt "Session ungültig" bedeutet, aber im P3-Fall doch Session-
// Invalidierung sein kann).
export const triggerAuthError = () => { if (authErrorHandler) authErrorHandler(); };

// ── Zeitüberschreitung (Phase 1 Betriebsreife, F5) ───────────────────────────
// Bis zu diesem Paket hatte KEIN Request ein Zeitlimit: ein hängender Server
// (Verbindung angenommen, nie geantwortet) ließ jeden Lade-Spinner unbegrenzt
// stehen. Jetzt trägt jeder apiFetch-Aufruf ein Standardlimit von 30 s bis zum
// EINTREFFEN DER ANTWORTKOPFZEILEN; lang laufende Vorgänge übergeben ein
// eigenes `timeoutMs` (Preisrechner 60 s — Providerkette serverseitig bis ~45 s;
// Buchung 150 s — die /book-Kette spricht den Provider mehrfach mit Timeouts
// von in Summe deutlich über 100 s; Zoll-PDF-Upload 90 s).
//
// Drei Fehlerklassen, strikt getrennt:
//   • ApiTimeoutError  — UNSER Limit hat abgebrochen. Eigener Name/Code, damit
//     Aufrufer (v. a. die Buchung) ihn von einem gewöhnlichen Netzfehler
//     unterscheiden können: bei /book heißt Timeout „Ausgang UNBEKANNT", nicht
//     „bitte erneut versuchen".
//   • AbortError des AUFRUFERS — unverändert weitergeworfen (Original), damit
//     die bestehende Stille-Abbruch-Behandlung (Sequenz-/Debounce-Muster der
//     Picker und des Preisrechners) exakt wie bisher greift.
//   • alles andere (echter Netz-/Serverfehler) — unverändert weitergeworfen.
//
// Es gibt KEINEN automatischen Retry — nirgends, und für /book ausdrücklich
// niemals: ein wiederholter /book könnte eine zweite echte Bestellung auslösen.
export class ApiTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Der Server hat innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden nicht geantwortet.`);
    this.name = "ApiTimeoutError";
    this.code = "API_TIMEOUT";
    this.timeoutMs = timeoutMs;
  }
}
export const isApiTimeout = (e) => !!e && e.name === "ApiTimeoutError";

export const DEFAULT_TIMEOUT_MS = 30000;

// ── Minimal central fetch wrapper (no dependency, no global fetch patch) ─────
// apiFetch("/path", { auth, method, body, headers, timeoutMs, signal, ... })
//   - auth: true  → adds Authorization (Bearer) + JSON Content-Type via authH()
//   - On 401/403 for an authenticated request: removes ce_token and fires the
//     central auth-error handler (→ logout + redirect). The raw Response is
//     still returned so existing callers keep their own .ok/.json()/status logic.
//   - Public requests (auth falsy) pass through untouched; their 401/403 is
//     returned normally and never triggers a logout.
//   - timeoutMs: Limit bis zu den Antwortkopfzeilen (Default 30 s; 0/null = aus).
//     Ein Aufrufer-Signal bleibt voll wirksam (beides bricht denselben fetch ab).
export async function apiFetch(pathOrUrl, options = {}) {
  const { auth = false, headers, timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${API}${pathOrUrl}`;
  // FormData (Multipart-Upload): der Browser MUSS den Content-Type inklusive
  // Boundary selbst setzen. Daher bei auth:true nur den Bearer-Header, KEINEN
  // JSON-Content-Type. Rückwärtskompatibel — greift ausschließlich für FormData.
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const authHeaders = auth ? (isFormData ? { Authorization: `Bearer ${token()}` } : authH()) : null;
  const finalHeaders = auth ? { ...authHeaders, ...headers } : headers;

  // Aufrufer-Signal und Zeitlimit auf EINEN Controller zusammenführen. Nach dem
  // Eintreffen der Kopfzeilen wird der Timer gelöscht — ein langsamer Body wird
  // bewusst nicht abgebrochen (das Ziel ist der hängende, nie antwortende Server).
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch(url, { ...rest, headers: finalHeaders, signal: controller.signal });
  } catch (e) {
    // Reihenfolge tragend: ein Abbruch DES AUFRUFERS bleibt das Original —
    // erst ein Abbruch, den niemand angefordert hat, ist unser Timeout.
    if (signal && signal.aborted) throw e;
    if (e && e.name === "AbortError") throw new ApiTimeoutError(timeoutMs);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onCallerAbort);
  }
  if (auth && (res.status === 401 || res.status === 403)) {
    localStorage.removeItem("ce_token");
    if (authErrorHandler) authErrorHandler();
  }
  return res;
}

// ── Jumingo Access-Point / Paketshop-Suche (read-only) ───────────────────────
// Dünner Wrapper um POST /api/jumingo/access-points-search (auth-geschützt,
// read-only Proxy). Reine Orientierungs-/Anzeigesuche: KEINE Buchung, KEINE
// Persistenz — die Auswahl fließt bewusst NICHT in den /book-Payload. Die
// `carrierCodes` setzt der Aufrufer und sie müssen serverseitig allowlisted
// sein (aktuell ausschließlich "ups"). Gibt die rohe Response zurück; der
// Aufrufer wertet Status/JSON selbst aus (konsistent mit den übrigen Callern).
export function searchAccessPoints({ carrierCodes, countryCode, postCode, city, street, radius, onlyOpen }) {
  return apiFetch(`/api/jumingo/access-points-search`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ carrierCodes, countryCode, postCode, city, street, radius, onlyOpen }),
  });
}

// ── Abholzeitfenster: kundengewähltes Von/Bis-Fenster auf dem Draft laden/speichern ──
// GET/POST /api/jumingo/draft/pickup-window (auth, nur eigener Draft). Zeiten als "HH:mm".
// Speichern fail-closed: beide gesetzt ODER beide null; beide null → Fenster löschen.
// Buchungswirksam erst serverseitig im /book (dort autoritativ gegen den frischen Tarif geprüft;
// bei Drift 409 PICKUP_WINDOW_CHANGED). Gibt die rohe Response zurück — Aufrufer wertet selbst aus.
export function getDraftPickupWindow(shipmentId) {
  const id = encodeURIComponent(String(shipmentId ?? "").trim());
  return apiFetch(`/api/jumingo/draft/pickup-window?shipmentId=${id}`, { auth: true });
}

export function saveDraftPickupWindow({ shipmentId, pickupTimeFrom, pickupTimeUntil }) {
  return apiFetch(`/api/jumingo/draft/pickup-window`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ shipmentId, pickupTimeFrom, pickupTimeUntil }),
  });
}

// ── Versicherung: Live-Repricing (auth) ──────────────────────────────────────
// POST /api/jumingo/reprice-insurance — read-only Preisberechnung für eine
// gewählte Zusatzversicherung. WICHTIG (Backend-Vertrag): `insuranceType` wird
// FLACH gesendet (nicht verschachtelt), `value_currency` NICHT, und es werden
// KEINE Client-Preise übertragen. Gibt die rohe Response zurück (der Aufrufer
// wertet Status/JSON selbst aus, konsistent mit den übrigen Callern). Optionales
// AbortSignal, um veraltete In-Flight-Requests bei schneller Eingabe abzubrechen.
export function repriceInsurance(payload, { signal } = {}) {
  return apiFetch(`/api/jumingo/reprice-insurance`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
    signal,
  });
}

// ── Gutschein prüfen / Checkout-Vorschau (auth) ──────────────────────────────
// POST /api/jumingo/cart-total — der Server bepreist den Entwurf beim Provider und prüft
// optional einen Gutscheincode.
//
// WICHTIG (Backend-Vertrag): Gesendet werden AUSSCHLIESSLICH Auswahlangaben — welche Sendung,
// welcher Tarif, welcher Codewunsch. NIEMALS Beträge, Rabatthöhen oder Prozentwerte: das
// Backend würde sie ohnehin ignorieren, und ein Client darf keinen Preis vorgeben. Zurück
// kommen ausschließlich fertige CE-Kundenbeträge (Allowlist) — keine Providerpreise.
//
// Das Frontend entscheidet NIE selbst, ob ein Code gilt. Es gibt keine clientseitige Regel
// „Code X ⇒ 100 %"; der 0-Euro-Zustand entsteht allein aus dieser serverbestätigten Antwort.
// customsData ist OPTIONAL und wird nur bei zollpflichtigen Sendungen mitgegeben — genau der
// Block, den /book ohnehin sendet, aus derselben Quelle im Formular (nichts wird doppelt
// erfasst). Er ist nötig, weil /cart/total den Zustand bepreist, den die Sendung BEIM PROVIDER
// hat: ohne Zolldaten bleibt eine Drittlandsendung dort `missing_data` und der Warenkorb
// unbepreist. Bei EU/DE fehlt das Feld wie bisher und der Request ist byte-identisch zu vorher.
// Auch hier gilt unverändert: KEINE Beträge, keine Rabatthöhen, keine Prozentwerte.
export function checkVoucher({ shipmentId, tariffId, shipperTariffId, voucherCode, customsData }, { signal } = {}) {
  return apiFetch(`/api/jumingo/cart-total`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      shipmentId, tariffId, shipperTariffId, voucherCode,
      ...(customsData ? { customsData } : {}),
    }),
    signal,
  });
}

// ── Tracking (auth) ──────────────────────────────────────────────────────────
// Liest die additiven Tracking-Felder defensiv: Der Backend-Vertrag legt noch
// nicht endgültig fest, ob trackingAvailable/trackingNumber/trackingStatus/
// carrierTrackingPage top-level oder unter `tracking` liegen — daher beide
// Positionen prüfen (top-level hat Vorrang). Die bestehende verschachtelte
// Struktur (`tracking` inkl. `tracking.data.tracking_events`) wird unverändert
// weitergereicht, damit die vorhandene Timeline-Anzeige nicht bricht.
function selectTracking(d) {
  const payload = d && typeof d === "object" ? d : {};
  const nested  = payload.tracking && typeof payload.tracking === "object" ? payload.tracking : null;
  const pick = (key) =>
    payload[key] !== undefined ? payload[key]
    : nested && nested[key] !== undefined ? nested[key]
    : undefined;
  return {
    trackingAvailable:   pick("trackingAvailable"),
    trackingNumber:      pick("trackingNumber"),
    trackingStatus:      pick("trackingStatus"),
    carrierTrackingPage: pick("carrierTrackingPage"),
    tracking:            payload.tracking, // bestehende Struktur/Events unverändert weiterreichen
  };
}

// getTracking(shipmentId): GET /api/shipments/:shipmentId/tracking über das
// zentrale apiFetch (Bearer-Auth; 401/403 → zentraler Logout/Redirect).
// `shipmentId` ist der ConfidaraExpress-Sendungshandle (shipments.id) — dieselbe
// ID wie bei Label und Stornoanfrage. Die Providerreferenz löst das Backend
// intern auf; sie verlässt den Server nicht mehr.
// Wirft NICHT bei HTTP-Fehlern, sondern liefert { ok:false, status } zurück,
// damit der Aufrufer wie gewohnt eine kundenfreundliche Statusmeldung wählen
// kann. Bei Erfolg: { ok:true, status, ...defensiv selektierte Felder }.
// Kein Logging von Daten.
export async function getTracking(shipmentId) {
  const id = encodeURIComponent(String(shipmentId ?? "").trim());
  const r = await apiFetch(`/api/shipments/${id}/tracking`, { auth: true });
  if (!r.ok) return { ok: false, status: r.status };
  let d = {};
  try { d = await r.json(); } catch { /* leerer / kein JSON-Body → Defaults */ }
  return { ok: true, status: r.status, ...selectTracking(d) };
}

// ── Laufender Sammelzeitraum ─────────────────────────────────────────────────
// Read-only Vorschau auf den noch offenen 7-Tage-Zeitraum eines Kontos mit
// Sammelabrechnung. Der Aufruf erzeugt KEINE Rechnung und verändert nichts.
//
// Adressiert wird ohne Konto-ID — das Konto steht im JWT, die Mandantentrennung
// ist damit strukturell und nicht durch eine Prüfung erkauft (dieselbe Regel wie
// beim Firmenlogo).
//
// Wirft NICHT bei HTTP-Fehlern: die Karte soll bei einem Ausfall eine ruhige
// Hinweiszeile zeigen können, statt zu brechen.
export async function getCurrentConsolidatedPeriod() {
  const r = await apiFetch(`/kunde/consolidated-invoice/current`, { auth: true });
  if (!r.ok) return { ok: false, status: r.status };
  let d = {};
  try { d = await r.json(); } catch { /* leerer / kein JSON-Body → Defaults */ }
  return { ok: true, status: r.status, data: d };
}

// ── Zoll-Handelsrechnung (Customs commercial invoice) ────────────────────────
// Dünne Wrapper um das bereits gemergte, auth-geschützte Confidara-Gateway.
// `:shipmentId` ist die von /calculate-price gelieferte ÖFFENTLICHE Sendungs-ID
// ("s_"+32 Hex, JUMiNGO-Referenz) — serverseitig geprüft mit parsePublicShipmentId()
// und über jumingo_shipment_id + user_id aufgelöst. NICHT die interne shipments.id.
//
// Diese Zeile stand bis zur Behebung des Save-Draft-Fehlers falsch hier („interne
// Confidara-Shipment-ID"). Zwei andere Module beriefen sich darauf und leiteten
// daraus ab, `bookingData.shipmentId` sei die interne ID — genau daraus entstand
// die unsichtbare Aktion „Als Entwurf speichern". Wer diese Zuordnung ändert,
// prüft sie am Backendpfad, nicht an einem Kommentar.
//
// Die PDF wird NUR über dieses Gateway übertragen — NIE direkt an JUMiNGO aus dem Browser.
// Kein Logging von Datei-/Body-Daten, keine Base64, keine Client-Persistenz.
const ciPath = (shipmentId) =>
  `/api/jumingo/shipments/${encodeURIComponent(String(shipmentId ?? "").trim())}/commercial-invoice`;

// GET → { present: true|false, document: {...}|null }. Rohe Response zurück; der
// Aufrufer liest Status/JSON defensiv (kein rohes Objekt rendern).
export function getCommercialInvoiceStatus(shipmentId) {
  return apiFetch(ciPath(shipmentId), { auth: true });
}

// POST multipart/form-data mit GENAU einem Feld `file`. Content-Type setzt der
// Browser (Boundary) — daher hier bewusst NICHT manuell gesetzt (apiFetch lässt
// ihn bei FormData weg). Keine UUID, kein Dokumenttyp, kein Multipart-Key aus
// UI-Eingaben — nur die interne shipmentId im Pfad.
export function uploadCommercialInvoice(shipmentId, file) {
  const formData = new FormData();
  formData.append("file", file);
  // Eigenes Zeitlimit: der Upload läuft serverseitig weiter zum Provider durch;
  // 30 s wären für eine mehrseitige PDF über eine langsame Leitung zu knapp.
  return apiFetch(ciPath(shipmentId), { method: "POST", auth: true, body: formData, timeoutMs: 90000 });
}

// DELETE → entfernt ausschließlich die commercial-invoice (idempotent). Kein Body.
export function deleteCommercialInvoice(shipmentId) {
  return apiFetch(ciPath(shipmentId), { method: "DELETE", auth: true });
}

// ── Benutzer-Entwürfe (Backend PR #162) ──────────────────────────────────────
// Ausschließlich bewusst gespeicherte Entwürfe (shipments.is_saved_draft=true).
// GET liefert Keyset-Pagination { items, nextCursor }; der Cursor wird NUR
// opak weitergereicht (buildDraftListParams/toQueryString in draftsView.mjs —
// kein Dekodieren, keine Annahmen über den Aufbau). :id ist überall die interne
// numerische Shipment-ID (NICHT jumingoShipmentId).
export function getDrafts({ limit, cursor } = {}, { signal } = {}) {
  const params = buildDraftListParams({ limit, cursor });
  return apiFetch(`/api/kunde/drafts${toQueryString(params)}`, { auth: true, signal });
}

// Lädt EINEN gespeicherten Sendungsentwurf zum Fortsetzen. Antwort trägt `formData` in
// derselben Form wie ein Formularentwurf plus `bookingOptions` (Entwurfszustand der
// Zusatzoptionen). Bewusst ohne Preis/Tarif/Carrier — ein fortgesetzter Entwurf wird neu
// berechnet.
export function getShipmentDraft(id, { signal } = {}) {
  return apiFetch(`/api/kunde/drafts/${encodeURIComponent(String(id))}`, { auth: true, signal });
}

// Speichert einen bestehenden technischen Draft bewusst als Benutzer-Entwurf
// (idempotent). `id` MUSS die interne numerische Shipment-ID sein.
//
// `bookingOptions` ist der Entwurfszustand der „Zusätzlichen Optionen" (Schalter + Werte) und
// wird nur mitgesendet, wenn der Aufrufer ihn kennt — ohne ihn verhält sich der Endpunkt exakt
// wie zuvor. Er landet serverseitig ausschließlich im Entwurfszustand und beeinflusst keine
// Buchung; was gebucht wird, entscheidet allein der /book-Request.
export function saveDraft(id, bookingOptions) {
  return apiFetch(`/api/kunde/drafts/${encodeURIComponent(String(id))}/save`, {
    method: "POST", auth: true,
    ...(bookingOptions ? { body: JSON.stringify({ bookingOptions }) } : {}),
  });
}

// Löscht einen eigenen gespeicherten Entwurf endgültig. Erfolg → 204 (kein Body).
export function deleteDraft(id) {
  return apiFetch(`/api/kunde/drafts/${encodeURIComponent(String(id))}`, {
    method: "DELETE", auth: true,
  });
}

// ── Stornierungsanfrage (Kunde) ──────────────────────────────────────────────
// POST /api/shipments/:shipmentId/cancellation-request — stellt eine ANFRAGE
// auf Stornierung (KEINE echte Carrier-/JUMiNGO-Stornierung, keine Erstattung).
// `shipmentId` ist der ConfidaraExpress-Sendungshandle (shipments.id) — dieselbe
// ID wie bei Tracking/Label, im selben Namensraum. Body enthält ausschließlich
// `reason` (keine user_id, keine Providerreferenz). Auth + 401/403-Handling
// zentral über apiFetch. Gibt die rohe Response zurück; der Aufrufer wertet
// Status/JSON selbst aus (u. a. 409 bereits vorhanden, „nicht erlaubt", 404,
// 422, 429).
export function requestShipmentCancellation(shipmentId, reason) {
  return apiFetch(`/api/shipments/${encodeURIComponent(String(shipmentId ?? "").trim())}/cancellation-request`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ reason }),
  });
}

// ── Verifizierte Login-E-Mail-Änderung ───────────────────────────────────────
// Backend bereits produktiv (siehe Aufgabenstellung). Der Aufrufer wertet
// Status/JSON selbst aus (konsistent mit den übrigen Callern). Kein Logging von
// E-Mail/Passwort/Token.

// START: POST /kunde/email-change { newEmail, currentPassword }.
// BEWUSST KEIN `auth: true`: ein 401 bedeutet hier i. d. R. „aktuelles Passwort
// falsch" (fachlich) und darf NICHT automatisch ausloggen. Der Auth-Header wird
// daher manuell über authH() gesetzt; nur eine echte abgelaufene Session (vom
// Aufrufer am Body erkannt) löst über triggerAuthError() den globalen Logout aus
// — exakt das Muster der bestehenden Passwortänderung.
export function startEmailChange(newEmail, currentPassword) {
  return apiFetch(`/kunde/email-change`, {
    method: "POST",
    headers: authH(),
    body: JSON.stringify({ newEmail, currentPassword }),
  });
}

// RESEND: POST /kunde/email-change/resend. Kein fachlicher 401 → `auth: true`
// (ein 401 ist hier eine echte ungültige Sitzung und soll global ausloggen).
export function resendEmailChange() {
  return apiFetch(`/kunde/email-change/resend`, { method: "POST", auth: true });
}

// CANCEL: DELETE /kunde/email-change. Wie Resend `auth: true` (kein fachlicher 401).
export function cancelEmailChange() {
  return apiFetch(`/kunde/email-change`, { method: "DELETE", auth: true });
}

// CONFIRM: POST /auth/confirm-email-change { token }. Öffentlicher Endpunkt
// (E-Mail-Token, KEIN Bearer) — daher ohne `auth: true` und ohne Authorization-
// Header, nur JSON (wie /auth/reset-password). Löst niemals den globalen Logout
// aus (kein auth-Request). Das Token wird nur weitergereicht, nie geloggt.
export function confirmEmailChange(token) {
  return apiFetch(`/auth/confirm-email-change`, {
    method: "POST",
    headers: jsonH,
    body: JSON.stringify({ token }),
  });
}
