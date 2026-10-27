// Kopfsuche des Kundenbereichs (Premium-Redesign, Vorschau-Parität A/B): Suchlogik, Grenzen und Übergaben.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUCHE_MIN_ZEICHEN, SUCHE_TEXTE, SUCHE_TREFFER_JE_ART, adressSucheStart, adressTreffer, listeMitFokus, suchFokus,
  suchForm, suchTreffer, suchZiel, suchbegriff, sucheRechnungen, sucheSendungen,
} from "./kundenSuche.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (...t) => fs.readFileSync(path.join(SRC, ...t), "utf8");

const SENDUNGEN = [
  { id: 1, order_confirmation_number: "CE-AB26-00041", tracking_references: ["1Z999AA10123456784"], reference_number: "PO-118",
    recipient_address: { company: "Alpen Handels GmbH", fullName: "Lukas Huber", city: "Wien", postalCode: "1070" } },
  { id: 2, order_confirmation_number: "CE-AB26-00042", tracking_number: "00340434161094041",
    recipient_address: { company: "Atelier Lumière SARL", city: "Paris" } },
  { id: 3, order_confirmation_number: null, tracking_number: null, recipient_address: null },
];

test("1 — erst ab zwei Zeichen; Groß-/Kleinschreibung, Akzente und Leerraum zählen nicht", () => {
  assert.equal(SUCHE_MIN_ZEICHEN, 2);
  assert.equal(suchbegriff(""), "");
  assert.equal(suchbegriff(" a "), "");
  assert.equal(suchbegriff("  Wi "), "wi");
  assert.equal(suchForm("Atelier  LUMIÈRE"), "atelier lumiere");
  assert.equal(suchForm(null), "");
});

test("2 — Sendungen: Auftragsbestätigung, Trackingnummer, Referenz und Empfänger", () => {
  const nr = (b) => sucheSendungen(SENDUNGEN, suchbegriff(b)).map((t) => t.id);
  assert.deepEqual(nr("ab26-00041"), [1]);
  assert.deepEqual(nr("1z999aa1"), [1], "Trackingreferenz");
  assert.deepEqual(nr("00340434"), [2], "Einzel-Trackingnummer");
  assert.deepEqual(nr("PO-118"), [1], "eigene Referenz");
  assert.deepEqual(nr("wien"), [1]);
  assert.deepEqual(nr("lumiere"), [2], "ohne Akzent gefunden");
  assert.deepEqual(nr("1070"), [1], "Postleitzahl");
  assert.deepEqual(nr("CE-AB26"), [1, 2]);
  assert.deepEqual(nr("gibtsnicht"), []);
  const [t] = sucheSendungen(SENDUNGEN, suchbegriff("wien"));
  assert.equal(t.titel, "CE-AB26-00041");
  assert.equal(t.text, "Alpen Handels GmbH, Wien");
  assert.equal(t.objekt, SENDUNGEN[0], "das Listenobjekt reist mit");
});

test("3 — Rechnungen nach Belegnummer; Adressen aus der Adressbuchsuche", () => {
  const rechnungen = [{ id: 7, invoice_number: "CE-RE26-00012", gross_amount: 13.19 }, { id: 8, invoice_number: "CE-TEST-RE26-00003" }, { id: 9 }];
  assert.deepEqual(sucheRechnungen(rechnungen, suchbegriff("re26-0001")).map((t) => t.id), [7]);
  assert.equal(sucheRechnungen(rechnungen, suchbegriff("re26-0001"))[0].betrag, 13.19);
  assert.deepEqual(sucheRechnungen(rechnungen, suchbegriff("test")).map((t) => t.id), [8]);
  const adressen = adressTreffer([{ id: 4, company: "Nordhafen Technik GmbH", firstName: "Jana", lastName: "Petersen", city: "Hamburg" },
    { id: 5, firstName: "Max", lastName: "Muster", city: "Köln" }, null]);
  assert.deepEqual(adressen.map((a) => [a.titel, a.text]), [["Nordhafen Technik GmbH", "Jana Petersen, Hamburg"], ["Max Muster", "Köln"]]);
});

test("4 — höchstens acht Treffer in fester Reihenfolge: Sendungen, Rechnungen, Adressen", () => {
  const viele = (art, n) => Array.from({ length: n }, (_, i) => ({ art, id: i }));
  const t = suchTreffer({ sendungen: viele("sendung", 9), rechnungen: viele("rechnung", 9), adressen: viele("adresse", 9) });
  assert.equal(t.length, SUCHE_TREFFER_JE_ART.sendung + SUCHE_TREFFER_JE_ART.rechnung + SUCHE_TREFFER_JE_ART.adresse);
  assert.ok(t.length <= 8);
  assert.deepEqual([...new Set(t.map((x) => x.art))], ["sendung", "rechnung", "adresse"]);
});

test("5 — ein Treffer führt in seinen Bereich; die Liste zeigt ihn, auch wenn er nicht geladen war", () => {
  assert.equal(suchZiel({ art: "sendung" }), "shipments");
  assert.equal(suchZiel({ art: "rechnung" }), "invoices");
  assert.equal(suchZiel({ art: "adresse" }), "addressbook");
  assert.equal(suchZiel({ art: "unbekannt" }), null);
  const fokus = suchFokus({ art: "sendung", id: 99, titel: "x", objekt: { id: 99 } });
  assert.deepEqual(fokus, { art: "sendung", id: 99, objekt: { id: 99 } });
  assert.deepEqual(listeMitFokus([{ id: 1 }], fokus).map((s) => s.id), [99, 1], "nicht geladen: vorn");
  assert.deepEqual(listeMitFokus([{ id: 1 }, { id: 99 }], fokus).map((s) => s.id), [1, 99], "geladen: an seinem Platz, nie doppelt");
  assert.deepEqual(listeMitFokus([{ id: 1 }], null).map((s) => s.id), [1]);
});

test("6 — ein Adresstreffer öffnet das Adressbuch im Reiter seiner Rolle mit Firma oder Name als Suche", () => {
  assert.deepEqual(adressSucheStart({ art: "adresse", objekt: { role: "recipient", company: "Alpen Handels GmbH" } }), { tab: "recipient", q: "Alpen Handels GmbH" });
  assert.deepEqual(adressSucheStart({ art: "adresse", objekt: { role: "both", firstName: "Max", lastName: "Muster" } }), { tab: "sender", q: "Max Muster" });
  assert.equal(adressSucheStart({ art: "sendung", objekt: {} }), null);
  assert.equal(adressSucheStart(null), null);
});

test("7 — Texte ohne Rohwerte; das Laden nutzt nur die bestehenden Listen-Endpunkte und keinen Speicher", () => {
  assert.equal(SUCHE_TEXTE.keine("Wien"), "Keine Treffer für „Wien“");
  const hook = lies("hooks", "useKundenSuche.js");
  for (const pfad of ["/kunde/shipments", "/kunde/invoices"]) assert.ok(hook.includes(`"${pfad}"`), pfad);
  assert.match(hook, /getAddresses\(\{ q: eingabe, limit: 5 \}/);
  assert.doesNotMatch(hook, /localStorage|sessionStorage/);
  assert.match(hook, /\?limit=100/, "Seiten zu höchstens 100 — die Obergrenze des Servers");
  const komponente = lies("components", "layout", "KundenSuche.jsx");
  assert.match(komponente, /role="combobox"/);
  assert.match(komponente, /aria-activedescendant=/);
  assert.match(komponente, /role="listbox"/);
  // Eingebunden in jedem Seitenkopf des Kundenbereichs: Dashboard (Utility-Zeile und Übersicht) und Layout.
  assert.match(lies("pages", "DashboardPage.jsx"), /<UtilityCluster>\s*\{kopfSuche\}/);
  assert.match(lies("components", "dashboard", "Overview.jsx"), /<UtilityCluster>\s*\{suche\}/);
  assert.equal((lies("components", "layout", "DashboardLayout.jsx").match(/\{kopfSuche\}/g) || []).length, 2);
});

test("8 — zwischen Routen reist nur der Verweis; das Objekt (mit Anschrift) bleibt im Arbeitsspeicher, genau einmal", async () => {
  const { sucheUebergeben, sucheUebernehmen } = await import("./kundenSuche.mjs");
  const fokus = { art: "sendung", id: 7, objekt: { id: 7, recipient_address: { company: "Alpen Handels GmbH" } } };
  const verweis = sucheUebergeben(fokus);
  assert.deepEqual(verweis, { art: "sendung", id: 7 }, "im Router-State steht keine Anschrift");
  assert.doesNotMatch(JSON.stringify(verweis), /Alpen/);
  assert.equal(sucheUebernehmen(verweis), fokus);
  assert.equal(sucheUebernehmen(verweis), null, "ein späteres Zurück findet nichts mehr");
  sucheUebergeben(fokus);
  assert.equal(sucheUebernehmen({ art: "rechnung", id: 7 }), null, "nur zum passenden Verweis");
  assert.match(lies("components", "layout", "DashboardLayout.jsx"), /sucheFokus: sucheUebergeben\(fokus\)/);
  assert.match(lies("pages", "DashboardPage.jsx"), /useState\(\(\) => sucheUebernehmen\(location\.state\?\.sucheFokus\)\)/);
});
