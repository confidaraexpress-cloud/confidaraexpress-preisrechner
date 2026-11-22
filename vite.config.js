// Hauptbuild der Anwendung (confidaraexpress.de).
//
// Bis 2026-10-27 lief dieser Build ohne Konfiguration (Standardwerte von Vite, Einstieg index.html). Seit dem
// statischen Seitengerüst der Kunden-Anmeldung (Abschnitt 5, 2026-10-27) entstehen zusätzlich login.html und
// register.html: dieselbe Anwendung mit einem Seitengerüst, das vor dem ersten Rendern das Endlayout der Anmeldung
// zeigt. Alles andere bleibt bei den Standardwerten — dieselbe Ausgabe nach dist/.
//
// EIN Einstiegspunkt: index.html trägt wie bisher genau ein /assets/index-<hash>.js mit seinen modulepreloads und
// /assets/index-<hash>.css — die Versionsprüfung der Anwendung (utils/appVersionCheck.mjs) liest diesen Einstieg.
// Die Seitengerüste sind deshalb keine eigenen JavaScript-Einstiege: Vite verarbeitet sie als Seiten (gehashte
// Adressen für Karte, Schrift und Marke), ihr Modulskript entfällt im Build, und danach tragen sie genau die
// Einstiegs-Tags der gebauten index.html. Drei Einstiege mit demselben main.jsx teilten den Code sonst in einen
// gemeinsamen Abschnitt ohne index-<hash>.js, und die Versionsprüfung bliebe still.
//
// nginx liefert die Seitengerüste für /login, /register und /registrieren (nginx.conf). Damit Entwicklung, Vorschau und
// die Browser-E2E dasselbe sehen wie die Produktion, macht die Weiche unten im Entwicklungs- und im Vorschauserver
// dasselbe — nur für Seitenaufrufe (Accept: text/html), nie für Dateien oder API-Pfade.
//
// Admin-/Partner-Apps (FE-2, 2026-11-22): admin.html und partner.html sind die Startdokumente der beiden Apps
// (admin.confidaraexpress.de, partner.confidaraexpress.de) — dieselbe Anwendung mit eigenem Kopf (Manifest, Symbol,
// Name). Sie werden wie die Gerüste behandelt: kein eigener JavaScript-Einstieg, danach die Einstiegs-Tags der gebauten
// index.html. Aus dem fertigen admin-login.html entsteht zusätzlich admin-app-login.html: dasselbe dunkle Gerüst mit dem
// Kopf der Admin-App (nur Manifest, Symbol und App-Name ausgetauscht) — so installiert der Browser auch von der Anmeldung
// aus die Admin-App. Die Weiche wählt das Dokument zusätzlich nach dem Host (src/utils/appHost.mjs), wie nginx.
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statischeAuthSeite } from "./src/utils/kundenAuthPfad.mjs";
import { appDokumentFuer, appVonHost, APP_KUNDE } from "./src/utils/appHost.mjs";
import { adminAppLoginHtml } from "./src/utils/appDokumente.mjs";

const REPO = path.dirname(fileURLToPath(import.meta.url));
const GERUESTE = ["login.html", "register.html", "admin-login.html"];
const APP_DOKUMENTE = ["admin.html", "partner.html"];
const MODULSKRIPT = /<script type="module" src="\/src\/main\.jsx"><\/script>\s*/;
const EINSTIEGS_TAGS = /<script type="module" crossorigin src="\/assets\/[^"]+"><\/script>|<link rel="modulepreload" crossorigin href="\/assets\/[^"]+">|<link rel="stylesheet" crossorigin href="\/assets\/[^"]+">/g;
const EINSTIEG = /^<script type="module" crossorigin src="\/assets\/index-[A-Za-z0-9_-]+\.js"><\/script>$/;

function hostnameAus(req) {
  const host = String(req.headers?.host || "");
  return host.startsWith("[") ? host : host.replace(/:\d+$/, "");
}

// Welche Fassung die Weiche auf dem Admin-Host für /admin/login wählt: im Entwicklungsserver das Quellgerüst
// admin-login.html (es lädt dort sein Skript selbst), in der Vorschau das gebaute admin-app-login.html. Gesetzt im
// config-Hook des Plugins (ConfigEnv.isPreview); ein Prozess bedient genau einen Server.
let weicheMitBuildDokumenten = false;

function seitengeruestWeiche(req, _res, next) {
  const methode = req.method || "GET";
  const html = String(req.headers?.accept || "").includes("text/html");
  if ((methode === "GET" || methode === "HEAD") && html && typeof req.url === "string") {
    const [pfad, abfrage] = req.url.split("?");
    const app = appVonHost(hostnameAus(req));
    const seite = app === APP_KUNDE ? statischeAuthSeite(pfad) : appDokumentFuer(app, pfad, { build: weicheMitBuildDokumenten });
    if (seite) req.url = `/${seite}${abfrage ? `?${abfrage}` : ""}`;
  }
  next();
}

function authSeitengeruest() {
  let istBuild = false;
  return {
    name: "ce-auth-seitengeruest",
    enforce: "post",
    config(_config, env) { weicheMitBuildDokumenten = env.command === "build" || env.isPreview === true; },
    configResolved(config) { istBuild = config.command === "build"; },
    configureServer(server) { server.middlewares.use(seitengeruestWeiche); },
    configurePreviewServer(server) { server.middlewares.use(seitengeruestWeiche); },
    // Build: das Modulskript der Gerüste entfällt, bevor Vite die Seite verarbeitet — so entsteht kein zweiter
    // Einstieg. Im Entwicklungsserver bleibt es stehen; dort lädt die Seite ihr Skript selbst.
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const name = path.basename(ctx.filename || "");
        if (!istBuild || !(GERUESTE.includes(name) || APP_DOKUMENTE.includes(name))) return html;
        if (!MODULSKRIPT.test(html)) throw new Error(`${name}: das Modulskript der Anwendung fehlt`);
        return html.replace(MODULSKRIPT, "");
      },
    },
    // Danach tragen die Gerüste genau die Einstiegs-Tags der gebauten index.html: Skript, modulepreloads, Stylesheet.
    generateBundle: {
      order: "post",
      handler(_optionen, bundle) {
        const index = bundle["index.html"];
        if (!index || index.type !== "asset") return;
        const tags = String(index.source).match(EINSTIEGS_TAGS) || [];
        const einstiege = tags.filter((t) => EINSTIEG.test(t));
        if (einstiege.length !== 1) this.error(`index.html braucht genau einen Einstieg /assets/index-<hash>.js, gefunden: ${einstiege.length}`);
        for (const name of [...GERUESTE, ...APP_DOKUMENTE]) {
          const datei = bundle[name];
          if (!datei || datei.type !== "asset") this.error(`${name} fehlt im Build`);
          const html = String(datei.source);
          if (/<script type="module"/.test(html)) this.error(`${name} trägt schon ein Modulskript`);
          datei.source = html.replace("</head>", `${tags.map((t) => `    ${t}\n`).join("")}  </head>`);
        }
        // Das Gerüst der Admin-Anmeldung mit dem Kopf der Admin-App (für /admin/login auf admin.confidaraexpress.de).
        let adminAppLogin;
        try { adminAppLogin = adminAppLoginHtml(bundle["admin-login.html"].source); } catch (e) { this.error(e.message); }
        this.emitFile({ type: "asset", fileName: "admin-app-login.html", source: adminAppLogin });
      },
    },
  };
}

export default defineConfig({
  plugins: [authSeitengeruest()],
  build: {
    rolldownOptions: {
      input: {
        index: path.join(REPO, "index.html"),
        login: path.join(REPO, "login.html"),
        register: path.join(REPO, "register.html"),
        // Admin-Anmeldung (Canonical v2.130): dunkles Gerüst für /admin/login, ohne eigenen JavaScript-Einstieg.
        adminLogin: path.join(REPO, "admin-login.html"),
        // Startdokumente der Admin- und der Partner-App (FE-2), ebenfalls ohne eigenen JavaScript-Einstieg.
        adminApp: path.join(REPO, "admin.html"),
        partnerApp: path.join(REPO, "partner.html"),
      },
      // Rechnungseditor (2026-11-21): der pdf.js-Worker kommt als Datei vom eigenen Ursprung (CSP worker-src 'self').
      // nginx kennt die Endung .mjs nicht (mime.types des Images: nur js) und lieferte sie als
      // application/octet-stream — ein Modul-Worker lädt dann nicht. Darum endet jede .mjs-Datei unter assets/ auf
      // .js; alle anderen Dateien behalten die Standardbenennung.
      output: {
        assetFileNames: (info) => {
          const name = (Array.isArray(info.names) && info.names[0]) || info.name || "";
          return name.endsWith(".mjs") ? "assets/[name]-[hash].js" : "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
