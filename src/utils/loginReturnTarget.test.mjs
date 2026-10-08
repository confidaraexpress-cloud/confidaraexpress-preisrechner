// Rücksprung nach dem Login — Allowlist und Open-Redirect-Schutz.
//
// Run: node --test src/utils/loginReturnTarget.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { partnerReturnTarget, safeReturnTarget, returnTargetFromLocation } from "./loginReturnTarget.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — erlaubte interne Ziele kommen bereinigt zurück", () => {
  assert.equal(safeReturnTarget("/dashboard"), "/dashboard");
  assert.equal(safeReturnTarget("/dashboard?page=invoices"), "/dashboard?page=invoices");
  assert.equal(safeReturnTarget("/dashboard?page=support&ticket=77"), "/dashboard?page=support&ticket=77");
  assert.equal(safeReturnTarget("/dashboard?page=movements&product=12"), "/dashboard?page=movements&product=12");
  assert.equal(safeReturnTarget("/calculator"), "/calculator");
  assert.equal(safeReturnTarget("/inventory/products/5"), "/inventory/products/5");
  assert.equal(safeReturnTarget("/inventory/orders/42"), "/inventory/orders/42");
  assert.equal(safeReturnTarget("/admin"), "/admin");
  assert.equal(safeReturnTarget("/admin/support-requests/9"), "/admin/support-requests/9");
  assert.equal(safeReturnTarget("/admin/invoices/backfill"), "/admin/invoices/backfill");
});

test("2 — fremde Ziele ergeben null (kein Open Redirect)", () => {
  for (const boese of [
    "https://evil.example/", "http://evil.example", "//evil.example", "//evil.example/dashboard",
    "/\\evil.example", "\\\\evil.example", "javascript:alert(1)", "JAVASCRIPT:alert(1)",
    "data:text/html,x", "evil.example", " /dashboard", "/dashboard\n", "/dash\u0000board",
    "/%2F%2Fevil.example", "https:/evil.example",
  ]) {
    assert.equal(safeReturnTarget(boese), null, `durchgelassen: ${JSON.stringify(boese)}`);
  }
});

test("3 — unbekannte Pfade, Anmeldeseiten und die Buchungsseite ergeben null", () => {
  for (const pfad of ["/", "/login", "/register", "/booking", "/tracking", "/rechnungen/1", "/dashboard/x",
    "/inventory/products/abc", "/inventory/products/0", "/admin/a/b/c", "/admin/../login"]) {
    assert.equal(safeReturnTarget(pfad), null, `durchgelassen: ${pfad}`);
  }
  // Punktsegmente werden aufgelöst, bevor geprüft wird — geprüft wird das echte Ziel.
  assert.equal(safeReturnTarget("/admin/../dashboard"), "/dashboard");
  for (const nichtString of [null, undefined, 42, {}, [], ""]) {
    assert.equal(safeReturnTarget(nichtString), null);
  }
  assert.equal(safeReturnTarget("/" + "a".repeat(600)), null, "überlange Eingabe");
});

test("4 — Queryparameter werden aus geprüften Teilen neu gebaut, nie durchgereicht", () => {
  assert.equal(safeReturnTarget("/dashboard?page=invoices&next=https://evil.example"), "/dashboard?page=invoices");
  assert.equal(safeReturnTarget("/dashboard?page=Support"), "/dashboard", "nur kleingeschriebene Bereichsschlüssel");
  assert.equal(safeReturnTarget("/dashboard?page=support&ticket=-1"), "/dashboard?page=support");
  assert.equal(safeReturnTarget("/dashboard?ticket=77"), "/dashboard", "ticket ohne Bereich ist bedeutungslos");
  assert.equal(safeReturnTarget("/dashboard#frag"), "/dashboard");
  assert.equal(safeReturnTarget("/calculator?x=1"), "/calculator");
});

test("5 — returnTargetFromLocation nutzt pathname + search", () => {
  assert.equal(returnTargetFromLocation({ pathname: "/dashboard", search: "?page=profile" }), "/dashboard?page=profile");
  assert.equal(returnTargetFromLocation({ pathname: "/booking", search: "" }), null);
  assert.equal(returnTargetFromLocation(null), null);
});

test("6 — Schutzrouten und zentraler 401-Handler geben das Ziel mit, AuthPage prüft es", () => {
  const protectedRoute = ohneKommentare(read("routes/ProtectedRoute.jsx"));
  const adminRoute = ohneKommentare(read("routes/AdminRoute.jsx"));
  const ctx = ohneKommentare(read("context/AuthContext.jsx"));
  const page = ohneKommentare(read("pages/AuthPage.jsx"));
  for (const [name, code] of [["ProtectedRoute", protectedRoute], ["AdminRoute", adminRoute]]) {
    assert.match(code, /<Navigate to="\/login" replace state=\{\{ from: `\$\{location\.pathname\}\$\{location\.search\}` \}\} \/>/,
      `${name} gibt das Ziel nicht mit`);
  }
  assert.match(ctx, /navigate\("\/login", \{ replace: true, state: \{ from: `\$\{path\}\$\{window\.location\.search\}` \} \}\);/);
  // Das Ziel wird einmal gelesen, SOFORT geprüft und nur geprüft verwendet.
  assert.match(page, /useState\(\(\) => safeReturnTarget\(location\.state\?\.from\)\)/);
  assert.match(page, /navigate\(returnTarget \|\| "\/dashboard"\);/);
  assert.doesNotMatch(page, /navigate\(location\.state\?\.from/, "das Rohziel darf nie direkt angesteuert werden");
});

// Die echte Bereichsliste des Dashboards — aus dem Quelltext, nicht abgeschrieben.
function arrayLiteral(src, name) {
  const m = src.match(new RegExp(`const ${name} = (?:new Set\\()?\\[([\\s\\S]*?)\\]`));
  assert.ok(m, `${name} nicht gefunden`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((t) => t[1]).sort();
}
const DASHBOARD_PAGES = arrayLiteral(read("pages/DashboardPage.jsx"), "DASHBOARD_PAGES");

test("7 — unbekannte Bereiche ergeben die Übersicht, nicht nur syntaktisch falsche", () => {
  for (const unbekannt of ["evil", "admin", "booking", "calculator", "login", "settings", "dashboard",
    "constructor", "__proto__", "tostring", "invoice", "ticket"]) {
    assert.equal(safeReturnTarget(`/dashboard?page=${unbekannt}`), "/dashboard", `durchgelassen: page=${unbekannt}`);
  }
  // Auch mit an sich gültigem Zusatzparameter: ohne echten Bereich bleibt nichts übrig.
  assert.equal(safeReturnTarget("/dashboard?page=evil&ticket=12&product=7"), "/dashboard");
});

test("8 — jeder echte Bereich des Dashboards bleibt erhalten", () => {
  assert.ok(DASHBOARD_PAGES.length >= 14, `zu wenige Bereiche gelesen: ${DASHBOARD_PAGES.join(",")}`);
  for (const bereich of DASHBOARD_PAGES) {
    assert.equal(safeReturnTarget(`/dashboard?page=${bereich}`), `/dashboard?page=${bereich}`, `verworfen: ${bereich}`);
  }
});

test("9 — ticket nur bei den Supportanfragen, product nur bei den Bewegungen", () => {
  // Im eigenen Bereich bleiben sie erhalten …
  assert.equal(safeReturnTarget("/dashboard?page=support&ticket=12"), "/dashboard?page=support&ticket=12");
  assert.equal(safeReturnTarget("/dashboard?page=movements&product=7"), "/dashboard?page=movements&product=7");
  // … in jedem anderen fallen sie weg, der Bereich bleibt.
  for (const bereich of DASHBOARD_PAGES.filter((b) => b !== "support")) {
    assert.equal(safeReturnTarget(`/dashboard?page=${bereich}&ticket=12`), `/dashboard?page=${bereich}`,
      `${bereich}: ticket übernommen`);
  }
  for (const bereich of DASHBOARD_PAGES.filter((b) => b !== "movements")) {
    assert.equal(safeReturnTarget(`/dashboard?page=${bereich}&product=7`), `/dashboard?page=${bereich}`,
      `${bereich}: product übernommen`);
  }
  assert.equal(safeReturnTarget("/dashboard?page=invoices&ticket=12"), "/dashboard?page=invoices");
  assert.equal(safeReturnTarget("/dashboard?page=stock&product=7"), "/dashboard?page=stock");
  assert.equal(safeReturnTarget("/dashboard?page=support&ticket=12&product=7"), "/dashboard?page=support&ticket=12");
  assert.equal(safeReturnTarget("/dashboard?page=movements&product=7&ticket=12"), "/dashboard?page=movements&product=7");
  // Ungültige Werte im richtigen Bereich fallen ebenso weg.
  assert.equal(safeReturnTarget("/dashboard?page=movements&product=0"), "/dashboard?page=movements");
  assert.equal(safeReturnTarget("/dashboard?page=support&ticket=12abc"), "/dashboard?page=support");
});

test("10 — Parität: dieselben Bereiche und Zusatzparameter wie DashboardPage, keine zweite Navigation", () => {
  const eigene = arrayLiteral(read("utils/loginReturnTarget.mjs"), "DASHBOARD_BEREICHE");
  assert.deepEqual(eigene, DASHBOARD_PAGES, "Bereichsliste weicht von DASHBOARD_PAGES ab");
  const dashboard = ohneKommentare(read("pages/DashboardPage.jsx"));
  // product wirkt dort nur für die Bewegungen, ticket nur in den Supportanfragen.
  assert.match(dashboard, /if \(p === "movements" && \/\^\[1-9\]\[0-9\]\*\$\/\.test\(produkt \|\| ""\)\)/);
  assert.match(dashboard, /\{page === "support" && \([\s\S]*?initialTicketId=\{supportTicketId\}/);
  // Der Rücksprung erzeugt nur eine Adresse für das bestehende Deep-Link-Modell.
  const modul = ohneKommentare(read("utils/loginReturnTarget.mjs"));
  assert.doesNotMatch(modul, /navigate\(|history\.|location\.(assign|replace|href)/, "eigene Navigation im Rücksprungmodul");
});

test("11 — der Open-Redirect-Schutz bleibt vollständig, auch mit gültigem Bereich", () => {
  for (const boese of [
    "//evil.example/dashboard?page=support&ticket=12", "https://evil.example/dashboard?page=invoices",
    "/\\evil.example/dashboard?page=profile", "/%2F%2Fevil.example/dashboard?page=profile",
    "https:/evil.example/dashboard?page=support", "\u0000/dashboard?page=invoices",
  ]) {
    assert.equal(safeReturnTarget(boese), null, `durchgelassen: ${JSON.stringify(boese)}`);
  }
  // Fremde Werte in Parametern werden nie übernommen.
  assert.equal(safeReturnTarget("/dashboard?page=support&ticket=//evil.example"), "/dashboard?page=support");
  assert.equal(safeReturnTarget("/dashboard?page=movements&product=https://evil.example"), "/dashboard?page=movements");
});

// Die Bereiche des Partnerportals — aus dem Quelltext, nicht abgeschrieben.
const PARTNER_TAB_IDS = [...read("utils/salesPartnerView.mjs")
  .slice(read("utils/salesPartnerView.mjs").indexOf("export const PARTNER_TABS"))
  .split("]);")[0]
  .matchAll(/id: "([^"]+)"/g)].map((m) => m[1]).sort();

test("12 — Partnerportal (UX-Paket 6): Bereich aus der Allowlist, Rücksprung nur für Partner ins Portal", () => {
  assert.equal(safeReturnTarget("/partner"), "/partner");
  assert.equal(safeReturnTarget("/partner?page=commissions"), "/partner?page=commissions");
  assert.equal(safeReturnTarget("/partner?page=credit-notes"), "/partner?page=credit-notes");
  assert.equal(safeReturnTarget("/partner?page=overview"), "/partner", "die Übersicht braucht keinen Parameter");
  for (const unbekannt of ["admin", "Team", "constructor", "__proto__", "", "team/..", "https://evil.example"]) {
    assert.equal(safeReturnTarget(`/partner?page=${encodeURIComponent(unbekannt)}`), "/partner", `durchgelassen: page=${unbekannt}`);
  }
  // Nur der Bereich wird übernommen, nie ein weiterer Parameter oder Fragment.
  assert.equal(safeReturnTarget("/partner?page=team&next=https://evil.example"), "/partner?page=team");
  assert.equal(safeReturnTarget("/partner?page=team#x"), "/partner?page=team");
  // Unterpfade und fremde Ziele bleiben gesperrt.
  for (const boese of ["/partner/team", "/partnerx", "//evil.example/partner?page=team", "https://evil.example/partner",
    "/\\evil.example/partner", "/%2F%2Fevil.example/partner?page=team"]) {
    assert.equal(safeReturnTarget(boese), null, `durchgelassen: ${boese}`);
  }

  // Ein Partner springt nur ins eigene Portal zurück — nie auf ein Kunden- oder Adminziel.
  assert.equal(partnerReturnTarget("/partner?page=team"), "/partner?page=team");
  assert.equal(partnerReturnTarget("/partner"), "/partner");
  assert.equal(partnerReturnTarget("/partner?page=evil"), "/partner");
  for (const fremd of ["/dashboard", "/dashboard?page=invoices", "/admin", "/admin/partners", "/calculator",
    "/inventory/products/5", "https://evil.example/partner", "//evil.example/partner", null, undefined, ""]) {
    assert.equal(partnerReturnTarget(fremd), null, `angesteuert: ${fremd}`);
  }

  // Parität: dieselben Bereiche wie PARTNER_TABS.
  assert.deepEqual(arrayLiteral(read("utils/loginReturnTarget.mjs"), "PARTNER_BEREICHE"), PARTNER_TAB_IDS);
  assert.equal(PARTNER_TAB_IDS.length, 6);
  for (const id of PARTNER_TAB_IDS.filter((b) => b !== "overview")) {
    assert.equal(safeReturnTarget(`/partner?page=${id}`), `/partner?page=${id}`, `verworfen: ${id}`);
    assert.equal(partnerReturnTarget(`/partner?page=${id}`), `/partner?page=${id}`);
  }

  // Die Schutzroute gibt die Adresse samt Bereich mit; AuthPage prüft sie für Partner nur so.
  const route = ohneKommentare(read("routes/PartnerRoute.jsx"));
  assert.match(route, /<Navigate to="\/login" replace state=\{\{ from: `\$\{location\.pathname\}\$\{location\.search\}` \}\} \/>/);
  const page = ohneKommentare(read("pages/AuthPage.jsx"));
  assert.match(page, /navigate\(partnerReturnTarget\(returnTarget\) \|\| landingPathFor\(ok\)\)/);
  assert.equal((page.match(/partnerReturnTarget\(/g) || []).length, 1, "genau ein Aufruf");
});
