// ─────────────────────────────────────────────────────────────────────────────
// Final Bookability Closure (2026-09-28) — die Frontendseite der geschlossenen Buchbarkeitslücken.
//
//   P0-01  „nachweislich nicht bestellt“ (BOOKING_FAILED u. a.) ist nie „wird geprüft“ / „Zu meinen Sendungen“
//   P1-02  ehrliche Sperrgründe; der Paketshop-Finder folgt seit 2026-10-01 wieder Abgabe + Suchcode (F6)
//   P1-03  409 COLLECTION_DATE_CHANGED nennt den neuen Abholtag und führt zur Neuberechnung
//   P2-05 / P2-08  Sperrgründe Gebietszuschlag, Maße, Geschäftsabsender, Inhaltsangabe
//   P2-01 / EXTRA  der Labelstand der Buchungsantwort; „abrufbar“ ist nicht „bereit“
//   P2-02  der Lieferhinweis nennt die bundesweiten Feiertage
//
// Framework-frei (node --test), kein DOM. carrierMap.js wird wie in portalTariffParity.test.mjs assetlos geladen.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import {
  mapBookRestError, fordertNeuberechnung, erlaubtSpaeterenVersuch, istUnklarerAusgang, istOffenerAusgang,
  collectionDateChangedText, BOOK_FEHLER,
} from "./bookingErrors.mjs";
import {
  offerBlockedLabel, offerBlockedHint, offerSelectable,
  OFFER_BUSINESS_SENDER_TEXT, OFFER_BUSINESS_SENDER_HINT, OFFER_CONTENT_DESCRIPTION_TEXT, OFFER_CONTENT_DESCRIPTION_HINT,
  OFFER_DIMENSIONS_UNVERIFIED_TEXT, OFFER_AREA_SURCHARGE_TEXT, OFFER_BLOCKED_FALLBACK,
} from "./offerIdentity.mjs";
import { bookingLabelView, BOOKING_LABEL_MODE, BOOKING_LABEL_TEXT } from "./bookingShippingDocuments.mjs";
import { documentRetrievePath, documentDownloadPath, documentViewState, DOC_STATUS, DOCUMENTS_TEXT } from "./shipmentDocumentsView.mjs";
import { DELIVERY_PROJECTION_TEXT } from "./deliveryProjectionView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(HIER, rel), "utf8");
async function ladeAssetlos(relPfad) {
  const abs = path.join(HIER, relPfad);
  const basis = pathToFileURL(path.dirname(abs) + path.sep).href;
  let src = readFileSync(abs, "utf8");
  src = src.replace(/import\s+([A-Za-z0-9_$]+)\s+from\s+["'][^"']+\.(?:svg|png|jpe?g|gif|webp|css)["'];?/g, "const $1 = \"$1\";");
  src = src.replace(/from\s+["'](\.\.?\/[^"']+)["']/g, (_m, p) => `from ${JSON.stringify(new URL(p, basis).href)}`);
  return import("data:text/javascript;base64," + Buffer.from(src, "utf8").toString("base64"));
}
const { offerSupportsAccessPointSearch, offerHasParcelShopCapability } = await ladeAssetlos("./carrierMap.js");

// ══════════ P0-01 — nichts beauftragt ist nie ein offener Ausgang ══════════════════════════════════════

// Jeder Code, für den der Server beweist, dass NICHTS bestellt wurde — mit dem Status, in dem er kommt.
const NICHT_BEAUFTRAGT = [
  [409, "BOOKING_FAILED"], [502, "BOOKING_FAILED"], [503, "BOOKING_FAILED"], [500, "BOOKING_FAILED"],
  [503, "PROVIDER_UNAVAILABLE"], [502, "CHECKOUT_CHECK_FAILED"], [409, "CHECKOUT_NOT_READY"],
  [409, "SHIPMENT_PROVIDER_UNSUPPORTED"], [409, "VOUCHER_NOT_APPLICABLE"],
  [409, "COLLECTION_DATE_CHANGED"], [503, "CUSTOMS_BOOKING_UNAVAILABLE"], [409, "CUSTOMS_NOT_READY_AFTER_INVOICE_UPLOAD"],
];

test("F1 — P0-01: kein „nichts beauftragt“-Code wird als offener Ausgang oder „bereits verarbeitet“ gelesen", () => {
  for (const [status, code] of NICHT_BEAUFTRAGT) {
    const f = mapBookRestError(status, { code, error: "x" });
    assert.notEqual(f, BOOK_FEHLER.PRUEFUNG_LAEUFT, `${code}/${status} liest sich als „wird geprüft“`);
    assert.equal(istUnklarerAusgang(f), false, `${code}/${status} ersetzte den Knopf durch „Zu meinen Sendungen“`);
    assert.equal(istOffenerAusgang(status, { code }), false);
    // Genau EINE der beiden Handlungen: neu berechnen ODER später erneut — nie beides, nie keine.
    assert.notEqual(fordertNeuberechnung({ code }), erlaubtSpaeterenVersuch({ code }), `${code}: keine eindeutige Handlung`);
    assert.match(f.message, /nichts beauftragt|Abholtag hat sich geändert/, `${code}: der Satz sagt nicht, dass nichts bestellt wurde`);
    // Nie die Sprache des offenen Ausgangs: „wird geprüft", „Zu meinen Sendungen" / „unter Sendungen", „entgegengenommen".
    assert.doesNotMatch(`${f.title} ${f.message}`, /geprüft|meinen Sendungen|unter „Sendungen|entgegengenommen|melden uns/i,
      `${code}: ${f.message}`);
  }
});

test("F2 — P0-01: BOOKING_FAILED hat einen eigenen, ehrlichen Satz; der echte offene Ausgang bleibt unverändert", () => {
  const f = mapBookRestError(502, { code: "BOOKING_FAILED" });
  assert.equal(f, BOOK_FEHLER.NICHT_DURCHGEFUEHRT);
  assert.equal(f.title, "Buchung nicht durchgeführt");
  assert.equal(f.message, "Die Buchung wurde nicht durchgeführt. Es wurde nichts beauftragt und nichts berechnet. "
    + "Bitte berechnen Sie die Angebote neu und versuchen Sie es erneut.");
  // Unverändert: ein echter offener Ausgang und ein 5xx OHNE Code bleiben „wird geprüft“.
  assert.equal(mapBookRestError(502, { code: "BOOKING_OUTCOME_UNKNOWN" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(202, { code: "BOOKING_PENDING" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(502, null), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(500, { error: "Buchung fehlgeschlagen" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  // Und ein verbrauchtes Angebot bleibt KEIN „nichts beauftragt“.
  assert.equal(fordertNeuberechnung({ code: "OFFER_ALREADY_USED" }), false);
});

test("F3 — P0-01: die Buchungsseite prüft „nichts beauftragt“ VOR dem offenen Ausgang, auch bei 5xx", () => {
  const seite = lies("../pages/BookingPage.jsx");
  const rest = seite.slice(seite.indexOf("if (!r.ok) {"));
  const neu = rest.indexOf("if (fordertNeuberechnung(d))");
  const offen = rest.indexOf("if (istUnklarerAusgang(fehler))");
  assert.ok(neu > 0 && offen > 0 && neu < offen, "der Restpfad liest einen 5xx BOOKING_FAILED weiterhin als offenen Ausgang");
  // Im 409-Zweig: „später erneut“ vor der Versicherungsaktualisierung und vor dem Sammelkonflikt.
  // Der 409-Zweig der FINALEN Buchung — er steht hinter der Prüfung auf den offenen Ausgang (andere Handler der
  // Seite haben eigene 409-Zweige).
  const buchung = seite.slice(seite.indexOf("if (istOffenerAusgang(r.status, d))"));
  const konflikt = buchung.slice(buchung.indexOf("if (r.status === 409) {"), buchung.indexOf("if (r.status === 401 || r.status === 403)"));
  const spaeter = konflikt.indexOf("if (erlaubtSpaeterenVersuch(d))");
  assert.ok(spaeter > 0, "kein Zweig für „später erneut“");
  assert.ok(spaeter < konflikt.indexOf("if (isInsured && coverModel && isCoverBookError(d))"));
  assert.ok(spaeter < konflikt.indexOf("Diese Sendung wurde bereits verarbeitet"));
  // Und dieser Zweig setzt einen Hinweis — keinen Konflikt (der den Knopf durch „Zu meinen Sendungen“ ersetzte).
  assert.match(konflikt.slice(spaeter, spaeter + 200), /setError\(mapBookRestError\(r\.status, d\)\)/);
});

// ══════════ P1-03 — der neue früheste Abholtag ═════════════════════════════════════════════════════════

test("F4 — P1-03: 409 COLLECTION_DATE_CHANGED nennt den neuen Tag und führt zur Neuberechnung", () => {
  const body = { code: "COLLECTION_DATE_CHANGED", oldCollectionDate: "2026-12-24", newCollectionDate: "2026-12-28",
                 recalculationRequired: true };
  const f = mapBookRestError(409, body);
  assert.equal(f.message, "Der früheste Abholtag hat sich geändert auf Montag, 28.12.2026. Bitte Angebot neu berechnen.");
  assert.equal(f.retryable, false);
  assert.equal(fordertNeuberechnung(body), true, "kein Neuberechnungs-CTA");
  // Karfreitag/Ostermontag 2027 → Dienstag.
  assert.equal(collectionDateChangedText({ newCollectionDate: "2027-03-30" }),
    "Der früheste Abholtag hat sich geändert auf Dienstag, 30.03.2027. Bitte Angebot neu berechnen.");
  // Ohne lesbares Datum: der Satz ohne Datum — nie ein geratenes.
  for (const neu of [undefined, null, "", "28.12.2026", "2026-02-30", "2026-12-28T00:00:00Z", 20261228]) {
    assert.equal(collectionDateChangedText({ newCollectionDate: neu }),
      "Der früheste Abholtag hat sich geändert. Bitte Angebot neu berechnen.", String(neu));
  }
  assert.equal(collectionDateChangedText(null), "Der früheste Abholtag hat sich geändert. Bitte Angebot neu berechnen.");
});

// ══════════ P1-02 / P2-05 / P2-08 — ehrliche Sperrgründe ═══════════════════════════════════════════════

test("F5 — Sperrgründe: jeder neue Servergrund hat einen eigenen Text; Hinweise nur, wo der Kunde etwas tun kann", () => {
  const karte = (unavailableReason) => ({ bookable: false, unavailableReason, availableForDate: true });
  const erwartet = [
    ["business_sender_required", OFFER_BUSINESS_SENDER_TEXT, OFFER_BUSINESS_SENDER_HINT],
    ["content_description_required", OFFER_CONTENT_DESCRIPTION_TEXT, OFFER_CONTENT_DESCRIPTION_HINT],
    ["package_dimensions_unverified", OFFER_DIMENSIONS_UNVERIFIED_TEXT, null],
    ["area_surcharge_unconfirmed", OFFER_AREA_SURCHARGE_TEXT, null],
    ["quote_only", "Derzeit nicht direkt buchbar", null],
  ];
  for (const [grund, text, hinweis] of erwartet) {
    const t = karte(grund);
    assert.equal(offerSelectable(t), false, `${grund} ist auswählbar`);
    assert.equal(offerBlockedLabel(t), text, grund);
    assert.equal(offerBlockedHint(t), hinweis, grund);
    assert.notEqual(text, OFFER_BLOCKED_FALLBACK, `${grund} fällt auf den neutralen Satz`);
    // Kein Anbieter, keine Zahl, kein Rohcode im sichtbaren Text.
    assert.doesNotMatch(`${text} ${hinweis || ""}`, /jumingo|transglobal|ups|dhl|dpd|gls|[0-9]|_/i, grund);
  }
  assert.equal(OFFER_AREA_SURCHARGE_TEXT, "Gebietszuschlag nicht bestätigt.");
});

test("F6 — Paketshop-Finder: Abgabe + kontrollierter Suchcode, keine zusätzliche Fähigkeitssperre (Betreiberentscheidung 2026-10-01)", () => {
  const abgabe = (extra) => ({ serviceType: "dropoff", bookable: true, ...extra });
  // UPS, DHL, GLS, DPD — mit genau der Fähigkeitsangabe, die der Server für eine JUMiNGO-Abgabe sendet
  // (`available` nur beim belegten UPS-Access-Point-Tarif), und ganz ohne sie.
  for (const carrier of ["ups", "dhl", "gls", "dpd"]) {
    assert.equal(offerSupportsAccessPointSearch(abgabe({ publicCarrierId: carrier, accessPoint: { available: false, provider: null } })),
      true, carrier);
    assert.equal(offerSupportsAccessPointSearch(abgabe({ publicCarrierId: carrier })), true, `${carrier} ohne accessPoint`);
  }
  assert.equal(offerSupportsAccessPointSearch(abgabe({ publicCarrierId: "ups", accessPoint: { available: true, provider: "ups" } })), true);
  // TG124: die serverseitige Paketshopsuche bleibt unverändert.
  assert.equal(offerSupportsAccessPointSearch(abgabe({ publicCarrierId: "dpd", parcelShopSearch: "server" })), true);
  // Kein Finder: Abholung (auch mit Fähigkeit), unbekannter oder nicht auflösbarer Carrier, keine Übergabeart.
  assert.equal(offerSupportsAccessPointSearch({ serviceType: "pickup", publicCarrierId: "ups",
    accessPoint: { available: true, provider: "ups" } }), false);
  for (const id of ["other", "fedex", "tnt", "dhl-express", "", null, undefined]) {
    assert.equal(offerSupportsAccessPointSearch(abgabe({ publicCarrierId: id })), false, String(id));
  }
  assert.equal(offerSupportsAccessPointSearch(abgabe({ publicCarrierId: "other", accessPoint: { available: true, provider: "fedex" } })), false);
  for (const serviceType of [undefined, null, "", "shop", "DROPOFF"]) {
    assert.equal(offerSupportsAccessPointSearch({ serviceType, publicCarrierId: "dpd" }), false, String(serviceType));
  }
  // Der Fähigkeitsleser bleibt streng — er ist nur keine Finder-Bedingung mehr.
  assert.equal(offerHasParcelShopCapability({ accessPoint: { available: "true" } }), false, "nur ein echtes true zählt");
});

// ══════════ P2-01 / EXTRA — der Labelstand ════════════════════════════════════════════════════════════

test("F7 — P2-01: der Erfolgsbildschirm bietet nur bei `available` einen Download an", () => {
  const M = BOOKING_LABEL_MODE;
  assert.deepEqual(bookingLabelView({ labelStatus: "available" }), { mode: M.DOWNLOAD, retrievable: false, text: null });
  assert.deepEqual(bookingLabelView({ labelStatus: "pending", labelRetrievable: false }),
    { mode: M.PENDING, retrievable: false, text: BOOKING_LABEL_TEXT.pending });
  assert.deepEqual(bookingLabelView({ labelStatus: "pending", labelRetrievable: true }),
    { mode: M.PENDING, retrievable: true, text: BOOKING_LABEL_TEXT.pending });
  assert.deepEqual(bookingLabelView({ labelStatus: "separate", labelRetrievable: true }),
    { mode: M.SEPARATE, retrievable: false, text: BOOKING_LABEL_TEXT.separate });
  for (const unbekannt of ["unknown", null, "", "ready", 1, "AVAILABLE"]) {
    assert.deepEqual(bookingLabelView({ labelStatus: unbekannt }), { mode: M.UNKNOWN, retrievable: false, text: BOOKING_LABEL_TEXT.unknown },
      String(unbekannt));
  }
  // Ein Server VOR diesem Stand nennt gar keinen Labelstand: dann bleibt es beim bisherigen Knopf.
  assert.equal(bookingLabelView({ success: true }).mode, M.DOWNLOAD);
  assert.equal(BOOKING_LABEL_TEXT.pending,
    "Ihr Versandlabel wird erstellt. Sobald es verfügbar ist, können Sie es in Ihrem ConfidaraExpress-Konto abrufen.");
  assert.doesNotMatch(BOOKING_LABEL_TEXT.retrieve, /herunterladen/i, "der Abruf gibt sich als Download aus");
});

test("F8 — P2-01: die Erfolgskomponente zeigt ohne Download-Stand keinen „Label herunterladen“-Knopf", () => {
  const docs = lies("../components/booking/BookingSuccessDocuments.jsx");
  // „Label herunterladen“ steht genau einmal — im Zweig BOOKING_LABEL_MODE.DOWNLOAD.
  assert.equal(docs.split('"Label herunterladen"').length - 1, 1);
  const download = docs.indexOf("labelAnsicht.mode === BOOKING_LABEL_MODE.DOWNLOAD ? (");
  const knopf = docs.indexOf('"Label herunterladen"');
  const sonst = docs.indexOf("labelAnsicht.text");
  assert.ok(download > 0 && download < knopf && knopf < sonst, "der Downloadknopf hängt nicht am Labelstand");
  // Der Abruf erscheint nur mit `retrievable` — und nie als primäre Aktion.
  assert.match(docs, /\{labelAnsicht\.retrievable && \(\s*<button type="button" className="btn btn-outline/);
});

test("F9 — EXTRA: „abrufbar“ ist nicht „bereit“ — der Abruf ist eine eigene Aktion, nie ein Download", () => {
  const liste = (doc) => ({ type: "LABEL", category: "SHIPPING", label: "Versandlabel", ...doc });
  const inArbeit = liste({ status: "processing", retrievePath: "/api/shipments/7/label" });
  assert.equal(documentViewState(inArbeit), DOC_STATUS.PROCESSING);
  assert.equal(documentDownloadPath(inArbeit), null, "ein nicht abgelegtes Label bekommt einen Downloadpfad");
  assert.equal(documentRetrievePath(inArbeit), "/api/shipments/7/label");
  assert.equal(documentRetrievePath(liste({ status: "failed", retrievePath: "/api/shipments/7/label" })), "/api/shipments/7/label");
  // Kein Abruf für ein bereitliegendes, ein nicht mehr entstehendes oder ein unsicher adressiertes Dokument.
  assert.equal(documentRetrievePath(liste({ status: "ready", downloadPath: "/api/shipments/7/label", retrievePath: "/api/shipments/7/label" })), null);
  assert.equal(documentRetrievePath(liste({ status: "unavailable", retrievePath: "/api/shipments/7/label" })), null);
  for (const fremd of ["https://evil.example/label", "//evil.example/x", "javascript:alert(1)", "", null]) {
    assert.equal(documentRetrievePath(liste({ status: "processing", retrievePath: fremd })), null, String(fremd));
  }
  assert.equal(DOCUMENTS_TEXT.retrieve, "Abrufen");
  const drawer = lies("../components/dashboard/ShipmentDocumentsDrawer.jsx");
  // Nach einem gelungenen Abruf wird die Liste neu geladen — der abgelegte Beleg erscheint dann als `ready`.
  assert.match(drawer, /if \(abgelegt\) setVersuch\(\(n\) => n \+ 1\);/);
});

// ══════════ P2-02 — bundesweite Feiertage ════════════════════════════════════════════════════════════

test("F10 — P2-02: der Lieferhinweis sagt, was gezählt ist und was nicht", () => {
  assert.equal(DELIVERY_PROJECTION_TEXT.note,
    "Aus Abholtag und Laufzeit berechnet; Wochenenden und bundesweite Feiertage sind nicht mitgezählt. "
    + "Regionale oder ausländische Feiertage können die Zustellung verschieben.");
});
