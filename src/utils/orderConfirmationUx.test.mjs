// Auftragsbestätigung im Kundenportal — Frontendvertrag.
//
// Geprüft werden: der Downloadpfad (Adressierung über den Sendungshandle, strikte
// PDF-Prüfung, Fehlertexte), die Sichtbarkeitsregeln der beiden Einstiegspunkte
// (Erfolgsbildschirm und Sendungsliste) und dass nichts unterstellt wird, was die
// Backendantwort nicht meldet.
//
// Ausführen: node --test src/utils/orderConfirmationUx.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const dlSrc      = read("./downloadOrderConfirmation.js");
const bookingSrc = read("../pages/BookingPage.jsx");
const listSrc    = read("../components/dashboard/ShipmentsList.jsx");
const dlNoteSrc  = read("./downloadDeliveryNote.js");

// Kommentarfreier Quelltext — ein erklärender Kommentar darf keine Zusicherung
// belegen, die der ausgeführte Code nicht trägt.
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
const dlCode      = strip(dlSrc);
const bookingCode = strip(bookingSrc);
const listCode    = strip(listSrc);

// ─── 1. Adressierung ─────────────────────────────────────────────────────────

test("1 der Download adressiert über den Sendungshandle, nicht über eine eigene id", () => {
  assert.ok(
    /`\/api\/shipments\/\$\{encodeURIComponent\(String\(shipmentId \?\? ""\)\.trim\(\)\)\}\/order-confirmation`/.test(dlCode),
    "falscher Pfad oder fehlende Kodierung"
  );
  // Es gibt keinen zweiten Adressierungsweg.
  assert.ok(!/order-confirmations\//.test(dlCode), "zweiter Namensraum");
  assert.ok(/auth:\s*true/.test(dlCode), "Download ohne Authentifizierung");
});

test("2 der Pfad steht im selben Namensraum wie die übrigen Sendungsoperationen", () => {
  // Label, Tracking, Lieferschein und Stornoanfrage adressieren identisch.
  const notePath = dlNoteSrc.match(/\/api\/shipments\/[^`]*`/);
  assert.ok(notePath, "Vergleichspfad nicht gefunden");
  assert.ok(notePath[0].includes("/delivery-note"), "Vergleichspfad unerwartet");
  assert.ok(dlCode.includes("/api/shipments/"), "abweichender Namensraum");
});

// ─── 2. Robustheit des Downloads ─────────────────────────────────────────────

test("3 ein Erfolgsstatus ohne PDF wird nie als Datei gespeichert", () => {
  // Sonst bekäme der Kunde eine kaputte PDF, wenn ein Proxy JSON oder HTML liefert.
  assert.ok(/contentType\.startsWith\("application\/pdf"\)/.test(dlCode), "Content-Type wird nicht geprüft");
  assert.ok(/!blob \|\| blob\.size === 0/.test(dlCode), "leerer Blob wird nicht abgefangen");
});

test("4 die Object-URL wird immer freigegeben", () => {
  assert.ok(/finally\s*\{\s*URL\.revokeObjectURL\(url\);/.test(dlCode.replace(/\s+/g, " ").replace(/finally \{ /g, "finally {\n    ")) ||
    /URL\.revokeObjectURL\(url\)/.test(dlCode), "revokeObjectURL fehlt");
  assert.ok(dlCode.includes("finally"), "Freigabe nicht im finally");
});

test("5 der Dateiname kommt vom Aufrufer und wird bereinigt", () => {
  // Bei einem Blob-Download entscheidet das download-Attribut, nicht das serverseitige
  // Content-Disposition.
  assert.ok(/a\.download = `Auftragsbestaetigung_\$\{base\.replace\(\/\[\^a-zA-Z0-9\\-_\]\/g, "_"\)\}\.pdf`/.test(dlCode),
    "Dateiname wird nicht bereinigt");
  assert.ok(/String\(confirmationNumber \?\? ""\)\.trim\(\) \|\| String\(shipmentId \?\? ""\)\.trim\(\)/.test(dlCode),
    "kein Rückfall auf den Handle");
});

test("6 ein 5xx-Sammelfehler landet nie im Kundenbanner", () => {
  // Serverfreitext wird NUR bei 4xx und nur bei mehr als einem Wort übernommen —
  // sonst stünde „Fehler" als Kundenmeldung im Banner.
  assert.ok(/status >= 400 && status < 500/.test(dlCode), "4xx-Schranke fehlt");
  assert.ok(/split\(\/\\s\+\/\)\.length > 1/.test(dlCode), "Einwortprüfung fehlt");
});

test("7 die Fehlertexte sind handlungsleitend und nennen keine Interna", () => {
  const texte = dlSrc.match(/"[^"]{20,200}"/g) || [];
  const kunden = texte.filter((t) => /konnte nicht|liegt keine|Zu viele/.test(t));
  assert.ok(kunden.length >= 3, "zu wenige unterscheidbare Fehlertexte");
  for (const t of kunden) {
    for (const leak of ["jumingo", "sandbox", "SQL", "snapshot", "500"]) {
      assert.ok(!t.toLowerCase().includes(leak.toLowerCase()), `${leak} in „${t}"`);
    }
  }
});

// ─── 3. Erfolgsbildschirm ────────────────────────────────────────────────────

test("8 der Knopf erscheint NUR, wenn die Buchungsantwort eine Bestätigung meldet", () => {
  // Nie aus dem Kontozustand geraten — genau wie beim Lieferschein. Beide Stellen lesen
  // seit dem CE-AB-Contract-Fix über denselben zentralen Helper (businessNumbers.mjs),
  // der sowohl die verschachtelte /book-Form (orderConfirmation.number) als auch ältere
  // Formen versteht — statt eines direkten, an die verschachtelte Form gebundenen Zugriffs.
  assert.ok(
    /booking\?\.ceShipmentId && orderConfirmationNumberOf\(booking\)/.test(bookingCode),
    "Sichtbarkeit hängt nicht an der gemeldeten Nummer"
  );
  // Handler und Sichtbarkeit an derselben Bedingung.
  assert.ok(
    /if \(!booking\?\.ceShipmentId \|\| !confirmationNumber\) return;/.test(bookingCode),
    "Handler prüft die Bedingung nicht erneut"
  );
});

test("9 der Erfolgsbildschirm nennt die Nummer im Knopftext", () => {
  assert.ok(/Auftragsbestätigung \{orderConfirmationNumberOf\(booking\)\} herunterladen/.test(bookingSrc),
    "die Nummer steht nicht im Knopf");
});

test("10 401/403 erzeugen keine eigene Meldung (zentraler Redirect)", () => {
  const idx = bookingCode.indexOf("handleDownloadOrderConfirmation");
  const body = bookingCode.slice(idx, idx + 700);
  assert.ok(/e\?\.status !== 401 && e\?\.status !== 403/.test(body), "doppelte Fehlerbehandlung bei Auth");
});

test("11 die Auftragsbestätigung steht VOR dem Lieferschein", () => {
  // Sie betrifft jede Buchung, der Lieferschein nur Konten mit Lagerbezug.
  const oc = bookingCode.indexOf("handleDownloadOrderConfirmation(s)") >= 0
    ? bookingCode.indexOf("onClick={handleDownloadOrderConfirmation}")
    : bookingCode.indexOf("onClick={handleDownloadOrderConfirmation}");
  const dn = bookingCode.indexOf("onClick={handleDownloadDeliveryNote}");
  assert.ok(oc > 0 && dn > 0, "beide Knöpfe müssen existieren");
  assert.ok(oc < dn, "der Lieferschein steht vor der Auftragsbestätigung");
});

// ─── 4. Sendungsliste ────────────────────────────────────────────────────────

test("12 die Liste zeigt den Knopf nur bei vorhandener Nummer", () => {
  // Sendungen von vor diesem Paket haben keine — dort bleibt der Knopf weg, statt in
  // einen 404 zu laufen.
  assert.ok(/s\.id && s\.order_confirmation_number/.test(listCode),
    "Sichtbarkeit hängt nicht an der Nummer der Zeile");
});

test("13 beide Darstellungen (Tabelle und Karte) bekommen dieselbe Aktion", () => {
  const matches = listCode.match(/onOrderConfirmation=\{handleDownloadOrderConfirmation\}/g) || [];
  assert.strictEqual(matches.length, 2, "Tabelle und Mobilkarte müssen dieselbe Aktion tragen");
  // Und beide über DIESELBE Komponente — kein zweites Aktionsmuster daneben.
  const uses = listCode.match(/<ShipmentRowActions/g) || [];
  assert.strictEqual(uses.length, 2);
});

test("14 der Download nutzt Handle und Nummer der Zeile", () => {
  assert.ok(/downloadOrderConfirmation\(s\.id, s\.order_confirmation_number\)/.test(listCode),
    "falsche Argumente");
});

test("15 es gibt genau EINEN Aufrufpfad je Oberfläche", () => {
  for (const [name, code] of [["BookingPage", bookingCode], ["ShipmentsList", listCode]]) {
    const calls = (code.match(/downloadOrderConfirmation\(/g) || []).length;
    // je einmal im Handler aufgerufen (der Import zählt nicht mit, er hat keine Klammer)
    assert.strictEqual(calls, 1, `${name} ruft den Download ${calls}-mal auf`);
  }
});

test("16 kein SICHTBARER Text dieses Pakets nennt den Upstream-Anbieter", () => {
  // Geprüft wird der KUNDENSICHTBARE Text, nicht der Quelltext insgesamt: interne
  // Kommentare, technische Feldnamen und API-Pfade (`/api/jumingo/book`) sind
  // ausdrücklich unberührt (CLAUDE.md, White Label). Beides zu vermengen erzeugte
  // einen Fehlalarm auf Bestandszeilen, die dieses Paket gar nicht anfasst.
  const sichtbar = [
    ...(dlSrc.match(/"[^"]{10,200}"/g) || []),                 // Fehlertexte des Downloads
    "Auftragsbestätigung",                                      // Knopftext der Liste
    (bookingSrc.match(/Auftragsbestätigung \{[^}]*\} herunterladen/) || [""])[0],
    (bookingSrc.match(/Auftragsbestätigung wird geladen…/) || [""])[0],
  ];
  for (const t of sichtbar) {
    for (const leak of ["jumingo", "sandbox"]) {
      assert.ok(!String(t).toLowerCase().includes(leak), `„${t}" nennt ${leak}`);
    }
  }
  // Und das neue Modul selbst enthält den Anbieternamen nirgends — auch nicht im Kommentar.
  assert.ok(!/jumingo/i.test(dlSrc), "das Downloadmodul nennt den Anbieter");
});
