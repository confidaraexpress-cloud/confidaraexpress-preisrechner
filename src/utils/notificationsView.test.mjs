// Benachrichtigungscenter — reine Ansichtslogik + Strukturverträge der Komponenten.
//
// Das Projekt testet ohne Rendering (kein jsdom, keine Testing-Library): reine
// Logik direkt, Komponentenverträge über den Quelltext. Dieselbe Bauart wie
// appShellChrome.test.mjs und adminSupportView.test.mjs.
//
// Run: node --test src/utils/notificationsView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  NOTIFICATION_TYPES, NOTIFICATION_TITLES, NOTIFICATION_ACTIONS,
  badgeLabel, showBadge, badgeAriaLabel, normalizeNotification, normalizeNotificationList,
  notificationSubline, notificationTarget, notificationHref, relativeTime,
  readUnreadCount, readSnapshot, POLL_INTERVAL_MS, isNotificationType,
} from "./notificationsView.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const bell = read("components/notifications/NotificationBell.jsx");
const panel = read("components/notifications/NotificationPanel.jsx");
const ctx = read("context/NotificationsContext.jsx");
const api = read("api/notificationsApi.js");
const dashPage = read("pages/DashboardPage.jsx");
const dashLayout = read("components/layout/DashboardLayout.jsx");
const overview = read("components/dashboard/Overview.jsx");
const invoices = read("components/dashboard/InvoicesList.jsx");
const css = read("styles/notifications.css");
const stateView = read("components/ui/StateView.jsx");

// ═══ A) Badge ═══════════════════════════════════════════════════════════════

test("1 — Badge: 0 wird nicht angezeigt", () => {
  assert.equal(badgeLabel(0), "");
  assert.equal(showBadge(0), false);
  assert.equal(showBadge(null), false);
  assert.equal(showBadge(undefined), false);
  assert.equal(showBadge(-2), false);
});

test("2 — Badge: 1 bis 9 als Zahl", () => {
  for (let i = 1; i <= 9; i++) {
    assert.equal(badgeLabel(i), String(i));
    assert.equal(showBadge(i), true);
  }
});

test("3 — Badge: ab 10 als 9+", () => {
  assert.equal(badgeLabel(10), "9+");
  assert.equal(badgeLabel(11), "9+");
  assert.equal(badgeLabel(250), "9+");
  assert.equal(showBadge(10), true);
});

test("4 — der Badge bleibt für Screenreader vorlesbar", () => {
  assert.equal(badgeAriaLabel(0), "Benachrichtigungen");
  assert.equal(badgeAriaLabel(1), "Benachrichtigungen: 1 ungelesen");
  assert.equal(badgeAriaLabel(12), "Benachrichtigungen: 12 ungelesen");
  // Die Zahl steht im aria-label des Knopfes; das visuelle "9+" ist aria-hidden.
  assert.match(bell, /aria-label=\{badgeAriaLabel\(unread\)\}/);
  assert.match(bell, /<span className="ntf-badge" aria-hidden="true">/);
});

// ═══ B) Normalisierung ══════════════════════════════════════════════════════

test("5 — es gibt genau die drei beauftragten Typen", () => {
  assert.deepEqual([...NOTIFICATION_TYPES].sort(), ["invoice_overdue", "invoice_ready", "support_reply"].sort());
  for (const t of NOTIFICATION_TYPES) {
    assert.ok(NOTIFICATION_TITLES[t], `Titel fehlt: ${t}`);
    assert.ok(NOTIFICATION_ACTIONS[t], `Aktion fehlt: ${t}`);
  }
  assert.equal(isNotificationType("payment_received"), false);
  assert.equal(isNotificationType("shipment_delivered"), false);
});

test("6 — die geforderten Texte stimmen wortgleich", () => {
  assert.equal(NOTIFICATION_TITLES.invoice_ready, "Neue Rechnung verfügbar");
  assert.equal(NOTIFICATION_TITLES.invoice_overdue, "Rechnung überfällig");
  assert.equal(NOTIFICATION_TITLES.support_reply, "Neue Antwort vom Support");
  assert.equal(NOTIFICATION_ACTIONS.invoice_ready, "PDF herunterladen");
  assert.equal(NOTIFICATION_ACTIONS.invoice_overdue, "Rechnung ansehen");
  assert.equal(NOTIFICATION_ACTIONS.support_reply, "Anfrage öffnen");
});

test("7 — unbrauchbare Einträge werden verworfen statt geraten", () => {
  assert.equal(normalizeNotification(null), null);
  assert.equal(normalizeNotification({}), null);
  assert.equal(normalizeNotification({ id: 0, type: "invoice_ready", invoiceId: 1 }), null);
  assert.equal(normalizeNotification({ id: 1, type: "unbekannt", invoiceId: 1 }), null);
  // Typ und Entität müssen zusammenpassen — sonst wäre die Aktion nicht bestimmbar.
  assert.equal(normalizeNotification({ id: 1, type: "invoice_ready", invoiceId: null }), null);
  assert.equal(normalizeNotification({ id: 1, type: "support_reply", supportRequestId: null }), null);
});

test("8 — eine gültige Meldung wird vollständig normalisiert", () => {
  const n = normalizeNotification({
    id: "5", type: "support_reply", supportRequestId: 7, ticketNumber: "CE-SUP26-00007",
    unseenCount: 3, createdAt: "t1", updatedAt: "t2", readAt: null,
  });
  assert.equal(n.id, 5);
  assert.equal(n.supportRequestId, 7);
  assert.equal(n.unseenCount, 3);
  assert.equal(n.read, false);
  assert.equal(n.title, "Neue Antwort vom Support");
  assert.equal(n.actionLabel, "Anfrage öffnen");
});

test("9 — gelesen wird ausschließlich aus readAt abgeleitet", () => {
  assert.equal(normalizeNotification({ id: 1, type: "invoice_ready", invoiceId: 2, readAt: null }).read, false);
  assert.equal(normalizeNotification({ id: 1, type: "invoice_ready", invoiceId: 2, readAt: "t" }).read, true);
});

test("10 — die Liste filtert defekte Einträge heraus, statt zu werfen", () => {
  const list = normalizeNotificationList({
    notifications: [
      { id: 1, type: "invoice_ready", invoiceId: 9 },
      null,
      { id: 2, type: "kaputt" },
      { id: 3, type: "support_reply", supportRequestId: 4 },
    ],
  });
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((n) => n.id), [1, 3]);
  assert.deepEqual(normalizeNotificationList(null), []);
  assert.deepEqual(normalizeNotificationList({}), []);
});

test("11 — mehrere ungesehene Antworten erscheinen als EINE aggregierte Zeile", () => {
  const n = normalizeNotification({
    id: 1, type: "support_reply", supportRequestId: 4, ticketNumber: "CE-SUP26-00004", unseenCount: 4,
  });
  assert.equal(n.unseenCount, 4);
  assert.equal(notificationSubline(n), "CE-SUP26-00004 · 4 neue Antworten");
  // Bei genau einer Antwort keine irreführende Zählung.
  const single = normalizeNotification({
    id: 2, type: "support_reply", supportRequestId: 4, ticketNumber: "CE-SUP26-00004", unseenCount: 1,
  });
  assert.equal(single.unseenCount, null);
  assert.equal(notificationSubline(single), "CE-SUP26-00004");
});

// ═══ C) Navigation ══════════════════════════════════════════════════════════

test("12 — das Ziel wird aus Typ und ID abgeleitet, nie aus einer Server-URL", () => {
  const inv = normalizeNotification({ id: 1, type: "invoice_ready", invoiceId: 42 });
  assert.deepEqual(notificationTarget(inv), { page: "invoices", invoice: 42 });
  const sup = normalizeNotification({ id: 2, type: "support_reply", supportRequestId: 7 });
  assert.deepEqual(notificationTarget(sup), { page: "support", ticket: 7 });

  // Der Normalisierer übernimmt gar kein URL-Feld — eine manipulierte Adresse aus
  // dem Payload kann das Frontend also nicht öffnen.
  const hostile = normalizeNotification({
    id: 3, type: "invoice_ready", invoiceId: 1,
    url: "https://boese.example/phish", href: "javascript:alert(1)", redirect: "//evil",
  });
  for (const k of ["url", "href", "redirect", "target"]) assert.ok(!(k in hostile), `${k} übernommen`);
  assert.equal(notificationHref(hostile), "/dashboard?page=invoices");
});

test("13 — Deep-Links sind kodiert und folgen dem ?page=-Modell", () => {
  const sup = normalizeNotification({ id: 1, type: "support_reply", supportRequestId: 12 });
  assert.equal(notificationHref(sup), "/dashboard?page=support&ticket=12");
  // Und die Zielseite steht in der Allowlist von DashboardPage. Geprüft wird das
  // ZIEL, nicht das Listenende: die Liste wurde seither additiv um die
  // Lagerbereiche verlängert, "support" bleibt aber unverändert enthalten.
  assert.match(dashPage, /"profile", "tracking", "support"[,\]]/);
});

test("14 — die Glocke navigiert nur über die geprüften Ziele", () => {
  const code = stripComments(bell);
  assert.match(code, /notificationTarget\(n\)/);
  assert.ok(!/window\.location/.test(code), "die Glocke setzt window.location");
  assert.ok(!/window\.open/.test(code), "die Glocke öffnet ein Fenster");
  assert.ok(!/n\.url|payload\.url/.test(code), "die Glocke liest eine URL aus dem Payload");
});

// ═══ D) Zeitangabe ══════════════════════════════════════════════════════════

test("15 — relative Zeit ist deterministisch und ohne Fehlerfall", () => {
  const now = new Date("2026-08-04T12:00:00Z");
  assert.equal(relativeTime(null, now), "");
  assert.equal(relativeTime("kaputt", now), "");
  assert.equal(relativeTime("2026-08-04T11:59:30Z", now), "gerade eben");
  assert.equal(relativeTime("2026-08-04T11:30:00Z", now), "vor 30 Min.");
  assert.equal(relativeTime("2026-08-04T09:00:00Z", now), "vor 3 Std.");
  assert.equal(relativeTime("2026-08-03T09:00:00Z", now), "gestern");
  assert.equal(relativeTime("2026-08-01T09:00:00Z", now), "vor 3 Tagen");
  // Ein Zeitpunkt in der Zukunft (Uhrenversatz) ergibt keine negative Angabe.
  assert.equal(relativeTime("2026-08-04T12:05:00Z", now), "gerade eben");
});

// ═══ E) Serverantworten ═════════════════════════════════════════════════════

test("16 — Zähler und Snapshot werden defensiv gelesen", () => {
  assert.equal(readUnreadCount({ unreadCount: 5 }), 5);
  assert.equal(readUnreadCount({ unreadCount: "x" }), 0);
  assert.equal(readUnreadCount(null), 0);
  assert.equal(readSnapshot({ snapshotAt: "2026-08-04T12:00:00Z" }), "2026-08-04T12:00:00Z");
  assert.equal(readSnapshot({}), null);
  assert.equal(readSnapshot(null), null);
});

// ═══ F) API-Vertrag ═════════════════════════════════════════════════════════

test("17 — es gibt KEINE Clientfunktion, die eine Meldung erledigt", () => {
  const code = stripComments(api);
  assert.ok(!/resolve/i.test(code), "die API kennt einen Erledigen-Aufruf");
  assert.ok(!/dismiss|delete|remove/i.test(code), "die API kennt einen Lösch-/Verwerfen-Aufruf");
  // Genau drei Endpunkte, alle unter /kunde/ und ohne /api-Präfix.
  const paths = code.match(/apiFetch\(`([^`]*)`/g) || [];
  assert.equal(paths.length, 3, `unerwartete Endpunktzahl: ${paths.join(", ")}`);
  for (const p of paths) {
    assert.match(p, /\/kunde\/notifications/, `Pfad außerhalb des Kundenbereichs: ${p}`);
    assert.ok(!p.includes("/api/"), `Pfad mit /api-Präfix: ${p}`);
  }
});

test("18 — Mark-read schickt den Snapshot mit", () => {
  const code = stripComments(api);
  assert.match(code, /export function markNotificationsRead\(\{ ids, all = false, snapshotAt \} = \{\}\)/);
  assert.match(code, /if \(snapshotAt\) body\.snapshotAt = snapshotAt;/);
});

test("19 — die API liegt unter src/api (nicht in einem erfundenen src/services)", () => {
  assert.doesNotThrow(() => read("api/notificationsApi.js"));
  assert.throws(() => read("services/notificationsApi.js"));
});

// ═══ G) Zustand und Polling ═════════════════════════════════════════════════

test("20 — Polling läuft nur bei sichtbarem Tab und wird sauber abgebaut", () => {
  const code = stripComments(ctx);
  assert.equal(POLL_INTERVAL_MS, 60000, "das geforderte 60-Sekunden-Intervall stimmt nicht");
  assert.match(code, /setInterval\(\(\) => \{ refreshCount\(\); \}, POLL_INTERVAL_MS\)/);
  assert.match(code, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  // Vollständiges Cleanup: Timer UND Listener.
  assert.match(code, /return \(\) => \{\s*stop\(\);\s*document\.removeEventListener\("visibilitychange", onVisibility\);/);
  assert.match(code, /clearInterval\(timer\)/);
  // Bei verborgenem Tab wird das Intervall abgebaut, nicht nur übersprungen.
  assert.match(code, /if \(visible\(\)\) \{ refreshCount\(\); start\(\); \} else \{ stop\(\); \}/);
});

test("21 — keine WebSockets, kein Socket, keine neue Abhängigkeit", () => {
  // Kommentare zuerst entfernen: die Dateien BENENNEN den Verzicht ausdrücklich
  // ("keine WebSockets") — geprüft wird der Code, nicht die Begründung.
  for (const [name, code] of [["context", ctx], ["bell", bell], ["panel", panel], ["api", api]]) {
    const src = stripComments(code);
    assert.ok(!/WebSocket|socket\.io|EventSource|new Worker/i.test(src), `${name} nutzt eine Live-Verbindung`);
  }
  const pkg = JSON.parse(read("../package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of ["socket.io-client", "@tanstack/react-query", "swr", "axios", "pusher-js"]) {
    assert.ok(!(forbidden in deps), `neue Abhängigkeit eingeführt: ${forbidden}`);
  }
});

test("22 — Zustand und Polling laufen pro Shell nur EINMAL", () => {
  // Der Provider umschließt in beiden Shell-Renderern die gesamte Shell; die
  // Glocken selbst halten keinen eigenen Abrufzustand.
  for (const [name, code] of [["DashboardPage", dashPage], ["DashboardLayout", dashLayout]]) {
    assert.equal((code.match(/<NotificationsProvider>/g) || []).length, 1, `${name}: Provider nicht genau einmal`);
    assert.equal((code.match(/<\/NotificationsProvider>/g) || []).length, 1, `${name}: Provider nicht geschlossen`);
  }
  const bellCode = stripComments(bell);
  assert.ok(!/setInterval/.test(bellCode), "die Glocke pollt selbst — es gäbe mehrere Schleifen");
  assert.ok(!/visibilitychange/.test(bellCode), "die Glocke hört selbst auf Sichtbarkeit");
  assert.match(bellCode, /useNotifications\(\)/, "die Glocke nutzt den gemeinsamen Zustand nicht");
});

// ═══ H) Mountpunkte ═════════════════════════════════════════════════════════

test("23 — die vorhandene Glocke der Übersicht ist jetzt eine echte Schaltfläche", () => {
  // Die frühere rein dekorative Fassung ist verschwunden …
  assert.ok(!/<span className="pp-bell" aria-hidden="true">/.test(overview),
    "die dekorative Glocke steht noch dort");
  // … und an derselben Stelle (innerhalb von .pp-actions) steht die echte Glocke.
  // Endanker war bis Paket D der „Neue Sendung"-Knopf .pp-cta; der ist entfallen
  // (dasselbe Ziel steht jetzt als primäre Schnellaktion darunter), deshalb
  // begrenzt das schließende </header> den Ausschnitt.
  const start = overview.indexOf('className="pp-actions"');
  const actions = overview.slice(start, overview.indexOf("</header>", start));
  assert.ok(start > -1 && actions.length > 0, "der Kopfbereich der Übersicht ist nicht auffindbar");
  assert.match(actions, /<NotificationBell variant="overview"/, "die Glocke sitzt nicht mehr an ihrer Position");
  // Genau EINE Identitätsanzeige neben der Glocke, kein zweiter Knopf daneben.
  assert.match(actions, /<UserChip user=\{user\}/, "der Benutzerchip fehlt im Kopfbereich");
  assert.ok(!/pp-cta/.test(overview), "der doppelte „Neue Sendung\"-Einstieg ist zurück");
  // Sie wurde NICHT in die Sidebar verschoben.
  const sidebar = read("components/layout/DashboardSidebar.jsx");
  assert.ok(!/NotificationBell/.test(sidebar), "die Glocke wurde in die Sidebar verschoben");
});

test("24 — beide mobilen Topbars tragen die Glocke", () => {
  for (const [name, code] of [["DashboardPage", dashPage], ["DashboardLayout", dashLayout]]) {
    const bar = code.slice(code.indexOf('className="mobile-topbar"'));
    const end = bar.indexOf("</div>\n\n");
    assert.match(bar.slice(0, end > 0 ? end + 200 : 600), /<NotificationBell variant="topbar"/,
      `${name}: mobile Topbar ohne Glocke`);
  }
});

test("25 — auf der Übersicht erscheint KEINE zweite Glocke", () => {
  // Seit Paket A, Phase 3 sitzt die Seiten-Glocke im Utility-Cluster des
  // gemeinsamen Seitenkopfs statt in einem freischwebenden Mount darüber.
  // Der Kopf rendert nur für die vier Unterseiten in PAGE_HEADERS — die
  // Übersicht ist keine davon und bringt ihre Glocke selbst mit.
  assert.match(dashPage, /const utilityCluster = \(\s*<UtilityCluster>\s*<NotificationBell variant="page"/,
    "die Seiten-Glocke steht nicht im Utility-Cluster");
  assert.match(dashPage, /utility=\{utilityCluster\}/,
    "der Cluster wird nicht in den Seitenkopf gereicht");
  assert.ok(!/page-bell-mount/.test(dashPage), "der freischwebende Mount ist entfallen");
  assert.ok(!/PAGE_HEADERS = \{[^}]*\boverview\s*:/s.test(dashPage),
    "die Übersicht darf keinen zweiten Seitenkopf bekommen");
  // Genau zwei Glocken-Instanzen in DashboardPage (Topbar + Seitenkopf);
  // die dritte (Übersicht) rendert die Overview-Komponente selbst.
  // Zwei Instanzen: die Topbar und der eine, durchgereichte Utility-Cluster.
  assert.equal((dashPage.match(/<NotificationBell/g) || []).length, 2,
    "unerwartete Anzahl Glocken in DashboardPage");
  assert.equal((overview.match(/<NotificationBell/g) || []).length, 1);
});

test("26 — es wurde KEINE neue vollständige Desktop-Kopfleiste gebaut", () => {
  // Der Cluster trägt Glocke und Benutzerchip — keine Marke, keine Suche,
  // kein Hamburger. Und er nutzt den gemeinsamen Inhaltsrahmen des Kopfs.
  const cluster = dashPage.slice(dashPage.indexOf("<UtilityCluster>"));
  assert.ok(!/topbar-brand|hamburger/.test(cluster.slice(0, 400)),
    "der Utility-Cluster ist zu einer vollen Kopfleiste geworden");
  const patterns = read("styles/patterns.css");
  assert.match(patterns, /\.ce-page-header \{[^}]*max-width: var\(--ce-size-content\)/s,
    "der Seitenkopf nutzt nicht den gemeinsamen Inhaltsrahmen");
  // Unterhalb von 860 px blendet der Cluster aus — sonst stünde die Glocke
  // gleichzeitig in Topbar und Kopf.
  assert.match(patterns, /@media \(max-width: 860px\) \{\s*\.ce-utility--hide-mobile \{ display: none; \}/s,
    "der Cluster blendet auf Mobil nicht aus");
});

// ═══ I) Panel: Verhalten und Bedienbarkeit ══════════════════════════════════

test("27 — das Öffnen des Panels markiert NICHTS automatisch", () => {
  const code = stripComments(panel);
  // Es gibt keinen Effekt, der beim Mounten als gelesen markiert.
  assert.ok(!/useEffect\([^)]*markRead/s.test(code), "ein Effekt markiert beim Öffnen als gelesen");
  assert.ok(!/useEffect\([^)]*markAllRead/s.test(code), "ein Effekt markiert beim Öffnen alles als gelesen");
  // Gelesen wird ausschließlich durch Klick oder „Alle als gelesen".
  assert.match(code, /onClick=\{\(\) => handleSelect\(n\)\}/);
  assert.match(code, /onClick=\{markAllRead\}/);
  const bellCode = stripComments(bell);
  assert.ok(!/markRead|markAllRead/.test(bellCode), "der Glockenknopf markiert beim Öffnen");
  // Beim Öffnen wird nur GELADEN.
  assert.match(bellCode, /if \(next\) refresh\(\);/);
});

test("28 — Escape, Fokusfalle und Fokus-Restore sind vorhanden", () => {
  const code = stripComments(panel);
  assert.match(code, /e\.key === "Escape"/, "Escape schließt nicht");
  assert.match(code, /e\.key !== "Tab"/, "keine Tab-Behandlung");
  assert.match(code, /shiftKey && document\.activeElement === firstEl/, "keine rückwärtige Fokusfalle");
  assert.match(code, /!e\.shiftKey && document\.activeElement === lastEl/, "keine vorwärtige Fokusfalle");
  assert.match(code, /if \(first\) first\.focus\(\)/, "der Fokus wandert nicht ins Fenster");
  // Fokus zurück auf die Glocke übernimmt der Knopf.
  assert.match(stripComments(bell), /setOpen\(false\);\s*if \(btnRef\.current\) btnRef\.current\.focus\(\);/);
});

test("29 — das Panel ist ein echter Dialog mit echtem Knopf", () => {
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /aria-label=\{PANEL_TITLE\}/);
  assert.match(bell, /<button\s+type="button"/);
  assert.match(bell, /aria-expanded=\{open\}/);
  assert.match(bell, /aria-haspopup="dialog"/);
  // Kein div-als-Knopf.
  assert.ok(!/<div[^>]*onClick=\{toggle\}/.test(bell), "die Glocke ist ein div mit onClick");
});

test("30 — Lade-, Leer- und Fehlerzustand mit erneutem Versuch", () => {
  assert.match(panel, /LOADING_TEXT/);
  assert.match(panel, /EMPTY_TITLE/);
  assert.match(panel, /LOAD_ERROR_TEXT/);
  assert.match(panel, /RETRY_LABEL/);
  assert.match(panel, /onClick=\{refresh\}/, "der Fehlerzustand bietet keinen erneuten Versuch");
  assert.match(panel, /role="alert"/);
  // Paket D: Der Ladezustand ist ein Skeleton (ListSkeleton) statt eines
  // Spinners, der Leerzustand eine EmptyState-Fläche. role="status" trägt
  // jetzt die gemeinsame Komponente — die Zusicherung wandert mit.
  assert.match(panel, /<ListSkeleton rows=\{3\}/, "beim ersten Laden fehlt das Skeleton");
  assert.match(panel, /<EmptyState icon="bell"/, "der Leerzustand nutzt das gemeinsame Muster nicht");
  assert.match(stateView, /className="ce-skeleton-list" role="status"/, "ListSkeleton meldet sich nicht als Status");
  // Ein Ladefehler darf bereits geladene Meldungen NICHT ersetzen.
  assert.match(panel, /error && items\.length > 0/, "der Fehler ersetzt weiterhin die geladene Liste");
  assert.match(panel, /error && items\.length === 0/, "ohne Inhalt fehlt die volle Fehlerfläche");
});

test("31 — kein unsanitiertes HTML, keine Live-Chat-Anmutung", () => {
  for (const [name, raw] of [["panel", panel], ["bell", bell]]) {
    // Auch hier ohne Kommentare: die Dateien erklären, warum es KEIN Live-Chat ist.
    const code = stripComments(raw);
    assert.ok(!/dangerouslySetInnerHTML/.test(code), `${name} nutzt dangerouslySetInnerHTML`);
    assert.ok(!/lucide-react/.test(code), `${name} importiert lucide-react`);
    assert.ok(!/Chat|tippt|online/i.test(code), `${name} suggeriert einen Live-Chat`);
  }
  // Keine dauerhafte Animation im Center (Regel des App-Chromes).
  assert.ok(!/@keyframes/.test(css), "das Stylesheet definiert eine Animation");
  assert.ok(!/animation\s*:/.test(css), "das Stylesheet setzt eine Animation");
  assert.ok(!/backdrop-filter/.test(css), "backdrop-filter ist im App-Chrome nicht vorgesehen");
});

test("32 — der Badge bleibt lesbar dimensioniert (>= 11px)", () => {
  // Seit Paket D stehen im Panel keine freien Pixelgrößen mehr: jede
  // Schriftgröße kommt aus der Typoskala (--ce-text-*). Die Untergrenze
  // 11 px sichert damit die Skala selbst (typography.test.mjs) — hier wird
  // geprüft, dass die Datei sie tatsächlich verwendet und keine freie Größe
  // daneben einführt.
  const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
  const small = sizes.filter((n) => n < 11);
  assert.deepEqual(small, [], `zu kleine Schriftgrößen: ${small.join(", ")}`);
  assert.match(css, /font-size:\s*var\(--ce-text-micro-size\)/, "der Badge nutzt die Micro-Stufe nicht");
  const tokenSizes = [...css.matchAll(/font-size:\s*var\(--ce-text-[a-z-]+-size\)/g)];
  assert.ok(tokenSizes.length >= 5, `zu wenige Größen aus der Skala: ${tokenSizes.length}`);
});

test("33 — das Stylesheet nutzt Layout-Tokens statt eigener Farbwerte", () => {
  // Erlaubt sind neutrale Ausnahmen (Weiß auf dem Badge, Fallback des Warntons);
  // alle Flächen und Texte kommen aus den App-Tokens.
  const literals = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  // Paket D: das Panel führt gar kein Farbliteral mehr (vorher zwei — das Weiß
  // des Badges und der Fallback des Warntons).
  assert.deepEqual(literals, [], `zu viele Farbliterale: ${literals.join(", ")}`);
  assert.match(css, /var\(--surface\)/);
  assert.match(css, /var\(--ce-color-surface\)/);
  assert.match(css, /var\(--ce-color-border-subtle\)/);
  // Der Akzent läuft über die Foundation-Markenrollen: Fläche über --ce-color-brand,
  // Text in Textgröße über die dunklere -ink-Rolle (AA auf heller Fläche).
  assert.match(css, /var\(--ce-color-brand\)/);
  assert.match(css, /var\(--ce-color-brand-ink\)/);
});

test("34 — das Stylesheet ist in die Importkette aufgenommen", () => {
  const index = read("styles/index.css");
  assert.match(index, /@import '\.\/notifications\.css';/);
  // Am Ende, nach den übrigen Bereichs-Stylesheets (Projektkonvention).
  assert.ok(index.indexOf("notifications.css") > index.indexOf("support.css"),
    "das Stylesheet steht nicht am Ende der Kette");
});

// ═══ J) Refetch nach Kundenaktionen ═════════════════════════════════════════

test("35 — PDF-Download und Vorschau lösen einen Refetch aus", () => {
  const code = stripComments(invoices);
  // Nach erfolgreichem Download …
  assert.match(code, /await downloadCustomerInvoicePdf\(inv\.id, inv\.invoice_number\);\s*refreshNotifications\(\);/,
    "der Download aktualisiert die Glocke nicht");
  // … und nach der Vorschau (gleicher Endpunkt, gleiche Wirkung).
  assert.match(code, /\.then\(\(blob\) => \{ refreshNotifications\(\); return blob; \}\)/,
    "die Vorschau aktualisiert die Glocke nicht");
});

test("36 — ein FEHLGESCHLAGENER Abruf aktualisiert nicht", () => {
  const code = stripComments(invoices);
  const handler = code.slice(code.indexOf("const handleDownload"), code.indexOf("const previewFetcher"));
  const catchBlock = handler.slice(handler.indexOf("} catch"));
  assert.ok(!/refreshNotifications/.test(catchBlock),
    "im Fehlerfall wird aktualisiert — dort hat sich serverseitig nichts geändert");
});

test("37 — das Öffnen eines Supportverlaufs aktualisiert die Glocke", () => {
  const thread = stripComments(read("components/support/SupportThread.jsx"));
  assert.match(thread, /confirmSupportViewed\(requestId, through\)/,
    "der Verlauf bestätigt die Ansicht nicht");
  assert.match(thread, /\.then\(\(\) => \{ if \(mountedRef\.current\) refreshNotifications\(\); \}\)/,
    "nach der Bestätigung wird die Glocke nicht aktualisiert");
});
