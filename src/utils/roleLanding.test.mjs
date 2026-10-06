// Rollenweiche: Vertriebspartner landen im Partnerportal und rendern nie eine
// Kundenroute; Kunden und Admins behalten ihr bisheriges Ziel.
//
// Run: node --test src/utils/roleLanding.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CUSTOMER_HOME,
  PARTNER_HOME,
  SALES_PARTNER_ROLE,
  isSalesPartner,
  landingPathFor,
} from "./roleLanding.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const readRoot = (rel) => readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══════════ Reine Logik ═════════════════════════════════════════════════ */

test("1 — nur die exakte Rolle sales_partner ist ein Vertriebspartner", () => {
  assert.equal(SALES_PARTNER_ROLE, "sales_partner");
  assert.equal(isSalesPartner({ role: "sales_partner" }), true);
  for (const anders of [null, undefined, {}, { role: "admin" }, { role: "customer" }, { role: "Sales_Partner" },
    { role: " sales_partner" }, { role: true }, "sales_partner", { role: ["sales_partner"] }]) {
    assert.equal(isSalesPartner(anders), false, `als Partner gewertet: ${JSON.stringify(anders)}`);
  }
});

test("2 — Partner → /partner; Kunde, Admin und Unbekanntes unverändert → /dashboard", () => {
  assert.equal(PARTNER_HOME, "/partner");
  assert.equal(CUSTOMER_HOME, "/dashboard");
  assert.equal(landingPathFor({ role: "sales_partner" }), "/partner");
  assert.equal(landingPathFor({ role: "customer" }), "/dashboard");
  assert.equal(landingPathFor({ role: "admin" }), "/dashboard", "Admins landen wie bisher im Kundenbereich");
  assert.equal(landingPathFor({}), "/dashboard");
  assert.equal(landingPathFor(null), "/dashboard");
});

/* ══════════ Verdrahtung (kommentarfreier Quelltext) ═════════════════════ */

test("3 — ProtectedRoute leitet Partner vor jedem Kundenbaustein ins Portal", () => {
  const route = ohneKommentare(read("routes/ProtectedRoute.jsx"));
  const login = route.indexOf('<Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />');
  const partner = route.indexOf("if (isSalesPartner(user)) return <Navigate to={PARTNER_HOME} replace />;");
  const kinder = route.lastIndexOf("return children;");
  assert.ok(login > 0, "die Anmeldeweiterleitung fehlt");
  assert.ok(partner > login, "die Partnerweiche muss nach der Anmeldeprüfung stehen");
  assert.ok(kinder > partner, "die Partnerweiche muss VOR dem Rendern der Kinder greifen");
});

test("4 — PartnerRoute: nur sales_partner; andere Angemeldete → /dashboard, Gäste → /login", () => {
  const route = ohneKommentare(read("routes/PartnerRoute.jsx"));
  assert.match(route, /if \(loadingUser\) return <LoadingScreen \/>;/);
  assert.match(route, /if \(sessionCheckFailed\) \{/, "sessionCheckFailed muss berücksichtigt sein");
  assert.match(route, /if \(!authed\) return <Navigate to="\/login" replace state=\{\{ from: `\$\{location\.pathname\}\$\{location\.search\}` \}\} \/>;/);
  assert.match(route, /if \(!isSalesPartner\(user\)\) return <Navigate to=\{CUSTOMER_HOME\} replace \/>;/);
});

test("5 — /partner hängt hinter PartnerRoute; Index und * führen rollenabhängig", () => {
  const app = ohneKommentare(read("App.jsx"));
  assert.match(app, /<Route path="\/partner" element=\{<PartnerRoute><PartnerPortalPage \/><\/PartnerRoute>\} \/>/);
  assert.match(app, /<Route index element=\{<Navigate to=\{authed \? landingPathFor\(user\) : "\/login"\} replace \/>\} \/>/);
  assert.match(app, /<Route path="\*" element=\{<Navigate to=\{authed \? landingPathFor\(user\) : "\/login"\} replace \/>\} \/>/);
  // Das Partnerportal läuft nicht durch DashboardLayout (Mitteilungen = /kunde/*).
  const portal = ohneKommentare(read("pages/PartnerPortalPage.jsx"));
  assert.doesNotMatch(portal, /DashboardLayout|NotificationBell|DashboardSidebar/);
  // AdminRoute bleibt unverändert.
  assert.match(ohneKommentare(read("routes/AdminRoute.jsx")), /if \(user\?\.role !== "admin"\) return <Navigate to="\/dashboard" replace \/>;/);
});

test("6 — nach dem Login: Partner ins Portal, alle anderen über das unveränderte Rücksprungziel", () => {
  const page = ohneKommentare(read("pages/AuthPage.jsx"));
  assert.match(page, /if \(isSalesPartner\(ok\)\) navigate\(landingPathFor\(ok\)\);\s*\n\s*else navigate\(returnTarget \|\| "\/dashboard"\);/);
  // login() liefert das Benutzerobjekt (truthy) statt true — die Rolle ist ohne
  // weiteren Render bekannt.
  const ctx = ohneKommentare(read("context/AuthContext.jsx"));
  assert.match(ctx, /return angemeldet;/);
  assert.match(ctx, /const partner = d\?\.salesPartner \?\? u\.salesPartner \?\? null;/);
});

test("7 — der Dashboard-Knopf der öffentlichen Leiste führt rollenabhängig", () => {
  const nav = ohneKommentare(read("components/layout/NavbarLayout.jsx"));
  assert.match(nav, /const startziel = landingPathFor\(user\);/);
  assert.equal((nav.match(/navigate\(startziel\)/g) || []).length, 2, "Leiste und Drawer");
  assert.doesNotMatch(nav, /navigate\("\/dashboard"\)/);
});

test("8 — die App startet installiert weiterhin auf /dashboard (Partner werden dort umgeleitet)", () => {
  const manifest = JSON.parse(readRoot("public/manifest.webmanifest"));
  assert.equal(manifest.start_url, "/dashboard");
});
