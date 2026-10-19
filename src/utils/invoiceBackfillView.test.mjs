// Tests für die PDF-Backfill-Anzeigelogik (Phase 5, korrigierter Standardprozess): Readiness-
// Anzeige, Feld-Labels, Kandidatenstatus, Aktions-Freischaltung, Outcome-Meldungen. Node's
// eingebauter Test-Runner: node --test src/utils/invoiceBackfillView.test.mjs (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readinessMeta, fieldLabel, candidateStatusMeta, canBackfillCandidate, backfillOutcomeMessage,
  businessLetterView,
} from "./invoiceBackfillView.mjs";

// ── readinessMeta ────────────────────────────────────────────────────────────
test("readinessMeta: Testmodus hat Vorrang (gelb)", () => {
  assert.deepEqual(readinessMeta({ testMode: true, ready: false }), ["badge-yellow", "Testmodus aktiv"]);
  assert.equal(readinessMeta({ testMode: true, ready: true })[0], "badge-yellow");
});
test("readinessMeta: bereit → grün, sonst → rot", () => {
  assert.deepEqual(readinessMeta({ testMode: false, ready: true }), ["badge-green", "Produktivbereit"]);
  assert.deepEqual(readinessMeta({ testMode: false, ready: false }), ["badge-red", "Nicht bereit"]);
});
test("readinessMeta: fehlend/ungültig → grau (kein Absturz)", () => {
  assert.equal(readinessMeta(null)[0], "badge-gray");
  assert.equal(readinessMeta(undefined)[1], "Unbekannt");
});

// ── fieldLabel ───────────────────────────────────────────────────────────────
test("fieldLabel: bekannte Schlüssel → deutsche Labels", () => {
  assert.equal(fieldLabel("bank.iban"), "IBAN");
  assert.equal(fieldLabel("issuer.registerCourt"), "Registergericht");
  assert.equal(fieldLabel("customer_snapshot"), "Kundendaten (Firma)");
  assert.equal(fieldLabel("amounts"), "Beträge");
});
test("fieldLabel: unbekannter Schlüssel → Rohwert (kein Absturz)", () => {
  assert.equal(fieldLabel("foo.bar"), "foo.bar");
  assert.equal(fieldLabel(null), "—");
});

// ── candidateStatusMeta ───────────────────────────────────────────────────────
test("candidateStatusMeta: bereits fertig → grün 'PDF vorhanden'", () => {
  assert.deepEqual(candidateStatusMeta({ alreadyReady: true, generatable: false }), ["badge-green", "PDF vorhanden"]);
});
test("candidateStatusMeta: fehlend + erzeugbar (Snapshots vorhanden) → blau 'PDF fehlt'", () => {
  assert.deepEqual(candidateStatusMeta({ alreadyReady: false, generatable: true }), ["badge-blue", "PDF fehlt"]);
});
test("candidateStatusMeta: Legacy erzeugbar (reconstructionNeeded) → blau 'Snapshot wird … rekonstruiert'", () => {
  assert.deepEqual(
    candidateStatusMeta({ alreadyReady: false, generatable: true, reconstructionNeeded: true }),
    ["badge-blue", "Snapshot wird für interne Vorschau rekonstruiert"]
  );
});
test("candidateStatusMeta: fehlend + NICHT erzeugbar → gelb 'Daten unvollständig'", () => {
  assert.deepEqual(candidateStatusMeta({ alreadyReady: false, generatable: false }), ["badge-yellow", "Daten unvollständig"]);
  // reconstructionNeeded ohne generatable ändert nichts (Backend bleibt autoritativ)
  assert.deepEqual(candidateStatusMeta({ alreadyReady: false, generatable: false, reconstructionNeeded: true }), ["badge-yellow", "Daten unvollständig"]);
});
test("candidateStatusMeta: fehlend/leer → kein Absturz, Standardfall", () => {
  assert.deepEqual(candidateStatusMeta(null), ["badge-yellow", "Daten unvollständig"]);
  assert.deepEqual(candidateStatusMeta({}), ["badge-yellow", "Daten unvollständig"]);
});

// ── canBackfillCandidate ──────────────────────────────────────────────────────
test("canBackfillCandidate: NUR generatable===true schaltet die Aktion frei", () => {
  assert.equal(canBackfillCandidate({ generatable: true }), true);
  assert.equal(canBackfillCandidate({ generatable: false }), false);
  assert.equal(canBackfillCandidate({ alreadyReady: true }), false, "bereits fertig → keine erneute Erzeugung nötig");
  assert.equal(canBackfillCandidate(null), false);
  assert.equal(canBackfillCandidate({}), false);
});

// ── backfillOutcomeMessage ────────────────────────────────────────────────────
test("backfillOutcomeMessage: outcome → type", () => {
  assert.equal(backfillOutcomeMessage("generated").type, "success");
  assert.equal(backfillOutcomeMessage("already_ready").type, "info");
  assert.equal(backfillOutcomeMessage("in_progress").type, "info");
  assert.equal(backfillOutcomeMessage("not_booked").type, "error");
  assert.equal(backfillOutcomeMessage("incomplete").type, "error");
  assert.equal(backfillOutcomeMessage("failed").type, "error");
  assert.equal(backfillOutcomeMessage("weird").type, "error");
});
test("backfillOutcomeMessage: incomplete erklärt fehlende historische Daten (keine erfundenen Zahlen)", () => {
  assert.match(backfillOutcomeMessage("incomplete").text, /historische Daten|rekonstruieren/);
});

// ── Geschäftsbriefangaben (§ 35a GmbHG, Go-Live Paket D) ────────────────────────
test("businessLetterView: fehlende Angaben als Liste, vollständig als ready — rein informativ", () => {
  const offen = businessLetterView({ ready: true, businessLetter: { ready: false, registerRequired: true, missingFields: ["issuer.seat", "issuer.registerNumber"] } });
  assert.deepEqual(offen, { ready: false, registerRequired: true, missing: ["issuer.seat", "issuer.registerNumber"], placeholders: [] });
  assert.equal(fieldLabel("issuer.seat"), "Sitz der Gesellschaft");
  assert.deepEqual(businessLetterView({ businessLetter: { ready: true, registerRequired: true, missingFields: [], placeholderFields: [] } }),
    { ready: true, registerRequired: true, missing: [], placeholders: [] });
  // Die Gesamtbewertung bleibt unberührt: der Block ändert readinessMeta nicht.
  assert.deepEqual(readinessMeta({ ready: true, businessLetter: { ready: false, missingFields: ["issuer.seat"] } }), ["badge-green", "Produktivbereit"]);
});
test("businessLetterView: Platzhalterwerte als eigene Liste — nur Feldnamen, nie vollständig", () => {
  const v = businessLetterView({ businessLetter: { ready: false, registerRequired: true, missingFields: [],
    placeholderFields: ["issuer.registerCourt", "issuer.registerNumber", 7, ""] } });
  assert.deepEqual(v, { ready: false, registerRequired: true, missing: [], placeholders: ["issuer.registerCourt", "issuer.registerNumber"] });
  // „ready:true" mit gemeldeten Platzhaltern gilt nicht als vollständig.
  assert.equal(businessLetterView({ businessLetter: { ready: true, missingFields: [], placeholderFields: ["issuer.name"] } }).ready, false);
});
test("businessLetterView: älteres Backend ohne Block oder kaputte Form → null (kein Block, kein Raten)", () => {
  assert.equal(businessLetterView({ ready: false }), null);
  assert.equal(businessLetterView(null), null);
  assert.equal(businessLetterView({ businessLetter: { missingFields: ["issuer.seat"] } }), null);
  // „ready:true" mit gemeldeten Lücken gilt nicht als vollständig.
  assert.equal(businessLetterView({ businessLetter: { ready: true, missingFields: ["issuer.seat"] } }).ready, false);
  // Backend ohne `placeholderFields` (Stand vor dem Nachtrag): leere Liste, kein Absturz.
  assert.deepEqual(businessLetterView({ businessLetter: { ready: true, missingFields: [] } }).placeholders, []);
});
test("Readiness-Karte: Block nur mit Serverdaten, ohne Werte, unter den bestehenden Blöcken", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../pages/admin/AdminBackfillPage.jsx", import.meta.url), "utf8");
  assert.match(src, /const briefangaben = businessLetterView\(readiness\);/);
  assert.match(src, /\{briefangaben && \(\s*<div className="adm-readiness-block" id="adm-business-letter">/);
  assert.match(src, /<ChipList items=\{briefangaben\.missing\} \/>/);
  assert.match(src, /<ChipList items=\{briefangaben\.placeholders\} \/>/);
  assert.ok(src.indexOf('id="adm-business-letter"') > src.indexOf("readiness.placeholderFields.length > 0"), "Block steht nach den Platzhaltern der Rechnungsbereitschaft");
});

test("Paritätsaudit B8 — Probelauf der Dokumenterzeugung und Rechtsdokumente; keine tote Testmodus-Zeile", async () => {
  const { documentGenerationView, legalDocumentsView } = await import("./invoiceBackfillView.mjs");
  const { readFileSync } = await import("node:fs");
  // Probelauf: bereit, blockiert mit bekanntem Code (Feldnamen als Chips), unbekannter Code bleibt sichtbar.
  assert.deepEqual(documentGenerationView({ checks: { invoice_document_generation: { ready: true, mode: "production" } } }),
    { ready: true, label: "Bereit", code: null, missing: [], placeholders: [] });
  assert.deepEqual(documentGenerationView({ checks: { invoice_document_generation: {
    ready: false, code: "invoice_snapshot_not_production_ready", missingFields: ["bank.iban"], placeholderFields: ["issuer.vatId", 7] } } }),
  { ready: false, label: "Aussteller- oder Bankdaten nicht produktionsreif", code: null, missing: ["bank.iban"], placeholders: ["issuer.vatId"] });
  assert.equal(documentGenerationView({ checks: { invoice_document_generation: { ready: false, code: "neu_x" } } }).code, "neu_x");
  assert.equal(documentGenerationView({ checks: { invoice_document_generation: { ready: false, code: "vat_rate_invalid" } } }).label,
    "Steuersatz-Konfiguration ungültig");
  for (const alt of [{}, { checks: {} }, { checks: { invoice_document_generation: {} } }, null]) {
    assert.equal(documentGenerationView(alt), null, "älteres Backend: keine Zeile");
  }
  // Rechtsdokumente: Gründe übersetzt, auch die zusammengesetzten; unbekannt bleibt als Code.
  assert.deepEqual(legalDocumentsView({ legalDocuments: { ready: true, gateEnabled: true, activeSet: { setKey: "SET-2026-08" } } }),
    { ready: true, label: "Bereit", setKey: "SET-2026-08", gateEnabled: true, code: null });
  const grund = (reason) => legalDocumentsView({ legalDocuments: { ready: false, gateEnabled: false, reason } });
  assert.equal(grund("no_active_legal_set").label, "Kein aktives Rechtsdokument-Set");
  assert.equal(grund("lookup_failed").label, "Prüfung fehlgeschlagen");
  assert.equal(grund("privacy_missing_in_set").label, "Datenschutzhinweise fehlen im aktiven Set");
  assert.equal(grund("terms_asset_sha256_mismatch").label, "PDF der AGB: Prüfsumme weicht ab");
  assert.deepEqual([grund("etwas_neues").label, grund("etwas_neues").code], ["Nicht bereit", "etwas_neues"]);
  assert.equal(legalDocumentsView({}), null);
  // Seite: die Zeile „Testmodus" ist weg (das Feld kommt nicht), beide Prüfungen stehen da.
  const seite = readFileSync(new URL("../pages/admin/AdminBackfillPage.jsx", import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(seite, /<dt>Testmodus<\/dt>/);
  assert.doesNotMatch(seite, /readiness\.testMode/);
  assert.match(seite, /const erzeugung = documentGenerationView\(readiness\);/);
  assert.match(seite, /const recht = legalDocumentsView\(readiness\);/);
  assert.match(seite, /id="adm-readiness-generation"/);
  assert.match(seite, /id="adm-readiness-legal"/);
});
