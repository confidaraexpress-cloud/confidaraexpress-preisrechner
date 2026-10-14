// UX-Paket 2 — Adminnavigation: gruppierte Sidebar, Teilnavigation des
// Partnerprogramms, reduzierte Partnerliste und Rückwege zur Herkunft.
// Quelltextanker: dieselben Routen, keine neue Datenabfrage ohne Serverzähler.
//
// Run: node --test src/utils/adminNavigation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listLoginNotice, pendingApplicationsText } from "./adminSalesPartnerView.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const seite = (f) => ohneKommentare(read(`../pages/admin/${f}`));

const ZIELE = ["/admin", "/admin/users", "/admin/partners", "/admin/shipments", "/admin/invoices",
  "/admin/support-requests", "/admin/cancellation-requests", "/admin/reconciliation",
  "/admin/invoices/backfill", "/admin/audit-logs"];

test("1 — Sidebar: vier benannte Gruppen, jedes bisherige Ziel genau einmal, `end`-Regeln unverändert", () => {
  const src = ohneKommentare(read("../components/layout/AdminSidebar.jsx"));
  const gruppen = [...src.matchAll(/label: "([^"]+)",\s*\n\s*items:/g)].map((m) => m[1]);
  assert.deepEqual(gruppen, ["Kunden und Partner", "Versand und Rechnungen", "Support und Bearbeitung", "Verwaltung und Protokoll"]);
  const ziele = [...src.matchAll(/\{ to: "(\/admin[^"]*)", label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...ziele].sort(), [...ZIELE].sort(), "ein Ziel fehlt oder ist doppelt");
  assert.match(src, /\{ to: "\/admin", label: "Übersicht", end: true \}/);
  assert.match(src, /\{ to: "\/admin\/invoices", label: "Rechnungen", end: true \}/);
  // Klare Namen statt Technik; derselbe Eintrag wie im Supporttest.
  assert.match(src, /\{ to: "\/admin\/invoices\/backfill", label: "Interne Vorschau-PDFs" \}/);
  assert.match(src, /\{ to: "\/admin\/audit-logs", label: "Protokoll" \}/);
  assert.match(src, /\{ to: "\/admin\/support-requests", label: "Supportanfragen" \}/);
  assert.doesNotMatch(src, /Backfill"|Audit-Logs"/);
  // Gruppen sind für Screenreader benannt; kein Zähler, keine Glocke, keine neue Abfrage.
  assert.match(src, /role="group" aria-labelledby=\{id\}/);
  assert.doesNotMatch(src, /apiFetch|api\/adminApi|useEffect/);
  // Die Seitentitel heißen wie die Einträge.
  assert.match(seite("AuditLogPage.jsx"), /title=\{<>Protokoll<\/>\}/);
  assert.match(seite("AdminSalesPartnerCreditNotesPage.jsx"), /title=\{<>Gutschriften<\/>\}/);
});

test("2 — Teilnavigation: fünf Bereiche, Pre-Live nur bei `enabled: true`, keine eigene Abfrage, kein zweiter Seitenkopf", () => {
  const navi = ohneKommentare(read("../components/admin/SalesPartnerAdminNav.jsx"));
  for (const zeile of [
    '{ to: "/admin/partners", label: "Partner", id: "adm-sp-list-link", end: true }',
    '{ to: "/admin/partners/dispatch-evidence", label: "Versandnachweise", id: "adm-sp-evidence-link" }',
    '{ to: "/admin/partners/credit-notes", label: "Gutschriften", id: "adm-sp-credit-notes-link" }',
    '{ to: "/admin/partners/settings", label: "Einstellungen", id: "adm-sp-settings-link" }',
    '{ to: "/admin/partners/prelive", label: "Pre-Live-Test", id: "adm-sp-prelive-link" }',
  ]) assert.ok(navi.includes(zeile), `Eintrag fehlt: ${zeile}`);
  assert.match(navi, /preliveEnabled\(prelive && prelive\.status\) \? \[\.\.\.EINTRAEGE, PRELIVE\] : EINTRAEGE/);
  assert.doesNotMatch(navi, /apiFetch|usePreliveStatus|<PageHeader|<h1/);
  assert.match(navi, /<nav className="adm-subnav" aria-label="Bereiche des Partnerprogramms">/);

  // Auf der Liste und allen vier Unterseiten — dort ohne Zurück-Link (Geschwister, keine Kinder).
  for (const f of ["AdminSalesPartnersPage.jsx", "AdminDispatchEvidencePage.jsx", "AdminSalesPartnerCreditNotesPage.jsx",
                   "AdminSalesPartnerSettingsPage.jsx", "AdminSalesPartnerPrelivePage.jsx"]) {
    const src = seite(f);
    assert.match(src, /<SalesPartnerAdminNav prelive=\{prelive\} \/>/, `${f}: keine Teilnavigation`);
    assert.doesNotMatch(src, /backLink=/, `${f}: Zurück-Link neben der Teilnavigation`);
    assert.match(src, /const prelive = usePreliveStatus\(\);/, `${f}: Pre-Live-Stand fehlt`);
  }
  // Die Liste hat keine Kopfbuttons mehr außer „Aktualisieren".
  const liste = seite("AdminSalesPartnersPage.jsx");
  assert.doesNotMatch(liste, /className="btn btn-outline btn-sm" to="\/admin\/partners\//);
});

test("3 — Partnerliste: fünf Spalten, offene Anträge aus dem Serverzähler, Filter in der Adresse", () => {
  const liste = seite("AdminSalesPartnersPage.jsx");
  const spalten = [...liste.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(spalten, ["Partner", "Status", "Kunden", "Pakete Vormonat", "Aktion"]);
  assert.doesNotMatch(liste, /Eigensatz|Team E1|ownRatePercent|loginStatusMeta\(row\.loginStatus\)/);
  // Offene Anträge: Gesamtzähler mit pageSize 1 — kein Hochrechnen aus der Seite.
  assert.match(liste, /listAdminSalesPartners\(\{ status: "pending", page: 1, pageSize: 1 \}\)/);
  assert.match(liste, /setPendingCount\(selectListTotal\(d\)\)/);
  assert.doesNotMatch(liste, /rows\.filter\([^)]*pending/);
  // Nur bekannte Werte aus der Adresse gehen an den Server (dieselbe Allowlist wie bisher).
  assert.match(liste, /toSalesPartnerApiFilters\(\{ status: statusParam, q: qParam \}\)/);
  assert.match(liste, /setParams\(p, \{ replace: true \}\)/);
  // Hauptaktion: offener Antrag → „Antrag prüfen", sonst „Details".
  assert.match(liste, /row\.status === "pending"\s*\? <Link className="btn btn-primary btn-sm" to=\{detailPath\(row\.id\)\} state=\{from\}>Antrag prüfen<\/Link>/);
});

test("4 — Login in der Liste nur als Abweichung; Antragshinweis nur mit echtem Zähler", () => {
  assert.deepEqual(listLoginNotice({ status: "active", loginStatus: "blocked" }), ["badge-red", "Login gesperrt"]);
  assert.deepEqual(listLoginNotice({ status: "inactive", loginStatus: "blocked" }), ["badge-red", "Login gesperrt"]);
  for (const row of [{ status: "active", loginStatus: "approved" }, { status: "pending", loginStatus: "pending" },
                     { status: "rejected", loginStatus: "blocked" }, null, {}]) {
    assert.equal(listLoginNotice(row), null, JSON.stringify(row));
  }
  assert.equal(pendingApplicationsText(1), "1 Antrag wartet auf Prüfung.");
  assert.equal(pendingApplicationsText(4), "4 Anträge warten auf Prüfung.");
  for (const n of [0, -1, null, undefined, NaN, 2.5, "3"]) assert.equal(pendingApplicationsText(n), null, String(n));
});

test("5 — Detailseiten: Zurück zur Herkunft, sonst eindeutig zur Liste", () => {
  const ERWARTET = [
    ["AdminUserDetailPage.jsx", "/admin/users", "Zurück zu den Kunden"],
    ["AdminShipmentDetailPage.jsx", "/admin/shipments", "Zurück zu den Sendungen"],
    ["AdminInvoiceDetailPage.jsx", "/admin/invoices", "Zurück zu den Rechnungen"],
    ["AdminCancellationRequestDetailPage.jsx", "/admin/cancellation-requests", "Zurück zu den Stornierungsanfragen"],
    ["AdminSupportRequestDetailPage.jsx", "/admin/support-requests", "Zurück zu den Supportanfragen"],
    ["AdminReconciliationDetailPage.jsx", "/admin/reconciliation", "Zurück zur Buchungsklärung"],
    ["AdminBackfillPage.jsx", "/admin/invoices", "Zurück zu den Rechnungen"],
    ["AdminSalesPartnerDetailPage.jsx", "/admin/partners", "Zurück zu den Vertriebspartnern"],
  ];
  for (const [f, ziel, label] of ERWARTET) {
    const src = seite(f);
    assert.ok(src.includes(`const back = <AdminBackLink to="${ziel}" label="${label}" />;`), `${f}: Rückweg weicht ab`);
    assert.match(src, /backLink=\{back\}/);
    // „Übersicht" heißt im Adminbereich die Startseite — nie eine Liste.
    assert.doesNotMatch(src, /className="adm-back">\s*Zurück zur Übersicht/);
  }
  const komponente = ohneKommentare(read("../components/admin/AdminBackLink.jsx"));
  assert.match(komponente, /resolveAdminBack\(state, \{ to, label \}\)/);
  assert.match(komponente, /className="adm-back"/);
});

test("6 — Links in Detailseiten merken sich die Herkunft (nur Router-State, kein neuer Parameter)", () => {
  const STELLEN = [
    ["../pages/admin/AdminOverviewPage.jsx", /<Link to=\{view\.oldestTo\} state=\{VON_HIER\}>Ältesten Fall öffnen<\/Link>/],
    ["../pages/admin/AdminSalesPartnersPage.jsx", /to=\{detailPath\(row\.id\)\} state=\{from\}/],
    ["../pages/admin/AdminSalesPartnerCreditNotesPage.jsx", /to=\{partnerPath\(row\.partnerUserId\)\} state=\{from\}/],
    ["../pages/admin/AdminDispatchEvidencePage.jsx", /to=\{shipmentPath\(item\.shipmentId\)\} state=\{from\}/],
    ["../pages/admin/AdminSalesPartnerDetailPage.jsx", /to=\{`\/admin\/users\/\$\{encodeURIComponent\(c\.customerId\)\}`\} state=\{from\}/],
    ["../components/admin/PreliveAccountsCard.jsx", /to=\{`\/admin\/partners\/\$\{encodeURIComponent\(p\.id\)\}`\} state=\{from\}/],
    ["../components/admin/PreliveScenariosCard.jsx", /state=\{from\}/],
    ["../components/admin/SalesPartnerAttributionSection.jsx", /state=\{from\}/],
    ["../components/admin/SalesPartnerCommissionsCard.jsx", /state=\{from\}/],
  ];
  for (const [datei, muster] of STELLEN) {
    assert.match(ohneKommentare(read(datei)), muster, `${datei}: Herkunft fehlt`);
  }
  // Die Herkunft entsteht nur über returnState (Adminpfade) bzw. als feste Übersicht.
  assert.match(ohneKommentare(read("../pages/admin/AdminOverviewPage.jsx")), /const VON_HIER = \{ from: "\/admin" \};/);
});

test("7 — Übersicht: „Zu erledigen“ zuerst, Bereiche mit Vertriebspartnern, Diagnosen eingeklappt, kein Technik-Untertitel", () => {
  const src = seite("AdminOverviewPage.jsx");
  const todo = src.indexOf('id="adm-todo"');
  const kennzahlen = src.indexOf('id="adm-ov-kennzahlen"');
  const bereiche = src.indexOf('id="adm-ov-bereiche"');
  const diag = src.indexOf('<details className="adm-section adm-diag" id="adm-diag">');
  assert.ok(todo > 0 && todo < kennzahlen && kennzahlen < bereiche && bereiche < diag, "Reihenfolge der Abschnitte");
  assert.match(src, /title="Übersicht"/);
  assert.doesNotMatch(src, /serverseitig geschützt|subtitle=/);
  assert.match(src, /\{ to: "\/admin\/partners", title: "Vertriebspartner",/);
  // Leerzustand nur, wenn wirklich nichts offen, unbekannt oder ladend ist.
  assert.match(src, /gruppen\.open\.length === 0 && gruppen\.unavailable\.length === 0 && gruppen\.loading\.length === 0/);
});
