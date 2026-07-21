// Tests für die reine Formularentwürfe-Logik. Läuft über node --test (npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORM_DRAFT_KIND, SHIPMENT_DRAFT_KIND,
  normalizeFormDraft, normalizeShipmentDraft, combinedDraftKey, displayUpdatedAt,
  mergeDraftSources, appendFormDraftPage, removeDraftById,
  formatFormRecipient, formatFormSender, formatFormRoute, formatFormPackage, formFormShippingDate,
  blankNewShipmentForm, buildResumeInitialState,
  isValidResumeDraft, buildResumePayload, resumeSourceFromDraft,
  classifyFormDraftTransition, mapFormDraftStartError, mapFormDraftDeleteErrorToMessage,
  resolveCombinedEmpty,
} from "./formDraftsView.mjs";

const fd = (over = {}) => ({
  id: 123, kind: "form", schemaVersion: 1, revision: 4,
  summary: {
    sender: { company: "Absender GmbH", city: "Stuttgart", country: "DE" },
    recipient: { company: "Client SARL", city: "Paris", country: "FR" },
    packages: { packageCount: 2, weight: 8.5 },
    shippingDate: "2026-08-01",
  },
  createdAt: "2026-07-01T10:00:00Z", updatedAt: "2026-07-10T10:00:00Z",
  ...over,
});
const sd = (over = {}) => ({
  id: 55, jumingoShipmentId: "s_x", status: "draft", weight: 5,
  recipientAddress: { company: "Ship Co", fullName: "Max" },
  fromCountry: "DE", toCountry: "CH", fromPostalCode: "70173", toPostalCode: "8001",
  packageCount: 1, updatedAt: "2026-07-11T10:00:00Z", createdAt: "2026-07-05T10:00:00Z",
  ...over,
});

// ── Normalisierung ──────────────────────────────────────────────────────────
test("normalizeFormDraft: erzwingt kind='form'", () => {
  assert.equal(normalizeFormDraft(fd({ kind: undefined })).kind, FORM_DRAFT_KIND);
  assert.equal(normalizeFormDraft(null), null);
});
test("normalizeShipmentDraft: ergänzt kind='shipment' clientseitig, lässt Felder unangetastet", () => {
  const n = normalizeShipmentDraft(sd({ kind: undefined }));
  assert.equal(n.kind, SHIPMENT_DRAFT_KIND);
  assert.equal(n.recipientAddress.company, "Ship Co");
  assert.equal(n.toCountry, "CH");
  // bereits vorhandenes kind wird nicht überschrieben
  assert.equal(normalizeShipmentDraft(sd({ kind: "shipment" })).kind, SHIPMENT_DRAFT_KIND);
});
test("combinedDraftKey: getrennte Namensräume form:123 / shipment:123", () => {
  assert.equal(combinedDraftKey({ kind: "form", id: 123 }), "form:123");
  assert.equal(combinedDraftKey({ kind: "shipment", id: 123 }), "shipment:123");
});

// ── displayUpdatedAt ────────────────────────────────────────────────────────
test("displayUpdatedAt: form nutzt updatedAt→createdAt, shipment updatedAt→createdAt", () => {
  assert.equal(displayUpdatedAt(fd()), "2026-07-10T10:00:00Z");
  assert.equal(displayUpdatedAt(fd({ updatedAt: "" })), "2026-07-01T10:00:00Z");
  assert.equal(displayUpdatedAt(normalizeShipmentDraft(sd())), "2026-07-11T10:00:00Z");
  assert.equal(displayUpdatedAt(normalizeShipmentDraft(sd({ updatedAt: null }))), "2026-07-05T10:00:00Z");
});

// ── Merge / Sort / Dedupe ───────────────────────────────────────────────────
test("mergeDraftSources: führt zusammen und sortiert nach Anzeigedatum DESC", () => {
  const merged = mergeDraftSources([fd()], [sd()]); // form updated 07-10, shipment 07-11
  assert.equal(merged.length, 2);
  assert.equal(merged[0].kind, SHIPMENT_DRAFT_KIND); // 07-11 zuerst
  assert.equal(merged[1].kind, FORM_DRAFT_KIND);
});
test("mergeDraftSources: nur Formularentwürfe / nur Shipment-Drafts", () => {
  assert.equal(mergeDraftSources([fd()], []).length, 1);
  assert.equal(mergeDraftSources([], [sd()]).length, 1);
  assert.deepEqual(mergeDraftSources([], []), []);
});
test("mergeDraftSources: dedupliziert innerhalb jeder Quelle nach id", () => {
  const merged = mergeDraftSources([fd({ id: 1 }), fd({ id: 1 })], [sd({ id: 1 }), sd({ id: 1 })]);
  assert.equal(merged.length, 2); // je Quelle 1
});
test("mergeDraftSources: gleiche numerische id in verschiedenen kinds kollidiert NICHT", () => {
  const merged = mergeDraftSources([fd({ id: 7 })], [sd({ id: 7 })]);
  assert.equal(merged.length, 2);
  const keys = merged.map(combinedDraftKey).sort();
  assert.deepEqual(keys, ["form:7", "shipment:7"]);
});
test("mergeDraftSources: deterministischer Tie-Break (gleiches Datum → kind ASC, dann id DESC)", () => {
  const t = "2026-07-10T10:00:00Z";
  const merged = mergeDraftSources(
    [fd({ id: 2, updatedAt: t }), fd({ id: 9, updatedAt: t })],
    [sd({ id: 5, updatedAt: t })],
  );
  // form vor shipment; innerhalb form id DESC (9 vor 2)
  assert.deepEqual(merged.map(combinedDraftKey), ["form:9", "form:2", "shipment:5"]);
  // erneuter Aufruf identisch → deterministisch
  const again = mergeDraftSources(
    [fd({ id: 9, updatedAt: t }), fd({ id: 2, updatedAt: t })],
    [sd({ id: 5, updatedAt: t })],
  );
  assert.deepEqual(again.map(combinedDraftKey), ["form:9", "form:2", "shipment:5"]);
});

test("appendFormDraftPage: hängt ohne Duplikate an, Reihenfolge erhalten", () => {
  const page1 = [fd({ id: 1 }), fd({ id: 2 })];
  const page2 = [fd({ id: 2 }), fd({ id: 3 })];
  const res = appendFormDraftPage(page1, page2);
  assert.deepEqual(res.map((d) => d.id), [1, 2, 3]);
});
test("removeDraftById: entfernt genau eine id", () => {
  assert.deepEqual(removeDraftById([{ id: 1 }, { id: 2 }], 1).map((d) => d.id), [2]);
});

// ── Anzeige Formularentwurf ─────────────────────────────────────────────────
test("formatFormRecipient/Sender: Firma → Stadt/Land → Fallback", () => {
  assert.equal(formatFormRecipient(fd()), "Client SARL");
  assert.equal(formatFormRecipient(fd({ summary: { recipient: { city: "Paris", country: "FR" } } })), "Paris, FR");
  assert.equal(formatFormRecipient(fd({ summary: { recipient: {} } })), "Empfänger noch unvollständig");
  assert.equal(formatFormSender(fd({ summary: { sender: {} } })), "Absender noch unvollständig");
});
test("formatFormRoute: Länder-Route, Teil-/Vollausfall", () => {
  assert.equal(formatFormRoute(fd()), "DE → FR");
  assert.equal(formatFormRoute(fd({ summary: { sender: { country: "DE" }, recipient: {} } })), "DE → –");
  assert.equal(formatFormRoute(fd({ summary: { sender: {}, recipient: {} } })), "Route noch unvollständig");
});
test("formatFormPackage: Singular/Plural + Gewicht (de-DE), fehlend → null", () => {
  assert.deepEqual(formatFormPackage(fd()), { countLabel: "2 Pakete", weightLabel: "8,5 kg" });
  assert.deepEqual(formatFormPackage(fd({ summary: { packages: { packageCount: 1 } } })), { countLabel: "1 Paket", weightLabel: null });
  assert.deepEqual(formatFormPackage(fd({ summary: { packages: {} } })), { countLabel: null, weightLabel: null });
});
test("formFormShippingDate: Wert oder null", () => {
  assert.equal(formFormShippingDate(fd()), "2026-08-01");
  assert.equal(formFormShippingDate(fd({ summary: { shippingDate: null } })), null);
});

// ── Rehydration ─────────────────────────────────────────────────────────────
const FULL_FORMDATA = {
  sender: { company: "S GmbH", fullName: "Max Mustermann", streetAndNumber: "Weiherstr. 25", addressAddition: "Etage 3", postalCode: "70173", city: "Stuttgart", country: "DE", phone: "+49 711", email: "s@x.de" },
  recipient: { company: "R SARL", fullName: "Jean Dupont", streetAndNumber: "Rue 2", addressAddition: "c/o", postalCode: "75001", city: "Paris", country: "FR", phone: "+33 1", email: "r@x.fr" },
  packages: { packageCount: 3, weight: 8.5, length: 40, width: 30, height: 25 },
  shippingOptions: { shippingDate: "2026-08-01", serviceFilter: "pickup", shippingModeFilter: "express", publicCarrierIds: ["ups", "dpd"] },
};
test("buildResumeInitialState: alle Sender-/Empfängerfelder gemappt", () => {
  const { form } = buildResumeInitialState(FULL_FORMDATA, { today: "2026-07-21" });
  assert.equal(form.s_company, "S GmbH");
  assert.equal(form.s_fullName, "Max Mustermann");
  assert.equal(form.s_street, "Weiherstr. 25");
  assert.equal(form.s_addition, "Etage 3");
  assert.equal(form.s_zip, "70173");
  assert.equal(form.s_city, "Stuttgart");
  assert.equal(form.s_country, "DE");
  assert.equal(form.s_phone, "+49 711");
  assert.equal(form.s_email, "s@x.de");
  assert.equal(form.r_company, "R SARL");
  assert.equal(form.r_fullName, "Jean Dupont");
  assert.equal(form.r_street, "Rue 2");
  assert.equal(form.r_zip, "75001");
  assert.equal(form.r_city, "Paris");
  assert.equal(form.r_country, "FR");
});
test("buildResumeInitialState: Paketanzahl/Gewicht/Maße als Strings", () => {
  const { form } = buildResumeInitialState(FULL_FORMDATA, { today: "2026-07-21" });
  assert.equal(form.packageCount, "3");
  assert.equal(form.weight, "8.5");
  assert.equal(form.length, "40");
  assert.equal(form.width, "30");
  assert.equal(form.height, "25");
});
test("buildResumeInitialState: Versanddatum, Servicefilter, Versandmodus, Carrierfilter", () => {
  const s = buildResumeInitialState(FULL_FORMDATA, { today: "2026-07-21" });
  assert.equal(s.shippingDate, "2026-08-01");
  assert.equal(s.serviceFilter, "pickup");
  assert.equal(s.shippingModeFilter, "express");
  assert.deepEqual(s.selectedPublicCarrierIds, ["ups", "dpd"]);
});
test("buildResumeInitialState: Versanddatum in der Vergangenheit → auf heute geklemmt", () => {
  const s = buildResumeInitialState({ shippingOptions: { shippingDate: "2020-01-01" } }, { today: "2026-07-21" });
  assert.equal(s.shippingDate, "2026-07-21");
});
test("buildResumeInitialState: fehlende Werte → normale Defaults", () => {
  const s = buildResumeInitialState({}, { today: "2026-07-21" });
  assert.deepEqual(s.form, blankNewShipmentForm());
  assert.equal(s.shippingDate, null);
  assert.equal(s.serviceFilter, "all");
  assert.equal(s.shippingModeFilter, "all");
  assert.deepEqual(s.selectedPublicCarrierIds, []);
});
test("buildResumeInitialState: ungültige optionale Werte → Defaults, kein NaN", () => {
  const s = buildResumeInitialState({
    sender: { country: "invalid-code", postalCode: 12345 },
    packages: { packageCount: 0, weight: "abc", length: -3 },
    shippingOptions: { serviceFilter: "nope", shippingModeFilter: "xx", publicCarrierIds: "notarray" },
  }, { today: "2026-07-21" });
  assert.equal(s.form.s_country, "DE");       // ungültiges Land → Default
  assert.equal(s.form.s_zip, "12345");        // Zahl → String übernommen
  assert.equal(s.form.packageCount, "1");     // 0 ungültig → Default 1
  assert.equal(s.form.weight, "");            // "abc" → leer (kein NaN)
  assert.equal(s.form.length, "");            // negativ → leer
  assert.equal(s.serviceFilter, "all");
  assert.equal(s.shippingModeFilter, "all");
  assert.deepEqual(s.selectedPublicCarrierIds, []);
});
test("buildResumeInitialState: robust gegen komplett fehlendes/kaputtes formData", () => {
  assert.deepEqual(buildResumeInitialState(null).form, blankNewShipmentForm());
  assert.deepEqual(buildResumeInitialState(undefined).form, blankNewShipmentForm());
});

// ── Resume-Payload-Validität ────────────────────────────────────────────────
test("isValidResumeDraft: gültiger Payload", () => {
  assert.equal(isValidResumeDraft({ kind: "form", sourceFormDraftId: 5, sourceFormDraftRevision: 2, formData: {} }), true);
  assert.equal(isValidResumeDraft({ kind: "form", sourceFormDraftId: 5, sourceFormDraftRevision: 0, formData: {} }), true);
});
test("isValidResumeDraft: lehnt ungültige ID/Revision/kind/formData ab", () => {
  assert.equal(isValidResumeDraft({ kind: "form", sourceFormDraftId: 0, sourceFormDraftRevision: 1, formData: {} }), false);
  assert.equal(isValidResumeDraft({ kind: "form", sourceFormDraftId: "s_5", sourceFormDraftRevision: 1, formData: {} }), false);
  assert.equal(isValidResumeDraft({ kind: "form", sourceFormDraftId: 5, sourceFormDraftRevision: 1.5, formData: {} }), false);
  assert.equal(isValidResumeDraft({ kind: "shipment", sourceFormDraftId: 5, sourceFormDraftRevision: 1, formData: {} }), false);
  assert.equal(isValidResumeDraft({ kind: "form", sourceFormDraftId: 5, sourceFormDraftRevision: 1 }), false);
  assert.equal(isValidResumeDraft(null), false);
});
test("buildResumePayload: enthält nur ID/Revision/schemaVersion/formData", () => {
  const p = buildResumePayload({ id: 9, revision: 3, schemaVersion: 1, formData: { sender: {} }, tariffs: [1], shipmentId: 77 });
  assert.deepEqual(Object.keys(p).sort(), ["formData", "kind", "schemaVersion", "sourceFormDraftId", "sourceFormDraftRevision"]);
  assert.equal(p.sourceFormDraftId, 9);
  assert.equal(p.sourceFormDraftRevision, 3);
  assert.equal(p.kind, "form");
  assert.equal(p.tariffs, undefined);
  assert.equal(p.shipmentId, undefined);
});
test("resumeSourceFromDraft: numerische ID/Revision oder null", () => {
  assert.deepEqual(resumeSourceFromDraft({ kind: "form", sourceFormDraftId: "9", sourceFormDraftRevision: "3", schemaVersion: 1, formData: {} }), { id: 9, revision: 3, schemaVersion: 1 });
  assert.equal(resumeSourceFromDraft({ kind: "form", sourceFormDraftId: "x", sourceFormDraftRevision: 1, formData: {} }), null);
});

// ── Transition ──────────────────────────────────────────────────────────────
test("classifyFormDraftTransition: consumed:true", () => {
  const r = classifyFormDraftTransition({ consumed: true });
  assert.equal(r.consumed, true);
  assert.equal(r.blocking, false);
  assert.equal(r.notice, "");
});
test("classifyFormDraftTransition: revision_changed → Hinweis, nicht blockierend", () => {
  const r = classifyFormDraftTransition({ consumed: false, reason: "revision_changed" });
  assert.equal(r.blocking, false);
  assert.match(r.notice, /zwischenzeitlich geändert/);
});
test("classifyFormDraftTransition: cleanup_failed → Hinweis, nicht blockierend", () => {
  const r = classifyFormDraftTransition({ consumed: false, reason: "cleanup_failed" });
  assert.equal(r.blocking, false);
  assert.match(r.notice, /nicht automatisch entfernt/);
});
test("classifyFormDraftTransition: shipment_persistence_failed → blockierend", () => {
  const r = classifyFormDraftTransition({ consumed: false, reason: "shipment_persistence_failed" });
  assert.equal(r.blocking, true);
  assert.equal(r.notice, "");
});
test("classifyFormDraftTransition: ohne Transition (normaler Flow) → nichts", () => {
  const r = classifyFormDraftTransition(undefined);
  assert.equal(r.consumed, false);
  assert.equal(r.blocking, false);
  assert.equal(r.notice, "");
});

// ── Start-Konflikte ─────────────────────────────────────────────────────────
test("mapFormDraftStartError: CONFLICT → reload erlaubt, Source bleibt", () => {
  const e = mapFormDraftStartError("FORM_DRAFT_CONFLICT");
  assert.equal(e.kind, "conflict");
  assert.equal(e.allowsReload, true);
  assert.equal(e.clearsSource, false);
});
test("mapFormDraftStartError: NOT_FOUND → Source löschen, kein reload", () => {
  const e = mapFormDraftStartError("FORM_DRAFT_NOT_FOUND");
  assert.equal(e.kind, "notFound");
  assert.equal(e.clearsSource, true);
  assert.equal(e.allowsReload, false);
});
test("mapFormDraftStartError: CONVERSION_IN_PROGRESS → kein reload, Source bleibt", () => {
  const e = mapFormDraftStartError("FORM_DRAFT_CONVERSION_IN_PROGRESS");
  assert.equal(e.kind, "inProgress");
  assert.equal(e.clearsSource, false);
});
test("mapFormDraftStartError: unbekannter Code → null (generisch behandeln)", () => {
  assert.equal(mapFormDraftStartError("SOMETHING_ELSE"), null);
});

// ── Delete / Empty ──────────────────────────────────────────────────────────
test("mapFormDraftDeleteErrorToMessage: 404 vs generisch", () => {
  assert.match(mapFormDraftDeleteErrorToMessage("FORM_DRAFT_NOT_FOUND"), /bereits gelöscht/);
  assert.match(mapFormDraftDeleteErrorToMessage("X"), /konnte nicht gelöscht/);
});
test("resolveCombinedEmpty: nur leer, wenn beide Quellen ok UND leer", () => {
  assert.equal(resolveCombinedEmpty({ formOk: true, shipmentOk: true, formCount: 0, shipmentCount: 0 }), true);
  assert.equal(resolveCombinedEmpty({ formOk: true, shipmentOk: false, formCount: 0, shipmentCount: 0 }), false);
  assert.equal(resolveCombinedEmpty({ formOk: true, shipmentOk: true, formCount: 1, shipmentCount: 0 }), false);
});
