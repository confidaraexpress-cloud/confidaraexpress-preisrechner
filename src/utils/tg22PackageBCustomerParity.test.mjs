// TG22 Paket B — Kundenfluss und Zusatzoptionen: die reinen Helfer.
//
// Die Verdrahtung auf den Seiten prüft tg22PackageBWiring.test.mjs, das gerenderte Verhalten
// tests/e2e/tg22PackageBParity.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  labelFormatOptionsOf, labelFormatSelectable, defaultLabelFormat, restoredLabelFormat,
  labelFormatBookPayload, labelDeliveryInfo,
} from "./labelFormatOptions.mjs";
import { sanitizeReferenceInput, REFERENCE_MAX_LENGTH } from "./referenceNumber.mjs";
import { businessTodayISO } from "./businessDate.mjs";
import { insuranceRestoreApplies, restoredInsuranceState } from "./insuranceRestore.mjs";
import {
  bookingSuccessAmountView, BOOKING_AMOUNT_MISSING_HINT, PROFILE_DASHBOARD_TARGET,
} from "./bookingSuccessView.mjs";
import { offerBlockedLabel, offerBlockedHint, OFFER_DATE_UNAVAILABLE_HINT } from "./offerIdentity.mjs";
import { normalizeBooking, emptyBooking, BOOKING_KEYS } from "./shippingFlowState.mjs";
import { draftBookingOptionsToFlow, buildDraftBookingOptions } from "./draftBookingOptions.mjs";
import { normalizeApiError } from "./apiError.mjs";
import { coverRepriceErrorText } from "./coverInsuranceView.mjs";
import {
  mapBookRestError, fordertNeuberechnung, BOOK_FEHLER, OFFER_ALREADY_USED_TEXT, REFERENCE_INVALID_TEXT,
} from "./bookingErrors.mjs";
import { buildResumeInitialState, RESUME_PAST_DATE_NOTICE } from "./formDraftsView.mjs";

const JUMINGO = { offerId: "j-1", labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"] };
const TG = { offerId: "tg-1", labelFormatOptions: [], labelSizes: ["A4", "Thermal"] };

/* ══════════ 1 — Labelformat als Fähigkeit des Angebots ══════════ */

test("1 — die Auswahl gibt es nur bei einer nicht leeren Serverliste (fail-closed)", () => {
  for (const t of [{}, null, undefined, { labelFormatOptions: null }, { labelFormatOptions: [] },
                   { labelFormatOptions: "A4" }, { labelFormatOptions: { 0: "A4" } }, TG]) {
    assert.deepEqual(labelFormatOptionsOf(t), [], JSON.stringify(t));
    assert.equal(labelFormatSelectable(t), false, JSON.stringify(t));
  }
  assert.deepEqual(labelFormatOptionsOf(JUMINGO), ["A4", "A6"]);
  assert.equal(labelFormatSelectable(JUMINGO), true);
  // Serverreihenfolge, keine Dubletten, kein Format ohne Beschriftung.
  assert.deepEqual(labelFormatOptionsOf({ labelFormatOptions: [" a6", "A4", "A6", "PDF", 4, null] }), ["A6", "A4"]);
  assert.deepEqual(labelFormatOptionsOf({ labelFormatOptions: ["PDF", "A5"] }), []);
});

test("2 — gesendet wird labelFormat nur, wenn die Auswahl gilt UND der Wert eine Option ist", () => {
  assert.deepEqual(labelFormatBookPayload(JUMINGO, "A4"), { labelFormat: "A4" });
  assert.deepEqual(labelFormatBookPayload(JUMINGO, "A6"), { labelFormat: "A6" });
  assert.deepEqual(labelFormatBookPayload(JUMINGO, "A5"), {});
  assert.deepEqual(labelFormatBookPayload(TG, "A4"), {}, "ein Angebot ohne Auswahl bekommt kein labelFormat");
  assert.deepEqual(labelFormatBookPayload({}, "A4"), {});
  assert.deepEqual(labelFormatBookPayload({ labelFormatOptions: ["A6"] }, "A4"), {});
  assert.ok(!("labelFormat" in labelFormatBookPayload(TG, "A6")));
});

test("3 — Wiederherstellung: der gespeicherte Wert nur, wenn DIESES Angebot ihn anbietet", () => {
  assert.equal(restoredLabelFormat(JUMINGO, "A6"), "A6");
  assert.equal(restoredLabelFormat(JUMINGO, "a6"), "A6");
  assert.equal(restoredLabelFormat(JUMINGO, "A5"), "A4");
  assert.equal(restoredLabelFormat(JUMINGO, undefined), "A4");
  assert.equal(restoredLabelFormat(TG, "A6"), "A4", "ein Angebot ohne Auswahl übernimmt kein A6");
  assert.equal(defaultLabelFormat({ labelFormatOptions: ["A6"] }), "A6");
  assert.equal(restoredLabelFormat({ labelFormatOptions: ["A6"] }, "A4"), "A6");
});

test("4 — der neutrale Lieferhinweis kommt aus labelSizes", () => {
  assert.equal(labelDeliveryInfo(TG), "Versandlabel verfügbar als DIN A4 und Thermodruck");
  assert.equal(labelDeliveryInfo({ labelSizes: ["A4", "THERMAL", "a4"] }), "Versandlabel verfügbar als DIN A4 und Thermodruck");
  assert.equal(labelDeliveryInfo({ labelSizes: ["Thermal"] }), "Versandlabel verfügbar als Thermodruck");
  assert.equal(labelDeliveryInfo({ labelSizes: ["A4", "A6", "Thermal"] }), "Versandlabel verfügbar als DIN A4, DIN A6 und Thermodruck");
  for (const t of [{}, null, { labelSizes: [] }, { labelSizes: "A4" }, { labelSizes: ["PDF", 7] }]) {
    assert.equal(labelDeliveryInfo(t), null, JSON.stringify(t));
  }
  // Kein Einkaufsname, keine Rohschreibweise.
  assert.doesNotMatch(labelDeliveryInfo(TG), /transglobal|jumingo|Thermal\b/i);
});

/* ══════════ 2 — Referenznummer ══════════ */

test("5 — Steuerzeichen, Zeilentrenner und Bidi-Zeichen verschwinden bei Eingabe und Wiederherstellung", () => {
  const z = (n) => String.fromCharCode(n);
  const verseucht = `AB${z(0)}C${z(9)}D${z(10)}E${z(0x1f)}F${z(0x7f)}G${z(0x85)}H${z(0x9f)}I${z(0x2028)}J${z(0x2029)}`
    + `K${z(0x200e)}L${z(0x200f)}M${z(0x202a)}N${z(0x202e)}O${z(0x2066)}P${z(0x2069)}Q${z(0x061c)}R<S>`;
  assert.equal(sanitizeReferenceInput(verseucht), "ABCDEFGHIJKLMNOPQRS");
  // Sichtbare Zeichen bleiben — auch Umlaute, Leerzeichen und Bindestriche.
  assert.equal(sanitizeReferenceInput("Bestellung Nr. Ä-4711 / KST 12"), "Bestellung Nr. Ä-4711 / KST 12");
  assert.equal(sanitizeReferenceInput("X".repeat(80)).length, REFERENCE_MAX_LENGTH);
  assert.equal(sanitizeReferenceInput(null), "");
  // Der Entwurf durchläuft dieselbe Bereinigung.
  const flow = draftBookingOptionsToFlow({ reference: { enabled: true, value: `R-1${z(0x202e)}${z(10)}2` } });
  assert.equal(flow.reference, "R-12");
  assert.ok(REFERENCE_INVALID_TEXT.length > 10);
});

test("6 — der Quelltext des Helfers enthält kein unsichtbares Zeichen", async () => {
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync(new URL("./referenceNumber.mjs", import.meta.url), "utf8");
  // Tab und Zeilenumbruch sind Formatierung; alles andere Unsichtbare wäre ein Fehler.
  const unsichtbar = [...quelle].filter((c) => {
    const n = c.charCodeAt(0);
    return (n < 32 && n !== 9 && n !== 10 && n !== 13) || (n >= 0x7f && n <= 0x9f)
      || n === 0x2028 || n === 0x2029 || (n >= 0x200e && n <= 0x200f) || (n >= 0x202a && n <= 0x202e)
      || (n >= 0x2066 && n <= 0x2069) || n === 0x061c;
  });
  assert.deepEqual(unsichtbar, []);
});

/* ══════════ 3 — Berliner Geschäftstag und Entwurfsdatum ══════════ */

test("7 — der Geschäftstag folgt Europe/Berlin, nicht der Gerätezone", () => {
  assert.equal(businessTodayISO(new Date("2026-09-11T22:30:00Z")), "2026-09-12", "Sommerzeit: 00:30 in Berlin");
  assert.equal(businessTodayISO(new Date("2026-09-11T21:59:59Z")), "2026-09-11");
  assert.equal(businessTodayISO(new Date("2026-01-15T23:00:00Z")), "2026-01-16", "Winterzeit: 00:00 in Berlin");
  assert.equal(businessTodayISO(new Date("2026-01-15T22:59:59Z")), "2026-01-15");
  assert.equal(businessTodayISO(new Date("x")), null);
  assert.match(businessTodayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test("8 — ein vergangenes Entwurfsdatum wird nicht ersetzt, sondern geleert und erklärt", () => {
  const s = buildResumeInitialState({ shippingOptions: { shippingDate: "2026-09-11" } }, { today: "2026-09-12" });
  assert.equal(s.shippingDate, null);
  assert.equal(s.shippingDateExpired, true);
  assert.match(RESUME_PAST_DATE_NOTICE, /Vergangenheit/);
  assert.match(RESUME_PAST_DATE_NOTICE, /Versanddatum/);
});

/* ══════════ 4 — Absicherung gehört zu genau einem Angebot ══════════ */

const GESPEICHERT = Object.freeze({
  step: 2, insuranceOfferKey: "tg-1", insuranceType: "transit_cover", insuranceValue: "250",
  insValueManual: true, goodsAreNew: true, goodsAreFragile: false,
});
const COVER = { selectionModel: "cover_value" };

test("9 — gleiches Angebot: Schritt, Absicherung, Wert und beide Antworten kommen zurück", () => {
  const t = { offerId: "tg-1", insuranceDetails: COVER, priceRevision: 7, ceShipmentId: 99 };
  assert.equal(insuranceRestoreApplies(GESPEICHERT, t), true);
  assert.deepEqual(restoredInsuranceState(GESPEICHERT, t), {
    step: 2, insuranceType: "transit_cover", insuranceValue: "250", insValueManual: true,
    goodsAreNew: true, goodsAreFragile: false,
  });
});

test("10 — anderes Angebot, fehlender Schlüssel oder Entwurf: neutraler Start", () => {
  const NEUTRAL = { step: 1, insuranceType: "none", insuranceValue: "", insValueManual: false,
                    goodsAreNew: null, goodsAreFragile: null };
  const faelle = [
    [GESPEICHERT, { offerId: "tg-2", insuranceDetails: COVER }, "anderes Angebot"],
    [{ ...GESPEICHERT, insuranceOfferKey: null }, { offerId: "tg-1", insuranceDetails: COVER }, "ohne gespeicherten Schlüssel"],
    [{ ...GESPEICHERT, insuranceOfferKey: undefined }, { offerId: "tg-1" }, "älterer Vorgang"],
    [GESPEICHERT, { insuranceDetails: COVER }, "Angebot ohne Identität"],
    [{ ...GESPEICHERT, insuranceOfferKey: "" }, {}, "null passt nie zu null"],
    [draftBookingOptionsToFlow(buildDraftBookingOptions({ referenceEnabled: true, reference: "R" })),
     { offerId: "tg-1", insuranceDetails: COVER }, "Entwurf"],
    [null, { offerId: "tg-1" }, "kein Vorgang"],
  ];
  for (const [flow, tarif, name] of faelle) {
    assert.equal(insuranceRestoreApplies(flow, tarif), false, name);
    assert.deepEqual(restoredInsuranceState(flow, tarif), NEUTRAL, name);
  }
});

test("11 — der Schlüssel liegt additiv und defensiv im Vorgang", () => {
  assert.ok(BOOKING_KEYS.includes("insuranceOfferKey"));
  assert.equal(emptyBooking().insuranceOfferKey, null);
  assert.equal(normalizeBooking({ insuranceOfferKey: " tg-1 " }).insuranceOfferKey, "tg-1");
  for (const falsch of [null, undefined, "", "   ", 42, {}, []]) {
    assert.equal(normalizeBooking({ insuranceOfferKey: falsch }).insuranceOfferKey, null, JSON.stringify(falsch));
  }
  // Ein Entwurf schreibt nie einen Schlüssel.
  assert.ok(!("insuranceOfferKey" in draftBookingOptionsToFlow({ labelFormat: { enabled: true, value: "A6" } })));
});

/* ══════════ 5 — Erfolgsbetrag vom Server ══════════ */

test("12 — Gesamtbetrag nur aus booking.amount; Aufschlüsselung nur bei Cent-Gleichheit", () => {
  const bestaetigt = (totalGross) => ({ hasConfirmedPrice: true, totalGross });
  assert.deepEqual(bookingSuccessAmountView({ amount: 24.68 }, bestaetigt(24.68)),
    { hasAmount: true, totalGross: 24.68, showBreakdown: true, hint: null });
  assert.deepEqual(bookingSuccessAmountView({ amount: 26.11 }, bestaetigt(24.68)),
    { hasAmount: true, totalGross: 26.11, showBreakdown: false, hint: null });
  assert.equal(bookingSuccessAmountView({ amount: 24.68 }, bestaetigt(24.675)).showBreakdown, true, "Rundung auf den Cent");
  assert.equal(bookingSuccessAmountView({ amount: 24.68 }, { hasConfirmedPrice: false, totalGross: 24.68 }).showBreakdown, false);
  assert.equal(bookingSuccessAmountView({ amount: "24.68" }, bestaetigt(24.68)).totalGross, 24.68);
  for (const booking of [{}, null, { amount: null }, { amount: "" }, { amount: -1 }, { amount: "abc" }, { amount: NaN }]) {
    assert.deepEqual(bookingSuccessAmountView(booking, bestaetigt(24.68)),
      { hasAmount: false, totalGross: null, showBreakdown: false, hint: BOOKING_AMOUNT_MISSING_HINT }, JSON.stringify(booking));
  }
  assert.match(BOOKING_AMOUNT_MISSING_HINT, /Auftragsbestätigung/);
  assert.match(BOOKING_AMOUNT_MISSING_HINT, /Rechnung/);
});

/* ══════════ 6 — Datum als Sperrgrund ══════════ */

test("13 — date_unavailable: eigener Satz und Handlungshinweis, nie „nächster Werktag“", () => {
  const t = { bookable: false, unavailableReason: "date_unavailable" };
  assert.equal(offerBlockedLabel(t), "Für dieses Abholdatum nicht verfügbar.");
  assert.equal(offerBlockedHint(t), "Bitte wählen Sie einen anderen Abholtermin.");
  assert.equal(OFFER_DATE_UNAVAILABLE_HINT, "Bitte wählen Sie einen anderen Abholtermin.");
  assert.equal(offerBlockedHint({ bookable: false, unavailableReason: "quote_only" }), null);
  assert.equal(offerBlockedHint({ bookable: true, unavailableReason: "date_unavailable" }), null);
  // Die ältere Datumsaussage bleibt wortgleich und bekommt keinen zusätzlichen Hinweis.
  assert.equal(offerBlockedLabel({ availableForDate: false }), "Nicht verfügbar für dieses Datum");
  assert.equal(offerBlockedHint({ availableForDate: false, unavailableReason: "date_unavailable" }), null);
  assert.doesNotMatch(`${offerBlockedLabel(t)} ${offerBlockedHint(t)}`, /nächste[rn]? Werktag/i);
});

/* ══════════ 7 — Fehlercodes des Vertrags ══════════ */

test("14 — COLLECTION_DATE_MISSING und LABEL_FORMAT_NOT_SUPPORTED führen zur Neuberechnung", () => {
  for (const [status, code] of [[409, "COLLECTION_DATE_MISSING"], [400, "LABEL_FORMAT_NOT_SUPPORTED"]]) {
    assert.equal(fordertNeuberechnung({ code }), true, code);
    const f = mapBookRestError(status, { code, error: "Rohtext" });
    assert.equal(f, BOOK_FEHLER.NEU_BERECHNEN, code);
    assert.doesNotMatch(f.message, /Rohtext|A4|A6|Label/);
  }
  for (const code of ["INVALID_REFERENCE_NUMBER", "BUSINESS_PROFILE_INCOMPLETE", "OFFER_ALREADY_USED"]) {
    assert.equal(fordertNeuberechnung({ code }), false, code);
  }
});

test("15 — OFFER_ALREADY_USED: wortgleich bei Buchung und Neubepreisung, Weg in die Sendungen", () => {
  assert.equal(OFFER_ALREADY_USED_TEXT, "Dieses Angebot wurde bereits verwendet. Bitte prüfen Sie Ihre Sendungen.");
  assert.equal(mapBookRestError(409, { code: "OFFER_ALREADY_USED" }).message, OFFER_ALREADY_USED_TEXT);
  assert.equal(coverRepriceErrorText(409, { code: "OFFER_ALREADY_USED" }), OFFER_ALREADY_USED_TEXT);
});

test("16 — BUSINESS_PROFILE_INCOMPLETE ist ein Geschäftsfall, keine abgelaufene Sitzung", () => {
  const n = normalizeApiError({ status: 422, body: { code: "BUSINESS_PROFILE_INCOMPLETE", error: "business profile incomplete" } });
  assert.equal(n.code, "BUSINESS_PROFILE_INCOMPLETE");
  assert.equal(n.type, "business");
  assert.notEqual(n.code, "SESSION_EXPIRED");
  assert.match(n.message, /Unternehmensprofil|Profil/);
  assert.doesNotMatch(n.message, /business profile incomplete|anmelden/i);
  assert.equal(PROFILE_DASHBOARD_TARGET, "/dashboard?page=profile");
});
