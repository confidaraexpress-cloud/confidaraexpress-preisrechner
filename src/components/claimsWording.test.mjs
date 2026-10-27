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

// Die Anmelde-Vertrauensleiste (auth/TrustBar.jsx) ist seit G1 (2026-10-28) entfallen: die Anmeldung zeigt statt
// Kacheln die Botschaft, die Karte und den namentlichen Ansprechpartner. Geprüft werden deren Texte.
const DATEIEN = ["dashboard/Overview.jsx", "offers/OffersList.jsx", "../pages/AuthPage.jsx", "../utils/authSeitenText.mjs",
  "dashboard/OverviewModules.jsx", "../utils/carrierPortfolioView.mjs"];

test("1 — keine unbelegte Werbeaussage in Übersicht, Angebotsliste und Anmeldung", () => {
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
  // Die Anmeldung belegt „persönlich“ mit dem Ansprechpartner aus der Unternehmensquelle statt mit einer Kachel.
  assert.ok(!fs.existsSync(path.join(here, "auth/TrustBar.jsx")), "die Vertrauensleiste ist entfallen");
  assert.match(quelle("../pages/AuthPage.jsx"), /COMPANY_PROFILE\.contactPerson\}, Ihr persönlicher Ansprechpartner/);
  // Vier Einträge je Leiste bleiben (das Raster ist auf vier ausgelegt).
  assert.equal((offers.match(/\{ title: "/g) || []).length, 4);
});

test("3 — keine Aussage, nach der allein der Paketdienst haftet (Checkout und Versicherungsinformationen)", () => {
  // Der Kunde hat keinen Vertrag mit dem Paketdienst. Die Texte nennen die begrenzte gesetzliche und
  // vertragliche Haftung, ohne den Haftenden zu benennen — das regeln die AGB.
  for (const datei of ["../utils/insuranceTerms.mjs", "../utils/insuranceInfo.mjs"]) {
    const s = quelle(datei);
    assert.ok(!/allein die Haftungs- und Beförderungsbedingungen|Es gelten die Haftungs- und Beförderungsbedingungen des gewählten/.test(s), `${datei}: Paketdienst als allein Haftender`);
    assert.ok(!/gesetzliche Haftung des Versanddienstleisters/.test(s), `${datei}: Haftung dem Paketdienst zugeschrieben`);
  }
  assert.match(quelle("../utils/insuranceInfo.mjs"), /bleibt es bei der gesetzlichen und vertraglichen Haftung, die in der Regel der Höhe nach begrenzt ist/);
});
