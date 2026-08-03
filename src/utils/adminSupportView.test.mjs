// Reine Logik der Admin-Supportanfragen (utils/adminSupportView.mjs) + Verdrahtung
// der Adminoberfläche. Kein Rendering, keine neue Dependency.
//
// Geprüft: Status-/Kategorie-Meta, Übergänge (inkl. Wiederaufnahme aus „Geschlossen“),
// kanonische Normalisierung von Listen- und Detailantworten, Dirty-Erkennung,
// PATCH-Body (kein Mass Assignment), Konfliktbehandlung — plus Source-Asserts für
// Routen, Navigation, Kundenprofil und die API-Schicht.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SETTABLE_SUPPORT_STATUS,
  SUPPORT_CONFLICT_CODE,
  SUPPORT_STATUS_FILTER_OPTIONS,
  SUPPORT_STATUS_ORDER,
  SUPPORT_UNKNOWN_CUSTOMER,
  SUPPORT_NO_TICKET,
  allowedSupportTargets,
  applySupportConflictState,
  buildSupportPatchBody,
  isSupportNoOpResponse,
  isSupportNoteDirty,
  isSupportStatusDirty,
  isSupportStatusEditable,
  normalizeSupportNote,
  normalizeSupportRequest,
  readSupportConflict,
  supportCategoryLabel,
  supportCustomerCell,
  supportEmptyState,
  supportLabel,
  supportStatusMeta,
  supportStatusOptions,
  toSupportApiFilters,
} from "./adminSupportView.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const listPage = read("../pages/admin/AdminSupportRequestsPage.jsx");
const detailPage = read("../pages/admin/AdminSupportRequestDetailPage.jsx");
const sectionJsx = read("../components/admin/CustomerSupportSection.jsx");
const adminApi = read("../api/adminApi.js");
const adminSidebar = read("../components/layout/AdminSidebar.jsx");
const appJsx = read("../App.jsx");
const userDetail = read("../pages/admin/AdminUserDetailPage.jsx");

/* ── Status & Kategorien ─────────────────────────────────────────────────── */

test("1 — genau vier Status in stabiler Reihenfolge, kein waiting_for_customer", () => {
  assert.deepEqual([...SUPPORT_STATUS_ORDER], ["open", "in_progress", "resolved", "closed"]);
  assert.deepEqual([...SETTABLE_SUPPORT_STATUS], [...SUPPORT_STATUS_ORDER]);
  assert.ok(!SUPPORT_STATUS_ORDER.includes("waiting_for_customer"));
});

test("2 — deutsche Statuslabels exakt wie festgelegt", () => {
  assert.equal(supportStatusMeta("open")[1], "Offen");
  assert.equal(supportStatusMeta("in_progress")[1], "In Bearbeitung");
  assert.equal(supportStatusMeta("resolved")[1], "Erledigt");
  assert.equal(supportStatusMeta("closed")[1], "Geschlossen");
});

test("3 — unbekannter Status wird grau mit Rohwert angezeigt (kein Absturz)", () => {
  assert.deepEqual(supportStatusMeta("erfunden"), ["badge-gray", "erfunden"]);
  assert.deepEqual(supportStatusMeta(undefined), ["badge-gray", "—"]);
  assert.deepEqual(supportStatusMeta("constructor"), ["badge-gray", "constructor"]);
});

test("4 — Kategorielabels als Fallback, wenn der Server keines liefert", () => {
  assert.equal(supportCategoryLabel("cancellation"), "Stornierung");
  assert.equal(supportCategoryLabel("technical"), "Technisches Problem");
  // Unbekannt → Rohwert, nie „undefined“.
  assert.equal(supportCategoryLabel("erfunden"), "erfunden");
  assert.equal(supportCategoryLabel(undefined), "—");
  assert.equal(supportCategoryLabel("constructor"), "constructor");
});

test("5 — Filteroptionen beginnen mit „Alle“ und enthalten alle vier Status", () => {
  assert.equal(SUPPORT_STATUS_FILTER_OPTIONS[0].value, "");
  assert.equal(SUPPORT_STATUS_FILTER_OPTIONS[0].label, "Alle");
  assert.equal(SUPPORT_STATUS_FILTER_OPTIONS.length, 5);
});

/* ── Übergänge ───────────────────────────────────────────────────────────── */

test("6 — erlaubte Übergänge spiegeln den Backendvertrag", () => {
  assert.deepEqual(allowedSupportTargets("open"), ["in_progress", "resolved", "closed"]);
  assert.deepEqual(allowedSupportTargets("in_progress"), ["open", "resolved", "closed"]);
  assert.deepEqual(allowedSupportTargets("resolved"), ["in_progress", "closed"]);
  assert.deepEqual(allowedSupportTargets("closed"), ["open"]);
  assert.deepEqual(allowedSupportTargets("erfunden"), []);
  assert.deepEqual(allowedSupportTargets("constructor"), []);
});

test("7 — kein Status ist terminal: „Geschlossen“ lässt sich wieder öffnen", () => {
  for (const s of SUPPORT_STATUS_ORDER) {
    assert.equal(isSupportStatusEditable(s), true, `${s} sollte bearbeitbar sein`);
  }
  assert.equal(isSupportStatusEditable("erfunden"), false);
});

test("8 — die Select-Optionen enthalten den aktuellen Status plus die Ziele", () => {
  const opts = supportStatusOptions("resolved").map((o) => o.value);
  assert.deepEqual(opts, ["in_progress", "resolved", "closed"]); // stabile Reihenfolge
  assert.deepEqual(supportStatusOptions("closed").map((o) => o.value), ["open", "closed"]);
  assert.deepEqual(supportStatusOptions("erfunden"), []);
});

/* ── Normalisierung ──────────────────────────────────────────────────────── */

test("9 — Listenzeile: subjectPreview wird auf `subject` abgebildet und markiert", () => {
  const row = normalizeSupportRequest({
    id: 10, ticketNumber: "CE-SUP26-00010", category: "invoice", categoryLabel: "Rechnung",
    subjectPreview: "Frage zur Rechnung…", status: "open", statusLabel: "Offen", revision: 1,
    createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z",
    customer: { id: 45, company: "Acme GmbH", contactName: "Max", email: "max@acme.test" },
  });
  assert.equal(row.subject, "Frage zur Rechnung…");
  assert.equal(row.subjectIsPreview, true);
  // Die Liste liefert bewusst KEINEN Nachrichtentext.
  assert.equal(row.message, null);
  assert.equal(row.customer.company, "Acme GmbH");
});

test("10 — Detailzeile: voller subject + message, subjectIsPreview=false", () => {
  const row = normalizeSupportRequest({
    id: 10, ticketNumber: "CE-SUP26-00010", category: "other",
    subject: "Vollständiger Betreff", message: "Vollständiger Nachrichtentext.",
    status: "in_progress", revision: 2, adminNote: "Vermerk",
    handledBy: { id: 1, name: "Admin Eins" },
    customer: { id: 45, company_name: "Acme GmbH", contact_name: "Max" },
  });
  assert.equal(row.subject, "Vollständiger Betreff");
  assert.equal(row.subjectIsPreview, false);
  assert.equal(row.message, "Vollständiger Nachrichtentext.");
  assert.equal(row.adminNote, "Vermerk");
  assert.deepEqual(row.handledBy, { id: 1, name: "Admin Eins" });
});

test("11 — snake_case wird zentral einmal abgebildet", () => {
  const row = normalizeSupportRequest({
    id: 3, ticket_number: "CE-SUP26-00003", category: "account",
    subject_preview: "Kurz", status: "closed", status_label: "Geschlossen",
    admin_note: "intern", created_at: "t1", updated_at: "t2", handled_at: "t3",
    customer: { user_id: 9, company_name: "Firma", contact_name: "Anna", customer_number: "CE-K-10030" },
    revision: 4,
  });
  assert.equal(row.ticketNumber, "CE-SUP26-00003");
  assert.equal(row.subject, "Kurz");
  assert.equal(row.statusLabel, "Geschlossen");
  assert.equal(row.adminNote, "intern");
  assert.equal(row.createdAt, "t1");
  assert.equal(row.handledAt, "t3");
  assert.equal(row.customer.id, 9);
  assert.equal(row.customer.customerNumber, "CE-K-10030");
});

test("12 — revision 0 bleibt erhalten, ein geleerter Vermerk bleibt \"\"", () => {
  assert.equal(normalizeSupportRequest({ id: 1, revision: 0 }).revision, 0);
  assert.equal(normalizeSupportRequest({ id: 1, adminNote: "" }).adminNote, "");
  assert.equal(normalizeSupportRequest({ id: 1 }).adminNote, null);
  assert.equal(normalizeSupportRequest(null), null);
  assert.equal(normalizeSupportRequest("x"), null);
});

test("13 — das Serverlabel hat Vorrang vor der lokalen Kategorietabelle", () => {
  const row = normalizeSupportRequest({ id: 1, category: "invoice", categoryLabel: "Serverlabel" });
  assert.equal(row.categoryLabel, "Serverlabel");
  // Fehlt es, greift der lokale Fallback — nie ein technischer Rohwert.
  assert.equal(normalizeSupportRequest({ id: 1, category: "invoice" }).categoryLabel, "Rechnung");
});

/* ── Anzeige-Helfer ──────────────────────────────────────────────────────── */

test("14 — die Ticketnummer ist die Kennung; sie wird nie aus der ID gebildet", () => {
  assert.equal(supportLabel({ id: 10, ticketNumber: "CE-SUP26-00010" }), "CE-SUP26-00010");
  assert.equal(supportLabel({ id: 10, ticketNumber: "  " }), SUPPORT_NO_TICKET);
  assert.equal(supportLabel({ id: 10 }), SUPPORT_NO_TICKET);
  assert.ok(!supportLabel({ id: 10 }).includes("10"), "die technische ID wurde als Kennung benutzt");
});

test("15 — Kundendarstellung: Firma primär, nie die user_id", () => {
  const withCompany = supportCustomerCell({ customer: { id: 45, company: "Acme", name: "Max", customerNumber: "CE-K-10030" } });
  assert.equal(withCompany.primary, "Acme");
  assert.equal(withCompany.secondary, "CE-K-10030 · Max");
  const nameOnly = supportCustomerCell({ customer: { id: 45, name: "Max" } });
  assert.equal(nameOnly.primary, "Max");
  const unknown = supportCustomerCell({ customer: { id: 45 } });
  assert.equal(unknown.primary, SUPPORT_UNKNOWN_CUSTOMER);
  assert.equal(unknown.known, false);
  assert.ok(!unknown.primary.includes("45"), "die user_id wurde angezeigt");
});

test("16 — Leerzustand unterscheidet „nichts vorhanden“ von „Filter leer“", () => {
  assert.equal(supportEmptyState({ count: 1 }).show, false);
  assert.match(supportEmptyState({ count: 0 }).title, /Noch keine Supportanfragen/);
  assert.match(supportEmptyState({ count: 0, status: "closed" }).title, /Für diesen Status/);
});

test("17 — nur belegte Filterparameter werden gesendet", () => {
  assert.deepEqual(toSupportApiFilters("open"), { status: "open" });
  assert.deepEqual(toSupportApiFilters(""), {});
  assert.deepEqual(toSupportApiFilters("erfunden"), {}, "ein ungültiger Status löste serverseitig 400 aus");
  assert.deepEqual(toSupportApiFilters(undefined), {});
});

/* ── Dirty-Erkennung ─────────────────────────────────────────────────────── */

test("18 — reine Whitespace-Änderung am Vermerk ist keine Änderung", () => {
  assert.equal(normalizeSupportNote(null), "");
  assert.equal(isSupportNoteDirty(null, ""), false);
  assert.equal(isSupportNoteDirty("x", " x "), false);
  // Das bewusste Leeren eines vorhandenen Vermerks IST eine Änderung.
  assert.equal(isSupportNoteDirty("x", ""), true);
  assert.equal(isSupportNoteDirty(null, "neu"), true);
});

test("19 — Statusänderung nur bei bekanntem Status und echtem Wechsel", () => {
  assert.equal(isSupportStatusDirty("open", "resolved"), true);
  assert.equal(isSupportStatusDirty("open", "open"), false);
  assert.equal(isSupportStatusDirty("open", ""), false);
  assert.equal(isSupportStatusDirty("erfunden", "open"), false);
});

/* ── PATCH-Body ──────────────────────────────────────────────────────────── */

test("20 — der PATCH-Body enthält revision plus die geänderten Felder", () => {
  assert.deepEqual(buildSupportPatchBody({ revision: 3, status: "closed" }), { revision: 3, status: "closed" });
  assert.deepEqual(buildSupportPatchBody({ revision: 3, adminNote: "x" }), { revision: 3, adminNote: "x" });
  // revision 0 ist gültig und muss erhalten bleiben.
  assert.deepEqual(buildSupportPatchBody({ revision: 0, status: "open" }), { revision: 0, status: "open" });
  // Leeren des Vermerks bleibt als "" erhalten (nicht weggelassen).
  assert.deepEqual(buildSupportPatchBody({ revision: 1, adminNote: "" }), { revision: 1, adminNote: "" });
});

test("21 — der Vermerk heißt AUSSCHLIESSLICH adminNote", () => {
  const body = buildSupportPatchBody({ revision: 1, adminNote: "x" });
  assert.ok(!("admin_note" in body) && !("internal_note" in body) && !("note" in body));
});

test("22 — ein ungültiger Status wird fail-closed abgelehnt", () => {
  assert.throws(() => buildSupportPatchBody({ revision: 1, status: "waiting_for_customer" }), /invalid_status/);
  assert.throws(() => buildSupportPatchBody({ revision: 1, status: "erfunden" }), /invalid_status/);
});

test("23 — Mass Assignment im PATCH ausgeschlossen", () => {
  const body = buildSupportPatchBody({
    revision: 1, status: "closed", adminNote: "ok",
    subject: "manipuliert", message: "manipuliert", ticketNumber: "CE-SUP26-99999", userId: 9,
  });
  assert.deepEqual(Object.keys(body).sort(), ["adminNote", "revision", "status"]);
});

/* ── Konflikt ────────────────────────────────────────────────────────────── */

test("24 — der 409-Konflikt wird erkannt und der Serverstand normalisiert", () => {
  const r = readSupportConflict(409, {
    code: SUPPORT_CONFLICT_CODE,
    current: { id: 10, status: "resolved", revision: 5, adminNote: "fremd" },
  });
  assert.equal(r.conflict, true);
  assert.equal(r.current.revision, 5);
  assert.equal(r.current.status, "resolved");
});

test("25 — ein 409 OHNE Konfliktcode ist kein Konflikt (unzulässiger Statuswechsel)", () => {
  const r = readSupportConflict(409, { code: "SUPPORT_STATUS_TRANSITION_INVALID" });
  assert.equal(r.conflict, false);
  assert.equal(r.current, null);
  // Und die Detailseite behandelt genau diesen Fall getrennt.
  assert.match(detailPage, /if \(c\.conflict\) \{/, "409-Fallunterscheidung fehlt");
  assert.match(detailPage, /SAVE_ERRORS\[409\]/, "Meldung für den unzulässigen Wechsel fehlt");
});

test("26 — ein älteres Backend ohne `current` bleibt behandelbar", () => {
  const r = readSupportConflict(409, { code: SUPPORT_CONFLICT_CODE });
  assert.equal(r.conflict, true);
  assert.equal(r.current, null);
  assert.equal(applySupportConflictState(null), null);
});

test("27 — der Serverstand wird NIE automatisch übernommen", () => {
  // applySupportConflictState liefert den Stand nur zur bewussten Übernahme.
  assert.deepEqual(applySupportConflictState({ status: "closed", adminNote: "x", revision: 7 }),
    { status: "closed", adminNote: "x", revision: 7 });
  // Die Seite setzt bei 409 ausschließlich den Konfliktbanner — kein adopt(), kein Auto-Retry.
  assert.match(detailPage, /setConflict\(\{ current: c\.current \}\);/, "Konfliktbanner fehlt");
  assert.ok(!/409[\s\S]{0,400}adopt\(/.test(detailPage), "der Serverstand wird bei 409 automatisch übernommen");
});

test("28 — No-op-Antworten erhöhen die Revision nicht", () => {
  assert.equal(isSupportNoOpResponse({ noOp: true }), true);
  assert.equal(isSupportNoOpResponse({ no_op: true }), true);
  assert.equal(isSupportNoOpResponse({}), false);
  assert.match(detailPage, /isSupportNoOpResponse\(d\)/, "No-op wird nicht ausgewertet");
  assert.match(detailPage, /Keine Änderung notwendig\./, "No-op-Meldung fehlt");
});

/* ── Verdrahtung ─────────────────────────────────────────────────────────── */

test("29 — die drei Adminendpunkte laufen über das zentrale apiFetch", () => {
  for (const fn of ["listAdminSupportRequests", "getAdminSupportRequest", "updateAdminSupportRequest"]) {
    assert.match(adminApi, new RegExp(`export function ${fn}\\b`), `${fn} fehlt`);
  }
  assert.match(adminApi, /`\/admin\/support-requests\$\{buildQuery\(query, SUPPORT_PARAMS\)\}`/, "Listenpfad weicht ab");
  assert.match(adminApi, /`\/admin\/support-requests\/\$\{encodeURIComponent\(id\)\}`/, "Detailpfad weicht ab");
  assert.match(adminApi, /const SUPPORT_PARAMS = \["status", "userId", "limit", "offset"\];/, "Parameter-Allowlist weicht ab");
  assert.match(adminApi, /buildSupportPatchBody/, "zentraler PATCH-Body wird nicht genutzt");
});

test("30 — Navigation und Routen sind vollständig verdrahtet", () => {
  assert.match(adminSidebar, /\{ to: "\/admin\/support-requests", label: "Supportanfragen", icon: "mail" \}/,
    "Menüeintrag fehlt oder weicht ab");
  // Lazy-Loading beibehalten (Performance-Regel des Projekts).
  assert.match(appJsx, /React\.lazy\(\(\) => import\("\.\/pages\/admin\/AdminSupportRequestsPage"\)\)/, "Liste nicht lazy");
  assert.match(appJsx, /React\.lazy\(\(\) => import\("\.\/pages\/admin\/AdminSupportRequestDetailPage"\)\)/, "Detail nicht lazy");
  assert.match(appJsx, /path="\/admin\/support-requests"\s+element=\{<AdminSupportRequestsPage \/>\}/, "Listenroute fehlt");
  assert.match(appJsx, /path="\/admin\/support-requests\/:id" element=\{<AdminSupportRequestDetailPage \/>\}/, "Detailroute fehlt");
});

test("31 — das Kundenprofil zeigt die Supportanfragen dieses Kunden", () => {
  assert.match(userDetail, /<CustomerSupportSection userId=\{idOf\(u\)\} \/>/, "Sektion fehlt im Kundenprofil");
  // Kein zweiter Endpunkt: dieselbe Liste mit userId-Filter.
  assert.match(sectionJsx, /listAdminSupportRequests\(\{ userId, page: 1, pageSize: MAX_ROWS \}\)/, "eigener Endpunkt statt Filter");
  // Read-only: die Sektion darf nicht schreiben.
  assert.ok(!/updateAdminSupportRequest/.test(sectionJsx), "die Profilsektion schreibt");
});

test("32 — die Liste übernimmt den Kundenfilter aus der URL, aber nur valide IDs", () => {
  assert.match(listPage, /function parseUserIdParam\(raw\)/, "URL-Filter fehlt");
  assert.match(listPage, /\.\.\.\(userId != null \? \{ userId \} : \{\}\)/, "Filter wird nicht gesendet");
  // Ein ungültiger Wert darf nicht durchgereicht werden (Server würde 400 liefern).
  assert.match(listPage, /\/\^\[0-9\]\+\$\/\.test\(s\)/, "IDs werden nicht validiert");
});

test("33 — der volle Nachrichtentext erscheint nur im Detail, nie in einer Liste", () => {
  // Weder Listenseite noch Profilsektion rendern `row.message`.
  assert.ok(!/row\.message/.test(listPage), "die Liste rendert den Nachrichtentext");
  assert.ok(!/\.message/.test(sectionJsx), "die Profilsektion rendert den Nachrichtentext");
  assert.match(detailPage, /\{req\.message \|\| "—"\}/, "das Detail zeigt den Nachrichtentext nicht");
});

test("34 — kein unsanitiertes HTML und kein Logging in der Adminoberfläche", () => {
  // Gegen den kommentarfreien Quelltext geprüft: die Kommentare benennen ausdrücklich,
  // dass KEIN dangerouslySetInnerHTML verwendet wird — sie dürfen den Test nicht auslösen.
  const stripComments = (src) =>
    src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [name, raw] of [["Liste", listPage], ["Detail", detailPage], ["Profilsektion", sectionJsx]]) {
    const src = stripComments(raw);
    assert.ok(!src.includes("dangerouslySetInnerHTML"), `${name}: dangerouslySetInnerHTML ist nicht zulässig`);
    assert.ok(!src.includes("innerHTML"), `${name}: innerHTML ist nicht zulässig`);
    assert.ok(!/console\.(log|error|warn|info)/.test(src), `${name}: Logging gefunden`);
    assert.ok(!src.includes("lucide-react"), `${name}: lucide-react ist nicht zulässig`);
  }
});

test("35 — der Adminbereich benennt ausdrücklich, dass nichts an den Kunden geht", () => {
  assert.match(detailPage, /keine<\/strong> Nachricht an den Kunden versendet/,
    "der Hinweis zur fehlenden Kundenbenachrichtigung fehlt");
  assert.match(listPage, /verschickt keine Nachricht an den Kunden/,
    "der Hinweis fehlt in der Liste");
});
