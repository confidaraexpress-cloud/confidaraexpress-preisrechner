// Tests für die Kunden-Stornierungslogik (Sichtbarkeit, Reason-Validierung,
// Statusanzeige, Fehlerklassifikation). Node-Test-Runner:
//   node --test src/utils/customerCancellation.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// Der Sendungshandle ist die interne shipments.id — dieselbe ID wie bei Label
// und Tracking. Die Providerreferenz spielt kundenseitig keine Rolle mehr.
const booked = (over = {}) => ({ status: "booked", id: 4711, ...over });

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

test("Button NICHT sichtbar ohne CE-Sendungshandle (Request nicht adressierbar)", () => {
  assert.equal(canRequestCancellation({ status: "booked" }), false);
  assert.equal(canRequestCancellation({ status: "booked", id: "" }), false);
  assert.equal(canRequestCancellation({ status: "booked", id: null }), false);
});

test("Die Providerreferenz ist kein Kriterium mehr — eine Sendung ohne sie bleibt anfragbar", () => {
  // Sie sagt nichts darüber aus, ob der Kunde über seine Sendung sprechen darf;
  // ob eine Stornierung fachlich möglich ist, entscheidet der Server.
  assert.equal(canRequestCancellation({ status: "booked", id: 4711 }), true);
  assert.equal(canRequestCancellation({ status: "booked", id: 4711, jumingo_shipment_id: "" }), true);
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

test("Status-Fallback: unbekannt → „Unbekannter Status“", () => {
  assert.deepEqual(customerCancellationStatusMeta("weird"), ["badge-gray", "Unbekannter Status", "weird"]);
  assert.deepEqual(customerCancellationStatusMeta(null), ["badge-gray", "—", null]);
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

test("shipmentDialogLabel: eigene Referenz bevorzugt, sonst die Auftragsbestätigung", () => {
  assert.equal(shipmentDialogLabel({ reference_number: "REF-9" }), "REF-9");
  assert.equal(shipmentDialogLabel({ order_confirmation_number: "CE-AB26-00042" }), "CE-AB26-00042");
  assert.equal(shipmentDialogLabel({ reference_number: "REF-9", order_confirmation_number: "CE-AB26-00042" }), "REF-9");
  // Die Trackingnummer ist die letzte Stufe — sie steht in der Sendungsliste
  // und in den Versandmails, ist also für den Kunden wiederfindbar.
  assert.equal(shipmentDialogLabel({ tracking_number: "1Z999" }), "1Z999");
  // Die interne Bestellnummer (CE-BS…) ist ausdrücklich KEIN Kürzel mehr.
  assert.equal(shipmentDialogLabel({ business_order_number: "CE-BS26-00042" }), "");
  assert.equal(shipmentDialogLabel({}), "");
});

test("shipmentDialogLabel zeigt NIE die Providerreferenz", () => {
  // Vorher stand hier ersatzweise deren maskierte Endung — eine fremde ID in
  // kundensichtbarem Text, die der Kunde nirgends wiederfindet.
  assert.equal(shipmentDialogLabel({ jumingo_shipment_id: "ABCD123456" }), "");
  assert.equal(shipmentDialogLabel({ id: 4711, jumingo_shipment_id: "ABCD123456" }), "");
});

/* ══════════════════════════════════════════════════════════════════════════════
   Regression: der Wiederherstellungszweig übergab eine Variable, die es nicht gibt

   In `submitCancel` (ShipmentsList.jsx) stand im Zweig „Serverzustand hat sich
   geändert" `onCancellationRequested?.(jid, …)`. `jid` war ein Restname aus der
   Zeit, als die Stornierung über die JUMiNGO-Referenz adressiert wurde — die
   Variable existiert in der Funktion nicht. In einem ES-Modul (strict mode) ist
   das ein ReferenceError, geworfen INNERHALB des try und vom äußeren catch
   gefangen. Sichtbare Folge: der Kunde las „konnte nicht gesendet werden",
   obwohl der Server geantwortet hatte, und die Liste wurde nie abgeglichen
   (`fetchData()` lief nicht) — die Zeile behielt ihren alten Zustand.

   Erwartet wird `ceId`: derselbe CE-Sendungshandle, mit dem der Request
   adressiert wird, den der Erfolgszweig übergibt und den der Empfänger
   (DashboardPage.handleCancellationRequested) gegen `s.id` der Zeilen vergleicht.

   Das gerenderte Verhalten prüft tests/e2e/cancellationRecovery.test.mjs.
   ══════════════════════════════════════════════════════════════════════════════ */

const listeQuelle = readFileSync(new URL("../components/dashboard/ShipmentsList.jsx", import.meta.url), "utf8");
const dashboardQuelle = readFileSync(new URL("../pages/DashboardPage.jsx", import.meta.url), "utf8");
// Kommentarfreier Quelltext — eine Erklärung darf keine Zusicherung belegen und
// keine verletzen: der Kommentar an der Fundstelle nennt den alten Namen absichtlich.
const ohneKommentare = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

function submitCancelQuelle() {
  const code = ohneKommentare(listeQuelle);
  const von = code.indexOf("const submitCancel = async (reason) => {");
  const bis = code.indexOf("\n  };", von);
  assert.ok(von > 0 && bis > von, "submitCancel nicht gefunden");
  return code.slice(von, bis);
}

test("Stornoabgleich: jede übergebene ID ist im Gültigkeitsbereich deklariert", () => {
  const fn = submitCancelQuelle();
  const argumente = [...fn.matchAll(/onCancellationRequested\?\.\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.equal(argumente.length, 2, `erwartet zwei Aufrufstellen, gefunden: ${argumente.length}`);
  for (const name of argumente) {
    // Genau das war der Fehler: ein Name, den die Funktion nirgends bindet.
    assert.match(fn, new RegExp(`const ${name}\\b\\s*=`),
      `\`${name}\` ist in submitCancel nicht deklariert — das erzeugt einen ReferenceError`);
  }
  // Und beide Zweige übergeben denselben Handle, mit dem auch der Request lief.
  assert.deepEqual(argumente, ["ceId", "ceId"]);
  assert.match(fn, /const ceId = s\.id;/, "ceId ist nicht mehr der Sendungshandle der Zeile");
  assert.match(fn, /requestShipmentCancellation\(ceId, reason\)/,
    "der Request wird mit einer anderen ID adressiert als der Abgleich");
  assert.ok(!/\bjid\b/.test(fn), "der abgelöste Name steht wieder im Code");
});

test("Stornoabgleich: der Empfänger vergleicht genau diese ID", () => {
  // handleCancellationRequested sucht die Zeile über `s.id === shipmentId`. Die
  // Zeilen kommen aus GET /kunde/shipments und tragen dort `shipments.id` — den
  // CE-Sendungshandle. `ceId = s.id` ist damit exakt der erwartete Wert; die
  // Providerreferenz (jumingo_shipment_id) wäre es NICHT und träfe keine Zeile.
  const code = ohneKommentare(dashboardQuelle);
  assert.match(code, /const handleCancellationRequested = useCallback\(\(shipmentId, patch\) =>/);
  assert.match(code, /s\.id === shipmentId/, "der Empfänger vergleicht eine andere ID");
  assert.match(code, /fetchData\(\);/, "der Abgleich lädt die Liste nicht mehr nach");
  assert.ok(!/jumingo_shipment_id/.test(code.slice(code.indexOf("handleCancellationRequested"), code.indexOf("handleCancellationRequested") + 600)),
    "der Abgleich stützt sich auf die Providerreferenz");
});
