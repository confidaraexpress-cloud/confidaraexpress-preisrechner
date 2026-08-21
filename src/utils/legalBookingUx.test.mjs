// Legal-Buchungsschranke im Checkout — Quelltext- und Verhaltenstests (Go-Live Paket 4-B).
//
// Die zwei Punkte, die diese Datei absichert:
//   1. Bei AUSGESCHALTETER Schranke verhält sich der Checkout exakt wie vorher. Das ist die
//      Voraussetzung dafür, dass P4-B überhaupt deploybar ist, solange keine freigegebenen
//      PDFs vorliegen.
//   2. Bei aktiver Schranke entscheidet der SERVER. Das Frontend zeigt an, sammelt genau zwei
//      Bestätigungen und meldet zurück, welche Fassung es gesehen hat — mehr nicht.
//
// Ausführen: node --test src/utils/legalBookingUx.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGAL_DOCUMENT_TYPES, LEGAL_LOADING, LEGAL_DISABLED, LEGAL_READY, LEGAL_ERROR,
  LEGAL_ERROR_TEXT, LEGAL_SET_CHANGED_TEXT,
  parseBookingContext, legalLoadingContext, legalTermsDocument,
  legalGateBlocks, legalGateError, legalBookingPayload,
  isLegalSetChanged, legalSetChangedBetween,
} from "./legalBookingView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

const bookingPage  = read("../pages/BookingPage.jsx");
const termsModule  = read("../components/booking/TermsModule.jsx");
const actionModule = read("../components/booking/BookingActionModule.jsx");
const legalApi     = read("../api/legalApi.js");
const legalHook    = read("../hooks/useLegalBookingContext.js");
const viewSrc      = read("./legalBookingView.mjs");
const flowState    = read("./shippingFlowState.mjs");

const pageCode   = stripComments(bookingPage);
const termsCode  = stripComments(termsModule);
const actionCode = stripComments(actionModule);
const hookCode   = stripComments(legalHook);
const viewCode   = stripComments(viewSrc);
const apiCode    = stripComments(legalApi);

// Eine vollständige, gültige Serverantwort bei aktiver Schranke.
const antwortAn = {
  enabled: true,
  setKey: "CE-B2B-2026-08",
  documents: [
    { type: "terms", version: "2026-08", label: "Allgemeine Geschäftsbedingungen", url: "/api/legal/terms/2026-08" },
    { type: "privacy", version: "2026-08", label: "Datenschutzerklärung", url: "/api/legal/privacy/2026-08" },
    { type: "b2b_contract_information", version: "2026-08", label: "B2B-Vertragsinformationen", url: "/api/legal/b2b_contract_information/2026-08" },
  ],
};
const ctxAn  = parseBookingContext(200, antwortAn);
const ctxAus = parseBookingContext(200, { enabled: false });

// ─── Kontextauswertung ────────────────────────────────────────────────────────────────────

test("(1) enabled:false ist eine vollständige Aussage — Checkout läuft wie bisher", () => {
  assert.equal(ctxAus.state, LEGAL_DISABLED);
  assert.equal(legalGateBlocks(ctxAus), false, "die ausgeschaltete Schranke blockiert");
  assert.equal(legalGateError(ctxAus), null);
  assert.deepEqual(legalBookingPayload(ctxAus, { agbAccepted: true, prohibitedGoodsAccepted: true }), {},
    "bei ausgeschalteter Schranke entstehen Legal-Felder im Payload");
});

test("(2) enabled:true mit vollständigem Set → drei Dokumente in fester Reihenfolge", () => {
  assert.equal(ctxAn.state, LEGAL_READY);
  assert.equal(ctxAn.setKey, "CE-B2B-2026-08");
  assert.deepEqual(ctxAn.documents.map((d) => d.type), LEGAL_DOCUMENT_TYPES);
  // Auch bei umgekehrter Serverreihenfolge bleibt die Anzeige stabil.
  const gedreht = parseBookingContext(200, { ...antwortAn, documents: [...antwortAn.documents].reverse() });
  assert.deepEqual(gedreht.documents.map((d) => d.type), LEGAL_DOCUMENT_TYPES);
});

test("(3) unvollständige oder kaputte Antwort → error, NIEMALS disabled", () => {
  const faelle = [
    ["503 nicht konfiguriert", 503, { code: "LEGAL_DOCUMENTS_NOT_CONFIGURED" }],
    ["500", 500, { error: "Fehler" }],
    ["kein Body", 200, null],
    ["ohne setKey", 200, { ...antwortAn, setKey: "" }],
    ["nur zwei Dokumente", 200, { ...antwortAn, documents: antwortAn.documents.slice(0, 2) }],
    ["Dokument ohne url", 200, { ...antwortAn, documents: [{ type: "terms", version: "2026-08" }, ...antwortAn.documents.slice(1)] }],
    ["documents kein Array", 200, { enabled: true, setKey: "X", documents: "alles gut" }],
  ];
  for (const [name, status, body] of faelle) {
    const ctx = parseBookingContext(status, body);
    assert.equal(ctx.state, LEGAL_ERROR, `${name}: erwartet error, war ${ctx.state}`);
    assert.notEqual(ctx.state, LEGAL_DISABLED, `${name}: Fail-Open — die Schranke gälte als aus`);
    assert.equal(legalGateBlocks(ctx), true, `${name}: blockiert die Bestellung nicht`);
    assert.equal(legalGateError(ctx), LEGAL_ERROR_TEXT, name);
  }
});

test("(4) während des Ladens ist die Bestellung gesperrt, aber kein Fehler sichtbar", () => {
  const ctx = legalLoadingContext();
  assert.equal(ctx.state, LEGAL_LOADING);
  assert.equal(legalGateBlocks(ctx), true, "beim Laden darf nicht bestellt werden");
  assert.equal(legalGateError(ctx), null, "während des Ladens erscheint eine Fehlermeldung");
});

// ─── Payload ──────────────────────────────────────────────────────────────────────────────

test("(5) Payload bei aktiver Schranke: setKey + GENAU zwei echte Booleans", () => {
  const p = legalBookingPayload(ctxAn, { agbAccepted: true, prohibitedGoodsAccepted: true });
  assert.deepEqual(p, {
    legalSetKey: "CE-B2B-2026-08", termsAccepted: true, prohibitedGoodsAccepted: true,
  });
  assert.equal(typeof p.termsAccepted, "boolean");
  assert.equal(typeof p.prohibitedGoodsAccepted, "boolean");
  // Kein Zeitpunkt, keine Version, keine Dokument-ID — der Server bestimmt beides selbst.
  for (const verboten of ["acceptedAt", "legalSetId", "legalDocumentIds", "version", "privacyAccepted"]) {
    assert.equal(verboten in p, false, `„${verboten}" gehört nicht in den Payload`);
  }
});

test("(6) unbestätigte Checkboxen erzeugen nie ein stilles true", () => {
  for (const wert of [undefined, null, false, "true", 1, {}]) {
    const p = legalBookingPayload(ctxAn, { agbAccepted: wert, prohibitedGoodsAccepted: wert });
    assert.equal(p.termsAccepted, false, `${JSON.stringify(wert)} wurde zu true`);
    assert.equal(p.prohibitedGoodsAccepted, false, `${JSON.stringify(wert)} wurde zu true`);
  }
});

test("(7) kein Payload aus Lade- oder Fehlerzustand", () => {
  for (const ctx of [legalLoadingContext(), parseBookingContext(503, {}), null, undefined]) {
    assert.deepEqual(legalBookingPayload(ctx, { agbAccepted: true, prohibitedGoodsAccepted: true }), {});
  }
});

// ─── Fassungswechsel ──────────────────────────────────────────────────────────────────────

test("(8) 409 LEGAL_SET_CHANGED wird eindeutig erkannt", () => {
  assert.equal(isLegalSetChanged(409, { code: "LEGAL_SET_CHANGED" }), true);
  assert.equal(isLegalSetChanged(409, { code: "PRICE_CHANGED" }), false);
  assert.equal(isLegalSetChanged(409, { code: "PICKUP_WINDOW_CHANGED" }), false);
  assert.equal(isLegalSetChanged(409, {}), false);
  assert.equal(isLegalSetChanged(400, { code: "LEGAL_SET_CHANGED" }), false);
  assert.equal(isLegalSetChanged(409, null), false);
});

test("(9) ein Setwechsel wird erkannt, ein erstes Laden nicht", () => {
  assert.equal(legalSetChangedBetween({ setKey: "CE-B2B-2026-08" }, { setKey: "CE-B2B-2026-09" }), true);
  assert.equal(legalSetChangedBetween({ setKey: "CE-B2B-2026-08" }, { setKey: "CE-B2B-2026-08" }), false);
  // Kein Vorgänger → kein Wechsel: beim ersten Laden gibt es nichts zurückzusetzen.
  assert.equal(legalSetChangedBetween({ setKey: null }, ctxAn), false);
  assert.equal(legalSetChangedBetween(null, ctxAn), false);
  // Ein Wechsel in einen Fehlerzustand löscht die Bestätigung nicht — dort blockiert bereits
  // das Gate, und ein Reset wäre nur zusätzliche Bewegung ohne Aussage.
  assert.equal(legalSetChangedBetween(ctxAn, parseBookingContext(503, {})), false);
});

test("(10) BookingPage: 409-Pfad setzt beide Checkboxen zurück, lädt neu, wiederholt NICHT", () => {
  const idx = pageCode.indexOf("isLegalSetChanged(");
  assert.ok(idx > -1, "der 409-Zweig fehlt");
  const zweig = pageCode.slice(idx, idx + 700);
  assert.match(zweig, /setAgbAccepted\(false\)/, "die AGB-Bestätigung bleibt stehen");
  assert.match(zweig, /setProhibitedGoodsAccepted\(false\)/, "die Güterbestätigung bleibt stehen");
  assert.match(zweig, /reloadLegalContext\(\)/, "die neue Fassung wird nicht geladen");
  assert.match(zweig, /setStep\(2\)/, "der Kunde wird nicht zur Bestätigungsstelle geführt");
  assert.match(zweig, /LEGAL_SET_CHANGED_TEXT/, "die Meldung fehlt");
  assert.ok(!/doBook\(\)/.test(zweig), "es wird automatisch erneut gebucht");

  // Der Zweig steht VOR den übrigen 409-Zweigen — sonst liefe er in Duplikat-/Preisdrift-Texte,
  // deren Handlungsanweisungen hier nichts reparieren.
  //
  // Anker bewusst auf `if (r.status === 409) {`: der bloße Vergleich kommt weiter oben schon
  // einmal als Ternary im Versicherungspfad vor, und ein Anker darauf misst den falschen Block.
  const status409 = pageCode.indexOf("if (r.status === 409) {");
  assert.ok(status409 > -1 && status409 < idx, "der Legal-Zweig liegt nicht im 409-Block");
  for (const spaeter of ["PICKUP_WINDOW_CHANGED", "PRICE_CHANGED", "setConflict("]) {
    assert.ok(pageCode.indexOf(spaeter, status409) > idx,
      `„${spaeter}" wird vor dem Legal-Zweig geprüft`);
  }
});

test("(11) der Setwechsel setzt auch außerhalb des 409-Falls zurück", () => {
  const idx = pageCode.indexOf("legalSetChangedBetween(");
  assert.ok(idx > -1, "der Setwechsel wird außerhalb des 409-Falls nicht beobachtet");
  const block = pageCode.slice(idx, idx + 300);
  assert.match(block, /setAgbAccepted\(false\)/);
  assert.match(block, /setProhibitedGoodsAccepted\(false\)/);
});

// ─── Anzeige: drei Dokumente, ZWEI Checkboxen ─────────────────────────────────────────────

test("(12) genau ZWEI Checkboxen — keine Consentbox für Datenschutz oder B2B", () => {
  const checkboxen = termsCode.match(/type="checkbox"/g) || [];
  assert.equal(checkboxen.length, 2, `${checkboxen.length} Checkboxen statt 2`);
  for (const verboten of ["privacyAccepted", "datenschutzAccepted", "b2bAccepted",
    "onPrivacyChange", "onB2bChange"]) {
    assert.ok(!termsCode.includes(verboten), `„${verboten}" — es entsteht eine dritte Zustimmung`);
  }
  // Und die verbotenen Beschriftungen dürfen nirgends stehen.
  assert.ok(!/akzeptiere die Datenschutz/i.test(termsCode));
  assert.ok(!/stimme der B2B-Vertragsinformation zu/i.test(termsCode));
});

test("(13) die drei Dokumente werden versioniert verlinkt", () => {
  assert.match(termsCode, /legalContext\.documents\.map/, "die Dokumentliste wird nicht gerendert");
  assert.match(termsCode, /Vertragsunterlagen/, "die Überschrift des Blocks fehlt");
  assert.match(termsCode, /Stand \{d\.version\}/, "die Fassung wird nicht angezeigt");
  // Absolute Adresse: die PDFs liegen auf der API, nicht auf der SPA-Domain.
  assert.match(termsCode, /\$\{API\}\$\{d\.url\}|API\}\$\{d\.url/, "die Dokument-URL wird nicht absolut gebildet");
  // Keine interne Kennung in der Anzeige.
  for (const verboten of ["setId", "sha256", "asset_key", "assetKey", "size_bytes"]) {
    assert.ok(!termsCode.includes(verboten), `„${verboten}" erscheint in der Anzeige`);
  }
});

test("(14) beide Bestätigungen zeigen bei aktiver Schranke auf die versionierte AGB-Fassung", () => {
  // Der bisherige Link `/agb#paragraf-8` zeigt auf die jeweils AKTUELLE Webseite; bei aktiver
  // Schranke wäre das ein beweglicher Text neben einem eingefrorenen Nachweis.
  assert.match(termsCode, /legalTermsDocument\(legalContext\)/, "das terms-Dokument wird nicht aufgelöst");
  const gueter = termsCode.slice(termsCode.indexOf("const gueterLink"));
  assert.match(gueter.slice(0, 400), /termsDoc/, "die Güterbestätigung nutzt das versionierte PDF nicht");
  // Ohne aktive Schranke bleiben die bisherigen Links erhalten.
  assert.ok(termsCode.includes('to="/agb"'), "der bisherige AGB-Link ist verschwunden");
  assert.ok(termsCode.includes('to="/agb#paragraf-8"'), "der bisherige Güter-Link ist verschwunden");
});

test("(15) kein dritter Acceptance-Typ im Frontend", () => {
  for (const src of [pageCode, termsCode, viewCode]) {
    for (const verboten of ["privacy_acceptance", "privacyAcceptance", "b2b_agreement",
      "b2bAcceptance", "acceptance_type"]) {
      assert.ok(!src.includes(verboten), `„${verboten}" — es entsteht ein dritter Typ`);
    }
  }
});

// ─── Gate und Lifecycle ───────────────────────────────────────────────────────────────────

test("(16) der Bestellknopf ist gesperrt, solange die Schranke blockiert", () => {
  assert.match(actionCode, /legalBlocksBooking/, "die Schranke erreicht den Bestellknopf nicht");
  assert.match(actionCode, /legalBlocksBooking\s*!==\s*true/, "die Sperre ist keine strikte Prüfung");
  // Und der Guard in doBook ist die zweite Hälfte.
  const doBookIdx = pageCode.indexOf("const doBook");
  assert.ok(doBookIdx > -1);
  assert.match(pageCode.slice(doBookIdx, doBookIdx + 900), /if \(legalBlocksBooking\) return;/,
    "doBook hat keinen eigenen Guard");
});

test("(17) der Kontext wird NICHT persistiert (§25/§36)", () => {
  for (const [name, src] of [["Hook", hookCode], ["View", viewCode], ["API", apiCode]]) {
    for (const verboten of ["sessionStorage", "localStorage", "shippingFlow"]) {
      assert.ok(!src.includes(verboten), `${name} persistiert den Legal-Kontext über „${verboten}"`);
    }
  }
  // Der Vorgang selbst kennt weder Set noch Bestätigungen — dieselbe Linie wie bisher.
  for (const verboten of ["legalSetKey", "legalSet", "termsAccepted", "prohibitedGoodsAccepted"]) {
    assert.ok(!stripComments(flowState).includes(verboten),
      `shippingFlowState kennt „${verboten}" — eine Einwilligung würde wiederhergestellt`);
  }
});

test("(18) es gibt KEIN zweites Featureflag im Frontend (§62)", () => {
  for (const [name, src] of [["Hook", hookCode], ["View", viewCode], ["API", apiCode],
    ["BookingPage", pageCode], ["TermsModule", termsCode]]) {
    assert.ok(!/VITE_LEGAL|import\.meta\.env\.[A-Z_]*LEGAL/.test(src),
      `${name} liest einen eigenen Legal-Schalter statt den Server zu fragen`);
  }
  // Und die Zustände kommen ausschließlich aus der Serverantwort.
  assert.match(apiCode, /\/api\/legal\/booking-context/, "der Endpunkt wird nicht aufgerufen");
});

test("(19) ein überholter Abruf überschreibt kein neueres Ergebnis", () => {
  // Nach einem 409 läuft ein zweiter Abruf, während der erste noch unterwegs sein kann.
  assert.match(hookCode, /laufNr/, "es gibt keinen Sequenzzähler");
  assert.match(hookCode, /meine !== laufNr\.current/, "die Sequenz wird nicht ausgewertet");
});

test("(20) das Frontend führt keine eigene Fassungs- oder Dokumentliste", () => {
  // Es darf keine Version, keinen Setschlüssel und keinen Dateinamen als Literal geben —
  // alles kommt aus der Serverantwort.
  for (const [name, src] of [["View", viewCode], ["Hook", hookCode], ["TermsModule", termsCode]]) {
    assert.ok(!/CE-B2B-\d{4}-\d{2}/.test(src), `${name} trägt einen Setschlüssel als Literal`);
    assert.ok(!/\d{4}-\d{2}\.pdf|AGB_ConfidaraExpress/.test(src), `${name} trägt einen Dateinamen`);
  }
  // Die Typen sind eine reine Vollständigkeits-/Reihenfolgeangabe, keine Fassungsliste.
  assert.deepEqual(LEGAL_DOCUMENT_TYPES, ["terms", "privacy", "b2b_contract_information"]);
});

test("(21) die Meldung zum Fassungswechsel nennt keine Interna", () => {
  for (const text of [LEGAL_SET_CHANGED_TEXT, LEGAL_ERROR_TEXT]) {
    assert.ok(!/\d{4}-\d{2}|CE-B2B|id\b|sha|http/i.test(text), `„${text}" verrät Interna`);
    assert.ok(text.length > 20, "die Meldung ist zu knapp, um handlungsleitend zu sein");
  }
  assert.match(LEGAL_SET_CHANGED_TEXT, /erneut/, "die Meldung sagt nicht, was zu tun ist");
});

test("(22) legalTermsDocument liefert nur bei vollständigem Kontext", () => {
  assert.equal(legalTermsDocument(ctxAn).type, "terms");
  assert.equal(legalTermsDocument(ctxAus), null);
  assert.equal(legalTermsDocument(legalLoadingContext()), null);
  assert.equal(legalTermsDocument(null), null);
});
