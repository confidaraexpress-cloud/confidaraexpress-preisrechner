// Ein Paketshop-Finder, zwei Suchprofile — die Regel ist rein, framework-frei und folgt nur den Serverfeldern.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parcelShopSearchProfile, bindingPostcodeValid,
  PROFILE_ORIENTATION, PROFILE_BINDING, ORIENTATION_NOTE, BINDING_NOTE, BINDING_LOADING_NOTE,
} from "./parcelShopSearchProfile.mjs";

const TG124 = { serviceType: "dropoff", publicCarrierId: "dpd", parcelShopSearch: "server" };
const JUMINGO_DPD = { serviceType: "dropoff", publicCarrierId: "dpd" };

test("Verbindliche Auswahl nur mit parcelShopSearch === \"server\" und suchbarer Shopabgabe", () => {
  const p = parcelShopSearchProfile(TG124, true);
  assert.equal(p.mode, PROFILE_BINDING);
  assert.equal(p.binding, true);
  assert.deepEqual(p.fields, { postCode: true, city: false, street: false, radius: false, opening: false });
  assert.equal(p.note, BINDING_NOTE);
  assert.equal(p.loadingNote, BINDING_LOADING_NOTE);
  assert.match(p.note, /müssen Sie vor der Buchung einen Paketshop auswählen/);
  assert.doesNotMatch(p.note, /nicht erforderlich/, "die Orientierungsaussage erscheint bei TG124 nie");
});

test("Orientierung für JUMiNGO-Abgaben und alles andere — alle Felder, der bisherige Hinweis", () => {
  for (const [tarif, suchbar] of [[JUMINGO_DPD, true], [TG124, false], [{ ...TG124, bookable: false, unavailableReason: "quote_only" }, true], [null, false]]) {
    const p = parcelShopSearchProfile(tarif, suchbar);
    assert.equal(p.mode, PROFILE_ORIENTATION, JSON.stringify(tarif));
    assert.deepEqual(p.fields, { postCode: true, city: true, street: true, radius: true, opening: true });
    assert.equal(p.note, ORIENTATION_NOTE);
    assert.equal(p.loadingNote, null);
  }
  assert.equal(ORIENTATION_NOTE, "Die Paketshop-Suche dient der Orientierung – eine verbindliche Auswahl eines Shops ist nicht erforderlich.");
});

test("Keine ServiceID-Weiche: dieselbe ServiceID ohne Serverfeld bleibt Orientierung", () => {
  assert.equal(parcelShopSearchProfile({ ...JUMINGO_DPD, serviceId: 124, provider_service_id: 124 }, true).mode, PROFILE_ORIENTATION);
  assert.equal(parcelShopSearchProfile({ ...TG124, serviceId: 999 }, true).mode, PROFILE_BINDING);
});

test("bindingPostcodeValid: genau fünf Ziffern", () => {
  for (const gut of ["63808", " 63808 ", "01067"]) assert.equal(bindingPostcodeValid(gut), true, gut);
  for (const schlecht of ["6380", "638088", "6380A", "", null, undefined, "63 808"]) assert.equal(bindingPostcodeValid(schlecht), false, String(schlecht));
});
