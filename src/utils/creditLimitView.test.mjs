// Paket F (2026-10-23): der Buchungsrahmen in der Oberfläche — Lesen, Texte, Vorab-Hinweis,
// 409-Text, Admineingabe und Listenfilter. Run: node --test src/utils/creditLimitView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectCredit, creditFacts, bookingCreditHint, creditLimitExceededText, isCreditLimitExceeded,
  parseCreditLimitInput, creditLimitInputValue, matchesCreditFilter, creditRowText,
  CREDIT_TEXT, CREDIT_ADMIN_TEXT, CREDIT_LIMIT_EXCEEDED_CODE, CREDIT_FILTER_OPTIONS,
} from "./creditLimitView.mjs";

const SERVER = { credit: { limit: 2000, open: 450, reserved: 100, available: 1450, exhausted: false, currency: "EUR" } };
// Intl setzt zwischen Betrag und € ein geschütztes Leerzeichen — die Erwartungen hier schreiben ein normales.
const t = (v) => (typeof v === "string" ? v.replace(/[  ]/g, " ") : Array.isArray(v) ? v.map(t) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, t(x)])) : v);

test("1 — selectCredit liest Kundensicht, Adminzeile und 409-Körper; unvollständig → null", () => {
  assert.deepEqual(selectCredit(SERVER), { limit: 2000, open: 450, reserved: 100, available: 1450, exhausted: false, currency: "EUR" });
  assert.deepEqual(selectCredit({ limit: "2000", open: "0", reserved: "0", available: "2000" }),
    { limit: 2000, open: 0, reserved: 0, available: 2000, exhausted: false, currency: "EUR" });
  assert.equal(selectCredit({ creditLimit: { limit: 2000, open: 1500, reserved: 0, available: 500, amount: 500.01, currency: "EUR" } }).amount, 500.01);
  assert.equal(selectCredit({ credit: { limit: 2000 } }), null, "ohne Beträge");
  assert.equal(selectCredit(null), null);
  assert.equal(selectCredit({ user: {} }), null, "altes Backend ohne Rahmen");
  assert.equal(selectCredit({ limit: 0, open: 0, reserved: 0, available: 0 }).exhausted, true, "ohne Flag entscheidet der Spielraum");
});

test("2 — creditFacts: Beträge als Text, belegter Anteil 0…100, Satz für Screenreader", () => {
  const f = creditFacts(SERVER);
  assert.equal(f.show, true);
  assert.deepEqual(t([f.availableText, f.limitText, f.usedText, f.usedPercent, f.exhausted]),
    ["1.450,00 €", "2.000,00 €", "550,00 €", 28, false]);
  assert.equal(t(f.summary), "1.450,00 € von 2.000,00 € verfügbar · 550,00 € belegt");
  assert.equal(creditFacts({ credit: { limit: 0, open: 0, reserved: 0, available: 0, exhausted: true } }).usedPercent, 100, "Rahmen 0 ist voll");
  assert.equal(creditFacts({ credit: { limit: 100, open: 250, reserved: 0, available: 0, exhausted: true } }).usedPercent, 100, "nie über 100");
  assert.deepEqual(creditFacts(null), { show: false });
});

test("3 — Vorab-Hinweis der Buchungsseite: nur wenn der Betrag den Spielraum übersteigt oder der Rahmen ausgeschöpft ist", () => {
  assert.equal(bookingCreditHint(SERVER, 1450), null, "die Grenze selbst ist erlaubt");
  assert.equal(bookingCreditHint(SERVER, 1450.01), CREDIT_TEXT.hintExceeds(1450.01, 1450));
  assert.match(t(bookingCreditHint(SERVER, 1500)), /^Hinweis: Diese Buchung \(1\.500,00 €\) übersteigt Ihren verfügbaren Buchungsrahmen \(1\.450,00 €\)\./);
  assert.equal(bookingCreditHint({ credit: { limit: 2000, open: 2000, reserved: 0, available: 0, exhausted: true } }, 1), CREDIT_TEXT.hintExhausted);
  assert.equal(bookingCreditHint(null, 10), null, "altes Backend: kein Hinweis");
  assert.equal(bookingCreditHint(SERVER, null), null, "ohne Gesamtbetrag kein Hinweis");
  assert.equal(bookingCreditHint(SERVER, "abc"), null);
  assert.doesNotMatch(CREDIT_TEXT.hintExhausted + CREDIT_TEXT.exhaustedNote, /jumingo|transglobal|dhl|ups|anbieter/i);
});

test("4 — 409-Text nennt Betrag, Spielraum und Rahmen aus der Antwort; ohne Beträge der Rückfall; der Servertext wird nie durchgereicht", () => {
  const body = { error: "SERVERTEXT", code: CREDIT_LIMIT_EXCEEDED_CODE,
    creditLimit: { limit: 2000, open: 1500, reserved: 300, available: 200, amount: 250.5, currency: "EUR" } };
  assert.equal(isCreditLimitExceeded(body), true);
  assert.equal(t(creditLimitExceededText(body)),
    "Diese Buchung (250,50 €) überschreitet Ihren verfügbaren Buchungsrahmen (200,00 € von 2.000,00 €). "
    + "Es wurde nichts beauftragt. Bitte begleichen Sie offene Rechnungen oder wenden Sie sich an uns, wenn Sie einen höheren Rahmen benötigen.");
  assert.equal(creditLimitExceededText({ code: CREDIT_LIMIT_EXCEEDED_CODE, error: "SERVERTEXT" }), CREDIT_TEXT.exceededFallback);
  assert.doesNotMatch(creditLimitExceededText(body) + creditLimitExceededText({}), /SERVERTEXT/);
  assert.equal(isCreditLimitExceeded({ code: "PRICE_CHANGED" }), false);
  assert.equal(isCreditLimitExceeded(null), false);
});

test("5 — Admineingabe: deutsche und technische Schreibweise, Grenzen, zwei Nachkommastellen", () => {
  for (const [raw, value, text] of [["2.500,50", 2500.5, "2500,50"], ["2500.50", 2500.5, "2500,50"], ["2000", 2000, "2000,00"],
                                     ["0", 0, "0,00"], ["1.000.000", 1000000, "1000000,00"], [" 1 500 € ", 1500, "1500,00"], ["0,01", 0.01, "0,01"]]) {
    const p = parseCreditLimitInput(raw);
    assert.deepEqual([p.ok, p.value, p.text], [true, value, text], raw);
  }
  for (const schlecht of ["", "   ", "abc", "-1", "1.000.000,01", "2000,555", "2,000.50", "1e3", null, undefined, "12.34.56"]) {
    const p = parseCreditLimitInput(schlecht);
    assert.deepEqual([p.ok, p.error], [false, CREDIT_ADMIN_TEXT.invalid], String(schlecht));
  }
  assert.equal(creditLimitInputValue(SERVER), "2000,00");
  assert.equal(creditLimitInputValue({ credit: { limit: 3500.5, open: 0, reserved: 0, available: 3500.5 } }), "3500,50");
  assert.equal(creditLimitInputValue(null), "");
  assert.match(t(CREDIT_ADMIN_TEXT.confirmText(2000, 3500.5)), /von 2\.000,00 € auf 3\.500,50 €/);
});

test("6 — Adminliste: Filter und Kurzform je Zeile; ohne Rahmen (altes Backend) fällt die Zeile aus jedem Teilfilter", () => {
  const frei = { id: 1, credit: { limit: 2000, open: 500, reserved: 50, available: 1450, exhausted: false } };
  const voll = { id: 2, credit: { limit: 100, open: 100, reserved: 0, available: 0, exhausted: true } };
  const alt = { id: 3 };
  assert.deepEqual(CREDIT_FILTER_OPTIONS.map((o) => o.value), ["all", "exhausted", "available"]);
  assert.deepEqual([frei, voll, alt].filter((u) => matchesCreditFilter(u, "all")).map((u) => u.id), [1, 2, 3]);
  assert.deepEqual([frei, voll, alt].filter((u) => matchesCreditFilter(u, "exhausted")).map((u) => u.id), [2]);
  assert.deepEqual([frei, voll, alt].filter((u) => matchesCreditFilter(u, "available")).map((u) => u.id), [1]);
  assert.deepEqual([frei, voll, alt].filter((u) => matchesCreditFilter(u, undefined)).map((u) => u.id), [1, 2, 3]);
  assert.deepEqual(t(creditRowText(frei)), { text: "1.450,00 € frei", exhausted: false, title: "Rahmen 2.000,00 €, belegt 550,00 €" });
  assert.deepEqual(t(creditRowText(voll)), { text: "ausgeschöpft", exhausted: true, title: "Rahmen 100,00 €, belegt 100,00 €" });
  assert.equal(creditRowText(alt), null);
});
