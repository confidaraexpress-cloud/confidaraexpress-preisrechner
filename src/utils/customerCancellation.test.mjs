// Tests für die Kunden-Stornierungslogik (Sichtbarkeit, Reason-Validierung,
// Statusanzeige, Fehlerklassifikation). Node-Test-Runner:
//   node --test src/utils/customerCancellation.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANCELLATION_REASON_MIN,
  CANCELLATION_REASON_MAX,
  CANCELLABLE_SHIPMENT_STATUSES,
  customerCancellationStatusMeta,
  hasCancellationRequest,
  canRequestCancellation,
  cancellationReasonState,
  isCancellationReasonValid,
  classifyCancellationError,
  readErrorCode,
  shipmentDialogLabel,
} from "./customerCancellation.mjs";

const booked = (over = {}) => ({ status: "booked", jumingo_shipment_id: "JUM123456", ...over });

// ── Sichtbarkeit ─────────────────────────────────────────────────────────────
test("Grenzen und cancelbare Status wie vom Backend vorgegeben", () => {
  assert.equal(CANCELLATION_REASON_MIN, 10);
  assert.equal(CANCELLATION_REASON_MAX, 1000);
  assert.deepEqual(CANCELLABLE_SHIPMENT_STATUSES, ["booked", "label_ready"]);
});

test("Button sichtbar bei booked/label_ready ohne Cancellation", () => {
  assert.equal(canRequestCancellation(booked({ status: "booked" })), true);
  assert.equal(canRequestCancellation(booked({ status: "label_ready" })), true);
});

test("Button NICHT sichtbar bei bestehender Cancellation (jeder Status)", () => {
  for (const cs of ["pending", "in_review", "accepted", "rejected"]) {
    assert.equal(canRequestCancellation(booked({ cancellation_status: cs })), false, cs);
  }
});

test("Button NICHT sichtbar bei nicht-cancelbarem Sendungsstatus", () => {
  for (const st of ["draft", "delivered", "in_transit", "unknown"]) {
    assert.equal(canRequestCancellation(booked({ status: st })), false, st);
  }
});

test("Button NICHT sichtbar ohne jumingo_shipment_id (Request nicht adressierbar)", () => {
  assert.equal(canRequestCancellation({ status: "booked" }), false);
  assert.equal(canRequestCancellation({ status: "booked", jumingo_shipment_id: "" }), false);
});

test("hasCancellationRequest erkennt gesetzten Status, ignoriert leer/null", () => {
  assert.equal(hasCancellationRequest({ cancellation_status: "pending" }), true);
  assert.equal(hasCancellationRequest({ cancellation_status: "" }), false);
  assert.equal(hasCancellationRequest({ cancellation_status: null }), false);
  assert.equal(hasCancellationRequest({}), false);
});

// ── Statusanzeige ────────────────────────────────────────────────────────────
test("Kunden-Statuslabels exakt wie vorgegeben", () => {
  assert.deepEqual(customerCancellationStatusMeta("pending"), ["badge-yellow", "Stornierung angefragt"]);
  assert.deepEqual(customerCancellationStatusMeta("in_review"), ["badge-blue", "Stornierungsanfrage in Bearbeitung"]);
  assert.deepEqual(customerCancellationStatusMeta("accepted"), ["badge-green", "Stornierungsanfrage angenommen"]);
  assert.deepEqual(customerCancellationStatusMeta("rejected"), ["badge-gray", "Stornierungsanfrage abgelehnt"]);
});

test("Status-Fallback: unbekannt → grau + Rohwert", () => {
  assert.deepEqual(customerCancellationStatusMeta("weird"), ["badge-gray", "weird"]);
  assert.deepEqual(customerCancellationStatusMeta(null), ["badge-gray", "—"]);
});

// ── Reason-Validierung ───────────────────────────────────────────────────────
test("Reason: leer / nur Whitespace → ungültig (tooShort, empty)", () => {
  for (const r of ["", "   ", "\n\t ", null, undefined]) {
    const s = cancellationReasonState(r);
    assert.equal(s.valid, false);
    assert.equal(s.tooShort, true);
  }
  assert.equal(cancellationReasonState("   ").empty, true);
});

test("Reason: 9 Zeichen (nach Trim) ungültig, 10 gültig", () => {
  assert.equal(isCancellationReasonValid("123456789"), false);   // 9
  assert.equal(isCancellationReasonValid("1234567890"), true);   // 10
  // Trim: Ränder zählen nicht
  assert.equal(isCancellationReasonValid("   1234567890   "), true);
  assert.equal(isCancellationReasonValid("  12345678  "), false); // 8 nach Trim
});

test("Reason: Zähler nutzt Rohlänge; max 1000 auf Rohlänge", () => {
  const s = cancellationReasonState("  ab  "); // Rohlänge 6, getrimmt 2
  assert.equal(s.length, 6);
  assert.equal(s.trimmedLength, 2);
  const long = "x".repeat(1001);
  const sl = cancellationReasonState(long);
  assert.equal(sl.length, 1001);
  assert.equal(sl.tooLong, true);
  assert.equal(sl.valid, false);
  assert.equal(cancellationReasonState("x".repeat(1000)).valid, true);
});

// ── Fehlerklassifikation ─────────────────────────────────────────────────────
test("already_exists (Code oder 409): Dialog schließen, refetch, markPending", () => {
  for (const args of [[409, ""], [200, "CANCELLATION_REQUEST_ALREADY_EXISTS"], [409, "CANCELLATION_REQUEST_ALREADY_EXISTS"]]) {
    const e = classifyCancellationError(args[0], args[1]);
    assert.equal(e.kind, "already_exists");
    assert.equal(e.keepDialogOpen, false);
    assert.equal(e.refetch, true);
    assert.equal(e.markPending, true);
    assert.match(e.message, /bereits eine Stornierungsanfrage/);
  }
});

test("not_allowed: Dialog schließen, refetch, klare Meldung ohne Carrierdetails", () => {
  const e = classifyCancellationError(400, "SHIPMENT_CANCELLATION_NOT_ALLOWED");
  assert.equal(e.kind, "not_allowed");
  assert.equal(e.keepDialogOpen, false);
  assert.equal(e.refetch, true);
  assert.match(e.message, /keine Stornierungsanfrage mehr/);
});

test("not_found NUR beim fachlichen Code SHIPMENT_NOT_FOUND", () => {
  for (const args of [[404, "SHIPMENT_NOT_FOUND"], [400, "SHIPMENT_NOT_FOUND"]]) {
    const e = classifyCancellationError(args[0], args[1]);
    assert.equal(e.kind, "not_found");
    assert.equal(e.refetch, true);
    assert.equal(e.keepDialogOpen, false);
    assert.match(e.message, /nicht gefunden/);
  }
});

test("generischer 404 ist ein Übermittlungsfehler, KEIN Sendungsproblem", () => {
  // Ein 404 ohne fachlichen Code stammt vom globalen Not-Found-Handler (falscher
  // Pfad, Proxy-/Deploymentfehler). Genau diese Verwechslung hat den kaputten
  // Routenpfad verdeckt: der Kunde las „Sendung nicht gefunden", obwohl seine
  // Sendung existierte und nur der Endpunkt unerreichbar war.
  for (const code of ["", "Not Found", "irgendwas"]) {
    const e = classifyCancellationError(404, code);
    assert.equal(e.kind, "unavailable", `Code "${code}"`);
    assert.match(e.message, /konnte nicht übermittelt werden/);
    assert.equal(e.keepDialogOpen, true, "erneuter Versuch muss möglich bleiben");
    assert.equal(e.markPending, false, "die Zeile darf NICHT als angefragt gelten");
    assert.equal(e.refetch, false);
    assert.ok(!/Sendung wurde nicht gefunden/.test(e.message), "kein Sendungsproblem behaupten");
  }
});

test("reason_invalid (Code oder 422): Dialog offen, kein refetch", () => {
  for (const args of [[400, "CANCELLATION_REASON_INVALID"], [422, ""]]) {
    const e = classifyCancellationError(args[0], args[1]);
    assert.equal(e.kind, "reason_invalid");
    assert.equal(e.keepDialogOpen, true);
    assert.equal(e.refetch, false);
    assert.match(e.message, /10 bis 1000 Zeichen/);
  }
});

test("rate_limited (429): Dialog offen, kein Auto-Retry-Flag", () => {
  const e = classifyCancellationError(429, "");
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.keepDialogOpen, true);
  assert.equal(e.refetch, false);
  assert.match(e.message, /Zu viele Anfragen/);
});

test("generic (500/Netzwerk): Dialog offen, Reason bleibt korrigierbar", () => {
  for (const args of [[500, ""], [0, ""], [503, "WHATEVER"]]) {
    const e = classifyCancellationError(args[0], args[1]);
    assert.equal(e.kind, "generic");
    assert.equal(e.keepDialogOpen, true);
    assert.match(e.message, /konnte nicht gesendet werden/);
  }
});

test("Code hat Vorrang vor Status (reason_invalid trotz 400)", () => {
  const e = classifyCancellationError(400, "CANCELLATION_REASON_INVALID");
  assert.equal(e.kind, "reason_invalid");
});

// ── Hilfen ───────────────────────────────────────────────────────────────────
test("readErrorCode liest error/code defensiv", () => {
  assert.equal(readErrorCode({ error: "SHIPMENT_NOT_FOUND" }), "SHIPMENT_NOT_FOUND");
  assert.equal(readErrorCode({ code: "X" }), "X");
  assert.equal(readErrorCode({}), "");
  assert.equal(readErrorCode(null), "");
});

test("shipmentDialogLabel: Referenz bevorzugt, sonst maskierte JUMiNGO-ID", () => {
  assert.equal(shipmentDialogLabel({ reference_number: "REF-9" }), "REF-9");
  assert.equal(shipmentDialogLabel({ jumingo_shipment_id: "ABCD123456" }), "••••3456");
  assert.equal(shipmentDialogLabel({}), "");
});
