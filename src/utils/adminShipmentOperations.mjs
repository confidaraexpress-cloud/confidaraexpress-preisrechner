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

   Adminintern. Diese Karte nennt Anbieter und Anbieterreferenzen ohnehin. */
const PORTAL_LABEL_STATUS_META = {
  pending: ["badge-yellow", "Wird beim Anbieter erzeugt"],
  ready: ["badge-green", "Liegt vor"],
  recovery_timeout: ["badge-red", "Nachlauf abgelaufen — bitte prüfen"],
};
export const portalLabelStatusMeta = (s) => PORTAL_LABEL_STATUS_META[s] || statusFallback(s);

/* ── INTERNAL-01: was CE über das Versandlabel einer GEBUCHTEN Sendung weiß ──
   Der Zustand kommt fertig vom Server (`operations.labelAvailability`,
   lib/labelAvailability.js); hier steht nur sein Anzeigetext. Keiner der Texte
   behauptet, der ANBIETER habe kein Label: „noch nicht in CE" heißt ausdrücklich
   nur, dass CE es noch nicht abgerufen hat.

     available             das Label liegt in CE (gespeichert oder Anbieterbeleg)
     delivered_outside_ce  per Buchungsklärung außerhalb von CE zugestellt
     fetch_failed          der letzte Abruf ist technisch gescheitert
     provider_not_ready    der Anbieter antwortete zuletzt ohne nutzbares Label
     not_in_ce_yet         noch nicht abgerufen — keine Aussage über den Anbieter */
const LABEL_AVAILABILITY_META = {
  available: ["badge-green", "In CE"],
  delivered_outside_ce: ["badge-blue", "Außerhalb von CE zugestellt"],
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
