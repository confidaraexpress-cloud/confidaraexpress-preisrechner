// Adressvorschläge und Adressprüfung im Formular — Quelltext- und Verhaltenstests.
//
// Die wichtigsten Zusicherungen dieser Datei:
//   • Die Prüfung sperrt NIE — weder die Preisberechnung noch das Speichern.
//   • Ein Vorschlag wird nur nach Auswahl übernommen und füllt ausschließlich Straße/Hausnummer,
//     PLZ und Ort; Firma, Namen, Zusatz und Kontakt bleiben unberührt.
//   • „Adresse gefunden“ nur mit bestätigter Hausnummer; nirgends eine Zusage der Zustellbarkeit.
//   • Jede Änderung an Land/PLZ/Ort/Straße/Hausnummer verwirft eine frühere Prüfung.
//   • Das Frontend kennt weder den Anbieter noch eine fremde URL — außer der Quellenangabe.
//
// Ausführen: node --test src/utils/addressValidationUx.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as view from "./addressValidationView.mjs";
import {
  ADDRESS_STATUS, ADDRESS_MESSAGES, ADDRESS_REASON_MESSAGES, addressStatusMessage,
  isAddressCheckSupported, isPostalCodeQueryable, isStreetQueryable, isValidationReady, STREET_MIN_CHARS,
  streetQueryText, streetSearchTerm, splitStreetAndNumber, formatStreetLine, suggestionLabel,
  applyAddressSuggestion, cityFromSuggestion, addressFingerprint, shouldInvalidateAddress,
  readAddressResponse, readStreetSuggestions, addressNeedsAcknowledgement,
  addressStatusTone, showsAddressStatus, shippingLengthHint, SHIPPING_LINE_HINT_LIMITS,
} from "./addressValidationView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const viewSrc    = read("./addressValidationView.mjs");
const hookSrc    = read("../hooks/useAddressValidation.js");
const inputSrc   = read("../components/address/AddressSuggestInput.jsx");
const statusSrc  = read("../components/address/AddressStatusLine.jsx");
const attrSrc    = read("../components/address/AddressAttribution.jsx");
const apiSrc     = read("../api/addressValidationApi.js");
const newShipSrc = read("../pages/NewShipmentPage.jsx");
const drawerSrc  = read("../components/addressbook/AddressFormDrawer.jsx");
const orderSrc   = read("../components/inventory/OrderCreateForm.jsx");
const profileSrc = read("../components/dashboard/Profile.jsx");
const registerSrc = read("../components/auth/RegisterForm.jsx");
const partnerSrc = read("../components/partner/PartnerBillingDetailsSection.jsx");
const calcSrc    = read("../pages/CalculatorPage.jsx");
const cssSrc     = read("../styles/address-validation.css");

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

// ── 1. Wann gefragt wird ─────────────────────────────────────────────────────

test("1 Länder: das Frontend führt keine Länderliste — der Server entscheidet", () => {
  for (const cc of ["DE", "at", " FR ", "pl", "MT"]) assert.equal(isAddressCheckSupported(cc), true, cc);
  for (const cc of ["", null, undefined, "D", "DEU", "1A"]) assert.equal(isAddressCheckSupported(cc), false, String(cc));
  assert.ok(!("SUPPORTED_COUNTRIES" in view), "keine eigene Länderliste im Client");
  assert.ok(!/["']DE["'],\s*["']AT["']/.test(strip(viewSrc)));
});

test("2 KRITISCH: ein nicht abgedecktes Land zeigt nichts und sperrt nichts", () => {
  assert.equal(showsAddressStatus(ADDRESS_STATUS.UNSUPPORTED), false, "es wird nichts angezeigt");
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.UNSUPPORTED), false);
  assert.ok(!("addressBlocksSubmit" in view), "es gibt keine Sperrfunktion mehr");
});

test("3 Orte werden erst bei formal gültiger PLZ des Landes abgefragt", () => {
  assert.equal(isPostalCodeQueryable("DE", "637"), false);
  assert.equal(isPostalCodeQueryable("DE", "6374"), false, "DE braucht fünf Stellen");
  assert.equal(isPostalCodeQueryable("DE", "63743"), true);
  assert.equal(isPostalCodeQueryable("DE", "01067"), true, "führende Null");
  assert.equal(isPostalCodeQueryable("AT", "1010"), true);
  assert.equal(isPostalCodeQueryable("NL", "1012 AB"), true, "alphanumerisch");
  assert.equal(isPostalCodeQueryable("PL", "00-950"), true, "mit Bindestrich");
  assert.equal(isPostalCodeQueryable("DE", ""), false);
  assert.equal(isPostalCodeQueryable("", "63743"), false);
});

test("4 Vorschläge ab drei Zeichen — PLZ und Ort sind keine Voraussetzung", () => {
  assert.equal(STREET_MIN_CHARS, 3);
  assert.equal(isStreetQueryable("DE", "", "", "Ha"), false);
  assert.equal(isStreetQueryable("DE", "", "", "Hau"), true, "man kann mit der Straße beginnen");
  assert.equal(isStreetQueryable("FR", "75002", "Paris", "12 rue"), true);
  assert.equal(isStreetQueryable("", "63743", "Aschaffenburg", "Hauptstraße"), false);
  assert.equal(streetQueryText("  Hauptstr   12a "), "Hauptstr 12a", "mit Hausnummer, nur Leerraum vereinheitlicht");
});

test("5 die Gesamtprüfung braucht Straße, Ort und eine gültige PLZ", () => {
  const voll = { country: "DE", postalCode: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" };
  assert.equal(isValidationReady(voll), true);
  assert.equal(isValidationReady({ ...voll, city: " " }), false);
  assert.equal(isValidationReady({ ...voll, postalCode: "6374" }), false);
  assert.equal(isValidationReady({ ...voll, street: "Sc" }), false);
});

// ── 2. Straße und Hausnummer ────────────────────────────────────────────────

test("6 Straße und Hausnummer je Land getrennt und zusammengesetzt", () => {
  assert.deepEqual(splitStreetAndNumber("Schweinheimer Straße 187", "DE"), { street: "Schweinheimer Straße", houseNumber: "187" });
  assert.deepEqual(splitStreetAndNumber("Hauptstr. 12a", "DE"), { street: "Hauptstr.", houseNumber: "12a" });
  assert.deepEqual(splitStreetAndNumber("Bahnhofstraße 1-3", "DE"), { street: "Bahnhofstraße", houseNumber: "1-3" });
  assert.deepEqual(splitStreetAndNumber("Straße des 17. Juni", "DE"), { street: "Straße des 17. Juni", houseNumber: "" });
  assert.deepEqual(splitStreetAndNumber("Via Roma 1/B", "IT"), { street: "Via Roma", houseNumber: "1/B" });
  assert.deepEqual(splitStreetAndNumber("12 rue de la Paix", "FR"), { street: "rue de la Paix", houseNumber: "12" });
  assert.equal(formatStreetLine("FR", "Rue de la Paix", "12"), "12 Rue de la Paix");
  assert.equal(formatStreetLine("DE", "Hauptstraße", "12a"), "Hauptstraße 12a");
  assert.equal(streetSearchTerm("Hauptstr. 12a"), "Hauptstr.");
  assert.equal(suggestionLabel({ street: "Main Street", houseNumber: "5" }, "IE"), "5 Main Street");
});

test("7 KRITISCH: ein Vorschlag füllt Straße/Hausnummer, PLZ und Ort — sonst nichts", () => {
  const vorschlag = { street: "Schweinheimer Straße", houseNumber: "187", postalCode: "63743", city: "Aschaffenburg",
    region: "Bayern", company: "X", firstName: "Y", phone: "1", email: "a@b" };
  const patch = applyAddressSuggestion({ country: "DE", street: "schweinh" }, vorschlag);
  assert.deepEqual(patch, { street: "Schweinheimer Straße 187", postalCode: "63743", city: "Aschaffenburg" });
  assert.deepEqual(Object.keys(patch).sort(), ["city", "postalCode", "street"], "keine Region, kein Name, kein Kontakt");
});

test("8 KRITISCH: die getippte Hausnummer bleibt, wenn der Vorschlag keine nennt — erfunden wird keine", () => {
  assert.equal(applyAddressSuggestion({ country: "DE", street: "schweinheimer str 187" },
    { street: "Schweinheimer Straße", houseNumber: "" }).street, "Schweinheimer Straße 187");
  assert.equal(applyAddressSuggestion({ country: "DE", street: "schweinheimer" },
    { street: "Schweinheimer Straße" }).street, "Schweinheimer Straße");
  assert.equal(applyAddressSuggestion({ country: "FR", street: "12 rue de la p" },
    { street: "Rue de la Paix", postalCode: "75002", city: "Paris" }).street, "12 Rue de la Paix");
  // Leere Werte des Vorschlags überschreiben nie vorhandene Eingaben.
  assert.deepEqual(applyAddressSuggestion({ country: "DE", street: "Haupt" }, { street: "Hauptstraße", postalCode: "", city: "" }),
    { street: "Hauptstraße" });
  assert.deepEqual(applyAddressSuggestion({ country: "DE", street: "x" }, null), {});
  assert.equal(cityFromSuggestion("Aschaffenburg"), "Aschaffenburg");
  assert.equal(cityFromSuggestion({ city: "Paris" }), "Paris");
});

// ── 3. Aussagen und Töne ────────────────────────────────────────────────────

test("9 KRITISCH: keine Zusage der Zustellbarkeit, „gefunden“ nur mit bestätigter Hausnummer", () => {
  const texte = [...Object.values(ADDRESS_MESSAGES), ...Object.values(ADDRESS_REASON_MESSAGES)];
  for (const t of texte) {
    assert.ok(!/zustell|garant|sicher ankommt/i.test(t), `„${t}“ verspricht Zustellbarkeit`);
  }
  assert.equal(ADDRESS_MESSAGES[ADDRESS_STATUS.CONFIRMED], "Adresse gefunden (Straße, Hausnummer, PLZ und Ort).");
  // Die Hausnummer gilt nur zusammen mit „confirmed“ als gefunden — auch eine manipulierte Antwort
  // kann das nicht anders behaupten.
  assert.equal(readAddressResponse({ status: "unverified", houseNumberVerified: true }).houseNumberVerified, false);
  assert.equal(readAddressResponse({ status: "confirmed", houseNumberVerified: true }).houseNumberVerified, true);
  assert.equal(readAddressResponse({ status: "confirmed" }).houseNumberVerified, false);
});

test("10 Hinweise je Grund, sonst der allgemeine Text", () => {
  assert.equal(addressStatusMessage("unverified", "house_number_unconfirmed"),
    "Straße gefunden – die Hausnummer konnte nicht bestätigt werden. Bitte prüfen.");
  assert.equal(addressStatusMessage("unverified", "postal_code_city_mismatch"),
    "PLZ und Ort passen möglicherweise nicht zusammen.");
  assert.equal(addressStatusMessage("unverified", "house_number_missing"),
    "Straße gefunden. Bitte ergänzen Sie die Hausnummer, falls vorhanden.");
  assert.equal(addressStatusMessage("unverified", "address_not_found"), ADDRESS_MESSAGES.unverified);
  assert.equal(addressStatusMessage("unavailable", "budget_exhausted"), ADDRESS_MESSAGES.unavailable);
  assert.equal(addressStatusMessage("unsupported", "not_configured"), "");
});

test("11 Hinweise lassen sich bewusst übergehen; es gibt keinen Fehlerton", () => {
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.UNVERIFIED), true);
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.UNAVAILABLE), true);
  assert.equal(addressNeedsAcknowledgement(ADDRESS_STATUS.CONFIRMED), false);
  assert.equal(addressStatusTone(ADDRESS_STATUS.CONFIRMED), "success");
  assert.equal(addressStatusTone(ADDRESS_STATUS.UNVERIFIED), "warning");
  assert.equal(addressStatusTone(ADDRESS_STATUS.UNAVAILABLE), "warning");
  assert.ok(!Object.values(ADDRESS_STATUS).includes("invalid"), "den Zustand „invalid“ gibt es nicht mehr");
  assert.ok(!/addr-status--error/.test(statusSrc));
});

// ── 4. Auswertung der Serverantwort ─────────────────────────────────────────

test("12 bekannte Status werden übernommen, „invalid“ und Kaputtes werden 'unverified'", () => {
  for (const s of ["confirmed", "unverified", "unavailable", "unsupported"]) {
    assert.equal(readAddressResponse({ status: s }).status, s);
  }
  for (const body of [null, undefined, {}, "text", 42, { status: "kaputt" }, { status: 123 }, { status: "invalid" }]) {
    assert.equal(readAddressResponse(body).status, ADDRESS_STATUS.UNVERIFIED, `${JSON.stringify(body)}`);
  }
});

test("13 Vorschläge werden defensiv gelesen", () => {
  const r = readAddressResponse({ status: "unverified", citySuggestions: ["Aschaffenburg", 42, null],
    streetSuggestions: [{ street: "Hauptstraße" }, { nope: 1 }, null] });
  assert.deepEqual(r.citySuggestions, ["Aschaffenburg"]);
  assert.equal(r.streetSuggestions.length, 1);
  assert.deepEqual(readStreetSuggestions({ streets: [
    { street: " Hauptstraße ", houseNumber: "1", postalCode: "63743", city: "AB", confidence: 1, lat: 3 },
    { street: "" }, null, { street: 5 }] }),
  [{ street: "Hauptstraße", houseNumber: "1", postalCode: "63743", city: "AB" }]);
  assert.deepEqual(readStreetSuggestions(null), []);
});

// ── 5. Invalidierung ────────────────────────────────────────────────────────

const BASIS = { country: "DE", postalCode: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" };

test("14 jede Änderung an Land, PLZ, Ort oder Straße verwirft die Prüfung", () => {
  const a = addressFingerprint(BASIS);
  for (const [key, val] of [["country", "AT"], ["postalCode", "63744"], ["city", "München"], ["street", "Hauptstraße 187"]]) {
    assert.equal(shouldInvalidateAddress(a, addressFingerprint({ ...BASIS, [key]: val })), true, `${key} muss invalidieren`);
  }
});

test("15 KRITISCH: eine geänderte Hausnummer verwirft die Prüfung ebenfalls", () => {
  const a = addressFingerprint(BASIS);
  const b = addressFingerprint({ ...BASIS, street: "Schweinheimer Straße 42" });
  assert.equal(shouldInvalidateAddress(a, b), true, "die Hausnummer ist Teil der Bestätigung");
});

test("16 Groß-/Kleinschreibung und Leerzeichen invalidieren nicht", () => {
  const a = addressFingerprint(BASIS);
  assert.equal(shouldInvalidateAddress(a, addressFingerprint({ ...BASIS, city: "  ASCHAFFENBURG  " })), false);
});

// ── 6. Sicherheit und Datenschutz ───────────────────────────────────────────

test("17 SICHERHEIT: das Frontend führt keine eigene Orts-/Straßenliste", () => {
  for (const [name, src] of [["view", viewSrc], ["hook", hookSrc], ["input", inputSrc], ["status", statusSrc]]) {
    assert.ok(!/Aschaffenburg|Musterstadt|63743/.test(strip(src)), `${name} darf keine Ortsdaten enthalten`);
  }
});

test("18 SICHERHEIT: kein Adressdienst im Browser — nur die Quellenangabe verlinkt ihn", () => {
  for (const [name, src] of [["api", apiSrc], ["hook", hookSrc], ["view", viewSrc],
                             ["input", inputSrc], ["status", statusSrc], ["NewShipmentPage", newShipSrc]]) {
    assert.ok(!/openplz|geoapify/i.test(strip(src)), `${name} darf den Anbieter nicht kennen`);
    assert.ok(!/https?:\/\/(?!127|localhost)/.test(strip(src).replace(/claude\.ai|confidaraexpress\.de/g, "")),
      `${name} darf keine fremde URL aufrufen`);
  }
  assert.ok(apiSrc.includes("/api/address"), "es wird ausschließlich die CE-API angesprochen");
  // Die Quellenangabe ist reine Anzeige: zwei Links, kein Aufruf, kein Schlüssel.
  assert.ok(attrSrc.includes("https://www.openstreetmap.org/copyright"));
  assert.ok(attrSrc.includes("https://www.geoapify.com/"));
  assert.ok(!/fetch|apiFetch|apiKey|XMLHttpRequest/.test(strip(attrSrc)));
});

test("19 DATENSCHUTZ: es werden nur Adressbestandteile übertragen", () => {
  const body = apiSrc.slice(apiSrc.indexOf("export function validateAddress"));
  assert.ok(/JSON\.stringify\(\{ country, postalCode, city, street \}\)/.test(body), "der Payload trägt genau vier Felder");
  for (const feld of ["fullName", "company", "phone", "email", "userId", "contactName", "firstName"]) {
    assert.ok(!apiSrc.includes(feld), `${feld} darf nicht übertragen werden`);
  }
});

test("20 keine Adressen in Konsolenausgaben", () => {
  for (const [name, src] of [["hook", hookSrc], ["api", apiSrc], ["input", inputSrc]]) {
    assert.ok(!/console\.(log|debug|info)/.test(src), `${name} darf nichts protokollieren`);
  }
});

test("21 öffentliche Registrierung: eigene Routen ohne Anmeldung, keine Gesamtprüfung", () => {
  assert.ok(/publicAccess \? "\/api\/address\/public" : "\/api\/address"/.test(apiSrc));
  assert.equal((apiSrc.match(/auth: !publicAccess/g) || []).length, 2, "Orte und Vorschläge ohne auth im öffentlichen Fall");
  assert.ok(/if \(publicAccess\) return \{ status: ADDRESS_STATUS\.IDLE \};/.test(hookSrc), "keine Prüfung ohne Anmeldung");
  assert.ok(/publicAccess: true/.test(registerSrc), "die Registrierung nutzt die öffentlichen Routen");
  assert.ok(!/<AddressStatusLine\b/.test(registerSrc), "die Registrierung zeigt keine Prüfung");
});

// ── 7. Anfragehygiene ───────────────────────────────────────────────────────

test("22 entprellt, abgebrochen und reihenfolgesicher", () => {
  assert.ok(/const DEBOUNCE_MS = \d{3}/.test(hookSrc), "Entprellung fehlt");
  assert.ok(/setTimeout\(/.test(hookSrc) && /clearTimeout\(/.test(hookSrc), "Timer wird aufgeräumt");
  assert.ok((hookSrc.match(/new AbortController\(\)/g) || []).length >= 3, "jede Anfrageart braucht einen Abbruch");
  assert.ok(/locSeq|strSeq|valSeq/.test(hookSrc), "Sequenzzähler fehlen");
  assert.ok(/if \(e && e\.name === "AbortError"\) return;/.test(hookSrc), "ein Abbruch darf keine Fehlermeldung erzeugen");
  assert.ok(/useEffect\(\(\) => \(\) => abortAll\(\), \[abortAll\]\)/.test(hookSrc), "Abbruch beim Verlassen");
});

test("23 Kostenbewusst: Prüfung automatisch nach einer Ruhesekunde, nicht je Tastendruck", () => {
  assert.ok(/const AUTO_VALIDATE_MS = 1000;/.test(hookSrc));
  assert.ok(/isValidationReady\(\{ country, postalCode, city, street \}\)/.test(hookSrc));
  // Eine PLZ- oder Ortsänderung löst keine neue Vorschlagssuche aus (nur Kontext).
  assert.ok(/\}, \[enabled, supported, country, street, publicAccess, markUnsupported\]\);/.test(hookSrc));
  // Nach einer Auswahl wird für genau diesen Wert nicht erneut gesucht.
  assert.ok(/skipStreetRef\.current === text/.test(hookSrc));
  // „nicht eingerichtet“ beendet die Abfragen der Sitzung für eine Weile.
  assert.ok(/body\.reason === "not_configured"/.test(hookSrc));
});

// ── 8. Bedienung und Barrierefreiheit ───────────────────────────────────────

test("24 das Vorschlagsfeld folgt dem Combobox-Muster und kündigt Treffer an", () => {
  for (const attr of ['role="combobox"', "aria-expanded=", "aria-controls=", "aria-activedescendant=",
                      'role="listbox"', 'role="option"', "aria-selected="]) {
    assert.ok(inputSrc.includes(attr), `${attr} fehlt`);
  }
  assert.ok(/className="sr-only" role="status" aria-live="polite"/.test(inputSrc), "Trefferzahl für Screenreader");
});

test("25 Tastaturbedienung vollständig", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"]) {
    assert.ok(inputSrc.includes(`"${key}"`), `${key} muss behandelt werden`);
  }
  assert.ok(/if \(open && active >= 0 && active < items\.length\)/.test(inputSrc));
  assert.ok(/addEventListener\("mousedown"/.test(inputSrc) && /removeEventListener\("mousedown"/.test(inputSrc));
  assert.ok(/onMouseDown=\{\(e\) => \{ e\.preventDefault\(\); choose\(item\); \}\}/.test(inputSrc));
});

test("26 die Liste ist begrenzt, läuft nicht aus dem Bild und trägt die Quellenangabe", () => {
  assert.ok(/suggestions\.slice\(0, 8\)/.test(inputSrc), "höchstens acht Vorschläge");
  assert.ok(/max-width: 100%/.test(cssSrc), "die Liste darf nie breiter als das Feld sein");
  assert.ok(/max-height:/.test(cssSrc) && /overflow-y: auto/.test(cssSrc));
  assert.ok(/<AddressAttribution \/>/.test(inputSrc), "Quellenangabe an jeder Liste");
  assert.ok(/text = typeof item === "string" \? item : \(item\.label \|\| item\.street\)/.test(inputSrc));
});

test("27 Touch: Optionen und Aktionen mindestens 44 px; nur Foundation-Tokens", () => {
  assert.ok(/@media \(pointer: coarse\) \{[\s\S]*?\.addr-suggest-opt \{ min-height: var\(--ce-size-touch-target\); \}/.test(cssSrc));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(cssSrc), "kein Hexwert");
  assert.ok(!/rgba?\(/.test(cssSrc), "kein rgb/rgba");
});

// ── 9. Anbindung der Formulare ──────────────────────────────────────────────

const FORMULARE = [
  ["NewShipmentPage", newShipSrc, true], ["AddressFormDrawer", drawerSrc, true], ["OrderCreateForm", orderSrc, true],
  ["Profile", profileSrc, true], ["PartnerBillingDetailsSection", partnerSrc, true],
  ["RegisterForm", registerSrc, false], ["CalculatorPage", calcSrc, false],
];

test("28 alle Adressformulare nutzen dieselbe zentrale Logik", () => {
  for (const [name, src, mitStatus] of FORMULARE) {
    assert.ok(/useAddressValidation\(\{/.test(src), `${name} muss den zentralen Hook aufrufen`);
    assert.ok(/<AddressSuggestInput\b/.test(src), `${name} muss das zentrale Feld rendern`);
    if (mitStatus) assert.ok(/<AddressStatusLine\b/.test(src), `${name} muss die zentrale Statuszeile rendern`);
    assert.ok(!/fetchStreets|fetchLocalities|validateAddress\(/.test(src), `${name} darf die Adress-API nicht selbst aufrufen`);
  }
});

test("29 jede Übernahme läuft über applyAddressSuggestion und meldet die Auswahl", () => {
  for (const [name, src] of FORMULARE.filter(([n]) => n !== "CalculatorPage")) {
    assert.ok(/applyAddressSuggestion\(/.test(src), `${name} übernimmt Vorschläge nicht zentral`);
    assert.ok(/\.markSelected\(patch\.street\)/.test(src), `${name} meldet die Auswahl nicht`);
  }
  assert.ok(!/applyStreetSuggestion/.test(newShipSrc + drawerSrc + orderSrc), "die alte Teilübernahme ist ersetzt");
});

test("30 KRITISCH: die Preisberechnung hängt nicht an der Adressprüfung", () => {
  const code = strip(newShipSrc);
  assert.ok(!/addressBlocksCalculation|addressBlocksSubmit/.test(code));
  assert.ok(/disabled=\{loading \|\| !calcValid \|\| saving \|\| datumFehlt\}/.test(code));
  assert.ok(!/senderCheck\.status|recipientCheck\.status[^\n]*disabled/.test(code.replace(/status=\{(sender|recipient)Check\.status\}/g, "")));
});

test("31 KRITISCH: Entwürfe bleiben unvollständig speicherbar", () => {
  const code = strip(newShipSrc);
  const idx = code.indexOf("dft-savedraft-cta");
  const start = code.lastIndexOf("<button", idx);
  const draftBtn = code.slice(start, code.indexOf("</button>", idx));
  assert.ok(draftBtn.includes("dft-savedraft-cta"), "der Entwurfsknopf muss gefunden werden");
  assert.ok(!/senderCheck|recipientCheck/.test(draftBtn), "der Entwurfs-Speicherknopf hängt nicht an der Adressprüfung");
  assert.ok(/disabled=\{!canExplicitSave\}/.test(draftBtn));
});

test("32 Adressbuch, Profil und Partnerabrechnung sperren das Speichern nicht", () => {
  for (const [name, src, check] of [["AddressFormDrawer", drawerSrc, "addressCheck"], ["Profile", profileSrc, "companyAddressCheck"],
                                    ["PartnerBillingDetailsSection", partnerSrc, "adresse"]]) {
    const code = strip(src);
    assert.ok(!new RegExp(`disabled=\\{[^}]*${check}`).test(code), `${name}: kein Knopf hängt an der Prüfung`);
  }
});

test("33 die bestehende PLZ-Formatprüfung bleibt unangetastet", () => {
  assert.ok(!/postalCodeRules|isPostalCodeRequired/.test(viewSrc), "die Formatregeln werden nicht direkt gelesen");
  assert.ok(newShipSrc.includes("isPostalCodeRequired"), "die Formatprüfung ist noch verdrahtet");
  assert.ok(drawerSrc.includes("postalCodeExample"), "die Beispielanzeige bleibt erhalten");
});

test("34 keine technischen Begriffe in Kundentexten", () => {
  for (const text of [...Object.values(ADDRESS_MESSAGES), ...Object.values(ADDRESS_REASON_MESSAGES)]) {
    for (const wort of ["OpenPLZ", "Geoapify", "Provider", "API", "HTTP", "500", "Timeout", "null", "Endpoint", "Credit"]) {
      assert.ok(!text.includes(wort), `„${text}“ darf „${wort}“ nicht nennen`);
    }
  }
  assert.equal(ADDRESS_MESSAGES[ADDRESS_STATUS.UNAVAILABLE], "Automatische Adressprüfung ist momentan nicht verfügbar.");
});

test("35 in Neue Sendung tragen Absender UND Empfänger je Straße und Ort das Vorschlagsfeld", () => {
  for (const id of ["ns-s-street", "ns-s-city", "ns-r-street", "ns-r-city"]) {
    assert.ok(newShipSrc.includes(`id="${id}"`), `${id} fehlt — das Feld ist nicht umgestellt`);
  }
  assert.equal((newShipSrc.match(/<AddressSuggestInput\b/g) || []).length, 4, "genau vier Adressfelder mit Vorschlägen");
  assert.equal((newShipSrc.match(/<AddressStatusLine\b/g) || []).length, 2, "je eine Statuszeile");
  assert.ok(!/addrField\("[sr]", "street"/.test(newShipSrc), "kein altes Straßenfeld mehr");
});

test("36 Längenhinweis: Hinweis statt Sperre, an den Grenzen des Buchungsvertrags", () => {
  assert.deepEqual({ ...SHIPPING_LINE_HINT_LIMITS }, { street: 35, city: 30, company: 35 });
  assert.equal(shippingLengthHint("street", "x".repeat(35)), null);
  assert.match(shippingLengthHint("street", "x".repeat(36)), /36 Zeichen – einige Versandoptionen übernehmen höchstens 35/);
  assert.equal(shippingLengthHint("city", "x".repeat(30)), null);
  assert.ok(shippingLengthHint("company", "x".repeat(40)));
  assert.equal(shippingLengthHint("phone", "x".repeat(99)), null);
  // Als Hinweis verdrahtet — nicht im Fehlerobjekt, das die Berechnung sperren würde.
  assert.equal((newShipSrc.match(/hint=\{shippingLengthHint\("(street|city)"/g) || []).length, 4);
  assert.ok(!/e\.[sr]_street\s*=\s*shippingLengthHint/.test(newShipSrc));
});
