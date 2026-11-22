// Admin-/Partner-Apps (FE-2): welche App unter welchem Host läuft, welche Pfade sie selbst zeigt, wohin Verweise in den
// Kundenbereich führen. Die Kopplung an nginx, Manifeste und Service Worker prüft src/styles/appPwaGovernance.test.mjs.
//
// Run: node --test src/utils/appHost.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_ADMIN, APP_HOSTS, APP_INFO, APP_KUNDE, APP_PARTNER, KUNDENPORTAL_URL,
  appDokumentFuer, appStartPfad, appVonHost, istAppHost, kundenportalAdresse, kundenportalUrsprung,
  kundenportalZiel, pfadGehoertZurApp, serviceWorkerFuer,
} from "./appHost.mjs";

test("1 — feste Tabelle exakter Hostnamen; alles andere ist der Kundenbereich", () => {
  assert.deepEqual(Object.keys(APP_HOSTS).sort(), ["admin.confidaraexpress.de", "admin.localhost", "partner.confidaraexpress.de", "partner.localhost"]);
  assert.equal(appVonHost("admin.confidaraexpress.de"), APP_ADMIN);
  assert.equal(appVonHost("partner.confidaraexpress.de"), APP_PARTNER);
  assert.equal(appVonHost("ADMIN.ConfidaraExpress.de"), APP_ADMIN, "Groß-/Kleinschreibung zählt im Hostnamen nicht");
  assert.equal(appVonHost("admin.confidaraexpress.de."), APP_ADMIN, "voll qualifizierter Name");
  assert.equal(appVonHost("admin.localhost"), APP_ADMIN);
  assert.equal(appVonHost("partner.localhost"), APP_PARTNER);
  for (const kunde of [
    "confidaraexpress.de", "www.confidaraexpress.de", "preisrechner.confidaraexpress.de", "api.confidaraexpress.de",
    "admin.confidaraexpress.de.example.com", "evil-admin.confidaraexpress.de", "xadmin.confidaraexpress.de",
    "admin-confidaraexpress.de", "localhost", "127.0.0.1", "admin.localhost.example", "partner.example.com",
    "", "  ", null, undefined, 42, {},
  ]) {
    assert.equal(appVonHost(kunde), APP_KUNDE, String(kunde));
    assert.equal(istAppHost(kunde), false, String(kunde));
  }
  assert.equal(istAppHost("admin.confidaraexpress.de"), true);
});

test("2 — jede App zeigt nur ihre eigenen Seiten; der Kundenbereich bleibt unverändert", () => {
  for (const ok of ["/admin", "/admin/", "/admin/login", "/admin/users/12", "/admin/invoices/manual/7", "/admin/mitteilungen",
    "/admin/sicherheit", "/vorschau/rechtstexte/agb", "/vorschau/rechtstexte/datenschutz"]) {
    assert.equal(pfadGehoertZurApp(APP_ADMIN, ok), true, ok);
  }
  for (const nein of ["/", "/dashboard", "/login", "/register", "/partner", "/partner/login", "/demo", "/demo/uebersicht",
    "/administrator", "/admins", "/tracking", "/impressum", "/vorschau/rechtstexte", "/vorschau/rechtstexte/a/b",
    "/vorschau/andere/agb", "//evil.example/admin", "admin", "", null, undefined, 7]) {
    assert.equal(pfadGehoertZurApp(APP_ADMIN, nein), false, String(nein));
  }
  for (const ok of ["/partner", "/partner/", "/partner/login", "/partner/login/"]) assert.equal(pfadGehoertZurApp(APP_PARTNER, ok), true, ok);
  for (const nein of ["/", "/partner-registrieren", "/partnervereinbarung", "/partner/x", "/admin", "/admin/login", "/dashboard",
    "/demo", "//evil.example/partner", null]) {
    assert.equal(pfadGehoertZurApp(APP_PARTNER, nein), false, String(nein));
  }
  for (const alles of ["/", "/dashboard", "/admin", "/partner", "/demo"]) assert.equal(pfadGehoertZurApp(APP_KUNDE, alles), true);
  assert.equal(pfadGehoertZurApp("unbekannt", "/admin"), false, "unbekannte App: nichts");
  assert.deepEqual([appStartPfad(APP_ADMIN), appStartPfad(APP_PARTNER), appStartPfad(APP_KUNDE), appStartPfad("x")], ["/admin", "/partner", null, null]);
});

test("3 — Startdokumente: Admin-Anmeldung mit eigenem Gerüst, sonst das Startdokument der App", () => {
  assert.equal(appDokumentFuer(APP_ADMIN, "/admin/login"), "admin-app-login.html");
  assert.equal(appDokumentFuer(APP_ADMIN, "/admin/login/"), "admin-app-login.html");
  assert.equal(appDokumentFuer(APP_ADMIN, "/admin/login", { build: false }), "admin-login.html", "Entwicklungsserver: das Gerüst selbst");
  for (const p of ["/admin", "/admin/users", "/vorschau/rechtstexte/agb", "/dashboard"]) assert.equal(appDokumentFuer(APP_ADMIN, p), "admin.html", p);
  for (const p of ["/partner", "/partner/login", "/"]) assert.equal(appDokumentFuer(APP_PARTNER, p), "partner.html", p);
  assert.equal(appDokumentFuer(APP_KUNDE, "/admin"), null);
  assert.equal(appDokumentFuer(APP_ADMIN, null), null);
  assert.deepEqual(Object.keys(APP_INFO).sort(), [APP_ADMIN, APP_PARTNER]);
  assert.equal(APP_INFO.admin.name, "ConfidaraExpress Admin");
  assert.equal(APP_INFO.partner.name, "ConfidaraExpress Partner");
});

test("4 — Verweise in den Kundenbereich: aus einer App absolut, im Kundenbereich unverändert", () => {
  const ort = (hostname, port = "", protocol = "https:") => ({ hostname, port, protocol });
  assert.equal(KUNDENPORTAL_URL, "https://confidaraexpress.de");
  assert.equal(kundenportalZiel("/impressum", ort("admin.confidaraexpress.de")), "https://confidaraexpress.de/impressum");
  assert.equal(kundenportalZiel("/datenschutz", ort("partner.confidaraexpress.de")), "https://confidaraexpress.de/datenschutz");
  assert.equal(kundenportalZiel("/impressum", ort("confidaraexpress.de")), "/impressum", "Kundenbereich: wie bisher relativ");
  assert.equal(kundenportalZiel("/dashboard", ort("admin.localhost", "4173", "http:")), "http://localhost:4173/dashboard");
  assert.equal(kundenportalUrsprung(ort("partner.localhost", "", "http:")), "http://localhost");
  assert.equal(kundenportalUrsprung(ort("admin.confidaraexpress.de")), KUNDENPORTAL_URL);
  assert.equal(kundenportalUrsprung(undefined), KUNDENPORTAL_URL);
  for (const boese of ["https://evil.example/", "//evil.example/x", "javascript:alert(1)", "impressum", "", null]) {
    assert.throws(() => kundenportalZiel(boese, ort("admin.confidaraexpress.de")), /nur eigene Pfade/, String(boese));
  }
});

test("5 — Adressen zum Teilen (Registrierungslinks): immer der Kundenbereich, nie die App-Adresse", () => {
  const ort = (hostname, origin, port = "", protocol = "https:") => ({ hostname, origin, port, protocol });
  const pfad = "/partner-registrieren?ref=ABC123";
  assert.equal(kundenportalAdresse(pfad, ort("confidaraexpress.de", "https://confidaraexpress.de")), `https://confidaraexpress.de${pfad}`);
  assert.equal(kundenportalAdresse(pfad, ort("www.confidaraexpress.de", "https://www.confidaraexpress.de")),
    `https://www.confidaraexpress.de${pfad}`, "Kundenbereich: der eigene Ursprung wie bisher");
  assert.equal(kundenportalAdresse(pfad, ort("admin.confidaraexpress.de", "https://admin.confidaraexpress.de")), `https://confidaraexpress.de${pfad}`);
  assert.equal(kundenportalAdresse(pfad, ort("partner.confidaraexpress.de", "https://partner.confidaraexpress.de")), `https://confidaraexpress.de${pfad}`);
  assert.equal(kundenportalAdresse(pfad, ort("admin.localhost", "http://admin.localhost:4173", "4173", "http:")), `http://localhost:4173${pfad}`);
  assert.equal(kundenportalAdresse(pfad, undefined), pfad, "außerhalb des Browsers der Pfad");
  for (const boese of ["https://evil.example/", "//evil.example/x", "ref=1", null]) {
    assert.throws(() => kundenportalAdresse(boese, ort("admin.confidaraexpress.de", "https://admin.confidaraexpress.de")), /nur eigene Pfade/);
  }
});

test("6 — Service Worker je App: Kundenbereich /sw.js, Apps /app-sw.js, sonst keiner", () => {
  assert.equal(serviceWorkerFuer(APP_KUNDE), "/sw.js");
  assert.equal(serviceWorkerFuer(APP_ADMIN), APP_INFO[APP_ADMIN].serviceWorker);
  assert.equal(serviceWorkerFuer(APP_PARTNER), "/app-sw.js");
  for (const app of ["x", "__proto__", "constructor", undefined]) assert.equal(serviceWorkerFuer(app), null);
});
