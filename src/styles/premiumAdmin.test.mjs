// Governance für Paket E — Premium-Adminportal.
//
// Geprüft wird, dass das Adminportal keine eigene Design-, Farb-, Button-,
// Formular-, Status- oder Dialogwelt mehr führt, dass seine Dichte erhalten
// bleibt und dass die verbindlichen Grenzen (API, Routing, Berechtigungen,
// Businesslogik) unangetastet sind.
//
// Zwei Ebenen, wie im Repo etabliert:
//   A) Stylesheet — admin.css und die Musterebene.
//   B) Contract   — der Quelltext der Adminseiten und -komponenten.
//
// Run: node --test src/styles/premiumAdmin.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
// JSX: Block- und Zeilenkommentare entfernen, damit erklärende Prosa nie als
// Fund gilt (die Lektion aus Paket D).
const stripJs = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const admin = stripComments(read("./admin.css"));
const adminRoh = read("./admin.css");
const patterns = stripComments(read("./patterns.css"));
const primitives = stripComments(read("./primitives.css"));
const forms = stripComments(read("./forms.css"));
const buttons = stripComments(read("./buttons.css"));
const variables = stripComments(read("./variables.css"));
const support = stripComments(read("./support.css"));
const dashboard = stripComments(read("./dashboard.css"));

function tok(name, tiefe = 0) {
  const m = variables.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) return undefined;
  const wert = m[1].replace(/\s+/g, " ").trim();
  const verweis = wert.match(/^var\(--([\w-]+)\)$/);
  return verweis && tiefe < 5 ? tok(verweis[1], tiefe + 1) : wert;
}

const ADMIN_SEITEN = readdirSync(new URL("../pages/admin/", import.meta.url))
  .filter((f) => f.endsWith(".jsx")).sort();
const ADMIN_KOMPONENTEN = readdirSync(new URL("../components/admin/", import.meta.url))
  .filter((f) => f.endsWith(".jsx")).sort();

const seite = (f) => stripJs(read(`../pages/admin/${f}`));
const komponente = (f) => stripJs(read(`../components/admin/${f}`));
const ALLE_ADMIN_QUELLEN = [
  ...ADMIN_SEITEN.map((f) => [`pages/admin/${f}`, seite(f)]),
  ...ADMIN_KOMPONENTEN.map((f) => [`components/admin/${f}`, komponente(f)]),
  ["components/layout/AdminSidebar.jsx", stripJs(read("../components/layout/AdminSidebar.jsx"))],
  ["components/layout/AdminLayout.jsx", stripJs(read("../components/layout/AdminLayout.jsx"))],
];

/* ══════════ 1 — Foundation statt eigener Welt ═════════════════════════════ */

test("1 — das Adminportal nutzt die globale Foundation", () => {
  // Der Adminbereich steht auf derselben Ivory-Rampe wie die Kunden-Shell.
  const shell = admin.slice(admin.indexOf(".adm-shell {"), admin.indexOf(".adm-side {"));
  for (const t of ["--ce-app-bg-top", "--ce-app-bg-mid", "--ce-app-bg-bottom"]) {
    assert.ok(shell.includes(`var(${t})`), `.adm-shell liest ${t} nicht`);
  }
  // Marken-Indigo, Navy und die Statusrollen kommen aus der Foundation.
  for (const t of ["--ce-color-brand-soft", "--ce-color-brand-ink", "--ce-color-text-primary",
                   "--ce-color-surface", "--ce-color-border-subtle"]) {
    assert.ok(admin.includes(`var(${t})`), `admin.css nutzt ${t} nicht`);
  }
  // Und die Foundation ist tatsächlich die Marke.
  assert.equal(tok("ce-color-brand"), "#5367e8");
  assert.equal(tok("ce-color-text-primary"), "#111a33");
});

test("2 — admin.css enthält kein einziges Farbliteral mehr", () => {
  const treffer = [];
  for (const m of admin.matchAll(/(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))/g)) {
    treffer.push(`${admin.slice(0, m.index).split("\n").length}: ${m[1]}`);
  }
  assert.deepEqual(treffer, [], `Farbliterale in admin.css:\n  ${treffer.join("\n  ")}`);
  // Auch die Legacy-Blaualiase sind raus — der Adminbereich liest die Marke.
  for (const alt of ["var(--blue2)", "var(--blue-light)", "var(--blue3)", "var(--navy)",
                     "var(--gray50)", "var(--gray100)", "var(--danger)", "var(--radius)"]) {
    assert.equal(admin.includes(alt), false, `admin.css nutzt noch ${alt}`);
  }
});

test("3 — kein Legacy-Blau als Fläche und kein eigener Schatten", () => {
  // Jede Tiefe stammt aus der Elevationsskala.
  const erlaubt = new Set(["none", "var(--ce-elevation-0)", "var(--ce-elevation-1)",
    "var(--ce-elevation-2)", "var(--ce-elevation-3)", "var(--ce-elevation-focus-ring)"]);
  const fremd = [];
  for (const m of admin.matchAll(/box-shadow:\s*([^;}]+)/g)) {
    const wert = m[1].trim();
    // inset-Akzentkanten sind Struktur, keine Tiefe — sie tragen einen Farbtoken.
    if (wert.startsWith("inset")) {
      assert.match(wert, /var\(--ce-color-/, `inset-Kante ohne Foundation-Farbe: ${wert}`);
      continue;
    }
    if (!erlaubt.has(wert)) fremd.push(wert);
  }
  assert.deepEqual(fremd, [], `Schatten außerhalb der Elevationsskala: ${fremd.join(", ")}`);
});

test("4 — jeder Radius kommt aus der Radienskala", () => {
  const erlaubt = new Set(["var(--ce-radius-0)", "var(--ce-radius-sm)", "var(--ce-radius-md)",
    "var(--ce-radius-lg)", "var(--ce-radius-xl)", "var(--ce-radius-full)", "0", "50%", "inherit"]);
  const fremd = [];
  for (const m of admin.matchAll(/border-radius:\s*([^;}]+)/g)) {
    const wert = m[1].trim();
    if (!erlaubt.has(wert)) fremd.push(wert);
  }
  assert.deepEqual(fremd, [], `Radien außerhalb der Skala: ${fremd.join(", ")}`);
});

/* ══════════ 5/6 — keine eigene Button- und Formularwelt ══════════════════ */

test("5 — es gibt keine zweite Buttonfamilie im Adminbereich", () => {
  // Die früheren Eigenbauten sind mit ihren Aufrufern verschwunden.
  for (const weg of [".adm-meta-toggle", ".adm-rowactions-trigger"]) {
    assert.equal(admin.includes(weg), false, `${weg} ist noch da`);
  }
  // Ihre Nachfolger sind echte Buttons aus dem Buttonsystem.
  const audit = seite("AuditLogPage.jsx");
  assert.match(audit, /className="btn btn-ghost btn-sm"[\s\S]{0,200}aria-expanded=\{isOpen\}/,
    "der Metadata-Umschalter ist kein Button aus dem System");
  assert.match(komponente("CustomerRowActions.jsx"), /className="btn btn-outline btn-icon btn-sm"/,
    "der Kebab-Trigger ist kein Button aus dem System");
  // Die Gefahrvariante bleibt im Buttonsystem definiert, nicht in admin.css.
  assert.match(buttons, /\.adm-btn-danger,/);
  assert.equal(/\.adm-btn-danger\s*\{/.test(admin), false, "admin.css definiert die Danger-Variante erneut");
});

test("6 — native Bedienelemente laufen auf dem Formularsystem", () => {
  for (const sel of [".adm-filter-field input", ".adm-filter-field select", ".adm-edit-select",
                     ".adm-note-input", ".adm-modal-input"]) {
    assert.ok(forms.includes(sel), `${sel} hängt nicht am Formularsystem`);
  }
  // Admin-Dichtestufe bleibt 36 px — die Dichte ist eine bewusste Entscheidung.
  assert.match(forms, /min-height:\s*var\(--ce-size-control-admin\)/);
  assert.equal(tok("ce-size-control-admin"), "36px");
  // Der Supportvermerk hat keine eigene Feldsprache mehr.
  assert.equal(/\.adm-sup-note \{[^}]*border:/.test(support), false,
    "der interne Vermerk pflegt wieder eine eigene Eingabekante");
  assert.match(seite("AdminSupportRequestDetailPage.jsx"), /className="field-input field-textarea adm-sup-note"/);
  assert.match(seite("AdminSupportRequestDetailPage.jsx"), /className="field-select adm-edit-select"/);
});

/* ══════════ 7 — deutsche Datumseingabe ══════════════════════════════════ */

test("7 — Datumsfilter sind deutsch beschriftet, ohne mm/dd/yyyy-Anmutung", () => {
  const feld = stripJs(read("../components/admin/DateField.jsx"));
  assert.match(feld, /DATE_FORMAT_HINT = "TT\.MM\.JJJJ"/);
  assert.match(feld, /lang="de"/);
  assert.match(feld, /aria-describedby=\{hintId\}/);
  // Der native Formathinweis wird ausgeblendet, solange das Feld leer und
  // unfokussiert ist — dort stand sonst „mm/dd/yyyy".
  assert.match(admin, /\.adm-datefield--empty > input:not\(:focus\)::-webkit-datetime-edit \{ opacity: 0; \}/);
  assert.match(admin, /\.adm-datefield-ph \{/);
  // Beide Seiten mit Zeitraumfilter nutzen die gemeinsame Komponente.
  for (const f of ["AuditLogPage.jsx", "AdminShipmentsPage.jsx"]) {
    assert.match(seite(f), /<DateField\b/, `${f} baut sein Datumsfeld selbst`);
    assert.equal(/<input[^>]*type="date"/.test(seite(f)), false, `${f} hat noch ein rohes Datumsfeld`);
  }
  // Der Wert bleibt ISO — der Backendvertrag ist unberührt.
  assert.match(feld, /type="date"/);
  assert.equal(/toLocaleDateString|split\("\."\)/.test(feld), false,
    "das Feld rechnet das Datumsformat um statt es zu übergeben");
});

/* ══════════ 8/9 — Zahlen und Status ═════════════════════════════════════ */

test("8 — Zahlen- und Betragsspalten stehen rechts und laufen tabellarisch", () => {
  const block = admin.match(/\.adm-num \{([^}]*)\}/)[1];
  assert.match(block, /text-align:\s*right/);
  assert.match(block, /font-variant-numeric:\s*tabular-nums/);
  assert.match(block, /font-feature-settings:\s*"tnum"/);
  // Marker auf Kopf UND Zelle.
  assert.match(seite("AdminShipmentsPage.jsx"), /<th scope="col" className="adm-num">Preis<\/th>/);
  assert.match(seite("AdminInvoicesPage.jsx"), /<th scope="col" className="adm-num">Betrag/);
  // Die Kennzahlen der Übersicht laufen ebenfalls tabellarisch.
  const metric = admin.match(/\.adm-metric-value \{([^}]*)\}/)[1];
  assert.match(metric, /font-variant-numeric:\s*tabular-nums/);
  assert.match(metric, /font-feature-settings:\s*"tnum"/);
});

test("9 — unbekannte Status zeigen nie einen rohen Backendwert", () => {
  const fallback = read("../utils/statusFallback.mjs");
  assert.match(fallback, /Unbekannter Status/);
  // Jede Adminansicht mit Statusanzeige greift auf den Fallback zurück.
  // Jede Adminansicht mit Statusanzeige bezieht den Fallback — direkt oder
  // über ihre geteilte Statusquelle (adminSupportView/adminCancellations/…).
  const MIT_STATUS = [
    ["AuditLogPage.jsx", null],
    ["AdminSupportRequestsPage.jsx", "adminSupportView.mjs"],
    ["AdminSupportRequestDetailPage.jsx", "adminSupportView.mjs"],
  ];
  for (const [f, quelle] of MIT_STATUS) {
    const direkt = /statusFallback/.test(seite(f));
    const ueberQuelle = quelle ? /statusFallback\(status\)/.test(read(`../utils/${quelle}`)) : false;
    assert.ok(direkt || ueberQuelle, `${f} kennt keinen Statusfallback`);
  }
  // Die geteilten Statusquellen liefern den Fallback ebenfalls — jede über
  // denselben Helfer, keine mit einer zweiten eigenen Fassung.
  for (const q of ["adminCancellations.mjs", "adminSupportView.mjs", "adminShipments.js"]) {
    assert.match(read(`../utils/${q}`), /statusFallback/, `${q} ohne Statusfallback`);
  }
  // Und niemand schreibt den Text ein zweites Mal fest.
  for (const q of ["adminCancellations.mjs", "adminSupportView.mjs", "adminShipments.js", "adminUsers.js"]) {
    const src = stripJs(read(`../utils/${q}`));
    assert.equal(/"Unbekannter Status"/.test(src), false, `${q}: zweite Fassung des Fallbacktextes`);
  }
});

/* ══════════ 10 — Gefahraktionen ═════════════════════════════════════════ */

test("10 — gefährliche Aktionen sind als solche erkennbar und bestätigt", () => {
  const dialog = komponente("ConfirmDialog.jsx");
  // Der Dialog kennt drei Stufen: alltäglich, unumkehrbar, gefährlich.
  assert.match(dialog, /danger \? "adm-btn-danger"/);
  assert.match(dialog, /irreversible \? "btn-outline adm-irreversible-action"/);
  assert.match(dialog, /adm-modal-icon-danger.*adm-modal-icon-warning.*adm-modal-icon-approve/s);
  // Abbrechen links, bestätigende Aktion rechts außen.
  const aktionen = dialog.slice(dialog.indexOf('className="adm-modal-actions"'));
  assert.ok(aktionen.indexOf("cancelLabel") < aktionen.indexOf("confirmLabel"),
    "Abbrechen muss vor der bestätigenden Aktion stehen");
  assert.match(patterns, /\.adm-modal-actions,[\s\S]{0,400}justify-content:\s*flex-end/,
    "die Dialogaktionen stehen nicht rechts");
  // Der Fokus liegt beim Öffnen nie auf der bestätigenden Aktion.
  assert.match(dialog, /useDialog\(\{ onClose: onCancel, closeOnEscape: !busy \}\)/);

  // „Als bezahlt markieren" ist keine normale Primäraktion mehr.
  const rechnung = seite("AdminInvoiceDetailPage.jsx");
  assert.match(rechnung, /className="btn btn-outline btn-sm adm-irreversible-action"/);
  assert.match(rechnung, /irreversible\n/, "der Zahlungsdialog ist nicht als unumkehrbar markiert");
  assert.equal(/className="btn btn-primary btn-sm" onClick=\{\(\) => \{ setPayMsg\(null\); setPayOpen\(true\)/.test(rechnung),
    false, "die Zahlungsaktion ist wieder eine normale Primäraktion");
  // Und sie läuft weiterhin ausschließlich über den Bestätigungsdialog.
  assert.match(rechnung, /\{payOpen && \(\s*<ConfirmDialog/);

  // Der rote Danger-Button bleibt zerstörenden Aktionen vorbehalten.
  const kunde = seite("AdminUserDetailPage.jsx");
  const gefahr = kunde.slice(kunde.indexOf("adm-danger-zone"));
  assert.match(gefahr, /adm-danger-button|adm-btn-danger/, "die Gefahrenzone hat keine Danger-Aktion");
});

/* ══════════ 11 — Dialoge ════════════════════════════════════════════════ */

test("11 — alle Admin-Dialoge laufen auf dem globalen Dialogsystem", () => {
  // Ein Overlayton, eine Karte, vier Breiten — definiert in patterns.css.
  assert.match(patterns, /\.adm-modal-overlay,/);
  assert.match(patterns, /\.adm-modal,/);
  assert.match(patterns, /\.adm-modal-icon \{|\.adm-modal-icon,/);
  // admin.css bringt kein eigenes Overlay und kein eigenes Dialogmaterial mit.
  assert.equal(/\.adm-modal-overlay\s*\{/.test(admin), false, "admin.css definiert ein eigenes Overlay");
  assert.equal(/\.adm-modal \{[^}]*background:/.test(admin), false, "admin.css definiert eine eigene Dialogfläche");
  // Jeder Dialog im Adminbereich hat Fokusfalle, Fokusrückgabe und Escape.
  for (const [name, src] of ALLE_ADMIN_QUELLEN) {
    if (!/role="dialog"/.test(src)) continue;
    assert.match(src, /useDialog\(/, `${name}: Dialog ohne den gemeinsamen Hook`);
  }
  // Unter 480 px läuft jeder Dialog als Vollbild.
  assert.match(patterns, /@media \(max-width: 480px\)[\s\S]*?\.adm-modal,/);
});

/* ══════════ 12 — Zustände ═══════════════════════════════════════════════ */

test("12 — Lade-, Fehler- und Leerzustände kommen aus dem Zustandsmuster", () => {
  const LISTEN = ["AdminUsersPage.jsx", "AdminShipmentsPage.jsx", "AdminInvoicesPage.jsx",
                  "AdminCancellationRequestsPage.jsx", "AdminSupportRequestsPage.jsx",
                  "AuditLogPage.jsx", "AdminBackfillPage.jsx"];
  for (const f of LISTEN) {
    const src = seite(f);
    assert.match(src, /<ListSkeleton\b/, `${f}: kein Skeleton für die bekannte Listenstruktur`);
    assert.match(src, /<ErrorState\b/, `${f}: kein gemeinsamer Fehlerzustand`);
    assert.equal(/className="loading-center"/.test(src), false, `${f}: eigener Ladeblock`);
    assert.equal(/className="adm-loaderr"/.test(src), false, `${f}: eigene Fehlerfläche`);
  }
  // Zustandsflächen tragen ein Icon aus dem internen System, keine Emojis.
  const state = read("../components/ui/StateView.jsx");
  assert.match(state, /<Icon\b/);
  for (const [name, src] of ALLE_ADMIN_QUELLEN) {
    assert.equal(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u.test(src), false, `${name}: Emoji im Adminbereich`);
  }
  // Auch keine Rohzeichen als Zustandsanzeige mehr.
  assert.equal(/content:\s*"[▾▸●✓]"/.test(admin), false, "Rohzeichen als Zustandsanzeige in admin.css");
});

/* ══════════ 13 — Seitenkopf und Muster ══════════════════════════════════ */

test("13 — jede Adminseite hat genau EINEN Seitenkopf", () => {
  for (const f of ADMIN_SEITEN) {
    const src = seite(f);
    assert.match(src, /<PageHeader\b/, `${f}: kein gemeinsamer Seitenkopf`);
    assert.match(src, /variant="admin"/, `${f}: nicht die Adminvariante`);
    assert.equal((src.match(/<PageHeader\b/g) || []).length, 1, `${f}: mehr als ein Seitenkopf`);
    // Kein zweiter Seitentitel daneben.
    assert.equal(/<h1\b/.test(src), false, `${f}: eigenes <h1> neben dem Seitenkopf`);
  }
  // Im Adminportal gibt es keine Serifenschrift.
  assert.doesNotMatch(admin, /Cormorant|--ce-font-display|var\(--fd\)/);
  assert.match(patterns, /\.ce-page-header--admin \.ce-page-header-title \{[\s\S]*?var\(--ce-font-sans\)/);
});

test("14 — der Zurück-Link steht im Seitenkopf, nicht daneben", () => {
  const DETAILS = ["AdminUserDetailPage.jsx", "AdminShipmentDetailPage.jsx",
                   "AdminInvoiceDetailPage.jsx", "AdminCancellationRequestDetailPage.jsx",
                   "AdminSupportRequestDetailPage.jsx", "AdminBackfillPage.jsx"];
  for (const f of DETAILS) {
    const src = seite(f);
    assert.match(src, /backLink=\{back\}/, `${f}: der Zurück-Link hängt nicht am Seitenkopf`);
  }
  // Eine Regel für beide Klassennamen.
  assert.match(patterns, /\.ce-page-header-back,\s*\n\.adm-back \{/);
  assert.equal(/\.adm-back \{/.test(admin), false, "admin.css pflegt den Zurück-Link erneut");
});

/* ══════════ 15 — Listenmuster ═══════════════════════════════════════════ */

test("15 — jede Adminliste hat eine mobile Kartenansicht", () => {
  const LISTEN = [
    ["AdminUsersPage.jsx", "adm-users-cards", "adm-users-table"],
    ["AdminShipmentsPage.jsx", "adm-ships-cards", "adm-ships-table"],
    ["AdminInvoicesPage.jsx", "adm-inv-cards", "adm-inv-table"],
    ["AdminCancellationRequestsPage.jsx", "adm-canc-cards", "adm-canc-table"],
    ["AdminSupportRequestsPage.jsx", "adm-sup-cards", "adm-sup-table"],
    ["AuditLogPage.jsx", "adm-audit-cards", "adm-audit-table"],
    ["AdminBackfillPage.jsx", "adm-bf-cards", "adm-bf-table"],
  ];
  const alleCss = admin + support;
  for (const [f, karten, tabelle] of LISTEN) {
    assert.match(seite(f), new RegExp(karten), `${f}: keine Kartenansicht im Markup`);
    assert.match(alleCss, new RegExp(`\\.${karten} \\{ display: none`), `${karten}: kein Umschalter`);
    assert.match(alleCss, new RegExp(`\\.${tabelle} \\{ display: none`), `${tabelle}: bleibt mobil sichtbar`);
  }
  // Alle Mobilkarten teilen EIN Material.
  assert.match(patterns, /\.ce-list-card,\s*\n\.adm-ucard,\s*\n\.adm-scard \{/);
  assert.equal(/\.adm-ucard \{[^}]*background:/.test(admin), false, "adm-ucard pflegt wieder eigenes Material");
  assert.equal(/\.adm-scard \{[^}]*background:/.test(admin), false, "adm-scard pflegt wieder eigenes Material");
});

test("16 — die Kundensuche bleibt ehrlich beschriftet", () => {
  const src = seite("AdminUsersPage.jsx");
  // Sie durchsucht ausschließlich die geladene Seite — das steht dran.
  assert.match(src, /Diese Seite durchsuchen/);
  assert.match(src, /Durchsucht nur die aktuell angezeigte Seite/);
  // Und sie wurde nicht heimlich zu einer Serverabfrage erweitert.
  assert.match(src, /const filtered = useMemo\(\(\) => filterCustomerRows\(rows, filters\), \[rows, filters\]\);/);
  const api = read("../api/adminApi.js");
  assert.match(api, /const USER_PARAMS = \["limit", "offset"\];/,
    "GET /admin/users hat neue Query-Parameter bekommen");
});

/* ══════════ 17 — Adminübersicht ═════════════════════════════════════════ */

test("17 — die Übersicht zeigt nur belegte Werte und erfindet keine API", () => {
  const modell = stripJs(read("../utils/adminOverview.mjs"));
  const seiteSrc = seite("AdminOverviewPage.jsx");
  // Jede Kennzahl stammt aus einem bereits vorhandenen Listen-Endpunkt.
  assert.match(seiteSrc, /listAdminUsers|listAdminInvoices|listAdminCancellationRequests|listAdminSupportRequests/);
  assert.match(seiteSrc, /pageSize: 1/, "die Kennzahlen laden ganze Seiten statt nur den Zähler");
  // Ohne Serverzähler wird nichts hochgerechnet.
  assert.match(modell, /ADMIN_TOTAL_UNAVAILABLE = "Anzahl nicht verfügbar"/);
  assert.match(modell, /state: "unavailable"/);
  assert.equal(/rows\.length|\.length \* |estimate|schätz/i.test(modell), false,
    "eine Kennzahl wird hochgerechnet statt gelesen");
  // Offene Freischaltungen sind bewusst zurückgestellt (kein Serverfilter).
  assert.match(read("../utils/adminOverview.mjs"), /offene Freischaltungen/i,
    "die zurückgestellte Kennzahl ist nicht dokumentiert");
  // GET /admin/users kennt laut Backend-Vertrag (USER_PARAMS) keinen
  // Statusfilter — nur die customers-Kennzahl selbst darf das prüfen; ein
  // anderer Metrik-Eintrag (z. B. cancellations) darf durchaus "pending" als
  // eigenen, gültigen Statuswert tragen.
  const customersBlock = modell.match(/\{\s*key: "customers",[\s\S]*?\n {2}\},/);
  assert.ok(customersBlock, "customers-Kennzahl nicht gefunden");
  assert.equal(/status/.test(customersBlock[0]), false,
    "es wird ein Statusfilter für /admin/users gesendet, den es nicht gibt");
});

/* ══════════ 18 — die Grenzen bleiben unangetastet ═══════════════════════ */

test("18 — weder API noch Routing noch Businesslogik wurden verändert", () => {
  const api = read("../api/adminApi.js");
  // Alle Endpunkte und ihre Methoden unverändert.
  const ENDPUNKTE = [
    ["/admin/audit-logs", "GET"], ["/admin/shipments", "GET"], ["/admin/users", "GET"],
    ["/admin/users/${encodeURIComponent(userId)}/price-markup", "PUT"],
    ["/admin/invoices", "GET"], ["/admin/cancellation-requests", "GET"],
    ["/admin/support-requests", "GET"], ["/admin/invoices/production-readiness", "GET"],
    ["/admin/invoices/backfill-preview", "GET"],
  ];
  for (const [pfad] of ENDPUNKTE) {
    assert.ok(api.includes(pfad), `Endpunkt ${pfad} fehlt`);
  }
  // Zahlungs-, Anonymisierungs- und Backfill-Verträge sind unberührt.
  assert.match(api, /const SETTABLE_USER_STATUS = \["pending", "approved", "blocked"\];/);
  assert.match(api, /const ANONYMIZE_CONFIRM = "ANONYMIZE_USER";/);
  assert.match(api, /body: JSON\.stringify\(\{ confirm: true \}\)/);
  assert.match(api, /`\/admin\/invoices\/\$\{encodeURIComponent\(id\)\}\/paid`/);
  // Kein Adminaufruf umgeht apiFetch.
  assert.equal(/\bfetch\(/.test(api.replace(/apiFetch/g, "")), false, "direkter fetch in adminApi.js");
  for (const [name, src] of ALLE_ADMIN_QUELLEN) {
    assert.equal(/\bfetch\(/.test(src.replace(/apiFetch/g, "")), false, `${name}: direkter fetch`);
  }
  // Routing: die Adminrouten sind unverändert.
  const app = stripJs(read("../App.jsx"));
  for (const r of ["/admin", "/admin/users", "/admin/users/:id", "/admin/shipments",
                   "/admin/shipments/:id", "/admin/invoices", "/admin/invoices/backfill",
                   "/admin/invoices/:id", "/admin/cancellation-requests",
                   "/admin/support-requests", "/admin/audit-logs"]) {
    assert.ok(app.includes(`"${r}"`), `Route ${r} fehlt`);
  }
  assert.match(app, /<AdminRoute><AdminLayout \/><\/AdminRoute>/, "das Admin-Gate wurde verändert");
});

/* ══════════ 19 — Sicherheit und Datenschutz ═════════════════════════════ */

test("19 — Maskierung, Datenschutz-Gates und Logging bleiben unverändert", () => {
  // Kein Logging von Antwortdaten oder Tokens.
  for (const [name, src] of ALLE_ADMIN_QUELLEN) {
    assert.equal(/console\.(log|info|debug|warn)\(/.test(src), false, `${name}: Logging im Adminbereich`);
    assert.equal(/dangerouslySetInnerHTML/.test(src), false, `${name}: dangerouslySetInnerHTML`);
  }
  // Der PII-Hinweis des Sendungsdetails ist erhalten.
  assert.match(seite("AdminShipmentDetailPage.jsx"), /adm-pii-warn/);
  // Audit-Metadaten werden weiterhin sanitisiert.
  const audit = seite("AuditLogPage.jsx");
  assert.match(audit, /function sanitizeMetadata/);
  assert.match(audit, /isSensitiveKey/);
  assert.match(audit, /\[ausgeblendet\]/);
  // Maskierte Kennungen bleiben maskiert.
  assert.match(admin, /\.adm-mask \{/);
});

/* ══════════ 20 — Dichte und Touch-Ziele ═════════════════════════════════ */

test("20 — die Admin-Dichte bleibt, die Touch-Ziele wachsen nur mobil", () => {
  // Desktop: kompakte Toolbar und kompakte Felder.
  assert.match(patterns, /\.adm-filters \{ min-height: 48px; \}/);
  assert.match(patterns, /\.ce-toolbar--admin \{ --ce-toolbar-height: 48px; \}/);
  // Mobil: 44 px für alles Bedienbare, im Drawer-Media-Block.
  const mobil = admin.slice(admin.indexOf("@media (max-width: 900px) {", admin.indexOf(".adm-shell")));
  const block = mobil.slice(mobil.indexOf(".adm-side {"), mobil.indexOf("@media (max-width: 560px)"));
  for (const sel of [".adm-nitem", ".adm-foot-btn", ".adm-side-close", ".adm-topbar-burger",
                     ".adm-page .btn", ".adm-filter-field input", ".adm-filter-field select"]) {
    assert.ok(block.includes(sel), `${sel} bekommt mobil kein 44-px-Ziel`);
  }
  assert.equal(/min-height:\s*4[0-3]px/.test(admin), false, "Touch-Ziel unter 44 px");
});

/* ══════════ 21 — Selbsttest ═════════════════════════════════════════════ */

test("21 — die Prüflogik greift tatsächlich", () => {
  // Ein eingeschmuggeltes Farbliteral müsste auffallen.
  const mitLiteral = stripComments("/* Kommentar #ffffff */\n.adm-x { color: #ff0000; }");
  assert.match(mitLiteral, /#ff0000/);
  assert.equal(/#ffffff/.test(mitLiteral), false, "Kommentare werden nicht entfernt");
  // Und ein Emoji in einer Quelle ebenfalls.
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test("Versand 🚚"), true);
  // Die Dateilisten sind nicht leer.
  assert.ok(ADMIN_SEITEN.length >= 13, `nur ${ADMIN_SEITEN.length} Adminseiten gefunden`);
  assert.ok(ADMIN_KOMPONENTEN.length >= 5, `nur ${ADMIN_KOMPONENTEN.length} Adminkomponenten gefunden`);
  // Und der Rohtext von admin.css enthält sehr wohl Kommentare (sonst prüfte
  // Test 2 eine leere Datei).
  assert.match(adminRoh, /\/\*/);
  assert.ok(admin.length > 4000, "admin.css wurde beim Entkommentieren zerlegt");
  // dashboard.css trägt die gemeinsamen Meldungstöne ohne farbigen Schatten.
  assert.equal(/\.alert-error\s*\{[^}]*box-shadow/.test(dashboard), false);
  assert.ok(primitives.includes(".adm-card,"), "die Adminkarte hängt nicht am Karten-Primitive");
});
