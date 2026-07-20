// Tests für die reine Entwürfe-Logik. Läuft über node --test (bzw. `npm test`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDraftListParams, toQueryString, appendDraftPage, removeDraftFromList,
  formatRecipientDisplay, formatRoute, formatPackageSummary, shippingDateValue,
  mapDraftErrorToMessage, mapDraftDeleteErrorToMessage, hasSavableShipmentId, draftsEmptyCopy,
} from "./draftsView.mjs";

const draft = (over) => ({
  id: 123, jumingoShipmentId: "s_abc123", status: "draft",
  weight: 5, length: 30, width: 20, height: 15, packageCount: 1,
  fromCountry: "DE", toCountry: "FR", fromPostalCode: "63743", toPostalCode: "75001",
  senderAddress: { company: "Beispiel GmbH", fullName: "Max Mustermann" },
  recipientAddress: { company: "Client SARL", fullName: "Jean Dupont" },
  requestedShippingDate: "2026-08-01", createdAt: "2026-07-01T10:00:00Z", updatedAt: "2026-07-02T11:30:00Z",
  ...over,
});

// 7. limit wird korrekt gesendet.
test("7 — buildDraftListParams sendet limit als String", () => {
  const params = buildDraftListParams({ limit: 20 });
  assert.equal(params.limit, "20");
  assert.equal(Object.prototype.hasOwnProperty.call(params, "cursor"), false);
});

// 8. cursor wird opak weitergereicht (keine Dekodierung/Annahmen über den Aufbau).
test("8 — cursor wird 1:1/opak übernommen, egal welches Format", () => {
  const opaque = "eyJpZCI6MTIzLCJ0cyI6IjIwMjYtMDEtMDEifQ==";
  const params = buildDraftListParams({ limit: 20, cursor: opaque });
  assert.equal(params.cursor, opaque);
  const qs = toQueryString(params);
  assert.match(qs, new RegExp(`cursor=${opaque.replace(/[+/=]/g, (c) => encodeURIComponent(c))}`));
});

test("toQueryString: leere/undefinierte Parameter werden nicht gesendet, nur allowlistete Keys", () => {
  assert.equal(toQueryString({ limit: undefined, cursor: null }), "");
  const qs = toQueryString({ limit: 20, cursor: "abc", evilParam: "x" });
  assert.doesNotMatch(qs, /evilParam/);
  assert.match(qs, /limit=20/);
  assert.match(qs, /cursor=abc/);
});

test("appendDraftPage dedupliziert nach id (keine Duplikate durch wiederholtes Anfügen)", () => {
  const existing = [draft({ id: 1 }), draft({ id: 2 })];
  const next = [draft({ id: 2 }), draft({ id: 3 })];
  const merged = appendDraftPage(existing, next);
  assert.deepEqual(merged.map((d) => d.id), [1, 2, 3]);
});

test("removeDraftFromList entfernt genau die gelöschte id, Rest bleibt erhalten", () => {
  const items = [draft({ id: 1 }), draft({ id: 2 }), draft({ id: 3 })];
  assert.deepEqual(removeDraftFromList(items, 2).map((d) => d.id), [1, 3]);
});

// 14. Empfänger-Fallbacks funktionieren.
test("14a — Empfänger: company hat höchste Priorität", () => {
  assert.equal(formatRecipientDisplay(draft()), "Client SARL");
});
test("14b — Empfänger: ohne company → fullName", () => {
  const d = draft({ recipientAddress: { fullName: "Jean Dupont" } });
  assert.equal(formatRecipientDisplay(d), "Jean Dupont");
});
test("14c — Empfänger: contactName/name als defensive Fallbacks (falls fullName fehlt)", () => {
  assert.equal(formatRecipientDisplay(draft({ recipientAddress: { contactName: "Erika Muster" } })), "Erika Muster");
  assert.equal(formatRecipientDisplay(draft({ recipientAddress: { name: "Peter Beispiel" } })), "Peter Beispiel");
});
test("14d — Empfänger: ohne Adressdaten → PLZ + Land", () => {
  const d = draft({ recipientAddress: {}, toCountry: "FR", toPostalCode: "75001" });
  assert.equal(formatRecipientDisplay(d), "75001 FR");
});
test("14e — Empfänger: völlig unvollständig → klarer Hinweistext", () => {
  const d = draft({ recipientAddress: null, toCountry: "", toPostalCode: "" });
  assert.equal(formatRecipientDisplay(d), "Empfänger noch unvollständig");
});
test("14f — Empfänger: keine spekulativen Felder — leere Strings zählen nicht als vorhanden", () => {
  const d = draft({ recipientAddress: { company: "   ", fullName: "" }, toCountry: "", toPostalCode: "" });
  assert.equal(formatRecipientDisplay(d), "Empfänger noch unvollständig");
});

// 15. Route wird korrekt dargestellt.
test("15a — Route: DE 63743 → FR 75001 (exaktes Beispielformat)", () => {
  assert.equal(formatRoute(draft()), "DE 63743 → FR 75001");
});
test("15b — Route: teilweise fehlende Angaben zeigen Platzhalter statt Rateware", () => {
  assert.equal(formatRoute(draft({ toCountry: "", toPostalCode: "" })), "DE 63743 → –");
  assert.equal(formatRoute(draft({ fromCountry: "", fromPostalCode: "" })), "– → FR 75001");
});
test("15c — Route: komplett fehlend → klarer Hinweistext", () => {
  const d = draft({ fromCountry: "", toCountry: "", fromPostalCode: "", toPostalCode: "" });
  assert.equal(formatRoute(d), "Route noch unvollständig");
});

// 16. packageCount Singular/Plural korrekt.
test("16a — 1 Paket (Singular)", () => {
  assert.match(formatPackageSummary(draft({ packageCount: 1, weight: 5 })).countLine, /^1 Paket ·/);
});
test("16b — mehrere Pakete (Plural)", () => {
  assert.match(formatPackageSummary(draft({ packageCount: 2, weight: 8.5 })).countLine, /^2 Pakete ·/);
});

// 17. Gewicht/Maße korrekt.
test("17a — Gewicht deutsch formatiert (Komma statt Punkt)", () => {
  const s = formatPackageSummary(draft({ packageCount: 2, weight: 8.5 }));
  assert.equal(s.countLine, "2 Pakete · 8,5 kg");
});
test("17b — Maße als L × B × H cm", () => {
  const s = formatPackageSummary(draft({ length: 40, width: 30, height: 25 }));
  assert.equal(s.dimsLine, "40 × 30 × 25 cm");
});
test("17c — fehlende Maße → kein dimsLine (keine erfundene 0×0×0-Zeile)", () => {
  const s = formatPackageSummary(draft({ length: null, width: null, height: null }));
  assert.equal(s.dimsLine, null);
});
test("17d — fehlendes Gewicht/packageCount → kein countLine", () => {
  const s = formatPackageSummary(draft({ packageCount: null, weight: null }));
  assert.equal(s.countLine, null);
});

// 18. fehlendes Versanddatum zeigt Fallback (Komponentenebene nutzt shippingDateValue===null).
test("18 — shippingDateValue: vorhanden vs. fehlend", () => {
  assert.equal(shippingDateValue(draft({ requestedShippingDate: "2026-08-01" })), "2026-08-01");
  assert.equal(shippingDateValue(draft({ requestedShippingDate: null })), null);
  assert.equal(shippingDateValue(draft({ requestedShippingDate: "" })), null);
});

// 41. 404 wird verständlich dargestellt (Delete + Save unterscheiden sich leicht).
test("41a — DRAFT_NOT_FOUND beim Löschen: verständliche Meldung, kein Rohtext", () => {
  const msg = mapDraftDeleteErrorToMessage("DRAFT_NOT_FOUND");
  assert.match(msg, /bereits gelöscht|nicht mehr verfügbar/);
  assert.doesNotMatch(msg, /DRAFT_NOT_FOUND/);
});
test("41b — DRAFT_NOT_AVAILABLE beim Speichern: verständliche Meldung", () => {
  const msg = mapDraftErrorToMessage("DRAFT_NOT_AVAILABLE");
  assert.match(msg, /nicht.*als Entwurf gespeichert/);
});
test("41c — unbekannter Code → generischer Fallback, kein interner Rohtext", () => {
  const msg = mapDraftDeleteErrorToMessage("SOME_SQL_CONSTRAINT_XYZ");
  assert.doesNotMatch(msg, /SQL|SOME_SQL_CONSTRAINT/i);
});

test("hasSavableShipmentId: erkennt vorhandene/fehlende numerische ID robust", () => {
  assert.equal(hasSavableShipmentId(123), true);
  assert.equal(hasSavableShipmentId("123"), true);
  assert.equal(hasSavableShipmentId(null), false);
  assert.equal(hasSavableShipmentId(undefined), false);
  assert.equal(hasSavableShipmentId(""), false);
  assert.equal(hasSavableShipmentId("   "), false);
});

test("draftsEmptyCopy liefert die geforderten Texte (kein 72h-/Technik-Hinweis)", () => {
  const c = draftsEmptyCopy();
  assert.equal(c.title, "Noch keine Entwürfe");
  assert.doesNotMatch(c.desc, /72|Cleanup|technisch/i);
  assert.equal(c.cta, "Neue Sendung erstellen");
});
