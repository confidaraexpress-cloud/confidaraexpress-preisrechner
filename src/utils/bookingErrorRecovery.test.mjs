// TG-Abschluss (2026-10-12) — drei Buchungsantworten, bei denen NICHTS beauftragt wurde, bekamen bis hierher eine
// falsche Fläche:
//
//   409 INSUFFICIENT_STOCK u. a.     Lagerkonflikt der Reservierung VOR der Bestellung (Backend
//                                    lib/booking/inventoryReservation.js) — lief in „bereits verarbeitet" /
//                                    „Zu meinen Sendungen" bzw. in eine wirkungslose Neubepreisung.
//   400 PRICE_INPUTS_MISSING         Transglobal-Revalidierung VOR dem Claim — lief in die Adressfehlerfläche
//                                    („Adressen vervollständigen & neu berechnen").
//   503 LEGAL_DOCUMENTS_NOT_CONFIGURED  Legal-Prüfung VOR jedem Providerkontakt — lief als 5xx ohne bekannten
//                                    Code in den offenen Ausgang („Buchungsstatus wird geprüft").
//
// Diese Suite prüft die Zuordnung (utils/bookingErrors.mjs) und die Verdrahtung der Buchungsseite. Sie prüft
// ausdrücklich mit, dass die bestehenden Schutzregeln unverändert sind: ein 503 OHNE Code, ein Timeout und
// BOOKING_PENDING bleiben offene Ausgänge ohne Wiederholungsangebot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  lagerkonfliktBeimBuchen, preisangabenFehlenHandlung, mapBookRestError, mapBookThrownError, istOffenerAusgang,
  istUnklarerAusgang, fordertNeuberechnung, erlaubtSpaeterenVersuch, BOOK_FEHLER, LAGERKONFLIKT_ZIEL_TEXT,
  PRICE_INPUTS_MISSING_CODE,
} from "./bookingErrors.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const NICHTS = "Es wurde nichts beauftragt und nichts berechnet.";

// Backendform: { error, code, details } mit 409 (lib/booking/inventoryReservation.js).
const lager = (code, details = {}, error = "Servertext") => ({ error, code, details });

test("L1 — zu wenig Bestand mit Artikelname: Bestandssatz mit Artikel, nichts beauftragt, Weg zum Bestand", () => {
  const r = lagerkonfliktBeimBuchen(409, lager("INSUFFICIENT_STOCK", { productId: "7", name: "Ersatzteil A", sku: "ET-A" }));
  assert.equal(r.ziel, "stock");
  assert.equal(r.text,
    `Für „Ersatzteil A“ ist nicht genügend Bestand verfügbar. ${NICHTS} Bitte prüfen Sie den Bestand und berechnen Sie die Angebote danach neu.`);
  assert.equal(LAGERKONFLIKT_ZIEL_TEXT[r.ziel], "Bestand prüfen");
});

test("L2 — ohne Namen die SKU, ohne beides der Satz des Lagermoduls", () => {
  assert.match(lagerkonfliktBeimBuchen(409, lager("INSUFFICIENT_STOCK", { sku: "ET-B" })).text, /^Für „ET-B“ ist nicht genügend Bestand/);
  assert.match(lagerkonfliktBeimBuchen(409, lager("INSUFFICIENT_STOCK", { name: "  " })).text,
    /^Dafür ist nicht genügend Bestand verfügbar\. /);
  assert.match(lagerkonfliktBeimBuchen(409, { code: "INSUFFICIENT_STOCK" }).text, /^Dafür ist nicht genügend Bestand verfügbar\. /);
});

test("L3 — gehaltene Auftragsmenge, fehlender Artikel, unbrauchbare Menge: eigener Satz und eigenes Ziel", () => {
  const auftrag = lagerkonfliktBeimBuchen(409, lager("RESERVATION_CLAIMED", { name: "X" }));
  assert.equal(auftrag.ziel, "orders");
  assert.equal(auftrag.text, `Diese Auftragsmenge wird bereits für eine andere Sendung verwendet. ${NICHTS} Bitte prüfen Sie den Auftrag und berechnen Sie die Angebote danach neu.`);
  assert.equal(LAGERKONFLIKT_ZIEL_TEXT.orders, "Aufträge prüfen");
  const artikel = lagerkonfliktBeimBuchen(409, lager("PRODUCT_NOT_FOUND"));
  assert.equal(artikel.ziel, "stock");
  assert.match(artikel.text, /^Der Artikel wurde nicht gefunden\. /);
  const menge = lagerkonfliktBeimBuchen(409, lager("INVALID_QUANTITY"));
  assert.equal(menge.ziel, null);
  assert.match(menge.text, /Bitte berechnen Sie die Angebote neu\.$/);
});

test("L4 — nur ein 409 mit einem Bestandscode: jeder andere Status oder Code ist kein Lagerkonflikt", () => {
  assert.equal(lagerkonfliktBeimBuchen(400, lager("INVALID_QUANTITY")), null);
  assert.equal(lagerkonfliktBeimBuchen(404, lager("PRODUCT_NOT_FOUND")), null);
  assert.equal(lagerkonfliktBeimBuchen(500, lager("INSUFFICIENT_STOCK")), null);
  for (const code of ["OFFER_NOT_BOOKABLE", "BOOKING_IN_PROGRESS", "OFFER_ALREADY_USED", "PRICE_CHANGED", "BOOKING_FAILED"]) {
    assert.equal(lagerkonfliktBeimBuchen(409, { code, error: "x" }), null, code);
  }
  assert.equal(lagerkonfliktBeimBuchen(409, { error: "ohne Code" }), null);
  assert.equal(lagerkonfliktBeimBuchen(409, null), null);
  assert.equal(lagerkonfliktBeimBuchen(409, { code: "toString" }), null, "Prototyp-Schlüssel sind keine Codes");
});

test("L5 — kein Rohcode, keine offene Prüfung, kein Wiederholungsangebot im Lagertext", () => {
  for (const code of ["INSUFFICIENT_STOCK", "RESERVATION_CLAIMED", "PRODUCT_NOT_FOUND", "INVALID_QUANTITY"]) {
    const { text } = lagerkonfliktBeimBuchen(409, lager(code));
    assert.doesNotMatch(text, new RegExp(code));
    assert.doesNotMatch(text, /geprüft|erneut absenden|erneut versuchen/i);
    assert.match(text, /Es wurde nichts beauftragt/);
  }
});

test("P1 — PRICE_INPUTS_MISSING nur mit der Art der Lieferadresse und abgefragter Auswahl: zurück zur Auswahl", () => {
  const body = { error: "Für dieses Angebot fehlen noch Angaben zur Zustelladresse.", code: PRICE_INPUTS_MISSING_CODE,
                 fields: ["deliveryIsResidential"] };
  assert.deepEqual(preisangabenFehlenHandlung(body, { lieferadressartAbfragbar: true }), { aktion: "neubindung" });
});

test("P2 — jede andere Lage: neu berechnen mit benannter Ursache, nie eine erfundene Auswahl", () => {
  const erwartet = { aktion: "neu_berechnen", text: BOOK_FEHLER.PREISANGABEN_UNVOLLSTAENDIG.message };
  const code = PRICE_INPUTS_MISSING_CODE;
  assert.deepEqual(preisangabenFehlenHandlung({ code, fields: ["deliveryIsResidential"] }), erwartet,
    "ohne abgefragte Auswahl gibt es nichts zu wählen");
  assert.deepEqual(preisangabenFehlenHandlung({ code, fields: ["collectionIsResidential"] }, { lieferadressartAbfragbar: true }), erwartet);
  assert.deepEqual(preisangabenFehlenHandlung({ code, fields: ["deliveryIsResidential", "fulfillmentMode"] },
    { lieferadressartAbfragbar: true }), erwartet);
  assert.deepEqual(preisangabenFehlenHandlung({ code, fields: [] }, { lieferadressartAbfragbar: true }), erwartet);
  assert.deepEqual(preisangabenFehlenHandlung({ code }, { lieferadressartAbfragbar: true }), erwartet);
  assert.match(erwartet.text, /preisrelevante Angaben/);
  assert.match(erwartet.text, /Es wurde nichts beauftragt/);
  assert.doesNotMatch(erwartet.text, /Adresse/, "an der Anschrift fehlt nichts");
});

test("P3 — ein anderer Code ist keine fehlende Preisangabe", () => {
  assert.equal(preisangabenFehlenHandlung({ code: "PRICE_INPUTS_REQUIRED" }, { lieferadressartAbfragbar: true }), null);
  assert.equal(preisangabenFehlenHandlung({ code: "SHIPMENT_DECLARATIONS_MISSING" }), null);
  assert.equal(preisangabenFehlenHandlung(null), null);
});

test("R1 — 503 LEGAL_DOCUMENTS_NOT_CONFIGURED: später erneut, nichts beauftragt, kein offener Ausgang", () => {
  const body = { error: "Die Vertragsunterlagen sind derzeit nicht abrufbar.", code: "LEGAL_DOCUMENTS_NOT_CONFIGURED" };
  const f = mapBookRestError(503, body);
  assert.equal(f, BOOK_FEHLER.BUCHUNG_DERZEIT_NICHT_MOEGLICH);
  assert.equal(istUnklarerAusgang(f), false);
  assert.equal(istOffenerAusgang(503, body), false);
  assert.equal(erlaubtSpaeterenVersuch(body), true, "der Bestellknopf bleibt stehen");
  assert.equal(fordertNeuberechnung(body), false, "eine Neuberechnung repariert die Konfiguration nicht");
  assert.match(f.message, /Es wurde nichts beauftragt und nichts berechnet/);
  assert.doesNotMatch(f.message, /geprüft|NICHT erneut|Adresse/);
  assert.doesNotMatch(f.message, /LEGAL_/);
});

test("R2 — die Zuordnung gilt nur für DIESEN Code: 503 ohne oder mit anderem Code bleibt beim bisherigen Vertrag", () => {
  assert.equal(mapBookRestError(503, null), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(503, {}), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(503, { error: "x", code: "LEGAL_SOMETHING_ELSE" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(502, { code: "BOOKING_OUTCOME_UNKNOWN" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(503, { code: "PRICE_UNCONFIRMED" }), BOOK_FEHLER.PREIS_UNBESTAETIGT);
  assert.equal(istOffenerAusgang(202, { code: "BOOKING_PENDING" }), true);
  assert.equal(mapBookThrownError(new Error("timeout")), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(erlaubtSpaeterenVersuch({ code: "PRICE_UNCONFIRMED" }), false);
});

// ─── Verdrahtung der Buchungsseite (Quelltextanker) ─────────────────────────────────────────
const SEITE = src("../pages/BookingPage.jsx");
const AKTION = src("../components/booking/BookingActionModule.jsx");
const nach = (text, von, nadel) => text.indexOf(nadel, text.indexOf(von));

test("V1 — 409-Zweig: der Lagerkonflikt steht VOR den Absicherungszweigen und vor dem Sammelzweig", () => {
  const block = SEITE.indexOf("if (r.status === 409) {");
  assert.ok(block > 0);
  const lagerStelle = nach(SEITE, "if (r.status === 409) {", "lagerkonfliktBeimBuchen(r.status, d)");
  const deckung = nach(SEITE, "if (r.status === 409) {", "isInsured && coverModel && isCoverBookError(d)");
  const versichert = nach(SEITE, "if (r.status === 409) {", "if (isInsured) {");
  const sammel = nach(SEITE, "if (r.status === 409) {", "Diese Sendung wurde bereits verarbeitet");
  assert.ok(lagerStelle > block && lagerStelle < deckung && lagerStelle < versichert && lagerStelle < sammel,
    "der Lagerkonflikt liefe sonst in eine Neubepreisung oder nach „Zu meinen Sendungen“");
  assert.match(SEITE, /setInventoryNotice\(lagerkonflikt\)/);
  assert.match(SEITE, /setInventoryNotice\(null\)/, "ein neuer Buchungsversuch räumt die Fläche");
});

test("V2 — 400-Zweig: fehlende Preisangaben stehen VOR dem Adresszweig; dieselbe Handlung in beiden Neubepreisungen", () => {
  const start = SEITE.indexOf("if (r.status === 400 || r.status === 422) {");
  const preis = nach(SEITE, "if (r.status === 400 || r.status === 422) {", "preisangabenFehlenHandlung(d,");
  const adresse = nach(SEITE, "if (r.status === 400 || r.status === 422) {", "setAddressError(");
  assert.ok(start > 0 && preis > start && preis < adresse, "PRICE_INPUTS_MISSING liefe sonst in die Adressfläche");
  const vorkommen = SEITE.split("preisangabenFehlenHandlung(d, { lieferadressartAbfragbar: residentialRequired })").length - 1;
  assert.equal(vorkommen, 3, "Buchung, Neubepreisung der Absicherung und Preisübernahme");
});

test("V3 — die Lagerfläche ersetzt den Bestellknopf und bietet Korrekturweg und Neuberechnung, nie die Sendungsliste", () => {
  const flaeche = AKTION.slice(AKTION.indexOf(") : inventoryNotice ? ("), AKTION.indexOf(") : recalcNotice ? ("));
  assert.ok(flaeche.length > 0, "keine eigene Fläche für den Lagerkonflikt");
  assert.match(flaeche, /onNavigateInventory\(inventoryNotice\.ziel\)/);
  assert.match(flaeche, /onClick=\{onRecalculate\}/);
  assert.doesNotMatch(flaeche, /onNavigateShipments|onBook/);
  assert.match(SEITE, /onNavigateInventory=\{\(ziel\) => navigate\(`\/dashboard\?page=\$\{ziel\}`\)\}/);
});
