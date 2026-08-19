// Adressvalidierung im Formular — Quelltext- und Verhaltenstests.
//
// Die wichtigsten Zusicherungen dieser Datei:
//   • Ein nicht bestätigter Zustand blockiert NIE (nur der eindeutige Widerspruch tut das).
//   • Ein nicht unterstütztes Land verhält sich exakt wie bisher.
//   • Die Hausnummer wird nie als bestätigt dargestellt.
//   • Jede Änderung an Land/PLZ/Ort/Straße verwirft eine frühere Bestätigung.
//   • Das Frontend führt keine eigene Orts-/Straßenliste und entscheidet nichts selbst.
//
// Ausführen: node --test src/utils/addressValidationUx.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADDRESS_STATUS, ADDRESS_MESSAGES, SUPPORTED_COUNTRIES,
  isAddressCheckSupported, isPostalCodeQueryable, isStreetQueryable, STREET_MIN_CHARS,
  streetSearchTerm, applyStreetSuggestion, addressFingerprint, shouldInvalidateAddress,
  readAddressResponse, addressBlocksSubmit, addressNeedsAcknowledgement,
  addressStatusTone, showsAddressStatus,
} from "./addressValidationView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const viewSrc    = read("./addressValidationView.mjs");
const hookSrc    = read("../hooks/useAddressValidation.js");
const inputSrc   = read("../components/address/AddressSuggestInput.jsx");
const statusSrc  = read("../components/address/AddressStatusLine.jsx");
const apiSrc     = read("../api/addressValidationApi.js");
const newShipSrc = read("../pages/NewShipmentPage.jsx");
const drawerSrc  = read("../components/addressbook/AddressFormDrawer.jsx");
const orderSrc   = read("../components/inventory/OrderCreateForm.jsx");
const cssSrc     = read("../styles/address-validation.css");

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

// ── 1. Länderabdeckung ───────────────────────────────────────────────────────

test("1 genau DE/AT/CH/LI werden geprüft", () => {
  assert.deepEqual([...SUPPORTED_COUNTRIES].sort(), ["AT", "CH", "DE", "LI"]);
  for (const cc of ["DE", "at", " CH ", "li"]) assert.equal(isAddressCheckSupported(cc), true, cc);
});

test("2 KRITISCH: ein nicht unterstütztes Land verhält sich wie bisher", () => {
  // Kein Anbieter, keine Anfrage, keine Anzeige — und vor allem nie „ungültig".
  for (const cc of ["FR", "IE", "AE", "HK", "US", "", null, undefined]) {
    assert.equal(isAddressCheckSupported(cc), false, `${cc}`);
    assert.equal(isPostalCodeQueryable(cc, "63743"), false, `${cc} darf keine Abfrage auslösen`);
    assert.equal(isStreetQueryable(cc, "63743", "Dublin", "Main Street"), false, `${cc}`);
  }
  assert.equal(addressBlocksSubmit(ADDRESS_STATUS.UNSUPPORTED), false);
  assert.equal(showsAddressStatus(ADDRESS_STATUS.UNSUPPORTED), false, "es wird nichts angezeigt");
});

test("3 gefragt wird erst ab plausibel vollständiger PLZ", () => {
  assert.equal(isPostalCodeQueryable("DE", "637"), false);
  assert.equal(isPostalCodeQueryable("DE", "6374"), false, "DE braucht fünf Stellen");
  assert.equal(isPostalCodeQueryable("DE", "63743"), true);
  assert.equal(isPostalCodeQueryable("AT", "1010"), true, "AT/CH/LI haben vier Stellen");
  assert.equal(isPostalCodeQueryable("CH", "8001"), true);
  assert.equal(isPostalCodeQueryable("LI", "9490"), true);
});

test("4 Straßensuche erst ab Mindestlänge und nur mit PLZ und Ort", () => {
  assert.equal(STREET_MIN_CHARS, 2);
  assert.equal(isStreetQueryable("DE", "63743", "Aschaffenburg", "S"), false, "ein Zeichen genügt nicht");
  assert.equal(isStreetQueryable("DE", "63743", "Aschaffenburg", "Sc"), true);
  assert.equal(isStreetQueryable("DE", "63743", "", "Schweinheimer"), false, "ohne Ort keine Suche");
  assert.equal(isStreetQueryable("DE", "637", "Aschaffenburg", "Schweinheimer"), false, "ohne PLZ keine Suche");
});

// ── 2. Straße und Hausnummer ────────────────────────────────────────────────

test("5 für die Suche zählt nur der Straßenname", () => {
  assert.equal(streetSearchTerm("Schweinheimer Straße 187"), "Schweinheimer Straße");
  assert.equal(streetSearchTerm("Hauptstr. 12a"), "Hauptstr.");
  assert.equal(streetSearchTerm("Bahnhofstraße 1-3"), "Bahnhofstraße");
  assert.equal(streetSearchTerm("Musterweg"), "Musterweg");
  assert.equal(streetSearchTerm("Straße des 17. Juni"), "Straße des 17. Juni");
  assert.equal(streetSearchTerm(""), "");
});

test("6 KRITISCH: ein Vorschlag behält die Hausnummer des Kunden", () => {
  assert.equal(applyStreetSuggestion("schweinheimer str 187", "Schweinheimer Straße"), "Schweinheimer Straße 187");
  assert.equal(applyStreetSuggestion("hauptstr 12a", "Hauptstraße"), "Hauptstraße 12a");
  // Ohne eingegebene Hausnummer wird auch keine erfunden.
  assert.equal(applyStreetSuggestion("schweinheimer", "Schweinheimer Straße"), "Schweinheimer Straße");
});

test("7 KRITISCH: die Hausnummer gilt nie als bestätigt", () => {
  const r = readAddressResponse({ status: "confirmed", houseNumberVerified: true });
  assert.equal(r.houseNumberVerified, false, "auch eine manipulierte Antwort darf das nicht behaupten");
  // Der bestätigte Text nennt ausdrücklich nur PLZ, Ort und Straße.
  assert.equal(ADDRESS_MESSAGES[ADDRESS_STATUS.CONFIRMED], "PLZ, Ort und Straße bestätigt");
  assert.ok(!/Hausnummer/i.test(ADDRESS_MESSAGES[ADDRESS_STATUS.CONFIRMED]));
  // Kommentare zuerst entfernen: ein erklärender Satz („sagt nie ‚Hausnummer bestätigt‘")
  // ist keine Zusicherung des ausgeführten Codes — geprüft wird der SICHTBARE Text.
  for (const src of [statusSrc, viewSrc]) {
    assert.ok(!/Hausnummer\s+(bestätigt|geprüft|verifiziert)/i.test(strip(src)),
      "nirgends darf eine bestätigte Hausnummer behauptet werden");
  }
});

// ── 3. Blockieren nur bei echtem Widerspruch ────────────────────────────────

test("8 KRITISCH: nur 'invalid' blockiert — nie unverified/unavailable/unsupported", () => {
  assert.equal(addressBlocksSubmit(ADDRESS_STATUS.INVALID), true);
  for (const s of [ADDRESS_STATUS.UNVERIFIED, ADDRESS_STATUS.UNAVAILABLE, ADDRESS_STATUS.UNSUPPORTED,
                   ADDRESS_STATUS.CONFIRMED, ADDRESS_STATUS.IDLE, ADDRESS_STATUS.CHECKING]) {
    assert.equal(addressBlocksSubmit(s), false, `${s} darf NICHT blockieren`);
  }
});

test("9 unverified und unavailable lassen eine bewusste Übernahme zu", () => {
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.UNVERIFIED), true);
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.UNAVAILABLE), true);
  // Ein eindeutiger Widerspruch bekommt diesen Ausweg bewusst NICHT.
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.INVALID), false);
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.CONFIRMED), false);
});

test("10 die Statusfarbe passt zur Aussage", () => {
  assert.equal(addressStatusTone(ADDRESS_STATUS.CONFIRMED), "success");
  assert.equal(addressStatusTone(ADDRESS_STATUS.INVALID), "error");
  assert.equal(addressStatusTone(ADDRESS_STATUS.UNVERIFIED), "warning");
  assert.equal(addressStatusTone(ADDRESS_STATUS.UNAVAILABLE), "warning");
});

// ── 4. Auswertung der Serverantwort ─────────────────────────────────────────

test("11 bekannte Status werden übernommen", () => {
  for (const s of ["confirmed", "invalid", "unverified", "unavailable", "unsupported"]) {
    assert.equal(readAddressResponse({ status: s }).status, s);
  }
});

test("12 KRITISCH: eine unbekannte/kaputte Antwort wird 'unverified', nie 'invalid'", () => {
  for (const body of [null, undefined, {}, "text", 42, { status: "kaputt" }, { status: 123 }]) {
    const r = readAddressResponse(body);
    assert.equal(r.status, ADDRESS_STATUS.UNVERIFIED, `${JSON.stringify(body)}`);
    assert.notEqual(r.status, ADDRESS_STATUS.INVALID);
  }
});

test("13 Vorschläge werden defensiv gelesen", () => {
  const r = readAddressResponse({
    status: "invalid",
    citySuggestions: ["Aschaffenburg", 42, null],
    streetSuggestions: [{ street: "Hauptstraße" }, { nope: 1 }, null],
  });
  assert.deepEqual(r.citySuggestions, ["Aschaffenburg"]);
  assert.equal(r.streetSuggestions.length, 1);
});

// ── 5. Invalidierung ────────────────────────────────────────────────────────

const BASIS = { country: "DE", postalCode: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" };

test("14 jede Änderung an Land, PLZ, Ort oder Straße verwirft die Bestätigung", () => {
  const a = addressFingerprint(BASIS);
  for (const [key, val] of [["country", "AT"], ["postalCode", "63744"],
                            ["city", "München"], ["street", "Hauptstraße 1"]]) {
    const b = addressFingerprint({ ...BASIS, [key]: val });
    assert.equal(shouldInvalidateAddress(a, b), true, `${key} muss invalidieren`);
  }
});

test("15 eine geänderte Hausnummer invalidiert NICHT", () => {
  // Sie wird ohnehin nie geprüft — ein Verfall bei jedem Tippen wäre reine Schikane.
  const a = addressFingerprint(BASIS);
  const b = addressFingerprint({ ...BASIS, street: "Schweinheimer Straße 42" });
  assert.equal(shouldInvalidateAddress(a, b), false);
});

test("16 Groß-/Kleinschreibung und Leerzeichen invalidieren nicht", () => {
  const a = addressFingerprint(BASIS);
  const b = addressFingerprint({ ...BASIS, city: "  ASCHAFFENBURG  " });
  assert.equal(shouldInvalidateAddress(a, b), false);
});

// ── 6. Sicherheit und Datenschutz ───────────────────────────────────────────

test("17 SICHERHEIT: das Frontend führt keine eigene Orts-/Straßenliste", () => {
  for (const [name, src] of [["view", viewSrc], ["hook", hookSrc], ["input", inputSrc], ["status", statusSrc]]) {
    assert.ok(!/Aschaffenburg|Musterstadt|63743/.test(strip(src)),
      `${name} darf keine Ortsdaten enthalten`);
  }
});

test("18 SICHERHEIT: der externe Dienst wird nie direkt aufgerufen", () => {
  for (const [name, src] of [["api", apiSrc], ["hook", hookSrc], ["view", viewSrc],
                             ["input", inputSrc], ["NewShipmentPage", newShipSrc]]) {
    assert.ok(!/openplz/i.test(src), `${name} darf den Anbieter nicht kennen`);
    assert.ok(!/https?:\/\/(?!127|localhost)/.test(strip(src).replace(/claude\.ai|confidaraexpress\.de/g, "")),
      `${name} darf keine fremde URL aufrufen`);
  }
  assert.ok(apiSrc.includes("/api/address/"), "es wird ausschließlich die CE-API angesprochen");
});

test("19 DATENSCHUTZ: es werden nur Adressbestandteile übertragen", () => {
  const body = apiSrc.slice(apiSrc.indexOf("validateAddress"));
  assert.ok(/JSON\.stringify\(\{ country, postalCode, city, street \}\)/.test(body),
    "der Payload trägt genau vier Felder");
  for (const feld of ["fullName", "company", "phone", "email", "userId", "contactName"]) {
    assert.ok(!apiSrc.includes(feld), `${feld} darf nicht übertragen werden`);
  }
});

test("20 keine Adressen in Konsolenausgaben", () => {
  for (const [name, src] of [["hook", hookSrc], ["api", apiSrc], ["input", inputSrc]]) {
    assert.ok(!/console\.(log|debug|info)/.test(src), `${name} darf nichts protokollieren`);
  }
});

// ── 7. Anfragehygiene ───────────────────────────────────────────────────────

test("21 entprellt, abgebrochen und reihenfolgesicher", () => {
  assert.ok(/const DEBOUNCE_MS = \d{3}/.test(hookSrc), "Entprellung fehlt");
  assert.ok(/setTimeout\(/.test(hookSrc) && /clearTimeout\(/.test(hookSrc), "Timer wird aufgeräumt");
  assert.ok((hookSrc.match(/new AbortController\(\)/g) || []).length >= 3, "jede Anfrageart braucht einen Abbruch");
  // Zwei Schichten: Abbruch UND Sequenznummer — eine bereits unterwegs befindliche
  // Antwort darf ein neueres Ergebnis nie überschreiben.
  assert.ok(/locSeq|strSeq|valSeq/.test(hookSrc), "Sequenzzähler fehlen");
  assert.ok(/if \(e && e\.name === "AbortError"\) return;/.test(hookSrc),
    "ein Abbruch darf keine Fehlermeldung erzeugen");
});

test("22 laufende Anfragen werden beim Verlassen abgebrochen", () => {
  assert.ok(/useEffect\(\(\) => \(\) => abortAll\(\), \[abortAll\]\)/.test(hookSrc));
});

// ── 8. Bedienung und Barrierefreiheit ───────────────────────────────────────

test("23 das Vorschlagsfeld folgt dem Combobox-Muster", () => {
  for (const attr of ['role="combobox"', "aria-expanded=", "aria-controls=", "aria-activedescendant=",
                      'role="listbox"', 'role="option"', "aria-selected="]) {
    assert.ok(inputSrc.includes(attr), `${attr} fehlt`);
  }
});

test("24 Tastaturbedienung vollständig", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"]) {
    assert.ok(inputSrc.includes(`"${key}"`), `${key} muss behandelt werden`);
  }
  // Enter wählt nur bei hervorgehobenem Eintrag — sonst bleibt es das normale Enter
  // des Formulars und darf kein Absenden abfangen.
  assert.ok(/if \(open && active >= 0 && active < items\.length\)/.test(inputSrc));
});

test("25 ein Klick außerhalb schließt die Liste", () => {
  assert.ok(/addEventListener\("mousedown"/.test(inputSrc));
  assert.ok(/removeEventListener\("mousedown"/.test(inputSrc), "der Listener wird aufgeräumt");
});

test("26 die Auswahl überlebt den Blur des Feldes", () => {
  // mousedown statt click: bei click wäre das Feld bereits verlassen und die Liste zu.
  assert.ok(/onMouseDown=\{\(e\) => \{ e\.preventDefault\(\); choose\(item\); \}\}/.test(inputSrc));
});

test("27 die Liste ist begrenzt und läuft nicht aus dem Bild", () => {
  assert.ok(/suggestions\.slice\(0, 8\)/.test(inputSrc), "höchstens acht Vorschläge");
  assert.ok(/max-width: 100%/.test(cssSrc), "die Liste darf nie breiter als das Feld sein");
  assert.ok(/max-height:/.test(cssSrc), "die Höhe muss begrenzt sein");
  assert.ok(/overflow-y: auto/.test(cssSrc));
});

test("28 die Styles nutzen nur Foundation-Tokens", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(cssSrc), "kein Hexwert");
  assert.ok(!/rgba?\(/.test(cssSrc), "kein rgb/rgba");
});

// ── 9. Anbindung der Formulare ──────────────────────────────────────────────

test("29 alle drei Adressformulare nutzen dieselbe zentrale Logik", () => {
  for (const [name, src] of [["NewShipmentPage", newShipSrc], ["AddressFormDrawer", drawerSrc],
                             ["OrderCreateForm", orderSrc]]) {
    // Wichtig: NICHT nur auf das Vorkommen des Namens pruefen — der steht schon in der
    // Importzeile. Geprueft wird, dass die Komponenten auch WIRKLICH GERENDERT werden.
    assert.ok(/useAddressValidation\(\{/.test(src), `${name} muss den zentralen Hook aufrufen`);
    assert.ok(/<AddressSuggestInput\b/.test(src), `${name} muss das zentrale Feld rendern`);
    assert.ok(/<AddressStatusLine\b/.test(src), `${name} muss die zentrale Statuszeile rendern`);
  }
});

test("30 es gibt keine zweite Autocomplete-Implementierung", () => {
  for (const [name, src] of [["NewShipmentPage", newShipSrc], ["AddressFormDrawer", drawerSrc],
                             ["OrderCreateForm", orderSrc]]) {
    assert.ok(!/fetchStreets|fetchLocalities/.test(src),
      `${name} darf die Adress-API nicht selbst aufrufen`);
  }
});

test("31 die Preisberechnung blockiert nur bei eindeutigem Widerspruch", () => {
  const code = strip(newShipSrc);
  assert.ok(/const addressBlocksCalculation =\s*\n?\s*addressBlocksSubmit\(senderCheck\.status\) \|\| addressBlocksSubmit\(recipientCheck\.status\)/.test(code),
    "das Gate muss über addressBlocksSubmit laufen");
  assert.ok(/disabled=\{loading \|\| !calcValid \|\| saving \|\| addressBlocksCalculation\}/.test(code));
  // Und ausdrücklich NICHT bei unverified/unavailable.
  assert.ok(!/status === ADDRESS_STATUS\.UNVERIFIED[^\n]*disabled/.test(code));
});

test("32 KRITISCH: Entwürfe bleiben unvollständig speicherbar", () => {
  const code = strip(newShipSrc);
  // Der Speicherknopf des Formularentwurfs darf die Adressprüfung NICHT abfragen —
  // ein Entwurf existiert vor Tarif und Checkout und muss lückenhaft bleiben dürfen.
  // Genau das <button>-Element des Entwurfsknopfes betrachten — ein Zeichenfenster
  // erwischt sonst den unmittelbar davor stehenden Berechnen-Knopf.
  const idx = code.indexOf("dft-savedraft-cta");
  const start = code.lastIndexOf("<button", idx);
  const draftBtn = code.slice(start, code.indexOf("</button>", idx));
  assert.ok(draftBtn.includes("dft-savedraft-cta"), "der Entwurfsknopf muss gefunden werden");
  assert.ok(!/addressBlocksCalculation|senderCheck|recipientCheck/.test(draftBtn),
    `der Entwurfs-Speicherknopf darf nicht an der Adressprüfung hängen: ${draftBtn.slice(0, 200)}`);
  assert.ok(/disabled=\{!canExplicitSave\}/.test(draftBtn),
    "der Entwurfsknopf hängt unverändert allein an canExplicitSave");
});

test("33 das Adressbuch blockiert das Speichern nicht", () => {
  const code = strip(drawerSrc);
  assert.ok(!/addressCheck\.status\s*===\s*"invalid"/.test(code),
    "die Prüfung ist im Adressbuch reine Hilfestellung");
  assert.ok(!/disabled=\{[^}]*addressCheck/.test(code), "kein Speicherknopf hängt an der Prüfung");
});

test("34 die bestehende PLZ-Formatprüfung bleibt unangetastet", () => {
  // Beide Systeme laufen nebeneinander; das neue liest die generierten Regeln nicht.
  assert.ok(!/postalCodeRules|isPostalCodeRequired/.test(viewSrc),
    "die Formatprüfung ist ein eigenes System");
  assert.ok(newShipSrc.includes("isPostalCodeRequired"), "die alte Formatprüfung ist noch verdrahtet");
  assert.ok(drawerSrc.includes("postalCodeExample"), "die Beispielanzeige bleibt erhalten");
});

test("35 keine technischen Begriffe in Kundentexten", () => {
  for (const text of Object.values(ADDRESS_MESSAGES)) {
    for (const wort of ["OpenPLZ", "Provider", "API", "HTTP", "500", "Timeout", "null", "Endpoint"]) {
      assert.ok(!text.includes(wort), `„${text}“ darf „${wort}“ nicht nennen`);
    }
  }
  assert.equal(ADDRESS_MESSAGES[ADDRESS_STATUS.INVALID], "PLZ und Ort passen nicht zusammen.");
  assert.equal(ADDRESS_MESSAGES[ADDRESS_STATUS.UNAVAILABLE],
    "Automatische Adressprüfung ist momentan nicht verfügbar.");
});

test("36 in Neue Sendung tragen Absender UND Empfänger je Straße und Ort das Vorschlagsfeld", () => {
  // Diese Prüfung existiert, weil ein früherer Teilumbau genau hier unbemerkt blieb: die
  // Importzeile war vorhanden, gerendert wurde aber noch das alte Eingabefeld.
  for (const id of ["ns-s-street", "ns-s-city", "ns-r-street", "ns-r-city"]) {
    assert.ok(newShipSrc.includes(`id="${id}"`), `${id} fehlt — das Feld ist nicht umgestellt`);
  }
  assert.equal((newShipSrc.match(/<AddressSuggestInput\b/g) || []).length, 4,
    "genau vier Adressfelder mit Vorschlägen");
  assert.equal((newShipSrc.match(/<AddressStatusLine\b/g) || []).length, 2,
    "je eine Statuszeile für Absender und Empfänger");
  // Und die alten einfachen Felder dürfen für diese vier nicht mehr existieren.
  assert.ok(!/addrField\("[sr]", "street"/.test(newShipSrc), "kein altes Straßenfeld mehr");
});
