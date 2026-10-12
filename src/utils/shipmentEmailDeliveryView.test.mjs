// Zusätzliche Sendungsbenachrichtigungen (Adminsicht): Zustandsanzeige und Rückmeldung nach
// „Erneut versuchen" — insbesondere der UNKLARE Ausgang (JOB-2), der kein „Fehlgeschlagen" ist.
//
// Run: node --test src/utils/shipmentEmailDeliveryView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DELIVERY_ERROR_OUTCOME_UNKNOWN, DELIVERY_UNCLEAR_HINT, RETRY_STARTED_TEXT, RETRY_UNCLEAR_TEXT,
  canRetryDelivery, deliveryOutcomeUnclear, deliveryStatusMeta, retryOutcomeMessage,
} from "./shipmentEmailDeliveryView.mjs";

const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const seite = ohneKommentare(readFileSync(new URL("../pages/admin/AdminShipmentDetailPage.jsx", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n"));

test("1 — die vier Zustände bleiben; ein unbekannter Wert wird nicht geraten", () => {
  assert.deepEqual(deliveryStatusMeta("pending"), ["badge--progress", "Wartet auf Versand", "pending"]);
  assert.deepEqual(deliveryStatusMeta("sending"), ["badge--progress", "Wird gesendet", "sending"]);
  assert.deepEqual(deliveryStatusMeta("sent"), ["badge--success", "Gesendet", "sent"]);
  assert.deepEqual(deliveryStatusMeta("failed"), ["badge--error", "Fehlgeschlagen", "failed"]);
  assert.deepEqual(deliveryStatusMeta("failed", "provider_rejected"), ["badge--error", "Fehlgeschlagen", "failed"]);
  assert.deepEqual(deliveryStatusMeta("irgendwas"), ["badge--neutral", "Unbekannter Status", "irgendwas"]);
  assert.deepEqual(deliveryStatusMeta(null), ["badge--neutral", "Unbekannter Status", ""]);
});

test("2 — unklarer Ausgang: eigener Zustand mit Prüfhinweis, nur bei `failed` mit dem Servercode", () => {
  assert.equal(DELIVERY_ERROR_OUTCOME_UNKNOWN, "send_outcome_unknown");
  assert.deepEqual(deliveryStatusMeta("failed", "send_outcome_unknown"), ["badge--warning", "Ergebnis unklar", "failed"]);
  assert.equal(deliveryOutcomeUnclear({ status: "failed", error_code: "send_outcome_unknown" }), true);
  // Derselbe Code an einem anderen Zustand ist kein unklarer Ausgang (der Server setzt ihn nur mit `failed`).
  for (const status of ["pending", "sending", "sent"]) {
    assert.equal(deliveryOutcomeUnclear({ status, error_code: "send_outcome_unknown" }), false, status);
    assert.notEqual(deliveryStatusMeta(status, "send_outcome_unknown")[1], "Ergebnis unklar", status);
  }
  assert.equal(deliveryOutcomeUnclear(null), false);
  assert.match(DELIVERY_UNCLEAR_HINT, /prüfen, ob die Mail angekommen ist/);
  // Der Knopf bleibt: entschieden wird serverseitig (gleicher Schlüssel im Fenster, danach bewusster neuer Versuch).
  assert.equal(canRetryDelivery({ status: "failed", error_code: "send_outcome_unknown" }), true);
});

test("3 — Rückmeldung nach „Erneut versuchen“: unklar ist kein Erfolg, alles andere bleibt wie bisher", () => {
  assert.deepEqual(retryOutcomeMessage("unclear"), { type: "error", text: RETRY_UNCLEAR_TEXT });
  for (const outcome of ["sent", "failed", "deferred", undefined, null]) {
    assert.deepEqual(retryOutcomeMessage(outcome), { type: "success", text: RETRY_STARTED_TEXT }, String(outcome));
  }
  assert.equal(RETRY_STARTED_TEXT, "Der Versand wurde erneut angestoßen.");
  assert.match(RETRY_UNCLEAR_TEXT, /Ausgang ist aber unklar/);
});

test("4 — die Detailseite übergibt den Fehlercode und wertet das `outcome` der Antwort aus", () => {
  assert.match(seite, /deliveryStatusMeta\(row\.status, row\.error_code\)/);
  assert.match(seite, /deliveryOutcomeUnclear\(row\)\s*\?\s*DELIVERY_UNCLEAR_HINT/);
  assert.match(seite, /setRetryMsg\(retryOutcomeMessage\(d\?\.outcome\)\);/);
  // Kein Rohwert im sichtbaren Text: der Fehlercode steht nirgends als Kind eines Elements.
  assert.doesNotMatch(seite, /\{row\.error_code\}|\{row\.error_message\}/);
});
