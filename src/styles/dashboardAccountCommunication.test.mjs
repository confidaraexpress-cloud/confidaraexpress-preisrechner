// Governance für Paket D — Übersicht, Konto und Kommunikation.
//
// Geprüft wird die Umstellung der Übersicht auf eine operative Arbeitsfläche
// sowie die Migration von Profil, Support und Benachrichtigungen auf die
// gemeinsamen Muster — UND, ebenso wichtig, dass dabei keine API-, Routing-,
// Business- oder Datenlogik angefasst wurde. Reine Quelltextprüfung (kein DOM);
// die Laufzeitseite deckt tests/e2e/dashboardAccountPaketD.test.mjs ab.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PASSWORD_MIN_LEN, PASSWORD_MAX_LEN } from "../utils/passwordPolicy.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const overview = read("components/dashboard/Overview.jsx");
const modules = read("components/dashboard/OverviewModules.jsx");
const overviewLogic = read("utils/overviewModules.mjs");
const dashPage = read("pages/DashboardPage.jsx");
const profile = read("components/dashboard/Profile.jsx");
const sidebar = read("components/layout/DashboardSidebar.jsx");
const userChip = read("components/ui/UserChip.jsx");
const identity = read("utils/accountIdentity.mjs");
const supportList = read("components/support/SupportRequestsView.jsx");
const supportThread = read("components/support/SupportThread.jsx");
const supportDialog = read("components/support/SupportRequestDialog.jsx");
const panel = read("components/notifications/NotificationPanel.jsx");
const ntfContext = read("context/NotificationsContext.jsx");
const overviewCss = stripComments(read("styles/overview.css"));
const supportCss = stripComments(read("styles/support.css"));
const ntfCss = stripComments(read("styles/notifications.css"));

// Alle Quelldateien des Kundenbereichs, die Paket D anfasst.
const PAKET_D_DATEIEN = [
  "components/dashboard/Overview.jsx",
  "components/dashboard/OverviewModules.jsx",
  "components/dashboard/Profile.jsx",
  "components/support/SupportRequestsView.jsx",
  "components/support/SupportThread.jsx",
  "components/support/SupportRequestDialog.jsx",
  "components/notifications/NotificationPanel.jsx",
  "components/notifications/NotificationBell.jsx",
];
const PAKET_D_CSS = ["styles/overview.css", "styles/support.css", "styles/notifications.css"];

/* ══════════ 1 — operative Module bei vorhandenen Daten ═══════════════════ */

test("1 — die Übersicht zeigt bei vorhandenen Daten die operativen Module", () => {
  for (const modul of ["<RecentShipments", "<OpenInvoices", "<OverviewNotifications"]) {
    assert.ok(overview.includes(modul), `Modul fehlt: ${modul}`);
  }
  // Sie hängen am tatsächlichen Datenbestand, nicht an einem Schalter.
  assert.match(overview, /const operational = hasOperationalData\(\{ shipments, invoices, ready \}\)/);
  assert.match(overview, /\{operational && \(/, "die Module sind nicht an den Datenbestand gebunden");
});

/* ══════════ 2 — leerer Neukundenzustand ═════════════════════════════════ */

test("2 — ohne operative Daten führt Onboarding statt bedeutungsloser Nullkarten", () => {
  // Ablauf, Vorteile und Trust erscheinen NUR ohne operative Daten …
  const code = stripJs(overview);
  assert.equal((code.match(/\{!operational && \(/g) || []).length, 3,
    "erwartet: Ablauf, Vorteile und Trust hängen am Onboarding-Zweig");
  // Keine leere Tabelle: das Sendungsmodul erscheint gar nicht erst.
  assert.match(overview, /\{operational && \(\s*<div className="ov-mod-grid">/);
});

/* ══════════ 3 — Schnellaktionen sind restlos entfernt ═══════════════════ */

test("3 — die Schnellaktionen sind restlos entfernt und hinterlassen keinen Ersatzblock", () => {
  // Kein Aufruf, keine Komponente, kein Datenarray, kein Handler — an keiner
  // der vier Stellen, die die Sektion zuvor trug.
  assert.ok(!/<QuickActions\b/.test(overview), "die Übersicht rendert noch <QuickActions>");
  assert.ok(!/export function QuickActions\b/.test(modules), "OverviewModules.jsx exportiert QuickActions noch");
  assert.ok(!/QUICK_ACTIONS/.test(overviewLogic), "overviewModules.mjs führt QUICK_ACTIONS noch");
  assert.ok(!/onQuickAction/.test(dashPage), "DashboardPage.jsx trägt noch den onQuickAction-Handler");
  // Die fünf Kartentexte waren ausschließlich im entfernten Datenarray belegt
  // (siehe overviewModules.test.mjs, vor der Entfernung geprüft) — sie dürfen
  // in keiner der vier Dateien wieder auftauchen.
  for (const beschreibung of [
    "Versandauftrag anlegen und buchen", "Preise und Laufzeiten vergleichen",
    "Aufträge und Sendungsverfolgung", "Belege und offene Beträge",
    "Persönliche Unterstützung anfordern",
  ]) {
    for (const [name, code] of [["Overview", overview], ["OverviewModules", modules], ["overviewModules.mjs", overviewLogic], ["DashboardPage", dashPage]]) {
      assert.ok(!code.includes(beschreibung), `${name}: Schnellaktionen-Beschreibung „${beschreibung}“ ist zurück`);
    }
  }
  // Kein CSS-Rest der Sektion (vollständige Liste inkl. Responsive-Overrides:
  // Test 26 unten).
  assert.ok(!/ov-quick/.test(overviewCss), "overview.css führt noch eine ov-quick-Regel");
});

test("4 — kein doppelter „Neue Sendung\"-Einstieg mehr in der Kopfzeile", () => {
  assert.ok(!/pp-cta/.test(overview), "der Kopfzeilen-CTA ist zurück (doppelte Navigation)");
  assert.ok(!/\.pp-cta\s*\{/.test(overviewCss), "die Regel .pp-cta lebt noch");
});

/* ══════════ 5/6 — letzte Sendungen und offene Rechnungen ════════════════ */

test("5 — die letzten Sendungen sind eine kompakte Auswahl, keine zweite Sendungsliste", () => {
  assert.match(modules, /recentShipments\(shipments, 4\)/);
  // Keine eigene Suche, Filterung oder Pagination (Kommentare ausgenommen —
  // sie beschreiben genau diesen Verzicht).
  const code = stripJs(modules);
  for (const [name, muster] of [
    ["State", /useState\(/], ["Nachladen", /Weitere laden|Mehr laden/],
    ["Cursor", /nextCursor/], ["Suchfeld", /<input\b/], ["Filter", /\.filter\(/],
  ]) {
    assert.ok(!muster.test(code), `Modul enthält eigene Listenlogik: ${name}`);
  }
  // Preis, Status und Datum kommen unverändert aus den bestehenden Feldern.
  assert.match(modules, /money\(s\.price_final\)/);
  assert.match(modules, /<StatusBadge status=\{s\.status\} \/>/);
  assert.match(modules, /dateDE\(s\.created_at\)/);
});

test("6 — offene Rechnungen nutzen die bestehenden Rechnungswerte und das globale Overdue-Badge", () => {
  assert.match(modules, /overviewInvoiceFacts\(invoices, summary\)/);
  assert.match(modules, /className="badge badge--overdue"/, "Überfälligkeit ohne globales Statussystem");
  // Kein Nachrechnen im Modul: Betrag und Fälligkeit kommen aus der Summary.
  assert.match(modules, /money\(facts\.openAmount\)/);
  assert.match(modules, /dateDE\(facts\.nextDueDate\)/);
  assert.ok(!/reduce\(|\+ inv\.|gross_amount/.test(modules), "das Modul summiert selbst");
  // Und die Summary selbst kommt unverändert aus dem bestehenden View-Model.
  assert.match(overviewLogic, /import \{ customerInvoiceSummary, isOverdueInvoice \} from "\.\/customerInvoiceView\.mjs"/);
});

/* ══════════ 7 — keine neue API, keine neue Route ════════════════════════ */

test("7 — die neuen Module rufen keine API und legen keine Route an", () => {
  for (const datei of ["components/dashboard/OverviewModules.jsx", "utils/overviewModules.mjs"]) {
    // Kommentare ausgenommen: sie NENNEN die Endpunkte, die bewusst nicht
    // aufgerufen werden (z. B. warum es keine Empfängerspalte gibt).
    const code = stripJs(read(datei));
    assert.ok(!/fetch\(|apiFetch|\/kunde\/|\/api\//.test(code), `${datei} spricht mit dem Backend`);
  }
  // Die Übersicht nutzt für Benachrichtigungen den BESTEHENDEN Provider …
  assert.match(overview, /useNotifications\(\)/);
  assert.ok(!/setInterval|POLL_INTERVAL/.test(overview), "die Übersicht baut einen zweiten Takt auf");
  // … und die Zielableitung des Panels, kein zweites Zielsystem.
  assert.match(overview, /notificationTarget\(n\)/);
  // Keine neue Route in App.jsx.
  const app = read("App.jsx");
  assert.ok(!/notifications|benachrichtigung/i.test(app), "es wurde eine Benachrichtigungsroute angelegt");
});

/* ══════════ 8 — Initialen aus EINER Quelle ═════════════════════════════ */

test("8 — Profil und Benutzerchip nutzen dieselbe Initialenquelle", () => {
  // Seit der Entfernung der Firmenkarte zeigt die Sidebar selbst keine
  // Initiale mehr — sie ist deshalb kein Aufrufer dieser Quelle mehr (siehe
  // Test 8b). Profilhero und Benutzerchip bleiben die zwei verbliebenen.
  for (const [name, code] of [["Profile", profile], ["UserChip", userChip]]) {
    assert.match(code, /accountInitials\(user\)/, `${name} nutzt die gemeinsame Quelle nicht`);
    assert.ok(!/charAt\(0\)\.toUpperCase\(\)/.test(code), `${name} leitet die Initiale selbst ab`);
  }
  // Die fest verdrahtete Marke „CE" ist verschwunden.
  assert.ok(!/profile-avatar-lg">CE</.test(profile), "die hart codierte Initiale „CE\" ist zurück");
  assert.match(profile, /className="profile-avatar-lg" aria-hidden="true">\{accountInitials\(user\)\}/);
  // Und die Quelle selbst liefert nie ein Markenkürzel als Rückfall.
  assert.match(identity, /ACCOUNT_INITIAL_FALLBACK = "\?"/);
});

test("8b — die Sidebar zeigt keine Kontoidentität mehr und keinen Ersatzblock", () => {
  // Die frühere Firmenkarte (Avatar + Firmenname + E-Mail) ist ersatzlos
  // entfernt — kein Aufruf der Identitätsquelle, kein eigener Ableitungscode.
  assert.ok(!/accountInitials\(user\)/.test(sidebar), "die Sidebar ruft die Initialenquelle noch auf");
  assert.ok(!/accountDisplayName\(user\)/.test(sidebar), "die Sidebar ruft die Namensquelle noch auf");
  assert.ok(!/pp-identity/.test(sidebar), "eine Spur der Firmenkarte lebt noch in der Sidebar");
});

test("9 — der Profilhero trägt das Base-Card-Material statt einer eigenen Fassung", () => {
  assert.match(profile, /className="ce-card profile-account-header"/);
  const premium = stripComments(read("styles/dashboard-premium.css"));
  const block = premium.match(/\.profile-account-header \{([^}]*)\}/)[1];
  assert.ok(!/background:|border:|box-shadow:|border-radius:/.test(block),
    "der Profilhero führt sein Kartenmaterial weiterhin selbst");
});

/* ══════════ 10/11 — Passwortbereich ════════════════════════════════════ */

test("10 — das Passwortformular ist initial geschlossen und öffnet erst auf Nutzeraktion", () => {
  assert.match(profile, /const \[pwOpen, setPwOpen\] = useState\(false\)/);
  assert.match(profile, /\{pwOpen && \(/, "das Formular hängt nicht am geöffneten Zustand");
  assert.match(profile, /\{!pwOpen && \(/, "der Öffnen-Knopf hängt nicht am geschlossenen Zustand");
  assert.match(profile, /onClick=\{openPwForm\}/);
  // Abbrechen stellt den geschlossenen Zustand wieder her.
  assert.match(profile, /onClick=\{closePwForm\}/);
  assert.match(profile, /const closePwForm = \(\) => \{[\s\S]*?setPwOpen\(false\);/);
});

test("11 — Passwortregeln, Felder und API sind unverändert", () => {
  assert.match(profile, /apiFetch\(`\/kunde\/password`, \{\s*method: "PATCH",\s*headers: authH\(\),/);
  assert.match(profile, /JSON\.stringify\(pwForm\)/);
  for (const regel of [
    "Bitte geben Sie Ihr aktuelles Passwort ein.",
    "Das neue Passwort darf nicht mit dem aktuellen Passwort identisch sein.",
    "Die neuen Passwörter stimmen nicht überein.",
  ]) {
    assert.ok(profile.includes(regel), `Passwortregel verändert: ${regel}`);
  }
  // Die beiden LÄNGENtexte tragen seit der UAT-Korrektur T-003 die Zahl nicht
  // mehr als Literal, sondern aus passwordPolicy.mjs — Text und Prüfung können
  // damit nicht auseinanderlaufen. Geprüft wird deshalb zweistufig: die Quelle
  // interpoliert die zentrale Konstante, UND der daraus entstehende Satz ist
  // wortgleich zum bisherigen Wortlaut.
  assert.match(profile, /mindestens \$\{PASSWORD_MIN_LEN\} Zeichen lang sein\./,
    "Längentext nutzt nicht mehr die zentrale Konstante");
  assert.match(profile, /höchstens \$\{PASSWORD_MAX_LEN\} Zeichen lang sein\./,
    "Längentext nutzt nicht mehr die zentrale Konstante");
  assert.equal(
    `Das neue Passwort muss mindestens ${PASSWORD_MIN_LEN} Zeichen lang sein.`,
    "Das neue Passwort muss mindestens 8 Zeichen lang sein.",
    "Der sichtbare Wortlaut hat sich geändert",
  );
  assert.equal(
    `Das neue Passwort darf höchstens ${PASSWORD_MAX_LEN} Zeichen lang sein.`,
    "Das neue Passwort darf höchstens 128 Zeichen lang sein.",
    "Der sichtbare Wortlaut hat sich geändert",
  );
  // Die Längenprüfung läuft über die zentrale Regel, nicht über .length.
  assert.match(profile, /passwordLengthError\(newPassword, PW_CHANGE_TEXTS\)/);
  assert.ok(!/newPassword\.length\s*[<>]/.test(profile),
    "Profile.jsx prüft die Passwortlänge wieder selbst statt über passwordPolicy.mjs");
  // Der bewusste Verzicht auf auth:true (401 = falsches Passwort, nicht Session-Ende)
  // bleibt bestehen.
  assert.match(profile, /triggerAuthError\(\)/);
  assert.match(profile, /Das aktuelle Passwort ist nicht korrekt\./);
});

/* ══════════ 12 — Supportstatus-Fallback ═══════════════════════════════ */

test("12 — der Supportstatus-Fallback bleibt sicher (kein roher Backendwert als Text)", () => {
  for (const [name, code] of [["Liste", supportList], ["Verlauf", supportThread]]) {
    assert.match(code, /statusFallback\(row\.status\)|statusFallback\(req\.status\)/, `${name}: kein Fallback`);
    assert.match(code, /STATUS_META\[/, `${name}: keine Statuszuordnung`);
  }
  const fallback = read("utils/statusFallback.mjs");
  assert.match(fallback, /Unbekannter Status/);
});

/* ══════════ 13 — Supportdialog auf dem globalen Dialogsystem ══════════ */

test("13 — der Supportdialog nutzt das globale Dialog- und Formularsystem", () => {
  const patterns = stripComments(read("styles/patterns.css"));
  // Overlay, Karte, Breite (MD) und Aktionen laufen in den gemeinsamen Gruppen.
  for (const sel of [".sup-dialog-overlay", ".sup-dialog-card", ".sup-dialog-actions"]) {
    assert.ok(patterns.includes(sel), `${sel} steht nicht im gemeinsamen Dialogmuster`);
  }
  assert.match(patterns, /\.ce-dialog--md,[\s\S]{0,200}\.sup-dialog-card/, "der Dialog nutzt nicht die MD-Breite");
  // Felder aus forms.css statt einer dialogeigenen Feldsprache.
  assert.match(supportDialog, /className="field-input field-select"/);
  assert.match(supportDialog, /className="field-input"/);
  assert.match(supportDialog, /className="field-input field-textarea sup-dialog-textarea"/);
  assert.ok(!/sup-dialog-select|sup-dialog-input"|sup-dialog-alert/.test(supportDialog),
    "die dialogeigenen Feld-/Meldungsklassen sind zurück");
  assert.ok(!/\.sup-dialog-select|\.sup-dialog-input\b|\.sup-dialog-alert/.test(supportCss),
    "die dialogeigenen Feldregeln leben noch");
  // Fehler über FormAlert, und er bleibt IM Dialog.
  assert.match(supportDialog, /<FormAlert tone="error" message=\{error\} \/>/);
  // Bestätigende Aktion rechts außen. Der Dialog hat ZWEI Aktionsblöcke
  // (Erfolgsansicht und Formular) — geprüft wird der des Formulars, also der
  // letzte im Quelltext.
  const actions = supportDialog.slice(supportDialog.lastIndexOf('className="sup-dialog-actions"'));
  assert.ok(actions.includes("Abbrechen") && actions.includes("Anfrage senden"),
    "der Formular-Aktionsblock ist nicht auffindbar");
  assert.ok(actions.indexOf("Abbrechen") < actions.indexOf("Anfrage senden"),
    "die bestätigende Aktion muss rechts außen stehen");
  // Fokusfalle, Fokusrückgabe und Escape.
  assert.match(supportDialog, /e\.key === "Escape"/);
  assert.match(supportDialog, /e\.key === "Tab"/);
  assert.match(supportDialog, /openerRef\.current\?\.focus\?\.\(\)/);
});

test("14 — Support-E-Mail- und API-Logik sind unverändert", () => {
  assert.match(supportDialog, /createSupportRequest\(\{ category, subject, message \}\)/);
  assert.match(supportThread, /replySupportRequest\(requestId, reply\.trim\(\), idemKey\.current\)/);
  assert.match(supportThread, /confirmSupportViewed\(requestId, through\)/);
  // Kein automatischer Statuswechsel aus dem Frontend.
  assert.ok(!/setStatus|updateStatus|status:\s*"resolved"/.test(supportThread),
    "der Verlauf ändert den Ticketstatus selbst");
});

/* ══════════ 15 — Benachrichtigungslogik unverändert ═══════════════════ */

test("15 — Gelesen-/Ungelesen-Logik, Badge-Zählung und Kontextaktionen sind unverändert", () => {
  // Der Context bleibt die einzige Quelle.
  assert.match(ntfContext, /const markRead = useCallback/);
  assert.match(ntfContext, /const markAllRead = useCallback/);
  assert.match(ntfContext, /POLL_INTERVAL_MS/);
  // Das Panel markiert weiterhin nur auf ausdrückliche Handlung.
  assert.match(panel, /markRead\(n\.id\);/);
  assert.match(panel, /onClick=\{markAllRead\}/);
  // Das Übersichtsmodul baut KEINE zweite Gelesen-Logik.
  assert.ok(!/markRead|markAllRead|readAt/.test(modules), "das Übersichtsmodul führt eigene Gelesen-Logik");
  assert.ok(!/markRead|markAllRead/.test(overviewLogic), "die Modul-Logik führt eigene Gelesen-Logik");
});

test("16 — das Panel verliert bei einem Ladefehler keine bereits geladenen Einträge", () => {
  assert.match(panel, /\{error && items\.length > 0 && \(/, "der Fehler ersetzt weiterhin die Liste");
  assert.match(panel, /error && items\.length === 0 \?/, "ohne Inhalt fehlt die volle Fehlerfläche");
  assert.match(panel, /<ListSkeleton rows=\{3\}/, "beim ersten Laden fehlt das Skeleton");
  assert.match(panel, /<EmptyState icon="bell"/, "der Leerzustand nutzt das gemeinsame Muster nicht");
});

test("17 — es gibt keinen toten „Alle anzeigen\"-Knopf", () => {
  // Es existiert keine Benachrichtigungsseite — also darf auch kein Ziel
  // behauptet werden.
  assert.ok(!/Alle anzeigen/.test(panel), "das Panel verspricht ein Ziel, das es nicht gibt");
  assert.ok(!/Alle anzeigen/.test(modules));
});

/* ══════════ 18/19 — genau eine Glocke, genau ein Avatar ═══════════════ */

test("18 — auf der Übersicht steht genau EINE Glocke, auf Unterseiten ebenfalls", () => {
  assert.equal((overview.match(/<NotificationBell/g) || []).length, 1);
  assert.equal((dashPage.match(/<NotificationBell/g) || []).length, 2, "Topbar + Utility-Cluster");
  // Auf der Übersicht bleibt die Topbar-Glocke aus (sonst zwei auf Mobil).
  assert.match(dashPage, /\{page !== "overview" && \(\s*<NotificationBell variant="topbar"/);
});

test("19 — die mobile Topbar trägt Menü, Wortmarke und Glocke — keinen zweiten Avatar", () => {
  const bar = dashPage.slice(dashPage.indexOf('className="mobile-topbar"'), dashPage.indexOf("{bookingToast"));
  assert.match(bar, /hamburger-btn/);
  assert.match(bar, /topbar-brand/);
  assert.match(bar, /<NotificationBell variant="topbar"/);
  assert.ok(!/UserChip|user-avatar|profile-avatar/.test(bar), "die Topbar trägt eine zweite Identität");
});

/* ══════════ 20/21/22 — Designdisziplin ═══════════════════════════════ */

test("20 — keine Emojis in den Bereichen von Paket D", () => {
  const treffer = [];
  for (const datei of PAKET_D_DATEIEN) {
    for (const m of read(datei).matchAll(/\p{Extended_Pictographic}/gu)) {
      treffer.push(`${datei}: ${m[0]}`);
    }
  }
  assert.deepEqual(treffer, [], `Emojis gefunden:\n  ${treffer.join("\n  ")}`);
});

test("21 — keine neuen freien Farben, Radien oder Schatten", () => {
  for (const datei of PAKET_D_CSS) {
    const css = stripComments(read(datei));
    // Farbliterale: overview.css führt weiterhin genau die geprüften Ausnahmen
    // der KPI-/Sektionsflächen (dort über eigene Tests abgedeckt); die neuen
    // Modulregeln und die migrierten Bereiche führen keine.
    const neueBloecke = css.match(/\.(ov|sup|ntf)-[^{]*\{[^}]*\}/g) || [];
    for (const block of neueBloecke) {
      const farben = block.match(/#[0-9a-fA-F]{3,8}\b|(?<!\w)rgba?\([^)]*\)/g) || [];
      assert.deepEqual(farben, [], `${datei}: Farbliteral in ${block.slice(0, 40)}…`);
      const radien = block.match(/border-radius:\s*(\d+)px/g) || [];
      assert.deepEqual(radien, [], `${datei}: freier Radius in ${block.slice(0, 40)}…`);
      // Jede Tiefe muss aus der Elevation-Skala kommen. Geprüft wird die ganze
      // Deklaration (ein Lookahead direkt hinter dem Doppelpunkt würde über das
      // Leerzeichen zurückspringen und immer anschlagen).
      const schatten = (block.match(/box-shadow:[^;}]*/g) || [])
        .filter((d) => !/var\(--ce-elevation|none/.test(d));
      assert.deepEqual(schatten, [], `${datei}: freier Schatten in ${block.slice(0, 40)}…`);
    }
  }
});

test("22 — kein Glow, kein Glass, kein backdrop-filter in Paket D", () => {
  for (const datei of PAKET_D_CSS) {
    const css = stripComments(read(datei));
    assert.ok(!/backdrop-filter/.test(css), `${datei}: backdrop-filter`);
    assert.ok(!/filter:\s*blur/.test(css), `${datei}: Blur`);
  }
});

/* ══════════ 23 — Berührte Zustände laufen über die gemeinsamen Muster ══ */

test("23 — Leer-, Fehler- und Ladezustände laufen über StateView/FormAlert", () => {
  for (const [name, code] of [
    ["Supportliste", supportList], ["Supportverlauf", supportThread], ["Panel", panel],
    ["Übersichtsmodule", modules],
  ]) {
    assert.match(code, /from "\.\.\/ui\/StateView"/, `${name}: kein gemeinsames Zustandsmuster`);
  }
  // Und die bereichseigenen Zustandsflächen sind entfallen.
  assert.ok(!/\.sup-empty\b/.test(supportCss), ".sup-empty lebt noch");
  assert.ok(!/\.ntf-empty-title/.test(ntfCss), ".ntf-empty-title lebt noch");
});

/* ══════════ 24 — Datenverträge unangetastet ══════════════════════════ */

test("24 — KPI-Berechnung, Rechnungs- und Sendungsfelder sind unverändert", () => {
  assert.match(overview, /const k = useMemo\(\(\) => computeKpis\(shipments\), \[shipments\]\)/);
  assert.match(overview, /ready \? kpi\.value : "—"/);
  for (const t of ["Noch nicht abgeschlossen", "Auf dem Weg zum Empfänger", "Im aktuellen Monat", "Über dem geplanten Liefertermin"]) {
    assert.ok(overview.includes(t), `KPI-Kontextzeile verändert: ${t}`);
  }
  // Die Sendungs- und Rechnungsabrufe der Seite sind unverändert.
  assert.match(dashPage, /apiFetch\(`\/kunde\/shipments`, \{ auth: true \}\)/);
  assert.match(dashPage, /apiFetch\(`\/kunde\/invoices`,  \{ auth: true \}\)/);
});

/* ══════════ 25 — Iconbuttons vollständig beschriftet ════════════════ */

test("25 — jeder Iconbutton OHNE sichtbaren Namen trägt aria-label UND title", () => {
  // Gemeint sind ausschließlich Knöpfe, deren einziger Inhalt ein Icon ist —
  // ein Knopf mit sichtbarem Text ist bereits benannt (dasselbe Muster wie in
  // interfacePrimitives.test.mjs, hier zusätzlich um `title` verschärft).
  const luecken = [];
  for (const datei of [...PAKET_D_DATEIEN, "components/ui/PasswordField.jsx"]) {
    const code = read(datei);
    for (const m of code.matchAll(/<button\b([^>]*)>\s*(?:\{[^{}]*\})?\s*<Icon\b[^/]*\/>\s*<\/button>/g)) {
      const attrs = m[1];
      if (!/aria-label/.test(attrs) || !/title=/.test(attrs)) {
        luecken.push(`${datei}: ${m[0].replace(/\s+/g, " ").slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(luecken, [], `Iconbuttons ohne vollständige Beschriftung:\n  ${luecken.join("\n  ")}`);
});

/* ══════════ 26 — Bereichsdateien ohne verwaiste Regeln ═════════════ */

test("26 — die entfernten Klassen sind in keinem Stylesheet und keinem Markup mehr", () => {
  const ENTFALLEN = ["pp-cta", "pp-bell", "sup-empty", "sup-empty-title", "sup-empty-text",
    "sup-list-intro", "ntf-empty-title", "sup-dialog-select", "sup-dialog-alert",
    "ov-quick", "ov-quick-grid", "ov-quick-card", "ov-quick-card--primary",
    "ov-quick-ic", "ov-quick-text", "ov-quick-label", "ov-quick-desc"];
  const jsxDateien = [];
  const sammle = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) sammle(p);
      else if (p.endsWith(".jsx")) jsxDateien.push(p);
    }
  };
  sammle(SRC);
  for (const cls of ENTFALLEN) {
    for (const datei of PAKET_D_CSS) {
      assert.ok(!new RegExp(`\\.${cls}\\b`).test(stripComments(read(datei))),
        `${datei}: verwaiste Regel .${cls}`);
    }
    for (const p of jsxDateien) {
      assert.ok(!new RegExp(`className="[^"]*\\b${cls}\\b`).test(readFileSync(p, "utf8")),
        `${path.relative(SRC, p)}: verwaiste Klasse ${cls}`);
    }
  }
});
