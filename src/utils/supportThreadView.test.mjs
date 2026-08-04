// Support-Nachrichtenverlauf (Kunde + Admin) — Logik und Strukturverträge.
//
// Run: node --test src/utils/supportThreadView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  SUPPORT_REPLY_MIN, SUPPORT_REPLY_MAX, SUPPORT_MESSAGE_MIN,
  supportReplyState, supportAuthorLabel,
} from "./supportRequest.mjs";
import {
  adminReplyState, ADMIN_REPLY_MIN, supportReplyStateMeta, needsAdminReply,
  normalizeSupportRequest, ADMIN_REPLY_PUBLIC_HINT, ADMIN_NOTE_INTERNAL_HINT,
} from "./adminSupportView.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const thread = read("components/support/SupportThread.jsx");
const listView = read("components/support/SupportRequestsView.jsx");
const dialog = read("components/support/SupportRequestDialog.jsx");
const supportApi = read("api/supportApi.js");
const adminDetail = read("pages/admin/AdminSupportRequestDetailPage.jsx");
const adminList = read("pages/admin/AdminSupportRequestsPage.jsx");
const adminApi = read("api/adminApi.js");
const dashPage = read("pages/DashboardPage.jsx");

// ═══ A) Antwortlänge ════════════════════════════════════════════════════════

test("1 — kurze Antworten wie „Danke\" sind gültig", () => {
  for (const text of ["Danke", "ok", "Ja, bitte", "Passt"]) {
    assert.equal(supportReplyState(text).valid, true, `„${text}" wurde abgelehnt`);
    assert.equal(adminReplyState(text).valid, true, `Admin: „${text}" wurde abgelehnt`);
  }
});

test("2 — die Antwortgrenze ist NIEDRIGER als die einer neuen Anfrage", () => {
  // Sonst wären genau die normalen kurzen Antworten unmöglich.
  assert.ok(SUPPORT_REPLY_MIN < SUPPORT_MESSAGE_MIN,
    `Antwortgrenze ${SUPPORT_REPLY_MIN} liegt nicht unter der Anfragegrenze ${SUPPORT_MESSAGE_MIN}`);
  assert.equal(SUPPORT_REPLY_MIN, ADMIN_REPLY_MIN, "Kunde und Admin haben unterschiedliche Grenzen");
});

test("3 — leere und übergroße Antworten sind ungültig", () => {
  for (const bad of ["", " ", "\n", "x", null, undefined, 5]) {
    assert.equal(supportReplyState(bad).valid, false, `${JSON.stringify(bad)} akzeptiert`);
  }
  assert.equal(supportReplyState("a".repeat(SUPPORT_REPLY_MAX)).valid, true);
  assert.equal(supportReplyState("a".repeat(SUPPORT_REPLY_MAX + 1)).valid, false);
  assert.equal(supportReplyState("a".repeat(SUPPORT_REPLY_MAX + 1)).tooLong, true);
});

test("4 — die Rollenbezeichnung nennt nie einen einzelnen Mitarbeiter", () => {
  assert.equal(supportAuthorLabel("customer"), "Sie");
  assert.equal(supportAuthorLabel("admin"), "ConfidaraExpress Support");
  // Der Kundenendpunkt liefert gar keinen Bearbeiternamen im Verlauf.
  assert.ok(!/handledBy|handler_name|authorName/.test(thread),
    "der Verlauf zeigt einen Bearbeiternamen");
});

// ═══ B) Kundensicht ═════════════════════════════════════════════════════════

test("5 — der Verlauf wird als reiner Text gerendert", () => {
  // Ohne Kommentare: die Dateien halten den Verzicht ausdrücklich fest —
  // geprüft wird der Code, nicht seine Begründung.
  assert.ok(!/dangerouslySetInnerHTML/.test(stripComments(thread)), "SupportThread nutzt dangerouslySetInnerHTML");
  assert.ok(!/dangerouslySetInnerHTML/.test(stripComments(listView)), "SupportRequestsView nutzt dangerouslySetInnerHTML");
  assert.match(thread, /<p className="sup-msg-body">\{m\.message\}<\/p>/);
  // Zeilenumbrüche bleiben über CSS erhalten, nicht über Markup.
  assert.match(read("styles/support.css"), /\.sup-msg-body \{[^}]*white-space: pre-wrap/s);
});

test("6 — die Nachrichtenreihenfolge kommt vom Server, nicht aus einer Clientsortierung", () => {
  const code = stripComments(thread);
  assert.ok(!/\.sort\(/.test(code), "der Verlauf wird clientseitig umsortiert");
  assert.match(code, /messages\.map\(\(m, i\) =>/);
});

test("7 — ein GET öffnet nichts; die Erledigung ist ein eigener, bestätigter Aufruf", () => {
  const code = stripComments(thread);
  // Erst laden …
  assert.match(code, /const r = await getSupportRequest\(requestId\);/);
  // … dann ausdrücklich mit der zuletzt gesehenen ID bestätigen.
  assert.match(code, /const through = Number\(d\.latestMessageId\);/);
  assert.match(code, /if \(Number\.isInteger\(through\) && through > 0\) \{/,
    "es wird auch ohne echte Nachricht bestätigt");
  assert.match(code, /confirmSupportViewed\(requestId, through\)/);
  // Die Bestätigung steht NACH dem erfolgreichen Laden.
  // Gegen den AUFRUF prüfen — der Import steht naturgemäß ganz oben.
  assert.ok(code.indexOf("setData(d)") < code.indexOf("confirmSupportViewed(requestId"),
    "bestätigt wird vor dem erfolgreichen Laden");
});

test("8 — der Viewed-Aufruf ist ein POST mit throughMessageId", () => {
  assert.match(supportApi, /export function confirmSupportViewed\(id, throughMessageId\)/);
  assert.match(supportApi, /body: JSON\.stringify\(\{ throughMessageId \}\)/);
  assert.match(supportApi, /\/viewed`/);
});

test("9 — Reopen wird dem Kunden erklärt", () => {
  assert.match(thread, /if \(d && d\.reopened\) setReopened\(true\);/);
  assert.match(thread, /SUPPORT_REOPEN_HINT/);
  assert.match(thread, /Ihre Antwort öffnet diesen Vorgang wieder\./,
    "bei geschlossenem Vorgang fehlt der Hinweis vor dem Senden");
});

test("10 — Doppelsenden ist blockiert", () => {
  const code = stripComments(thread);
  assert.match(code, /const inFlight = useRef\(false\);/);
  assert.match(code, /if \(inFlight\.current \|\| !state\.valid\) return;/);
  assert.match(code, /disabled=\{!state\.valid \|\| sending\}/);
});

test("11 — Lade-, Fehler- und Sendezustände sind vorhanden", () => {
  assert.match(thread, /Vorgang wird geladen …/);
  assert.match(thread, /role="alert"/);
  assert.match(thread, /Erneut versuchen/);
  assert.match(thread, /Wird gesendet …/);
  assert.match(listView, /Ihre Anfragen werden geladen …/);
  assert.match(listView, /SUPPORT_LIST_EMPTY_TITLE/);
  assert.match(listView, /SUPPORT_CUSTOMER_LIST_ERROR/);
});

test("12 — interne Vermerke sind im Kundenbereich nirgends vorgesehen", () => {
  for (const [name, code] of [["thread", thread], ["listView", listView], ["api", supportApi]]) {
    assert.ok(!/adminNote|admin_note/.test(code), `${name} liest den internen Vermerk`);
    assert.ok(!/visibility.*internal/.test(code), `${name} kennt interne Sichtbarkeit`);
  }
});

test("13 — der Kundenbereich spricht nicht von Live-Chat", () => {
  for (const [name, raw] of [["thread", thread], ["listView", listView], ["dialog", dialog]]) {
    const code = stripComments(raw);
    assert.ok(!/Live-?Chat|chatten|tippt gerade|online/i.test(code), `${name} suggeriert einen Live-Chat`);
  }
});

// ═══ C) Alte, jetzt falsche Aussagen ════════════════════════════════════════

test("14 — kein Text behauptet mehr, es gebe keinen Nachrichtenverlauf", () => {
  const all = [thread, listView, dialog, supportApi, read("utils/supportRequest.mjs"),
               read("components/layout/DashboardSidebar.jsx")].join("\n");
  for (const veraltet of [
    "kein Nachrichtenverlauf", "keinen Nachrichtenverlauf",
    "gibt es keinen Nachrichtenverlauf", "kein Ticketsystem",
    "ausschließlich per E-Mail beantwortet",
  ]) {
    assert.ok(!all.includes(veraltet), `veralteter Text gefunden: „${veraltet}"`);
  }
});

test("15 — der Erfolgsdialog verweist auf den Verlauf und bietet den Direkteinstieg", () => {
  assert.match(dialog, /Nachrichtenverlauf des Vorgangs/);
  assert.match(dialog, /Vorgang öffnen/);
  assert.match(dialog, /onCreated \&\& success\.id/);
  // Die bestehende einfache Erstellung bleibt möglich (Schließen ohne Öffnen).
  assert.match(dialog, /onClick=\{onClose\}>Schließen<\/button>/);
});

test("16 — die Sidebar-Supportkarte ist unverändert geblieben", () => {
  const sidebar = read("components/layout/DashboardSidebar.jsx");
  assert.match(sidebar, /className="pp-scard"/);
  assert.match(sidebar, /setSupportOpen\(true\)/);
  assert.match(sidebar, /SUPPORT_CARD\.action/);
  // Zusätzlich gibt es jetzt einen Weg zu den bestehenden Vorgängen.
  assert.match(sidebar, /\{ id: "support", label: "Supportanfragen", icon: "mail" \}/);
});

test("17 — Deep-Link und Seite sind verdrahtet", () => {
  assert.match(dashPage, /page === "support"/);
  assert.match(dashPage, /initialTicketId=\{supportTicketId\}/);
  assert.match(dashPage, /const ticket = parseInt\(params\.get\("ticket"\), 10\);/);
  assert.match(dashPage, /Number\.isInteger\(ticket\) && ticket > 0 \? ticket : null/,
    "die Ticket-ID wird nicht als geprüfte Ganzzahl übernommen");
  // Lazy geladen wie alle Seiten (Projektregel), auf Modulebene definiert.
  assert.match(dashPage, /const SupportRequestsView = React\.lazy\(/);
  const beforeComponent = dashPage.slice(0, dashPage.indexOf("export default function DashboardPage"));
  assert.ok(beforeComponent.includes("SupportRequestsView = React.lazy"),
    "der Lazy-Import steht in der Komponente statt auf Modulebene");
});

// ═══ D) Adminsicht ══════════════════════════════════════════════════════════

test("18 — öffentliche Antwort und interner Vermerk sind getrennte Wege", () => {
  assert.match(adminApi, /export function replyAdminSupportRequest\(id, message\)/);
  assert.match(adminApi, /\/messages`/);
  assert.match(adminApi, /body: JSON\.stringify\(\{ message \}\)/);
  // Kein visibility-Feld aus dem Client: das setzt der Server.
  const fn = adminApi.slice(adminApi.indexOf("replyAdminSupportRequest"));
  assert.ok(!/visibility/.test(fn.slice(0, 400)), "der Client sendet eine Sichtbarkeit");
  // Der PATCH bleibt für Status/Vermerk zuständig.
  assert.match(adminApi, /export function updateAdminSupportRequest/);
});

test("19 — die Adminoberfläche kennzeichnet öffentlich vs. intern eindeutig", () => {
  assert.match(adminDetail, /ADMIN_REPLY_PUBLIC_HINT/);
  assert.match(adminDetail, /ADMIN_NOTE_INTERNAL_HINT/);
  assert.match(ADMIN_REPLY_PUBLIC_HINT, /für den Kunden.*sichtbar/);
  assert.match(ADMIN_NOTE_INTERNAL_HINT, /Nur intern/);
  assert.match(ADMIN_NOTE_INTERNAL_HINT, /keine Benachrichtigung/);
  assert.match(adminDetail, /Antwort an Kunden senden/);
});

test("20 — der Adminverlauf zeigt beide Seiten und schützt vor Doppelsenden", () => {
  assert.match(adminDetail, /className="adm-sup-thread"/);
  assert.match(adminDetail, /adm-sup-msg-\$\{m\.authorRole === "admin" \? "admin" : "customer"\}/);
  assert.match(adminDetail, /const replyInFlight = useRef\(false\);/);
  assert.match(adminDetail, /if \(!state\.valid \|\| replyInFlight\.current\) return;/);
  assert.ok(!/dangerouslySetInnerHTML/.test(stripComments(adminDetail)));
});

test("21 — die bestehende Statusbearbeitung ist unbeschädigt", () => {
  // Revision, Optimistic Locking und Vermerk bleiben unverändert erhalten.
  assert.match(adminDetail, /SUPPORT_CONFLICT_TEXT/);
  assert.match(adminDetail, /readSupportConflict/);
  assert.match(adminDetail, /isSupportStatusDirty/);
  assert.match(adminDetail, /isSupportNoteDirty/);
  assert.match(adminDetail, /updateAdminSupportRequest/);
  // Und die Antwort verändert weder Status noch Revision (eigener Endpunkt).
  const submit = adminDetail.slice(adminDetail.indexOf("const submitReply"), adminDetail.indexOf("if (loading)"));
  assert.ok(!/revision/.test(submit), "die Antwort sendet eine Revision");
  assert.ok(!/editStatus/.test(submit), "die Antwort verändert den Status");
});

test("22 — „Neue Kundenantwort\" wird serverseitig abgeleitet und nur angezeigt", () => {
  assert.deepEqual(supportReplyStateMeta({ replyState: "customer_reply" }), ["badge-yellow", "Neue Kundenantwort"]);
  assert.deepEqual(supportReplyStateMeta({ replyState: "new_request" }), ["badge-blue", "Antwort offen"]);
  assert.equal(supportReplyStateMeta({ replyState: null }), null);
  assert.equal(supportReplyStateMeta({}), null);
  assert.equal(needsAdminReply({ needsAdminReply: true }), true);
  assert.equal(needsAdminReply({ needsAdminReply: false }), false);
  assert.equal(needsAdminReply(null), false);
  // Die Liste zeigt es zusätzlich zum Status, nicht an seiner Stelle.
  assert.match(adminList, /<StatusBadge row=\{row\} \/><ReplyStateBadge row=\{row\} \/>/);
});

test("23 — der Antwortbedarf wird NICHT clientseitig aus updated_at nachgerechnet", () => {
  const view = stripComments(read("utils/adminSupportView.mjs"));
  const fn = view.slice(view.indexOf("export function supportReplyStateMeta"), view.indexOf("export function needsAdminReply"));
  assert.ok(!/updatedAt|updated_at/.test(fn), "der Zustand wird aus updated_at abgeleitet");
  assert.match(fn, /row\.replyState/);
});

test("24 — die Normalisierung übernimmt Verlauf und Antwortbedarf defensiv", () => {
  const n = normalizeSupportRequest({
    id: 1, ticketNumber: "CE-SUP26-00001", status: "open",
    needsAdminReply: true, replyState: "customer_reply",
    messages: [
      { id: null, authorRole: "customer", message: "Erstanfrage", original: true },
      { id: 5, authorRole: "admin", message: "Antwort" },
      { id: 6, authorRole: "admin" },                 // ohne Text → verworfen
      { id: 7, authorRole: "hacker", message: "x" },  // unbekannte Rolle → verworfen
      null,
    ],
  });
  assert.equal(n.needsAdminReply, true);
  assert.equal(n.replyState, "customer_reply");
  assert.equal(n.messages.length, 2, "defekte Nachrichten wurden nicht verworfen");
  assert.equal(n.messages[0].original, true);
  assert.equal(n.messages[0].id, null, "die Erstanfrage darf keine Nachrichten-ID vortäuschen");
  assert.equal(n.messages[1].id, 5);
  // Ohne Serverfelder bleibt alles neutral.
  const leer = normalizeSupportRequest({ id: 2 });
  assert.deepEqual(leer.messages, []);
  assert.equal(leer.needsAdminReply, false);
  assert.equal(leer.replyState, null);
});

test("25 — es gibt keine Adminglocke (in dieser Ausbaustufe nicht vorgesehen)", () => {
  const adminLayout = read("components/layout/AdminLayout.jsx");
  const adminSidebar = read("components/layout/AdminSidebar.jsx");
  for (const [name, code] of [["AdminLayout", adminLayout], ["AdminSidebar", adminSidebar]]) {
    assert.ok(!/NotificationBell|NotificationsProvider/.test(code), `${name} enthält ein Glockensystem`);
  }
});
