// Rücksprung nach dem Login — Allowlist und Open-Redirect-Schutz.
//
// Run: node --test src/utils/loginReturnTarget.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { safeReturnTarget, returnTargetFromLocation } from "./loginReturnTarget.mjs";

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
