// ─────────────────────────────────────────────────────────────────────────────
// Portaltarife 47 / 110 / 124 — FE/BE-Parität (Portal-Final-Closure, Phase 8).
//
// Die drei Fixtures unten sind die ÖFFENTLICHEN Angebote, wie der Backend-Mapper sie für die drei
// Portalservices erzeugt (echter Mapper + toPublicOffer, Lauf p8-public-offers 2026-09-25; nur öffentliche
// Felder, gekürzt auf das, was die Oberfläche liest). Geprüft wird, dass die Oberfläche JEDES Feld aus dem
// Server übernimmt und nichts selbst entscheidet:
//
//   Name · Carrier · Preis brutto/netto · Stückgrenze · Abholung/Abgabe · Paketshop · Abholtag ·
//   Buchbarkeit · Sperrgrund · Labelangaben · Belegnamen
//
// Keine ServiceID-Sonderlogik: die Fixtures tragen gar keine ServiceID (der öffentliche Vertrag kennt sie
// nicht), und die Governance darunter sucht jede Verzweigung an 47/110/124 im Produktionscode.
//
// Framework-frei (node --test), kein DOM. carrierMap.js wird wie in tg110GlsPortal.test.mjs assetlos geladen.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { handoverMode, handoverLabelForTariff, HANDOVER_PICKUP, HANDOVER_DROPOFF } from "./handoverMode.mjs";
import {
  offerBookable, offerSelectable, offerBlockedLabel, offerBlockedHint, offerAwaitsPriceInputs,
  OFFER_ADDRESS_DETAILS_TOO_LONG_REASON,
} from "./offerIdentity.mjs";
import { offerRequiresResidentialChoice } from "./residentialPriceInputs.mjs";
import { pickupContractOf } from "./pickupContractView.mjs";
import { labelDeliveryInfo } from "./labelFormatOptions.mjs";
import { labelCapabilityLine } from "./offerMetadataView.mjs";
import { offerRequiresDropoffParcelShop } from "./dropoffParcelShop.mjs";
import { bookingShippingDocuments, shippingDocumentButtonLabel, shippingDocumentFallbackFilename } from "./bookingShippingDocuments.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
async function ladeAssetlos(relPfad) {
  const abs = path.join(HIER, relPfad);
  const basis = pathToFileURL(path.dirname(abs) + path.sep).href;
  let src = readFileSync(abs, "utf8");
  src = src.replace(/import\s+([A-Za-z0-9_$]+)\s+from\s+["'][^"']+\.(?:svg|png|jpe?g|gif|webp|css)["'];?/g, "const $1 = \"$1\";");
  src = src.replace(/from\s+["'](\.\.?\/[^"']+)["']/g, (_m, p) => `from ${JSON.stringify(new URL(p, basis).href)}`);
  return import("data:text/javascript;base64," + Buffer.from(src, "utf8").toString("base64"));
}
const { offerSupportsAccessPointSearch, publicCarrierDisplay } = await ladeAssetlos("./carrierMap.js");

// ── Die Serverformen (p8-public-offers, passende Adressen) ─────────────────────
const GEMEINSAM = Object.freeze({
  currency: "EUR", collectionDateAdjusted: false, labelFormats: ["PDF"], labelSizes: [], labelFormatOptions: [],
  trackingAvailable: true, printerRequired: true, insuranceAvailable: false, pickupToday: false,
});
const TNT47 = Object.freeze({ ...GEMEINSAM, offerId: "offer-tnt", publicCarrierId: "tnt", publicServiceName: "Express 9:00",
  serviceType: "pickup", collectionDate: "2026-09-16", collectionReadyFrom: "09:00",
  netPrice: 41.51, vatAmount: 7.89, finalPrice: 49.4, bookable: false, unavailableReason: "price_inputs_required",
  requiredPriceInputs: ["deliveryIsResidential"], surchargeFreePriceInputs: ["deliveryIsResidential"], parcelShopSearch: null,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }] });
const GLS110 = Object.freeze({ ...GEMEINSAM, offerId: "offer-gls", publicCarrierId: "gls", publicServiceName: "Pick&Ship",
  serviceType: "pickup", collectionDate: "2026-09-16", collectionReadyFrom: "09:00",
  netPrice: 18.53, vatAmount: 3.52, finalPrice: 22.05, bookable: true, unavailableReason: null,
  requiredPriceInputs: [], surchargeFreePriceInputs: [], parcelShopSearch: null,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 2 }] });
const DPD124 = Object.freeze({ ...GEMEINSAM, offerId: "offer-dpd", publicCarrierId: "dpd", publicServiceName: "PaketShop",
  serviceType: "dropoff", collectionDate: null, collectionReadyFrom: null,
  netPrice: 6.08, vatAmount: 1.16, finalPrice: 7.24, bookable: false, unavailableReason: "price_inputs_required",
  requiredPriceInputs: ["deliveryIsResidential"], surchargeFreePriceInputs: ["deliveryIsResidential"], parcelShopSearch: "server",
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }] });
// Dieselben Angebote mit zu langem Namen (Schranke P des Servers) — nur der Grund ändert sich.
const zuLang = (t) => Object.freeze({ ...t, bookable: false, unavailableReason: OFFER_ADDRESS_DETAILS_TOO_LONG_REASON });

test("(pp1) Carrier und Name kommen vom Server — kein Einkaufsprovider, keine ServiceID", () => {
  for (const [t, carrier, name] of [[TNT47, "TNT", "Express 9:00"], [GLS110, "GLS", "Pick&Ship"], [DPD124, "DPD", "PaketShop"]]) {
    const d = publicCarrierDisplay(t);
    assert.equal(d.name, carrier);
    assert.equal(t.publicServiceName, name);
    assert.doesNotMatch(JSON.stringify(d) + JSON.stringify(t), /transglobal|jumingo|serviceId|providerServiceRef|\b(47|110|124)\b/i);
  }
});

test("(pp2) Abholung vs. Abgabe und Paketshop — nur aus `serviceType` und `parcelShopSearch`", () => {
  assert.equal(handoverMode(TNT47), HANDOVER_PICKUP);
  assert.equal(handoverMode(GLS110), HANDOVER_PICKUP);
  assert.equal(handoverMode(DPD124), HANDOVER_DROPOFF);
  assert.equal(handoverLabelForTariff(GLS110), "Abholung an Ihrer Adresse");
  assert.equal(offerSupportsAccessPointSearch(TNT47), false);
  assert.equal(offerSupportsAccessPointSearch(GLS110), false);
  assert.equal(offerSupportsAccessPointSearch(DPD124), true);
  // Paketshop-Pflicht nur für die Abgabe mit Serversuche — und nur, solange das Angebot auswählbar ist.
  assert.equal(offerRequiresDropoffParcelShop(DPD124, offerSupportsAccessPointSearch(DPD124)), true);
  assert.equal(offerRequiresDropoffParcelShop(zuLang(DPD124), offerSupportsAccessPointSearch(DPD124)), false);
  assert.equal(offerRequiresDropoffParcelShop(GLS110, offerSupportsAccessPointSearch(GLS110)), false);
});

test("(pp3) Abholtag und „bereit ab“ — der Tag des Angebots, bei der Abgabe keiner", () => {
  for (const t of [TNT47, GLS110]) {
    const v = pickupContractOf(t);
    assert.deepEqual([v.day, v.readyFrom, v.dayAdjusted], ["2026-09-16", "09:00", false]);
  }
  assert.equal(pickupContractOf(DPD124).day, null);
});

test("(pp4) Buchbarkeit und Auswahl: 110 direkt; 47/124 nach der Adressartwahl; zu lange Angaben sperren alle drei", () => {
  assert.deepEqual([offerBookable(GLS110), offerSelectable(GLS110), offerRequiresResidentialChoice(GLS110)], [true, true, false]);
  for (const t of [TNT47, DPD124]) {
    assert.deepEqual([offerBookable(t), offerSelectable(t), offerAwaitsPriceInputs(t), offerRequiresResidentialChoice(t)],
      [false, true, true, true], t.offerId);
  }
  for (const t of [TNT47, GLS110, DPD124].map(zuLang)) {
    assert.deepEqual([offerBookable(t), offerSelectable(t)], [false, false], t.offerId);
    assert.equal(offerBlockedLabel(t), "Für diese Adressangaben nicht verfügbar.");
    assert.equal(offerBlockedHint(t), "Bitte kürzen Sie Vor- und Nachname, Firmenname oder Adresszeilen von Absender oder Empfänger.");
  }
});

test("(pp5) Preis brutto/netto: die Serverbeträge, ohne Rechnung im Client", () => {
  for (const t of [TNT47, GLS110, DPD124]) {
    // Die Oberfläche addiert nichts: brutto = netto + MwSt. stimmt bereits in der Serverantwort.
    assert.equal(Math.round((t.netPrice + t.vatAmount) * 100), Math.round(t.finalPrice * 100), t.offerId);
  }
  assert.deepEqual([GLS110.finalPrice, GLS110.netPrice], [22.05, 18.53]);
});

test("(pp6) Stückgrenze nur aus `tariffLimits`: 110 = 2 (1 und 2 buchbar, 3 bietet der Server gar nicht an), 47/124 = 1", () => {
  const grenze = (t) => t.tariffLimits.find((l) => l.operant === "packages_count").value;
  assert.deepEqual([grenze(TNT47), grenze(GLS110), grenze(DPD124)], [1, 2, 1]);
  const karte = readFileSync(path.join(HIER, "../components/offers/OfferCard.jsx"), "utf8");
  assert.match(karte, /buildLimitLines\(t\.tariffLimits\)/);
});

test("(pp7) Labelangaben: nur das Format — keine Größe, die der Bestellweg nicht liefert", () => {
  for (const t of [TNT47, GLS110, DPD124]) {
    assert.equal(labelDeliveryInfo(t), null, `${t.offerId}: „verfügbar als …“ ohne Serverangabe`);
    assert.equal(labelCapabilityLine(t), "PDF", t.offerId);
  }
  // Gegenprobe: dieselbe Funktion nennt Größen, wenn der Server sie nennt — keine Portalweiche im Client.
  assert.equal(labelDeliveryInfo({ labelSizes: ["A4", "Thermal"] }), "Versandlabel verfügbar als DIN A4 und Thermodruck");
});

test("(pp8) Belegnamen und Dateiname kommen vom Server — „Versandlabel“ ohne A4, wenn der Server keine Größe nennt", () => {
  const buchung = { shippingDocuments: [
    { type: "LABEL", ordinal: 0, status: "ready", label: "Versandlabel", labelSize: null, carrierReference: "ZTEST0000124DE",
      downloadPath: "/api/shipments/22/provider-documents/LABEL/0" },
  ] };
  const [beleg] = bookingShippingDocuments(buchung);
  assert.equal(shippingDocumentButtonLabel(beleg), "Versandlabel herunterladen");
  assert.doesNotMatch(shippingDocumentFallbackFilename(beleg), /A4|A6|DIN/);
  assert.equal(beleg.carrierReference, "ZTEST0000124DE");
});
