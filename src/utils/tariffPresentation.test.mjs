// Go-Live Block B (Betreiberentscheidungen K1–K4, 2026-10-02) — Kundenansicht der Tarife.
//
//   S  Samstagszustellung: die Detailzeile liest ausschließlich `deliveryOnSaturday === true` — nie den Namen.
//      Sie steht unter „Hauptmerkmale" im Detailbereich; auf der Kartenfläche trägt der kuratierte Tarifname
//      die Unterscheidung (nicht doppelt).
//   N  Namen: die Karte zeigt den serverseitig kuratierten Namen unverändert; ohne Namen den Versandartnamen.
//   H  „Zustelltermin nicht bewertbar": neutral gestaltet, nur Foundation-Tokens, keine Warnfarbe.
//
// Reine Quelltextprüfungen wie in offerMetadataView/serviceDetailsView — die Karte selbst rendert die E2E-Suite
// tariffPresentation (Szenarien A–D).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lies = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const KARTE = "src/components/offers/OfferCard.jsx";
const CARRIER_MAP = "src/utils/carrierMap.js";
const FILTER = "src/utils/offersFilterView.mjs";
const OFFERS_CSS = "src/styles/offers.css";

const SAMSTAGSZEILE =
  'if (t.deliveryOnSaturday === true) features.push({ icon: "calendar", label: "Samstagszustellung",  value: "Ja" });';

test("S1 — die Samstagszeile liest allein das Providerflag, streng === true", () => {
  const karte = lies(KARTE);
  assert.ok(karte.includes(SAMSTAGSZEILE), "die Samstagszeile fehlt oder liest mehr als das Flag");
  // Genau eine Lesestelle des Flags.
  assert.equal((ohneKommentare(karte).match(/deliveryOnSaturday/g) || []).length, 1);
});

test("S2 — keine Samstagserkennung über Namen: weder in Karte, Namenshelfer noch Filter", () => {
  // Namenshelfer und Filter kennen das Wort gar nicht.
  for (const datei of [CARRIER_MAP, FILTER]) {
    assert.ok(!/samstag|saturday/i.test(ohneKommentare(lies(datei))), `${datei} kennt einen Samstagsbezug`);
  }
  // Im Code der Karte steht es ausschließlich als Beschriftung der Detailzeile — kein Textvergleich.
  // Wortgrenze: „deliveryOnSaturday" ist der Feldname, kein Textvergleich.
  const treffer = ohneKommentare(lies(KARTE)).match(/\bsamstag\w*|\bsaturday\w*/gi) || [];
  assert.deepEqual(treffer, ["Samstagszustellung"]);
});

test("S3 — die Zeile steht im Detailbereich (Hauptmerkmale), nicht auf der Kartenfläche", () => {
  const karte = lies(KARTE);
  const start = karte.indexOf("const features = [];");
  const ende = karte.indexOf("const hasPrice", start);
  assert.ok(start > 0 && ende > start, "Feature-Liste des Detailbereichs nicht gefunden");
  assert.ok(karte.slice(start, ende).includes(SAMSTAGSZEILE), "die Samstagszeile steht nicht in den Hauptmerkmalen");
  // Die Kartenfläche (OfferCardBase) liest das Flag nicht.
  const flaeche = karte.slice(karte.indexOf("function OfferCardBase"));
  assert.ok(!/deliveryOnSaturday/.test(ohneKommentare(flaeche)), "die Kartenfläche zeigt die Samstagszustellung doppelt");
});

test("N1 — der Kartenname ist der Servername; Rückfall nur über die Versandart, inklusive Economy", () => {
  const q = ohneKommentare(lies(CARRIER_MAP));
  assert.match(q, /const s = tariff\?\.publicServiceName;/);
  assert.match(q, /economy:\s*"Economyversand"/);
  assert.match(q, /return PUBLIC_SERVICE_BY_MODE\[tariff\?\.shippingMode\] \|\| "Versandservice";/);
  // Kein Rohname: der Tarifname des Anbieters wird nirgends gelesen.
  assert.ok(!/tariff\?\.tariffName|tariff\.tariffName|tariff\?\.name\b/.test(q), "der Rohname wird gelesen");
});

test("H1 — der Hinweis „Zustelltermin nicht bewertbar\" ist neutral gestaltet", () => {
  const css = lies(OFFERS_CSS);
  const regel = css.match(/\.offer-deadline-note\s*\{([^}]*)\}/);
  assert.ok(regel, ".offer-deadline-note muss definiert sein");
  const r = regel[1];
  for (const token of ["--ce-color-status-neutral-surface", "--ce-color-status-neutral-border", "--ce-color-status-neutral-fg"]) {
    assert.ok(r.includes(`var(${token})`), `${token} fehlt`);
  }
  assert.ok(!/warning|error|success|#[0-9a-f]{3,8}\b|rgba?\(/i.test(r), "der Hinweis trägt eine Status- oder freie Farbe");
});
