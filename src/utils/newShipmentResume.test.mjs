// Slice: Fortsetzen eines Formularentwurfs → „Angebote vergleichen" beim ERSTEN Klick.
//
// Fehlerbild: Nach dem Fortsetzen eines Entwurfs erschienen die Angebote erst beim
// zweiten oder dritten Klick. Zwei resume-spezifische Ursachen, beide unsichtbar:
//   (1) Ein unvollständiger Entwurf deaktivierte den CTA, ohne dass irgendetwas
//       erklärte, welche Angabe fehlt — Klicks blieben wirkungslos.
//   (2) Der aus dem Entwurf wiederhergestellte Versanddienst-Filter ist ein
//       ERGEBNISABHÄNGIGER Filter: seine Auswahlliste entsteht erst aus einer
//       Preisberechnungsantwort. Nach dem Fortsetzen existiert diese Antwort nicht
//       mehr, die gespeicherten IDs sind nicht überprüfbar und koennen fuer die
//       aktuelle Route entfallen sein. Ungeprueft uebernommen schraenkte er die
//       ERSTE Anfrage ein und lieferte faelschlich null Angebote.
//
// Geprüft werden die reinen Helfer sowie — nach dem Muster der übrigen Tests in
// diesem Repo — die Verdrahtung in NewShipmentPage.jsx per Quelltext-Assertion.
// Kein DOM, kein Netz, keine echte Preisabfrage.
//
// Run: node --test src/utils/newShipmentResume.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resumeInitialState, missingFieldsHint, RESULT_DERIVED_RESUME_FIELDS } from "./newShipmentResume.mjs";
import { getShipmentFormSnapshot } from "./shipmentFormSnapshot.mjs";
import { buildResumeInitialState } from "./formDraftsView.mjs";

const PAGE = readFileSync(new URL("../pages/NewShipmentPage.jsx", import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const PAGE_CODE = stripComments(PAGE);
// Rumpf von calculate() — von der Deklaration bis zur nächsten Top-Level-Funktion.
const CALCULATE = PAGE_CODE.slice(
  PAGE_CODE.indexOf("const calculate = async () => {"),
  PAGE_CODE.indexOf("const reloadFormDraft = async () => {")
);

// Vollständiger, realistischer Entwurf (alle vom Snapshot getragenen Felder).
const VOLLSTAENDIGER_FORM = {
  s_company: "Muster GmbH", s_fullName: "Max Mustermann", s_street: "Hauptstrasse 1", s_addition: "Haus 2",
  s_zip: "10115", s_city: "Berlin", s_country: "DE", s_phone: "+4930123456", s_email: "max@example.com",
  r_company: "Empfang AG", r_fullName: "Erika Empfaenger", r_street: "Bahnhofstrasse 9", r_addition: "",
  r_zip: "80331", r_city: "Muenchen", r_country: "DE", r_phone: "+4989987654", r_email: "erika@example.com",
  packageCount: "2", weight: "5.5", length: "40", width: "30", height: "20",
  max_price: "", latestDeliveryDate: "",
};
const VOLLSTAENDIGE_OPTIONEN = {
  form: VOLLSTAENDIGER_FORM, shippingDate: "2030-06-01",
  serviceFilter: "pickup", shippingModeFilter: "express", selectedPublicCarrierIds: ["ups"],
};

// ── Datenübernahme: Entwurf → Formular ──────────────────────────────────────

test("Datenübernahme: alle gespeicherten Felder überstehen den Roundtrip verlustfrei", () => {
  const snapshot = getShipmentFormSnapshot(VOLLSTAENDIGE_OPTIONEN);
  const zurueck = buildResumeInitialState(snapshot, { today: "2026-08-02" });
  for (const key of Object.keys(VOLLSTAENDIGER_FORM)) {
    assert.equal(String(zurueck.form[key] ?? ""), String(VOLLSTAENDIGER_FORM[key]), `Feld ${key}`);
  }
  assert.equal(zurueck.shippingDate, "2030-06-01");
  assert.equal(zurueck.serviceFilter, "pickup");
  assert.equal(zurueck.shippingModeFilter, "express");
  assert.deepEqual(zurueck.selectedPublicCarrierIds, ["ups"]);
});

test("Datenübernahme: Länder, PLZ, Orte, Maße und Paketanzahl kommen korrekt an", () => {
  const snapshot = getShipmentFormSnapshot(VOLLSTAENDIGE_OPTIONEN);
  assert.equal(snapshot.sender.country, "DE");
  assert.equal(snapshot.recipient.postalCode, "80331");
  assert.equal(snapshot.recipient.city, "Muenchen");
  assert.deepEqual(snapshot.packages, { packageCount: 2, weight: 5.5, length: 40, width: 30, height: 20 });
  const zurueck = buildResumeInitialState(snapshot, { today: "2026-08-02" });
  assert.equal(zurueck.form.packageCount, "2");
  assert.equal(zurueck.form.weight, "5.5");
  assert.equal(zurueck.form.length, "40");
  assert.equal(zurueck.form.width, "30");
  assert.equal(zurueck.form.height, "20");
});

// ── (2) Echte Daten vs. ergebnisabhängiger Filter ───────────────────────────

const RESUME_INIT = Object.freeze({
  form: Object.freeze({ ...VOLLSTAENDIGER_FORM }),
  shippingDate: "2030-06-01",
  serviceFilter: "pickup",
  shippingModeFilter: "express",
  selectedPublicCarrierIds: ["ups", "dhl"],
});

test("resumeInitialState: alle echten Sendungs- und Berechnungsdaten bleiben unveraendert", () => {
  const init = resumeInitialState(RESUME_INIT);
  // Adressen, Laender, PLZ, Orte, Kontaktdaten, Paketanzahl, Masse, Gewicht
  assert.deepEqual(init.form, RESUME_INIT.form);
  // Versanddatum sowie Abhol-/Abgabe- und Express-/Standardauswahl
  assert.equal(init.shippingDate, "2030-06-01");
  assert.equal(init.serviceFilter, "pickup");
  assert.equal(init.shippingModeFilter, "express");
});

test("resumeInitialState: nur der ergebnisabhaengige Carrier-Filter wird neutralisiert", () => {
  const init = resumeInitialState(RESUME_INIT);
  assert.deepEqual(init.selectedPublicCarrierIds, [],
    "ein nicht ueberpruefbarer Ergebnisfilter darf die erste Preisberechnung nicht einschraenken");
  assert.deepEqual(RESULT_DERIVED_RESUME_FIELDS, ["selectedPublicCarrierIds"]);
});

test("resumeInitialState: der uebergebene Snapshot wird nicht mutiert", () => {
  const eingabe = { ...RESUME_INIT, selectedPublicCarrierIds: ["ups"] };
  resumeInitialState(eingabe);
  assert.deepEqual(eingabe.selectedPublicCarrierIds, ["ups"],
    "der gespeicherte Entwurf bleibt unberuehrt (Abwaertskompatibilitaet)");
});

test("resumeInitialState: neutralisiert auch ohne gespeicherten Filter zuverlaessig", () => {
  for (const wert of [[], undefined, null, "ups"]) {
    const init = resumeInitialState({ ...RESUME_INIT, selectedPublicCarrierIds: wert });
    assert.deepEqual(init.selectedPublicCarrierIds, []);
  }
});

test("resumeInitialState: ohne Entwurf null (neue Sendung nutzt den bisherigen Seed)", () => {
  for (const wert of [null, undefined, 42, "x"]) assert.equal(resumeInitialState(wert), null);
});

test("Abgrenzung: der Snapshot fuehrt genau einen ergebnisabhaengigen Wert", () => {
  // Alle uebrigen Snapshot-Felder sind eigenstaendige Eingaben und jederzeit
  // darstellbar; nur publicCarrierIds haengt an einer frueheren Angebotsantwort.
  const snapshot = getShipmentFormSnapshot(VOLLSTAENDIGE_OPTIONEN);
  assert.deepEqual(Object.keys(snapshot).sort(), ["inventoryContext", "packages", "recipient", "sender", "shippingOptions"]);
  assert.deepEqual(Object.keys(snapshot.shippingOptions).sort(),
    ["publicCarrierIds", "serviceFilter", "shippingDate", "shippingModeFilter"]);
});

// ── (1) Unvollständiger Entwurf erklärt sich sofort ─────────────────────────

test("missingFieldsHint: vollständige Daten erzeugen keinen Hinweis", () => {
  assert.equal(missingFieldsHint({}), null);
  assert.equal(missingFieldsHint(null), null);
  assert.equal(missingFieldsHint(undefined), null);
  assert.equal(missingFieldsHint("kaputt"), null);
});

test("missingFieldsHint: ein fehlendes Feld wird namentlich genannt", () => {
  const hint = missingFieldsHint({ r_city: "Stadt ist ein Pflichtfeld." });
  assert.equal(hint, "Bitte prüfen Sie Empfänger – Stadt, um Angebote zu vergleichen.");
});

test("missingFieldsHint: zwei und drei Felder werden lesbar verbunden", () => {
  assert.equal(missingFieldsHint({ r_city: "x", weight: "y" }),
    "Bitte prüfen Sie Empfänger – Stadt und Gewicht, um Angebote zu vergleichen.");
  assert.equal(missingFieldsHint({ s_zip: "x", r_city: "y", weight: "z" }),
    "Bitte prüfen Sie Absender – PLZ, Empfänger – Stadt und Gewicht, um Angebote zu vergleichen.");
});

test("missingFieldsHint: Reihenfolge ist stabil (Absender → Empfänger → Paket)", () => {
  const a = missingFieldsHint({ weight: "x", r_city: "y", s_zip: "z" });
  const b = missingFieldsHint({ s_zip: "z", weight: "x", r_city: "y" });
  assert.equal(a, b);
});

test("missingFieldsHint: mehr als drei Felder werden zusammengefasst", () => {
  const hint = missingFieldsHint({ s_zip: "a", s_city: "b", r_city: "c", weight: "d" });
  assert.equal(hint, "Bitte vervollständigen Sie 4 markierte Angaben, um Angebote zu vergleichen.");
});

test("missingFieldsHint: unbekannte Schlüssel werden gezählt, aber nicht erfunden benannt", () => {
  const hint = missingFieldsHint({ irgendwas_neues: "x" });
  assert.equal(hint, "Bitte vervollständigen Sie 1 markierte Angabe, um Angebote zu vergleichen.");
  assert.ok(!/irgendwas_neues/.test(hint));
});

test("missingFieldsHint: falsy Fehlerwerte zählen nicht als Fehler", () => {
  assert.equal(missingFieldsHint({ r_city: "", weight: null, length: undefined }), null);
});

// ── Verdrahtung in NewShipmentPage.jsx ──────────────────────────────────────

test("Verdrahtung: der Resume-Initialzustand laeuft durch resumeInitialState", () => {
  assert.ok(PAGE_CODE.includes("resumeInitialState(buildResumeInitialState(resumeDraft.formData"),
    "der Entwurf wird nicht ueber resumeInitialState neutralisiert");
  // Die Auswahlliste darf NIE aus dem Entwurf kommen: dessen Angebotsantwort
  // existiert nach dem Fortsetzen nicht mehr, die IDs sind unüberprüfbar.
  //
  // Geprüft wird jetzt die Zusicherung statt eines Zeilenliterals: der
  // publicCarriers-Initialisierer nennt `resumeInit` nicht. Das ist strenger als
  // vorher — es fällt auch dann, wenn die Vorbelegung in anderer Schreibweise
  // wieder eingeführt wird. (Der Sitzungs-Restore darf die Liste sehr wohl
  // mitbringen: dort kommt sie mit derselben Berechnung zurück.)
  const publicCarriersInit = PAGE_CODE.match(/const \[publicCarriers, setPublicCarriers\][^\n]*/)?.[0] || "";
  assert.ok(publicCarriersInit, "publicCarriers-Initialisierer nicht gefunden");
  assert.ok(!publicCarriersInit.includes("resumeInit"),
    "publicCarriers darf nicht aus dem Entwurf vorbelegt werden");
  assert.ok(!PAGE_CODE.includes("resumePublicCarrierOptions"), "verwaiste Sichtbarkeits-Vorbelegung");
  assert.ok(!PAGE_CODE.includes("carrierFilterNotice"), "verwaister Hinweis auf entfernte Filter");
});

test("Verdrahtung: Validierungsfehler eines fortgesetzten Entwurfs stehen ab dem Mount fest", () => {
  assert.ok(PAGE_CODE.includes("useState(() => (resumeInit ? getErrors(resumeInit.form) : {}))"),
    "errors wird beim Fortsetzen nicht synchron vorbelegt");
});

test("Verdrahtung: neue Sendung startet unverändert ohne Filter und ohne Fehler", () => {
  // Der Entwurfszweig steht unverändert an erster Stelle; ohne Entwurf UND ohne
  // laufenden Vorgang greift exakt der bisherige Startzustand ([] bzw. {}).
  // Die Vorrangkette ist damit ausdrücklich Teil der Zusicherung:
  //   Entwurf > laufender Vorgang > Standard.
  assert.ok(PAGE_CODE.includes("resumeInit ? resumeInit.selectedPublicCarrierIds : flowInit ? flowInit.selectedPublicCarrierIds : []"),
    "Vorrangkette des Carrier-Filters verändert");
  assert.ok(PAGE_CODE.includes("resumeInit ? getErrors(resumeInit.form) : {}"));
  assert.ok(PAGE_CODE.includes("resumeInit ? resumeInit.form : flowInit ? flowInit.form : profilSeed()"),
    "Vorrangkette des Formular-Seeds verändert");
  // Der Profil-Seed selbst ist unverändert — er ist nur in eine benannte
  // Funktion gewandert, weil ihn drei Stellen brauchen (Startwert,
  // Dirty-Baseline eines wiederhergestellten Vorgangs, bewusstes Zurücksetzen).
  assert.ok(/const profilSeed = useCallback\(\(\) => \(\{\s*\n\s*s_company:/.test(PAGE_CODE),
    "Formular-Seed der neuen Sendung verändert");
});

test("Verdrahtung: genau EIN Preisrequest je Aufruf, kein automatischer Wiederversand", () => {
  const requests = CALCULATE.match(/apiFetch\(/g) || [];
  assert.equal(requests.length, 1, "calculate() darf genau einen API-Aufruf enthalten");
  assert.ok(CALCULATE.includes("/api/jumingo/calculate-price"), "Zielendpunkt verändert");
  // Keine künstlichen Umgehungen: kein Timer, kein Selbstaufruf, kein Reload.
  assert.ok(!/setTimeout|setInterval|location\.reload/.test(CALCULATE), "künstlicher Workaround in calculate()");
  assert.ok(!/calculate\s*\(\s*\)/.test(CALCULATE.replace("const calculate = async () => {", "")),
    "calculate() darf sich nicht selbst erneut aufrufen");
});

test("Verdrahtung: laufende Anfrage blockiert einen zweiten Klick (keine Doppelrequests)", () => {
  const kopf = CALCULATE.slice(0, CALCULATE.indexOf("setHasResults(false)"));
  // Bewusst ein Ref, kein State: mehrere Klicks im selben Tick sehen denselben
  // (noch alten) State-Wert und kaemen an einer State-Pruefung vorbei.
  assert.ok(/if \(calcInFlight\.current\) return;/.test(kopf), "In-Flight-Guard fehlt am Anfang von calculate()");
  assert.ok(!/if \(loading\) return;/.test(kopf), "State-basierter Guard greift bei Klicks im selben Tick nicht");
  assert.ok(PAGE_CODE.includes("const calcInFlight = useRef(false);"), "calcInFlight muss ein Ref sein");
  // Freigabe erst im finally → deckt auch alle fruehen Returns im try-Block ab.
  assert.ok(/\} finally \{[\s\S]*calcInFlight\.current = false;[\s\S]*\}/.test(CALCULATE),
    "Guard wird nicht in finally zurueckgesetzt (CTA koennte dauerhaft blockieren)");
  // Erst NACH der Validierung setzen: ein abgelehnter Klick darf nichts blockieren.
  const gesetztIdx = CALCULATE.indexOf("calcInFlight.current = true;");
  assert.ok(gesetztIdx > CALCULATE.indexOf("const errs = getErrors(form);"),
    "Guard darf erst nach der Validierung gesetzt werden");
  assert.ok(PAGE_CODE.includes("disabled={loading || !calcValid || saving}"),
    "CTA muss waehrend Laden/Speichern deaktiviert bleiben");
});

test("Verdrahtung: ungültige Daten senden keinen Request und markieren die Felder", () => {
  const vorRequest = CALCULATE.slice(0, CALCULATE.indexOf("apiFetch("));
  assert.ok(vorRequest.includes("const errs = getErrors(form);"), "Validierung vor dem Request fehlt");
  assert.ok(/if \(Object\.keys\(errs\)\.length > 0\) \{[\s\S]*setErrors\(errs\);[\s\S]*return;/.test(vorRequest),
    "ungültige Daten müssen VOR dem Request mit gesetzten Fehlern abbrechen");
});

test("Verdrahtung: Payload-Felder der Preisberechnung sind unverändert", () => {
  for (const feld of [
    "packageCount: Number(form.packageCount)", "weight: Number(form.weight)",
    "sender:             buildParty(\"s\")", "recipient:          buildParty(\"r\")",
    "serviceFilter:      serviceFilter", "shippingModeFilter: shippingModeFilter",
    "shippingDate:       shippingDate", "publicCarrierIds:   selectedPublicCarrierIds",
    "sourceFormDraftId: sourceAtSend.id", "sourceFormDraftRevision: sourceAtSend.revision",
  ]) {
    assert.ok(CALCULATE.includes(feld), `Payload-Feld verändert: ${feld}`);
  }
});

test("Verdrahtung: die Auswahl bleibt nach der Antwort normal filterbar", () => {
  // Die Antwort speist die Auswahlliste; eine danach bewusst getroffene Auswahl
  // wird nur noch gegen die real verfuegbaren IDs abgeglichen.
  assert.ok(PAGE_CODE.includes("setPublicCarriers(newPublicCarriers);"));
  assert.ok(PAGE_CODE.includes("setSelectedPublicCarrierIds(prev => prev.filter(id => validIds.has(id)));"));
  assert.ok(PAGE_CODE.includes("const handleTogglePublicCarrier = (id) => {"),
    "bewusste Carrier-Auswahl des Nutzers muss weiterhin moeglich sein");
});

test("Verdrahtung: Entwurfshydrierung bleibt synchron und einmalig", () => {
  assert.ok(PAGE_CODE.includes("if (resumeInitRef.current === undefined)"),
    "Hydrierung muss beim ersten Render feststehen (kein nachgelagerter Effekt)");
  assert.ok(PAGE_CODE.includes("resumeAppliedRef.current = true;"), "Einmal-Semantik des Resume-Payloads verändert");
  // Kein Effekt darf den Formularstand aus dem Entwurf nachträglich überschreiben.
  assert.ok(!/useEffect\([^)]*\{\s*setForm\(resumeInit/.test(PAGE_CODE));
});

test("Verdrahtung: keine künstlichen Workarounds im Klickpfad", () => {
  assert.ok(!/onClick=\{[^}]*calculate[^}]*calculate/.test(PAGE_CODE), "doppelter Aufruf im Klick-Handler");
  const ctaBlock = PAGE_CODE.slice(PAGE_CODE.indexOf("offers-calc-cta"), PAGE_CODE.indexOf("dft-savedraft-cta"));
  assert.ok(ctaBlock.includes("onClick={calculate}"), "CTA ruft nicht mehr calculate auf");
  assert.ok(!/setTimeout|requestAnimationFrame/.test(ctaBlock), "Timer/Frame-Trick im CTA-Pfad");
});

// ── Regression Drei-Klick-Ablauf: Sendungsgrundlage-Guard ───────────────────

test("Verdrahtung: der Guard prueft den Sendungsbezug, nicht die interne ID", () => {
  assert.ok(PAGE_CODE.includes("!hasUsableShipmentReference(d.shipmentId)"),
    "der Guard muss den Sendungsbezug der Antwort pruefen");
  assert.ok(!PAGE_CODE.includes("!hasSavableShipmentId(d.shipmentId)"),
    "hasSavableShipmentId gilt der INTERNEN numerischen ID und lehnt JUMiNGO-IDs ab");
  // Der Validator der internen Draft-ID bleibt dort, wo er hingehoert (PATCH-Pfad).
  assert.ok(PAGE_CODE.includes("hasSavableShipmentId(source.id)"),
    "die interne Draft-ID wird weiterhin streng geprueft");
});

test("Verdrahtung: der Guard bleibt scharf (serverseitiges Persistenz-Signal)", () => {
  assert.ok(PAGE_CODE.includes("if (t.blocking || !hasUsableShipmentReference(d.shipmentId)) {"),
    "shipment_persistence_failed muss weiterhin blockieren");
  assert.ok(PAGE_CODE.includes("setError(SHIPMENT_PERSISTENCE_FAILED_MESSAGE);"),
    "die Meldung darf nicht pauschal unterdrueckt werden");
});

test("Verdrahtung: eine verbrauchte Entwurfs-ID wird nie erneut gesendet", () => {
  const block = PAGE_CODE.slice(PAGE_CODE.indexOf("if (sourceAtSend) {"), PAGE_CODE.indexOf("const newPublicCarriers"));
  const geloest = block.indexOf("if (t.consumed) setResumeSource(null);");
  const guard = block.indexOf("if (t.blocking ||");
  assert.ok(geloest !== -1, "verbrauchter Entwurf wird nicht geloest");
  assert.ok(geloest < guard, "das Loesen muss VOR dem Guard passieren, sonst geht ein Klick verloren");
});
