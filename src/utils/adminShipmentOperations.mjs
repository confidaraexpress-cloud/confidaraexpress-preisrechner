import { statusFallback } from "./statusFallback.mjs";
import { providerLabel, reconciliationStateMeta, resolutionMeta, driftKindLabel } from "./adminReconciliation.mjs";
import { cancellationStatusMeta } from "./adminCancellations.mjs";
// ── Betriebssicht einer Sendung (Admin) — reine Anzeigelogik ────────────────
//
// `GET /admin/shipments/:id` liefert additiv `operations`: Anbieter und seine
// Referenzen, Buchungsversuche, Belegmetadaten, Rechnungs-/Bestätigungsmails,
// Zusatzmails und eine Stornierungsanfrage. Ein älteres Backend ohne das Feld
// liefert es schlicht nicht — dann gibt es keine Betriebskarte.
//
// Adminintern: Anbieter und Anbieterreferenzen dürfen hier erscheinen. Keine
// Dokumentbytes, keine Rohantworten, kein Aufschlagssatz — diese Datei liest nur,
// was die Allowlist des Servers ohnehin freigibt.

const leer = (v) => v === null || v === undefined || v === "";
const zahl = (v) => {
  if (leer(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v) => (typeof v === "string" && v.trim() !== "" ? v : null);
const liste = (v) => (Array.isArray(v) ? v : []);

export const DOCUMENT_TYPE_LABELS = Object.freeze({
  LABEL: "Versandlabel",
  COLLECTION_LABEL: "Abholetikett",
  PACKING_LIST: "Packliste",
  OTHER: "Sonstiger Beleg",
});
export const documentTypeLabel = (t) => DOCUMENT_TYPE_LABELS[t] || "Unbekannter Beleg";

const MAIL_STATUS_META = {
  pending: ["badge-yellow", "Ausstehend"],
  sending: ["badge-blue", "Wird gesendet"],
  sent: ["badge-green", "Gesendet"],
  failed: ["badge-red", "Fehlgeschlagen"],
};
export const mailStatusMeta = (s) => MAIL_STATUS_META[s] || statusFallback(s);

const DOCUMENT_STATUS_META = {
  pending_document: ["badge-yellow", "Wird erstellt"],
  generating: ["badge-blue", "Wird erzeugt"],
  ready: ["badge-green", "Bereit"],
  failed: ["badge-red", "Fehlgeschlagen"],
  document_failed: ["badge-red", "Fehlgeschlagen"],
};
export const invoiceDocumentStatusMeta = (s) => DOCUMENT_STATUS_META[s] || statusFallback(s);

/* ── MF-03: der Etikettenstand eines PORTAL-Buchungsvorgangs ────────────────
   Manche Portalservices erzeugen das Versandlabel erst NACH der Bestellung. Die
   Buchung ist dann vollständig, das Etikett aber noch nicht da, und ein
   Nachlauf holt es. Drei Stände, und nur drei:

     pending           es entsteht noch, der Nachlauf holt es
     ready             es liegt
     recovery_timeout  das Nachlauffenster ist abgelaufen — ein Mensch klärt
     carrier_applied   TG110 Final Closure: der Carrier bringt das Label bei der
                       Abholung an — geschlossen, kein Kundenlabel, kein Nachlauf

   Adminintern. Diese Karte nennt Anbieter und Anbieterreferenzen ohnehin. */
const PORTAL_LABEL_STATUS_META = {
  pending: ["badge-yellow", "Wird beim Anbieter erzeugt"],
  ready: ["badge-green", "Liegt vor"],
  recovery_timeout: ["badge-red", "Nachlauf abgelaufen — bitte prüfen"],
  carrier_applied: ["badge-green", "Carrier bringt Label bei Abholung an"],
};
export const portalLabelStatusMeta = (s) => PORTAL_LABEL_STATUS_META[s] || statusFallback(s);

/* ── INTERNAL-01: was CE über das Versandlabel einer GEBUCHTEN Sendung weiß ──
   Der Zustand kommt fertig vom Server (`operations.labelAvailability`,
   lib/labelAvailability.js); hier steht nur sein Anzeigetext. Keiner der Texte
   behauptet, der ANBIETER habe kein Label: „noch nicht in CE" heißt ausdrücklich
   nur, dass CE es noch nicht abgerufen hat.

     available             das Label liegt in CE (gespeichert oder Anbieterbeleg)
     delivered_outside_ce  per Buchungsklärung außerhalb von CE zugestellt
     carrier_applied       der Carrier bringt das Label bei der Abholung an — geschlossen
     fetch_failed          der letzte Abruf ist technisch gescheitert
     provider_not_ready    der Anbieter antwortete zuletzt ohne nutzbares Label
     not_in_ce_yet         noch nicht abgerufen — keine Aussage über den Anbieter */
const LABEL_AVAILABILITY_META = {
  available: ["badge-green", "In CE"],
  delivered_outside_ce: ["badge-blue", "Außerhalb von CE zugestellt"],
  carrier_applied: ["badge-green", "Carrier bringt Label bei Abholung an"],
  fetch_failed: ["badge-red", "Letzter Abruf gescheitert"],
  provider_not_ready: ["badge-yellow", "Beim Anbieter noch nicht bereit"],
  not_in_ce_yet: ["badge-gray", "Noch nicht in CE abgerufen"],
};
export const labelAvailabilityMeta = (s) => LABEL_AVAILABILITY_META[s] || statusFallback(s);

// Der Hinweis unter dem gesperrten Supportabruf — je Zustand wahr, ohne Zustand neutral.
// Der Supportabruf liefert nur ein gespeichertes Label oder den Dokumentabruf des Anbieters;
// ein Anbieterbeleg liegt in CE, wird dort aber nicht ausgeliefert.
const LABEL_DOWNLOAD_HINT = {
  available: "Das Versandlabel liegt als Anbieterbeleg in CE (siehe „Anbieterbelege“) — dieser Abruf liefert es nicht.",
  delivered_outside_ce: "Das Versandlabel wurde außerhalb von CE zugestellt (Buchungsklärung) — in CE liegt keine Datei.",
  carrier_applied: "Der Carrier bringt das Versandlabel bei der Abholung am Paket an — es gibt kein Kundenlabel in CE.",
  fetch_failed: "Der letzte Labelabruf ist technisch gescheitert — in CE liegt noch kein Versandlabel.",
  provider_not_ready: "Beim letzten Abruf lag beim Anbieter noch kein nutzbares Versandlabel vor.",
  not_in_ce_yet: "In CE liegt noch kein Versandlabel.",
};
export const LABEL_DOWNLOAD_HINT_NEUTRAL = "Für diese Sendung liegt kein Versandlabel zum Abruf vor.";
export function labelDownloadHint(ops) {
  const st = ops && ops.labelAvailability ? ops.labelAvailability.state : null;
  return (st && LABEL_DOWNLOAD_HINT[st]) || LABEL_DOWNLOAD_HINT_NEUTRAL;
}

function versuch(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = zahl(raw.id);
  if (id === null) return null;
  const d = raw.invoiceDrift && typeof raw.invoiceDrift === "object" && text(raw.invoiceDrift.kind) ? raw.invoiceDrift : null;
  return {
    id,
    provider: text(raw.provider),
    providerText: providerLabel(raw.provider),
    attempt: zahl(raw.attempt),
    state: text(raw.state),
    stateMeta: reconciliationStateMeta(raw.state),
    ambiguousReason: text(raw.ambiguousReason),
    yourReference: text(raw.yourReference),
    providerBookingReference: text(raw.providerBookingReference),
    providerFailReference: text(raw.providerFailReference),
    createdAt: raw.createdAt ?? null,
    completedAt: raw.completedAt ?? null,
    resolution: text(raw.resolution),
    resolutionMeta: resolutionMeta(raw.resolution),
    resolvedAt: raw.resolvedAt ?? null,
    resolvedBy: zahl(raw.resolvedBy),
    lastReviewedAt: raw.lastReviewedAt ?? null,
    isLatest: raw.isLatest === true,
    hasCompletionInputs: raw.hasCompletionInputs === true,
    legalFrozen: raw.legalFrozen === true,
    expectedProviderCostNet: zahl(raw.expectedProviderCostNet),
    actualProviderCostNet: zahl(raw.actualProviderCostNet),
    actionable: raw.actionable === true,
    actionableAt: raw.actionableAt ?? null,
    invoiceDrift: d ? {
      kind: d.kind,
      kindText: driftKindLabel(d.kind),
      expectedNet: zahl(d.expectedNet),
      actualNet: zahl(d.actualNet),
      deltaNet: zahl(d.deltaNet),
      detectedAt: d.detectedAt ?? null,
      reviewedAt: d.reviewedAt ?? null,
      reviewedBy: zahl(d.reviewedBy),
      reviewed: !leer(d.reviewedAt),
    } : null,
  };
}

/* ── Paritätsaudit B1: Versand der Auftragsbestätigung aus der Sendung ───────
   POST /admin/shipments/:id/order-confirmation-email/send    pending, failed — und ein hängender
                                                              Versand (sending), den nur eine
                                                              Adminaktion übernehmen darf (JOB-1)
   POST /admin/shipments/:id/order-confirmation-email/resend  NUR nach „sent": bewusster zweiter Versand
   Anders als bei der Rechnung sperrt eine Testbuchung den Versand NICHT — die Testbuchung durchläuft
   im Backend bewusst den vollständigen Kundenprozess, die Mail ist dort als Test gekennzeichnet. Die
   Aktion folgt allein dem Status. Der Server setzt dieselben Bedingungen per atomarem Claim noch einmal
   durch: ein laufender Versand antwortet `in_progress`, ein bereits versendeter `already_sent` —
   ein zweiter Klick oder ein paralleler Lauf erzeugt keine zweite Mail. */
export function orderConfirmationMailAction(oc) {
  const status = oc && typeof oc === "object" ? oc.emailStatus : null;
  if (status === "sent") return { kind: "resend", label: "Auftragsbestätigung erneut senden", unclear: false };
  if (status === "failed") return { kind: "send", label: "Auftragsbestätigung erneut versuchen", unclear: false };
  if (status === "pending") return { kind: "send", label: "Auftragsbestätigung senden", unclear: false };
  if (status === "sending") return { kind: "send", label: "Hängenden Versand übernehmen", unclear: true };
  return null;
}

export const ORDER_CONFIRMATION_MAIL_TEXT = Object.freeze({
  sendingHint: "Ein Versand hat begonnen und ist nicht abgeschlossen. Läuft er noch, ändert ein erneuter Versuch nichts. Ist er seit mehr als zehn Minuten offen, ist sein Ausgang unklar: Prüfen Sie vor dem Übernehmen, ob die Mail beim Kunden angekommen ist.",
  sent: "Die Auftragsbestätigung wurde versendet.",
  resent: "Die Auftragsbestätigung wurde erneut versendet.",
  alreadySent: "Diese Auftragsbestätigung wurde bereits versendet. Für einen bewussten zweiten Versand „Auftragsbestätigung erneut senden“ verwenden.",
  inProgress: "Ein Versand dieser Auftragsbestätigung läuft bereits. Bitte laden Sie den Stand gleich neu.",
  superseded: "Ein anderer Versandlauf hat diese Auftragsbestätigung inzwischen übernommen. Bitte prüfen Sie den aktuellen Stand, bevor Sie erneut senden.",
  unclear: "Der Ausgang des Versands ist unklar — die Mail kann angekommen sein. Bitte prüfen Sie das, bevor Sie erneut senden.",
  failed: "Der Versand der Auftragsbestätigung ist fehlgeschlagen. Ein erneuter Versuch ist möglich.",
  notFound: "Zu dieser Sendung gibt es keine Auftragsbestätigung.",
  rateLimited: "Zu viele Admin-Aktionen. Bitte kurz warten.",
  generic: "Die Auftragsbestätigung konnte nicht versendet werden. Bitte versuchen Sie es erneut.",
});

// 409 des Servers: gesperrter Versand (`error: order_confirmation_email_<grund>`, nichts versendet)
// oder ein Resend vor dem ersten Versand. Bekannter Code → eigener Text, sonst der fertige Satz in
// `message`, sonst der allgemeine Text. Nie der Code selbst.
const ORDER_CONFIRMATION_MAIL_BLOCKED = Object.freeze({
  order_confirmation_email_recipient_missing: "Für dieses Kundenkonto ist keine E-Mail-Adresse hinterlegt. Es wurde nichts versendet.",
  order_confirmation_email_recipient_anonymized: "Das Kundenkonto ist anonymisiert. Es wurde nichts versendet.",
  order_confirmation_email_recipient_invalid: "Die E-Mail-Adresse des Kundenkontos ist ungültig. Es wurde nichts versendet.",
  order_confirmation_email_config_missing: "Die Absenderkonfiguration für E-Mails ist unvollständig. Es wurde nichts versendet.",
  order_confirmation_email_not_sent_yet: "Diese Auftragsbestätigung wurde noch nicht versendet — bitte den regulären Versand verwenden.",
});

/** Rückmeldung zu einer 2xx-Antwort: nur `sent` ist ein Erfolg. */
export function orderConfirmationMailOutcome(body, kind) {
  const outcome = body && typeof body === "object" ? body.outcome : null;
  const T = ORDER_CONFIRMATION_MAIL_TEXT;
  if (outcome === "sent") return { type: "success", text: kind === "resend" ? T.resent : T.sent };
  if (outcome === "already_sent") return { type: "info", text: T.alreadySent };
  if (outcome === "in_progress") return { type: "info", text: T.inProgress };
  if (outcome === "superseded") return { type: "info", text: T.superseded };
  // Der Anbieter hat angenommen, der Status ließ sich nicht speichern: kein „fehlgeschlagen" —
  // ein erneuter Versuch wäre eine zweite Mail.
  if (outcome === "unclear" || (outcome === "failed" && body.errorCode === "finalize_failed")) {
    return { type: "info", text: T.unclear };
  }
  return { type: "error", text: T.failed };
}

/** Rückmeldung zu einer Nicht-2xx-Antwort (außer 401/403, die zentral abmelden). */
export function orderConfirmationMailError(status, body) {
  const T = ORDER_CONFIRMATION_MAIL_TEXT;
  const code = body && typeof body === "object" && typeof body.error === "string" ? body.error : "";
  if (Object.prototype.hasOwnProperty.call(ORDER_CONFIRMATION_MAIL_BLOCKED, code)) {
    return { type: "error", text: ORDER_CONFIRMATION_MAIL_BLOCKED[code] };
  }
  if (status === 409 && body && typeof body.message === "string" && body.message.trim()) {
    return { type: "error", text: body.message.trim() };
  }
  if (status === 404) return { type: "error", text: T.notFound };
  if (status === 429) return { type: "error", text: T.rateLimited };
  return { type: "error", text: T.generic };
}

/** Die normalisierte Betriebssicht — oder `null` ohne `operations` (älteres Backend). */
export function selectOperations(shipment) {
  const o = shipment && typeof shipment === "object" ? shipment.operations : null;
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const rek = o.reconciliation && typeof o.reconciliation === "object" ? o.reconciliation : {};
  const docs = o.documents && typeof o.documents === "object" ? o.documents : {};
  const inv = o.invoice && typeof o.invoice === "object" ? o.invoice : null;
  const oc = o.orderConfirmation && typeof o.orderConfirmation === "object" ? o.orderConfirmation : null;
  const canc = o.cancellation && typeof o.cancellation === "object" ? o.cancellation : null;
  // MF-03: nur eine Sendung MIT Portalvorgang trägt `portal`. Fehlt es (JUMiNGO, ein
  // Transglobal-V2-Service, ein älteres Backend), bleibt es `null` und nichts wird gezeigt.
  const prt = o.portal && typeof o.portal === "object" && !Array.isArray(o.portal) ? o.portal : null;
  // INTERNAL-01: nur eine GEBUCHTE Sendung trägt `labelAvailability`; ein älteres Backend liefert es nicht.
  const lab = o.labelAvailability && typeof o.labelAvailability === "object" && !Array.isArray(o.labelAvailability)
    ? o.labelAvailability : null;
  return {
    provider: text(o.provider),
    providerText: o.provider ? providerLabel(o.provider) : "Noch kein gebuchter Anbieter",
    providerServiceId: text(o.providerServiceId),
    providerBookingReference: text(o.providerBookingReference),
    trackingReferences: liste(o.trackingReferences).filter((t) => typeof t === "string" && t !== ""),
    bookedAt: o.bookedAt ?? null,
    latestAttemptId: zahl(o.latestAttemptId),
    attemptsTotal: zahl(o.attemptsTotal) ?? 0,
    attemptsLimited: o.attemptsLimited === true,
    legacyWithoutAttempt: o.legacyWithoutAttempt === true,
    reconciliation: {
      open: rek.open === true,
      attemptId: zahl(rek.attemptId),
      provider: text(rek.provider),
      state: text(rek.state),
      actionable: rek.actionable === true,
      actionableAt: rek.actionableAt ?? null,
      overdue: rek.overdue === true,
      bookingWithoutOpenAttempt: rek.bookingWithoutOpenAttempt === true,
    },
    attempts: liste(o.bookingAttempts).map(versuch).filter(Boolean),
    portal: prt && text(prt.portalService) ? {
      portalService: text(prt.portalService),
      portalServiceId: zahl(prt.portalServiceId),
      state: text(prt.state),
      orderReference: text(prt.orderReference),
      carrierReference: text(prt.carrierReference),
      errorReason: text(prt.errorReason),
      labelStatus: text(prt.labelStatus),
      labelStatusMeta: text(prt.labelStatus) ? portalLabelStatusMeta(prt.labelStatus) : null,
      lastCheckedAt: prt.lastCheckedAt ?? null,
      startedAt: prt.startedAt ?? null,
    } : null,
    labelAvailability: lab && text(lab.state) ? {
      state: text(lab.state),
      meta: labelAvailabilityMeta(lab.state),
      lastNotReadyAt: lab.lastNotReadyAt ?? null,
      lastFailedAt: lab.lastFailedAt ?? null,
      lastError: text(lab.lastError),
    } : null,
    documents: {
      storedLabel: docs.storedLabel === true,
      providerDocuments: liste(docs.providerDocuments)
        .filter((d) => d && typeof d === "object" && text(d.documentType))
        .map((d) => ({
          id: zahl(d.id), documentType: d.documentType, typeText: documentTypeLabel(d.documentType),
          ordinal: zahl(d.ordinal), format: text(d.format), labelSize: text(d.labelSize),
          sizeBytes: zahl(d.sizeBytes), createdAt: d.createdAt ?? null, bookingAttemptId: zahl(d.bookingAttemptId),
        })),
    },
    invoice: inv ? {
      id: zahl(inv.id), invoiceNumber: text(inv.invoiceNumber),
      documentStatus: text(inv.documentStatus), documentMeta: invoiceDocumentStatusMeta(inv.documentStatus),
      emailStatus: text(inv.emailStatus), emailMeta: mailStatusMeta(inv.emailStatus),
      emailAttempts: zahl(inv.emailAttempts), emailSentAt: inv.emailSentAt ?? null,
    } : null,
    orderConfirmation: oc ? {
      id: zahl(oc.id), confirmationNumber: text(oc.confirmationNumber),
      emailStatus: text(oc.emailStatus), emailMeta: mailStatusMeta(oc.emailStatus),
      emailAttempts: zahl(oc.emailAttempts), emailSentAt: oc.emailSentAt ?? null,
    } : null,
    emailDeliveries: liste(o.emailDeliveries)
      .filter((e) => e && typeof e === "object" && zahl(e.id) !== null)
      .map((e) => ({
        id: zahl(e.id), notificationType: text(e.notificationType), status: text(e.status),
        statusMeta: mailStatusMeta(e.status), attemptNumber: zahl(e.attemptNumber),
        errorCode: text(e.errorCode), createdAt: e.createdAt ?? null, sentAt: e.sentAt ?? null,
      })),
    cancellation: canc && zahl(canc.id) !== null ? {
      id: zahl(canc.id), status: text(canc.status), statusMeta: cancellationStatusMeta(canc.status),
      createdAt: canc.createdAt ?? null, resolvedAt: canc.resolvedAt ?? null,
      to: `/admin/cancellation-requests/${zahl(canc.id)}`,
    } : null,
  };
}

/** Zusammenfassung des Belegstands: gesichertes Label und Anzahl der Anbieterbelege je Art. */
export function documentsSummary(ops) {
  const docs = ops && ops.documents ? ops.documents : { storedLabel: false, providerDocuments: [] };
  const labels = docs.providerDocuments.filter((d) => d.documentType === "LABEL").length;
  return {
    hasLabel: docs.storedLabel || labels > 0,
    storedLabel: docs.storedLabel,
    providerLabelCount: labels,
    providerDocumentCount: docs.providerDocuments.length,
  };
}

/**
 * Die Hinweise zur Buchung — leer, wenn es nichts zu klären gibt. Mehrere können
 * zugleich gelten (etwa „gesperrt ohne offenen Versuch" UND „Altbestand").
 * → Array<{ kind, tone: "warning"|"info", text, to }>
 */
export function reconciliationNotices(ops) {
  if (!ops) return [];
  const r = ops.reconciliation;
  const out = [];
  if (r.open && r.attemptId !== null) {
    out.push({
      kind: r.overdue ? "overdue" : "open",
      tone: "warning",
      text: r.overdue
        ? "Buchungsklärung überfällig — der Ausgang beim Anbieter ist seit über 10 Minuten offen."
        : "Der Buchungsausgang ist ungeklärt.",
      to: `/admin/reconciliation/${r.attemptId}`,
    });
  } else if (r.bookingWithoutOpenAttempt) {
    // Gesperrt ohne offenen Versuch: der Beginn des Buchungsaufrufs ist unbekannt.
    // Nie automatisch freigeben — das Runbook entscheidet.
    out.push({
      kind: "booking_without_open_attempt",
      tone: "warning",
      text: "Die Sendung ist gesperrt, ohne offenen Buchungsversuch — der Beginn des Buchungsaufrufs ist unbekannt. Nichts freigeben; nach Runbook prüfen.",
      to: null,
    });
  }
  if (ops.legacyWithoutAttempt) {
    out.push({ kind: "legacy", tone: "info", text: "Altbestand – kein Booking Attempt vorhanden.", to: null });
  }
  return out;
}
