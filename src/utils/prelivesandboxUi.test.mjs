// Pre-Live-Sandboxmodus — die Frontendseite der Änderung.
//
// Fachlich: über den JUMiNGO-Testgutschein entscheidet ausschließlich der SERVER
// (globaler Schalter JUMINGO_SANDBOX_ENABLED + Authentifizierung + Testtarif +
// Providerbestätigung). Das Frontend entscheidet nichts und zeigt nichts an, was es
// nicht steuern kann.
//
// Diese Datei sichert genau zwei Dinge ab:
//   1. Die kontoindividuelle Freigabe („Testbuchungen freischalten") ist restlos aus der
//      Adminoberfläche verschwunden — inklusive API-Funktion, Komponente und Textmodul.
//      Eine tote Steuerung, die einen wirkungslosen Wert schreibt, ist schlimmer als keine:
//      sie behauptet eine Wirkung, die es nicht gibt.
//   2. Das Frontend trifft nach wie vor KEINE Sandboxentscheidung — kein Gutscheincode,
//      kein Prozentwert, kein 0-Euro-Zustand ohne serverbestätigte Antwort.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pruefeNichtVorhanden } from "../../scripts/governance.mjs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (p) => readFileSync(path.join(wurzel, p), "utf8");
const paket = JSON.parse(lies("package.json"));

// Kommentarfreier Quelltext — dieselbe Konvention wie im Backend: ein erklärender
// Kommentar darf keine Zusicherung belegen, die der ausgeführte Code nicht trägt.
const ohneKommentare = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

test("1 — die entfernten Bausteine der Kontofreigabe existieren nicht mehr", () => {
  for (const datei of [
    "src/components/admin/TestBookingSection.jsx",
    "src/utils/adminTestBooking.mjs",
    "src/utils/adminTestBooking.test.mjs",
  ]) {
    assert.equal(existsSync(path.join(wurzel, datei)), false,
      `${datei} darf nicht mehr existieren — die Kontofreigabe ist entfallen`);
  }
});

test("2 — die Adminseite trägt keine Testbuchungssteuerung mehr", () => {
  const seite = ohneKommentare(lies("src/pages/admin/AdminUserDetailPage.jsx"));
  for (const bezeichner of [
    "TestBookingSection", "setAdminUserTestBooking", "adminTestBooking",
    "TEST_BOOKING_TEXTS", "isTestBookingEnabled", "testBookingHasChange",
    "tbDialog", "tbBusy", "confirmTestBooking", "test_booking_enabled",
  ]) {
    assert.ok(!seite.includes(bezeichner),
      `AdminUserDetailPage darf ${bezeichner} nicht mehr verwenden`);
  }
});

test("3 — es gibt keinen Aufrufpfad mehr zum entfernten Adminendpunkt", () => {
  const api = ohneKommentare(lies("src/api/adminApi.js"));
  assert.ok(!api.includes("setAdminUserTestBooking"), "die API-Funktion muss entfernt sein");
  assert.ok(!api.includes("/test-booking"), "der Endpunktpfad darf nirgends mehr stehen");
});

test("4 — die entfernte Testdatei ist auch wirklich weg", () => {
  // Früher wurde geprüft, dass der Name nicht mehr im Testskript steht. Seit
  // der Umstellung auf Auffindung wäre das bedeutungslos: eine wieder
  // angelegte Datei liefe automatisch mit, ohne dass irgendwo ihr Name stünde.
  // Das tragfähige Maß ist deshalb ihre Abwesenheit auf der Platte.
  assert.ok(pruefeNichtVorhanden("src/utils/adminTestBooking.test.mjs"),
    "adminTestBooking.test.mjs darf es nicht mehr geben");
});

test("5 — das Frontend entscheidet weiterhin NICHTS über den Sandboxgutschein", () => {
  // Weder der Code noch der Schaltername noch ein Prozentwert stehen im Produktivcode.
  // Die Gutscheinauswertung liest ausschließlich die serverbestätigte Antwort.
  for (const datei of [
    "src/utils/voucherView.mjs",
    "src/components/booking/VoucherModule.jsx",
    "src/components/booking/PriceSummaryModule.jsx",
    "src/pages/BookingPage.jsx",
  ]) {
    const src = lies(datei);
    assert.ok(!/jumingo-sandbox/i.test(src), `${datei} darf den Sandboxcode nicht kennen`);
    assert.ok(!/JUMINGO_SANDBOX_ENABLED/.test(src),
      `${datei} darf den serverseitigen Schalter nicht kennen — er ist keine Clientinformation`);
  }
});

test("6 — kein clientseitiges 0-Euro-Hardcoding", () => {
  // Ein bestätigter Gutschein ergibt 0,00 € NUR, weil der Server das so liefert.
  const view = ohneKommentare(lies("src/utils/voucherView.mjs"));
  assert.ok(!/(total|gross|finalGross)\s*=\s*0\b/.test(view),
    "der Betrag darf nie lokal auf 0 gesetzt werden");
  // Die Auswertung nutzt Number.isFinite — 0 ist ein GÜLTIGER Betrag und darf nie
  // durch eine Falsy-Prüfung zu „fehlt" werden.
  assert.ok(view.includes("Number.isFinite"),
    "die Betragsprüfung muss über Number.isFinite laufen");
});
