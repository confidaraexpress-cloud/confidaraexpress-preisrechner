// Pfade des Kundenbereichs für den Ladebildschirm auf dem Grund des Bereichs (Confidara Obsidian 2026-11-15, Premium
// Blue Light 2026-11-16).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bleibtImKundenbereich, istKundenbereichPfad, KUNDENBEREICH_PFADE, ohneDemoBasis } from "./kundenBereichPfad.mjs";

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
  assert.match(app, /<LoadingScreen dunkel=\{statischeAuthSeite\(pathname\) !== null\} kunde=\{kundenPfad\} \/>/);
  assert.match(app, /<Suspense fallback=\{<LoadingScreen kunde=\{kundenPfad\} \/>\}>/);
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
  assert.match(hook, /return \(\) => \{\s*if \(bleibtImKundenbereich\(bereich, window\.location\.pathname\)\) return;\s*if \(root\.getAttribute\("data-ce-bereich"\) === bereich\) \{\s*root\.removeAttribute\("data-ce-bereich"\);/);
});
