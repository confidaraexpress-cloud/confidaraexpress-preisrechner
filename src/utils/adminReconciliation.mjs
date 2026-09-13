import { statusFallback } from "./statusFallback.mjs";
// ── Buchungsklärung (Admin) — reine Logik für Liste und Detail ───────────────
//
// Ein Buchungsversuch ist „ungeklärt", wenn nicht feststeht, ob beim Anbieter
// eine Buchung entstanden ist. Ein Mensch klärt das außerhalb von
// ConfidaraExpress und hält die Entscheidung hier fest. Diese Datei beantwortet
// ausschließlich „wie heißt das für einen Menschen" und „welche Aktion ist
// gerade sinnvoll anzubieten" — sie ruft nichts ab und entscheidet nichts.
//
// AUTORITÄT bleibt der Server: Mindestalter, neuester Versuch, Sperren und
// Evidenz werden dort UNTER der Zeilensperre erneut entschieden. Die Oberfläche
// sperrt Knöpfe nur, damit ein Klick nicht sinnlos ist — ein 409 wird trotzdem
// sauber behandelt.
//
// Adminintern dürfen Anbieter und Anbieterreferenzen erscheinen. Kein Text aus
// dieser Datei ist für Kundinnen und Kunden bestimmt.

const leer = (v) => v === null || v === undefined || v === "";
const zahl = (v) => {
  if (leer(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v) => (typeof v === "string" && v.trim() !== "" ? v : null);

// ── Anbieter ────────────────────────────────────────────────────────────────
export const RECONCILIATION_PROVIDERS = Object.freeze({ transglobal: "Transglobal", jumingo: "JUMiNGO" });

export const RECONCILIATION_PROVIDER_FILTER_OPTIONS = Object.freeze([
  { value: "", label: "Alle Anbieter" },
  { value: "transglobal", label: "Transglobal" },
  { value: "jumingo", label: "JUMiNGO" },
]);

export function providerLabel(provider) {
  return Object.prototype.hasOwnProperty.call(RECONCILIATION_PROVIDERS, provider)
    ? RECONCILIATION_PROVIDERS[provider] : "Unbekannter Anbieter";
}

/** Nur ein bekannter, kanonischer Anbieter wird gesendet — der Server lehnt alles andere mit 400 ab. */
export function toReconciliationApiFilters(provider) {
  const p = typeof provider === "string" ? provider.trim() : "";
  return Object.prototype.hasOwnProperty.call(RECONCILIATION_PROVIDERS, p) ? { provider: p } : {};
}

// ── Anzeige-Meta: [badge-Klasse, Label] ─────────────────────────────────────
// Der Providerausgang (was der ANBIETER gesagt hat) und die menschliche
// Entscheidung sind zwei getrennte Aussagen — sie bekommen getrennte Badges.
const STATE_META = {
  attempted: ["badge-yellow", "Ausgang offen"],
  ambiguous: ["badge-yellow", "Ausgang unklar"],
  booked: ["badge-blue", "Anbieter: gebucht"],
  not_booked: ["badge-gray", "Anbieter: nicht gebucht"],
};
export const reconciliationStateMeta = (state) => STATE_META[state] || statusFallback(state);

const RESOLUTION_META = {
  confirmed_booked: ["badge-green", "Als gebucht bestätigt"],
  confirmed_not_booked: ["badge-gray", "Als nicht gebucht bestätigt"],
};
export function resolutionMeta(resolution) {
  if (leer(resolution)) return ["badge-yellow", "Ungeklärt"];
  return RESOLUTION_META[resolution] || statusFallback(resolution);
}

const INVENTORY_LABELS = {
  not_applicable: "Kein Lagerbezug",
  reserved: "Reserviert",
  consumed: "Verbraucht",
  released: "Freigegeben",
  reserved_and_consumed: "Widerspruch: reserviert und verbraucht",
};
export const inventoryStateLabel = (state) => INVENTORY_LABELS[state] || "Nicht bestimmbar";

const DRIFT_LABELS = {
  provider_charged_more: "Anbieter berechnet mehr als erwartet",
  provider_charged_less: "Anbieter berechnet weniger als erwartet",
  unknown: "Abweichung nicht bestimmbar",
};
export const driftKindLabel = (kind) => DRIFT_LABELS[kind] || "Nicht bestimmbare Abweichung";

export const REVIEW_CODE_OPTIONS = Object.freeze([
  { value: "awaiting_provider_reply", label: "Warte auf Antwort des Anbieters" },
  { value: "awaiting_carrier_confirmation", label: "Warte auf Bestätigung des Carriers" },
  { value: "evidence_inconclusive", label: "Belege nicht eindeutig" },
  { value: "escalated_internally", label: "Intern eskaliert" },
  { value: "other", label: "Sonstiges" },
]);

export const attemptLabel = (a) => (a && a.id != null ? `Versuch #${a.id}` : "Versuch");

// ── Kanonische Form eines Versuchs ──────────────────────────────────────────
// Eine Frontendform aus der Adminprojektion (`shapeReconciliationRow`). Felder,
// die diese Oberfläche nicht braucht (etwa der Aufschlagssatz), werden bewusst
// nicht übernommen.
export function normalizeReconciliationAttempt(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = zahl(raw.bookingAttemptId ?? raw.id);
  if (id === null) return null;
  const d = raw.invoiceDrift && typeof raw.invoiceDrift === "object" ? raw.invoiceDrift : null;
  const drift = d && text(d.kind) ? {
    kind: d.kind,
    expectedNet: zahl(d.expectedNet),
    actualNet: zahl(d.actualNet),
    deltaNet: zahl(d.deltaNet),
    detectedAt: d.detectedAt ?? null,
    alertedAt: d.alertedAt ?? null,
    reviewedAt: d.reviewedAt ?? null,
    reviewedBy: zahl(d.reviewedBy),
  } : null;
  return {
    id,
    shipmentId: zahl(raw.shipmentId),
    userId: zahl(raw.userId),
    provider: text(raw.provider),
    attempt: zahl(raw.attempt),
    state: text(raw.state),
    ambiguousReason: text(raw.ambiguousReason),
    createdAt: raw.createdAt ?? null,
    completedAt: raw.completedAt ?? null,
    lastReviewedAt: raw.lastReviewedAt ?? null,
    providerServiceId: text(raw.providerServiceId),
    carrierPublicId: text(raw.carrierPublicId),
    fulfillmentMode: text(raw.fulfillmentMode),
    yourReference: text(raw.yourReference),
    providerBookingReference: text(raw.providerBookingReference),
    providerFailReference: text(raw.providerFailReference),
    customerGross: zahl(raw.customerGross),
    customerNet: zahl(raw.customerNet),
    customerVat: zahl(raw.customerVat),
    currency: text(raw.currency),
    pricingClass: text(raw.pricingClass),
    revalidatedPurchaseNet: zahl(raw.revalidatedPurchaseNet),
    snapshotComplete: raw.snapshotComplete === true,
    hasCompletionInputs: raw.hasCompletionInputs === true,
    legalFrozen: raw.legalFrozen === true,
    insuranceSelected: raw.insuranceSelected === true,
    insuranceType: text(raw.insuranceType),
    insuranceCoverValue: zahl(raw.insuranceCoverValue),
    insuranceCustomerGross: zahl(raw.insuranceCustomerGross),
    insuranceConfirmation: text(raw.insuranceConfirmation),
    invoiceDrift: drift,
    offerConsumedState: text(raw.offerConsumedState),
    shipmentStatus: text(raw.shipmentStatus),
    shipmentProvider: text(raw.shipmentProvider),
    shipmentCarrier: text(raw.shipmentCarrier),
    inventoryState: text(raw.inventoryState),
    hasBusinessOrderNumber: raw.hasBusinessOrderNumber === true,
    hasInvoice: raw.hasInvoice === true,
    isLatest: raw.isLatest === true,
    actionableAt: raw.actionableAt ?? null,
    retryAfterSeconds: zahl(raw.retryAfterSeconds),
    actionable: raw.actionable === true,
    resolution: text(raw.resolution),
    resolvedAt: raw.resolvedAt ?? null,
    resolvedBy: zahl(raw.resolvedBy),
    resolvedShipmentId: zahl(raw.resolvedShipmentId),
  };
}

export function selectReconciliationRows(d) {
  const rows = d && typeof d === "object" && Array.isArray(d.items) ? d.items : Array.isArray(d) ? d : [];
  return rows.map(normalizeReconciliationAttempt).filter(Boolean);
}

// ── Aktionsfähigkeit (Anzeige) ───────────────────────────────────────────────
// Das Mindestalter misst der SERVER mit der Datenbankuhr. Die Oberfläche kennt
// nur die Wartezeit zum Ladezeitpunkt (`retryAfterSeconds`) und zählt davon die
// seitdem vergangenen Sekunden ab — eine abweichende Clientuhr spielt so keine
// Rolle. Ein anschließender Klick wird serverseitig erneut geprüft.
export const DEFAULT_MIN_AGE_SECONDS = 120;

export const AVAILABILITY_TEXT = Object.freeze({
  resolved: "Dieser Vorgang ist bereits abschließend entschieden.",
  superseded: "Zu dieser Sendung gibt es einen neueren Buchungsversuch — dieser Versuch ist nicht mehr aktionsfähig.",
  orphaned: "Die Sendung existiert nicht mehr — dieser Versuch ist nur noch eine Diagnose.",
  not_booking: "Die Sendung ist nicht mehr gesperrt — hier gibt es nichts mehr zu klären.",
  unknown: "Der Vorgang ist nicht aktionsfähig.",
});

/**
 * @param {object|null} attempt  normalisierter Versuch
 * @param {number} elapsedSeconds Sekunden seit dem Laden der Serverantwort
 * @returns {{available: boolean, reason: string|null, remainingSeconds: number}}
 */
export function finalActionAvailability(attempt, elapsedSeconds = 0) {
  if (!attempt) return { available: false, reason: "unknown", remainingSeconds: 0 };
  if (attempt.resolution) return { available: false, reason: "resolved", remainingSeconds: 0 };
  if (attempt.isLatest !== true) return { available: false, reason: "superseded", remainingSeconds: 0 };
  if (attempt.shipmentId === null || attempt.shipmentId === undefined) {
    return { available: false, reason: "orphaned", remainingSeconds: 0 };
  }
  if (attempt.shipmentStatus !== "booking") return { available: false, reason: "not_booking", remainingSeconds: 0 };
  if (attempt.actionable === true) return { available: true, reason: null, remainingSeconds: 0 };
  const warte = Number.isFinite(attempt.retryAfterSeconds) && attempt.retryAfterSeconds > 0
    ? attempt.retryAfterSeconds : DEFAULT_MIN_AGE_SECONDS;
  const vergangen = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
  const rest = Math.max(0, Math.ceil(warte - vergangen));
  return rest > 0
    ? { available: false, reason: "too_early", remainingSeconds: rest }
    : { available: true, reason: null, remainingSeconds: 0 };
}

export function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")} min` : `${r} s`;
}

export function tooEarlyText(seconds) {
  return `Frühestens in ${formatCountdown(seconds)} aktionsfähig — bis dahin könnte ein laufender Buchungsaufruf noch antworten.`;
}

// ── „Als gebucht bestätigen" — was der Server verlangt ───────────────────────
export const PROVIDER_REFERENCE_MAX = 64;
const PROVIDER_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/;

export function confirmBookedRequirements(attempt) {
  const a = attempt || {};
  return {
    // Eine gespeicherte Referenz ist die Aussage des Anbieters — sie wird nicht erneut abgefragt.
    providerReferenceRequired: !a.providerBookingReference,
    storedProviderReference: a.providerBookingReference || null,
    // Nur eine angeforderte, vom Anbieter NICHT bestätigte Zusatzabsicherung verlangt eine Aussage.
    insuranceDecisionRequired: a.provider === "transglobal" && a.insuranceSelected === true
      && a.insuranceConfirmation !== "confirmed",
  };
}

/** Dieselbe Regel wie serverseitig (`validateProviderReference`) — nur als frühe Rückmeldung. */
export function validateProviderReferenceInput(raw) {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t === "") return { ok: false, value: null, message: "Bitte die Auftragsreferenz des Anbieters angeben." };
  if (t.length > PROVIDER_REFERENCE_MAX) {
    return { ok: false, value: null, message: `Die Auftragsreferenz darf höchstens ${PROVIDER_REFERENCE_MAX} Zeichen lang sein.` };
  }
  if (!PROVIDER_REFERENCE_RE.test(t)) {
    return { ok: false, value: null, message: "Nur Buchstaben, Ziffern sowie - _ / — ohne Leerzeichen." };
  }
  return { ok: true, value: t, message: null };
}

/** Der Body von confirm-booked. Wirft, statt eine unvollständige Anfrage zu bauen. */
export function buildConfirmBookedBody({ requirements, providerReference, insuranceConfirmed } = {}) {
  const r = requirements || {};
  const body = { confirm: true };
  if (r.providerReferenceRequired) {
    const v = validateProviderReferenceInput(providerReference);
    if (!v.ok) throw new Error("provider_reference_invalid");
    body.providerReference = v.value;
  }
  if (r.insuranceDecisionRequired) {
    if (insuranceConfirmed !== true && insuranceConfirmed !== false) throw new Error("insurance_decision_missing");
    body.insuranceConfirmed = insuranceConfirmed;
  }
  return body;
}

// ── Bestätigungsdialoge ──────────────────────────────────────────────────────
export const RECONCILIATION_DIALOGS = Object.freeze({
  booked: Object.freeze({
    title: "Als gebucht bestätigen?",
    text: "Bestätigen Sie nur, wenn Sie beim Anbieter eine reale Buchung festgestellt haben. Bestellnummer, Auftragsbestätigung und Rechnung entstehen aus dem eingefrorenen Stand; reservierter Bestand wird verbraucht. Es wird kein Anbieter kontaktiert.",
    confirm: "Als gebucht bestätigen",
  }),
  notBooked: Object.freeze({
    title: "Als nicht gebucht bestätigen?",
    text: "Bestätigen Sie nur, wenn beim Anbieter sicher keine Buchung existiert. Die Sendung wird wieder ein Entwurf, reservierter Bestand wird frei, und der Kunde erhält einen neutralen Hinweis. Es wird nichts storniert und kein Anbieter kontaktiert.",
    confirm: "Als nicht gebucht bestätigen",
  }),
  drift: Object.freeze({
    title: "Rechnungsabweichung als geprüft markieren?",
    text: "Die Abweichung wird als geprüft vermerkt. Die ursprünglichen Beträge und Zeitpunkte bleiben unverändert erhalten.",
    confirm: "Als geprüft markieren",
  }),
});

// ── Antworten der Aktionen ───────────────────────────────────────────────────
const CODE_TEXT = Object.freeze({
  attempt_too_recent: "Der Vorgang ist noch zu jung — ein laufender Buchungsaufruf könnte noch antworten.",
  attempt_superseded: "Zu dieser Sendung gibt es inzwischen einen neueren Buchungsversuch.",
  already_resolved: "Der Vorgang wurde inzwischen bereits entschieden.",
  already_resolved_differently: "Der Vorgang wurde bereits anders entschieden.",
  contradictory_booked_evidence: "Es liegt ein Buchungsnachweis des Anbieters vor — „nicht gebucht“ ist ausgeschlossen.",
  contradictory_not_booked_evidence: "Der Anbieter hat die Nichtbuchung belegt — „gebucht“ ist ausgeschlossen.",
  resource_busy: "Die Sendung wird gerade von einem anderen Vorgang bearbeitet. Bitte gleich erneut versuchen.",
  shipment_not_in_booking: "Die Sendung ist nicht mehr gesperrt.",
  shipment_missing: "Die Sendung existiert nicht mehr.",
  attempt_shipment_mismatch: "Versuch und Sendung passen nicht zusammen.",
  attempt_snapshot_changed: "Der eingefrorene Stand des Vorgangs hat sich geändert. Bitte neu laden und erneut prüfen.",
  provider_reference_required: "Bitte die Auftragsreferenz des Anbieters angeben.",
  provider_reference_invalid: "Die Auftragsreferenz ist ungültig.",
  provider_reference_too_long: "Die Auftragsreferenz ist zu lang.",
  provider_reference_mismatch: "Die angegebene Referenz weicht von der gespeicherten Anbieterreferenz ab.",
  commercial_snapshot_incomplete: "Der eingefrorene Preisstand ist unvollständig — so nicht abschließbar.",
  completion_inputs_missing: "Die eingefrorenen Abschlussangaben fehlen — so nicht abschließbar.",
  completion_inputs_unreadable: "Die eingefrorenen Abschlussangaben sind nicht lesbar.",
  customs_not_supported: "Zollvorgänge sind über diese Klärung nicht abschließbar.",
  legal_evidence_unavailable: "Der Vertragsnachweis ist nicht verfügbar — so nicht abschließbar.",
  invoice_not_issuable: "Zu diesem Vorgang kann keine gültige Rechnung ausgestellt werden.",
  invoice_issuer_incomplete: "Die Ausstellerangaben sind unvollständig.",
  account_unreadable: "Die Kontodaten des Kunden sind nicht lesbar.",
  business_customer_gate: "Das Kundenkonto erfüllt die Geschäftskundenvoraussetzungen nicht.",
  offer_missing: "Das zugehörige Angebot fehlt.",
  insurance_confirmation_required: "Bitte angeben, ob die Zusatzabsicherung beim Anbieter besteht.",
  insurance_confirmation_invalid: "Die Angabe zur Zusatzabsicherung ist ungültig.",
  insurance_confirmation_not_applicable: "Für diesen Vorgang ist keine Angabe zur Zusatzabsicherung vorgesehen.",
  insurance_snapshot_incomplete: "Der eingefrorene Stand der Zusatzabsicherung ist unvollständig.",
  contradictory_insurance_evidence: "Die Angabe widerspricht der bestätigten Absicherung des Anbieters.",
  document_evidence_inconsistent: "Die gesicherten Belege stimmen nicht mit der Erklärung überein.",
  result_not_representable: "Der eingefrorene Stand ist widersprüchlich.",
  provider_not_supported: "Für diesen Anbieter gibt es keinen Abschlussweg.",
  confirmation_required: "Die Aktion muss ausdrücklich bestätigt werden.",
  completion_failed: "Der Geschäftsabschluss ist fehlgeschlagen. Der Vorgang bleibt offen.",
  resolution_failed: "Die Entscheidung konnte nicht gespeichert werden. Der Vorgang bleibt offen.",
  review_failed: "Der Prüfvermerk konnte nicht gespeichert werden.",
  review_code_invalid: "Der Prüfvermerk ist ungültig.",
  invoice_drift_missing: "Zu diesem Versuch liegt keine Rechnungsabweichung vor.",
});

/**
 * Eine Fehlerantwort in Anzeigeform. Der rohe Code erscheint nie im sichtbaren Text.
 * @returns {{kind: string, code: string|null, message: string, retryAfterSeconds: number|null,
 *            missingFields: string[], reloadRecommended: boolean}}
 */
export function reconciliationActionError(status, body) {
  const b = body && typeof body === "object" ? body : {};
  const code = typeof b.code === "string" ? b.code
    : b.error === "confirmation_required" ? "confirmation_required" : "";
  const retry = Number.isSafeInteger(b.retryAfterSeconds) && b.retryAfterSeconds > 0 ? b.retryAfterSeconds : null;
  const kind = status === 404 ? "not_found"
    : status === 429 ? "rate_limited"
    : code === "attempt_too_recent" ? "too_early"
    : status === 409 ? "conflict"
    : status === 422 ? "precondition"
    : status === 400 ? "invalid"
    : "error";
  const message = status === 404 ? "Der Vorgang wurde nicht gefunden."
    : status === 429 ? "Zu viele Admin-Aktionen. Bitte kurz warten."
    : (Object.prototype.hasOwnProperty.call(CODE_TEXT, code) ? CODE_TEXT[code]
      : status >= 500 ? "Die Aktion ist fehlgeschlagen. Bitte erneut versuchen."
      : "Die Aktion konnte nicht ausgeführt werden.");
  const missingFields = Array.isArray(b.missingFields) ? b.missingFields.filter((f) => typeof f === "string") : [];
  return { kind, code: code || null, message, retryAfterSeconds: retry, missingFields, reloadRecommended: kind === "conflict" };
}

export function reconciliationActionSuccess(body) {
  const b = body && typeof body === "object" ? body : {};
  if (b.status === "reviewed" && Object.prototype.hasOwnProperty.call(b, "invoiceDriftReviewedAt")) {
    return { message: b.alreadyReviewed === true
      ? "Die Rechnungsabweichung war bereits als geprüft vermerkt."
      : "Die Rechnungsabweichung ist als geprüft vermerkt." };
  }
  if (b.status === "reviewed") return { message: "Prüfvermerk gespeichert — der Vorgang bleibt offen." };
  if (b.resolution === "confirmed_booked") {
    return { message: b.alreadyResolved === true
      ? "Der Vorgang war bereits als gebucht bestätigt. Ausstehende Nacharbeiten wurden erneut angestoßen."
      : "Als gebucht bestätigt. Rechnung und Bestätigungen werden erstellt." };
  }
  if (b.resolution === "confirmed_not_booked") {
    return { message: b.alreadyResolved === true
      ? "Der Vorgang war bereits als nicht gebucht bestätigt."
      : "Als nicht gebucht bestätigt. Die Sendung ist wieder ein Entwurf; der Kunde erhält einen neutralen Hinweis." };
  }
  return { message: "Aktion ausgeführt." };
}

// ── Liste ────────────────────────────────────────────────────────────────────
export const RECONCILIATION_LIST_ERROR = "Die Buchungsklärungen konnten nicht geladen werden.";

export function reconciliationEmptyState({ count = 0, provider = "" } = {}) {
  if (count > 0) return { show: false, title: "", text: "" };
  if (provider) {
    return { show: true, title: "Für diesen Anbieter gibt es keine offenen Buchungsklärungen.",
      text: "Wählen Sie einen anderen Anbieter — oder setzen Sie den Filter zurück." };
  }
  return { show: true, title: "Keine offenen Buchungsklärungen.",
    text: "Sobald ein Buchungsausgang unklar bleibt, erscheint der Vorgang hier." };
}
