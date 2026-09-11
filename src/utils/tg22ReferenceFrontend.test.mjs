/* TG-22 — der erste buchbare Referenzservice im Frontend.
   =============================================================================
   Das Frontend bekommt KEINEN Providerzweig. Geprüft wird, dass die gemeinsamen Flächen die
   Angebots-, Beleg- und Sendungsform tragen, die der Server für diesen Service liefert:

     1. Gutscheinfeld nur, wo ein Code überhaupt geprüft werden kann (Tarifkennung vorhanden)
     2. Formatvarianten eines Versandlabels (A4 / Thermodruck): vom Server benannt, nie gezählt
     3. der gebuchte Servicename in „Meine Sendungen"
     4. Einschränkung „max. 1 Packstück" grammatisch korrekt

   Das gerenderte Verhalten prüft tests/e2e/tg22ReferenceFlow.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { voucherAvailableFor } from "./voucherView.mjs";
import {
  documentLabelSize, documentFallbackFilename, groupShipmentDocuments, documentLabel, LABEL_SIZES,
} from "./shipmentDocumentsView.mjs";
import {
  bookingShippingDocuments, shippingDocumentButtonLabel, shippingDocumentFallbackFilename,
} from "./bookingShippingDocuments.mjs";
import { shipmentServiceNameOf, SHIPMENT_SERVICE_LABEL } from "./shipmentServiceNameView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

/* ═════════ 1 — Gutscheinfeld ═════════ */

test("1 — ein Angebot mit Tarifkennung behält das Gutscheinfeld", () => {
  assert.equal(voucherAvailableFor({ id: 1, shipper_tariff_id: 1 }), true);
  assert.equal(voucherAvailableFor({ shipper_tariff_id: 3301 }), true);
  assert.equal(voucherAvailableFor({ id: "t_7" }), true);
  assert.equal(voucherAvailableFor({ id: 0 }), true, "0 ist eine gültige Zahl, kein Fehlen");
});

test("2 — ein Angebot ohne Tarifkennung bekommt kein Feld, das nie funktionieren kann", () => {
  for (const t of [null, undefined, {}, { offerId: "a".repeat(32) },
                   { offerId: "a".repeat(32), id: null, shipper_tariff_id: undefined },
                   { id: "", shipper_tariff_id: "   " }, { id: Number.NaN }]) {
    assert.equal(voucherAvailableFor(t), false, JSON.stringify(t));
  }
});

test("3 — die Buchungsseite rendert das Gutscheinfeld nur hinter dieser Prüfung", () => {
  const seite = ohneKommentare(lies("../pages/BookingPage.jsx"));
  assert.ok(seite.includes("const voucherVerfuegbar = voucherAvailableFor(tariff);"));
  assert.ok(/\{voucherVerfuegbar && \(\s*<VoucherModule/.test(seite), "das Feld steht ohne Prüfung da");
  assert.equal((seite.match(/<VoucherModule/g) || []).length, 1, "ein zweites, ungeprüftes Gutscheinfeld");
  // Keine Herkunftsfrage — entschieden wird an der Form des Angebots.
  assert.ok(!/voucherAvailableFor\([^)]*provider/.test(seite));
  const view = ohneKommentare(lies("./voucherView.mjs"));
  const helfer = view.slice(view.indexOf("export function voucherAvailableFor"));
  assert.ok(!/provider|transglobal|jumingo/i.test(helfer.slice(0, helfer.indexOf("}") + 1)));
});

/* ═════════ 2 — Formatvarianten eines Versandlabels ═════════ */

const PFAD = (ordinal) => `/api/shipments/4711/provider-documents/LABEL/${ordinal}`;
const FORMATPAAR = [
  { type: "LABEL", category: "SHIPPING", status: "ready", label: "Versandlabel (Thermodruck)", ordinal: 1,
    downloadPath: PFAD(1), carrierReference: "1Z999AA10000000001", labelSize: "THERMAL" },
  { type: "LABEL", category: "SHIPPING", status: "ready", label: "Versandlabel (A4)", ordinal: 0,
    downloadPath: PFAD(0), carrierReference: "1Z999AA10000000001", labelSize: "A4" },
];

test("4 — das Format ist ein geschlossener Wert; alles andere gilt als nicht angegeben", () => {
  assert.deepEqual([...LABEL_SIZES], ["A4", "THERMAL"]);
  assert.equal(documentLabelSize({ labelSize: "A4" }), "A4");
  assert.equal(documentLabelSize({ labelSize: " thermal " }), "THERMAL");
  for (const kaputt of [undefined, null, "", "A6", "Thermal Label", 4, {}]) {
    assert.equal(documentLabelSize({ labelSize: kaputt }), null, `angenommen: ${String(kaputt)}`);
  }
  assert.equal(documentLabelSize(null), null);
});

test("5 — Erfolgsbildschirm: zwei Knöpfe mit dem Servernamen, keine Zählung, A4 zuerst", () => {
  const docs = bookingShippingDocuments({ ceShipmentId: 4711, shippingDocuments: FORMATPAAR });
  assert.deepEqual(docs.map((d) => [d.label, d.labelSize, d.downloadPath]), [
    ["Versandlabel (A4)", "A4", PFAD(0)],
    ["Versandlabel (Thermodruck)", "THERMAL", PFAD(1)],
  ]);
  assert.deepEqual(docs.map(shippingDocumentButtonLabel),
    ["Versandlabel (A4) herunterladen", "Versandlabel (Thermodruck) herunterladen"]);
  for (const d of docs) {
    assert.ok(!/\bvon\b/.test(shippingDocumentButtonLabel(d)), "eine Formatvariante wird als Stück gezählt");
  }
  // Rückfalldateiname: das Format, nicht die Ordnungszahl — und nie ein Anbieter.
  assert.deepEqual(docs.map(shippingDocumentFallbackFilename), ["versandlabel-a4.pdf", "versandlabel-thermodruck.pdf"]);
});

test("6 — Dokumentübersicht: dieselben zwei Zeilen mit Servernamen", () => {
  const g = groupShipmentDocuments({ documents: FORMATPAAR });
  assert.deepEqual(g[0].documents.map(documentLabel), ["Versandlabel (A4)", "Versandlabel (Thermodruck)"]);
});

test("7 — ohne Formatangabe bleibt der bisherige Rückfallname (Mehrstücksendung unverändert)", () => {
  assert.equal(documentFallbackFilename("LABEL", 1), "versandlabel-2.pdf");
  assert.equal(documentFallbackFilename("LABEL", 1, null), "versandlabel-2.pdf");
  assert.equal(documentFallbackFilename("LABEL", 1, "A6"), "versandlabel-2.pdf");
  assert.equal(documentFallbackFilename("LABEL", 0, "A4"), "versandlabel-a4.pdf");
  // Das Format gilt nur für Versandlabels — ein Abholetikett bleibt, wie es war.
  assert.equal(documentFallbackFilename("COLLECTION_LABEL", 0, "A4"), "abholetikett-1.pdf");
  assert.equal(documentFallbackFilename("IRGENDWAS", 0, "A4"), "dokument.pdf");
  // Kein geerbter Schlüssel wird als Format akzeptiert.
  assert.equal(documentFallbackFilename("LABEL", 0, "constructor"), "versandlabel-1.pdf");
});

/* ═════════ 3 — Servicename in „Meine Sendungen" ═════════ */

test("8 — der gebuchte Servicename kommt unverändert vom Server; fehlt er, entsteht keine Zeile", () => {
  assert.equal(shipmentServiceNameOf({ applied_tariff_display_name: " Standard " }), "Standard");
  for (const s of [null, undefined, {}, { applied_tariff_display_name: null },
                   { applied_tariff_display_name: "" }, { applied_tariff_display_name: "   " },
                   { applied_tariff_display_name: 42 }, { applied_tariff_display_name: "x".repeat(81) }]) {
    assert.equal(shipmentServiceNameOf(s), null, JSON.stringify(s));
  }
  assert.equal(SHIPMENT_SERVICE_LABEL, "Service");
});

test("9 — Tabelle und mobile Karte zeigen den Namen nur, wenn er da ist", () => {
  const liste = ohneKommentare(lies("../components/dashboard/ShipmentsList.jsx"));
  const vorkommen = liste.match(/\{shipmentServiceNameOf\(s\) && \(/g) || [];
  assert.equal(vorkommen.length, 2, "Servicename nicht in Detailzeile UND mobiler Karte");
  assert.ok(!/applied_tariff_display_name/.test(liste), "die Liste liest das Rohfeld selbst");
});

/* ═════════ 4 — Einschränkungen ═════════ */

test("10 — „max. 1 Packstück“ ist Einzahl, mehrere bleiben Mehrzahl", () => {
  const karte = lies("../components/offers/OfferCard.jsx");
  assert.ok(karte.includes("kann ${op} ${v} Packstück pro Sendung"), "Einzahl fehlt");
  assert.ok(karte.includes("können ${op} ${v} Packstücke pro Sendung"), "Mehrzahl fehlt");
});

/* ═════════ 5 — White Label ═════════ */

test("11 — keine der neuen Flächen nennt eine Einkaufsquelle", () => {
  for (const datei of ["./voucherView.mjs", "./shipmentServiceNameView.mjs", "./pickupContractView.mjs",
                       "./shipmentDocumentsView.mjs", "./bookingShippingDocuments.mjs"]) {
    const code = ohneKommentare(lies(datei));
    assert.ok(!/transglobal|provider\s*===/i.test(code), `${datei} kennt einen Anbieter`);
  }
});
