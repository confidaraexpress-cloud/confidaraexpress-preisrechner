// Admin-Vereinfachung (Betreiberauftrag 2026-11-10): gemeinsame Bausteine und Seitenstruktur.
// Quelltextanker auf kommentarfreiem Code — es gibt keine React-Render-Testschicht.
//
// Run: node --test src/utils/adminSimplification.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const code = (rel) => ohneKommentare(read(rel));

test("1 — Hilfesymbol: echter Knopf mit Namen, Zustand und Bezug; Escape und Klick daneben schließen", () => {
  const tip = code("components/admin/AdminInfoTip.jsx");
  assert.match(tip, /<button\s[^>]*type="button"/);
  assert.match(tip, /aria-label=\{`Hilfe: \$\{label\}`\}/);
  assert.match(tip, /aria-expanded=\{open\}/);
  assert.match(tip, /aria-controls=\{open \? id : undefined\}/);
  // Keine dauerhafte, leere Statusregion: der Text ist nur geöffnet im DOM, direkt hinter dem Knopf.
  assert.doesNotMatch(tip, /role="status"/);
  assert.match(tip, /\{open && \(/);
  assert.match(tip, /e\.key === "Escape"/);
  assert.match(tip, /btnRef\.current\?\.focus\(\)/, "der Fokus kehrt auf den Knopf zurück");
  assert.match(tip, /"pointerdown"/, "ein Klick daneben schließt");
  assert.match(tip, /<Icon n="info"/, "Symbol aus dem eigenen Icon-System");
  assert.doesNotMatch(tip, /dangerouslySetInnerHTML|title=/);
  // Der Text bleibt im Fenster: Lage aus der Knopfposition, an beiden Rändern begrenzt.
  assert.match(tip, /Math\.min\(Math\.max\(RAND_PX/);
});

test("2 — „Auf einen Blick“: eine Definitionsliste, Einträge ohne Wert entfallen, keine Rechnung im Baustein", () => {
  const facts = code("components/admin/AdminFacts.jsx");
  assert.match(facts, /<dl className="adm-facts"/);
  assert.match(facts, /it\.value !== null && it\.value !== undefined && it\.value !== ""/);
  assert.match(facts, /<dt>\{it\.label\}<\/dt>/);
  assert.doesNotMatch(facts, /reduce\(|\+ it\.|Number\(/, "der Baustein rechnet nichts");
  // Die drei wichtigsten Detailseiten tragen die Zeile unter dem Seitenkopf — ohne doppelten Status.
  for (const [datei, id] of [["pages/admin/AdminUserDetailPage.jsx", "adm-user-facts"],
                              ["pages/admin/AdminShipmentDetailPage.jsx", "adm-ship-facts"],
                              ["pages/admin/AdminInvoiceDetailPage.jsx", "adm-inv-facts"]]) {
    const src = code(datei);
    assert.ok(src.includes(`id="${id}"`), `${datei}: keine Kennzahlenzeile`);
    assert.ok(src.indexOf("<PageHeader") < src.indexOf("<AdminFacts"), `${datei}: Zeile vor dem Seitenkopf`);
    const zeile = src.slice(src.indexOf("<AdminFacts"), src.indexOf("/>", src.indexOf("]}", src.indexOf("<AdminFacts"))));
    assert.doesNotMatch(zeile, /label: "(Status|Zahlungsstatus)"/, `${datei}: Status steht schon im Seitenkopf`);
  }
});

test("3 — Kundendetail: Gruppen Konto, Preise, Abrechnung; direkte Wege zu Sendungen und Rechnungen des Kunden", () => {
  const src = code("pages/admin/AdminUserDetailPage.jsx");
  const pos = (s) => src.indexOf(s);
  for (const id of ["adm-user-group-konto", "adm-user-group-preise", "adm-user-group-abrechnung", "adm-user-group-weiteres"]) {
    assert.ok(pos(`id="${id}"`) > 0, `Gruppe ${id} fehlt`);
  }
  assert.ok(pos('id="adm-user-group-konto"') < pos("<CustomerApprovalCard"));
  assert.ok(pos("<CustomerApprovalCard") < pos('id="adm-user-group-preise"'));
  assert.ok(pos('id="adm-user-group-preise"') < pos("<CustomerMarkupSection"));
  assert.ok(pos("<CustomerMarkupSection") < pos("<CustomerTariffMarkupSection"), "Versandtarife direkt unter dem Aufschlag");
  assert.ok(pos("<CustomerTariffMarkupSection") < pos('id="adm-user-group-abrechnung"'));
  assert.ok(pos('id="adm-user-group-abrechnung"') < pos("<BillingModeSection"));
  assert.ok(pos("<BillingModeSection") < pos('id="adm-user-group-weiteres"'));
  // Vorgefilterte Listen über den bestehenden Serverfilter user_id — der Name nur als Router-State.
  assert.match(src, /to=\{`\/admin\/shipments\?kunde=\$\{encodeURIComponent\(idOf\(u\)\)\}`\}/);
  assert.match(src, /to=\{`\/admin\/invoices\?kunde=\$\{encodeURIComponent\(idOf\(u\)\)\}`\}/);
  assert.match(src, /state=\{\{ kundeName: companyOf\(u\) \|\| nameOf\(u\) \|\| null \}\}/);
  // Keine Aktion entfällt: Freischalten, Blockieren, Anonymisieren und Löschen bleiben mit Bestätigung.
  for (const s of ["confirmApprove", "confirmBlock", "confirmAnon", "confirmDelete", "ANONYMIZE_USER", "DELETE_USER"]) {
    assert.ok(src.includes(s), `${s} fehlt`);
  }
});

test("4 — Sendungen und Rechnungen: ?kunde= gilt nur als Zahl, die Adresse folgt dem Filter ohne Verlaufseintrag", () => {
  for (const datei of ["pages/admin/AdminShipmentsPage.jsx", "pages/admin/AdminInvoicesPage.jsx"]) {
    const src = code(datei);
    assert.match(src, /const v = params\.get\("kunde"\) \|\| "";\s*return \/\^\\d\+\$\/\.test\(v\) \? v : "";/, `${datei}: Prüfung der Adresse`);
    assert.match(src, /setSearchParams\(next, \{ replace: true, state: location\.state \}\)/, `${datei}: Verlaufseintrag`);
    assert.match(src, /label: `Kunde: \$\{kundeName\}`/, `${datei}: Filterchip mit Kundennamen`);
    assert.match(src, /Es gibt keine Freitextsuche/, `${datei}: Ehrlichkeit über die fehlende Suche`);
  }
});

test("5 — Sendungsdetail: die Betriebssicht gibt es genau einmal, oben nur bei offenem Hinweis", () => {
  const src = code("pages/admin/AdminShipmentDetailPage.jsx");
  assert.equal((src.match(/id="adm-ship-ops"/g) || []).length, 1);
  assert.match(src, /const opsOben = opsNotices\.length > 0;/);
  assert.equal((src.match(/\{opsOben && opsCard\}/g) || []).length, 1);
  assert.equal((src.match(/\{!opsOben && opsCard\}/g) || []).length, 1);
  // Label und Sendungsverfolgung stehen als erste Karte — mit Bestätigungsdialog vor dem Download.
  assert.ok(src.indexOf("Label und Sendungsverfolgung") < src.indexOf('<div className="adm-card-head">Kunde</div>'));
  assert.match(src, /title="Label herunterladen"/);
});

test("6 — Rechnungsdetail: Zahlung direkt unter den Beträgen, die unumkehrbare Aktion bleibt bestätigt und benannt", () => {
  const src = code("pages/admin/AdminInvoiceDetailPage.jsx");
  const betraege = src.indexOf("Forderung und Fälligkeit");
  const zahlung = src.indexOf('id="adm-inv-payment"');
  const dokument = src.indexOf('<div className="adm-card-head">Rechnungsdokument</div>');
  assert.ok(betraege > 0 && betraege < zahlung && zahlung < dokument, "Reihenfolge Beträge → Zahlung → Dokument");
  assert.match(src, /Das kann nicht rückgängig gemacht werden\./);
  assert.match(src, /adm-irreversible-action/);
  assert.match(src, /title=\{PAY_DIALOG\.title\}/);
});
