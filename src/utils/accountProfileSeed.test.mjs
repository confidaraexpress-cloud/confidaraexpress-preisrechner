import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   Entwurfsfunktion unabhängig vom Accountzustand
   ══════════════════════════════════════════════════════════════════════════
   Der Fehlerbericht lautete: „Admin funktioniert, Kunde A funktioniert, Kunde B
   nicht." Es war kein Rechteproblem — die Entwurfsrouten sind rollenfrei und
   ausschließlich kundenskopiert. Es war ein DATENVERTRAGSproblem:

   Der Absender von „Neue Sendung" wird aus dem PROFIL vorbelegt. `users.country`
   ist backendseitig VARCHAR(10) OHNE CHECK und wurde bei der Registrierung als
   einziges Adressfeld gar nicht geprüft. Ein Wert wie „DEU" landete damit
   unverändert im `<select>` — das ihn nicht darstellen kann — und von dort in
   jeden Request. Ergebnis: 400 auf `sender.country` bei JEDEM Entwurf dieses
   Kontos, dieselbe Ablehnung in der Buchung, und eine Unternehmenskarte, die
   sich nicht mehr speichern ließ. Der Kunde sah nur „Bitte versuche es erneut."

   Diese Datei hält die Auflösung fest: eine Normalisierung, die Seed-Punkte
   (seit Paket G, 2026-10-23, nur noch Rechner und Unternehmenskarte — „Neue
   Sendung" liest das Profil nicht mehr), und eine Fehlermeldung, die nicht mehr
   zum sinnlosen Wiederholen auffordert. */

import { countries, normalizeCountryCode } from "./countries.js";
import { companyBaseline, buildCompanyPatch } from "./profileView.mjs";
import { createEmptyShipmentForm } from "./newShipmentForm.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const seiteSrc = lies("../pages/NewShipmentPage.jsx");
const rechnerSrc = lies("../pages/CalculatorPage.jsx");
const profilSrc = lies("./profileView.mjs");
const dialogSrc = lies("../components/drafts/ShipmentDraftLeaveDialog.jsx");
const seite = ohneKommentare(seiteSrc);
const rechner = ohneKommentare(rechnerSrc);

/* ══════════ A — Die Normalisierung ═══════════════════════════════════════ */

test("A1 ein gültiger Code kommt unverändert (nur getrimmt/großgeschrieben) zurück", () => {
  assert.equal(normalizeCountryCode("DE"), "DE");
  assert.equal(normalizeCountryCode("at"), "AT");
  assert.equal(normalizeCountryCode("  ch  "), "CH");
});

test("A2 was die Länderliste nicht kennt, fällt auf die Vorgabe zurück", () => {
  for (const wert of ["DEU", "D", "GER", "de-DE", "12", "ZZ", "", "   "]) {
    assert.equal(normalizeCountryCode(wert), "DE", `${JSON.stringify(wert)} wurde nicht aufgefangen`);
  }
});

test("A3 fehlende oder falsch typisierte Werte brechen nichts", () => {
  for (const wert of [null, undefined, 123, {}, [], true]) {
    assert.equal(normalizeCountryCode(wert), "DE");
  }
});

test("A4 es wird NICHT geraten — „DEU“ wird nicht zu einer erfundenen Zuordnung", () => {
  // Eine Alpha-3→Alpha-2-Tabelle gibt es hier bewusst nicht: sie wäre eine
  // erfundene Länderzuordnung. Unbekanntes bekommt denselben Ausgangswert wie
  // ein Konto ganz ohne Land.
  // Verhaltensprüfung statt Quelltextsuche: „Deutschland" enthält die Buchstaben
  // DEU, eine Textsuche wäre also wertlos. Entscheidend ist, dass KEIN Alpha-3-Code
  // eine eigene Zuordnung bekommt — alle landen auf demselben Ausgangswert.
  const alpha3 = ["DEU", "AUT", "CHE", "FRA", "ITA", "NLD", "POL", "ESP"];
  for (const c of alpha3) {
    assert.equal(normalizeCountryCode(c), normalizeCountryCode(null),
      `${c} bekam eine eigene Zuordnung statt des Ausgangswerts`);
  }
  // Und mit einer anderen Vorgabe verschieben sich ALLE mit — es gibt keine
  // fest verdrahtete Ausnahme.
  for (const c of alpha3) assert.equal(normalizeCountryCode(c, "AT"), "AT");
});

test("A5 die Vorgabe ist überschreibbar, aber selbst gültig", () => {
  assert.equal(normalizeCountryCode("DEU", "AT"), "AT");
  assert.ok(countries.some((c) => c.code === "DE"));
});

test("A6 jeder Code der Liste übersteht die Normalisierung unverändert", () => {
  for (const c of countries) assert.equal(normalizeCountryCode(c.code), c.code);
});

/* ══════════ B — Die Seed-Punkte laufen darüber ═══════════════════════════ */

// „Neue Sendung" liest das Profil seit Paket G (Master-Implementierungsauftrag
// 2026-10-23) gar nicht mehr als Absender: „Eigene Adresse" ist entfallen. Der
// Absender kommt aus dem Adressbuch — als Standard-Absender oder über „Adresse
// suchen" — und durch dieselbe Feldauslegung (mapAddressToShipmentFormPatch). Das
// unnormalisierte Profilland („DEU") kann dort also nicht mehr ankommen; die
// beiden übrigen Seed-Punkte (B2, B3) normalisieren unverändert.
test("B1 „Neue Sendung“ liest das Profil nicht als Absender", () => {
  const modul = lies("./newShipmentForm.mjs");
  assert.doesNotMatch(modul, /export function (senderPatchFromProfile|hasProfileSenderData)\b/, "der Profil-Absender ist zurück");
  assert.doesNotMatch(seite, /senderPatchFromProfile|hasProfileSenderData|user\??\.company_name|user\??\.street\b/,
    "die Seite liest wieder Profildaten in den Absender");
  // Die einzige automatische Absenderquelle ist der Standard-Absender des Adressbuchs.
  assert.match(seite, /mapAddressToShipmentFormPatch\(adresse, "s"\)/);
});

test("B1b der Ausgangszustand trägt nur das Absenderland Deutschland, nichts aus dem Profil", () => {
  // Am erzeugten Objekt gemessen, nicht am Quelltext: das ist die Aussage, auf
  // die es ankommt, und sie hält auch, wenn der Aufbau der Funktion sich ändert.
  // Betreiberentscheidung Auftrag 1 (P11, 2026-10-17): das Absenderland ist Deutschland — der
  // einzige Ursprung, den der Server erlaubt, NICHT das Land des Profils. Das Empfängerland
  // bleibt leer.
  const leer = createEmptyShipmentForm();
  assert.equal(leer.s_country, "DE", "Absenderland ist nicht Deutschland");
  assert.equal(leer.r_country, "", "Empfängerland ist vorbelegt");
  // Und wirklich jedes ANDERE Feld ist leer — kein Rest eines alten Defaults.
  //
  // Die Paketanzahl und das Absenderland sind die einzigen bewussten Vorgaben des Ausgangs-
  // zustands. Sie stehen hier als benannte Ausnahmen statt die Prüfung zu lockern: ein
  // drittes vorbelegtes Feld — und damit auch jedes Profildatum — fällt weiterhin sofort auf.
  const VORBELEGT = new Set(["packageCount", "s_country"]);
  // TG22 Residential: das Formular trägt keine Adressartfragen mehr — ohne Ausnahme startet jedes
  // übrige Feld leer.
  assert.ok(!("collectionIsResidential" in leer) && !("deliveryIsResidential" in leer),
    "das leere Formular trägt wieder eine Adressart");
  for (const [k, v] of Object.entries(leer)) {
    if (VORBELEGT.has(k)) continue;
    if (v === null) {
      assert.strictEqual(v, null, `Feld ${k} startet nicht als „unbeantwortet" (${JSON.stringify(v)})`);
      continue;
    }
    assert.equal(v, "", `Feld ${k} startet nicht leer (${JSON.stringify(v)})`);
  }
  assert.equal(leer.packageCount, "1", "die Paketanzahl trägt nicht ihre Vorgabe");
});

test("B2 der Versandkostenrechner ebenso", () => {
  // Seit Auftrag 1 (P11): Herkunft Deutschland, nie roh aus dem Profil. PLZ und Ort kommen nur
  // aus dem Profil, wenn dessen Land (normalisiert) ebenfalls Deutschland ist.
  assert.match(rechner, /from_country: DEFAULT_ORIGIN_COUNTRY,/);
  assert.match(rechner, /from_zip:\s+normalizeCountryCode\(user\?\.country\) === DEFAULT_ORIGIN_COUNTRY \?/);
  assert.match(rechner, /to_country:\s+"DE",/);
  assert.doesNotMatch(rechner, /from_country:\s*user\?\.country\s*\|\|/);
});

test("B3 die Unternehmenskarte des Profils ebenso", () => {
  assert.equal(companyBaseline({ country: "DEU" }).country, "DE");
  assert.equal(companyBaseline({ country: "at" }).country, "AT");
  assert.equal(companyBaseline({}).country, "DE");
  assert.doesNotMatch(ohneKommentare(profilSrc), /country:\s*user\?\.country\s*\?/);
});

test("B4 ein unspeicherbares Profil wird dadurch wieder speicherbar", () => {
  // Vorher trug der PATCH-Body den unveränderten Rohwert und wurde vom Backend
  // mit „2-stelliger ISO-Ländercode erforderlich" abgelehnt — der Kunde konnte
  // sein eigenes Profil nicht in Ordnung bringen.
  const patch = buildCompanyPatch(companyBaseline({ company_name: "X GmbH", country: "DEU" }));
  assert.match(patch.country, /^[A-Z]{2}$/);
});

test("B5 die ANZEIGE des Profils wird bewusst NICHT normalisiert", () => {
  // Sie soll nicht behaupten, es sei ein gültiges Land hinterlegt. Der Rohwert
  // findet in der Liste keinen Namen → „Nicht angegeben".
  const profilSeite = lies("../components/dashboard/Profile.jsx");
  assert.match(profilSeite, /countries\.find\(c => c\.code === user\?\.country\)\?\.name/);
  assert.match(profilSeite, /countryName \|\| "Nicht angegeben"/);
});

/* ══════════ C — Die Entwurfsfunktion hängt an keiner Rolle ═══════════════ */

test("C1 kein Rollen-, Admin- oder Kontotyp-Gate im Entwurfspfad", () => {
  for (const [name, quelle] of [["NewShipmentPage", seite], ["CalculatorPage", rechner]]) {
    assert.doesNotMatch(quelle, /isAdmin|role === "admin"|canSaveDraft|user\.role/, `${name}: Rollenprüfung gefunden`);
  }
  const dienst = ohneKommentare(lies("../api/formDraftsApi.js"));
  assert.doesNotMatch(dienst, /role|admin|isAdmin/i);
});

test("C2 der Speicherknopf hängt allein an „geändert“ und „nicht beschäftigt“", () => {
  assert.match(seite, /const canExplicitSave = isDirty && !saving && !loading/);
});

test("C3 der Entwurfsdienst sendet keine user_id — der Besitzer kommt aus dem Token", () => {
  const dienst = ohneKommentare(lies("../api/formDraftsApi.js"));
  assert.doesNotMatch(dienst, /user_id|userId/);
  assert.match(dienst, /auth: true/);
});

/* ══════════ D — Der Fehler sagt jetzt, was zu tun ist ════════════════════ */

test("D1 eine 400-Antwort markiert das beanstandete Feld, statt es zu verschlucken", () => {
  const block = seite.slice(seite.indexOf("const saveCurrentFormDraft"), seite.indexOf("const reloadCurrentDraft"));
  assert.match(block, /r\.status === 400/);
  assert.match(block, /normalizeApiError\(\{ status: r\.status, body: d, fieldMap: SHIPMENT_FIELD_MAP \}\)/);
  // Markiert über den Serverfehler des Feldes, angesprungen nach dem Rendern (Auftrag 1, P11).
  assert.match(block, /setServerErrors\(\(prev\) => \(\{ \.\.\.prev, \[norm\.field\]: norm\.fieldMessage \|\| norm\.message \}\)\);/);
  assert.match(block, /requestFocus\(norm\.field\)/);
  assert.match(block, /setSaveMode\("fieldError"\)/);
});

test("D2 „fieldError“ ist ein EIGENER Zustand — nicht derselbe wie „error“", () => {
  // Die Handlungsanweisung ist eine andere: bei einem Feldfehler hilft kein
  // erneuter Versuch. Genau diese Verwechslung machte den Fehler unauffindbar.
  assert.match(dialogSrc, /fieldError:\s*"/);
  assert.doesNotMatch(dialogSrc, /fieldError[\s\S]{0,120}Erneut versuchen/);
  assert.match(seite, /saveMode === "fieldError"/);
  assert.match(seite, /saveMode === "error"/);
});

test("D3 die Feldzuordnung deckt jedes Feld ab, das die Entwurfsroute ablehnen kann", () => {
  const map = seite.slice(seite.indexOf("const SHIPMENT_FIELD_MAP"), seite.indexOf("const SHIPMENT_FIELD_ORDER"));
  const felder = ["company", "fullName", "streetAndNumber", "addressAddition", "postalCode", "city", "country", "phone", "email"];
  for (const seiteName of ["sender", "recipient"]) {
    for (const f of felder) {
      assert.ok(map.includes(`"${seiteName}.${f}"`), `${seiteName}.${f} fehlt in SHIPMENT_FIELD_MAP`);
    }
  }
  for (const p of ["packages.packageCount", "packages.weight", "packages.length", "packages.width", "packages.height"]) {
    assert.ok(map.includes(`"${p}"`), `${p} fehlt in SHIPMENT_FIELD_MAP`);
  }
});

test("D4 jeder zugeordnete Formularschlüssel existiert auch im Formular", () => {
  const map = seite.slice(seite.indexOf("const SHIPMENT_FIELD_MAP"), seite.indexOf("const SHIPMENT_FIELD_ORDER"));
  const ziele = [...map.matchAll(/:\s*"([a-zA-Z_]+)"/g)].map((m) => m[1]);
  // Der Formularbestand steht seit dem Paket „leerer Nullzustand" nicht mehr als
  // Objektliteral in der Seite, sondern wird in newShipmentForm.mjs aus
  // Präfixen und Suffixen aufgebaut. Der Test prüft deshalb gegen das echte
  // erzeugte Formular — das ist genauer als ein Quelltextmuster.
  const bekannt = new Set(Object.keys(createEmptyShipmentForm()));
  bekannt.add("shippingDate");   // eigener State, kein Formularfeld
  for (const z of new Set(ziele)) {
    assert.ok(bekannt.has(z), `Zuordnungsziel ${z} existiert im Formular nicht`);
  }
});

/* ══════════ E — Erfolgs- und Fehlerpfad bleiben unverändert ══════════════ */

test("E1 Erfolg beendet den Vorgang weiterhin vollständig", () => {
  const block = seite.slice(seite.indexOf("const saveCurrentFormDraft"), seite.indexOf("const reloadCurrentDraft"));
  assert.match(block, /resetToFreshShipment\(\)/);
  // Fail-closed: `seite` ist kommentarbereinigt — der frühere End-Anker war ein
  // KOMMENTAR und lief still auf -1; der „Ausschnitt" umfasste 46 979 statt ~900
  // Zeichen, und die Treffer stammten aus ganz anderen Codezeilen. End-Anker ist
  // jetzt die nächste Codezeile nach der Funktion.
  const resetStart = seite.indexOf("const resetToFreshShipment");
  const resetEnde  = seite.indexOf("const saveCurrentFormDraft", resetStart);
  assert.ok(resetStart > -1 && resetEnde > resetStart, "resetToFreshShipment-Ausschnitt nicht auffindbar");
  const reset = seite.slice(resetStart, resetEnde);
  assert.match(reset, /clearFlowScope\("shipment"\)/);
  assert.match(reset, /setBaseline\(getShipmentFormSnapshot/);
});

test("E2 der Fehlerpfad setzt NICHTS zurück — Formular und Vorgang bleiben", () => {
  const block = seite.slice(seite.indexOf("const saveCurrentFormDraft"), seite.indexOf("const reloadCurrentDraft"));
  // Genau ein resetToFreshShipment() im ganzen Handler, und das steht im Erfolgszweig.
  assert.equal((block.match(/resetToFreshShipment\(\)/g) || []).length, 1);
  const fehlerzweige = block.slice(block.indexOf("if (r.status === 401"), block.indexOf("resetToFreshShipment"));
  assert.doesNotMatch(fehlerzweige, /resetToFreshShipment|clearFlowScope|setForm\(/);
  // Auch der neue Feldfehlerzweig räumt nichts weg.
  const feldzweig = block.slice(block.indexOf("if (r.status === 400)"), block.indexOf("if (!r.ok"));
  assert.doesNotMatch(feldzweig, /resetToFreshShipment|clearFlowScope|setForm\(/);
});

test("E3 Konflikt, Nichtgefunden und Ratenbegrenzung sind unverändert", () => {
  const block = seite.slice(seite.indexOf("const saveCurrentFormDraft"), seite.indexOf("const reloadCurrentDraft"));
  assert.match(block, /isPatch && r\.status === 409[\s\S]{0,60}setSaveMode\("conflict"\)/);
  assert.match(block, /isPatch && r\.status === 404[\s\S]{0,90}setSaveMode\("notFound"\)/);
  assert.match(block, /r\.status === 429[\s\S]{0,60}setSaveMode\("rateLimited"\)/);
  assert.match(block, /r\.status === 401 \|\| r\.status === 403/);
});
