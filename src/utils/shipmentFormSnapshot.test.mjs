// Tests für kanonischen Snapshot + Dirty-State. node --test (npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getShipmentFormSnapshot, hasMeaningfulShipmentChanges, hasMeaningfulShipmentInput, isShipmentFormDirty,
} from "./shipmentFormSnapshot.mjs";

// Vollständiger Formular-State wie in NewShipmentPage (Auto-Default-Baseline).
const blankState = (over = {}) => ({
  form: {
    s_company: "", s_fullName: "", s_street: "", s_addition: "", s_zip: "", s_city: "", s_country: "DE", s_phone: "", s_email: "",
    r_company: "", r_fullName: "", r_street: "", r_addition: "", r_zip: "", r_city: "", r_country: "CH", r_phone: "", r_email: "",
    packageCount: "1", weight: "", length: "", width: "", height: "",
    max_price: "", latestDeliveryDate: "",
    ...(over.form || {}),
  },
  shippingDate: over.shippingDate !== undefined ? over.shippingDate : "2026-08-01",
  serviceFilter: over.serviceFilter || "all",
  shippingModeFilter: over.shippingModeFilter || "all",
  selectedPublicCarrierIds: over.selectedPublicCarrierIds || [],
});

test("Snapshot: enthält exakt die erlaubten Felder (kein UI-/Ergebnis-State)", () => {
  const snap = getShipmentFormSnapshot(blankState());
  assert.deepEqual(Object.keys(snap).sort(), ["inventoryContext", "packages", "recipient", "sender", "shippingOptions"]);
  assert.equal(snap.inventoryContext, null, "eine normale Sendung hat keinen Lagerbezug");
  assert.deepEqual(Object.keys(snap.sender).sort(), ["addressAddition", "city", "company", "country", "email", "fullName", "phone", "postalCode", "streetAndNumber"].sort());
  assert.deepEqual(Object.keys(snap.packages).sort(), ["height", "length", "packageCount", "weight", "width"]);
  assert.deepEqual(Object.keys(snap.shippingOptions).sort(), ["publicCarrierIds", "serviceFilter", "shippingDate", "shippingModeFilter"]);
});
test("Snapshot: UI-/Ergebnis-only-Felder tauchen NICHT auf (max_price, latestDeliveryDate, tariffs, …)", () => {
  const json = JSON.stringify(getShipmentFormSnapshot(blankState({ form: { max_price: "50", latestDeliveryDate: "2026-09-01" } })));
  assert.ok(!/max_price|latestDeliveryDate|tariffs|shipmentId|customs|sortMode|vatMode/.test(json));
});
test("Snapshot: leere Gewicht-/Maßwerte → null, KEINE 30/20/15-Defaults", () => {
  const p = getShipmentFormSnapshot(blankState()).packages;
  assert.equal(p.weight, null);
  assert.equal(p.length, null);
  assert.equal(p.width, null);
  assert.equal(p.height, null);
  assert.equal(p.packageCount, 1);
});
test("Snapshot: numerische Strings normalisiert (Zahl, kein NaN); Komma toleriert", () => {
  const p = getShipmentFormSnapshot(blankState({ form: { weight: "8,5", length: "40", width: "abc", height: "" } })).packages;
  assert.equal(p.weight, 8.5);
  assert.equal(p.length, 40);
  assert.equal(p.width, null);  // "abc" → null, nie NaN
  assert.equal(p.height, null);
});
test("Snapshot: packageCount stabil als positive Ganzzahl (ungültig → 1)", () => {
  assert.equal(getShipmentFormSnapshot(blankState({ form: { packageCount: "3" } })).packages.packageCount, 3);
  assert.equal(getShipmentFormSnapshot(blankState({ form: { packageCount: "0" } })).packages.packageCount, 1);
  assert.equal(getShipmentFormSnapshot(blankState({ form: { packageCount: "2.5" } })).packages.packageCount, 1);
});
test("Snapshot: Carrier-IDs dedupliziert, Reihenfolge stabil, Leeres entfernt", () => {
  assert.deepEqual(getShipmentFormSnapshot(blankState({ selectedPublicCarrierIds: ["ups", "dpd", "ups", "", "dhl"] })).shippingOptions.publicCarrierIds, ["ups", "dpd", "dhl"]);
});
test("Snapshot: unbekannte Enums → 'all'", () => {
  const o = getShipmentFormSnapshot(blankState({ serviceFilter: "bogus", shippingModeFilter: "nope" })).shippingOptions;
  assert.equal(o.serviceFilter, "all");
  assert.equal(o.shippingModeFilter, "all");
});
test("Snapshot: Strings getrimmt, Land bleibt erhalten", () => {
  const snap = getShipmentFormSnapshot(blankState({ form: { r_company: "  Client SARL  ", r_country: "FR" } }));
  assert.equal(snap.recipient.company, "Client SARL");
  assert.equal(snap.recipient.country, "FR");
});
test("Snapshot: mutiert die Eingabe NICHT", () => {
  const st = blankState({ selectedPublicCarrierIds: ["ups", "ups"], form: { r_company: "  X  " } });
  const before = JSON.stringify(st);
  getShipmentFormSnapshot(st);
  assert.equal(JSON.stringify(st), before);
});

// ── Dirty-State ─────────────────────────────────────────────────────────────
test("Dirty: identische Snapshots → clean", () => {
  const a = getShipmentFormSnapshot(blankState());
  const b = getShipmentFormSnapshot(blankState());
  assert.equal(hasMeaningfulShipmentChanges(a, b), false);
  assert.equal(isShipmentFormDirty(a, b), false);
});
test("Dirty: Key-Reihenfolge-unabhängig (gleiche Werte, andere Objekt-Reihenfolge) → clean", () => {
  const base = getShipmentFormSnapshot(blankState({ form: { r_company: "A" } }));
  const reordered = { shippingOptions: base.shippingOptions, packages: base.packages, recipient: base.recipient, sender: base.sender, inventoryContext: base.inventoryContext };
  assert.equal(hasMeaningfulShipmentChanges(base, reordered), false);
});
test("Dirty: reine Auto-Defaults (leeres Formular) → clean", () => {
  const baseline = getShipmentFormSnapshot(blankState());
  const current = getShipmentFormSnapshot(blankState());
  assert.equal(isShipmentFormDirty(current, baseline), false);
});
test("Dirty: nur Land geändert auf sonst leerem Formular → NICHT dirty (kein speicherbarer Zustand)", () => {
  const baseline = getShipmentFormSnapshot(blankState());
  const current = getShipmentFormSnapshot(blankState({ form: { r_country: "FR" } }));
  assert.equal(hasMeaningfulShipmentChanges(current, baseline), true); // es IST eine Änderung
  assert.equal(hasMeaningfulShipmentInput(current, baseline), false);  // aber nichts Speicherbares
  assert.equal(isShipmentFormDirty(current, baseline), false);
});
test("Dirty: leeres Formular ist trotz vorbelegtem Standarddatum NICHT speicherbar", () => {
  const baseline = getShipmentFormSnapshot(blankState());
  assert.equal(hasMeaningfulShipmentInput(getShipmentFormSnapshot(blankState()), baseline), false);
});
test("Dirty: NUR bewusst geändertes Versanddatum (sonst leer) → dirty", () => {
  const baseline = getShipmentFormSnapshot(blankState());
  const current = getShipmentFormSnapshot(blankState({ shippingDate: "2026-12-24" }));
  assert.equal(isShipmentFormDirty(current, baseline), true);
});
test("Dirty: Empfängerfirma eingegeben → dirty", () => {
  const baseline = getShipmentFormSnapshot(blankState());
  const current = getShipmentFormSnapshot(blankState({ form: { r_company: "Client SARL" } }));
  assert.equal(isShipmentFormDirty(current, baseline), true);
});
test("Dirty: Gewicht/Maße/Paketanzahl/Datum/Filter/Carrier je einzeln → dirty", () => {
  const baseline = getShipmentFormSnapshot(blankState());
  const cases = [
    blankState({ form: { r_company: "X", weight: "5" } }),
    blankState({ form: { r_company: "X", length: "30" } }),
    blankState({ form: { r_company: "X", packageCount: "2" } }),
    blankState({ form: { r_company: "X" }, shippingDate: "2026-09-09" }),
    blankState({ form: { r_company: "X" }, serviceFilter: "pickup" }),
    blankState({ form: { r_company: "X" }, selectedPublicCarrierIds: ["ups"] }),
  ];
  for (const c of cases) assert.equal(isShipmentFormDirty(getShipmentFormSnapshot(c), baseline), true);
});
test("Dirty: Profil-Prefill als Baseline → clean (Prefill zählt nicht als Änderung)", () => {
  const profile = blankState({ form: { s_company: "Meine GmbH", s_fullName: "Chef", s_city: "Berlin", s_zip: "10115" } });
  const baseline = getShipmentFormSnapshot(profile);
  const current = getShipmentFormSnapshot(profile);
  assert.equal(isShipmentFormDirty(current, baseline), false);
});
test("Dirty: Resume-Snapshot als Baseline → clean; spätere Änderung → dirty", () => {
  const resumed = blankState({ form: { s_fullName: "Max", r_company: "Client", r_city: "Paris", r_country: "FR", weight: "5" }, serviceFilter: "pickup" });
  const baseline = getShipmentFormSnapshot(resumed);
  assert.equal(isShipmentFormDirty(getShipmentFormSnapshot(resumed), baseline), false);
  const edited = { ...resumed, form: { ...resumed.form, weight: "9" } };
  assert.equal(isShipmentFormDirty(getShipmentFormSnapshot(edited), baseline), true);
});
test("Dirty: Adressbuch-Prefill als Ausgangsbasis → clean", () => {
  const prefilled = blankState({ form: { r_company: "Adressbuch AG", r_fullName: "Kontakt", r_street: "Weg 1", r_zip: "75001", r_city: "Paris", r_country: "FR" } });
  const baseline = getShipmentFormSnapshot(prefilled);
  assert.equal(isShipmentFormDirty(getShipmentFormSnapshot(prefilled), baseline), false);
});
test("Dirty: nach Save (Baseline = gespeicherter Snapshot) → clean; erneute Änderung → dirty", () => {
  const saved = blankState({ form: { r_company: "Gespeichert", weight: "7" } });
  const baseline = getShipmentFormSnapshot(saved); // Baseline nach Save
  assert.equal(isShipmentFormDirty(getShipmentFormSnapshot(saved), baseline), false);
  const changed = { ...saved, form: { ...saved.form, r_company: "Geändert" } };
  assert.equal(isShipmentFormDirty(getShipmentFormSnapshot(changed), baseline), true);
});
