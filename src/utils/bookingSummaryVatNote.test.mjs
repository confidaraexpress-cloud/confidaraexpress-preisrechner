// G6/M9 (Betreiberentscheidung 2026-10-28): der MwSt.-Hinweis am Preis des Belegs (Live-Zusammenfassung).
//
// Bis 2026-10-27 stand der Satz unter dem Preis der Karte „Ausgewähltes Angebot“; seit Preis, Übergabe und
// Zustellung auf der Buchungsseite an EINER Stelle stehen, liest ihn der Beleg aus vatIncludedNote — derselbe
// Wortlaut, dieselben Fälle: mit Bruttobetrag „inkl. 19 % MwSt.“ (bei bestätigter steuerfreier Absicherung
// „… auf Versand“), ohne Bruttobetrag „exkl. MwSt.“, ohne Betrag und nach einer Preisänderung nichts.
//
// Run: node --test src/utils/bookingSummaryVatNote.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { vatIncludedNote } from "./bookingSummaryView.mjs";

test("1 — Bruttobetrag vorhanden: „inkl. 19 % MwSt.“, mit bestätigter Absicherung „… auf Versand“", () => {
  assert.equal(vatIncludedNote({ baseShippingGross: 12.5, baseShippingNet: 10.5 }), "inkl. 19 % MwSt.");
  assert.equal(vatIncludedNote({ hasConfirmedPrice: true, totalGross: 30.1, totalNet: 25.3 }), "inkl. 19 % MwSt.");
  assert.equal(vatIncludedNote({ hasConfirmedPrice: true, totalGross: 30.1, totalNet: 25.3, insuranceGross: 4.2 }),
    "inkl. 19 % MwSt. auf Versand");
  // Eine noch nicht bestätigte Absicherung ändert den Satz nicht — der Preis gilt dann nur dem Versand.
  assert.equal(vatIncludedNote({ baseShippingGross: 12.5, insuranceGross: 4.2 }), "inkl. 19 % MwSt.");
});

test("2 — nur Netto: „exkl. MwSt.“; ohne Betrag und nach einer Preisänderung kein Hinweis", () => {
  assert.equal(vatIncludedNote({ baseShippingNet: 10.5 }), "exkl. MwSt.");
  assert.equal(vatIncludedNote({}), null);
  assert.equal(vatIncludedNote(null), null);
  assert.equal(vatIncludedNote({ isPriceChanged: true, totalGross: 30.1, hasConfirmedPrice: true }), null);
});

test("3 — vorläufiger Preis (Angaben fehlen noch): derselbe Hinweis zum Betrag des Angebots", () => {
  assert.equal(vatIncludedNote({ isPriceInputsRequired: true, baseShippingGross: 12.5, baseShippingNet: 10.5 }),
    "inkl. 19 % MwSt.");
});
