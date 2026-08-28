/* Proforma-Rechnung auf dem Buchungs-Erfolgsscreen (P5B).
   =============================================================================
   Zwei Zusagen tragen dieses Paket, und beide sind hier festgehalten:

     1. Eine erfolgreiche Buchung bleibt erfolgreich. Kein Fehler beim Laden der
        Dokumentliste und kein Fehler beim Download darf die Erfolgsmeldung
        entfernen, den Bildschirm in einen Fehlerzustand kippen oder /book
        erneut auslösen.

     2. Es wird NICHTS geraten. Ob es zu einer Sendung eine eigene Proforma gibt,
        sagt ausschließlich die Dokument-Metadaten-API — nie das Zielland, der
        Zollrechnungsmodus, der Ausfuhrgrund, der Tarif oder der Provider.

   Das gerenderte Verhalten prüft tests/e2e/proformaSuccessDownload.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PROFORMA_TYPE, PROFORMA_VIEW, PROFORMA_TEXT,
  PROFORMA_POLL_INTERVAL_MS, PROFORMA_POLL_BUDGET_MS,
  findProformaEntry, proformaViewState, proformaDownloadPath, proformaDownloadLabel,
  proformaKeepPolling, nextProformaPollDelay, isSafeApiPath, proformaDownloadMessage,
} from "./proformaDocumentView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bookingPage  = lies("../pages/BookingPage.jsx");
// Der Metadaten-Poll lebt seit der Modularisierung im eigenen Hook.
const proformaHook = lies("../hooks/useProformaDocument.js");
const viewModul    = lies("./proformaDocumentView.mjs");
const downloadMod  = lies("./downloadProforma.js");
// Die MECHANIK des Downloads (Abruf, Content-Type-Prüfung, Blob, Object-URL,
// Pfad-Guard) steht seit dem Dokumente-Drawer im gemeinsamen Helfer; die
// proformaeigenen Teile (Rückfallname, Texte) blieben in downloadProforma.js.
// Beide Dateien werden deshalb gemeinsam geprüft — die Aussagen sind dieselben.
const genericMod  = lies("./downloadDocument.js");
const apiClient    = lies("../api/client.js");

// Der Proforma-Teil der Buchungsseite, isoliert: Effekt und Oberfläche. Nur so
// lässt sich prüfen, dass GENAU DIESER Code nichts aus Zolldaten ableitet —
// die Seite trägt daneben unverändert den echten Zollrechnungsablauf.
function schnitt(quelle, von, bis) {
  const a = quelle.indexOf(von);
  const b = quelle.indexOf(bis, a);
  assert.ok(a >= 0 && b > a, `Ankertext nicht gefunden: ${von.slice(0, 40)}`);
  return quelle.slice(a, b);
}
const effekt = schnitt(proformaHook,
  "// ── Proforma-Rechnung des Erfolgsscreens auflösen",
  "}, [step, booking]);");
const oberflaeche = schnitt(bookingPage,
  "{/* Proforma-Rechnung — das Zollbegleitdokument",
  "{/* Ruhiger Hinweis");
const handler = schnitt(bookingPage,
  "const handleDownloadProforma = async () => {",
  "/* ── Sichtbares ");

/* ═════════ 1 — Die Metadaten-API ist die einzige Quelle ═════════ */

test("1 — der Proformateil leitet nichts aus Zoll-, Länder- oder Providerdaten ab", () => {
  // Diese Begriffe stehen an anderer Stelle der Buchungsseite völlig zu Recht
  // (der Zollrechnungsablauf braucht sie). Im Proformateil hätten sie nichts zu
  // suchen: sie wären ein zweiter, clientseitiger Weg zu einer Aussage, die
  // serverseitig aus dem persistierten Zollsnapshot entsteht.
  for (const verboten of [
    "customsInvoiceMode", "resolveInvoiceMode", "exportReason", "use_commercial_invoice",
    "COMMERCIAL", "customsRequired", "toCountry", "r_country", "tariff", "carrier", "jumingo",
  ]) {
    for (const [name, teil] of [["Effekt", effekt], ["Oberfläche", oberflaeche], ["Handler", handler]]) {
      assert.ok(!teil.includes(verboten), `${name} darf sich nicht auf ${verboten} stützen`);
    }
  }
  // Die Entscheidung kommt aus genau einer Quelle.
  assert.ok(effekt.includes("getShipmentDocuments("), "der Effekt fragt die Dokument-Metadaten-API");
  assert.ok(effekt.includes("findProformaEntry("), "und wertet ausschließlich deren Antwort aus");
});

test("2 — der Downloadpfad wird nie im Frontend gebaut", () => {
  // Ein selbst zusammengesetzter Pfad wäre eine zweite Wahrheit neben der
  // Serverliste und veraltete bei jeder Routenänderung stillschweigend.
  const pfadLiteral = /\/proforma(?![A-Za-z])/;
  for (const [name, quelle] of [
    ["BookingPage.jsx", bookingPage],
    ["useProformaDocument.js", proformaHook],
    ["proformaDocumentView.mjs", viewModul],
    ["downloadProforma.js", downloadMod],
    ["downloadDocument.js", genericMod],
    ["api/client.js", apiClient],
  ]) {
    assert.ok(!pfadLiteral.test(quelle), `${name} darf keinen eigenen Proforma-Pfad bilden`);
  }
  assert.ok(handler.includes("proformaDownloadPath(proformaEntry)"),
    "der Handler nimmt den servergelieferten Pfad");
  assert.ok(genericMod.includes("apiFetch(downloadPath.trim()"),
    "der Downloadhelfer ruft genau diesen Pfad auf");
  assert.ok(downloadMod.includes("downloadDocument(downloadPath, {"),
    "die Proforma reicht den servergelieferten Pfad unverändert weiter");
});

/* ═════════ 2 — Auswertung der Antwort ═════════ */

test("3 — findProformaEntry ist gegen jede Antwortform defensiv", () => {
  for (const kaputt of [null, undefined, {}, { documents: null }, { documents: "x" }, { documents: {} }, 42, "x"]) {
    assert.equal(findProformaEntry(kaputt), null);
  }
  assert.equal(findProformaEntry({ documents: [] }), null);
  assert.equal(findProformaEntry({ documents: [null, { type: "LABEL" }, { type: "DELIVERY_NOTE" }] }), null);
  const treffer = { type: PROFORMA_TYPE, status: "ready", downloadPath: "/api/shipments/7/proforma" };
  assert.equal(findProformaEntry({ documents: [{ type: "LABEL" }, treffer] }), treffer);
});

test("4 — Zustandsabbildung: nur ready MIT Pfad ist ladbar", () => {
  const pfad = "/api/shipments/7/proforma";
  assert.equal(proformaViewState(null), PROFORMA_VIEW.ABSENT);
  assert.equal(proformaViewState({ status: "ready", downloadPath: pfad }), PROFORMA_VIEW.READY);
  assert.equal(proformaViewState({ status: "processing" }), PROFORMA_VIEW.PROCESSING);
  assert.equal(proformaViewState({ status: "failed" }), PROFORMA_VIEW.FAILED);
  // Unbekanntes gilt NIE als ladbar — sonst behauptete ein neuer Serverzustand
  // einen Download, den es nicht gibt.
  for (const unbekannt of ["READY", "fertig", "", null, undefined, 1, true]) {
    assert.equal(proformaViewState({ status: unbekannt, downloadPath: pfad }), PROFORMA_VIEW.PROCESSING);
  }
  // „ready" ohne benutzbaren Pfad ist kein Fehler — aber auch nichts zum Klicken.
  assert.equal(proformaViewState({ status: "ready" }), PROFORMA_VIEW.PROCESSING);
  assert.equal(proformaViewState({ status: "ready", downloadPath: "" }), PROFORMA_VIEW.PROCESSING);
  assert.equal(proformaDownloadPath({ status: "ready" }), null);
  assert.equal(proformaDownloadPath({ status: "failed", downloadPath: pfad }), null);
  assert.equal(proformaDownloadPath({ status: "ready", downloadPath: ` ${pfad} ` }), pfad);
});

test("5 — der Pfad-Guard lässt keinen fremden Host durch", () => {
  // apiFetch reicht eine absolute URL unverändert durch UND hängt den Bearer-Token
  // an: ein Pfad auf einen fremden Host würde das Kundentoken dorthin senden.
  assert.equal(isSafeApiPath("/api/shipments/7/proforma"), true);
  for (const boese of [
    "https://boese.example/steal", "http://boese.example/x", "//boese.example/x",
    "api/shipments/7/proforma", "", "   ", null, undefined, 7, {},
    "/api/x /y", "/api/x\"y", "/api/x'y", "/api/x<y", "/api/x\\y", "/api/x\ny",
  ]) {
    assert.equal(isSafeApiPath(boese), false, `abgelehnt werden muss: ${String(boese)}`);
  }
});

/* ═════════ 3 — Gedeckeltes Nachladen ═════════ */

test("6 — erster Abruf sofort, danach fester kurzer Takt mit harter Obergrenze", () => {
  assert.equal(PROFORMA_POLL_INTERVAL_MS, 2000);
  assert.equal(PROFORMA_POLL_BUDGET_MS, 30000);
  // Der erste Abruf steht ohne Timer im Effekt — nicht hinter einer Wartezeit.
  assert.ok(/\n\s*lauf\(\);/.test(effekt), "der erste Abruf läuft sofort");
  let n = 0, summe = 0;
  for (;;) {
    const d = nextProformaPollDelay(n);
    if (d == null) break;
    assert.equal(d, PROFORMA_POLL_INTERVAL_MS);
    summe += d; n += 1;
    assert.ok(n < 1000, "das Nachladen muss endlich sein");
  }
  assert.equal(n, 15);
  assert.equal(summe, PROFORMA_POLL_BUDGET_MS);
  for (const murks of [-1, 1.5, NaN, null, undefined, "3"]) assert.equal(nextProformaPollDelay(murks), null);
});

test("7 — nachgeladen wird nur, solange der Beleg tatsächlich entsteht", () => {
  assert.equal(proformaKeepPolling(PROFORMA_VIEW.PROCESSING), true);
  for (const ende of [PROFORMA_VIEW.ABSENT, PROFORMA_VIEW.READY, PROFORMA_VIEW.FAILED, "irgendwas", undefined]) {
    assert.equal(proformaKeepPolling(ende), false, `${ende} ist ein Endzustand`);
  }
});

test("8 — kein Endlospolling, kein Hintergrundworker, sauberes Aufräumen", () => {
  assert.ok(!effekt.includes("setInterval"), "kein Intervall — jeder Takt wird einzeln entschieden");
  assert.ok(effekt.includes("if (step !== 3 || !booking || !booking.ceShipmentId) return undefined;"),
    "der Effekt läuft ausschließlich auf dem Erfolgsscreen");
  assert.ok(effekt.includes("cancelled = true"), "Unmount stoppt den Lauf");
  assert.ok(effekt.includes("clearTimeout(proformaTimerRef.current)"), "der Timer wird bereinigt");
  assert.ok(effekt.includes("if (delay == null) return;"), "das Budget beendet das Nachladen");
  // Ohne Proformazeile wird gar nicht weitergefragt (Endzustand `absent`).
  assert.equal(proformaKeepPolling(proformaViewState(findProformaEntry({ documents: [{ type: "LABEL" }] }))), false);
});

/* ═════════ 4 — Die Buchung bleibt erfolgreich ═════════ */

test("9 — der Metadatenabruf kann den Erfolgsscreen nicht beschädigen", () => {
  // Kein Fehlerzustand aus dem LADEN: der einzige sichtbare Fehler gehört zum
  // Downloadversuch des Kunden.
  assert.ok(!effekt.includes("setProformaError"), "ein Ladefehler erzeugt keine Fehlermeldung");
  assert.ok(effekt.includes("catch { /* still bleiben"), "jeder Fehler wird geschluckt");
  // Ein nicht auswertbarer Abruf darf einen bereits gefundenen Beleg nicht löschen.
  assert.ok(effekt.includes("if (antwort) {") && effekt.includes("let antwort = null;"),
    "nur eine auswertbare Antwort schreibt den Zustand");
  // Und niemals eine zweite Bestellung.
  for (const verboten of ["doBook", "/book", "setStep", "setBooking("]) {
    assert.ok(!effekt.includes(verboten), `der Effekt darf ${verboten} nicht anfassen`);
  }
});

test("10 — die bestehende Erfolgsdarstellung ist unangetastet", () => {
  assert.ok(bookingPage.includes("Sendung erfolgreich gebucht!"), "die Erfolgsmeldung steht unverändert");
  // Label, Auftragsbestätigung und Lieferschein laufen weiterhin über ihre
  // eigenen Helfer — sie wurden NICHT auf die Dokumentliste umgestellt.
  for (const helfer of ["downloadLabel(booking.ceShipmentId", "downloadOrderConfirmation(booking.ceShipmentId",
                        "downloadDeliveryNote(booking.ceShipmentId"]) {
    assert.ok(bookingPage.includes(helfer), `unverändert: ${helfer}`);
  }
  // Genau EIN Aufruf der Dokumentliste auf dem Erfolgsbildschirm-Weg — kein zweiter
  // Abrufweg. Seit der Modularisierung liegt er im Hook; die Seite selbst ruft die
  // API nicht mehr direkt (beides wird gemessen, damit kein zweiter Aufrufer entsteht).
  assert.equal(proformaHook.split("getShipmentDocuments(").length - 1, 1,
    "die Dokumentliste wird an genau einer Stelle abgefragt");
  assert.equal(bookingPage.split("getShipmentDocuments(").length - 1, 0,
    "die Buchungsseite selbst fragt die Dokumentliste nicht mehr direkt ab");
});

test("11 — keine P6-Funktion vorweggenommen", () => {
  for (const spaeter of ["DocumentsDrawer", "documentsDrawer", "ce-documents-drawer"]) {
    assert.ok(!bookingPage.includes(spaeter), `${spaeter} gehört zu P6`);
    assert.ok(!proformaHook.includes(spaeter), `${spaeter} gehört zu P6 (Hook)`);
  }
  // Die Sendungsliste bleibt unberührt: sie fragt die Dokumentliste nicht ab.
  assert.ok(!lies("../components/dashboard/ShipmentsList.jsx").includes("getShipmentDocuments"),
    "die Sendungsliste ist nicht Teil dieses Pakets");
});

/* ═════════ 5 — Was der Kunde liest ═════════ */

test("12 — kein Interna im sichtbaren Text, kein Wiederholen-Knopf", () => {
  const texte = Object.values(PROFORMA_TEXT).join(" | ");
  for (const verboten of [
    "PROFORMA_", "U+", "Error", "error", "code", "500", "409", "jumingo", "JUMiNGO",
    "Transglobal", "document_status", "proforma_invoices", "shipment_id",
  ]) {
    assert.ok(!texte.includes(verboten), `sichtbarer Text darf ${verboten} nicht enthalten`);
  }
  assert.ok(PROFORMA_TEXT.failed.includes("derzeit nicht verfügbar"), "neutraler Fehlertext");
  assert.ok(PROFORMA_TEXT.failed.includes("Buchung ist davon nicht betroffen"),
    "der Kunde muss lesen, dass seine Buchung in Ordnung ist");
  // Kein Wiederholen: ein weiterer Anlauf ändert am Serverzustand nichts. Geprüft
  // wird der CODE ohne Kommentare — ein Kommentar erklärt, er bedient nicht.
  const ohneKommentare = oberflaeche.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.ok(!/Erneut|Nochmal|Wiederholen/i.test(ohneKommentare), "kein Wiederholen-Knopf");
  // Im Nicht-verfügbar- und im Wird-erstellt-Fall gibt es überhaupt kein
  // Bedienelement — nur den Downloadknopf im Zustand `ready`.
  assert.equal(ohneKommentare.split("<button").length - 1, 1, "genau ein Knopf, und nur bei `ready`");
  // Der Fehlerfall trägt kein Rot — neben „erfolgreich gebucht" wäre das ein
  // Zweifel an der Buchung selbst.
  const failedBlock = schnitt(oberflaeche, "PROFORMA_VIEW.FAILED", "PROFORMA_TEXT.failed");
  assert.ok(!failedBlock.includes("alert-error"), "der Fehlerfall ist neutral gestaltet");
  assert.ok(failedBlock.includes("alert-info"));
});

test("13 — drei Zustände, drei Anzeigen — und nichts bei `absent`", () => {
  assert.ok(oberflaeche.includes("=== PROFORMA_VIEW.READY"), "ready → Downloadknopf");
  assert.ok(oberflaeche.includes("=== PROFORMA_VIEW.PROCESSING"), "processing → Hinweis");
  assert.ok(oberflaeche.includes("=== PROFORMA_VIEW.FAILED"), "failed → Hinweis");
  // Für `absent` gibt es bewusst KEINEN Zweig: ohne Proforma bleibt der
  // Bildschirm exakt so, wie er vor diesem Paket war.
  assert.ok(!oberflaeche.includes("PROFORMA_VIEW.ABSENT"), "ohne Proforma wird nichts gezeigt");
  assert.ok(PROFORMA_TEXT.download.startsWith("Proforma-Rechnung") && PROFORMA_TEXT.download.includes("herunterladen"));
  assert.ok(PROFORMA_TEXT.processing.includes("wird erstellt"));
  // Die Nummer kommt vom Server und wird nie erfunden.
  assert.equal(proformaDownloadLabel({ number: "PF-2026-000042" }), "Proforma-Rechnung PF-2026-000042 herunterladen");
  assert.equal(proformaDownloadLabel({}), PROFORMA_TEXT.download);
  assert.equal(proformaDownloadLabel(null), PROFORMA_TEXT.download);
});

test("14 — der Dateiname kommt vom Server, das Frontend erfindet keinen", () => {
  assert.ok(genericMod.includes("filenameFromContentDisposition("),
    "der serverseitige Dateiname wird gelesen");
  // Kein nachgebautes Namensschema, keine erfundene Belegnummer.
  assert.ok(!/PF-/.test(downloadMod) && !/PF-/.test(genericMod), "keine Proforma-Belegnummer im Frontend");
  assert.ok(!/`Proforma[-_]\$\{/.test(downloadMod), "kein zusammengebauter Belegname");
  assert.ok(downloadMod.includes('const FALLBACK_DATEINAME = "proforma-rechnung.pdf"'),
    "der Rückfall ist ein neutraler, konstanter Name");
});

test("15 — Downloadfehler sind kuratiert, nie Serverfreitext", () => {
  assert.ok(!downloadMod.includes("body.error"), "kein blind übernommener Servertext");
  assert.equal(proformaDownloadMessage(404, "PROFORMA_NOT_FOUND"), "Für diese Sendung liegt keine Proforma-Rechnung vor.");
  assert.equal(proformaDownloadMessage(409, "PROFORMA_NOT_READY"), "Die Proforma-Rechnung wird noch erstellt. Bitte versuchen Sie es in Kürze erneut.");
  assert.equal(proformaDownloadMessage(409, "PROFORMA_FAILED"), PROFORMA_TEXT.failed);
  assert.ok(proformaDownloadMessage(429, null).includes("Zu viele Anfragen"));
  for (const [status, code] of [[500, null], [500, "PROFORMA_DOCUMENT_MISSING"], [0, "IRGENDWAS"], [418, null]]) {
    const m = proformaDownloadMessage(status, code);
    assert.ok(m.includes("konnte nicht geladen werden"), `Sammelfall für ${status}/${code}`);
    assert.ok(!m.includes("PROFORMA_"), "kein Fehlercode im Kundentext");
  }
  // Ein 401/403 gehört dem zentralen Auth-Redirect und erzeugt keine Bannermeldung.
  assert.ok(handler.includes("e?.status !== 401 && e?.status !== 403"));
});

test("16 — der Download rendert nichts nach und speichert nichts zwischen", () => {
  // Ausgeliefert werden die serverseitig gespeicherten Bytes (P4/P5A). Das
  // Frontend hält davon keine Kopie: Object-URL wird im finally freigegeben.
  assert.ok(genericMod.includes("URL.revokeObjectURL(url)"), "die Object-URL wird freigegeben");
  for (const verboten of ["localStorage", "sessionStorage", "indexedDB", "base64", "dangerouslySetInnerHTML"]) {
    for (const [name, quelle] of [["downloadProforma.js", downloadMod], ["downloadDocument.js", genericMod], ["proformaDocumentView.mjs", viewModul]]) {
      assert.ok(!quelle.includes(verboten), `${verboten} hat in ${name} nichts zu suchen`);
    }
  }
  // Nur echte PDFs werden gespeichert — eine JSON-/HTML-Antwort nie.
  assert.ok(genericMod.includes('if (!contentType.startsWith("application/pdf")) throw'));
});
