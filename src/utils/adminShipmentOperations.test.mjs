// Tests für die Betriebssicht des Admin-Sendungsdetails (Package C): Rückwärts-
// kompatibilität ohne `operations`, kanonische Versuche, Belege, Mails, Stornierung
// und die Hinweise zur Buchungsklärung.
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminShipmentOperations.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectOperations,
  documentsSummary,
  reconciliationNotices,
  documentTypeLabel,
  mailStatusMeta,
  invoiceDocumentStatusMeta,
} from "./adminShipmentOperations.mjs";

const OPS = (over = {}) => ({
  operations: {
    provider: "jumingo", providerServiceId: "SVC-9", providerBookingReference: "ORD-77",
    trackingReferences: ["1Z999", "", 7, "1Z998"], bookedAt: "2026-09-12T08:00:00Z",
    latestAttemptId: 501, attemptsTotal: 2, attemptsLimited: false, legacyWithoutAttempt: false,
    reconciliation: { open: false, attemptId: null, provider: null, state: null, actionable: false,
      actionableAt: null, overdue: false, bookingWithoutOpenAttempt: false },
    bookingAttempts: [
      { id: 501, provider: "jumingo", attempt: 2, state: "booked", createdAt: "t2", resolution: null, isLatest: true,
        expectedProviderCostNet: "20.00", actualProviderCostNet: "22.52",
        invoiceDrift: { kind: "provider_charged_more", expectedNet: "20.00", actualNet: "22.52", deltaNet: "2.52",
          detectedAt: "t3", reviewedAt: null, reviewedBy: null } },
      { id: "500", provider: "jumingo", attempt: 1, state: "not_booked", createdAt: "t1", resolution: null, isLatest: false },
      { provider: "jumingo" },
    ],
    documents: { storedLabel: false, providerDocuments: [
      { id: 1, documentType: "LABEL", ordinal: 1, format: "PDF", sizeBytes: 1024, bookingAttemptId: 501 },
      { id: 2, documentType: "COLLECTION_LABEL", ordinal: 1 },
      { id: 3 },
    ] },
    invoice: { id: 3, invoiceNumber: "CE-RE-1", documentStatus: "ready", emailStatus: "failed", emailAttempts: 2, emailSentAt: null },
    orderConfirmation: { id: 8, confirmationNumber: "CE-AB-1", emailStatus: "sent", emailAttempts: 1, emailSentAt: "t" },
    emailDeliveries: [{ id: 11, notificationType: "not_booked_notice", status: "failed", attemptNumber: 2, errorCode: "provider_failed" }],
    cancellation: { id: 12, status: "in_review", createdAt: "t", resolvedAt: null },
    ...over,
  },
});

test("ohne `operations` (älteres Backend) gibt es keine Betriebssicht — nichts wird geraten", () => {
  for (const s of [null, undefined, {}, { operations: null }, { operations: [] }, { operations: "x" }]) {
    assert.equal(selectOperations(s), null, JSON.stringify(s));
  }
  assert.deepEqual(reconciliationNotices(null), []);
  assert.deepEqual(documentsSummary(null), { hasLabel: false, storedLabel: false, providerLabelCount: 0, providerDocumentCount: 0 });
});

test("Versuche: Zahlen als Zahlen, übersetzte Anzeige, kennungslose Einträge fallen weg", () => {
  const o = selectOperations(OPS());
  assert.equal(o.attempts.length, 2);
  const [neu, alt] = o.attempts;
  assert.deepEqual([neu.id, neu.attempt, neu.isLatest, neu.providerText], [501, 2, true, "JUMiNGO"]);
  assert.deepEqual([neu.expectedProviderCostNet, neu.actualProviderCostNet], [20, 22.52]);
  assert.deepEqual(neu.stateMeta, ["badge-blue", "Anbieter: gebucht"]);
  assert.equal(neu.invoiceDrift.kindText, "Anbieter berechnet mehr als erwartet");
  assert.deepEqual([neu.invoiceDrift.deltaNet, neu.invoiceDrift.reviewed], [2.52, false]);
  assert.deepEqual([alt.id, alt.isLatest, alt.invoiceDrift], [500, false, null]);
  assert.deepEqual(o.trackingReferences, ["1Z999", "1Z998"], "nur echte Referenzen");
  assert.deepEqual([o.attemptsTotal, o.attemptsLimited, o.latestAttemptId], [2, false, 501]);
  assert.equal(o.providerText, "JUMiNGO");
  assert.equal(selectOperations(OPS({ provider: null })).providerText, "Noch kein gebuchter Anbieter");
});

test("Belege, Rechnungs- und Mailstatus: übersetzt, unbekannte Werte über den Fallback", () => {
  const o = selectOperations(OPS());
  assert.deepEqual(o.documents.providerDocuments.map((d) => d.typeText), ["Versandlabel", "Abholetikett"]);
  assert.deepEqual(documentsSummary(o), { hasLabel: true, storedLabel: false, providerLabelCount: 1, providerDocumentCount: 2 });
  assert.equal(documentsSummary(selectOperations(OPS({ documents: { storedLabel: true, providerDocuments: [] } }))).hasLabel, true);
  assert.equal(documentsSummary(selectOperations(OPS({ documents: { storedLabel: false, providerDocuments: [{ id: 5, documentType: "COLLECTION_LABEL" }] } }))).hasLabel,
    false, "ein Abholetikett ist kein Versandlabel");
  assert.equal(documentTypeLabel("PACKING_LIST"), "Packliste");
  assert.equal(documentTypeLabel("RAW_PROVIDER_TYPE"), "Unbekannter Beleg");
  assert.deepEqual(o.invoice.documentMeta, ["badge-green", "Bereit"]);
  assert.deepEqual(o.invoice.emailMeta, ["badge-red", "Fehlgeschlagen"]);
  assert.deepEqual(o.orderConfirmation.emailMeta, ["badge-green", "Gesendet"]);
  assert.equal(mailStatusMeta("weird")[1], "Unbekannter Status");
  assert.equal(invoiceDocumentStatusMeta("weird")[1], "Unbekannter Status");
  assert.equal(o.emailDeliveries[0].notificationType, "not_booked_notice");
});

test("Stornierung verlinkt auf die Anfrage", () => {
  const o = selectOperations(OPS());
  assert.deepEqual([o.cancellation.id, o.cancellation.to, o.cancellation.statusMeta[1]],
    [12, "/admin/cancellation-requests/12", "In Prüfung"]);
  assert.equal(selectOperations(OPS({ cancellation: null })).cancellation, null);
  assert.equal(selectOperations(OPS({ cancellation: { status: "pending" } })).cancellation, null, "ohne Kennung kein Link");
});

test("Hinweise: offen mit Link, überfällig benannt, gesperrt ohne offenen Versuch ohne Link, Altbestand", () => {
  const offen = selectOperations(OPS({ reconciliation: { open: true, attemptId: 501, provider: "jumingo", state: "ambiguous",
    actionable: false, actionableAt: "t", overdue: false, bookingWithoutOpenAttempt: false } }));
  assert.deepEqual(reconciliationNotices(offen).map((n) => [n.kind, n.tone, n.to]), [["open", "warning", "/admin/reconciliation/501"]]);
  const ueberfaellig = selectOperations(OPS({ reconciliation: { open: true, attemptId: 501, overdue: true } }));
  assert.equal(reconciliationNotices(ueberfaellig)[0].kind, "overdue");
  assert.match(reconciliationNotices(ueberfaellig)[0].text, /überfällig/);

  const gesperrt = selectOperations(OPS({ legacyWithoutAttempt: true, bookingAttempts: [],
    reconciliation: { open: false, attemptId: null, bookingWithoutOpenAttempt: true } }));
  assert.deepEqual(reconciliationNotices(gesperrt).map((n) => [n.kind, n.to]),
    [["booking_without_open_attempt", null], ["legacy", null]]);
  assert.match(reconciliationNotices(gesperrt)[0].text, /Beginn des Buchungsaufrufs ist unbekannt/);
  assert.equal(reconciliationNotices(gesperrt)[1].text, "Altbestand – kein Booking Attempt vorhanden.");

  assert.deepEqual(reconciliationNotices(selectOperations(OPS())), [], "eine normal gebuchte Sendung hat keinen Hinweis");
  // Kein Hinweistext nennt einen Einkaufsanbieter oder einen technischen Code.
  for (const n of [...reconciliationNotices(offen), ...reconciliationNotices(gesperrt)]) {
    assert.doesNotMatch(n.text, /jumingo|transglobal|_/i);
  }
});
