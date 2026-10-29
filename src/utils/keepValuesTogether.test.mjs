// Premium-Redesign Etappe 1, Umbruchregeln B9: Werte brechen nie mitten im Wert um, der Text bleibt gleich.
import { test } from "node:test";
import assert from "node:assert/strict";
import { valueSegments } from "./keepValuesTogether.mjs";

const werte = (t) => valueSegments(t).filter((s) => s.wert).map((s) => s.text);
const zusammen = (t) => valueSegments(t).map((s) => s.text).join("");

const PROBEN = [
  "bereit ab 09:00 Uhr",
  "Lieferung bis 12:00 Uhr",
  "Abholung 09:00–17:00 Uhr",
  "DE 70173 Stuttgart → DE 10115 Berlin · 2 Pakete · je 5,5 kg · 30 × 20 × 10 cm",
  "Frage zu Sendung CE-AB26-00041",
  "Mo., 26.10. – Di., 27.10.",
  "Auftragsbestätigung CE-AB26-00047 herunterladen",
  "AGB (Stand 2026-08)",
  "zzgl. 19 % MwSt.",
  "1–2 Tage",
  "Ihre E-Mail-Adresse",
  "Tracking-Link an weitere E-Mail-Adresse senden",
];

test("1 — zusammengesetzt ergibt sich Zeichen für Zeichen der Ausgangstext", () => {
  for (const t of PROBEN) assert.equal(zusammen(t), t);
});

test("2 — Uhrzeiten mit Einheit und Zeitspannen sind je ein Wert", () => {
  assert.deepEqual(werte("bereit ab 09:00 Uhr"), ["09:00 Uhr"]);
  assert.deepEqual(werte("Lieferung bis 12:00 Uhr"), ["12:00 Uhr"]);
  assert.deepEqual(werte("Abholung 09:00–17:00 Uhr"), ["09:00–17:00 Uhr"]);
});

test("3 — Maße, Gewichte, Postleitzahlen mit Land und Prozente", () => {
  assert.deepEqual(werte("DE 70173 Stuttgart → DE 10115 Berlin · 2 Pakete · je 5,5 kg · 30 × 20 × 10 cm"),
    ["DE 70173", "DE 10115", "5,5 kg", "30 × 20 × 10 cm"]);
  assert.deepEqual(werte("zzgl. 19 % MwSt."), ["19 %"]);
});

test("4 — Vorgangsnummern und ISO-Monate als Einheit, nicht am Bindestrich", () => {
  assert.deepEqual(werte("Frage zu Sendung CE-AB26-00041"), ["CE-AB26-00041"]);
  assert.deepEqual(werte("Wareneingang WE-2026-0412"), ["WE-2026-0412"]);
  assert.deepEqual(werte("AGB (Stand 2026-08)"), ["2026-08"]);
});

test("4a — Kennungen beliebiger Länge mit Ziffer bleiben ganz: Artikel-, Auftrags- und Referenznummern", () => {
  assert.deepEqual(werte("SKU: ML-ELEKTRONIK-2026-000101"), ["ML-ELEKTRONIK-2026-000101"]);
  assert.deepEqual(werte("Auftrag CE-AU-2026-000007"), ["CE-AU-2026-000007"]);
  assert.deepEqual(werte("Ohne Vorgangsnummer · CE-AB-2026-000050"), ["CE-AB-2026-000050"]);
  assert.deepEqual(werte("Kundenreferenz WEB-4471"), ["WEB-4471"]);
  // Ohne Ziffer ist es ein Wort mit Bindestrich, keine Kennung.
  assert.deepEqual(werte("Garmisch-Partenkirchen"), []);
});

test("4b — „E-Mail“ und seine Zusammensetzungen trennen nicht am Bindestrich", () => {
  assert.deepEqual(werte("Tracking-Link an weitere E-Mail-Adresse senden"), ["E-Mail-Adresse"]);
  assert.deepEqual(werte("Bestätigung per E-Mail an max@example.com"), ["E-Mail"]);
});

test("5 — ein Datumsbereich bricht nur nach dem Halbgeviertstrich", () => {
  assert.deepEqual(valueSegments("Mo., 26.10. – Di., 27.10."), [
    { text: "Mo., 26.10. –", wert: true }, { text: " ", wert: false }, { text: "Di., 27.10.", wert: true },
  ]);
  assert.deepEqual(werte("Zustellung am 27.10.2026"), ["27.10.2026"]);
});

test("6 — keine Treffer in gewöhnlichem Text, Servicenamen und Carrierbezeichnungen", () => {
  for (const t of ["Standardversand", "UPS · Express", "DHL Paket", "PDF-Erstellung fehlgeschlagen", "Neue Sendung",
    "Carrier-Angebote vergleichen", "TNT Express"]) {
    assert.deepEqual(werte(t), [], t);
  }
});

test("7 — leere und fremde Eingaben", () => {
  assert.deepEqual(valueSegments(""), []);
  assert.deepEqual(valueSegments(null), []);
  assert.deepEqual(valueSegments(42), []);
  assert.deepEqual(valueSegments("ohne Werte"), [{ text: "ohne Werte", wert: false }]);
});
