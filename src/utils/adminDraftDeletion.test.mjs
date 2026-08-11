// Governance der adminseitigen Entwurfsaufräumung (Admin → Sendungen).
//
// Zwei Ebenen:
//   A) reine Anzeigelogik (adminShipmentView.mjs) — direkt aufgerufen, echte Rückgabewerte
//   B) Verdrahtung der Seite/API (Quelltext) — dass die Aktion NUR bei Entwürfen erscheint,
//      über den gemeinsamen Dialog läuft, doppelte Anfragen verhindert und den Filterzustand
//      nicht verwirft.
// Das interaktive Verhalten (Dialog öffnen, Abbrechen ohne Request, DELETE, deletedCount)
// deckt tests/e2e/adminDraftDeletion.test.mjs gegen einen echten Dev-Server ab.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  canDeleteShipmentDraft,
  selectDeletableDraftTotal,
  draftDeleteError,
  draftBulkDeleteError,
  draftBulkDeleteMessage,
  draftBulkConfirmLabel,
  draftBulkConfirmText,
  DRAFT_DELETE_ERRORS,
} from "./adminShipmentView.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = read("pages/admin/AdminShipmentsPage.jsx");
const pageCode = stripJs(page);
const api = read("api/adminApi.js");

/* ══════════ A — Anzeigelogik ═══════════════════════════════════════════════ */

test("1 — die Löschaktion erscheint ausschließlich bei Zeilen im Status „Entwurf\"", () => {
  assert.equal(canDeleteShipmentDraft({ id: 1, status: "draft" }), true);
  assert.equal(canDeleteShipmentDraft({ id: 1, status: "DRAFT" }), true, "Groß-/Kleinschreibung darf nicht entscheiden");
  for (const status of ["booking", "booked", "label_ready", "cancelled", "delivered", "", null, undefined]) {
    assert.equal(canDeleteShipmentDraft({ id: 1, status }), false, `Status ${JSON.stringify(status)} darf keine Löschaktion zeigen`);
  }
});

test("2 — ohne ID gibt es kein Ziel und damit keine Aktion", () => {
  assert.equal(canDeleteShipmentDraft({ status: "draft" }), false);
  assert.equal(canDeleteShipmentDraft({ id: null, status: "draft" }), false);
  for (const kaputt of [null, undefined, 42, "text", []]) {
    assert.equal(canDeleteShipmentDraft(kaputt), false, `${JSON.stringify(kaputt)} darf keine Aktion zeigen`);
  }
});

test("3 — die Entwurfszahl kommt aus der Serverantwort, nie aus den geladenen Zeilen", () => {
  assert.equal(selectDeletableDraftTotal({ deletableDraftTotal: 23 }), 23);
  assert.equal(selectDeletableDraftTotal({ deletableDraftTotal: 0 }), 0);
  // Unbrauchbar/fehlend → null. Dann nennt der Dialog bewusst KEINE Zahl (Test 6).
  for (const d of [{}, null, undefined, { deletableDraftTotal: -1 }, { deletableDraftTotal: "23" },
    { deletableDraftTotal: NaN }, { deletableDraftTotal: null }]) {
    assert.equal(selectDeletableDraftTotal(d), null, `${JSON.stringify(d)} muss null ergeben`);
  }
  // Die gefilterte Listenzahl wird NICHT als Entwurfszahl missverstanden.
  assert.equal(selectDeletableDraftTotal({ pagination: { total: 99 } }), null);
});

test("4 — die Erfolgsmeldung nennt exakt die vom Backend gemeldete Anzahl", () => {
  assert.equal(draftBulkDeleteMessage(17), "17 Entwürfe wurden gelöscht.");
  assert.equal(draftBulkDeleteMessage(1), "1 Entwurf wurde gelöscht.");
  assert.equal(draftBulkDeleteMessage(0), "Es sind keine Entwürfe mehr vorhanden.");
  // Unbrauchbare Werte werden nicht zu einer erfundenen Zahl.
  for (const bad of [undefined, null, NaN, "17", -5]) {
    assert.equal(draftBulkDeleteMessage(bad), "Es sind keine Entwürfe mehr vorhanden.", `${JSON.stringify(bad)}`);
  }
});

test("5 — 409 erklärt den Statuswechsel, 404 die verschwundene Zeile, 401/403 schweigen", () => {
  assert.match(draftDeleteError(409), /Status inzwischen geändert/);
  assert.match(draftDeleteError(404), /existiert nicht mehr/);
  assert.equal(draftDeleteError(429), DRAFT_DELETE_ERRORS[429]);
  assert.equal(draftDeleteError(500), DRAFT_DELETE_ERRORS.default);
  assert.equal(draftDeleteError(0), DRAFT_DELETE_ERRORS.default, "Netzwerkfehler bekommt die Sammelmeldung");
  // 401/403 → null: der zentrale Auth-Handler übernimmt Logout/Redirect.
  assert.equal(draftDeleteError(401), null);
  assert.equal(draftDeleteError(403), null);
  assert.equal(draftBulkDeleteError(401), null);
  assert.equal(draftBulkDeleteError(403), null);
  assert.match(draftBulkDeleteError(500), /konnten nicht gelöscht werden/);
});

test("6 — ohne bekannte Zahl wird keine geschätzt", () => {
  assert.equal(draftBulkConfirmLabel(23), "23 Entwürfe löschen");
  assert.equal(draftBulkConfirmLabel(1), "1 Entwurf löschen");
  for (const unbekannt of [null, undefined, NaN, 0, -3]) {
    assert.equal(draftBulkConfirmLabel(unbekannt), "Alle Entwürfe löschen", `${JSON.stringify(unbekannt)}`);
    assert.match(draftBulkConfirmText(unbekannt), /Alle derzeit vorhandenen Sendungsentwürfe/);
    assert.ok(!/\d/.test(draftBulkConfirmText(unbekannt).replace(/[^\d]/g, "")), "ohne bekannte Zahl darf keine im Text stehen");
  }
  assert.match(draftBulkConfirmText(23), /23 Entwürfe werden endgültig gelöscht/);
  assert.match(draftBulkConfirmText(1), /1 Entwurf wird endgültig gelöscht/);
});

test("7 — beide Bulk-Texte sagen ausdrücklich, was NICHT betroffen ist", () => {
  for (const total of [23, null]) {
    assert.match(draftBulkConfirmText(total), /Gebuchte, stornierte oder abgeschlossene Sendungen sind davon nicht betroffen\./);
  }
});

/* ══════════ B — Verdrahtung ════════════════════════════════════════════════ */

test("8 — die Zeilenaktion hängt an canDeleteShipmentDraft, nicht an einer eigenen Statusprüfung", () => {
  assert.ok(pageCode.includes("canDeleteShipmentDraft(row)"), "die Seite nutzt den gemeinsamen Helfer nicht");
  // Genau zwei Auftreten: Tabellenzeile und Mobilkarte.
  assert.equal((pageCode.match(/canDeleteShipmentDraft\(row\)/g) || []).length, 2,
    "erwartet: Tabelle UND Mobilkarte hängen an derselben Bedingung");
  // Keine handgeschriebene Statusprüfung daneben.
  assert.ok(!/status\s*===\s*["']draft["']/.test(pageCode), "die Seite prüft den Status selbst statt über den Helfer");
});

test("9 — die Sammelaktion erscheint nur, wenn es tatsächlich Entwürfe gibt", () => {
  assert.match(pageCode, /Number\.isFinite\(draftTotal\) && draftTotal > 0 && \(/,
    "der Bulk-Knopf hängt nicht an einer positiven Entwurfszahl");
});

test("10 — beide Bestätigungen laufen über den gemeinsamen ConfirmDialog, nie über confirm()", () => {
  assert.ok(page.includes('import { ConfirmDialog } from "../../components/admin/ConfirmDialog"'), "ConfirmDialog nicht eingebunden");
  assert.equal((pageCode.match(/<ConfirmDialog/g) || []).length, 2, "erwartet genau zwei Dialoge (einzeln + Sammel)");
  for (const verboten of ["window.confirm", "confirm(", "window.alert", "alert("]) {
    assert.ok(!pageCode.includes(verboten), `natives ${verboten} ist nicht zulässig`);
  }
  // Beide sind als destruktiv gekennzeichnet.
  assert.equal((pageCode.match(/\bdanger\b/g) || []).length >= 2, true, "beide Dialoge müssen als destruktiv markiert sein");
});

test("11 — ein laufender Request sperrt Auslöser und Dialoge (kein Doppel-Submit)", () => {
  assert.ok(pageCode.includes("if (!pendingDelete || deleteBusy) return;"), "Einzellöschung ohne Doppelklick-Schutz");
  assert.ok(pageCode.includes("if (deleteBusy) return;"), "Sammellöschung ohne Doppelklick-Schutz");
  assert.ok(pageCode.includes("busy={deleteBusy}"), "der Dialog kennt den Ladezustand nicht");
  assert.ok(pageCode.includes("disabled={deleteBusy}"), "die Zeilenaktion bleibt während des Requests klickbar");
  // Und der Dialog lässt sich währenddessen nicht wegklicken.
  assert.match(pageCode, /const closeDialogs = \(\) => \{\s*if \(deleteBusy\) return;/);
});

test("12 — nach Erfolg wird die Liste neu geladen, der Filterzustand bleibt", () => {
  // load() liest `applied` + `page` aus dem State — ein erneuter Aufruf verwirft die Filter
  // nicht. Entscheidend ist, dass NICHT resetFilters() läuft und kein Browser-Reload erzwungen
  // wird; die Rückmeldung soll stehen bleiben.
  const single = pageCode.slice(pageCode.indexOf("const confirmSingleDelete"), pageCode.indexOf("const confirmBulkDelete"));
  const bulk = pageCode.slice(pageCode.indexOf("const confirmBulkDelete"), pageCode.indexOf("const chips ="));
  for (const [name, slice] of [["Einzellöschung", single], ["Sammellöschung", bulk]]) {
    assert.ok(/load\(\);/.test(slice), `${name}: kein Neuladen nach Erfolg`);
    assert.ok(!/resetFilters\(|setApplied\(|setDraft\(/.test(slice), `${name}: verwirft den Filterzustand`);
    assert.ok(!/location\.reload|window\.location/.test(slice), `${name}: erzwingt einen Browser-Reload`);
  }
  // Die Einzellöschung entfernt EINE Zeile — die aktuelle Seite bleibt gültig, also bleibt
  // der Admin, wo er ist.
  assert.ok(!/setPage\(/.test(single), "Einzellöschung: springt ohne Anlass auf eine andere Seite");
  // Die Sammellöschung verkleinert die Ergebnismenge systemweit. Genau wie applyFilters()
  // und resetFilters() muss sie deshalb auf Seite 1 zurück — sonst landet ein Admin, der auf
  // Seite 3 aufgeräumt hat, auf einer nun leeren Seite. Der Seitenwechsel löst den Ladeeffekt
  // aus; nur auf Seite 1 wird direkt neu geladen (kein doppelter Abruf).
  assert.match(
    bulk,
    /if \(page !== 1\) setPage\(1\);\s*\n\s*else await load\(\);/,
    "Sammellöschung: kein Rücksprung auf Seite 1 (oder doppelter Listenabruf)",
  );
});

test("13 — die Erfolgszahl stammt aus der Antwort, nicht aus der geladenen Liste", () => {
  const bulk = pageCode.slice(pageCode.indexOf("const confirmBulkDelete"), pageCode.indexOf("const chips ="));
  assert.ok(bulk.includes("draftBulkDeleteMessage(Number(d?.deletedCount))"),
    "die Meldung wird nicht aus deletedCount der Antwort gebildet");
  assert.ok(!/rows\.length|draftTotal/.test(bulk.replace(/setDeleteNotice[^\n]*/g, "")),
    "die Sammellöschung leitet ihre Zahl aus lokalem State ab");
});

test("14 — 404/409 laden die Liste nach, damit der Admin den echten Stand sieht", () => {
  const single = pageCode.slice(pageCode.indexOf("const confirmSingleDelete"), pageCode.indexOf("const confirmBulkDelete"));
  assert.match(single, /if \(r\.status === 404 \|\| r\.status === 409\) await load\(\);/);
});

test("15 — die API-Aufrufe sind minimal: kein Body, keine IDs, keine Filter im Bulk", () => {
  assert.match(api, /export function deleteAdminShipmentDraft\(id\) \{/);
  assert.match(api, /apiFetch\(`\/admin\/shipments\/\$\{encodeURIComponent\(id\)\}\/draft`, \{\s*method: "DELETE",\s*auth: true,\s*\}\)/);
  assert.match(api, /export function deleteAllAdminShipmentDrafts\(\) \{/);
  assert.match(api, /apiFetch\(`\/admin\/shipments\/drafts`, \{\s*method: "DELETE",\s*auth: true,\s*\}\)/);
  // Der Bulk-Aufruf darf weder Parameter noch Body tragen — die Menge bestimmt der Server.
  const bulkFn = api.slice(api.indexOf("export function deleteAllAdminShipmentDrafts"), api.indexOf("// GET /admin/shipments/:id "));
  assert.ok(!/body:/.test(bulkFn), "der Bulk-Aufruf sendet einen Body");
  assert.ok(!/buildQuery|\?|params/.test(bulkFn.replace(/\/\/.*$/gm, "")), "der Bulk-Aufruf sendet Query-Parameter");
});

test("16 — keine neue Icon-Abhängigkeit; das bestehende Icon-System trägt die Aktion", () => {
  assert.ok(pageCode.includes('n="trash"'), "das Trash-Icon des bestehenden Systems fehlt");
  const icons = read("components/ui/Icon.jsx");
  assert.ok(/\btrash\b\s*:/.test(icons), "trash ist im gemeinsamen Icon-Satz nicht definiert");
  assert.ok(!/lucide|react-icons|@heroicons/.test(page), "neue Icon-Abhängigkeit eingeführt");
});

test("17 — die Rückmeldung ist für Screenreader ausgezeichnet", () => {
  assert.match(pageCode, /role="status"/, "Erfolgsmeldung ohne role=status");
  assert.match(pageCode, /role="alert"/, "Fehlermeldung ohne role=alert");
  // Der reine Icon-Knopf der Tabelle trägt einen Namen.
  assert.match(pageCode, /aria-label=\{`Entwurf \$\{shipmentIdentity\(row\)\.primary\} löschen`\}/);
  assert.match(pageCode, /title="Entwurf löschen"/);
});

test("18 — die Sammelaktion konkurriert nicht mit „Aktualisieren\" und steht nicht in den Filtern", () => {
  // Beide Knöpfe liegen im actions-Slot des Seitenkopfs …
  const header = pageCode.slice(pageCode.indexOf("<PageHeader"), pageCode.indexOf("<form className=\"adm-filters\""));
  assert.ok(header.includes("draftBulkConfirmLabel(draftTotal)"), "der Bulk-Knopf steht nicht im Seitenkopf");
  assert.ok(header.includes("Aktualisieren"), "Aktualisieren steht nicht mehr im Seitenkopf");
  // … und die Sammelaktion ist sekundär/destruktiv, nicht die primäre Aktion.
  assert.ok(!/btn-primary[^>]*draftBulkConfirmLabel/.test(header), "der Bulk-Knopf ist als primäre Aktion gestaltet");
  assert.ok(header.includes("adm-btn-danger"), "der Bulk-Knopf ist nicht als destruktiv gekennzeichnet");
  // Nicht im Filterformular.
  const filters = pageCode.slice(pageCode.indexOf("<form className=\"adm-filters\""), pageCode.indexOf("</form>"));
  assert.ok(!/draftBulkConfirmLabel|Entwürfe löschen/.test(filters), "die Sammelaktion steckt im Filterbereich");
});

test("19 — der Client bildet die serverseitigen Sicherheits-Guards NICHT halb nach", () => {
  // Die Anzeige entscheidet allein über den sichtbaren Status. Eine Teilkopie der
  // Backend-Bedingung (Ordernummer/Label/Tracking/Rechnung) würde Sicherheit vortäuschen.
  const view = stripJs(read("utils/adminShipmentView.mjs"));
  const fn = view.slice(view.indexOf("export function canDeleteShipmentDraft"), view.indexOf("export function selectDeletableDraftTotal"));
  for (const feld of ["order_number", "orderNumber", "label", "tracking", "invoice"]) {
    assert.ok(!fn.includes(feld), `canDeleteShipmentDraft prüft ${feld} — das gehört ausschließlich ins Backend`);
  }
});

test("20 — keine Mehrfachauswahl eingeführt (bewusst, siehe Bericht)", () => {
  // Die Tabelle besitzt keine Selection-Infrastruktur; eine solche nur für diese Aktion
  // aufzubauen wäre laut Auftrag ausdrücklich unerwünscht.
  for (const marker of ['type="checkbox"', "selectedIds", "toggleSelect", "selectAll"]) {
    assert.ok(!pageCode.includes(marker), `unerwartete Mehrfachauswahl-Infrastruktur: ${marker}`);
  }
});
