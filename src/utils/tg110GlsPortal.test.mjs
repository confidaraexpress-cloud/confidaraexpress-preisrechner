// ─────────────────────────────────────────────────────────────────────────────
// TG110 GLS Pick&Ship (Portal-Buchungsadapter) — Frontend-Vertragstests.
//
// GLS-110 ist eine FAHRERABHOLUNG (serviceType "pickup"), Carrier GLS, DE→DE, ohne
// Paketshop und OHNE Adressartfrage (Backend priceInputs fixed_false → requiredPriceInputs
// leer). Sie laeuft deshalb durch dieselbe serverseitig gesteuerte DIRECT_PICKUP-UI wie
// UPS 22/23/26 — es gibt bewusst KEINE ServiceID-110-Sonderlogik im Produktionscode.
//
// Diese Suite haelt die Metadatenbindung fest: Uebergabeart, kein Paketshop-Finder, GLS-
// Carrieranzeige ohne Providernamen, keine Adressartfrage, Buchbarkeit und den neuen
// Backendcode COLLECTION_SLOT_REQUIRED. Zusaetzlich ein TG124-Dropoff-Gegenbeispiel
// (Regression: der Paketshop-Finder bleibt fuer die Abgabe erhalten).
//
// Framework-frei (node --test), kein DOM. carrierMap.js importiert SVG-Assets, die Node
// nicht aufloesen kann; es wird deshalb — wie in carrierMap.test.mjs — assetlos neu
// ausgewertet (SVG-Importe durch Marker ersetzt, relative Importe absolut), sodass die
// ECHTEN Funktionen laufen statt eines Spiegels.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { handoverMode, handoverLabelForTariff, HANDOVER_PICKUP } from "./handoverMode.mjs";
import { offerRequiresResidentialChoice } from "./residentialPriceInputs.mjs";
import { offerBookable, offerSelectable } from "./offerIdentity.mjs";
import { mapBookRestError, fordertNeuberechnung, BOOK_FEHLER } from "./bookingErrors.mjs";

// ── carrierMap.js assetlos laden (SVG-Importe → Marker, relative Importe → absolut) ──
const HIER = path.dirname(fileURLToPath(import.meta.url));
async function ladeAssetlos(relPfad) {
  const abs = path.join(HIER, relPfad);
  const basis = pathToFileURL(path.dirname(abs) + path.sep).href;
  let src = readFileSync(abs, "utf8");
  // Asset-Importe (SVG etc.) durch gleichnamige Markerkonstanten ersetzen — die Logofelder
  // werden dann zu einem wahrheitswertigen Marker-String (fuer `assert.ok(logo)` ausreichend).
  src = src.replace(/import\s+([A-Za-z0-9_$]+)\s+from\s+["'][^"']+\.(?:svg|png|jpe?g|gif|webp|css)["'];?/g, "const $1 = \"$1\";");
  // Relative Importe absolut machen, damit die data:-URL sie aufloesen kann.
  src = src.replace(/from\s+["'](\.\.?\/[^"']+)["']/g, (_m, p) => `from ${JSON.stringify(new URL(p, basis).href)}`);
  const datenUrl = "data:text/javascript;base64," + Buffer.from(src, "utf8").toString("base64");
  return import(datenUrl);
}
const { offerSupportsAccessPointSearch, publicCarrierDisplay, publicDropoffLabel, resolveAccessPointCarrierCode } =
  await ladeAssetlos("./carrierMap.js");

// So sieht ein GLS-110-Angebot aus der publicOffer-Antwort aus (nur oeffentliche Felder;
// KEIN Provider, KEINE ServiceID, KEINE QuoteID).
const GLS110 = Object.freeze({
  offerId: "gls110-offer-abc",
  publicCarrierId: "gls",
  publicCarrierName: "GLS",
  publicServiceName: "Pick&Ship",
  serviceType: "pickup",
  collectionDate: "2026-09-22",
  collectionReadyFrom: "09:00",
  bookable: true,
  requiredPriceInputs: [],   // fixed_false/fixed_false → keine Adressartfrage
  parcelShopSearch: null,    // Pickup: nie eine Paketshop-Suchquelle
  finalPrice: 18.37,
  netPrice: 15.44,
  currency: "EUR",
});

// Gegenbeispiel: ein TG124-DPD-PaketShop-ABGABE-Angebot (serviceType "dropoff").
const TG124 = Object.freeze({
  offerId: "dpd124-offer-xyz",
  publicCarrierId: "dpd",
  serviceType: "dropoff",
  accessPoint: { provider: "dpd" },
  parcelShopSearch: "server",
  bookable: true,
});

test("(gls1) GLS-110 ist eine Fahrerabholung, kein Dropoff", () => {
  assert.equal(handoverMode(GLS110), HANDOVER_PICKUP);
  assert.equal(handoverLabelForTariff(GLS110), "Abholung an Ihrer Adresse");
});

test("(gls2) GLS-110 bietet KEINEN Paketshop-Finder (Pickup)", () => {
  assert.equal(offerSupportsAccessPointSearch(GLS110), false);
  assert.equal(publicDropoffLabel(GLS110), null);
  // TG124 (Abgabe) behaelt seinen Finder — Regression: unveraendert.
  assert.equal(offerSupportsAccessPointSearch(TG124), true);
  assert.equal(resolveAccessPointCarrierCode(TG124), "dpd");
});

test("(gls3) Carrieranzeige ist GLS mit Logo — nie ein Providername", () => {
  const d = publicCarrierDisplay(GLS110);
  assert.equal(d.name, "GLS");
  assert.ok(d.logo, "GLS-Logo muss aufgeloest werden");
  // Kein Einkaufsprovider im sichtbaren Text.
  assert.doesNotMatch(JSON.stringify(d), /transglobal/i);
});

test("(gls4) GLS-110 fragt KEINE Adressart (requiredPriceInputs leer, fixed_false)", () => {
  assert.equal(offerRequiresResidentialChoice(GLS110), false);
});

test("(gls5) GLS-110 ist buchbar und auswaehlbar (bookable:true)", () => {
  assert.equal(offerBookable(GLS110), true);
  assert.equal(offerSelectable(GLS110), true);
});

// Kommentarfrei messen: eine Begründung, die „110“ nennt, ist kein Programm.
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("(gls7) die Stückgrenze der 110 (Server: höchstens 2) kommt ausschließlich aus `tariffLimits` — keine Zahl, keine ServiceID im Code", () => {
  // Die Karte formuliert die Einschränkung aus dem Serverfeld — für jedes Angebot gleich.
  const karte = ohneKommentare(readFileSync(path.join(HIER, "../components/offers/OfferCard.jsx"), "utf8"));
  assert.match(karte, /buildLimitLines\(t\.tariffLimits\)/);
  // Kein Produktionsmodul kennt die kuratierte Grenze oder verzweigt an einer Portal-ServiceID (47, 110, 124).
  const WURZEL = path.join(HIER, "..");
  const dateien = [];
  const lauf = (rel) => {
    for (const e of readdirSync(path.join(WURZEL, rel), { withFileTypes: true })) {
      const p = path.join(rel, e.name);
      if (e.isDirectory()) { lauf(p); continue; }
      if (/\.(jsx|js|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) dateien.push(p);
    }
  };
  lauf(".");
  assert.ok(dateien.length > 50, `zu wenige Dateien: ${dateien.length}`);
  const ID = "(?:providerServiceRef|provider_service_id|serviceId|serviceID|ServiceID)";
  const weiche = new RegExp(`\\b${ID}\\b\\s*(?:===?|!==?)\\s*["'\`]?(?:47|110|124)\\b|["'\`]?\\b(?:47|110|124)\\b["'\`]?\\s*(?:===?|!==?)\\s*[\\w.]*\\b${ID}\\b`);
  for (const datei of dateien) {
    const quelle = ohneKommentare(readFileSync(path.join(WURZEL, datei), "utf8"));
    assert.ok(!weiche.test(quelle), `${datei} verzweigt an einer Portal-ServiceID`);
    assert.ok(!/\bmaxPackages\b/.test(quelle), `${datei} kennt die kuratierte Stückgrenze`);
  }
});

test("(gls6) COLLECTION_SLOT_REQUIRED → neu berechnen, nichts beauftragt", () => {
  const fehler = mapBookRestError(409, { code: "COLLECTION_SLOT_REQUIRED" });
  assert.equal(fehler, BOOK_FEHLER.NEU_BERECHNEN);
  assert.equal(fehler.retryable, false);
  assert.equal(fordertNeuberechnung({ code: "COLLECTION_SLOT_REQUIRED" }), true);
  // Kein roher Backendcode im sichtbaren Text.
  assert.doesNotMatch(fehler.title + " " + fehler.message, /COLLECTION_SLOT_REQUIRED|transglobal|110/i);
});
