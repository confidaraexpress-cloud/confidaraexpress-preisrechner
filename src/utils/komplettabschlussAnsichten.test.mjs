// Kleine Abbildungen des Komplettabschlusses (2026-10-27) — je eine reine Funktion, ohne React-Render:
//   • trackingQuickPick     — Schnellwahl der laufenden Sendungen auf der Sendungsverfolgung (Audit B.7)
//   • parseCarrierPortfolio — „Ihre Versanddienstleister“ aus GET /kunde/carriers (G2)
//   • snapshotRows          — Vorschauzeilen des Lagermoduls der Übersicht (G1/D7)
//   • ortBeispiel           — Beispielpaare PLZ/Stadt des öffentlichen Preisrechners (Audit B.9)
//   • postalCodeHint        — Formathinweis unter PLZ-Feldern statt fremder Beispielnummer (Audit B.9)
//   • vorladbareSeite       — vorladbare Seite ohne Suspense-Fläche (Abschnitt 5, Anmeldung ohne Zwischenbild)
//
// Run: node --test src/utils/komplettabschlussAnsichten.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { trackingQuickPick, TRACKING_QUICKPICK_TEXT } from "./trackingQuickPick.mjs";
import { parseCarrierPortfolio, CARRIER_PORTFOLIO_TEXT } from "./carrierPortfolioView.mjs";
import { snapshotRows, INVENTORY_SNAPSHOT_TEXT } from "./overviewModules.mjs";
import { ortBeispiel } from "./publicCalculatorView.mjs";
import { postalCodeHint } from "./postalCode.mjs";
import { vorladbareSeite } from "./vorladbareSeite.js";

const sendung = (felder) => ({
  id: 1, status: "in_transit", tracking_number: "1Z999AA10123456784", order_confirmation_number: "CE-AB26-00047",
  selected_carrier: "ups", recipient_address: { company: "Alpen Handels GmbH", postalCode: "1070", city: "Wien", country: "AT" },
  ...felder,
});

test("1 — Schnellwahl: nur laufende Sendungen mit Trackingnummer, höchstens sechs, Werte aus den Listenfeldern", () => {
  const liste = [
    sendung({ id: 1 }),
    sendung({ id: 2, status: "delivered" }),
    sendung({ id: 3, tracking_number: "" }),
    sendung({ id: 4, status: "cancelled" }),
    sendung({ id: 5, status: "booked", tracking_number: "  JD0146000045  ", order_confirmation_number: null, selected_carrier: 7 }),
  ];
  const auswahl = trackingQuickPick(liste);
  assert.deepEqual(auswahl.map((e) => e.id), [1, 5], "nur laufende Sendungen mit Nummer");
  assert.deepEqual(auswahl[0], {
    id: 1, trackingNumber: "1Z999AA10123456784", title: "CE-AB26-00047",
    detail: "Alpen Handels GmbH, 1070 Wien, AT", carrierRaw: "ups",
  });
  assert.equal(auswahl[1].trackingNumber, "JD0146000045", "die Nummer wird nur getrimmt");
  assert.notEqual(auswahl[1].title, "", "ohne Auftragsbestätigung steht der feste Ersatztext");
  assert.equal(auswahl[1].carrierRaw, "", "ein Nicht-Text wird kein Carrier");
  assert.equal(trackingQuickPick(Array.from({ length: 9 }, (_, i) => sendung({ id: i }))).length, 6);
  assert.equal(trackingQuickPick(Array.from({ length: 9 }, (_, i) => sendung({ id: i })), 2).length, 2);
  for (const leer of [null, undefined, {}, "x"]) assert.deepEqual(trackingQuickPick(leer), []);
  assert.equal(TRACKING_QUICKPICK_TEXT.title, "Ihre laufenden Sendungen");
});

test("2 — Versanddienstleister: nur die Serverliste, ohne Rückfall „other“, ohne Doppelte; unbekannt = null", () => {
  assert.deepEqual(parseCarrierPortfolio({ carriers: [
    { id: "ups", name: "UPS" }, { id: "dhl", name: " DHL Express " }, { id: "other", name: "Versanddienstleister" },
    { id: "ups", name: "UPS" }, { id: "", name: "Leer" }, { id: "gls" }, null, "dpd",
  ] }), [{ id: "ups", name: "UPS" }, { id: "dhl", name: "DHL Express" }]);
  assert.deepEqual(parseCarrierPortfolio({ carriers: [] }), [], "eine leere Liste heißt „derzeit keiner“");
  for (const unbekannt of [null, undefined, {}, { carriers: "ups" }, [], "x"]) {
    assert.equal(parseCarrierPortfolio(unbekannt), null, `${JSON.stringify(unbekannt)} ist keine Liste`);
  }
  // Keine Zahl im Titel, keine Laufzeiten — der Hinweis verweist auf den Preisvergleich.
  assert.doesNotMatch(CARRIER_PORTFOLIO_TEXT.title, /\d|Fünf|zentrale/);
  assert.match(CARRIER_PORTFOLIO_TEXT.hint, /Preisvergleich/);
});

test("3 — Lagermodul: höchstens drei Vorschauzeilen in Serverreihenfolge; Texte ohne Fulfillment-Versprechen", () => {
  const zeilen = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(snapshotRows(zeilen).map((z) => z.id), ["a", "b", "c"]);
  assert.deepEqual(snapshotRows(zeilen, 1).map((z) => z.id), ["a"]);
  assert.deepEqual(snapshotRows(zeilen, -2), []);
  assert.deepEqual(snapshotRows(null), []);
  const texte = Object.values(INVENTORY_SNAPSHOT_TEXT).join(" ");
  assert.doesNotMatch(texte, /Fulfillment|einlager|Lagerhaltung für/i);
  assert.match(INVENTORY_SNAPSHOT_TEXT.emptyText, /als Sendung vorbereiten/);
});

test("4 — Beispiel-PLZ und Stadt gehören zusammen; der Hinweis beschreibt das Format", () => {
  assert.deepEqual({ ...ortBeispiel("DE", "from") }, { plz: "70173", stadt: "Stuttgart" });
  assert.deepEqual({ ...ortBeispiel("DE", "to") }, { plz: "10115", stadt: "Berlin" });
  assert.deepEqual(ortBeispiel("AT", "to", "1010"), { plz: "1010", stadt: "" }, "keine erfundene Stadt außerhalb Deutschlands");
  assert.deepEqual(ortBeispiel("FR", "from"), { plz: "", stadt: "" });
  assert.equal(postalCodeHint("DE"), "Fünfstellige PLZ");
  assert.equal(postalCodeHint("AT"), "Vierstellige PLZ");
  assert.match(postalCodeHint("NL"), /^Beispiel: /, "ohne Wortformat bleibt das Beispiel der Regeln");
  assert.equal(postalCodeHint("XX"), "");
});

test("5 — vorladbare Seite: vorgeladen ohne Suspense-Fläche, sonst wie React.lazy; ein Fehler darf erneut laden", async () => {
  function Ziel() { return null; }
  let aufrufe = 0;
  const Seite = vorladbareSeite(() => { aufrufe++; return Promise.resolve({ default: Ziel }); });
  const vorher = Seite({ a: 1 });
  assert.notEqual(vorher.type, Ziel, "vor dem Laden rendert die faule Hülle");
  await Promise.all([Seite.vorladen(), Seite.vorladen()]);
  assert.equal(aufrufe, 1, "das Modul wird nur einmal geladen");
  const nachher = Seite({ a: 1 });
  assert.equal(nachher.type, Ziel, "geladen rendert die Seite sofort");
  assert.deepEqual(nachher.props, { a: 1 });
  assert.ok(React.isValidElement(nachher));

  let versuche = 0;
  const Wackelig = vorladbareSeite(() => (++versuche === 1 ? Promise.reject(new Error("Netz")) : Promise.resolve({ default: Ziel })));
  await assert.rejects(Wackelig.vorladen(), /Netz/);
  await Wackelig.vorladen();
  assert.equal(versuche, 2, "nach einem Fehler lädt der nächste Aufruf erneut");
  assert.equal(Wackelig({}).type, Ziel);
});
