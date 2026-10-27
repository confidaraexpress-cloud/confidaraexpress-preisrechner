// Netzwand der Demo-Welt: fetch lehnt jede Anfrage an die API und an fremde Hosts ab. Nur Dateien der eigenen Seite
// (etwa die Versionsprüfung /index.html) gehen durch. Eingeschaltet von demoStart.mjs, nur unter /demo.
import { DEMO_TEXTE } from "./demoModus.mjs";

/** Erlaubt ist nur, was auf derselben Seite liegt und nicht zur API gehört. */
export function demoNetzErlaubt(adresse, seite) {
  let url;
  let basis;
  try { url = new URL(adresse, seite); basis = new URL(seite); } catch { return false; }
  return url.origin === basis.origin && !/^\/(api|kunde|kundenbereich|login|register|auth)(\/|$)/i.test(url.pathname);
}

/** Ersetzt fenster.fetch: Gesperrtes beantwortet die Wand selbst mit 503 — es verlässt den Browser nie. */
export function netzSperren(fenster) {
  const echt = fenster.fetch.bind(fenster);
  fenster.fetch = (eingabe, init) => {
    const adresse = typeof eingabe === "string" ? eingabe : (eingabe && eingabe.url) || String(eingabe);
    if (!demoNetzErlaubt(adresse, fenster.location.href)) {
      return Promise.resolve(new Response(JSON.stringify({ error: DEMO_TEXTE.keinServer }), {
        status: 503, headers: { "Content-Type": "application/json" },
      }));
    }
    return echt(eingabe, init);
  };
}
