// Lieferscheine im Frontend — reine Logik + Quelltextprüfung.
//
// Geprüft wird, was ohne Browser prüfbar ist und trotzdem die tragenden Zusagen hält:
//   1. Modusableitung und PATCH-Bau (fail-safe, kein Mass Assignment)
//   2. Sichtbarkeitsregel der eigenen Lieferscheinnummer
//   3. Kundensprache — keine technischen Begriffe im sichtbaren Text
//   4. Der Vorgang trägt die eigene Nummer (Reload-/Zurück-Festigkeit)
//   5. Provider- und Preisfreiheit der neuen Bauteile
//   6. Verankerung: Download über den Sendungshandle, Anzeige je Sendung
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DELIVERY_NOTE_MODES, DEFAULT_DELIVERY_NOTE_MODE, DELIVERY_NOTE_TEXT,
  deliveryNoteMode, buildDeliveryNotePatch, showsExternalDeliveryNoteField,
} from "./profileView.mjs";
import { BOOKING_KEYS } from "./shippingFlowState.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const bookingPage      = read("../pages/BookingPage.jsx");
const orderDetailPage  = read("../pages/inventory/OrderDetailPage.jsx");
const optionsModule    = read("../components/booking/AdditionalOptionsModule.jsx");
const profileComponent = read("../components/dashboard/Profile.jsx");
// Die Lieferscheinkarte ist seit der Modularisierung eine eigene
// Abschnittskomponente — 6d misst an ihrer Datei.
const dnKarte          = read("../components/dashboard/DeliveryNoteCard.jsx");
const downloadHelper   = read("./downloadDeliveryNote.js");

/* ══════════ 1 — Modus und PATCH ══════════ */

test("1a — genau drei Modi, Default ist 'none'", () => {
  assert.deepStrictEqual([...DELIVERY_NOTE_MODES].sort(), ["confidara", "external", "none"]);
  assert.strictEqual(DEFAULT_DELIVERY_NOTE_MODE, "none");
});

test("1b — Modusableitung ist fail-safe: Unbekanntes und Fehlendes gilt als 'none'", () => {
  assert.strictEqual(deliveryNoteMode({ delivery_note_mode: "confidara" }), "confidara");
  assert.strictEqual(deliveryNoteMode({ delivery_note_mode: "external" }), "external");
  // Ein Konto aus einem älteren Backend (Feld fehlt) verhält sich exakt wie bisher.
  assert.strictEqual(deliveryNoteMode({}), "none");
  assert.strictEqual(deliveryNoteMode(null), "none");
  assert.strictEqual(deliveryNoteMode({ delivery_note_mode: "CONFIDARA" }), "none");
  assert.strictEqual(deliveryNoteMode({ delivery_note_mode: "irgendwas" }), "none");
});

test("1c — der PATCH trägt AUSSCHLIESSLICH den einen Schlüssel (kein Mass Assignment)", () => {
  const patch = buildDeliveryNotePatch("confidara");
  assert.deepStrictEqual(Object.keys(patch), ["delivery_note_mode"]);
  assert.strictEqual(patch.delivery_note_mode, "confidara");
  // Ein ungültiger Wert wird gar nicht erst gesendet, sondern auf den sicheren Default gezogen.
  assert.strictEqual(buildDeliveryNotePatch("hack").delivery_note_mode, "none");
  assert.strictEqual(buildDeliveryNotePatch(undefined).delivery_note_mode, "none");
});

/* ══════════ 2 — Sichtbarkeit der eigenen Nummer ══════════ */

test("2 — die eigene Lieferscheinnummer erscheint nur bei 'external' UND Lagerbezug", () => {
  const ext = { delivery_note_mode: "external" };
  assert.strictEqual(showsExternalDeliveryNoteField(ext, true), true);
  // Ohne Lagerbezug gäbe es gar keinen Lieferschein, auf den sich die Nummer bezöge.
  assert.strictEqual(showsExternalDeliveryNoteField(ext, false), false);
  // In den anderen beiden Modi ist das Feld nie sichtbar.
  assert.strictEqual(showsExternalDeliveryNoteField({ delivery_note_mode: "confidara" }, true), false);
  assert.strictEqual(showsExternalDeliveryNoteField({ delivery_note_mode: "none" }, true), false);
  assert.strictEqual(showsExternalDeliveryNoteField({}, true), false);
});

/* ══════════ 3 — Kundensprache ══════════ */

test("3 — kein technischer Begriff im sichtbaren Text", () => {
  const sichtbar = JSON.stringify(DELIVERY_NOTE_TEXT);
  for (const verboten of ["shipment_items", "delivery_note_mode", "inventory", "external mode",
                          "jumingo", "confidara-lieferschein-modus", "shipment", "context"]) {
    assert.ok(!sichtbar.toLowerCase().includes(verboten.toLowerCase()),
      `technischer Begriff im Kundentext: ${verboten}`);
  }
  // Die drei Optionen sind vollständig beschriftet und erklärt.
  for (const mode of DELIVERY_NOTE_MODES) {
    assert.ok(DELIVERY_NOTE_TEXT.options[mode]?.label, `Beschriftung fehlt: ${mode}`);
    assert.ok(DELIVERY_NOTE_TEXT.options[mode]?.hint, `Erklärung fehlt: ${mode}`);
  }
});

test("3b — die Feldgrenze spiegelt das Backend (64 Zeichen)", () => {
  assert.strictEqual(DELIVERY_NOTE_TEXT.externalFieldMaxLen, 64);
  assert.match(optionsModule, /maxLength=\{deliveryNoteText\.externalFieldMaxLen\}/,
    "das Feld muss die zentrale Grenze verwenden, keine eigene Zahl");
});

/* ══════════ 4 — Vorgangsfestigkeit ══════════ */

test("4a — die eigene Nummer liegt im Vorgangsschema (überlebt Zurück und Reload)", () => {
  assert.ok(BOOKING_KEYS.includes("externalDeliveryNoteNumber"),
    "ohne diesen Schlüssel ginge die Eingabe bei einer Zurücknavigation verloren");
});

test("4b — gespiegelt wird nur, was auch gesendet würde", () => {
  // Dieselbe Regel wie bei Referenznummer und Zusatzempfängern: ein unsichtbarer
  // Restwert darf weder im Vorgang stehen noch mitgebucht werden.
  assert.match(bookingPage, /externalDeliveryNoteNumber:\s*showExternalDeliveryNote\s*\?\s*externalDeliveryNoteNumber\s*:\s*""/);
  assert.match(bookingPage, /showExternalDeliveryNote\s*&&\s*externalDeliveryNoteNumber\.trim\(\)/,
    "der Payload darf die Nummer nur bei sichtbarem Feld tragen");
});

/* ══════════ 5 — Preis- und Providerfreiheit ══════════ */

// Technische Kennungen: als Teilzeichenkette eindeutig.
const KENNUNGEN = ["jumingo", "unit_value", "unitvalue", "price_final", "total_price"];
// Preisbegriffe NUR als ganzes Wort: „Muster" enthält „ust", „Kosten" enthält „ost".
// Eine reine Teilzeichenkettensuche schlüge hier falsch an.
const PREISWORTE = /\b(netto|brutto|mwst|ust|umsatzsteuer|preis|preise|betrag|summe|einzelpreis|warenwert)\b/i;

function pruefePreisfrei(name, src) {
  for (const kennung of KENNUNGEN) {
    assert.ok(!src.toLowerCase().includes(kennung), `${name} enthält die unzulässige Kennung ${kennung}`);
  }
  const treffer = src.match(PREISWORTE);
  assert.strictEqual(treffer, null, `${name} enthält einen Preisbegriff: ${treffer && treffer[0]}`);
}

test("5 — die neuen Bauteile führen weder Preise noch Providerbegriffe", () => {
  // Der Downloadhelfer ist vollständig neu — er wird als Ganzes geprüft.
  pruefePreisfrei("downloadDeliveryNote.js", downloadHelper);

  // AdditionalOptionsModule.jsx ist ein GETEILTES Modul: es trägt auch die
  // Referenznummer, die Zusatzempfänger und das Labelformat. Sein Kopfkommentar
  // erwähnt zu Recht, dass das Labelformat „ohne Preis-/Reprice-Einfluss" bleibt.
  // Geprüft wird deshalb gezielt der Lieferscheinblock, nicht die ganze Datei —
  // sonst prüfte der Test fremden Bestand statt der neuen Zusage.
  const start = optionsModule.indexOf("{/* 5) Eigene Lieferscheinnummer");
  assert.ok(start > 0, "der Lieferscheinblock ist nicht mehr auffindbar — Marker geändert?");
  pruefePreisfrei("Lieferscheinblock in AdditionalOptionsModule.jsx", optionsModule.slice(start));

  // Der sichtbare Kundentext selbst darf ebenfalls keinen Betrag versprechen.
  pruefePreisfrei("DELIVERY_NOTE_TEXT", JSON.stringify(DELIVERY_NOTE_TEXT));
});

/* ══════════ 6 — Verankerung an der Sendung ══════════ */

test("6a — der Download adressiert über den Sendungshandle, nicht über eine Lieferschein-ID", () => {
  assert.match(downloadHelper, /\/api\/shipments\/\$\{encodeURIComponent\(String\(shipmentId \?\? ""\)\.trim\(\)\)\}\/delivery-note/,
    "es gibt genau einen Adressierungsweg — den bestehenden Sendungshandle-Namensraum");
  assert.ok(!downloadHelper.includes("/delivery-notes/"),
    "kein zweiter Namensraum /delivery-notes/:id");
});

test("6b — das Auftragsdetail zeigt den Lieferschein JE SENDUNG (Teilversand)", () => {
  // Die Spalte steht in der Sendungstabelle, nicht als ein einzelner Kasten am Auftrag:
  // bei Teilversand hat jede Sendung ihren eigenen Lieferschein.
  assert.match(orderDetailPage, /<th scope="col">Lieferschein<\/th>/);
  assert.match(orderDetailPage, /renderDeliveryNoteCell\(s\)/);
  // Eigener Lieferschein: nur Text, KEIN Downloadknopf (es liegt kein PDF in Confidara).
  assert.match(orderDetailPage, /Eigener Lieferschein \{s\.externalDeliveryNoteNumber\}/);
});

test("6c — der Erfolgsbildschirm zeigt den Download nur bei tatsächlich vorhandenem Lieferschein", () => {
  // Der Lieferschein-Knopf lebt seit der Modularisierung wortgleich im
  // Erfolgsdokumente-Baustein components/booking/BookingSuccessDocuments.jsx.
  const successDocs = read("../components/booking/BookingSuccessDocuments.jsx");
  assert.match(successDocs, /booking\?\.ceShipmentId && booking\?\.deliveryNote\?\.number/,
    "die Sichtbarkeit darf nie aus dem Kontomodus geraten werden");
});

test("6d — die Profileinstellung nutzt den bestehenden Profil-PATCH", () => {
  assert.match(dnKarte, /apiFetch\(`\/kunde\/profil`/);
  assert.match(dnKarte, /buildDeliveryNotePatch\(mode\)/);
  // Keine zweite Speicherstrecke nur für Lieferscheine.
  for (const src of [dnKarte, profileComponent]) {
    assert.ok(!src.includes("/kunde/delivery-note"),
      "es darf keinen eigenen Settings-Endpunkt geben");
  }
});
