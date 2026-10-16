// Zweiter Build: der öffentliche Preisrechner (preisrechner.confidaraexpress.de).
//
// Eigene Wurzel (preisrechner/: statisches Seitengerüst, robots.txt, Favicon, sich selbst abmeldender Service
// Worker), eigenes Ziel (dist-preisrechner/). Die Insel und alle wiederverwendeten Bausteine liegen unter src/ —
// deshalb darf der Entwicklungsserver die Repository-Wurzel lesen. Die Umgebung (VITE_API_URL) kommt aus derselben
// .env wie der Hauptbuild. Der Hauptbuild selbst läuft unverändert ohne Konfigurationsdatei (`vite build`).
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(fileURLToPath(import.meta.url));
const REPO_FS = REPO.split(path.sep).join("/");
const FS_PREFIX = REPO_FS.startsWith("/") ? `/@fs${REPO_FS}` : `/@fs/${REPO_FS}`;

// Nur der Entwicklungsserver: das Seitengerüst verweist mit „../src/…" auf Schriften und Marken-SVGs der
// Anwendung. Im Build löst Vite diese Pfade selbst auf (gehashte Assets); im Entwicklungsserver fragt der Browser
// „/src/…" an — diese Anfragen gehen an dieselben Dateien der Repository-Wurzel.
const repoAssetsImDevServer = {
  name: "preisrechner-repo-assets",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (typeof req.url === "string" && req.url.startsWith("/src/assets/")) req.url = `${FS_PREFIX}${req.url}`;
      next();
    });
  },
};

// Die öffentliche Seite nennt keine Einkaufsquelle — auch nicht im Stylesheet. variables.css trägt die Farbtöne des
// Vergleichsmodus (Admin, nie in Produktion), deren Tokennamen die Einkaufsquellen nennen; dieses Bündel braucht
// sie nicht. Der Filter läuft nach dem Einbinden der @imports und entfernt genau diese Deklarationen.
const ohneVergleichsmodusTokens = {
  postcssPlugin: "preisrechner-ohne-vergleichsmodus-tokens",
  Declaration(decl) {
    if (decl.prop.startsWith("--ce-debug-provider-")) decl.remove();
  },
};

export default defineConfig({
  root: path.join(REPO, "preisrechner"),
  publicDir: path.join(REPO, "preisrechner", "public"),
  envDir: REPO,
  plugins: [repoAssetsImDevServer],
  css: {
    postcss: { plugins: [ohneVergleichsmodusTokens] },
  },
  build: {
    outDir: path.join(REPO, "dist-preisrechner"),
    emptyOutDir: true,
    // Zwei Seiten: der Rechner und die 404-Seite, die nginx für jede unbekannte Adresse ausliefert
    // (ohne Skript — sie meldet nichts an die API).
    rolldownOptions: {
      input: {
        index: path.join(REPO, "preisrechner", "index.html"),
        404: path.join(REPO, "preisrechner", "404.html"),
      },
    },
  },
  server: {
    fs: { allow: [REPO] },
  },
});
