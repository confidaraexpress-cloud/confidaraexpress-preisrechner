// Label-Fehlerkette (Auditbefund #3): Backend-„Fehler" darf den Kunden nie
// mehr wortwörtlich erreichen; Codes steuern kuratierte Texte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mapLabelError, LABEL_TEXT_500, LABEL_TEXT_NICHT_BEREIT, LABEL_TEXT_NETZ,
} from "./labelErrors.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — der historische Kernfall: 500 {error:'Fehler'} wird NIE roh angezeigt", () => {
  const t = mapLabelError(500, { error: "Fehler" });
  assert.notEqual(t, "Fehler");
  assert.equal(t, LABEL_TEXT_500);
  assert.match(t, /momentan nicht geladen/);
  // Auch jeder andere 5xx-Servertext bleibt draußen.
  assert.equal(mapLabelError(503, { error: "upstream timeout at proxy" }), LABEL_TEXT_500);
});

test("2 — stabile Codes gewinnen über Status und Freitext", () => {
  assert.equal(mapLabelError(409, { code: "LABEL_NOT_READY", error: "Label noch nicht verfügbar" }), LABEL_TEXT_NICHT_BEREIT);
  assert.match(mapLabelError(404, { code: "SHIPMENT_NOT_FOUND" }), /Sendung wurde nicht gefunden/);
  assert.match(mapLabelError(429, { code: "LABEL_RATE_LIMITED" }), /Zu viele Anfragen/);
  assert.equal(mapLabelError(200, { code: "LABEL_DOWNLOAD_FAILED" }), LABEL_TEXT_500);
});

test("3 — 4xx ohne Code: brauchbarer Alt-Backend-Text bleibt, Ein-Wort-Reste fallen durch", () => {
  assert.equal(
    mapLabelError(409, { error: "Label noch nicht verfügbar — Bestellnummer fehlt" }),
    "Label noch nicht verfügbar — Bestellnummer fehlt",
    "der kuratierte Alt-Text des Backends ist die beste Information",
  );
  assert.equal(mapLabelError(409, { error: "Fehler" }), LABEL_TEXT_NICHT_BEREIT, "Ein-Wort-Rest fällt auf den Statustext zurück");
});

test("4 — leerer/unlesbarer Body: sinnvoller Statustext statt Leere", () => {
  assert.equal(mapLabelError(409, null), LABEL_TEXT_NICHT_BEREIT);
  assert.match(mapLabelError(404, null), /noch nicht verfügbar/);
  assert.match(mapLabelError(429, null), /Zu viele Anfragen/);
  assert.equal(mapLabelError(500, null), LABEL_TEXT_500);
  const unbekannt = mapLabelError(418, null);
  assert.ok(unbekannt && unbekannt.length > 10);
});

test("5 — downloadLabel: kein blindes d.error mehr, PDF/JSON getrennt, Netz kuratiert", () => {
  const dl = strip(src("./downloadLabel.js"));
  assert.ok(!/if \(d\?\.error\) message = d\.error;/.test(dl), "die blinde Übernahme des Servertexts muss weg sein");
  assert.match(dl, /mapLabelError\(r\.status, body\)/);
  assert.match(dl, /content-type/, "eine JSON-/HTML-Antwort darf nie als PDF gespeichert werden");
  assert.match(dl, /application\/pdf/);
  assert.match(dl, /LABEL_TEXT_NETZ/, "Netzfehler brauchen den kuratierten Verbindungstext");
  assert.match(dl, /finally \{\s*URL\.revokeObjectURL\(url\);/, "Blob-URL wird auch im Fehlerfall freigegeben");
});

test("6 — Banner an beiden Kundenstellen sind Live-Regionen", () => {
  // Der Erfolgsbildschirm trägt seinen Labelfehler unverändert selbst. In der
  // Sendungsliste gibt es seit dem Dokumente-Drawer keinen eigenen Labeldownload
  // mehr — der Fehler eines Dokumentdownloads erscheint jetzt IM Drawer, und zwar
  // nach derselben Regel: eine Live-Region, kein stiller Text.
  const drawer = strip(src("../components/dashboard/ShipmentDocumentsDrawer.jsx"));
  // Der Labelfehler des Erfolgsbildschirms lebt seit der Modularisierung im
  // Erfolgsdokumente-Baustein (wortgleich aus der Buchungsseite gezogen).
  const booking = strip(src("../components/booking/BookingSuccessDocuments.jsx"));
  assert.match(drawer, /\{downloadError && \(\s*<div className="alert alert-error mb-16" role="alert">/);
  assert.match(booking, /\{labelError && <div className="alert alert-error mb-16" role="alert">/);
  // Und die Liste selbst zeigt keinen verwaisten Downloadfehler mehr an.
  const shipments = strip(src("../components/dashboard/ShipmentsList.jsx"));
  assert.ok(!/labelError/.test(shipments), "die Liste trägt wieder einen eigenen Labelfehler");
});
