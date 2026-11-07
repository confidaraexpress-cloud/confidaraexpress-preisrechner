// Kennzahl-Detailfenster (Betreiberentscheidung 2026-11-07): Anfrage, fail-closed Antwortprüfung, Texte je Kennzahl,
// aufgeklappte Angaben, Zeitformate und Lage des Fensters. Reine Logik — die Komponente prüfen Quelltextanker
// (components/dashboard/kpiDetailFenster.test.mjs) und der Browser (tests/e2e/kpiDetailFenster.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KPI_FENSTER, KPI_FENSTER_LIMIT, KPI_FENSTER_FRISCH_MS, KPI_FENSTER_MASSE, KPI_FENSTER_SHEET, KPI_FENSTER_TEXT,
  kpiFensterUrl, kpiFensterAntwort, kpiFensterStats, kpiFensterFrisch, kpiFensterUmfang, tagVon, zeitVon, kalendertag,
  naechsterSchritt, kpiZeile, kpiDetailAngaben, kpiFensterLage, kpiFensterScrollBedarf, sendungWort,
} from "./kpiDetailView.mjs";
import { SHIPMENT_KPI_KEYS } from "./kpis.mjs";

const zeile = (id, f = {}) => ({
  id, status: "label_ready", selected_carrier: "dhl", applied_tariff_display_name: "Standard",
  created_at: "2026-11-05T09:12:00.000Z", order_confirmation_number: `CE-AB26-0${id}`, tracking_number: null, tracking_references: [],
  sender_address: { company: "Muster GmbH", postalCode: "73207", city: "Plochingen", country: "DE" },
  recipient_address: { company: "Nordhafen Technik GmbH", fullName: "Erika Muster", postalCode: "20457", city: "Hamburg", country: "de" },
  customer_status: "label_ready", is_active: true, is_delayed: false, tracking_stale: false, is_test_booking: false, ...f,
});
const STATS = { total: 9, active: 5, in_transit: 2, delivered_this_month: 3, delayed: 2, new_24h: 1, test_bookings: 1 };

test("1 — Anfrage: nur die vier Schlüssel der Allowlist, immer die fünf neuesten (limit=5)", () => {
  assert.equal(KPI_FENSTER_LIMIT, 5);
  for (const k of SHIPMENT_KPI_KEYS) assert.equal(kpiFensterUrl(k), `/kunde/shipments?kpi=${k}&limit=5`);
  for (const fremd of ["", "ACTIVE", "active ", "delayed&limit=100", "__proto__", null, undefined, 1, ["active"]]) {
    assert.equal(kpiFensterUrl(fremd), null, `kein Filter: ${String(fremd)}`);
  }
  assert.deepEqual(Object.keys(KPI_FENSTER), SHIPMENT_KPI_KEYS, "je Kennzahl genau ein Fensterkopf, in der Reihenfolge der Karten");
});

test("2 — Antwort: Trefferzahl und Zeilen nur, wenn der Server genau diesen Filter bestätigt", () => {
  const ok = kpiFensterAntwort("delayed", { shipments: [zeile(1), zeile(2)], filter: { kpi: "delayed", total: 12 }, stats: STATS });
  assert.equal(ok.status, "ready");
  assert.equal(ok.total, 12);
  assert.equal(ok.shipments.length, 2);
  assert.deepEqual(ok.stats, STATS);
  // COUNT kann als Ziffernfolge ankommen.
  assert.equal(kpiFensterAntwort("delayed", { shipments: [zeile(1)], filter: { kpi: "delayed", total: "7" } }).total, 7);
  // Mehr als fünf Zeilen werden nie gezeigt.
  const sieben = Array.from({ length: 7 }, (_, i) => zeile(i + 1));
  assert.equal(kpiFensterAntwort("active", { shipments: sieben, filter: { kpi: "active", total: 7 } }).shipments.length, 5);
});

test("3 — Antwort fail-closed: Altbackend, fremder Filter, fehlende oder unbrauchbare Zahl, Widerspruch → nicht verfügbar", () => {
  const nicht = { status: "unavailable" };
  const fall = (body, kpi = "delayed") => assert.deepEqual(kpiFensterAntwort(kpi, body), nicht, JSON.stringify(body));
  fall(null);
  fall([]);
  fall("x");
  fall({ shipments: [zeile(1)], stats: STATS });                                    // Altbackend ohne ?kpi=: ungefilterte Liste
  fall({ shipments: [zeile(1)], filter: { kpi: "active", total: 1 } });              // anderer Filter
  for (const total of [null, undefined, "", true, false, -1, 1.5, "1.5", "12a", {}, [], NaN, Infinity]) {
    fall({ shipments: [zeile(1)], filter: { kpi: "delayed", total } });               // Number(null) wäre 0
  }
  fall({ shipments: "keine", filter: { kpi: "delayed", total: 1 } });
  fall({ shipments: [zeile(1), zeile(2)], filter: { kpi: "delayed", total: 1 } });   // mehr Zeilen als Treffer
  fall({ shipments: [], filter: { kpi: "delayed", total: 3 } });                      // Treffer ohne Zeile
  fall({ shipments: [zeile(1), null], filter: { kpi: "delayed", total: 2 } });         // unbrauchbare Zeile
  fall({ shipments: [], filter: { kpi: "delayed", total: 0 } }, "xyz");              // unbekannte Kennzahl
  // 0 ist eine gültige Antwort — der Leerzustand, keine Fehlanzeige.
  assert.deepEqual(kpiFensterAntwort("delayed", { shipments: [], filter: { kpi: "delayed", total: 0 } }),
    { status: "ready", total: 0, shipments: [], stats: null });
});

test("4 — die Karten übernehmen das Aggregat nur vollständig und mit derselben Zahl wie das Fenster", () => {
  const antwort = (total, stats) => ({ status: "ready", total, shipments: [], stats });
  assert.deepEqual(kpiFensterStats("delayed", antwort(2, STATS)), STATS);
  assert.equal(kpiFensterStats("delayed", antwort(3, STATS)), null, "Zahl des Fensters ≠ Aggregat");
  assert.equal(kpiFensterStats("delayed", antwort(2, { ...STATS, new_24h: undefined })), null, "unvollständiges Aggregat");
  assert.equal(kpiFensterStats("delayed", antwort(2, null)), null);
  assert.equal(kpiFensterStats("delayed", { status: "unavailable" }), null);
});

test("5 — ein Stand derselben Übersicht gilt 30 s, nur bestätigt und nie aus der Zukunft", () => {
  assert.equal(KPI_FENSTER_FRISCH_MS, 30_000);
  const antwort = { status: "ready", total: 1, shipments: [], stats: null };
  assert.equal(kpiFensterFrisch({ zeit: 1_000, antwort }, 1_000 + 29_999), true);
  assert.equal(kpiFensterFrisch({ zeit: 1_000, antwort }, 1_000 + 30_000), false);
  assert.equal(kpiFensterFrisch({ zeit: 5_000, antwort }, 4_000), false, "Uhr zurückgestellt");
  assert.equal(kpiFensterFrisch({ zeit: 1_000, antwort: { status: "unavailable" } }, 1_001), false);
  assert.equal(kpiFensterFrisch(null), false);
  assert.equal(kpiFensterFrisch({ zeit: NaN, antwort }, 1), false);
});

test("6 — Umfang und Einheit: „Die 5 neuesten von 12“ nur bei mehr Treffern als Zeilen", () => {
  assert.equal(kpiFensterUmfang(12, 5), "Die 5 neuesten von 12");
  assert.equal(kpiFensterUmfang(3, 1), "Die neueste von 3");
  for (const [t, g] of [[5, 5], [3, 3], [0, 0], [4, 5], [12, 0], [NaN, 5], [12, "5"]]) assert.equal(kpiFensterUmfang(t, g), null, `${t}/${g}`);
  assert.equal(sendungWort(1), "Sendung");
  assert.equal(sendungWort(0), "Sendungen");
  assert.equal(sendungWort(14), "Sendungen");
});

test("7 — Zeitpunkte in Europe/Berlin, Kalendertage ohne Zeitzone, Unlesbares ergibt nichts", () => {
  assert.equal(tagVon("2026-11-05T22:30:00.000Z"), "05.11.2026");
  assert.equal(tagVon("2026-11-05T23:30:00.000Z"), "06.11.2026", "Berliner Tag, nicht der UTC-Tag");
  assert.equal(tagVon("2026-07-31T22:30:00.000Z"), "01.08.2026", "Sommerzeit");
  assert.equal(zeitVon("2026-11-07T08:12:00.000Z"), "07.11.2026, 09:12 Uhr");
  assert.equal(kalendertag("2026-11-03"), "03.11.2026");
  assert.equal(kalendertag("2026-11-03T00:00:00.000Z"), "03.11.2026", "Datumsspalte als ISO-Mitternacht");
  for (const v of [null, undefined, "", "gestern", 0, {}, "03.11.2026"]) {
    assert.equal(tagVon(v), null);
    assert.equal(zeitVon(v), null);
    assert.equal(kalendertag(v), null);
  }
});

test("8 — nächster Schritt allein aus dem Kundenstand des Servers", () => {
  assert.equal(naechsterSchritt(zeile(1, { customer_status: "booked" })), "Übergabe an den Versanddienstleister");
  assert.equal(naechsterSchritt(zeile(1, { customer_status: "label_ready" })), "Paket mit dem Versandlabel übergeben");
  assert.equal(naechsterSchritt(zeile(1, { customer_status: "in_transit" })), "Zustellung durch den Versanddienstleister");
  assert.equal(naechsterSchritt(zeile(1, { customer_status: "exception" })), "Sendungsverfolgung prüfen");
  assert.equal(naechsterSchritt(zeile(1, { customer_status: "booking" })), "Sie müssen aktuell nichts tun.");
  const shop = { dropoff_location: { name: "Paketshop Kiosk", street: "Marktstraße 4", postalCode: "73207", city: "Plochingen", country: "DE" } };
  assert.equal(naechsterSchritt(zeile(1, { customer_status: "label_ready", ...shop })), "Paket mit dem Versandlabel im gewählten Paketshop abgeben");
  assert.equal(naechsterSchritt(zeile(1, { customer_status: "booked", ...shop })), "Abgabe im gewählten Paketshop");
  for (const st of ["delivered", "cancelled", "other", "unbekannt", null, undefined]) {
    assert.equal(naechsterSchritt(zeile(1, { customer_status: st })), null, String(st));
  }
});

test("9 — Zeile: Vorgangsnummer nur als Auftragsbestätigung, Carrier · Service, Zeitangabe je Kennzahl", () => {
  const s = zeile(1201, { business_order_number: "CE-BS26-01201", order_number: "JUM-778899", delivery_date_max: "2026-11-04",
    delivered_at: "2026-11-06T13:05:00.000Z", is_delayed: true });
  const z = kpiZeile("delayed", s, { carrierName: "DHL" });
  assert.equal(z.nummer, "CE-AB26-01201");
  assert.deepEqual(z.versand, ["DHL", "Standard"]);
  assert.deepEqual(z.zeit, { text: "Liefertermin 04.11.2026 überschritten", ton: "warnung" });
  // Ohne Auftragsbestätigung: keine Ersatznummer (nie CE-BS, nie die Anbieter-Ordernummer, nie die ID).
  assert.equal(kpiZeile("delayed", { ...s, order_confirmation_number: null }).nummer, null);
  assert.deepEqual(kpiZeile("delayed", { ...s, is_delayed: false }, { carrierName: "DHL" }).zeit, { text: "Liefertermin 04.11.2026", ton: null });
  assert.deepEqual(kpiZeile("delivered_this_month", s).zeit, { text: "Zustellung gemeldet am 06.11.2026", ton: null });
  assert.deepEqual(kpiZeile("in_transit", s).zeit, { text: "Voraussichtlich bis 04.11.2026", ton: null });
  assert.deepEqual(kpiZeile("in_transit", { ...s, delivery_date_max: null }).zeit, { text: "Gebucht am 05.11.2026", ton: null });
  assert.deepEqual(kpiZeile("active", s).zeit, { text: "Gebucht am 05.11.2026", ton: null });
  assert.equal(kpiZeile("delivered_this_month", { ...s, delivered_at: null }).zeit, null, "keine erfundene Zustellung");
  assert.deepEqual(kpiZeile("active", { ...s, applied_tariff_display_name: null }, { carrierName: " " }).versand, [], "nichts Leeres");
});

test("10 — aufgeklappt je Kennzahl: nur vorhandene Angaben, in der Reihenfolge ihrer Bedeutung", () => {
  const keys = (kpi, s) => kpiDetailAngaben(kpi, s).map((a) => a.key);
  const voll = zeile(7, {
    tracking_status: "in_transit", last_tracked_at: "2026-11-07T08:12:00.000Z", delivery_date_max: "2026-11-04",
    tracking_number: "00340434161094041", tracking_references: ["00340434161094041"], requested_shipping_date: "2026-11-06",
    delivered_at: "2026-11-06T13:05:00.000Z", reference_number: "PO-2026-118", is_delayed: true,
  });
  // Die Zeitangabe der Zeile (Gebucht am / Voraussichtlich bis / Zustellung gemeldet am / Liefertermin … überschritten)
  // steht aufgeklappt nicht noch einmal.
  assert.deepEqual(keys("active", voll), ["schritt", "versanddatum", "von", "nach", "tracking", "referenz"]);
  assert.deepEqual(keys("in_transit", voll), ["trackingstand", "trackingstandVom", "von", "nach", "tracking", "buchungsdatum", "referenz"]);
  assert.deepEqual(keys("delivered_this_month", voll), ["von", "nach", "tracking", "buchungsdatum", "referenz"]);
  assert.deepEqual(keys("delayed", voll), ["trackingstand", "trackingstandVom", "von", "nach", "tracking", "buchungsdatum", "referenz"]);
  // Ohne Termin trägt die Zeile „Gebucht am“ — dann fehlt aufgeklappt das Buchungsdatum, nicht der (leere) Termin.
  assert.deepEqual(keys("in_transit", { ...voll, delivery_date_max: null }),
    ["trackingstand", "trackingstandVom", "von", "nach", "tracking", "referenz"]);
  const wert = (kpi, key) => kpiDetailAngaben(kpi, voll).find((a) => a.key === key);
  assert.equal(wert("in_transit", "trackingstand").wert, "Unterwegs");
  assert.equal(wert("in_transit", "trackingstandVom").wert, "07.11.2026, 09:12 Uhr");
  assert.equal(wert("delayed", "buchungsdatum").wert, "05.11.2026");
  assert.equal(wert("active", "von").wert, "73207 Plochingen, DE");
  assert.equal(wert("active", "nach").wert, "20457 Hamburg, DE", "nur der Ort, kein Name");
  assert.equal(wert("active", "tracking").art, "nummer");
  assert.equal(wert("active", "referenz").art, "referenz");
  assert.equal(wert("active", "versanddatum").wert, "06.11.2026");
  assert.deepEqual(kpiDetailAngaben("unbekannt", voll), []);
});

test("11 — fehlende Trackingdaten: ein sachlicher Hinweis statt einer Lücke oder eines geratenen Werts", () => {
  const ohne = zeile(8, { customer_status: "booked", status: "booked", is_delayed: true, delivery_date_max: "2026-11-02" });
  const a = kpiDetailAngaben("delayed", ohne);
  const tracking = a.find((x) => x.key === "tracking");
  assert.deepEqual([tracking.art, tracking.wert], ["hinweis", "Für diese Sendung liegt noch keine Trackingnummer vor."]);
  const stand = a.find((x) => x.key === "trackingstand");
  assert.deepEqual([stand.art, stand.wert], ["hinweis", "Vom Versanddienstleister liegt noch kein Trackingstand vor."]);
  assert.ok(!a.some((x) => x.key === "trackingstandVom"), "kein Zeitpunkt ohne Abruf");
  // Ein unbekannter Stand („unknown“) wird nicht benannt — mit Zeitpunkt bleibt nur der Zeitpunkt.
  const unbekannt = kpiDetailAngaben("in_transit", { ...ohne, tracking_status: "unknown", last_tracked_at: "2026-11-07T08:12:00.000Z" });
  assert.ok(!unbekannt.some((x) => x.key === "trackingstand"));
  assert.ok(unbekannt.some((x) => x.key === "trackingstandVom"));
  // Mehrere Trackingnummern: vollständig, als Liste.
  const mehr = kpiDetailAngaben("in_transit", { ...ohne, tracking_references: ["4501234567", "4501234568"], tracking_number: "4501234567" });
  const liste = mehr.find((x) => x.key === "tracking");
  assert.deepEqual([liste.label, liste.art, liste.wert], ["Trackingnummern", "liste", ["4501234567", "4501234568"]]);
});

test("12 — keine internen Angaben: weder Anbieter- noch Bestell- noch Preisfelder noch Rohtexte gelangen ins Fenster", () => {
  const s = zeile(9, { provider: "jumingo", order_number: "JUM-778899", business_order_number: "CE-BS26-00009",
    jumingo_shipment_id: "js-1", provider_booking_reference: "TG-REF-1", price_net: 12, price_final: 14.28,
    tracking_status_text: "Provider says: in delivery", tracking_status: "in_transit", is_delayed: true, delivery_date_max: "2026-11-04" });
  const alles = JSON.stringify([...SHIPMENT_KPI_KEYS.map((k) => kpiDetailAngaben(k, s)), ...SHIPMENT_KPI_KEYS.map((k) => kpiZeile(k, s))]);
  for (const verboten of ["jumingo", "JUM-778899", "CE-BS26", "js-1", "TG-REF-1", "14.28", "14,28", "Provider says"]) {
    assert.ok(!alles.toLowerCase().includes(verboten.toLowerCase()), `${verboten} im Fenster`);
  }
  const texte = JSON.stringify({ KPI_FENSTER, KPI_FENSTER_TEXT }).toLowerCase();
  for (const name of ["jumingo", "transglobal", "provider", "anbieter"]) assert.ok(!texte.includes(name), `${name} im Fenstertext`);
  assert.equal(KPI_FENSTER_TEXT.alleAnzeigen, "Alle anzeigen");
  assert.equal(KPI_FENSTER.delayed.titel, "Verzögerte Sendungen");
});

test("13 — die Icons der Fensterköpfe stammen aus dem eigenen System", () => {
  const icons = readFileSync(new URL("../components/ui/Icon.jsx", import.meta.url), "utf8");
  for (const { icon } of Object.values(KPI_FENSTER)) {
    assert.match(icons, new RegExp(`^\\s{2}${icon}:`, "m"), `Icon ${icon} fehlt im System`);
  }
  assert.deepEqual(Object.values(KPI_FENSTER).map((k) => k.icon), ["package", "packageMove", "check", "clockDelay"]);
});

const VP = { breite: 1440, hoehe: 900, oben: 0, unten: 0 };
const karte = (left, top, width = 268, height = 174) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("14 — Lage: unter der Karte, linksbündig; an der rechten Kante rechtsbündig; immer im Fenster", () => {
  const links = kpiFensterLage({ anker: karte(280, 244), hoehe: 420, viewport: VP });
  assert.deepEqual({ ...links }, { top: 430, left: 280, breite: 440, maxHoehe: 900 - 418 - 12 - 16, pfeil: 134, seite: "unten" });
  const rechts = kpiFensterLage({ anker: karte(1139, 244), hoehe: 420, viewport: VP });
  assert.equal(rechts.left, 1139 + 268 - 440, "rechtsbündig mit der Karte");
  assert.equal(rechts.pfeil, 1139 + 134 - rechts.left, "der Pfeil zeigt auf die Mitte der Karte");
  // Schmales Fenster: Breite bis auf den Rand, links und rechts je 16 px.
  const schmal = kpiFensterLage({ anker: karte(380, 200, 180), hoehe: 300, viewport: { breite: 420, hoehe: 900 } });
  assert.deepEqual([schmal.left, schmal.breite], [KPI_FENSTER_MASSE.rand, 420 - 2 * KPI_FENSTER_MASSE.rand]);
  assert.ok(schmal.pfeil <= schmal.breite - KPI_FENSTER_MASSE.pfeilRand, "der Pfeil bleibt aus der Ecke");
});

test("15 — Lage: zu wenig Platz darunter → darüber, wenn dort mehr ist; sonst niedriger mit innerem Scrollen", () => {
  const oben = kpiFensterLage({ anker: karte(280, 600), hoehe: 420, viewport: VP });
  assert.equal(oben.seite, "oben");
  assert.equal(oben.top, 600 - 12 - 420);
  const knapp = kpiFensterLage({ anker: karte(280, 244), hoehe: 900, viewport: VP });
  assert.deepEqual([knapp.seite, knapp.maxHoehe, knapp.top], ["unten", 900 - 418 - 12 - 16, 430]);
  const darueber = kpiFensterLage({ anker: karte(280, 300), hoehe: 600, viewport: { ...VP, hoehe: 520 } });
  assert.deepEqual([darueber.seite, darueber.maxHoehe, darueber.top], ["oben", 300 - 12 - 16, 16]);
  const winzig = kpiFensterLage({ anker: karte(280, 200), hoehe: 600, viewport: { ...VP, hoehe: 420 } });
  assert.equal(winzig.maxHoehe, KPI_FENSTER_MASSE.minHoehe, "nie niedriger als lesbar");
  assert.equal(winzig.top, KPI_FENSTER_MASSE.rand, "aber nie über den oberen Rand hinaus");
  // Feste Leisten zählen nicht als Platz: Kopfleiste oben, Demo-Leiste unten.
  const leisten = kpiFensterLage({ anker: karte(40, 300), hoehe: 420, viewport: { breite: 768, hoehe: 1024, oben: 56, unten: 60 } });
  assert.equal(leisten.maxHoehe, 1024 - 60 - 474 - 12 - 16);
});

test("16 — flaches Fenster: die Seite rückt nur so weit, dass das Fenster Platz hat — die Karte bleibt sichtbar", () => {
  assert.deepEqual([KPI_FENSTER_MASSE.genug, KPI_FENSTER_MASSE.ideal], [356, 420]);
  assert.equal(kpiFensterScrollBedarf({ anker: karte(280, 244), viewport: VP }), 0);
  // 1280 × 800: darunter 372 px — genug, die Seite bleibt stehen (keine Mini-Sprünge).
  assert.equal(kpiFensterScrollBedarf({ anker: karte(280, 226), viewport: { breite: 1280, hoehe: 800 } }), 0);
  // 1024 × 768, rechte Karte der zweiten Reihe: darüber 402 px — das Fenster klappt nach oben, die Seite bleibt stehen.
  assert.equal(kpiFensterScrollBedarf({ anker: karte(645, 430), viewport: { breite: 1024, hoehe: 768 } }), 0);
  // 1366 × 768: darunter 322 px, darüber 216 px — die Seite rückt, bis unter der Karte 420 px frei sind.
  assert.equal(kpiFensterScrollBedarf({ anker: karte(280, 244), viewport: { breite: 1366, hoehe: 768 } }), 420 - (768 - 418 - 12 - 16));
  // 1280 × 640: weder darunter (248 px) noch darüber (162 px) genug — höchstens bis die Karte oben am Rand steht.
  const flach = kpiFensterScrollBedarf({ anker: karte(280, 190), viewport: { breite: 1280, hoehe: 640 } });
  assert.equal(flach, Math.min(420 - (640 - 364 - 12 - 16), 190 - 16));
  assert.ok(190 - flach >= KPI_FENSTER_MASSE.rand, "die Karte rückt nicht aus dem Bild");
  const mitLeiste = kpiFensterScrollBedarf({ anker: karte(20, 120), viewport: { breite: 768, hoehe: 520, oben: 56 } });
  assert.ok(120 - mitLeiste >= 56 + KPI_FENSTER_MASSE.rand, "nie unter die feste Kopfleiste");
});

test("17 — Sheet statt Fenster auf schmalen oder flachen Bildschirmen, in em", () => {
  assert.equal(KPI_FENSTER_SHEET, "(max-width: 40em), (max-height: 30em)");
});
