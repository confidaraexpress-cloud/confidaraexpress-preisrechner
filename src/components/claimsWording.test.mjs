// Go-Live (Paket E): kundensichtbare Werbeaussagen nur mit Systembeleg.
//
// Ersetzt wurden Aussagen, für die es weder in den AGB noch im System eine Grundlage gab:
// „Tiefpreisgarantie" (keine Preisgarantie), „DSGVO-konform" (Konformitätsbehauptung ohne
// Nachweis), „in Echtzeit"/„Echtzeit-Transparenz" (der Status wird beim Carrier abgefragt),
// „Nachhaltige Optionen – Umweltfreundliche Versandwege" (keine solche Funktion) und
// „jederzeit erreichbar" (kein Rund-um-die-Uhr-Support). Die AGB-Seite ist ein Rechtstext
// und bleibt hier bewusst außen vor.
// Ausführen: node --test src/components/claimsWording.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const quelle = (p) => ohneKommentare(fs.readFileSync(path.join(here, p), "utf8"));
const VERBOTEN = /garantier|Tiefpreis|DSGVO-konform|Echtzeit|Nachhaltig|umweltfreundlich|klimaneutral|jederzeit erreichbar|rund um die Uhr|24\/7/i;

const DATEIEN = ["dashboard/Overview.jsx", "offers/OffersList.jsx", "auth/TrustBar.jsx"];

test("1 — keine unbelegte Werbeaussage in Übersicht, Angebotsliste und Anmelde-Vertrauensleiste", () => {
  for (const d of DATEIEN) {
    const treffer = quelle(d).split("\n").filter((z) => VERBOTEN.test(z));
    assert.deepEqual(treffer, [], `${d}: ${treffer.join(" | ")}`);
  }
});

test("2 — die Ersatzaussagen beschreiben vorhandene Funktionen", () => {
  const offers = quelle("offers/OffersList.jsx");
  assert.match(offers, /title: "Abholung oder Abgabe",\s+desc: "Je nach Tarif mit Abholung oder Abgabe im Paketshop"/);
  assert.match(offers, /desc: "SSL-verschlüsselte Übertragung"/);
  assert.match(offers, /title: "Persönlicher Support",\s+desc: "Per E-Mail und Telefon"/);
  // Dieselbe Supportaussage wie auf der Anmeldeseite — keine zweite, weiter gehende Fassung.
  assert.match(quelle("auth/TrustBar.jsx"), /title: "Persönlicher Support",\s+sub: "Per E-Mail & Telefon"/);
  assert.match(quelle("auth/TrustBar.jsx"), /title: "Sendungsverfolgung",\s+sub: "Status direkt im Konto"/);
  // Vier Einträge je Leiste bleiben (das Raster ist auf vier ausgelegt).
  assert.equal((offers.match(/\{ title: "/g) || []).length, 4);
});
