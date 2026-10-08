// Rückwege im Adminbereich (UX-Paket 2): zur Herkunft, aber nur innerhalb von /admin.
//
// Run: node --test src/utils/adminBackLink.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminBackLabel, resolveAdminBack, returnState, safeAdminReturnPath } from "./adminBackLink.mjs";

const LISTE = { to: "/admin/partners", label: "Zurück zu den Vertriebspartnern" };

test("1 — nur Adminpfade dieser Anwendung sind ein erlaubter Rückweg", () => {
  for (const ok of ["/admin", "/admin/partners", "/admin/partners?status=pending&q=s%C3%BCd", "/admin/users/12"]) {
    assert.equal(safeAdminReturnPath(ok), ok, ok);
  }
  assert.equal(safeAdminReturnPath("/admin/partners#oben"), "/admin/partners", "ohne Sprungmarke");
  for (const boese of [
    "https://evil.example/admin", "//evil.example/admin", "/admin//evil.example", "/administrator",
    "/admin/../dashboard", "/admin/%2e%2e/dashboard", "/admin/x%2Fy", "/admin\\evil", "javascript:alert(1)",
    "/dashboard", "admin/partners", "", "   ", null, undefined, 42, { from: "/admin" },
    "/admin/\u0000", `/admin/${"x".repeat(400)}`,
  ]) {
    assert.equal(safeAdminReturnPath(boese), null, String(boese));
  }
});

test("2 — die Beschriftung nennt das Ziel; Unterseiten vor der Detailseite", () => {
  assert.equal(adminBackLabel("/admin"), "Zurück zur Übersicht");
  assert.equal(adminBackLabel("/admin/partners?status=pending"), "Zurück zu den Vertriebspartnern");
  assert.equal(adminBackLabel("/admin/partners/credit-notes"), "Zurück zu den Gutschriften");
  assert.equal(adminBackLabel("/admin/partners/prelive"), "Zurück zum Pre-Live-Test");
  assert.equal(adminBackLabel("/admin/partners/dispatch-evidence"), "Zurück zu den Versandnachweisen");
  assert.equal(adminBackLabel("/admin/partners/6"), "Zurück zum Vertriebspartner");
  assert.equal(adminBackLabel("/admin/invoices/backfill"), "Zurück zu den Vorschau-PDFs");
  assert.equal(adminBackLabel("/admin/invoices/900"), "Zurück zur Rechnung");
  assert.equal(adminBackLabel("/admin/users/7"), "Zurück zum Kunden");
  assert.equal(adminBackLabel("/admin/unbekannt/1/2"), null);
});

test("3 — Herkunft aus dem Router-State, sonst der feste Rückweg der Seite", () => {
  assert.deepEqual(resolveAdminBack({ from: "/admin/partners/prelive" }, LISTE),
    { to: "/admin/partners/prelive", label: "Zurück zum Pre-Live-Test" });
  assert.deepEqual(resolveAdminBack({ from: "/admin/partners?status=pending" }, LISTE),
    { to: "/admin/partners?status=pending", label: "Zurück zu den Vertriebspartnern" });
  for (const state of [null, undefined, "x", {}, { from: "https://evil.example" }, { from: "/admin/unbekannt/1/2" }]) {
    assert.deepEqual(resolveAdminBack(state, LISTE), LISTE);
  }
});

test("4 — returnState merkt sich die aktuelle Adminseite samt Filter, sonst nichts", () => {
  assert.deepEqual(returnState({ pathname: "/admin/partners", search: "?status=pending" }),
    { from: "/admin/partners?status=pending" });
  assert.deepEqual(returnState({ pathname: "/admin", search: "" }), { from: "/admin" });
  assert.equal(returnState({ pathname: "/dashboard", search: "" }), undefined);
  assert.equal(returnState(null), undefined);
});
