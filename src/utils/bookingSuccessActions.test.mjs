// Phase 1 (Betreiberentscheidung 2026-11-06, Canonical v2.117): Erfolgsseite — Hauptaktion, Labelzeilen und nächste
// Schritte je Labelstand; Labelhinweis entfernt (Thema 4); Neuladen ohne „Kein Angebot ausgewählt". Premium-UX-
// Nachbesserung (Canonical v2.118): ein abrufbares Label heißt sofort „Versandlabel herunterladen“, neben der
// Hauptaktion steht kein zweiter Knopf, Warten und Fehler stehen als Rückmeldung unter ihr.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bookingSuccessLabelPlan, bookingSuccessNextSteps, bookingSuccessAddressLines,
  SUCCESS_ACTION, ROW_TONE, BOOKING_SUCCESS_TEXT,
} from "./bookingSuccessActions.mjs";
import { BOOKING_LABEL_TEXT } from "./bookingShippingDocuments.mjs";
import { isLabelNotReady, mapLabelError } from "./labelErrors.mjs";
import {
  completedBookingNavState, hasCompletedBookingState, readCompletedBookingState, BOOKING_COMPLETION_TTL_MS, BOOKING_COMPLETION_STATE_KEY,
} from "./bookingCompletionMarker.mjs";

const A = SUCCESS_ACTION;
const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const BASIS = { ceShipmentId: 4711, orderConfirmation: { number: "CE-AB26-01004" } };
const beleg = (type, ordinal, label, extra = {}) => ({
  type, ordinal, label, status: "ready", downloadPath: `/api/shipments/4711/provider-documents/${type}/${ordinal}`, ...extra,
});

test("1 — Label als Datei vorhanden: „Versandlabel herunterladen“ ist die Hauptaktion, ohne zweiten Knopf daneben", () => {
  const p = bookingSuccessLabelPlan({ ...BASIS, labelStatus: "available" });
  assert.deepEqual([p.primary.kind, p.primary.text], [A.LABEL, "Versandlabel herunterladen"]);
  // v2.118: die Auftragsbestätigung steht in der Dokumentliste, nicht als zweiter Knopf neben der Hauptaktion.
  assert.deepEqual([p.secondary, p.feedback], [null, null]);
  assert.deepEqual([p.rows.length, p.rows[0].status, p.rows[0].tone, p.rows[0].action.kind], [1, "Bereit", ROW_TONE.READY, A.LABEL]);
  // Ein älterer Server ohne Labelstand: der bisherige Download bleibt.
  assert.equal(bookingSuccessLabelPlan({ ...BASIS }).primary.kind, A.LABEL);
});

test("2 — Mehrpaket: jede Datei eine Zeile in Serverreihenfolge, die erste ist die Hauptaktion", () => {
  const docs = [beleg("COLLECTION_LABEL", 0, "Abholetikett"), beleg("LABEL", 1, "Versandlabel 2 von 2", { carrierReference: "1Z999AA10123456784" }),
    beleg("LABEL", 0, "Versandlabel 1 von 2")];
  const p = bookingSuccessLabelPlan({ ...BASIS, shippingDocuments: docs, labelStatus: "pending" });
  assert.deepEqual(p.rows.map((r) => r.name), ["Versandlabel 1 von 2", "Versandlabel 2 von 2", "Abholetikett"]);
  assert.deepEqual(p.rows.map((r) => r.action.ariaLabel), [
    "Versandlabel 1 von 2 herunterladen", "Versandlabel 2 von 2 herunterladen", "Abholetikett herunterladen"]);
  assert.equal(p.rows[1].reference, "1Z999AA10123456784", "die Sendungsnummer des Carriers steht an der Zeile");
  assert.equal(p.rows[0].reference, null, "nie ein Platzhalter");
  assert.deepEqual([p.primary.kind, p.primary.text, p.primary.doc.ordinal], [A.DOCUMENT, "Versandlabel 1 von 2 herunterladen", 0]);
  assert.deepEqual([p.secondary.kind, p.secondary.text], [A.DOCUMENTS, BOOKING_SUCCESS_TEXT.allDocuments]);
  // Ein unsicherer Pfad wird nicht angeboten.
  const fremd = bookingSuccessLabelPlan({ ...BASIS, shippingDocuments: [beleg("LABEL", 0, "Versandlabel", { downloadPath: "https://evil.example/a.pdf" })] });
  assert.ok(fremd.rows.every((r) => r.action?.kind !== A.DOCUMENT));
});

test("3 — JUMiNGO, abrufbar: sofort „Versandlabel herunterladen“ — derselbe Klick lädt das PDF; „Bereit“ erst nach dem Laden", () => {
  const b = { ...BASIS, labelStatus: "pending", labelRetrievable: true };
  const vorher = bookingSuccessLabelPlan(b);
  assert.deepEqual([vorher.primary.kind, vorher.primary.text, vorher.secondary], [A.LABEL, "Versandlabel herunterladen", null]);
  // Die Zeile verspricht vor dem Klick kein „Bereit“: sie sagt, was der Klick liefert.
  assert.deepEqual([vorher.rows[0].status, vorher.rows[0].tone, vorher.rows[0].action.kind, vorher.rows[0].action.text],
    [BOOKING_LABEL_TEXT.retrievable, ROW_TONE.INFO, A.LABEL, "Herunterladen"]);
  assert.equal(BOOKING_LABEL_TEXT.retrievable, "PDF zum Ausdrucken");
  const nachher = bookingSuccessLabelPlan(b, { fetched: true });
  assert.deepEqual([nachher.primary.kind, nachher.primary.text, nachher.rows[0].status, nachher.rows[0].tone],
    [A.LABEL, "Versandlabel herunterladen", "Bereit", ROW_TONE.READY]);
  // Kein Wort „abrufen“ mehr in Hauptaktion, Zeile oder Ladezustand.
  const texte = JSON.stringify([vorher, nachher, BOOKING_LABEL_TEXT, BOOKING_SUCCESS_TEXT]);
  assert.doesNotMatch(texte, /abrufen|Abrufen|abgerufen/);
});

test("4 — LABEL_NOT_READY ist ein ruhiger Wartezustand; echte Fehler bleiben Fehler", () => {
  const b = { ...BASIS, labelStatus: "pending", labelRetrievable: true };
  const warten = bookingSuccessLabelPlan(b, { notReady: true });
  assert.deepEqual([warten.rows[0].tone, warten.rows[0].status, warten.rows[0].action.text], [ROW_TONE.WAIT, BOOKING_LABEL_TEXT.notReady, "Erneut versuchen"]);
  // Die Hauptaktion behält ihren Namen; die ruhige Rückmeldung steht darunter, kein zweiter Knopf daneben.
  assert.deepEqual([warten.primary.kind, warten.primary.text, warten.secondary], [A.LABEL, "Versandlabel herunterladen", null]);
  assert.deepEqual(warten.feedback, { tone: ROW_TONE.WAIT, text: BOOKING_LABEL_TEXT.notReady });
  assert.doesNotMatch(warten.rows[0].status, /fehlgeschlagen|Fehler/i, "ein Wartezustand behauptet keinen Fehlschlag");
  const fehler = bookingSuccessLabelPlan(b, { error: "Die Verbindung zum Server wurde unterbrochen." });
  assert.deepEqual([fehler.rows[0].tone, fehler.rows[0].action.text], [ROW_TONE.ERROR, "Erneut versuchen"]);
  assert.deepEqual(fehler.feedback, { tone: ROW_TONE.ERROR, text: "Die Verbindung zum Server wurde unterbrochen." });
  // Dasselbe für ein abgelegtes Label: Warten bleibt Warten, Fehler bleibt Fehler.
  const abgelegt = bookingSuccessLabelPlan({ ...BASIS, labelStatus: "available" }, { notReady: true });
  assert.deepEqual([abgelegt.rows[0].tone, abgelegt.feedback.tone, abgelegt.primary.kind], [ROW_TONE.WAIT, ROW_TONE.WAIT, A.LABEL]);
  // Erkennung am Code der Antwort; ohne Code genügt der Status 409.
  assert.equal(isLabelNotReady({ status: 409, code: "LABEL_NOT_READY" }), true);
  assert.equal(isLabelNotReady({ status: 409, code: null }), true);
  for (const e of [{ status: 500 }, { status: 409, code: "LABEL_RATE_LIMITED" }, { status: 404, code: "LABEL_NOT_FOUND" }, null, new Error("x")]) {
    assert.equal(isLabelNotReady(e), false, JSON.stringify(e));
  }
  assert.equal(mapLabelError(503, { error: "Fehler" }).includes("später"), true, "ein Serverfehler bleibt ein Fehlertext");
});

test("5 — Portal, beim Fahrer, gesondert, unbekannt: Stand an der Zeile, kein Download, Hauptaktion „Zu meinen Sendungen“", () => {
  const faelle = [
    [{ labelStatus: "pending", labelRetrievable: false }, BOOKING_LABEL_TEXT.pending, ROW_TONE.WAIT],
    [{ labelStatus: "carrier_at_pickup" }, BOOKING_LABEL_TEXT.carrierAtPickup, ROW_TONE.INFO],
    [{ labelStatus: "separate" }, BOOKING_LABEL_TEXT.separate, ROW_TONE.INFO],
    [{ labelStatus: "irgendwas" }, BOOKING_LABEL_TEXT.unknown, ROW_TONE.INFO],
  ];
  for (const [stand, text, ton] of faelle) {
    const p = bookingSuccessLabelPlan({ ...BASIS, ...stand });
    assert.deepEqual([p.rows[0].status, p.rows[0].tone, p.rows[0].action], [text, ton, null], JSON.stringify(stand));
    assert.deepEqual([p.primary.kind, p.secondary, p.feedback], [A.SHIPMENTS, null, null], JSON.stringify(stand));
  }
  assert.match(BOOKING_LABEL_TEXT.carrierAtPickup, /bei der Abholung am Paket angebracht\. Sie müssen kein Versandlabel ausdrucken/);
  // Ohne Sendungshandle: keine Labelzeile, nichts zum Herunterladen.
  const ohne = bookingSuccessLabelPlan({ labelStatus: "available" });
  assert.deepEqual([ohne.rows.length, ohne.primary.kind], [0, A.SHIPMENTS]);
});

test("6 — der allgemeine Labelhinweis ist entfallen — in keinem Text und keinem Baustein der Erfolgsseite", () => {
  const verboten = /Ihr Versandlabel wird erstellt|Sobald es verfügbar ist/;
  for (const datei of ["./bookingShippingDocuments.mjs", "./bookingSuccessActions.mjs", "../components/booking/BookingSuccessDocuments.jsx",
    "../components/booking/BookingSuccessStep.jsx", "../components/booking/BookingSuccessHero.jsx"]) {
    assert.doesNotMatch(lies(datei).replace(/\/\/.*$/gm, ""), verboten, datei);
  }
});

test("7 — „So geht es weiter“: Label, Übergabe, Sendungsverfolgung je Zustand", () => {
  const datei = bookingSuccessLabelPlan({ ...BASIS, labelStatus: "available" });
  const abruf = bookingSuccessLabelPlan({ ...BASIS, labelStatus: "pending", labelRetrievable: true });
  const fahrer = bookingSuccessLabelPlan({ ...BASIS, labelStatus: "carrier_at_pickup" });
  const portal = bookingSuccessLabelPlan({ ...BASIS, labelStatus: "pending" });
  assert.match(bookingSuccessNextSteps(datei, { serviceType: "dropoff" })[0], /herunterladen, ausdrucken/);
  assert.match(bookingSuccessNextSteps(abruf, { serviceType: "dropoff" })[0], /herunterladen, ausdrucken/);
  const warten = bookingSuccessLabelPlan({ ...BASIS, labelStatus: "pending", labelRetrievable: true }, { notReady: true });
  assert.match(bookingSuccessNextSteps(warten, { serviceType: "dropoff" })[0], /in wenigen Minuten bereit/);
  assert.match(bookingSuccessNextSteps(fahrer, { serviceType: "pickup" })[0], /Kein Ausdruck nötig/);
  assert.match(bookingSuccessNextSteps(portal, { serviceType: "dropoff" })[0], /erstellt der Versanddienstleister/);
  const [, shop, verfolgung] = bookingSuccessNextSteps(datei, { serviceType: "dropoff" }, { dropoffText: "DPD Pickup, Weg 1, 10115 Berlin" });
  assert.equal(shop, "Paket im gewählten Paketshop abgeben: DPD Pickup, Weg 1, 10115 Berlin.");
  assert.match(verfolgung, /^Tracking wird vorbereitet\./);
  assert.match(bookingSuccessNextSteps(datei, { serviceType: "pickup" }, { pickupText: "06.11.2026 · bereit ab 12:00 Uhr" })[1], /Abholung bereithalten: 06\.11\.2026/);
  assert.equal(bookingSuccessNextSteps(datei, { serviceType: "dropoff" }, { carrierName: "UPS" })[1], "Paket in einem Paketshop von UPS abgeben.");
  assert.equal(bookingSuccessNextSteps(datei, { trackingAvailable: false })[2], "Für diesen Tarif ist keine Sendungsverfolgung verfügbar.");
  // Mehrere Labels: jedes auf das zugehörige Paket.
  const mehr = bookingSuccessLabelPlan({ ...BASIS, shippingDocuments: [beleg("LABEL", 0, "Versandlabel 1 von 2"), beleg("LABEL", 1, "Versandlabel 2 von 2")] });
  assert.match(bookingSuccessNextSteps(mehr, {})[0], /zugehörige Paket/);
});

test("8 — Buchungsdetails: vollständige Anschriften nur aus gesetzten Werten", () => {
  const form = {
    s_company: "Muster GmbH", s_firstName: "Anna", s_lastName: "Berger", s_street: "Königstraße 10", s_addition: "",
    s_zip: "70173", s_city: "Stuttgart", s_country: "DE",
    r_company: "", r_firstName: "", r_lastName: "", r_fullName: "Max Muster", r_street: "Rue 1", r_zip: "75001", r_city: "Paris", r_country: "FR",
  };
  const name = (c) => ({ DE: "Deutschland", FR: "Frankreich" }[c]);
  assert.deepEqual(bookingSuccessAddressLines(form, "s", name), ["Muster GmbH", "Anna Berger", "Königstraße 10", "70173 Stuttgart", "Deutschland"]);
  assert.deepEqual(bookingSuccessAddressLines(form, "r", name), ["Max Muster", "Rue 1", "75001 Paris", "Frankreich"]);
  assert.deepEqual(bookingSuccessAddressLines(null, "s"), []);
});

test("9 — Neuladen: Vermerk im Navigationszustand statt des gebuchten Angebots — ohne Speichertechnik, 30 Minuten, nur dasselbe Konto", () => {
  const jetzt = 1_800_000_000_000;
  const zustand = completedBookingNavState({ userId: 42, orderConfirmationNumber: "CE-AB26-01004", now: jetzt });
  // Der Zustand ersetzt den bisherigen vollständig: kein Angebot, keine Anschrift, kein Betrag.
  assert.deepEqual(Object.keys(zustand), [BOOKING_COMPLETION_STATE_KEY]);
  assert.deepEqual(Object.keys(zustand[BOOKING_COMPLETION_STATE_KEY]).sort(), ["ab", "t", "u"], "nur Konto, Nummer, Zeitpunkt");
  assert.equal(hasCompletedBookingState(zustand), true);
  assert.equal(hasCompletedBookingState({ tariff: { id: 1 } }), false);
  assert.deepEqual(readCompletedBookingState(zustand, { userId: 42, now: jetzt + 60_000 }), { orderConfirmationNumber: "CE-AB26-01004", at: jetzt });
  assert.equal(readCompletedBookingState(zustand, { userId: 7, now: jetzt + 60_000 }), null, "ein anderes Konto sieht den Vermerk nie");
  assert.equal(readCompletedBookingState(zustand, { userId: 42, now: jetzt + BOOKING_COMPLETION_TTL_MS + 1 }), null, "nach 30 Minuten abgelaufen");
  assert.equal(readCompletedBookingState(zustand, { userId: 42, now: jetzt - 1 }), null, "kein Vermerk aus der Zukunft");
  assert.equal(readCompletedBookingState(null, { userId: 42, now: jetzt }), null);
  assert.deepEqual(completedBookingNavState({ userId: null }), {}, "ohne Konto kein Vermerk");
  // Keine Speichertechnik: der Vermerk lebt nur im Verlaufseintrag des Tabs (Datenschutzerklärung §12 bleibt zutreffend).
  const vermerk = lies("./bookingCompletionMarker.mjs").replace(/\/\/.*$/gm, "");
  assert.ok(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(vermerk), "der Vermerk nutzt eine Speichertechnik");
  // Die Buchungsseite ersetzt nach dem Erfolg ihren Navigationszustand und zeigt beim Neuladen den Vermerk statt
  // „Kein Angebot ausgewählt" — ohne Abruf und ohne erneute Buchung.
  const seite = lies("../pages/BookingPage.jsx");
  assert.match(seite, /if \(!tariff && abgeschlosseneBuchung\) return \(/);
  assert.ok(seite.indexOf("if (!tariff && abgeschlosseneBuchung)") < seite.indexOf('<p className="text-muted mb-16">Kein Angebot ausgewählt</p>'));
  assert.match(seite, /clearFlow\(\);\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*navigate\(`\$\{location\.pathname\}\$\{location\.search\}`, \{\s*replace: true,\s*state: completedBookingNavState\(\{ userId: user\?\.id, orderConfirmationNumber: orderConfirmationNumberOf\(d\) \}\),/);
  assert.match(seite, /return navState && !hasCompletedBookingState\(navState\) \? navState : null;/, "der Vermerk gilt als Angebotszustand");
});

test("10 — Rahmen: auf der Erfolgsseite keine Schrittleiste und genau eine h1", () => {
  const seite = lies("../pages/BookingPage.jsx");
  assert.match(seite, /\{step !== 3 && \(\s*<div className="steps-bar mb-24">/);
  assert.match(seite, /setKopfNurWerkzeuge\(step === 3\);/);
  const shell = lies("../components/layout/DashboardLayout.jsx");
  assert.match(shell, /title=\{kopfNurWerkzeuge && activePage === "booking" \? null : ROUTE_HEADERS\[activePage\]\.title\}/);
  const kopf = lies("../components/ui/PageHeader.jsx");
  assert.match(kopf, /\{title && <h1 className="ce-page-header-title" id=\{titleId\}>\{title\}<\/h1>\}/);
  const hero = lies("../components/booking/BookingSuccessHero.jsx");
  assert.equal((hero.match(/<h1 /g) || []).length, 1);
  // Genau ein gefüllter Knopf auf der Erfolgsseite — die Hauptaktion; Zeilenaktionen sind ruhige Textknöpfe.
  const flaeche = ["BookingSuccessHero.jsx", "BookingSuccessDocuments.jsx", "BookingSuccessStep.jsx", "BookingSuccessDetails.jsx"]
    .map((d) => lies(`../components/booking/${d}`)).join("\n");
  assert.equal((flaeche.match(/btn-primary/g) || []).length, 1, "kein zweiter gefüllter Knopf");
  assert.equal((flaeche.match(/btn-outline/g) || []).length, 0, "keine Kapselknöpfe in der Dokumentliste");
  // Die Wege in den Kundenbereich stehen nachrangig am Ende — nicht im Kopf neben der Hauptaktion.
  assert.doesNotMatch(hero, /T\.newShipment|documentsLabel|booking-success-documents-link/);
  const schritt = lies("../components/booking/BookingSuccessStep.jsx");
  assert.ok(schritt.indexOf('className="bsx-fuss"') > schritt.indexOf("<BookingSuccessDetails"), "die Wege stehen nicht am Ende");
  // Die Ansprechpartnerkarte steht auf der Erfolgsseite kompakt (sie verdeckte offen ab 1280 px den Beleg).
  assert.match(schritt, /^\s*useAnsprechKarteKompakt\(\);$/m);
});
