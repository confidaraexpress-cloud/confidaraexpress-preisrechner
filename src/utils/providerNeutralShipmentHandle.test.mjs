// Governance: `shipments.id` ist der providerneutrale ConfidaraExpress-Sendungshandle.
//
// ─── Warum diese Datei existiert ─────────────────────────────────────────────
// Kundenseitig wurden Sendungen bis hierher über `jumingo_shipment_id` adressiert
// — eine EXTERNE Providerreferenz. Sie stand im Pfad von Tracking, Label und
// Stornoanfrage, im Dateinamen der heruntergeladenen PDF, im Dialogtext und in
// der Sichtbarkeitsbedingung des Storno-Buttons. Das koppelt die gesamte
// Kundenoberfläche an einen bestimmten Anbieter und widerspricht dem White-Label-
// Grundsatz.
//
// Ab hier gilt: EIN Handle (shipments.id) für Tracking, Label und Storno, in EINEM
// Namensraum (/api/shipments/:shipmentId/*). Die Providerreferenz löst der Server
// intern auf; sie verlässt ihn im Kundenpfad nicht mehr.
//
// Reine Quelltextprüfung, konsistent zu den übrigen Governance-Tests dieses Repos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canRequestCancellation, shipmentDialogLabel } from "./customerCancellation.mjs";
import { buchungsFlaeche, buchungsSeite } from "../testing/quelltext.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const client         = read("../api/client.js");
const downloadLabelJs = read("./downloadLabel.js");
const shipmentsList  = read("../components/dashboard/ShipmentsList.jsx");
const dashboardPage  = read("../pages/DashboardPage.jsx");
const bookingPage    = buchungsFlaeche();

const JUMINGO_ID = "s_fb1bc92aba1c4d70a3eaa44d687ae179";

/* ══════════ 1 — Ein Namensraum für alle drei Sendungsoperationen ══════════ */

test("1 — Tracking, Label und Stornoanfrage laufen über /api/shipments/:shipmentId/*", () => {
  assert.match(client, /`\/api\/shipments\/\$\{id\}\/tracking`/,
    "getTracking adressiert nicht über den CE-Handle");
  assert.match(downloadLabelJs, /`\/api\/shipments\/\$\{encodeURIComponent\(String\(id \?\? ""\)\.trim\(\)\)\}\/label`/,
    "downloadLabel adressiert nicht über den CE-Handle");
  assert.match(client, /`\/api\/shipments\/\$\{encodeURIComponent\(String\(shipmentId \?\? ""\)\.trim\(\)\)\}\/cancellation-request`/,
    "die Stornoanfrage adressiert nicht über den CE-Handle");
});

test("2 — die alten providerbezogenen Kundenpfade werden nicht mehr aufgerufen", () => {
  for (const [name, src] of [["client.js", client], ["downloadLabel.js", downloadLabelJs]]) {
    assert.ok(!/["'`]\/api\/jumingo\/label\//.test(src), `${name}: alter Labelpfad`);
    // /api/tracking/public/... bleibt bewusst bestehen (öffentliche Sendungsverfolgung
    // über die Carrier-Trackingnummer, nicht über den CE-Handle) — hier geht es nur
    // um den authentifizierten Kundenpfad.
    assert.ok(!/apiFetch\(`\/api\/tracking\//.test(src), `${name}: alter Trackingpfad`);
    assert.ok(!/["'`]\/kunde\/shipments\/\$\{/.test(src), `${name}: alter Stornopfad`);
  }
});

/* ══════════ 2 — Kein Kundenbauteil kennt die Providerreferenz mehr ════════ */

test("3 — Sendungsliste und Übersicht adressieren ausschließlich über s.id", () => {
  for (const [name, src] of [["ShipmentsList.jsx", shipmentsList], ["DashboardPage.jsx", dashboardPage]]) {
    assert.ok(!/jumingo_shipment_id/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")),
      `${name} verwendet noch die Providerreferenz`);
  }
  assert.match(shipmentsList, /onTrack\(s\.id\)/);
  assert.match(shipmentsList, /requestShipmentCancellation\(ceId, reason\)/);
  assert.match(dashboardPage, /s\.id === shipmentId/);
});

test("4 — der Dateiname der Label-PDF trägt nie eine rohe Providerreferenz", () => {
  // Bei einem Blob-Download entscheidet `download`, NICHT Content-Disposition.
  // Zuvor stand dort `label-${id}.pdf` mit id = jumingo_shipment_id, also
  // wörtlich „label-s_5f3a….pdf" in einem kundensichtbaren Artefakt.
  assert.match(downloadLabelJs, /a\.download = `label-\$\{base\.replace\(\/\[\^a-zA-Z0-9\\-_\]\/g, "_"\)\}\.pdf`/);
  // Nummernumstellung: der Dateiname trägt die AUFTRAGSBESTÄTIGUNGSNUMMER (CE-AB…) —
  // die interne Bestellnummer (CE-BS…) steht in keinem kundensichtbaren Artefakt mehr,
  // ein Dateiname eingeschlossen. Fehlt sie, bleibt der Handle als Dateiname.
  // Verbliebener direkter Aufrufer ist der Erfolgsbildschirm — seit der Modularisierung
  // sein Dokumentbaustein components/booking/BookingSuccessDocuments.jsx; die
  // Sendungsliste lädt seit dem Dokumente-Drawer kein Label mehr selbst.
  // Diese Zusage gilt der SEITE, nicht der Buchungsfläche: sie sagt „das gehört in
  // eine Komponente, nicht in die Seite". Auf der Fläche (Seite + Komponenten) wäre
  // sie zwangsläufig verletzt — dort steht die Komponente ja.
  const bookingPage = buchungsSeite();
  const successDocs = read("../components/booking/BookingSuccessDocuments.jsx");
  assert.match(successDocs, /downloadLabel\(booking\.ceShipmentId, orderConfirmationNumberOf\(booking\)\)/,
    "der Erfolgsbildschirm reicht die Auftragsbestätigungsnummer als Dateinamen nicht durch");
  assert.ok(!/downloadLabel\(/.test(shipmentsList),
    "die Sendungsliste lädt wieder selbst ein Label");
  assert.ok(!/downloadLabel\(/.test(bookingPage),
    "die Buchungsseite selbst lädt wieder direkt ein Label");
  for (const [name, quelle] of [["BookingPage", bookingPage], ["BookingSuccessDocuments", successDocs], ["ShipmentsList", shipmentsList]]) {
    assert.ok(!/downloadLabel\([^)]*business_order_number/.test(quelle),
      `${name}: die interne Bestellnummer benennt wieder eine Kundendatei`);
  }
  // Der Drawer benennt gar nichts selbst: der Name kommt aus Content-Disposition,
  // der Rückfall ist ein neutraler Dateiname je Typ — nie eine Providerreferenz,
  // nie eine interne ID.
  const drawer = read("../components/dashboard/ShipmentDocumentsDrawer.jsx");
  assert.match(drawer, /documentFallbackFilename\(doc\.type\)/);
  assert.ok(!/jumingo|s_\$\{|shipments\.id/.test(drawer), "der Drawer nennt eine interne oder Providerreferenz");
});

/* ══════════ 3 — Sichtbarkeit und Dialogtext ══════════════════════════════ */

test("5 — der Storno-Button hängt am CE-Handle, nicht an der Providerreferenz", () => {
  assert.equal(canRequestCancellation({ status: "booked", id: 4711 }), true);
  assert.equal(canRequestCancellation({ status: "booked" }), false);
  // Eine Sendung ohne Providerreferenz bleibt anfragbar — sie ist trotzdem eine
  // CE-Sendung, und die fachliche Entscheidung trifft ohnehin der Server.
  assert.equal(canRequestCancellation({ status: "booked", id: 4711, jumingo_shipment_id: null }), true);
});

test("6 — der Dialog benennt die Sendung nie über die Providerreferenz", () => {
  assert.equal(shipmentDialogLabel({ reference_number: "REF-9" }), "REF-9");
  assert.equal(shipmentDialogLabel({ order_confirmation_number: "CE-AB26-00042" }), "CE-AB26-00042");
  assert.equal(shipmentDialogLabel({ jumingo_shipment_id: JUMINGO_ID }), "");
});

/* ══════════ 4 — Buchungserfolg: Label über den Handle der Antwort ════════ */

test("7 — der Label-Download der Buchungsseite nutzt den CE-Handle aus der Buchungsantwort", () => {
  // `/book` liefert additiv `ceShipmentId` (shipments.id). `shipmentId` bleibt dort
  // unverändert die JUMiNGO-Referenz — das ist der Wert, den DIESER Client gesendet
  // hat; ihn umzudeuten wäre ein stiller Vertragsbruch.
  // Seit der Modularisierung: Handler und Sichtbarkeit leben wortgleich im
  // Erfolgsdokumente-Baustein.
  const successDocs = read("../components/booking/BookingSuccessDocuments.jsx");
  assert.match(successDocs, /if \(!booking\?\.ceShipmentId\) return;/);
  assert.match(successDocs, /downloadLabel\(booking\.ceShipmentId, orderConfirmationNumberOf\(booking\)\)/);
  // Die Sichtbarkeit des Buttons muss an derselben Bedingung hängen wie der
  // Handler — sonst zeigte er sich und täte beim Klick nichts.
  assert.match(successDocs, /\{booking\?\.ceShipmentId && \(/);
});

test("8 — das Abholzeitfenster bleibt bewusst bei der Providerreferenz", () => {
  // Es ist ein Entwurfsvorgang VOR der Buchung: das Backend löst dort über
  // jumingo_shipment_id UND status='draft' auf. Der Sendungshandle gilt der
  // gebuchten Sendung — die beiden Ebenen werden hier nicht vermischt.
  assert.match(bookingPage, /<PickupWindowModule[\s\S]{0,200}shipmentId=\{bookingData\?\.shipmentId\}/);
});
