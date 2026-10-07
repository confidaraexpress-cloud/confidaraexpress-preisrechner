// UX-Paket 1 (Verständlichkeit und Bedienfehler) — Adminbereich Vertriebspartner:
// Folgen von Statusaktionen, Obergrenzen, Provisionssätze, TEST-Kennzeichnung,
// keine Rohwerte und keine Technikbegriffe im sichtbaren Text.
//
// Run: node --test src/utils/adminSalesPartnerClarity.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CAP_TEXTS,
  RATE_TEXTS,
  capConfirmText,
  evidenceTrackingText,
  normalizeQueueItem,
  ratesEditable,
} from "./adminSalesPartnerView.mjs";
import { PRELIVE_TEXTS } from "./salesPartnerPrelive.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — Deaktivieren nennt die echten Folgen: keine neuen Provisionen, Login bleibt aktiv", () => {
  const karte = ohneKommentare(read("components/admin/SalesPartnerStatusCard.jsx"));
  const deaktivieren = karte.match(/deactivate: \{[\s\S]*?\n {2}\},/)[0];
  assert.match(deaktivieren, /keine neuen Provisionen/);
  assert.match(deaktivieren, /Der Login bleibt aktiv – zum Aussperren zusätzlich „Login sperren“ verwenden\./);
  assert.match(deaktivieren, /Bisherige Provisionen und Kundenzuordnungen bleiben erhalten\./);
  assert.doesNotMatch(deaktivieren, /gesperrt\b/, "Deaktivieren behauptet keine Login-Sperre");
  const reaktivieren = karte.match(/reactivate: \{[\s\S]*?\n {2}\},/)[0];
  assert.match(reaktivieren, /Der Login wird dadurch nicht verändert\./);
  assert.match(karte, /text=\{dialogText\(def, mitDatum\)\}/, "Wirksamkeitstag im Text: heute bzw. das gewählte Datum");
  assert.match(karte, /"Ab dem gewählten Tag \(ohne Angabe ab heute\)" : "Ab heute"/);
});

test("2 — Login-Aktionen nur für freigegebene Partner (Server: aktiv oder inaktiv)", () => {
  const karte = ohneKommentare(read("components/admin/SalesPartnerStatusCard.jsx"));
  assert.match(karte, /const LOGIN_STEUERBAR = Object\.freeze\(\["active", "inactive"\]\);/);
  assert.match(karte, /\{login === false && LOGIN_STEUERBAR\.includes\(status\) && \(/, "kein „Login entsperren“ bei einem abgelehnten Antrag");
  assert.match(karte, /\{login === true && LOGIN_STEUERBAR\.includes\(status\) && \(/);
});

test("3 — Freigabe: Teamprovision erklärt, keine Serverbegriffe; Pflicht markiert", () => {
  const karte = ohneKommentare(read("components/admin/SalesPartnerStatusCard.jsx"));
  assert.match(karte, />Grundprovision in % \(Pflicht\)</);
  assert.match(karte, />Teamprovision Ebene 1 in % \(optional\)</);
  assert.match(karte, />Teamprovision Ebene 2 in % \(optional\)</);
  assert.match(karte, /\{RATE_TEXTS\.teamExplain\}/);
  assert.match(karte, /Vorbelegt mit den Startsätzen\./, "E2E-Anker des Freigabehinweises bleibt");
  assert.doesNotMatch(karte, /des Servers|der Server/);
  assert.match(RATE_TEXTS.teamExplain, /Ebene 1 gilt für Sendungen der Kunden direkt geworbener Partner/);
  assert.match(RATE_TEXTS.teamExplain, /dieselbe Basis wie die eigene Provision/);
  assert.doesNotMatch(Object.values(RATE_TEXTS).join(" "), /Server/);
});

test("4 — Provisionssätze: neue Version nur für freigegebene Partner; Pflichtfelder markiert", () => {
  assert.equal(ratesEditable("active"), true);
  assert.equal(ratesEditable("inactive"), true);
  for (const s of ["pending", "rejected", null, undefined, "ACTIVE", ""]) assert.equal(ratesEditable(s), false, String(s));
  const karte = ohneKommentare(read("components/admin/SalesPartnerRatesCard.jsx"));
  assert.match(karte, /\{ratesEditable\(partnerStatus\) && \(/, "vor der Freigabe kein Formular, das der Server ablehnt");
  assert.match(karte, /"Grundprovision in % \(Pflicht\)"/);
  assert.match(karte, /"Teamprovision Ebene 1 in % \(Pflicht\)"/);
  assert.match(karte, /"Teamprovision Ebene 2 in % \(Pflicht\)"/);
  assert.match(karte, /aria-required="true"/);
  assert.match(karte, /label="Gültig ab \(Pflicht\)"/);
  assert.match(karte, /RATE_TEXTS\.rejected : RATE_TEXTS\.noneYet/);
  assert.doesNotMatch(karte, /Satzversion — Sätze entstehen/);
  assert.match(karte, />Grundprovision<\/th>/, "Spalte „Grundprovision“ statt „Grund“ neben „Begründung“");
  const detail = ohneKommentare(read("pages/admin/AdminSalesPartnerDetailPage.jsx"));
  assert.match(detail, /<SalesPartnerRatesCard partnerId=\{partnerId\} rates=\{detail\.rates\} partnerStatus=\{p\.status\}/);
});

test("5 — Obergrenzen: Wirkung je Grenze erklärt, Bestätigung nennt sie", () => {
  assert.equal(CAP_TEXTS.totalLabel, "Höchstsatz aller Ebenen zusammen in % (optional)");
  assert.match(CAP_TEXTS.totalEffect, /entsteht für diese Sendung keine automatische Provision/);
  assert.match(CAP_TEXTS.ownEffect, /Begrenzt den Provisionssatz für eigene Kunden/);
  assert.doesNotMatch(CAP_TEXTS.globalNote, /keine Provision/, "eine fehlende Obergrenze stoppt keine Provision");
  const beide = capConfirmText({ validFrom: "2026-10-08", maxOwnRatePercent: null, maxTotalRatePercent: "30.00" }, "für diesen Vertriebspartner");
  assert.equal(beide, `Ab 08.10.2026 gelten für diesen Vertriebspartner: Eigenprovision ohne Grenze, alle Ebenen zusammen höchstens 30,00 %. ${CAP_TEXTS.totalEffect}`);
  const nurEigen = capConfirmText({ validFrom: "2026-10-08", maxOwnRatePercent: "25.00", maxTotalRatePercent: null }, "für alle Vertriebspartner");
  assert.equal(nurEigen, "Ab 08.10.2026 gelten für alle Vertriebspartner: Eigenprovision höchstens 25,00 %, alle Ebenen zusammen ohne Grenze.");
  for (const datei of ["components/admin/SalesPartnerCapCard.jsx", "pages/admin/AdminSalesPartnerSettingsPage.jsx"]) {
    const src = ohneKommentare(read(datei));
    assert.match(src, /\{CAP_TEXTS\.totalEffect\}/, `${datei}: Wirkung am Feld`);
    assert.match(src, /\{CAP_TEXTS\.ownEffect\}/, `${datei}: Wirkung am Feld`);
    assert.match(src, /capConfirmText\(/, `${datei}: Bestätigung mit Wirkung`);
    assert.doesNotMatch(src, /Höchstsatz gesamt/, `${datei}: missverständliches „gesamt“`);
  }
});

test("6 — Testkunde im Kundendetail: TEST nur aus der Serverkennzeichnung", () => {
  const seite = ohneKommentare(read("pages/admin/AdminUserDetailPage.jsx"));
  assert.match(seite, /\{u\?\.prelive_test === true && <PreliveTestBadge id="adm-user-test-badge" \/>\}/);
  assert.doesNotMatch(seite, /prelive_test\s*(?:!=|==)[^=]|prelive_test \|\|/, "keine truthy-Auswertung der Kennzeichnung");
  assert.doesNotMatch(seite, /e\?\.message/, "kein technischer Rohtext eines Netzfehlers");
  assert.equal(PRELIVE_TEXTS.testBadge, "TEST / PRE-LIVE");
});

test("7 — Versandnachweise: Trackingstand verständlich, nie als Rohwert", () => {
  const zeile = (extra) => normalizeQueueItem({ shipmentId: 77, trackingReferences: [], ...extra });
  assert.equal(evidenceTrackingText(zeile({ lastTrackingText: "Unterwegs", lastTrackingStatus: "in_transit" })), "Unterwegs");
  assert.equal(evidenceTrackingText(zeile({ lastTrackingStatus: "delivered" })), "Zugestellt");
  assert.equal(evidenceTrackingText(zeile({ lastTrackingStatus: "INFO_RECEIVED_X" })), "Unbekannter Trackingstand");
  assert.equal(evidenceTrackingText(zeile({})), "Kein Trackingstand");
  assert.match(ohneKommentare(read("pages/admin/AdminDispatchEvidencePage.jsx")), /<span>\{evidenceTrackingText\(item\)\}<\/span>/);
});

test("8 — keine Rohwerte und keine Technikbegriffe im sichtbaren Text der Partnerverwaltung", () => {
  const provisionen = ohneKommentare(read("components/admin/SalesPartnerCommissionsCard.jsx"));
  assert.doesNotMatch(provisionen, /Technischer Grund|reasonCode/, "entry_type wird nicht roh gezeigt");
  for (const datei of ["components/admin/SalesPartnerCommissionsCard.jsx", "components/admin/SalesPartnerStatusCard.jsx",
    "components/admin/PreliveScenariosCard.jsx", "components/admin/SalesPartnerRatesCard.jsx"]) {
    const sichtbar = ohneKommentare(read(datei)).match(/"[^"\n]*"|>[^<>{}\n]+</g) || [];
    for (const t of sichtbar) {
      assert.doesNotMatch(t, /\bServer(s)?\b|\bProvider\b/, `${datei}: Technikbegriff im Text ${t}`);
    }
  }
  assert.doesNotMatch(PRELIVE_TEXTS.shipmentNote, /Provider/);
  assert.equal(PRELIVE_TEXTS.shipmentNote, "Testsendung: keine Buchung beim Versanddienstleister, kein Label.");
});
