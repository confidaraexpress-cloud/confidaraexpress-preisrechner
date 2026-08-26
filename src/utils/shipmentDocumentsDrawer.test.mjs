/* Dokumente-Drawer der Sendungsliste (P6).
   =============================================================================
   Zwei Zusagen tragen dieses Paket:

     1. Der SERVER sagt, welche Dokumente es gibt. Die Sendungsliste rät nichts
        mehr — weder aus Status, Zielland, Carrier noch aus einer Nummer in der
        Zeile. Genau diese Ableitungen trugen vorher die zwei Einzelknöpfe.

     2. Geladen wird erst auf Klick, für genau EINE Sendung. Kein Vorabfetch,
        kein N+1 beim Rendern der Liste, kein globales Polling.

   Das gerenderte Verhalten prüft tests/e2e/shipmentDocumentsDrawer.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DOC_STATUS, DOCUMENTS_TEXT, DOCUMENT_DOWNLOAD_TEXT,
  DOCUMENT_POLL_INTERVAL_MS, DOCUMENT_POLL_BUDGET_MS,
  CATEGORY_LABELS, CATEGORY_ORDER, OTHER_CATEGORY_LABEL,
  groupShipmentDocuments, documentViewState, documentDownloadPath, documentLabel, documentNumber,
  documentIcon, documentFallbackFilename, hasProcessingDocument, nextDocumentPollDelay,
  isSafeApiPath, documentDownloadMessage,
} from "./shipmentDocumentsView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const drawer     = lies("../components/dashboard/ShipmentDocumentsDrawer.jsx");
const liste      = lies("../components/dashboard/ShipmentsList.jsx");
const genericMod = lies("./downloadDocument.js");
const viewModul  = lies("./shipmentDocumentsView.mjs");
const bookingPage = lies("../pages/BookingPage.jsx");

// Kommentarfreier Quelltext — eine Erklärung darf keine Zusicherung belegen,
// die der ausgeführte Code nicht trägt.
const ohneKommentare = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
const drawerCode = ohneKommentare(drawer);
const listeCode  = ohneKommentare(liste);

const doc = (type, category, status, extra = {}) => ({
  type, category, status, label: `L-${type}`,
  ...(status === "ready" ? { downloadPath: `/api/shipments/7/${type.toLowerCase()}` } : {}),
  ...extra,
});
const VIER = {
  shipmentId: 7,
  documents: [
    doc("ORDER_CONFIRMATION", "ORDER", "ready", { number: "CE-AB-2026-000001" }),
    doc("PROFORMA", "CUSTOMS", "ready", { number: "PF-2026-000042" }),
    doc("DELIVERY_NOTE", "SHIPPING", "ready"),
    doc("LABEL", "SHIPPING", "ready"),
  ],
};

/* ═════════ 1 — Gruppierung ═════════ */

test("1 — vier Dokumente ergeben drei Gruppen in stabiler Reihenfolge", () => {
  const g = groupShipmentDocuments(VIER);
  assert.deepEqual(g.map((x) => x.label), ["Versand", "Zoll", "Geschäftsdokumente"]);
  assert.deepEqual(g.map((x) => x.documents.map((d) => d.type)), [
    ["LABEL", "DELIVERY_NOTE"], ["PROFORMA"], ["ORDER_CONFIRMATION"],
  ]);
  // Dieselbe Antwort in anderer Reihenfolge ergibt dasselbe Bild.
  const gedreht = groupShipmentDocuments({ documents: [...VIER.documents].reverse() });
  assert.deepEqual(gedreht.map((x) => x.documents.map((d) => d.type)),
    g.map((x) => x.documents.map((d) => d.type)));
  assert.deepEqual(CATEGORY_ORDER, ["SHIPPING", "CUSTOMS", "ORDER"]);
  assert.deepEqual(Object.values(CATEGORY_LABELS), ["Versand", "Zoll", "Geschäftsdokumente"]);
});

test("2 — eine unbekannte Kategorie verschwindet nicht, sie sammelt sich hinten", () => {
  const g = groupShipmentDocuments({ documents: [
    doc("LABEL", "SHIPPING", "ready"),
    doc("EXPORT_DECLARATION", "SOMETHING_NEW", "ready"),
  ] });
  assert.deepEqual(g.map((x) => x.label), ["Versand", OTHER_CATEGORY_LABEL]);
  assert.equal(g[1].documents[0].type, "EXPORT_DECLARATION");
  // Und ein unbekannter TYP in einer bekannten Kategorie hängt sich hinten an.
  const g2 = groupShipmentDocuments({ documents: [
    doc("NEUES_DOKUMENT", "SHIPPING", "ready"), doc("LABEL", "SHIPPING", "ready"),
  ] });
  assert.deepEqual(g2[0].documents.map((d) => d.type), ["LABEL", "NEUES_DOKUMENT"]);
});

test("3 — leere Gruppen entstehen nie, kaputte Antworten ergeben nichts", () => {
  assert.deepEqual(groupShipmentDocuments({ documents: [] }), []);
  for (const kaputt of [null, undefined, {}, { documents: null }, { documents: "x" }, 42, "x"]) {
    assert.deepEqual(groupShipmentDocuments(kaputt), [], `kaputt: ${JSON.stringify(kaputt)}`);
  }
  // Einträge ohne brauchbaren Typ werden übersprungen, nicht gerendert.
  assert.deepEqual(groupShipmentDocuments({ documents: [null, {}, { type: "" }, { type: 7 }] }), []);
});

/* ═════════ 2 — Zustände ═════════ */

test("4 — nur ready MIT sicherem Serverpfad ist ladbar", () => {
  const pfad = "/api/shipments/7/proforma";
  assert.equal(documentViewState({ status: "ready", downloadPath: pfad }), DOC_STATUS.READY);
  assert.equal(documentViewState({ status: "processing" }), DOC_STATUS.PROCESSING);
  assert.equal(documentViewState({ status: "failed" }), DOC_STATUS.FAILED);
  // Unbekanntes gilt NIE als ladbar.
  for (const unbekannt of ["READY", "fertig", "", null, undefined, 1, true]) {
    assert.equal(documentViewState({ status: unbekannt, downloadPath: pfad }), DOC_STATUS.PROCESSING);
  }
  // „ready" ohne Pfad ist kein Fehler — aber auch nichts zum Klicken.
  assert.equal(documentViewState({ status: "ready" }), DOC_STATUS.PROCESSING);
  for (const kaputt of [null, undefined, 7, "x"]) {
    assert.equal(documentViewState(kaputt), DOC_STATUS.PROCESSING);
  }
  assert.equal(documentDownloadPath({ status: "ready", downloadPath: ` ${pfad} ` }), pfad);
  assert.equal(documentDownloadPath({ status: "failed", downloadPath: pfad }), null);
});

test("5 — ein fremder Host wird NIE zum Downloadziel", () => {
  // apiFetch reicht eine absolute URL unverändert durch UND hängt den Bearer-Token
  // an: ein Pfad auf einen fremden Host würde das Kundentoken dorthin senden.
  assert.equal(isSafeApiPath("/api/shipments/7/label"), true);
  for (const boese of [
    "https://evil.example/a.pdf", "http://evil.example/a.pdf", "//evil.example/a.pdf",
    "javascript:alert(1)", "data:application/pdf;base64,AAA", "api/shipments/7/label",
    "", "   ", null, undefined, 7, {}, "/api/a b", "/api/a\"b", "/api/a\nb",
  ]) {
    assert.equal(isSafeApiPath(boese), false, `abgelehnt werden muss: ${String(boese)}`);
    // Und ein solcher Pfad macht das Dokument nicht ladbar.
    assert.notEqual(documentViewState({ status: "ready", downloadPath: boese }), DOC_STATUS.READY);
    assert.equal(documentDownloadPath({ status: "ready", downloadPath: boese }), null);
  }
});

/* ═════════ 3 — Nachladen ═════════ */

test("6 — kurzer fester Takt mit hartem Budget", () => {
  assert.equal(DOCUMENT_POLL_INTERVAL_MS, 2000);
  assert.equal(DOCUMENT_POLL_BUDGET_MS, 30000);
  let n = 0, summe = 0;
  for (;;) {
    const d = nextDocumentPollDelay(n);
    if (d == null) break;
    assert.equal(d, DOCUMENT_POLL_INTERVAL_MS);
    summe += d; n += 1;
    assert.ok(n < 1000, "das Nachladen muss endlich sein");
  }
  assert.equal(n, 15);
  assert.equal(summe, DOCUMENT_POLL_BUDGET_MS);
  // Erst der TYP, dann der Wert: Number(null) ist 0 und hätte sonst einen Takt
  // erzeugt, der sein Budget nie erreicht.
  for (const murks of [-1, 1.5, NaN, null, undefined, "3"]) assert.equal(nextDocumentPollDelay(murks), null);
});

test("7 — nachgeladen wird nur, solange wirklich ein Beleg entsteht", () => {
  const fertig = groupShipmentDocuments(VIER);
  assert.equal(hasProcessingDocument(fertig), false);
  assert.equal(hasProcessingDocument(groupShipmentDocuments({ documents: [
    doc("LABEL", "SHIPPING", "ready"), doc("PROFORMA", "CUSTOMS", "processing"),
  ] })), true);
  // Ein gescheiterter Beleg ist ein ENDzustand — dafür wird nicht weitergefragt.
  assert.equal(hasProcessingDocument(groupShipmentDocuments({ documents: [
    doc("PROFORMA", "CUSTOMS", "failed"),
  ] })), false);
  assert.equal(hasProcessingDocument([]), false);
  for (const kaputt of [null, undefined, "x", 7]) assert.equal(hasProcessingDocument(kaputt), false);
});

test("8 — der Drawer hält sein Nachladen an sich: kein Intervall, kein globaler Lauf", () => {
  assert.ok(!drawerCode.includes("setInterval"), "kein Intervall — jeder Takt wird einzeln entschieden");
  assert.ok(drawerCode.includes("nextDocumentPollDelay(attempt)"), "kein gedeckelter Takt");
  assert.ok(drawerCode.includes("if (delay == null) return;"), "das Budget beendet das Nachladen");
  assert.ok(drawerCode.includes("abgebrochen = true"), "Schließen/Unmount stoppt den Lauf");
  assert.ok(drawerCode.includes("clearTimeout(timerRef.current)"), "der Timer wird bereinigt");
  assert.ok(drawerCode.includes("if (abgebrochen) return;"),
    "nach dem Schließen darf kein Zustand mehr gesetzt werden");
  // Nichts wird über die Sitzung hinaus gemerkt.
  for (const verboten of ["localStorage", "sessionStorage", "indexedDB"]) {
    assert.ok(!drawer.includes(verboten), `${verboten} hat hier nichts zu suchen`);
  }
});

/* ═════════ 4 — kein Vorabfetch, kein N+1 ═════════ */

test("9 — die Sendungsliste fragt keine Dokumente ab", () => {
  assert.ok(!/getShipmentDocuments/.test(listeCode), "die Liste ruft die Dokument-API auf");
  // Der Drawer wird BEDINGT gerendert — ohne Klick ist er nicht gemountet und
  // sein Ladeeffekt läuft nicht. Genau das verhindert das N+1.
  assert.ok(/\{documentsShipment && \(\s*<ShipmentDocumentsDrawer/.test(listeCode),
    "der Drawer hängt nicht an einer Auswahl");
  assert.ok(/const \[documentsShipment, setDocumentsShipment\] = React\.useState\(null\)/.test(listeCode),
    "ohne Klick ist keine Sendung ausgewählt");
  // Und der Abruf steht ausschließlich im Drawer, für genau EINE Sendung.
  assert.equal((drawerCode.match(/getShipmentDocuments\(/g) || []).length, 1);
  assert.ok(drawerCode.includes("getShipmentDocuments(shipmentId)"));
});

test("10 — der Drawer lädt für die geklickte Sendung, nicht für eine geratene", () => {
  assert.ok(/shipmentId=\{documentsShipment\.id\}/.test(listeCode));
  // Die Kontextnummer kommt aus bereits vorhandenen Zeilendaten — kein zweiter Request.
  assert.ok(/contextNumber=\{customerShipmentNumbers\(documentsShipment\)/.test(listeCode));
});

/* ═════════ 5 — die zentrale Aktion ═════════ */

test("11 — eine Dokumentaktion statt vieler; Tracking und Storno bleiben", () => {
  assert.ok(/onDocuments\(s\)/.test(listeCode), "die zentrale Aktion fehlt");
  assert.equal(DOCUMENTS_TEXT.action, "Dokumente");
  // Die beiden früheren Einzelaktionen sind weg — samt ihrer geratenen Sichtbarkeit.
  for (const weg of ["downloadLabel", "downloadOrderConfirmation", "onLabel", "onOrderConfirmation",
                     "handleDownloadLabel", "handleDownloadOrderConfirmation"]) {
    assert.ok(!listeCode.includes(weg), `${weg} steht wieder in der Sendungsliste`);
  }
  assert.ok(!/s\.status === "booked" \|\| s\.status === "label_ready"/.test(listeCode),
    "die Liste leitet Dokumentverfügbarkeit wieder aus dem Status ab");
  // Was NICHT dokumentbezogen ist, bleibt unangetastet.
  assert.ok(/onTrack\(s\.id\)/.test(listeCode), "Tracking wurde entfernt");
  assert.ok(/Sendung verfolgen/.test(liste), "der Trackingknopf wurde entfernt");
  assert.ok(/canRequestCancellation\(s\)/.test(listeCode) && /onCancel\(s\)/.test(listeCode),
    "die Stornoaktion wurde entfernt");
  assert.ok(/Stornieren/.test(liste) && /CancellationRequestDialog/.test(liste));
  assert.ok(/CancellationStatusPill/.test(listeCode), "das Stornostatus-Badge wurde entfernt");
});

/* ═════════ 6 — Darstellung und Texte ═════════ */

test("12 — drei Zustände, drei Anzeigen, genau eine Aktion je Zeile", () => {
  assert.ok(drawerCode.includes("zustand === DOC_STATUS.READY"), "ready → Downloadknopf");
  assert.ok(drawerCode.includes("zustand === DOC_STATUS.PROCESSING"), "processing → Hinweis");
  assert.ok(drawerCode.includes("zustand === DOC_STATUS.FAILED"), "failed → Hinweis");
  assert.equal(DOCUMENTS_TEXT.processing, "Wird erstellt …");
  assert.equal(DOCUMENTS_TEXT.failed, "Derzeit nicht verfügbar");
  assert.equal(DOCUMENTS_TEXT.empty, "Für diese Sendung sind derzeit keine Dokumente verfügbar.");
  assert.equal(DOCUMENTS_TEXT.loadError, "Dokumente konnten derzeit nicht geladen werden.");
  // Ein gescheiterter Beleg bekommt KEINEN Wiederholen-Knopf (der Kunde kann am
  // Serverzustand nichts ändern) und keine Alarmfläche. „Erneut versuchen" gibt es
  // ausschließlich für den LADEFEHLER der Liste — ein reiner GET.
  const zeile = drawerCode.slice(drawerCode.indexOf("function DocumentRow"), drawerCode.indexOf("export function ShipmentDocumentsDrawer"));
  assert.ok(!/Erneut|retry/i.test(zeile), "die Dokumentzeile bietet ein Wiederholen an");
  assert.ok(!/alert-error|alert-danger/.test(zeile), "der Fehlerfall ist rot gestaltet");
  assert.ok(zeile.includes("DOCUMENTS_TEXT.failed") && zeile.includes("DOCUMENTS_TEXT.processing"));
  assert.ok(drawerCode.includes("DOCUMENTS_TEXT.retry"), "der Ladefehler bietet kein erneutes Laden an");
});

test("13 — Zustände tragen Text, nicht nur Farbe", () => {
  // Beide Zustandstexte stehen als echter Text in der Zeile; die Farbe ist Zugabe.
  assert.ok(/\{DOCUMENTS_TEXT\.processing\}/.test(drawerCode));
  assert.ok(/\{DOCUMENTS_TEXT\.failed\}/.test(drawerCode));
  assert.ok(/role="status"/.test(drawerCode), "der Wartezustand ist keine Live-Region");
});

test("14 — kein Interna, kein Providername im sichtbaren Text", () => {
  const texte = [...Object.values(DOCUMENTS_TEXT), ...Object.values(DOCUMENT_DOWNLOAD_TEXT)].join(" | ");
  for (const verboten of ["jumingo", "JUMiNGO", "sandbox", "PROFORMA_", "U+", "500", "409",
                          "document_status", "proforma_invoices", "shipment_id", "undefined", "null"]) {
    assert.ok(!texte.includes(verboten), `sichtbarer Text darf ${verboten} nicht enthalten`);
  }
  assert.ok(!/jumingo/i.test(drawer), "der Drawer nennt den Upstream-Anbieter");
  assert.ok(!/jumingo/i.test(viewModul), "das Auswertungsmodul nennt den Upstream-Anbieter");
});

test("15 — Name und Nummer kommen vom Server, ohne leere Platzhalter", () => {
  assert.equal(documentLabel({ type: "LABEL", label: "Versandlabel" }), "Versandlabel");
  // Fehlt die Beschriftung, entsteht keine namenlose Zeile.
  assert.equal(documentLabel({ type: "PROFORMA" }), "Proforma-Rechnung");
  assert.equal(documentLabel({ type: "UNBEKANNT" }), "Dokument");
  assert.equal(documentLabel({ type: "LABEL", label: "   " }), "Versandlabel");
  // Fehlt die Nummer, wird KEIN Platzhalter gezeigt.
  assert.equal(documentNumber({ number: "PF-2026-000042" }), "PF-2026-000042");
  for (const ohne of [{}, { number: "" }, { number: "  " }, { number: 7 }, null]) {
    assert.equal(documentNumber(ohne), null);
  }
  assert.ok(/\{nummer && <span/.test(drawer), "eine fehlende Nummer erzeugt eine leere Zeile");
});

test("16 — Dateiname: Serverkopfzeile zuerst, sonst ein neutraler Name je Typ", () => {
  assert.ok(genericMod.includes("filenameFromContentDisposition("), "der Servername wird nicht gelesen");
  assert.equal(documentFallbackFilename("LABEL"), "versandlabel.pdf");
  assert.equal(documentFallbackFilename("DELIVERY_NOTE"), "lieferschein.pdf");
  assert.equal(documentFallbackFilename("PROFORMA"), "proforma-rechnung.pdf");
  assert.equal(documentFallbackFilename("ORDER_CONFIRMATION"), "auftragsbestaetigung.pdf");
  assert.equal(documentFallbackFilename("IRGENDWAS"), "dokument.pdf");
  // Kein zusammengebauter Belegname, keine interne ID, keine Providerreferenz.
  assert.ok(!/`.*\$\{(nummer|number|doc\.number|shipmentId)\}.*\.pdf`/.test(drawer + genericMod));
  assert.ok(!/PF-|CE-AB-|CE-BS-/.test(genericMod));
});

test("17 — Icons aus der bestehenden Familie, keine Emojis", () => {
  assert.equal(documentIcon("LABEL"), "printer");
  assert.equal(documentIcon("DELIVERY_NOTE"), "form");
  assert.equal(documentIcon("PROFORMA"), "invoice");
  assert.equal(documentIcon("ORDER_CONFIRMATION"), "seal");
  assert.equal(documentIcon("UNBEKANNT"), "form");
  // Alle Namen existieren wirklich in der Iconkomponente.
  const iconSrc = lies("../components/ui/Icon.jsx");
  for (const n of ["printer", "form", "invoice", "seal", "download", "info", "x"]) {
    assert.ok(new RegExp(`(^|\\s)${n}:`, "m").test(iconSrc), `Icon "${n}" gibt es nicht`);
  }
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(drawer), "der Drawer benutzt Emojis");
  // lucide-react ist im Projekt entfernt und durch Tests verboten — der Drawer
  // benutzt deshalb dieselbe Iconkomponente wie alles andere.
  assert.ok(!/lucide/i.test(drawer));
});

/* ═════════ 7 — Zugänglichkeit ═════════ */

test("18 — der Drawer verhält sich wie jeder Dialog des Systems", () => {
  assert.ok(drawerCode.includes("useDialog({ open: true, onClose })"),
    "keine zweite Fokus-/Escape-Infrastruktur");
  assert.ok(/role="dialog"/.test(drawerCode) && /aria-modal="true"/.test(drawerCode));
  assert.ok(/aria-labelledby="sdoc-drawer-title"/.test(drawerCode));
  assert.ok(/aria-label=\{DOCUMENTS_TEXT\.close\}/.test(drawerCode), "der Schließknopf hat keine Beschriftung");
  // Downloadaktionen sind echte Knöpfe, keine Links auf einen zusammengebauten Pfad.
  assert.ok(/<button\s+type="button"/.test(drawerCode));
  assert.ok(!/<a\s+href=\{/.test(drawerCode), "der Drawer verlinkt einen Pfad direkt");
  // Und er benutzt den gemeinsamen Drawerrahmen statt eines eigenen.
  assert.ok(/className="ce-drawer-overlay"/.test(drawerCode) && /className="ce-drawer sdoc-drawer"/.test(drawerCode));
});

/* ═════════ 8 — P5B bleibt, wie es war ═════════ */

test("19 — der Erfolgsbildschirm ist von P6 nicht berührt", () => {
  assert.ok(!/ShipmentDocumentsDrawer|shipmentDocumentsView/.test(bookingPage),
    "der Drawer ist in den Buchungsablauf gewandert");
  // Die drei direkten Dokumentknöpfe des Erfolgsbildschirms bleiben unverändert.
  for (const behalten of ["downloadLabel(booking.ceShipmentId", "downloadOrderConfirmation(booking.ceShipmentId",
                          "downloadDeliveryNote(booking.ceShipmentId", "downloadProforma(pfad)"]) {
    assert.ok(bookingPage.includes(behalten), `der Erfolgsbildschirm hat ${behalten} verloren`);
  }
});

test("20 — der Proforma-Download nutzt jetzt denselben sicheren Helfer", () => {
  const proforma = lies("./downloadProforma.js");
  assert.ok(proforma.includes("downloadDocument(downloadPath, {"), "die Mechanik ist nicht geteilt");
  assert.ok(proforma.includes("fallbackFilename: FALLBACK_DATEINAME"), "der Rückfallname ging verloren");
  assert.ok(proforma.includes("message: proformaDownloadMessage"), "die kuratierten Texte gingen verloren");
  // Der Pfad-Guard steht EINMAL und gilt für beide Wege.
  assert.equal((genericMod.match(/isSafeApiPath\(downloadPath\)/g) || []).length, 1);
  assert.ok(genericMod.includes("if (!isSafeApiPath(downloadPath)) throw"));
});

test("21 — Downloadfehler sind kuratiert, nie Serverfreitext", () => {
  assert.ok(!genericMod.includes("body.error"), "kein blind übernommener Servertext");
  assert.equal(documentDownloadMessage(404, "PROFORMA_NOT_FOUND"), DOCUMENT_DOWNLOAD_TEXT.fehlt);
  assert.equal(documentDownloadMessage(404, "LABEL_NOT_FOUND"), DOCUMENT_DOWNLOAD_TEXT.fehlt);
  assert.equal(documentDownloadMessage(409, "PROFORMA_NOT_READY"), DOCUMENT_DOWNLOAD_TEXT.nochNicht);
  assert.equal(documentDownloadMessage(429, null), DOCUMENT_DOWNLOAD_TEXT.zuViele);
  for (const [status, code] of [[500, null], [500, "PROFORMA_DOCUMENT_MISSING"], [0, "X"], [418, null]]) {
    const m = documentDownloadMessage(status, code);
    assert.equal(m, DOCUMENT_DOWNLOAD_TEXT.allgemein);
    assert.ok(!/_/.test(m), "ein Fehlercode steht im Kundentext");
  }
  // Ein 401/403 gehört dem zentralen Auth-Redirect und erzeugt keine Bannermeldung.
  assert.ok(drawerCode.includes("e?.status !== 401 && e?.status !== 403"));
});
