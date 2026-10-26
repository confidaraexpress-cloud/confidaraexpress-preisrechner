/* Nur buchbare Tarife sichtbar (Betreiberentscheidung 2026-10-26) — die Frontendseite:
   die Auswahlstufe (Preisrechner vor den Sendungsangaben, „Neue Sendung“ mit ihnen) und die Führung zu einer
   kundenlösbaren Korrektur. Kein Netz, kein Browser, keine Buchung. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  offerSelectable, offerSelectableFor, OFFER_SELECTION_STAGE, offerAwaitsCustomerCorrection, offerCustomerCorrection,
  offerBlockedLabel, offerBlockedHint, OFFER_CONTENT_DESCRIPTION_HINT, OFFER_CONTENT_DESCRIPTION_TEXT,
  OFFER_ADDRESS_CORRECTION_NOTE, OFFER_ADDRESS_DETAILS_TOO_LONG_HINT,
} from "./offerIdentity.mjs";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => fs.readFileSync(path.join(wurzel, p), "utf8");
const { WITH_SHIPMENT_DETAILS: MIT, BEFORE_SHIPMENT_DETAILS: VOR } = OFFER_SELECTION_STAGE;
const angebot = (extra) => ({ offerId: "a".repeat(32), bookable: false, unavailableReason: null, ...extra });

test("1 — Preisrechner (vor den Sendungsangaben): auswählbar ist, was der Server „buchbar mit Sendungsangaben“ nennt", () => {
  // Ein Transglobal-Preis aus dem Minimal-Quote: noch keine Buchungsreferenz (quote_only), aber mit Angaben buchbar.
  const tg = angebot({ unavailableReason: "quote_only", availableWithShipmentDetails: true });
  assert.equal(offerSelectableFor(tg, VOR), true);
  assert.equal(offerSelectableFor(tg, MIT), false, "in „Neue Sendung“ bleibt die strenge Regel");
  assert.equal(offerSelectable(tg), false);
  // Ohne die Zusage bleibt jede Stufe streng; ein nicht verfügbares Datum sperrt immer.
  assert.equal(offerSelectableFor(angebot({ unavailableReason: "quote_only", availableWithShipmentDetails: false }), VOR), false);
  assert.equal(offerSelectableFor(angebot({ availableWithShipmentDetails: true, availableForDate: false }), VOR), false);
  // Buchbar ist in beiden Stufen auswählbar; ohne Angabe gilt die strenge Stufe.
  assert.equal(offerSelectableFor({ bookable: true }, VOR), true);
  assert.equal(offerSelectableFor({ bookable: true }), true);
  assert.equal(offerSelectableFor(angebot({ unavailableReason: "quote_only", availableWithShipmentDetails: true })), false);
});

test("2 — kundenlösbare Korrekturen sind auswählbar: zu lange Adressangabe und fehlende Inhaltsangabe", () => {
  for (const grund of ["address_details_too_long", "content_description_required"]) {
    const t = angebot({ unavailableReason: grund });
    assert.equal(offerAwaitsCustomerCorrection(t), true, grund);
    assert.equal(offerSelectable(t), true, grund);
    assert.equal(offerBlockedLabel(t), null, `${grund}: kein Sperrtext im Knopf`);
    assert.ok(typeof offerBlockedHint(t) === "string", `${grund}: der genaue Hinweis bleibt in den Details`);
    assert.equal(offerSelectable({ ...t, availableForDate: false }), false, `${grund}: am falschen Datum gesperrt`);
  }
  // Alles andere bleibt dauerhaft gesperrt.
  for (const grund of ["quote_only", "package_combination_unverified", "package_labels_indistinguishable",
    "area_surcharge_unconfirmed", "package_dimensions_unverified", "date_unavailable"]) {
    assert.equal(offerAwaitsCustomerCorrection(angebot({ unavailableReason: grund })), false, grund);
    assert.equal(offerSelectable(angebot({ unavailableReason: grund })), false, grund);
  }
});

test("3 — die Korrektur führt zum richtigen Feld in „Neue Sendung“ — mit dem genauen Hinweis, nie mit einem Rohwert", () => {
  assert.deepEqual(offerCustomerCorrection(angebot({ unavailableReason: "content_description_required" })),
    { field: "declaredContent", message: OFFER_CONTENT_DESCRIPTION_HINT, note: OFFER_CONTENT_DESCRIPTION_TEXT });
  const lang = (detail) => offerCustomerCorrection(angebot({ unavailableReason: "address_details_too_long", unavailableDetail: detail }));
  for (const [party, field, erwartet] of [["sender", "phone", "s_phone"], ["recipient", "company", "r_company"],
    ["sender", "name", "s_firstName"], ["recipient", "surname", "r_lastName"], ["sender", "addressLine1", "s_street"],
    ["recipient", "addressLine2", "r_addition"], ["sender", "postcode", "s_zip"], ["recipient", "city", "r_city"],
    ["sender", "email", "s_email"]]) {
    const k = lang({ party, field, max: 20 });
    assert.equal(k.field, erwartet, `${party}/${field}`);
    assert.equal(k.note, OFFER_ADDRESS_CORRECTION_NOTE);
    assert.ok(k.message.includes("höchstens 20 Zeichen"), k.message);
  }
  // Unbekannte Einzelheit oder keine: kein geratenes Feld, der allgemeine Hinweis.
  for (const detail of [null, { party: "x", field: "phone" }, { party: "sender", field: "geheim" }]) {
    const k = lang(detail);
    assert.equal(k.field, null, JSON.stringify(detail));
    assert.equal(k.message, OFFER_ADDRESS_DETAILS_TOO_LONG_HINT);
  }
  assert.equal(offerCustomerCorrection({ bookable: true }), null);
  assert.equal(offerCustomerCorrection(angebot({ unavailableReason: "business_recipient_required" })), null,
    "die Firmenpflicht hat ihren eigenen Weg (Gesamtauftrag B)");
});

test("4 — Verdrahtung: Preisrechner wählt vor den Sendungsangaben, die Karte liest die Stufe, „Neue Sendung“ führt zum Feld", () => {
  const rechner = lies("pages/CalculatorPage.jsx");
  assert.match(rechner, /selectionStage=\{OFFER_SELECTION_STAGE\.BEFORE_SHIPMENT_DETAILS\}/);
  const liste = lies("components/offers/OffersList.jsx");
  assert.match(liste, /selectionStage=\{selectionStage\}/);
  const karte = lies("components/offers/OfferCard.jsx");
  assert.match(karte, /const unavailable = !offerSelectableFor\(t, selectionStage\);/);
  assert.match(karte, /const korrektur = offerCustomerCorrection\(t\);/);
  const seite = lies("pages/NewShipmentPage.jsx");
  // Die Korrektur kommt VOR der Firmenpflicht und merkt Feld und Ausgangswert.
  const idxKorrektur = seite.indexOf("const korrektur = offerCustomerCorrection(tariff);");
  const idxFirma = seite.indexOf("const pflicht = offerBusinessRequirement(tariff);");
  assert.ok(idxKorrektur > -1 && idxFirma > idxKorrektur, "die Korrektur steht nicht vor der Firmenpflicht");
  assert.match(seite, /feld: korrektur\.field,/);
  // Nach dem neuen Vergleich wird nur ein Angebot gewählt, das auf keine Angabe mehr wartet.
  assert.match(seite, /!offerAwaitsBusinessDetails\(treffer\[0\]\)\s*&& !offerAwaitsCustomerCorrection\(treffer\[0\]\)/);
  // Genau ein neuer Vergleich, wenn der Kunde GENAU dieses Feld mit einem geänderten Wert verlässt — auch beim Inhalt.
  assert.match(seite, /onBlur=\{\(\) => \{ markTouched\(fk\); firmenfeldVerlassen\(fk\); \}\}/);
  assert.match(seite, /firmenfeldVerlassen\("declaredContent"\)/);
});
