// Gutschein im Buchungsschritt 2 — Quelltext- und Verhaltenstests.
//
// Der wichtigste Punkt, den diese Datei absichert: Das FRONTEND entscheidet nie über
// Gültigkeit oder Höhe eines Rabatts. Es gibt keine Codeliste, keine Prozentrechnung und
// keinen Pfad, auf dem ein 0-Euro-Zustand ohne serverbestätigte Antwort entstehen kann.
//
// Ausführen: node --test src/utils/voucherUx.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VOUCHER_STATUS, VOUCHER_INVALID_MESSAGE, VOUCHER_ERROR_MESSAGE,
  normalizeVoucherInput, canSubmitVoucher, readVoucherResponse, voucherPriceLines,
  voucherInvalidationKey, shouldInvalidateVoucher, VOUCHER_PRICE_RELEVANT_KEYS,
} from "./voucherView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const bookingPage   = read("../pages/BookingPage.jsx");
const voucherModule = read("../components/booking/VoucherModule.jsx");
const priceSummary  = read("../components/booking/PriceSummaryModule.jsx");
const apiClient     = read("../api/client.js");
const calculatorCss = read("../styles/calculator.css");
const voucherViewSrc = read("./voucherView.mjs");

// Kommentare entfernen — sonst belegt eine Erklärung eine Zusicherung, die der Code nicht trägt.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
const pageCode    = stripComments(bookingPage);
const voucherCode = stripComments(voucherViewSrc);

// Die serverbestätigte Antwort, wie sie der Preview-Endpunkt liefert (Allowlist).
const APPLIED = {
  voucher: { applied: true, code: "jumingo-sandbox", percent: 100 },
  totals: {
    subtotalNet: 10.69, subtotalVat: 2.03, subtotalGross: 12.72,
    discountGross: 12.72, finalNet: 0, finalVat: 0, finalGross: 0,
  },
  testBooking: true,
};

// ── 1. Eingabe und Absendbarkeit ─────────────────────────────────────────────

test("1 leere/nur-Leerzeichen-Eingabe ist nicht absendbar", () => {
  assert.equal(normalizeVoucherInput("   "), "");
  assert.equal(canSubmitVoucher("", VOUCHER_STATUS.IDLE), false);
  assert.equal(canSubmitVoucher("   ", VOUCHER_STATUS.IDLE), false);
});

test("2 während der Prüfung ist kein zweites Absenden möglich", () => {
  assert.equal(canSubmitVoucher("jumingo-sandbox", VOUCHER_STATUS.CHECKING), false);
  assert.equal(canSubmitVoucher("jumingo-sandbox", VOUCHER_STATUS.IDLE), true);
});

test("3 die Eingabe wird NICHT auf Kleinschreibung normalisiert", () => {
  // Welche Schreibweise gilt, entscheidet der Server — das Frontend verändert den Wert nicht.
  assert.equal(normalizeVoucherInput("  JUMINGO-Sandbox "), "JUMINGO-Sandbox");
});

// ── 2. Auswertung der Serverantwort ──────────────────────────────────────────

test("4 bestätigte Antwort wird übernommen", () => {
  const r = readVoucherResponse(APPLIED);
  assert.equal(r.status, VOUCHER_STATUS.APPLIED);
  assert.equal(r.code, "jumingo-sandbox");
  assert.equal(r.percent, 100);
  assert.equal(r.totals.finalGross, 0);
  assert.equal(r.totals.discountGross, 12.72);
  assert.equal(r.testBooking, true);
});

test("5 applied !== true ist IMMER ungültig — auch mit vollständigen Beträgen", () => {
  for (const applied of [false, undefined, null, "true", 1]) {
    const r = readVoucherResponse({ ...APPLIED, voucher: { ...APPLIED.voucher, applied } });
    assert.equal(r.status, VOUCHER_STATUS.INVALID, `applied=${JSON.stringify(applied)}`);
    assert.equal(r.totals, null);
  }
});

test("6 fehlende Beträge machen die Antwort ungültig (fail-safe)", () => {
  const ohneFinal = readVoucherResponse({ ...APPLIED, totals: { ...APPLIED.totals, finalGross: null } });
  assert.equal(ohneFinal.status, VOUCHER_STATUS.INVALID);
  const ohneSub = readVoucherResponse({ ...APPLIED, totals: { ...APPLIED.totals, subtotalGross: undefined } });
  assert.equal(ohneSub.status, VOUCHER_STATUS.INVALID);
});

test("7 fehlender Code macht die Antwort ungültig", () => {
  const r = readVoucherResponse({ ...APPLIED, voucher: { applied: true, percent: 100 } });
  assert.equal(r.status, VOUCHER_STATUS.INVALID);
});

test("8 KRITISCH: finalGross = 0 ist ein gültiger Betrag, kein 'fehlt'", () => {
  const r = readVoucherResponse(APPLIED);
  assert.equal(r.totals.finalGross, 0);
  assert.equal(r.totals.finalNet, 0);
  assert.equal(r.totals.finalVat, 0);
  assert.notEqual(r.status, VOUCHER_STATUS.INVALID);
});

test("9 leere/unbrauchbare Antworten führen nie zu 'angewendet'", () => {
  for (const body of [null, undefined, {}, { voucher: null }, "text", 42]) {
    assert.equal(readVoucherResponse(body).status, VOUCHER_STATUS.INVALID);
  }
});

// ── 3. Preiszeilen ───────────────────────────────────────────────────────────

test("10 ohne Gutschein bleibt die Darstellung unverändert (ein Betrag)", () => {
  const lines = voucherPriceLines({ voucher: { status: VOUCHER_STATUS.IDLE }, fallbackGross: 12.72 });
  assert.equal(lines.hasVoucher, false);
  assert.equal(lines.finalGross, 12.72);
  assert.equal(lines.discountGross, null);
});

test("11 mit Gutschein: Zwischensumme, Rabatt und 0,00 € zu zahlen", () => {
  const lines = voucherPriceLines({ voucher: readVoucherResponse(APPLIED), fallbackGross: 12.72 });
  assert.equal(lines.hasVoucher, true);
  assert.equal(lines.subtotalGross, 12.72);
  assert.equal(lines.discountGross, 12.72);
  assert.equal(lines.finalGross, 0);
  assert.equal(lines.code, "jumingo-sandbox");
  assert.equal(lines.percent, 100);
});

test("12 ein nur GEPRÜFTER (nicht bestätigter) Gutschein ändert den Preis nicht", () => {
  for (const status of [VOUCHER_STATUS.CHECKING, VOUCHER_STATUS.INVALID, VOUCHER_STATUS.ERROR]) {
    const lines = voucherPriceLines({ voucher: { status, totals: APPLIED.totals }, fallbackGross: 12.72 });
    assert.equal(lines.hasVoucher, false, status);
    assert.equal(lines.finalGross, 12.72, status);
  }
});

// ── 4. Invalidierung ─────────────────────────────────────────────────────────

const BASIS = {
  tariffId: "t1", shipperTariffId: "1381", serviceType: "dropoff",
  insuranceType: "none", insuranceValue: "", goodsValue: "",
  weight: "2", length: "30", width: "20", height: "15", packageCount: 1,
  senderCountry: "DE", senderZip: "10115", recipientCountry: "DE", recipientZip: "80331",
  shippingDate: "2026-09-01", pickupWindow: "",
};

test("13 jede preisrelevante Änderung invalidiert den Gutschein", () => {
  const basisKey = voucherInvalidationKey(BASIS);
  for (const key of VOUCHER_PRICE_RELEVANT_KEYS) {
    const geaendert = voucherInvalidationKey({ ...BASIS, [key]: "GEAENDERT" });
    assert.equal(shouldInvalidateVoucher(basisKey, geaendert), true, `${key} muss invalidieren`);
  }
});

test("14 unveränderte Eingaben invalidieren NICHT", () => {
  const a = voucherInvalidationKey(BASIS);
  const b = voucherInvalidationKey({ ...BASIS });
  assert.equal(shouldInvalidateVoucher(a, b), false);
});

test("15 Referenznummer, Labelformat und E-Mail-Optionen sind NICHT preisrelevant", () => {
  for (const feld of ["referenceNumber", "labelFormat", "trackingEmail", "labelTrackingEmail"]) {
    assert.ok(!VOUCHER_PRICE_RELEVANT_KEYS.includes(feld), `${feld} darf nicht invalidieren`);
    const a = voucherInvalidationKey(BASIS);
    const b = voucherInvalidationKey({ ...BASIS, [feld]: "egal" });
    assert.equal(shouldInvalidateVoucher(a, b), false, feld);
  }
});

test("16 Versicherung, Warenwert und Abholfenster invalidieren", () => {
  for (const feld of ["insuranceType", "insuranceValue", "goodsValue", "pickupWindow"]) {
    assert.ok(VOUCHER_PRICE_RELEVANT_KEYS.includes(feld), `${feld} muss preisrelevant sein`);
  }
});

// ── 5. Sicherheit: keine Clientlogik ─────────────────────────────────────────

test("17 SICHERHEIT: nirgends im Frontend steht eine Regel 'Code ⇒ Rabatt'", () => {
  for (const [name, src] of [["voucherView", voucherCode], ["VoucherModule", stripComments(voucherModule)],
                             ["PriceSummaryModule", stripComments(priceSummary)], ["BookingPage", pageCode]]) {
    assert.ok(!/jumingo-sandbox/i.test(src), `${name} darf den Sandboxcode nicht kennen`);
    assert.ok(!/===\s*100|percent\s*===\s*100/.test(src), `${name} darf 100 % nicht selbst feststellen`);
  }
});

test("18 SICHERHEIT: das Frontend rechnet keinen Rabatt", () => {
  // Kein Subtrahieren von Beträgen, keine Prozentrechnung in der Gutscheinkette.
  for (const [name, src] of [["voucherView", voucherCode], ["PriceSummaryModule", stripComments(priceSummary)]]) {
    assert.ok(!/(subtotal|gross|net)\w*\s*[-*/]\s*(discount|voucher|percent)/i.test(src),
      `${name} darf keinen Rabatt berechnen`);
    assert.ok(!/\/\s*100\b/.test(src), `${name} darf keine Prozentrechnung enthalten`);
  }
});

test("19 SICHERHEIT: der Buchungspayload trägt NUR den Code, keine Beträge", () => {
  const payload = pageCode.slice(pageCode.indexOf("await apiFetch(`/api/jumingo/book`"),
                                 pageCode.indexOf("if (r.status === 409"));
  assert.ok(/voucherCode: voucher\.code/.test(payload), "der Code muss mitgesendet werden");
  for (const verboten of ["discountGross", "voucherPercent", "voucherValue", "finalGross",
                          "subtotalGross", "discount:", "percent:"]) {
    assert.ok(!payload.includes(verboten), `${verboten} darf nicht im /book-Payload stehen`);
  }
});

test("20 SICHERHEIT: der Code geht nur bei serverbestätigtem Gutschein mit", () => {
  assert.ok(pageCode.includes("...(voucherApplied && voucher.code ? { voucherCode: voucher.code } : {})"),
    "voucherCode muss an voucherApplied hängen");
  assert.ok(/const voucherApplied\s*=\s*voucher\.status === VOUCHER_STATUS\.APPLIED/.test(pageCode),
    "voucherApplied muss aus dem Serverstatus kommen");
});

test("21 SICHERHEIT: die Preisanzeige stammt aus der Serverantwort, nicht aus dem Tarif", () => {
  const lines = voucherPriceLines({ voucher: readVoucherResponse(APPLIED), fallbackGross: 999 });
  assert.equal(lines.finalGross, 0, "der Fallbackwert darf den Serverwert nie überschreiben");
  assert.equal(lines.subtotalGross, 12.72);
});

// ── 6. Anbindung und Platzierung ─────────────────────────────────────────────

test("22 es gibt genau EINEN Aufrufpfad zum Preview-Endpunkt", () => {
  assert.ok(apiClient.includes("/api/jumingo/cart-total"), "API-Helper fehlt");
  const direkt = (pageCode.match(/apiFetch\(\s*[`"']\/api\/jumingo\/cart-total/g) || []).length;
  assert.equal(direkt, 0, "BookingPage darf den Endpunkt nicht selbst aufrufen");
  assert.ok(pageCode.includes("await checkVoucher({"), "der zentrale Helper muss benutzt werden");
});

test("23 das Gutscheinfeld steht unter der Preisübersicht und VOR Bestätigungen/Bestellknopf", () => {
  const preis   = bookingPage.indexOf("<PriceSummaryModule");
  const voucherI = bookingPage.indexOf("<VoucherModule");
  const terms   = bookingPage.indexOf("<TermsModule");
  const action  = bookingPage.indexOf("<BookingActionModule");
  assert.ok(preis > -1 && voucherI > -1 && terms > -1 && action > -1, "alle vier Module müssen existieren");
  assert.ok(preis < voucherI, "Gutschein muss NACH der Preisübersicht stehen");
  assert.ok(voucherI < terms,  "Gutschein muss VOR den Bestätigungen stehen");
  assert.ok(voucherI < action, "Gutschein muss VOR dem Bestellknopf stehen");
});

test("24 keine zweite große Karte — das Feld nutzt die vorhandenen Primitives", () => {
  assert.ok(!/className="[^"]*\bcalc-panel\b/.test(voucherModule), "keine eigene Panel-Karte");
  assert.ok(!/className="[^"]*\bce-card\b/.test(voucherModule), "keine eigene ce-card");
  assert.ok(/className="field-input booking-voucher-input"/.test(voucherModule), ".field-input erwartet");
  assert.ok(/className="btn btn-outline booking-voucher-apply"/.test(voucherModule), ".btn erwartet");
});

test("25 Abbruch und Aufräumen sind vorhanden", () => {
  assert.ok(/voucherAbort\.current\.abort\(\)/.test(pageCode), "AbortController fehlt");
  assert.ok(/if \(e && e\.name === "AbortError"\) return;/.test(pageCode),
    "ein Abbruch darf keine Fehlermeldung erzeugen");
});

test("26 während der Prüfung ist die Bestellung gesperrt", () => {
  assert.ok(/if \(voucherChecking\) return;/.test(pageCode), "doBook-Guard fehlt");
  assert.ok(pageCode.includes("voucherChecking={voucherChecking}"), "der Knopf muss den Zustand kennen");
});

test("27 Fehlertexte sind getrennt und nennen keine Interna", () => {
  assert.notEqual(VOUCHER_INVALID_MESSAGE, VOUCHER_ERROR_MESSAGE);
  for (const text of [VOUCHER_INVALID_MESSAGE, VOUCHER_ERROR_MESSAGE]) {
    for (const verboten of ["JUMiNGO", "jumingo", "shipment", "tariff", "Tarif", "500", "admin", "Rolle"]) {
      assert.ok(!text.includes(verboten), `„${text}" darf „${verboten}" nicht nennen`);
    }
  }
  assert.equal(VOUCHER_INVALID_MESSAGE, "Gutscheincode konnte nicht angewendet werden.");
});

test("28 der Testlabel-Hinweis erscheint nur bei bestätigter Testbuchung", () => {
  assert.ok(/\{voucherApplied && \(/.test(pageCode), "Hinweis muss an voucherApplied hängen");
  assert.ok(/Testlabel/.test(bookingPage), "Testlabel-Warnung fehlt");
  assert.ok(/nicht für den\s*\n?\s*realen Versand/.test(bookingPage), "Warntext fehlt");
});

test("29 die Styles nutzen nur Foundation-Tokens (keine eigenen Farbwerte)", () => {
  const block = calculatorCss.slice(calculatorCss.indexOf(".booking-voucher {"),
                                    calculatorCss.indexOf(".booking-printer-note {"));
  assert.ok(block.length > 0, "Gutschein-Styles fehlen");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), "kein Hexwert im Gutscheinblock");
  assert.ok(!/rgba?\(/.test(block), "kein rgb/rgba im Gutscheinblock");
  assert.ok(/flex-wrap: wrap/.test(block), "die Zeile muss umbrechen können (mobil)");
});

test("30 kein Gutschein im Entwurfs-/Vorgangsschema (form_drafts bleibt unberührt)", () => {
  // Der Gutschein ist eine Checkout-Entscheidung und gehört nicht in einen Formularentwurf.
  const flowState = read("./shippingFlowState.mjs");
  assert.ok(!/voucher/i.test(flowState), "shippingFlowState darf keinen Gutschein kennen");
  assert.ok(!/voucher/i.test(read("./shipmentFormSnapshot.mjs").toString()),
    "der Entwurfs-Snapshot darf keinen Gutschein kennen");
});
