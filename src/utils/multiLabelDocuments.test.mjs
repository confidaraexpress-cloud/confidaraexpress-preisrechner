/* TG-F5 — Multi-Label- und Dokumentenparität im Frontend.
   =============================================================================
   Drei Zusagen:

     1. Jeder Versandbeleg, den der Server meldet, erscheint als eigene Zeile bzw. als
        eigener Knopf — mit eigenem, servergelieferten Downloadpfad. Nicht nur das erste.
     2. Die Oberfläche erfindet nichts: keine Paketnummer, keinen Pfad, keinen Namen.
     3. Dauerhaft ist die Dokumentübersicht der Sendung (API) die Quelle, nicht der
        Buchungszustand des Browsers.

   Das gerenderte Verhalten prüfen tests/e2e/shipmentDocumentsDrawer.test.mjs (I, J) und
   tests/e2e/multiLabelBookingSuccess.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DOC_STATUS, groupShipmentDocuments, documentViewState, documentDownloadPath, documentLabel,
  documentFallbackFilename, documentCarrierReference, documentOrdinal, documentIcon,
} from "./shipmentDocumentsView.mjs";
import {
  SHIPPING_DOCUMENT_TYPES, BOOKING_SHIPPING_DOCUMENTS_TEXT,
  bookingShippingDocuments, shippingDocumentButtonLabel, shippingDocumentLoadingLabel,
  shippingDocumentFallbackFilename,
} from "./bookingShippingDocuments.mjs";

// Zeilenenden zuerst vereinheitlichen: auf einem CRLF-Checkout liefe `.*$` sonst ins Leere.
const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// Kommentarfreier Quelltext — eine Begründung darf keine Zusicherung belegen.
const ohneKommentare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

const PFAD = (type, ordinal) => `/api/shipments/4711/provider-documents/${type}/${ordinal}`;
const beleg = (type, ordinal, label, extra = {}) => ({
  type, category: "SHIPPING", status: "ready", label, ordinal, downloadPath: PFAD(type, ordinal), ...extra,
});
// Bewusst UNSORTIERT, wie eine Antwort kommen könnte.
const MEHRPAKET = [
  { type: "ORDER_CONFIRMATION", category: "ORDER", status: "ready", label: "Auftragsbestätigung",
    number: "CE-AB-2026-000001", downloadPath: "/api/shipments/4711/order-confirmation" },
  beleg("COLLECTION_LABEL", 0, "Abholetikett", { carrierReference: "1Z999AA10000000004" }),
  beleg("LABEL", 2, "Versandlabel 3 von 3", { carrierReference: "1Z999AA10000000003" }),
  { type: "DELIVERY_NOTE", category: "SHIPPING", status: "ready", label: "Lieferschein",
    downloadPath: "/api/shipments/4711/delivery-note" },
  beleg("LABEL", 0, "Versandlabel 1 von 3", { carrierReference: "1Z999AA10000000001" }),
  beleg("LABEL", 1, "Versandlabel 2 von 3", { carrierReference: "1Z999AA10000000002" }),
];

/* ═════════ 1 — Dokumentübersicht ═════════ */

test("1 — drei Etiketten und ein Abholetikett: jedes eine Zeile, stabil geordnet, eigener Pfad", () => {
  const g = groupShipmentDocuments({ shipmentId: 4711, documents: MEHRPAKET });
  assert.equal(g[0].key, "SHIPPING");
  assert.deepEqual(g[0].documents.map((d) => [d.type, documentOrdinal(d)]), [
    ["LABEL", 0], ["LABEL", 1], ["LABEL", 2], ["COLLECTION_LABEL", 0], ["DELIVERY_NOTE", null],
  ]);
  // Dieselbe Antwort in anderer Reihenfolge ergibt dasselbe Bild.
  const gedreht = groupShipmentDocuments({ documents: [...MEHRPAKET].reverse() });
  assert.deepEqual(gedreht.map((x) => x.documents.map((d) => d.downloadPath)),
    g.map((x) => x.documents.map((d) => d.downloadPath)));
  // Jede Zeile ist einzeln ladbar — über ihren EIGENEN Pfad.
  const pfade = g[0].documents.map((d) => documentDownloadPath(d));
  assert.equal(new Set(pfade).size, pfade.length, "zwei Zeilen teilen sich einen Pfad");
  for (const d of g[0].documents) assert.equal(documentViewState(d), DOC_STATUS.READY);
});

test("2 — der Name kommt vom Server; die Oberfläche bildet keine Paketnummer", () => {
  const g = groupShipmentDocuments({ documents: MEHRPAKET });
  assert.deepEqual(g[0].documents.map(documentLabel),
    ["Versandlabel 1 von 3", "Versandlabel 2 von 3", "Versandlabel 3 von 3", "Abholetikett", "Lieferschein"]);
  assert.equal(documentLabel({ type: "COLLECTION_LABEL" }), "Abholetikett");
  assert.equal(documentLabel({ type: "LABEL", ordinal: 2 }), "Versandlabel",
    "aus der Ordnungszahl wurde eine Nummer gebildet");
  const quellen = ohneKommentare([
    "./shipmentDocumentsView.mjs", "./bookingShippingDocuments.mjs",
    "../components/dashboard/ShipmentDocumentsDrawer.jsx", "../components/booking/BookingSuccessDocuments.jsx",
  ].map(lies).join("\n"));
  assert.ok(!/Paket/.test(quellen), "eine Paketbeschriftung steht im Client");
  assert.ok(!/ von \$\{/.test(quellen), "„x von y“ wird im Client gebildet");
});

test("3 — fehlende oder unbrauchbare Ordnungszahl: keine erfundene Nummer, Serverreihenfolge bleibt", () => {
  for (const kaputt of [undefined, null, "1", -1, 1.5, Number.NaN]) {
    assert.equal(documentOrdinal({ ordinal: kaputt }), null, `angenommen: ${String(kaputt)}`);
  }
  assert.equal(documentOrdinal(null), null);
  const ohne = [
    { type: "LABEL", category: "SHIPPING", status: "ready", label: "B", downloadPath: "/api/b" },
    { type: "LABEL", category: "SHIPPING", status: "ready", label: "A", downloadPath: "/api/a" },
  ];
  assert.deepEqual(groupShipmentDocuments({ documents: ohne })[0].documents.map(documentLabel), ["B", "A"]);

  assert.equal(documentFallbackFilename("LABEL"), "versandlabel.pdf");
  assert.equal(documentFallbackFilename("LABEL", 0), "versandlabel-1.pdf");
  assert.equal(documentFallbackFilename("LABEL", 2), "versandlabel-3.pdf");
  assert.equal(documentFallbackFilename("COLLECTION_LABEL"), "abholetikett.pdf");
  assert.equal(documentFallbackFilename("COLLECTION_LABEL", 0), "abholetikett-1.pdf");
  for (const kaputt of ["1", -1, 1.5, null, undefined]) {
    assert.equal(documentFallbackFilename("LABEL", kaputt), "versandlabel.pdf");
  }
  assert.equal(documentFallbackFilename("IRGENDWAS", 1), "dokument.pdf");
});

test("4 — die Carrier-Sendungsnummer unterscheidet Etiketten, sonst nichts", () => {
  assert.equal(documentCarrierReference({ carrierReference: " 1Z999AA10000000001 " }), "1Z999AA10000000001");
  for (const kaputt of [undefined, null, "", "  ", "<b>1</b>", "a b", "X".repeat(41), 42, {}]) {
    assert.equal(documentCarrierReference({ carrierReference: kaputt }), null, `angenommen: ${String(kaputt)}`);
  }
  assert.equal(documentCarrierReference(null), null);
});

test("5 — eine Altsendung (ein Versandlabel über /label) bleibt, wie sie war", () => {
  const g = groupShipmentDocuments({ documents: [
    { type: "LABEL", category: "SHIPPING", status: "ready", label: "Versandlabel", downloadPath: "/api/shipments/7/label" },
  ] });
  assert.equal(g[0].documents.length, 1);
  const d = g[0].documents[0];
  assert.equal(documentLabel(d), "Versandlabel");
  assert.equal(documentDownloadPath(d), "/api/shipments/7/label");
  assert.equal(documentOrdinal(d), null);
  assert.equal(documentCarrierReference(d), null);
  assert.equal(documentFallbackFilename(d.type, documentOrdinal(d)), "versandlabel.pdf");
});

/* ═════════ 2 — Erfolgsbildschirm ═════════ */

test("6 — die Buchungsantwort liefert die Belege: geprüft, sortiert, je einer ein Knopf", () => {
  const booking = { ceShipmentId: 4711,
    shippingDocuments: MEHRPAKET.filter((d) => d.type === "LABEL" || d.type === "COLLECTION_LABEL") };
  const docs = bookingShippingDocuments(booking);
  assert.deepEqual(docs.map((d) => [d.type, d.ordinal, d.label, d.downloadPath, d.carrierReference]), [
    ["LABEL", 0, "Versandlabel 1 von 3", PFAD("LABEL", 0), "1Z999AA10000000001"],
    ["LABEL", 1, "Versandlabel 2 von 3", PFAD("LABEL", 1), "1Z999AA10000000002"],
    ["LABEL", 2, "Versandlabel 3 von 3", PFAD("LABEL", 2), "1Z999AA10000000003"],
    ["COLLECTION_LABEL", 0, "Abholetikett", PFAD("COLLECTION_LABEL", 0), "1Z999AA10000000004"],
  ]);
  assert.deepEqual(docs.map(shippingDocumentButtonLabel), [
    "Versandlabel 1 von 3 herunterladen", "Versandlabel 2 von 3 herunterladen",
    "Versandlabel 3 von 3 herunterladen", "Abholetikett herunterladen",
  ]);
  assert.deepEqual(docs.map(shippingDocumentFallbackFilename),
    ["versandlabel-1.pdf", "versandlabel-2.pdf", "versandlabel-3.pdf", "abholetikett-1.pdf"]);
  for (const d of docs) {
    for (const t of [shippingDocumentButtonLabel(d), shippingDocumentLoadingLabel(d)]) {
      assert.ok(!/undefined|null/.test(t), `leerer Wert im Knopftext: ${t}`);
    }
  }
  assert.deepEqual([...SHIPPING_DOCUMENT_TYPES], ["LABEL", "COLLECTION_LABEL"]);
});

test("7 — ohne verwertbare Angabe gibt es KEINE Belegknöpfe (Anbieter ohne Belegablage, ältere Antwort)", () => {
  for (const b of [null, undefined, {}, { ceShipmentId: 1 }, { shippingDocuments: null },
                   { shippingDocuments: "x" }, { shippingDocuments: [] }]) {
    assert.deepEqual(bookingShippingDocuments(b), []);
  }
});

test("8 — ein unvollständiger oder unsicherer Eintrag wird verworfen, nie repariert", () => {
  const gut = beleg("LABEL", 0, "Versandlabel");
  const kaputt = [
    { ...gut, downloadPath: "https://evil.example/a.pdf" },
    { ...gut, downloadPath: "//evil.example/a.pdf" },
    { ...gut, downloadPath: undefined },
    { ...gut, status: "processing" },
    { ...gut, type: "PACKING_LIST" },
    { ...gut, type: "OTHER" },
    { ...gut, label: "" },
    { ...gut, label: "   " },
    { ...gut, label: undefined },
    { ...gut, ordinal: "0" },
    { ...gut, ordinal: -1 },
    null, 7, "x",
  ];
  assert.deepEqual(bookingShippingDocuments({ shippingDocuments: kaputt }), []);
  // Derselbe Beleg zweimal ergibt EINEN Knopf.
  assert.equal(bookingShippingDocuments({ shippingDocuments: [gut, { ...gut }] }).length, 1);
});

test("9 — kein Anbietername, keine Interna im sichtbaren Text", () => {
  const texte = Object.values(BOOKING_SHIPPING_DOCUMENTS_TEXT).join(" | ");
  for (const verboten of ["transglobal", "Transglobal", "jumingo", "JUMiNGO", "undefined", "null", "LABEL", "provider"]) {
    assert.ok(!texte.includes(verboten), `sichtbarer Text enthält ${verboten}`);
  }
  assert.match(BOOKING_SHIPPING_DOCUMENTS_TEXT.whereToFind, /Meine Sendungen/);
  for (const datei of ["./bookingShippingDocuments.mjs", "./shipmentDocumentsView.mjs",
                       "../components/booking/BookingSuccessDocuments.jsx",
                       "../components/dashboard/ShipmentDocumentsDrawer.jsx"]) {
    assert.ok(!/transglobal|jumingo/i.test(lies(datei)), `${datei} nennt einen Anbieter`);
  }
});

test("10 — Erfolgsbildschirm: je Beleg ein Knopf über den Serverpfad, sonst der bisherige Labelknopf", () => {
  const code = ohneKommentare(lies("../components/booking/BookingSuccessDocuments.jsx"));
  assert.ok(code.includes("const versanddokumente = bookingShippingDocuments(booking);"));
  assert.ok(/versanddokumente\.map\(\(doc\) => \(/.test(code), "die Belege werden nicht einzeln gerendert");
  assert.ok(code.includes("onClick={() => handleDownloadShippingDocument(doc)}"));
  assert.ok(code.includes(
    "await downloadDocument(doc.downloadPath, { fallbackFilename: shippingDocumentFallbackFilename(doc) });"));
  // Ohne Belege bleibt es exakt beim bisherigen Weg.
  const verzweigung = code.indexOf("versanddokumente.length > 0 ?");
  const altknopf = code.indexOf("onClick={handleDownloadLabel}");
  assert.ok(verzweigung > -1 && altknopf > verzweigung, "der bisherige Labelknopf ist nicht der Rückfall");
  assert.ok(code.includes("downloadLabel(booking.ceShipmentId, orderConfirmationNumberOf(booking))"));
  // Mehrere Belege: der Kunde erfährt, wo er sie dauerhaft findet.
  assert.ok(/versanddokumente\.length > 1 && \(/.test(code));
  assert.ok(code.includes("BOOKING_SHIPPING_DOCUMENTS_TEXT.whereToFind"));
  // Kein Pfad wird im Client gebaut, keine zweite Abfrage auf dem Erfolgsbildschirm.
  for (const quelle of [code, ohneKommentare(lies("./bookingShippingDocuments.mjs"))]) {
    assert.ok(!/provider-documents/.test(quelle), "ein Belegpfad wird im Client gebildet");
    assert.ok(!/getShipmentDocuments|apiFetch\(/.test(quelle), "der Erfolgsbildschirm fragt selbst nach");
  }
});

test("11 — Dokumentübersicht: Carriernummer statt leerer Zeile, eigener Rückfallname je Beleg", () => {
  const code = ohneKommentare(lies("../components/dashboard/ShipmentDocumentsDrawer.jsx"));
  assert.ok(code.includes("const referenz = nummer ? null : documentCarrierReference(doc);"));
  assert.ok(code.includes('{referenz && <span className="sdoc-row-number mono">{referenz}</span>}'));
  assert.ok(code.includes("documentFallbackFilename(doc.type, documentOrdinal(doc))"));
  assert.ok(code.includes("key={`${doc.type}-${documentOrdinal(doc) ?? i}`}"),
    "gleichartige Belege teilen sich einen Schlüssel");
});

test("12 — dauerhaft ist die Dokument-API die Quelle, nicht der Buchungszustand", () => {
  const drawer = ohneKommentare(lies("../components/dashboard/ShipmentDocumentsDrawer.jsx"));
  assert.ok(drawer.includes("getShipmentDocuments(shipmentId)"), "die Übersicht lädt nicht vom Server");
  assert.ok(!/shippingDocuments/.test(drawer), "die Übersicht liest den Buchungszustand");
  for (const verboten of ["localStorage", "sessionStorage", "indexedDB"]) {
    assert.ok(!lies("./bookingShippingDocuments.mjs").includes(verboten), `${verboten} hat hier nichts zu suchen`);
  }
});

test("13 — das Abholetikett trägt ein Icon aus der bestehenden Familie", () => {
  assert.equal(documentIcon("COLLECTION_LABEL"), "truck");
  assert.equal(documentIcon("LABEL"), "printer");
  assert.ok(/n === "truck"/.test(lies("../components/ui/Icon.jsx")), "das Icon „truck“ gibt es nicht");
});
