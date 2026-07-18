// Tests für die reine TrackingPage-Anzeige-Logik (src/pages/trackingView.mjs).
// Beweist: der JUMiNGO-Envelope tracking.status ("success"/"ok"/"completed") steuert die Anzeige
// NIE; „Zugestellt"/Stufe 3 nur bei echtem Transport-„delivered"; sichere Fallbacks nach unten.
// Run: node --test src/pages/trackingView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  resolveTransportStatus, statusLabelFor, resolveStepIndex, buildTrackingView, STATUS_STEPS,
} from "./trackingView.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 1) Envelope "success" + data.status "new" + keine Events → NICHT delivered, „Daten übermittelt", Stufe 0
test("(1) tracking.status=success + data.status=new + steps=[] → Daten übermittelt, stepIndex 0, nicht delivered", () => {
  const result = { trackingNumber: "1Z02W93E6890484666", tracking: { status: "success", data: { status: "new", steps: [] } } };
  assert.equal(resolveTransportStatus(result), "new", "Envelope 'success' darf NICHT als Transportstatus gelesen werden");
  const v = buildTrackingView(result, { hasEvents: false });
  assert.equal(v.isDelivered, false);
  assert.equal(v.heroStatus, "Daten übermittelt");
  assert.equal(v.stepIndex, 0);
  assert.notEqual(v.heroStatus, "Zugestellt");
});

// ── 2) Envelope "success", kein data.status, kein trackingStatus, keine Events → neutral, nicht delivered
test("(2) nur Envelope success, kein Transportstatus, steps=[] → neutraler Zustand, nicht delivered", () => {
  const result = { tracking: { status: "success", data: { steps: [] } } };
  assert.equal(resolveTransportStatus(result), null, "kein Transportstatus vorhanden → null (Envelope ignoriert)");
  const v = buildTrackingView(result, { hasEvents: false });
  assert.equal(v.isDelivered, false);
  assert.notEqual(v.heroStatus, "Zugestellt");
  assert.equal(v.stepIndex, 0);
});

// ── 3) trackingStatus=delivered → „Zugestellt", Stufe 3
test("(3) trackingStatus=delivered → Zugestellt, stepIndex 3", () => {
  const v = buildTrackingView({ trackingStatus: "delivered" }, { hasEvents: false });
  assert.equal(v.isDelivered, true);
  assert.equal(v.heroStatus, "Zugestellt");
  assert.equal(v.stepIndex, 3);
});

// ── 4) tracking.data.status=delivered → „Zugestellt"
test("(4) tracking.data.status=delivered → Zugestellt", () => {
  const v = buildTrackingView({ tracking: { status: "success", data: { status: "delivered" } } }, { hasEvents: false });
  assert.equal(resolveTransportStatus({ tracking: { status: "success", data: { status: "delivered" } } }), "delivered");
  assert.equal(v.heroStatus, "Zugestellt");
  assert.equal(v.stepIndex, 3);
});

// ── 5) transit → „Unterwegs", Stufe 1
test("(5) transit → Unterwegs, stepIndex 1", () => {
  assert.equal(statusLabelFor("transit"), "Unterwegs");
  assert.equal(resolveStepIndex("transit"), 1);
  assert.equal(statusLabelFor("in_transit"), "Unterwegs");
  assert.equal(resolveStepIndex("in_transit"), 1);
  const v = buildTrackingView({ trackingStatus: "transit" }, { hasEvents: true });
  assert.equal(v.heroStatus, "Unterwegs");
  assert.equal(v.stepIndex, 1);
});

// ── 6) out_for_delivery → „In Zustellung", Stufe 2
test("(6) out_for_delivery → In Zustellung, stepIndex 2", () => {
  assert.equal(statusLabelFor("out_for_delivery"), "In Zustellung");
  assert.equal(resolveStepIndex("out_for_delivery"), 2);
  const v = buildTrackingView({ trackingStatus: "out_for_delivery" }, { hasEvents: true });
  assert.equal(v.heroStatus, "In Zustellung");
  assert.equal(v.stepIndex, 2);
});

// ── 7) unbekannter Status → sicherer Fallback, Stufe 0
test("(7) unbekannter Status → statusLabel null, stepIndex 0, nie Zugestellt", () => {
  assert.equal(statusLabelFor("wibble"), null);
  assert.equal(resolveStepIndex("wibble"), 0);
  const v = buildTrackingView({ trackingStatus: "wibble", trackingNumber: "X1" }, { hasEvents: false });
  assert.equal(v.isDelivered, false);
  assert.equal(v.stepIndex, 0);
  assert.notEqual(v.heroStatus, "Zugestellt");
});

// ── 8) Envelope-Werte success/ok/completed dürfen NIEMALS „Zugestellt" erzeugen
test("(8) Envelope-Werte success/ok/completed → nie Zugestellt / nie Stufe 3", () => {
  for (const env of ["success", "ok", "completed", "SUCCESS", "Success"]) {
    // als reiner Statuswert:
    assert.equal(statusLabelFor(env), null, `${env}: kein Label`);
    assert.equal(resolveStepIndex(env), 0, `${env}: Stufe 0`);
    // als Envelope im Result (tracking.status) — darf die Sicht nicht steuern:
    const v = buildTrackingView({ tracking: { status: env, data: { steps: [] } }, trackingNumber: "N1" }, { hasEvents: false });
    assert.equal(v.isDelivered, false, `${env}: nicht delivered`);
    assert.notEqual(v.heroStatus, "Zugestellt", `${env}: Hero nicht Zugestellt`);
    assert.notEqual(v.stepIndex, 3, `${env}: nicht Stufe 3`);
  }
});

// ── 9) echte Delivered-Sendung bleibt korrekt delivered (auch neben Envelope + mit Events)
test("(9) echte Delivered-Sendung bleibt Zugestellt/Stufe 3", () => {
  const result = {
    trackingStatus: "delivered",
    tracking: { status: "success", data: { status: "delivered", steps: [{ type: "Zugestellt", date: "2026-07-10", time: "10:10" }] } },
  };
  const v = buildTrackingView(result, { hasEvents: true });
  assert.equal(v.isDelivered, true);
  assert.equal(v.heroStatus, "Zugestellt");
  assert.equal(v.stepIndex, 3);
  // delivered bleibt auch bei AUSNAHMSWEISE leerer Eventliste sichtbar:
  const vEmpty = buildTrackingView({ trackingStatus: "delivered" }, { hasEvents: false });
  assert.equal(vEmpty.heroStatus, "Zugestellt");
  assert.equal(vEmpty.stepIndex, 3);
});

// ── 10) Neue Suche setzt altes Resultat weiterhin zurück (setResult(null) in track())
test("(10) track() setzt result vor dem fetch zurück (kein Stale-Ergebnis)", () => {
  const src = readFileSync(join(__dirname, "TrackingPage.jsx"), "utf8");
  const trackFn = src.slice(src.indexOf("const track = async"), src.indexOf("// Live-Format"));
  const resetIdx = trackFn.indexOf("setResult(null)");
  const fetchIdx = trackFn.indexOf("await fetch(");
  assert.ok(resetIdx > 0, "setResult(null) muss im track-Handler vorhanden sein");
  assert.ok(fetchIdx > resetIdx, "setResult(null) muss VOR dem fetch stehen (altes Ergebnis verworfen)");
});

// ── Zusätzliche Härtung: undelivered darf NICHT als delivered (Stufe 3) gelten
test("(H) undelivered → Nicht zustellbar, stepIndex 0 (kein Substring-Treffer auf 'delivered')", () => {
  assert.equal(statusLabelFor("undelivered"), "Nicht zustellbar");
  assert.equal(resolveStepIndex("undelivered"), 0);
  assert.equal(buildTrackingView({ trackingStatus: "undelivered" }, { hasEvents: true }).stepIndex, 0);
});

// ── Struktur: genau vier Stufen, korrekte Reihenfolge
test("(S) STATUS_STEPS: vier Stufen in korrekter Reihenfolge", () => {
  assert.deepEqual(STATUS_STEPS, ["Daten übermittelt", "Unterwegs", "In Zustellung", "Zugestellt"]);
});
