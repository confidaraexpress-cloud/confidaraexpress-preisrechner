/* ── Kartenkonfiguration — die EINZIGE Stelle mit Provider-Wissen ────────────
   Weder Stil-URL noch Token stehen irgendwo sonst im Quelltext. Wer den
   Kartenanbieter wechselt, ändert nur diese Datei und die Umgebungsvariablen.

   ENGINE: MapLibre GL JS (BSD-3-Clause). Bewusst nicht mapbox-gl:
     • mapbox-gl ist ab v2 unter der proprietären Mapbox-TOS/BSL lizenziert und
       verlangt zwingend ein Mapbox-Konto samt Token — auch für Stile, die gar
       nicht von Mapbox kommen.
     • MapLibre ist der quelloffene Fork derselben Bibliothek mit praktisch
       identischer API. Ein Mapbox-Stil lässt sich weiterhin verwenden, indem
       VITE_MAP_STYLE_URL auf dessen Style-JSON zeigt und der Token als
       VITE_MAPBOX_ACCESS_TOKEN gesetzt wird (siehe styleUrl unten).
   Es gibt keine zweite Kartenbibliothek im Projekt.

   TOKENS: niemals im Repository. `.env.example` führt die Namen ohne Werte.
   Ein Token wird nie geloggt und steht in keinem Test-Snapshot.

   STANDARD OHNE KONFIGURATION: ein reiner Rasterstil aus OpenStreetMap-Kacheln.
   Er braucht keinerlei Zugangsdaten, damit die Karte in Entwicklung und Vorschau
   sofort funktioniert und die Anwendung nicht an einer fehlenden Variable
   hängt. Für den Produktivbetrieb ist er NICHT die Empfehlung: die OSM-
   Kachelnutzungsrichtlinie ist auf geringes Volumen ausgelegt. Produktiv
   gehört VITE_MAP_STYLE_URL auf einen eigenen Vektorstil (MapTiler, Mapbox,
   selbst gehostet) — siehe README/Abschlussbericht. */

const env = (key) => {
  const v = import.meta.env?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : "";
};

/** Optionaler Token. Wird ausschließlich an die Stil-URL angehängt, sonst nirgends. */
export const mapAccessToken = () => env("VITE_MAPBOX_ACCESS_TOKEN");

/* OpenStreetMap-Rasterstil als Style-JSON-Objekt. Kein Netzwerkaufruf für den
   Stil selbst — nur die Kacheln werden geladen. Dadurch gibt es keinen
   zusätzlichen Fehlerpfad „Stil nicht ladbar“ im Standardfall. */
export const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    "osm-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [{ id: "osm-raster", type: "raster", source: "osm-raster" }],
};

/**
 * Der zu verwendende Kartenstil.
 *
 * Ohne VITE_MAP_STYLE_URL: das eingebettete OSM-Rasterstil-Objekt.
 * Mit URL: die URL; ein gesetzter Token wird als `access_token` angehängt
 * (so erwarten es Mapbox-Style-JSONs), sofern die URL noch keinen führt.
 */
export function mapStyle() {
  const url = env("VITE_MAP_STYLE_URL");
  if (!url) return OSM_RASTER_STYLE;
  const token = mapAccessToken();
  if (!token || url.includes("access_token=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
}

/** Startausschnitt, bevor Ergebnisse da sind — Mitte Deutschlands, weit. */
export const MAP_FALLBACK_CENTER = { lng: 10.4515, lat: 51.1657 };
export const MAP_FALLBACK_ZOOM = 5;

/** Zoomstufe für einen EINZELNEN Marker: fitBounds auf einen Punkt zoomte sonst maximal. */
export const MAP_SINGLE_MARKER_ZOOM = 15;

/** Rand um die eingepassten Marker, damit keiner unter der Kartenkante klebt. */
export const MAP_FIT_PADDING = 56;
export const MAP_FIT_MAX_ZOOM = 16;
