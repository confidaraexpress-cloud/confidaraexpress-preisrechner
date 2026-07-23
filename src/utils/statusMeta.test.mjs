import { test } from "node:test";
import assert from "node:assert/strict";
import { getStatusMeta, statusBadgeClass, STATUS_DOMAINS, STATUS_META } from "./statusMeta.mjs";
import { customerCancellationStatusMeta } from "./customerCancellation.mjs";

const toneToBadge = (t) => `badge-${t}`;

// ── Parität mit dem geteilten ui/StatusBadge (dokumentierte Invariante) ──
// Werte 1:1 aus src/components/ui/StatusBadge.jsx (statusMap). getStatusMeta darf
// die bestehenden sichtbaren Labels/Farben dieser Domänen NICHT verändern.
const SHARED_BADGE = [
  ["active",      "account",  "badge-green",  "Aktiv"],
  ["approved",    "account",  "badge-green",  "Aktiv"],
  ["pending",     "account",  "badge-yellow", "Ausstehend"],
  ["blocked",     "account",  "badge-red",    "Gesperrt"],
  ["booked",      "shipment", "badge-blue",   "Gebucht"],
  ["label_ready", "shipment", "badge-blue",   "Label bereit"],
  ["draft",       "shipment", "badge-gray",   "Entwurf"],
  ["delivered",   "shipment", "badge-green",  "Zugestellt"],
  ["in_transit",  "shipment", "badge-blue",   "Unterwegs"],
  ["delayed",     "shipment", "badge-yellow", "Verzögert"],
  ["paid",        "invoice",  "badge-green",  "Bezahlt"],
  ["unpaid",      "invoice",  "badge-yellow", "Offen"],
];

test("getStatusMeta preserves shared StatusBadge label + tone", () => {
  for (const [status, domain, badgeClass, label] of SHARED_BADGE) {
    const m = getStatusMeta(status, domain);
    assert.equal(m.label, label, `${domain}:${status} label`);
    assert.equal(toneToBadge(m.tone), badgeClass, `${domain}:${status} tone`);
  }
});

// ── Echte Parität mit der Kunden-Stornierungsanzeige (importiert) ──
// Garantiert, dass die Foundation nicht von der realen Fachanzeige abweicht.
test("getStatusMeta('…','cancellation') matches customerCancellationStatusMeta 1:1", () => {
  for (const status of ["pending", "in_review", "accepted", "rejected"]) {
    const [badgeClass, label] = customerCancellationStatusMeta(status);
    const m = getStatusMeta(status, "cancellation");
    assert.equal(m.label, label, `cancellation:${status} label`);
    assert.equal(toneToBadge(m.tone), badgeClass, `cancellation:${status} tone`);
  }
  // rejected ist kundenseitig bewusst GRAU (nicht rot wie Admin).
  assert.equal(getStatusMeta("rejected", "cancellation").tone, "gray");
});

// ── Admin-Nutzerverwaltung (dokumentierte Invariante aus utils/adminUsers.js) ──
// Labels unterscheiden sich bewusst von der Kundendomäne `account`.
test("admin user domain keeps admin-specific labels", () => {
  assert.deepEqual(getStatusMeta("pending", "admin"),   { label: "Wartet",      tone: "yellow", iconKey: "clock" });
  assert.deepEqual(getStatusMeta("approved", "admin"),  { label: "Freigegeben", tone: "green",  iconKey: "check" });
  assert.deepEqual(getStatusMeta("blocked", "admin"),   { label: "Blockiert",   tone: "red",    iconKey: "ban" });
  // Gegenprobe: dieselben Werte in `account` tragen die Kundenlabels.
  assert.equal(getStatusMeta("approved", "account").label, "Aktiv");
});

// ── Fallback-Sicherheit (wie bestehende Helfer: grau + Rohwert) ──
test("unknown status falls back to gray + raw value", () => {
  assert.deepEqual(getStatusMeta("wat", "shipment"), { label: "wat", tone: "gray", iconKey: null });
  assert.equal(getStatusMeta(undefined, "shipment").label, "—");
  assert.equal(getStatusMeta(null, "invoice").label, "—");
  assert.equal(getStatusMeta("", "account").label, "—");
});

test("unknown domain falls back to shipment table", () => {
  assert.equal(getStatusMeta("booked", "does-not-exist").label, "Gebucht");
});

test("statusBadgeClass returns the badge class pair", () => {
  assert.equal(statusBadgeClass("paid", "invoice"), "badge badge-green");
  assert.equal(statusBadgeClass("nope", "invoice"), "badge badge-gray");
});

test("tone is always one of the five badge tones; iconKey is string|null", () => {
  const tones = new Set(["green", "blue", "yellow", "red", "gray"]);
  for (const domain of STATUS_DOMAINS) {
    for (const status of Object.keys(STATUS_META[domain])) {
      const m = getStatusMeta(status, domain);
      assert.ok(tones.has(m.tone), `${domain}:${status} tone ∈ badge tones`);
      assert.ok(m.iconKey === null || typeof m.iconKey === "string");
      assert.equal(typeof m.label, "string");
    }
  }
});
