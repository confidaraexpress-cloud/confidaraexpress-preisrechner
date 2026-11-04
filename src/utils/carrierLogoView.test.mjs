// Carrier-Logos in der Darstellung (P2, Betreiberentscheidung 2026-11-04): Die öffentliche Kundenbereich-Demo zeigt
// keine Carrier-Logos — Carrier und Service als Text, ohne Logokachel und ohne Paket-Zeichen. Der echte
// Kundenbereich zeigt seine Logos unverändert. Es gibt genau EINE Stelle, die das entscheidet (carrierLogoView.mjs);
// jede Fläche mit Carrier-Bild liest ihr Logo von dort.
//
// Run: node --test src/utils/carrierLogoView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carrierLogoAnzeige } from "./carrierLogoView.mjs";
import { demoEinschalten, istDemo } from "../demo/demoModus.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HIER, "..");
const lies = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
// Anker auf kommentarfreiem Code (Block-, JSX- und Zeilenkommentare; „https://…“ in Strings bleibt stehen).
const ohneKommentare = (text) => text
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Die Flächen, die ein Carrier-Logo zeigen können — jede liest es über carrierLogoAnzeige. */
const FLAECHEN = [
  "components/offers/OfferCard.jsx",
  "components/booking/BookingLiveSummary.jsx",
  "components/booking/BookingStickySummary.jsx",
  "components/booking/OfferSummaryModule.jsx",
  "components/dashboard/OverviewModules.jsx",
  "components/dashboard/ShipmentsList.jsx",
];
/** Die vier Flächen mit Logokachel bzw. Paket-Zeichen: in der Demo entfällt die Kachel ganz. */
const KACHELN = {
  "components/offers/OfferCard.jsx": "offer-logo-tile",
  "components/booking/BookingLiveSummary.jsx": "blsum-logo",
  "components/booking/BookingStickySummary.jsx": "bsum-logo",
  "components/booking/OfferSummaryModule.jsx": "booking-carrier-logo",
};

function quellen(ordner = SRC, liste = []) {
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) quellen(p, liste);
    else if (/\.(jsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) liste.push(p);
  }
  return liste;
}

test("1 — echter Kundenbereich: das aufgelöste Logo, ohne Logodatei die Kachel mit dem Paket-Zeichen", () => {
  assert.equal(istDemo(), false);
  assert.deepEqual(carrierLogoAnzeige("/assets/dhl.svg"), { logo: "/assets/dhl.svg", kachel: true });
  for (const ohne of [null, undefined, ""]) {
    assert.deepEqual(carrierLogoAnzeige(ohne), { logo: null, kachel: true }, String(ohne));
  }
});

test("2 — Demo: weder Logo noch Kachel, für jeden Carrier", () => {
  demoEinschalten();
  assert.equal(istDemo(), true);
  for (const logo of ["/assets/dhl.svg", "data:image/svg+xml,%3Csvg%3E", null, undefined]) {
    assert.deepEqual(carrierLogoAnzeige(logo), { logo: null, kachel: false }, String(logo));
  }
  assert.ok(Object.isFrozen(carrierLogoAnzeige("/x.svg")), "die Antwort der Demo ist unveränderlich");
});

test("3 — jede Fläche mit Carrier-Bild liest ihr Logo über carrierLogoAnzeige, keine liest es an ihr vorbei", () => {
  // Alle Quellen, die carrierMap importieren und ein Bild rendern — außer der Insel des Preisrechners (ohne Logos,
  // ohne Demo-Module). Eine neue Fläche gehört über carrierLogoAnzeige angebunden und in FLAECHEN eingetragen.
  const gefunden = quellen()
    .filter((p) => !p.includes(`${path.sep}public-calculator${path.sep}`))
    .filter((p) => {
      const src = ohneKommentare(fs.readFileSync(p, "utf8"));
      return /from "[^"]*utils\/carrierMap(\.js)?"/.test(src) && /<img\b/.test(src);
    })
    .map((p) => path.relative(SRC, p).split(path.sep).join("/"))
    .sort();
  assert.deepEqual(gefunden, [...FLAECHEN].sort());

  for (const datei of FLAECHEN) {
    const src = ohneKommentare(lies(datei));
    assert.match(src, /import \{ carrierLogoAnzeige \} from "\.\.\/\.\.\/utils\/carrierLogoView\.mjs";/, datei);
    const bilder = [...src.matchAll(/<img\b[^>]*?\bsrc=\{([^}]+)\}/g)].map((m) => m[1].trim());
    assert.ok(bilder.length > 0, `${datei}: kein Bild gefunden`);
    for (const ausdruck of bilder) {
      assert.ok(["logoAnzeige.logo", "logo", "carrierLogoVon(s.selected_carrier)"].includes(ausdruck),
        `${datei}: <img src={${ausdruck}}> liest das Logo an carrierLogoAnzeige vorbei`);
    }
    // Ein schlichtes „logo“ ist nur das Ergebnis von carrierLogoAnzeige.
    for (const [, rechts] of src.matchAll(/const (?:\{ logo \}|logo) = ([^;]+);/g)) {
      assert.match(rechts, /^(carrierLogoAnzeige|carrierLogoVon)\(/, `${datei}: logo = ${rechts}`);
    }
  }
  const liste = ohneKommentare(lies("components/dashboard/ShipmentsList.jsx"));
  assert.match(liste, /const carrierLogoVon = \(raw\) => \(raw \? carrierLogoAnzeige\(resolveCarrier\(raw\)\.logo\)\.logo : null\);/);
});

test("4 — die Logokachel samt Paket-Zeichen steht nur, wo carrierLogoAnzeige eine Kachel vorsieht", () => {
  for (const [datei, klasse] of Object.entries(KACHELN)) {
    const src = ohneKommentare(lies(datei));
    const kachel = src.indexOf(klasse);
    const bedingung = src.lastIndexOf("logoAnzeige.kachel && (", kachel);
    assert.ok(kachel > 0 && bedingung > 0 && kachel - bedingung < 160, `${datei}: ${klasse} ohne Bedingung auf die Kachel`);
    assert.doesNotMatch(src, /\{carrierLogo\b/, `${datei}: das Logo aus carrierMap wird direkt gerendert`);
  }
  const karte = ohneKommentare(lies("components/offers/OfferCard.jsx"));
  assert.match(karte, /className=\{`offer-zone-1\$\{logoAnzeige\.kachel \? "" : " offer-zone-1--ohne-logo"\}`\}/);
});

test("5 — die Entscheidung hängt am Demo-Zustand, nicht an CSS, und carrierMap bleibt ohne Demo", () => {
  const modul = ohneKommentare(lies("utils/carrierLogoView.mjs"));
  assert.match(modul, /import \{ istDemo \} from "\.\.\/demo\/demoModus\.mjs";/);
  assert.match(modul, /if \(istDemo\(\)\) return NUR_TEXT;/);
  assert.doesNotMatch(lies("utils/carrierMap.js"), /demo/i, "carrierMap.js zieht kein Demo-Modul (die Insel importiert es)");
  for (const css of fs.readdirSync(path.join(SRC, "styles")).filter((f) => f.endsWith(".css"))) {
    const regeln = fs.readFileSync(path.join(SRC, "styles", css), "utf8");
    assert.doesNotMatch(regeln, /\[data-ce-demo\][^{]*(logo|offer-zone-1)/, `${css}: Logos werden per CSS versteckt`);
  }
});
