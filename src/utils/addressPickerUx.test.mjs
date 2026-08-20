import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   Adressbuchauswahl im Formular „Neue Sendung"
   ══════════════════════════════════════════════════════════════════════════
   Geprüft wird beides: die reinen Funktionen (Feldauslegung, Darstellung) mit
   echten Werten, und die Einbindung am Quelltext — Letzteres, weil genau dort
   die teuren Fehler liegen (neun Invalidierungen statt einer, eine nachgezogene
   Baseline, ein festverdrahteter Rollenfilter). Diese Eigenschaften sind mit
   einer reinen Funktion nicht erreichbar; sie stehen in der Seite. */

import {
  mapAddressToShipmentFormPatch, mapAddressToOrderRecipient,
  addressPickerLabel, addressPickerPerson, addressPickerMeta,
  TAB_SENDER, TAB_RECIPIENT, buildAddressListParams,
} from "./addressBookView.mjs";
import { getShipmentFormSnapshot } from "./shipmentFormSnapshot.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const pickerSrc = lies("../components/addressbook/AddressPicker.jsx");
const buttonSrc = lies("../components/addressbook/AddressPickerButton.jsx");
const seiteSrc = lies("../pages/NewShipmentPage.jsx");
const abkCss = lies("../styles/addressbook.css");
const calcCss = lies("../styles/calculator.css");

const picker = ohneKommentare(pickerSrc);
const button = ohneKommentare(buttonSrc);
const seite = ohneKommentare(seiteSrc);

// Der Übernahmehandler als eigener Ausschnitt — „genau eine Invalidierung"
// lässt sich nur an SEINEM Rumpf messen, nicht an der ganzen Seite.
const handler = (() => {
  const start = seite.indexOf("const uebernimmAdressbuchAdresse");
  assert.ok(start > -1, "Übernahmehandler nicht gefunden");
  const ende = seite.indexOf("\n  };", start);
  assert.ok(ende > start, "Ende des Übernahmehandlers nicht gefunden");
  return seite.slice(start, ende);
})();

const adresse = {
  id: 42,
  label: "Zentrale",
  company: "Muster Handels GmbH",
  contactName: "Erika Musterfrau",
  streetAndNumber: "Beispielweg 5",
  addressAdd: "3. OG",
  postalCode: "70173",
  city: "Stuttgart",
  state: "BW",
  country: "de",
  email: "erika@muster.de",
  phone: "+49 711 123456",
  notes: "nur vormittags",
  role: "both",
  isDefaultSender: true,
  isDefaultRecipient: false,
  favorite: true,
};

/* ══════════ A — Feldauslegung: Kopie, keine Bindung ═══════════════════════ */

test("A1 die Auswahl füllt genau die neun Adressfelder der jeweiligen Seite", () => {
  for (const [prefix, gegen] of [["s", "r"], ["r", "s"]]) {
    const patch = mapAddressToShipmentFormPatch(adresse, prefix);
    assert.deepEqual(Object.keys(patch).sort(), [
      `${prefix}_addition`, `${prefix}_city`, `${prefix}_company`, `${prefix}_country`,
      `${prefix}_email`, `${prefix}_fullName`, `${prefix}_phone`, `${prefix}_street`, `${prefix}_zip`,
    ].sort());
    // Die andere Seite wird nicht angefasst: eine Empfängerauswahl darf niemals
    // den Absender überschreiben.
    assert.ok(!Object.keys(patch).some((k) => k.startsWith(`${gegen}_`)));
  }
});

test("A2 es entsteht KEINE Referenz auf den Adressbucheintrag", () => {
  const patch = mapAddressToShipmentFormPatch(adresse, "r");
  const alsText = JSON.stringify(patch);
  for (const feld of ["addressId", "address_id", "id", "label", "notes", "role", "favorite", "isDefaultSender", "isDefaultRecipient", "state"]) {
    assert.ok(!Object.prototype.hasOwnProperty.call(patch, feld), `${feld} darf nicht im Patch stehen`);
  }
  assert.ok(!alsText.includes("42"), "die Adressbuch-ID darf nirgends mitwandern");
  assert.ok(!alsText.includes("Zentrale"), "die Bezeichnung ist Adressbuchverwaltung, kein Sendungsfeld");
});

test("A3 nichts wird gekürzt — auch nicht auf Carrier-Längen", () => {
  const lang = "A".repeat(120);
  const patch = mapAddressToShipmentFormPatch(
    { company: lang, contactName: lang, streetAndNumber: lang, city: lang }, "s"
  );
  assert.equal(patch.s_company.length, 120);
  assert.equal(patch.s_fullName.length, 120);
  assert.equal(patch.s_street.length, 120);
  assert.equal(patch.s_city.length, 120);
  // Und im Mapper steht auch kein Kürzungsmechanismus.
  const view = ohneKommentare(lies("./addressBookView.mjs"));
  assert.doesNotMatch(view, /\.slice\(0,\s*\d+\)|substring\(|substr\(/);
});

test("A4 fehlende Werte werden zu leeren Strings, das Land zu Großbuchstaben", () => {
  const patch = mapAddressToShipmentFormPatch({ country: "de" }, "r");
  assert.equal(patch.r_country, "DE");
  assert.equal(patch.r_company, "");
  assert.equal(patch.r_phone, "");
  // Ohne Land bleibt die bestehende Vorgabe DE — kein leeres Länderfeld.
  assert.equal(mapAddressToShipmentFormPatch({}, "r").r_country, "DE");
});

test("A5 der Sendungsmapper und der Auftragsmapper bleiben getrennt", () => {
  // Gleiche Quelle, gleiche Bedeutungen, unterschiedliches Zielschema. Wer den
  // einen ändert, ändert nicht versehentlich den anderen mit.
  const s = mapAddressToShipmentFormPatch(adresse, "r");
  const o = mapAddressToOrderRecipient(adresse);
  assert.equal(s.r_street, o.streetAndNumber);
  assert.equal(s.r_fullName, o.fullName);
  assert.equal(s.r_addition, o.addressAddition);
  assert.equal(s.r_zip, o.postalCode);
});

/* ══════════ B — Darstellung: zwei Treffer dürfen nie gleich aussehen ═════ */

test("B1 dieselbe Firma an derselben Adresse mit anderer Person ist unterscheidbar", () => {
  const gemeinsam = { company: "Apple GmbH", streetAndNumber: "Ringstr. 1", postalCode: "10115", city: "Berlin", country: "DE" };
  const a = { ...gemeinsam, contactName: "Max Weber" };
  const b = { ...gemeinsam, contactName: "Lisa Müller" };
  const zeilen = (x) => [addressPickerLabel(x), addressPickerPerson(x), addressPickerMeta(x)].join("|");
  assert.equal(addressPickerLabel(a), addressPickerLabel(b));   // Zeile 1 gleich …
  assert.equal(addressPickerMeta(a), addressPickerMeta(b));     // … Zeile 3 auch …
  assert.notEqual(addressPickerPerson(a), addressPickerPerson(b)); // … Zeile 2 nicht.
  assert.notEqual(zeilen(a), zeilen(b));
});

test("B2 die zweite Zeile wiederholt nie, was schon in der ersten steht", () => {
  assert.equal(addressPickerPerson({ company: "Apple GmbH", contactName: "Max Weber" }), "Max Weber");
  assert.equal(addressPickerPerson({ contactName: "Max Weber" }), "");
  assert.equal(addressPickerPerson({ company: "Apple GmbH" }), "");
  assert.equal(addressPickerPerson({}), "");
});

test("B3 eine eigene Bezeichnung verdrängt die Firma nicht", () => {
  // Vorher fiel bei gesetztem Label sowohl Firma als auch Person weg.
  assert.equal(addressPickerLabel(adresse), "Zentrale");
  assert.equal(addressPickerPerson(adresse), "Muster Handels GmbH · Erika Musterfrau");
});

test("B4 Bestandsverhalten der ersten und dritten Zeile ist unverändert", () => {
  assert.equal(addressPickerLabel({ label: "Kunde A", company: "X" }), "Kunde A");
  assert.equal(addressPickerLabel({}), "Ohne Bezeichnung");
  assert.equal(
    addressPickerMeta({ streetAndNumber: "Weg 1", postalCode: "10115", city: "Berlin", country: "DE" }),
    "Weg 1 · 10115 Berlin · DE"
  );
  assert.equal(addressPickerMeta({}), "");
});

test("B5 leere Zeilen entstehen nicht — jede Zeile hängt an ihrem Inhalt", () => {
  assert.match(picker, /\{person && <span className="abk-pick-person">/);
  assert.match(picker, /\{anschrift && <span className="abk-pick-meta">/);
});

/* ══════════ C — Der Picker: ein Bauteil, kein Wissen über den Aufrufer ═══ */

test("C1 der Reiter ist eine Prop und wird an die bestehende Suche durchgereicht", () => {
  assert.match(picker, /export function AddressPicker\(\{ tab, onSelect, onClose, disabled \}\)/);
  assert.match(picker, /tab: reiter/);
});

test("C2 ein fehlender Reiter führt nie zu einer ungefilterten Liste", () => {
  assert.match(picker, /tab === TAB_SENDER \? TAB_SENDER : TAB_RECIPIENT/);
  // Der Rollenfilter selbst ist der bestehende: sender→sender|both, recipient→recipient|both.
  assert.equal(buildAddressListParams({ tab: TAB_SENDER }).role, "sender");
  assert.equal(buildAddressListParams({ tab: TAB_RECIPIENT }).role, "recipient");
  assert.equal(buildAddressListParams({}).role, undefined);
});

test("C3 kein zweites Adressbuch: ein Endpunkt, ein Wrapper", () => {
  assert.match(picker, /import \{ getAddresses \} from "\.\.\/\.\.\/api\/addressBookApi"/);
  assert.doesNotMatch(picker, /apiFetch|fetch\(|\/api\/kunde\/addresses/);
});

test("C4 der Picker kennt weder Sendung noch Auftrag noch Entwurf", () => {
  assert.doesNotMatch(picker, /NewShipment|mapAddressToShipmentFormPatch|mapAddressToOrderRecipient/);
  assert.doesNotMatch(picker, /shipmentId|ceShipmentId|invalidateResults|draft|Draft/);
  assert.doesNotMatch(picker, /s_company|r_company|setForm/);
});

test("C5 serverseitige Suche mit Entprellung — keine clientseitige Vollbeladung", () => {
  assert.match(picker, /q: q \|\| undefined/);
  assert.match(picker, /limit: SEITENGROESSE/);
  assert.match(picker, /setTimeout\(\(\) => laden\(term\.trim\(\)\), 300\)/);
  assert.doesNotMatch(picker, /limit: (100|1000|9999)/);
});

test("C6 ein überholtes Ergebnis kann ein neueres nie überschreiben", () => {
  // Zwei Schichten, beide nötig: Abbruch des laufenden Requests UND ein
  // Sequenzzähler für die Antwort, die bereits unterwegs war.
  assert.match(picker, /new AbortController\(\)/);
  assert.match(picker, /\{ signal: controller\.signal \}/);
  assert.match(picker, /const meins = \+\+seq\.current/);
  assert.match(picker, /if \(seq\.current !== meins\) return/);
  // Und ein Abbruch ist kein Fehler des Nutzers.
  assert.match(picker, /AbortError/);
});

test("C7 Escape schließt nur die Auswahl, nie einen umgebenden Dialog", () => {
  assert.match(picker, /e\.key === "Escape"[\s\S]{0,120}stopPropagation\(\)[\s\S]{0,60}onClose/);
  // NATIVER Listener am eigenen Knoten, nicht React-onKeyDown: Synthetic Events
  // werden am Wurzelcontainer zugestellt und laufen damit NACH dem nativen
  // Escape-Listener von useDialog am Dialogknoten — stopPropagation käme zu
  // spät, und Escape schlösse den ganzen Auftragsdialog mit. Im Browser
  // gemessen, nicht vermutet.
  assert.match(picker, /knoten\.addEventListener\("keydown", beiTaste\)/);
  assert.doesNotMatch(picker, /onKeyDown=/);
  assert.match(button, /knoten\.addEventListener\("keydown", beiTaste\)/);
  assert.doesNotMatch(button, /onKeyDown=/);
});

test("C8 Tastatur und Auszeichnung: Liste, Optionen, Fokus im Suchfeld", () => {
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /role="option"/);
  assert.match(picker, /aria-label=\{texte\.listenname\}/);
  assert.match(picker, /sucheRef\.current\?\.focus\(\)/);
  assert.match(picker, /ArrowDown/);
  assert.match(picker, /ArrowUp/);
});

test("C9 der Picker verwaltet nichts — er wählt aus", () => {
  assert.doesNotMatch(picker, /createAddress|updateAddress|deleteAddress|AddressFormDrawer|favoritesOnly|isDefaultSender/);
});

/* ══════════ D — Auslöser und schwebende Fläche ═══════════════════════════ */

test("D1 der Auslöser sitzt in der Überschriftszeile, nicht darunter", () => {
  // Beim Absender steht seit dem Paket „leerer Nullzustand" die Komfortaktion
  // „Eigene Adresse" mit in derselben Zeile — der frühere automatische
  // Profil-Prefill ist dadurch ersetzt. Geprüft wird deshalb: der Auslöser liegt
  // INNERHALB der Kopfzeile (vor deren schließendem </div>), nicht darunter.
  for (const abschnitt of ["Absender", "Empfänger"]) {
    const start = seite.indexOf(`<div className="calc-section-title">${abschnitt}</div>`);
    assert.ok(start > -1, `${abschnitt}: Abschnittsüberschrift nicht gefunden`);
    const kopfEnde = seite.indexOf("</div>", seite.indexOf("<AddressPickerButton", start));
    const kopf = seite.slice(start, kopfEnde);
    assert.ok(kopf.includes("<AddressPickerButton"), `${abschnitt}: Auslöser steht nicht in der Kopfzeile`);
    // Zwischen Titel und Auslöser darf kein Formularfeld liegen — sonst wäre er
    // faktisch doch darunter gerutscht.
    assert.ok(!/<AddressSuggestInput|addrField\(/.test(kopf),
      `${abschnitt}: zwischen Überschrift und Auslöser liegt ein Formularfeld`);
  }
});

test("D2 die Kopfzeile bricht um, statt zu stauchen oder abzuschneiden", () => {
  const block = calcCss.slice(calcCss.indexOf(".calc-section-head {"), calcCss.indexOf(".calc-section-note"));
  assert.match(block, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(block, /text-overflow|white-space:\s*nowrap|overflow:\s*hidden/);
});

test("D3 die Fläche schwebt gemessen — .calc-panel trägt overflow: hidden", () => {
  assert.match(calcCss, /\.calc-panel \{[^}]*overflow: hidden/);
  assert.match(abkCss, /\.abk-pick-pop \{[\s\S]*?position: fixed/);
  assert.match(button, /getBoundingClientRect\(\)/);
  assert.match(button, /useLayoutEffect/);
  // Bei Scroll/Größenänderung wird nachgeführt, nicht geschlossen.
  assert.match(button, /window\.addEventListener\("scroll", nachfuehren, true\)/);
  assert.match(button, /window\.addEventListener\("resize", nachfuehren\)/);
  // Und die Fläche WÄCHST nach dem Öffnen (Ladezeile → Trefferliste): ohne
  // Neumessung entschied die einmalige Messung an der falschen Höhe, ob unten
  // Platz ist — auf 390 × 780 lief die fertige Liste 78 px unter den Bildrand.
  assert.match(button, /new ResizeObserver\(\(\) => platziere\(\)\)/);
});

test("D4 der Fokus kehrt an den Auslöser zurück — beim Schließen UND beim Wählen", () => {
  assert.match(button, /const schliessen = \(\) => \{\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);/);
  assert.match(button, /const waehle = \(address\) => \{\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);\s*onSelect\?\.\(address\)/);
});

test("D5 Klick nach außen schließt; ein fehlendes Fokusziel schließt NICHT", () => {
  assert.match(button, /document\.addEventListener\("mousedown", aussen\)/);
  assert.match(button, /if \(!ziel\) return;/);
});

test("D6 Auszeichnung — und bewusst KEIN Dialog", () => {
  assert.match(button, /aria-expanded=\{open\}/);
  assert.match(button, /aria-controls=\{open \? popId : undefined\}/);
  assert.match(button, /className="btn btn-ghost btn-sm abk-pick-trigger"/);
  // Die Fläche ist nicht modal und fängt den Fokus absichtlich nicht ein.
  // `role="dialog"` verspräche eine Fokusfalle, die das Designsystem für echte
  // Dialoge zu Recht einfordert (interfacePatterns.test.mjs, Test 9) — hier
  // wäre sie falsch: ein Popover muss per Tab verlassbar bleiben.
  assert.doesNotMatch(button, /role="dialog"/);
  assert.match(button, /role="group"/);
  assert.match(button, /aria-label=\{title \|\| "Adresse aus dem Adressbuch wählen"\}/);
});

/* ══════════ E — Die Übernahme in „Neue Sendung" ══════════════════════════ */

test("E1 EIN gebündelter Formularpatch — nicht neun Einzelupdates", () => {
  assert.equal((handler.match(/setForm\(/g) || []).length, 1);
  assert.match(handler, /setForm\(p => \(\{ \.\.\.p, \.\.\.patch \}\)\)/);
  assert.doesNotMatch(handler, /upd\(/);
});

test("E2 GENAU EINE Invalidierung", () => {
  assert.equal((handler.match(/invalidateResults\(\)/g) || []).length, 1);
});

test("E3 die Baseline wird NICHT nachgezogen — die Seite gilt danach als geändert", () => {
  // Der kritische Unterschied zum automatischen Prefill beim Mount: DORT ist
  // setBaseline richtig (Ausgangszustand), HIER wäre es falsch (Nutzeränderung).
  assert.doesNotMatch(handler, /setBaseline/);
  // Und der Mount-Prefill zieht sie weiterhin nach (kein Kollateralschaden).
  const prefill = seite.slice(seite.indexOf("if (!prefillAddress) return;"), seite.indexOf("onPrefillApplied?.()"));
  assert.match(prefill, /setBaseline\(getShipmentFormSnapshot/);
});

test("E4 die Übernahme verwirft alte Angebote vollständig", () => {
  // invalidateResults → resetResults: Tarife, Auswahl, BEIDE IDs, Zoll.
  const reset = seite.slice(seite.indexOf("const resetResults = () => {"), seite.indexOf("const invalidateResults"));
  for (const weg of ["setTariffs([])", "setSelected(null)", "setShipmentId(null)", "setCeShipmentId(null)", "setCustoms(null)", "setHasResults(false)"]) {
    assert.ok(reset.includes(weg), `resetResults muss ${weg} enthalten`);
  }
});

test("E5 sichtbare Feldfehler der ersetzten Felder verschwinden mit ihrem Wert", () => {
  assert.match(handler, /setErrors\(p => \{[\s\S]*for \(const k of keys\) delete n\[k\]/);
});

test("E6 jede Seite bekommt ihren eigenen Reiter", () => {
  assert.match(seite, /tab=\{TAB_SENDER\}[\s\S]{0,160}uebernimmAdressbuchAdresse\(a, "s"\)/);
  assert.match(seite, /tab=\{TAB_RECIPIENT\}[\s\S]{0,160}uebernimmAdressbuchAdresse\(a, "r"\)/);
});

test("E7 nichts belegt den Absender automatisch vor", () => {
  // Ausdrücklich NICHT vorhanden: eine automatische Vorbelegung aus
  // is_default_sender. Die Auswahl passiert immer durch den Nutzer.
  assert.doesNotMatch(seite, /isDefaultSender|is_default_sender/);
  // Seit dem Paket „leerer Nullzustand" gilt das auch für das PROFIL: der
  // frühere `profilSeed()` schrieb Firma, Name, Straße, PLZ, Ort, Land, Telefon
  // und E-Mail beim Mount ins Formular. Er ist ersatzlos entfallen; die Daten
  // kommen nur noch über die ausdrückliche Aktion „Eigene Adresse".
  assert.doesNotMatch(seite, /const profilSeed = /,
    "der automatische Profil-Seed ist zurück");
  assert.match(seite, /const uebernimmProfilAbsender = /,
    "die bewusste Übernahme fehlt");
  assert.match(seite, /createEmptyShipmentForm\(\)/,
    "der Ausgangszustand kommt nicht aus dem leeren Formular");
});

test("E8 der Entwurfs-Snapshot bleibt reine Werte — ohne Adressbuchbezug", () => {
  const patch = mapAddressToShipmentFormPatch(adresse, "r");
  const form = { ...patch, s_company: "", s_fullName: "", s_street: "", s_addition: "", s_zip: "", s_city: "", s_country: "DE", s_phone: "", s_email: "", weight: "2", length: "20", width: "15", height: "10", packageCount: "1", content: "" };
  const snap = getShipmentFormSnapshot({ form, shippingDate: "2026-09-01", serviceFilter: "all", shippingModeFilter: "all", selectedPublicCarrierIds: [] });
  const alsText = JSON.stringify(snap);
  assert.equal(snap.recipient.company, "Muster Handels GmbH");
  assert.ok(!/addressId|address_id/.test(alsText));
  assert.ok(!alsText.includes("Zentrale"));
  assert.ok(!/"id":\s*42/.test(alsText));
});

test("E9 der Übernahmehinweis ist reine Anzeige und wandert in keinen Vorgang", () => {
  assert.match(seite, /const \[addressNote, setAddressNote\] = useState\(\{ s: "", r: "" \}\)/);
  // Nicht im Vorgangsschema, nicht im Snapshot, nicht in der Baseline.
  const snapshotSrc = ohneKommentare(lies("./shipmentFormSnapshot.mjs"));
  assert.doesNotMatch(snapshotSrc, /addressNote/);
  const flowSrc = ohneKommentare(lies("./shippingFlowState.mjs"));
  assert.doesNotMatch(flowSrc, /addressNote/);
});

/* ══════════ F — Ein Bauteil, kein Duplikat ═══════════════════════════════ */

test("F1 es gibt genau EINEN Adress-Picker im Projekt", () => {
  assert.doesNotMatch(seite, /RecipientAddressPicker/);
  const orderForm = ohneKommentare(lies("../components/inventory/OrderCreateForm.jsx"));
  assert.match(orderForm, /import \{ AddressPicker \} from "\.\.\/addressbook\/AddressPicker"/);
  assert.doesNotMatch(orderForm, /RecipientAddressPicker/);
  assert.throws(
    () => lies("../components/inventory/RecipientAddressPicker.jsx"),
    /ENOENT/,
    "die kopierte Fassung darf nicht zurückkommen"
  );
});

test("F2 die Auswahl bringt keine Carrier-Längen und keine zweite Validierung mit", () => {
  // \b verhindert Treffer in 300 (Entprellung) oder 360 (Breite) — gesucht
  // sind die Carrier-Grenzen 35/30 als eigenständige Zahl.
  assert.doesNotMatch(picker, /maxLength|\b(?:35|30)\b|validate/i);
  assert.doesNotMatch(button, /maxLength|validate/i);
});

test("F3 keine neue Abhängigkeit für die Auswahl", () => {
  const pkg = JSON.parse(lies("../../package.json"));
  const erlaubt = new Set(Object.keys(pkg.dependencies || {}));
  for (const quelle of [pickerSrc, buttonSrc]) {
    for (const [, modul] of quelle.matchAll(/from "([^".][^"]*)"/g)) {
      assert.ok(erlaubt.has(modul), `unerwartete Abhängigkeit: ${modul}`);
    }
  }
});

test("F4 nichts wird in der Darstellung abgeschnitten", () => {
  const block = abkCss.slice(abkCss.indexOf(".abk-pick-panel"), abkCss.indexOf("@media (max-width: 860px)"));
  assert.doesNotMatch(block, /text-overflow|line-clamp|white-space:\s*nowrap/);
  assert.match(block, /\.abk-pick-name \{[^}]*overflow-wrap: break-word/);
  assert.match(block, /\.abk-pick-person \{[^}]*overflow-wrap: break-word/);
  assert.match(block, /\.abk-pick-meta \{[^}]*overflow-wrap: break-word/);
});

test("F5 Foundation-Konformität: keine eigenen Farben, Radien oder Tiefen", () => {
  const block = abkCss.slice(abkCss.indexOf("/* ─── Adressauswahl"));
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(block, /rgba?\(/);
  assert.doesNotMatch(block, /border-radius:\s*\d/);
  assert.doesNotMatch(block, /box-shadow:(?!\s*var\()/);
});
