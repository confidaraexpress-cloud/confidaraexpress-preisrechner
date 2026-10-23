// Paket A (2026-10-23): der Telefonvertrag im Frontend — dieselbe Falltabelle wie im Backend (Prüfsumme hier und
// in tests/phone-number.test.js), die Hinweise unter dem Telefonfeld und der genaue Handlungshinweis an der Karte.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  parsePhoneNumber, phoneTransmission, phoneForTarget, phoneTransmissionHint, PHONE_TARGET, PHONE_ERROR, PHONE_HINT_TEXT,
} from "./phoneNumber.mjs";
import { shippingContactErrors } from "./newShipmentForm.mjs";
import { validateAddressForm, emptyAddressForm } from "./addressForm.mjs";
import { validateContactPhone } from "./contactDetails.mjs";
import { addressDetailsTooLongHint, offerBlockedHint, offerBlockedLabel, OFFER_ADDRESS_DETAILS_TOO_LONG_HINT } from "./offerIdentity.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FALLTABELLE_SHA256 = "3f31b2ecad065a30cf12";

test("1 — die Falltabelle ist bytegleich mit der Backendkopie, und jeder Fall besteht", () => {
  const roh = lies("../testing/phoneNumberCases.json");
  assert.equal(createHash("sha256").update(roh).digest("hex").slice(0, 20), FALLTABELLE_SHA256,
    "die Falltabelle weicht von der Backendkopie ab");
  const t = JSON.parse(roh);
  assert.equal(t.ziele.jumingo, PHONE_TARGET.GENERAL.maxLength);
  assert.equal(t.ziele.transglobal_portal, PHONE_TARGET.COMPACT.maxLength);
  for (const f of t.faelle) {
    const r = parsePhoneNumber(f.eingabe);
    assert.equal(r.ok, f.ok, JSON.stringify(f.eingabe));
    if (!f.ok) { assert.equal(r.code, f.code, JSON.stringify(f.eingabe)); assert.ok(r.error); continue; }
    assert.equal(r.core, f.kern, JSON.stringify(f.eingabe));
    assert.equal(r.extension, f.durchwahl, JSON.stringify(f.eingabe));
    assert.equal(r.needsRewrite, f.umschrift === true, JSON.stringify(f.eingabe));
    const ju = phoneTransmission(r, PHONE_TARGET.GENERAL);
    const po = phoneTransmission(r, PHONE_TARGET.COMPACT);
    assert.equal(ju.value, f.jumingo, JSON.stringify(f.eingabe));
    assert.equal(po.value, f.portal, JSON.stringify(f.eingabe));
    assert.equal(po.extensionOmitted, f.portalOhneDurchwahl, JSON.stringify(f.eingabe));
    assert.equal(po.tooLong, f.portalZuLang === true, JSON.stringify(f.eingabe));
  }
});

test("2 — Versandformular, Adressbuch und Profil rufen denselben Vertrag", () => {
  const voll = (p) => ({ [`${p}_firstName`]: "Max", [`${p}_lastName`]: "Muster", [`${p}_email`]: "max@example.com", [`${p}_phone`]: "" });
  assert.match(shippingContactErrors({ ...voll("s"), s_phone: "keine Angabe" }, "s").s_phone, /^Telefonnummer nicht erkannt/);
  assert.equal(shippingContactErrors({ ...voll("s"), s_phone: "+49 (0) 9751 564454-456" }, "s").s_phone, undefined);
  const adresse = { ...emptyAddressForm(), firstName: "Max", lastName: "Muster", email: "max@example.com", phone: "12345",
    streetAndNumber: "Weg 1", postalCode: "10115", city: "Berlin", country: "DE" };
  assert.match(validateAddressForm(adresse).phone, /^Telefonnummer zu kurz/);
  assert.equal(validateAddressForm({ ...adresse, phone: "030 1234567" }).phone, undefined);
  assert.equal(validateContactPhone("+49 711 123456 Durchwahl 3").ok, true);
  assert.equal(validateContactPhone("0800-CALLME").ok, false);
});

test("3 — der Hinweis unter dem Telefonfeld: nichts geschieht still", () => {
  // Passt und braucht keine Umschrift: kein Hinweis.
  assert.equal(phoneTransmissionHint("06021 4455670"), null);
  assert.equal(phoneTransmissionHint("09751564454-456"), null);
  // Umschrift (Landesvorwahl mit „(0)", Durchwahl): der Kunde sieht die Übertragungsform — und dass die Durchwahl
  // bei Paketshop- und GLS-Tarifen entfällt.
  const h = phoneTransmissionHint("+49 (0) 9751 564454-456");
  assert.equal(h, `${PHONE_HINT_TEXT.transmitted("+499751564454-456")} ${PHONE_HINT_TEXT.portalWithoutExtension("+499751564454", "456")}`);
  // Keine Umschrift, aber 19 Zeichen: nur die Portaltarife bekommen die kompakte Form ohne Durchwahl.
  assert.equal(phoneTransmissionHint("+49 9751 564454-456"), PHONE_HINT_TEXT.portalWithoutExtension("+499751564454", "456"));
  // Nicht einmal der Kern passt in 15 Zeichen: die Portaltarife bleiben gesperrt — gesagt, nicht verschwiegen.
  assert.equal(phoneTransmissionHint("+358 9 12345678901"), PHONE_HINT_TEXT.portalTooLong);
  // Fehlerhafte Eingabe: kein Hinweis (die Fehlermeldung steht am Feld).
  assert.equal(phoneTransmissionHint("abc"), null);
  assert.equal(phoneTransmissionHint(""), null);
  for (const text of Object.values(PHONE_HINT_TEXT)) {
    const s = typeof text === "function" ? text("x", "y") : text;
    assert.ok(!/transglobal|jumingo|dpd|gls\b|ups|dhl/i.test(s.replace(/GLS-Tarife/g, "")), `kein Anbieter im Hinweis: ${s}`);
  }
});

test("4 — der Handlungshinweis an der Karte nennt Partei, Feld und Grenze aus `unavailableDetail`", () => {
  const karte = (detail) => ({ bookable: false, unavailableReason: "address_details_too_long", unavailableDetail: detail, availableForDate: true });
  assert.equal(offerBlockedLabel(karte(null)), "Für diese Adressangaben nicht verfügbar.");
  assert.equal(offerBlockedHint(karte(null)), OFFER_ADDRESS_DETAILS_TOO_LONG_HINT);
  assert.equal(offerBlockedHint(karte({ party: "recipient", field: "phone", max: 15 })),
    "Die Telefonnummer des Empfängers ist für dieses Angebot zu lang (höchstens 15 Zeichen). Bitte kürzen Sie sie, etwa ohne Durchwahl oder Landesvorwahl.");
  assert.equal(offerBlockedHint(karte({ party: "sender", field: "name", max: 21 })),
    "Vor- und Nachname zusammen des Absenders: für dieses Angebot zu lang (höchstens 21 Zeichen). Bitte kürzen Sie die Angabe.");
  assert.equal(offerBlockedHint(karte({ party: "recipient", field: "company", max: 27 })),
    "Firmenname des Empfängers: für dieses Angebot zu lang (höchstens 27 Zeichen). Bitte kürzen Sie die Angabe.");
  // Unbekannte Einzelheiten fallen auf den allgemeinen Hinweis zurück — nie ein Rohwert.
  assert.equal(addressDetailsTooLongHint({ party: "x", field: "phone", max: 15 }), null);
  assert.equal(addressDetailsTooLongHint({ party: "sender", field: "secret", max: 1 }), null);
  assert.equal(offerBlockedHint(karte({ party: "x", field: "phone" })), OFFER_ADDRESS_DETAILS_TOO_LONG_HINT);
});

test("5 — phoneForTarget: Altbestand geht unverändert, nie gekürzt; die Fehlerliste ist vollständig", () => {
  assert.deepEqual(phoneForTarget(" Tel. 0951 123456 ", PHONE_TARGET.COMPACT),
    { value: "Tel. 0951 123456", extensionOmitted: false, tooLong: false, rewritten: false, fallback: true, parsed: null });
  for (const e of Object.values(PHONE_ERROR)) assert.match(e.code, /^PHONE_[A-Z_]+$/);
});
