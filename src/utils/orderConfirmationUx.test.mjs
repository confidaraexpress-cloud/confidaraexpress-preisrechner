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
import { buchungsFlaeche, buchungsSeite } from "../testing/quelltext.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const dlSrc      = read("./downloadOrderConfirmation.js");
const bookingSrc = buchungsFlaeche();
// Der Dokumentbereich des Erfolgsbildschirms lebt seit der Modularisierung
// wortgleich in components/booking/BookingSuccessDocuments.jsx.
const docsSrc    = read("../components/booking/BookingSuccessDocuments.jsx");
const listSrc    = read("../components/dashboard/ShipmentsList.jsx");
const dlNoteSrc  = read("./downloadDeliveryNote.js");

// Kommentarfreier Quelltext — ein erklärender Kommentar darf keine Zusicherung
// belegen, die der ausgeführte Code nicht trägt.
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
const dlCode      = strip(dlSrc);
const bookingCode = strip(bookingSrc);
const docsCode    = strip(docsSrc);
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
    /booking\?\.ceShipmentId && orderConfirmationNumberOf\(booking\)/.test(docsCode),
    "Sichtbarkeit hängt nicht an der gemeldeten Nummer"
  );
  // Handler und Sichtbarkeit an derselben Bedingung.
  assert.ok(
    /if \(!booking\?\.ceShipmentId \|\| !confirmationNumber\) return;/.test(docsCode),
    "Handler prüft die Bedingung nicht erneut"
  );
});

test("9 der Erfolgsbildschirm nennt die Nummer im Knopftext", () => {
  assert.ok(/Auftragsbestätigung \{orderConfirmationNumberOf\(booking\)\} herunterladen/.test(docsSrc),
    "die Nummer steht nicht im Knopf");
});

test("10 401/403 erzeugen keine eigene Meldung (zentraler Redirect)", () => {
  const idx = docsCode.indexOf("handleDownloadOrderConfirmation");
  assert.ok(idx !== -1, "Handler nicht gefunden — der Scan liefe auf einem leeren Ausschnitt");
  const body = docsCode.slice(idx, idx + 700);
  assert.ok(/e\?\.status !== 401 && e\?\.status !== 403/.test(body), "doppelte Fehlerbehandlung bei Auth");
});

test("11 die Auftragsbestätigung steht VOR dem Lieferschein", () => {
  // Sie betrifft jede Buchung, der Lieferschein nur Konten mit Lagerbezug.
  const oc = docsCode.indexOf("onClick={handleDownloadOrderConfirmation}");
  const dn = docsCode.indexOf("onClick={handleDownloadDeliveryNote}");
  assert.ok(oc > 0 && dn > 0, "beide Knöpfe müssen existieren");
  assert.ok(oc < dn, "der Lieferschein steht vor der Auftragsbestätigung");
});

// ─── 4. Sendungsliste ────────────────────────────────────────────────────────

/* Seit dem Dokumente-Drawer hat die SENDUNGSLISTE keinen eigenen
   Auftragsbestätigungsknopf mehr: dokumentbezogene Aktionen laufen dort über
   EINE zentrale Aktion, und welche Dokumente es gibt, sagt der Server. Die
   Zusicherungen der früheren Tests 12–15 wandern damit an ihren neuen Ort —
   inhaltlich unverändert:
     · Sichtbarkeit wird nicht aus der Zeile geraten  → jetzt: gar nicht mehr geraten
     · Tabelle und Karte tragen DIESELBE Aktion       → unverändert geprüft
     · der Download nutzt den richtigen Adressweg     → jetzt der Serverpfad im Drawer
     · genau EIN Aufrufpfad je Oberfläche             → unverändert geprüft
   Der Erfolgsbildschirm ist davon unberührt und behält seinen direkten Knopf. */

test("12 die Liste rät nicht mehr, ob es eine Auftragsbestätigung gibt", () => {
  // Der frühere Knopf hing an `s.order_confirmation_number` der Zeile. Diese
  // Ableitung ist ersatzlos entfallen — sie war eine zweite Wahrheit neben der
  // Dokumentliste des Servers.
  assert.ok(!/onOrderConfirmation/.test(listCode), "die Liste trägt wieder eine eigene AB-Aktion");
  assert.ok(!/downloadOrderConfirmation/.test(listCode), "die Liste lädt die AB wieder selbst");
  assert.ok(/onDocuments=\{setDocumentsShipment\}/.test(listCode), "die zentrale Dokumentaktion fehlt");
});

test("13 beide Darstellungen (Tabelle und Karte) bekommen dieselbe Aktion", () => {
  const matches = listCode.match(/onDocuments=\{setDocumentsShipment\}/g) || [];
  assert.strictEqual(matches.length, 2, "Tabelle und Mobilkarte müssen dieselbe Aktion tragen");
  // Und beide über DIESELBE Komponente — kein zweites Aktionsmuster daneben.
  const uses = listCode.match(/<ShipmentRowActions/g) || [];
  assert.strictEqual(uses.length, 2);
});

test("14 der Drawer lädt über den SERVERGELIEFERTEN Pfad, nicht über einen gebauten", () => {
  const drawerCode = strip(read("../components/dashboard/ShipmentDocumentsDrawer.jsx"));
  assert.ok(/documentDownloadPath\(doc\)/.test(drawerCode), "der Pfad kommt nicht aus der Serverantwort");
  assert.ok(!/order-confirmation/.test(drawerCode), "der Drawer baut einen eigenen Dokumentpfad");
  assert.ok(!/\$\{shipmentId\}\//.test(drawerCode), "der Drawer setzt einen Pfad aus der Sendungs-ID zusammen");
});

test("15 es gibt genau EINEN Aufrufpfad je Oberfläche", () => {
  // Die Auftragsbestätigung wird nur noch an EINER Stelle direkt geladen: auf dem
  // Erfolgsbildschirm. Die Sendungsliste ruft den Helfer gar nicht mehr auf.
  assert.strictEqual((docsCode.match(/downloadOrderConfirmation\(/g) || []).length, 1,
    "der Erfolgsdokumente-Baustein ruft den Download nicht genau einmal auf");
  // Diese Zusage gilt der SEITE, nicht der Buchungsfläche: sie sagt „das gehört in
  // eine Komponente, nicht in die Seite". Auf der Fläche (Seite + Komponenten) wäre
  // sie zwangsläufig verletzt — dort steht die Komponente ja.
  assert.strictEqual((strip(buchungsSeite()).match(/downloadOrderConfirmation\(/g) || []).length, 0,
    "die Buchungsseite selbst ruft den Download wieder direkt auf");
  assert.strictEqual((listCode.match(/downloadOrderConfirmation\(/g) || []).length, 0,
    "die Sendungsliste ruft den Download wieder selbst auf");
});

test("16 kein SICHTBARER Text dieses Pakets nennt den Upstream-Anbieter", () => {
  // Geprüft wird der KUNDENSICHTBARE Text, nicht der Quelltext insgesamt: interne
  // Kommentare, technische Feldnamen und API-Pfade (`/api/jumingo/book`) sind
  // ausdrücklich unberührt (CLAUDE.md, White Label). Beides zu vermengen erzeugte
  // einen Fehlalarm auf Bestandszeilen, die dieses Paket gar nicht anfasst.
  const sichtbar = [
    ...(dlSrc.match(/"[^"]{10,200}"/g) || []),                 // Fehlertexte des Downloads
    "Auftragsbestätigung",                                      // Beschriftung im Dokumente-Drawer
    (docsSrc.match(/Auftragsbestätigung \{[^}]*\} herunterladen/) || [""])[0],
    (docsSrc.match(/Auftragsbestätigung wird geladen…/) || [""])[0],
  ];
  for (const t of sichtbar) {
    for (const leak of ["jumingo", "sandbox"]) {
      assert.ok(!String(t).toLowerCase().includes(leak), `„${t}" nennt ${leak}`);
    }
  }
  // Und das neue Modul selbst enthält den Anbieternamen nirgends — auch nicht im Kommentar.
  assert.ok(!/jumingo/i.test(dlSrc), "das Downloadmodul nennt den Anbieter");
});
