// Tests für die Logik der Admin-Stornierungsanfragen (kanonische Normalisierung,
// Anzeige-Meta, Übergänge, getrennte Dirty-Erkennung, PATCH-Body-Vertrag).
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminCancellations.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancellationStatusMeta,
  CANCELLATION_STATUS_ORDER,
  CANCELLATION_STATUS_FILTER_OPTIONS,
  TERMINAL_CANCELLATION_STATUSES,
  isTerminalCancellationStatus,
  allowedCancellationTargets,
  cancellationStatusOptions,
  isCancellationStatusEditable,
  normalizeNote,
  isStatusDirty,
  isNoteDirty,
  normalizeCancellationRequest,
  isNoOpResponse,
  buildCancellationPatchBody,
  SETTABLE_CANCELLATION_STATUS,
  cancellationCustomerCell,
  cancellationShipmentCell,
  cancellationLabel,
  cancellationEmptyState,
  toCancellationApiFilters,
  readCancellationConflict,
  applyConflictState,
  CANCELLATION_DECISION_DIALOG,
} from "./adminCancellations.mjs";

// ── Status-Meta / Labels (verbindliche Bezeichnungen) ────────────────────────
test("Labels: pending/in_review/accepted/rejected exakt wie vorgegeben", () => {
  // Verbindliche Begriffe der Adminoberfläche. Zuvor wichen Badge-, Filter- und
  // Dialogtexte voneinander ab ("In Bearbeitung" vs. "Anfrage angenommen" …).
  assert.deepEqual(cancellationStatusMeta("pending"), ["badge-yellow", "Offen"]);
  assert.deepEqual(cancellationStatusMeta("in_review"), ["badge-blue", "In Prüfung"]);
  assert.deepEqual(cancellationStatusMeta("accepted"), ["badge-green", "Angenommen"]);
  assert.deepEqual(cancellationStatusMeta("rejected"), ["badge-red", "Abgelehnt"]);
});

test("die Statusbegriffe sind in Badge, Filter und Auswahl identisch", () => {
  const CANON = { pending: "Offen", in_review: "In Prüfung", accepted: "Angenommen", rejected: "Abgelehnt" };
  // Badge, Filteroption und Select-Option müssen für denselben Status denselben
  // Text zeigen — kein wechselndes Vokabular in der Oberfläche.
  for (const [value, label] of Object.entries(CANON)) {
    assert.equal(cancellationStatusMeta(value)[1], label, `Badge für ${value}`);
    const f = CANCELLATION_STATUS_FILTER_OPTIONS.find((o) => o.value === value);
    assert.ok(f && f.label === label, `Filteroption für ${value}`);
  }
  for (const o of cancellationStatusOptions("pending")) {
    assert.equal(o.label, CANON[o.value], `Select-Option für ${o.value}`);
  }
  // Die alten, uneinheitlichen Begriffe kommen nirgends mehr vor.
  const allLabels = [
    ...CANCELLATION_STATUS_ORDER.map((s) => cancellationStatusMeta(s)[1]),
    ...CANCELLATION_STATUS_FILTER_OPTIONS.map((o) => o.label),
    ...cancellationStatusOptions("pending").map((o) => o.label),
  ];
  for (const gone of ["In Bearbeitung", "Anfrage angenommen", "Anfrage abgelehnt"]) {
    assert.ok(!allLabels.includes(gone), `alter Begriff ${gone} ist noch da`);
  }
});

test("Status-Meta Fallback: unbekannt → „Unbekannter Status“; null → grau + Strich", () => {
  assert.deepEqual(cancellationStatusMeta("weird"), ["badge-gray", "Unbekannter Status", "weird"]);
  assert.deepEqual(cancellationStatusMeta(null), ["badge-gray", "—", null]);
});

test("Filteroptionen: Alle + vier Status in stabiler Reihenfolge", () => {
  assert.deepEqual(
    CANCELLATION_STATUS_FILTER_OPTIONS.map((o) => o.value),
    ["", "pending", "in_review", "accepted", "rejected"],
  );
  assert.equal(CANCELLATION_STATUS_FILTER_OPTIONS[0].value, "");
});

// ── Terminale Status / Übergänge ─────────────────────────────────────────────
test("terminale Status: accepted/rejected terminal, pending/in_review nicht", () => {
  assert.deepEqual(TERMINAL_CANCELLATION_STATUSES, ["accepted", "rejected"]);
  assert.equal(isTerminalCancellationStatus("accepted"), true);
  assert.equal(isTerminalCancellationStatus("rejected"), true);
  assert.equal(isTerminalCancellationStatus("pending"), false);
  assert.equal(isTerminalCancellationStatus("in_review"), false);
});

test("Übergänge: pending→(in_review,accepted,rejected); in_review→(accepted,rejected)", () => {
  assert.deepEqual(allowedCancellationTargets("pending"), ["in_review", "accepted", "rejected"]);
  assert.deepEqual(allowedCancellationTargets("in_review"), ["accepted", "rejected"]);
});

test("kein Reopen: terminale/unbekannte Status erlauben keine Statusübergänge", () => {
  assert.deepEqual(allowedCancellationTargets("accepted"), []);
  assert.deepEqual(allowedCancellationTargets("rejected"), []);
  assert.deepEqual(allowedCancellationTargets("weird"), []);
});

test("Status-Select: nur bei nicht-terminalem Status, sonst leer", () => {
  assert.deepEqual(cancellationStatusOptions("pending").map((o) => o.value), ["pending", "in_review", "accepted", "rejected"]);
  assert.deepEqual(cancellationStatusOptions("in_review").map((o) => o.value), ["in_review", "accepted", "rejected"]);
  assert.deepEqual(cancellationStatusOptions("accepted"), []);
  assert.deepEqual(cancellationStatusOptions("rejected"), []);
});

test("Statusbearbeitung nur bei bekanntem, nicht-terminalem Status", () => {
  assert.equal(isCancellationStatusEditable("pending"), true);
  assert.equal(isCancellationStatusEditable("in_review"), true);
  assert.equal(isCancellationStatusEditable("accepted"), false);
  assert.equal(isCancellationStatusEditable("rejected"), false);
  assert.equal(isCancellationStatusEditable("weird"), false);
});

// ── Kanonische Normalisierung ────────────────────────────────────────────────
test("normalize: kanonische camelCase-Form wird direkt übernommen", () => {
  const raw = {
    id: 5, status: "in_review", reason: "Grund", adminNote: "Notiz", revision: 2,
    createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-02T00:00:00Z",
    reviewedAt: "2026-07-02T00:00:00Z", reviewedBy: "admin1",
    shipment: { id: 90, carrier: "ups", service_type: "pickup", status: "booked", price_final: 9.9, from_country: "de", to_country: "ch" },
    customer: { id: 42, company_name: "Muster GmbH", name: "Erika", email: "e@x.de" },
    invoice: { id: 7 }, notification: { sent: false },
  };
  const n = normalizeCancellationRequest(raw);
  assert.equal(n.id, 5);
  assert.equal(n.status, "in_review");
  assert.equal(n.reason, "Grund");
  assert.equal(n.adminNote, "Notiz");
  assert.equal(n.revision, 2);
  assert.equal(n.reviewedBy, "admin1");
  assert.equal(n.shipment.id, 90);
  assert.equal(n.shipment.carrier, "ups");
  assert.equal(n.shipment.serviceType, "pickup");
  assert.equal(n.customer.id, 42);
  assert.equal(n.customer.company, "Muster GmbH");
  assert.equal(n.customer.email, "e@x.de");
  assert.deepEqual(n.invoice, { id: 7 });
});

test("normalize: snake_case wird zentral abgebildet (admin_note → adminNote)", () => {
  const n = normalizeCancellationRequest({
    id: 1, state: "pending", cancellation_reason: "R", admin_note: "SnakeNote",
    created_at: "2026-07-01", shipment_id: 900, user_id: 77,
  });
  assert.equal(n.status, "pending");
  assert.equal(n.reason, "R");
  assert.equal(n.adminNote, "SnakeNote");
  assert.equal(n.createdAt, "2026-07-01");
  // flache IDs landen in den kanonischen Sub-Objekten
  assert.equal(n.shipment.id, 900);
  assert.equal(n.customer.id, 77);
});

test("normalize: adminNote priorisiert camelCase, erhält leeren String, sonst null", () => {
  assert.equal(normalizeCancellationRequest({ adminNote: "A", admin_note: "B" }).adminNote, "A");
  assert.equal(normalizeCancellationRequest({ adminNote: "" }).adminNote, ""); // bewusst geleert
  assert.equal(normalizeCancellationRequest({ adminNote: null, admin_note: undefined }).adminNote, null);
  assert.equal(normalizeCancellationRequest({}).adminNote, null);
});

test("normalize: revision=0 bleibt erhalten; fehlend → undefined", () => {
  assert.equal(normalizeCancellationRequest({ id: 1, revision: 0 }).revision, 0);
  assert.equal(normalizeCancellationRequest({ id: 1 }).revision, undefined);
});

test("normalize: leerer/kein Datensatz → null; shipment/customer immer Objekt", () => {
  assert.equal(normalizeCancellationRequest(null), null);
  assert.equal(normalizeCancellationRequest("x"), null);
  const n = normalizeCancellationRequest({ id: 1 });
  assert.equal(typeof n.shipment, "object");
  assert.equal(typeof n.customer, "object");
  assert.equal(n.shipment.id, undefined);
});

// ── No-op ────────────────────────────────────────────────────────────────────
test("isNoOpResponse erkennt noOp/no_op/noop", () => {
  assert.equal(isNoOpResponse({ noOp: true }), true);
  assert.equal(isNoOpResponse({ no_op: true }), true);
  assert.equal(isNoOpResponse({ noop: true }), true);
  assert.equal(isNoOpResponse({ noOp: false }), false);
  assert.equal(isNoOpResponse({}), false);
  assert.equal(isNoOpResponse(null), false);
});

// ── Dirty-Erkennung (getrennt) ───────────────────────────────────────────────
test("normalizeNote: null/undefined → '', trimmt Ränder", () => {
  assert.equal(normalizeNote(null), "");
  assert.equal(normalizeNote(undefined), "");
  assert.equal(normalizeNote("  hallo  "), "hallo");
});

test("isStatusDirty: nur bei nicht-terminalem Ausgangsstatus und echtem Wechsel", () => {
  assert.equal(isStatusDirty("pending", "in_review"), true);
  assert.equal(isStatusDirty("pending", "pending"), false);
  // terminal: Statuswechsel gesperrt → immer false
  assert.equal(isStatusDirty("accepted", "in_review"), false);
  assert.equal(isStatusDirty("rejected", "accepted"), false);
});

test("isNoteDirty: inhaltliche Änderung inkl. Leeren; Whitespace/null↔'' zählt nicht", () => {
  assert.equal(isNoteDirty("abc", "abcd"), true);
  assert.equal(isNoteDirty("abc", ""), true);      // bewusst geleert
  assert.equal(isNoteDirty("", "neu"), true);      // erstmals gesetzt
  assert.equal(isNoteDirty("abc", "  abc  "), false);
  assert.equal(isNoteDirty(null, ""), false);
  assert.equal(isNoteDirty("   ", ""), false);
});

test("terminal: statusDirty=false, aber noteDirty kann true sein (Notiz bearbeitbar)", () => {
  assert.equal(isStatusDirty("accepted", "pending"), false);
  assert.equal(isNoteDirty("alt", "neu"), true);
});

// ── PATCH-Body-Vertrag (adminNote; niemals internal_note) ────────────────────
test("PATCH: reine Notizänderung sendet revision + adminNote", () => {
  const body = buildCancellationPatchBody({ revision: 3, adminNote: "Kunde erreicht." });
  assert.deepEqual(body, { revision: 3, adminNote: "Kunde erreicht." });
});

test("PATCH: sendet NIEMALS internal_note/admin_note/note", () => {
  const body = buildCancellationPatchBody({ revision: 1, status: "accepted", adminNote: "ok" });
  assert.ok(!("internal_note" in body), "kein internal_note");
  assert.ok(!("admin_note" in body), "kein admin_note");
  assert.ok(!("note" in body), "kein note");
  assert.ok("adminNote" in body, "adminNote vorhanden");
});

test("PATCH: Status + Notiz gemeinsam → kanonischer Body", () => {
  assert.deepEqual(
    buildCancellationPatchBody({ revision: 4, status: "accepted", adminNote: "angenommen" }),
    { revision: 4, status: "accepted", adminNote: "angenommen" },
  );
});

test("PATCH: reine Statusänderung sendet keine Notiz (adminNote undefined)", () => {
  const body = buildCancellationPatchBody({ revision: 2, status: "in_review" });
  assert.deepEqual(body, { revision: 2, status: "in_review" });
  assert.ok(!("adminNote" in body));
});

test("PATCH: adminNote='' (leeren) wird bewusst gesendet; null ebenfalls", () => {
  assert.deepEqual(buildCancellationPatchBody({ revision: 5, adminNote: "" }), { revision: 5, adminNote: "" });
  assert.deepEqual(buildCancellationPatchBody({ revision: 5, adminNote: null }), { revision: 5, adminNote: null });
});

test("PATCH: revision immer enthalten (auch 0); unbekannte Felder werden verworfen", () => {
  assert.equal(buildCancellationPatchBody({ revision: 0, adminNote: "x" }).revision, 0);
  const body = buildCancellationPatchBody({ revision: 1, adminNote: "x", foo: "bar", internal_note: "nope" });
  assert.deepEqual(Object.keys(body).sort(), ["adminNote", "revision"]);
});

test("PATCH: ungültiger Status wird fail-closed abgelehnt", () => {
  assert.throws(() => buildCancellationPatchBody({ revision: 1, status: "weird" }), /invalid_status/);
  assert.deepEqual(SETTABLE_CANCELLATION_STATUS, ["pending", "in_review", "accepted", "rejected"]);
});

// ═══ Pfadvertrag, Liste, Detail, Konflikt — nach der Routenreparatur ═════════
// Der gesamte Workflow war produktiv unerreichbar, weil das Frontend
// `/kunde/...` bzw. `/admin/...` aufrief und das Backend `/api/...` registrierte.
// Diese Tests binden die Frontendpfade fest, damit die Drift nicht zurückkehrt.
import { readFileSync } from "node:fs";
import { fileURLToPath as _fu } from "node:url";
import { dirname as _dn, join as _jn } from "node:path";
const _HERE = _dn(_fu(import.meta.url));
const _read = (rel) => readFileSync(_jn(_HERE, "..", rel), "utf8");
const _strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const adminApiSrc = _strip(_read("api/adminApi.js"));
const clientSrc   = _strip(_read("api/client.js"));
const listSrc     = _strip(_read("pages/admin/AdminCancellationRequestsPage.jsx"));
const detailSrc   = _strip(_read("pages/admin/AdminCancellationRequestDetailPage.jsx"));
const cssSrc      = _read("styles/admin.css");

const ROW = {
  id: 7, status: "pending", reasonPreview: "Der Empfänger hat die Lieferung storniert.", revision: 1,
  createdAt: "2026-07-29T10:00:00Z", updatedAt: "2026-07-29T10:00:00Z",
  shipment: { id: 900, jumingoShipmentId: "s_x", orderNumber: "JU-77", status: "label_ready",
    carrier: "ups", fromCountry: "DE", toCountry: "GB" },
  customer: { id: 2, company: "Borner Spedition GmbH", contactName: "A. Muster", email: "k@ce.de" },
};

test("Pfadvertrag: Kunden-POST und alle drei Adminrouten ohne /api-Präfix", () => {
  // Kunde
  assert.ok(clientSrc.includes("`/kunde/shipments/${encodeURIComponent(String(shipmentId ?? \"\").trim())}/cancellation-request`"),
    "Kunden-POST nutzt nicht den vereinbarten Pfad");
  // Admin: Liste, Detail, Update
  assert.ok(adminApiSrc.includes("`/admin/cancellation-requests${buildQuery(query, CANCELLATION_PARAMS)}`"), "Adminliste");
  assert.equal((adminApiSrc.match(/`\/admin\/cancellation-requests\/\$\{encodeURIComponent\(id\)\}`/g) || []).length, 2,
    "Detail UND Update müssen denselben Pfad nutzen");
  assert.match(adminApiSrc, /method:\s*"PATCH"/, "Update muss PATCH sein");
  // Und NIRGENDS ein /api-Präfix für Storno.
  for (const [name, src] of [["adminApi.js", adminApiSrc], ["client.js", clientSrc]]) {
    assert.equal(/["'`]\/api\/[^"'`]*cancellation/.test(src), false, `${name}: /api-Storno-Pfad`);
  }
});

test("reasonPreview wird normalisiert und als Grund angezeigt", () => {
  const r = normalizeCancellationRequest(ROW);
  assert.equal(r.reason, "Der Empfänger hat die Lieferung storniert.");
  assert.equal(r.reasonIsPreview, true, "Listenwert ist als Vorschau erkennbar");
  // snake_case-Variante ebenfalls.
  assert.equal(normalizeCancellationRequest({ id: 1, reason_preview: "abc" }).reason, "abc");
  // Der volle Grund des Detailendpunkts hat Vorrang.
  const full = normalizeCancellationRequest({ id: 1, reason: "voll", reasonPreview: "kurz" });
  assert.equal(full.reason, "voll");
  assert.equal(full.reasonIsPreview, false);
  // Es wird KEIN Ersatz erfunden.
  assert.equal(normalizeCancellationRequest({ id: 1 }).reason, null);
  // Und die Liste rendert ihn.
  assert.match(listSrc, /function ReasonCell/);
  assert.match(listSrc, /<ReasonCell row=\{row\} \/>/);
  assert.equal(/dangerouslySetInnerHTML/.test(listSrc + detailSrc), false, "Grund nie als HTML");
});

test("Liste: sieben fachliche Spalten, keine dominante User-/Shipment-ID", () => {
  const headers = (listSrc.match(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g) || [])
    .map((h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  assert.deepEqual(headers, ["Anfrage", "Kunde", "Sendung", "Grund", "Status", "Eingegangen", "Aktion"]);
  assert.equal(new Set(headers).size, headers.length, "Spaltenüberschriften eindeutig");
  const body = listSrc.slice(listSrc.indexOf("<tbody>"), listSrc.indexOf("</tbody>"));
  assert.equal((body.match(/<td[\s>]/g) || []).length, 7, "Zellen passen zu den Spaltenköpfen");
  for (const gone of ["User-ID", "Sendung-ID", "Anfrage-ID"]) {
    assert.equal(headers.includes(gone), false, `technische Spalte ${gone} muss entfallen sein`);
  }
  // Kunde und Sendung erscheinen fachlich.
  const cell = cancellationCustomerCell(normalizeCancellationRequest(ROW));
  assert.equal(cell.primary, "Borner Spedition GmbH");
  assert.equal(cell.secondary, "A. Muster");
  assert.equal(cancellationCustomerCell({ customer: { id: 5 } }).primary, "Kunde nicht auflösbar");
  const ship = cancellationShipmentCell(normalizeCancellationRequest(ROW));
  assert.equal(ship.primary, "JU-77");
  assert.equal(ship.secondary, "ups · DE → GB");
  // Ohne Nummer: ehrlicher Text, NIE aus der ID gebildet.
  const noNo = cancellationShipmentCell({ shipment: { id: 900 } });
  assert.equal(noNo.known, false);
  assert.equal(noNo.primary, "Ohne Bestellnummer");
  assert.equal(noNo.primary.includes("900"), false);
  assert.equal(cancellationLabel({ id: 7 }), "Anfrage #7");
});

test("Liste: Filter, Reset, Lade-, Fehler- und Leerzustand", () => {
  assert.deepEqual(toCancellationApiFilters(""), {}, "Alle sendet keinen Status");
  assert.deepEqual(toCancellationApiFilters("in_review"), { status: "in_review" });
  assert.deepEqual(toCancellationApiFilters("quatsch"), {}, "ungültiger Status wird nie gesendet");
  assert.equal(cancellationEmptyState({ count: 0 }).title, "Noch keine Stornierungsanfragen vorhanden.");
  assert.equal(cancellationEmptyState({ count: 0, status: "accepted" }).title,
    "Für diesen Status wurden keine Stornierungsanfragen gefunden.");
  assert.equal(cancellationEmptyState({ count: 3 }).show, false);
  // Pagination-Reset + Sperre während des Requests.
  assert.match(listSrc, /const applyFilter = \(\) => \{ setPage\(1\); setAppliedStatus\(draftStatus\); \};/);
  assert.match(listSrc, /className="btn btn-primary btn-sm" disabled=\{loading\}/);
  // Ladezustand als Live-Region, Fehler als alert MIT Retry — kein Leerzustand.
  // Ladezustand über das gemeinsame Listen-Skeleton (Paket E).
  assert.match(listSrc, /<ListSkeleton rows=\{6\} label="[^"]*" \/>/);
  assert.match(listSrc, /<ErrorState\n\s*title=\{error\}/);
  assert.match(listSrc, /Erneut versuchen/);
  assert.match(listSrc, /\{CANCELLATION_LIST_ERROR\}|CANCELLATION_LIST_ERROR/);
  assert.equal(/rows\.length === 0[\s\S]{0,200}error/.test(listSrc), false, "Fehler darf nicht als Leerzustand gelten");
  // Der Retry nutzt denselben Filter (load hängt an appliedStatus).
  assert.match(listSrc, /\}, \[appliedStatus, page\]\);/);
});

test("Liste: kein horizontales Scrollen, mobile Kartenansicht", () => {
  assert.match(cssSrc, /\.adm-canc-table table \{ min-width: 0; table-layout: fixed; \}/);

  // Die drei starren Spalten (Status-Badge, Kopf „EINGEGANGEN", Details-Button)
  // schrumpfen nie unter ihre Eigenbreite. `.table-card` hat `overflow: hidden`,
  // ein zu schmales Prozentmaß würde sie deshalb ABSCHNEIDEN statt scrollen.
  // Gemessen (Chromium, echte gebaute App): Badge 75px, Kopf 115px, Button 74px
  // — jeweils zzgl. 28px Zellpolsterung. Die festen Breiten müssen darüber
  // liegen, sonst kehrt der Anschnitt zurück.
  const MIN_PX = { 1: 84, 5: 103, 6: 115, 7: 102 };
  const fixedPx = {};
  for (const m of cssSrc.matchAll(/\.adm-canc-table th:nth-child\((\d)\)[^{]*\{ width: (\d+)px; \}/g)) {
    fixedPx[Number(m[1])] = Number(m[2]);
  }
  assert.deepEqual(Object.keys(fixedPx).map(Number).sort(), [1, 5, 6, 7],
    "genau Anfrage/Status/Eingegangen/Aktion haben feste Breiten");
  for (const [col, min] of Object.entries(MIN_PX)) {
    assert.ok(fixedPx[col] >= min, `Spalte ${col}: ${fixedPx[col]}px unterschreitet die gemessene Mindestbreite ${min}px`);
  }
  // Die drei inhaltsstarken Textspalten bleiben bewusst ohne Breitenangabe.
  for (const col of [2, 3, 4]) {
    assert.equal(new RegExp(`\\.adm-canc-table th:nth-child\\(${col}\\)`).test(cssSrc), false,
      `Spalte ${col} (Kunde/Sendung/Grund) darf keine feste Breite haben`);
  }

  assert.equal(/adm-canc-table[\s\S]{0,120}table-scroll/.test(listSrc), false, "kein Scroll-Wrapper mehr");
  assert.match(listSrc, /<ul className="adm-canc-cards">/);
  // Umschaltpunkt oberhalb der übrigen Admin-Listen (900px): sieben Spalten
  // passen neben der ~330px breiten Adminshell erst ab ca. 1020px Viewport.
  assert.match(cssSrc, /@media \(max-width: 1080px\) \{[\s\S]*?\.adm-canc-table \{ display: none; \}/);
  assert.match(cssSrc, /@media \(max-width: 1080px\) \{[\s\S]*?\.adm-canc-cards \{ display: flex; \}/);
  for (const m of [/<dt>Kunde<\/dt>/, /<dt>Sendung<\/dt>/, /<dt>Grund<\/dt>/, /<dt>Eingegangen<\/dt>/]) {
    assert.match(listSrc, m);
  }
  // Lange Gründe brechen kontrolliert und werden nicht unbegrenzt gerendert.
  assert.match(cssSrc, /\.adm-canc-reason \{[\s\S]*?-webkit-line-clamp: 3;/);
});

test("Detail: echtes <h1>, fachliche Karten, technische Infos eingeklappt", () => {
  // Seit Paket E rendert der gemeinsame Seitenkopf (PageHeader, variant="admin")
  // das <h1>; der frühere eigene Kartenkopf ist entfallen.
  assert.match(detailSrc, /<PageHeader\b/);
  assert.match(detailSrc, /title=\{`Stornierungsanfrage \$\{cancellationLabel\(req\)/);
  assert.match(detailSrc, /<details className="adm-card adm-tech">/);
  for (const k of ["Anfrage-ID (intern)", "Kunden-ID (intern)", "Sendungs-ID (intern)", "Revision"]) {
    assert.ok(detailSrc.includes(k), `technisches Feld ${k} fehlt`);
  }
  assert.match(detailSrc, /Kundenkonto öffnen/);
  assert.match(detailSrc, /Sendung öffnen/);
  assert.match(detailSrc, /\["Bestellnummer", ship\.known/);
  // Der volle Grund steht nur hier.
  assert.match(detailSrc, /<p className="adm-reason">\{String\(req\.reason\)\}<\/p>/);
  // reviewedBy ist ein OBJEKT { id, name } — es darf nie roh gerendert werden.
  assert.equal(/dash\(req\.reviewedBy\)\]/.test(detailSrc), false, "reviewedBy wurde roh gerendert");
  assert.match(detailSrc, /const reviewerName = req\.reviewedBy && typeof req\.reviewedBy === "object"/);
  // Kein Text, der eine Carrierstornierung suggeriert.
  assert.match(detailSrc, /keine<\/strong> Stornierung beim/);
});

test("Detail: Optimistic-Locking-Konflikt wird verständlich aufgelöst", () => {
  const body = { error: "…", code: "CANCELLATION_REQUEST_CONFLICT",
    current: { id: 7, status: "in_review", revision: 3, adminNote: "Notiz", updatedAt: "2026-07-29T11:00:00Z" } };
  const c = readCancellationConflict(409, body);
  assert.equal(c.conflict, true);
  assert.equal(c.current.revision, 3);
  assert.equal(c.current.status, "in_review");
  // Kein Konflikt bei anderem Status/Code.
  assert.equal(readCancellationConflict(200, body).conflict, false);
  assert.equal(readCancellationConflict(409, { code: "ANDERES" }).conflict, false);
  // Älteres Backend ohne `current` → sauber null statt Absturz.
  assert.deepEqual(readCancellationConflict(409, { code: "CANCELLATION_REQUEST_CONFLICT" }), { conflict: true, current: null });
  // Der Stand wird NIE automatisch übernommen — erst auf Klick.
  assert.deepEqual(applyConflictState(c.current), { status: "in_review", adminNote: "Notiz", revision: 3 });
  assert.equal(applyConflictState(null), null);
  // Die Seite zeigt Meldung + zwei Aktionen, als Live-Region.
  assert.match(detailSrc, /<div className="adm-conflict" role="alert" aria-live="assertive">/);
  assert.match(detailSrc, /\{CANCELLATION_CONFLICT_TEXT\}/);
  assert.match(detailSrc, /\{CANCELLATION_CONFLICT_RELOAD\}/);
  assert.match(detailSrc, /onClick=\{\(\) => setConflict\(null\)\}/);
  // Kein automatisches Überschreiben, keine lokale Revisionserhöhung.
  assert.equal(/revision \+ 1|revision\+\+|setBaseline\(\{[^}]*revision: revision \+/.test(detailSrc), false,
    "die lokale Revision darf nie selbst erhöht werden");
  assert.match(detailSrc, /setConflict\(\{ current: c\.current \}\);/);
});

test("Detail: terminale Entscheidungen laufen über den zentralen Bestätigungsdialog", () => {
  assert.equal(CANCELLATION_DECISION_DIALOG.accepted.title, "Stornierungsanfrage annehmen?");
  assert.match(CANCELLATION_DECISION_DIALOG.accepted.text, /keine automatische Carrier- oder JUMiNGO-Stornierung/);
  assert.equal(CANCELLATION_DECISION_DIALOG.rejected.title, "Stornierungsanfrage ablehnen?");
  assert.match(CANCELLATION_DECISION_DIALOG.rejected.text, /protokolliert/);
  assert.match(detailSrc, /<ConfirmDialog/);
  assert.match(detailSrc, /const pendingDecision = statusDirty && \(editStatus === "accepted" \|\| editStatus === "rejected"\)/);
  assert.match(detailSrc, /if \(pendingDecision\) \{ setDecision\(pendingDecision\); return; \}/);
  assert.match(detailSrc, /onClick=\{requestSave\} disabled=\{!canSave\}/, "Doppelklickschutz über canSave");
  // Der zentrale Dialog bringt Fokus, Escape und Fokusrückgabe mit.
  // Seit Paket A, Phase 3 liefert der gemeinsame Hook Fokusfalle,
  // Fokusrückgabe und Escape — die Zusicherung ist dieselbe, nur an einer Stelle.
  const dlg = _strip(_read("components/admin/ConfirmDialog.jsx"));
  assert.match(dlg, /useDialog\(\{ onClose: onCancel, closeOnEscape: !busy \}\)/,
    "der Dialog nutzt den gemeinsamen Hook und sperrt Escape während des Requests");
  const hook = _strip(_read("hooks/useDialog.js"));
  assert.match(hook, /erste\.focus\(\)/, "Fokus beim Öffnen");
  assert.match(hook, /e\.key === "Escape"/, "Escape schließt");
  assert.match(hook, /ziel\.focus\(\)/, "Fokus kehrt zum Auslöser zurück");
  assert.match(hook, /e\.key !== "Tab"/, "Fokusfalle");
});

test("Selbsttest: die Prüflogik greift tatsächlich", () => {
  for (const [label, src] of [["liste", listSrc], ["detail", detailSrc], ["adminApi", adminApiSrc]]) {
    assert.ok(src.length > 800, `${label}: Quelle wirkt leer (${src.length} Zeichen)`);
  }
  assert.ok(cssSrc.length > 5000, "Stylesheet wirkt leer");
  // Kernaussagen sind keine Tautologien.
  assert.notEqual(cancellationStatusMeta("pending")[1], cancellationStatusMeta("in_review")[1]);
  assert.notEqual(cancellationShipmentCell({ shipment: { id: 1 } }).primary,
                  cancellationShipmentCell({ shipment: { id: 1, orderNumber: "JU-1" } }).primary);
  assert.notEqual(cancellationEmptyState({ count: 0 }).title, cancellationEmptyState({ count: 0, status: "accepted" }).title);
  assert.equal(('<th scope="col">A</th><th scope="col">B</th>'.match(/<th scope="col"/g) || []).length, 2);
  // Und der Pfadtest würde eine Drift wirklich bemerken.
  assert.equal(adminApiSrc.includes("/api/admin/cancellation-requests"), false);
});
