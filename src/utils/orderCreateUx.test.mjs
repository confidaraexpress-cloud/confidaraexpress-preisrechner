// „Auftrag erstellen" — Empfänger, Positionen, Zusatzangaben, Absenden.
//
// Der Kern in einem Satz: **das Backend bleibt Autorität.** Das Formular sagt
// dem Nutzer, was seine Eingabe bedeutet — es entscheidet nicht, ob sie geht.
// Alle Prüfungen hier sind Bedienhilfen; die verbindliche, atomare Prüfung
// läuft in `POST /api/kunde/orders`.
//
// Zweiter Kern: **Pflichtfelder exakt vom Backend.** `validateRecipient()` in
// routes/orders.js verlangt fullName, streetAndNumber, city, country — die PLZ
// nur über `validatePostalCode(country, …)`, also landesabhängig. Ein
// unbedingtes „PLZ *" war ein erfundener Stern und blockierte gültige Adressen
// aus Ländern ohne Postleitzahlsystem.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ORDER_RECIPIENT_LIMITS, ORDER_RECIPIENT_REQUIRED, MAX_ORDER_POSITIONS,
  emptyOrderRecipient, postalCodeRequirement, validateOrderRecipient,
  normalizeOrderRecipient, availableOf, reservationPreview, reservationPreviewLines,
  quantityError, positionErrors, canSubmitOrder, STOCK_EXPLANATION,
  insufficientStockMessage, extrasFilled,
} from "./orderCreateView.mjs";
import { mapAddressToOrderRecipient, addressPickerLabel, addressPickerMeta } from "./addressBookView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const form = lies("../components/inventory/OrderCreateForm.jsx");
// Der Picker ist mit der Verallgemeinerung nach components/addressbook gewandert:
// EIN Bauteil für Auftragsdialog und „Neue Sendung" (Reiter als Prop).
const picker = lies("../components/addressbook/AddressPicker.jsx");
const ordersPage = lies("../pages/inventory/OrdersPage.jsx");
const shared = lies("../components/inventory/InventoryShared.jsx");
const css = lies("../styles/inventory.css");
// Das Material der Adressauswahl liegt seit ihrer Verallgemeinerung beim
// Adressbuch — sie wird von zwei Bereichen genutzt und gehört damit in keins
// der beiden Bereichs-Stylesheets.
const abkCss = lies("../styles/addressbook.css");

/* „Darf NICHT vorkommen" läuft am kommentarfreien Quelltext — sonst schlägt die
   Prüfung an, sobald ein Kommentar die abgelöste Fassung erklärt. */
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const formCode = ohneKommentare(form);
const pickerCode = ohneKommentare(picker);
const ordersCode = ohneKommentare(ordersPage);

const vollstaendig = () => ({
  ...emptyOrderRecipient(),
  fullName: "Maria Beispiel", streetAndNumber: "Hauptstraße 3",
  postalCode: "10115", city: "Berlin", country: "DE",
});

/* ══════════ A — Pflichtfelder exakt vom Backend ═══════════════════════════ */

test("A1 genau vier unbedingte Pflichtfelder — die des Backendvertrags", () => {
  assert.deepEqual([...ORDER_RECIPIENT_REQUIRED], ["fullName", "streetAndNumber", "city", "country"]);
});

test("A2 die PLZ ist KEIN unbedingtes Pflichtfeld", () => {
  assert.equal(ORDER_RECIPIENT_REQUIRED.includes("postalCode"), false);
});

test("A3 fehlende Pflichtfelder werden benannt, optionale nicht", () => {
  const e = validateOrderRecipient(emptyOrderRecipient());
  assert.ok(e.fullName && e.streetAndNumber && e.city);
  assert.equal(e.company, undefined);
  assert.equal(e.phone, undefined);
  assert.equal(e.addressAddition, undefined);
});

test("A4 vollständige deutsche Adresse ist fehlerfrei", () => {
  assert.deepEqual(validateOrderRecipient(vollstaendig()), {});
});

test("A5 Deutschland verlangt eine PLZ — fehlt sie, ist es ein Fehler", () => {
  const e = validateOrderRecipient({ ...vollstaendig(), postalCode: "" });
  assert.match(e.postalCode, /PLZ ist für dieses Land erforderlich/);
});

test("A6 Irland kennt keine Pflicht-PLZ — leer ist gültig", () => {
  const e = validateOrderRecipient({ ...vollstaendig(), country: "IE", postalCode: "" });
  assert.equal(e.postalCode, undefined);
});

test("A7 der Stern der PLZ folgt dem Land, nicht der Gewohnheit", () => {
  assert.deepEqual(postalCodeRequirement("DE"), { shown: true, required: true });
  assert.equal(postalCodeRequirement("IE").required, false);
});

test("A8 falsches PLZ-Format nennt das Landesbeispiel", () => {
  const e = validateOrderRecipient({ ...vollstaendig(), postalCode: "ABC" });
  assert.match(e.postalCode, /Beispiel/);
});

test("A9 ungültige E-Mail wird gemeldet, leere nicht", () => {
  assert.ok(validateOrderRecipient({ ...vollstaendig(), email: "kein-at" }).email);
  assert.equal(validateOrderRecipient({ ...vollstaendig(), email: "" }).email, undefined);
});

test("A10 Feldlängen stimmen mit RECIPIENT_LIMITS des Backends überein", () => {
  assert.equal(ORDER_RECIPIENT_LIMITS.fullName, 35);
  assert.equal(ORDER_RECIPIENT_LIMITS.streetAndNumber, 35);
  assert.equal(ORDER_RECIPIENT_LIMITS.city, 30);
  assert.equal(ORDER_RECIPIENT_LIMITS.company, 35);
  assert.equal(ORDER_RECIPIENT_LIMITS.addressAddition, 100);
  assert.equal(ORDER_RECIPIENT_LIMITS.phone, 40);
  assert.equal(ORDER_RECIPIENT_LIMITS.email, 254);
  assert.equal(ORDER_RECIPIENT_LIMITS.postalCode, 10);
});

test("A11 das Formular markiert nur die vier Pflichtfelder unbedingt mit *", () => {
  // Zwei Schreibweisen: die Feldkomponente bekommt `label="…"`, das Landfeld
  // ist ein eigenes <select> mit eigenem <label>. Beide werden erfasst.
  const sterne = [
    ...[...formCode.matchAll(/label="([^"]*\*)"/g)].map((m) => m[1]),
    ...[...formCode.matchAll(/<label className="field-label"[^>]*>([^<]*\*)<\/label>/g)].map((m) => m[1]),
  ];
  assert.deepEqual(sterne.sort(), [
    "Land *", "Name / Ansprechpartner *", "Ort *", "Straße und Hausnummer *",
  ]);
});

test("A12 der PLZ-Stern hängt an der Landesregel, nicht am Markup", () => {
  assert.match(formCode, /plzRegel\.required \? "PLZ \*" : "PLZ"/);
});

test("A13 Normalisierung: leere optionale Felder werden null, Land groß", () => {
  const p = normalizeOrderRecipient({ ...vollstaendig(), country: "de", company: "  ", phone: "" });
  assert.equal(p.country, "DE");
  assert.equal(p.company, null);
  assert.equal(p.phone, null);
  assert.equal(p.fullName, "Maria Beispiel");
});

/* ══════════ B — Adressbuch: eine Logik, eine Vorbelegung ══════════════════ */

test("B1 der Mapper übersetzt Adressbuch- in Empfängerfelder", () => {
  const r = mapAddressToOrderRecipient({
    company: "Muster GmbH", contactName: "Jan Muster", streetAndNumber: "Weg 1",
    addressAdd: "Hinterhaus", postalCode: "20095", city: "Hamburg", country: "de",
    phone: "040 1", email: "jan@example.com",
  });
  assert.deepEqual(r, {
    company: "Muster GmbH", fullName: "Jan Muster", streetAndNumber: "Weg 1",
    addressAddition: "Hinterhaus", postalCode: "20095", city: "Hamburg",
    country: "DE", phone: "040 1", email: "jan@example.com",
  });
});

test("B2 Felder ohne Ziel im Auftrag werden NICHT übernommen", () => {
  const r = mapAddressToOrderRecipient({ label: "Kunde A", notes: "x", state: "HH", role: "both", favorite: true });
  for (const key of ["label", "notes", "state", "role", "favorite", "isDefaultSender", "isDefaultRecipient", "id"]) {
    assert.equal(key in r, false, `${key} gehört nicht in den Empfänger`);
  }
});

test("B3 eine übernommene Adresse ergibt einen gültigen Empfänger", () => {
  const r = mapAddressToOrderRecipient({ contactName: "A B", streetAndNumber: "S 1", postalCode: "10115", city: "Berlin", country: "DE" });
  assert.deepEqual(validateOrderRecipient(r), {});
});

test("B4 die Auswahl ist eine EINMALIGE Vorbelegung — kein Effekt, der nachsynchronisiert", () => {
  // Übernommen wird ausschließlich im Klickhandler. Ein useEffect auf die
  // gewählte Adresse würde jede spätere manuelle Korrektur überschreiben.
  assert.match(formCode, /const adresseUebernehmen = \(address\) => \{[\s\S]*?setRecipient\(mapAddressToOrderRecipient\(address\)\)/);
  assert.doesNotMatch(formCode, /useEffect\([^)]*mapAddressToOrderRecipient/);
});

test("B5 nichts wird ins Adressbuch zurückgeschrieben", () => {
  assert.doesNotMatch(formCode, /createAddress|updateAddress/);
  assert.doesNotMatch(pickerCode, /createAddress|updateAddress|deleteAddress/);
});

test("B6 die Liste kommt aus dem bestehenden Adressbuch-Endpunkt", () => {
  assert.match(pickerCode, /import \{ getAddresses \} from "\.\.\/\.\.\/api\/addressBookApi"/);
  assert.doesNotMatch(pickerCode, /apiFetch|fetch\(/);
});

test("B7 gefiltert wird über den bestehenden Rollenbegriff (recipient ODER both)", () => {
  // Der Auftragsdialog übergibt den Reiter, der Picker reicht ihn an
  // getAddresses durch — und normalisiert einen fehlenden Reiter auf
  // TAB_RECIPIENT, damit nie ungefiltert geladen wird.
  assert.match(formCode, /<AddressPicker tab=\{TAB_RECIPIENT\}/);
  assert.match(pickerCode, /tab: reiter/);
  assert.match(pickerCode, /tab === TAB_SENDER \? TAB_SENDER : TAB_RECIPIENT/);
});

test("B8 die Zeilenbeschriftung fällt nie auf einen Rohwert oder „undefined“ zurück", () => {
  assert.equal(addressPickerLabel({ label: "Kunde A", company: "X" }), "Kunde A");
  assert.equal(addressPickerLabel({ company: "X GmbH" }), "X GmbH");
  assert.equal(addressPickerLabel({ contactName: "Jan" }), "Jan");
  assert.equal(addressPickerLabel({}), "Ohne Bezeichnung");
  assert.equal(addressPickerMeta({ streetAndNumber: "Weg 1", postalCode: "10115", city: "Berlin", country: "DE" }),
    "Weg 1 · 10115 Berlin · DE");
  assert.equal(addressPickerMeta({}), "");
});

test("B9 manuelle Eingabe bleibt immer möglich — die Felder stehen unabhängig vom Picker", () => {
  // Die Empfängerfelder sind NICHT in den Zweig `addressPickerOpen ? … : …`
  // eingeschlossen: der Picker ersetzt nur seinen eigenen Auslöser.
  const empfaenger = formCode.slice(formCode.indexOf("Empfänger</legend>"), formCode.indexOf("Positionen</legend>"));
  assert.ok(empfaenger.includes('id="o-street"'));
  assert.ok(empfaenger.includes('id="o-city"'));
  assert.match(empfaenger, /addressPickerOpen\s*\n?\s*\?\s*<AddressPicker/);
});

/* ══════════ C — Land als Name, ISO als Wert ══════════════════════════════ */

test("C1 das Landfeld ist eine Auswahl aus der bestehenden Länderliste", () => {
  assert.match(formCode, /import \{ countries \} from "\.\.\/\.\.\/utils\/countries"/);
  assert.match(formCode, /countries\.map\(c => <option key=\{c\.code\} value=\{c\.code\}>\{c\.name\}<\/option>\)/);
});

test("C2 gesendet wird unverändert der ISO-Code", () => {
  assert.equal(normalizeOrderRecipient({ ...vollstaendig(), country: "AT" }).country, "AT");
});

test("C3 kein freies zweistelliges Textfeld mehr für das Land", () => {
  assert.doesNotMatch(formCode, /label="Land \*" value=\{recipient\.country\}/);
  assert.doesNotMatch(formCode, /Zweistelliger Ländercode/);
});

/* ══════════ D — Autofill-Attribute ═══════════════════════════════════════ */

test("D1 jedes Empfängerfeld trägt ein passendes autocomplete", () => {
  for (const token of ["organization", "name", "address-line1", "address-line2", "postal-code", "address-level2", "country", "tel", "email"]) {
    assert.match(formCode, new RegExp(`autoComplete="${token}"`), `autocomplete ${token} fehlt`);
  }
});

test("D2 Autofill wird nicht mit Tricks abgeschaltet", () => {
  assert.doesNotMatch(formCode, /autoComplete="off"|autoComplete="new-password"|autoComplete="nope"/);
});

/* ══════════ E — Positionen: Vorschau ist Darstellung ═════════════════════ */

test("E1 ohne bekannten Bestand gibt es keine Vorschau", () => {
  assert.equal(availableOf({ stock: {} }), null);
  assert.equal(reservationPreview({ stock: {} }, "3"), null);
});

test("E2 ohne gültige Menge gibt es keine Vorschau", () => {
  const p = { stock: { available: 17 } };
  assert.equal(reservationPreview(p, ""), null);
  assert.equal(reservationPreview(p, "0"), null);
  assert.equal(reservationPreview(p, "1,5"), null);
});

test("E3 die Vorschau nennt Gebundenes und Restbestand", () => {
  const v = reservationPreview({ stock: { available: 17 } }, "2");
  assert.deepEqual(v, { requested: 2, available: 17, remaining: 15, exceeds: false });
  assert.deepEqual(reservationPreviewLines(v), [
    "2 Einheiten für diesen Auftrag reserviert",
    "Nach Auftrag: 15 Einheiten verfügbar",
  ]);
});

test("E4 Singular ohne Plural-n", () => {
  const v = reservationPreview({ stock: { available: 2 } }, "1");
  assert.deepEqual(reservationPreviewLines(v), [
    "1 Einheit für diesen Auftrag reserviert",
    "Nach Auftrag: 1 Einheit verfügbar",
  ]);
});

test("E5 bei zu großer Menge wird KEINE negative Restmenge behauptet", () => {
  const v = reservationPreview({ stock: { available: 3 } }, "5");
  assert.equal(v.exceeds, true);
  assert.deepEqual(reservationPreviewLines(v), ["5 Einheiten für diesen Auftrag reserviert"]);
});

test("E6 die Vorschau rechnet den Bestand nicht selbst aus", () => {
  // available kommt fertig aus dem Backend (on_hand − reserved − blocked).
  assert.doesNotMatch(ohneKommentare(readFileSync(new URL("./orderCreateView.mjs", import.meta.url), "utf8")),
    /onHand|on_hand|reserved\s*-\s*|blocked/);
});

/* ══════════ F — Mengenvalidierung ════════════════════════════════════════ */

test("F1 leer, Komma, Text und Null werden abgelehnt", () => {
  assert.match(quantityError("", 10), /Menge angeben/);
  assert.match(quantityError("2,5", 10), /ganze Einheiten/);
  assert.match(quantityError("abc", 10), /ganze Einheiten/);
  assert.match(quantityError("-1", 10), /ganze Einheiten/);
  assert.match(quantityError("0", 10), /Mindestens 1 Einheit/);
});

test("F2 über dem verfügbaren Bestand steht die konkrete Zahl", () => {
  assert.equal(quantityError("20", 17), "Nur 17 Einheiten verfügbar.");
  assert.equal(quantityError("2", 1), "Nur 1 Einheit verfügbar.");
});

test("F3 genau der verfügbare Bestand ist zulässig", () => {
  assert.equal(quantityError("17", 17), null);
});

test("F4 ohne bekannten Bestand wird NICHT gesperrt (fail-open, Server entscheidet)", () => {
  assert.equal(quantityError("999", null), null);
  assert.equal(quantityError("999", undefined), null);
});

test("F5 positionErrors nennt die betroffene Position", () => {
  const fehler = positionErrors([
    { product: { id: "1", stock: { available: 5 } }, quantity: "2" },
    { product: { id: "2", stock: { available: 1 } }, quantity: "4" },
  ]);
  assert.equal(fehler.length, 1);
  assert.equal(fehler[0].productId, "2");
});

test("F6 absendbar nur mit gültigem Empfänger UND mindestens einer gültigen Position", () => {
  const gut = [{ product: { id: "1", stock: { available: 5 } }, quantity: "2" }];
  assert.equal(canSubmitOrder({ recipient: vollstaendig(), positions: gut }), true);
  assert.equal(canSubmitOrder({ recipient: vollstaendig(), positions: [] }), false);
  assert.equal(canSubmitOrder({ recipient: emptyOrderRecipient(), positions: gut }), false);
  assert.equal(canSubmitOrder({
    recipient: vollstaendig(),
    positions: [{ product: { id: "1", stock: { available: 1 } }, quantity: "9" }],
  }), false);
});

test("F7 die Obergrenze entspricht MAX_ORDER_ITEMS des Backends", () => {
  assert.equal(MAX_ORDER_POSITIONS, 100);
});

/* ══════════ G — Doppelte Artikel im Frontend verhindert ══════════════════ */

test("G1 ein bereits enthaltener Artikel legt keine zweite Position an", () => {
  assert.match(formCode, /const vorhanden = positions\.find\(p => String\(p\.product\.id\) === String\(product\.id\)\)/);
  assert.match(formCode, /bereits als Position enthalten/);
});

test("G2 kein stilles Hochzählen der Menge mehr", () => {
  assert.doesNotMatch(formCode, /Number\(kopie\[idx\]\.quantity \|\| 0\) \+ 1/);
});

test("G3 die Auswahlliste markiert bereits enthaltene Artikel", () => {
  assert.match(formCode, /addedIds=\{positions\.map\(p => p\.product\.id\)\}/);
  assert.match(ohneKommentare(shared), /bereits im Auftrag/);
});

test("G4 dafür wurde keine Backendlogik ergänzt — die Zusammenfassung dort bleibt", () => {
  // Der Server fasst gleiche Artikel weiterhin zusammen (UNIQUE order_id/
  // product_id). Das Frontend verhindert den Fall nur früher und sichtbar.
  assert.match(formCode, /items: positions\.map\(p => \(\{ productId: p\.product\.id, quantity: Number\(p\.quantity\) \}\)\)/);
});

/* ══════════ H — „Was passiert mit dem Bestand?" ══════════════════════════ */

test("H1 der Block erklärt Vormerkung, Verbleib im Lager und Freigabe", () => {
  assert.equal(STOCK_EXPLANATION.lines.length, 3);
  assert.match(STOCK_EXPLANATION.lines[0], /vorgemerkt/);
  assert.match(STOCK_EXPLANATION.lines[1], /bleibt im Lager/);
  assert.match(STOCK_EXPLANATION.lines[2], /wieder frei/);
});

test("H2 kein Lagerfachjargon", () => {
  const text = STOCK_EXPLANATION.title + " " + STOCK_EXPLANATION.lines.join(" ");
  for (const wort of ["Allocation", "Commitment", "Fulfillment", "Reservation", "Picking", "Kommissionier"]) {
    assert.doesNotMatch(text, new RegExp(wort, "i"), `„${wort}“ gehört nicht in Kundentext`);
  }
});

test("H3 der frühere Fußzeilensatz ist ersetzt, nicht verdoppelt", () => {
  assert.doesNotMatch(formCode, /Mit dem Anlegen wird der Bestand reserviert/);
  assert.doesNotMatch(formCode, /inv-form-note/);
  assert.equal((formCode.match(/inv-stock-explain"/g) || []).length, 1);
});

test("H4 der Block steht im Positionsabschnitt, nicht unter den Buttons", () => {
  assert.ok(formCode.indexOf("inv-stock-explain") < formCode.indexOf("inv-form-actions"));
  assert.ok(formCode.indexOf("inv-stock-explain") > formCode.indexOf("Positionen</legend>"));
});

/* ══════════ I — Zusatzangaben ═══════════════════════════════════════════ */

test("I1 der Abschnitt nutzt das bestehende CollapsibleSection", () => {
  assert.match(formCode, /<CollapsibleSection[\s\S]*?title="Zusatzangaben"/);
});

test("I2 leer startet er geschlossen — abgeleitet, nicht fest verdrahtet", () => {
  assert.equal(extrasFilled({ customerReference: "", notes: "" }), false);
  assert.match(formCode, /useState\(\(\) => extrasFilled\(START_ZUSATZ\)\)/);
  // Dieselben Startwerte speisen die Felder — sonst könnte eine spätere
  // Vorbelegung sichtbar sein, ohne den Abschnitt zu öffnen.
  assert.match(formCode, /useState\(START_ZUSATZ\.customerReference\)/);
  assert.match(formCode, /useState\(START_ZUSATZ\.notes\)/);
});

test("I3 vorhandene Angaben gelten als gefüllt", () => {
  assert.equal(extrasFilled({ customerReference: "PO-1" }), true);
  assert.equal(extrasFilled({ notes: "bitte klingeln" }), true);
});

test("I4 das voreingestellte Standardlager zählt NICHT als Angabe", () => {
  assert.equal(extrasFilled({ warehouseId: "7", defaultWarehouseId: "7" }), false);
  assert.equal(extrasFilled({ warehouseId: "9", defaultWarehouseId: "7" }), true);
});

/* ══════════ J — Absenden: Ziel und Bestandskonflikt ═════════════════════ */

test("J1 nach Erfolg geht es auf die Auftragsdetailseite", () => {
  assert.match(ordersCode, /navigate\(`\/inventory\/orders\/\$\{data\.order\.id\}`\)/);
});

test("J2 kein automatischer Sprung in den Versandprozess", () => {
  const anlegen = ordersCode.slice(ordersCode.indexOf("const anlegen"), ordersCode.indexOf("const versandVorbereiten"));
  assert.doesNotMatch(anlegen, /onPrepareShipment|getOrderShippingPrefill|mapOrderPrefillToShipment/);
});

test("J3 das Formular berechnet keine Preise und erzeugt keine Sendung", () => {
  assert.doesNotMatch(formCode, /calculate-price|calculatePrice|\/book|createShipment|labelFormat|weightKg|lengthCm/);
});

test("J4 INSUFFICIENT_STOCK benennt den betroffenen Artikel", () => {
  const positions = [{ product: { id: "42", name: "Ventil V2", sku: "V-2" }, quantity: "5" }];
  const text = insufficientStockMessage({ code: "INSUFFICIENT_STOCK", details: { productId: "42", requested: 5 } }, positions);
  assert.match(text, /Ventil V2/);
  assert.match(text, /nicht angelegt/);
  assert.match(text, /aktualisiert/);
});

test("J5 ohne zuordenbare Angabe bleibt der allgemeine Satz", () => {
  const text = insufficientStockMessage({ code: "INSUFFICIENT_STOCK" }, []);
  assert.match(text, /mindestens eine Position/);
});

test("J6 andere Fehlercodes erzeugen keine Bestandsmeldung", () => {
  assert.equal(insufficientStockMessage({ code: "ORDER_CREATE_FAILED" }, []), null);
  assert.equal(insufficientStockMessage(null, []), null);
});

test("J7 nach dem Konflikt werden die Bestände neu geladen, die Mengen NICHT geändert", () => {
  assert.match(formCode, /await bestaendeAktualisieren\(\)/);
  const nachladen = formCode.slice(formCode.indexOf("const bestaendeAktualisieren"), formCode.indexOf("const absenden"));
  assert.match(nachladen, /return treffer \? \{ \.\.\.p, product: treffer \} : p/);
  assert.doesNotMatch(nachladen, /quantity:/);
});

test("J8 der Absendeknopf heißt unverändert „Auftrag anlegen“", () => {
  assert.match(formCode, /Wird angelegt …" : "Auftrag anlegen"/);
});

/* ══════════ K — Backend bleibt Autorität ════════════════════════════════ */

test("K1 das Formular schickt nur productId und Menge — keinen Bestandswert", () => {
  const absenden = formCode.slice(formCode.indexOf("const absenden"), formCode.indexOf("const plzRegel"));
  assert.doesNotMatch(absenden, /available|onHand|reserved|blocked/);
});

test("K2 keine eigene Verfügbarkeitsrechnung im Auftragsdialog", () => {
  assert.doesNotMatch(formCode, /available\s*=\s*[^=]*-\s*/);
  assert.doesNotMatch(formCode, /onHand|on_hand/);
});

test("K3 die Reservierung selbst wird nicht angefasst", () => {
  for (const code of [formCode, pickerCode, ordersCode]) {
    assert.doesNotMatch(code, /inventory_reservations|reserve\(|releaseReservation|consume/);
  }
});

test("K4 die Sperre ist als Bedienhilfe dokumentiert, nicht als Sicherung", () => {
  assert.match(form, /Race-Condition/);
  assert.match(form, /Backend/);
});

/* ══════════ L — Oberfläche und Foundation ═══════════════════════════════ */

test("L1 die neuen Flächen tragen keine eigenen Farbliterale", () => {
  const block = css.slice(css.indexOf(".inv-picker-item--added"), css.indexOf("/* ── Detailseiten ── */"));
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(block, /rgba?\(/);
});

test("L2 die Bestandszahl der Position trägt kein .ce-num (Spaltenmarker)", () => {
  const positionen = formCode.slice(formCode.indexOf("<ul className=\"inv-positions\">"), formCode.indexOf("</ul>"));
  assert.doesNotMatch(positionen, /ce-num/);
});

test("L3 die neuen Bedienelemente erreichen unter 860 px 44 px", () => {
  const touch = css.slice(css.indexOf("@media (max-width: 860px)"));
  assert.match(touch, /\.inv-addrpicker-open \.btn/);
  // Die Bedienelemente der Auswahl selbst tragen ihre Regel dort, wo sie
  // definiert sind — im Adressbuch-Stylesheet, für BEIDE Aufrufer zugleich.
  const abkTouch = abkCss.slice(abkCss.indexOf("@media (max-width: 860px)"));
  assert.match(abkTouch, /\.abk-pick-head \.btn/);
  assert.match(abkTouch, /\.abk-pick-item/);
});

test("L4 die Adressauswahl hat EIN Material — an EINER Stelle definiert", () => {
  // Die Auswahl trägt die zentrale Familie .abk-pick*; sie ist kein Dialog und
  // baut kein zweites Listenmuster nach.
  assert.match(pickerCode, /className="abk-pick-panel"/);
  assert.match(pickerCode, /className="abk-pick-list"/);
  assert.doesNotMatch(pickerCode, /ce-dialog|abk-dialog/);
  // Definiert ist die Familie ausschließlich im Adressbuch-Stylesheet — nicht
  // zusätzlich (und damit driftfähig) im Bereichs-Stylesheet des Lagers.
  assert.match(abkCss, /\.abk-pick-item \{/);
  assert.doesNotMatch(ohneKommentare(css), /\.abk-pick/);
  // Die abgelösten Regeln sind ersatzlos entfallen, nicht nur umbenannt.
  assert.doesNotMatch(ohneKommentare(css), /\.inv-addrpicker-(head|item|name|meta)/);
});

test("L5 kein Wizard: die drei Abschnitte stehen in einem Formular", () => {
  assert.equal((formCode.match(/<form /g) || []).length, 1);
  assert.doesNotMatch(formCode, /Schritt \d|step-circle|steps-bar/);
  const reihenfolge = ["Empfänger</legend>", "Positionen</legend>", 'title="Zusatzangaben"', "inv-form-actions"];
  let pos = -1;
  for (const marke of reihenfolge) {
    const i = formCode.indexOf(marke);
    assert.ok(i > pos, `${marke} steht an der falschen Stelle`);
    pos = i;
  }
});
