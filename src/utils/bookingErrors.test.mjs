// Buchungs-Restpfad (POST /api/jumingo/book) + Quelltext-Invarianten.
//
// Deckt die Audit-FAILs #1/#2 ab: ungeschütztes r.json(), rohe
// „Failed to fetch"-Banner, 404/429/5xx im Sammelzweig ununterschieden.
//
// TG22 Paket B — bewusst geändert: nach dem Absenden der FINALEN Buchung sagen ein 5xx ohne
// Code, ein unlesbarer Erfolg, ein Zeitlimit und ein Verbindungsabbruch nichts darüber, ob beim
// Anbieter bestellt wurde. Sie bekamen bis hierher „Bitte versuchen Sie es erneut" und sind jetzt
// der offene Ausgang (PRUEFUNG_LAEUFT) — ohne Wiederholungsaufforderung, mit dem Weg in die
// Sendungsliste.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buchungsFlaeche } from "../testing/quelltext.mjs";
import {
  mapBookRestError, mapBookThrownError, mapBookUnreadableSuccess, istUnklarerAusgang, BOOK_FEHLER,
} from "./bookingErrors.mjs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — 429 und 404 sind unterscheidbar; ein 5xx ohne Code ist ein offener Ausgang", () => {
  assert.equal(mapBookRestError(429, {}), BOOK_FEHLER.RATE_LIMITED);
  assert.match(BOOK_FEHLER.RATE_LIMITED.message, /zu viele Buchungsanfragen/);
  assert.equal(mapBookRestError(500, { error: "Buchung fehlgeschlagen" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(502, null), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(504, { error: "Gateway Timeout" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(404, { error: "Sendung nicht gefunden" }), BOOK_FEHLER.ANGEBOT_WEG);
  assert.match(BOOK_FEHLER.ANGEBOT_WEG.message, /erneut berechnen/);
});

test("2 — Retry-Semantik: wiederholbar nur, wo Wiederholen wirklich hilft", () => {
  assert.equal(BOOK_FEHLER.RATE_LIMITED.retryable, true);
  assert.equal(BOOK_FEHLER.PRUEFUNG_LAEUFT.retryable, false, "ein offener Ausgang darf nie zum Wiederholen einladen");
  assert.equal(BOOK_FEHLER.ANGEBOT_WEG.retryable, false, "ein verschwundenes Angebot wird durch Wiederholen nicht besser");
  assert.ok(!/versuchen Sie es erneut/i.test(BOOK_FEHLER.ANGEBOT_WEG.message), "kein pauschaler Retry-Hinweis bei nicht wiederholbarem Fehler");
  // Die Texte, die zum erneuten Buchen aufforderten, gibt es für die finale Buchung nicht mehr.
  for (const weg of ["SERVER", "NETZ", "ZEIT_UNBEKANNT"]) {
    assert.equal(BOOK_FEHLER[weg], undefined, `${weg} existiert noch`);
  }
});

test("3 — leerer/unlesbarer Body: 4xx technisch, 2xx offener Ausgang", () => {
  const u = mapBookRestError(400, null);
  assert.equal(u, BOOK_FEHLER.UNLESBAR);
  assert.match(u.message, /Antwort des Servers konnte nicht verarbeitet werden/);
  // Ein Erfolgsstatus ohne lesbares Buchungsobjekt ist KEIN Erfolg — aber gebucht sein KANN.
  assert.equal(mapBookUnreadableSuccess(), BOOK_FEHLER.PRUEFUNG_LAEUFT);
});

test("4 — unerwarteter Reststatus mit lesbarem Body läuft über den zentralen Normalizer", () => {
  const konflikt = mapBookRestError(409, { error: "Diese Sendung wurde bereits verarbeitet." });
  assert.ok(konflikt.title && konflikt.message, "Titel+Text müssen gesetzt sein");
  assert.match(konflikt.message, /bereits verarbeitet/);
});

test("5 — Zeitlimit, Netzabbruch, Abbruch: offener Ausgang, nie „Failed to fetch“, nie „erneut buchen“", () => {
  const faelle = [
    new TypeError("Failed to fetch"),
    Object.assign(new Error("x"), { name: "AbortError" }),
    Object.assign(new Error("x"), { name: "TimeoutError" }),
    Object.assign(new Error("x"), { name: "ApiTimeoutError" }),
    new Error("irgendwas"),
    null,
  ];
  for (const e of faelle) {
    const f = mapBookThrownError(e);
    assert.equal(f, BOOK_FEHLER.PRUEFUNG_LAEUFT, `${e && e.name} ist kein offener Ausgang`);
    assert.equal(f.retryable, false);
    assert.ok(!/Failed to fetch/.test(f.message));
    assert.ok(!/versuchen Sie (es|die Buchung) erneut/i.test(f.message), "der Text fordert zum Wiederholen auf");
    assert.match(f.message, /Sendungen/, "der Text muss in die Sendungsliste führen");
    assert.match(f.message, /NICHT erneut/);
  }
  assert.equal(istUnklarerAusgang(BOOK_FEHLER.PRUEFUNG_LAEUFT), true);
  for (const anderer of [BOOK_FEHLER.RATE_LIMITED, BOOK_FEHLER.ANGEBOT_WEG, BOOK_FEHLER.UNLESBAR, null, {}]) {
    assert.equal(istUnklarerAusgang(anderer), false);
  }
});

test("6 — BookingPage: Restpfad nutzt den Mapper, Body defensiv, kein Sammelwurf mehr", () => {
  const page = strip(buchungsFlaeche());
  assert.ok(!/throw new Error\(d\.error \|\| "Buchung fehlgeschlagen"\)/.test(page), "der alte Sammelwurf muss ersetzt sein");
  assert.ok(!/setError\(e\.message\)/.test(page), "rohes e.message darf nicht mehr angezeigt werden");
  assert.match(page, /mapBookRestError\(r\.status, d\)/);
  assert.match(page, /mapBookThrownError\(e\)/);
  assert.match(page, /try \{ d = await r\.json\(\); \} catch \{ d = null; \}/, "der Body muss defensiv gelesen werden");
  // 2xx ohne lesbares Objekt → kein Erfolg, keine Navigation.
  assert.match(page, /mapBookUnreadableSuccess\(\)/);
  // Spezialzweige unangetastet: Zoll-Codes, Fenster-/Preisdialog, Adress-/Zoll-4xx.
  for (const marker of ["PICKUP_WINDOW_CHANGED", "PRICE_CHANGED", "COMMERCIAL_INVOICE_BOOK_ERRORS", "setAddressError("]) {
    assert.ok(page.includes(marker), `Spezialzweig ${marker} fehlt`);
  }
  // Barrierefreiheit des Banners (beide Darstellungsformen).
  assert.match(page, /FormAlert tone="error" title=\{error\.title\}/);
  assert.match(page, /className="alert alert-error mb-16" role="alert"/);
});

test("7 — keine Navigation/Erfolgsanzeige im Fehlerfall (setStep(3) nur im Erfolgszweig)", () => {
  const page = strip(buchungsFlaeche());
  const doBook = page.slice(page.indexOf("const r = await apiFetch(`/api/jumingo/book`"), page.indexOf("const handlePriceChangeRecalculate"));
  const erfolgIdx = doBook.indexOf("setBooking(d); setStep(3);");
  assert.ok(erfolgIdx > -1, "Erfolgszweig fehlt");
  // Alle Fehlerzweige davor enden mit return/loading-Ende — kein setStep(3) vor den Guards.
  const vorErfolg = doBook.slice(0, erfolgIdx);
  assert.match(vorErfolg, /mapBookRestError/, "Restpfad muss VOR dem Erfolgszweig behandelt sein");
  assert.match(vorErfolg, /mapBookUnreadableSuccess/, "Unlesbar-Guard muss VOR dem Erfolgszweig stehen");
});

test("8 — TG22 Paket B: offene Ausgänge ersetzen den Bestellknopf (Konflikt), statt nur zu warnen", () => {
  const page = strip(buchungsFlaeche());
  const doBook = page.slice(page.indexOf("const doBook = async"), page.indexOf("const handlePriceChangeRecalculate"));
  // Restpfad: ein offener Ausgang geht in den Konflikt, alles andere bleibt Fehlerbanner.
  assert.match(doBook, /if \(istUnklarerAusgang\(fehler\)\) \{\s*setConflict\(fehler\.message\);/);
  // Unlesbarer Erfolg und geworfene Fehler: Konflikt, kein setError.
  assert.match(doBook, /setConflict\(mapBookUnreadableSuccess\(\)\.message\)/);
  assert.match(doBook, /setConflict\(mapBookThrownError\(e\)\.message\)/);
  assert.ok(!/setError\(mapBookThrownError/.test(doBook), "ein geworfener Fehler landet wieder im Banner");
  assert.ok(!/setError\(mapBookUnreadableSuccess/.test(doBook), "ein unlesbarer Erfolg landet wieder im Banner");
});

test("Paritätsaudit A4/A5/O1 — Paketshop, Zusatzadressen und Neubepreisung entscheiden am Code", async () => {
  const {
    PARCELSHOP_REQUIRED_TEXT, paketshopFehlt, zusatzmailFehler, LABEL_EMAIL_NOT_AVAILABLE_TEXT,
    ZUSATZMAIL_HINWEIS, repriceFehlerText, OFFER_ALREADY_USED_TEXT,
  } = await import("./bookingErrors.mjs");
  const { schneideZwischen } = await import("../testing/quelltext.mjs");

  // A4: nur der 409 mit diesem Code; der Text sagt, dass nichts beauftragt wurde.
  const tg = { error: "Die Buchung ist nicht zustande gekommen. Es wurde nichts beauftragt.", code: "PARCELSHOP_REQUIRED" };
  assert.equal(paketshopFehlt(409, tg), true);
  assert.equal(paketshopFehlt(400, tg), false);
  assert.equal(paketshopFehlt(409, { code: "OFFER_NOT_BOOKABLE" }), false);
  assert.equal(paketshopFehlt(409, null), false);
  assert.match(PARCELSHOP_REQUIRED_TEXT, /Paketshop/);
  assert.match(PARCELSHOP_REQUIRED_TEXT, /nichts beauftragt/);

  // A5: LABEL_EMAIL_NOT_AVAILABLE gehört an die Labeladresse, oben nur der Hinweis.
  const label = zusatzmailFehler(
    { error: "Für diesen Tarif wird das Versandlabel bei der Abholung am Paket angebracht.", code: "LABEL_EMAIL_NOT_AVAILABLE", field: "labelTrackingEmail" },
    "Für diesen Tarif wird das Versandlabel bei der Abholung am Paket angebracht.");
  assert.deepEqual(label, { feld: "labelTrackingEmail", feldText: LABEL_EMAIL_NOT_AVAILABLE_TEXT, text: ZUSATZMAIL_HINWEIS });
  assert.match(LABEL_EMAIL_NOT_AVAILABLE_TEXT, /schalten Sie diese Option aus/);
  // Ein Formatfehler des Servers steht an seinem Feld; ohne Text bleibt der bisherige Satz oben.
  assert.deepEqual(zusatzmailFehler({ field: "trackingEmail" }, "Bitte geben Sie eine gültige E-Mail-Adresse an."),
    { feld: "trackingEmail", feldText: "Bitte geben Sie eine gültige E-Mail-Adresse an.", text: ZUSATZMAIL_HINWEIS });
  assert.deepEqual(zusatzmailFehler({ field: "labelTrackingEmail" }, ""),
    { feld: "labelTrackingEmail", feldText: null, text: "Bitte prüfen Sie die zusätzliche E-Mail-Adresse." });
  assert.equal(zusatzmailFehler({ field: "reference" }, "x"), null);
  assert.equal(zusatzmailFehler(null, "x"), null);

  // O1: jeder 4xx-Code der gestuften Neubepreisung hat einen Kundentext ohne Feldnamen; unbekannt → null.
  const codes = ["TARIFF_SELECTION_INVALID", "OFFER_NOT_BOOKABLE", "OFFER_NOT_FOUND", "OFFER_MISMATCH",
    "OFFER_ALREADY_USED", "TARIFF_NOT_FOUND", "TARIFF_AMBIGUOUS", "TARIFF_NOT_INSURABLE",
    "INSURANCE_SELECTION_INVALID", "CONTENT_DESCRIPTION_INVALID", "GOODS_VALUE_REQUIRED", "GOODS_VALUE_INVALID",
    "INSURANCE_VALUE_INVALID", "SHIPMENT_NOT_FOUND", "SHIPMENT_NOT_DRAFT"];
  for (const code of codes) {
    const text = repriceFehlerText({ error: "goodsValue: muss zwischen 1 und 9999999 liegen", code });
    assert.equal(typeof text, "string", code);
    assert.ok(!/goodsValue|extraInsuranceValue|shipperTariffId|insuranceType|contentDescription|[A-Z]{2,}_[A-Z]/.test(text), `${code}: ${text}`);
  }
  assert.equal(repriceFehlerText({ code: "OFFER_ALREADY_USED" }), OFFER_ALREADY_USED_TEXT);
  assert.ok(!/Preis hat sich geändert/.test(repriceFehlerText({ code: "SHIPMENT_NOT_DRAFT" })));
  assert.equal(repriceFehlerText({ code: "UNBEKANNT" }), null);
  assert.equal(repriceFehlerText({ code: "toString" }), null);
  assert.equal(repriceFehlerText(null), null);

  // Die Buchungsseite nutzt die Regeln — A4 vor den Absicherungszweigen und dem Sammelzweig.
  const page = strip(buchungsFlaeche());
  const konflikt = schneideZwischen(page, "if (paketshopFehlt(r.status, d))", "setConflict(asStr(d?.error)", "409-Kette");
  assert.match(konflikt, /setStep\(1\);\s*setError\(PARCELSHOP_REQUIRED_TEXT\);/);
  assert.ok(konflikt.indexOf("isInsured && coverModel && isCoverBookError(d)") > -1, "A4 muss vor den Absicherungszweigen stehen");
  assert.match(page, /const zusatzmail = zusatzmailFehler\(d, backendMsg\);/);
  assert.match(page, /labelTrackingEmailError=\{\(emailShowErrors && labelTrackingEmailProblem\) \|\| zusatzmailFeldFehler\("labelTrackingEmail"\)\}/);
  assert.match(page, /trackingEmailError=\{\(emailShowErrors && trackingEmailProblem\) \|\| zusatzmailFeldFehler\("trackingEmail"\)\}/);
  assert.match(page, /coverRepriceErrorText\(r\.status, d\) : \(repriceFehlerText\(d\) \|\|/);
});
