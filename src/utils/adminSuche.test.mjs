// Run: node --test src/utils/adminSuche.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SUCH_BEREICHE, SUCHE_TEXT, sucheAusAdresse, adresseAusSuche, begriffPruefen, typesFuerBereich,
  trefferAusAntwort, suchFehler, gefundenUeber,
} from "./adminSuche.mjs";

test("1 — Zustand liegt in der Adresse: zurück und neu laden behalten Begriff und Bereich", () => {
  assert.deepEqual(sucheAusAdresse("?q=Nordlicht&bereich=sendungen"), { q: "Nordlicht", bereich: "sendungen" });
  assert.deepEqual(sucheAusAdresse("?bereich=unbekannt"), { q: "", bereich: "alle" }, "unbekannter Bereich → alle");
  assert.deepEqual(sucheAusAdresse(""), { q: "", bereich: "alle" });
  assert.equal(sucheAusAdresse(`?q=${"x".repeat(150)}`).q.length, 100, "auf die Servergrenze gekürzt");
  assert.equal(adresseAusSuche({ q: "  CE-AB26-1 ", bereich: "alle" }), "?q=CE-AB26-1");
  assert.equal(adresseAusSuche({ q: "Muster", bereich: "rechnungen" }), "?q=Muster&bereich=rechnungen");
  assert.equal(adresseAusSuche({ q: "", bereich: "alle" }), "");
  for (const b of SUCH_BEREICHE) assert.deepEqual(sucheAusAdresse(adresseAusSuche({ q: "ab", bereich: b.id })), { q: "ab", bereich: b.id });
});

test("2 — Begriff wie der Server (2–100 Zeichen) und types nur aus dem Vertrag", () => {
  assert.equal(begriffPruefen(" a "), SUCHE_TEXT.zuKurz);
  assert.equal(begriffPruefen("ab"), null);
  assert.equal(begriffPruefen("x".repeat(101)), SUCHE_TEXT.zuLang);
  assert.deepEqual(SUCH_BEREICHE.map((b) => b.types), [null, "customers", "shipments", "invoices"]);
  assert.equal(typesFuerBereich("kunden"), "customers");
  assert.equal(typesFuerBereich("quatsch"), null);
});

test("3 — Treffer defensiv; Testmarken und Fundstelle nur aus der Antwort", () => {
  const t = trefferAusAntwort({
    customers: [{ id: 7, customerNumber: "90001", status: "approved", company: "Nordlicht GmbH", name: "Erika", email: "e@x.de", password: "nie" }],
    shipments: [{ id: 3, matchedBy: "tracking", maskedTrackingNumber: "1Z99…784", isTestBooking: true, orderConfirmationNumber: "CE-AB26-1" }],
    invoices: [{ id: 9, invoiceNumber: "CE-RE26-1", grossAmount: "19.99", isProductive: false }],
  });
  assert.equal(t.anzahl, 3);
  assert.deepEqual(Object.keys(t.kunden[0]).sort(), ["email", "firma", "id", "kundennummer", "name", "status"]);
  assert.equal(t.sendungen[0].gefunden, "Trackingnummer");
  assert.equal(t.sendungen[0].test, true);
  assert.equal(t.sendungen[0].tracking, "1Z99…784");
  assert.equal(t.rechnungen[0].test, true);
  assert.equal(trefferAusAntwort({ invoices: [{ id: 1, isProductive: true }] }).rechnungen[0].test, false);
  assert.equal(trefferAusAntwort({ invoices: [{ id: 1 }] }).rechnungen[0].test, false, "fehlende Marke ist keine Testmarke");
  assert.deepEqual(trefferAusAntwort(null), { kunden: [], sendungen: [], rechnungen: [], anzahl: 0 });
  assert.equal(gefundenUeber("erfunden"), null);
});

test("4 — Fehler: 429 und 400 verständlich, alles andere neutral", () => {
  assert.equal(suchFehler(429, {}), SUCHE_TEXT.zuViele);
  assert.equal(suchFehler(400, { error: "Bitte geben Sie 2 bis 100 Zeichen ein." }), "Bitte geben Sie 2 bis 100 Zeichen ein.");
  assert.equal(suchFehler(500, { error: "SQL kaputt" }), SUCHE_TEXT.fehler, "kein Serverdetail in der Oberfläche");
});

test("5 — die Seite lädt nur über searchAdmin, hält den Zustand in der Adresse und markiert Testdaten", () => {
  const seite = readFileSync(new URL("../pages/admin/AdminSuchePage.jsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../api/adminApi.js", import.meta.url), "utf8");
  assert.match(api, /export function searchAdmin\(/);
  assert.match(api, /\/admin\/search\$\{buildQuery\(/);
  assert.equal((seite.match(/searchAdmin\(/g) || []).length, 1, "genau ein Suchaufruf");
  assert.match(seite, /navigate\(\{ search: adresseAusSuche\(/, "der Zustand geht in die Adresse");
  assert.match(seite, /SUCHE_TEXT\.testbuchung/);
  assert.match(seite, /SUCHE_TEXT\.testrechnung/);
  // Eingabe ≥ 16 px am Telefon (kein Zoom beim Antippen) und eine echte Suchrolle.
  assert.match(seite, /role="search"/);
  assert.match(seite, /type="search"/);
});
