// Pfade des Kundenbereichs für den Ladebildschirm auf dem Grund des Bereichs (Confidara Obsidian 2026-11-15, Premium
// Blue Light 2026-11-16) und Pfade des Adminpanels für seine dunkle Ebene (Confidara Leitstand Nacht 2026-11-17).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bleibtImAdminbereich, bleibtImKundenbereich, istAdminbereichPfad, istKundenbereichPfad, KUNDENBEREICH_PFADE, ohneDemoBasis,
} from "./kundenBereichPfad.mjs";

test("K1: die Routen des Kundenbereichs sind Kundenbereich — mit und ohne Schrägstrich am Ende", () => {
  for (const p of ["/dashboard", "/dashboard/", "/calculator", "/booking", "/inventory/products/42", "/inventory/orders/abc-1"]) {
    assert.equal(istKundenbereichPfad(p), true, p);
  }
});

test("K2: öffentliche Seiten, Anmeldung, Admin und Partnerportal sind es nicht", () => {
  for (const p of ["/", "/login", "/register", "/admin", "/admin/login", "/partner", "/tracking", "/inventory",
    "/inventory/products", "/inventory/products/42/x", "/dashboardx", "/preisrechner", "", null, undefined, 42, "dashboard"]) {
    assert.equal(istKundenbereichPfad(p), false, String(p));
  }
});

test("K3: die Liste deckt genau die Kundenrouten unter DashboardLayout und DashboardPage (App.jsx, DemoApp.jsx)", () => {
  const app = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const demo = fs.readFileSync(new URL("../demo/DemoApp.jsx", import.meta.url), "utf8");
  for (const p of KUNDENBEREICH_PFADE) {
    assert.match(app, new RegExp(`path="${p}"`), `App.jsx kennt ${p}`);
    assert.match(demo, new RegExp(`path="${p}"`), `DemoApp.jsx kennt ${p}`);
  }
  for (const p of ["/inventory/products/:id", "/inventory/orders/:id"]) {
    assert.ok(app.includes(`path="${p}"`), `App.jsx kennt ${p}`);
    assert.ok(demo.includes(`path="${p}"`), `DemoApp.jsx kennt ${p}`);
  }
});

test("K4: der Ladebildschirm trägt die Bereichsklasse nur auf Kundenpfaden — App, Demo und Demo-Start", () => {
  const app = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const demo = fs.readFileSync(new URL("../demo/DemoApp.jsx", import.meta.url), "utf8");
  const start = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  const schirm = fs.readFileSync(new URL("../components/common/LoadingScreen.jsx", import.meta.url), "utf8");
  const schutz = fs.readFileSync(new URL("../routes/ProtectedRoute.jsx", import.meta.url), "utf8");
  assert.match(schutz, /if \(loadingUser\) return <LoadingScreen kunde=\{istKundenbereichPfad\(location\.pathname\)\} \/>;/);
  assert.match(app, /istKundenbereichPfad\(pathname\)/);
  assert.match(app, /<LoadingScreen dunkel=\{statischeAuthSeite\(pathname\) !== null \|\| adminPfad\} kunde=\{kundenPfad\} \/>/);
  assert.match(app, /<Suspense fallback=\{<LoadingScreen dunkel=\{adminPfad\} kunde=\{kundenPfad\} \/>\}>/);
  assert.match(demo, /<Suspense fallback=\{<DemoLadeflaeche \/>\}>/);
  assert.match(start, /<LoadingScreen kunde=\{istKundenbereichPfad\(/);
  assert.match(schirm, /loading-screen--kunde/);
});

test("K5: die Demo-Basis fällt weg, der Einstieg /demo führt auf die Übersicht, andere Pfade bleiben", () => {
  assert.equal(ohneDemoBasis("/demo/booking"), "/booking");
  assert.equal(ohneDemoBasis("/demo/inventory/orders/7"), "/inventory/orders/7");
  assert.equal(ohneDemoBasis("/demo"), "/dashboard");
  assert.equal(ohneDemoBasis("/demo/"), "/dashboard");
  for (const p of ["/booking", "/demonstration", "/admin", "/"]) assert.equal(ohneDemoBasis(p), p);
  // main.jsx liest den Demo-Pfad aus derselben Quelle.
  assert.match(fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8"), /return ohneDemoBasis\(window\.location\.pathname\);/);
});

test("K6: der Bereich „kunde“ bleibt beim Seitenwechsel im Kundenbereich stehen, sonst räumt der Hook auf", () => {
  for (const p of ["/booking", "/dashboard", "/inventory/products/42", "/demo/booking", "/demo"]) {
    assert.equal(bleibtImKundenbereich("kunde", p), true, p);
  }
  for (const p of ["/login", "/admin", "/admin/login", "/partner", "/", "/demo/admin", "/tracking"]) {
    assert.equal(bleibtImKundenbereich("kunde", p), false, p);
  }
  // Andere Bereiche räumen wie bisher auf, auch wenn das Ziel ein Kundenpfad ist (Anmeldung → Übersicht).
  assert.equal(bleibtImKundenbereich("auth", "/dashboard"), false);
  // Der Hook fragt vor dem Aufräumen — und räumt sonst nur ab, was ihm noch gehört (premiumRedesign.test.mjs).
  const hook = fs.readFileSync(new URL("../hooks/useCeBereich.js", import.meta.url), "utf8");
  assert.match(hook, /return \(\) => \{\s*if \(bleibtImKundenbereich\(bereich, window\.location\.pathname\) \|\| bleibtImAdminbereich\(bereich, window\.location\.pathname\)\) return;\s*if \(root\.getAttribute\("data-ce-bereich"\) === bereich\) \{\s*root\.removeAttribute\("data-ce-bereich"\);/);
});

// Confidara Leitstand Nacht (Betreiberauftrag 2026-11-17): Das Adminpanel ist dunkel. Zwischen zwei Adminseiten (und
// solange eine Adminseite lädt) darf der Bereich nicht kurz fallen — sonst blitzte die helle Grundfläche auf.
test("K7: die Pfade des Adminpanels — mit und ohne Schrägstrich, ohne die Admin-Anmeldung", () => {
  for (const p of ["/admin", "/admin/", "/admin/users", "/admin/users/42", "/admin/shipments", "/admin/einstellungen/tarife"]) {
    assert.equal(istAdminbereichPfad(p), true, p);
  }
  for (const p of ["/admin/login", "/admin/login/", "/administrator", "/adminx", "/", "/login", "/dashboard", "/partner",
    "/demo/admin", "admin", "", null, undefined, 42]) {
    assert.equal(istAdminbereichPfad(p), false, String(p));
  }
});

test("K8: der Bereich „admin“ bleibt beim Seitenwechsel im Adminpanel stehen; jeder andere Bereich räumt auf", () => {
  assert.equal(bleibtImAdminbereich("admin", "/admin/users"), true);
  assert.equal(bleibtImAdminbereich("admin", "/admin"), true);
  for (const p of ["/admin/login", "/login", "/dashboard", "/", "/partner"]) {
    assert.equal(bleibtImAdminbereich("admin", p), false, p);
  }
  for (const b of ["kunde", "auth", "partner", "oeffentlich", undefined]) {
    assert.equal(bleibtImAdminbereich(b, "/admin/users"), false, String(b));
  }
  // Der Ladebildschirm der Schutzroute und der Suspense-Ersatz sind auf Adminpfaden dunkel (App.jsx, AdminRoute.jsx).
  const app = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const route = fs.readFileSync(new URL("../routes/AdminRoute.jsx", import.meta.url), "utf8");
  assert.match(app, /const adminPfad = istAdminbereichPfad\(pathname\);/);
  assert.match(route, /if \(loadingUser\) return <LoadingScreen dunkel \/>;/);
});
