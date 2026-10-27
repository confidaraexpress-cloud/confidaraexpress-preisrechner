// Hauptbuild der Anwendung (confidaraexpress.de).
//
// Bis 2026-10-27 lief dieser Build ohne Konfiguration (Standardwerte von Vite, Einstieg index.html). Seit dem
// statischen Seitengerüst der Kunden-Anmeldung (Abschnitt 5, 2026-10-28) entstehen zusätzlich login.html und
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
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statischeAuthSeite } from "./src/utils/kundenAuthPfad.mjs";

const REPO = path.dirname(fileURLToPath(import.meta.url));
const GERUESTE = ["login.html", "register.html"];
const MODULSKRIPT = /<script type="module" src="\/src\/main\.jsx"><\/script>\s*/;
const EINSTIEGS_TAGS = /<script type="module" crossorigin src="\/assets\/[^"]+"><\/script>|<link rel="modulepreload" crossorigin href="\/assets\/[^"]+">|<link rel="stylesheet" crossorigin href="\/assets\/[^"]+">/g;
const EINSTIEG = /^<script type="module" crossorigin src="\/assets\/index-[A-Za-z0-9_-]+\.js"><\/script>$/;

function seitengeruestWeiche(req, _res, next) {
  const methode = req.method || "GET";
  const html = String(req.headers?.accept || "").includes("text/html");
  if ((methode === "GET" || methode === "HEAD") && html && typeof req.url === "string") {
    const [pfad, abfrage] = req.url.split("?");
    const seite = statischeAuthSeite(pfad);
    if (seite) req.url = `/${seite}${abfrage ? `?${abfrage}` : ""}`;
  }
  next();
}

function authSeitengeruest() {
  let istBuild = false;
  return {
    name: "ce-auth-seitengeruest",
    enforce: "post",
    configResolved(config) { istBuild = config.command === "build"; },
    configureServer(server) { server.middlewares.use(seitengeruestWeiche); },
    configurePreviewServer(server) { server.middlewares.use(seitengeruestWeiche); },
    // Build: das Modulskript der Gerüste entfällt, bevor Vite die Seite verarbeitet — so entsteht kein zweiter
    // Einstieg. Im Entwicklungsserver bleibt es stehen; dort lädt die Seite ihr Skript selbst.
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const name = path.basename(ctx.filename || "");
        if (!istBuild || !GERUESTE.includes(name)) return html;
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
        for (const name of GERUESTE) {
          const datei = bundle[name];
          if (!datei || datei.type !== "asset") this.error(`${name} fehlt im Build`);
          const html = String(datei.source);
          if (/<script type="module"/.test(html)) this.error(`${name} trägt schon ein Modulskript`);
          datei.source = html.replace("</head>", `${tags.map((t) => `    ${t}\n`).join("")}  </head>`);
        }
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
      },
    },
  },
});
