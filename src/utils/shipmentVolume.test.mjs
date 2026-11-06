// Phase 1 (2026-11-06, Canonical v2.117): voraussichtliches monatliches Versandvolumen — Regel, Registrierung, Profil.
// Die Regel spiegelt Backend lib/shipmentVolume.js; beide prüfen dieselbe Falltabelle (Prüfsumme hier und dort).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SHIPMENT_VOLUME_OPTIONS, SHIPMENT_VOLUME_KEYS, SHIPMENT_VOLUME_QUESTION, SHIPMENT_VOLUME_TEXT,
  validateRegistrationShipmentVolume, shipmentVolumeLabel,
} from "./shipmentVolume.mjs";
import { getRegErrors, buildRegistrationPayload, mapApiRegistrationError } from "./registrationValidation.mjs";
import {
  companyBaseline, buildCompanyPatch, isCompanyDirty, canSaveCompany, companySaveConfirmed, mapApiProfileError,
} from "./profileView.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FALLTABELLE_SHA256 = "ad628fa7a17e9047e43a";

test("1 — die Regel besteht die gemeinsame Falltabelle (bytegleich mit dem Backend), acht Texte exakt", () => {
  const roh = lies("../testing/shipmentVolumeCases.json");
  assert.equal(createHash("sha256").update(roh).digest("hex").slice(0, 20), FALLTABELLE_SHA256,
    "die Falltabelle weicht von der Backendkopie ab");
  const faelle = JSON.parse(roh);
  assert.equal(SHIPMENT_VOLUME_QUESTION, faelle.frage);
  assert.deepEqual(SHIPMENT_VOLUME_OPTIONS.map((o) => [o.key, o.label]), faelle.optionen.map((o) => [o.schluessel, o.text]));
  assert.deepEqual([...SHIPMENT_VOLUME_KEYS], faelle.optionen.map((o) => o.schluessel));
  for (const f of faelle.registrierung) {
    const r = validateRegistrationShipmentVolume(f.fehlt ? undefined : f.eingabe);
    assert.equal(r.ok, f.ok, JSON.stringify(f));
    if (f.ok) assert.equal(r.value, f.wert, JSON.stringify(f));
    else assert.equal(r.code, f.code, JSON.stringify(f));
  }
  assert.equal(shipmentVolumeLabel("501_1000"), "501–1.000 Sendungen");
  assert.equal(shipmentVolumeLabel(null), null);
  assert.equal(shipmentVolumeLabel("unbekannt"), null);
});

const VOLL = {
  name: "Max Mustermann", email: "max@muster.de", password: "Sicheres-Passwort-1", company_name: "Muster GmbH",
  vat_id: "DE123456789", street: "", zip: "", city: "", country: "DE", vat_id_absent: false, legal_form: "",
};

test("2 — Registrierung: Pflichtauswahl ohne Vorauswahl; der Wert geht unverändert in den Body", () => {
  const ohne = getRegErrors({ ...VOLL, monthly_shipment_volume: "" }, VOLL.password);
  assert.deepEqual(ohne, { monthly_shipment_volume: SHIPMENT_VOLUME_TEXT.required });
  assert.deepEqual(getRegErrors({ ...VOLL }, VOLL.password), { monthly_shipment_volume: SHIPMENT_VOLUME_TEXT.required });
  assert.deepEqual(getRegErrors({ ...VOLL, monthly_shipment_volume: "1-10" }, VOLL.password), { monthly_shipment_volume: SHIPMENT_VOLUME_TEXT.invalid });
  for (const key of SHIPMENT_VOLUME_KEYS) {
    assert.deepEqual(getRegErrors({ ...VOLL, monthly_shipment_volume: key }, VOLL.password), {}, key);
    assert.equal(buildRegistrationPayload({ ...VOLL, monthly_shipment_volume: key }).monthly_shipment_volume, key);
  }
  // Ein Feldfehler des Servers landet an der Auswahl, nicht im allgemeinen Banner.
  assert.deepEqual(
    mapApiRegistrationError({ error: "Bitte wählen …", code: "SHIPMENT_VOLUME_REQUIRED", field: "monthly_shipment_volume" }),
    { fieldErrors: { monthly_shipment_volume: "Bitte wählen …" }, generalError: "" });
});

test("3 — Profil: Bestandskonto ohne Angabe speichert alles andere; gewählt → im Body; leeren ist nicht möglich", () => {
  const alt = { company_name: "Alt GmbH", vat_id: "", street: "", zip: "", city: "", country: "DE", monthly_shipment_volume: null };
  const basis = companyBaseline(alt);
  assert.equal(basis.monthly_shipment_volume, "");
  // Ohne Wahl sendet die Karte das Feld nicht — der Server würde einen leeren Wert ablehnen.
  assert.ok(!("monthly_shipment_volume" in buildCompanyPatch({ ...basis, company_name: "Neu GmbH" })));
  assert.equal(canSaveCompany({ ...basis, company_name: "Neu GmbH" }, basis, false), true);
  // Gewählt: im Body, die Karte gilt als geändert.
  const gewaehlt = { ...basis, monthly_shipment_volume: "51_100" };
  assert.equal(buildCompanyPatch(gewaehlt).monthly_shipment_volume, "51_100");
  assert.equal(isCompanyDirty(gewaehlt, basis), true);
  // Ein gesetzter Wert bleibt gesetzt: auch ein geleerter Formularzustand sendet keinen leeren Wert.
  const mit = companyBaseline({ ...alt, monthly_shipment_volume: "over_1000" });
  assert.equal(buildCompanyPatch(mit).monthly_shipment_volume, "over_1000");
  assert.ok(!("monthly_shipment_volume" in buildCompanyPatch({ ...mit, monthly_shipment_volume: "" })));
  // Ein unbekannter Altwert wird nicht gesendet (der Server kennt nur die acht Schlüssel).
  assert.ok(!("monthly_shipment_volume" in buildCompanyPatch({ ...basis, monthly_shipment_volume: "viele" })));
  // „Gespeichert" nur, wenn die Antwort die gesendete Angabe trägt (ein alter Server verwirft das Feld still).
  assert.equal(companySaveConfirmed({ monthly_shipment_volume: "51_100" }, { monthly_shipment_volume: "51_100" }), true);
  assert.equal(companySaveConfirmed({ monthly_shipment_volume: "51_100" }, { company_name: "Alt GmbH" }), false);
  assert.equal(companySaveConfirmed({ company_name: "Neu GmbH" }, { company_name: "Neu GmbH" }), true);
  assert.deepEqual(mapApiProfileError({ error: "x", field: "monthly_shipment_volume" }).fieldErrors, { monthly_shipment_volume: "x" });
});
