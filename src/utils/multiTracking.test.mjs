/* TG-F6 — Multi-Tracking im Frontend.
   =============================================================================
   Drei Zusagen:

     1. Trägt eine Sendung mehrere Trackingnummern, sieht der Kunde ALLE — in der
        Sendungsliste kompakt, im Sendungsdetail, in der Live-Trackingansicht, auf der
        Mobilkarte und in der Auftragsansicht.
     2. Eine Sendung mit genau EINER Nummer sieht exakt aus wie bisher.
     3. Die Liste kommt vom Server (Sendungsliste, Trackingantwort, Auftragsantwort) —
        nie aus dem Buchungszustand, nie aus Etiketten abgeleitet.

   Das gerenderte Verhalten prüft tests/e2e/multiTrackingShipments.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TRACKING_REFERENCES_TEXT, trackingReferencesOf, multiTrackingReferencesOf, trackingReferencesSummary,
} from "./trackingReferencesView.mjs";

// Zeilenenden zuerst vereinheitlichen: auf einem CRLF-Checkout liefe `.*$` sonst ins Leere.
const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

const DREI = ["1Z999AA10000000001", "1Z999AA10000000002", "1Z999AA10000000003"];

/* ═════════ 1 — Auswertung ═════════ */

test("1 — die Liste kommt aus der Serverantwort, in Serverreihenfolge, dedupliziert", () => {
  assert.deepEqual(trackingReferencesOf({ tracking_references: DREI }), DREI);
  assert.deepEqual(trackingReferencesOf({ trackingReferences: [...DREI].reverse() }), [...DREI].reverse());
  // Auch als Objekte mit `reference` lesbar — ohne dass daraus ein anderer Wert wird.
  assert.deepEqual(trackingReferencesOf({ trackingReferences: DREI.map((reference) => ({ reference })) }), DREI);
  assert.deepEqual(trackingReferencesOf({ tracking_references: [DREI[0], DREI[0], ` ${DREI[1]} `] }), [DREI[0], DREI[1]]);
});

test("2 — Unbrauchbares erscheint nicht: keine leere Zeile, kein undefined, keine URL", () => {
  const kaputt = [null, undefined, "", "  ", "<b>1</b>", "a b", "https://track.example/1", "X".repeat(41), 42, {}];
  assert.deepEqual(trackingReferencesOf({ tracking_references: kaputt }), []);
  for (const quelle of [null, undefined, {}, { tracking_references: null }, { trackingReferences: "x" }]) {
    assert.deepEqual(trackingReferencesOf(quelle), []);
    assert.equal(multiTrackingReferencesOf(quelle), null);
  }
});

test("3 — eine Nummer bleibt eine Nummer: erst ab zwei ändert sich die Darstellung", () => {
  assert.equal(multiTrackingReferencesOf({ tracking_references: [DREI[0]], tracking_number: DREI[0] }), null);
  assert.equal(multiTrackingReferencesOf({ tracking_number: DREI[0] }), null, "eine Einzelnummer wird zur Liste");
  assert.deepEqual(multiTrackingReferencesOf({ tracking_references: DREI.slice(0, 2) }), DREI.slice(0, 2));
  assert.equal(trackingReferencesSummary(DREI), "3 Trackingnummern");
  assert.equal(trackingReferencesSummary([DREI[0]]), null);
  assert.equal(trackingReferencesSummary(null), null);
  assert.equal(TRACKING_REFERENCES_TEXT.plural, "Trackingnummern");
});

test("4 — kein Anbietername, keine Paketnummer, kein Browserspeicher im Auswertungsmodul", () => {
  const modul = lies("./trackingReferencesView.mjs");
  assert.ok(!/transglobal|jumingo/i.test(modul), "das Modul nennt einen Anbieter");
  assert.ok(!/Paket \d|`Paket|"Paket /.test(ohneKommentare(modul)), "eine Paketnummer wird gebildet");
  for (const verboten of ["localStorage", "sessionStorage", "indexedDB", "fetch(", "apiFetch"]) {
    assert.ok(!ohneKommentare(modul).includes(verboten), `${verboten} hat hier nichts zu suchen`);
  }
});

/* ═════════ 2 — Sendungsliste ═════════ */

const liste = ohneKommentare(lies("../components/dashboard/ShipmentsList.jsx"));

test("5 — Liste und Mobilkarte: kompakte Anzahl bei mehreren, sonst unverändert die Einzelnummer", () => {
  assert.equal((liste.match(/const alleNummern = multiTrackingReferencesOf\(s\);/g) || []).length, 2,
    "Tabelle und Karte werten die Liste nicht beide aus");
  assert.equal((liste.match(/\{trackingReferencesSummary\(alleNummern\)\}/g) || []).length, 2);
  // Die bisherige Einzelanzeige bleibt wörtlich — als Zweig für genau eine Nummer.
  assert.equal((liste.match(/\) : nums\.trackingNumber && \(/g) || []).length, 3,
    "die Einzelanzeige ist nicht mehr der Rückfall");
  assert.equal((liste.match(/\{NUMBER_LABELS\.tracking\}: \{nums\.trackingNumber\}/g) || []).length, 2);
});

test("6 — Sendungsdetail und Mobilkarte zeigen ALLE Nummern, die Live-Ansicht ebenfalls", () => {
  assert.ok(/alleNummern\.map\(\(nr\) => \(\s*<li key=\{nr\}/.test(liste), "das Detail listet nicht jede Nummer");
  assert.ok(/alleNummern\.map\(\(nr\) => \(\s*<span key=\{nr\}/.test(liste), "die Mobilkarte listet nicht jede Nummer");
  assert.ok(liste.includes("const liveNummern = multiTrackingReferencesOf(tracking);"));
  assert.ok(liste.includes('{TRACKING_REFERENCES_TEXT.plural}: <strong style={{ wordBreak: "break-all" }}>{liveNummern.join(", ")}</strong>'));
  assert.ok(liste.includes("Trackingnummer: <strong>{number}</strong>"), "die Einzelanzeige der Live-Ansicht ist weg");
  // Keine Ableitung aus Buchungszustand oder Etiketten.
  assert.ok(!/shippingDocuments|carrierReference|booking\?\./.test(liste));
});

test("7 — der Trackingabruf reicht die Liste vom Server durch", () => {
  const client = ohneKommentare(lies("../api/client.js"));
  assert.ok(client.includes('trackingReferences:  pick("trackingReferences"),'), "selectTracking verwirft die Liste");
});

test("8 — die Auftragsansicht zeigt alle Nummern, sonst unverändert die eine", () => {
  const seite = ohneKommentare(lies("../pages/inventory/OrderDetailPage.jsx"));
  assert.ok(seite.includes("multiTrackingReferencesOf(s)"));
  assert.ok(seite.includes(': (s.trackingNumber || "—")'), "die Einzelanzeige der Auftragsansicht ist weg");
  assert.ok(seite.includes('import { multiTrackingReferencesOf } from "../../utils/trackingReferencesView.mjs";'));
});
