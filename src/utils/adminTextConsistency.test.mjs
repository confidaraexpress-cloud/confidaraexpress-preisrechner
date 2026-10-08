// UX-Paket 6 (10.8) — gezielte Textkorrekturen im übrigen Adminbereich, belegt
// durch den UX-Bericht: Protokoll ohne Englisch, „Protokoll" statt „Admin-Audit",
// Rückwege in Fehlerzuständen mit dem Namen ihrer Liste, Kundendetail in der
// Sie-Form mit „Konto", Supporthinweis passend zum Antwortformular. Die
// Fachmodule selbst bleiben unverändert — geprüft wird nur der sichtbare Text.
//
// Run: node --test src/utils/adminTextConsistency.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const adminDateien = () => [
  ...readdirSync(path.join(SRC, "pages/admin")).filter((f) => f.endsWith(".jsx")).map((f) => `pages/admin/${f}`),
  ...readdirSync(path.join(SRC, "components/admin")).filter((f) => f.endsWith(".jsx")).map((f) => `components/admin/${f}`),
];

test("1 — Protokoll: Spalten, Filter und Meldungen auf Deutsch", () => {
  const seite = ohneKommentare(read("pages/admin/AuditLogPage.jsx"));
  for (const englisch of [/>Actor</, />Target</, />Metadata</, /Actor-ID/, /Target-ID/, /Metadata (anzeigen|verbergen)/, /Audit-Logs/]) {
    assert.doesNotMatch(seite, englisch, `englischer bzw. technischer Text: ${englisch}`);
  }
  for (const label of ['actor: "Ausgeführt von"', 'target: "Betroffen"', 'details: "Details"',
    'actorFilter: "Ausgeführt von (Konto-ID)"', 'targetFilter: "Betroffenes Konto (ID)"']) {
    assert.ok(seite.includes(label), `Beschriftung fehlt: ${label}`);
  }
  assert.match(seite, /const GENERIC_ERROR = "Das Protokoll konnte nicht geladen werden\. Bitte versuchen Sie es erneut\.";/);
  // Der Filter sendet weiterhin dieselben Parameter — nur die Beschriftung ist neu.
  assert.match(seite, /actor_user_id: "",\s*target_user_id: "",/);
});

test("2 — „Protokoll“ statt „Admin-Audit“ in allen Adminseiten", () => {
  for (const datei of adminDateien()) {
    assert.doesNotMatch(ohneKommentare(read(datei)), /Admin-Audit/, `${datei}: „Admin-Audit“ statt „Protokoll“`);
  }
  // Die Navigation nennt die Seite so.
  assert.match(read("components/layout/AdminSidebar.jsx"), /\{ to: "\/admin\/audit-logs", label: "Protokoll" \}/);
});

test("3 — Rückwege in Fehlerzuständen nennen ihre Liste, „Übersicht“ meint nur /admin", () => {
  for (const datei of adminDateien()) {
    const src = ohneKommentare(read(datei));
    for (const m of src.matchAll(/<Link[^>]*to="([^"]+)"[^>]*>\s*Zurück zur Übersicht\s*<\/Link>/g)) {
      assert.equal(m[1], "/admin", `${datei}: „Zurück zur Übersicht“ führt nach ${m[1]}`);
    }
  }
  assert.match(read("pages/admin/AdminCancellationRequestDetailPage.jsx"),
    /to="\/admin\/cancellation-requests">Zurück zu den Stornierungsanfragen<\/Link>/);
  assert.match(read("pages/admin/AdminSupportRequestDetailPage.jsx"), /to="\/admin\/support-requests">Zurück zu den Supportanfragen<\/Link>/);
  assert.match(read("pages/admin/AdminReconciliationDetailPage.jsx"), /to="\/admin\/reconciliation">Zurück zur Buchungsklärung<\/Link>/);
});

test("4 — Kundendetail: „Konto“ und Sie-Form; Bestätigungswörter unverändert", () => {
  const seite = ohneKommentare(read("pages/admin/AdminUserDetailPage.jsx"));
  assert.doesNotMatch(seite, /Tippe [A-Z_]+ ein|Account (anonymisieren|wurde|war|wirklich)|Dieser Account|Anonymisiere…|Lösche…/);
  for (const text of ["Konto anonymisieren", "Konto wirklich anonymisieren?", "Dieses Konto ist bereits anonymisiert.",
    "Geben Sie zur Bestätigung ANONYMIZE_USER ein.", "Geben Sie zur Bestätigung DELETE_USER ein."]) {
    assert.ok(seite.includes(text), `Text fehlt: ${text}`);
  }
  assert.match(seite, /if \(confirmation !== "ANONYMIZE_USER"\) return;/);
  assert.match(seite, /placeholder="DELETE_USER"/);
});

test("5 — Support: der Hinweis passt zum Antwortformular derselben Seite", () => {
  const detail = ohneKommentare(read("pages/admin/AdminSupportRequestDetailPage.jsx"));
  const liste = ohneKommentare(read("pages/admin/AdminSupportRequestsPage.jsx"));
  // Früher: „Die Antwort an den Kunden erfolgt per E-Mail …" — neben „Öffentlich antworten".
  assert.doesNotMatch(detail + liste, /Beantwortung erfolgt per\s+E-Mail|erfolgt per E-Mail\s+an die unten genannte Adresse/);
  assert.match(detail, /unter „Öffentlich antworten“/);
  assert.match(detail, /htmlFor="sup-reply">Öffentlich antworten</);
  // Die Zusicherung bleibt: Status und Vermerk senden nichts an den Kunden.
  assert.match(detail, /<strong>keine<\/strong> Nachricht an den Kunden versendet/);
  assert.match(liste, /verschickt keine Nachricht an den Kunden/);
});

test("6 — Stornierungen, interne Rechnungsfunktion, Sendungen: ohne Großschreibung, Englisch und unklare Kennungen", () => {
  const storno = ohneKommentare(read("pages/admin/AdminCancellationRequestsPage.jsx"));
  assert.doesNotMatch(storno, /KEINE|Carrier-\/JUMiNGO/);
  assert.match(storno, /keine Stornierung\s+beim Carrier oder bei JUMiNGO und keine Erstattung/);
  const vorschau = ohneKommentare(read("pages/admin/AdminBackfillPage.jsx"));
  assert.doesNotMatch(vorschau, /Shipment-ID/);
  assert.equal((vorschau.match(/Sendungs-ID \(intern\)/g) || []).length, 2, "Tabelle und Karte");
  const sendungen = ohneKommentare(read("pages/admin/AdminShipmentsPage.jsx"));
  assert.match(sendungen, /<label htmlFor="f-carrier">Carrier-Kürzel<\/label>/);
  assert.match(sendungen, /<label htmlFor="f-user">Kunden-ID \(intern\)<\/label>/);
});
