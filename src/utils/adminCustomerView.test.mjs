// Admin-Kundenverwaltung (Liste + Detail) — Tests zur UX-Bereinigung.
//
// Zwei Ebenen (wie im Repo etabliert, siehe noCreditDisplay.test.mjs — es gibt
// bewusst keine React-Render-Testinfrastruktur):
//   A) Verhalten: die reine Logik aus utils/adminCustomerView.mjs wird direkt
//      ausgeführt (Feldlesung, Suche/Filter, Aktionsmodell, Statustexte,
//      Lösch-Gate, Selbstschutz).
//   B) Contract: der Quelltext der beteiligten Seiten/Komponenten wird geprüft —
//      überall dort, wo die Aussage am Rendering oder am Request hängt.
// Ein Selbsttest am Ende stellt sicher, dass die Prüflogik greift.
//
// Run: node --test src/utils/adminCustomerView.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BLOCK_DIALOG,
  DEFAULT_FILTERS,
  OVERDUE_NOTE,
  PAYMENT_TERM_TEXT,
  SEARCHABLE_FIELDS,
  SELF_ACTION_REASON,
  STATUS_FILTER_OPTIONS,
  SUCCESS_MESSAGES,
  accountStatusCopy,
  activeFilterChips,
  activityMetrics,
  approvalBlockReason,
  buildCustomerMenuModel,
  customerDisplayName,
  customerFields,
  customerNumberFromDetail,
  deleteEligibility,
  filterCustomerRows,
  hasActiveFilters,
  isAdminAccount,
  isSelfAccount,
  listEmptyState,
  markupRequirementText,
  matchesQuery,
  matchesStatus,
  statusActionNote,
  statusSuccessMessage,
} from "./adminCustomerView.mjs";
import { userStatusMeta } from "./adminUsers.js";
import { canSaveMarkup, legacyApprovedNotice, selectPriceMarkup } from "./customerMarkup.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const listSrc    = stripComments(read("pages/admin/AdminUsersPage.jsx"));
const detailSrc  = stripComments(read("pages/admin/AdminUserDetailPage.jsx"));
const actionsSrc = stripComments(read("components/admin/CustomerRowActions.jsx"));
const approveSrc = stripComments(read("components/admin/CustomerApprovalCard.jsx"));
const sectionSrc = stripComments(read("components/admin/CustomerMarkupSection.jsx"));
const cssSrc     = read("styles/admin.css");

// Beispielkunden.
const ACME    = { id: 12, company_name: "ACME Logistik GmbH", name: "Anna Meier", email: "a.meier@acme.de", status: "approved", role: "customer", vat_id: "DE123456789", customer_number: "CE-K-10030", created_at: "2026-01-15T09:00:00.000Z" };
const PENDING = { id: 13, company_name: "Borner Spedition", name: "Ben Borner", email: "ben@borner.de", status: "pending", role: "customer", customer_number: "CE-K-10031" };
const BLOCKED = { id: 14, company_name: "Cargo Nord AG", name: "Cem Nord", email: "cem@cargonord.de", status: "blocked", role: "customer", customer_number: "CE-K-10032" };
const ANON    = { id: 15, status: "anonymized", role: "customer", anonymized_at: "2026-06-01T10:00:00.000Z" };
const ADMIN   = { id: 1, company_name: "ConfidaraExpress", name: "Admin", email: "admin@confidaraexpress.de", status: "approved", role: "admin", customer_number: "CE-K-10001" };
const LEGACY  = { id: 16, name: "Dora Alt", email: "dora@alt.de", status: "pending", role: "customer" }; // ohne company_name

// ═══ A) Kundenliste ══════════════════════════════════════════════════════════

test("1 — die Haupttabelle zeigt nur die fünf Übersichtsspalten", () => {
  const headers = listSrc.match(/<th scope="col"[^>]*>([^<]+)<\/th>/g) || [];
  const labels = headers.map((h) => h.replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(labels, ["Kunde", "Kontakt", "Kundennummer", "Status", "Aktion"]);
  const body = listSrc.slice(listSrc.indexOf("<tbody>"), listSrc.indexOf("</tbody>"));
  assert.equal((body.match(/<td[\s>]/g) || []).length, 5, "Zellen müssen zu den Spaltenköpfen passen");
});

test("2 — technische ID, USt-ID, Zahlungsziel und Kundenrolle sind aus der Tabelle entfernt", () => {
  for (const gone of [/<th[^>]*>ID<\/th>/, /<th[^>]*>USt-ID<\/th>/, /<th[^>]*>Zahlungsziel<\/th>/, /<th[^>]*>Rolle<\/th>/, /<th[^>]*>Registriert am<\/th>/]) {
    assert.equal(gone.test(listSrc), false, `Spalte ${gone} muss entfallen sein`);
  }
  // Die interne ID ist nicht mehr die Navigation — kein adm-idlink mehr.
  assert.equal(/adm-idlink/.test(listSrc), false, "die technische ID ist keine Navigation mehr");
  // Rolle nur noch bei Sonderkonten.
  assert.match(listSrc, /\{admin && <span className=\{`badge \$\{userRoleMeta\(f\.role\)\[0\]\}/);
  assert.equal(isAdminAccount(ADMIN), true);
  assert.equal(isAdminAccount(ACME), false);
});

test("3 — der Firmenname verlinkt in die Detailansicht, „Details“ ist die sichtbare Aktion", () => {
  assert.match(listSrc, /<Link className="adm-cust-name" to=\{detailPath\(f\.id\)\}>/);
  assert.match(listSrc, /<Link className="btn btn-outline btn-sm" to=\{detailPath\(f\.id\)\}>\s*Details\s*<\/Link>/);
  assert.match(listSrc, /const detailPath = \(id\) => `\/admin\/users\/\$\{encodeURIComponent\(id\)\}`;/);
  // Fehlt die Firma, steht dort ein klarer Hinweis statt einer leeren Zelle.
  assert.match(listSrc, /<span className="adm-b2b-missing">Firmenname fehlt<\/span>/);
  assert.equal(customerDisplayName(LEGACY), "Dora Alt", "ohne Firma greift der Ansprechpartner");
  assert.equal(customerDisplayName(ACME), "ACME Logistik GmbH");
  assert.equal(customerDisplayName({}), "Unbekannter Kunde", "nie eine interne ID als Identität");
});

test("4 — Blockieren ist nicht mehr die dominante Zeilenaktion", () => {
  // Kein roter Zeilen-Button mehr; die Aktion liegt im Menü und ist als danger
  // markiert und durch einen Trenner abgesetzt.
  const body = listSrc.slice(listSrc.indexOf("<tbody>"), listSrc.indexOf("</tbody>"));
  assert.equal(/adm-btn-danger/.test(body), false, "keine rote Hauptaktion in der Tabellenzeile");
  assert.equal(/Blockieren/.test(body), false, "kein Blockieren-Button in der Zeile");
  const menu = buildCustomerMenuModel({ user: ACME });
  const block = menu.find((i) => i.key === "block");
  assert.ok(block, "Blockieren muss im Menü erreichbar bleiben");
  assert.equal(block.danger, true);
  assert.equal(block.separatorBefore, true, "gefährliche Aktion ist visuell getrennt");
  assert.match(actionsSrc, /adm-rowactions-item--danger/);
  assert.match(cssSrc, /\.adm-rowactions-item--danger \{ color: var\(--danger\); \}/);
});

test("5 — das Aktionsmodell folgt dem Status", () => {
  assert.deepEqual(buildCustomerMenuModel({ user: PENDING }).map((i) => i.key), ["details", "approve"]);
  assert.equal(buildCustomerMenuModel({ user: PENDING }).find((i) => i.key === "approve").label, "Kunde freischalten");
  assert.deepEqual(buildCustomerMenuModel({ user: BLOCKED }).map((i) => i.key), ["details", "approve"]);
  assert.equal(buildCustomerMenuModel({ user: BLOCKED }).find((i) => i.key === "approve").label, "Kunde reaktivieren");
  assert.deepEqual(buildCustomerMenuModel({ user: ACME }).map((i) => i.key), ["details", "block"]);
  // Anonymisierte Konten haben keine Statusaktion — mit sichtbarer Erklärung.
  assert.deepEqual(buildCustomerMenuModel({ user: ANON }).map((i) => i.key), ["details"]);
  assert.equal(statusActionNote(ANON), "Anonymisierte Konten haben keine Statusaktion.");
  assert.equal(statusActionNote(ACME), "");
  // Kein Statuswechsel per einzelnem Klick: jede Auswahl öffnet den Dialog.
  assert.match(listSrc, /const openConfirm = \(key, u\) => \{/);
  assert.match(listSrc, /setConfirm\(\{/);
  assert.equal((listSrc.match(/setAdminUserStatus\(/g) || []).length, 1, "genau ein Statusaufruf, im bestätigten Handler");
});

test("6 — Suche wirkt lokal auf der geladenen Seite und ist als solche beschriftet", () => {
  assert.match(listSrc, /<label htmlFor="u-search">Diese Seite durchsuchen<\/label>/);
  assert.match(listSrc, /placeholder="Firma, Name, E-Mail oder USt-ID"/);
  assert.match(listSrc, /Durchsucht nur die aktuell angezeigte Seite/);
  // Es werden keine Backendparameter erfunden — die Liste lädt nur limit/offset.
  assert.match(listSrc, /listAdminUsers\(\{ page, pageSize: PAGE_SIZE \}\)/);
  assert.equal(/listAdminUsers\([^)]*(query|search|status)/.test(listSrc), false, "kein erfundener Server-Filter");
  // Und die tatsächlich durchsuchten Felder entsprechen dem Platzhalter.
  assert.deepEqual([...SEARCHABLE_FIELDS], ["company", "name", "email", "vatId", "customerNumber"]);
  assert.equal(matchesQuery(ACME, "acme"), true);
  assert.equal(matchesQuery(ACME, "Meier"), true);
  assert.equal(matchesQuery(ACME, "a.meier@acme.de"), true);
  assert.equal(matchesQuery(ACME, "DE1234"), true);
  assert.equal(matchesQuery(ACME, "CE-K-10030"), true);
  assert.equal(matchesQuery(ACME, "zzz"), false);
  assert.equal(matchesQuery(ACME, ""), true, "leere Suche filtert nicht");
});

test("7 — der Statusfilter nutzt dieselben deutschen Begriffe wie die Badges", () => {
  assert.deepEqual(STATUS_FILTER_OPTIONS.map((o) => o.label), ["Alle", "Ausstehend", "Freigegeben", "Blockiert", "Anonymisiert"]);
  // Dieselbe Bezeichnung wie im Badge — keine wechselnden Begriffe.
  for (const o of STATUS_FILTER_OPTIONS.filter((x) => x.value !== "all")) {
    assert.equal(userStatusMeta(o.value)[1], o.label, `Badge und Filter müssen für ${o.value} gleich heißen`);
  }
  assert.equal(matchesStatus(ACME, "approved"), true);
  assert.equal(matchesStatus(ACME, "blocked"), false);
  assert.equal(matchesStatus(ACME, "all"), true);
  const rows = [ACME, PENDING, BLOCKED, ANON];
  assert.deepEqual(filterCustomerRows(rows, { query: "", status: "pending" }).map((r) => r.id), [13]);
  assert.deepEqual(filterCustomerRows(rows, { query: "cargo", status: "all" }).map((r) => r.id), [14]);
  assert.deepEqual(filterCustomerRows(rows, { query: "cargo", status: "approved" }).map((r) => r.id), []);
  assert.equal(filterCustomerRows(rows, DEFAULT_FILTERS).length, 4);
  assert.match(listSrc, /<label htmlFor="u-status">Status<\/label>/);
});

test("8 — aktive Filter sind sichtbar und zurücksetzbar", () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  assert.equal(hasActiveFilters({ query: "acme", status: "all" }), true);
  assert.equal(hasActiveFilters({ query: "", status: "blocked" }), true);
  const chips = activeFilterChips({ query: "acme", status: "blocked" });
  assert.deepEqual(chips.map((c) => c.key), ["query", "status"]);
  assert.equal(chips[1].label, "Status: Blockiert");
  assert.match(listSrc, /Filter zurücksetzen/);
  assert.match(listSrc, /const resetFilters = \(\) => setFilters\(DEFAULT_FILTERS\);/);
});

test("9 — Leerzustände unterscheiden „keine Kunden“ von „keine Treffer“", () => {
  const none = listEmptyState({ loadedCount: 0, filteredCount: 0, filters: DEFAULT_FILTERS });
  assert.equal(none.show, true);
  assert.equal(none.title, "Noch keine Kunden vorhanden.");
  const noHit = listEmptyState({ loadedCount: 25, filteredCount: 0, filters: { query: "zzz", status: "all" } });
  assert.equal(noHit.show, true);
  assert.equal(noHit.title, "Für diese Suche und die gewählten Filter wurden keine Kunden gefunden.");
  assert.equal(listEmptyState({ loadedCount: 25, filteredCount: 3, filters: DEFAULT_FILTERS }).show, false);
  assert.match(listSrc, /\{emptyState\.title\}/);
  assert.match(listSrc, /\{emptyState\.text\}/);
});

test("10 — Lade- und Fehlerzustand sind eindeutig und wiederholbar", () => {
  assert.match(listSrc, /Kunden werden geladen…/);
  assert.match(listSrc, /<div className="loading-center" role="status" aria-live="polite">/);
  // Der Fehlertext sagt, was fehlgeschlagen ist, und bietet eine Wiederholung.
  assert.match(listSrc, /Die Kundenliste konnte nicht geladen werden\. Bitte versuchen Sie es erneut\./);
  assert.match(listSrc, /<button type="button" className="btn btn-outline btn-sm" onClick=\{load\}>/);
  // Während des Ladens werden weder Daten noch Aktionen gezeigt (if/else-Kette).
  assert.match(listSrc, /\{loading \? \([\s\S]{0,400}\) : error \? \(/);
  // Keine rohen Backendobjekte / Stacktraces.
  assert.equal(/JSON\.stringify\(\s*(err|error|body|d)\b/.test(listSrc), false);
});

test("11 — die mobile Kartenansicht ersetzt die Tabelle ohne Seitenüberlauf", () => {
  assert.match(listSrc, /<ul className="adm-users-cards">/);
  for (const marker of [/<dt>E-Mail<\/dt>/, /<dt>Kundennummer<\/dt>/]) assert.match(listSrc, marker);
  // Firma, Ansprechpartner und Status kommen über dieselbe Zelle wie im Desktop.
  assert.match(listSrc, /<div className="adm-ucard-head">\s*<CustomerCell user=\{u\} \/>\s*<StatusBadge status=\{f\.status\} \/>/);
  assert.match(listSrc, /className="adm-ucard-actions"[\s\S]{0,300}Details/);
  // CSS: Umschaltung und Touch-Ziele.
  assert.match(cssSrc, /@media \(max-width: 820px\) \{[\s\S]*?\.adm-users-table \{ display: none; \}/);
  assert.match(cssSrc, /\.adm-users-cards \{ display: none;/);
  assert.match(cssSrc, /\.adm-ucard-actions \.btn \{ min-height: 40px;/);
  // Lange Werte brechen kontrolliert statt zu überlaufen.
  assert.match(cssSrc, /\.adm-email \{[^}]*overflow-wrap: anywhere;/);
  assert.match(cssSrc, /\.adm-cust-name \{[^}]*overflow-wrap: anywhere;/);
});

test("12 — die Tabelle erzwingt keine Mindestbreite mehr (kein horizontales Scrollen)", () => {
  // Die globale Regel `table { min-width: 480px }` wird für die Kundenliste
  // gezielt aufgehoben; die Spaltenbreiten sind relativ.
  assert.match(cssSrc, /\.adm-users-table table \{ min-width: 0; table-layout: fixed; \}/);
  const widths = cssSrc.match(/\.adm-users-table th:nth-child\(\d\)[^{]*\{ width: (\d+)%; \}/g) || [];
  assert.equal(widths.length, 5, "alle fünf Spalten haben relative Breiten");
  const sum = widths.map((w) => Number(w.match(/(\d+)%/)[1])).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100, `Spaltenbreiten müssen 100 % ergeben, sind ${sum}`);
  // Kein Scroll-Wrapper mehr um die Kundentabelle.
  assert.equal(/adm-users-table[\s\S]{0,120}table-scroll/.test(listSrc), false);
});

test("13 — Adminkonten sind gesondert behandelt (Selbstschutz)", () => {
  assert.equal(isSelfAccount(ADMIN, 1), true);
  assert.equal(isSelfAccount(ADMIN, "1"), true, "ID-Typ darf keine Rolle spielen");
  assert.equal(isSelfAccount(ACME, 1), false);
  assert.equal(isSelfAccount(ACME, null), false, "ohne bekannten Admin kein Fehlalarm");
  const own = buildCustomerMenuModel({ user: ADMIN, currentAdminId: 1 }).find((i) => i.key === "block");
  assert.equal(own.disabled, true);
  assert.equal(own.reason, SELF_ACTION_REASON);
  const other = buildCustomerMenuModel({ user: ACME, currentAdminId: 1 }).find((i) => i.key === "block");
  assert.equal(other.disabled, false);
  // Der Grund wird angezeigt, nicht verschwiegen.
  assert.match(actionsSrc, /\{item\.disabled && item\.reason && \(/);
  assert.match(actionsSrc, /className="adm-rowactions-reason">\{item\.reason\}/);
  // Die Liste kennt den angemeldeten Admin über den bestehenden AuthContext.
  assert.match(listSrc, /const \{ user: authUser \} = useAuth\(\);/);
  assert.match(listSrc, /const currentAdminId = authUser\?\.id \?\? null;/);
});

test("14 — die B2B-Sperre gilt weiterhin nur für die Freischaltung", () => {
  assert.match(approvalBlockReason(LEGACY), /Firmenname fehlt/);
  assert.equal(approvalBlockReason(ACME), "");
  const legacyApprove = buildCustomerMenuModel({ user: LEGACY }).find((i) => i.key === "approve");
  assert.equal(legacyApprove.disabled, true);
  assert.match(legacyApprove.reason, /serverseitig abgelehnt/);
  // Blockieren bleibt möglich, auch wenn Stammdaten fehlen.
  const incompleteApproved = buildCustomerMenuModel({ user: { ...LEGACY, status: "approved" } }).find((i) => i.key === "block");
  assert.equal(incompleteApproved.disabled, false);
});

// ═══ B) Kundendetailseite ════════════════════════════════════════════════════

test("15 — statusabhängige Texte: approved sagt nie „Kunde freischalten“", () => {
  const approved = accountStatusCopy("approved");
  assert.equal(approved.title, "Kunde ist freigeschaltet");
  assert.equal(approved.description, "Dieser Kunde ist freigeschaltet und kann ConfidaraExpress nutzen.");
  assert.equal(approved.actionKind, "block");
  assert.equal(/freischalten/i.test(approved.title), false, "kein Widerspruch zum tatsächlichen Status");
  // Die Karte bezieht Überschrift und Beschreibung genau daraus.
  assert.match(approveSrc, /const copy = accountStatusCopy\(g\.currentStatus\);/);
  assert.match(approveSrc, /const title = copy\.title;/);
  assert.match(approveSrc, /<p className="adm-danger-item-desc">\{copy\.description\}<\/p>/);
});

test("16 — statusabhängige Texte: blocked und pending", () => {
  const blocked = accountStatusCopy("blocked");
  assert.equal(blocked.title, "Kunde reaktivieren");
  assert.equal(blocked.description, "Dieser Kunde ist blockiert und kann derzeit keine neuen Sendungen buchen.");
  assert.equal(blocked.hint, "Vor der Reaktivierung muss ein individueller Kundenaufschlag bestätigt sein.");
  assert.equal(blocked.actionKind, "approve");
  const pending = accountStatusCopy("pending");
  assert.equal(pending.title, "Kunde freischalten");
  assert.equal(pending.hint, "Vor der Freischaltung muss ein individueller Kundenaufschlag bestätigt sein.");
  assert.equal(pending.actionKind, "approve");
  // Reaktivierung und Freischaltung sind wortgleich zum Aufschlagsbereich.
  assert.equal(markupRequirementText("blocked"), "Vor der Reaktivierung muss ein individueller Kundenaufschlag festgelegt und bestätigt werden.");
  assert.equal(markupRequirementText("pending"), "Vor der Freischaltung muss ein individueller Kundenaufschlag festgelegt und bestätigt werden.");
  assert.match(approveSrc, /markupRequirementText\(g\.currentStatus\)/);
});

test("17 — anonymisierte Konten suggerieren keine normale Reaktivierung", () => {
  const anon = accountStatusCopy("anonymized");
  assert.equal(anon.title, "Konto anonymisiert");
  assert.equal(anon.actionLabel, null, "keine Statusaktion");
  assert.equal(/reaktivier/i.test(anon.title + anon.description), false);
  // Die Karte rendert für anonymisierte Konten gar nichts.
  assert.match(approveSrc, /if \(g\.reason === "anonymized"\) return null;/);
  // Unbekannter Status kippt nicht still in eine Aktion.
  assert.equal(accountStatusCopy("was-auch-immer").actionLabel, null);
  assert.equal(accountStatusCopy(undefined).actionLabel, null);
});

test("18 — die Kundennummer wird identisch zur Liste gelesen (Mapping-Fix)", () => {
  // Gleiche Feldlesung wie in der Liste …
  assert.equal(customerFields(ACME).customerNumber, "CE-K-10030");
  assert.equal(customerNumberFromDetail({ user: ACME }, ACME), "CE-K-10030");
  // … zusätzlich tolerant, wenn der Detailendpunkt sie neben `user` führt.
  const envelope = { user: { id: 12, status: "approved" }, summary: {}, customer_number: "CE-K-10030" };
  assert.equal(customerNumberFromDetail(envelope, envelope.user), "CE-K-10030");
  assert.equal(customerNumberFromDetail({ user: {}, customerNumber: "CE-K-9" }, {}), "CE-K-9");
  // Nie erfunden, nie aus der internen ID abgeleitet.
  assert.equal(customerNumberFromDetail({ user: { id: 4711 } }, { id: 4711 }), "");
  assert.equal(customerNumberFromDetail(null, null), "");
  assert.equal(customerFields({ id: 4711 }).customerNumber, "");
  // Die Seite nutzt genau diesen Weg und zeigt sonst „—“.
  assert.match(detailSrc, /const customerNumber = customerNumberFromDetail\(detailPayload, u\);/);
  assert.match(detailSrc, /\["Kundennummer", customerNumber \|\| "—"\]/);
  assert.match(detailSrc, /Kundennummer nicht hinterlegt/, "im Kopf steht ein ehrlicher Hinweis statt einer leeren Angabe");
});

test("19 — Zahlungswerte stehen genau einmal auf der Seite", () => {
  for (const label of ["Offener Betrag", "Überfällige Rechnungen", "Offene Rechnungen", "Sendungen gesamt", "Rechnungen gesamt", "Zahlungsziel"]) {
    // genau einmal — die Werte standen vorher doppelt (Zahlung + Kennzahlen).
    const hits = (detailSrc.match(new RegExp(`label="${label}"`, "g")) || []).length;
    assert.equal(hits, 1, `„${label}" darf genau einmal vorkommen, gefunden: ${hits}`);
  }
  assert.equal(/Aggregierte Kennzahlen/.test(detailSrc), false, "die doppelte Kennzahlenkarte ist entfallen");
  assert.match(detailSrc, /<Icon n="card" s=\{17\} \/> Aktivität und Zahlung<\/div>/);
  // Eine Quelle für alle Werte.
  const m = activityMetrics({ shipments_total: 4, invoices_total: 3, invoices_unpaid: 2, invoices_overdue: 1, open_amount: "199.5" });
  assert.deepEqual(m, { shipmentsTotal: 4, invoicesTotal: 3, invoicesUnpaid: 2, invoicesOverdue: 1, openAmount: 199.5, hasOverdue: true });
  const empty = activityMetrics(undefined);
  assert.equal(empty.shipmentsTotal, null);
  assert.equal(empty.hasOverdue, false, "unbekannt ist nicht „überfällig“");
});

test("20 — überfällige Rechnungen lösen keine automatische Sperre aus", () => {
  assert.equal(activityMetrics({ invoices_overdue: 3 }).hasOverdue, true);
  assert.match(OVERDUE_NOTE, /blockieren Buchungen nicht automatisch/);
  assert.match(OVERDUE_NOTE, /ausschließlich manuell blockiert/);
  assert.match(detailSrc, /\{metrics\.hasOverdue && \(/);
  assert.match(detailSrc, /\{OVERDUE_NOTE\}/);
  // Es gibt keinerlei automatische Statusänderung wegen Rechnungen.
  assert.equal(/hasOverdue[\s\S]{0,200}setAdminUserStatus/.test(detailSrc), false);
  assert.equal(/invoices_overdue[\s\S]{0,200}blocked/.test(detailSrc), false);
  // Und das Zahlungsziel ist für alle Kunden identisch.
  assert.equal(PAYMENT_TERM_TEXT, "7 Kalendertage");
  assert.equal(/individuelle[sn]? Zahlungsziel/i.test(detailSrc), false);
});

test("21 — Löschen wird bei vorhandenen Geschäftsdaten nicht als möglich dargestellt", () => {
  const withData = deleteEligibility({ shipments_total: 5, invoices_total: 2 });
  assert.equal(withData.allowed, false);
  assert.equal(withData.reason, "Dieser Kunde kann nicht gelöscht werden, da Sendungs- oder Rechnungsdaten vorhanden sind. "
    + "Verwenden Sie bei Bedarf die Anonymisierung.");
  assert.equal(deleteEligibility({ shipments_total: 0, invoices_total: 1 }).allowed, false, "auch nur Rechnungen sperren");
  assert.equal(deleteEligibility({ shipments_total: 1, invoices_total: 0 }).allowed, false, "auch nur Sendungen sperren");
  const clean = deleteEligibility({ shipments_total: 0, invoices_total: 0 });
  assert.equal(clean.allowed, true);
  assert.equal(clean.known, true);
  // Unbekannte Zahlen sperren nicht — dort bleibt der serverseitige Guard (409).
  const unknown = deleteEligibility({});
  assert.equal(unknown.allowed, true);
  assert.equal(unknown.known, false);
  // Die Seite verdrahtet das und benennt den Grund am Button.
  assert.match(detailSrc, /const deleteGate = deleteEligibility\(summary\);/);
  assert.match(detailSrc, /disabled=\{!deleteGate\.allowed \|\| selfAccount\}/);
  assert.match(detailSrc, /aria-describedby=\{!deleteGate\.allowed \? "adm-delete-note"/);
  assert.match(detailSrc, /\{deleteGate\.reason\}/);
});

test("22 — Anonymisieren bleibt irreversibel und erhöht bestätigt", () => {
  assert.match(detailSrc, /Tippe ANONYMIZE_USER ein, um fortzufahren\./);
  assert.match(detailSrc, /disabled=\{anonBusy \|\| !confirmed\}/, "ohne exakte Eingabe kein Request");
  assert.match(detailSrc, /if \(confirmation !== "ANONYMIZE_USER"\) return;/);
  // Der Dialog erklärt Folgen, Erhalt der Belege und die Protokollierung.
  assert.match(detailSrc, /Personenbezogene Kontodaten werden entfernt\./);
  assert.match(detailSrc, /Sendungen und Rechnungen bleiben/);
  assert.match(detailSrc, /Die Aktion wird protokolliert\./);
  assert.match(detailSrc, /Diese Aktion ist irreversibel\./);
  // Kein eigenes Konto anonymisieren.
  assert.match(detailSrc, /disabled=\{isAnonymized \|\| selfAccount\}/);
});

test("23 — Blockieren läuft über einen eigenen Bestätigungsdialog", () => {
  assert.equal(BLOCK_DIALOG.title, "Kundenkonto blockieren?");
  assert.match(BLOCK_DIALOG.text, /keine neuen Sendungen mehr buchen/);
  assert.match(BLOCK_DIALOG.text, /Bestehende Sendungen und Rechnungen bleiben erhalten/);
  assert.match(BLOCK_DIALOG.text, /Die Aktion wird protokolliert/);
  assert.equal(BLOCK_DIALOG.cancel, "Abbrechen");
  assert.equal(BLOCK_DIALOG.confirm, "Kunde blockieren");
  // Detailseite: eigener Dialog, Fokus, Escape, Fokusrückgabe.
  assert.match(detailSrc, /function BlockConfirmDialog\(\{ name, busy, onCancel, onConfirm \}\)/);
  assert.match(detailSrc, /cancelRef\.current\?\.focus\(\);/);
  assert.match(detailSrc, /if \(e\.key === "Escape" && !busy\) onCancel\(\);/);
  assert.match(detailSrc, /openerRef\.current\?\.focus\?\.\(\);/);
  // Blockieren ist erreichbar, aber zurückhaltend gestaltet.
  assert.match(approveSrc, /className="btn btn-outline btn-sm adm-block-action"/);
  assert.equal(/adm-block-action[\s\S]{0,80}btn-primary/.test(approveSrc), false, "keine primäre rote Hauptaktion");
});

test("24 — Statusaktionen laufen genau einmal und melden Erfolg erst nach dem Backend", () => {
  // Doppelklickschutz über synchrone Ref-Guards.
  for (const guard of ["saveInFlight", "approveInFlight", "blockInFlight"]) {
    assert.match(detailSrc, new RegExp(`const ${guard} = useRef\\(false\\);`), `${guard} fehlt`);
    assert.match(detailSrc, new RegExp(`if \\(${guard}\\.current\\) return;`), `${guard} greift nicht`);
    assert.match(detailSrc, new RegExp(`${guard}\\.current = false;`), `${guard} wird nicht zurückgesetzt`);
  }
  assert.match(listSrc, /if \(actionBusy\) return;/);
  // Erfolgsmeldung steht IMMER hinter der erfolgreichen Antwort (nach !r.ok-Return).
  for (const src of [detailSrc, listSrc]) {
    const successPos = src.indexOf('type: "success"');
    const okGuard = src.lastIndexOf("if (!r.ok)", successPos);
    assert.ok(okGuard !== -1 && okGuard < successPos, "Erfolgsmeldung erst nach erfolgreicher Antwort");
  }
  assert.equal(statusSuccessMessage("approved", "pending"), SUCCESS_MESSAGES.approved);
  assert.equal(statusSuccessMessage("approved", "blocked"), SUCCESS_MESSAGES.reactivated);
  assert.equal(statusSuccessMessage("blocked", "approved"), SUCCESS_MESSAGES.blocked);
  assert.deepEqual(
    [SUCCESS_MESSAGES.approved, SUCCESS_MESSAGES.reactivated, SUCCESS_MESSAGES.blocked],
    ["Kunde freigeschaltet", "Kunde reaktiviert", "Kunde blockiert"],
  );
});

test("25 — Fehlermeldungen sagen, dass nichts gespeichert wurde, und zeigen keine Technik", () => {
  assert.match(listSrc, /Der Status wurde nicht geändert\. Es wurden keine Änderungen gespeichert\./);
  assert.match(detailSrc, /Der Kunde wurde nicht blockiert\. Es wurden keine Änderungen gespeichert\./);
  assert.match(listSrc, /Die Kundenliste konnte nicht geladen werden\. Bitte versuchen Sie es erneut\./);
  for (const src of [listSrc, detailSrc]) {
    assert.equal(/\.stack|JSON\.stringify\(\s*(err|error)\b/.test(src), false, "keine Stacktraces / rohen Objekte");
  }
  // 401/403 bleiben dem zentralen Auth-Verhalten überlassen.
  assert.match(detailSrc, /if \(r\.status === 401 \|\| r\.status === 403\) return;/);
  assert.match(listSrc, /if \(r\.status !== 401 && r\.status !== 403\)/);
});

test("26 — der Aufschlagsbereich bleibt fachlich unverändert und vermeidet leere Requests", () => {
  // Globaler Standardaufschlag: sachlich, kein Warnzustand.
  const n = legacyApprovedNotice({ currentStatus: "approved", pricing: selectPriceMarkup({ priceMarkupPercent: 20, confirmed: false }) });
  assert.equal(n.show, true);
  assert.equal(n.headline, "Globaler Standardaufschlag aktiv");
  assert.match(n.text, /globale Standardaufschlag/);
  assert.match(n.text, /Der Zugang bleibt bestehen/);
  assert.match(n.text, /vor einer späteren erneuten\s+Freischaltung erforderlich/);
  // Bestätigter, unveränderter Wert → kein Request.
  const confirmed = selectPriceMarkup({ priceMarkupPercent: 17.5, confirmed: true });
  assert.equal(canSaveMarkup(confirmed, "17,50"), false);
  assert.equal(canSaveMarkup(confirmed, "17,5"), false, "gleiche Zahl in anderer Schreibweise ist keine Änderung");
  assert.equal(canSaveMarkup(confirmed, "18"), true);
  // Prozentsemantik unverändert: 0,20 bleibt 0,20 %.
  assert.equal(canSaveMarkup(confirmed, "0,20"), true);
  // Die Änderungserkennung deckt seit dem Expressaufschlag BEIDE Felder ab.
  assert.match(sectionSrc, /markupFormHasChange\(pricing, draft, expressDraft\)/);
  assert.match(sectionSrc, /\{NO_CHANGE_HINT\}/);
});

test("27 — das Freischaltungs-Gate erklärt sich und führt zum Aufschlag", () => {
  assert.match(approveSrc, /explanation\.cta && typeof onJumpToMarkup === "function"/);
  assert.match(detailSrc, /onJumpToMarkup=\{focusMarkup\}/);
  assert.match(detailSrc, /markupInputRef\.current\?\.focus\?\.\(\);/);
  // Der Kopfbereich bietet die statusabhängige Hauptaktion und nennt das Gate.
  assert.match(detailSrc, /\{statusCopy\.actionKind === "approve" && \(/);
  assert.match(detailSrc, /disabled=\{approveBusy \|\| !gate\.allowed\}/);
  assert.match(detailSrc, /aria-describedby=\{!gate\.allowed \? "adm-approve-gate" : undefined\}/);
  // Für freigeschaltete Konten steht oben KEINE rote Hauptaktion.
  const header = detailSrc.slice(detailSrc.indexOf("adm-detail-header"), detailSrc.indexOf("adm-cards"));
  assert.equal(/adm-btn-danger|adm-danger-button/.test(header), false, "keine gefährliche Hauptaktion im Kopfbereich");
});

test("28 — technische Informationen sind zurückgestuft, aber verfügbar", () => {
  assert.match(detailSrc, /<details className="adm-card adm-tech">/);
  assert.match(detailSrc, /Technische Informationen/);
  for (const label of ["Interne ID", "Erstellt am", "Passwort zuletzt geändert", "Anonymisiert am", "Anonymisiert von"]) {
    assert.match(detailSrc, new RegExp(`\\["${label}"`), `${label} fehlt im technischen Bereich`);
  }
  // Natives <details> statt nachgebauter ARIA-Konstruktion.
  assert.equal(/role="button"[\s\S]{0,120}aria-expanded/.test(detailSrc), false);
  assert.match(cssSrc, /\.adm-tech > \.adm-tech-summary \{ cursor: pointer;/);
});

// ═══ C) Regression und Sicherheit ════════════════════════════════════════════

test("29 — Pricing-Endpunkte und Prozentvertrag bleiben unverändert", () => {
  const apiSrc = stripComments(read("api/adminApi.js"));
  assert.match(apiSrc, /`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/price-markup`/);
  assert.equal(/["'`]\/api\/admin\//.test(apiSrc), false, "kein /api-Präfix");
  assert.match(apiSrc, /const body = buildPriceMarkupBody\(priceMarkupPercent, expressRaw\);/);
  assert.match(apiSrc, /apiFetch\(`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/status`, \{\s*method: "PATCH",/);
  assert.match(apiSrc, /body: JSON\.stringify\(\{ status \}\),/);
});

test("30 — es wird nichts geloggt und kein Token angefasst", () => {
  const files = [
    "pages/admin/AdminUsersPage.jsx", "pages/admin/AdminUserDetailPage.jsx",
    "components/admin/CustomerRowActions.jsx", "components/admin/CustomerApprovalCard.jsx",
    "components/admin/CustomerMarkupSection.jsx", "utils/adminCustomerView.mjs",
  ];
  for (const rel of files) {
    const code = stripComments(read(rel));
    assert.equal(/console\.(log|info|warn|error|debug|table|dir)\s*\(/.test(code), false, `${rel}: kein Logging`);
    for (const forbidden of ["ce_token", "localStorage", "sessionStorage", "document.cookie"]) {
      assert.equal(code.includes(forbidden), false, `${rel}: ${forbidden} darf nicht vorkommen`);
    }
  }
  // Keine Kundendaten in URL-Queryparametern.
  assert.equal(/[?&](email|customer_number|status)=/.test(listSrc), false);
});

test("31 — andere Adminmodule bleiben unberührt", () => {
  for (const rel of [
    "pages/admin/AdminInvoicesPage.jsx", "pages/admin/AdminInvoiceDetailPage.jsx",
    "pages/admin/AdminShipmentsPage.jsx", "pages/admin/AdminShipmentDetailPage.jsx",
    "pages/admin/AdminCancellationRequestsPage.jsx", "pages/admin/AdminBackfillPage.jsx",
    "components/dashboard/Profile.jsx", "components/dashboard/InvoicesList.jsx",
  ]) {
    assert.equal(/adminCustomerView|CustomerRowActions|buildCustomerMenuModel/.test(read(rel)), false,
      `${rel} darf von der Kundenverwaltung nichts wissen`);
  }
  // Kreditbegriffe bleiben verschwunden.
  for (const src of [listSrc, detailSrc]) {
    assert.equal(/Kreditlimit|Kredit genutzt|credit_limit|credit_used/.test(src), false);
  }
});

test("32 — Selbsttest: die Prüflogik greift tatsächlich", () => {
  for (const [label, src] of [["liste", listSrc], ["detail", detailSrc], ["menü", actionsSrc], ["karte", approveSrc]]) {
    assert.ok(src.length > 800, `${label}: Quelle wirkt leer (${src.length} Zeichen)`);
  }
  assert.ok(cssSrc.length > 5000, "Stylesheet wirkt leer");
  // Der Kommentar-Stripper verschluckt keinen sichtbaren Code.
  assert.match(stripComments('const a = 1; // Blockieren\nconst b = "Blockieren";'), /const b = "Blockieren"/);
  assert.equal(/\/\/ Blockieren/.test(stripComments("// Blockieren\nconst x = 1;")), false);
  // Die Kernaussagen sind keine Tautologien.
  assert.notEqual(accountStatusCopy("approved").title, accountStatusCopy("pending").title);
  assert.notEqual(deleteEligibility({ shipments_total: 1 }).allowed, deleteEligibility({ shipments_total: 0 }).allowed);
  assert.notEqual(filterCustomerRows([ACME, PENDING], { status: "pending" }).length, 2);
  // Und die Spaltenzählung erkennt eine echte Abweichung.
  assert.equal(('<th scope="col">A</th><th scope="col">B</th>'.match(/<th scope="col"/g) || []).length, 2);
});
