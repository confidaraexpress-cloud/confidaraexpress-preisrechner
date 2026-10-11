// F1 — Buchungsbereitschaft des Kontos (Anzeige).
//
// Befund: Die Rechnungsanschrift ist im Konto optional, für jede Buchung aber Pflicht. Der Kunde
// erfuhr davon erst beim Buchen — im JUMiNGO-Pfad sogar erst nach den Providergesprächen. Das
// Backend prüft jetzt VOR jedem Seiteneffekt und liefert den Status `bookingProfile` in
// /kundenbereich und in der Antwort von PATCH /kunde/profil. Diese Datei prüft, wie das Frontend
// ihn sagt — und dass es die Regel NICHT selbst nachbaut.
//
// Geprüft wird die reine Logik aus bookingProfileView.mjs plus der Quelltext der vier
// Aufrufstellen als Contract (das Repo hat bewusst keine React-Render-Infrastruktur). Das
// sichtbare Verhalten im Browser steht in tests/e2e/tg22PackageBParity.test.mjs (R2).
//
// Run: node --test src/utils/bookingProfileView.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BOOKING_PROFILE_FIELD_LABELS, BOOKING_PROFILE_GENERIC_TEXT,
  bookingProfileNotice, bookingProfileGateText,
} from "./bookingProfileView.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const lies = (p) => readFileSync(join(here, "..", p), "utf8");

test("F1: ohne Status oder bei vollständigem Konto kein Hinweis", () => {
  assert.equal(bookingProfileNotice(null), null);
  assert.equal(bookingProfileNotice(undefined), null);
  assert.equal(bookingProfileNotice({ complete: true, missingFields: [] }), null);
  // Nur ein AUSDRÜCKLICHES „nicht vollständig" zählt — kein truthy/falsy-Raten.
  assert.equal(bookingProfileNotice({ complete: "false", missingFields: ["street"] }), null);
  assert.equal(bookingProfileNotice({ missingFields: ["street"] }), null);
});

test("F1: fehlende Felder werden mit den Beschriftungen des Profils genannt — in Backendreihenfolge", () => {
  const t = bookingProfileNotice({ complete: false, missingFields: ["street", "zip", "city"] });
  assert.match(t, /Straße & Hausnummer, PLZ, Stadt\./);
  assert.match(t, /Unternehmensprofil/);
  assert.match(t, /Rechnung/);
  const f = bookingProfileNotice({ complete: false, missingFields: ["company_name", "country"] });
  assert.match(f, /Firmenname, Land\./);
});

test("F1: unbekannte oder fehlende Feldliste — allgemeiner Text, nie ein stiller Verzicht", () => {
  assert.equal(bookingProfileNotice({ complete: false, missingFields: [] }), BOOKING_PROFILE_GENERIC_TEXT);
  assert.equal(bookingProfileNotice({ complete: false }), BOOKING_PROFILE_GENERIC_TEXT);
  assert.equal(bookingProfileNotice({ complete: false, missingFields: ["vat_id"] }), BOOKING_PROFILE_GENERIC_TEXT);
  // Unbekanntes wird übergangen, Doppeltes einmal genannt, und ein Feldname erscheint nie roh.
  const t = bookingProfileNotice({ complete: false, missingFields: ["street", "__proto__", "street", "constructor"] });
  assert.match(t, /: Straße & Hausnummer\./);
  assert.ok(!/__proto__|constructor|street/.test(t), t);
});

test("F1: das Frontend baut die Regel NICHT nach — rohe Kontofelder erzeugen keinen Hinweis", () => {
  assert.equal(bookingProfileNotice({ street: "", zip: "", city: "", country: "" }), null);
  const quelle = readFileSync(join(here, "bookingProfileView.mjs"), "utf8");
  assert.ok(!/\.(street|zip|city|country)\b/.test(quelle), "bookingProfileView liest Anschriftsfelder selbst");
});

test("F1: 422 der Buchung — Felder aus `missingFields`, sonst der Text des Fehlerkatalogs", () => {
  const katalog = "Text des Fehlerkatalogs";
  assert.match(bookingProfileGateText({ code: "BUSINESS_PROFILE_INCOMPLETE", missingFields: ["zip"] }, katalog), /: PLZ\./);
  assert.equal(bookingProfileGateText({ code: "BUSINESS_PROFILE_INCOMPLETE" }, katalog), katalog);
  assert.equal(bookingProfileGateText({ code: "BUSINESS_PROFILE_INCOMPLETE", missingFields: ["x"] }, katalog), katalog);
  assert.equal(bookingProfileGateText(null, katalog), katalog);
});

test("F1: die Beschriftungen sind die der Profilfelder", () => {
  const profil = lies("components/dashboard/Profile.jsx");
  for (const [feld, label] of Object.entries(BOOKING_PROFILE_FIELD_LABELS)) {
    assert.ok(profil.includes(`>${label}`), `Profile.jsx beschriftet ${feld} nicht als „${label}"`);
  }
});

test("F1: AuthContext faltet bookingProfile wie die übrigen Top-Level-Felder (null ohne Feld)", () => {
  const src = lies("context/AuthContext.jsx");
  assert.match(src, /const bookingProfile = d\?\.bookingProfile \?\? u\.bookingProfile \?\? null;/);
  assert.match(src, /companyLogo: logo, bookingProfile, billingCapabilities: billing \}/);
});

test("F1: Profil — Hinweis am Ort der Pflege, PATCH-Antwort setzt den Status neu", () => {
  const src = lies("components/dashboard/Profile.jsx");
  assert.match(src, /const bookingNotice = bookingProfileNotice\(user\?\.bookingProfile\);/);
  assert.match(src, /id="profile-booking-readiness"/);
  assert.match(src, /updateUser\(\{ \.\.\.d\.user, bookingProfile: d\.bookingProfile \?\? null \}\)/);
  // Kein neues Pflichtfeld: die Anschriftsfelder bleiben ohne required/Sternchen.
  for (const id of ["pf-street", "pf-zip", "pf-city"]) {
    const zeile = src.split("\n").find((z) => z.includes(`id="${id}"`)) || "";
    assert.ok(zeile && !/required/.test(zeile), `${id} ist plötzlich ein Pflichtfeld`);
  }
});

test("F1: Neue Sendung und Buchung zeigen den Hinweis VOR dem Buchen; der Bestellknopf bleibt", () => {
  const neu = lies("pages/NewShipmentPage.jsx");
  assert.match(neu, /const bookingProfileHinweis = bookingProfileNotice\(user\?\.bookingProfile\);/);
  assert.match(neu, /id="ns-booking-profile-notice"/);
  const buchung = lies("pages/BookingPage.jsx");
  assert.match(buchung, /profileHint=\{profileHint \|\| bookingProfileNotice\(user\?\.bookingProfile\)\}/);
  assert.match(buchung, /setProfileHint\(bookingProfileGateText\(d, normalizeApiError\(/);
  // Der Hinweis sperrt nicht: die Freigabe des Bestellknopfs kennt ihn nicht.
  const modul = lies("components/booking/BookingActionModule.jsx");
  const freigabe = modul.slice(modul.indexOf("const bookingAllowed"), modul.indexOf("return ("));
  assert.ok(freigabe.length > 0 && !/profileHint/.test(freigabe), "der Profilhinweis sperrt den Bestellknopf");
});
