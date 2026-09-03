// src/utils/launchScopeUx.test.mjs — der No-Customs-Launch im Frontend.
//
// Zwei Zusagen, getrennt geprüft:
//
//   1. Die Auswahlfelder zeigen nur Länder, die ConfidaraExpress anbietet — und die Liste
//      dafür kommt vom SERVER, nicht aus einer zweiten Aufzählung im Client.
//   2. Jede Zolloberfläche ist unerreichbar, und trotzdem ist keine Zolldatei gelöscht.
//
// Was hier ausdrücklich NICHT geprüft wird: dass eine Drittlandsendung unbuchbar ist. Das ist
// eine Serverzusage und wird serverseitig gemessen (tests/launch-route-guards.test.js). Ein
// Frontendtest könnte sie gar nicht belegen — und würde eine Sicherheit behaupten, die an
// dieser Stelle nicht entsteht.
//
// Lauf:  node --test src/utils/launchScopeUx.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { countries } from "./countries.js";
import { parseLaunchScope, scopedCountries, isCountryInScope, scopedOriginCountries } from "./launchScopeView.mjs";
import { CUSTOMS_UI_ENABLED } from "../config/launchMode.mjs";
import { getBookingModules } from "./bookingModules.js";
import { detailSections } from "./adminShipmentView.mjs";
import { validateCompanyForm } from "./profileView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, "..", "..");
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), "utf8");
// Kommentare entfernen, bevor gezählt wird — eine Erklärung, die den gesuchten Bezeichner
// nennt, verfälscht sonst das Ergebnis. Dieselbe Falle ist im Backend mehrfach dokumentiert.
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");

/* ══════════ A — Auswertung des Scopes (rein) ═════════════════════════════ */

test("(A1) eine brauchbare Antwort wird normalisiert gelesen", () => {
  const s = parseLaunchScope({ countries: ["de", " fr ", "NL"] });
  assert.deepEqual(s.codes, ["DE", "FR", "NL"]);
  // Eine Antwort ohne `originCountries` (älterer Server) lässt den Ursprung unbekannt — sie
  // behauptet nicht, es gäbe keinen. Die Auswertung dazu steht in (E5).
  assert.equal(s.originCodes, null);
});

test("(A2) alles Unbrauchbare ergibt null — nie eine leere Länderliste", () => {
  // `null` heißt „nicht bekannt". Würde daraus „keine Länder", wäre jede kaputte Antwort ein
  // unbenutzbares Formular.
  for (const body of [null, undefined, "x", 42, {}, { countries: [] }, { countries: "DE" },
                      { countries: [1, 2] }, { countries: ["DEU", "x", ""] }]) {
    assert.equal(parseLaunchScope(body), null, `${JSON.stringify(body)} muss null ergeben`);
  }
});

test("(A3) ein unbekannter Scope zeigt die VOLLE Liste, nicht die leere", () => {
  assert.equal(scopedCountries(countries, null).length, countries.length);
  assert.equal(scopedCountries(countries, {}).length, countries.length);
  assert.equal(scopedCountries(countries, { codes: null }).length, countries.length);
});

test("(A4) ein bekannter Scope filtert — Drittländer verschwinden, sie werden nicht deaktiviert", () => {
  const gefiltert = scopedCountries(countries, { codes: ["DE", "FR", "NL", "AT"] });
  assert.deepEqual(gefiltert.map((c) => c.code).sort(), ["AT", "DE", "FR", "NL"]);
  for (const drittland of ["US", "CH", "GB", "NO", "TR", "CN", "CA"]) {
    assert.ok(!gefiltert.some((c) => c.code === drittland), `${drittland} darf nicht übrig bleiben`);
  }
  // Die Einträge selbst bleiben unverändert — es wird gefiltert, nichts umgeschrieben.
  assert.equal(gefiltert.find((c) => c.code === "DE").name, "Deutschland");
});

test("(A5) isCountryInScope ist bei unbekanntem Scope großzügig", () => {
  assert.equal(isCountryInScope("US", null), true);
  assert.equal(isCountryInScope("US", { codes: ["DE"] }), false);
  assert.equal(isCountryInScope("de", { codes: ["DE"] }), true);
  assert.equal(isCountryInScope("", { codes: ["DE"] }), true, "ein leeres Feld ist kein Verstoß");
});

/* ══════════ B — EINE Länderquelle, EIN Abrufweg ══════════════════════════ */

test("(B1) es gibt keine zweite Länderliste im Client", () => {
  // Die Scope-Auswertung FILTERT die vorhandene Anzeigeliste. Stünden hier eigene ISO-Codes,
  // wäre das eine zweite gepflegte Wahrheit, die zwangsläufig von der Serverliste abweicht.
  const view = ohneKommentare(lies("src/utils/launchScopeView.mjs"));
  const laendercodes = view.match(/"[A-Z]{2}"/g) || [];
  assert.deepEqual(laendercodes, [], `keine Ländercodes im Modul erlaubt: ${laendercodes.join(", ")}`);
  assert.ok(!/\bEU_COUNTRIES\b/.test(view), "keine eigene EU-Liste im Frontend");
});

test("(B2) genau EIN Weg zum Scope-Endpunkt", () => {
  const treffer = [];
  const gehe = (ordner) => {
    for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const voll = path.join(ordner, e.name);
      if (e.isDirectory()) gehe(voll);
      // Kommentare zuerst entfernen: mehrere Dateien ERKLÄREN, woher ihre Länderliste kommt,
      // und nennen dabei den Pfad. Ohne diesen Schritt zählte der Test Erklärungen als
      // Aufrufe — genau die Falle, die in diesem Projekt schon mehrfach zugeschlagen hat.
      else if (/\.(js|jsx|mjs)$/.test(e.name) && !e.name.includes(".test.")
               && ohneKommentare(fs.readFileSync(voll, "utf8")).includes("/api/shipping/launch-scope")) {
        treffer.push(path.relative(WURZEL, voll));
      }
    }
  };
  gehe(path.join(WURZEL, "src"));
  assert.deepEqual(treffer, ["src/api/launchScopeApi.js"],
    `der Endpunkt gehört an genau eine Stelle: ${treffer.join(", ")}`);
});

test("(B3) alle acht Auswahlfelder hängen am Scope, keines mehr an der vollen Liste", () => {
  const felder = [
    ["src/components/addressbook/AddressFormDrawer.jsx", 1],
    ["src/components/auth/RegisterForm.jsx", 1],
    ["src/components/inventory/OrderCreateForm.jsx", 1],
    ["src/components/dashboard/Profile.jsx", 1],
    ["src/pages/NewShipmentPage.jsx", 1],
    ["src/pages/CalculatorPage.jsx", 2],
  ];
  for (const [datei, anzahl] of felder) {
    const src = ohneKommentare(lies(datei));
    assert.ok(src.includes("useLaunchScope()"), `${datei}: der Hook fehlt`);
    // Gezählt wird das gerenderte Länder-<option>, nicht der Variablenname: seit der Trennung
    // von Ursprung und Ziel speist ein Feld entweder `launchCountries` oder
    // `launchOriginCountries`, und im Formular „Neue Sendung" entscheidet ein Ternär im
    // gemeinsamen Renderer. Die Zusage ist unverändert — jedes Feld hängt am Scope.
    const gefiltert = (src.match(/<option key=\{c\.code\}/g) || []).length;
    assert.equal(gefiltert, anzahl, `${datei}: ${anzahl} gefilterte Auswahl(en) erwartet, ${gefiltert} gefunden`);
    assert.ok(/launchCountries|launchOriginCountries/.test(src),
      `${datei}: keine der beiden Scope-Listen wird benutzt`);
    assert.ok(!/\bcountries\.map\(/.test(src), `${datei}: ein Auswahlfeld benutzt noch die volle Liste`);
  }
});

test("(B4) die ANZEIGE eines gespeicherten Landes läuft weiter über die volle Liste", () => {
  // Ein Konto oder eine Adresse mit einem nicht mehr angebotenen Land soll den Ländernamen
  // sehen und keinen rohen Code. Gefiltert wird ausschließlich, was zur AUSWAHL steht.
  for (const datei of ["src/components/addressbook/AddressCard.jsx",
                       "src/components/addressbook/AddressDesktopRow.jsx",
                       "src/components/dashboard/Profile.jsx",
                       "src/pages/BookingPage.jsx"]) {
    const src = ohneKommentare(lies(datei));
    assert.ok(/countries\.find\(/.test(src), `${datei}: die Anzeigeauflösung darf nicht gefiltert werden`);
  }
});

/* ══════════ C — Zolloberflächen sind unerreichbar ════════════════════════ */

test("(C1) der Launch-Modus ist der Auslieferungszustand", () => {
  assert.equal(CUSTOMS_UI_ENABLED, false);
});

test("(C2) das Zollmodul der Buchungsseite erscheint nie", () => {
  // Auch dann nicht, wenn eine laufende Sitzung oder ein alter Tab noch customsRequired:true
  // mitbringt — genau dafür steht die Abschaltung ausdrücklich im Modul und nicht als
  // Nebenwirkung des Serverwerts.
  assert.equal(getBookingModules({}, { customsRequired: true }).customs, false);
  assert.equal(getBookingModules({}, { customsRequired: false }).customs, false);
  // Die übrigen Module bleiben unverändert.
  assert.equal(getBookingModules({ insuranceAvailable: true }, {}).insurance, true);
  assert.equal(getBookingModules({ printerRequired: true }, {}).printerNote, true);
});

test("(C3) die Adminansicht zeigt keine Zollkarte", () => {
  assert.equal(detailSections({ from_country: "DE", to_country: "US" }).customs, false);
});

test("(C4) das EORI-Feld der Kontoeinstellungen ist ausgeblendet und blockiert nichts", () => {
  const src = lies("src/components/dashboard/Profile.jsx");
  assert.ok(src.includes('{CUSTOMS_UI_ENABLED && <div className="field">'),
    "das EORI-Feld muss am Launch-Schalter hängen");
  // Ein formal ungültiger Altwert darf das Speichern der Unternehmenskarte nicht sperren:
  // ohne Eingabefeld könnte der Kunde ihn gar nicht korrigieren.
  assert.equal(validateCompanyForm({ company_name: "M", eori_number: "!!" }).eori_number, undefined);
});

test("(C5) der Zollabschnitt der Artikelpflege ist ausgeblendet", () => {
  assert.ok(lies("src/components/inventory/ProductForm.jsx").includes("{CUSTOMS_UI_ENABLED && <CollapsibleSection"));
});

test("(C6) der Erfolgsbildschirm fragt keine Proforma mehr ab", () => {
  const src = ohneKommentare(lies("src/hooks/useProformaDocument.js"));
  assert.ok(/if \(!CUSTOMS_UI_ENABLED\) return undefined;/.test(src),
    "der Poll muss vor jeder Anfrage abbrechen");
  // Und zwar VOR der bisherigen Bedingung — sonst liefe je Erfolgsbildschirm eine Anfrage,
  // die zuverlässig nichts findet.
  assert.ok(src.indexOf("!CUSTOMS_UI_ENABLED") < src.indexOf("step !== 3"),
    "die Abschaltung muss vor der Schrittprüfung stehen");
});

/* ══════════ D — Nichts wurde gelöscht ════════════════════════════════════ */

test("(D1) alle Zoll- und Proformabausteine liegen unverändert im Repository", () => {
  const dateien = [
    "src/components/booking/CustomsModule.jsx",
    "src/components/booking/CustomsEoriSection.jsx",
    "src/components/booking/CustomsInvoiceModeSection.jsx",
    "src/components/booking/CommercialInvoiceUpload.jsx",
    "src/hooks/useCommercialInvoice.js",
    "src/hooks/useProformaDocument.js",
    "src/utils/eori.mjs",
    "src/utils/customsInvoiceMode.mjs",
    "src/utils/proformaDocumentView.mjs",
  ];
  for (const d of dateien) {
    assert.ok(fs.existsSync(path.join(WURZEL, d)), `${d} darf nicht entfernt werden`);
  }
});

test("(D2) für Customs V2 fällt an jeder Stelle nur die Konstante weg", () => {
  // Die fachliche Bedingung steht überall NEBEN dem Schalter, nicht an seiner Stelle. Wer den
  // Launch-Modus später beendet, bekommt das ursprüngliche Verhalten zurück — er muss keine
  // Logik rekonstruieren.
  assert.ok(ohneKommentare(lies("src/utils/bookingModules.js"))
    .includes("CUSTOMS_UI_ENABLED && r.customsRequired === true"));
  assert.ok(ohneKommentare(lies("src/utils/adminShipmentView.mjs"))
    .includes("CUSTOMS_UI_ENABLED && isCustomsRelevant(row)"));
});

test("(D3) der Schalter ist eine Konstante, keine Umgebungsvariable", () => {
  // Eine Vite-Variable hätte suggeriert, der Launch-Modus ließe sich im Betrieb umstellen. Er
  // wird vom Server bestimmt; die beiden auseinanderlaufen zu lassen wäre schlimmer als gar
  // kein Schalter.
  const src = ohneKommentare(lies("src/config/launchMode.mjs"));
  assert.ok(!/import\.meta\.env/.test(src), "kein ENV-Zugriff im Launch-Schalter");
  assert.match(src, /export const CUSTOMS_UI_ENABLED = false;/);
});


// ── Ursprung vs. Ziel (Phase 3.0b) ───────────────────────────────────────────
// Der Server trennt seit der Korrektur der Routenpolicy zwei Fragen: wohin versenden wir, und
// von wo aus. Vorher lag EINE Liste auf beiden Länderfeldern — Frankreich war als Absenderland
// wählbar, obwohl jede Route von dort serverseitig mit `origin_not_supported` abgelehnt wird.

const SCOPE_NEU = parseLaunchScope({
  countries: ["DE", "FR", "AT", "NL", "IT", "ES", "PL"],
  destinationCountries: ["DE", "FR", "AT", "NL", "IT", "ES", "PL"],
  originCountries: ["DE"],
});

const codes = (liste) => liste.map((c) => c.code);

test("(E1) das ABSENDERfeld bietet ausschließlich Versandursprünge — heute nur DE", () => {
  assert.deepStrictEqual(codes(scopedOriginCountries(countries, SCOPE_NEU)), ["DE"]);
});

test("(E2) FR, AT und NL sind NICHT als Absenderland wählbar", () => {
  const absender = codes(scopedOriginCountries(countries, SCOPE_NEU));
  for (const c of ["FR", "AT", "NL", "IT", "ES", "PL"]) {
    assert.ok(!absender.includes(c), `${c} darf kein Absenderland sein`);
  }
});

test("(E3) dieselben Länder bleiben als EMPFÄNGER wählbar", () => {
  const ziel = codes(scopedCountries(countries, SCOPE_NEU));
  for (const c of ["DE", "FR", "AT", "NL", "IT", "ES", "PL"]) {
    assert.ok(ziel.includes(c), `${c} muss Zielland bleiben`);
  }
  assert.ok(!ziel.includes("US"), "ein Drittland bleibt ausgeschlossen");
  assert.ok(!ziel.includes("GB"), "ein Drittland bleibt ausgeschlossen");
});

test("(E4) die Zielliste ist durch die Trennung UNVERÄNDERT geblieben", () => {
  // Gegenprobe: das Empfängerfeld darf sich durch diese Änderung nicht bewegt haben.
  const nurAlt = parseLaunchScope({ countries: ["DE", "FR", "AT", "NL", "IT", "ES", "PL"] });
  assert.deepStrictEqual(codes(scopedCountries(countries, SCOPE_NEU)),
                         codes(scopedCountries(countries, nurAlt)));
});

test("(E5) ein Server OHNE originCountries sperrt das Absenderfeld nicht zu", () => {
  // Fail-soft wie überall in diesem Modul: ein älterer Server oder ein Ausfall darf kein
  // leeres Auswahlfeld erzeugen. Die Sperre liegt serverseitig.
  const alt = parseLaunchScope({ countries: ["DE", "FR", "AT"] });
  assert.strictEqual(alt.originCodes, null, "ohne Feld bleibt der Ursprung unbekannt");
  assert.deepStrictEqual(codes(scopedOriginCountries(countries, alt)),
                         codes(scopedCountries(countries, alt)));
  // Endpunkt ganz ausgefallen: volle Liste, nicht leer.
  assert.strictEqual(scopedOriginCountries(countries, null).length, countries.length);
});

test("(E6) parseLaunchScope liest beide Felder und bleibt rückwärtskompatibel", () => {
  const s = parseLaunchScope({ destinationCountries: ["de", " fr "], originCountries: ["de"] });
  assert.deepStrictEqual(s.codes, ["DE", "FR"], "getrimmt und großgeschrieben");
  assert.deepStrictEqual(s.originCodes, ["DE"]);
  // Unbrauchbares bleibt unbrauchbar — kein erfundener Ursprung.
  assert.strictEqual(parseLaunchScope({ countries: ["DE"], originCountries: [] }).originCodes, null);
  assert.strictEqual(parseLaunchScope({ countries: ["DE"], originCountries: ["XYZ", 42] }).originCodes, null);
  assert.strictEqual(parseLaunchScope({ countries: [] }), null, "ohne Zielland kein Scope");
});

test("(E7) die Ursprungsliste steht NICHT im Client — sie kommt vom Server", () => {
  // Dieselbe Zusage wie für die Zielliste: keine zweite gepflegte Aufzählung im Frontend.
  const src = ohneKommentare(lies("src/utils/launchScopeView.mjs"));
  assert.ok(!/"DE"/.test(src), "kein Ländercode als Literal im Auswertungsmodul");
  const hook = ohneKommentare(lies("src/hooks/useLaunchScope.js"));
  assert.ok(!/"[A-Z]{2}"/.test(hook), "kein Ländercode als Literal im Hook");
});

test("(E8) genau die ABSENDERfelder benutzen die Ursprungsliste — sonst nichts", () => {
  // Adressbuch, Profil, Registrierung und Auftragsempfänger sind keine Versandherkunft und
  // bleiben unverändert an der Zielliste (§4 des Auftrags: Firmensitz ist nicht Versandursprung).
  for (const datei of ["src/components/auth/RegisterForm.jsx",
                       "src/components/dashboard/Profile.jsx",
                       "src/components/addressbook/AddressFormDrawer.jsx",
                       "src/components/inventory/OrderCreateForm.jsx"]) {
    assert.ok(!/originCountries/.test(lies(datei)), `${datei} darf die Ursprungsliste nicht benutzen`);
  }
  // Der Preisrechner: Herkunft ja, Ziel nein.
  const calc = lies("src/pages/CalculatorPage.jsx");
  assert.ok(/launchOriginCountries\.map/.test(calc), "das Herkunftsfeld muss die Ursprungsliste benutzen");
  assert.strictEqual((calc.match(/launchOriginCountries\.map/g) || []).length, 1,
    "genau EIN Feld des Preisrechners ist die Herkunft");
  // Neue Sendung: ein Renderer, die Liste hängt am Präfix.
  const ns = lies("src/pages/NewShipmentPage.jsx");
  assert.ok(/p === "s" \? launchOriginCountries : launchCountries/.test(ns),
    "der Absender bekommt die Ursprungsliste, der Empfänger die Zielliste");
});
