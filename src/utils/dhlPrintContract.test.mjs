// ─────────────────────────────────────────────────────────────────────────────
// Der Druckvertrag mehrseitiger Versandbelege — Frontendseite.
//
// Anlass ist eine gemessene Buchung: eine DHL-Labeldatei enthielt zwei Paketetiketten UND
// ein Dokument, das der Carrier selbst mit „Not to be attached to package - Hand to Courier"
// überschreibt. Der Erfolgsbildschirm und die Dokumentübersicht sagten dazu nichts.
//
// Die Regel dieser Suite: das Frontend FORMULIERT den Hinweis nicht und ENTSCHEIDET nicht,
// wann er gilt. Es zeigt, was der Server schickt — sonst nichts. Ein Client, der aus der
// Zahl der Belege oder der Pakete auf Seiten schlösse, würde genau die Verallgemeinerung
// treffen, die die Evidenz verbietet (UPS liefert zwei Pakete auf zwei Seiten ohne
// Begleitdokument).
// ─────────────────────────────────────────────────────────────────────────────
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bookingShippingPrintNotice, bookingShippingDocuments } from "./bookingShippingDocuments.mjs";
import { shipmentDocumentsPrintNotice, groupShipmentDocuments } from "./shipmentDocumentsView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => fs.readFileSync(path.join(HIER, "..", rel), "utf8");
const ohneKommentare = (q) => q
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

const HINWEIS = "Dieses Dokument umfasst mehrere Seiten. Bitte folgen Sie den Hinweisen, die der Carrier "
  + "auf den einzelnen Seiten abdruckt: Nicht jede Seite gehört auf ein Paket — manche Carrier legen ein "
  + "Begleitdokument bei, das dem Fahrer bei der Abholung auszuhändigen ist.";

/* ══════════ Buchungsantwort ═══════════════════════════════════════════════ */

test("bookingShippingPrintNotice reicht den Serversatz wörtlich durch", () => {
  assert.equal(bookingShippingPrintNotice({ shippingPrintNotice: HINWEIS }), HINWEIS);
  assert.equal(bookingShippingPrintNotice({ shippingPrintNotice: `  ${HINWEIS}  ` }), HINWEIS);
});

test("ohne brauchbare Serverangabe entsteht kein Hinweis — nichts wird erfunden", () => {
  for (const wert of [null, undefined, "", "   ", 3, true, {}, [], () => {}]) {
    assert.equal(bookingShippingPrintNotice({ shippingPrintNotice: wert }), null, JSON.stringify(wert) ?? "fn");
  }
  assert.equal(bookingShippingPrintNotice({}), null);
  assert.equal(bookingShippingPrintNotice(null), null);
  assert.equal(bookingShippingPrintNotice(undefined), null);
});

test("der Hinweis hängt NICHT an der Zahl der Belege — beide Richtungen geprüft", () => {
  const beleg = (ordinal, label) => ({
    type: "LABEL", status: "ready", ordinal, label,
    downloadPath: `/api/shipments/1/provider-documents/LABEL/${ordinal}`,
  });
  // Vier Belege, aber kein Serversatz → keine Zeile.
  const viele = {
    shippingDocuments: [beleg(0, "Versandlabel 1 von 2 (A4)"), beleg(1, "Versandlabel 1 von 2 (Thermodruck)"),
      beleg(2, "Versandlabel 2 von 2 (A4)"), beleg(3, "Versandlabel 2 von 2 (Thermodruck)")],
  };
  assert.equal(bookingShippingDocuments(viele).length, 4);
  assert.equal(bookingShippingPrintNotice(viele), null);
  // EIN Beleg, aber ein Serversatz → Zeile.
  const einer = { shippingDocuments: [beleg(0, "Versandlabel (A4)")], shippingPrintNotice: HINWEIS };
  assert.equal(bookingShippingDocuments(einer).length, 1);
  assert.equal(bookingShippingPrintNotice(einer), HINWEIS);
});

/* ══════════ Dokumentübersicht ═════════════════════════════════════════════ */

test("shipmentDocumentsPrintNotice liest ausschließlich printNotice der Antwort", () => {
  assert.equal(shipmentDocumentsPrintNotice({ printNotice: HINWEIS }), HINWEIS);
  assert.equal(shipmentDocumentsPrintNotice({ printNotice: "" }), null);
  assert.equal(shipmentDocumentsPrintNotice({ documents: [] }), null);
  assert.equal(shipmentDocumentsPrintNotice(null), null);
  // Die Gruppierung bleibt davon unberührt.
  const body = {
    printNotice: HINWEIS,
    documents: [{ type: "LABEL", category: "SHIPPING", status: "ready", label: "Versandlabel (A4)", ordinal: 0,
      downloadPath: "/api/shipments/1/provider-documents/LABEL/0" }],
  };
  const gruppen = groupShipmentDocuments(body);
  assert.equal(gruppen.length, 1);
  assert.equal(gruppen[0].key, "SHIPPING");
  assert.equal(gruppen[0].documents.length, 1);
});

/* ══════════ Quelltextanker ════════════════════════════════════════════════ */

test("der Erfolgsbildschirm zeigt den Serversatz und bildet ihn nicht selbst", () => {
  const q = ohneKommentare(lies("components/booking/BookingSuccessDocuments.jsx"));
  assert.match(q, /const druckhinweis = bookingShippingPrintNotice\(booking\)/,
    "der Erfolgsbildschirm liest den Hinweis nicht vom Server");
  assert.match(q, /\{druckhinweis && \(/, "der Hinweis wird nicht bedingt gerendert");
  // Kein eigener Satz im JSX, kein Ableiten aus Zahlen.
  for (const spur of ["Seite", "Paket", "Waybill", "Fahrer", "Begleitdokument", "packageCount"]) {
    assert.ok(!q.includes(spur), `„${spur}" steht im Erfolgsbildschirm statt beim Server`);
  }
});

test("die Dokumentübersicht zeigt den Satz bei den Versandbelegen — ohne eigene Formulierung", () => {
  const q = ohneKommentare(lies("components/dashboard/ShipmentDocumentsDrawer.jsx"));
  assert.match(q, /shipmentDocumentsPrintNotice\(d\)/, "der Drawer liest den Hinweis nicht vom Server");
  assert.match(q, /\{printNotice && gruppe\.key === "SHIPPING" && \(/,
    "der Hinweis steht nicht bei den Versandbelegen");
  for (const spur of ["Seite", "Waybill", "Fahrer", "Begleitdokument"]) {
    assert.ok(!q.includes(spur), `„${spur}" steht im Drawer statt beim Server`);
  }
});

test("kein Frontendmodul buchstabiert den Hinweistext oder eine Seitenregel nach", () => {
  for (const datei of ["utils/bookingShippingDocuments.mjs", "utils/shipmentDocumentsView.mjs"]) {
    const q = ohneKommentare(lies(datei));
    for (const spur of ["Begleitdokument", "Waybill", "Fahrer", "pageCount", "page_count", "packageCount"]) {
      assert.ok(!q.includes(spur), `„${spur}" in ${datei} — das Frontend leitet den Hinweis ab`);
    }
  }
});

test("die Belegnamen bleiben unverändert — es wird nichts umbenannt", () => {
  const q = lies("utils/shipmentDocumentsView.mjs");
  assert.match(q, /LABEL: "Versandlabel"/, "der Rückfallname des Versandlabels wurde geändert");
  assert.match(q, /COLLECTION_LABEL: "Abholetikett"/, "der Rückfallname des Abholetiketts wurde geändert");
  assert.ok(!q.includes("Versandunterlagen"), "ein neuer Belegname ist eingeführt worden");
});
