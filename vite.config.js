// Hauptbuild der Anwendung (confidaraexpress.de).
//
// Bis 2026-10-27 lief dieser Build ohne Konfiguration (Standardwerte von Vite, Einstieg index.html). Seit dem
// statischen Seitengerüst der Kunden-Anmeldung (Abschnitt 5, 2026-10-28) baut er drei Seiten: index.html (die
// Anwendung), login.html und register.html (dieselbe Anwendung mit einem Seitengerüst, das vor dem ersten Rendern das
// Endlayout der Anmeldung zeigt). Alles andere bleibt bei den Standardwerten — dieselbe Ausgabe nach dist/.
//
// nginx liefert die Seitengerüste für /login, /register und /registrieren (nginx.conf). Damit Entwicklung, Vorschau und
// die Browser-E2E dasselbe sehen wie die Produktion, macht die Weiche unten im Entwicklungs- und im Vorschauserver
// dasselbe — nur für Seitenaufrufe (Accept: text/html), nie für Dateien oder API-Pfade.
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statischeAuthSeite } from "./src/utils/kundenAuthPfad.mjs";

const REPO = path.dirname(fileURLToPath(import.meta.url));

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

const authSeitengeruest = {
  name: "ce-auth-seitengeruest",
  configureServer(server) { server.middlewares.use(seitengeruestWeiche); },
  configurePreviewServer(server) { server.middlewares.use(seitengeruestWeiche); },
};

export default defineConfig({
  plugins: [authSeitengeruest],
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
