/* TG-8F — der vorläufige Preis im Preisrechner.

   Kein Netz, kein Browser, kein Backend, keine Buchung.

   Der Preisrechner fragt Transglobal über den minimalen Quote-Endpunkt ab. Dessen Betrag
   kann preisrelevante Zuschläge noch nicht enthalten — gemessen 10,62 minimal gegen 13,27
   im vollständigen Quote mit privater Zustelladresse. Bis TG-8F stand dieser Betrag
   typografisch gleichwertig neben vollständig berechneten Preisen.

   Die drei Leitfragen dieser Suite:
     1. Reagiert die Oberfläche AUSSCHLIESSLICH auf die providerneutrale Preissemantik?
     2. Bleibt alles unberührt, was nicht vorläufig ist — JUMiNGO und der vollständige
        Transglobal-Quote?
     3. Überlebt der Hinweis den Netto-/Brutto-Umschalter und die Wiederherstellung? */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isIndicativePrice, INDICATIVE_PRICE_LABEL, INDICATIVE_PRICE_EXPLANATION }
  from "./priceCompletenessView.mjs";
import { assignBadges } from "./offerBadges.js";
import { offerBlocked } from "./offerIdentity.mjs";
import { normalizeScope } from "./shippingFlowState.mjs";

const wurzel    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies      = (p) => fs.readFileSync(path.join(wurzel, p), "utf8");
const offerCard = lies("components/offers/OfferCard.jsx");
const helfer    = lies("utils/priceCompletenessView.mjs");
const rechner   = lies("pages/CalculatorPage.jsx");
const badgesSrc = lies("utils/offerBadges.js");

/* Kommentare zählen nicht als sichtbarer Text: die Karte erklärt seit jeher in
   Kommentaren, woher ein Feld stammt. Ein Test, der die mitmisst, misst die falsche
   Sache. Zeilenweise, damit CRLF den Filter nicht aushebelt (`.` matcht kein `\r`). */
const ohneKommentar = (q) => q
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((z) => z.replace(/(^|\s)\/\/[^\r\n]*/, "")).join("\n");

/* ── Angebote, wie der Server sie liefert ─────────────────────────────────── */

// JUMiNGO: vollständig berechnet, buchbar, keine Pflichtangabe.
const jumingo = (over = {}) => ({
  offerId: "1".repeat(32), publicCarrierId: "ups", publicServiceName: "Expressversand",
  serviceType: "pickup", netPrice: 24, vatAmount: 4.56, finalPrice: 28.56, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 2,
  bookable: true, unavailableReason: null, requiredPriceInputs: [],
  priceCompleteness: "complete", ...over,
});

// Transglobal aus dem VOLLSTÄNDIGEN Quote: nicht buchbar, quote_only, mit Pflichtangabe —
// und trotzdem vollständig berechnet. Genau der Fall, den keine Heuristik trifft.
const tgFull = (over = {}) => ({
  offerId: "2".repeat(32), publicCarrierId: "dpd", publicServiceName: "Standardversand",
  serviceType: "dropoff", netPrice: 10.62, vatAmount: 2.02, finalPrice: 12.64, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 2,
  bookable: false, unavailableReason: "quote_only",
  requiredPriceInputs: ["deliveryIsResidential"],
  priceCompleteness: "complete", ...over,
});

// Transglobal aus dem MINIMALEN Quote: in allem gleich, nur die Preisgrundlage ist offen.
const tgMinimal = (over = {}) => tgFull({ priceCompleteness: "indicative", ...over });

/* ══════════ §A  DAS SIGNAL ════════════════════════════════════════════════ */

test("F1 — ein ausdrücklich vorläufiger Preis wird erkannt", () => {
  assert.equal(isIndicativePrice(tgMinimal()), true);
});

test("F2 — der vollständige Transglobal-Quote wird NICHT markiert", () => {
  assert.equal(isIndicativePrice(tgFull()), false);
});

test("F3 — JUMiNGO wird NICHT markiert", () => {
  assert.equal(isIndicativePrice(jumingo()), false);
});

test("F4 — `bookable: false` allein markiert nichts", () => {
  assert.equal(isIndicativePrice(jumingo({ bookable: false })), false);
  assert.equal(isIndicativePrice({ bookable: false }), false);
});

test("F5 — `quote_only` allein markiert nichts", () => {
  assert.equal(isIndicativePrice(jumingo({ unavailableReason: "quote_only" })), false);
  assert.equal(isIndicativePrice({ unavailableReason: "quote_only" }), false);
});

test("F6 — eine nicht leere Pflichtangabenliste allein markiert nichts", () => {
  assert.equal(isIndicativePrice(jumingo({ requiredPriceInputs: ["deliveryIsResidential"] })), false);
  assert.equal(isIndicativePrice({ requiredPriceInputs: ["deliveryIsResidential", "x"] }), false);
});

test("F20 — alle drei zusammen markieren nichts (der vollständige TG-Quote)", () => {
  const o = tgFull();
  assert.equal(o.bookable, false);
  assert.equal(o.unavailableReason, "quote_only");
  assert.ok(o.requiredPriceInputs.length > 0);
  assert.equal(isIndicativePrice(o), false,
    "die drei Bookability-Signale haben einen vollständigen Preis als vorläufig markiert");
});

test("F7/F8 — fehlendes oder leeres Feld markiert nichts (altes Backend)", () => {
  const { priceCompleteness, ...ohneFeld } = tgMinimal();
  assert.equal(priceCompleteness, "indicative");            // die Voraussetzung stimmt
  assert.equal(isIndicativePrice(ohneFeld), false);
  assert.equal(isIndicativePrice(tgMinimal({ priceCompleteness: null })), false);
  assert.equal(isIndicativePrice(tgMinimal({ priceCompleteness: undefined })), false);
});

test("F9/F10 — strikt, nie truthy", () => {
  for (const w of ["INDICATIVE", "Indicative", " indicative", "indicative ", "complete",
                   "final", "minimal", true, 1, "true", "maybe", {}, [], 0, ""]) {
    assert.equal(isIndicativePrice(tgFull({ priceCompleteness: w })), false,
      `${JSON.stringify(w)} wurde als vorläufig gelesen`);
  }
  assert.equal(isIndicativePrice(tgFull({ priceCompleteness: "indicative" })), true);
});

test("A1 — unbrauchbare Eingaben werfen nicht", () => {
  for (const w of [null, undefined, 0, "", "x", 42, []]) {
    assert.equal(isIndicativePrice(w), false);
  }
});

/* ══════════ §B  DIE KARTE ═════════════════════════════════════════════════ */

test("B1 — die Karte liest AUSSCHLIESSLICH das Preisfeld für diesen Hinweis", () => {
  const code = ohneKommentar(offerCard);
  // Der Hinweis hängt an `isIndicativePrice` …
  assert.ok(code.includes("isIndicativePrice(t)"),
    "die Karte fragt die Preisgrundlage nicht");
  // … und an keinem der drei ungeeigneten Signale.
  for (const muster of [/INDICATIVE_PRICE_LABEL[\s\S]{0,200}?requiredPriceInputs/,
                        /INDICATIVE_PRICE_LABEL[\s\S]{0,200}?unavailableReason/,
                        /requiredPriceInputs[\s\S]{0,200}?INDICATIVE_PRICE_LABEL/]) {
    assert.ok(!muster.test(code), "der Hinweis hängt an einem Bookability-Signal");
  }
});

test("F11/F12 — der Hinweis hängt NICHT am Netto-/Brutto-Umschalter", () => {
  const code = ohneKommentar(offerCard);
  // Der Umschalter heisst `vatMode`. Zwischen ihm und dem Hinweis darf keine Verbindung
  // bestehen: der Betrag wechselt, sein Status nicht.
  const hinweisIndex = code.indexOf("INDICATIVE_PRICE_LABEL");
  assert.ok(hinweisIndex > 0, "der Hinweis steht nicht in der Karte");
  const umgebung = code.slice(Math.max(0, hinweisIndex - 400), hinweisIndex + 400);
  assert.ok(!umgebung.includes("vatMode"),
    "der Hinweis steht im Wirkungsbereich des MwSt.-Umschalters und verschwände in einer Stellung");
  // Und er entsteht in den `metaItems` — der Zone, die vom Preisblock getrennt ist.
  assert.ok(/metaItems\.push\(\{\s*icon:\s*"info",\s*label:\s*INDICATIVE_PRICE_LABEL/.test(code),
    "der Hinweis steht nicht in der providerneutralen Meta-Zeile");
});

test("F19 — die Erklärung erscheint NUR bei einem vorläufigen Preis", () => {
  const code = ohneKommentar(offerCard);
  assert.ok(code.includes("isIndicativePrice(t) && ("),
    "die Erklärung im Detailbereich ist nicht an die Preisgrundlage gebunden");
  assert.ok(code.includes("INDICATIVE_PRICE_EXPLANATION"),
    "die Erklärung fehlt im Detailbereich");
});

test("F18 — kein Anbietername und kein technischer Begriff im Hinweistext", () => {
  for (const text of [INDICATIVE_PRICE_LABEL, INDICATIVE_PRICE_EXPLANATION]) {
    const klein = text.toLowerCase();
    for (const wort of ["transglobal", "tg", "jumingo", "provider", "anbieter", "quote",
                        "quotemode", "quoteid", "minimal", "api"]) {
      assert.ok(!klein.includes(wort), `„${wort}" steht im Kundentext: „${text}"`);
    }
  }
});

test("M13 — der Hinweis sagt NICHT „ab“", () => {
  /* Belegt ist nur, dass der endgültige Betrag höher ausfallen kann (10,62 → 13,27).
     Dass er niemals niedriger ausfällt, ist NICHT belegt — die Preisrevalidierung
     vergleicht richtungsoffen. „ab" wäre eine Zusage nach unten. */
  for (const text of [INDICATIVE_PRICE_LABEL, INDICATIVE_PRICE_EXPLANATION]) {
    assert.ok(!/\bab\b/i.test(text), `„ab" steht im Kundentext: „${text}"`);
  }
  // Und der Helfer selbst behauptet keine Richtung.
  const code = ohneKommentar(helfer);
  for (const wort of ["mindestens", "höher", "steigt", "garantiert", "spätestens"]) {
    assert.ok(!code.toLowerCase().includes(wort), `„${wort}" steht im Helfer`);
  }
});

test("B2 — der Wortlaut ist genau der abgestimmte", () => {
  assert.equal(INDICATIVE_PRICE_LABEL, "Vorläufiger Preis");
  assert.equal(INDICATIVE_PRICE_EXPLANATION,
    "Der endgültige Preis wird nach vollständigen Sendungsangaben berechnet.");
});

/* ══════════ §C  NICHTREGRESSION ═══════════════════════════════════════════ */

test("F13/F14 — ein gesperrtes Angebot bekommt weiterhin KEIN Badge", () => {
  // Zwei Preise und zwei Laufzeiten, damit beide Auszeichnungen überhaupt entstehen können.
  const liste = [jumingo(), tgMinimal({ netPrice: 5, transitDaysMax: 1 })];
  const map = assignBadges(liste);
  assert.equal(map.size, 0,
    "das gesperrte, vorläufige Angebot hat eine Auszeichnung bekommen");
  // Die Ursache ist unverändert die Sperre — nicht die neue Preisgrundlage.
  assert.equal(offerBlocked(tgMinimal()), true);
  assert.ok(!ohneKommentar(badgesSrc).includes("priceCompleteness"),
    "die Badge-Logik liest die Preisgrundlage — sie soll unverändert bleiben");
});

test("F15 — die Auswahlreife bleibt unverändert an Buchbarkeit gebunden", () => {
  // Das Frontend unterdrückt nichts selbst; die Sperre ist die Backendaussage.
  assert.equal(offerBlocked(jumingo()), false);
  assert.equal(offerBlocked(tgMinimal()), true);
  assert.equal(offerBlocked(tgFull()), true);
});

test("F16 — die Sortierung liest die Preisgrundlage NICHT", () => {
  const code = ohneKommentar(rechner);
  const sortIndex = code.indexOf('sortMode === "cheapest"');
  assert.ok(sortIndex > 0, "die Preissortierung wurde umgebaut");
  assert.ok(!code.includes("priceCompleteness"),
    "die Sortierung hängt an der Preisgrundlage — sie soll unverändert bleiben");
  assert.ok(!code.includes("isIndicativePrice"),
    "die Seite leitet den Preisstatus selbst ab statt ihn zu lesen");
});

test("F17 — die Preisgrundlage überlebt die Wiederherstellung", () => {
  const wieder = normalizeScope({ step: "offers", tariffs: [tgMinimal(), jumingo()] }, "calculator");
  assert.equal(wieder.tariffs.length, 2);
  assert.equal(wieder.tariffs[0].priceCompleteness, "indicative",
    "die Preisgrundlage geht bei Navigation/Restore verloren");
  assert.equal(wieder.tariffs[1].priceCompleteness, "complete");
  assert.equal(isIndicativePrice(wieder.tariffs[0]), true);
  assert.equal(isIndicativePrice(wieder.tariffs[1]), false);
});

test("C1 — der Helfer kennt keinen Anbieter und keinen Quote-Begriff", () => {
  const code = ohneKommentar(helfer);
  for (const wort of ["transglobal", "jumingo", "quoteMode", "providerQuoteRef",
                      "bookable", "unavailableReason", "requiredPriceInputs"]) {
    assert.ok(!code.includes(wort), `„${wort}" steht im Helfer-Code`);
  }
});
