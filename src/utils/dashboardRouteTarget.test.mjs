// F1 (Premium-Redesign Etappe 1): Die Glocke öffnet auch auf den Routen-Seiten den Supportvorgang.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { dashboardRouteTarget } from "./dashboardRouteTarget.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(hier, rel), "utf8");

test("1 — Supportmitteilung: die Ticket-ID reist als &ticket= mit", () => {
  assert.equal(dashboardRouteTarget("support", { ticket: 42 }), "/dashboard?page=support&ticket=42");
  assert.equal(dashboardRouteTarget("support", { ticket: "7" }), "/dashboard?page=support&ticket=7");
});

test("2 — ungültige Ticket-IDs fallen weg, die Liste öffnet wie bisher", () => {
  for (const ticket of [0, -3, 1.5, "abc", "", null, undefined]) {
    assert.equal(dashboardRouteTarget("support", { ticket }), "/dashboard?page=support", `ticket=${ticket}`);
  }
  assert.equal(dashboardRouteTarget("support"), "/dashboard?page=support");
});

test("3 — übrige Ziele unverändert; keine weiteren Angaben in der Adresse", () => {
  assert.equal(dashboardRouteTarget("calculator"), "/calculator");
  assert.equal(dashboardRouteTarget("profile"), "/dashboard?page=profile");
  assert.equal(dashboardRouteTarget("invoices", { invoice: 9 }), "/dashboard?page=invoices");
  assert.equal(dashboardRouteTarget("overview", { ticket: 5 }), "/dashboard?page=overview", "ticket nur beim Support");
});

test("4 — DashboardLayout nutzt den Helfer, DashboardPage liest ?ticket= wie zuvor", () => {
  const layout = lies("../components/layout/DashboardLayout.jsx");
  assert.match(layout, /navigate\(dashboardRouteTarget\(id, filter\)\);/, "DashboardLayout verwirft den Filter weiterhin");
  const seite = lies("../pages/DashboardPage.jsx");
  assert.match(seite, /const ticket = parseInt\(params\.get\("ticket"\), 10\);/);
  assert.match(seite, /setSupportTicketId\(Number\.isInteger\(ticket\) && ticket > 0 \? ticket : null\);/);
});
