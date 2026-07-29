// Kein Kreditlimit in der Oberfläche.
//
// ConfidaraExpress verwendet kein Kreditlimit. Die Adminseiten zeigten bisher
// „Kredit genutzt" und „Kreditlimit" — beides ist entfernt. Sichtbar bleiben die
// reinen Debitoreninformationen: Zahlungsziel, offene Gesamtsumme, unbezahlte und
// überfällige Rechnungen. Sie sind Information, kein Rahmen.
//
// Das Repo hat bewusst keine React-Render-Testinfrastruktur (devDependencies:
// nur playwright). Geprüft wird deshalb der Quelltext als Contract — inklusive
// eines Selbsttests der Prüflogik, damit die Aussagen nicht vakuum-wahr sind.
//
// Run: node --test src/utils/noCreditDisplay.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");

// Kommentare entfernen: erklärender Text darf „kein Kreditlimit" sagen — geprüft
// wird, was tatsächlich ausgeführt und angezeigt wird.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const usersListSrc  = stripComments(read("pages/admin/AdminUsersPage.jsx"));
const userDetailSrc = stripComments(read("pages/admin/AdminUserDetailPage.jsx"));

// Alle produktiven Quelldateien (ohne Tests) — für die repoweite Wortprüfung.
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...collectSources(full)); continue; }
    if (!/\.(jsx?|mjs)$/.test(entry)) continue;
    if (/\.test\.mjs$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}
const PRODUCTION_FILES = collectSources(SRC);

// ─── 1./2. Keine Kreditwerte mehr in den Adminseiten ──────────────────────────

test("1 — Admin-Kundenliste zeigt keine Kreditspalten", () => {
  assert.equal(/Kredit genutzt/.test(usersListSrc), false, "Spalte 'Kredit genutzt' muss weg sein");
  assert.equal(/Kreditlimit/.test(usersListSrc), false, "Spalte 'Kreditlimit' muss weg sein");
  assert.equal(/credit_used|credit_limit|creditUsedOf|creditLimitOf/.test(usersListSrc), false,
    "keine Kreditfelder oder -Getter mehr");
});

test("2 — Admin-Kundendetail zeigt keine Kreditwerte", () => {
  assert.equal(/Kredit genutzt/.test(userDetailSrc), false);
  assert.equal(/Kreditlimit/.test(userDetailSrc), false);
  assert.equal(/credit_used|credit_limit|creditUsedOf|creditLimitOf/.test(userDetailSrc), false);
});

test("3 — die Karte heißt „Aktivität und Zahlung“ (nicht mehr „Zahlung & Kredit“)", () => {
  // Zahlung und Kennzahlen sind zu EINER Karte zusammengeführt — die
  // Debitorenwerte standen vorher doppelt auf der Seite.
  assert.match(userDetailSrc, /<Icon n="card" s=\{17\} \/> Aktivität und Zahlung<\/div>/,
    "Kartentitel muss 'Aktivität und Zahlung' sein");
  assert.equal(/Zahlung &amp; Kredit/.test(userDetailSrc), false, "alter Titel muss weg sein");
  assert.equal(/Aggregierte Kennzahlen/.test(userDetailSrc), false, "die doppelte Kennzahlenkarte ist entfallen");
});

// ─── 4.–7. Debitoreninformationen bleiben sichtbar ────────────────────────────

test("4 — Zahlungsziel bleibt sichtbar", () => {
  // Es beträgt für ALLE Kunden sieben Kalendertage — deshalb steht es einmal im
  // Kundendetail und nicht mehr in jeder Zeile der Liste.
  assert.match(userDetailSrc, /<Stat label="Zahlungsziel" value=\{PAYMENT_TERM_TEXT\} text \/>/);
  const viewSrc = read("utils/adminCustomerView.mjs");
  assert.match(viewSrc, /export const PAYMENT_TERM_TEXT = "7 Kalendertage";/);
  assert.equal(/<th[^>]*>Zahlungsziel<\/th>/.test(usersListSrc), false,
    "in der Liste ist die Spalte bewusst entfallen (für alle Kunden identisch)");
});

test("5 — offene Gesamtsumme bleibt sichtbar", () => {
  assert.match(userDetailSrc, /<Stat label="Offener Betrag" value=\{moneyOrDash\(metrics\.openAmount\)\} \/>/);
});

test("6 — offene Rechnungen bleiben sichtbar", () => {
  assert.match(userDetailSrc, /<Stat label="Offene Rechnungen" value=\{num\(metrics\.invoicesUnpaid\)\} \/>/);
});

test("7 — überfällige Rechnungen bleiben sichtbar", () => {
  assert.match(userDetailSrc, /<Stat label="Überfällige Rechnungen" value=\{num\(metrics\.invoicesOverdue\)\} \/>/);
  // Sichtbar, aber ausdrücklich ohne Automatik.
  assert.match(userDetailSrc, /metrics\.hasOverdue/);
  assert.match(read("utils/adminCustomerView.mjs"), /Überfällige Rechnungen blockieren Buchungen nicht automatisch/);
});

test("8 — die Debitorenwerte stammen aus dem Rechnungs-Summary, nicht aus dem User-Objekt", () => {
  // summary.* kommt aus dem Backend-Aggregat über invoices; u.* wäre der Kontodatensatz.
  // Die Lesung liegt jetzt zentral in activityMetrics(summary) — EINE Quelle.
  assert.match(userDetailSrc, /const metrics = activityMetrics\(summary\);/);
  const viewSrc = stripComments(read("utils/adminCustomerView.mjs"));
  for (const field of ["open_amount", "invoices_unpaid", "invoices_overdue", "shipments_total", "invoices_total"]) {
    assert.match(viewSrc, new RegExp(`s\\.${field}`), `${field} muss aus dem summary-Objekt kommen`);
  }
  for (const field of ["open_amount", "invoices_unpaid", "invoices_overdue"]) {
    assert.equal(new RegExp(`u\\.${field}`).test(userDetailSrc), false, `${field} darf nicht aus u kommen`);
  }
});

// ─── 8./9. Robustheit und Layout ──────────────────────────────────────────────

test("9 — fehlende Kreditfelder in der API verursachen keinen Fehler", () => {
  // Die Seiten lesen ausschließlich noch vorhandene Felder über firstDefined-Getter;
  // kein Getter greift mehr auf credit_* zu, also kann auch nichts undefined werden.
  for (const [label, src] of [["Liste", usersListSrc], ["Detail", userDetailSrc]]) {
    assert.equal(/u\.credit/.test(src), false, `${label}: kein direkter Zugriff auf credit_*`);
  }
  // Beide Seiten entpacken die Antwort weiterhin defensiv.
  assert.match(usersListSrc, /function selectRows\(d\)/, "Liste liest die Antwort defensiv");
  assert.match(userDetailSrc, /function selectSummary\(d\)/, "Detail liest summary defensiv");
  assert.match(userDetailSrc, /return d && typeof d\.summary === "object" && d\.summary \? d\.summary : \{\};/,
    "fehlendes summary fällt auf {} zurück");
});

test("10 — Tabellenstruktur bleibt konsistent: Spaltenköpfe == Zellen pro Zeile", () => {
  const headers = (usersListSrc.match(/<th scope="col"/g) || []).length;
  // Reduziert auf die fünf Spalten der täglichen Übersicht:
  // Kunde · Kontakt · Kundennummer · Status · Aktion.
  assert.equal(headers, 5, `erwartet 5 Spalten, gefunden ${headers}`);

  // Zellen der Datenzeile zählen (der Block zwischen <tbody> und </tbody>).
  const body = usersListSrc.slice(usersListSrc.indexOf("<tbody>"), usersListSrc.indexOf("</tbody>"));
  const cells = (body.match(/<td[\s>]/g) || []).length;
  assert.equal(cells, headers, `Zellen (${cells}) müssen zu Spaltenköpfen (${headers}) passen`);
});

test("11 — mobile Darstellung unverändert: bestehende Wrapper- und Karten-Klassen intakt", () => {
  // Es wurden nur Spalten entfernt; Container, Scroll-Wrapper und Kartenraster bleiben.
  assert.match(usersListSrc, /adm-table-wrap|table-card/, "Tabellen-Wrapper bleibt erhalten");
  assert.match(userDetailSrc, /className="adm-cards"/, "Kartenraster bleibt erhalten");
  assert.match(userDetailSrc, /className="adm-card-body"/);
  // Keine festen Breiten neu eingeführt.
  assert.equal(/style=\{\{[^}]*width/.test(usersListSrc), false, "keine Inline-Breiten in der Liste");
});

test("12 — keine ungenutzten Formatierer nach dem Entfernen der Kreditspalten", () => {
  // moneyOrDash wurde in der Liste nur für die Kreditspalten gebraucht.
  if (!/moneyOrDash\(/.test(usersListSrc.replace(/const moneyOrDash[^\n]*\n/, ""))) {
    assert.equal(/const moneyOrDash/.test(usersListSrc), false, "toter moneyOrDash-Helfer in der Liste");
    assert.equal(/import \{ money \}/.test(usersListSrc), false, "toter money-Import in der Liste");
  }
  // Im Detail wird moneyOrDash weiterhin für den offenen Betrag gebraucht.
  assert.match(userDetailSrc, /const moneyOrDash/, "Detail braucht moneyOrDash für den offenen Betrag");
  assert.match(userDetailSrc, /import \{ money \}/, "Detail braucht den money-Import");
});

// ─── 10. Repoweite Wortprüfung ────────────────────────────────────────────────

const FORBIDDEN = [/Kreditlimit/, /Kreditrahmen/, /Kredit genutzt/, /verfügbares Limit/];

test("13 — keine Kreditlimit-Texte in produktiven Kunden- oder Adminseiten", () => {
  const hits = [];
  for (const file of PRODUCTION_FILES) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const term of FORBIDDEN) {
      if (term.test(src)) hits.push(`${relative(SRC, file)} → ${term}`);
    }
  }
  assert.deepEqual(hits, [], `unerwünschte Kredittexte gefunden:\n${hits.join("\n")}`);
});

test("14 — kein produktiver Code liest credit_limit/credit_used aus der API", () => {
  const hits = [];
  for (const file of PRODUCTION_FILES) {
    const src = readFileSync(file, "utf8");
    // Kommentare ausblenden — die Mass-Assignment-Schutzliste im Profil darf die
    // Felder weiterhin ausdrücklich nennen (Defense-in-Depth, bewusst erhalten).
    const code = stripComments(src);
    if (/credit_limit|credit_used|creditLimit|creditUsed/.test(code)) hits.push(relative(SRC, file));
  }
  assert.deepEqual(hits, [], `Kreditfelder im produktiven Code:\n${hits.join("\n")}`);
});

test("15 — der Mass-Assignment-Schutz im Profil bleibt bestehen (Defense-in-Depth)", () => {
  const profileViewSrc = read("utils/profileView.mjs");
  assert.match(profileViewSrc, /Kreditwerte/, "der Kommentar soll die Felder weiterhin ausdrücklich ausschließen");
  // Die Felder dürfen nicht editierbar werden.
  assert.equal(/credit_limit|credit_used/.test(profileViewSrc.replace(/\/\/[^\n]*/g, "")), false,
    "keine Kreditfelder in den editierbaren Feldgruppen");
});

test("16 — Selbsttest der Prüflogik (die Wortprüfung greift tatsächlich)", () => {
  const sample = "Spalte Kreditlimit und Kredit genutzt sowie Kreditrahmen.";
  const matched = FORBIDDEN.filter((t) => t.test(sample));
  assert.equal(matched.length, 3, "die Verbotsliste muss diese drei Begriffe erkennen");
  assert.equal(/Kreditlimit/.test("Zahlungsziel"), false, "kein Fehlalarm auf unverdächtigem Text");
  assert.ok(PRODUCTION_FILES.length > 20, `es müssen viele Quelldateien geprüft werden, waren ${PRODUCTION_FILES.length}`);
  // Der Kommentar-Stripper darf sichtbaren Text nicht verschlucken.
  assert.match(stripComments('const a = 1; // Kreditlimit\nconst b = "Kreditlimit";'), /const b = "Kreditlimit"/);
  assert.equal(/\/\/ Kreditlimit/.test(stripComments("// Kreditlimit\nconst x = 1;")), false);
  // Und die Adminseiten enthalten nach dem Strippen weiterhin echten Code.
  assert.ok(usersListSrc.includes('<th scope="col">Kundennummer</th>'), "Liste darf nicht leergestrippt sein");
  assert.ok(userDetailSrc.includes("Offener Betrag"), "Detail darf nicht leergestrippt sein");
});
